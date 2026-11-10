import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import certificates from '../../docs/verified-routes.json' with { type: 'json' };
import { RECIPE_MAP, tokenName } from '../../src/game/recipes';
import { createRun } from '../../src/game/engine';
import { DEFAULT_PROFILE, STORAGE_KEY } from '../../src/storage';
import type { Run } from '../../src/game/types';
import { legacyRun, legacySave } from '../fixtures/legacy-save';

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

async function loadSavedPage(page: Page, data: unknown) {
  await page.goto('/');
  await page.evaluate(
    ({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
    },
    { key: STORAGE_KEY, data },
  );
  await page.reload();
}
async function restoreScenario(page: Page, run: Run, reducedMotion = false) {
  await loadSavedPage(page, { version: 3, run, profile: { ...DEFAULT_PROFILE, reducedMotion } });
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
  await expect(result).toContainText('减少一份材料');
  await expect(result).toContainText('本回合继续');
  await page.screenshot({
    path: 'test-results/forge-failure.png',
    scale: 'css',
    animations: 'disabled',
  });
  await result.getByRole('button', { name: '调整再试' }).click();
  await expect(page.locator('.run-meta')).toContainText('01');
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
  await expect(page.locator('.gauge-heat')).toContainText('禁火');
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
  let reloaded = false;
  for (let i = 0; i < certificate.actions.length; i++) {
    const action = certificate.actions[i];
    if (action === 'rest') await page.getByRole('button', { name: /调息/ }).click();
    else {
      await selectTokens(page, RECIPE_MAP[action].inputs);
      await forge(page);
    }
    if (!reloaded && action !== 'rest') {
      const before = await page.locator('.environment').innerText();
      await page.reload();
      await page.getByRole('button', { name: /续燃炉火/ }).click();
      expect(await page.locator('.environment').innerText()).toBe(before);
      await expect(page.locator('.run-meta')).toContainText('02');
      reloaded = true;
    }
  }
  await expect(page.getByRole('heading', { name: '万物初成' })).toBeVisible();
  await expect(page.locator('.score-block strong')).toHaveText(String(certificate.score));
  await expect(page.locator('.creation-tree')).toContainText('本局造物脉络');
  await expect(page.locator('.creation-tree .lineage-rare').first()).toBeVisible();
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
    await expect(page.locator('.forge-scene')).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: `test-results/portrait-${width}x${height}.png`,
      fullPage: true,
      scale: 'css',
    });
    await page.getByRole('tab', { name: /基础元素/ }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('tab', { name: /基础元素/ })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: /^合 成/ })).toBeInViewport({ ratio: 1 });
    await selectTokens(page, ['W', 'F']);
    await expect(page.getByLabel('投入预测')).toBeVisible();
    await expect(page.getByRole('button', { name: /^合 成/ })).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: `test-results/forecast-${width}x${height}.png`,
      fullPage: true,
      scale: 'css',
    });
  });

test('atlas exposes true branches and labels terminal products without invented recipes', async ({
  page,
}) => {
  const run = createRun('normal', 42);
  run.discovered = ['steam', 'pottery'];
  run.ecosystem = [
    { id: 'steam', token: 'steam' },
    { id: 'pottery', token: 'pottery' },
  ];
  await restoreScenario(page, run, true);
  await page.getByRole('tab', { name: /生态产物/ }).click();
  await expect(page.getByRole('button', { name: /投入陶/ })).toContainText('路径终点');
  await page.locator('.run-meta').getByRole('button').click();
  const steam = page
    .locator('.atlas-entry')
    .filter({ has: page.getByRole('heading', { name: /^蒸汽/ }) });
  await expect(steam.getByLabel('蒸汽的延伸线索')).toContainText('蒸汽 → ? → 未发现');
  await expect(steam.locator('.branch-locked')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/feedback-branches.png', scale: 'css' });
  await page.getByRole('button', { name: /二 · 催化/ }).click();
  const pottery = page
    .locator('.atlas-entry')
    .filter({ has: page.getByRole('heading', { name: /^陶/ }) });
  await expect(pottery.getByLabel('陶的延伸线索')).toContainText('路径终点');
  await expect(pottery.locator('.branch-locked')).toHaveCount(0);
  await pottery.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/feedback-atlas.png', scale: 'css' });
});

test('reversed catalysts offer a one-tap order fix and show the actual resource forecast', async ({
  page,
}) => {
  const run = createRun('normal', 42);
  run.ecosystem = [{ id: 'steam', token: 'steam' }];
  run.discovered = ['steam'];
  await restoreScenario(page, run, true);
  await selectTokens(page, ['E', 'steam']);
  await expect(page.getByLabel('投入预测')).toContainText('先放「蒸汽」');
  await page.getByRole('button', { name: '纠正顺序' }).click();
  await expect(page.locator('.input-slot').nth(0)).toContainText('蒸汽');
  await expect(page.getByLabel('投入预测')).toContainText('预计炼成后');
  await forge(page, false);
  await expect(
    page
      .getByRole('dialog', { name: '合成结果' })
      .getByRole('heading', { name: '云', exact: true }),
  ).toBeVisible();
});

test('progressive danger and the forecast warn before a risky forge', async ({ page }) => {
  const run = createRun();
  run.environment.heat = 8;
  run.hand = ['F', 'F', 'W', 'E', 'W', 'E'].map((token, i) => ({ token, id: `h-${i}` }));
  await restoreScenario(page, run, true);
  await expect(page.locator('.gauge-heat')).toHaveClass(/severity-caution/);
  await selectTokens(page, ['F']);
  await expect(page.getByLabel('投入预测').locator('.forecast-values>span').first()).toHaveText(
    /温8→9/,
  );
  await selectTokens(page, ['F']);
  await expect(page.locator('.forecast-risk')).toContainText('将触发反噬');
  await expect(page.getByRole('button', { name: /^合 成/ })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: 'test-results/feedback-warning.png', scale: 'css' });
});

test('free rest keeps the turn and cooldown, while paid rest still prevents a resource dead end', async ({
  page,
}) => {
  const run = createRun();
  run.environment = { heat: 1, moisture: 8, nutrients: 0 };
  await restoreScenario(page, run, true);
  await expect(page.locator('.gauge-heat')).toHaveClass(/severity-warning/);
  const rest = page.getByRole('button', { name: /调息/ });
  await expect(rest).toContainText('免费');
  await rest.click();
  await expect(page.locator('.run-meta')).toContainText('01');
  await expect(page.locator('.gauge-heat')).toHaveClass(/severity-caution/);
  await expect(rest).toContainText('耗1回合');
  await rest.click();
  await expect(page.locator('.run-meta')).toContainText('02');
  await page.reload();
  await page.getByRole('button', { name: /续燃炉火/ }).click();
  await expect(page.getByRole('button', { name: /调息/ })).toContainText('耗1回合');
  await expect(page.locator('.rest-cooldown')).toContainText('第 4 回合');
});

test('same-turn failure persists and repeated disproven guesses do not charge again', async ({
  page,
}) => {
  const run = createRun();
  run.hand = ['W', 'W', 'W', 'F', 'E', 'E'].map((token, i) => ({ token, id: `h-${i}` }));
  await restoreScenario(page, run, true);
  await selectTokens(page, ['W', 'W', 'W']);
  await forge(page);
  await page.reload();
  await page.getByRole('button', { name: /续燃炉火/ }).click();
  await expect(page.locator('.run-meta')).toContainText('01');
  await selectTokens(page, ['W', 'W', 'W']);
  await expect(page.getByLabel('投入预测')).toContainText('已经试过');
  await expect(page.getByRole('button', { name: /^合 成/ })).toBeDisabled();
  const runAfter = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).run,
    STORAGE_KEY,
  );
  expect(runAfter.environment.nutrients).toBe(4);
  expect(runAfter.logs).toHaveLength(1);
});

test('home offers only twelve-turn forging plus separate three-turn teaching', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.difficulty-picker')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /寻道|大师/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^开始炼化/ })).toContainText('12 回合');
  await expect(page.getByRole('button', { name: /入炉修习/ })).toContainText('3 回合');
  await page.getByRole('button', { name: /^开始炼化/ }).click();
  await expect(page.locator('.run-meta')).toContainText('炼化之旅');
  await expect(page.locator('.run-meta')).toContainText('/ 12');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: /查看玩法说明/ }).click();
  const help = page.getByRole('dialog', { name: '炉前须知' });
  await expect(help).not.toContainText('大师');
  await expect(help).not.toContainText('寻道');
  await expect(help).toContainText('正式游戏固定 12 回合');
});

test('canceling a restart preserves the run and confirming always starts a clean twelve-turn run', async ({
  page,
}) => {
  await restoreScenario(page, createRun('normal', 20261106), true);
  await selectTokens(page, ['W', 'F']);
  await forge(page);
  const before = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).run,
    STORAGE_KEY,
  );
  await page.getByRole('button', { name: '返回首页' }).click();
  await page.getByRole('button', { name: '另启一炉' }).click();
  await expect(page.getByRole('dialog', { name: '另启一炉？' })).toContainText('新的12回合炼化');
  await page.getByRole('button', { name: '保留这炉' }).click();
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).run, STORAGE_KEY),
  ).toEqual(before);
  await page.getByRole('button', { name: /续燃炉火/ }).click();
  await expect(page.locator('.run-meta')).toContainText('02');
  await page.getByRole('button', { name: '返回首页' }).click();
  await page.getByRole('button', { name: '另启一炉' }).click();
  await page.getByRole('button', { name: '确认开新局' }).click();
  await expect(page.locator('.run-meta')).toContainText('01');
  await expect(page.locator('.run-meta')).toContainText('/ 12');
  const current = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(current.version).toBe(3);
  expect(current.run.version).toBe(3);
  expect(current.run).not.toHaveProperty('difficulty');
  expect(current.run.discovered).toEqual([]);
  expect(current.profile.discovered).toContain('steam');
});

for (const difficulty of ['explore', 'standard', 'master'] as const)
  test(`an old ${difficulty} save resumes only under the common twelve-turn rules`, async ({
    page,
  }) => {
    const data = legacySave(difficulty, 2);
    data.run.discovered = ['steam'];
    data.run.ecosystem = [{ id: 'p-1', token: 'steam', createdTurn: 1 }];
    await loadSavedPage(page, data);
    await expect(page.getByRole('button', { name: /寻道|大师/ })).toHaveCount(0);
    await page.getByRole('button', { name: /续燃炉火/ }).click();
    await expect(page.locator('.run-meta')).toContainText('炼化之旅');
    await expect(page.locator('.run-meta')).toContainText('02');
    await expect(page.locator('.run-meta')).toContainText('/ 12');
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
    expect(saved.version).toBe(3);
    expect(saved.run.version).toBe(3);
    expect(saved.run).not.toHaveProperty('difficulty');
    expect(saved.run.hand).toEqual(data.run.hand);
    expect(saved.run.ecosystem).toEqual(data.run.ecosystem);
    expect(saved.run.rng).toBe(data.run.rng);
    expect(saved.profile.bestScore).toBe(210);
    expect(saved.profile).not.toHaveProperty('bestScores');
    expect(saved.profile).not.toHaveProperty('lastDifficulty');
    await expect(page.getByRole('button', { name: /调息/ })).toContainText('免费');
    await page.reload();
    await page.getByRole('button', { name: /续燃炉火/ }).click();
    await expect(page.locator('.run-meta')).toContainText('/ 12');
  });

for (const turn of [13, 14, 15])
  test(`an old turn-${turn} save retires once while preserving collection and records`, async ({
    page,
  }) => {
    const data = legacySave('explore', turn);
    data.run.discovered = ['steam', 'cloud', 'rain'];
    data.profile.discovered = ['steam'];
    await loadSavedPage(page, data);
    await expect(page.getByRole('status')).toContainText('超过12回合');
    await expect(page.getByRole('button', { name: /续燃炉火/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^开始炼化/ })).toBeVisible();
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
    expect(saved.version).toBe(3);
    expect(saved.run).toBeNull();
    expect(saved.profile.discovered).toEqual(['steam', 'cloud', 'rain']);
    expect(saved.profile.bestScore).toBe(210);
    await page.getByRole('button', { name: /万物图鉴/ }).click();
    await expect(page.locator('.modal-lead')).toContainText('历史收录 3 / 28');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.reload();
    await expect(page.locator('.storage-warning')).toHaveCount(0);
    await page.getByRole('button', { name: /^开始炼化/ }).click();
    await expect(page.locator('.run-meta')).toContainText('/ 12');
  });

test('a v1 checkpoint upgrades and remains playable without losing its hand or history', async ({
  page,
}) => {
  const original = legacyRun('standard', 2);
  const run: Record<string, unknown> = {
    ...original,
    version: 1,
    logs: original.logs.map(({ advanced, ...log }) => {
      void advanced;
      return log;
    }),
  };
  for (const key of ['difficulty', 'revision', 'freeRestReadyTurn', 'failedSequences'])
    delete run[key];
  await loadSavedPage(page, {
    version: 1,
    profile: { ...DEFAULT_PROFILE, discovered: ['steam'], bestScore: 143 },
    run,
  });
  await page.getByRole('button', { name: /续燃炉火/ }).click();
  await expect(page.locator('.run-meta')).toContainText('02');
  await expect(page.locator('.run-meta')).toContainText('/ 12');
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(saved.run.hand).toEqual(original.hand);
  expect(saved.profile.discovered).toEqual(['steam']);
  expect(saved.profile.bestScore).toBe(143);
  expect(saved.version).toBe(3);
});
