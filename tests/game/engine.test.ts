import { describe, expect, it } from 'vitest';
import { act, createRun, danger, preview, scoreRun } from '../../src/game/engine';
import { isElement, matchRecipe, RECIPES, RECIPE_MAP } from '../../src/game/recipes';
import { DEFAULT_PROFILE, loadData, saveData, STORAGE_KEY, validRun } from '../../src/storage';
import certificates from '../../docs/verified-routes.json';
import type { Run } from '../../src/game/types';

function inputs(run: Run, tokens: string[]) {
  const used: string[] = [];
  for (const token of tokens) {
    const m = [...run.hand, ...run.ecosystem].find(
      (m) => m.token === token && !used.includes(m.id),
    );
    if (!m) throw new Error(`Missing ${token} on turn ${run.turn}`);
    used.push(m.id);
  }
  return used;
}
function scenario(tokens: string[], env = { heat: 5, moisture: 5, nutrients: 5 }): Run {
  const run = createRun();
  run.environment = env;
  run.hand = tokens.filter(isElement).map((token, i) => ({ token, id: `h-${i}` }));
  run.ecosystem = tokens.filter((t) => !isElement(t)).map((token, i) => ({ token, id: `p-${i}` }));
  return run;
}
function forge(run: Run, tokens: string[]) {
  return act(run, { type: 'forge', ids: inputs(run, tokens), turn: run.turn });
}
function permutations(items: string[]): string[][] {
  if (items.length === 0) return [[]];
  return items.flatMap((item, i) =>
    permutations(items.filter((_, j) => j !== i)).map((rest) => [item, ...rest]),
  );
}

describe('canonical recipes', () => {
  it('contains exactly 9 / 12 / 7 connected unique recipes', () => {
    expect([1, 2, 3].map((tier) => RECIPES.filter((r) => r.tier === tier).length)).toEqual([
      9, 12, 7,
    ]);
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(28);
    for (const r of RECIPES)
      for (const token of r.inputs)
        expect(isElement(token) || RECIPE_MAP[token].tier < r.tier).toBe(true);
    expect(RECIPES.filter((r) => r.tier === 3).reduce((n, r) => n + r.score, 0)).toBe(218);
  });
  for (const r of RECIPES.filter((r) => r.tier === 1))
    it(`${r.name}: every permutation preserves multiplicity`, () => {
      for (const tokens of permutations(r.inputs)) expect(matchRecipe(tokens)?.id).toBe(r.id);
      expect(matchRecipe(r.inputs.slice(1))?.id).not.toBe(r.id);
      expect(matchRecipe([...r.inputs, 'W'])).not.toBe(r);
    });
  for (const r of RECIPES.filter((r) => r.ordered))
    it(`${r.name}: strict order and declared resource cost`, () => {
      expect(matchRecipe(r.inputs)?.id).toBe(r.id);
      expect(matchRecipe([...r.inputs].reverse())).toBeUndefined();
      const run = scenario(r.inputs, { heat: 8, moisture: 5, nutrients: 10 });
      const next = forge(run, r.inputs).run;
      expect(next.logs[0].output).toBe(r.id);
      expect(next.discovered).toEqual([r.id]);
      expect(next.environment.nutrients).toBe(10 - (r.cost.nutrients ?? 0));
      expect(next.ecosystem.every((m) => !run.ecosystem.some((old) => old.id === m.id))).toBe(true);
    });
  it('does not fold WFE to steam before matching the full sequence', () => {
    expect(matchRecipe(['W', 'F', 'E'])?.id).toBe('spring');
    expect(matchRecipe(['steam', 'E'])?.id).toBe('cloud');
    expect(matchRecipe(['W', 'W', 'W'])).toBeUndefined();
    expect(isElement('__proto__')).toBe(false);
  });
});

describe('transactional turns', () => {
  it('matches an independently computed first-turn resource result and never mutates input', () => {
    const run = createRun();
    const before = structuredClone(run);
    const ids = inputs(run, ['W', 'F']);
    const p = preview(run, ids);
    expect(p.afterSuccess).toEqual({ heat: 4, moisture: 6, nutrients: 5 });
    expect(run).toEqual(before);
    const next = act(run, { type: 'forge', ids, turn: 1 }).run;
    expect(next.environment).toEqual({ heat: 4, moisture: 6, nutrients: 5 });
    expect(next.turn).toBe(2);
    expect(next.logs[0].output).toBe('steam');
    expect(run).toEqual(before);
  });
  it('rejects duplicate, missing and insufficient inputs without spending a turn or RNG', () => {
    const run = createRun();
    for (const ids of [
      [],
      [run.hand[0].id],
      ['missing', run.hand[0].id],
      [run.hand[0].id, run.hand[0].id],
    ]) {
      const result = act(run, { type: 'forge', ids, turn: 1 });
      expect(result.error).toBeTruthy();
      expect(result.run).toBe(run);
    }
  });
  it('a stale command cannot settle the next turn', () => {
    const run = createRun();
    const ids = inputs(run, ['W', 'F']);
    const command = { type: 'forge' as const, ids, turn: 1 };
    const next = act(run, command).run;
    expect(act(next, command).run).toBe(next);
  });
  it('reversed catalyst consumes only base nutrient and keeps the product', () => {
    const run = scenario(['E', 'steam']);
    const next = forge(run, ['E', 'steam']).run;
    expect(next.environment).toEqual({ heat: 5, moisture: 5, nutrients: 5 });
    expect(next.logs[0].output).toBeUndefined();
    expect(next.ecosystem).toEqual(run.ecosystem);
  });
  it('checks complete nutrient cost and permits an exact payment', () => {
    const poor = scenario(['W', 'E'], { heat: 5, moisture: 5, nutrients: 1 });
    expect(forge(poor, ['W', 'E']).error).toMatch(/养分/);
    const exact = scenario(['W', 'E'], { heat: 5, moisture: 5, nutrients: 2 });
    expect(forge(exact, ['W', 'E']).run.environment.nutrients).toBe(1);
  });
  it('low moisture uses the post-input state', () => {
    const dry = scenario(['mist', 'E'], { heat: 5, moisture: 1, nutrients: 5 });
    expect(forge(dry, ['mist', 'E']).error).toMatch(/湿度/);
    const wet = scenario(['W', 'F'], { heat: 5, moisture: 0, nutrients: 5 });
    expect(forge(wet, ['W', 'F']).error).toBeUndefined();
  });
  it('seeded humidity failure rolls back candidate changes and preserves materials', () => {
    const run = scenario(['W', 'F'], { heat: 5, moisture: 7, nutrients: 5 });
    run.rng = 1;
    expect(preview(run, inputs(run, ['W', 'F'])).highHumidity).toBe(true);
    const next = forge(run, ['W', 'F']).run;
    expect(next.environment).toEqual({ heat: 5, moisture: 7, nutrients: 4 });
    expect(next.ecosystem).toHaveLength(0);
    expect(next.discovered).toHaveLength(0);
  });
  it('does not apply the high-humidity roll below the threshold', () => {
    const run = scenario(['W', 'F'], { heat: 5, moisture: 6, nutrients: 5 });
    run.rng = 1;
    expect(forge(run, ['W', 'F']).run.logs[0].output).toBe('steam');
  });
  it('warmth restrictions apply only according to the last end state', () => {
    const run = scenario(['F', 'F'], { heat: 10, moisture: 5, nutrients: 5 });
    run.forbidden = 'F';
    expect(forge(run, ['F', 'F']).error).toMatch(/不能投入火/);
    const next = act(run, { type: 'rest', turn: 1 }).run;
    expect(next.environment.heat).toBe(9);
    expect(next.forbidden).toBeNull();
  });
  it('allows recovery from no nutrients, clamps resources and caps ecosystem recovery at 3', () => {
    const run = createRun();
    run.environment = { heat: 0, moisture: 10, nutrients: 0 };
    run.ecosystem = ['steam', 'lava', 'rock', 'mud'].map((token, i) => ({ id: `p${i}`, token }));
    const next = act(run, { type: 'rest', turn: 1 }).run;
    expect(next.environment).toEqual({ heat: 1, moisture: 9, nutrients: 5 });
    expect(next.ecosystem).toHaveLength(4);
    next.environment.nutrients = 10;
    expect(act(next, { type: 'rest', turn: 2 }).run.environment.nutrients).toBe(10);
  });
  it('destroys at most one instance, preserves discovery, and supports an empty ecosystem', () => {
    const run = scenario(['F', 'F'], { heat: 9, moisture: 4, nutrients: 5 });
    const next = forge(run, ['F', 'F']).run;
    expect(next.environment.heat).toBe(10);
    expect(next.ecosystem).toHaveLength(0);
    expect(next.discovered).toEqual(['blaze']);
    expect(next.forbidden).toBe('F');
    expect(next.logs[0].messages.filter((m) => m.includes('反噬'))).toHaveLength(1);
    expect(act(next, { type: 'rest', turn: 2 }).run.status).toBe('playing');
  });
  it('nutrient max is safe and three simultaneous dangerous slots are recognized', () => {
    expect(danger({ heat: 5, moisture: 5, nutrients: 10 })).toEqual([false, false, false]);
    expect(danger({ heat: 0, moisture: 10, nutrients: 0 })).toEqual([true, true, true]);
    // Post-input fallback spends the last nutrient with no ecosystem to recover it.
    const run = scenario(['W', 'W', 'W'], { heat: 0, moisture: 10, nutrients: 1 });
    expect(forge(run, ['W', 'W', 'W']).run.status).toBe('lost');
  });
  it('scores each discovery once and ends precisely after turn 12', () => {
    let run = createRun();
    for (let i = 0; i < 12; i++) run = act(run, { type: 'rest', turn: run.turn }).run;
    expect(run.status).toBe('lost');
    expect(run.logs).toHaveLength(12);
    expect(run.turn).toBe(12);
    expect(scoreRun(run)).toEqual({ discovery: 0, stability: 30, nutrients: 10, total: 40 });
    const repeated = scenario(['W', 'F']);
    repeated.discovered = ['steam'];
    const next = forge(repeated, ['W', 'F']).run;
    expect(next.discovered).toEqual(['steam']);
    expect(scoreRun(next).discovery).toBe(10);
  });
  it('tutorial uses normal resource rules and completes exactly three recipes', () => {
    let run = createRun('tutorial', 20261106);
    expect(act(run, { type: 'rest', turn: 1 }).error).toBeTruthy();
    for (const tokens of [
      ['W', 'F'],
      ['steam', 'E'],
      ['cloud', 'W'],
    ]) {
      const result = forge(run, tokens);
      expect(result.error).toBeUndefined();
      run = result.run;
    }
    expect(run.status).toBe('learned');
    expect(run.discovered).toEqual(['steam', 'cloud', 'rain']);
    expect(run.environment).toEqual({ heat: 3, moisture: 3, nutrients: 5 });
    expect(createRun('normal', 20261106).discovered).toEqual([]);
  });
});

describe('verified full-game routes', () => {
  for (const certificate of certificates.results)
    it(`replays seed ${certificate.seed}${'target' in certificate ? ` targeting ${certificate.target}` : ''} from a fresh run`, () => {
      let run = createRun('normal', certificate.seed);
      for (const choice of certificate.actions) {
        const result =
          choice === 'rest'
            ? act(run, { type: 'rest', turn: run.turn })
            : forge(run, RECIPE_MAP[choice].inputs);
        expect(result.error).toBeUndefined();
        run = result.run;
      }
      expect(run.status).toBe('won');
      expect(run.discovered.length).toBeGreaterThanOrEqual(8);
      expect(run.discovered).toEqual(certificate.discovered);
      expect(scoreRun(run).total).toBe(certificate.score);
      expect(run.logs).toEqual(certificate.logs);
      if ('target' in certificate && certificate.target)
        expect(run.discovered).toContain(certificate.target);
    });
});

describe('storage and restoration', () => {
  it('atomically saves a run, including hand and RNG, without changing the next result', () => {
    const run = forge(createRun('normal', 42), ['W', 'F']).run;
    let text = '';
    expect(
      saveData(DEFAULT_PROFILE, run, {
        setItem: (key, value) => {
          expect(key).toBe(STORAGE_KEY);
          text = value;
        },
      }),
    ).toBe(true);
    const restored = loadData({ getItem: () => text });
    expect(restored.warning).toBe('');
    expect(restored.data.run).toEqual(run);
    expect(act(restored.data.run!, { type: 'rest', turn: 2 })).toEqual(
      act(run, { type: 'rest', turn: 2 }),
    );
  });
  it('drops finished and tutorial snapshots', () => {
    for (const run of [createRun('tutorial'), { ...createRun(), status: 'won' as const }]) {
      let text = '';
      saveData(DEFAULT_PROFILE, run, {
        setItem: (_, v) => {
          text = v;
        },
      });
      expect(JSON.parse(text).run).toBeNull();
    }
  });
  it('recovers from corrupted, unsupported or inaccessible storage', () => {
    for (const text of ['broken', 'null', '{"version":99}', '{"version":1,"profile":null}'])
      expect(loadData({ getItem: () => text }).data.run).toBeNull();
    expect(
      loadData({
        getItem: () => {
          throw new Error('Denied');
        },
      }).warning,
    ).toBeTruthy();
    expect(
      saveData(DEFAULT_PROFILE, null, {
        setItem: () => {
          throw new Error('Full');
        },
      }),
    ).toBe(false);
  });
  it('rejects corrupted materials, resources and history but preserves a valid profile', () => {
    for (const tweak of [
      (r: Run) => {
        r.environment.heat = 99;
      },
      (r: Run) => {
        r.hand[0].token = '__proto__';
      },
      (r: Run) => {
        r.logs = [];
        r.turn = 3;
      },
      (r: Run) => {
        r.hand[1].id = r.hand[0].id;
      },
    ]) {
      const run = createRun();
      tweak(run);
      expect(validRun(run)).toBe(false);
      const loaded = loadData({
        getItem: () =>
          JSON.stringify({
            version: 1,
            profile: { ...DEFAULT_PROFILE, discovered: ['steam'] },
            run,
          }),
      });
      expect(loaded.data.profile.discovered).toEqual(['steam']);
      expect(loaded.data.run).toBeNull();
    }
  });
});
