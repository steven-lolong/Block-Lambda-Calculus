# Block Lambda Calculus IDE

A TypeScript + npm + webpack web project for **Block Lambda**, a block-based IDE for Lambda Calculus.

## Features

- Web-based block IDE with three columns:
  - left collapsible Blockly toolbox,
  - middle Blockly workspace,
  - right generated text-code panel.
- Hide/show toolbox panel.
- Hide/show generated-code panel.
- Resizable right code panel.
- Custom Lambda Calculus blocks:
  - variable,
  - abstraction,
  - application,
  - parentheses,
  - let binding,
  - number,
  - boolean,
  - numeric operator,
  - boolean operator,
  - if/then/else conditional.
- Hindley–Milner-style type inference for Lambda blocks:
  - fresh type variables for lambda parameters,
  - function-type inference for abstraction and application,
  - let-polymorphism through generalized type schemes,
  - `Number` and `Bool` checking for literals, operators, equality, and conditionals,
  - Blockly warning bubbles for type errors and missing inputs,
  - generated-code type comments for top-level terms.
- Generated Lambda Calculus text code with syntax highlighting.
- Stable three-column IDE design with polished neon-glass colors.
- Catppuccin Macchiato-inspired color system with soft, eye-catching accents.
- Responsive top menu with grouped file, view, workspace, and theme actions.
- Searchable custom toolbox.
- Theme-aware Blockly colors while preserving the current Blockly renderer/shape style.
- Manual `.blc` workspace save/load plus local autosave recovery.
- Logo, favicon, dark/light variants, and 512×512 PWA icon.
- Webpack output bundle name: `block_lambda.js`.

## Project structure

```text
src/
  assets/
    images/
    css/
    js/
  core/
    blocks/
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

The production output is generated in `dist/`, with the main bundle named:

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
λx. x
```

The **Add Type Comments** button writes the inferred type and reduced value into each Lambda term block comment. Ill-typed blocks receive Blockly warning bubbles that explain the local type error.

## Main files

- `src/index.html` — page shell for the IDE.
- `src/assets/js/block_lambda.ts` — webpack entry script.
- `src/assets/css/styles.css` — full IDE styling.
- `src/core/blocks/lambdaBlocks.ts` — custom Lambda Calculus Blockly blocks.
- `src/core/generator/lambdaGenerator.ts` — block-to-text generator with optional type annotations.
- `src/core/type-inference/lambdaTypeInference.ts` — Hindley–Milner-style type inference for Lambda blocks.
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

The toolbox is implemented as a custom collapsible left panel. Clicking or dragging a block in the toolbox creates the corresponding Blockly block in the center workspace. The UI uses a neon-glass dark-first design, but the Blockly renderer remains the existing `zelos` renderer so the block render/shape style stays consistent.

## UI Design Update

The IDE keeps the stable three-column application shell and applies a more polished color and menu system:

- Catppuccin Macchiato-inspired palette with soft violet, blue, teal, green, amber, and rose accents.
- Cleaner icon-based top menu grouped by File, View, Workspace, and Theme actions.
- Left toolbox with search, color-coded categories, and drag/click block insertion.
- Middle Workspace panel with a persistent file-aware title.
- Right generated-code panel with line numbers and theme-aware syntax highlighting.
- Bottom status bar with autosave indicator, user-configurable autosave interval, block count, tip text, version, and theme-aware logo.
- Blockly remains on the current renderer (`zelos`); only the UI colors and block theme colors were updated.
