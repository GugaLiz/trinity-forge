import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

async function setVisibleHeight(page: Page, height: number) {
  await page.evaluate((height) => {
    Object.defineProperty(window.visualViewport!, 'height', {
      configurable: true,
      get: () => height,
    });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  }, height);
  await expect(page.locator('html')).toHaveCSS('--app-viewport-height', `${height}px`);
}

async function expectReachable(button: Locator, height: number) {
  await expect(button).toBeInViewport({ ratio: 1 });
  const bounds = (await button.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
  expect(
    await button.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    }),
  ).toBe(true);
}

async function expectUnclippedFurnace(page: Page) {
  const scene = page.locator('.forge-scene');
  const frame = (await scene.boundingBox())!;
  const furnace = (await scene.locator('.furnace').boundingBox())!;
  expect(furnace.width).toBeGreaterThanOrEqual(140);
  expect(furnace.height).toBeGreaterThanOrEqual(140);
  for (const child of await scene.locator(':scope > *').all()) {
    const bounds = (await child.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(frame.x);
    expect(bounds.y).toBeGreaterThanOrEqual(frame.y);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(frame.x + frame.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(frame.y + frame.height);
  }
  for (const script of await scene.locator('.vertical-script').all()) {
    const bounds = (await script.boundingBox())!;
    expect(bounds.width).toBeLessThanOrEqual(24);
    expect(bounds.height).toBeGreaterThanOrEqual(48);
    await expect(script).toHaveCSS('writing-mode', 'vertical-rl');
  }
}

test('browser toolbars can shrink the visible area without hiding forge controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    if (window.visualViewport)
      Object.defineProperty(window.visualViewport, 'height', {
        configurable: true,
        get: () => 620,
      });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^开始炼化/ }).click();
  await expectUnclippedFurnace(page);
  await page.getByRole('button', { name: /^投入水/ }).click();
  await page.getByRole('button', { name: /^投入火/ }).click();
  await page.evaluate(() => {
    const toolbar = document.createElement('div');
    toolbar.setAttribute('aria-hidden', 'true');
    toolbar.dataset.testid = 'browser-toolbar';
    toolbar.style.cssText =
      'position:fixed;inset:620px 0 0;background:#c5c7c8;z-index:100;color:#253025;display:grid;place-items:center;font:14px sans-serif';
    toolbar.textContent = '浏览器工具栏（测试模拟）';
    document.body.append(toolbar);
  });
  const button = page.getByRole('button', { name: /^合 成/ });
  const bounds = await button.boundingBox();
  await page.screenshot({ path: 'test-results/browser-toolbar-375x812.png', scale: 'css' });
  expect(bounds).not.toBeNull();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(620);
  expect(
    await button.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    }),
  ).toBe(true);
});

test('toolbar resizing preserves selection and keeps scrolling separate from controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByRole('button', { name: /^开始炼化/ }).click();
  await page.getByRole('button', { name: /^投入水/ }).click();
  await page.getByRole('button', { name: /^投入火/ }).click();
  const forge = page.getByRole('button', { name: /^合 成/ });
  for (const height of [480, 720, 620]) {
    await setVisibleHeight(page, height);
    await expectUnclippedFurnace(page);
    await expectReachable(forge, height);
    await expect(forge).toBeEnabled();
    await expect(page.locator('.input-slot').nth(0)).toContainText('水');
    await expect(page.locator('.input-slot').nth(1)).toContainText('火');
    await page.locator('.game-content').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expectReachable(page.getByRole('button', { name: '查看炉记' }), height);
    await expectReachable(forge, height);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
  await page.getByRole('button', { name: /调息/ }).click();
  await expect(page.locator('.rest-cooldown')).toBeVisible();
  await expectReachable(page.locator('.rest-cooldown'), 620);
  await expectReachable(forge, 620);
});

for (const width of [320, 375, 430]) {
  test(`short ${width}px viewport respects safe areas and allows tutorial results`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/');
    await setVisibleHeight(page, 520);
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--app-safe-top', '44px');
      document.documentElement.style.setProperty('--app-safe-bottom', '34px');
    });
    await page.getByRole('button', { name: /入炉修习/ }).click();
    await expectUnclippedFurnace(page);
    await page.getByRole('button', { name: /^投入水/ }).click();
    await page.getByRole('button', { name: /^投入火/ }).click();
    const forge = page.getByRole('button', { name: /^合 成/ });
    await expectReachable(forge, 520 - 34);
    await page.locator('.tutorial-callout').scrollIntoViewIfNeeded();
    await expectReachable(page.locator('.tutorial-callout'), 520);
    await expectReachable(forge, 520 - 34);
    expect(await page.locator('.topbar').evaluate((el) => el.getBoundingClientRect().top)).toBe(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await forge.click();
    const result = page.getByRole('dialog', { name: '合成结果' });
    await expect(result).toBeVisible();
    const collect = result.getByRole('button', { name: '收下产物' });
    await collect.scrollIntoViewIfNeeded();
    await expectReachable(collect, 520 - 34);
    await page.screenshot({ path: `test-results/short-safe-result-${width}.png`, scale: 'css' });
    await collect.click();
    await expect(page.locator('.run-meta')).toContainText('02');
    await expectReachable(forge, 520 - 34);
  });
}

test('browsers without visualViewport use window resize and release the home page', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'visualViewport', { get: () => undefined });
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.getByRole('button', { name: /^开始炼化/ }).click();
  await expectReachable(page.getByRole('button', { name: /^合 成/ }), 568);
  await page.setViewportSize({ width: 320, height: 480 });
  await expect(page.locator('html')).toHaveCSS('--app-viewport-height', '480px');
  await expectReachable(page.getByRole('button', { name: /^合 成/ }), 480);
  await page.getByRole('button', { name: '返回首页' }).click();
  await expect(page.locator('html')).not.toHaveClass(/is-playing/);
  await expect(page.locator('html')).toHaveCSS('overflow-y', 'visible');
  await expect(page.getByRole('button', { name: /续燃炉火/ })).toBeVisible();
});
