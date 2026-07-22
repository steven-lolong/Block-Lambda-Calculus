import { expect, test } from '@playwright/test';
import { cssLength, layoutStorageKey, loadWorkbench, openBottomTab } from './workbenchTestUtils';

test.beforeEach(async ({ page }) => {
  await loadWorkbench(page);
});

test('loads without uncaught errors and has unique DOM IDs', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.reload();
  await expect(page.locator('#blocklyDiv .blocklySvg')).toBeVisible();
  await expect.poll(() => pageErrors).toEqual([]);

  const duplicateIds = await page.evaluate(() => {
    const counts = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
      counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
    }
    return [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  });
  expect(duplicateIds).toEqual([]);
});

test('toolbox can be hidden and restored', async ({ page }) => {
  await page.locator('#toggleToolboxPanel').click();
  await expect(page.locator('#app')).toHaveClass(/toolbox-hidden/);
  await expect(page.locator('#showToolboxFromWorkspace')).toBeVisible();

  await page.locator('#showToolboxFromWorkspace').click();
  await expect(page.locator('#app')).not.toHaveClass(/toolbox-hidden/);
});

test('code and inspector panel can be hidden and restored', async ({ page }) => {
  await page.locator('#toggleCodePanel').click();
  await expect(page.locator('#app')).toHaveClass(/code-hidden/);
  await expect(page.locator('#showCodeFromWorkspace')).toBeVisible();

  await page.locator('#showCodeFromWorkspace').click();
  await expect(page.locator('#app')).not.toHaveClass(/code-hidden/);
});

test('primary Run control opens the CEK runtime view', async ({ page }) => {
  await page.locator('.quick-actions [data-bottom-tab="machine"]').click();
  await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('#bottomTab-machine')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.viz-host[data-kind="machine"]')).toHaveAttribute('data-active', 'true');
});

test('command palette exposes registered commands', async ({ page }) => {
  await page.locator('#commandPaletteTrigger').click();
  await expect(page.locator('#commandPalette')).toHaveAttribute('open', '');
  await expect(page.getByRole('option', { name: /File: New Workspace/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Run: CEK Machine/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#commandPalette')).not.toHaveAttribute('open', '');
});

test('perspective selection applies the Debug layout', async ({ page }) => {
  await page.locator('[data-activity="settings"]').click();
  await page.locator('#perspectiveSelect').selectOption('debug');
  await expect(page.locator('#statusPerspective')).toHaveText('Debug');
  await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('#bottomTab-stepper')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-sidebar-view="run"]')).not.toHaveAttribute('hidden', '');
});

test('bottom panel opens, maximizes, and closes', async ({ page }) => {
  await page.locator('#toggleVizDock').click();
  await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'true');

  await page.locator('#vizMaximize').click();
  await expect(page.locator('#vizDock')).toHaveAttribute('data-maximized', 'true');
  await expect(page.locator('#vizMaximize')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#vizCollapse').click();
  await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'false');
});

test('keyboard resizers update persisted panel dimensions', async ({ page }) => {
  const sidebarBefore = await cssLength(page, '--ide-primary-sidebar-width');
  await page.locator('#sidebarResizeHandle').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => cssLength(page, '--ide-primary-sidebar-width')).not.toBe(sidebarBefore);

  const codeBefore = await cssLength(page, '--ide-code-panel-width');
  await page.locator('#resizeHandle').focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => cssLength(page, '--ide-code-panel-width')).not.toBe(codeBefore);

  await page.locator('#toggleVizDock').click();
  const bottomBefore = await cssLength(page, '--ide-bottom-panel-height');
  await page.locator('#vizResizer').focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => cssLength(page, '--ide-bottom-panel-height')).not.toBe(bottomBefore);

  const savedLayout = await page.evaluate((key) => window.localStorage.getItem(key), layoutStorageKey);
  expect(savedLayout).toContain('sidebarWidth');
  expect(savedLayout).toContain('codeWidth');
  expect(savedLayout).toContain('bottomHeight');
});

test('layout state is restored after reload', async ({ page }) => {
  await page.locator('#toggleToolboxPanel').click();
  await expect(page.locator('#app')).toHaveClass(/toolbox-hidden/);
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), layoutStorageKey)).toContain('sidebarVisible');

  await page.reload();
  await expect(page.locator('#blocklyDiv .blocklySvg')).toBeVisible();
  await expect(page.locator('#app')).toHaveClass(/toolbox-hidden/);
});

test('theme and autosave interval are configurable and persisted', async ({ page }) => {
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  await page.locator('#themeToggle').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', initialTheme ?? '');
  const switchedTheme = await page.locator('html').getAttribute('data-theme');

  await page.locator('#autosaveInterval').focus();
  await page.keyboard.press('End');
  await expect(page.locator('#autosaveInterval')).toHaveValue('20');
  await expect(page.locator('#autosaveIntervalLabel')).toContainText('20 minutes');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', switchedTheme ?? 'dark');
  await expect(page.locator('#autosaveInterval')).toHaveValue('20');
});

test('mobile header and panel drawers remain operable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('#menuToggle')).toBeVisible();
  await page.locator('#menuToggle').click();
  await expect(page.locator('#app')).toHaveClass(/menu-open/);
  await expect(page.locator('#topbarActions')).toBeVisible();
  await page.locator('#menuToggle').click();
  await expect(page.locator('#app')).not.toHaveClass(/menu-open/);

  await expect(page.locator('#showToolboxFromWorkspace')).toBeVisible();
  await page.locator('#showToolboxFromWorkspace').click();
  await expect(page.locator('#app')).not.toHaveClass(/toolbox-hidden/);
  await expect(page.locator('#toggleToolboxPanel')).toBeVisible();
  await page.locator('#toggleToolboxPanel').click();
  await expect(page.locator('#app')).toHaveClass(/toolbox-hidden/);

  await page.locator('#toggleVizDock').click();
  await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('#vizDock')).toHaveCSS('position', 'fixed');
});

test('keyboard shortcuts invoke shell commands', async ({ page }) => {
  await page.keyboard.press('Control+b');
  await expect(page.locator('#app')).toHaveClass(/toolbox-hidden/);
  await page.keyboard.press('Control+Alt+c');
  await expect(page.locator('#app')).toHaveClass(/code-hidden/);
  await page.keyboard.press('Control+j');
  await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'true');
  await page.keyboard.press('F1');
  await expect(page.locator('#commandPalette')).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+b');
  await expect(page.locator('#app')).not.toHaveClass(/toolbox-hidden/);
  await page.keyboard.press('/');
  await expect(page.locator('#toolboxSearch')).toBeFocused();
});

test('code, analysis, structure, utility, and runtime views remain reachable', async ({ page }) => {
  await page.locator('#codeTargetCode').click();
  await expect(page.locator('#lambdaEditorPane')).toBeVisible();
  await page.locator('#codeTargetOutline').click();
  await expect(page.locator('#outlinePane')).toBeVisible();
  await page.locator('#codeTargetFormal').click();
  await expect(page.locator('#codeOutput')).toBeVisible();

  for (const kind of ['types', 'problems', 'output', 'structure', 'value', 'machine', 'stepper']) {
    await openBottomTab(page, kind);
    await expect(page.locator(`#bottomTab-${kind}`)).toHaveAttribute('aria-selected', 'true');
  }
});
