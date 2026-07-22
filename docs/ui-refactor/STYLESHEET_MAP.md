# Stylesheet Map

## Scope

This is the post-consolidation map of the Block Lambda workbench cascade. It documents architecture; it does not propose a redesign. The MiniJava sources named in the original brief are not present in this repository.

## Authoritative import order

`src/assets/js/block_lambda.ts` is the sole source-controlled CSS entry point. The existing webpack `style-loader`/`css-loader` chain remains in use.

| Order | Source | Responsibility |
| --- | --- | --- |
| 1 | `src/assets/css/tokens.css` | Authoritative dark values, light-theme overrides, typography, density, controls, icons, radii, elevation, panel dimensions, z-index layers, and breakpoint registry |
| 2 | `src/assets/css/styles.css` | Global behavior, workbench shell, panels, Blockly compatibility, editor/inspector/formal output, runtime tools, status, dialogs, print, and responsive layout |
| 3 | `src/assets/css/examples.css` | Examples/renderer submenus and the generated custom toolbox |
| Runtime | Blockly package styles | Upstream widget/workspace presentation overridden only where compatibility requires it |
| Runtime | `#tude-renderer-style` from `src/core/renderer/tude.ts` | Connector-path joins and square Blockly field geometry; unchanged |
| Property level | Inline custom properties | Persisted/resized panel dimensions, outline depth, drag position, and runtime geometry |

There are no stylesheet links in `src/index.html`. Generated `docs/` assets are not an editing source. Playwright directs its webpack output to `/tmp/block-lambda-playwright-build` so test startup cannot clean tracked documentation.

## File responsibilities

### `tokens.css`: the only value layer

All source-controlled color literals live here. Dark is the default `:root` value set; `html[data-theme='light']` overrides only theme-dependent values. Groups are:

- Application, activity, sidebar, panel, raised, recessed, workspace, toolbar, header, hover, selection, and code surfaces.
- Default/strong borders and primary/secondary/muted/code/on-accent text.
- Product accent, selection, focus, success, warning, error, information, and execution state.
- Six grammar families: Variables, Abstraction, Application, Let Binding, Operators, and Literals.
- Blockly fields/widgets and code syntax.
- UI/monospace families, sizes, 400/500/600/700 weights, and line heights.
- Spacing, control heights, icon sizes, radii, shadows, and layers.
- Panel dimensions, grid/backdrop/status/print values, and a breakpoint registry.

The remaining `--ide-*` names are layout integration contracts read or written by TypeScript. They are not visual compatibility aliases.

### `styles.css`: core workbench layer

The core layer contains reset/focus/hidden behavior; header and menus; grid, panels and resizers; sidebar tools; Blockly surface compatibility; code, inspector, outline and formal output; bottom runtime views; status/dialogs/context menu; print; responsive rules; and reduced-motion behavior. It consumes tokens and no longer owns theme values.

### `examples.css`: toolbox/examples feature layer

This file owns examples and Blockly-renderer submenus plus toolbox categories, grammar markers, cards, search-empty and drag states. Its 900px submenu rule remains coordinated with `styles.css`. The filename is retained for import stability.

### Runtime Tude style

`registerTudeRenderer()` still injects `#tude-renderer-style`. Its rules and all TypeScript Blockly theme/connector mappings are unchanged. Scoping it differently would be renderer behavior work, not stylesheet consolidation.

## Legacy-versus-override consolidation

| Previous conflict | Authoritative result |
| --- | --- |
| Theme values and component rules shared `styles.css` | Theme values live only in `tokens.css`; component files only consume them |
| `--ide-*`, generic aliases, Catppuccin names, component aliases and direct colors overlapped | One semantic namespace; unused compatibility aliases were removed rather than chained |
| Separate dark/light grid selector bodies | One rule consumes `--workspace-grid-line` |
| Status colors bypassed the theme layer | One rule consumes status tokens |
| Fallback context-menu presentation existed inline and in `!important` CSS | Fixed presentation is CSS-only; TypeScript retains creation, position and events |
| Two adjacent 1240px media blocks | One block, with declaration order preserved |
| `#app`-qualified presentation/maximize selectors | `.app-shell` state selectors retain identity with lower specificity |

There is no legacy stylesheet, separate workbench skin, or temporary alias layer after consolidation.

## Duplicate and layered selectors

No exact selector is duplicated between `styles.css` and `examples.css`. These within-file repetitions are intentional state/responsive layers:

| Family | Reason |
| --- | --- |
| `:root` | Default dimensions plus 1240px and 620px dimension overrides |
| `.ide-grid` and hidden-state variants | Desktop columns become overlay-drawer layout at 1240px |
| `.toolbox-panel`, `.code-panel` | Grid panels, then 1240px absolute drawers, then phone widths |
| Header/menu/command selectors | Desktop header becomes a 900px responsive drawer |
| `.viz-dock[data-open][data-maximized]` | Desktop bottom panel becomes a 620px fixed drawer |
| Stepper/machine selectors | Horizontal tools stack on phones |
| `.example-submenu` | Desktop absolute submenu becomes fixed at 900px |
| Formal-output selectors | Screen presentation is intentionally overridden for print |

Shared button resets followed by component rules are also intentional, not contradictory copies.

## Specificity contracts

| Contract | Classification |
| --- | --- |
| `[hidden] { display:none !important }` beats component display | Functional; preserve exactly |
| `.app-shell.code-maximized` and `.app-shell.presentation-mode` control grid visibility | Functional state; identity must remain |
| The 1240px `.ide-grid` state group makes sidebar/code mutually exclusive drawers | Responsive behavior; preserve |
| Restored inline panel dimensions beat responsive/default variables | Persistence behavior; preserve |
| Local Blockly text/field rules beat upstream Blockly CSS | Renderer compatibility; preserve |
| Specialized active stepper/machine hosts beat generic active hosts | Runtime layout; preserve |
| `.code-output.formal-output` beats the base output rule | Formal and print presentation; preserve |

## Remaining `!important`

Only functional or upstream-compatibility declarations remain:

- `[hidden]` visibility.
- Blockly SVG text stroke/paint and field-text fill.
- Print-mode hidden chrome and visible formal `#codeOutput`.
- Universal reduced-motion enforcement.

The fallback context menu no longer needs any `!important` declaration.

## Design-token structure

### Surfaces, borders and text

`--surface-app`, `--surface-activity`, `--surface-sidebar`, `--surface-panel`, `--surface-raised`, `--surface-recessed`, `--surface-workspace`, `--surface-code`, `--surface-toolbar`, `--surface-header`, `--surface-hover`, `--surface-selection`; `--border-default`, `--border-strong`; `--text-primary`, `--text-secondary`, `--text-muted`, `--text-code`, `--text-on-accent`.

### Accent, interaction and semantics

`--accent-primary`, `--accent-primary-hover`, `--selection-fill`, `--selection-wash`, `--focus-ring`; `--state-success`, `--state-warning`, `--state-error`, `--state-error-wash`, `--state-info`, `--state-execution`; and six `--category-*` grammar tokens.

### Typography and density

`--font-ui`, `--font-mono`; `--font-size-2xs` through `--font-size-xl`; regular/medium/semibold/bold weight tokens; tight/normal/relaxed/code line heights; `--space-0` through `--space-10`; small/medium/large control and icon sizes.

### Shape, dimensions and layers

Panel/control/overlay radii; overlay/mobile-panel shadows; content/resizer/panel/header/drawer/menu/submenu/drag/context-menu layers; viewport/header/status/activity/sidebar/code/bottom-panel dimensions. Runtime-only `--resize-handle-left` and `--outline-depth` remain local.

## Hard-coded values after consolidation

### Colors

There are no hex or `rgb()/rgba()` literals in `styles.css` or `examples.css`. Theme palettes, translucent washes, print colors, workspace grid, backdrops, status values and shadows are all in `tokens.css`.

Blockly block/theme colors remain concrete values in `block_lambda.ts`, as required. Moving them would change renderer and grammatical color behavior.

### Spacing and geometry

Repeated font sizes, weights, line heights, common gaps, simple padding, control heights, icon sizes, shadows and layer values now consume scales. Component geometry remains literal when it encodes a specific layout: menu/palette widths, editor gutter, resize targets, workspace minimums and phone offsets.

Tude connector dimensions remain independent TypeScript geometry because they encode grammatical connection shapes.

## Typography

- Global UI uses `--font-size-base` and the single `--font-ui` stack; code, generated output, technical labels, values, and grammar data use `--font-mono` and `--line-height-code`.
- The restrained 10/11/12/13/14/16px scale replaces the former 8–13px default scale. Small labels now start at 11px and normal controls at 13px.
- Section labels and controls use semantic size and only 400/500/600/700 weight tokens. General section and toolbox labels are sentence case; mathematical/source notation remains unchanged.
- Blockly’s theme font data remains unchanged in TypeScript.

No webfont is imported; existing system fallbacks remain.

## Icons and controls

`src/index.html` owns a small, inline SVG symbol sprite. `styles.css` provides the shared 16px `.app-icon` presentation; the inspector empty state deliberately uses the 24px token. The generated toolbox uses the same symbols through `createIcon()` in `src/core/renderer/toolbox.ts`.

- No icon package was added. The sprite covers navigation, file, workspace, execution, status, theme, dialog, and toolbar symbols.
- Presentation glyphs and letter badges were removed from application chrome. Lambda, turnstile, operators, and other notation inside source, grammar, type, and semantic content remain domain data.
- `.primary-button`, `.secondary-button`, `.quiet-button`, and `.small-button` now share control height, padding, weight, disabled, hover, and focus behavior. Icon-only controls retain accessible names and browser-native title tooltips.

## Responsive breakpoints

| Breakpoint | Preserved behavior |
| --- | --- |
| 1240px in CSS and `COMPACT_LAYOUT_QUERY` | Sidebar/code drawers, hidden resizers, reduced header density |
| 900px in both component stylesheets | Header drawer and fixed menu/submenu overlays |
| 780px in `layout.ts` only | Code-panel phone focus/scroll timing |
| 620px in `styles.css` | Phone dimensions, reduced controls/status, full drawers, fixed bottom panel |
| Print | Formal derivation isolation |
| Reduced motion | Motion and smooth-scroll suppression |

No breakpoint or responsive implementation changed. Breakpoint tokens are documentary because custom properties cannot be used in native media conditions.

## Candidate files for later consolidation

| Candidate | Possible later change | Risk |
| --- | --- | --- |
| `styles.css` | Split Blockly compatibility and print into ordered feature files | High: source order/upstream markup |
| `examples.css` | Rename to describe toolbox plus examples | Medium: import identity only |
| `tude.ts` runtime style | Scope rules to Tude | Very high: current alternate-renderer geometry |
| `block_lambda.ts` theme literals | Add a typed Blockly palette aligned with shell semantics | Very high: concrete runtime API and block meaning |

## Highest-risk dependencies

1. Desktop state classes combined with the 1240px drawer cascade.
2. `#vizDock[data-open][data-maximized]` across desktop and 620px fixed positioning.
3. Blockly text/field compatibility plus unscoped Tude geometry.
4. `[hidden] !important` combined with TypeScript `.hidden` updates.
5. Persisted inline panel dimensions overriding token defaults.
