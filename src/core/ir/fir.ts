/**
 * First-order IR — every code body hoisted out of line into a flat, labeled
 * function table, produced from `ClosProgram` by `liftFunctions` (step 2.4).
 * The only structural change from `clos.ts` is `ClosAtom`'s `clos.code`
 * field: an inline `ClosCode` becomes a `Label` reference into
 * `FirProgram.functions`. Every other node is re-typed identically over
 * `FirAtom` in place of `ClosAtom` — lifting is a small, mechanical pass
 * precisely because that is the only delta.
 */
import type { IRProvenance } from './provenance';
import type { IRType } from './types';
import type { PrimOpKind } from './core';
import type { ReductionKind } from './anf';

/** A function-table key. Stable and human-readable (from `FreshNames`), not a numeric index. */
export type Label = string;

/** Trivial operands — identical to `ClosAtom` except `clos.code` is a label, not inline code. */
export type FirAtom = IRProvenance & { ty?: IRType } & (
  | { kind: 'var'; name: string }
  | { kind: 'num'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'clos'; code: Label; env: FirAtom[] }
  | { kind: 'proj'; env: string; index: number }
  | { kind: 'force'; name: string }
  | { kind: 'hole'; label: string }
);

/** Serious computations — must be `let`-bound or sit in tail position. */
export type FirComp = IRProvenance & (
  | { kind: 'callclos'; clos: FirAtom; arg: FirAtom }
  | { kind: 'prim'; opKind: PrimOpKind; op: string; left: FirAtom; right: FirAtom }
  | { kind: 'if'; cond: FirAtom; then: FirExpr; else: FirExpr }
);

/** Right-hand side of a `let` / `letrec` — same shape as `ClosBinding`/`AnfBinding`. */
export type FirBinding =
  | { kind: 'atom'; atom: FirAtom }
  | { kind: 'comp'; comp: FirComp }
  | { kind: 'susp'; body: FirExpr };

export type FirExpr = IRProvenance & (
  | { kind: 'ret'; atom: FirAtom }
  | { kind: 'let'; name: string; rhs: FirBinding; body: FirExpr }
  | { kind: 'letrec'; name: string; rhs: FirBinding; body: FirExpr }
  | { kind: 'tail'; comp: FirComp }
);

/**
 * One flat, closed, labeled function — the lifted counterpart of `ClosCode`.
 * `body`'s free names are a subset of `{ envParam, param } ∪ letrec-locals ∪
 * every table label` (enforced by `checkFir`, step 2.6).
 */
export interface FirFunc extends IRProvenance {
  label: Label;
  envParam: string;
  envLayout: IRType[];
  param: string;
  paramTy?: IRType;
  resultTy?: IRType;
  body: FirExpr;
}

export interface FirProgram {
  strategy: ReductionKind;
  /** Flat table, definition order (stable rendering — no implicit resorting). */
  functions: FirFunc[];
  main: FirExpr;
}

const ATOM_KINDS = new Set<string>(['var', 'num', 'bool', 'clos', 'proj', 'force', 'hole']);
const COMP_KINDS = new Set<string>(['callclos', 'prim', 'if']);

/** True when `node` is a FirAtom, judged by its discriminant kind. */
export function isFirAtom(node: { kind: string }): node is FirAtom {
  return ATOM_KINDS.has(node.kind);
}

/** True when `node` is a FirComp, judged by its discriminant kind. */
export function isFirComp(node: { kind: string }): node is FirComp {
  return COMP_KINDS.has(node.kind);
}
