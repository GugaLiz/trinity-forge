import { createRun } from '../../src/game/engine';
import { DEFAULT_PROFILE } from '../../src/storage';
import type { Run } from '../../src/game/types';

export type LegacyDifficulty = 'explore' | 'standard' | 'master';
export type LegacyRun = Omit<Run, 'version'> & { version: 2; difficulty: LegacyDifficulty };

/** Serialized v2 checkpoints for compatibility testing, not a playable rule configuration. */
export function legacyRun(difficulty: LegacyDifficulty, turn = 1): LegacyRun {
  const initial = createRun('normal', 42);
  const logs: Run['logs'] = Array.from({ length: turn - 1 }, (_, i) => ({
    turn: i + 1,
    action: 'rest',
    inputs: [],
    messages: ['旧版回合已结算'],
    environment: { ...initial.environment },
    advanced: true,
  }));
  return {
    ...initial,
    version: 2,
    difficulty,
    turn,
    revision: logs.length,
    logs,
    hand: initial.hand.map((m, i) => ({ ...m, id: `h-${turn}-${i}` })),
  };
}
export function legacySave(difficulty: LegacyDifficulty, turn = 1) {
  return {
    version: 2 as const,
    run: legacyRun(difficulty, turn),
    profile: {
      ...DEFAULT_PROFILE,
      discovered: [] as string[],
      bestScore: 143,
      lastDifficulty: difficulty,
      bestScores: { explore: 210, standard: 180, master: 195 },
    },
  };
}
