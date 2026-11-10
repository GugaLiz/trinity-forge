import { isElement, RECIPE_MAP } from '../game/recipes';
import { CONFIG } from '../game/config';
import type { Material, Profile, Run } from '../game/types';

export const STORAGE_KEY = 'trinity-forge:v1';
export const DEFAULT_PROFILE: Profile = {
  version: 1,
  discovered: [],
  bestScore: 0,
  muted: true,
  reducedMotion: false,
  tutorialDone: false,
};
export type SaveData = { version: 3; profile: Profile; run: Run | null };
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function integer(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}
function ids(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((id) => typeof id === 'string' && Object.hasOwn(RECIPE_MAP, id)) &&
    new Set(value).size === value.length
  );
}
function environment(value: unknown) {
  return object(value) && ['heat', 'moisture', 'nutrients'].every((k) => integer(value[k], 0, 10));
}
function material(value: unknown, base: boolean): value is Material {
  return (
    object(value) &&
    typeof value.id === 'string' &&
    typeof value.token === 'string' &&
    (base ? isElement(value.token) : Object.hasOwn(RECIPE_MAP, value.token))
  );
}
function validState(value: unknown, limit: number): value is Run {
  if (
    !object(value) ||
    value.version !== 3 ||
    value.mode !== 'normal' ||
    value.status !== 'playing'
  )
    return false;
  if (
    typeof value.id !== 'string' ||
    !integer(value.seed, 1, 0xffffffff) ||
    !integer(value.rng, 1, 0xffffffff) ||
    !integer(value.turn, 1, limit) ||
    !integer(value.revision, 0, 256) ||
    !integer(value.freeRestReadyTurn, 1, limit + 3) ||
    !environment(value.environment)
  )
    return false;
  if (
    !Array.isArray(value.hand) ||
    value.hand.length !== 6 ||
    !value.hand.every((v) => material(v, true))
  )
    return false;
  if (
    !Array.isArray(value.ecosystem) ||
    value.ecosystem.length > limit ||
    !value.ecosystem.every((v) => material(v, false)) ||
    !ids(value.discovered)
  )
    return false;
  const inventory = [...value.hand, ...value.ecosystem];
  if (new Set(inventory.map((m) => m.id)).size !== inventory.length) return false;
  if (value.forbidden !== null && value.forbidden !== 'W' && value.forbidden !== 'F') return false;
  if (
    !Array.isArray(value.failedSequences) ||
    value.failedSequences.length > 128 ||
    !value.failedSequences.every(
      (key) =>
        typeof key === 'string' &&
        key.split('|').length >= 2 &&
        key.split('|').length <= 3 &&
        key.split('|').every((token) => isElement(token) || Object.hasOwn(RECIPE_MAP, token)),
    )
  )
    return false;
  if (!Array.isArray(value.logs) || value.logs.length !== value.revision) return false;
  let expectedTurn = 1;
  for (const log of value.logs) {
    const valid =
      object(log) &&
      log.turn === expectedTurn &&
      typeof log.advanced === 'boolean' &&
      (log.action === 'forge' || log.action === 'rest') &&
      Array.isArray(log.inputs) &&
      log.inputs.every(
        (t) => typeof t === 'string' && (isElement(t) || Object.hasOwn(RECIPE_MAP, t)),
      ) &&
      Array.isArray(log.messages) &&
      log.messages.every((m) => typeof m === 'string') &&
      environment(log.environment) &&
      (log.output === undefined ||
        (typeof log.output === 'string' && Object.hasOwn(RECIPE_MAP, log.output))) &&
      (log.failure === undefined || log.failure === 'unknown' || log.failure === 'humidity') &&
      (log.hint === undefined || typeof log.hint === 'string');
    if (!valid) return false;
    if (log.advanced) expectedTurn++;
  }
  return expectedTurn === value.turn;
}
export function validRun(value: unknown): value is Run {
  return validState(value, CONFIG.turns) && !Object.hasOwn(value, 'difficulty');
}
function readRun(value: unknown): { run: Run | null; discovered: string[]; expired: boolean } {
  const empty = { run: null, discovered: [], expired: false };
  if (!object(value)) return empty;
  if (value.version === 3)
    return validRun(value) ? { run: value, discovered: value.discovered, expired: false } : empty;
  let limit = CONFIG.turns;
  const candidate: Record<string, unknown> = { ...value, version: 3 };
  if (value.version === 1 && Array.isArray(value.logs)) {
    candidate.revision = value.logs.length;
    candidate.freeRestReadyTurn = 1;
    candidate.failedSequences = [];
    candidate.logs = value.logs.map((log) => (object(log) ? { ...log, advanced: true } : log));
  } else if (value.version === 2) {
    // These identifiers are read only for upgrading old saves, never as playable modes.
    const legacyLimits: Record<string, number> = { explore: 15, standard: 12, master: 10 };
    if (typeof value.difficulty !== 'string' || !Object.hasOwn(legacyLimits, value.difficulty))
      return empty;
    limit = legacyLimits[value.difficulty];
  } else return empty;
  delete candidate.difficulty;
  if (!validState(candidate, limit)) return empty;
  if (candidate.turn > CONFIG.turns)
    return { run: null, discovered: candidate.discovered, expired: true };
  return validRun(candidate)
    ? { run: candidate, discovered: candidate.discovered, expired: false }
    : empty;
}
export function migrateRun(value: unknown): Run | null {
  return readRun(value).run;
}
function validProfile(value: unknown): value is Profile {
  return (
    object(value) &&
    value.version === 1 &&
    ids(value.discovered) &&
    integer(value.bestScore, 0, 100000) &&
    typeof value.muted === 'boolean' &&
    typeof value.reducedMotion === 'boolean' &&
    typeof value.tutorialDone === 'boolean'
  );
}
function normalizeProfile(value: Profile, discovered: string[] = []): Profile {
  const legacy = value as unknown as Record<string, unknown>;
  const scores = [value.bestScore];
  if (object(legacy.bestScores))
    for (const key of ['explore', 'standard', 'master']) {
      const score = legacy.bestScores[key];
      if (integer(score, 0, 100000)) scores.push(score);
    }
  return {
    version: 1,
    discovered: [...new Set([...value.discovered, ...discovered])],
    bestScore: Math.max(...scores),
    muted: value.muted,
    reducedMotion: value.reducedMotion,
    tutorialDone: value.tutorialDone,
  };
}
export function loadData(storage?: Pick<Storage, 'getItem'>): {
  data: SaveData;
  warning: string;
  migrated: boolean;
} {
  const empty: SaveData = {
    version: 3,
    profile: { ...DEFAULT_PROFILE, discovered: [] },
    run: null,
  };
  try {
    const raw = (storage ?? window.localStorage).getItem(STORAGE_KEY);
    if (!raw) return { data: empty, warning: '', migrated: false };
    const parsed: unknown = JSON.parse(raw);
    if (
      !object(parsed) ||
      (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) ||
      !validProfile(parsed.profile)
    )
      return { data: empty, warning: '存档格式有误，已创建新进度。', migrated: false };
    const restored = readRun(parsed.run);
    const profile = normalizeProfile(parsed.profile, restored.discovered);
    return {
      data: { version: 3, profile, run: restored.run },
      warning: restored.expired
        ? '旧版对局已超过12回合，请开始新局；图鉴与历史最高分已保留。'
        : parsed.run && !restored.run
          ? '这局存档无法恢复，历史图鉴已保留。'
          : '',
      migrated:
        parsed.version !== 3 ||
        Object.hasOwn(parsed.profile, 'lastDifficulty') ||
        Object.hasOwn(parsed.profile, 'bestScores') ||
        (object(parsed.run) && parsed.run.version !== 3),
    };
  } catch {
    return {
      data: empty,
      warning: '本地存储不可用或存档损坏，当前进度可能无法保存。',
      migrated: false,
    };
  }
}
export function saveData(
  profile: Profile,
  run: Run | null,
  storage?: Pick<Storage, 'setItem'>,
): boolean {
  try {
    const data: SaveData = {
      version: 3,
      profile: normalizeProfile(profile),
      run: run?.mode === 'normal' && run.status === 'playing' ? run : null,
    };
    (storage ?? window.localStorage).setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
