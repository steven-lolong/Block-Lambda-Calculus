# Command Inventory

## Scope and interpretation

This inventory describes the checked-out **Block Lambda Calculus** application. The requested `src/assets/js/block_minijava.ts` and `src/core/ui/app.ts` do not exist; the actual entry point is `src/assets/js/block_lambda.ts`, with command orchestration primarily in `src/core/ui/workbench.ts`, `layout.ts`, `visualizationPanel.ts`, `csekPanel.ts`, `contextMenus.ts`, `src/core/examples/lambdaExamples.ts`, and `src/core/renderer/toolbox.ts`.

“Duplicated” means the same operation currently has more than one persistent visible entry point. A command-palette entry or keyboard shortcut is permitted secondary access and does not by itself count as harmful visual duplication. Dialog buttons and context-sensitive controls are included because they perform application actions, even when they are only conditionally visible.

The header brand's `href="#"` has no application event handler and is therefore navigation markup rather than a command. Menu and submenu disclosure is included because it is keyboard- and ARIA-significant.

The future-location columns apply the information architecture in `REFRACTORING_CONSTRAINTS.md`; they are migration guidance, not a redesign implemented in this step.

## File, shell, and global commands

| Command name | Purpose | Current visible locations | Current element IDs | Keyboard shortcut | Command-palette entry | Primary future location | Secondary permitted location | Whether it is duplicated | Migration risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Toggle application menu | Open/close the compact header drawer | Header, at ≤900px | `menuToggle`, controls `topbarActions` | Escape closes | No | Header | None | No | High: responsive state and ARIA are coupled to `menu-open` |
| Open/close menu or submenu | Disclose File, Edit, View, Run, Build, Tools, Help, Examples, or Renderer choices | Header menu bar | Top-level triggers have no IDs; nested triggers are `examplesMenuButton` and `blocklyThemeMenuButton` | ArrowDown enters a top-level menu; ArrowUp/Down moves among items; Escape/outside click closes | No | Header | None | No | High: focus navigation, popup ancestry, `hidden`, and `aria-expanded` are coupled |
| Open command palette | Search and execute registered commands | Header search control | `commandPaletteTrigger`, `commandPalette` | Ctrl/Cmd+Shift+P; F1; Escape closes | The palette is the command | Header/overflow | Shortcut | No | High: dialog focus, listbox state, and global key handling |
| New/Clear workspace | Clear all blocks and reset the workspace filename | File menu; workspace toolbar trash icon | `clearWorkspace` plus `[data-command-target="clearWorkspace"]` | Ctrl/Cmd+N | Yes — `File: New Workspace` | Header → File | Palette and shortcut | Yes | High: destructive and currently has no confirmation |
| Open workspace | Pick and deserialize a `.blc` file | File menu; header quick action; Project sidebar | `loadWorkspace` plus proxies using `[data-command-target]` | Ctrl/Cmd+O | Yes — `File: Open Workspace…` | Header → File | Palette and shortcut | Yes | High: file picker, serialization, autosave update |
| Save workspace as | Name, serialize, and download a `.blc` file | File menu; header quick action; Project sidebar | `saveWorkspace`, `saveNameDialog`, `saveNameInput` plus proxies | Ctrl/Cmd+S | Yes — `File: Save Workspace As…` | Header → File | Palette and shortcut | Yes | High: dialog and browser download behavior |
| Confirm save | Complete Save As with the normalized filename | Save dialog | No command ID; submit button `value="save"` | Enter through dialog form | No | Save dialog | None | No | Medium: dialog return value is behavioral |
| Cancel save | Close Save As without a download | Save dialog, including close icon | No command ID; submit buttons `value="cancel"` | Escape/native dialog behavior | No | Save dialog | None | Yes within dialog | Low |
| Recover autosave | Load locally persisted Blockly JSON | File menu; Project sidebar | `loadAutosave` plus `[data-command-target="loadAutosave"]` | None | Yes — `File: Recover Local Autosave` | Header → File | Palette | Yes | High: storage error/recovery path |
| Undo | Undo Blockly history | Edit menu; header quick action; workspace toolbar | `undoWorkspace`, `workspaceUndo`, proxy `[data-command-target="undoWorkspace"]` | Ctrl/Cmd+Z outside editable controls | Yes — `Edit: Undo` | Workspace toolbar | Palette and shortcut | Yes | Medium: focus-sensitive keyboard behavior |
| Redo | Redo Blockly history | Edit menu; header quick action; workspace toolbar | `redoWorkspace`, `workspaceRedo`, proxy `[data-command-target="redoWorkspace"]` | Ctrl/Cmd+Shift+Z outside editable controls | Yes — `Edit: Redo` | Workspace toolbar | Palette and shortcut | Yes | Medium |
| Toggle light/dark theme | Switch shell and Blockly theme | Header switch | `themeToggle` | None | Yes — `Preferences: Toggle Color Theme` | Settings → Theme | Palette | No | High: persistence, browser theme color, Blockly rerender |
| Select dark theme | Set dark rather than toggle | Settings sidebar | `[data-theme-mode="dark"]` | None | No | Settings → Theme | Palette | Paired with header toggle | Medium |
| Select light theme | Set light rather than toggle | Settings sidebar | `[data-theme-mode="light"]` | None | No | Settings → Theme | Palette | Paired with header toggle | Medium |
| About | Open product/technology information | Help menu | `aboutApp`, `aboutDialog` | Escape/native dialog close | No | Header → Overflow/Help | Palette | No | Low |
| Close About | Close the About dialog | About dialog | `closeAboutDialog` | Escape/native dialog close | No | About dialog | None | No | Low |

## Examples and renderer commands

All example commands share `examplesMenuButton`/`examplesSubMenu`, a `[data-example-id]` item, and the `exampleLoadDialog` replace/merge flow.

| Command name | Purpose | Current visible locations | Current element IDs | Keyboard shortcut | Command-palette entry | Primary future location | Secondary permitted location | Whether it is duplicated | Migration risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Open Identity Function example | Load `identity-function` | Tools → Open Example submenu | No item ID; `[data-example-id="identity-function"]` | None | No | Header → Examples | Palette | No | High: serialized example identity |
| Open Currying & Closures example | Load `currying-closures` | Tools → Open Example submenu | `[data-example-id="currying-closures"]` | None | No | Header → Examples | Palette | No | High |
| Open Function Composition example | Load `function-composition` | Tools → Open Example submenu | `[data-example-id="function-composition"]` | None | No | Header → Examples | Palette | No | High |
| Open Apply Twice example | Load `apply-twice` | Tools → Open Example submenu | `[data-example-id="apply-twice"]` | None | No | Header → Examples | Palette | No | High |
| Open Twice Twice example | Load `twice-twice` | Tools → Open Example submenu | `[data-example-id="twice-twice"]` | None | No | Header → Examples | Palette | No | High |
| Open Let-Polymorphism example | Load `let-polymorphism` | Tools → Open Example submenu | `[data-example-id="let-polymorphism"]` | None | No | Header → Examples | Palette | No | High |
| Open Copy vs Lookup example | Load `copy-vs-lookup` | Tools → Open Example submenu | `[data-example-id="copy-vs-lookup"]` | None | No | Header → Examples | Palette | No | High |
| Open Shadowing example | Load `shadowing` | Tools → Open Example submenu | `[data-example-id="shadowing"]` | None | No | Header → Examples | Palette | No | High |
| Open Normal Form example | Load `normal-form-binder` | Tools → Open Example submenu | `[data-example-id="normal-form-binder"]` | None | No | Header → Examples | Palette | No | High |
| Open Factorial 5 example | Load `simple-factorial` | Tools → Open Example submenu | `[data-example-id="simple-factorial"]` | None | No | Header → Examples | Palette | No | High |
| Open Fibonacci 6 example | Load `fibonacci` | Tools → Open Example submenu | `[data-example-id="fibonacci"]` | None | No | Header → Examples | Palette | No | High |
| Open GCD (Euclid) example | Load `gcd-euclid` | Tools → Open Example submenu | `[data-example-id="gcd-euclid"]` | None | No | Header → Examples | Palette | No | High |
| Replace with example | Clear then load selected example | Example-load dialog | `exampleLoadDialog`; submit `value="replace"` | Enter if default browser behavior selects it | No | Example-load dialog | None | No | High: destructive replacement |
| Merge example | Append example blocks to the workspace | Example-load dialog | `exampleLoadDialog`; submit `value="merge"` | None | No | Example-load dialog | None | No | High: block IDs/positions and serialization |
| Cancel example load | Preserve current workspace | Example-load dialog and close icon | `exampleLoadDialog`; submit `value="cancel"` | Escape/native dialog close | No | Example-load dialog | None | Yes within dialog | Low |
| Select Tude renderer | Reinject Blockly with the project renderer | Tools → Blockly Renderer; Settings sidebar | `[data-blockly-renderer="tude"]`, `blocklyThemeMenuButton`, `blocklyThemeSubMenu` | None | No | Settings → Renderer | Palette | Yes | Very high: workspace disposal/reinjection and connector geometry |
| Select Zelos renderer | Reinject Blockly with Zelos | Tools submenu; Settings sidebar | `[data-blockly-renderer="zelos"]` | None | No | Settings → Renderer | Palette | Yes | High |
| Select Thrasos renderer | Reinject Blockly with Thrasos | Tools submenu; Settings sidebar | `[data-blockly-renderer="thrasos"]` | None | No | Settings → Renderer | Palette | Yes | High |

## View, activities, perspectives, and layout

| Command name | Purpose | Current visible locations | Current element IDs | Keyboard shortcut | Command-palette entry | Primary future location | Secondary permitted location | Whether it is duplicated | Migration risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Toggle primary sidebar | Show/hide current left activity view | View menu; sidebar close; workspace restore | `toggleToolboxPanel`, `showToolboxFromWorkspace`, `[data-panel-command="sidebar"]` | Ctrl/Cmd+B | Yes — `View: Toggle Primary Sidebar` | Header → View | Palette and shortcut | Yes | Very high: compact drawer mutual exclusion and persistence |
| Show Blocks activity | Open sidebar on block search/toolbox | Activity bar | `[data-activity="blocks"]`, `[data-sidebar-view="blocks"]` | `/` also opens and focuses search | Yes — `View: Show Blocks` | Left panel | Palette and `/` | No | High: activity delegation and compact drawer state |
| Show Project activity | Open workspace-file view | Activity bar | `[data-activity="files"]`, `[data-sidebar-view="files"]` | None | Yes — `View: Show Project` | Header → File/project identity | Palette | No | Medium |
| Show Problems activity | Open diagnostics sidebar | Activity bar; status bar problems control | `[data-activity="problems"]`, `[data-sidebar-view="problems"]` | None | Palette opens bottom Problems instead: `View: Show Problems` | Status bar problem count | Palette; bottom Problems | Yes/semantically split | High: sidebar and bottom routes differ |
| Show Run activity | Open run/debug sidebar | Activity bar | `[data-activity="run"]`, `[data-sidebar-view="run"]` | None | No direct activity command | Header → Run | Palette | No | Medium |
| Show Settings activity | Open settings sidebar | Activity bar | `[data-activity="settings"]`, `[data-sidebar-view="settings"]` | None | No | Settings | Palette | No | Medium |
| Toggle Code/Inspector panel | Show/hide right panel | View menu; panel close; workspace restore | `toggleCodePanel`, `showCodeFromWorkspace`, `[data-panel-command="code"]` | Ctrl/Cmd+Alt+C | Yes — `View: Toggle Code and Inspector` | Header → View | Palette and shortcut | Yes | Very high: compact drawer, phone scroll/focus, persistence |
| Maximize/restore Code/Inspector | Make the right panel the sole main region | Inspector header | `maximizeCodePanel` | None | No | Header → View or inspector overflow | Palette | No | Very high: `code-maximized` CSS and persisted state |
| Toggle bottom panel | Open/close bottom tools | View menu; workspace toolbar; close button | `toggleVizDock`, `vizCollapse`, `[data-panel-command="bottom"]` | Ctrl/Cmd+J | Yes — `View: Toggle Bottom Panel` | Header → View | Palette and shortcut | Yes | Very high: `data-open`, mobile drawer, Blockly resize |
| Maximize/restore bottom panel | Toggle enlarged bottom tools | Bottom panel header | `vizMaximize` | None | No | Bottom panel | Palette | No | High: `data-maximized`, mobile behavior, persistence |
| Apply Edit perspective | Blocks sidebar + code, bottom closed | View menu; Settings select | `perspectiveSelect`, `[data-perspective="edit"]` | None | Yes — `Perspective: Edit` | Settings → Perspectives | Header → View; palette | Yes | Very high: multi-panel transaction |
| Apply Debug perspective | Run sidebar + code + Lockstep bottom tab | View menu; Settings select | `perspectiveSelect`, `[data-perspective="debug"]` | None | Yes — `Perspective: Debug` | Settings → Perspectives | Header → View; palette | Yes | Very high |
| Apply Type Analysis perspective | Problems sidebar + code + Types bottom tab | View menu; Settings select | `perspectiveSelect`, `[data-perspective="types"]` | None | Yes — `Perspective: Type Analysis` | Settings → Perspectives | Header → View; palette | Yes | Very high |
| Enter/leave Presentation perspective | Hide chrome/panels, then restore previous layout | View menu; workspace toolbar | `presentationMode`, `perspectiveSelect`, `[data-perspective="presentation"]` | F11 | Yes — `Perspective: Presentation` | Header → View | Palette and F11 | Yes | Very high: snapshot/restore and `presentation-mode` CSS |
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
| Refresh generated output/type analysis | Run inference and regenerate current output | Build menu | `refreshCode` | Ctrl/Cmd+Shift+B | Yes — `Build: Refresh Generated Output` | Inspector overflow/Types | Palette and shortcut | No | High: inference, comments, diagnostics, outline |
| Synchronize code from workspace | Replace Lambda editor text with generated workspace text | Inspector header | `synchronizeCode` | None | Yes — `Code: Synchronize from Workspace` | Right inspector → Code | Palette | No | High: text/block synchronization guard |
| Show Code/Lambda editor | Activate editable Lambda text tab | Right-panel tabs | `codeTargetCode`, `lambdaEditorPane`, `[data-code-target="code"]` | Arrow/Home/End within tablist | No | Right inspector → Code | Palette | No | High: live 450ms parse back into blocks |
| Show formal derivation | Activate formal typing derivation | Right-panel tabs | `codeTargetFormal`, `codeOutput`, `[data-code-target="formal"]` | Arrow/Home/End | No | Right inspector overflow or Types | Palette | No | High: generated HTML and print path |
| Show selected-block inspector | Display term/type/status/issues for selected block | Right-panel tabs | `codeTargetInspector`, `blockInspectorPane`, `[data-code-target="inspector"]` | Arrow/Home/End | No | Right inspector → Types/selection | Palette | No | High: selection listener and diagnostics |
| Show outline | Display navigable program tree | Right-panel tabs | `codeTargetOutline`, `outlinePane`, `programOutline`, `[data-code-target="outline"]` | Arrow/Home/End | No | Right inspector → Outline | Palette | No | High: generated tree and block IDs |
| Copy generated output | Copy raw code/formal text to clipboard | Inspector header; hidden for Inspector/Outline tabs | `copyCode` | None | No | Right inspector → Code overflow | Palette | No | Medium: clipboard and temporary accessible label |
| Print derivation | Print only the formal derivation | Inspector header, only on Formal tab | `printDerivation` | None | No | Right inspector → Types/derivation overflow | Palette | No | High: print-only classes and DOM rewriting |
| Run type analysis / show Types | Open bottom Types tab (analysis itself is kept current elsewhere) | Build menu; bottom tab | `[data-bottom-tab="types"]`, runtime `bottomTab-types` | Arrow/Home/End in bottom tabs | Yes — `View: Show Inferred Types` | Right inspector → Types | Bottom panel and palette | Yes | Medium |
| Show Problems panel | Open bottom type-inference diagnostics | Build menu; Problems sidebar footer; bottom tab; palette | runtime `bottomTab-problems`; `[data-bottom-tab="problems"]` | Arrow/Home/End in bottom tabs | Yes — `View: Show Problems` | Bottom panel → Problems | Status bar and palette | Yes | High: counts and two diagnostics surfaces |
| Show Output panel | Open workbench/generator messages | Bottom tab only | runtime `bottomTab-output`; `[data-kind="output"]` | Arrow/Home/End | Yes — `View: Show Output` | Bottom panel → Output | Palette | No | Medium |
| Focus problem block | Select and center the block associated with a diagnostic | Generated sidebar and bottom problem rows | Generated `[data-block-id]` `.problem-row`; containers `sidebarProblems`, `problemsList` | Native button activation | No | Problems list | Palette only if context can be represented | Duplicated rows | High: block IDs and workspace selection |
| Focus typed term | Select and center a top-level block from Types | Generated bottom type rows | Generated `.type-row`; container `typesList` | Native button activation | No | Right inspector → Types | Bottom Types if retained | No | High |
| Focus outline item | Select and center a block from program structure | Generated outline tree | Generated `.outline-item[data-block-id]`; `programOutline` | Native button activation | No | Right inspector → Outline | None | No | High: tree semantics and block IDs |

## Runtime and bottom-panel commands

| Command name | Purpose | Current visible locations | Current element IDs | Keyboard shortcut | Command-palette entry | Primary future location | Secondary permitted location | Whether it is duplicated | Migration risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Run Call-by-Structure trace | Open/render the default substitution strategy | Run menu; Run sidebar; bottom tab; block context menu for a specific application | `[data-bottom-tab="structure"]`, runtime `bottomTab-structure` | Arrow/Home/End in tabs | Yes — `Run: Call-by-Structure Trace` | Header → Run / bottom Semantics | Palette; context menu | Yes | Very high: selected/top-level program distinction |
| Run Call-by-Value trace | Open/render value-first substitution | Run menu; Run sidebar; bottom tab; application context menu | `[data-bottom-tab="value"]`, runtime `bottomTab-value` | Arrow/Home/End | Yes — `Run: Call-by-Value Trace` | Header → Run / bottom Semantics | Palette; context menu | Yes | Very high |
| Open/run CEK machine | Open machine and auto-load first program | Run menu; header quick Run; Run sidebar; bottom tab | `[data-bottom-tab="machine"]`, runtime `bottomTab-machine` | Arrow/Home/End | Yes — `Run: CEK Machine` | Workspace toolbar primary Run | Header Run menu and palette | Yes | Very high: current language-default primary route |
| Open/run Lockstep debugger | Open lockstep and auto-load first program | Run menu; Run sidebar; bottom tab | `[data-bottom-tab="stepper"]`, runtime `bottomTab-stepper` | Arrow/Home/End | Yes — `Run: Lockstep Debugger` | Bottom panel → Semantics/runtime | Header Run menu and palette | Yes | Very high |
| Re-run active runtime view | Recompute trace, stepper, or machine | Bottom panel tools; hidden for utility tabs | `vizRerun` | None | No | Bottom panel | Palette | No | High: dispatch depends on active tab |
| Arrange active trace | Lay out trace/stepper blocks | Bottom panel tools; hidden for utility and machine tabs | `vizArrange` | None | No | Bottom panel | Palette | No | High: Blockly positions/rendering |
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
| Set autosave interval | Persist a 2–20 minute delay and reschedule pending autosave | Status bar slider | `autosaveInterval`, `autosaveIntervalLabel` | Native range-key controls | No | Settings → Autosave | Status bar may show state, not control | No | High: persistence and pending timer |
| Show Problems from status | Open Problems activity/sidebar | Status bar problem count | `[data-activity="problems"]`, `statusProblemIcon`, `statusProblemCount` | Native button activation | Palette’s Show Problems opens bottom panel instead | Status bar | Palette/bottom Problems | Yes/semantically split | High |

## Current command-palette coverage

The palette currently contains 28 entries: four File, two Edit, one Build refresh, three panel toggles, five View/activity outputs, four runtime commands, four perspectives, one theme toggle, three zoom commands, and code synchronization. It does **not** contain examples, explicit light/dark selection, renderer selection, autosave interval, About, maximization, right-panel tab selection, copy/print, re-run/arrange, machine/stepper transport, screenshot, or selected-block context actions.

The palette, HTML menus, activity/sidebar controls, and keyboard handlers do not share a single command registry. Migration should first establish reachability tests around the existing routes; replacing the wiring itself is outside this documentation step.

## Duplication candidates for a later refactor

These visible duplicates can be removed later once the retained element, menu/palette route, responsive visibility, and event wiring are regression-tested:

1. Header quick Open/Save versus the File menu; retain File as primary and palette/shortcuts as secondary.
2. Header and Edit-menu Undo/Redo versus the workspace toolbar; retain the workspace toolbar and palette/shortcuts.
3. Project-sidebar Open/Save/Recover versus File; retain File and make the project view informational.
4. Run-sidebar copies of CbS/CbV/CEK/Lockstep versus the Header Run menu and bottom tabs; retain one primary run location plus the bottom tool being controlled.
5. Build-menu Problems/Types versus the bottom/right analysis locations.
6. Tools-menu renderer choices versus Settings; retain Settings.
7. View-menu perspective presets versus Settings; retain Settings, with Presentation allowed in View because F11 is a view mode.
8. Workspace custom zoom buttons versus Blockly-injected zoom controls; retain one tested system, not both.
9. Multiple sidebar/code/bottom close/restore buttons are responsive counterparts, not automatically removable duplicates. They can only be consolidated after compact and phone restoration tests exist.
