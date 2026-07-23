/**
 * A-normal form. Three explicit layers make the "name every intermediate"
 * discipline visible in the type itself:
 *   - AnfAtom : trivial operands (no control flow, nothing left to evaluate) —
 *               the only things an AnfComp is allowed to mention;
 *   - AnfComp : a real computation that must be `let`-bound or sit in tail
 *               position;
 *   - AnfExpr : the let-normalized expression.
 *
 * One `AnfExpr` type serves both evaluation strategies. `AnfProgram.strategy`
 * records which discipline produced it, and a binding's strictness is read via
 * `binderOf` (a `susp` rhs is the thunk):
 *   - call-by-value       ⇒ every binding strict (`atom`/`comp`), never a `force`;
 *   - call-by-structure   ⇒ `susp` bindings for suspended arguments plus a
 *                           `force` atom at each use, mirroring the CEK
 *                           machine's thunk-rebind-on-lookup
 *                           (see ../machine/csekMachine.ts).
 */
import type { IRProvenance } from './provenance';
import type { IRType } from './types';
import type { PrimOpKind } from './core';
import type { ReductionKind } from '../semantics/lambdaReduction';

export type { ReductionKind };

/** Trivial operands. `force` appears only under call-by-structure. */
export type AnfAtom = IRProvenance & { ty?: IRType } & (
  | { kind: 'var'; name: string }
  | { kind: 'num'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'lam'; param: string; body: AnfExpr }
  | { kind: 'force'; name: string }
  | { kind: 'hole'; label: string }
);

/** Serious computations — must be `let`-bound or sit in tail position. `if` is
 *  a computation (its branches are full expressions), so it can be either named
 *  by a `let` or run in tail position, exactly like `app` and `prim`. */
export type AnfComp = IRProvenance & (
  | { kind: 'app'; func: AnfAtom; arg: AnfAtom }
  | { kind: 'prim'; opKind: PrimOpKind; op: string; left: AnfAtom; right: AnfAtom }
  | { kind: 'if'; cond: AnfAtom; then: AnfExpr; else: AnfExpr }
);

/** `val` = strict (call-by-value); `thunk` = suspended (call-by-structure). */
export type AnfBinder = 'val' | 'thunk';

/**
 * Right-hand side of a `let` / `letrec`. `atom` and `comp` are strict — the
 * value is computed at the binding (binder `val`). `susp` suspends a whole
 * expression (binder `thunk`): the call-by-structure thunk that a `force` atom
 * re-enters, mirroring the CEK machine's `Thunk { blockId, env }`. Because a
 * thunk suspends an arbitrary sub-expression — not just a single computation —
 * its payload is a full `AnfExpr`.
 */
export type AnfBinding =
  | { kind: 'atom'; atom: AnfAtom }
  | { kind: 'comp'; comp: AnfComp }
  | { kind: 'susp'; body: AnfExpr };

export type AnfExpr = IRProvenance & (
  | { kind: 'ret'; atom: AnfAtom }
  | { kind: 'let'; name: string; rhs: AnfBinding; body: AnfExpr }
  | { kind: 'letrec'; name: string; rhs: AnfBinding; body: AnfExpr }
  | { kind: 'tail'; comp: AnfComp }
);

export interface AnfProgram {
  strategy: ReductionKind;
  body: AnfExpr;
}

/** Strictness of a binding — `susp` is the only non-strict (thunk) form. */
export function binderOf(binding: AnfBinding): AnfBinder {
  return binding.kind === 'susp' ? 'thunk' : 'val';
}

const ATOM_KINDS = new Set<string>(['var', 'num', 'bool', 'lam', 'force', 'hole']);
const COMP_KINDS = new Set<string>(['app', 'prim', 'if']);

/** True when `node` is an AnfAtom, judged by its discriminant kind. */
export function isAtom(node: { kind: string }): node is AnfAtom {
  return ATOM_KINDS.has(node.kind);
}

/** True when `node` is an AnfComp, judged by its discriminant kind. */
export function isComp(node: { kind: string }): node is AnfComp {
  return COMP_KINDS.has(node.kind);
}
