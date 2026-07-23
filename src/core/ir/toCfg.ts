/**
 * FirProgram -> CfgProgram (step 3.2): control-flow-graph construction. Lowers
 * each first-order function to basic blocks over virtual registers, making the
 * two things the register machine leaves implicit in the FIR explicit:
 *
 *   - **control.** A FIR `if` becomes a `condbr` into two blocks. In tail
 *     position both branches inherit the enclosing continuation (no merge); a
 *     `let`-bound `if` merges its branches at a join block carrying one block
 *     parameter (the bound value). A tail `callclos` becomes `tailcallclos`.
 *     A single `Sink` (`return` | `join`) threads the continuation through, so
 *     the two cases share one code path.
 *
 *   - **the heap.** A `clos { code, env }` lowers to primitive `alloc` +
 *     `loadcode` + `store` building the two-object layout (`[code|env]` pair +
 *     a separate γ tuple, `null` env when empty). A call-by-structure `susp`
 *     thunk is closure-converted here — no earlier pass did, because the FIR
 *     evaluator captured the whole env chain: `toCfg` computes the body's free
 *     names, captures them, and projects them back at the thunk's entry, so a
 *     thunk is just a nullary closure. A recursive `letrec` thunk is built by
 *     allocate-then-backpatch: allocate the pair, bind the name, then store the
 *     (self-referential) env — the reason the ISA keeps primitive alloc/store.
 *
 * The lowering is tag-driven and strategy-agnostic: the FIR's `var` vs `force`
 * atoms already encode strict vs lazy (`force` only ever names a genuine
 * thunk use, `var` a raw pass), and `susp`/`letrec` appear only under
 * call-by-structure — so there is no `strategy` branch here at all. Every
 * emitted node carries the provenance of the FIR node it implements.
 */
import type { FirAtom, FirBinding, FirComp, FirExpr, FirFunc, FirProgram, Label } from './fir';
import type { BasicBlock, CfgFunc, CfgInstr, CfgProgram, Terminator, VReg } from './lir';
import { CLOS_CODE, CLOS_ENV } from './isa';
import type { IRProvenance } from './provenance';
import { makeFreshNames, type FreshNames } from './freshNames';

type Prov = { sourceId?: string; sourceAliases?: string[] };
function prov(node: IRProvenance): Prov {
  return { sourceId: node.sourceId, sourceAliases: node.sourceAliases };
}

/* -------------------------------------------------- lexical scope (name -> vreg) */

type Scope = { name: string; reg: VReg; parent: Scope } | null;
function bind(scope: Scope, name: string, reg: VReg): Scope {
  return { name, reg, parent: scope };
}
function look(scope: Scope, name: string): VReg {
  for (let s = scope; s; s = s.parent) if (s.name === name) return s.reg;
  throw new Error(`toCfg: unbound name '${name}'`);
}

/* ---------------------------------------------------------- program-wide context */

interface Ctx {
  /** Output function table, mutated in place (thunks append as discovered). */
  functions: CfgFunc[];
  /** Fresh label supply for lifted thunks (seeded to avoid collisions). */
  fresh: FreshNames;
}

/* --------------------------------------------------------- per-function builder */

interface Builder {
  vregs: number;
  blockN: number;
  out: BasicBlock[];
  cur: { id: string; params: VReg[]; instrs: CfgInstr[] } | null;
}
function newBuilder(): Builder {
  return { vregs: 0, blockN: 0, out: [], cur: null };
}
function freshVReg(b: Builder, hint?: string): VReg {
  return hint ? { id: b.vregs++, hint } : { id: b.vregs++ };
}
function freshBlockId(b: Builder): string {
  return `b${b.blockN++}`;
}
function startBlock(b: Builder, id: string, params: VReg[]): void {
  b.cur = { id, params, instrs: [] };
}
function emit(b: Builder, instr: CfgInstr): void {
  if (!b.cur) throw new Error('toCfg: emit with no current block');
  b.cur.instrs.push(instr);
}
function terminate(b: Builder, term: Terminator): void {
  if (!b.cur) throw new Error('toCfg: terminate with no current block');
  b.out.push({ id: b.cur.id, params: b.cur.params, instrs: b.cur.instrs, terminator: term });
  b.cur = null;
}

/* --------------------------------------------------------- free names of a susp */

/** Free names of a FIR expression, first-occurrence order — the capture set for
 *  a thunk. `let`/`letrec` names shadow (letrec's name is visible in its own
 *  rhs); a `clos` atom's captures are free, its code label is not. */
function freeNames(expr: FirExpr): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const use = (name: string, bound: Set<string>): void => {
    if (!bound.has(name) && !seen.has(name)) {
      seen.add(name);
      order.push(name);
    }
  };
  const atom = (a: FirAtom, bound: Set<string>): void => {
    switch (a.kind) {
      case 'var':
      case 'force':
        use(a.name, bound);
        return;
      case 'proj':
        use(a.env, bound);
        return;
      case 'clos':
        a.env.forEach((e) => atom(e, bound));
        return;
      case 'num':
      case 'bool':
      case 'hole':
        return;
    }
  };
  const comp = (c: FirComp, bound: Set<string>): void => {
    if (c.kind === 'callclos') {
      atom(c.clos, bound);
      atom(c.arg, bound);
    } else if (c.kind === 'prim') {
      atom(c.left, bound);
      atom(c.right, bound);
    } else {
      atom(c.cond, bound);
      walk(c.then, bound);
      walk(c.else, bound);
    }
  };
  const binding = (bnd: FirBinding, bound: Set<string>): void => {
    if (bnd.kind === 'atom') atom(bnd.atom, bound);
    else if (bnd.kind === 'comp') comp(bnd.comp, bound);
    else walk(bnd.body, bound);
  };
  const walk = (e: FirExpr, bound: Set<string>): void => {
    switch (e.kind) {
      case 'ret':
        atom(e.atom, bound);
        return;
      case 'tail':
        comp(e.comp, bound);
        return;
      case 'let': {
        binding(e.rhs, bound);
        const inner = new Set(bound);
        inner.add(e.name);
        walk(e.body, inner);
        return;
      }
      case 'letrec': {
        const inner = new Set(bound);
        inner.add(e.name);
        binding(e.rhs, inner);
        walk(e.body, inner);
        return;
      }
    }
  };
  walk(expr, new Set());
  return order;
}

/* -------------------------------------------------------------------- atoms */

/** Lower a FIR atom to the vreg holding its value. Tag-driven: `force` emits a
 *  runtime force (thunk → invoke, value → identity); `var`/`proj` read raw
 *  (entry positions always use `var`, so a raw read is right there too). */
function lowerAtom(b: Builder, atom: FirAtom, scope: Scope, ctx: Ctx): VReg {
  const p = prov(atom);
  switch (atom.kind) {
    case 'num': {
      const d = freshVReg(b);
      emit(b, { kind: 'const', dst: d, value: atom.value, ...p });
      return d;
    }
    case 'bool': {
      const d = freshVReg(b);
      emit(b, { kind: 'const', dst: d, value: atom.value, ...p });
      return d;
    }
    case 'var':
      return look(scope, atom.name);
    case 'force': {
      const src = look(scope, atom.name);
      const d = freshVReg(b, atom.name);
      emit(b, { kind: 'force', dst: d, src, ...p });
      return d;
    }
    case 'proj': {
      const base = look(scope, atom.env);
      const d = freshVReg(b);
      emit(b, { kind: 'load', dst: d, base, index: atom.index, ...p });
      return d;
    }
    case 'clos':
      return buildClosure(b, atom.code, atom.env, scope, ctx, p);
    case 'hole':
      throw new Error('toCfg: cannot lower a hole');
  }
}

/** `clos { code, env }` -> the two-object closure: a γ tuple (or null) plus the
 *  `[code|env]` pair. Captures are raw reads (they are `var` atoms). */
function buildClosure(b: Builder, label: Label, envAtoms: FirAtom[], scope: Scope, ctx: Ctx, p: Prov): VReg {
  const codeR = freshVReg(b);
  emit(b, { kind: 'loadcode', dst: codeR, label, ...p });
  const envR = buildTuple(b, envAtoms.map((a) => lowerAtom(b, a, scope, ctx)), p);
  const pair = freshVReg(b);
  emit(b, { kind: 'alloc', dst: pair, size: 2, ...p });
  emit(b, { kind: 'store', base: pair, index: CLOS_CODE, src: codeR, ...p });
  emit(b, { kind: 'store', base: pair, index: CLOS_ENV, src: envR, ...p });
  return pair;
}

/** Build a γ tuple from already-lowered value regs; `null` for the empty env. */
function buildTuple(b: Builder, values: VReg[], p: Prov): VReg {
  if (values.length === 0) {
    const nul = freshVReg(b);
    emit(b, { kind: 'const', dst: nul, value: null, ...p });
    return nul;
  }
  const tuple = freshVReg(b);
  emit(b, { kind: 'alloc', dst: tuple, size: values.length, ...p });
  values.forEach((v, i) => emit(b, { kind: 'store', base: tuple, index: i, src: v, ...p }));
  return tuple;
}

/* -------------------------------------------------------------------- thunks */

/** Lift a `susp` body into a nullary-closure (thunk) `CfgFunc`; its entry
 *  projects each captured name back out of the env tuple. Returns the label. */
function liftThunk(ctx: Ctx, body: FirExpr, captureNames: string[], p: Prov): Label {
  const label = ctx.fresh.fresh('thunk');
  const slot = ctx.functions.length;
  ctx.functions.push(undefined as unknown as CfgFunc); // reserve (outer-before-nested)

  const tb = newBuilder();
  const envReg = freshVReg(tb, 'env');
  const entryId = freshBlockId(tb);
  startBlock(tb, entryId, []);
  let scope: Scope = null;
  captureNames.forEach((name, i) => {
    const r = freshVReg(tb, name);
    emit(tb, { kind: 'load', dst: r, base: envReg, index: i, ...p });
    scope = bind(scope, name, r);
  });
  lowerExpr(tb, body, scope, { kind: 'return' }, ctx);

  ctx.functions[slot] = { label, kind: 'thunk', env: envReg, entry: entryId, blocks: tb.out, ...p };
  return label;
}

/** Fill an already-allocated thunk pair: code + captured env tuple. Captures
 *  are looked up raw in `scope` (which, for a `letrec`, already binds the
 *  self-name to this pair — the backpatch). */
function fillThunkPair(b: Builder, pair: VReg, body: FirExpr, scope: Scope, ctx: Ctx, p: Prov): void {
  const captureNames = freeNames(body);
  const captureRegs = captureNames.map((n) => look(scope, n));
  const label = liftThunk(ctx, body, captureNames, p);
  const codeR = freshVReg(b);
  emit(b, { kind: 'loadcode', dst: codeR, label, ...p });
  const envR = buildTuple(b, captureRegs, p);
  emit(b, { kind: 'store', base: pair, index: CLOS_CODE, src: codeR, ...p });
  emit(b, { kind: 'store', base: pair, index: CLOS_ENV, src: envR, ...p });
}

/* --------------------------------------------------------------------- comps */

/** A non-tail `callclos`/`prim` — produces a value in a fresh vreg. */
function lowerNonTailComp(b: Builder, comp: FirComp, scope: Scope, ctx: Ctx): VReg {
  const p = prov(comp);
  if (comp.kind === 'callclos') {
    const clos = lowerAtom(b, comp.clos, scope, ctx);
    const arg = lowerAtom(b, comp.arg, scope, ctx);
    const d = freshVReg(b);
    emit(b, { kind: 'callclos', dst: d, clos, arg, ...p });
    return d;
  }
  if (comp.kind === 'prim') {
    const left = lowerAtom(b, comp.left, scope, ctx);
    const right = lowerAtom(b, comp.right, scope, ctx);
    const d = freshVReg(b);
    emit(b, { kind: 'bin', dst: d, opKind: comp.opKind, op: comp.op, left, right, ...p });
    return d;
  }
  throw new Error('toCfg: an `if` comp is lowered via the branch/join path, not here');
}

/* ---------------------------------------------------------- expressions / sinks */

type Sink = { kind: 'return' } | { kind: 'join'; block: string };

function applySink(b: Builder, sink: Sink, value: VReg, p: Prov): void {
  if (sink.kind === 'return') terminate(b, { kind: 'ret', value, ...p });
  else terminate(b, { kind: 'br', target: sink.block, args: [value], ...p });
}

/** Lower an `if` comp: `condbr` into two branch blocks, each lowering its own
 *  branch under `sink` (tail `if` shares the outer sink; a `let`-bound `if`
 *  passes a `join` sink so both branches `br` to the join with their value). */
function lowerIfComp(b: Builder, comp: Extract<FirComp, { kind: 'if' }>, scope: Scope, sink: Sink, ctx: Ctx): void {
  const p = prov(comp);
  const cond = lowerAtom(b, comp.cond, scope, ctx);
  const thenId = freshBlockId(b);
  const elseId = freshBlockId(b);
  terminate(b, { kind: 'condbr', cond, then: thenId, thenArgs: [], else: elseId, elseArgs: [], ...p });
  startBlock(b, thenId, []);
  lowerExpr(b, comp.then, scope, sink, ctx);
  startBlock(b, elseId, []);
  lowerExpr(b, comp.else, scope, sink, ctx);
}

/** A tail-position comp: tail calls terminate directly; a tail `prim` computes
 *  then feeds the sink; a tail `if` propagates the sink to both branches. */
function lowerTailComp(b: Builder, comp: FirComp, scope: Scope, sink: Sink, ctx: Ctx): void {
  const p = prov(comp);
  if (comp.kind === 'callclos') {
    const clos = lowerAtom(b, comp.clos, scope, ctx);
    const arg = lowerAtom(b, comp.arg, scope, ctx);
    if (sink.kind === 'return') {
      terminate(b, { kind: 'tailcallclos', clos, arg, ...p });
    } else {
      const d = freshVReg(b);
      emit(b, { kind: 'callclos', dst: d, clos, arg, ...p });
      terminate(b, { kind: 'br', target: sink.block, args: [d], ...p });
    }
    return;
  }
  if (comp.kind === 'prim') {
    const value = lowerNonTailComp(b, comp, scope, ctx);
    applySink(b, sink, value, p);
    return;
  }
  lowerIfComp(b, comp, scope, sink, ctx);
}

function lowerExpr(b: Builder, expr: FirExpr, scope: Scope, sink: Sink, ctx: Ctx): void {
  switch (expr.kind) {
    case 'ret':
      applySink(b, sink, lowerAtom(b, expr.atom, scope, ctx), prov(expr));
      return;

    case 'tail':
      lowerTailComp(b, expr.comp, scope, sink, ctx);
      return;

    case 'let': {
      const rhs = expr.rhs;
      if (rhs.kind === 'atom') {
        const r = lowerAtom(b, rhs.atom, scope, ctx);
        lowerExpr(b, expr.body, bind(scope, expr.name, r), sink, ctx);
        return;
      }
      if (rhs.kind === 'comp') {
        if (rhs.comp.kind === 'if') {
          // let-bound if: merge the branches at a join block that binds the name.
          const joinId = freshBlockId(b);
          const joinParam = freshVReg(b, expr.name);
          lowerIfComp(b, rhs.comp, scope, { kind: 'join', block: joinId }, ctx);
          startBlock(b, joinId, [joinParam]);
          lowerExpr(b, expr.body, bind(scope, expr.name, joinParam), sink, ctx);
          return;
        }
        const r = lowerNonTailComp(b, rhs.comp, scope, ctx);
        lowerExpr(b, expr.body, bind(scope, expr.name, r), sink, ctx);
        return;
      }
      // susp: a non-recursive thunk (call-by-structure).
      const pair = freshVReg(b, expr.name);
      emit(b, { kind: 'alloc', dst: pair, size: 2, ...prov(expr) });
      fillThunkPair(b, pair, rhs.body, scope, ctx, prov(expr));
      lowerExpr(b, expr.body, bind(scope, expr.name, pair), sink, ctx);
      return;
    }

    case 'letrec': {
      const rhs = expr.rhs;
      if (rhs.kind === 'susp') {
        // Recursive thunk: allocate the pair, bind the name (self-reference),
        // then fill — the env tuple captures the pair itself (backpatch).
        const pair = freshVReg(b, expr.name);
        emit(b, { kind: 'alloc', dst: pair, size: 2, ...prov(expr) });
        const inner = bind(scope, expr.name, pair);
        fillThunkPair(b, pair, rhs.body, inner, ctx, prov(expr));
        lowerExpr(b, expr.body, inner, sink, ctx);
        return;
      }
      // Non-susp letrec is not produced by the current pipeline; bind like a let.
      const r = rhs.kind === 'atom'
        ? lowerAtom(b, rhs.atom, scope, ctx)
        : lowerNonTailComp(b, rhs.comp, scope, ctx);
      lowerExpr(b, expr.body, bind(scope, expr.name, r), sink, ctx);
      return;
    }
  }
}

/* ----------------------------------------------------------------- functions */

function lowerFunc(fn: FirFunc, ctx: Ctx): CfgFunc {
  const b = newBuilder();
  const env = freshVReg(b, 'env');
  const param = freshVReg(b, fn.param);
  const scope = bind(bind(null, fn.envParam, env), fn.param, param);
  const entry = freshBlockId(b);
  startBlock(b, entry, []);
  lowerExpr(b, fn.body, scope, { kind: 'return' }, ctx);
  return { label: fn.label, kind: 'closure', env, param, entry, blocks: b.out, ...prov(fn) };
}

function lowerMain(prog: FirProgram, ctx: Ctx): CfgFunc {
  const b = newBuilder();
  const entry = freshBlockId(b);
  startBlock(b, entry, []);
  lowerExpr(b, prog.main, null, { kind: 'return' }, ctx);
  return { label: 'main', kind: 'main', entry, blocks: b.out };
}

/** FirProgram -> CfgProgram. Functions in definition order (each entry reserved
 *  before its body is walked, so an outer function precedes its lifted thunks). */
export function toCfg(prog: FirProgram): CfgProgram {
  const used = new Set<string>(['main']);
  for (const f of prog.functions) used.add(f.label);
  const functions: CfgFunc[] = [];
  const ctx: Ctx = { functions, fresh: makeFreshNames(used) };
  for (const fn of prog.functions) {
    const slot = functions.length;
    functions.push(undefined as unknown as CfgFunc);
    functions[slot] = lowerFunc(fn, ctx);
  }
  const main = lowerMain(prog, ctx);
  return { strategy: prog.strategy, functions, main };
}
