# Visual Comparison — Block Lambda Calculus Workbench

## Review header

| Field | Value |
| --- | --- |
| Review date | 2026-07-22 |
| Branch | `ui-domain-update` |
| Commit reviewed | `549fc8508d32d8937867b1767c3026932b7e0e70` — "fix: address final Block-Lambda-Calculus workbench review" |
| Application version | Not versioned independently; `package.json` `"version": "1.0.0"` |
| Browser | Chromium 149.0.7827.55 (Playwright-managed) |
| Capture framework | Playwright Test 1.61.1 — the project's existing framework; no new framework was introduced |
| Capture spec | `tests/ui/workbench.finalVerification.spec.ts` (new; separate from the pixel-diff regression suite `tests/ui/workbench.visual.spec.ts`) |
| Representative program | Built-in example **Currying & Closures** (`data-example-id="currying-closures"`): `let add = \x. \y. x + y in let inc = add 1 in inc 41` ⇒ `42`. Exercises two `let` bindings, nested lambda abstraction (closures), function application, a numeric operator, and variables. Chosen because it is a genuine named example (not typed text), is small enough to stay legible at every viewport, and is the same example already proven to render cleanly by the existing reduction-trace regression baseline. |
| Supplementary program (grammar-family screenshots only) | Custom text `letrec f = \x. if (x < 1) or false then 0 else x + (f (x - 1)) in let id = \y. y in id (f 3)` — the same text already used by the existing `light/dark grammatical block families` regression baseline. Used only for the two dedicated grammar-family screenshots because it is the one input that connects every block family (letrec, abstraction, if, comparison, boolean operator/literal, arithmetic, let, application, variable) in a single term. |
| Themes tested | Light, Dark |
| Perspectives tested | Edit (default); Semantics/runtime views reached directly via the bottom panel rather than the Debug/Type Analysis perspective presets, since the presets are already exercised by the existing regression suite (`workbench.spec.ts`) — this package focuses on visual states, not perspective-switching logic |
| Semantic views tested | Call-by-Structure trace, Call-by-Value trace, CEK machine (load + step), Lockstep (rewrite ↔ machine) |
| Screenshot count | 44 |
| Screenshot directory | `docs/ui-refactor/screenshots/final/` |

### A note on capture mechanics

The project's dev server (`webpack.config.js`, `devServer.static: './docs'`) watches `docs/` and live-reloads the page on any file change under it. Writing screenshots directly into `docs/ui-refactor/screenshots/final/` while the browser is mid-interaction was found, during this task, to trigger exactly that reload — silently resetting JS-applied state (theme, loaded program, open menus) between actions and producing hard-to-diagnose flakiness. The capture spec therefore writes to a scratch directory (`test-results/final-verification-screenshots/`, already git-ignored) during the run and copies the finished set into `docs/ui-refactor/screenshots/final/` once, in `test.afterAll`, after no further page interaction depends on the page surviving. See `tests/ui/workbench.finalVerification.spec.ts` for the full explanation in code comments.

---

## 1. Desktop workbench

| Screenshot | Viewport | Theme | Perspective | Inspector tab | Bottom tab | Visible panels | Loaded program | Feature verified | Design principle | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [1920x1080-light-editing-default.png](screenshots/final/1920x1080-light-editing-default.png) | 1920×1080 | Light | Edit | Code | — (closed) | Toolbox, Inspector | Starter program (`λx. x`, 2 blocks) | Default editing state at the widest supported viewport | Neutral shell, one product accent, no decorative ornament | Verified |
| [1920x1080-light-editing-program-loaded.png](screenshots/final/1920x1080-light-editing-program-loaded.png) | 1920×1080 | Light | Edit | Code | — (closed) | Toolbox, Inspector | Currying & Closures | Representative program loaded and legible at full HD+ | Grammar-aware blocks readable at scale | Verified |
| [1920x1080-dark-editing-default.png](screenshots/final/1920x1080-dark-editing-default.png) | 1920×1080 | Dark | Edit | Code | — (closed) | Toolbox, Inspector | Starter program | Dark theme at widest viewport | Dark surfaces/contrast hold at scale | Verified |
| [1920x1080-dark-editing-program-loaded.png](screenshots/final/1920x1080-dark-editing-program-loaded.png) | 1920×1080 | Dark | Edit | Code | — (closed) | Toolbox, Inspector | Currying & Closures | Program legible in dark theme at full HD+ | Block text/connectors readable in dark | Verified |
| [1440x900-light-editing-default.png](screenshots/final/1440x900-light-editing-default.png) | 1440×900 | Light | Edit | Code | — (closed) | Toolbox, Inspector | Starter program | Default state at the principal desktop breakpoint | Header commands legible as text, not icons | Verified |
| [1440x900-light-editing-program-loaded.png](screenshots/final/1440x900-light-editing-program-loaded.png) | 1440×900 | Light | Edit | Code | — (closed) | Toolbox, Inspector | Currying & Closures | Both side panels visible simultaneously with a program loaded | No panel fights for space; three-column grid holds | Verified |
| [1440x900-dark-editing-default.png](screenshots/final/1440x900-dark-editing-default.png) | 1440×900 | Dark | Edit | Code | — (closed) | Toolbox, Inspector | Starter program | Dark theme at principal breakpoint | Theme pairing for 1440×900 (required combo) | Verified |
| [1440x900-dark-editing-program-loaded.png](screenshots/final/1440x900-dark-editing-program-loaded.png) | 1440×900 | Dark | Edit | Code | — (closed) | Toolbox, Inspector | Currying & Closures | Program legible in dark theme at principal breakpoint | Theme pairing for 1440×900 (required combo) | Verified |
| [1024x768-light-editing-default.png](screenshots/final/1024x768-light-editing-default.png) | 1024×768 | Light | Edit | Code | — (closed) | Neither (compact-overlay default) | Starter program | Compact-breakpoint default: the ≤1240px compact-overlay rule suppresses both side panels simultaneously when both are nominally "visible" in stored state, leaving only the workspace with the two responsive restore buttons | Genuine, previously reviewed behavior (`FINAL_REVIEW.md` §11), not a defect | Verified |
| [1024x768-light-editing-program-loaded.png](screenshots/final/1024x768-light-editing-program-loaded.png) | 1024×768 | Light | Edit | Code | — (closed) | Inspector (overlay) | Currying & Closures | Inspector reachable as an overlay at the compact breakpoint | Overlay drawer legible over a loaded program | Verified |
| [1024x768-dark-editing-default.png](screenshots/final/1024x768-dark-editing-default.png) | 1024×768 | Dark | Edit | Code | — (closed) | Neither (compact-overlay default) | Starter program | Dark theme pairing at 1024×768 (required combo) | Theme pairing for 1024×768 (required combo) | Verified |
| [1024x768-dark-bottom-semantics.png](screenshots/final/1024x768-dark-bottom-semantics.png) | 1024×768 | Dark | Custom | Code | Semantics → CEK machine (loaded) | Neither side panel; Bottom panel | Currying & Closures | Bottom panel docks normally (not a drawer) at this breakpoint | Bottom panel is unaffected by the side-panel compact-overlay rule | Verified |

## 2. Inspector

All at 1440×900, light theme, Currying & Closures loaded, unless noted.

| Screenshot | Active tab/state | Feature verified | Design principle | Result |
| --- | --- | --- | --- | --- |
| [1440x900-light-toolbox-search.png](screenshots/final/1440x900-light-toolbox-search.png) | Toolbox search = "boolean" (2 cards match) | Toolbox search filtering | Search narrows results without losing category structure | Verified |
| [1440x900-light-toolbox-category-expanded.png](screenshots/final/1440x900-light-toolbox-category-expanded.png) | "Operators" category expanded | Collapsible toolbox categories | Disclosure state is visually clear | Verified |
| [1440x900-light-inspector-types.png](screenshots/final/1440x900-light-inspector-types.png) | Inspector → Types (Inferred types) | Static type-inference view | Inferred type shown per top-level term | Verified |
| [1440x900-light-inspector-outline.png](screenshots/final/1440x900-light-inspector-outline.png) | Inspector → Outline | Program-structure tree | Outline reflects nested block structure | Verified |
| [1440x900-light-inspector-formal-derivation.png](screenshots/final/1440x900-light-inspector-formal-derivation.png) | Inspector → Types → Typing derivation | Formal typing-derivation view | Static derivation distinct from the runtime/semantic views | Verified |
| [1440x900-light-toolbox-hidden.png](screenshots/final/1440x900-light-toolbox-hidden.png) | Toolbox panel hidden | Toolbox can be hidden independently | Workspace reclaims the freed width | Verified |
| [1440x900-light-inspector-hidden.png](screenshots/final/1440x900-light-inspector-hidden.png) | Inspector/code panel hidden | Inspector can be hidden independently | Workspace reclaims the freed width | Verified |
| [1440x900-light-command-palette-open.png](screenshots/final/1440x900-light-command-palette-open.png) | Command palette dialog open | Command palette | Searchable command list, no visual clutter | Verified |
| [1440x900-light-file-menu-open.png](screenshots/final/1440x900-light-file-menu-open.png) | File menu popup open | Header menu | Commands grouped under one clear primary location | Verified |
| [1440x900-light-view-menu-open.png](screenshots/final/1440x900-light-view-menu-open.png) | View menu popup open | Header menu | Panel/perspective commands grouped together | Verified |

## 3. Evaluation and semantics

All at 1440×900, dark theme, Currying & Closures loaded, unless noted (one light-theme pairing included for theme coverage).

| Screenshot | Active state | Feature verified | Design principle | Result |
| --- | --- | --- | --- | --- |
| [1440x900-dark-semantics-reduction-structure.png](screenshots/final/1440x900-dark-semantics-reduction-structure.png) | Bottom → Semantics → Call-by-Structure, opened via the application block's context menu | Substitution-style reduction trace | Runtime output lives in the bottom panel, distinct from static inspection | Verified |
| [1440x900-dark-semantics-reduction-value.png](screenshots/final/1440x900-dark-semantics-reduction-value.png) | Bottom → Semantics → Call-by-Value | Value-first reduction trace | Same as above, contrasting evaluation strategy | Verified |
| [1440x900-dark-semantics-machine-loaded.png](screenshots/final/1440x900-dark-semantics-machine-loaded.png) | Bottom → Semantics → CEK machine, Load clicked | Abstract-machine state (Control, Environment, Kontinuation) | Abstract-machine views are grouped and clearly labelled | Verified |
| [1440x900-dark-semantics-machine-stepped.png](screenshots/final/1440x900-dark-semantics-machine-stepped.png) | CEK machine, one Step taken | Runtime state changes visibly after a step | Execution state is distinguishable from the initial load | Verified |
| [1440x900-dark-semantics-lockstep.png](screenshots/final/1440x900-dark-semantics-lockstep.png) | Bottom → Semantics → Lockstep, Load clicked | Rewrite-and-machine operational correspondence | Two synchronized panes (rewrite term + CEK machine) in one view | Verified |
| [1440x900-dark-bottom-maximized.png](screenshots/final/1440x900-dark-bottom-maximized.png) | Bottom panel maximized (Lockstep) | Maximize control | Maximized state gives runtime views full vertical room | Verified |
| [1440x900-dark-bottom-restored.png](screenshots/final/1440x900-dark-bottom-restored.png) | Bottom panel restored | Restore control | Restore returns to the prior, non-maximized layout | Verified |
| [1440x900-light-semantics-machine-loaded.png](screenshots/final/1440x900-light-semantics-machine-loaded.png) | Light theme, CEK machine Load | Light-theme pairing for the CEK machine view | Semantic/runtime panels remain usable in light theme | Verified |

**Known limitation:** Store, Continuation-as-a-separate-view, and Closure-as-a-separate-view are not independently implemented — this CEK machine (not CESK) exposes Control, Environment, and Kontinuation only; the Kontinuation stack *is* the continuation view, and there is no separate Store or Closure panel. Not fabricated for this package; recorded as Not Applicable in the checklist below.

## 4. Bottom panel

At 1440×900, light theme, Currying & Closures loaded.

| Screenshot | Active state | Feature verified | Design principle | Result |
| --- | --- | --- | --- | --- |
| [1440x900-light-bottom-problems.png](screenshots/final/1440x900-light-bottom-problems.png) | Bottom → Problems (0 issues) | Diagnostics panel, empty state | Concise, specific empty-state message | Verified |
| [1440x900-light-bottom-output.png](screenshots/final/1440x900-light-bottom-output.png) | Bottom → Output, populated via "Refresh Generated Output" | Workbench/generator message log | Timestamped, toned log entries | Verified |

Bottom-panel **closed** and **Semantics active** states are already demonstrated by the Desktop-workbench default screenshots (closed, e.g. `1440x900-light-editing-default.png`) and the Evaluation-and-semantics screenshots above (Semantics active); they are cross-referenced here rather than duplicated, per the instruction to avoid redundant captures.

## 5. Tablet (768×1024)

| Screenshot | Theme | State | Feature verified | Result |
| --- | --- | --- | --- | --- |
| [768x1024-light-tablet-portrait.png](screenshots/final/768x1024-light-tablet-portrait.png) | Light | Portrait default (hamburger header active, both side panels default-hidden) | Tablet-portrait default layout | Verified |
| [768x1024-light-tablet-toolbox.png](screenshots/final/768x1024-light-tablet-toolbox.png) | Light | Toolbox drawer opened | Toolbox reachable as a drawer on tablet | Verified |
| [768x1024-dark-tablet-program-loaded.png](screenshots/final/768x1024-dark-tablet-program-loaded.png) | Dark | Program loaded, code/inspector drawer opened | Code remains editable/inspectable on tablet; dark-theme tablet coverage | Verified |

## 6. Mobile (390×844)

| Screenshot | Theme | State | Feature verified | Result |
| --- | --- | --- | --- | --- |
| [390x844-light-mobile-default.png](screenshots/final/390x844-light-mobile-default.png) | Light | Default; `.workspace-run-button` visible in the workspace toolbar | Primary Run command remains reachable on mobile without opening any menu | Verified |
| [390x844-light-mobile-code-drawer.png](screenshots/final/390x844-light-mobile-code-drawer.png) | Light | Code/inspector drawer opened | Inspector reachable as a full-width drawer on phone | Verified |
| [390x844-light-mobile-nav-menu-open.png](screenshots/final/390x844-light-mobile-nav-menu-open.png) | Light | Hamburger navigation menu open | All header commands remain reachable behind the hamburger | Verified |
| [390x844-dark-mobile-toolbox-drawer.png](screenshots/final/390x844-dark-mobile-toolbox-drawer.png) | Dark | Toolbox drawer opened | Toolbox reachable as a drawer on phone; dark-theme coverage | Verified |
| [390x844-dark-mobile-bottom-panel.png](screenshots/final/390x844-dark-mobile-bottom-panel.png) | Dark | Bottom panel opened (fixed overlay) | Bottom panel becomes a fixed drawer at ≤620px | Verified |
| [390x844-dark-mobile-program-loaded.png](screenshots/final/390x844-dark-mobile-program-loaded.png) | Dark | Currying & Closures loaded via the hamburger → Examples menu | Example loading works through the compact/hamburger command path | Verified |

No panel was found permanently inaccessible and no duplicate global control appeared at either mobile state, consistent with the existing accessibility suite's per-viewport assertions.

## 7. Theme comparison

The hard requirement (both themes represented at 1920×1080, 1440×900, and 1024×768) is satisfied by the paired screenshots in §1. Additional cross-theme pairs, for direct side-by-side reference:

| Context | Light | Dark |
| --- | --- | --- |
| Editing, default, 1920×1080 | [1920x1080-light-editing-default.png](screenshots/final/1920x1080-light-editing-default.png) | [1920x1080-dark-editing-default.png](screenshots/final/1920x1080-dark-editing-default.png) |
| Editing, program loaded, 1920×1080 | [1920x1080-light-editing-program-loaded.png](screenshots/final/1920x1080-light-editing-program-loaded.png) | [1920x1080-dark-editing-program-loaded.png](screenshots/final/1920x1080-dark-editing-program-loaded.png) |
| Editing, default, 1440×900 | [1440x900-light-editing-default.png](screenshots/final/1440x900-light-editing-default.png) | [1440x900-dark-editing-default.png](screenshots/final/1440x900-dark-editing-default.png) |
| Editing, program loaded, 1440×900 | [1440x900-light-editing-program-loaded.png](screenshots/final/1440x900-light-editing-program-loaded.png) | [1440x900-dark-editing-program-loaded.png](screenshots/final/1440x900-dark-editing-program-loaded.png) |
| Editing, default, 1024×768 | [1024x768-light-editing-default.png](screenshots/final/1024x768-light-editing-default.png) | [1024x768-dark-editing-default.png](screenshots/final/1024x768-dark-editing-default.png) |
| CEK machine loaded, 1440×900 | [1440x900-light-semantics-machine-loaded.png](screenshots/final/1440x900-light-semantics-machine-loaded.png) | [1440x900-dark-semantics-machine-loaded.png](screenshots/final/1440x900-dark-semantics-machine-loaded.png) |
| Grammar-family blocks, 1440×900 | [1440x900-light-grammar-families.png](screenshots/final/1440x900-light-grammar-families.png) | [1440x900-dark-grammar-families.png](screenshots/final/1440x900-dark-grammar-families.png) |

In every pair: block text stays readable, connector shapes stay visible, panel boundaries stay clear, and the seven grammatical color families remain distinguishable from each other.

## 8. Special states

| Screenshot | State | Feature verified | Result |
| --- | --- | --- | --- |
| [1440x900-light-special-focus-visible.png](screenshots/final/1440x900-light-special-focus-visible.png) | "File" menu trigger keyboard-focused | `:focus-visible` ring (`box-shadow: var(--focus-ring)`) is visible and is not conveyed by color alone (adds a shadow ring, not just a color shift) | Verified |
| [1440x900-light-grammar-families.png](screenshots/final/1440x900-light-grammar-families.png) | Supplementary program loaded, zoom-to-fit | Every implemented grammar family (structure, bindings, expressions, operations, control, values, semantics) connected in one term | Verified |
| [1440x900-dark-grammar-families.png](screenshots/final/1440x900-dark-grammar-families.png) | Same, dark theme | Same, dark-theme pairing | Verified |

---

## Final visual checklist

| Item | Status | Evidence |
| --- | --- | --- |
| No ambiguous icon row at 1440px | Verified | `1440x900-light-editing-default.png` — File/Examples/View/More/Run all render as text |
| No duplicated primary command surfaces | Verified | Cross-checked against `docs/ui-refactor/COMMAND_INVENTORY.md`; the one intentional exception (Header Run + Workspace Run) is documented there as deliberate cross-surface execution access, not an oversight |
| No mixed icon family | Verified | Every icon screenshot uses the single SVG sprite defined in `src/index.html` |
| No improvised Unicode UI icons | Known limitation | The program outline's `⌄`/`·` disclosure glyphs and the lockstep `⚠` divergence marker are pre-existing, `aria-hidden`/state-paired, low-severity findings already recorded as L1/L2 in `FINAL_REVIEW.md`; out of scope for a screenshot-only pass |
| No excessive decorative cards | Verified | No card/panel in any capture uses shadow, gradient, or radius beyond the flat `--radius-panel: 0` token |
| No unnecessary gradients | Verified | `grep` for `linear-gradient`/`radial-gradient` across `src/assets/css/*.css` returns no matches (confirmed in `FINAL_REVIEW.md` §23) |
| No glassmorphism | Verified | No `backdrop-filter` anywhere in the stylesheets |
| No large decorative shadows | Verified | Only `--shadow-overlay`/`--shadow-mobile-panel` exist, used solely for drawer/dialog elevation, visible in the menu and drawer screenshots |
| No glowing controls | Verified | Focus/selection use `box-shadow` rings and background tints, not glow effects — see `1440x900-light-special-focus-visible.png` |
| No excessive pill-shaped controls | Verified | `--radius-control: 4px` throughout; no capture shows a pill-shaped button |
| No irrelevant renderer terminology in the status bar | Verified | The status bar (visible in every desktop capture) shows only Blocks count and problem count; the renderer name (`tude`) appears solely in Settings → Block appearance |
| No stale Block-MiniJava terminology | Verified | No capture shows MiniJava labels; all example names, block labels, and dialog copy use Lambda terminology |
| Restrained grammatical block colors | Verified | `1440x900-light-grammar-families.png` / `-dark-grammar-families.png` — seven muted families, no saturated per-block colors |
| Grammar-aware connector shapes remain visible | Verified | Square reporter/value-socket geometry visible in every block screenshot, both themes |
| Lambda abstraction, application, variable, and other supported constructs remain distinguishable | Verified | `1440x900-light-editing-program-loaded.png` (abstraction, application, let, variable) and the grammar-family screenshots (adds letrec, if, comparison, boolean operator/literal, arithmetic) |
| Clear separation between static inspection and runtime output | Verified | Types/Outline/Typing-derivation live in the Inspector column; reduction traces/CEK/Lockstep live in the Bottom panel, in every relevant capture |
| Code remains editable | Verified | `1440x900-light-editing-default.png` and program-loaded captures show the live Code editor pane |
| Block-to-text generation remains visible | Verified | Code pane in every editing capture shows generated text tracking the loaded blocks |
| Text-to-block construction remains demonstrable | Verified | `1440x900-light-grammar-families.png` / dark pairing were produced by typing text into the Code editor and converting it to blocks (`Converted 1 term.`) |
| Semantic views remain reachable | Verified | §3 screenshots — Call-by-Structure, Call-by-Value, CEK machine, Lockstep all captured |
| Responsive controls remain reachable | Verified | §5–6 — toolbox, inspector, bottom panel, and navigation menu all opened and captured at tablet and phone sizes |
| Mobile drawers work | Verified | `390x844-light-mobile-code-drawer.png`, `390x844-dark-mobile-toolbox-drawer.png`, `390x844-dark-mobile-bottom-panel.png` |
| Light and dark themes remain usable | Verified | §7 theme-comparison table, seven paired contexts |
| Focus indicators remain visible | Verified | `1440x900-light-special-focus-visible.png` |
| Runtime and execution states remain distinguishable | Verified | `1440x900-dark-semantics-machine-loaded.png` vs `-machine-stepped.png` shows a visibly different machine status line after one step |
| The interface expresses Block-Lambda-Calculus rather than imitating VS Code | Verified | No capture shows an activity-bar-plus-multi-icon VS-Code-style chrome; the shell is a flat, single-accent application shell with domain-named panels (Blocks, Inspector, Semantics) |
| The interface avoids a generic AI-generated dashboard appearance | Verified | No capture contains KPI cards, decorative badges, or hero-style headings |

No item above is marked Verified without a corresponding screenshot or, where the item concerns non-visual behavior already covered by the automated suites (e.g., exact command inventory), a cross-reference to the existing verified document.

---

## Test and build results

Commands are the ones defined in `package.json`; no script name was invented.

| Category | Command | Result |
| --- | --- | --- |
| Type checking | `npm run typecheck` | Pass, 0 errors |
| Linting | `npm run lint` | Pass, 0 problems (including the new spec file) |
| Unit tests | `npm test` | Pass — 47 round-trip, 245 semantics, layout-state, 72 block-color checks |
| UI smoke + accessibility | `npm run test:ui` | Pass — 27/27 (existing suite, unaffected by this task) |
| Visual regression | `npm run test:ui:visual` | Pass — 10/10, zero snapshot drift |
| Final verification capture | `npx playwright test tests/ui/workbench.finalVerification.spec.ts` | Pass — 14/14, 44 screenshots produced |
| Production build | `npm run build` | Success (3 pre-existing bundle-size warnings, unrelated to this task) |
| Formatting | *no script defined* | **Not available** — the repository has no formatter script (also noted in `FINAL_REVIEW.md`) |

Additional verification performed:

- **No duplicate DOM IDs**: asserted by the existing `workbench.spec.ts`/`workbench.accessibility.spec.ts` suites, re-run clean above; the new spec's `capture()` helper also asserts zero console/page errors before every single screenshot (44/44 clean).
- **No browser console errors during capture**: 44/44 captures passed their `assertNoConsoleErrors()` check.
- **No unhandled promise rejections**: none observed across the run.
- **Build/clean cycle does not remove the screenshots**: `npm run build` then `npm run clean` then `npm run build` were run in sequence; the screenshot count in `docs/ui-refactor/screenshots/final/` stayed at 44 throughout, confirming the webpack `clean.keep` fix from the prior review (`FINAL_REVIEW.md` C1) also protects this new subdirectory.
- **No accidental production changes**: `git diff --stat -- src/ webpack.config.js package.json` is empty; only the new spec file and the new screenshots directory were added.
- **No secrets, local paths, or personal data in screenshots**: every capture shows only the application UI and the representative program's generated text; no file-system paths, no user-identifying information.
- **Untracked temporary files**: none outside the intended directory — the scratch capture directory (`test-results/final-verification-screenshots/`) is already covered by the existing `.gitignore` entry for `test-results/`.

## Known limitations

1. Chromium-only coverage (matches the existing Playwright project configuration; Firefox/WebKit are not configured for this repository).
2. The representative program (Currying & Closures) does not itself include a conditional, boolean operator, or numeric comparison; those constructs are instead demonstrated via the toolbox screenshots (all 13 block types visible with their grammatical color) and the two dedicated grammar-family screenshots, which use a supplementary custom-typed program specifically to connect every construct in one term.
3. Store and a separate Closure view are not implemented (this is a CEK machine, not CESK) — recorded as Not Applicable rather than fabricated.
4. Perspective-switching itself (Edit/Debug/Type Analysis/Presentation) is not re-screenshotted here since it is already covered by the passing `workbench.spec.ts` regression suite; this package focuses on visual states reachable at each viewport/theme rather than duplicating perspective-transition testing.
5. `docs/ui-refactor/screenshots/final/` now lives inside the webpack output directory alongside the other `docs/ui-refactor/` documents; it is protected by the existing `clean.keep` regex, but the underlying coupling (`docs/` serving double duty as both published site and documentation home) remains the same fragility already noted as a recommended future improvement in `FINAL_REVIEW.md` §22.
