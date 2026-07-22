# DOM Dependency Map

## Scope and classification rules

This map is based on `src/index.html` and the actual TypeScript entry point, `src/assets/js/block_lambda.ts`. The requested MiniJava entry point and `src/core/ui/app.ts` are absent from this checkout.

Classifications mean:

- **Must preserve exactly:** the literal selector, value vocabulary, storage key, or state mechanism is an active compatibility contract. Do not rename it during the visual refactor.
- **May move but must retain identity:** the element may change DOM position, but its ID/semantic identity and handler/ARIA contract must remain.
- **May rename after updating references and tests:** the name is internally queried but is not an externally mandated state contract. Rename only atomically with all TypeScript/CSS references and regression tests.
- **Presentation-only:** no production TypeScript query or state transition depends on it; it may change with markup/CSS, subject to accessibility and visual constraints.

The brief-supplied IDs `run-program`, `viz-dock`, `toolbox-column`, and `perspective-select` have no exact matches. Current equivalents are `data-bottom-tab` run dispatch, `#vizDock`, `#toolboxPanel`, and `#perspectiveSelect`. This mismatch must be resolved before a MiniJava release; it does not authorize renaming current IDs.

## Toolbox and workspace-toolbar refactor update

- `#toolboxPanel` now contains only `#sidebarTitle`, `#toggleToolboxPanel`, the Blocks `data-sidebar-view`, `#toolboxSearch`, and `#blockToolboxContent`. Its desktop resize handle and responsive drawer mechanics are unchanged.
- `#workspaceUndo`, `#workspaceRedo`, `#zoomOut`, `#zoomIn`, `#zoomFit`, and the labeled `.workspace-run-button[data-bottom-tab="machine"]` are the visible workspace toolbar commands. `#showToolboxFromWorkspace` and `#showCodeFromWorkspace` remain in the same toolbar as hidden responsive restore controls. `#zoomLabel` remains as a visually-hidden state/readout target.
- `#clearWorkspace` moved to Header → File; `#toggleVizDock` and `#presentationMode` moved to Header → View. Their IDs, click targets, ARIA state updates, and keyboard routes are unchanged.
- Settings controls moved to `#settingsDialog`, labelled by `#settingsDialogTitle` and opened by `#openSettings[data-activity="settings"]`; `#closeSettingsDialog` closes it and returns focus to its invoker. The existing theme, renderer, perspective, and autosave IDs remain unique.
- Legacy `files`, `problems`, `run`, and `settings` `data-sidebar-view` records and hidden `data-activity="files"`/`"run"` records remain as compatibility state. `workbench.ts` normalizes the visible activity to Blocks. `data-activity="problems"` opens the Problems bottom tab, `data-activity="run"` opens CEK, and `data-activity="settings"` opens Settings. No non-Blocks sidebar content is user-visible.

The brief also names a `bottom-maximized` state class that is absent in this checkout. The current live contract is `#vizDock[data-maximized="true"]`, backed by the persisted `bottomMaximized` field. Preserve that implementation and reserve the mandated class name for an explicit compatibility decision; do not silently substitute one contract for the other.

## Inspector and bottom-panel refactor update

- The right panel has one primary tablist (`.code-tabs`) for `#codeTargetCode`, `#codeTargetInspector` (labelled Types), and `#codeTargetOutline`. `#typesPane` is the panel controlled by the Types tab.
- Types has a secondary tablist (`.type-tabs`) for `#typeTargetOverview`/`#blockInspectorPane` and the retained `#codeTargetFormal`/`#codeOutput` pair. `#typesPanelSummary` and `#typesList` moved into the overview without changing identity or row behavior.
- The bottom panel has one primary tablist (`.viz-tabs`) for Problems, Output, and the static `#bottomTab-semantics`/`#semanticsViews` pair. `.semantics-tabs` is the secondary tablist for the existing `structure`, `value`, `machine`, and `stepper` kinds.
- `#bottomTab-types` and `#bottomPanel-types` remain runtime-assigned hidden compatibility identities. A delegated `data-bottom-tab="types"` route now opens Inspector → Types. A persisted legacy `bottomTab: "types"` is accepted but normalized to Inspector → Types with Bottom → Problems when the full workbench controller restores it.
- The selected specific semantic kind—not the outer Semantics label—continues to be stored in `bottomTab`. This preserves prior layout payloads and restores the same nested semantic view after reload.

## IDs queried by TypeScript

All IDs in this section are exact lookup strings or exact runtime-generated IDs. Their elements may move, but the identity must remain unless production references and browser regression tests are deliberately migrated.

| Area / owning module | Queried IDs | Classification | Dependency |
| --- | --- | --- | --- |
| Required at entry-point startup | `blocklyDiv`, `blockToolboxContent`, `codeOutput`, `lambdaEditorPane`, `lambdaEditor`, `lambdaEditorHighlight`, `lambdaEditorGutter`, `lambdaEditorStatus`, `statusLine`, `workspaceTitle`, `workspaceFileLabel`, `zoomLabel`, `blockCount`, `autosaveTime`, `autosaveInterval`, `autosaveIntervalLabel`, `examplesMenuButton`, `examplesSubMenu`, `blocklyThemeMenuButton`, `blocklyThemeSubMenu`, `topbarFileName`, `projectFileLabel`, `topSaveStatus`, `typesPane`, `typeTargetOverview`, `blockInspectorPane`, `blockInspectorEmpty`, `blockInspectorContent`, `inspectorBlockKind`, `inspectorBlockId`, `inspectorBlockTerm`, `inspectorBlockType`, `inspectorBlockStatus`, `inspectorBlockIssues`, `outlinePane`, `programOutline`, `printDerivation`, `copyCode`, `synchronizeCode` | May move but must retain identity | `requireElement` throws and aborts boot if any is missing |
| Entry-point dialogs | `saveNameDialog`, `saveNameInput`, `exampleLoadDialog`, `exampleLoadName` | May move but must retain identity | Save naming and example replace/merge promises read dialog return values |
| Shell/panel controller | `app`, `menuToggle`, `toggleToolboxPanel`, `showToolboxFromWorkspace`, `toggleCodePanel`, `maximizeCodePanel`, `showCodeFromWorkspace`, `refreshCode`, `clearWorkspace`, `saveWorkspace`, `loadWorkspace`, `loadAutosave`, `aboutApp`, `aboutDialog`, `closeAboutDialog`, `copyCode`, `themeToggle`, `codePanel`, `resizeHandle`, `sidebarResizeHandle`, `toolboxPanel`, `vizDock` | May move but must retain identity | Direct click/change handlers, state classes, resizers, ResizeObserver targets |
| Workbench/palette | `sidebarTitle`, `perspectiveSelect`, `statusPerspective`, `commandPalette`, `commandPaletteInput`, `commandPaletteList`, `commandPaletteTrigger`, `activityProblemCount`, `bottomProblemCount`, `statusProblemCount`, `statusProblemIcon`, `sidebarProblemsSummary`, `problemsPanelSummary`, `typesPanelSummary`, `problemsList`, `sidebarProblems`, `typesList`, `outputLog`, `presentationMode`, `undoWorkspace`, `redoWorkspace`, `workspaceUndo`, `workspaceRedo`, `zoomOut`, `zoomIn`, `zoomFit`, `synchronizeCode`, `toolboxSearch` | May move but must retain identity | Palette rendering, delegated commands, diagnostics, direct toolbar bindings |
| Bottom-panel shell | `vizDock`, `vizDockInfo`, `vizEmpty`, `vizRerun`, `vizArrange`, `vizCollapse`, `toggleVizDock`, `vizMaximize`, `vizResizer`, `bottomTab-semantics`, `semanticsViews` | May move but must retain identity | Visibility, active-tab tools, nested Semantics selection, resize/maximize state |
| Lockstep | `stepperWorkspace`, `stepperStatus`, `stepperAgree`, `stepperMachineStatus`, `stepperMachineEnv`, `stepperMachineKont`, `stepperBack`, `stepperStep`, `stepperPlay`, `stepperLoad`, `stepperStrategyStructure`, `stepperStrategyValue` | May move but must retain identity | Stepper state renderer and controls |
| CEK machine | `machineStatus`, `machineControl`, `machineEnv`, `machineKont`, `machineLoad`, `machineStep`, `machineBack`, `machinePlay` | May move but must retain identity | Machine transport, output, provenance rendering |
| Runtime-generated bottom ARIA IDs | `bottomTab-problems`, `bottomTab-output`, hidden compatibility `bottomTab-types`, `bottomTab-structure`, `bottomTab-value`, `bottomTab-machine`, `bottomTab-stepper`; matching `bottomPanel-*` | Must preserve exactly | Assigned at initialization and used in `aria-controls`/`aria-labelledby`; semantic kinds now live in the nested Semantics tablist |
| Runtime renderer style | `tude-renderer-style` | Must preserve exactly | Prevents duplicate renderer style insertion |

### HTML IDs not directly queried but semantically coupled

| IDs | Classification | Dependency |
| --- | --- | --- |
| `topbarActions`, `fileMenu`, `viewMenu`, `moreMenu` | May move but must retain identity | Targets of `menuToggle[aria-controls]` and the respective labelled application-menu triggers |
| `commandPaletteTitle`, `saveNameDialogTitle`, `exampleLoadDialogTitle`, `aboutDialogTitle` | May move but must retain identity | Dialog `aria-labelledby` relationships |
| `codeTargetCode`, `codeTargetFormal`, `codeTargetInspector`, `codeTargetOutline`, `typeTargetOverview`, `typesPane` | May move but must retain identity | Primary/secondary tab identity and panel `aria-labelledby`; `codeTarget*` buttons are also collected by `[data-code-target]` |
| `bottomTab-semantics`, `semanticsViews`, `selectedTypeHeading` | May move but must retain identity | Static outer Semantics tab/panel and selected-type section labelling |
| `blocklyArea` | May rename after updating references and tests | CSS/layout wrapper; the inner `blocklyDiv` is the behavioral mount |
| Count/status child IDs such as `activityProblemCount`, `bottomProblemCount`, `statusProblemIcon`, `statusProblemCount` | May move but must retain identity | Updated independently by diagnostics rendering |

## Classes queried or mutated by TypeScript

| Class/selector | Reader/writer | Classification | Why it matters |
| --- | --- | --- | --- |
| `toolbox-hidden`, `code-hidden`, `code-maximized`, `menu-open`, `presentation-mode` on `#app` | `layout.ts`, `workbench.ts` | Must preserve exactly | Primary layout state; CSS changes grid/drawers/visibility |
| `resizing-code-panel`, `resizing-sidebar` on `body` | `layout.ts` | Must preserve exactly | Drag state and cursor/user-selection CSS hooks |
| `printing-derivation` on `html` and `body` | `block_lambda.ts` | Must preserve exactly | Print media isolates and formats the formal derivation |
| `formal-output` on `#codeOutput` | `block_lambda.ts` | Must preserve exactly | Switches generated output to formal-derivation layout |
| `is-active` | `workbench.ts`, `visualizationPanel.ts` | Must preserve exactly | Activity/theme/stepper selected state; explicitly required by brief |
| `is-drag-over`, `is-pointer-ready`, `is-dragging`, `toolbox-drag-ghost` | `toolbox.ts` | Must preserve exactly | Pointer-drag lifecycle, hit feedback, and ghost behavior |
| `machine-provenance` | `csekPanel.ts` | Must preserve exactly | Identifies keyboard/clickable generated provenance rows |
| `.app-menu`, `.app-menu-trigger`, `.app-menu-popup` | `workbench.ts` | May rename after updating references and tests | Menu discovery, open/close, focus, Arrow navigation |
| `.activity-button[data-activity]`, `[data-sidebar-view]` | `workbench.ts` | Must preserve exactly | Activity selection and delegated view switching |
| `.code-tabs` | `block_lambda.ts` | May rename after updating references and tests | Root for Arrow/Home/End tab keyboard handler |
| `.type-tabs` | `block_lambda.ts` | May rename after updating references and tests | Root for Arrow/Home/End navigation between Inferred types and Typing derivation |
| `.viz-tabs`, `.viz-tab[data-kind]`, `.viz-host[data-kind]` | `visualizationPanel.ts` | Must preserve exactly | Primary bottom keyboard root plus compatibility lookup and active-host routing |
| `.semantics-tabs` | `visualizationPanel.ts` | Must preserve exactly | Root for Arrow/Home/End navigation among semantic/runtime views |
| `.activity-bar`, `.ide-grid`, `.workspace-panel`, `.toolbox-panel`, `.code-panel`, `.topbar`, `.topbar-actions`, `.app-shell`, `.statusbar`, `.viz-dock` | `layout.ts` | May rename after updating references and tests | Resize observation, transition filtering, geometry, drawer boundaries; state variants remain exact |
| `.workspace-panel`, `.blocklySvg`, `.blockly-canvas` | `toolbox.ts` | May rename after updating references and tests | Drag/drop hit testing and drop-surface lookup |
| `.custom-toolbox-list`, `.toolbox-category`, `.toolbox-block-card` | `block_lambda.ts`, `toolbox.ts` | May rename after updating references and tests | Toolbox regeneration and search filtering |
| `.block-lambda-context-menu`, `.block-lambda-context-menu-item` | `contextMenus.ts` and CSS | May rename after updating references and tests | Fallback context menu creation/styling |
| `legend.legend-lambda`, `fieldset.fieldset-lambda` | `block_lambda.ts` | Must preserve exactly | Print layout temporarily measures and rewrites formal derivations |
| `[role="menuitem"]`, `[role="menuitem"]:not([disabled])` | `workbench.ts` | Must preserve exactly | Menu focus and Arrow navigation |
| `[aria-selected="true"]` | `workbench.ts` | Must preserve exactly | Palette scroll-to-current behavior |
| `[aria-hidden="true"]` inside `copyCode` | `layout.ts` | May rename after updating references and tests | Temporary copy-success icon mutation |
| `[data-id]` on Blockly SVG blocks | `contextMenus.ts` | Must preserve exactly | Maps fallback context-menu events back to a Blockly block ID; owned by Blockly |
| `style` elements in `document.head` | `screenshot.ts` | Must preserve exactly as a query behavior | Screenshot export inlines Blockly-related runtime styles |

Purely decorative classes such as `brand-copy`, `code-tab-icon`, `viz-tab-icon`, `control-separator`, `status-brand`, and most layout typography helpers are **Presentation-only** unless they also appear in the table above. They may be renamed with their HTML/CSS together.

## Behaviorally queried `data-*` attributes

| Attribute and value vocabulary | Classification | Consumer / effect |
| --- | --- | --- |
| `data-command-target`: `clearWorkspace`, `loadWorkspace`, `saveWorkspace`, `loadAutosave`, `undoWorkspace`, `redoWorkspace` | Must preserve exactly | Document-level click delegation forwards to the element whose ID matches the value |
| `data-panel-command`: `sidebar`, `code`, `bottom` | Must preserve exactly | Document-level View-menu routing |
| `data-activity`: `blocks`, `files`, `problems`, `run`, `settings` | Must preserve exactly | Activity/status routing and selected-state rendering |
| `data-sidebar-view`: same five values | Must preserve exactly | Blocks is the only visible toolbox view; the remaining values persist as hidden compatibility state for existing layout payloads and diagnostics bindings |
| `data-bottom-tab`: `problems`, `output`, `types`, `structure`, `value`, `machine`, `stepper` | Must preserve exactly | Delegated commands open the matching bottom view; `types` is a compatibility route to Inspector → Types |
| `data-kind`: same seven retained kinds on `.viz-tab`/`.viz-host` | Must preserve exactly | Active tab/host lookup and dispatch; `types` is hidden compatibility identity and the four runtime kinds are nested under Semantics |
| `data-code-target`: `code`, `formal`, `inspector`, `outline` | Must preserve exactly | Right-panel tab collection, dispatch, visibility, output mode |
| `data-perspective`: `edit`, `debug`, `types`, `presentation` | Must preserve exactly | Delegated preset application |
| `data-theme-mode`: `dark`, `light` | Must preserve exactly | Delegated explicit theme selection |
| `data-blockly-renderer`: `tude`, `zelos`, `thrasos` | Must preserve exactly | Renderer selection and checked-state synchronization |
| `data-example-id`: all 12 `LambdaExampleId` values | Must preserve exactly | Example menu loader validates against `LAMBDA_EXAMPLES` |
| `data-open` and `data-maximized` on `#vizDock` | Must preserve exactly | Bottom visibility/maximization state and CSS |
| `data-active` on `.viz-host` | Must preserve exactly | Displays only the active bottom host |
| `data-state`: `pending`, `saved`, `error`, `ok`, `stale`, `done`, `sync`, `diverged` as applicable | Must preserve exactly | Semantic status colors and status rendering |
| `data-raw-code` on `#codeOutput` | Must preserve exactly | Clipboard source and generated/raw output handoff |
| `data-block-id` on generated problem/outline rows | Must preserve exactly | Block focus/navigation metadata |
| `data-block-type` on toolbox cards | Must preserve exactly | Block creation and search haystack |
| `data-category` on toolbox categories | May rename after updating references and tests | Category-specific styling; category names are generated from toolbox definitions |
| `data-tone`: `info`, `success`, `warning`, `error` | Must preserve exactly | Output log semantic coloring |
| `data-provenance-id` | Must preserve exactly | Runtime provenance identity |
| `data-theme` and `data-blockly-renderer` on `html` | Must preserve exactly | Theme/renderer CSS and runtime theme selection |

## ARIA and semantic relationships

| Relationship/state | Elements | Classification | Dependency |
| --- | --- | --- | --- |
| Compact menu ownership | `menuToggle[aria-controls="topbarActions"]`, `aria-expanded` | Must preserve exactly | Accessible drawer state mirrors `menu-open` |
| Examples submenu | `examplesMenuButton[aria-controls="examplesSubMenu"]`, `aria-haspopup="menu"`, `aria-expanded` | Must preserve exactly | Direct menu open/close state |
| Renderer submenu | `blocklyThemeMenuButton[aria-controls="blocklyThemeSubMenu"]`, `aria-haspopup`, `aria-expanded`; renderer items use `role="menuitemradio"`/`aria-checked` | Must preserve exactly | Selection and menu semantics |
| Command palette | trigger controls `commandPalette`; dialog labelled by `commandPaletteTitle`; input controls `commandPaletteList`; list uses `role="listbox"`, generated buttons use `role="option"`/`aria-selected` | Must preserve exactly | Keyboard/focus and screen-reader model |
| Primary inspector tabs | `codeTargetCode`, `codeTargetInspector`, and `codeTargetOutline` use `role="tab"`, `aria-controls`, `aria-selected`; their panels use `role="tabpanel"`, `aria-labelledby` | Must preserve exactly | Roving focus and Code/Types/Outline identity |
| Types tabs | `typeTargetOverview` controls/labels `blockInspectorPane`; retained `codeTargetFormal` controls/labels `codeOutput` | Must preserve exactly | Nested roving focus and static-versus-formal type view identity |
| Primary bottom tabs | runtime Problems/Output tabs plus `bottomTab-semantics`/`semanticsViews` use `role="tab"`/`tabpanel`, `aria-controls`, `aria-labelledby`, `aria-selected` | Must preserve exactly | Roving focus among Problems, Output, and Semantics |
| Semantics tabs | runtime `bottomTab-structure`, `-value`, `-machine`, `-stepper` control/label their `bottomPanel-*` hosts | Must preserve exactly | Nested roving focus and specific semantic/runtime view identity |
| Dialog labels | Save, example-load, About, and Settings dialogs reference their title IDs; Settings returns focus to its invoker | Must preserve exactly | Native dialog accessible name and keyboard return path |
| Resizers | `sidebarResizeHandle`, `resizeHandle`: vertical separator; `vizResizer`: horizontal separator; desktop instances are focusable with value min/max/now, while drawer-mode instances use `tabindex="-1"` and `aria-disabled="true"` | Must preserve exactly | Keyboard resize and announced value; drawer mode must not retain an active resizer |
| Toggle state | activity/theme buttons and panel/maximize controls update `aria-pressed`; renderer items update `aria-checked` | Must preserve exactly | State is not conveyed by color alone |
| Live regions | `statusLine`, `lambdaEditorStatus`, `sidebarProblems`, `outputLog`, `vizDockInfo`, `stepperStatus`, `stepperAgree`, `machineStatus`, file/status fields | Must preserve exactly | Async feedback and diagnostics announcements |
| Outline | `programOutline[role="tree"]`; generated items carry `role="treeitem"` and `aria-level` | Must preserve exactly | Program-structure navigation semantics |
| Runtime provenance | generated elements use `role="button"`, `tabIndex=0`, Enter/Space | Must preserve exactly | Keyboard equivalent to click |

## Event binding and delegation roots

| Root | Events / selectors | Classification | Risk if moved or replaced |
| --- | --- | --- | --- |
| `document` in `workbench.ts` | Delegated `click` for `[data-activity]`, `[data-command-target]`, `[data-panel-command]`, `[data-bottom-tab]`, `[data-perspective]`, `[data-theme-mode]`; global `keydown` for shortcuts/Escape | Must preserve exactly as behavior | Moving an action outside the document is impossible, but changing attributes silently disables it; duplicate handlers can double-fire |
| Each `.app-menu` | Trigger `click`/ArrowDown and popup ArrowUp/ArrowDown | May rename after updating references and tests | Menu focus/open behavior depends on trigger/popup descendants |
| `.code-tabs` | `keydown` ArrowLeft/Right/Home/End | May rename after updating references and tests | Moving tabs outside the root loses keyboard navigation |
| `.type-tabs` | `keydown` ArrowLeft/Right/Home/End | May rename after updating references and tests | Same for the nested Types tabs |
| `.viz-tabs` | `keydown` ArrowLeft/Right/Home/End | Must preserve exactly | Same for primary bottom tabs |
| `.semantics-tabs` | `keydown` ArrowLeft/Right/Home/End | Must preserve exactly | Same for nested semantic/runtime tabs |
| `document` in example/renderer installers | Outside-click close and Escape close | Must preserve exactly as behavior | Rebinding can interfere with general menu closure |
| `document` in context fallback | Capture-phase `pointerdown` and Escape | Must preserve exactly as behavior | Required to dismiss the fallback menu safely |
| Blockly injection SVG/div | `contextmenu` capture for fallback | Must preserve exactly as behavior | Target replacement requires reinstalling bridge |
| Toolbox card | `pointerdown`, `click`; temporary window `pointermove`/`pointerup`/`pointercancel` | Must preserve exactly as behavior | Pointer capture and duplicate click suppression are coordinated |
| `window` | resize, orientation, visualViewport resize/scroll, pointer drag completion, blur, custom `block-lambda:*` events | Must preserve exactly as behavior | Layout, menu dismissal, and cross-module coordination |
| `window` custom-event bus | `block-lambda:refresh-code`, `block-lambda:theme-changed`, `block-lambda:layout-resized`, `block-lambda:layout-state-changed`, `block-lambda:context-menu-action` | Must preserve exactly | These names coordinate otherwise separate entry-point, layout, workbench, renderer-workspace disposal, and fallback-context-menu code |
| Main Blockly workspace | change listeners for inference, autosave, inspector selection, CEK/stepper stale state | Must preserve exactly as behavior | Renderer reinjection must reinstall workspace-bound listeners |

## Resize handles and responsive drawers

| Item | Classification | Coupling |
| --- | --- | --- |
| `sidebarResizeHandle` | May move but must retain identity | Pointer capture; ArrowLeft/Right; 240–380 persisted width; hidden, `tabindex=-1`, and `aria-disabled=true` at ≤1240px |
| `resizeHandle` | May move but must retain identity | Pointer capture; reversed ArrowLeft/Right direction; 320–760 width plus live workspace minimum; hidden, `tabindex=-1`, and `aria-disabled=true` at ≤1240px |
| `vizResizer` | May move but must retain identity | Pointer drag; ArrowUp/Down; 180px–72vh live range; manual resize clears maximized state; hidden, `tabindex=-1`, and `aria-disabled=true` in the ≤620px bottom drawer |
| `toolboxPanel` left drawer | May move but must retain identity | Desktop grid column; absolute overlay at ≤1240px; full-width beside activity bar at ≤620px |
| `codePanel` right drawer | May move but must retain identity | Desktop grid column; absolute overlay at ≤1240px; phone restore scroll/focus at ≤780px |
| `topbarActions` header drawer | May move but must retain identity | Hidden/displayed by `.menu-open` at ≤900px; menu popups become fixed |
| `vizDock` bottom drawer | May move but must retain identity | Grid row on desktop; fixed bottom overlay at ≤620px; `data-open` and `data-maximized` |
| `showToolboxFromWorkspace`, `showCodeFromWorkspace` | May move but must retain identity | Responsive restoration affordances whose hidden/disabled/ARIA states are rendered by TypeScript |

The UI smoke suite covers the approved 1920×1080, 1440×900, 1280×800, 1024×768, 768×1024, and 390×844 matrix, including compact drawer dismissal and resizer deactivation. Keep that coverage when changing these implementations.

## Perspective-dependent elements

| Perspective | Activity/sidebar | Code panel | Bottom panel | CSS/state | Classification |
| --- | --- | --- | --- | --- | --- |
| `edit` | `blocks`, visible | visible, not maximized | hidden; stored tab set to `problems` | `perspective=edit` | Must preserve exactly |
| `debug` | `blocks`, visible | visible, not maximized | visible on `stepper` | `perspective=debug` | Must preserve exactly |
| `types` | `blocks`, visible | visible, not maximized on Inspector → Types | visible on `problems` | `perspective=types` | Must preserve exactly |
| `presentation` | retains activity identity but sidebar hidden | hidden | hidden | `#app.presentation-mode`; previous full layout retained in memory | Must preserve exactly |
| `custom` | current manual state | current manual state | current manual state | persisted whenever a panel is manually changed; also Presentation restore target | Must preserve exactly |

`perspectiveSelect`, `statusPerspective`, `presentationMode`, `.activity-button[data-activity]`, `[data-sidebar-view]`, `toolbox-hidden`, `code-hidden`, `code-maximized`, `#vizDock[data-open]`, and active bottom-tab state all participate in applying or rendering a perspective.

The `bottomTab` storage field deliberately retains the prior seven-value vocabulary. `structure`, `value`, `machine`, and `stepper` restore the matching nested Semantics tab. Legacy `types` is still parsed by `layoutState.ts`; the workbench normalizes it to right-side Types and bottom Problems rather than exposing a duplicate visible Types panel.

## Persisted UI-state keys

| Key | Payload | Classification |
| --- | --- | --- |
| `block-lambda-ide-layout-v2` | `activity`, `sidebarVisible`, `sidebarWidth`, `codeVisible`, `codeWidth`, `codeMaximized`, `bottomVisible`, `bottomHeight`, `bottomTab`, `bottomMaximized`, `perspective` | Must preserve exactly; migrate only with versioned tests |
| `block-lambda-theme-mode` | `light` or `dark` | Must preserve exactly |
| `block-lambda-blockly-renderer` | `tude`, `zelos`, `thrasos` | Must preserve exactly |
| `block-lambda-active-inspector-target` | `code`, `inspector`, `outline`, `formal`; invalid values fall back to `code` | Must preserve exactly |
| `block-lambda-autosave-workspace` | Serialized Blockly workspace JSON | Must preserve exactly |
| `block-lambda-autosave-time` | ISO timestamp | Must preserve exactly |
| `block-lambda-autosave-interval-minutes` | Integer clamped to 2–20 | Must preserve exactly |

The CSS custom properties `--ide-primary-sidebar-width`, `--ide-code-panel-width`, `--ide-bottom-panel-height`, `--viewport-height`, and grid-local `--resize-handle-left` are runtime layout channels and are also **Must preserve exactly** until TypeScript and CSS are migrated together.

## CSS selectors coupled to state

| Selector family | Classification | State dependency |
| --- | --- | --- |
| `[hidden] { display:none !important; }` | Must preserve exactly | TypeScript relies heavily on the `hidden` property across tabs, menus, badges, and actions |
| `html[data-theme='light']`, `html[data-blockly-renderer='…']` | Must preserve exactly | Theme/renderer variants |
| `.toolbox-hidden .ide-grid`, `.code-hidden .ide-grid`, `.toolbox-hidden.code-hidden .ide-grid` and panel/handle descendants | Must preserve exactly | Desktop grid and visibility |
| `#app.presentation-mode …`, `.presentation-mode .viz-dock` | Must preserve exactly | Presentation perspective |
| `#app.code-maximized …` | Must preserve exactly | Right-panel maximization |
| `.menu-open .topbar-actions` | Must preserve exactly | Compact header drawer |
| `.viz-dock[data-open='true']`, `.viz-dock[data-maximized='true']` | Must preserve exactly | Bottom panel and phone drawer |
| `.viz-host[data-active='true']`, `.stepper-host[data-active='true']`, `.machine-host[data-active='true']` | Must preserve exactly | Active bottom content |
| `.semantics-region`, `.semantics-body`, `.types-pane`, `.types-pane-body` | May rename after updating references and tests | Establish containing blocks for nested absolute hosts and nested inspector panels |
| `.activity-button[aria-pressed='true']`, `.code-tab[aria-selected='true']`, `.type-tab[aria-selected='true']`, `.viz-tab[aria-selected='true']`, `.settings-option[aria-checked='true']`, `.icon-button[aria-pressed='true']` | Must preserve exactly | Accessible selected/toggled state styling |
| `[data-state='pending'\|'error'\|'ok'\|'stale'\|'done'\|'sync'\|'diverged']`, `[data-tone='success'\|'warning'\|'error']` | Must preserve exactly | Semantic feedback |
| `.printing-derivation …` and `@media print` | Must preserve exactly | Derivation-only printing |
| `.resizing-code-panel`, `.resizing-sidebar` | Must preserve exactly | Resize cursor/selection behavior |
| `.is-drag-over`, `.is-pointer-ready`, `.is-dragging`, `.toolbox-drag-ghost` | Must preserve exactly | Custom toolbox drag state |
| Hover-only, spacing, icon, and typography selectors with no TypeScript/state reference | Presentation-only | Visual treatment only |

## Selectors whose removal would break functionality

The most immediately destructive removals are:

1. Any directly queried ID in the first table, especially the startup `requireElement` set.
2. `[data-command-target]`, `[data-panel-command]`, `[data-activity]`, `[data-bottom-tab]`, `[data-code-target]`, `[data-perspective]`, `[data-blockly-renderer]`, and `[data-example-id]`.
3. `toolbox-hidden`, `code-hidden`, `code-maximized`, `presentation-mode`, `menu-open`, and `#vizDock[data-open]/[data-maximized]`.
4. `.viz-tab[data-kind]`/`.viz-host[data-kind]`, `.code-tabs`, `.type-tabs`, `.viz-tabs`, `.semantics-tabs`, and `.activity-button[data-activity]`.
5. The ARIA-linked tab/panel and dialog-title IDs, runtime `bottomTab-*`/`bottomPanel-*`, and separator roles/value attributes.
6. `.workspace-panel`, `.blocklySvg`, `.blockly-canvas`, `.toolbox-block-card[data-block-type]`, and Blockly’s `[data-id]`, because custom block drag/drop and context lookup depend on them.
