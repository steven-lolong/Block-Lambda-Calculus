/**
 * CoreTerm -> AnfExpr, parameterized by evaluation strategy.
 *
 * This is the standard one-pass A-normalization (Flanagan et al.) in
 * meta-continuation style: `normalizeName` names a sub-term's *value*,
 * `normalize` produces a tail expression. The one non-standard part is the
 * strategy split, which is a faithful mirror of the CEK machine in
 * ../machine/csekMachine.ts:
 *
 *   - Under **call-by-value**, an application argument and the right-hand side
 *     of a source `let`/`letrec` are evaluated *before* the binding, so they go
 *     through `normalizeName` and bind strictly (`atom`/`comp`).
 *
 *   - Under **call-by-structure**, those same three positions bind a *thunk*:
 *     the argument / rhs is suspended as an `AnfExpr` (`susp`) and every use of
 *     a bound variable becomes a `force`, which re-enters the thunk. This is
 *     exactly the machine's behaviour: `let`, `letrec`, and the argument of an
 *     application all bind `Thunk { blockId, env }`, and a variable lookup
 *     re-evaluates the thunk (no memoization) — so duplicated work shows up as
 *     repeated `force`/`prim`, the call-by-structure signature.
 *
 * Positions that the machine always evaluates strictly — the function of an
 * application, both operands of a primitive, and the condition of an `if` —
 * bind `val` under *both* strategies; only the three binding positions above
 * are strategy-sensitive.
 *
 * Provenance: every synthesized `let`, `comp`, and atom inherits the `sourceId`
 * of the Core node it implements, so the ANF stays block-traceable.
 */
import type { CoreTerm, PrimOpKind } from './core';
import type { AnfAtom, AnfBinding, AnfComp, AnfExpr, AnfProgram } from './anf';
import type { IRProvenance } from './provenance';
import type { IRType } from './types';
import type { ReductionKind } from '../semantics/lambdaReduction';
import { makeFreshNames, type FreshNames } from './freshNames';

type Prov = { sourceId?: string; sourceAliases?: string[] };

function prov(node: IRProvenance): Prov {
  return { sourceId: node.sourceId, sourceAliases: node.sourceAliases };
}

function tyOf(node: { ty?: IRType }): { ty?: IRType } {
  return node.ty ? { ty: node.ty } : {};
}

function assertNever(node: never): never {
  throw new Error(`toAnf: unexpected core node ${JSON.stringify(node)}`);
}

/* ------------------------------------ constructors (carry source provenance) */

function eRet(atom: AnfAtom, src: IRProvenance): AnfExpr {
  return { kind: 'ret', atom, ...prov(src) };
}
function eTail(comp: AnfComp, src: IRProvenance): AnfExpr {
  return { kind: 'tail', comp, ...prov(src) };
}
function eLet(name: string, rhs: AnfBinding, body: AnfExpr, src: IRProvenance): AnfExpr {
  return { kind: 'let', name, rhs, body, ...prov(src) };
}
function eLetrec(name: string, rhs: AnfBinding, body: AnfExpr, src: IRProvenance): AnfExpr {
  return { kind: 'letrec', name, rhs, body, ...prov(src) };
}
function cApp(func: AnfAtom, arg: AnfAtom, src: IRProvenance): AnfComp {
  return { kind: 'app', func, arg, ...prov(src) };
}
function cPrim(opKind: PrimOpKind, op: string, left: AnfAtom, right: AnfAtom, src: IRProvenance): AnfComp {
  return { kind: 'prim', opKind, op, left, right, ...prov(src) };
}
function cIf(cond: AnfAtom, thenB: AnfExpr, elseB: AnfExpr, src: IRProvenance): AnfComp {
  return { kind: 'if', cond, then: thenB, else: elseB, ...prov(src) };
}
function aVar(name: string, src?: IRProvenance): AnfAtom {
  return { kind: 'var', name, ...(src ? prov(src) : {}) };
}

/** All variable, parameter, and binder names in a Core term — seeds the fresh
 *  supply so generated `t0, t1, …` never collide with a source name. */
function collectNames(core: CoreTerm, acc: Set<string>): void {
  switch (core.kind) {
    case 'var':
      acc.add(core.name);
      return;
    case 'abs':
      acc.add(core.param);
      collectNames(core.body, acc);
      return;
    case 'app':
      collectNames(core.func, acc);
      collectNames(core.arg, acc);
      return;
    case 'let':
    case 'letrec':
      acc.add(core.name);
      collectNames(core.value, acc);
      collectNames(core.body, acc);
      return;
    case 'prim':
      collectNames(core.left, acc);
      collectNames(core.right, acc);
      return;
    case 'if':
      collectNames(core.cond, acc);
      collectNames(core.then, acc);
      collectNames(core.else, acc);
      return;
    case 'num':
    case 'bool':
    case 'hole':
      return;
    default:
      assertNever(core);
  }
}

/* ------------------------------------------------------------------- the pass */

export function toAnf(core: CoreTerm, strategy: ReductionKind, fresh: FreshNames): AnfExpr {
  const cbs = strategy === 'structure';

  /** A trivial Core term as a *value* atom (a source variable forces under CbS). */
  function atomVal(c: CoreTerm): AnfAtom {
    switch (c.kind) {
      case 'var':
        return cbs
          ? { kind: 'force', name: c.name, ...prov(c) }
          : { kind: 'var', name: c.name, ...prov(c), ...tyOf(c) };
      case 'num':
        return { kind: 'num', value: c.value, ...prov(c), ...tyOf(c) };
      case 'bool':
        return { kind: 'bool', value: c.value, ...prov(c), ...tyOf(c) };
      case 'abs':
        return { kind: 'lam', param: c.param, body: normalize(c.body), ...prov(c), ...tyOf(c) };
      case 'hole':
        return { kind: 'hole', label: c.label, ...prov(c) };
      default:
        throw new Error(`atomVal: expected a trivial Core node, got ${c.kind}`);
    }
  }

  /** Produce a tail expression that yields `c`'s value. */
  function normalize(c: CoreTerm): AnfExpr {
    switch (c.kind) {
      case 'var':
      case 'num':
      case 'bool':
      case 'abs':
      case 'hole':
        return eRet(atomVal(c), c);
      case 'app':
        return normalizeName(c.func, (fnA) => normalizeArg(c.arg, (argA) => eTail(cApp(fnA, argA, c), c)));
      case 'prim':
        return normalizeName(c.left, (lA) => normalizeName(c.right, (rA) => eTail(cPrim(c.opKind, c.op, lA, rA, c), c)));
      case 'if':
        return normalizeName(c.cond, (cA) => eTail(cIf(cA, normalize(c.then), normalize(c.else), c), c));
      case 'let':
        return letExpr(c.name, c.value, c, () => normalize(c.body));
      case 'letrec':
        return letrecExpr(c.name, c.value, c, () => normalize(c.body));
      default:
        return assertNever(c);
    }
  }

  /** Name `c`'s value (strict position), then continue with that value atom. */
  function normalizeName(c: CoreTerm, k: (atom: AnfAtom) => AnfExpr): AnfExpr {
    switch (c.kind) {
      case 'var':
      case 'num':
      case 'bool':
      case 'abs':
      case 'hole':
        return k(atomVal(c));
      case 'app':
        return normalizeName(c.func, (fnA) =>
          normalizeArg(c.arg, (argA) => {
            const t = fresh.fresh('t');
            return eLet(t, { kind: 'comp', comp: cApp(fnA, argA, c) }, k(aVar(t)), c);
          }));
      case 'prim':
        return normalizeName(c.left, (lA) =>
          normalizeName(c.right, (rA) => {
            const t = fresh.fresh('t');
            return eLet(t, { kind: 'comp', comp: cPrim(c.opKind, c.op, lA, rA, c) }, k(aVar(t)), c);
          }));
      case 'if':
        return normalizeName(c.cond, (cA) => {
          const t = fresh.fresh('t');
          return eLet(t, { kind: 'comp', comp: cIf(cA, normalize(c.then), normalize(c.else), c) }, k(aVar(t)), c);
        });
      case 'let':
        return letExpr(c.name, c.value, c, () => normalizeName(c.body, k));
      case 'letrec':
        return letrecExpr(c.name, c.value, c, () => normalizeName(c.body, k));
      default:
        return assertNever(c);
    }
  }

  /** Normalize `c` in application-argument position, then continue with the arg
   *  atom. CbV evaluates it first; CbS passes it lazily (var alias or thunk). */
  function normalizeArg(c: CoreTerm, k: (atom: AnfAtom) => AnfExpr): AnfExpr {
    if (!cbs) return normalizeName(c, k);
    switch (c.kind) {
      case 'var':
        return k(aVar(c.name, c)); // alias the existing thunk — no force
      case 'num':
        return k({ kind: 'num', value: c.value, ...prov(c), ...tyOf(c) });
      case 'bool':
        return k({ kind: 'bool', value: c.value, ...prov(c), ...tyOf(c) });
      case 'abs':
        return k({ kind: 'lam', param: c.param, body: normalize(c.body), ...prov(c), ...tyOf(c) });
      case 'hole':
        return k({ kind: 'hole', label: c.label, ...prov(c) });
      default: {
        // app / prim / if / let / letrec: suspend the whole argument as a thunk
        const t = fresh.fresh('t');
        return eLet(t, { kind: 'susp', body: normalize(c) }, k(aVar(t, c)), c);
      }
    }
  }

  /** Source `let name = value in <mkBody>`. */
  function letExpr(name: string, value: CoreTerm, src: IRProvenance, mkBody: () => AnfExpr): AnfExpr {
    if (cbs) return eLet(name, { kind: 'susp', body: normalize(value) }, mkBody(), src);
    return bindStrictTo(value, name, mkBody, src);
  }

  /** Source `letrec name = value in <mkBody>`. */
  function letrecExpr(name: string, value: CoreTerm, src: IRProvenance, mkBody: () => AnfExpr): AnfExpr {
    if (cbs) return eLetrec(name, { kind: 'susp', body: normalize(value) }, mkBody(), src);
    if (value.kind === 'abs') {
      const lam: AnfAtom = { kind: 'lam', param: value.param, body: normalize(value.body), ...prov(value), ...tyOf(value) };
      return eLetrec(name, { kind: 'atom', atom: lam }, mkBody(), src);
    }
    // Call-by-value letrec must bind a lambda (the CEK rejects otherwise); best effort.
    return bindStrictTo(value, name, mkBody, src);
  }

  /** Strict binding `let name = <value> in <mkBody>` (call-by-value). */
  function bindStrictTo(value: CoreTerm, name: string, mkBody: () => AnfExpr, src: IRProvenance): AnfExpr {
    switch (value.kind) {
      case 'var':
      case 'num':
      case 'bool':
      case 'abs':
      case 'hole':
        return eLet(name, { kind: 'atom', atom: atomVal(value) }, mkBody(), src);
      case 'app':
        return normalizeName(value.func, (fnA) =>
          normalizeArg(value.arg, (argA) => eLet(name, { kind: 'comp', comp: cApp(fnA, argA, value) }, mkBody(), src)));
      case 'prim':
        return normalizeName(value.left, (lA) =>
          normalizeName(value.right, (rA) =>
            eLet(name, { kind: 'comp', comp: cPrim(value.opKind, value.op, lA, rA, value) }, mkBody(), src)));
      case 'if':
        return normalizeName(value.cond, (cA) =>
          eLet(name, { kind: 'comp', comp: cIf(cA, normalize(value.then), normalize(value.else), value) }, mkBody(), src));
      case 'let':
        return letExpr(value.name, value.value, value, () => bindStrictTo(value.body, name, mkBody, src));
      case 'letrec':
        return letrecExpr(value.name, value.value, value, () => bindStrictTo(value.body, name, mkBody, src));
      default:
        return assertNever(value);
    }
  }

  return normalize(core);
}

/** Normalize a whole Core term, seeding a fresh-name supply from its names. */
export function toAnfProgram(core: CoreTerm, strategy: ReductionKind): AnfProgram {
  const used = new Set<string>();
  collectNames(core, used);
  return { strategy, body: toAnf(core, strategy, makeFreshNames(used)) };
}
