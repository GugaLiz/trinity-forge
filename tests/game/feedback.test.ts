import { describe, expect, it } from 'vitest';
import { act, createRun, freeRestAvailable, preview, turnLimit } from '../../src/game/engine';
import { branches, environmentHint, explorationHint, severity } from '../../src/game/guidance';
import { DEFAULT_PROFILE, loadData, saveData, validRun } from '../../src/storage';
import type { Run } from '../../src/game/types';

function forge(run: Run, tokens: string[]) {
  const ids: string[] = [];
  for (const token of tokens) {
    const item = [...run.hand, ...run.ecosystem].find(
      (m) => m.token === token && !ids.includes(m.id),
    );
    if (!item) throw new Error(`Unavailable ${token}`);
    ids.push(item.id);
  }
  return act(run, { type: 'forge', ids, turn: run.turn, revision: run.revision });
}
function rest(run: Run) {
  return act(run, { type: 'rest', turn: run.turn, revision: run.revision }).run;
}
function scenario() {
  const run = createRun();
  run.hand = ['W', 'W', 'W', 'F', 'E', 'E'].map((token, i) => ({ id: `h-1-${i}`, token }));
  return run;
}

describe('exploration has a bounded nutrient cost', () => {
  it('failed exploration keeps the turn, hand, ecology, and RNG without farming recovery', () => {
    const run = scenario();
    run.ecosystem = [{ id: 'old', token: 'rock' }];
    const before = structuredClone(run);
    const next = forge(run, ['W', 'W', 'W']).run;
    expect(next.turn).toBe(1);
    expect(next.revision).toBe(1);
    expect(next.environment).toEqual({ heat: 5, moisture: 5, nutrients: 4 });
    expect(next.hand).toEqual(run.hand);
    expect(next.ecosystem).toEqual(run.ecosystem);
    expect(next.rng).toBe(run.rng);
    expect(run).toEqual(before);
    expect(next.logs[0].advanced).toBe(false);
    expect(next.logs[0].hint).toContain('减少');
  });
  it('rejects a stale same-turn command and remembers already disproven combinations', () => {
    const run = scenario();
    const command = {
      type: 'forge' as const,
      ids: run.hand.slice(0, 3).map((m) => m.id),
      turn: 1,
      revision: 0,
    };
    const next = act(run, command).run;
    expect(act(next, command).run).toBe(next);
    const retry = act(next, { ...command, revision: next.revision });
    expect(retry.error).toContain('已经试过');
    expect(retry.run).toBe(next);
  });
  it('a humidity failure can retry with a new RNG state, without drawing a new hand', () => {
    let run = createRun();
    run.environment.moisture = 7;
    run.rng = 1;
    const hand = structuredClone(run.hand);
    run = forge(run, ['W', 'F']).run;
    expect(run.turn).toBe(1);
    expect(run.logs[0].failure).toBe('humidity');
    expect(run.failedSequences).toEqual([]);
    expect(run.hand).toEqual(hand);
    run = forge(run, ['W', 'F']).run;
    expect(run.turn).toBe(1);
    run = forge(run, ['W', 'F']).run;
    expect(run.turn).toBe(2);
    expect(run.discovered).toEqual(['steam']);
  });
  it('the exact feedback playthrough has seven discoveries with five turns still available', () => {
    let run = createRun('normal', 20261106);
    for (const tokens of [
      ['W', 'F'],
      ['F', 'E'],
      ['W', 'E'],
      ['steam', 'mud'],
      ['mud', 'F'],
      ['steam', 'E'],
      ['lava', 'W'],
      ['pottery', 'F'],
    ]) {
      const result = forge(run, tokens);
      expect(result.error).toBeUndefined();
      run = result.run;
    }
    run = rest(run);
    for (const tokens of [
      ['cloud', 'W'],
      ['rain', 'E'],
      ['obsidian', 'E'],
    ]) {
      const result = forge(run, tokens);
      expect(result.error).toBeUndefined();
      run = result.run;
    }
    expect(run.discovered).toHaveLength(7);
    expect(run.turn).toBe(8);
    expect(run.status).toBe('playing');
    run = forge(run, ['W', 'F', 'E']).run;
    expect(run.discovered).toHaveLength(8);
    for (let i = 0; i < 12 && run.status === 'playing'; i++) run = rest(run);
    expect(run.status).toBe('won');
    expect(run.logs.filter((log) => log.failure)).toHaveLength(4);
  });
});

describe('free rest with a recovery fallback', () => {
  it('is free once per three advancing turns, with no extra ecological tick', () => {
    let run = createRun();
    run.environment = { heat: 2, moisture: 8, nutrients: 1 };
    run.ecosystem = [{ id: 'old', token: 'rock' }];
    run = rest(run);
    expect(run.turn).toBe(1);
    expect(run.environment).toEqual({ heat: 3, moisture: 7, nutrients: 3 });
    expect(run.freeRestReadyTurn).toBe(4);
    expect(freeRestAvailable(run)).toBe(false);
    run = rest(run);
    expect(run.turn).toBe(2);
    expect(run.environment.nutrients).toBe(6);
    run = rest(run);
    expect(run.turn).toBe(3);
    run = rest(run);
    expect(run.turn).toBe(4);
    expect(freeRestAvailable(run)).toBe(true);
    const next = rest(run);
    expect(next.turn).toBe(4);
    expect(next.freeRestReadyTurn).toBe(7);
  });
  it('always allows paid recovery when nutrition is exhausted during cooldown', () => {
    let run = scenario();
    run.freeRestReadyTurn = 4;
    run.environment.nutrients = 0;
    expect(
      preview(
        run,
        run.hand.slice(0, 2).map((m) => m.id),
      ).valid,
    ).toBe(false);
    run = rest(run);
    expect(run.turn).toBe(2);
    expect(run.environment.nutrients).toBe(2);
    expect(run.status).toBe('playing');
  });
  it('does not destroy ecology while trying to escape a critical resource state', () => {
    const run = createRun();
    run.environment = { heat: 0, moisture: 10, nutrients: 0 };
    run.ecosystem = [{ id: 'p', token: 'rock' }];
    const recovered = rest(run);
    expect(recovered.ecosystem).toHaveLength(1);
    expect(recovered.logs[0].advanced).toBe(false);
  });
});

describe('real clues and progressive resource warnings', () => {
  it('only exposes branches that exist, and calls out terminal products', () => {
    expect(branches('steam').map((r) => r.id)).toEqual(['cloud', 'thundercloud']);
    expect(branches('pottery')).toEqual([]);
    expect(branches('rain')).toEqual([]);
    expect(explorationHint(['pottery', 'F'])).toContain('终点');
    expect(explorationHint(['rain', 'E'])).toContain('回补');
    expect(explorationHint(['steam', 'mud'])).toContain('产物之间不直接合成');
    expect(explorationHint(['E', 'steam'])).toContain('先放「蒸汽」');
  });
  it('keeps mastery and unfinished branches distinct', () => {
    expect(explorationHint(['steam'], ['cloud'])).toContain('1 条待发现');
    expect(explorationHint(['steam'], ['cloud', 'thundercloud'])).toContain('分支都已发现');
  });
  for (const key of ['heat', 'moisture'] as const)
    for (const [value, expected] of [
      [0, 'critical'],
      [1, 'warning'],
      [2, 'caution'],
      [5, 'safe'],
      [8, 'caution'],
      [9, 'warning'],
      [10, 'critical'],
    ] as const)
      it(`${key} ${value} has severity ${expected}`, () =>
        expect(severity(key, value)).toBe(expected));
  it('does not warn about full nutrients, and spells out moisture failure risk', () => {
    expect(severity('nutrients', 10)).toBe('safe');
    expect(severity('nutrients', 2)).toBe('caution');
    expect(severity('nutrients', 1)).toBe('warning');
    expect(severity('nutrients', 0)).toBe('critical');
    expect(environmentHint('moisture', 8)).toContain('25%');
    expect(environmentHint('heat', 1)).toContain('再降');
  });
});

describe('unified play and save migration', () => {
  it('always uses twelve advancing turns in formal play', () => {
    let run = createRun('normal', 1);
    expect(turnLimit(run)).toBe(12);
    expect(run).not.toHaveProperty('difficulty');
    for (let i = 0; i < 25 && run.status === 'playing'; i++) run = rest(run);
    expect(run.status).toBe('lost');
    expect(run.turn).toBe(12);
    expect(run.logs.filter((log) => log.advanced)).toHaveLength(12);
  });
  it('keeps failed exploration in the current turn and survives one extreme', () => {
    expect(forge(scenario(), ['W', 'W', 'W']).run.turn).toBe(1);
    const hot = createRun('normal', 1);
    hot.environment.heat = 9;
    hot.hand = ['F', 'F', 'W', 'E', 'E', 'W'].map((token, i) => ({ token, id: `h-${i}` }));
    const next = forge(hot, ['F', 'F']).run;
    expect(next.status).toBe('playing');
    expect(next.ecosystem).toHaveLength(0);
  });
  it('preserves old hand, RNG, discoveries and best score while upgrading a v1 save', () => {
    const current = forge(createRun('normal', 42), ['W', 'F']).run;
    const legacy: Record<string, unknown> = {
      ...current,
      version: 1,
      logs: current.logs.map(({ advanced, ...log }) => {
        void advanced;
        return log;
      }),
    };
    for (const key of ['revision', 'difficulty', 'freeRestReadyTurn', 'failedSequences'])
      delete legacy[key];
    const profile: Record<string, unknown> = {
      ...DEFAULT_PROFILE,
      bestScore: 143,
      discovered: ['steam'],
    };
    delete profile.bestScores;
    delete profile.lastDifficulty;
    const loaded = loadData({
      getItem: () => JSON.stringify({ version: 1, run: legacy, profile }),
    });
    expect(loaded.warning).toBe('');
    expect(loaded.data.run?.version).toBe(3);
    expect(loaded.data.run?.hand).toEqual(current.hand);
    expect(loaded.data.run?.rng).toBe(current.rng);
    expect(loaded.data.run?.discovered).toEqual(['steam']);
    expect(loaded.data.profile.bestScore).toBe(143);
    expect(loaded.data.profile).not.toHaveProperty('bestScores');
  });
  it('restores same-turn attempts and cooldown without resetting failed combinations', () => {
    let run = scenario();
    run = forge(run, ['W', 'W', 'W']).run;
    run = rest(run);
    expect(validRun(run)).toBe(true);
    let data = '';
    saveData(DEFAULT_PROFILE, run, {
      setItem: (_, value) => {
        data = value;
      },
    });
    const loaded = loadData({ getItem: () => data });
    expect(loaded.data.run).toEqual(run);
    expect(forge(loaded.data.run!, ['W', 'W', 'W']).error).toContain('已经试过');
    const corrupt = { ...run, revision: run.revision + 1 };
    expect(validRun(corrupt)).toBe(false);
  });
});
