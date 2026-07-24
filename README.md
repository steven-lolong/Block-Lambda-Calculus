# Block Lambda Calculus IDE

A TypeScript + npm + webpack web project for **Block Lambda**, a block-based IDE for Lambda Calculus.

## Features

- Web-based block IDE with a workbench shell: Header menus, Blocks toolbox,
  Blockly workspace, Code/Types/Outline inspector, Problems/Output/Semantics
  bottom panel, Settings, and status bar.
- Uses Blockly 12.
- Custom **Tude** Blockly renderer:
  - based on the same renderer family as Zelos,
  - keeps the modern Blockly connection model,
  - removes rounded corners so blocks look more like rectangular text/program fragments.
- Hide/show toolbox panel.
- Hide/show generated-code panel, including a phone-layout restore button that scrolls back to the code panel.
- Resizable right code panel.
- Custom Lambda Calculus blocks:
  - variable,
  - abstraction,
  - application,
  - parentheses,
  - let binding,
  - recursive let binding,
  - number,
  - boolean,
  - numeric operator (`+ − × ÷`; `÷` is **integer** division, truncating
    toward zero, since the only numeric type is `int` — `121 / 100` is `1`.
    Division by zero yields `0` rather than a non-integer),
  - boolean operator,
  - if/then/else conditional.
- Examples menu with a submenu for loading built-in workspaces:
  - Identity Function, the polymorphic identity abstraction `λx. x`.
  - Standard Factorial 5, a recursive `factorial` definition applied to integer `5`, reducing to `120`.
- Hindley-Milner-style type inference for Lambda blocks:
  - fresh type variables for lambda parameters,
  - function-type inference for abstraction and application,
  - let-polymorphism through generalized type schemes,
  - monomorphic recursive inference for `letrec` bindings,
  - `int` and `bool` checking for literals, operators, equality, and conditionals,
  - Blockly warning bubbles for type errors and missing inputs,
  - generated-code type comments for top-level terms,
  - native Blockly comment icons on Lambda blocks with pretty-printed type and value information.
- Generated Lambda Calculus text code with syntax highlighting.
- **Inspectable compiler pipeline** — the same program lowered through nine
  intermediate representations (Term → Core → ANF → Closure IR → First-order IR
  → CFG → SSA → register assembly → bytecode) and executed on a register
  bytecode VM. Each stage is a live Inspector tab (Core/ANF/Closures/First-order
  as listings, **CFG** as a blocks+edges diagram, **Assembly** as a mnemonic
  listing, **Machine code** as hex with a **Run** button + a correctness badge),
  and hovering a lowered artifact highlights its source blocks. A single
  cross-check test proves *substitution ≡ CEK machine ≡ bytecode* for every
  example. See [`Documentations/Architecture.md`](Documentations/Architecture.md).
- Neutral dark and light workbench themes with a single product accent and
  grammatical block color families.
- Responsive header menus, panel drawers, keyboard resizers, and persisted
  layout.
- Searchable custom toolbox.
- Theme-aware Blockly colors with the Tude square-corner block shape style.
- Manual `.blc` workspace save/load plus local autosave recovery.
- Logo, favicon, dark/light variants, and 512x512 PWA icon.
- Webpack output bundle name: `block_lambda.js`.

## Workbench

The workbench (`src/core/ui/workbench.ts`) organizes existing language tools
without changing Lambda behavior.

- **Header**: File, Examples, Run, View, and More menus. **Settings** contains
  theme, renderer, perspective, and autosave controls.
- **Blocks**: searchable, categorized toolbox with click and drag insertion.
- **Inspector**: Code, Types (including typing derivation), and Outline.
- **Bottom panel**: Problems, Output, and Semantics. Semantics contains
  Call-by-Structure, Call-by-Value, CEK machine, and Lockstep views.
- **Perspectives**: Edit, Debug, Type Analysis, Presentation, and Custom.
  Presentation is **F11** and restores the previous layout when closed.
- **Persistence**: layout, theme, renderer, autosave interval, inspector view,
  and active bottom view are restored defensively from browser storage.
- **Keyboard**: `Ctrl+N` new, `Ctrl+O` open, `Ctrl+S` save, `Ctrl+B` Blocks,
  `Ctrl+Alt+C` Code/Inspector, `Ctrl+J` bottom panel, `Ctrl+Shift+B` refresh,
  `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo, **F1** command palette, and **F11**
  presentation.

## Semantics & steppers

Beyond the one-shot reduction views, the visualization dock gives the language a
*small-step* operational semantics you can drive by hand. **Call-by-Structure
(CbS) is the language's default evaluation strategy**, as in Block-based-MNL: the
Call-by-Structure tab and stepper strategy are the defaults, runtime value
comments evaluate under CbS, and the machine tab runs CbS. As in MNL, neither
strategy reduces under a binder — a lambda is a value; its body is reduced only
after an application substitutes the parameter.

- **Call-by-Structure** — β substitutes the *unevaluated argument's block
  structure* into every occurrence of the parameter as independent copies;
  each use-site then reduces its own copy, so duplicated work is visible as
  duplicated structure (`(λx. x + x) (3 * 7)` computes `3 * 7` twice).
- **Call-by-Value** — the argument is reduced to a value first, then
  substituted; the work is done once.
- **CEK machine** (`src/core/machine/csekMachine.ts`,
  `src/core/ui/csekPanel.ts`) — a pure `stepCsekMachine(state)` with control /
  environment / continuation. Under CbS the environment binds the argument as a
  *thunk* (block + env) and every variable lookup re-enters it — environment
  lookup is the lazy version of CbS's physical copying, so the machine fires
  the same salient rules in the same order as the substitution trace. The tab
  is labeled **CEK** (control, environment, kontinuation; no store); like
  MNL's machine tab it has no per-tab strategy switch — it runs the language
  default (CbS); the module keeps its historical `csek` name. Load / Back /
  Step / Play; `step` is pure, so Back is exact time travel.
- **Lockstep** (`src/core/ui/visualizationPanel.ts`, `buildLockstep`) — MNL-style
  correspondence: every substitution reduction frame is paired with the CEK
  machine state that has "caught up" to it, with a `syncCount` of matched salient
  rules and a `diverged` flag. Works under either strategy (the Lockstep tab
  keeps its CbS/CbV switch, defaulting to CbS). The tab sits after the CEK
  machine tab, as in MNL.

### Why "step N" differs between the CEK machine and the substitution trace

The CEK machine tab and the substitution/lockstep view report different "step"
numbers on the same term. They measure different things, at different granularities.

- The **CEK machine**'s `state.stepCount` counts *every* transition
  (`csekMachine.ts`: `stepCount: previous.stepCount + 1`), including the
  *administrative* steps a human rarely names — environment lookups, pushing and
  popping continuation frames, descending into a sub-term, returning a value.
  **One button press = one machine transition.**
- The **substitution reduction trace** counts only *salient* reductions — `beta`,
  `if-true`/`if-false`, and primitive `prim …` steps (`isSalientRule` in
  `csekMachine.ts`). These are the human-visible redexes. The lockstep pairing
  advances the machine in bulk between salient rules, so the bookkeeping
  transitions in between still increment `machine.stepCount` but do not add a
  reduction frame.

So for one visible reduction frame the machine takes several micro-steps, and the
machine's step count is the larger number — even though both reach the same normal
form. The `syncCount` counter confirms the two agree on the salient trace.

## Tests

`npm test` compiles the headless suites (`tsconfig.test.json`) and runs them
under node, no browser required. Every pipeline pass has a **value-preservation
oracle** — a tiny interpreter for that stage's IR, checked against the
substitution stepper for every pinned case and every shipped example under
**both** strategies.

- `tests/roundtrip.ts` — block → text → block round-trips for the
  parser/generator pair.
- `tests/semantics.ts` — strategy/machine correspondence: substitution under
  CbS/CbV and the CEK machine under both strategies reach the same final value,
  and salient rules match in order (the lockstep invariant). Pins CbS's
  duplicated-work signature (two `prim *` for `(λx. x + x) (3 * 7)` vs one under
  CbV) and no-reduction-under-a-binder.
- `tests/anf.ts`, `tests/freeVars.ts`, `tests/closure.ts`, `tests/fir.ts` —
  each Phase-1/2 lowering pass preserves values.
- `tests/cfg.ts` — the CFG interpreter matches substitution (explicit control +
  heap + the two-object closure layout).
- `tests/ssa.ts` — the SSA verifier accepts every corpus CFG and **rejects**
  three hand-built malformed ones (it has teeth).
- `tests/asm.ts` — instruction selection + register allocation preserve values;
  a hand-built high-pressure function forces spilling correctly.
- `tests/vm.ts` — the shipped `stepVm` matches substitution; `syncCount` equals
  the CEK salient-rule count; **exact time travel** (a step never mutates an
  earlier snapshot); O(1) tail calls; encode/decode round-trips.
- **`tests/crosscheck.ts`** — the capstone: for every program × strategy,
  `substitution ≡ CEK ≡ bytecode` (the bytecode run through `decode(encode(…))`).
  This one test guards the whole compiler.
- `tests/layoutState.ts` — the persisted workbench layout degrades malformed
  payloads to `DEFAULT_IDE_LAYOUT`.
- `tests/blockColors.ts` — grammatical block-color classification.

Individual suites: `npm run test:<name>` (e.g. `test:crosscheck`, `test:vm`,
`test:semantics`). UI panels are verified separately by driving the app in a
headless browser (Playwright, `npm run test:ui`).

## Project structure

```text
src/
  index.html            page shell
  assets/
    images/             logos, favicons, PWA icon
    css/                tokens.css · styles.css · examples.css
    js/                 block_lambda.ts (webpack entry)
  core/
    blocks/             custom Lambda Blockly blocks
    parser/             Lambda text -> workspace state
    generator/          blocks -> Lambda text / typing derivation
    type-inference/     Hindley-Milner inference + scheduling driver
    semantics/          Term model + substitution stepper (reference semantics)
    machine/            CEK abstract machine (reference semantics)
    ir/                 the lowering pipeline: Core -> ... -> bytecode + the VM
    renderer/           Tude renderer, theme, toolbox
    examples/           built-in example workspaces
    ui/                 workbench shell, inspector panels, semantics dock
tests/                  headless test suites (npm test)
Documentations/         Architecture.md, runbooks, UI-refactor notes
docs/                   published webpack build output
```

**See [`Documentations/Architecture.md`](Documentations/Architecture.md)** for
the full design: the front-end, the two reference semantics, the nine-stage
lowering pipeline (Term → Core → ANF → Closure IR → First-order IR → CFG → SSA →
register assembly → bytecode), the register VM, and a file-by-file module map.

## Install

```bash
npm install
```

`package-lock.json` was removed from this branch because it still pinned Blockly 11. Run `npm install` once after checkout to regenerate a fresh lockfile for Blockly 12.

## Run in development

```bash
npm run dev
```

or:

```bash
npm run serve
```

The dev server opens the IDE at:

```text
http://localhost:8080
```

## Build

```bash
npm run build
```

The production output is generated in `docs/`, with the main bundle named:

```text
block_lambda.js
```

## Type check

```bash
npm run typecheck
```

## Type inference behavior

The type-inference module lives in `src/core/type-inference/lambdaTypeInference.ts`. It infers a type for every connected Lambda term block on each code refresh and workspace change. The right-hand code panel includes top-level type comments, for example:

```text
-- Type: 'a -> 'a
lambda x. x
```

The type vocabulary is intentionally small: `int`, `bool`, type variables such as `'a`, and function types. Recursive `letrec` bindings are inferred monomorphically, which is enough for examples such as standard factorial.

Because `int` is the only numeric type, `÷` is **integer division**: it truncates
toward zero (`7 / 2` is `3`, `(0 - 7) / 2` is `-3`), so a well-typed `int` term
always evaluates to an integer. Division by zero yields `0`, which keeps the
result an `int` rather than producing `Infinity`/`NaN`.

Every Lambda term block receives a native Blockly comment icon. Opening that comment shows a pretty-printed report with the block kind, inferred type, reduced value, status, and local type issues when they exist. The **Add Type Comments** button can be used to force-refresh those comment reports.

## Built-in examples

Use **Examples -> Identity Function** to load the polymorphic identity abstraction:

```text
λx. x
```

The inferred type is `'a -> 'a`.

Use **Examples -> Standard Factorial 5** to load a ready-made recursive factorial workspace. The example uses the standard definition:

```text
letrec factorial = λn. if n = 0 then 1 else n * factorial (n - 1) in factorial 5
```

The recursive evaluator reduces the application to `120`.

## Main files

For the complete, explained design see
[`Documentations/Architecture.md`](Documentations/Architecture.md); the map
below is the quick index.

### Shell & assets

- `src/index.html` — page shell for the IDE.
- `src/assets/js/block_lambda.ts` — webpack entry; wires the workspace, panels,
  and the Inspector "Lowering" render cascade.
- `src/assets/css/tokens.css` — design tokens (colors, spacing, fonts).
- `src/assets/css/styles.css` — full IDE styling.
- `src/assets/css/examples.css` — examples menu and submenu styling.

### Front-end (author, type, mirror to text)

- `src/core/blocks/lambdaBlocks.ts` — custom Lambda Calculus Blockly blocks.
- `src/core/parser/lambdaTextParser.ts` — Lambda text → workspace state.
- `src/core/generator/lambdaGenerator.ts` — block-to-text generator with
  optional type annotations (`lambdaTermText.ts` is the inline form).
- `src/core/generator/lambdaFormalGenerator.ts` — typing-derivation renderer.
- `src/core/type-inference/lambdaTypeInference.ts` — Hindley-Milner-style type
  inference for Lambda blocks (`inferenceDriver.ts` schedules it incrementally).
- `src/core/examples/lambdaExamples.ts` — built-in example workspaces and loader.

### Reference semantics (two independent evaluators)

- `src/core/semantics/lambdaReduction.ts` — `Term` model, `blockToTerm`, and the
  substitution stepper (`computeReductionRun`) — the reference spec.
- `src/core/machine/csekMachine.ts` — the pure CEK machine (`stepCsekMachine`),
  environment-machine semantics that walks the block tree.

### Lowering pipeline (`src/core/ir/`) — Term → bytecode

- `provenance.ts`, `types.ts`, `freshNames.ts` — shared infrastructure
  (block-traceability, the one `IRType`, deterministic fresh names).
- `core.ts` / `desugar.ts` — Core IR + `Term → Core`.
- `anf.ts` / `toAnf.ts` — A-normal form + `Core → ANF` (the CbS/CbV split).
- `freeVars.ts` — free-variable capture analysis.
- `clos.ts` / `closureConvert.ts` — Closure IR + type-preserving closure
  conversion (`⟦A→B⟧ = ∃γ. (…) × γ`).
- `fir.ts` / `liftFunctions.ts` — First-order IR + lambda lifting.
- `lir.ts` / `toCfg.ts` — CFG over virtual registers + explicit control/heap.
- `ssa.ts` — dominance-based SSA verifier + φ-node projection.
- `isa.ts` / `toAsm.ts` — the permanent register ISA + instruction selection
  and linear-scan register allocation.
- `encode.ts` — fixed-width bytecode encoder/decoder.
- `vm.ts` — the register bytecode VM: a pure `stepVm(state)` (exact time travel).
- `prettyPrinters.ts` — `{ html, text }` printers for every stage.
- `closureCards.ts` — capture-map model for the Closures tab.

### UI

- `src/core/ui/workbench.ts` — workbench shell: activity bar, perspectives,
  command palette, bottom tabs, diagnostics, status bar.
- `src/core/ui/layout.ts` / `layoutState.ts` — hide/show/resize behavior and
  validated, persisted layout state.
- `src/core/ui/visualizationPanel.ts` — bottom Semantics dock (CbS/CbV/CEK/
  Lockstep tabs); `buildLockstep` renders the three-way correspondence.
- `src/core/ui/csekPanel.ts` — CEK machine tab (**C** control, **E**
  environment, **K** kontinuation).
- `src/core/ui/closuresPanel.ts` — Closures Inspector tab (capture cards).
- `src/core/ui/cfgPanel.ts` — CFG Inspector tab (blocks + SVG-edge diagram).
- `src/core/ui/machineCodePanel.ts` — Machine-code tab (hex + Run + correctness
  badge).
- `src/core/ui/blockHighlight.ts` — shared block cross-highlighter used by the
  Closures and CFG panels.
- `src/core/ui/typeInfoPopup.ts` — per-block type/value comment reports.
- `src/core/ui/contextMenus.ts`, `evaluationDriver.ts`, `screenshot.ts` —
  right-click semantics views, change-driven evaluation, canvas export.
- `src/core/renderer/tude.ts` — custom Zelos-based square-corner renderer;
  `theme.ts` (grammatical block colors), `toolbox.ts` (searchable toolbox).

## Logo assets

- `src/assets/images/favicon.ico`
- `src/assets/images/favicon.svg`
- `src/assets/images/favicon.png`
- `src/assets/images/pwa-512.png`
- `src/assets/images/logo.svg`
- `src/assets/images/logo-light.svg`
- `src/assets/images/logo-dark.svg`
- `src/assets/images/logo-with-text.svg`
- `src/assets/images/logo-with-text-light.svg`
- `src/assets/images/logo-with-text-dark.svg`
- `src/assets/images/navbar-logo.svg`
- `src/assets/images/navbar-logo-light.svg`
- `src/assets/images/navbar-logo-dark.svg`

## Notes

The custom Tude renderer keeps Blockly connections while using square,
text-like Lambda block geometry. The toolbox supports click and drag insertion.
