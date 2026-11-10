import { describe, expect, it } from 'vitest';
import { act, createRun, turnLimit } from '../../src/game/engine';
import { DEFAULT_PROFILE, loadData, migrateRun, saveData, validRun } from '../../src/storage';
import { legacyRun, legacySave } from '../fixtures/legacy-save';

describe('unified v3 save compatibility', () => {
  for (const difficulty of ['explore', 'standard', 'master'] as const)
    it(`converts an old ${difficulty} checkpoint without changing gameplay state`, () => {
      const saved = legacySave(difficulty, 2);
      saved.run.environment = { heat: 3, moisture: 7, nutrients: 4 };
      saved.run.freeRestReadyTurn = 5;
      saved.run.failedSequences = ['W|W|W'];
      saved.run.ecosystem = [{ id: 'p-1', token: 'steam', createdTurn: 1 }];
      saved.run.discovered = ['steam'];
      const restored = loadData({ getItem: () => JSON.stringify(saved) });
      expect(restored.warning).toBe('');
      expect(restored.migrated).toBe(true);
      expect(restored.data.version).toBe(3);
      const run = restored.data.run!;
      expect(run.version).toBe(3);
      expect(run).not.toHaveProperty('difficulty');
      expect(turnLimit(run)).toBe(12);
      for (const key of [
        'environment',
        'hand',
        'ecosystem',
        'rng',
        'seed',
        'turn',
        'revision',
        'logs',
        'freeRestReadyTurn',
        'failedSequences',
        'discovered',
      ] as const)
        expect(run[key]).toEqual(saved.run[key]);
      expect(restored.data.profile.discovered).toEqual(['steam']);
      expect(restored.data.profile.bestScore).toBe(210);
      expect(restored.data.profile).not.toHaveProperty('lastDifficulty');
      expect(restored.data.profile).not.toHaveProperty('bestScores');
    });
  it('applies the common rules after an old strict checkpoint is resumed', () => {
    const old = legacyRun('master');
    old.hand = ['W', 'W', 'W', 'F', 'E', 'E'].map((token, i) => ({ id: `h-${i}`, token }));
    const run = migrateRun(old)!;
    const next = act(run, {
      type: 'forge',
      ids: run.hand.slice(0, 3).map((m) => m.id),
      turn: 1,
      revision: 0,
    }).run;
    expect(next.turn).toBe(1);
    expect(next.environment.nutrients).toBe(4);
    const rested = act(next, { type: 'rest', turn: 1, revision: next.revision }).run;
    expect(rested.turn).toBe(1);
    expect(rested.logs.at(-1)?.advanced).toBe(false);
  });
  for (const turn of [13, 14, 15])
    it(`retires a valid old turn-${turn} checkpoint but keeps discoveries and records`, () => {
      const saved = legacySave('explore', turn);
      saved.profile.discovered = ['steam'];
      saved.run.discovered = ['steam', 'cloud', 'rain'];
      const loaded = loadData({ getItem: () => JSON.stringify(saved) });
      expect(loaded.data.run).toBeNull();
      expect(loaded.warning).toContain('超过12回合');
      expect(loaded.data.profile.discovered).toEqual(['steam', 'cloud', 'rain']);
      expect(loaded.data.profile.bestScore).toBe(210);
      let text = '';
      saveData(loaded.data.profile, loaded.data.run, {
        setItem: (_, value) => {
          text = value;
        },
      });
      const again = loadData({ getItem: () => text });
      expect(again.warning).toBe('');
      expect(again.migrated).toBe(false);
      expect(again.data).toEqual(loaded.data);
    });
  it('continues the twelfth turn, then stops after the twelfth advancing settlement', () => {
    const old = legacyRun('explore', 12);
    old.freeRestReadyTurn = 14;
    const run = migrateRun(old)!;
    expect(run).not.toBeNull();
    const next = act(run, { type: 'rest', turn: 12, revision: run.revision }).run;
    expect(next.status).toBe('lost');
    expect(next.turn).toBe(12);
    expect(next.logs.filter((log) => log.advanced)).toHaveLength(12);
  });
  it('uses the maximum valid historical score and ignores malformed legacy score entries', () => {
    const saved = {
      version: 2,
      run: null,
      profile: {
        ...DEFAULT_PROFILE,
        bestScore: 300,
        lastDifficulty: 'master',
        bestScores: { explore: 100, standard: 250, master: 275 },
      },
    };
    expect(loadData({ getItem: () => JSON.stringify(saved) }).data.profile.bestScore).toBe(300);
    const invalid = {
      ...saved,
      profile: {
        ...saved.profile,
        bestScore: 143,
        bestScores: { explore: -1, standard: '999', master: 195 },
      },
    };
    expect(loadData({ getItem: () => JSON.stringify(invalid) }).data.profile.bestScore).toBe(195);
  });
  it('saves a clean v3 schema and preserves settings and the next RNG result on round trip', () => {
    const run = createRun('normal', 42);
    let text = '';
    const profile = {
      ...DEFAULT_PROFILE,
      bestScore: 180,
      muted: false,
      reducedMotion: true,
      tutorialDone: true,
    };
    expect(
      saveData(profile, run, {
        setItem: (_, value) => {
          text = value;
        },
      }),
    ).toBe(true);
    const parsed = JSON.parse(text);
    expect(parsed.version).toBe(3);
    expect(parsed.run.version).toBe(3);
    expect(parsed.run).not.toHaveProperty('difficulty');
    expect(parsed.profile).not.toHaveProperty('bestScores');
    expect(parsed.profile).not.toHaveProperty('lastDifficulty');
    const loaded = loadData({ getItem: () => text });
    expect(loaded.data.profile).toEqual(profile);
    expect(loaded.data.run).toEqual(run);
    expect(loaded.migrated).toBe(false);
    expect(act(loaded.data.run!, { type: 'rest', turn: 1, revision: 0 })).toEqual(
      act(run, { type: 'rest', turn: 1, revision: 0 }),
    );
  });
  it('rejects invalid legacy metadata before merging any corrupted discoveries', () => {
    const invalid = legacySave('master', 11);
    invalid.run.discovered = ['forest'];
    const loaded = loadData({ getItem: () => JSON.stringify(invalid) });
    expect(loaded.data.run).toBeNull();
    expect(loaded.data.profile.discovered).toEqual([]);
    expect(loaded.warning).toContain('无法恢复');
    const badVersion = { ...createRun(), version: 2 };
    expect(migrateRun(badVersion)).toBeNull();
    expect(validRun({ ...createRun(), difficulty: 'standard' })).toBe(false);
  });
});
