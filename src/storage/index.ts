import { isElement, RECIPE_MAP } from '../game/recipes';
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
export type SaveData = { version: 1; profile: Profile; run: Run | null };
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
export function validRun(value: unknown): value is Run {
  if (
    !object(value) ||
    value.version !== 1 ||
    value.mode !== 'normal' ||
    value.status !== 'playing'
  )
    return false;
  if (
    typeof value.id !== 'string' ||
    !integer(value.seed, 1, 0xffffffff) ||
    !integer(value.rng, 1, 0xffffffff) ||
    !integer(value.turn, 1, 12) ||
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
    value.ecosystem.length > 12 ||
    !value.ecosystem.every((v) => material(v, false)) ||
    !ids(value.discovered)
  )
    return false;
  const inventory = [...value.hand, ...value.ecosystem];
  if (new Set(inventory.map((m) => m.id)).size !== inventory.length) return false;
  if (value.forbidden !== null && value.forbidden !== 'W' && value.forbidden !== 'F') return false;
  if (!Array.isArray(value.logs) || value.logs.length !== Number(value.turn) - 1) return false;
  return value.logs.every(
    (log, i) =>
      object(log) &&
      log.turn === i + 1 &&
      (log.action === 'forge' || log.action === 'rest') &&
      Array.isArray(log.inputs) &&
      log.inputs.every(
        (t) => typeof t === 'string' && (isElement(t) || Object.hasOwn(RECIPE_MAP, t)),
      ) &&
      Array.isArray(log.messages) &&
      log.messages.every((m) => typeof m === 'string') &&
      environment(log.environment) &&
      (log.output === undefined ||
        (typeof log.output === 'string' && Object.hasOwn(RECIPE_MAP, log.output))),
  );
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
export function loadData(storage?: Pick<Storage, 'getItem'>): { data: SaveData; warning: string } {
  const empty: SaveData = {
    version: 1,
    profile: { ...DEFAULT_PROFILE, discovered: [] },
    run: null,
  };
  try {
    const raw = (storage ?? window.localStorage).getItem(STORAGE_KEY);
    if (!raw) return { data: empty, warning: '' };
    const parsed: unknown = JSON.parse(raw);
    if (!object(parsed) || parsed.version !== 1 || !validProfile(parsed.profile))
      return { data: empty, warning: '存档格式有误，已创建新进度。' };
    const run = validRun(parsed.run) ? parsed.run : null;
    return {
      data: { version: 1, profile: parsed.profile, run },
      warning: parsed.run && !run ? '这局存档无法恢复，历史图鉴已保留。' : '',
    };
  } catch {
    return { data: empty, warning: '本地存储不可用或存档损坏，当前进度可能无法保存。' };
  }
}
export function saveData(
  profile: Profile,
  run: Run | null,
  storage?: Pick<Storage, 'setItem'>,
): boolean {
  try {
    const data: SaveData = {
      version: 1,
      profile,
      run: run?.mode === 'normal' && run.status === 'playing' ? run : null,
    };
    (storage ?? window.localStorage).setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
