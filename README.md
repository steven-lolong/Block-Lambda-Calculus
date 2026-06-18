# Block Lambda Calculus IDE

A TypeScript + npm + webpack web project for **Block Lambda**, a block-based IDE for Lambda Calculus.

## Features

- Web-based block IDE with three columns:
  - left collapsible Blockly toolbox,
  - middle Blockly workspace,
  - right generated text-code panel.
- Hide/show toolbox panel with automatic Blockly workspace resize.
- Hide/show generated-code panel with automatic Blockly workspace resize.
- Resizable right code panel.
- Light, dark, and system theme modes.
- Drag-and-drop block creation from the toolbox into the workspace.
- Save workspace to a `.blc` file and load a `.blc` file from disk.
- Automatic local browser autosave for recovery when the user forgets to save manually.
- Load Autosave action to restore the latest local browser backup.
- About menu item with a modal dialog for project information.
- Clear Workspace button that removes all blocks and refreshes generated code.
- Custom Lambda Calculus blocks:
  - variable,
  - abstraction,
  - application,
  - parentheses,
  - let binding,
  - number,
  - boolean.
- Generated Lambda Calculus text code.
- Black, gray, and white visual design.
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

## Main files

- `src/index.html` — page shell for the IDE.
- `src/assets/js/block_lambda.ts` — webpack entry script.
- `src/assets/css/styles.css` — full IDE styling.
- `src/core/blocks/lambdaBlocks.ts` — custom Lambda Calculus Blockly blocks.
- `src/core/generator/lambdaGenerator.ts` — block-to-text generator.
- `src/core/renderer/toolbox.ts` — collapsible toolbox renderer with click and drag/drop insertion.
- `src/core/ui/layout.ts` — hide/show, theme switching, `.blc` file actions, local autosave recovery, About modal, clear workspace, and automatic Blockly resize behavior.

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

The toolbox is implemented as a custom collapsible left panel. Users can either click a block card or drag it into the workspace. The workspace uses a `ResizeObserver` and resize callbacks after panel toggles, right-panel dragging, theme changes, and browser resizing so Blockly fits the middle column automatically.

## Workspace persistence

- **Save** exports the current Blockly serialization state to a `.blc` file.
- **Load File** imports a previously saved `.blc` file from disk.
- **Autosave** writes the latest workspace state to browser `localStorage` after edits.
- **Load Autosave** restores the most recent local browser autosave from the same browser/device.

