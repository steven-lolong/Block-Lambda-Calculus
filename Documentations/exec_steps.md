# Execution Runbook — Building the Lowering Pipeline Inspector in Claude Code

An ordered, copy-pasteable runbook for building the nanopass lowering pipeline
(blocks → machine code), where each pass becomes a block-traceable Inspector tab.

This is the **operational** companion to `steps.md`. `steps.md` is the *plan*
(what to build, with which model/effort and why). This file is the *script*:
the exact Claude Code commands to set, the prompt to paste, and the gate to pass
before moving to the next step.

## How to read each step

```
SET     — the /model and /effort to set for this step
PROMPT  — paste this to Claude Code
GATE    — must pass before the next step
```

## Command legend

| Command | Effect |
|---------|--------|
| `/model opus` · `/model sonnet` · `/model haiku` | switch model for the session |
| `/effort low\|medium\|high\|xhigh\|max` | set reasoning effort for the session |
| `/fast` | Opus 4.8 with faster output, no downgrade (use on Opus-heavy design steps) |
| Plan mode | design without editing; approve the plan before code is written |
| `/code-review high` | review the working diff for bugs + cleanups |
| `/verify` · `/run` | drive the new tab end-to-end in the browser |

> Note: `.claude/settings.json` pins **Sonnet 5 on restart**. After any restart,
> re-run `/model opus` before a hard-transform step — otherwise it silently runs
> on Sonnet.

---

## Pre-flight (once)

### PF-1 · Baseline green
- **SET** `/model sonnet` · `/effort low`
- **PROMPT** — "Confirm we're in `Codes/Block-Lambda-Calculus`. Run `npm install`
  if `node_modules` is stale, then `npm run typecheck` and `npm test`, and report
  the baseline result."
- **GATE** typecheck clean, all suites (`roundtrip`, `semantics`, `layout`) pass.

### PF-2 · Working branch
- **SET** `/model haiku` · `/effort low`
- **PROMPT** — "Create a git branch `feat/lowering-pipeline` off the current
  branch. Don't commit anything yet."
- **GATE** on the new branch, working tree clean.

---

## Phase 1 — Core + ANF (foundation)

### 1.1 · Design the IR interfaces  ·  **Opus 4.8 · xhigh · Plan mode**
- **SET** `/model opus` · `/effort xhigh` — then enter Plan mode.
- **PROMPT** — "Plan (don't write code yet) TypeScript interfaces for a `CoreTerm`
  and an `AnfTerm` IR under `src/core/ir/`. Reuse the existing `Term` ADT and its
  `sourceId`/`sourceAliases` provenance from
  `src/core/semantics/lambdaReduction.ts`. ANF must distinguish atomic (trivial)
  operands from complex terms, and carry a strategy tag so a CbS variant and a
  CbV variant share one type. Show the interfaces and the pass signatures."
- **GATE** you approve the plan; provenance field is present on every node.

### 1.2 · desugar: Term → typed Core  ·  **Sonnet 5 · high**
- **SET** `/model sonnet` · `/effort high`
- **PROMPT** — "Implement `desugar` in `src/core/ir/`: block tree → typed
  `CoreTerm`. Fold `letrec` into `fix`, and attach the inferred type of each node
  from the inference report (`lambdaTypeInference.ts`). Copy `sourceId` forward."
- **GATE** `npm run typecheck` clean.

### 1.3 · toAnf, CbV + CbS  ·  **Opus 4.8 · xhigh**
- **SET** `/model opus` · `/effort xhigh`  (optionally `/fast`)
- **PROMPT** — "Implement `toAnf: CoreTerm → AnfTerm`, parameterized by strategy.
  CbV binds evaluated values; CbS binds re-entered thunks, matching the CEK
  machine's thunk semantics in `csekMachine.ts`. Name every non-trivial operand
  with a `let`. Preserve provenance on generated lets."
- **GATE** typecheck clean; spot-check `factorial` output matches the worked
  example in the design note.

### 1.4 · Pretty-printers for Core & ANF  ·  **Haiku 4.5 · low–medium**
- **SET** `/model haiku` · `/effort medium`
- **PROMPT** — "Write pretty-printers for `CoreTerm` and `AnfTerm`, mirroring the
  style of `lambdaTermText.ts`. Output `{html, text}` like
  `lambdaFormalGenerator.ts` so the Inspector can render either."
- **GATE** printed output round-trips readably for the built-in examples.

### 1.5 · "Lowering" Inspector tab + stage strip  ·  **Sonnet 5 · high**
- **SET** `/model sonnet` · `/effort high`
- **PROMPT** — "Add a `Lowering` tab to the Inspector following the existing
  `Types` tab pattern (`src/index.html`, `src/core/ui/workbench.ts`). Inside it,
  a horizontal stage strip with the pipeline stages; start with `Core` and `ANF`
  panes rendering the pretty-printer output. Persist the active stage in
  `layoutState.ts` defensively, like the other layout state."
- **GATE** `/run` — the tab appears, switches stages, survives reload.

### 1.6 · Property tests  ·  **Sonnet 5 · medium**
- **SET** `/model sonnet` · `/effort medium`
- **PROMPT** — "Extend `tests/semantics.ts`: for every example program, Core and
  ANF must preserve the final value under both CbS and CbV. Mirror the existing
  lockstep-invariant test style. Add an npm script if useful."
- **GATE** `npm test` all green.

### 1.7 · Review + verify  ·  **Opus 4.8 · high**
- **SET** `/model opus` · `/effort high`
- **PROMPT** — `/code-review high`, then `/verify` to drive the Lowering tab.
- **GATE** review findings resolved; verify observes correct Core/ANF for a
  program you type live.

---

## Phase 2 — Closures + First-order IR

### 2.1 · Design closure IR + FIR  ·  **Opus 4.8 · xhigh · Plan mode**
- **PROMPT** — "Plan the closure IR (`{code, env}`, typed with an existential env
  type) and the first-order IR (flat function table). Keep it type-preserving.
  Show interfaces and pass signatures; don't write code yet."
- **GATE** you approve; env type is existential; provenance preserved.

### 2.2 · Free-variable analysis  ·  **Sonnet 5 · medium**
- **PROMPT** — "Implement free-variable computation over `AnfTerm`."
- **GATE** typecheck clean; unit test on a nested-lambda example.

### 2.3 · Closure conversion  ·  **Opus 4.8 · max**
- **PROMPT** — "Implement type-preserving closure conversion: rewrite each λ into
  a closure record and each call into load-code-pointer + apply-to-env+arg.
  Preserve provenance and types."
- **GATE** typecheck clean; converted `factorial` matches the design note; value
  still preserved (extend the P1 property test).

### 2.4 · Lambda lifting → FIR  ·  **Sonnet 5 · high**
- **PROMPT** — "Hoist every closed code body to a top-level function; produce the
  FIR function table. No nested lambdas may remain."
- **GATE** typecheck clean; property test still green.

### 2.5 · Closures + FIR tabs  ·  **Opus (viz design) → Sonnet (impl) · high → medium**
- **PROMPT (Opus)** — "Design the Closures tab: draw each closure's captured-var
  set against the blocks it closes over. Plan the layout."
- **PROMPT (Sonnet)** — "Implement the Closures and FIR panes in the stage strip."
- **GATE** `/run` — capture sets render and link to source blocks.

### 2.6 · Tests + review  ·  **Sonnet 5 · medium**, then `/code-review high`
- **GATE** `npm test` green; review resolved.

---

## Phase 3 — CFG + Assembly + bytecode VM (make it run)

### 3.1 · Design Low IR/CFG + VM ISA + calling convention  ·  **Opus 4.8 · max · Plan mode**
- **PROMPT** — "Plan the low IR: basic blocks, virtual registers, heap
  `alloc`/`store`, and the register bytecode VM's instruction set + calling
  convention (incl. closure-invoke). The ISA is permanent — be deliberate.
  Interfaces only; no code."
- **GATE** you approve the ISA and calling convention.

### 3.2 · CFG construction  ·  **Opus 4.8 · high**
- **PROMPT** — "Lower FIR to the CFG: `if` → branch, closure alloc → heap
  `alloc`/`store`, explicit calling convention. Preserve provenance per
  instruction."
- **GATE** typecheck clean.

### 3.3 · (optional) SSA  ·  **Opus 4.8 · max**
- **PROMPT** — "Add SSA construction with φ-nodes at joins. Skip if time-boxed."
- **GATE** property test green, or explicitly deferred.

### 3.4 · Instruction selection + register allocation  ·  **Opus 4.8 · xhigh**
- **PROMPT** — "Select instructions and run linear-scan register allocation over
  the CFG; realise spills and the closure-invoke as an indirect jump."
- **GATE** typecheck clean; asm for `factorial` matches the design note shape.

### 3.5 · Bytecode encoder + single-steppable VM  ·  **Sonnet 5 (Opus for the Lockstep bridge) · high**
- **PROMPT (Sonnet)** — "Implement the bytecode encoder and a VM interpreter with
  a pure `step(state)` — same shape as `stepCsekMachine` so Back is exact time
  travel."
- **PROMPT (Opus)** — "Wire the VM into the Lockstep view: reuse the
  `syncCount`/`diverged` correspondence machinery, one level lower."
- **GATE** VM runs `factorial 5` → 120.

### 3.6 · CFG + Asm + Machine-code tabs  ·  **Sonnet 5 · medium–high**
- **PROMPT** — "Add the CFG (blocks+edges diagram), Assembly, and Machine-code
  (hex + Run + correctness badge) panes to the stage strip."
- **GATE** `/run` — Run button executes, badge shows the result.

### 3.7 · Cross-check invariant  ·  **Opus 4.8 · high**
- **PROMPT** — "Add a property test: for every example, bytecode execution result
  == CEK result == substitution trace result. This one test guards the whole
  compiler."
- **GATE** `npm test` green; `/code-review high` resolved.

---

## Phase 4 — CPS + WASM (optional) & cross-cutting tabs

| Step | SET | PROMPT (summary) | GATE |
|------|-----|------------------|------|
| CPS companion | `opus` · high | CPS transform toggling beside ANF | value preserved |
| WASM `.wat` gen | `sonnet` · high | CFG → `.wat` text | wat validates |
| WASM binary encoder | `opus` · max | encode `.wat` → `.wasm` bytes, no external libs | runs, result == CEK |
| Provenance / source-map | `opus` design → `sonnet` wiring · high → med | bidirectional block ↔ IR highlight via `sourceId` | click block → all stages highlight; click instr → block highlights |
| Pass-diff | `sonnet` · medium | before/after for the selected pass | diff renders |
| Metrics | `haiku` · low | per-stage counters (closures, blocks, instrs, tail calls) | numbers render |

---

## Per-phase exit checklist

- [ ] `npm run typecheck` clean
- [ ] `npm test` all green (incl. new property tests)
- [ ] `/code-review high` findings resolved
- [ ] `/verify` or `/run` observed the new tab working in the browser
- [ ] value-preservation invariant holds under **both** CbS and CbV
- [ ] commit on `feat/lowering-pipeline` (only when you ask)

## Resource summary

Spend **Opus + xhigh/max** on the five correctness-critical steps only —
CbS-ANF (1.3), closure conversion (2.3), VM ISA design (3.1), register
allocation (3.4), cross-check invariant (3.7). Everything else runs on
Sonnet 5 (high/medium) or Haiku 4.5 (low). Critical path: P1 → P2 → P3.
