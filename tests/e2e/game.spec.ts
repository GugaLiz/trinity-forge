import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import certificates from '../../docs/verified-routes.json' with { type: 'json' };
import { RECIPE_MAP, tokenName } from '../../src/game/recipes';
import { createRun } from '../../src/game/engine';
import { DEFAULT_PROFILE, STORAGE_KEY } from '../../src/storage';
import type { Run } from '../../src/game/types';

async function selectTokens(page: Page, tokens: string[]) {
  for (const token of tokens) {
    const base = ['W', 'F', 'E'].includes(token);
    await page.getByRole('tab', { name: base ? /基础元素/ : /生态产物/ }).click();
    await page
      .getByRole('button', { name: new RegExp(`^投入${tokenName(token)}(，|$)`) })
      .and(page.locator('button:enabled'))
      .first()
      .click();
  }
}
async function forge(page: Page, acknowledge = true) {
  const button = page.getByRole('button', { name: /^合 成/ });
  await expect(button).toBeEnabled();
  await button.click();
  const result = page.getByRole('dialog', { name: /^(合成结果|合成未成|万物初生)$/ });
  await expect(result).toBeVisible();
  if (acknowledge) await result.locator('.primary-button').click();
}

async function restoreScenario(page: Page, run: Run, reducedMotion = false) {
  await page.goto('/');
  await page.evaluate(
    ({ key, run, profile }) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, run, profile }));
    },
    { key: STORAGE_KEY, run, profile: { ...DEFAULT_PROFILE, reducedMotion } },
  );
  await page.reload();
  await page.getByRole('button', { name: /续燃炉火/ }).click();
}

test('forging shows fire, steam, shake and an acknowledged ordinary result exactly once', async ({
  page,
}) => {
  await restoreScenario(page, createRun('normal', 20261106));
  await selectTokens(page, ['W', 'F']);
  await page.getByRole('button', { name: /^合 成/ }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  const working = page.getByRole('dialog', { name: '炉火炼化中' });
  await expect(working).toBeVisible();
  await expect(working.locator('.furnace')).toHaveClass(/is-working.*has-fire.*has-water/);
  await expect(working.locator('.forge-flames path')).toHaveCount(4);
  await expect(working.locator('.forge-plumes path')).toHaveCount(3);
  expect(
    await working.locator('.forge-art').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('furnace-shake');
  await page.keyboard.press('Escape');
  await expect(working).toBeVisible();
  await expect(working.locator('.reaction-token').last()).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/forge-working.png', scale: 'css' });
  const result = page.getByRole('dialog', { name: '合成结果' });
  await expect(result).toBeVisible();
  await expect(result.getByRole('heading', { name: '蒸汽', exact: true })).toBeVisible();
  await expect(result.locator('.reaction-equation')).toContainText('水 + 火');
  await expect(result.locator('.reaction-reward')).toContainText('发现 +10 分');
  await expect(result.getByLabel('本回合资源变化')).toContainText('炉温');
  await page.screenshot({
    path: 'test-results/forge-result.png',
    scale: 'css',
    animations: 'disabled',
  });
  await result.getByRole('button', { name: '收下产物' }).click();
  await expect(page.getByRole('tab', { name: /生态产物/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('button', { name: /投入蒸汽/ })).toBeVisible();
  const logCount = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).run.logs.length,
    STORAGE_KEY,
  );
  expect(logCount).toBe(1);
});

test('an unknown combination explains the failure, resource cost and next step', async ({
  page,
}) => {
  const run = createRun('normal', 42);
  run.hand = ['W', 'W', 'W', 'F', 'E', 'E'].map((token, i) => ({ token, id: `h-1-${i}` }));
  await restoreScenario(page, run);
  await selectTokens(page, ['W', 'W', 'W']);
  await forge(page, false);
  const result = page.getByRole('dialog', { name: '合成未成' });
  await expect(result).toContainText('本次未能合成');
  await expect(result).toContainText('仅消耗 1 基础养分');
  await expect(result).toContainText('更换材料或调整顺序');
  await page.screenshot({
    path: 'test-results/forge-failure.png',
    scale: 'css',
    animations: 'disabled',
  });
  await result.getByRole('button', { name: '调整再试' }).click();
  await expect(page.locator('.run-meta')).toContainText('02');
});

test('backlash explicitly reports a newly forged product being destroyed', async ({ page }) => {
  const run = createRun('normal', 42);
  run.environment.heat = 9;
  run.hand = ['F', 'F', 'W', 'E', 'E', 'W'].map((token, i) => ({ token, id: `h-1-${i}` }));
  await restoreScenario(page, run);
  await selectTokens(page, ['F', 'F']);
  await forge(page, false);
  const result = page.getByRole('dialog', { name: '合成结果' });
  await expect(result.locator('.reaction-backlash')).toContainText('烈焰消散');
  await expect(result.locator('.reaction-backlash')).toBeInViewport({ ratio: 1 });
  await expect(result.locator('.reaction-destination')).toContainText('已被反噬摧毁');
  await expect(result.locator('.reaction-reward')).toContainText('发现 +8 分');
  await page.screenshot({
    path: 'test-results/forge-backlash.png',
    scale: 'css',
    animations: 'disabled',
  });
  await result.getByRole('button', { name: '继续炼化' }).click();
  await expect(page.locator('.gauge-heat')).toContainText('本回合禁火');
});

test('reduced motion keeps the same result without a furnace shake', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await restoreScenario(page, createRun('normal', 20261106), true);
  await selectTokens(page, ['W', 'F']);
  await forge(page, false);
  const result = page.getByRole('dialog', { name: '合成结果' });
  await expect(result).toContainText('蒸汽');
  expect(
    await result.locator('.reaction-outcome').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await result.getByRole('button', { name: '收下产物' }).click();
  await expect(page.locator('.run-meta')).toContainText('02');
});

test('refreshing during the effect restores the already committed turn without rerolling', async ({
  page,
}) => {
  await restoreScenario(page, createRun('normal', 20261106));
  await selectTokens(page, ['W', 'F']);
  await page.getByRole('button', { name: /^合 成/ }).click();
  await expect(page.getByRole('dialog', { name: '炉火炼化中' })).toBeVisible();
  const before = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).run,
    STORAGE_KEY,
  );
  await page.reload();
  await page.getByRole('button', { name: /续燃炉火/ }).click();
  await expect(page.locator('.run-meta')).toContainText('02');
  const after = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).run,
    STORAGE_KEY,
  );
  expect(after).toEqual(before);
  await selectTokens(page, ['W', 'F']);
  await forge(page, false);
  await expect(page.locator('.reaction-reward')).toContainText('重复炼成不重复计分');
});

test('ordinary forge feedback and its action fit a 320px portrait screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await restoreScenario(page, createRun('normal', 20261106));
  await selectTokens(page, ['W', 'F']);
  await forge(page, false);
  const result = page.getByRole('dialog', { name: '合成结果' });
  await expect(result.getByRole('button', { name: '收下产物' })).toBeInViewport({ ratio: 1 });
  const overflow = await result.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflow).toBe(false);
  await page.screenshot({
    path: 'test-results/forge-result-320.png',
    scale: 'css',
    animations: 'disabled',
  });
});

test('three-round tutorial leads to first rain, then a clean formal game', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.screenshot({ path: 'test-results/home.png', scale: 'css' });
  await page.getByRole('button', { name: /入炉修习/ }).click();
  for (const tokens of [
    ['W', 'F'],
    ['steam', 'E'],
    ['cloud', 'W'],
  ]) {
    await selectTokens(page, tokens);
    await forge(page, tokens[0] !== 'cloud');
  }
  await expect(page.getByRole('dialog', { name: '万物初生' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '雨', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /收录造化/ }).click();
  await expect(page.getByRole('heading', { name: '初识造化' })).toBeVisible();
  await page.getByRole('button', { name: /开启造化之旅/ }).click();
  await expect(page.locator('.run-meta')).toContainText('01');
  await expect(page.locator('.run-meta')).toContainText('本局 0');
  expect(errors).toEqual([]);
});

test('formal route wins, persists a round and does not duplicate after refresh', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: /开启固定演示局/ }).click();
  const certificate = certificates.results[0];
  for (let i = 0; i < certificate.actions.length; i++) {
    const action = certificate.actions[i];
    if (action === 'rest') await page.getByRole('button', { name: /调息/ }).click();
    else {
      await selectTokens(page, RECIPE_MAP[action].inputs);
      await forge(page);
    }
    if (i === 0) {
      const before = await page.locator('.environment').innerText();
      await page.reload();
      await page.getByRole('button', { name: /续燃炉火/ }).click();
      expect(await page.locator('.environment').innerText()).toBe(before);
      await expect(page.locator('.run-meta')).toContainText('02');
    }
  }
  await expect(page.getByRole('heading', { name: '万物初成' })).toBeVisible();
  await expect(page.locator('.score-block strong')).toHaveText(String(certificate.score));
  await page.screenshot({ path: 'test-results/result.png', fullPage: true, scale: 'css' });
  await page.reload();
  await expect(page.getByRole('button', { name: /续燃炉火/ })).toHaveCount(0);
  await page.getByRole('button', { name: /万物图鉴/ }).click();
  await expect(page.locator('.modal-lead')).toContainText(
    `历史收录 ${certificate.discovered.length}`,
  );
  await page.screenshot({ path: 'test-results/atlas.png', scale: 'css' });
});

test('reordering, withdrawal, invalid sequence and game restart remain operable', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /开始炼化/ }).click();
  await selectTokens(page, ['W', 'F']);
  await page.getByRole('button', { name: '选中第2槽调序' }).click();
  await page.getByRole('button', { name: '向左移动' }).click();
  await expect(page.locator('.input-slot').nth(0)).toContainText('火');
  await page.getByRole('button', { name: '撤回火', exact: true }).click();
  await expect(page.locator('.input-slot').nth(0)).toContainText('水');
  await expect(page.getByRole('button', { name: /^合 成/ })).toBeDisabled();
  await page.getByRole('button', { name: '返回首页' }).click();
  await page.getByRole('button', { name: '另启一炉' }).click();
  await expect(page.getByRole('dialog', { name: '另启一炉？' })).toBeVisible();
  await page.getByRole('button', { name: /确认开新局/ }).click();
  await expect(page.locator('.run-meta')).toContainText('01');
});

for (const [width, height] of [
  [320, 568],
  [360, 640],
  [375, 667],
  [390, 844],
  [430, 932],
])
  test(`portrait layout ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.getByRole('button', { name: /开始炼化/ }).click();
    const layout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(layout.width).toBeLessThanOrEqual(layout.viewport);
    await expect(page.getByRole('button', { name: /^合 成/ })).toBeInViewport();
    await expect(page.getByRole('tab', { name: /基础元素/ })).toBeInViewport();
    await page.screenshot({
      path: `test-results/portrait-${width}x${height}.png`,
      fullPage: true,
      scale: 'css',
    });
  });
