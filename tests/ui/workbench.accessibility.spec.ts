import { expect, test, type Page } from '@playwright/test';
import { layoutStorageKey, loadWorkbench, openBottomTab } from './workbenchTestUtils';

type Viewport = { width: number; height: number };

const targetViewports: Viewport[] = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 }
];

async function loadAtViewport(page: Page, viewport: Viewport): Promise<void> {
  await page.setViewportSize(viewport);
  await loadWorkbench(page);
}

async function runPaletteCommand(page: Page, command: string): Promise<void> {
  await page.keyboard.press('F1');
  await expect(page.locator('#commandPalette')).toHaveAttribute('open', '');
  await page.keyboard.type(command);
  await expect(page.getByRole('option', { name: new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#commandPalette')).not.toHaveAttribute('open', '');
}

test('all supported viewports keep shell controls, drawers, and resize state usable', async ({ page }) => {
  test.setTimeout(60_000);

  for (const viewport of targetViewports) {
    await test.step(`${viewport.width} × ${viewport.height}`, async () => {
      await loadAtViewport(page, viewport);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      if (viewport.width >= 1280) {
        for (const name of ['File', 'Examples', 'View', 'Renderer', 'More']) {
          await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
        }
        await expect(page.locator('.workspace-run-button')).toBeVisible();
        await expect(page.locator('#themeToggleButton')).toBeVisible();
        await expect(page.locator('#sidebarResizeHandle')).toHaveAttribute('aria-disabled', 'false');
        await expect(page.locator('#resizeHandle')).toHaveAttribute('aria-disabled', 'false');
      } else {
        await expect(page.locator('#sidebarResizeHandle')).toHaveCSS('display', 'none');
        await expect(page.locator('#resizeHandle')).toHaveCSS('display', 'none');
        await expect(page.locator('#sidebarResizeHandle')).toHaveAttribute('aria-disabled', 'true');
        await expect(page.locator('#resizeHandle')).toHaveAttribute('aria-disabled', 'true');

        await page.locator('#showToolboxFromWorkspace').click();
        await expect(page.locator('#app')).not.toHaveClass(/toolbox-hidden/);
        await page.keyboard.press('Escape');
        await expect(page.locator('#app')).toHaveClass(/toolbox-hidden/);
        await expect(page.locator('#showToolboxFromWorkspace')).toBeFocused();

        await page.locator('#showCodeFromWorkspace').click();
        await expect(page.locator('#app')).not.toHaveClass(/code-hidden/);
        await page.keyboard.press('Escape');
        await expect(page.locator('#app')).toHaveClass(/code-hidden/);
        await expect(page.locator('#showCodeFromWorkspace')).toBeFocused();
      }

      if (viewport.width <= 620) {
        const menuBounds = await page.locator('#menuToggle').boundingBox();
        expect(menuBounds).not.toBeNull();
        expect((menuBounds?.x ?? 0) + (menuBounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
        await page.locator('#menuToggle').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#app')).toHaveClass(/menu-open/);
        await page.keyboard.press('Escape');
        await expect(page.locator('#app')).not.toHaveClass(/menu-open/);
        await expect(page.locator('#menuToggle')).toBeFocused();

        await page.keyboard.press('Control+j');
        await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'true');
        await expect(page.locator('#vizResizer')).not.toHaveCSS('display', 'none');
        await expect(page.locator('#vizResizer')).toHaveAttribute('aria-disabled', 'false');
        await expect(page.locator('#vizResizer')).toHaveAttribute('tabindex', '0');
        await page.locator('#vizMaximize').click();
        await expect(page.locator('#vizDock')).toHaveAttribute('data-maximized', 'true');
        await page.locator('#vizMaximize').click();
        await expect(page.locator('#vizDock')).toHaveAttribute('data-maximized', 'false');
        await page.keyboard.press('Escape');
        await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'false');
      }
    });
  }
});

test('keyboard-only command routes keep focus and expose every primary workbench view', async ({ page }) => {
  await loadAtViewport(page, { width: 1440, height: 900 });

  const fileMenu = page.getByRole('button', { name: 'File', exact: true });
  await fileMenu.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: /Open…/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(fileMenu).toBeFocused();

  const examplesMenu = page.getByRole('button', { name: 'Examples', exact: true });
  await examplesMenu.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: /Identity Function/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#exampleLoadDialog')).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');

  await page.keyboard.press('/');
  await expect(page.locator('#toolboxSearch')).toBeFocused();
  await page.keyboard.type('boolean');
  await expect(page.locator('.toolbox-block-card:visible')).toHaveCount(2);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');

  await page.locator('.workspace-run-button').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#bottomTab-machine')).toHaveAttribute('aria-selected', 'true');

  await runPaletteCommand(page, 'View: Show Code');
  await expect(page.locator('#lambdaEditorPane')).toBeVisible();
  await runPaletteCommand(page, 'View: Show Inferred Types');
  await expect(page.locator('#typesPane')).toBeVisible();
  await runPaletteCommand(page, 'View: Show Problems');
  await expect(page.locator('#bottomTab-problems')).toHaveAttribute('aria-selected', 'true');
  await runPaletteCommand(page, 'View: Show Output');
  await expect(page.locator('#bottomTab-output')).toHaveAttribute('aria-selected', 'true');
  await runPaletteCommand(page, 'Run: CEK Machine');
  await expect(page.locator('#bottomTab-machine')).toHaveAttribute('aria-selected', 'true');
  await runPaletteCommand(page, 'Perspective: Debug');
  await expect(page.locator('#statusPerspective')).toHaveText('Debug');

  const themeBefore = await page.locator('html').getAttribute('data-theme');
  await runPaletteCommand(page, 'Preferences: Toggle Color Theme');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', themeBefore ?? 'dark');

  await page.keyboard.press('Control+b');
  await expect(page.locator('#app')).toHaveClass(/toolbox-hidden/);
  await page.keyboard.press('Control+b');
  await expect(page.locator('#app')).not.toHaveClass(/toolbox-hidden/);
  await page.keyboard.press('Control+Alt+c');
  await expect(page.locator('#app')).toHaveClass(/code-hidden/);
  await page.keyboard.press('Control+Alt+c');
  await expect(page.locator('#app')).not.toHaveClass(/code-hidden/);
});

test('inspector and bottom selections persist, while invalid stored values fall back safely', async ({ page }) => {
  await loadAtViewport(page, { width: 1440, height: 900 });
  await page.locator('#codeTargetOutline').click();
  await openBottomTab(page, 'machine');
  await page.reload();
  await expect(page.locator('#outlinePane')).toBeVisible();
  await expect(page.locator('#bottomTab-machine')).toHaveAttribute('aria-selected', 'true');

  await page.evaluate((layoutKey) => {
    window.localStorage.setItem('block-lambda-active-inspector-target', 'not-a-view');
    window.localStorage.setItem(layoutKey, JSON.stringify({
      sidebarVisible: 'always',
      sidebarWidth: -100,
      codeVisible: 'yes',
      codeWidth: 9999,
      bottomVisible: 1,
      bottomHeight: Number.NaN,
      bottomTab: 'missing',
      perspective: 'unknown'
    }));
  }, layoutStorageKey);
  await page.reload();
  await expect(page.locator('#blocklyDiv .blocklySvg')).toBeVisible();
  await expect(page.locator('#codeTargetCode')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#sidebarResizeHandle')).toHaveAttribute('aria-valuenow', '240');
  await expect(page.locator('#resizeHandle')).toHaveAttribute('aria-valuenow', '760');
});

test('lightweight accessibility contract holds in desktop and mobile layouts', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await loadAtViewport(page, viewport);
    const issues = await page.evaluate(() => {
      const visible = (element: Element): boolean => {
        const node = element as HTMLElement;
        return !node.closest('[hidden]') && node.getClientRects().length > 0;
      };
      const ids = new Map<string, number>();
      for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
        ids.set(element.id, (ids.get(element.id) ?? 0) + 1);
      }
      const duplicates = [...ids].filter(([, count]) => count > 1).map(([id]) => id);
      // `innerText` reflects what is actually rendered, so a label hidden by a
      // responsive `display: none` rule no longer counts as an accessible name.
      // `textContent` would still see it and let an unnamed control pass.
      const unnamedButtons = [...document.querySelectorAll<HTMLButtonElement>('button')]
        .filter(visible)
        .filter((button) => !button.getAttribute('aria-label') && !button.getAttribute('aria-labelledby') && !button.innerText.trim() && !button.title)
        .map((button) => button.id || button.className);
      const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')]
        .filter(visible)
        .flatMap((tab) => {
          const controls = tab.getAttribute('aria-controls');
          return !controls || !document.getElementById(controls) || !tab.hasAttribute('aria-selected')
            ? [tab.id || tab.textContent?.trim() || 'unnamed tab']
            : [];
        });
      const badSeparators = [...document.querySelectorAll<HTMLElement>('[role="separator"]')]
        .filter(visible)
        .filter((separator) => !separator.getAttribute('aria-orientation') || !separator.getAttribute('aria-label'))
        .map((separator) => separator.id || 'unnamed separator');
      return {
        duplicates,
        unnamedButtons,
        tabs,
        badSeparators,
        h1Count: document.querySelectorAll('h1').length,
        mainCount: document.querySelectorAll('main').length,
        headerCount: document.querySelectorAll('header[aria-label]').length,
        footerCount: document.querySelectorAll('footer[aria-label]').length
      };
    });
    expect(issues.duplicates).toEqual([]);
    expect(issues.unnamedButtons).toEqual([]);
    expect(issues.tabs).toEqual([]);
    expect(issues.badSeparators).toEqual([]);
    expect(issues.h1Count).toBe(1);
    expect(issues.mainCount).toBe(1);
    expect(issues.headerCount).toBeGreaterThanOrEqual(1);
    expect(issues.footerCount).toBe(1);
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.locator('#menuToggle').evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(0.01);
});

test('primary bottom tabs keep accessible names where the phone layout hides their labels', async ({ page }) => {
  await loadAtViewport(page, { width: 390, height: 844 });
  await page.keyboard.press('Control+j');
  await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'true');

  // At <=620px `.viz-tab-label` is hidden for every unselected primary tab, so
  // the rendered text cannot be the accessible name.
  for (const id of ['bottomTab-problems', 'bottomTab-output', 'bottomTab-semantics']) {
    await expect(page.locator(`#${id}`)).toHaveAttribute('aria-label', /\S/);
  }
  // The label really is unrendered here, so `aria-label` is what names the tab.
  await expect
    .poll(() => page.locator('#bottomTab-output').evaluate((element) => (element as HTMLElement).innerText.trim()))
    .toBe('');
  await expect(page.getByRole('tab', { name: 'Output', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Semantics', exact: true })).toBeVisible();
});

test('bottom-panel tools stay reachable through the palette where the phone layout hides them', async ({ page }) => {
  await loadAtViewport(page, { width: 390, height: 844 });
  await page.keyboard.press('Control+j');
  await expect(page.locator('#vizRerun')).toBeHidden();
  await expect(page.locator('#vizArrange')).toBeHidden();

  await runPaletteCommand(page, 'Run: Re-run Active Semantic View');
  await runPaletteCommand(page, 'Run: Arrange Reduction Steps');
});

test('the bottom-panel resizer works at tablet and phone widths', async ({ page }) => {
  for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await loadAtViewport(page, viewport);
    await page.keyboard.press('Control+j');
    await expect(page.locator('#vizDock')).toHaveAttribute('data-open', 'true');

    const resizer = page.locator('#vizResizer');
    await expect(resizer).not.toHaveCSS('display', 'none');
    await expect(resizer).toHaveAttribute('aria-disabled', 'false');

    const heightBefore = await page.locator('#vizDock').evaluate((element) => element.getBoundingClientRect().height);
    const box = await resizer.boundingBox();
    if (!box) throw new Error('Expected the bottom-panel resizer to have layout bounds.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 80, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => page.locator('#vizDock').evaluate((element) => element.getBoundingClientRect().height))
      .not.toBe(heightBefore);
  }
});
