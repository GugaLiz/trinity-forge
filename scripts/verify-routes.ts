import { mkdirSync, writeFileSync } from 'node:fs';
import { act, createRun, preview, scoreRun } from '../src/game/engine';
import { RECIPES, RECIPE_MAP } from '../src/game/recipes';
import type { Run } from '../src/game/types';

export function recipeIds(run: Run, recipeId: string): string[] | null {
  const inventory = [...run.hand, ...run.ecosystem];
  const ids: string[] = [];
  for (const token of RECIPE_MAP[recipeId].inputs) {
    const material = inventory.find((m) => m.token === token && !ids.includes(m.id));
    if (!material) return null;
    ids.push(material.id);
  }
  return ids;
}
type Candidate = { run: Run; actions: string[] };
function heuristic(run: Run, target?: string): number {
  const env = run.environment;
  let bonus = 0;
  if (target) {
    let id = target,
      weight = 100;
    while (RECIPE_MAP[id]) {
      if (run.discovered.includes(id)) bonus += weight;
      if (run.ecosystem.some((m) => m.token === id)) bonus += weight * 0.6;
      id = RECIPE_MAP[id].inputs[0];
      weight *= 0.4;
    }
  }
  return (
    run.discovered.length * 25 +
    run.discovered.filter((id) => RECIPE_MAP[id].tier === 3).length * 6 +
    Math.min(run.ecosystem.length, 3) * 3 +
    Math.min(env.nutrients, 6) +
    Math.min(env.heat, 10 - env.heat) * 1.5 +
    Math.min(env.moisture, 10 - env.moisture) +
    bonus
  );
}
function key(run: Run) {
  return [
    run.rng,
    run.environment.heat,
    run.environment.moisture,
    run.environment.nutrients,
    [...run.discovered].sort().join(','),
    run.ecosystem
      .map((m) => m.token)
      .sort()
      .join(','),
  ].join('|');
}
export function search(seed: number, target?: string, width = 160): Candidate | undefined {
  let beam: Candidate[] = [{ run: createRun('normal', seed), actions: [] }];
  let best: Candidate | undefined;
  for (let turn = 1; turn <= 12; turn++) {
    const possibilities: Candidate[] = [];
    const seen = new Set<string>();
    for (const { run, actions } of beam) {
      const choices = ['rest', ...RECIPES.map((r) => r.id)];
      for (const choice of choices) {
        const ids = choice === 'rest' ? null : recipeIds(run, choice);
        if (choice !== 'rest' && (!ids || !preview(run, ids).valid)) continue;
        const next = act(
          run,
          ids ? { type: 'forge', ids, turn: run.turn } : { type: 'rest', turn: run.turn },
        ).run;
        if (next === run || next.status === 'lost') continue;
        const candidate = { run: next, actions: [...actions, choice] };
        if (
          next.status === 'won' &&
          next.discovered.some((id) => RECIPE_MAP[id].tier === 3) &&
          (!target || next.discovered.includes(target))
        ) {
          if (!best || scoreRun(next).total > scoreRun(best.run).total) best = candidate;
        }
        if (next.status !== 'playing') continue;
        const signature = key(next);
        if (!seen.has(signature)) {
          seen.add(signature);
          possibilities.push(candidate);
        }
      }
    }
    possibilities.sort((a, b) => heuristic(b.run, target) - heuristic(a.run, target));
    beam = possibilities.slice(0, width);
  }
  return best;
}

const seeds = [20261106, 17, 42, 101, 256, 512, 1024, 4096, 8192, 65535];
const results: {
  seed: number;
  target?: string;
  actions: string[];
  score: number;
  discovered: string[];
  logs: Run['logs'];
}[] = [];
for (const seed of seeds) {
  const result = search(seed);
  if (!result) throw new Error(`No verified winning route for seed ${seed}`);
  results.push({
    seed,
    actions: result.actions,
    score: scoreRun(result.run).total,
    discovered: result.run.discovered,
    logs: result.run.logs,
  });
  console.log(
    `seed ${seed}: ${result.run.discovered.length} discoveries, ${scoreRun(result.run).total} points`,
  );
}
for (const recipe of RECIPES.filter((r) => r.tier === 3)) {
  let result: Candidate | undefined;
  let seed = 20261106;
  for (const candidateSeed of seeds) {
    result = search(candidateSeed, recipe.id, 240);
    seed = candidateSeed;
    if (result) break;
  }
  if (!result) throw new Error(`Third-tier node unreachable in verified routes: ${recipe.id}`);
  results.push({
    seed,
    target: recipe.id,
    actions: result.actions,
    score: scoreRun(result.run).total,
    discovered: result.run.discovered,
    logs: result.run.logs,
  });
  console.log(
    `${recipe.name}: reachable from seed ${seed}, winning with ${result.run.discovered.length} discoveries`,
  );
}
mkdirSync('docs', { recursive: true });
writeFileSync(
  'docs/verified-routes.json',
  JSON.stringify(
    {
      note: 'Automated route search, not human playtesting. Each action uses real hand, resource, RNG and instance rules.',
      results,
    },
    null,
    2,
  ) + '\n',
);
