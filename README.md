# Block Lambda Calculus IDE

A TypeScript + npm + webpack web project for **Block Lambda**, a block-based IDE for Lambda Calculus.

## Features

- Web-based block IDE with three columns:
  - left collapsible Blockly toolbox,
  - middle Blockly workspace,
  - right generated text-code panel.
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
  - numeric operator,
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
- Stable three-column IDE design with polished neon-glass colors.
- Catppuccin Macchiato-inspired color system with soft, eye-catching accents.
- Responsive top menu with grouped file, example, workspace, and theme actions.
- Searchable custom toolbox.
- Theme-aware Blockly colors with the Tude square-corner block shape style.
- Manual `.blc` workspace save/load plus local autosave recovery.
- Logo, favicon, dark/light variants, and 512x512 PWA icon.
- Webpack output bundle name: `block_lambda.js`.

## Semantics & steppers

Beyond the one-shot reduction views, the visualization dock gives the language a
*small-step* operational semantics you can drive by hand:

- **CSEK machine** (`src/core/machine/csekMachine.ts`,
  `src/core/ui/csekPanel.ts`) — a pure `stepCsekMachine(state)` with control /
  environment / continuation, for both call-by-value and call-by-name
  strategies. Load / Back / Step / Play; `step` is pure, so Back is exact time
  travel.
- **Lockstep** (`src/core/ui/visualizationPanel.ts`, `buildLockstep`) — MNL-style
  correspondence: every substitution reduction frame is paired with the CSEK
  machine state that has "caught up" to it, with a `syncCount` of matched salient
  rules and a `diverged` flag.

### Why "step N" differs between the CSEK machine and the substitution trace

The CSEK machine tab and the substitution/lockstep view report different "step"
numbers on the same term. They measure different things, at different granularities.

- The **CSEK machine**'s `state.stepCount` counts *every* transition
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

## Project structure

```text
src/
  assets/
    images/
    css/
    js/
  core/
    blocks/
    examples/
    generator/
    renderer/
    semantics/
    type-inference/
    ui/
```

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

- `src/index.html` — page shell for the IDE.
- `src/assets/js/block_lambda.ts` — webpack entry script.
- `src/assets/css/styles.css` — full IDE styling.
- `src/assets/css/examples.css` — examples menu and submenu styling.
- `src/core/blocks/lambdaBlocks.ts` — custom Lambda Calculus Blockly blocks.
- `src/core/examples/lambdaExamples.ts` — built-in example workspace definitions and loader.
- `src/core/generator/lambdaGenerator.ts` — block-to-text generator with optional type annotations.
- `src/core/type-inference/lambdaTypeInference.ts` — Hindley-Milner-style type inference for Lambda blocks.
- `src/core/ui/typeInfoPopup.ts` — Blockly comment report generation for per-block type/value information.
- `src/core/renderer/tude.ts` — custom Zelos-based square-corner Blockly renderer.
- `src/core/renderer/toolbox.ts` — collapsible toolbox renderer.
- `src/core/ui/layout.ts` — hide/show and resize UI behavior.

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

The toolbox is implemented as a custom collapsible left panel. Clicking or dragging a block in the toolbox creates the corresponding Blockly block in the center workspace. The UI uses a neon-glass dark-first design, and the Blockly workspace uses the custom `tude` renderer so Lambda blocks keep Blockly connections while using square, text-like block geometry.

## UI Design Update

The IDE keeps the stable three-column application shell and applies a more polished color and menu system:

- Catppuccin Macchiato-inspired palette with soft violet, blue, teal, green, amber, and rose accents.
- Cleaner icon-based top menu grouped by File, Examples, Workspace, and Theme actions.
- Left toolbox with search, color-coded categories, and drag/click block insertion.
- Middle Workspace panel with a persistent file-aware title.
- Right generated-code panel with line numbers and theme-aware syntax highlighting.
- Bottom status bar with autosave indicator, user-configurable autosave interval, block count, tip text, version, and theme-aware logo.
- Blockly now uses the custom `tude` renderer for square-corner, text-like blocks while preserving the existing Block Lambda theme colors.
