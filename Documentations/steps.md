# Build Plan — Lowering Pipeline Inspector (blocks → machine code)

Step-by-step implementation plan for the nanopass lowering pipeline, where each
pass becomes a block-traceable Inspector tab. Each step is tagged with a
recommended Claude **model** and **reasoning effort** to use when building it.

Design reference: the pipeline design note (nine stages, nine tabs) and the
worked `factorial 5` lowering. This file covers *how to build it and with what
resources*, not the design rationale.

---

## The rule of thumb

- **Model = breadth and judgment.** Use **Opus 4.8** where a subtle bug hides
  silently (IR/type design, semantics-sensitive transforms, register
  allocation). Use **Sonnet 5** for transforms with a fixed spec and for UI
  wiring that follows an existing in-repo pattern. Use **Haiku 4.5** for
  pretty-printers, CSS, boilerplate, counters.
- **Effort = depth on one hard problem.** Ladder: `low → medium → high → xhigh →
  max`. Reserve `max` for the 3–4 genuinely hard algorithms; it is slow.
- **They compound.** On the ~5 correctness-critical steps, spend on *both*
  (Opus + xhigh/max). On mechanical steps, save on *both* (Haiku/Sonnet +
  low/medium). That is the entire cost-control story.

The five steps that deserve **Opus + xhigh/max**: CbS-ANF, closure conversion,
the VM instruction-set design, register allocation, and the cross-check
invariant. Everything else runs comfortably on Sonnet 5 (high/medium) or
Haiku 4.5 (low).

Critical path: **P1 → P2 → P3**. P4 and the cross-cutting tabs are optional.

---

## Phase 1 — Core + ANF (the foundation)

| Step | Model | Effort | Why |
|------|-------|--------|-----|
| 1. Design Core & ANF IR interfaces (extend `Term`, atomic/complex split, provenance convention) | **Opus 4.8** | xhigh | every downstream tab inherits this shape |
| 2. `desugar`: Term → typed Core (`letrec`→`fix`, attach HM types) | Sonnet 5 | high | clear spec; type-attachment needs care |
| 3. `toAnf` — strategy-parameterized (CbV values vs **CbS thunks**) | **Opus 4.8** | xhigh | the one subtle/novel transform in P1 |
| 4. Pretty-printers for Core & ANF (mirror `lambdaTermText`) | Haiku 4.5 | low–med | mechanical, existing pattern |
| 5. "Lowering" Inspector tab + stage strip + `layoutState` persistence | Sonnet 5 | high | follows the Types-tab pattern |
| 6. Property tests: Core/ANF preserve value under CbS & CbV (extend `tests/semantics.ts`) | Sonnet 5 | medium | mirror the existing lockstep-invariant tests |
| 7. Review | `/code-review` | high | — |

## Phase 2 — Closures + First-order IR

| Step | Model | Effort | Why |
|------|-------|--------|-----|
| 1. Design closure IR `{code, env}` + FIR function table (typed, existential env) | **Opus 4.8** | xhigh | conceptual heart; type-preserving is the paper angle |
| 2. Free-variable analysis | Sonnet 5 | medium | textbook |
| 3. Closure conversion (type-preserving) | **Opus 4.8** | **max** | hardest correctness step in P2 |
| 4. Lambda lifting → FIR | Sonnet 5 | high | mechanical once closures are right |
| 5. Closures tab (capture sets ↔ blocks) + FIR table tab | Opus (viz design) → Sonnet (impl) | high → med | the capture-set view is the money shot |
| 6. Tests + review | Sonnet 5 / `/code-review` | med / high | — |

## Phase 3 — CFG + Assembly + bytecode VM (make it run)

| Step | Model | Effort | Why |
|------|-------|--------|-----|
| 1. Design Low IR/CFG + VM instruction set + calling convention | **Opus 4.8** | **max** | the ISA is forever; biggest single design |
| 2. CFG construction (`if`→branch, `alloc`/`store`) | **Opus 4.8** | high | — |
| 3. *(optional)* SSA construction | **Opus 4.8** | **max** | genuinely hard — skip in v1 if time-boxed |
| 4. Instruction selection + linear-scan register allocation | **Opus 4.8** | xhigh | classic-hard; linear-scan keeps it tractable |
| 5. Bytecode encoder + single-steppable VM interpreter | Sonnet 5 (Opus for the Lockstep bridge) | high | interpreter is mechanical; the step/Lockstep hook is not |
| 6. CFG diagram + Asm + hex/Run/badge tabs | Sonnet 5 | med–high | — |
| 7. Cross-check test: bytecode result == CEK == substitution | **Opus 4.8** | high | defines the correctness invariant |

## Phase 4 — CPS + WASM (optional) and cross-cutting tabs

| Step | Model | Effort |
|------|-------|--------|
| CPS transform (companion toggle) | Opus 4.8 | high |
| WASM `.wat` generation | Sonnet 5 | high |
| WASM binary encoder (no external libs) | **Opus 4.8** | **max** |
| **Provenance / source-map** (bidirectional highlight) | Opus (design) → Sonnet (wiring) | high → med |
| Pass-diff view | Sonnet 5 | medium |
| Metrics counters | Haiku 4.5 | low |

The **provenance step is the one cross-cutting item worth Opus** — it is the
differentiator that turns the pipeline from a listing dump into a research
instrument, and it depends on threading `sourceId` cleanly through every pass.

---

## Design invariants (keep these true across all phases)

1. **Thread provenance everywhere.** Every pass copies
   `sourceId`/`sourceAliases` forward. Already seeded in the Term IR — this is
   what makes the pipeline block-traceable and is the novel claim.
2. **Nanopass discipline.** Each pass is a pure `IR_n → IR_{n+1}`. Tabs just
   render outputs; passes are unit-testable in isolation.
3. **Parameterize by strategy.** Honour Call-by-Structure as the default, like
   the steppers (ANF-with-thunks for CbS vs ANF-with-values for CbV).
4. **Cross-check the endpoint.** Stage 7 execution must equal the substitution
   trace and the CEK result on every example — one property test guards the
   whole compiler.

## Target decision

- **Primary: custom register bytecode VM** — single-steppable like the CEK
  machine, joins the Lockstep view, trivial to explain in a paper.
- **Secondary (P4): WebAssembly** — "real" machine code and credibility, but a
  black box to step; keep it as a second backend behind the same CFG.

---

## How to set model and effort in Claude Code

- **Per session:** `/model opus` · `/model sonnet` · `/model haiku`, and
  `/effort xhigh` (`low|medium|high|xhigh|max`). Switching mid-build is cheap —
  flip to Opus for a design step, back to Sonnet/Haiku for mechanical follow-up.
- **Note:** `.claude/settings.json` pins Sonnet 5 on restart, so re-set the
  model after any restart (or update the pin) — otherwise a hard-transform step
  silently runs on Sonnet.
- **`/fast`** — Opus 4.8 with faster output and *no* downgrade. Use it for the
  Opus-heavy design steps when you want speed without losing judgment.
- **Per-step isolation:** to fan a mechanical sub-task to Haiku while you stay on
  Opus, spawn a subagent with an explicit `model` override — it will not touch
  your session's model.
- **Loop per phase:** Plan mode on the *design* step (lock the IR interfaces
  before writing) → implement → `/code-review high` → `/verify` (or `/run`) to
  drive the new tab in the browser (Playwright is already wired).
