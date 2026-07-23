/**
 * Core IR — the typed, desugared surface language, produced from `Term` by
 * `desugar` (step 1.2). Differences from `Term`:
 *   - the three operator nodes (numop/boolop/cmpop) unify into one `prim` with
 *     an `opKind` discriminator, cutting branching in every later pass;
 *   - `letrec` stays a *named* recursive binding (it survives to the first-order
 *     IR as a liftable function) rather than collapsing to a unary `fix`;
 *   - every node carries its inferred `ty` and its block provenance.
 */
import type { IRProvenance } from './provenance';
import type { IRType } from './types';

export type PrimOpKind = 'num' | 'bool' | 'cmp';

export type CoreTerm = IRProvenance & { ty?: IRType } & (
  | { kind: 'var'; name: string }
  | { kind: 'abs'; param: string; paramTy?: IRType; body: CoreTerm }
  | { kind: 'app'; func: CoreTerm; arg: CoreTerm }
  | { kind: 'let'; name: string; value: CoreTerm; body: CoreTerm }
  | { kind: 'letrec'; name: string; value: CoreTerm; body: CoreTerm }
  | { kind: 'num'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'prim'; opKind: PrimOpKind; op: string; left: CoreTerm; right: CoreTerm }
  | { kind: 'if'; cond: CoreTerm; then: CoreTerm; else: CoreTerm }
  | { kind: 'hole'; label: string }
);

export type CoreKind = CoreTerm['kind'];
