/**
 * Closure IR — every lambda is an explicit `{code, env}` pair, produced from
 * `AnfExpr` by `closureConvert` (step 2.3). Mirrors the three ANF layers
 * (atom/comp/binding/expr) so the "name every intermediate" discipline
 * carries over unchanged; only the lambda- and application-shaped nodes
 * differ from `anf.ts`:
 *   - ANF `lam`            -> Clos `clos { code, env }`  (env = ordered free vars)
 *   - ANF `app`             -> Clos `callclos`             (unpack + apply)
 *   - (new)                 -> Clos `proj`                 (read an env slot)
 *
 * `ClosCode.body` opens with a projection preamble
 * (`let yᵢ = proj(envParam, i)` for each captured `yᵢ`), so everything below
 * the preamble is textually the original ANF body — still `force yᵢ` under
 * call-by-structure. This is what keeps closure conversion a small, local
 * rewrite instead of a full re-traversal.
 *
 * `letrec`-bound *lambdas* do not produce a `clos` node here — the runbook's
 * step 2.3 resolves recursive self-reference to the lifted function's label
 * (see `fir.ts`), giving closed recursive functions (e.g. factorial) an empty
 * env. `letrec` survives in this IR only for a non-lambda recursive thunk
 * (call-by-structure).
 */
import type { IRProvenance } from './provenance';
import type { IRType } from './types';
import type { PrimOpKind } from './core';
import type { ReductionKind } from './anf';

/** Trivial operands. `proj` is trivial: reading an env slot is not control flow. */
export type ClosAtom = IRProvenance & { ty?: IRType } & (
  | { kind: 'var'; name: string }
  | { kind: 'num'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'clos'; code: ClosCode; env: ClosAtom[] }
  | { kind: 'proj'; env: string; index: number }
  | { kind: 'force'; name: string }
  | { kind: 'hole'; label: string }
);

/**
 * A closed function body: the only names it may mention are `envParam`,
 * `param`, and global function labels (enforced by `checkClos`, step 2.6).
 * `envLayout[i]` is the type of the `i`-th captured variable, i.e.
 * `envParam : tprod(envLayout)`.
 */
export interface ClosCode extends IRProvenance {
  envParam: string;
  envLayout: IRType[];
  param: string;
  paramTy?: IRType;
  resultTy?: IRType;
  body: ClosExpr;
}

/** Serious computations — must be `let`-bound or sit in tail position. */
export type ClosComp = IRProvenance & (
  | { kind: 'callclos'; clos: ClosAtom; arg: ClosAtom }
  | { kind: 'prim'; opKind: PrimOpKind; op: string; left: ClosAtom; right: ClosAtom }
  | { kind: 'if'; cond: ClosAtom; then: ClosExpr; else: ClosExpr }
);

/** Right-hand side of a `let` / `letrec` — same shape as `AnfBinding`. */
export type ClosBinding =
  | { kind: 'atom'; atom: ClosAtom }
  | { kind: 'comp'; comp: ClosComp }
  | { kind: 'susp'; body: ClosExpr };

export type ClosExpr = IRProvenance & (
  | { kind: 'ret'; atom: ClosAtom }
  | { kind: 'let'; name: string; rhs: ClosBinding; body: ClosExpr }
  | { kind: 'letrec'; name: string; rhs: ClosBinding; body: ClosExpr }
  | { kind: 'tail'; comp: ClosComp }
);

export interface ClosProgram {
  strategy: ReductionKind;
  body: ClosExpr;
}

const ATOM_KINDS = new Set<string>(['var', 'num', 'bool', 'clos', 'proj', 'force', 'hole']);
const COMP_KINDS = new Set<string>(['callclos', 'prim', 'if']);

/** True when `node` is a ClosAtom, judged by its discriminant kind. */
export function isClosAtom(node: { kind: string }): node is ClosAtom {
  return ATOM_KINDS.has(node.kind);
}

/** True when `node` is a ClosComp, judged by its discriminant kind. */
export function isClosComp(node: { kind: string }): node is ClosComp {
  return COMP_KINDS.has(node.kind);
}
