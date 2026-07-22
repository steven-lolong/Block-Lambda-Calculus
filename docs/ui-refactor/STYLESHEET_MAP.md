# Stylesheet Map

## Scope

The requested MiniJava stylesheet stack is not present. The actual Block Lambda entry point imports two source stylesheets and installs one renderer style at runtime. Blockly also injects/ships its own component styles. This document maps the current cascade only; it does not propose or apply a redesign.

## Import and cascade order

| Source-controlled order | Source | How it enters the page | Responsibility | Notes |
| --- | --- | --- | --- | --- |
| 1 | `src/assets/css/styles.css` | First CSS import in `src/assets/js/block_lambda.ts`; webpack `style-loader`/`css-loader` | Tokens, global reset, complete workbench shell, Blockly overrides, inspector/formal output, bottom runtime views, status, dialogs, print, responsive rules | 1,539 lines; primary and compatibility rules are mixed |
| 2 | `src/assets/css/examples.css` | Second CSS import in `block_lambda.ts` | Examples/renderer submenus and generated custom toolbox | Loaded after `styles.css`; no exact selector duplicates across the two files were found |
| 3 | Runtime `#tude-renderer-style` | `registerTudeRenderer()` appends a `<style>` to `document.head` | Mitered Blockly paths and square field rectangles | Appended during application initialization; rules are not scoped to `html[data-blockly-renderer='tude']` and therefore affect Zelos/Thrasos too |
| Property-level override | Element inline styles | TypeScript, notably fallback context menu, drag ghost, resize variables, outline depth, runtime heights/widths | Dynamic geometry and state | Inline custom properties beat stylesheet `:root` declarations; CSS `!important` is used to beat some inline context-menu declarations |

Blockly’s own component styles are an additional upstream/runtime layer created by the package and `Blockly.inject`. Their exact DOM insertion point is library-version dependent, so they are not assigned a fixed order number here. Local selectors and `!important` declarations are intentionally competing with that layer.

There are no `<link rel="stylesheet">` elements in `src/index.html`. The effective order depends on webpack module evaluation and runtime style injection; generated `docs/` assets are not an editing source.

## File responsibilities

### `src/assets/css/styles.css`

The file contains, in order:

1. Dark-theme design tokens and compatibility aliases.
2. Light-theme token overrides.
3. Global reset, focus, `hidden`, and visually-hidden behavior.
4. Header/menu/quick-action/theme controls.
5. Main grid, activity bar, panel state classes, resizers.
6. Contextual sidebar, diagnostics, Run, Settings.
7. Blockly workspace surface and upstream Blockly overrides.
8. Right code editor, inspector, outline, formal derivation, and print mode.
9. Bottom panel, Problems/Output/Types, traces, Lockstep, and CEK views.
10. Status bar, palette, dialogs, and context-menu overrides.
11. Responsive rules at 1240px, 900px, and 620px; reduced-motion rules.

It is simultaneously the base stylesheet, workbench stylesheet, Blockly override layer, print stylesheet, and responsive override layer.

### `src/assets/css/examples.css`

Despite its name, this file owns two features:

- Examples and Blockly-renderer submenus.
- Custom toolbox categories, cards, category colors, search-empty state, drag states, and the submenu’s 900px responsive position.

It is a feature stylesheet, not a pure examples stylesheet. It depends entirely on tokens declared earlier in `styles.css`.

### Runtime `src/core/renderer/tude.ts` style

The injected style forces miter/butt joins on `.blocklyPath*` and zero `rx`/`ry` on Blockly editable/non-editable field rectangles. The geometry provider itself also defines square reporter/socket/notch behavior in TypeScript. The CSS is guarded by the exact ID `tude-renderer-style`.

Because the selectors are global, selecting Zelos or Thrasos changes the renderer implementation but does not remove these square field/path CSS overrides. Any future scoping correction is a renderer behavior change and needs visual/connection regression tests.

## Legacy and override layers

| Requested concept | Current finding |
| --- | --- |
| Legacy stylesheet | There is no explicitly named legacy stylesheet. Compatibility is embedded in `styles.css` through alias tokens (`--toolbox-width`, `--panel-bg`, `--ctp-*`, and others) and broad Blockly selectors. Treat these regions as the de facto legacy compatibility layer. |
| Workbench override stylesheet | There is no separate workbench override file. `styles.css` is the workbench implementation and also contains base/global rules. |
| Feature override stylesheet | `examples.css` is loaded later and is the only separate feature layer. It does not currently override exact selectors from `styles.css`. |
| Renderer override stylesheet | Tude’s runtime `<style>` is the latest stylesheet layer; Blockly component rules in `styles.css` also use `!important`. |

Do not delete compatibility aliases merely because their newer `--ide-*` source token exists; current Blockly, visualization, or feature rules still consume many aliases.

## Duplicate selectors

An automated leaf-rule scan found no exact selector occurring in both `styles.css` and `examples.css`. Duplicates within a file are mainly base-plus-responsive/state overrides, but they still make consolidation risky.

### Intentional base/responsive repeats in `styles.css`

| Selector/family | Occurrences | Purpose / conflict potential |
| --- | --- | --- |
| `:root` | Base, ≤1240px, ≤620px | Defines global layout tokens; responsive values may lose to TypeScript inline custom properties |
| `.ide-grid` and hidden-state variants | Desktop base and ≤1240px | Desktop columns become a workspace-only grid under overlay mode |
| `.toolbox-panel`, `.code-panel` | Base grid panels, ≤1240px absolute drawers, ≤620px phone widths | High-risk responsive cascade |
| `.sidebar-resize-handle`, `.resize-handle` | Base geometry and ≤1240px `display:none` | Must stay coordinated with JS media query |
| `.topbar-actions`, `.menu-bar`, `.menu-toggle`, `.app-menu-popup` | Base and ≤900px | Header converts to a responsive drawer/menu overlay |
| `.viz-dock`, `.viz-dock[data-open='true']` | Desktop base, ≤1240px margin, ≤620px fixed drawer | High-risk bottom-panel cascade |
| `.brand`, `.command-trigger`, `.quick-actions` | Base plus 1240/900/620 reductions | Intentional progressive disclosure |
| `.stepper-body`, `.machine-body`, `.stepper-machine` | Base horizontal layout plus ≤620px stacked layout | Runtime responsive behavior |
| `.status-line`, `.status-version`, `.autosave-interval-control` | Base plus phone hiding/reduction | Status-bar prioritization |
| `.formal-issues`, `body.printing-derivation .legend-lambda`, formal rule labels | Base and print rules | Print cascade intentionally overrides screen presentation |

There are two separate adjacent `@media (max-width: 1240px)` blocks. They share a breakpoint but split token/header changes from overlay layout; this is not a functional conflict, though it increases migration surface.

### Repeated grouped selectors

- Button classes first appear in reset groups and later in their component rules. Examples include `.app-menu-trigger`, `.menu-command`, `.sidebar-command`, `.sidebar-footer-command`, `.run-command`, and `.settings-option`.
- `.toolbox-block-card.is-pointer-ready` and `.is-dragging` appear in both the selected/hover visual group and the grabbing-cursor group.
- `.example-submenu` has a base rule and a 900px fixed-position override.
- Blockly inputs appear in several groups that separately remove text effects, set field colors, and set widget foreground/background.

These are layered declarations, not currently redundant copies that can be deleted without comparing computed style.

## Specificity and cascade conflicts

| Conflict | Current winner/behavior | Risk |
| --- | --- | --- |
| `[hidden] { display:none !important; }` versus component `display` rules | `hidden` always wins | Essential to tabs, menus, badges, and conditional controls; replacing it can expose inactive content |
| `#app.code-maximized …` and `#app.presentation-mode …` versus ordinary panel/grid selectors | ID-qualified state rules win | High specificity makes local overrides ineffective and couples state to the `app` root |
| ≤1240px `.ide-grid, .toolbox-hidden .ide-grid, …` group versus desktop hidden-state grid layouts | Responsive rule makes every variant workspace-only; actual drawer visibility comes from panel display/state | Changing order can show competing overlays or reserve wrong columns |
| Responsive `:root { --ide-primary-sidebar-width:260px; --ide-code-panel-width:390px; }` versus inline values set by `layout.ts` | Inline custom properties set from persisted layout win after initialization | Responsive width defaults may not take effect for initialized users; do not “fix” during a visual-only change |
| Inline fallback-context-menu styles versus `.block-lambda-context-menu* !important` | CSS `!important` wins selected properties; pointer enter/leave still mutate inline background | Two styling sources can diverge and make token changes appear inconsistent |
| Blockly upstream rules versus `.blocklySvg`/field rules in `styles.css` | Local `!important` wins text stroke/fill; other fields depend on source order/specificity | Blockly upgrades can change markup or require stronger selectors |
| Blockly renderer output versus runtime Tude style | Runtime style is later and unscoped | Zelos/Thrasos still receive square joins/field rectangles |
| `.viz-host[data-active='true'] { display:block }` versus `.stepper-host[data-active='true'], .machine-host[data-active='true'] { display:flex }` | Later, equally/more specific specialized rule wins | Necessary for runtime flex layouts |
| `.code-output.formal-output` versus `.code-output` | Compound class changes typography/flow | Removing `formal-output` breaks derivation presentation and print |
| `html[data-theme='light']` token overrides versus direct hard-coded colors | Direct colors remain unchanged across themes | Status bar, Blockly widgets, print, overlays, and grid have separate hard-coded behavior |

## `!important` declarations

| Selector | Declaration purpose | Classification |
| --- | --- | --- |
| `[hidden]` | Force hidden elements out of layout | Functional; must retain equivalent behavior |
| `.blocklySvg text`, `.blocklyFlyoutLabelText` | Remove stroke, stroke width, and paint-order effects | Blockly compatibility/legibility |
| `.blocklyLabelField > .blocklyFieldText`, `.blocklyInputField > .blocklyFieldText` | Force label/input text fill | Blockly theme override |
| Print-mode hidden chrome group | Force header/panels/status out of derivation print | Functional print isolation |
| Print-mode `#codeOutput` | Force formal output visible | Functional print isolation |
| `.block-lambda-context-menu` | Override inline/Blockly menu color, border, radius, background, shadow, and backdrop filter | Conflict workaround |
| `.block-lambda-context-menu-item` | Override inline color/radius/font | Conflict workaround |
| Reduced-motion universal selector | Collapse transitions/animations and disable smooth scroll | Accessibility requirement |

The context-menu `!important` rules are the clearest candidate for later consolidation because the same component is also styled inline. Do not remove them until the inline source is migrated and fallback/native menu visuals are tested.

## Existing design tokens

### Layout and geometry

- `--viewport-height`
- `--ide-activity-bar-width`, `--ide-primary-sidebar-width`, `--ide-code-panel-width`, `--ide-bottom-panel-height`
- `--ide-status-bar-height`, `--ide-header-height`, `--ide-panel-header-height`
- `--radius-panel`, `--radius-control`, `--radius-overlay`
- Runtime-only `--resize-handle-left` and `--outline-depth`

### Shell surfaces and borders

- `--ide-shell-bg`, `--ide-activity-bg`, `--ide-sidebar-bg`, `--ide-panel-bg`, `--ide-surface-raised`
- `--ide-workspace-bg`, `--ide-toolbar-bg`, `--ide-header-bg`, `--ide-input-bg`
- `--ide-hover-bg`, `--ide-active-bg`, `--ide-border`, `--ide-border-strong`

### Text and semantic colors

- `--ide-text`, `--ide-text-muted`, `--ide-text-disabled`
- `--ide-accent`, `--ide-accent-hover`
- `--ide-success`, `--ide-warning`, `--ide-error`, `--ide-info`
- `--ide-focus-ring`, `--overlay-shadow`
- `--syntax-terminal`, `--syntax-nonterminal`, `--syntax-comment`, `--syntax-hole`

### Blockly and component tokens

- `--block-label-text`, `--block-field-bg`, `--block-field-text`, `--block-field-border`
- `--toolbox-bg`, `--toolbox-fg`, `--toolbox-muted`, `--toolbox-card-bg`, `--toolbox-card-fg`, `--toolbox-card-description`
- `--code-panel-bg`, `--code-output-bg`, `--code-output-fg`, `--code-status-bg`
- Compatibility aliases including `--toolbox-width`, `--code-panel-width`, `--viz-height`, `--statusbar-height`, `--panel-*`, `--workspace-bg`, `--text-*`, `--accent-*`, `--button-*`, `--primary-button-*`, `--border`, `--panel`, `--positive`, `--negative`, and `--warning`
- Category palette `--ctp-pink`, `--ctp-mauve`, `--ctp-red`, `--ctp-peach`, `--ctp-yellow`, `--ctp-green`, `--ctp-teal`, `--ctp-sky`, `--ctp-blue`, `--ctp-lavender` plus Catppuccin compatibility aliases

### Typography

- `--font-ui`: `Inter, Geist, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- `--font-mono`: `"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace`

No webfont is imported, so Inter/Geist/JetBrains Mono are used only when installed locally; otherwise the fallback stack applies.

There is no general spacing scale token. Most padding, gap, icon size, control height, and component width values are hard-coded.

## Hard-coded colors

### Token definitions

The dark and light palettes are literal hex/rgba values in the two token blocks. That is appropriate for token definitions, but several overlapping color namespaces exist: `--ide-*`, `--accent-*`, `--ctp-*`, and compatibility aliases.

### Direct CSS colors outside tokens

| Area | Values | Notes |
| --- | --- | --- |
| Workspace grid | `rgba(145,154,168,.08)` dark and `rgba(80,91,108,.08)` light in two `linear-gradient`s | Existing decorative/functional grid; future constraints call for subtle removal/review, not an untested change |
| Blockly widgets | `#16191f`, `#fff`; drag overlay `rgba(91,141,239,.08)` | Bypasses theme tokens |
| Selection/diagnostic washes | `rgba(91,141,239,.28)`, `rgba(240,93,94,.08)` | Semantic but not tokenized |
| Print | `#fff`, `#000`, `#555` | Intentional print-safe palette |
| Status bar | `rgba(255,255,255,.88)`, `#285ea8`, light `#2d66b1`, `#8ce99a`, white alpha hover/background | Separate branded palette outside `--ide-*` |
| Dialog backdrops | `rgba(7,9,12,.52/.55)` | Two near-duplicate values |
| Phone bottom shadow | `rgba(0,0,0,.28)` | Functional overlay shadow |
| Generic white foreground | `#fff` on badges/buttons/range accent | Repeated direct value |

### TypeScript-owned visual colors

`block_lambda.ts` defines both Blockly themes in TypeScript: seven style families × primary/secondary/tertiary colors plus workspace, toolbox, flyout, scrollbar, insertion marker, cursor, and marker colors. These values cannot be found or changed in the CSS token layer. Theme consolidation must account for this separate source.

## Hard-coded spacing and geometry

### Existing major tokens

Default shell geometry is tokenized: activity 50px, sidebar 276px, code 430px, bottom 272px, status 24px, header 42px, panel header 36px. Phone overrides activity/header/status to 46/40/23px.

### Untokenized recurring scale

Component rules repeatedly use 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16, and 24px for borders, gaps, padding, and offsets without named spacing tokens. Examples include:

- 28px header/menu/icon buttons; 46px activity buttons; 32–42px tabs/toolbox cards/settings rows.
- 8–12px common panel padding and 1–8px gaps.
- 10px desktop resize handles and 8px bottom resizer track.
- 360px/340px workspace minimums split between CSS and TypeScript.
- 238px menu width, 620px palette width, 520px dialog width, 430px palette-list height.
- Responsive drawer offsets of 24px/20px, header popup positions at 78px/82px, and bottom drawer capped at 58vh.
- Z-index values from 20 through 140, plus 9,999 drag ghost and 100,000 inline context menu.

Tude renderer geometry is another independent scale in TypeScript: 16px page gutter, 22×20 value sockets, 36×8 statement notch, 42px minimum block width, and 8/12/16px renderer padding. These are semantic renderer constants and are not candidates for generic spacing-token replacement.

## Typography definitions and conflicts

| Area | Current definition |
| --- | --- |
| Global UI | 13px `--font-ui` |
| Menus/controls | Mostly 10–12px UI text |
| Code/editor/output | 9–12px `--font-mono`; Lambda editor line-height 1.6 |
| Blockly theme | `Inter, Geist, system-ui, sans-serif`, weight 600, size 9.75, defined in TypeScript |
| Formal derivation | Mixed UI/mono, usually 9–11px |
| Status bar | 10px UI |
| Dialogs | 11–16px UI, mono filename input |

Weights 400/500/600/700 fit the target constraints, but the current styles also use:

- `650` on brand, panel headings, toolbox category headings, formal headings, and machine section titles.
- `550` on palette labels.
- `900` on `.cek-letter`.

These are visual debt to address during the later refactor; changing them is not part of this mapping step.

## Responsive breakpoints

| Breakpoint/source | Behavior |
| --- | --- |
| `max-width:1240px` in CSS and `COMPACT_LAYOUT_QUERY` in `layout.ts` | Sidebar/code become mutually exclusive absolute drawers; resizers hide; header/status density reduces |
| `max-width:900px` in both stylesheets | Header actions become a drawer; menus/submenus become fixed; autosave interval/viz info hide |
| `max-width:780px` in `layout.ts` only | Phone-specific code-panel scroll/focus timing; there is no matching CSS media block |
| `max-width:620px` in `styles.css` | Phone dimensions, hidden workspace controls, full drawer widths, fixed/maximized bottom panel, compressed status/tabs |
| `@media print` | Formal derivation only |
| `prefers-reduced-motion:reduce` | Disables motion and smooth scrolling |

The 1240px value is duplicated between CSS and TypeScript and must remain synchronized. The 780px behavior exists only in TypeScript. `examples.css` and `styles.css` both use 900px and must remain synchronized.

## Candidate files for later consolidation

These are candidates only after responsive, visual, renderer, print, and accessibility regression tests exist:

| Candidate | Consolidation opportunity | Risk |
| --- | --- | --- |
| `styles.css` token/compatibility region | Separate canonical tokens from compatibility aliases, while retaining alias names | High: all surfaces depend on them |
| `styles.css` Blockly section | Isolate upstream Blockly overrides from workbench shell rules | Very high: Blockly markup/version specificity |
| `styles.css` print section | Move to an explicit print layer/file without changing load order | High: print uses `!important` and DOM measurement |
| `styles.css` responsive tail | Co-locate duplicate 1240px blocks and document shared TS breakpoints | Very high: drawers currently lack browser tests |
| `examples.css` | Rename or merge by responsibility because it also owns the toolbox | Medium: loaded order and generated class selectors |
| `tude.ts` runtime style | Scope to the Tude renderer or move to a renderer stylesheet | Very high: current global behavior may be relied upon by alternate renderers |
| `block_lambda.ts` Blockly theme literals | Move semantic theme values into a dedicated typed theme module aligned with shell tokens | Very high: Blockly API needs concrete values at runtime |
| `contextMenus.ts` inline styles plus `styles.css !important` rules | Establish one source of truth | High: fallback menu behavior and Blockly/native menu parity |

No consolidation should occur as unrelated cleanup during the UI refactor. Each candidate needs a narrow diff and computed-style/browser coverage.

## Highest-risk stylesheet dependencies

1. The `toolbox-hidden`/`code-hidden`/`code-maximized`/`presentation-mode` selectors and their desktop-versus-1240px grid/drawer cascade.
2. `#vizDock[data-open][data-maximized]` across desktop and 620px fixed-drawer layouts.
3. Blockly overrides and the unscoped runtime Tude style, especially `!important` field text and connector/field geometry.
4. `[hidden] !important` plus TypeScript’s extensive `.hidden` property updates.
5. Print-mode `printing-derivation` selectors and the TypeScript measurement/rewrite sequence.
