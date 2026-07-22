# Block-Lambda-Calculus — repo notes

A TypeScript + webpack + Blockly 12 block IDE for lambda calculus. ~10.6k lines of TS. On branch `ui-domain-update`, clean tree, 11 commits ahead of `main` (all pushed to `origin/ui-domain-update`, not merged).

**Verified state:** `npm test` → 47 round-trip + 245 semantics + layout + 72 block-color checks all pass. `npm run lint` clean.

## Language core

| Layer | File | Notes |
|---|---|---|
| Blocks | `src/core/blocks/lambdaBlocks.ts` | var, abs, app, parens, let, letrec, num, bool, numop, boolop, cmpop, if |
| Substitution semantics | `src/core/semantics/lambdaReduction.ts` (1038 L) | `Term` IR with `sourceId` provenance back to block ids; capture-avoiding `substitute`; CbS + CbV |
| Abstract machine | `src/core/machine/csekMachine.ts` (408 L) | CEK — walks the *real* block tree by id, never copies blocks |
| Types | `src/core/type-inference/lambdaTypeInference.ts` | HM: unify/generalize/instantiate, let-polymorphism, monomorphic `letrec` |
| Parser/generators | `lambdaTextParser.ts`, `lambdaGenerator.ts`, `lambdaFormalGenerator.ts` | text↔blocks round-trip, plus formal derivation output |

The design commitment worth knowing: **Call-by-Structure is the language default**, mirroring Block-based-MNL. CbS β-substitutes the *unevaluated argument's block structure* into every parameter occurrence, so duplicated work shows as duplicated structure. In the machine, CbS binds arguments as `Thunk { blockId, env }` and re-enters on every lookup — env lookup as the lazy image of physical copying. Neither strategy reduces under a binder (`lambdaReduction.ts:426`), consistent with MNL.

`stepCsekMachine` is pure w.r.t. state, so Back is exact time travel. `isSalientRule` (`beta`/`if-*`/`prim …`) is the contract joining the two presentations, and `tests/semantics.ts` enforces it: for every example, both traces and both machine runs reach the same value *and* fire the same salient rules in the same order — the lockstep invariant.

Two small semantic decisions are deliberately duplicated in both engines and commented as such: `/` truncates toward zero and `x/0 = 0`, so a well-typed `int` term always yields an integer.

## UI layer

`workbench.ts` (780 L) + `layout.ts` + `visualizationPanel.ts` + `csekPanel.ts` — activity bar, perspectives (edit/debug/types/presentation/custom), command palette, bottom Semantics dock with CbS / CbV / CEK / Lockstep tabs. Layout persists through validated `layoutState.ts` that degrades malformed payloads to defaults.

The last 11 commits are entirely a UI/IA refactor, governed by `docs/ui-refactor/REFRACTORING_CONSTRAINTS.md` — an explicit contract with a DOM dependency map, stylesheet map, and command inventory, backed by Playwright visual + accessibility suites (`npm run test:ui`).

## Resolved item

`REFRACTORING_CONSTRAINTS.md` originally hedged throughout ("preserve all existing Block-MiniJava functionality in the intended product. In this checkout, preserve all existing Block Lambda functionality…") because it was written expecting Block-MiniJava but the checkout is Block-Lambda-Calculus. Since the refactor has since been fully implemented here, the doc's status section, goal 1, section 4's ID table, and section 9's risk list were updated (2026-07-22) to record this repo as the confirmed target rather than leave it as an open question — cleared before it gets cited in the T2BB or SAVAM paper.
