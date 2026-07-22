# UI Refactoring Constraints

## Status, scope, and source-of-truth warning

This document is the contract for a visual and information-architecture refactor. It does not authorize a language rewrite, changes to Blockly serialization, or changes to runtime semantics.

The checked-out repository is **Block Lambda Calculus**, a block-based simply typed/Hindley–Milner-style Lambda Calculus workbench. It is not currently a Block-MiniJava repository: production names, block types, file types, examples, type inference, and runtime tools all use Lambda terminology. The desired quiet, domain-specific workbench direction applies, but a future implementation must not relabel Lambda behavior as MiniJava or invent MiniJava grammar. Before implementation begins, confirm whether this repository is the intended target or whether the work belongs on a MiniJava branch/repository. Until that is resolved, the checked-in Lambda grammar and semantics are authoritative.

The audit basis is the source under `src/`, not the generated webpack artifacts under `docs/`. `docs/index.html` and `docs/block_lambda.js` are build output and must not be edited by hand.

## 1. Refactoring goals

1. Preserve all existing Block-MiniJava functionality in the intended product. In this checkout, preserve all existing Block Lambda functionality until an authoritative MiniJava implementation is present.
2. Remove the generic “AI-generated IDE” appearance: excessive visual decoration, duplicated controls, arbitrary icons, unnecessary colors, and imitation of VS Code.
3. Give each command one clear primary location. Secondary access through keyboard shortcuts and the command palette remains intentional, not visual duplication.
4. Express the product through its language: grammar-aware blocks, semantic tools, typing views, code view, runtime visualization, and program structure.
5. Keep dark and light themes.
6. Keep perspectives, keyboard shortcuts, responsive drawers, resizers, panel maximization, autosave, and persisted layout.
7. Maintain accessibility and keyboard navigation.

This is a shell and presentation refactor, not a functionality rewrite. The parser/generator round trip, type inference, formal derivation, examples, evaluation strategies, CEK machine, lockstep debugger, block comments, outline, file handling, and autosave behavior remain in scope and must continue to work.

## 2. Target information architecture

The completed shell should use the following primary locations:

- **Header:** project and file identity, File menu, Examples, primary Run action, View menu, and an overflow menu.
- **Left panel:** block search and the categorized toolbox.
- **Workspace toolbar:** Undo, Redo, Zoom, Fit workspace, and the primary Run action.
- **Right inspector:** Code, Types, and Outline. Existing formal derivation and selected-block inspection must remain reachable even if moved to an overflow menu or the command palette.
- **Bottom panel:** Problems, Output, and semantics/runtime tools.
- **Status bar:** block count, problem count, and autosave state. File and perspective status may remain when useful, but should not compete with these core signals.
- **Settings:** theme, autosave interval, perspectives, renderer if still user-selectable, and layout controls.
- **Command palette:** every application command, including less frequently used actions.

“One clear primary location” permits a command to also have a keyboard shortcut and command-palette entry. It does not justify multiple persistent icon buttons for the same action. When consolidating duplicated controls, move or hide the existing wired element rather than deleting its behavior; every removed visible entry point must still have an explicit menu or palette route.

## 3. Compatibility invariants

### Application behavior

- Preserve manual `.blc` save/load, autosave recovery, current file identity, save-name and example replace/merge dialogs, all shipped examples, Lambda text-to-block synchronization, generated formal derivation, copy and print actions, diagnostics, outline navigation, and problem/type navigation back to blocks.
- Preserve Undo/Redo and Blockly workspace state. A presentation-only change must not clear the undo stack, regenerate block IDs, change block positions, or rebuild the workspace unnecessarily.
- Preserve the current program-selection rule used by runtime tools: prefer the top-level `lambda_application`; otherwise use the first top-level Lambda term.
- Preserve Call-by-Structure as the language default, Call-by-Value traces, CEK Load/Back/Step/Play, Lockstep Load/Back/Step/Play and its CbS/CbV switch, salient-rule matching, stale-on-edit behavior, runtime provenance links, re-run, arrange, collapse, and panel maximization.
- Preserve type inference warnings, native Blockly type/value comments, selected-block inspection, inferred top-level types, problem badges/counts, and formal typing derivations.
- Preserve light/dark shell and Blockly themes, renderer selection (`tude`, `zelos`, `thrasos`), and renderer reinjection behavior.

### DOM, events, and accessibility

- Preserve every TypeScript-referenced ID listed in section 4. IDs may be moved within the document, but must remain unique and must still identify the element expected by the existing handler.
- Preserve all behaviorally significant `data-*` attributes and their value vocabularies.
- Preserve state classes and state-bearing attributes. This includes the externally mandated names `is-active`, `code-hidden`, `toolbox-hidden`, and `bottom-maximized`, plus the current implementation’s `menu-open`, `presentation-mode`, `code-maximized`, `resizing-code-panel`, and `resizing-sidebar`. Note that the current bottom maximized state is `#vizDock[data-maximized='true']`, not a `bottom-maximized` class; do not replace or conflate either contract without an explicit compatibility layer and tests.
- Preserve `hidden`, `disabled`, `aria-pressed`, `aria-selected`, `aria-checked`, `aria-expanded`, and roving `tabIndex` state updates.
- Preserve all `aria-controls`/`aria-labelledby` relationships, dialog labels, live regions, menu/menuitem roles, tab/tablist/tabpanel roles, tree semantics, toolbar/group labels, and separator roles/orientations/value ranges.
- Preserve keyboard handlers, focus restoration/placement, keyboard resizers, tab navigation, menu navigation, dialog behavior, context menus, and provenance activation by Enter/Space.
- Preserve custom events: `block-lambda:layout-resized`, `block-lambda:layout-state-changed`, `block-lambda:refresh-code`, `block-lambda:theme-changed`, and `block-lambda:context-menu-action`.

### Blockly grammar, serialization, and rendering

- Do not change the registered block type names: `lambda_variable`, `lambda_abstraction`, `lambda_application`, `lambda_parentheses`, `lambda_let`, `lambda_letrec`, `lambda_number`, `lambda_boolean`, `lambda_number_operator`, `lambda_number_comparison`, `lambda_boolean_operator`, `lambda_if`, and the visualization-only `lambda_viz_description`.
- Do not change serialized field names (`NAME`, `PARAM`, `VALUE`, `OP`, `TEXT`) or input names (`BODY`, `FUNC`, `ARG`, `TERM`, `VALUE`, `LEFT`, `RIGHT`, `COND`, `THEN`, `ELSE`).
- Preserve the `LambdaTerm` output/input check on every language term and preserve which inputs are inline versus external.
- Preserve valid-identifier validation and parser/generator compatibility.
- Preserve style-family names: `lambda_term`, `lambda_binding`, `lambda_grouping`, `lambda_literal`, `lambda_operator`, `lambda_control`, and `lambda_meta`. Color adjustments may make these six/seven families quieter, but the category distinction must remain clear in both themes.
- Preserve the `tude` renderer name and Zelos-based renderer behavior. Its square reporter path, 22×20 value socket, 16-pixel page gutter, square puzzle tab, 36×8 statement notch, zero-radius inside/outside corners, shape padding, label alignment, and connection meanings are grammatical behavior, not decoration.
- Preserve Blockly connection shapes and checks. A connector must continue to communicate what may connect; do not simplify shapes into visually identical but semantically ambiguous sockets.
- Preserve the main workspace’s grid/move/zoom behavior and the visualization workspaces’ independent Blockly injection behavior. The grid may be made subtler or removed only if snapping and spatial behavior remain intentionally equivalent and are covered by tests.

## 4. Stable elements and selectors

### Mandatory names supplied with the refactor brief

The brief explicitly requires the IDs `run-program`, `viz-dock`, `toolbox-column`, and `perspective-select` to remain stable. **No exact matches exist in this checkout.** The closest current contracts are:

| Brief ID | Current source equivalent | Constraint |
| --- | --- | --- |
| `run-program` | No single equivalent; Run is dispatched through `[data-bottom-tab]`, especially `machine` | Do not invent or silently map this ID until the intended MiniJava source/branch is confirmed. Preserve all current run routes. |
| `viz-dock` | `#vizDock` and `.viz-dock` | Preserve both current selectors. If a compatibility alias is later required, add it deliberately; an element cannot have two IDs. |
| `toolbox-column` | `#toolboxPanel`, `.toolbox-panel`, `.primary-side-panel` | Preserve the current panel and toolbox wiring. |
| `perspective-select` | `#perspectiveSelect` | Preserve the current camelCase ID and its change handler. |

The absence of these exact IDs is a release-blocking branch/contract question for a MiniJava implementation, not permission to rename current DOM elements during a visual refactor.

### High-risk static IDs used by production TypeScript

The following IDs are direct lookup or handler contracts and must remain stable:

| Area | IDs |
| --- | --- |
| Shell and menus | `app`, `menuToggle`, `topbarActions`, `commandPaletteTrigger`, `commandPalette`, `commandPaletteTitle`, `commandPaletteInput`, `commandPaletteList`, `aboutApp`, `aboutDialog`, `aboutDialogTitle`, `closeAboutDialog` |
| File and examples | `clearWorkspace`, `loadWorkspace`, `saveWorkspace`, `loadAutosave`, `saveNameDialog`, `saveNameInput`, `exampleLoadDialog`, `exampleLoadName`, `examplesMenuButton`, `examplesSubMenu` |
| Theme and renderer | `themeToggle`, `blocklyThemeMenuButton`, `blocklyThemeSubMenu` |
| Left panel/toolbox | `toolboxPanel`, `toggleToolboxPanel`, `showToolboxFromWorkspace`, `sidebarResizeHandle`, `sidebarTitle`, `toolboxSearch`, `blockToolboxContent`, `sidebarProblemsSummary`, `sidebarProblems`, `projectFileLabel` |
| Workspace | `blocklyArea`, `blocklyDiv`, `workspaceTitle`, `workspaceFileLabel`, `workspaceUndo`, `workspaceRedo`, `zoomOut`, `zoomIn`, `zoomFit`, `zoomLabel`, `toggleVizDock`, `presentationMode` |
| Right panel | `codePanel`, `resizeHandle`, `toggleCodePanel`, `showCodeFromWorkspace`, `maximizeCodePanel`, `synchronizeCode`, `copyCode`, `printDerivation`, `codeTargetCode`, `codeTargetFormal`, `codeTargetInspector`, `codeTargetOutline`, `codeOutput`, `lambdaEditorPane`, `lambdaEditor`, `lambdaEditorHighlight`, `lambdaEditorGutter`, `lambdaEditorStatus` |
| Inspector/outline | `blockInspectorPane`, `blockInspectorEmpty`, `blockInspectorContent`, `inspectorBlockKind`, `inspectorBlockId`, `inspectorBlockTerm`, `inspectorBlockType`, `inspectorBlockStatus`, `inspectorBlockIssues`, `outlinePane`, `programOutline` |
| Bottom panel | `vizDock`, `vizDockInfo`, `vizResizer`, `vizRerun`, `vizArrange`, `vizMaximize`, `vizCollapse`, `vizEmpty`, `problemsPanelSummary`, `problemsList`, `outputLog`, `typesPanelSummary`, `typesList` |
| Lockstep | `stepperStrategyStructure`, `stepperStrategyValue`, `stepperLoad`, `stepperBack`, `stepperStep`, `stepperPlay`, `stepperStatus`, `stepperAgree`, `stepperWorkspace`, `stepperMachineStatus`, `stepperMachineEnv`, `stepperMachineKont` |
| CEK machine | `machineLoad`, `machineBack`, `machineStep`, `machinePlay`, `machineStatus`, `machineControl`, `machineEnv`, `machineKont` |
| Status/settings | `topSaveStatus`, `topbarFileName`, `autosaveTime`, `autosaveInterval`, `autosaveIntervalLabel`, `statusLine`, `statusProblemIcon`, `statusProblemCount`, `activityProblemCount`, `bottomProblemCount`, `blockCount`, `perspectiveSelect`, `statusPerspective` |

Dynamic bottom tabs and panels receive runtime IDs `bottomTab-{kind}` and `bottomPanel-{kind}` for each of `problems`, `output`, `types`, `structure`, `value`, `machine`, and `stepper`. These generated IDs and their ARIA links are stable contracts.

### Behaviorally significant `data-*` selectors

- `[data-command-target]`: `clearWorkspace`, `loadWorkspace`, `saveWorkspace`, `loadAutosave`, `undoWorkspace`, `redoWorkspace`.
- `[data-panel-command]`: `sidebar`, `code`, `bottom`.
- `[data-activity]`: `blocks`, `files`, `problems`, `run`, `settings`.
- `[data-sidebar-view]`: the same activity vocabulary.
- `[data-bottom-tab]`, `.viz-tab[data-kind]`, and `.viz-host[data-kind]`: `problems`, `output`, `types`, `structure`, `value`, `machine`, `stepper`.
- `[data-code-target]`: `code`, `formal`, `inspector`, `outline`.
- `[data-perspective]`: `edit`, `debug`, `types`, `presentation`; the persisted/select vocabulary also includes `custom`.
- `[data-theme-mode]`: `dark`, `light`.
- `[data-blockly-renderer]`: `tude`, `zelos`, `thrasos`.
- `[data-example-id]`: `identity-function`, `currying-closures`, `function-composition`, `apply-twice`, `twice-twice`, `let-polymorphism`, `copy-vs-lookup`, `shadowing`, `normal-form-binder`, `simple-factorial`, `fibonacci`, `gcd-euclid`.
- Runtime state: `html[data-theme]`, `html[data-blockly-renderer]`, `#vizDock[data-open]`, `#vizDock[data-maximized]`, `.viz-host[data-active]`, and `[data-state]` values including `ok`, `error`, `pending`, `saved`, `stale`, `done`, `sync`, and `diverged` where applicable.
- Runtime metadata used by behavior: `data-raw-code`, `data-block-id`, `data-block-type`, `data-category`, `data-tone`, and `data-provenance-id`.

The class hooks `.app-menu`, `.app-menu-trigger`, `.app-menu-popup`, `.activity-button`, `.sidebar-view`, `.code-tabs`, `.code-tab`, `.viz-tabs`, `.viz-tab`, `.viz-host`, `.workspace-panel`, `.toolbox-panel`, `.code-panel`, `.topbar-actions`, `.statusbar`, and `.block-lambda-context-menu` are queried or used as layout/event boundaries and must not be renamed without updating and testing all consumers.

### ARIA relationships that must survive reorganization

- `menuToggle` controls `topbarActions`; Examples and Renderer submenu triggers control their corresponding submenu IDs.
- Code tabs control/label `lambdaEditorPane`, `codeOutput`, `blockInspectorPane`, and `outlinePane`.
- Bottom tabs control/label their dynamically assigned `bottomPanel-*` tabpanels.
- `commandPalette` is labelled by `commandPaletteTitle`; its input controls `commandPaletteList`.
- Save, example-load, and About dialogs retain their `aria-labelledby` titles.
- Resizers remain focusable separators with the correct orientation and `aria-valuemin`, `aria-valuemax`, and `aria-valuenow`.
- Live announcements remain on code parse state, status line, output log, sidebar diagnostics, visualization info/status, stepper agreement, and machine status.

## 5. Commands that must remain reachable

Every command below must have one primary UI location and a command-palette entry. Existing shortcuts remain additional access paths. Context-sensitive actions may remain in a context menu, but should also have a discoverable palette entry that explains when they are available.

| Command group | Commands and current behavior |
| --- | --- |
| File | New/Clear workspace; Open `.blc`; Save As `.blc`; Recover local autosave |
| Examples | Open each of the 12 shipped examples; choose Replace, Merge, or Cancel when the workspace is non-empty |
| Edit | Undo; Redo |
| Workspace | Zoom out; Zoom in; Zoom to fit; block search; synchronize text/code from workspace |
| View/layout | Toggle primary sidebar; toggle Code/Inspector; toggle bottom panel; maximize/restore Code/Inspector; maximize/restore bottom panel; select Blocks, Project, Problems, Run, or Settings activity |
| Perspectives | Edit; Debug; Type Analysis; Presentation; return from Presentation to the previous perspective; Custom remains an automatic persisted state |
| Code/analysis | Edit Lambda text; show formal derivation; show selected-block inspector; show outline; refresh generated output/type analysis; copy generated output; print derivation; show Problems; show Types; show Output |
| Run/semantics | Primary Run route; Call-by-Structure trace; Call-by-Value trace; CEK machine; Lockstep debugger; re-run active visualization; arrange trace blocks |
| CEK controls | Load; Back; Step; Play/Pause; activate provenance links |
| Lockstep controls | Choose CbS/CbV; Load; Back; Step; Play/Pause; activate provenance links |
| Block/workspace context | Show Type and Value for a Lambda term; evaluate an application with CbS; evaluate an application with CbV; download a workspace screenshot |
| Preferences | Light theme; dark theme; autosave interval from 2–20 minutes; Tude/Zelos/Thrasos renderer; perspective selection |
| Utility | Collapse bottom panel; About Block Lambda |

Current keyboard contracts:

- `Ctrl/Cmd+N`: New/Clear workspace.
- `Ctrl/Cmd+O`: Open workspace.
- `Ctrl/Cmd+S`: Save workspace.
- `Ctrl/Cmd+B`: Toggle primary sidebar.
- `Ctrl/Cmd+Alt+C`: Toggle Code/Inspector.
- `Ctrl/Cmd+J`: Toggle bottom panel.
- `Ctrl/Cmd+Shift+B`: Refresh generated output.
- `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`: Undo and Redo when focus is not in an editable control.
- `Ctrl/Cmd+Shift+P` or `F1`: Open command palette.
- `F11`: Enter/leave Presentation perspective.
- `/`: open Blocks and focus block search when focus is not editable.
- `Escape`: close menus, compact header menu, palette, and relevant submenus.
- Arrow keys: navigate application menus, right-panel tabs, bottom-panel tabs, the command palette, and resizers. `Home`/`End` work on tablists; Enter activates the selected palette command; Enter/Space activates runtime provenance links.

The current palette is not yet exhaustive: examples, renderer choices, autosave interval controls, print/copy, screenshot, panel maximization, context actions, and the individual machine/stepper controls are not all registered there. “Command palette: every application command” is therefore an acceptance requirement for the refactor, not a claim about current behavior.

## 6. Existing responsive, resize, maximization, and persistence behavior

### Responsive layout

- Above 1240px the shell is a four-column grid: activity bar, resizable primary sidebar, Blockly workspace, and resizable right panel.
- At `max-width: 1240px`, the sidebar and right panel become absolute overlay drawers over the workspace. Opening one hides the other. Their desktop resize handles are hidden. Stored visibility remains the source of truth and is reapplied when the media query changes.
- At `max-width: 900px`, the application menu becomes a collapsible header drawer controlled by `menuToggle`; popups become viewport-positioned; autosave interval and visualization info are reduced.
- Phone detection for scroll/focus behavior is `max-width: 780px`. Restoring the right panel scrolls it into view and focuses it after the layout settles.
- At `max-width: 620px`, the activity/header/status dimensions shrink, the left and right panels occupy the width beside the activity bar, secondary workspace controls are hidden, and an open bottom panel becomes a fixed bottom drawer. Maximized bottom state fills from below the header to above the status bar. Only the active bottom-tab label is shown; stepper/machine panes stack vertically.
- `prefers-reduced-motion: reduce` effectively disables transitions and animations.
- `visualViewport`, window resize/orientation, observed panel geometry, and relevant transition completion all schedule a shared Blockly/layout resize. Preserve the `--viewport-height` workaround and `block-lambda:layout-resized` notification.

Do not change the responsive drawer or resize implementation until browser-level regression tests cover the 1240px overlay transition, mutual exclusion, the 900px menu drawer, 780px restore behavior, the 620px bottom drawer, and orientation/viewport changes.

### Resizers and maximization

- Sidebar width: default 276px, persisted/clamped to 240–380px; pointer drag and Left/Right arrow adjustments of 16px.
- Code panel width: default 430px, persisted/clamped to 320–760px; pointer drag and Left/Right arrow adjustments of 16px. Its live maximum also preserves at least 340px for the workspace.
- Bottom panel height: default 272px, persisted/clamped to 180–640px on read and to 180px–72% of the current viewport while resizing; pointer drag and Up/Down arrow adjustments of 24px.
- Code maximization uses `#app.code-maximized`, hides competing workbench regions and the bottom panel, forces the code panel visible, updates `aria-pressed`/labels, and persists `codeMaximized`.
- Bottom maximization uses `#vizDock[data-maximized='true']`, updates `aria-pressed`/labels, and persists `bottomMaximized`. Manual bottom resizing restores non-maximized state.
- Presentation mode remembers and restores the previous layout/perspective instead of merely toggling visibility classes.

### Persistence and storage keys

| Key | Stored behavior |
| --- | --- |
| `block-lambda-ide-layout-v2` | Activity, sidebar visibility/width, code visibility/width/maximized, bottom visibility/height/tab/maximized, perspective |
| `block-lambda-theme-mode` | `light` or `dark`; invalid/missing values resolve to dark |
| `block-lambda-blockly-renderer` | `tude`, `zelos`, or `thrasos`; invalid/missing values resolve to Tude |
| `block-lambda-autosave-workspace` | Blockly serialized workspace JSON |
| `block-lambda-autosave-time` | ISO timestamp of the local autosave |
| `block-lambda-autosave-interval-minutes` | Integer interval clamped to 2–20 minutes; default 2 |

Layout storage is defensive: invalid enum values fall back independently, numeric fields are rounded/clamped, malformed JSON returns the full default, and unavailable storage must not prevent the workbench from booting. Manual panel changes mark the perspective `custom`; applying Edit/Debug/Type Analysis/Presentation writes a coherent preset. Keep the storage key and schema backward compatible unless a tested migration is introduced.

Autosave is scheduled after settled structural inference events and passive moves, resets its timeout after further activity, reports pending/saved/error status, updates the timestamp, saves immediately after startup and important load/example/text-import operations, and allows explicit recovery. Preserve the browser-storage failure path and status announcements.

## 7. Visual constraints: do not introduce

Do not introduce:

- decorative gradients;
- glassmorphism, translucency used as ornament, or backdrop blur;
- large or layered shadows; shadows are reserved for functional overlays/drawers;
- excessive rounded cards, nested card grids, or card-per-control layouts;
- floating pills, oversized badges, or pill-shaped navigation;
- glowing controls, neon borders, or luminous workspace chrome;
- dashboard-style KPI/statistic cards;
- arbitrary icon families, emoji as permanent application icons, or mixed icon styles;
- color that does not encode grammatical category, selection, execution, warning, error, success, or another defined semantic state;
- decorative workspace grid emphasis;
- duplicated persistent controls for the same command;
- unfamiliar semantic actions represented only by icons;
- imitation VS Code activity/navigation chrome when it does not express language behavior;
- font weights outside the normal 400/500/600/700 range, including 760, 820, and 900;
- React, Vue, Angular, another UI framework, or a parallel component runtime;
- unrelated production cleanup bundled into the refactor.

Use a neutral application shell and one primary product accent. Keep six or seven semantic block-color families. Use a single SVG icon system. Familiar operations such as Undo, Redo, Zoom, Close, and Search may be icon-only when they have accessible names and tooltips; semantic/runtime actions use text labels. Prefer restrained spacing, one-pixel borders, flat panels, normal typography, and color only where it carries meaning.

## 8. Acceptance criteria

### Functional and semantic

- All existing automated suites pass: round-trip, semantics/machine correspondence, and layout-state validation.
- Browser regression tests are added before changing drawer or resize behavior and pass at desktop, compact, header-drawer, and phone breakpoints.
- Every shipped example loads (replace and merge), type-checks as before, reaches the same values under both strategies, and remains pinned by tests.
- Saving/loading `.blc` preserves block types, fields, connections, positions, and comments; autosave/recovery and autosave interval work across reloads.
- Text-to-block and block-to-text round trips remain stable; formal derivation, copy, print, outline, inspector, diagnostics, type comments, screenshot, and status updates remain functional.
- CbS/CbV traces, CEK, Lockstep, stale-on-edit, Back, Step, Play/Pause, re-run, arrange, and provenance links behave exactly as before.
- Renderer switching preserves serialized workspace content and scale; Tude connector geometry and grammatical compatibility remain unchanged.

### Information architecture and reachability

- The header, left panel, workspace toolbar, right inspector, bottom panel, status bar, Settings, and command palette match the target structure in section 2.
- Each command has one obvious primary location; redundant persistent controls are removed or demoted without deleting the wired command.
- Every command in section 5 is reachable through the command palette, and every removed top-level control remains reachable through an explicit menu or the palette.
- The primary Run action is clearly labelled and routes to the intended language-default execution behavior. Existing alternate semantics remain explicitly reachable.
- Project/file identity, block search/toolbox, Code/Types/Outline, Problems/Output/runtime tools, block/problem counts, and autosave state are visible in their designated regions.

### Compatibility and responsive behavior

- No production ID, behaviorally significant `data-*` value, state class/attribute, custom event, storage key, keyboard shortcut, event handler, or ARIA relationship listed here is lost.
- The branch mismatch and the absent brief IDs (`run-program`, `viz-dock`, `toolbox-column`, `perspective-select`) are resolved explicitly before release; current camelCase/source contracts are not silently renamed.
- Desktop resizers work by pointer and keyboard, update ARIA values, respect bounds, and persist.
- Compact drawers remain mutually exclusive; phone code restoration scrolls/focuses correctly; the phone bottom drawer and both maximization modes restore correctly; persisted layout survives reload and breakpoint changes.
- Blockly resizes correctly after panel changes, theme changes, transitions, viewport/orientation changes, and restoration from persisted state.

### Accessibility and visual quality

- Full application operation is possible with a keyboard, with visible focus and no keyboard trap.
- Menus, dialogs, tablists, tree items, live regions, toggles, groups, and separators retain correct roles, names, states, focus order, and relationships.
- Tab lists use roving focus and Arrow/Home/End behavior; menus use Arrow navigation; the palette uses Arrow/Enter/Escape; resizers use Arrow keys; provenance links use Enter/Space.
- Light and dark themes meet WCAG contrast expectations for text, controls, focus, selection, warnings, and errors; color is never the only carrier of state.
- Reduced-motion preference is respected.
- The result contains none of the prohibited patterns in section 7, uses one coherent SVG icon system, uses text for unfamiliar semantic actions, and keeps font weights to 400/500/600/700.
- Visual review confirms a quiet, flat, domain-specific programming workbench whose strongest identity comes from grammar-aware blocks, typing, code/derivation, program structure, and runtime semantics—not generic IDE ornament.

## 9. Known risks and required test work

1. **Product mismatch:** this checkout is Lambda Calculus while the brief names Block-MiniJava. Relabelling without the correct grammar/runtime would violate the primary preservation goal.
2. **Selector mismatch:** the four explicitly mandated kebab-case IDs are absent; current TypeScript is coupled to camelCase IDs and delegated `data-*` routing.
3. **Responsive coverage gap:** current tests validate persisted layout data but do not exercise DOM drawers, resizers, focus/scroll restoration, maximization, breakpoints, or ARIA updates in a browser.
4. **Distributed command wiring:** commands are currently spread across direct ID listeners, delegated `data-*` listeners, context-menu registry entries, and an incomplete palette array. Consolidation must preserve handlers while establishing a complete command registry/reachability test.
5. **CSS/DOM coupling:** layout and state depend on exact class/data selectors and CSS custom properties. Markup movement can appear correct at one breakpoint while breaking overlay mutual exclusion or Blockly resize elsewhere.
6. **Renderer sensitivity:** Tude’s square geometry and connector paths are executable grammar cues. Treating them as visual decoration could break connection affordances and serialized program expectations.
7. **Generated artifacts:** webpack cleans and regenerates `docs/`; hand edits there will be lost and can create misleading diffs. Implement in `src/`, then rebuild deliberately.

