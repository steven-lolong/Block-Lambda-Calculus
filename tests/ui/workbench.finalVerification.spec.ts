/**
 * Final visual verification package for the Block Lambda Calculus workbench.
 *
 * This spec captures a documentation screenshot set under
 * docs/ui-refactor/screenshots/final/ for docs/ui-refactor/VISUAL_COMPARISON.md.
 * It intentionally does NOT use `toHaveScreenshot()` — these are not pixel-diff
 * regression baselines (that suite is tests/ui/workbench.visual.spec.ts); they
 * are plain PNGs meant to be viewed and cross-referenced from Markdown.
 */
import { expect, test, type Page } from '@playwright/test';
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  loadWorkbench,
  openBottomTab,
  openInspectorView,
  setTheme,
  toggleBottomPanel
} from './workbenchTestUtils';

const FINAL_SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'docs', 'ui-refactor', 'screenshots', 'final');
// webpack-dev-server's `devServer.static` root is `docs/`, and it live-reloads
// the page on any change under that directory. Writing screenshots straight
// into docs/ui-refactor/screenshots/final/ while the browser is mid-interaction
// therefore triggers a reload that wipes JS-applied state (classes, open
// menus, loaded programs) between actions. Capture to a scratch directory
// outside docs/ instead, and copy the finished set into place in
// `afterAll`, once no more page interaction depends on the page surviving.
const TMP_SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'test-results', 'final-verification-screenshots');

test.beforeAll(() => {
  rmSync(TMP_SCREENSHOT_DIR, { recursive: true, force: true });
  mkdirSync(TMP_SCREENSHOT_DIR, { recursive: true });
});

test.afterAll(() => {
  mkdirSync(FINAL_SCREENSHOT_DIR, { recursive: true });
  for (const entry of readdirSync(TMP_SCREENSHOT_DIR)) {
    copyFileSync(path.join(TMP_SCREENSHOT_DIR, entry), path.join(FINAL_SCREENSHOT_DIR, entry));
  }
});

let consoleErrors: string[] = [];

test.beforeEach(({ page }) => {
  consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
  });
});

function assertNoConsoleErrors(): void {
  expect(consoleErrors, 'expected no browser console or page errors before capture').toEqual([]);
}

async function capture(page: Page, name: string): Promise<void> {
  assertNoConsoleErrors();
  await expect(page.locator('#blocklyDiv .blocklySvg')).toBeVisible();
  await page.locator('#app').screenshot({ path: path.join(TMP_SCREENSHOT_DIR, name) });
}

/** The representative program: the built-in "Currying & Closures" example —
 *  `let add = \x. \y. x + y in let inc = add 1 in inc 41` => 42. Exercises let
 *  bindings, nested lambda abstraction/closures, application, a numeric
 *  operator, and variables; it is also the example already used by the
 *  existing reduction-trace regression baseline, so it is proven to render
 *  legibly. */
async function loadCurryingClosures(page: Page): Promise<void> {
  // At <=900px the Examples trigger lives behind the collapsed hamburger menu;
  // open it first and close it again afterward so no menu is left open. Read
  // the media query directly rather than the button's instantaneous
  // `isVisible()` — the latter is a one-shot check with no retry and is racy
  // immediately after a theme/viewport change.
  const openedHamburger = await page.evaluate(() => window.matchMedia('(max-width: 900px)').matches);
  if (openedHamburger) await page.locator('#menuToggle').click();
  const examplesButton = page.getByRole('button', { name: 'Examples', exact: true });
  await examplesButton.click();
  await page.locator('[data-example-id="currying-closures"]').click();
  await expect(page.locator('#exampleLoadDialog')).toHaveAttribute('open', '');
  await page.locator('#exampleLoadDialog button[value="replace"]').click();
  await expect(page.locator('#exampleLoadDialog')).not.toHaveAttribute('open', '');
  await expect(page.locator('#blockCount')).not.toHaveText('2');
  // The example item carries role="menuitem", so the app's own document click
  // handler already auto-closes the hamburger drawer on that click — check
  // current state rather than closing unconditionally, or this would reopen it.
  if (openedHamburger && await page.locator('#app').evaluate((el) => el.classList.contains('menu-open'))) {
    await page.locator('#menuToggle').click();
    await expect(page.locator('#app')).not.toHaveClass(/menu-open/);
  }
}

/** A second, custom-typed program used only for the two dedicated grammar-
 *  family screenshots, where every block family needs to appear connected in
 *  one term: letrec, abstraction, if, numeric/boolean comparison, boolean
 *  operator/literal, arithmetic, let, application, and variable. This is the
 *  same text already exercised by the existing
 *  `light/dark grammatical block families` regression baseline. */
async function loadGrammarPaletteProgram(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await loadWorkbench(page);
  await setTheme(page, theme);
  await page.locator('#lambdaEditor').fill(
    'letrec f = \\x. if (x < 1) or false then 0 else x + (f (x - 1)) in let id = \\y. y in id (f 3)'
  );
  await expect(page.locator('#lambdaEditorStatus')).toHaveText('Converted 1 term.');
  await page.locator('#lambdaEditor').press('Control+Home');
  await page.locator('#zoomFit').click();
  const workspaceBounds = await page.locator('#blocklyArea').boundingBox();
  if (!workspaceBounds) throw new Error('Expected Blockly workspace bounds.');
  await page.mouse.click(
    workspaceBounds.x + workspaceBounds.width * 0.82,
    workspaceBounds.y + workspaceBounds.height * 0.08
  );
}

async function openApplicationContextMenu(page: Page): Promise<void> {
  const applicationBlock = page.locator('#blocklyDiv .lambda_application.blocklyDraggable[data-id]').first();
  await expect(applicationBlock).toBeAttached();
  const bounds = await applicationBlock.boundingBox();
  if (!bounds) throw new Error('Expected an application block in the rendered workspace.');
  await page.mouse.click(bounds.x + 8, bounds.y + 8, { button: 'right' });
}

// ------------------------------------------------------------- desktop workbench

test.describe('Desktop workbench', () => {
  test('1920x1080 default and program-loaded, light and dark', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    await test.step('light default', async () => {
      await loadWorkbench(page);
      await setTheme(page, 'light');
      await expect(page.locator('#blockCount')).not.toHaveText('0');
      await capture(page, '1920x1080-light-editing-default.png');
    });

    await test.step('light program-loaded', async () => {
      await loadCurryingClosures(page);
      await capture(page, '1920x1080-light-editing-program-loaded.png');
    });

    await test.step('dark default', async () => {
      await loadWorkbench(page);
      await setTheme(page, 'dark');
      await capture(page, '1920x1080-dark-editing-default.png');
    });

    await test.step('dark program-loaded', async () => {
      await loadCurryingClosures(page);
      await capture(page, '1920x1080-dark-editing-program-loaded.png');
    });
  });

  test('1440x900 default and program-loaded, light and dark', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await test.step('light default', async () => {
      await loadWorkbench(page);
      await setTheme(page, 'light');
      await capture(page, '1440x900-light-editing-default.png');
    });

    await test.step('light program-loaded', async () => {
      await loadCurryingClosures(page);
      await capture(page, '1440x900-light-editing-program-loaded.png');
    });

    await test.step('dark default', async () => {
      await loadWorkbench(page);
      await setTheme(page, 'dark');
      await capture(page, '1440x900-dark-editing-default.png');
    });

    await test.step('dark program-loaded', async () => {
      await loadCurryingClosures(page);
      await capture(page, '1440x900-dark-editing-program-loaded.png');
    });
  });

  test('1024x768 default (compact drawers) and program-loaded, light and dark', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });

    await test.step('light default (compact overlay drawers, both hidden)', async () => {
      await loadWorkbench(page);
      await setTheme(page, 'light');
      // At this breakpoint the compact-overlay rule suppresses both side
      // panels simultaneously by default, leaving only the workspace visible
      // with the two responsive restore buttons — a genuine, reviewed state
      // (see FINAL_REVIEW.md section 11), not a defect.
      await expect(page.locator('#app')).toHaveClass(/toolbox-hidden/);
      await expect(page.locator('#app')).toHaveClass(/code-hidden/);
      await capture(page, '1024x768-light-editing-default.png');
    });

    await test.step('light program-loaded with inspector overlay shown', async () => {
      await loadCurryingClosures(page);
      await page.locator('#showCodeFromWorkspace').click();
      await expect(page.locator('#app')).not.toHaveClass(/code-hidden/);
      await capture(page, '1024x768-light-editing-program-loaded.png');
    });

    await test.step('dark default', async () => {
      await loadWorkbench(page);
      await setTheme(page, 'dark');
      await capture(page, '1024x768-dark-editing-default.png');
    });

    await test.step('dark bottom Semantics (CEK machine)', async () => {
      await loadCurryingClosures(page);
      await openBottomTab(page, 'machine');
      await page.locator('#machineLoad').click();
      await expect(page.locator('#machineStep')).toBeEnabled();
      await capture(page, '1024x768-dark-bottom-semantics.png');
    });
  });
});

// ------------------------------------------------------------------- inspector

test.describe('Inspector', () => {
  test('1440x900 light — toolbox, code, types, outline, derivation, palette, menus', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadWorkbench(page);
    await setTheme(page, 'light');
    await loadCurryingClosures(page);

    await test.step('toolbox search active', async () => {
      await page.locator('#toolboxSearch').fill('boolean');
      await expect(page.locator('.toolbox-block-card:visible')).toHaveCount(2);
      await capture(page, '1440x900-light-toolbox-search.png');
      await page.locator('#toolboxSearch').fill('');
    });

    await test.step('toolbox category expanded', async () => {
      // The prior search step may have auto-opened a matching category and
      // left it open, so check for presence (not truthiness — the `open`
      // attribute value is an empty string, which is falsy in JS).
      const category = page.locator('.toolbox-category').nth(4);
      if ((await category.getAttribute('open')) === null) {
        await category.locator('summary').click();
      }
      await expect(category).toHaveAttribute('open', '');
      await capture(page, '1440x900-light-toolbox-category-expanded.png');
    });

    await test.step('inspector: Types', async () => {
      await openInspectorView(page, 'inspector');
      await expect(page.locator('#typesPane')).toBeVisible();
      await expect(page.locator('#typesList .type-row')).toHaveCount(1);
      await capture(page, '1440x900-light-inspector-types.png');
    });

    await test.step('inspector: Outline', async () => {
      await openInspectorView(page, 'outline');
      await expect(page.locator('#outlinePane')).toBeVisible();
      await expect(page.locator('#programOutline .outline-item').first()).toBeVisible();
      await capture(page, '1440x900-light-inspector-outline.png');
    });

    await test.step('inspector: Typing derivation (formal)', async () => {
      await openInspectorView(page, 'formal');
      await expect(page.locator('#codeOutput')).toBeVisible();
      await expect(page.locator('#codeOutput')).toHaveClass(/formal-output/);
      await capture(page, '1440x900-light-inspector-formal-derivation.png');
    });

    await test.step('restore Code view before panel-visibility states', async () => {
      await openInspectorView(page, 'code');
      await expect(page.locator('#lambdaEditorPane')).toBeVisible();
    });

    await test.step('toolbox hidden', async () => {
      await page.locator('#toggleToolboxPanel').click();
      await expect(page.locator('#app')).toHaveClass(/toolbox-hidden/);
      await capture(page, '1440x900-light-toolbox-hidden.png');
      await page.locator('#showToolboxFromWorkspace').click();
      await expect(page.locator('#app')).not.toHaveClass(/toolbox-hidden/);
    });

    await test.step('inspector hidden', async () => {
      await page.locator('#toggleCodePanel').click();
      await expect(page.locator('#app')).toHaveClass(/code-hidden/);
      await capture(page, '1440x900-light-inspector-hidden.png');
      await page.locator('#showCodeFromWorkspace').click();
      await expect(page.locator('#app')).not.toHaveClass(/code-hidden/);
    });

    await test.step('command palette open', async () => {
      await page.keyboard.press('F1');
      await expect(page.locator('#commandPalette')).toHaveAttribute('open', '');
      await capture(page, '1440x900-light-command-palette-open.png');
      await page.keyboard.press('Escape');
      await expect(page.locator('#commandPalette')).not.toHaveAttribute('open', '');
    });

    await test.step('File menu open', async () => {
      const fileMenu = page.getByRole('button', { name: 'File', exact: true });
      await fileMenu.click();
      await expect(page.getByRole('menuitem', { name: /New Workspace/ })).toBeVisible();
      await capture(page, '1440x900-light-file-menu-open.png');
      await page.keyboard.press('Escape');
    });

    await test.step('View menu open', async () => {
      const viewMenu = page.getByRole('button', { name: 'View', exact: true });
      await viewMenu.click();
      await expect(page.getByRole('menuitem', { name: /Edit Perspective/ })).toBeVisible();
      await capture(page, '1440x900-light-view-menu-open.png');
      await page.keyboard.press('Escape');
    });
  });
});

// --------------------------------------------------------- evaluation & semantics

test.describe('Evaluation and semantics', () => {
  test('1440x900 dark — reduction traces, CEK machine, lockstep, maximize/restore', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadWorkbench(page);
    await setTheme(page, 'dark');
    await loadCurryingClosures(page);

    await test.step('Call-by-Structure reduction trace', async () => {
      await openApplicationContextMenu(page);
      await page.getByRole('menuitem', { name: 'Evaluate - Call-by-Structure' }).click();
      await expect(page.locator('#bottomPanel-structure .lambda_viz_description').first()).toBeAttached();
      await capture(page, '1440x900-dark-semantics-reduction-structure.png');
    });

    await test.step('Call-by-Value reduction trace', async () => {
      await page.locator('#vizCollapse').click();
      await openApplicationContextMenu(page);
      await page.getByRole('menuitem', { name: 'Evaluate - Call-by-Value' }).click();
      await expect(page.locator('#bottomPanel-value .lambda_viz_description').first()).toBeAttached();
      await capture(page, '1440x900-dark-semantics-reduction-value.png');
    });

    await test.step('CEK machine loaded', async () => {
      await openBottomTab(page, 'machine');
      await page.locator('#machineLoad').click();
      await expect(page.locator('#machineStep')).toBeEnabled();
      await capture(page, '1440x900-dark-semantics-machine-loaded.png');
    });

    await test.step('CEK machine after a step', async () => {
      const before = await page.locator('#machineStatus').textContent();
      await page.locator('#machineStep').click();
      await expect(page.locator('#machineStatus')).not.toHaveText(before ?? '');
      await capture(page, '1440x900-dark-semantics-machine-stepped.png');
    });

    await test.step('Lockstep stepper loaded', async () => {
      await openBottomTab(page, 'stepper');
      await page.locator('#stepperLoad').click();
      await expect(page.locator('#stepperStep')).toBeEnabled();
      await capture(page, '1440x900-dark-semantics-lockstep.png');
    });

    await test.step('bottom panel maximized', async () => {
      await page.locator('#vizMaximize').click();
      await expect(page.locator('#vizDock')).toHaveAttribute('data-maximized', 'true');
      await capture(page, '1440x900-dark-bottom-maximized.png');
    });

    await test.step('bottom panel restored', async () => {
      await page.locator('#vizMaximize').click();
      await expect(page.locator('#vizDock')).toHaveAttribute('data-maximized', 'false');
      await capture(page, '1440x900-dark-bottom-restored.png');
    });
  });

  test('1440x900 light — CEK machine loaded (theme pairing)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadWorkbench(page);
    await setTheme(page, 'light');
    await loadCurryingClosures(page);
    await openBottomTab(page, 'machine');
    await page.locator('#machineLoad').click();
    await expect(page.locator('#machineStep')).toBeEnabled();
    await capture(page, '1440x900-light-semantics-machine-loaded.png');
  });
});

// ---------------------------------------------------------------- bottom panel

test.describe('Bottom panel', () => {
  test('1440x900 light — Problems and populated Output', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadWorkbench(page);
    await setTheme(page, 'light');
    await loadCurryingClosures(page);

    await test.step('Problems (no issues)', async () => {
      await openBottomTab(page, 'problems');
      await expect(page.locator('#problemsPanelSummary')).toContainText('No problems');
      await capture(page, '1440x900-light-bottom-problems.png');
    });

    await test.step('Output (populated)', async () => {
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await page.locator('#refreshCode').click();
      await openBottomTab(page, 'output');
      await expect(page.locator('#outputLog .output-entry').first()).toBeVisible();
      await capture(page, '1440x900-light-bottom-output.png');
    });
  });
});

// ------------------------------------------------------------------------ tablet

test.describe('Tablet', () => {
  test('768x1024 light — portrait default and toolbox drawer', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    await test.step('portrait default', async () => {
      await loadWorkbench(page);
      await setTheme(page, 'light');
      await capture(page, '768x1024-light-tablet-portrait.png');
    });

    await test.step('toolbox drawer open', async () => {
      await expect(page.locator('#app')).toHaveClass(/toolbox-hidden/);
      await page.locator('#showToolboxFromWorkspace').click();
      await expect(page.locator('#app')).not.toHaveClass(/toolbox-hidden/);
      await capture(page, '768x1024-light-tablet-toolbox.png');
    });
  });

  test('768x1024 dark — program loaded with code drawer', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await loadWorkbench(page);
    await setTheme(page, 'dark');
    await loadCurryingClosures(page);
    await page.locator('#showCodeFromWorkspace').click();
    await expect(page.locator('#app')).not.toHaveClass(/code-hidden/);
    await capture(page, '768x1024-dark-tablet-program-loaded.png');
  });
});

// ------------------------------------------------------------------------ mobile

test.describe('Mobile', () => {
  test('390x844 light — default, code drawer, nav menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await test.step('mobile default (Run reachable via workspace toolbar)', async () => {
      await loadWorkbench(page);
      await setTheme(page, 'light');
      await expect(page.locator('.workspace-run-button')).toBeVisible();
      await capture(page, '390x844-light-mobile-default.png');
    });

    await test.step('code drawer open', async () => {
      await page.locator('#showCodeFromWorkspace').click();
      await expect(page.locator('#app')).not.toHaveClass(/code-hidden/);
      await expect(page.locator('#codePanel')).toBeVisible();
      await capture(page, '390x844-light-mobile-code-drawer.png');
      await page.locator('#toggleCodePanel').click();
      await expect(page.locator('#app')).toHaveClass(/code-hidden/);
    });

    await test.step('navigation menu open', async () => {
      await page.locator('#menuToggle').click();
      await expect(page.locator('#app')).toHaveClass(/menu-open/);
      await expect(page.locator('#topbarActions')).toBeVisible();
      await capture(page, '390x844-light-mobile-nav-menu-open.png');
      await page.locator('#menuToggle').click();
      await expect(page.locator('#app')).not.toHaveClass(/menu-open/);
    });
  });

  test('390x844 dark — toolbox drawer, bottom panel, program loaded', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadWorkbench(page);
    await setTheme(page, 'dark');

    await test.step('toolbox drawer open', async () => {
      await page.locator('#showToolboxFromWorkspace').click();
      await expect(page.locator('#app')).not.toHaveClass(/toolbox-hidden/);
      await capture(page, '390x844-dark-mobile-toolbox-drawer.png');
      await page.locator('#toggleToolboxPanel').click();
      await expect(page.locator('#app')).toHaveClass(/toolbox-hidden/);
    });

    await test.step('bottom panel open', async () => {
      await toggleBottomPanel(page);
      await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'true');
      await capture(page, '390x844-dark-mobile-bottom-panel.png');
      await page.keyboard.press('Escape');
      await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'false');
    });

    await test.step('program loaded', async () => {
      await loadCurryingClosures(page);
      await capture(page, '390x844-dark-mobile-program-loaded.png');
    });
  });
});

// --------------------------------------------------------------- grammar families

test.describe('Grammar families', () => {
  test('1440x900 light grammar families', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadGrammarPaletteProgram(page, 'light');
    await capture(page, '1440x900-light-grammar-families.png');
  });

  test('1440x900 dark grammar families', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadGrammarPaletteProgram(page, 'dark');
    await capture(page, '1440x900-dark-grammar-families.png');
  });
});

// ------------------------------------------------------------------- special states

test.describe('Special states', () => {
  test('1440x900 light — keyboard focus-visible ring', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadWorkbench(page);
    await setTheme(page, 'light');
    const fileMenu = page.getByRole('button', { name: 'File', exact: true });
    await fileMenu.focus();
    await expect(fileMenu).toBeFocused();
    await capture(page, '1440x900-light-special-focus-visible.png');
  });
});
