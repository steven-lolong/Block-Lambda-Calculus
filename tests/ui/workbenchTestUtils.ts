import { expect, type Page } from '@playwright/test';

export const layoutStorageKey = 'block-lambda-ide-layout-v2';

export async function loadWorkbench(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('#blocklyDiv .blocklySvg')).toBeVisible();
  await expect(page.locator('#blockToolboxContent .toolbox-block-card')).toHaveCount(12);
}

export async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  if (await page.locator('html').getAttribute('data-theme') !== theme) {
    await page.locator(`button[data-theme-mode="${theme}"]`).evaluate((button: HTMLButtonElement) => button.click());
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

export async function openBottomTab(page: Page, kind: string): Promise<void> {
  if (await page.locator('#vizDock').getAttribute('data-open') !== 'true') {
    await page.locator('#toggleVizDock').click();
  }
  await page.locator(`.viz-tab[data-kind="${kind}"]`).click();
  await expect(page.locator(`.viz-host[data-kind="${kind}"]`)).toHaveAttribute('data-active', 'true');
}

export async function cssLength(page: Page, name: string): Promise<number> {
  return page.locator('#app').evaluate((element, propertyName) => {
    return Number.parseFloat(getComputedStyle(element).getPropertyValue(propertyName));
  }, name);
}
