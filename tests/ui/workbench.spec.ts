import { expect, test } from '@playwright/test';
import { cssLength, layoutStorageKey, loadWorkbench, openBottomTab, openInspectorView, openSettings, toggleBottomPanel } from './workbenchTestUtils';

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

test('workspace Run control opens the CEK runtime view', async ({ page }) => {
  await page.locator('.workspace-run-button').click();
  await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('#bottomTab-machine')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.viz-host[data-kind="machine"]')).toHaveAttribute('data-active', 'true');
});

test('command palette exposes registered commands', async ({ page }) => {
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.locator('#commandPaletteTrigger').click();
  await expect(page.locator('#commandPalette')).toHaveAttribute('open', '');
  await expect(page.getByRole('option', { name: /File: New Workspace/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /View: Show Inferred Types/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /View: Show Outline/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Run: CEK Machine/ })).toBeVisible();

  await page.getByRole('option', { name: /View: Show Inferred Types/ }).click();
  await expect(page.locator('#typesPane')).toBeVisible();
  await page.keyboard.press('F1');
  await page.getByRole('option', { name: /View: Show Outline/ }).click();
  await expect(page.locator('#outlinePane')).toBeVisible();
  await expect(page.locator('#commandPalette')).not.toHaveAttribute('open', '');
});

test('header menus support keyboard navigation and Escape dismissal', async ({ page }) => {
  const fileMenu = page.getByRole('button', { name: 'File', exact: true });
  await fileMenu.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: /New Workspace/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(fileMenu).toHaveAttribute('aria-expanded', 'false');

  const examplesMenu = page.getByRole('button', { name: 'Examples', exact: true });
  await examplesMenu.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: /Identity Function/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(examplesMenu).toHaveAttribute('aria-expanded', 'false');
});

test('perspective selection applies the Debug layout', async ({ page }) => {
  await openSettings(page);
  await page.locator('#perspectiveSelect').selectOption('debug');
  await expect(page.locator('#statusPerspective')).toHaveText('Debug');
  await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('#bottomTab-stepper')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#bottomTab-semantics')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-sidebar-view="blocks"]')).not.toHaveAttribute('hidden', '');
  await expect(page.locator('[data-sidebar-view="run"]')).toHaveAttribute('hidden', '');
});

test('bottom panel opens, maximizes, and closes', async ({ page }) => {
  await toggleBottomPanel(page);
  await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'true');

  await page.locator('#vizMaximize').click();
  await expect(page.locator('#vizDock')).toHaveAttribute('data-maximized', 'true');
  await expect(page.locator('#vizMaximize')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#vizMaximize').click();
  await expect(page.locator('#vizDock')).toHaveAttribute('data-maximized', 'false');
  await expect(page.locator('#vizMaximize')).toHaveAttribute('aria-pressed', 'false');

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

  await toggleBottomPanel(page);
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
  await page.locator('#toggleCodePanel').click();
  await openBottomTab(page, 'machine');
  await page.locator('#vizMaximize').click();
  await expect(page.locator('#app')).toHaveClass(/toolbox-hidden/);
  await expect(page.locator('#app')).toHaveClass(/code-hidden/);
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), layoutStorageKey)).toContain('sidebarVisible');

  await page.reload();
  await expect(page.locator('#blocklyDiv .blocklySvg')).toBeVisible();
  await expect(page.locator('#app')).toHaveClass(/toolbox-hidden/);
  await expect(page.locator('#app')).toHaveClass(/code-hidden/);
  await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('#vizDock')).toHaveAttribute('data-maximized', 'true');
  await expect(page.locator('#bottomTab-machine')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#bottomTab-semantics')).toHaveAttribute('aria-selected', 'true');
});

test('legacy persisted bottom Types state migrates to inspector Types without duplication', async ({ page }) => {
  await page.evaluate((key) => {
    const current = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    window.localStorage.setItem(key, JSON.stringify({
      ...current,
      codeVisible: false,
      bottomVisible: true,
      bottomTab: 'types',
      perspective: 'custom'
    }));
  }, layoutStorageKey);

  await page.reload();
  await expect(page.locator('#blocklyDiv .blocklySvg')).toBeVisible();
  await expect(page.locator('#app')).not.toHaveClass(/code-hidden/);
  await expect(page.locator('#codeTargetInspector')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#typesPane')).toBeVisible();
  await expect(page.locator('#bottomTab-types')).toBeHidden();
  await expect(page.locator('#bottomTab-problems')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(async () => {
    const value = await page.evaluate((key) => window.localStorage.getItem(key), layoutStorageKey);
    if (!value) return undefined;
    const parsed = JSON.parse(value) as { bottomTab?: string; codeVisible?: boolean };
    return { bottomTab: parsed.bottomTab, codeVisible: parsed.codeVisible };
  }).toEqual({
    bottomTab: 'problems',
    codeVisible: true
  });
});

test('theme and autosave interval are configurable and persisted', async ({ page }) => {
  await openSettings(page);
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  const nextTheme = initialTheme === 'dark' ? 'light' : 'dark';
  await page.locator(`button[data-theme-mode="${nextTheme}"]`).click();
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

  await expect(page.locator('#showCodeFromWorkspace')).toBeVisible();
  await page.locator('#showCodeFromWorkspace').click();
  await expect(page.locator('#app')).not.toHaveClass(/code-hidden/);
  await expect(page.locator('#codePanel')).toBeVisible();
  await page.locator('#toggleCodePanel').click();
  await expect(page.locator('#app')).toHaveClass(/code-hidden/);

  await toggleBottomPanel(page);
  await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('#vizDock')).toHaveCSS('position', 'fixed');
  await page.locator('#bottomTab-semantics').click();
  await expect(page.locator('.semantics-tabs')).toBeVisible();
  const semanticLabels = page.locator('.semantics-tab .viz-tab-label');
  await expect(semanticLabels).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await expect(semanticLabels.nth(index)).toBeVisible();
  }
  await page.locator('#bottomTab-machine').click();
  await expect(page.locator('#bottomPanel-machine')).toHaveAttribute('data-active', 'true');
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

test('code editing and code-to-block synchronization remain functional', async ({ page }) => {
  await openInspectorView(page, 'code');
  await expect(page.locator('#lambdaEditorPane')).toBeVisible();
  await page.locator('#lambdaEditor').fill('-- edited in Code\n\\y. y');
  await expect(page.locator('#lambdaEditorStatus')).toHaveText('Converted 1 term.');
  await expect(page.locator('#lambdaEditorStatus')).toHaveAttribute('data-state', 'ok');
  await expect(page.locator('#blocklyDiv .blocklyText')).toContainText(['y']);

  await page.locator('#synchronizeCode').click();
  await expect(page.locator('#lambdaEditorStatus')).toHaveText('Synchronized from workspace.');
  await expect(page.locator('#lambdaEditor')).toHaveValue(/\\y\. y/);
});

test('Code, Types, Outline, Problems, Output, and every semantics view remain reachable once', async ({ page }) => {
  await openInspectorView(page, 'outline');
  await expect(page.locator('#outlinePane')).toBeVisible();

  await openInspectorView(page, 'inspector');
  await expect(page.locator('#typesPane')).toBeVisible();
  await expect(page.locator('#typesPanelSummary')).toContainText('top-level term');
  await expect(page.locator('#typesList .type-row')).toHaveCount(1);
  await page.locator('#typesList .type-row').click();
  await expect(page.locator('#blockInspectorContent')).toBeVisible();
  await expect(page.locator('#inspectorBlockType')).not.toHaveText('unknown');

  await openInspectorView(page, 'formal');
  await expect(page.locator('#codeOutput')).toBeVisible();
  await expect(page.locator('#codeOutput')).toHaveClass(/formal-output/);
  await expect(page.locator('#bottomTab-types')).toBeHidden();
  await expect(page.locator('#bottomPanel-types')).toBeHidden();

  await openBottomTab(page, 'problems');
  await expect(page.locator('#bottomTab-problems')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#problemsList')).toBeVisible();
  await expect(page.locator('#problemsPanelSummary')).toContainText('No problems');

  await openBottomTab(page, 'output');
  await expect(page.locator('#bottomTab-output')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#outputLog')).toBeVisible();

  for (const kind of ['structure', 'value', 'machine', 'stepper']) {
    await openBottomTab(page, kind);
    await expect(page.locator('#bottomTab-semantics')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(`#bottomTab-${kind}`)).toHaveAttribute('aria-selected', 'true');
  }
});

test('semantic and runtime views retain their evaluation controls', async ({ page }) => {
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await page.locator('[data-example-id="currying-closures"]').click();
  await expect(page.locator('#exampleLoadDialog')).toHaveAttribute('open', '');
  await page.locator('#exampleLoadDialog button[value="replace"]').click();
  await expect(page.locator('#exampleLoadDialog')).not.toHaveAttribute('open', '');
  await expect(page.locator('#blockCount')).not.toHaveText('2');

  const applicationBlock = page.locator('#blocklyDiv .lambda_application.blocklyDraggable[data-id]').first();
  await expect(applicationBlock).toBeAttached();
  const openApplicationMenu = async () => {
    const bounds = await applicationBlock.boundingBox();
    if (!bounds) throw new Error('Expected an application block in the rendered workspace.');
    await page.mouse.click(bounds.x + 8, bounds.y + 8, { button: 'right' });
  };
  await openApplicationMenu();

  await page.getByRole('menuitem', { name: 'Evaluate - Call-by-Structure' }).click();
  await expect(page.locator('#bottomTab-semantics')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#bottomPanel-structure .blocklySvg')).toBeVisible();

  await page.locator('#vizCollapse').click();
  await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'false');
  await openApplicationMenu();
  await page.getByRole('menuitem', { name: 'Evaluate - Call-by-Value' }).click();
  await expect(page.locator('#bottomPanel-value .blocklySvg')).toBeVisible();

  await openBottomTab(page, 'machine');
  await page.locator('#machineLoad').click();
  await expect(page.locator('#machineStep')).toBeEnabled();
  const machineStatus = await page.locator('#machineStatus').textContent();
  await page.locator('#machineStep').click();
  await expect(page.locator('#machineStatus')).not.toHaveText(machineStatus ?? '');

  await openBottomTab(page, 'stepper');
  await page.locator('#stepperLoad').click();
  await expect(page.locator('#stepperStep')).toBeEnabled();
  await page.locator('#stepperStep').click();
  await expect(page.locator('#stepperStatus')).toContainText('step 1/');
});

test('Type Analysis perspective opens static Types with Problems in the bottom panel', async ({ page }) => {
  await openSettings(page);
  await page.locator('#perspectiveSelect').selectOption('types');
  await expect(page.locator('#statusPerspective')).toHaveText('Type Analysis');
  await expect(page.locator('#codeTargetInspector')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#typesPane')).toBeVisible();
  await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('#bottomTab-problems')).toHaveAttribute('aria-selected', 'true');
});

test('inspector and bottom tablists support keyboard navigation', async ({ page }) => {
  await page.locator('#codeTargetCode').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#codeTargetInspector')).toBeFocused();
  await expect(page.locator('#typesPane')).toBeVisible();

  await page.locator('#typeTargetOverview').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#codeTargetFormal')).toBeFocused();
  await expect(page.locator('#codeOutput')).toBeVisible();

  await openBottomTab(page, 'problems');
  await page.locator('#bottomTab-problems').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#bottomTab-output')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#bottomTab-semantics')).toBeFocused();

  await page.locator('#bottomTab-structure').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#bottomTab-value')).toBeFocused();
});

test('toolbox search, categories, click-to-add, drag-to-add, undo, redo, and zoom controls work', async ({ page }) => {
  const blockCount = () => page.locator('#blockCount').evaluate((element) => Number(element.textContent));
  const initialCount = await blockCount();

  await page.locator('#toolboxSearch').fill('boolean');
  await expect(page.locator('.toolbox-block-card:visible')).toHaveCount(2);
  await page.locator('#toolboxSearch').fill('');

  const closedCategory = page.locator('.toolbox-category').nth(4);
  await closedCategory.locator('summary').click();
  await expect(closedCategory).not.toHaveAttribute('open', '');
  await closedCategory.locator('summary').click();
  await expect(closedCategory).toHaveAttribute('open', '');

  const clickCard = page.locator('.toolbox-block-card').first();
  await clickCard.click();
  await expect.poll(blockCount).toBe(initialCount + 1);
  await page.locator('#workspaceUndo').click();
  await expect.poll(blockCount).toBe(initialCount);
  await page.locator('#workspaceRedo').click();
  await expect.poll(blockCount).toBe(initialCount + 1);

  const dragCard = page.locator('.toolbox-block-card').nth(1);
  const source = await dragCard.boundingBox();
  const destination = await page.locator('#blocklyArea').boundingBox();
  if (!source || !destination) throw new Error('Expected toolbox card and Blockly workspace bounds.');
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(blockCount).toBe(initialCount + 2);

  const zoomBefore = await page.locator('#zoomLabel').textContent();
  await page.locator('#zoomIn').click();
  await expect(page.locator('#zoomLabel')).not.toHaveText(zoomBefore ?? '');
  await page.locator('#zoomOut').click();
  await page.locator('#zoomFit').click();
  await expect(page.locator('#zoomLabel')).toHaveText(/\d+%/);
});
