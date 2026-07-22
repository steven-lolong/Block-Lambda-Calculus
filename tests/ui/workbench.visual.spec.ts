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
