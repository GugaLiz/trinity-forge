import { CONFIG, TUTORIAL_RECIPES } from './config';
import { explorationHint, sequenceKey } from './guidance';
import { isElement, matchRecipe, RECIPE_MAP, tokenName } from './recipes';
import { nextRandom, normalizeSeed } from './random';
import type { Element, Environment, Material, Preview, Run, TurnLog } from './types';

export const turnLimit = (run: Run) => (run.mode === 'tutorial' ? 3 : CONFIG.turns);
export const freeRestAvailable = (run: Run) =>
  run.mode === 'normal' && run.turn >= run.freeRestReadyTurn;

export const clamp = (value: number) => Math.max(0, Math.min(CONFIG.max, value));
export function danger(env: Environment) {
  return [
    env.heat === 0 || env.heat === 10,
    env.moisture === 0 || env.moisture === 10,
    env.nutrients === 0,
  ];
}
export function scoreRun(run: Run) {
  const discovery = run.discovered.reduce((n, id) => n + RECIPE_MAP[id].score, 0);
  const stability = danger(run.environment).filter((d) => !d).length * 10;
  return {
    discovery,
    stability,
    nutrients: run.environment.nutrients,
    total: discovery + stability + run.environment.nutrients,
  };
}
function deal(run: Run): Run {
  const tokens: Element[] = ['W', 'F', 'E'];
  let rng = run.rng;
  for (let i = 0; i < 2; i++) {
    const [n, next] = nextRandom(rng);
    rng = next;
    tokens.push((['W', 'F', 'E'] as Element[])[Math.floor(n * 3)]);
  }
  const [n, next] = nextRandom(rng);
  rng = next;
  const least = (['W', 'F', 'E'] as Element[]).filter(
    (token) =>
      tokens.filter((t) => t === token).length ===
      Math.min(...(['W', 'F', 'E'] as Element[]).map((e) => tokens.filter((t) => t === e).length)),
  );
  tokens.push(least[Math.floor(n * least.length)]);
  return { ...run, rng, hand: tokens.map((token, i) => ({ id: `h-${run.turn}-${i}`, token })) };
}
export function createRun(mode: Run['mode'] = 'normal', seed = 1): Run {
  const normalized = normalizeSeed(seed);
  return deal({
    version: 3,
    revision: 0,
    freeRestReadyTurn: 1,
    failedSequences: [],
    id: `${mode}-${normalized}`,
    mode,
    seed: normalized,
    rng: normalized,
    turn: 1,
    status: 'playing',
    environment: { ...CONFIG.initial },
    hand: [],
    ecosystem: [],
    discovered: [],
    forbidden: null,
    logs: [],
  });
}
export function getMaterials(run: Run, ids: string[]): Material[] {
  const inventory = [...run.hand, ...run.ecosystem];
  return ids
    .map((id) => inventory.find((item) => item.id === id))
    .filter((m): m is Material => Boolean(m));
}
export function preview(run: Run, ids: string[]): Preview {
  const materials = getMaterials(run, ids);
  const tokens = materials.map((m) => m.token);
  const recipe = matchRecipe(tokens);
  const afterInput = { ...run.environment };
  for (const token of tokens) {
    if (token === 'W') {
      afterInput.heat = clamp(afterInput.heat - 1);
      afterInput.moisture = clamp(afterInput.moisture + 1);
    }
    if (token === 'F') afterInput.heat = clamp(afterInput.heat + 1);
    if (token === 'E') afterInput.moisture = clamp(afterInput.moisture - 1);
  }
  const afterSuccess = { ...afterInput };
  afterSuccess.nutrients -= CONFIG.baseCost;
  if (recipe)
    for (const key of ['heat', 'moisture', 'nutrients'] as const)
      afterSuccess[key] = clamp(afterSuccess[key] - (recipe.cost[key] ?? 0));
  const remaining = run.ecosystem.filter((m) => !ids.includes(m.id)).length + (recipe ? 1 : 0);
  afterSuccess.nutrients = clamp(afterSuccess.nutrients + Math.min(CONFIG.regenCap, remaining));
  let reason = '';
  if (run.status !== 'playing') reason = '此局已经结束';
  else if (ids.length < 2) reason = '至少投入两份材料';
  else if (ids.length > 3) reason = '炉中最多容纳三份材料';
  else if (materials.length !== ids.length || new Set(ids).size !== ids.length)
    reason = '材料已被使用，请重新选择';
  else if (!recipe && run.failedSequences.includes(sequenceKey(tokens)))
    reason = '这组材料已经试过，无需再次消耗养分。请沿线索调整。';
  else if (tokens.some((token) => isElement(token) && token === run.forbidden))
    reason = `炉温失衡，本回合不能投入${tokenName(run.forbidden!)}`;
  else if (run.environment.nutrients < CONFIG.baseCost + (recipe?.cost.nutrients ?? 0))
    reason = '养分不足，请先调息';
  else if (recipe?.water && afterInput.moisture === 0) reason = '湿度为零，无法合成水系产物';
  else if (run.mode === 'tutorial' && recipe?.id !== TUTORIAL_RECIPES[run.turn - 1])
    reason = '按照上方引导选择材料与顺序';
  return {
    valid: !reason,
    reason,
    recipe,
    afterInput,
    afterSuccess,
    highHumidity: afterInput.moisture >= CONFIG.humidThreshold,
  };
}

export type Command =
  | { type: 'forge'; ids: string[]; turn: number; revision: number }
  | { type: 'rest'; turn: number; revision: number };
export function act(run: Run, command: Command): { run: Run; error?: string } {
  if (run.status !== 'playing' || run.turn !== command.turn || run.revision !== command.revision)
    return { run, error: '此操作已结算，请重新选择' };
  if (command.type === 'rest' && run.mode === 'tutorial')
    return { run, error: '先完成这次修习，再尝试调息' };
  let next: Run = {
    ...run,
    environment: { ...run.environment },
    ecosystem: [...run.ecosystem],
    discovered: [...run.discovered],
    failedSequences: [...run.failedSequences],
    revision: run.revision + 1,
  };
  const log: TurnLog = {
    turn: run.turn,
    action: command.type,
    inputs: [],
    messages: [],
    environment: { ...run.environment },
    advanced: true,
  };
  if (command.type === 'rest') {
    const center = (n: number) => n + Math.sign(5 - n);
    next.environment = {
      heat: center(run.environment.heat),
      moisture: center(run.environment.moisture),
      nutrients: clamp(run.environment.nutrients + CONFIG.restNutrients),
    };
    if (freeRestAvailable(run)) {
      next.freeRestReadyTurn = run.turn + CONFIG.freeRestInterval;
      log.advanced = false;
      log.messages.push(
        `免费调息：养分 +2，温湿回中；不占回合，第 ${next.freeRestReadyTurn} 回合再次可用`,
      );
    } else log.messages.push('休整调息：消耗一回合，养分 +2，炉温与湿度向中值恢复');
  } else {
    const p = preview(run, command.ids);
    if (!p.valid) return { run, error: p.reason };
    log.inputs = getMaterials(run, command.ids).map((m) => m.token);
    let failed = !p.recipe;
    if (p.recipe && p.highHumidity) {
      const [roll, rng] = nextRandom(next.rng);
      next.rng = rng;
      failed = roll < CONFIG.failChance;
    }
    if (failed) {
      next.environment.nutrients -= CONFIG.baseCost;
      log.advanced = false;
      log.failure = p.recipe ? 'humidity' : 'unknown';
      log.hint = p.recipe
        ? '湿度达到 8 时有 25% 失败风险。试着先调息降湿，材料仍可继续使用。'
        : explorationHint(log.inputs, run.discovered);
      if (!p.recipe) next.failedSequences.push(sequenceKey(log.inputs));
      log.messages.push(
        p.recipe
          ? '湿气扰炉。只消耗 1 养分，材料保留，不占回合。'
          : '此序尚未成形。只消耗 1 养分，材料保留，不占回合。',
      );
    } else if (p.recipe) {
      const r = p.recipe;
      next.environment = {
        ...p.afterInput,
        nutrients: run.environment.nutrients - CONFIG.baseCost,
      };
      for (const key of ['heat', 'moisture', 'nutrients'] as const)
        next.environment[key] = clamp(next.environment[key] - (r.cost[key] ?? 0));
      next.ecosystem = next.ecosystem.filter((m) => !command.ids.includes(m.id));
      next.ecosystem.push({ id: `p-${run.turn}-${r.id}`, token: r.id, createdTurn: run.turn });
      log.output = r.id;
      log.fresh = !next.discovered.includes(r.id);
      if (log.fresh) next.discovered.push(r.id);
      log.messages.push(
        `${log.inputs.map(tokenName).join(' → ')}，化为${r.name}${log.fresh ? ` · 首见 +${r.score}` : ' · 已收录'}`,
      );
    }
  }
  if (!log.advanced) {
    // Exploration and free rest cannot farm ecosystem recovery or retrigger backlash.
    next.forbidden = next.environment.heat === 10 ? 'F' : next.environment.heat === 0 ? 'W' : null;
    log.environment = { ...next.environment };
    next.logs = [...run.logs, log];
    return { run: next };
  }
  const regen = Math.min(CONFIG.regenCap, next.ecosystem.length);
  const recovered = Math.min(regen, CONFIG.max - next.environment.nutrients);
  next.environment.nutrients = clamp(next.environment.nutrients + regen);
  if (recovered) log.messages.push(`生态回补养分 +${recovered}`);
  const extremes = danger(next.environment);
  if (extremes.every(Boolean)) {
    next.status = 'lost';
    log.messages.push('三象俱失，全盘失衡');
  } else if (extremes.some(Boolean)) {
    if (next.ecosystem.length) {
      const [roll, rng] = nextRandom(next.rng);
      next.rng = rng;
      const [destroyed] = next.ecosystem.splice(Math.floor(roll * next.ecosystem.length), 1);
      log.messages.push(`失衡反噬：${tokenName(destroyed.token)}消散`);
    } else log.messages.push('环境失衡，炉中尚无产物可损失');
  }
  next.forbidden = next.environment.heat === 10 ? 'F' : next.environment.heat === 0 ? 'W' : null;
  log.environment = { ...next.environment };
  next.logs = [...run.logs, log];
  if (next.status === 'playing') {
    if (run.mode === 'tutorial' && run.turn === 3) next.status = 'learned';
    else if (run.turn === turnLimit(run))
      next.status = next.discovered.length >= CONFIG.goal ? 'won' : 'lost';
    else next = deal({ ...next, turn: run.turn + 1 });
  }
  return { run: next };
}
