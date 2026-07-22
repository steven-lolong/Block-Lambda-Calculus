# Command Inventory

## Scope and interpretation

This inventory describes the checked-out **Block Lambda Calculus** application. The requested `src/assets/js/block_minijava.ts` and `src/core/ui/app.ts` do not exist; the actual entry point is `src/assets/js/block_lambda.ts`, with command orchestration primarily in `src/core/ui/workbench.ts`, `layout.ts`, `visualizationPanel.ts`, `csekPanel.ts`, `contextMenus.ts`, `src/core/examples/lambdaExamples.ts`, and `src/core/renderer/toolbox.ts`.

“Duplicated” means the same operation currently has more than one persistent visible entry point. A command-palette entry or keyboard shortcut is permitted secondary access and does not by itself count as harmful visual duplication. Dialog buttons and context-sensitive controls are included because they perform application actions, even when they are only conditionally visible.

The header brand's `href="#"` has no application event handler and is therefore navigation markup rather than a command. Menu and submenu disclosure is included because it is keyboard- and ARIA-significant.

The current-location columns reflect the completed header/status-bar, toolbox/workspace-toolbar, inspector, and bottom-panel refactors. Future-location columns remain guidance for later command consolidation.

## Toolbox and workspace toolbar update

The visible left panel is now exclusively **Blocks**: its title, search, categorized grammar toolbox, and the responsive/sidebar close-and-restore controls. File operations remain in Header → File; semantic and runtime tools remain in Header → More, the command palette, and the bottom panel; Preferences are in Header → More → Settings. The former non-Blocks activity/sidebar elements remain hidden compatibility state only so their IDs, `data-activity`/`data-sidebar-view` vocabularies, persisted layout payload, and diagnostics updates remain stable. They are not user-facing command routes.

The workspace toolbar now contains only Undo, Redo, Zoom out, Zoom in, Fit workspace, and the labeled primary Run action. `toggleVizDock` moved to Header → View, `presentationMode` moved to Header → View, and `clearWorkspace` moved to Header → File. The hidden responsive restore affordances (`showToolboxFromWorkspace`, `showCodeFromWorkspace`) remain in the toolbar because they are required drawer controls, not routine commands.

## Inspector and bottom-panel update

The right inspector now has three primary tabs: **Code**, **Types**, and **Outline**. Types contains a secondary row for **Inferred types** and **Typing derivation**; the existing selected-block term/type/status view is part of Inferred types. All prior IDs remain on their original functional elements, including `codeTargetFormal`, `codeOutput`, `codeTargetInspector`, `blockInspectorPane`, `typesPanelSummary`, and `typesList`.

The bottom panel now has three primary tabs: **Problems**, **Output**, and **Semantics**. Semantics contains the four views actually implemented by this repository: **Call-by-Structure**, **Call-by-Value**, **CEK machine**, and **Lockstep**. The prior `data-kind` values and runtime `bottomTab-*`/`bottomPanel-*` IDs remain the routing identity for those nested views. The former bottom Types tab and host remain hidden compatibility targets only; `[data-bottom-tab="types"]` now opens Inspector → Types, and a persisted legacy `bottomTab: "types"` normalizes to Inspector → Types with Bottom → Problems.

## File, shell, and global commands

| Command name | Purpose | Current visible locations | Current element IDs | Keyboard shortcut | Command-palette entry | Primary future location | Secondary permitted location | Whether it is duplicated | Migration risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Toggle application menu | Open/close the compact header drawer | Header, at ≤900px | `menuToggle`, controls `topbarActions` | Escape closes | No | Header | None | No | High: responsive state and ARIA are coupled to `menu-open` |
| Open/close menu or submenu | Disclose File, Examples, View, or More choices | Header menu bar; block renderer disclosure in Settings | `examplesMenuButton`, `examplesSubMenu`, `blocklyThemeMenuButton`, `blocklyThemeSubMenu`; other top-level triggers have no IDs | ArrowDown enters a menu; ArrowUp/Down and Home/End navigate Examples; Escape/outside click closes | No | Header | Settings for renderer choice | No | High: focus navigation, popup ancestry, `hidden`, and `aria-expanded` are coupled |
| Open command palette | Search and execute registered commands | Header → More | `commandPaletteTrigger`, `commandPalette` | Ctrl/Cmd+Shift+P; F1; Escape closes | The palette is the command | Header → More | Shortcut | No | High: dialog focus, listbox state, and global key handling |
| New/Clear workspace | Clear all blocks and reset the workspace filename | Header → File | `clearWorkspace` | Ctrl/Cmd+N | Yes — `File: New Workspace` | Header → File | Palette and shortcut | No | High: destructive and currently has no confirmation |
| Open workspace | Pick and deserialize a `.blc` file | Header → File | `loadWorkspace` | Ctrl/Cmd+O | Yes — `File: Open Workspace…` | Header → File | Palette and shortcut | No | High: file picker, serialization, autosave update |
| Save workspace as | Name, serialize, and download a `.blc` file | Header → File | `saveWorkspace`, `saveNameDialog`, `saveNameInput` | Ctrl/Cmd+S | Yes — `File: Save Workspace As…` | Header → File | Palette and shortcut | No | High: dialog and browser download behavior |
| Confirm save | Complete Save As with the normalized filename | Save dialog | No command ID; submit button `value="save"` | Enter through dialog form | No | Save dialog | None | No | Medium: dialog return value is behavioral |
| Cancel save | Close Save As without a download | Save dialog, including close icon | No command ID; submit buttons `value="cancel"` | Escape/native dialog behavior | No | Save dialog | None | Yes within dialog | Low |
| Recover autosave | Load locally persisted Blockly JSON | Header → File | `loadAutosave` | None | Yes — `File: Recover Local Autosave` | Header → File | Palette | No | High: storage error/recovery path |
| Undo | Undo Blockly history | More menu; workspace toolbar | `undoWorkspace`, `workspaceUndo` | Ctrl/Cmd+Z outside editable controls | Yes — `Edit: Undo` | Workspace toolbar | More, palette, and shortcut | Yes | Medium: focus-sensitive keyboard behavior |
| Redo | Redo Blockly history | More menu; workspace toolbar | `redoWorkspace`, `workspaceRedo` | Ctrl/Cmd+Shift+Z outside editable controls | Yes — `Edit: Redo` | Workspace toolbar | More, palette, and shortcut | Yes | Medium |
| Toggle light/dark theme | Switch shell and Blockly theme | Header → More → Settings | `themeToggle`, `settingsDialog` | None | Yes — `Preferences: Toggle Color Theme` | Settings → Color Theme | Palette | No | High: persistence, browser theme color, Blockly rerender |
| Select dark theme | Select the dark palette explicitly | Header → More → Settings | `themeToggle`, `[data-theme-mode="dark"]` | None | Toggle entry reaches the same state | Settings → Color Theme | Palette toggle | No | Medium |
| Select light theme | Select the light palette explicitly | Header → More → Settings | `themeToggle`, `[data-theme-mode="light"]` | None | Toggle entry reaches the same state | Settings → Color Theme | Palette toggle | No | Medium |
| About | Open product/technology information | Header → More | `aboutApp`, `aboutDialog` | Escape/native dialog close | No | Header → More | None | No | Low |
| Close About | Close the About dialog | About dialog | `closeAboutDialog` | Escape/native dialog close | No | About dialog | None | No | Low |

## Examples and renderer commands

All example commands share `examplesMenuButton`/`examplesSubMenu`, a `[data-example-id]` item, and the `exampleLoadDialog` replace/merge flow.

| Command name | Purpose | Current visible locations | Current element IDs | Keyboard shortcut | Command-palette entry | Primary future location | Secondary permitted location | Whether it is duplicated | Migration risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Open Identity Function example | Load `identity-function` | Header → Examples | No item ID; `[data-example-id="identity-function"]` | None | No | Header → Examples | None | No | High: serialized example identity |
| Open Currying & Closures example | Load `currying-closures` | Header → Examples | `[data-example-id="currying-closures"]` | None | No | Header → Examples | None | No | High |
| Open Function Composition example | Load `function-composition` | Header → Examples | `[data-example-id="function-composition"]` | None | No | Header → Examples | None | No | High |
| Open Apply Twice example | Load `apply-twice` | Header → Examples | `[data-example-id="apply-twice"]` | None | No | Header → Examples | None | No | High |
| Open Twice Twice example | Load `twice-twice` | Header → Examples | `[data-example-id="twice-twice"]` | None | No | Header → Examples | None | No | High |
| Open Let-Polymorphism example | Load `let-polymorphism` | Header → Examples | `[data-example-id="let-polymorphism"]` | None | No | Header → Examples | None | No | High |
| Open Copy vs Lookup example | Load `copy-vs-lookup` | Header → Examples | `[data-example-id="copy-vs-lookup"]` | None | No | Header → Examples | None | No | High |
| Open Shadowing example | Load `shadowing` | Header → Examples | `[data-example-id="shadowing"]` | None | No | Header → Examples | None | No | High |
| Open Normal Form example | Load `normal-form-binder` | Header → Examples | `[data-example-id="normal-form-binder"]` | None | No | Header → Examples | None | No | High |
| Open Factorial 5 example | Load `simple-factorial` | Header → Examples | `[data-example-id="simple-factorial"]` | None | No | Header → Examples | None | No | High |
| Open Fibonacci 6 example | Load `fibonacci` | Header → Examples | `[data-example-id="fibonacci"]` | None | No | Header → Examples | None | No | High |
| Open GCD (Euclid) example | Load `gcd-euclid` | Header → Examples | `[data-example-id="gcd-euclid"]` | None | No | Header → Examples | None | No | High |
| Replace with example | Clear then load selected example | Example-load dialog | `exampleLoadDialog`; submit `value="replace"` | Enter if default browser behavior selects it | No | Example-load dialog | None | No | High: destructive replacement |
| Merge example | Append example blocks to the workspace | Example-load dialog | `exampleLoadDialog`; submit `value="merge"` | None | No | Example-load dialog | None | No | High: block IDs/positions and serialization |
| Cancel example load | Preserve current workspace | Example-load dialog and close icon | `exampleLoadDialog`; submit `value="cancel"` | Escape/native dialog close | No | Example-load dialog | None | Yes within dialog | Low |
| Select Tude renderer | Reinject Blockly with the project renderer | Header → More → Settings → Block Appearance | `[data-blockly-renderer="tude"]`, `blocklyThemeMenuButton`, `blocklyThemeSubMenu` | None | No | Settings → Block Appearance | None | No | Very high: workspace disposal/reinjection and connector geometry |
| Select Zelos renderer | Reinject Blockly with Zelos | Header → More → Settings → Block Appearance | `[data-blockly-renderer="zelos"]` | None | No | Settings → Block Appearance | None | No | High |
| Select Thrasos renderer | Reinject Blockly with Thrasos | Header → More → Settings → Block Appearance | `[data-blockly-renderer="thrasos"]` | None | No | Settings → Block Appearance | None | No | High |

## View, activities, perspectives, and layout

| Command name | Purpose | Current visible locations | Current element IDs | Keyboard shortcut | Command-palette entry | Primary future location | Secondary permitted location | Whether it is duplicated | Migration risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Toggle primary sidebar | Show/hide current left activity view | View menu; sidebar close; workspace restore | `toggleToolboxPanel`, `showToolboxFromWorkspace`, `[data-panel-command="sidebar"]` | Ctrl/Cmd+B | Yes — `View: Toggle Primary Sidebar` | Header → View | Palette and shortcut | Yes | Very high: compact drawer mutual exclusion and persistence |
| Show Blocks activity | Open sidebar on block search/toolbox | Activity bar | `[data-activity="blocks"]`, `[data-sidebar-view="blocks"]` | `/` also opens and focuses search | Yes — `View: Show Blocks` | Left panel | Palette and `/` | No | High: activity delegation and compact drawer state |
| Show Project activity | Legacy activity state; file identity and operations now live in the File menu | Hidden compatibility state | `[data-activity="files"]`, `[data-sidebar-view="files"]` | None | Yes — `File: Show Menu` | Header → File | Palette | No visible duplicate | Medium |
| Show Problems activity | Open the diagnostics bottom panel | Status bar problem count | `[data-activity="problems"]`, `[data-sidebar-view="problems"]` | None | Yes — `View: Show Problems` | Bottom → Problems | Status bar and palette | No persistent duplicate | High: legacy state remains hidden for diagnostics updates |
| Show Run activity | Legacy activity state; runtime routes now open bottom tools | Hidden compatibility state | `[data-activity="run"]`, `[data-sidebar-view="run"]` | None | Run palette commands | Workspace Run | Header Run, bottom runtime tabs, and palette | No visible duplicate | Medium |
| Show Settings activity | Open Settings dialog | Header → More → Settings | `[data-activity="settings"]`, `[data-sidebar-view="settings"]`, `openSettings`, `settingsDialog` | None | Yes — `Preferences: Settings` | Settings dialog | Palette | No visible duplicate | Medium |
| Toggle Code/Inspector panel | Show/hide right panel | View menu; panel close; workspace restore | `toggleCodePanel`, `showCodeFromWorkspace`, `[data-panel-command="code"]` | Ctrl/Cmd+Alt+C | Yes — `View: Toggle Code and Inspector` | Header → View | Palette and shortcut | Yes | Very high: compact drawer, phone scroll/focus, persistence |
| Maximize/restore Code/Inspector | Make the right panel the sole main region | Inspector header | `maximizeCodePanel` | None | No | Header → View or inspector overflow | Palette | No | Very high: `code-maximized` CSS and persisted state |
| Toggle bottom panel | Open/close bottom tools | Header → View; bottom close button | `toggleVizDock`, `vizCollapse`, `[data-panel-command="bottom"]` | Ctrl/Cmd+J | Yes — `View: Toggle Bottom Panel` | Header → View | Palette and shortcut | Yes, close is contextual | Very high: `data-open`, mobile drawer, Blockly resize |
| Maximize/restore bottom panel | Toggle enlarged bottom tools | Bottom panel header | `vizMaximize` | None | No | Bottom panel | Palette | No | High: `data-maximized`, mobile behavior, persistence |
| Apply Edit perspective | Blocks sidebar + code, bottom closed | View menu; Settings select | `perspectiveSelect`, `[data-perspective="edit"]` | None | Yes — `Perspective: Edit` | Settings → Perspectives | Header → View; palette | Yes | Very high: multi-panel transaction |
| Apply Debug perspective | Blocks toolbox + code + Lockstep bottom tab | View menu; Settings select | `perspectiveSelect`, `[data-perspective="debug"]` | None | Yes — `Perspective: Debug` | Settings → Perspectives | Header → View; palette | Yes | Very high |
| Apply Type Analysis perspective | Blocks toolbox + Inspector → Types + Bottom → Problems | View menu; Settings select | `perspectiveSelect`, `[data-perspective="types"]` | None | Yes — `Perspective: Type Analysis` | Settings → Perspectives | Header → View; palette | Yes | Very high |
| Enter/leave Presentation perspective | Hide chrome/panels, then restore previous layout | Header → View; Settings select | `presentationMode`, `perspectiveSelect`, `[data-perspective="presentation"]` | F11 | Yes — `Perspective: Presentation` | Header → View | Palette and F11 | Yes | Very high: snapshot/restore and `presentation-mode` CSS |
| Select Custom perspective | Represent a manually changed layout; restore from Presentation when selected | Settings select only | `perspectiveSelect` option `custom` | None | No | Settings → Perspectives | None | No | Very high: it is both derived state and restore path |

## Workspace and toolbox commands

| Command name | Purpose | Current visible locations | Current element IDs | Keyboard shortcut | Command-palette entry | Primary future location | Secondary permitted location | Whether it is duplicated | Migration risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Search blocks | Filter categories/cards and expand matches | Blocks sidebar | `toolboxSearch` | `/` focuses it | No | Left panel | `/` | No | High: generated toolbox DOM and visibility state |
| Insert/drag a grammar block | Create one of 12 toolbox term blocks by click, pointer drag, or keyboard focus/click | Blocks sidebar cards | Generated `.toolbox-block-card[data-block-type]`; mount `blockToolboxContent` | Enter/Space follows native button click behavior | No | Left categorized toolbox | None | No | Very high: Blockly connection, pointer capture, drop coordinates |
| Zoom out | Decrease Blockly scale | Workspace toolbar; Blockly-injected zoom controls | `zoomOut`; generated Blockly control has no app ID | None | Yes — `Workspace: Zoom Out` | Workspace toolbar | Palette | Yes | Medium |
| Zoom in | Increase Blockly scale | Workspace toolbar; Blockly-injected zoom controls | `zoomIn`; generated Blockly control has no app ID | None | Yes — `Workspace: Zoom In` | Workspace toolbar | Palette | Yes | Medium |
| Zoom to fit | Fit program blocks | Workspace toolbar; Blockly’s generated reset/zoom control is related but not identical | `zoomFit` | None | Yes — `Workspace: Zoom to Fit` | Workspace toolbar | Palette | Partially | Medium |
| Blockly native zoom/reset controls | Library-provided zoom in/out/reset UI from `zoom.controls: true` | Blockly canvas | Generated by Blockly; no stable app ID | Blockly-provided behavior | No | Remove later if custom toolbar fully covers and tests it | Palette/custom toolbar | Yes | High: library-generated focus/accessibility behavior |
| Delete via Blockly trashcan | Delete dragged blocks and expose Blockly trash behavior | Blockly canvas | Generated by Blockly from `trashcan: true` | Blockly-provided | No | Workspace | Native Blockly context menu | No | High: generated control and drag target |
| Native Blockly context actions | Library-dependent block/workspace actions such as duplicate/delete/collapse/help when applicable | Blockly context menu | Generated by Blockly; app enables `contextMenu: true` | Library-provided | No | Workspace context menu | None | Dynamic | High: exact set varies by block and Blockly version |

## Code, inspector, diagnostics, and structure

| Command name | Purpose | Current visible locations | Current element IDs | Keyboard shortcut | Command-palette entry | Primary future location | Secondary permitted location | Whether it is duplicated | Migration risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Refresh generated output/type analysis | Run inference and regenerate current output | Header → More | `refreshCode` | Ctrl/Cmd+Shift+B | Yes — `Build: Refresh Generated Output` | Header → More | Palette and shortcut | No | High: inference, comments, diagnostics, outline |
| Synchronize code from workspace | Replace Lambda editor text with generated workspace text | Inspector header | `synchronizeCode` | None | Yes — `Code: Synchronize from Workspace` | Right inspector → Code | Palette | No | High: text/block synchronization guard |
| Show Code/Lambda editor | Activate editable Lambda text tab | Inspector → Code | `codeTargetCode`, `lambdaEditorPane`, `[data-code-target="code"]` | Arrow/Home/End within primary inspector tablist | Yes — `View: Show Code` | Right inspector → Code | Palette | No | High: live 450ms parse back into blocks |
| Show formal derivation | Activate formal typing derivation | Inspector → Types → Typing derivation | `codeTargetFormal`, `codeOutput`, `[data-code-target="formal"]` | Arrow/Home/End within Types tablist | Yes — `View: Show Typing Derivation` | Right inspector → Types | Palette | No | High: generated HTML and print path |
| Show inferred types and selected-block inspector | Display top-level inferred types plus term/type/status/issues for the selected block | Inspector → Types → Inferred types | `codeTargetInspector`, `typeTargetOverview`, `typesPane`, `blockInspectorPane`, `typesPanelSummary`, `typesList`, `[data-code-target="inspector"]` | Arrow/Home/End within both inspector tablists | Yes — `View: Show Inferred Types` | Right inspector → Types | More compatibility route and palette | No visible duplicate | High: selection listener, generated rows, diagnostics, and legacy routing |
| Show outline | Display navigable program tree | Inspector → Outline | `codeTargetOutline`, `outlinePane`, `programOutline`, `[data-code-target="outline"]` | Arrow/Home/End within primary inspector tablist | Yes — `View: Show Outline` | Right inspector → Outline | Palette | No | High: generated tree and block IDs |
| Copy generated output | Copy raw code/formal text to clipboard | Inspector header; visible only for Code and Typing derivation | `copyCode` | None | No | Right inspector → Code/Types contextual action | Palette | No | Medium: clipboard and temporary accessible label |
| Print derivation | Print only the formal derivation | Inspector header, only on Typing derivation | `printDerivation` | None | No | Right inspector → Types/derivation contextual action | Palette | No | High: print-only classes and DOM rewriting |
| Run type analysis / show Types | Open the static type overview; analysis itself remains continuously updated | Inspector → Types; More compatibility route | `codeTargetInspector`, `typeTargetOverview`, `typesPane`, `[data-bottom-tab="types"]`; hidden compatibility `bottomTab-types`/`bottomPanel-types` | Arrow/Home/End in inspector tablists | Yes — `View: Show Inferred Types` | Right inspector → Types | More and palette | No visible duplicate | High: legacy bottom routing must continue to normalize correctly |
| Show Problems panel | Open bottom type-inference diagnostics | Bottom tab; status bar drill-down; More | runtime `bottomTab-problems`; `[data-bottom-tab="problems"]`, `[data-activity="problems"]` | Arrow/Home/End in primary bottom tabs | Yes — `View: Show Problems` | Bottom panel → Problems | Status bar, More, and palette | Yes | High: counts and hidden compatibility diagnostics bindings |
| Show Output panel | Open workbench/generator messages | Bottom tab only | runtime `bottomTab-output`; `[data-kind="output"]` | Arrow/Home/End | Yes — `View: Show Output` | Bottom panel → Output | Palette | No | Medium |
| Focus problem block | Select and center the block associated with a diagnostic | Generated Bottom → Problems rows | Generated `[data-block-id]` `.problem-row`; visible container `problemsList`; hidden compatibility container `sidebarProblems` | Native button activation | No | Problems list | Palette only if context can be represented | No visible duplicate | High: block IDs and workspace selection |
| Focus typed term | Select and center a top-level block from Types | Generated Inspector → Types rows | Generated `.type-row`; container `typesList` | Native button activation | No | Right inspector → Types | None | No | High |
| Focus outline item | Select and center a block from program structure | Generated outline tree | Generated `.outline-item[data-block-id]`; `programOutline` | Native button activation | No | Right inspector → Outline | None | No | High: tree semantics and block IDs |

## Runtime and bottom-panel commands

| Command name | Purpose | Current visible locations | Current element IDs | Keyboard shortcut | Command-palette entry | Primary future location | Secondary permitted location | Whether it is duplicated | Migration risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Show Semantics region | Return to the most recently selected semantic/runtime view | Bottom → Semantics primary tab | `bottomTab-semantics`, `semanticsViews` | Arrow/Home/End in primary bottom tablist | Runtime palette entries open a specific nested view | Bottom → Semantics | Specific runtime palette commands | No | High: it restores `activeSemantic` without changing the persisted specific kind |
| Run Call-by-Structure trace | Open/render the default substitution strategy | Bottom → Semantics → Call-by-Structure; More; block context menu for a specific application | `[data-bottom-tab="structure"]`, runtime `bottomTab-structure` | Arrow/Home/End in Semantics tablist | Yes — `Run: Call-by-Structure Trace` | Bottom → Semantics | More, palette, context menu | Yes | Very high: selected/top-level program distinction |
| Run Call-by-Value trace | Open/render value-first substitution | Bottom → Semantics → Call-by-Value; More; application context menu | `[data-bottom-tab="value"]`, runtime `bottomTab-value` | Arrow/Home/End in Semantics tablist | Yes — `Run: Call-by-Value Trace` | Bottom → Semantics | More, palette, context menu | Yes | Very high |
| Open/run CEK machine | Open machine and auto-load first program | Workspace Run; Header Run; Bottom → Semantics → CEK machine | `[data-bottom-tab="machine"]`, runtime `bottomTab-machine`, `.workspace-run-button` | Arrow/Home/End in Semantics tablist | Yes — `Run: CEK Machine` | Workspace toolbar Run | Header Run, Semantics, and palette | Yes, intentional cross-surface execution access | Very high: current language-default primary route |
| Open/run Lockstep debugger | Open lockstep and auto-load first program | Bottom → Semantics → Lockstep; More | `[data-bottom-tab="stepper"]`, runtime `bottomTab-stepper` | Arrow/Home/End in Semantics tablist | Yes — `Run: Lockstep Debugger` | Bottom → Semantics | More and palette | Yes | Very high |
| Re-run active runtime view | Recompute trace, stepper, or machine | Bottom panel tools; hidden for utility tabs | `vizRerun` | None | Yes — `Run: Re-run Active Semantic View` | Bottom panel | Palette | No | High: dispatch depends on active tab; the button is hidden at ≤620px, so the palette is the only phone route |
| Arrange active trace | Lay out trace/stepper blocks | Bottom panel tools; hidden for utility and machine tabs | `vizArrange` | None | Yes — `Run: Arrange Reduction Steps` | Bottom panel | Palette | No | High: Blockly positions/rendering; the button is hidden at ≤620px, so the palette is the only phone route |
| Choose Lockstep CbS | Use Call-by-Structure in Lockstep | Lockstep controls | `stepperStrategyStructure` | None | No | Bottom Lockstep controls | Palette | No | High |
| Choose Lockstep CbV | Use Call-by-Value in Lockstep | Lockstep controls | `stepperStrategyValue` | None | No | Bottom Lockstep controls | Palette | No | High |
| Load/restart Lockstep | Capture current program and build paired frames | Lockstep controls | `stepperLoad` | None | No | Bottom Lockstep controls | Palette | No | Very high |
| Lockstep Back | Move one exact frame backward | Lockstep controls | `stepperBack` | None | No | Bottom Lockstep controls | Palette | No | High |
| Lockstep Step | Move one frame forward | Lockstep controls | `stepperStep` | None | No | Bottom Lockstep controls | Palette | No | High |
| Lockstep Play/Pause | Auto-advance/pause frames | Lockstep controls | `stepperPlay` | None | No | Bottom Lockstep controls | Palette | No | High |
| Load/restart CEK | Inject current program into the machine | CEK controls | `machineLoad` | None | No | Bottom CEK controls | Palette | No | Very high |
| CEK Back | Restore previous pure machine state | CEK controls | `machineBack` | None | No | Bottom CEK controls | Palette | No | High |
| CEK Step | Execute one machine transition | CEK controls | `machineStep` | None | No | Bottom CEK controls | Palette | No | High |
| CEK Play/Pause | Auto-step/pause the machine | CEK controls | `machinePlay` | None | No | Bottom CEK controls | Palette | No | High |
| Navigate runtime provenance | Center/select the source block for control, environment, or continuation data | Generated CEK/Lockstep machine rows | Generated `[data-provenance-id]` elements | Enter or Space | No | Runtime views | None | No | High: generated role/button/focus behavior |

## Context-menu and status commands

| Command name | Purpose | Current visible locations | Current element IDs | Keyboard shortcut | Command-palette entry | Primary future location | Secondary permitted location | Whether it is duplicated | Migration risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Show Type and Value | Compute and show a term’s inferred type/value report | Lambda-term context menu | Registry ID `lambdaShowTypeAndValue`; fallback `.block-lambda-context-menu` | Context-menu keyboard behavior is Blockly/browser dependent; Escape closes fallback | No | Right inspector → Types; block context menu | Palette with selected-block precondition | No | High: current implementation uses `alert` and selected block context |
| Evaluate application — CbS | Open trace for the clicked application | Application context menu | Registry ID `lambdaVizCallByStructure` | Context-menu dependent | No; generic CbS palette command uses top-level program | Block context menu | Header Run and palette | Yes by behavior, different target | Very high |
| Evaluate application — CbV | Open trace for the clicked application | Application context menu | Registry ID `lambdaVizCallByValue` | Context-menu dependent | No; generic CbV palette command uses top-level program | Block context menu | Header Run and palette | Yes by behavior, different target | Very high |
| Download workspace screenshot | Rasterize current workspace blocks to PNG | Workspace context menu | Registry ID `lambdaDownloadScreenshot` | Context-menu dependent | No | Workspace context menu or overflow | Palette | No | High: async canvas/blob export |
| Set autosave interval | Persist a 2–20 minute delay and reschedule pending autosave | Settings → Autosave | `autosaveInterval`, `autosaveIntervalLabel` | Native range-key controls | No | Settings → Autosave | Status bar shows state only | No | High: persistence and pending timer |
| Show Problems from status | Open Bottom → Problems | Status bar problem count | `[data-activity="problems"]`, `statusProblemIcon`, `statusProblemCount` | Native button activation | Yes — `View: Show Problems` | Status bar | Bottom Problems and palette | Yes, intentional status drill-down | High |

## Current command-palette coverage

The palette currently contains 34 entries. It includes explicit routes for Code, Inferred Types, Typing Derivation, Outline, Problems, Output, and all four semantic/runtime views, plus re-run and arrange for the active semantic view, in addition to File, Edit, refresh, panel, perspective, Settings/theme, zoom, and synchronization commands. It does **not** yet contain examples, explicit light/dark selection, renderer selection, autosave interval, About, maximization, copy/print, machine/stepper transport, screenshot, or selected-block context actions.

The palette, HTML menus, activity/sidebar controls, and keyboard handlers do not share a single command registry. Migration should first establish reachability tests around the existing routes; replacing the wiring itself is outside this documentation step.

## Header/status refactor command-reachability audit

| Removed or moved surface | Commands affected | Proved reachable through |
| --- | --- | --- |
| Header quick-action icon row | Open, Save, Undo, Redo, CEK Run | File; workspace toolbar for Undo/Redo; primary labelled Run; palette and existing shortcuts |
| Edit top-level menu | Undo, Redo | Workspace toolbar; More; palette; Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z |
| Build top-level menu | Refresh output, inferred types, Problems | More; bottom tabs; palette; Ctrl/Cmd+Shift+B for refresh |
| Tools top-level menu | Examples and renderer selection | Labelled Examples menu; Settings → Block Appearance |
| Help top-level menu | About | More → About Block Lambda |
| Header command search | Command palette | More → Command Palette; Ctrl/Cmd+Shift+P; F1 |
| Header theme switch | Light/dark theme | Settings → Color Theme; command palette toggle |
| Status file item | Current file/project context | Product identity block in the header (`topbarFileName`) |
| Status autosave interval | Autosave timing | Settings → Autosave (`autosaveInterval` and `autosaveIntervalLabel`) |
| Status perspective/version/decorative items | Perspective selection and state | View menu and Settings → Perspective; `statusPerspective` remains a hidden state-update target |

No command ID, shortcut, palette route, `data-*` route, or responsive counterpart was removed. Examples retain all 12 `data-example-id` values; renderer choices retain all three `data-blockly-renderer` values; File, View, More, and Examples support Escape dismissal, and menu regression tests cover Arrow navigation.

## Remaining duplication candidates

1. Undo/Redo in More duplicate the tested workspace toolbar, palette, and shortcuts; the More copies can be removed later.
2. More-menu CbS/CbV/Lockstep entries duplicate the labelled Semantics tabs and palette; they can be removed once the palette is the established overflow surface.
3. View-menu perspective presets duplicate Settings; Presentation remains appropriate in View because F11 is a view mode.
4. Workspace custom zoom buttons duplicate Blockly-injected zoom controls.
5. Multiple sidebar/code/bottom close/restore buttons are responsive counterparts, not ordinary duplication, and must remain while drawer behavior depends on them.
