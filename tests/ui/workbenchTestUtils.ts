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

export async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.locator('#openSettings').click();
  await expect(page.locator('#settingsDialog')).toHaveAttribute('open', '');
}

export async function toggleBottomPanel(page: Page): Promise<void> {
  const viewMenu = page.getByRole('button', { name: 'View', exact: true });
  if (!await viewMenu.isVisible()) await page.locator('#menuToggle').click();
  await viewMenu.click();
  await page.locator('#toggleVizDock').click();
}

export async function openInspectorView(page: Page, target: 'code' | 'inspector' | 'formal' | 'outline'): Promise<void> {
  if (await page.locator('#app').evaluate((element) => element.classList.contains('code-hidden'))) {
    await page.locator('#showCodeFromWorkspace').click();
  }
  if (target === 'formal') {
    await page.locator('#codeTargetInspector').click();
    await page.locator('#codeTargetFormal').click();
    return;
  }
  await page.locator(`[data-code-target="${target}"]`).click();
}

export async function openBottomTab(page: Page, kind: string): Promise<void> {
  if (await page.locator('#vizDock').getAttribute('data-open') !== 'true') {
    await toggleBottomPanel(page);
  }
  if (['structure', 'value', 'machine', 'stepper'].includes(kind)) {
    await page.locator('#bottomTab-semantics').click();
  }
  await page.locator(`#bottomTab-${kind}`).click();
  await expect(page.locator(`.viz-host[data-kind="${kind}"]`)).toHaveAttribute('data-active', 'true');
}

export async function cssLength(page: Page, name: string): Promise<number> {
  return page.locator('#app').evaluate((element, propertyName) => {
    return Number.parseFloat(getComputedStyle(element).getPropertyValue(propertyName));
  }, name);
}
