import { expect, test, type Page } from '@playwright/test';
import { loadWorkbench, setTheme } from './workbenchTestUtils';

async function selectPerspective(page: Page, perspective: 'edit' | 'debug' | 'types'): Promise<void> {
  const viewButton = page.getByRole('button', { name: 'View', exact: true });
  if (!await viewButton.isVisible()) {
    await page.locator('#menuToggle').click();
  }
  await viewButton.click();
  await page.locator(`[data-perspective="${perspective}"]`).click();
}

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

test('wide light Edit perspective', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadWorkbench(page);
  await setTheme(page, 'light');
  await expect(page.locator('#app')).toHaveScreenshot('wide-light-edit.png');
});

test('wide dark Debug perspective', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadWorkbench(page);
  await setTheme(page, 'dark');
  await selectPerspective(page, 'debug');
  await expect(page.locator('#app')).toHaveScreenshot('wide-dark-debug.png');
});

test('compact Edit perspective', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await loadWorkbench(page);
  await setTheme(page, 'light');
  await expect(page.locator('#app')).toHaveScreenshot('compact-edit.png');
});

test('portrait Type Analysis perspective', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await loadWorkbench(page);
  await selectPerspective(page, 'types');
  await expect(page.locator('#app')).toHaveScreenshot('portrait-types.png');
});

test('mobile Edit perspective', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadWorkbench(page);
  await expect(page.locator('#app')).toHaveScreenshot('mobile-edit.png');
});

test('light grammatical block families', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadGrammarPaletteProgram(page, 'light');
  await expect(page.locator('#app')).toHaveScreenshot('grammar-families-light.png');
});

test('dark grammatical block families', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadGrammarPaletteProgram(page, 'dark');
  await expect(page.locator('#app')).toHaveScreenshot('grammar-families-dark.png');
});

test('semantic-only reduction blocks', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadWorkbench(page);
  await setTheme(page, 'dark');
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await page.locator('[data-example-id="currying-closures"]').click();
  await page.locator('#exampleLoadDialog button[value="replace"]').click();

  const applicationBlock = page.locator('#blocklyDiv .lambda_application.blocklyDraggable[data-id]').first();
  const bounds = await applicationBlock.boundingBox();
  if (!bounds) throw new Error('Expected an application block for the reduction screenshot.');
  await page.mouse.click(bounds.x + 8, bounds.y + 8, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Evaluate - Call-by-Structure' }).click();
  await expect(page.locator('#bottomPanel-structure .lambda_viz_description').first()).toBeAttached();
  await page.locator('#vizMaximize').click();
  await expect(page.locator('#vizDock')).toHaveScreenshot('semantic-reduction-dark.png');
});
