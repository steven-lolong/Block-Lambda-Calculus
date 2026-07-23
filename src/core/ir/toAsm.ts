/**
 * CfgProgram -> VmProgram (step 3.4): instruction selection + linear-scan
 * register allocation. This is the first pass that targets the permanent ISA
 * (isa.ts): it turns the block-structured CFG over unbounded virtual registers
 * into one flat `Instr[]` over the bounded physical register file, ready for the
 * encoder and VM (3.5).
 *
 * Three jobs, in order:
 *
 *   1. **Layout + selection.** Each `CfgFunc` is laid out in reverse-postorder
 *      (entry first; the block graph is acyclic — recursion is a `CallClos` to a
 *      fresh frame, never a back-edge — so RPO is a valid linear schedule). Each
 *      `CfgInstr` maps one-to-one to an `Instr`; `const` values are interned into
 *      the shared constant pool; a `loadcode` label resolves to a `CodeIx` into
 *      the flat function table; `br`/`condbr` become `Jmp`/`JmpIf` with
 *      self-relative offsets (a taken jump sets `pc ← pc + target`), with the
 *      trailing unconditional jump elided when it targets the next block laid out.
 *
 *   2. **Register allocation (linear scan, Poletto–Sarkar).** One live interval
 *      per virtual register — `[def, last use]` over the linear schedule (the CFG
 *      is single-assignment, so the def point is unique; the interval is made
 *      contiguous, which is conservative but always sound). The ABI is pinned:
 *      `env → r0`, `arg → r1`, held for their whole interval and never spilled.
 *      When peak register pressure exceeds `REG_COUNT`, two registers are held
 *      back as reload/spill scratch and the rest are linear-scanned over the
 *      remaining file, so an over-pressured function still compiles — the spill
 *      path the ISA was designed to exercise.
 *
 *   3. **Calling convention as explicit ops.** A closure-invoke is `CallClos`
 *      (indirect: the code pointer lives in the closure record's `CLOS_CODE`
 *      slot, resolved at run time — never a direct branch); a tail invoke is
 *      `TailCallClos`; `Ret` returns in an explicit register. A `let`-bound `if`
 *      join's block parameter becomes a `Move` on each incoming edge. A tail
 *      `force` (`Force d, x; Ret d`) is peepholed to `TailForce x`.
 *
 * Provenance is threaded onto every emitted `Instr` and `CodeEntry`, so the
 * Machine-code tab (3.6) can still map each word back to its source block.
 */
import type { BasicBlock, CfgFunc, CfgInstr, CfgProgram, VReg } from './lir';
import { instrDef, instrUses, terminatorTargets, termUses } from './lir';
import type { CodeEntry, ConstIx, Instr, Reg, Slot, VmProgram, VmValue } from './isa';
import { REG_COUNT } from './isa';
import type { Label } from './fir';
import type { IRProvenance } from './provenance';

type Prov = { sourceId?: string; sourceAliases?: string[] };
function prov(node: IRProvenance): Prov {
  return { sourceId: node.sourceId, sourceAliases: node.sourceAliases };
}

function range(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = lo; i < hi; i++) out.push(i);
  return out;
}

/* ------------------------------------------------------------- constant pool */

interface ConstPool {
  values: VmValue[];
  index: Map<string, ConstIx>;
}
function newConstPool(): ConstPool {
  return { values: [], index: new Map() };
}
/** Intern a CFG `const` literal into the pool, returning its index. */
function internConst(pool: ConstPool, v: number | boolean | null): ConstIx {
  const key = v === null ? 'null' : typeof v === 'boolean' ? `bool:${v}` : `int:${v}`;
  const hit = pool.index.get(key);
  if (hit !== undefined) return hit;
  const value: VmValue =
    v === null ? { tag: 'null' } : typeof v === 'boolean' ? { tag: 'bool', b: v } : { tag: 'int', n: v };
  const ix = pool.values.length;
  pool.values.push(value);
  pool.index.set(key, ix);
  return ix;
}

/* ------------------------------------------------------------------ layout */

/** Blocks in reverse-postorder from the entry (entry first, unreachable
 *  dropped). Valid because the CFG is acyclic. */
function reversePostorder(func: CfgFunc): BasicBlock[] {
  const byId = new Map(func.blocks.map((b) => [b.id, b]));
  const visited = new Set<string>();
  const post: string[] = [];
  const dfs = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const bl = byId.get(id);
    if (!bl) return;
    for (const s of terminatorTargets(bl.terminator)) dfs(s);
    post.push(id);
  };
  dfs(func.entry);
  return post.reverse().map((id) => byId.get(id)!);
}

/* -------------------------------------------------------------- live ranges */

interface Interval {
  id: number;
  start: number;
  end: number;
  fixed: Reg | null; // env → r0, param → r1; never spilled
}

/** One live interval per virtual register over the RPO linear schedule.
 *  Position -1 is "on entry" (the ABI-provided env/param). */
function computeIntervals(func: CfgFunc, order: BasicBlock[]): Interval[] {
  const def = new Map<number, number>();
  const lastUse = new Map<number, number>();
  const fixed = new Map<number, Reg>();

  if (func.env) {
    def.set(func.env.id, -1);
    fixed.set(func.env.id, 0);
  }
  if (func.param) {
    def.set(func.param.id, -1);
    fixed.set(func.param.id, 1);
  }

  let pos = 0;
  const noteDef = (r: VReg): void => {
    if (!def.has(r.id)) def.set(r.id, pos);
  };
  const noteUse = (r: VReg): void => {
    const prev = lastUse.get(r.id);
    lastUse.set(r.id, prev === undefined ? pos : Math.max(prev, pos));
  };

  for (const bl of order) {
    for (const p of bl.params) noteDef(p); // block params: defined at block entry
    for (const ins of bl.instrs) {
      for (const u of instrUses(ins)) noteUse(u);
      const d = instrDef(ins);
      if (d) noteDef(d);
      pos++;
    }
    for (const u of termUses(bl.terminator)) noteUse(u);
    pos++;
  }

  const ids = new Set<number>([...def.keys(), ...lastUse.keys()]);
  const intervals: Interval[] = [];
  for (const id of ids) {
    const start = def.get(id) ?? lastUse.get(id) ?? 0;
    const end = Math.max(start, lastUse.get(id) ?? start);
    intervals.push({ id, start, end, fixed: fixed.get(id) ?? null });
  }
  return intervals;
}

/** Peak register pressure: the most intervals live at any one point. */
function maxPressure(intervals: Interval[]): number {
  const events: { at: number; delta: number }[] = [];
  for (const iv of intervals) {
    events.push({ at: iv.start, delta: 1 });
    events.push({ at: iv.end + 1, delta: -1 });
  }
  // At a boundary, expiries (-1) precede births (+1): [a,b] and [b+1,c] do not overlap.
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let cur = 0;
  let peak = 0;
  for (const e of events) {
    cur += e.delta;
    if (cur > peak) peak = cur;
  }
  return peak;
}

/* ---------------------------------------------------------- linear scan */

interface Allocation {
  reg: Map<number, Reg>;
  slot: Map<number, Slot>;
  slotCount: number;
}

/** Linear-scan allocation over `allocatable` physical registers. Fixed
 *  intervals (env/param) take their pinned register and are never spilled;
 *  everything else gets a register or, under pressure, a spill slot. */
function linearScan(intervals: Interval[], allocatable: Reg[]): Allocation {
  const ordered = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  const reg = new Map<number, Reg>();
  const slot = new Map<number, Slot>();
  const freeSet = new Set<Reg>(allocatable);
  const active: { iv: Interval; reg: Reg }[] = []; // kept sorted by iv.end asc
  let slotCount = 0;

  const insertActive = (entry: { iv: Interval; reg: Reg }): void => {
    let i = active.length;
    while (i > 0 && active[i - 1].iv.end > entry.iv.end) i--;
    active.splice(i, 0, entry);
  };
  const takeReg = (prefer: Reg | null): Reg => {
    if (prefer !== null && freeSet.has(prefer)) {
      freeSet.delete(prefer);
      return prefer;
    }
    let best: Reg | null = null;
    for (const r of freeSet) if (best === null || r < best) best = r;
    if (best === null) throw new Error('toAsm/linearScan: no free register (pressure miscomputed)');
    freeSet.delete(best);
    return best;
  };
  const expire = (start: number): void => {
    while (active.length > 0 && active[0].iv.end < start) {
      const done = active.shift()!;
      freeSet.add(done.reg);
    }
  };

  for (const iv of ordered) {
    expire(iv.start);
    if (iv.fixed !== null) {
      const r = takeReg(iv.fixed);
      if (r !== iv.fixed) throw new Error('toAsm/linearScan: pinned register unavailable (bug)');
      reg.set(iv.id, r);
      insertActive({ iv, reg: r });
      continue;
    }
    if (freeSet.size > 0) {
      const r = takeReg(null);
      reg.set(iv.id, r);
      insertActive({ iv, reg: r });
      continue;
    }
    // Spill: evict the furthest-ending non-fixed active interval if it outlives iv.
    let victimIx = -1;
    for (let k = active.length - 1; k >= 0; k--) {
      if (active[k].iv.fixed === null) {
        victimIx = k;
        break;
      }
    }
    const victim = victimIx >= 0 ? active[victimIx] : null;
    if (victim && victim.iv.end > iv.end) {
      reg.set(iv.id, victim.reg);
      slot.set(victim.iv.id, slotCount++);
      reg.delete(victim.iv.id);
      active.splice(victimIx, 1);
      insertActive({ iv, reg: victim.reg });
    } else {
      slot.set(iv.id, slotCount++);
    }
  }
  return { reg, slot, slotCount };
}

/* ------------------------------------------------------------ selection */

/** Every physical register an emitted instruction mentions (for `regCount`). */
function instrRegs(ins: Instr): Reg[] {
  switch (ins.op) {
    case 'Const':
    case 'Alloc':
    case 'LoadCode':
    case 'Reload':
      return [ins.dst];
    case 'Move':
      return [ins.dst, ins.src];
    case 'Bin':
      return [ins.dst, ins.left, ins.right];
    case 'Load':
      return [ins.dst, ins.base];
    case 'Store':
      return [ins.base, ins.src];
    case 'CallClos':
      return [ins.dst, ins.clos, ins.arg];
    case 'TailCallClos':
      return [ins.clos, ins.arg];
    case 'Force':
      return [ins.dst, ins.thunk];
    case 'TailForce':
      return [ins.thunk];
    case 'Ret':
      return [ins.src];
    case 'JmpIf':
      return [ins.cond];
    case 'Spill':
      return [ins.src];
    case 'Jmp':
      return [];
  }
}

interface SelectedFunc {
  code: Instr[];
  regCount: number;
  slotCount: number;
  arity: 0 | 1;
}

/** Select + allocate one function into a self-contained `Instr[]` (branch
 *  offsets are self-relative, so the block is position-independent). */
function selectFunc(func: CfgFunc, labelToCode: Map<Label, number>, pool: ConstPool): SelectedFunc {
  const order = reversePostorder(func);
  const byId = new Map(func.blocks.map((b) => [b.id, b]));
  const intervals = computeIntervals(func, order);
  const spilling = maxPressure(intervals) > REG_COUNT;
  const allocatable = spilling ? range(0, REG_COUNT - 2) : range(0, REG_COUNT);
  const scratch: Reg[] = spilling ? [REG_COUNT - 2, REG_COUNT - 1] : [];
  const alloc = linearScan(intervals, allocatable);

  const code: Instr[] = [];
  const blockStart = new Map<string, number>();
  const fixups: { at: number; block: string }[] = [];
  const orderIndex = new Map<string, number>();
  order.forEach((bl, i) => orderIndex.set(bl.id, i));

  const regOf = (id: number): Reg | null => (alloc.reg.has(id) ? alloc.reg.get(id)! : null);
  const slotOf = (id: number): Slot | null => (alloc.slot.has(id) ? alloc.slot.get(id)! : null);

  /** Resolve read operands to physical registers, reloading spilled ones into
   *  scratch (`scratch[0]`, `scratch[1]` — at most two reads per instruction). */
  const resolveReads = (vs: VReg[], p: Prov): Reg[] => {
    let cur = 0;
    return vs.map((v) => {
      const r = regOf(v.id);
      if (r !== null) return r;
      const s = slotOf(v.id);
      if (s === null) throw new Error(`toAsm: virtual register %${v.id} was never allocated`);
      const sc = scratch[cur++];
      if (sc === undefined) throw new Error('toAsm: scratch registers exhausted (bug)');
      code.push({ op: 'Reload', dst: sc, slot: s, ...p });
      return sc;
    });
  };

  /** Emit an instruction whose result goes to `dst`; a spilled `dst` computes
   *  into `scratch[0]` (safe: the instruction reads all its operands before
   *  writing the result) and is stored back with a trailing `Spill`. */
  const withDef = (dst: VReg, p: Prov, make: (reg: Reg) => Instr): void => {
    const r = regOf(dst.id);
    if (r !== null) {
      code.push(make(r));
      return;
    }
    const s = slotOf(dst.id);
    if (s === null) throw new Error(`toAsm: virtual register %${dst.id} was never allocated`);
    const sc = scratch[0];
    if (sc === undefined) throw new Error('toAsm: scratch register unavailable for spilled def (bug)');
    code.push(make(sc));
    code.push({ op: 'Spill', slot: s, src: sc, ...p });
  };

  const emitInstr = (ins: CfgInstr): void => {
    const p = prov(ins);
    switch (ins.kind) {
      case 'const':
        withDef(ins.dst, p, (d) => ({ op: 'Const', dst: d, k: internConst(pool, ins.value), ...p }));
        return;
      case 'move': {
        const [src] = resolveReads([ins.src], p);
        withDef(ins.dst, p, (d) => ({ op: 'Move', dst: d, src, ...p }));
        return;
      }
      case 'bin': {
        const [left, right] = resolveReads([ins.left, ins.right], p);
        withDef(ins.dst, p, (d) => ({ op: 'Bin', dst: d, opKind: ins.opKind, prim: ins.op, left, right, ...p }));
        return;
      }
      case 'alloc':
        withDef(ins.dst, p, (d) => ({ op: 'Alloc', dst: d, size: ins.size, ...p }));
        return;
      case 'load': {
        const [base] = resolveReads([ins.base], p);
        withDef(ins.dst, p, (d) => ({ op: 'Load', dst: d, base, off: ins.index, ...p }));
        return;
      }
      case 'store': {
        const [base, src] = resolveReads([ins.base, ins.src], p);
        code.push({ op: 'Store', base, off: ins.index, src, ...p });
        return;
      }
      case 'loadcode': {
        const cix = labelToCode.get(ins.label);
        if (cix === undefined) throw new Error(`toAsm: unknown code label '${ins.label}'`);
        withDef(ins.dst, p, (d) => ({ op: 'LoadCode', dst: d, code: cix, ...p }));
        return;
      }
      case 'callclos': {
        const [clos, arg] = resolveReads([ins.clos, ins.arg], p);
        withDef(ins.dst, p, (d) => ({ op: 'CallClos', dst: d, clos, arg, ...p }));
        return;
      }
      case 'force': {
        const [src] = resolveReads([ins.src], p);
        withDef(ins.dst, p, (d) => ({ op: 'Force', dst: d, thunk: src, ...p }));
        return;
      }
    }
  };

  /** Move the arguments of a `br` edge into the target block's parameters. This
   *  pipeline only ever produces single-parameter joins (from a `let`-bound
   *  `if`), so a straight move suffices — a defensive check guards the rest. */
  const emitEdgeMoves = (args: VReg[], targetId: string, p: Prov): void => {
    const target = byId.get(targetId);
    if (!target) throw new Error(`toAsm: edge to missing block '${targetId}'`);
    if (target.params.length !== args.length) {
      throw new Error(`toAsm: edge to '${targetId}' passes ${args.length} args for ${target.params.length} params`);
    }
    if (args.length > 1) {
      throw new Error('toAsm: multi-parameter join is not produced by this pipeline (would need a parallel move)');
    }
    if (args.length === 0) return;
    const [src] = resolveReads([args[0]], p);
    const param = target.params[0];
    const dr = regOf(param.id);
    if (dr !== null) {
      if (dr !== src) code.push({ op: 'Move', dst: dr, src, ...p });
    } else {
      const s = slotOf(param.id)!;
      code.push({ op: 'Spill', slot: s, src, ...p });
    }
  };

  const emitTerminator = (bl: BasicBlock): void => {
    const t = bl.terminator;
    const p = prov(t);
    const nextBlock = order[orderIndex.get(bl.id)! + 1]?.id;
    switch (t.kind) {
      case 'ret': {
        const [src] = resolveReads([t.value], p);
        code.push({ op: 'Ret', src, ...p });
        return;
      }
      case 'tailcallclos': {
        const [clos, arg] = resolveReads([t.clos, t.arg], p);
        code.push({ op: 'TailCallClos', clos, arg, ...p });
        return;
      }
      case 'br': {
        emitEdgeMoves(t.args, t.target, p);
        if (t.target !== nextBlock) {
          fixups.push({ at: code.length, block: t.target });
          code.push({ op: 'Jmp', target: 0, ...p });
        }
        return;
      }
      case 'condbr': {
        if (t.thenArgs.length > 0 || t.elseArgs.length > 0) {
          throw new Error('toAsm: condbr with block arguments is not produced by this pipeline');
        }
        const [cond] = resolveReads([t.cond], p);
        fixups.push({ at: code.length, block: t.then });
        code.push({ op: 'JmpIf', cond, target: 0, ...p });
        if (t.else !== nextBlock) {
          fixups.push({ at: code.length, block: t.else });
          code.push({ op: 'Jmp', target: 0, ...p });
        }
        return;
      }
    }
  };

  for (const bl of order) {
    blockStart.set(bl.id, code.length);
    // Peephole: a body ending `Force d, x` then `ret d` is a tail force.
    const n = bl.instrs.length;
    const last = n > 0 ? bl.instrs[n - 1] : null;
    const isTailForce =
      bl.terminator.kind === 'ret' && last?.kind === 'force' && last.dst.id === bl.terminator.value.id;
    const upto = isTailForce ? n - 1 : n;
    for (let i = 0; i < upto; i++) emitInstr(bl.instrs[i]);
    if (isTailForce && last?.kind === 'force') {
      const p = prov(last);
      const [thunk] = resolveReads([last.src], p);
      code.push({ op: 'TailForce', thunk, ...p });
    } else {
      emitTerminator(bl);
    }
  }

  for (const f of fixups) {
    const target = blockStart.get(f.block);
    if (target === undefined) throw new Error(`toAsm: jump to missing block '${f.block}'`);
    const ins = code[f.at];
    if (ins.op !== 'Jmp' && ins.op !== 'JmpIf') throw new Error('toAsm: fixup on a non-jump (bug)');
    ins.target = target - f.at; // self-relative: pc ← pc + target on a taken jump
  }

  let maxReg = -1;
  for (const ins of code) for (const r of instrRegs(ins)) if (r > maxReg) maxReg = r;
  const minAbi = func.param !== undefined ? 2 : func.env !== undefined ? 1 : 0;
  const regCount = Math.max(maxReg + 1, minAbi);
  const arity: 0 | 1 = func.kind === 'closure' ? 1 : 0;
  return { code, regCount, slotCount: alloc.slotCount, arity };
}

/* --------------------------------------------------------------- program */

/**
 * Select instructions and run linear-scan register allocation over every
 * function of a `CfgProgram`, producing the flat, physical-register `VmProgram`
 * the VM (3.5) executes. Functions are concatenated in table order
 * (`prog.functions`, then `main`); a `loadcode` label resolves to that table
 * index, and `entry` points at `main`.
 */
export function selectAndAllocate(prog: CfgProgram): VmProgram {
  const table: CfgFunc[] = [...prog.functions, prog.main];
  const labelToCode = new Map<Label, number>();
  table.forEach((f, i) => labelToCode.set(f.label, i));

  const pool = newConstPool();
  const code: Instr[] = [];
  const functions: CodeEntry[] = [];
  for (const f of table) {
    const sel = selectFunc(f, labelToCode, pool);
    functions.push({
      label: f.label,
      entry: code.length,
      regCount: sel.regCount,
      slotCount: sel.slotCount,
      arity: sel.arity,
      ...prov(f),
    });
    for (const ins of sel.code) code.push(ins);
  }

  const entry = labelToCode.get('main');
  if (entry === undefined) throw new Error('toAsm: program has no main');
  return { strategy: prog.strategy, code, functions, constants: pool.values, entry };
}
