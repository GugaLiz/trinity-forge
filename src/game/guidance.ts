import { isElement, matchRecipe, RECIPES, tokenName } from './recipes';
import type { Environment } from './types';

export function sequenceKey(tokens: string[]) {
  return (tokens.every(isElement) ? [...tokens].sort() : tokens).join('|');
}
export function branches(token: string) {
  return RECIPES.filter((r) => r.ordered && r.inputs[0] === token);
}
export function explorationHint(tokens: string[], discovered: string[] = []): string {
  const products = tokens.filter((t) => !isElement(t));
  if (products.length > 1)
    return '产物之间不直接合成。一次只用一件生态产物，再加入一种基础元素催化。';
  if (products.length === 1) {
    const product = products[0];
    const next = branches(product);
    if (!next.length)
      return `「${tokenName(product)}」已是这条路径的终点，留在生态区仍能回补养分；换一种产物探索。`;
    if (tokens[0] !== product)
      return `先放「${tokenName(product)}」，再加入基础元素。试着纠正顺序。`;
    if (tokens.length > 2) return '催化只需一件产物与一种元素，请撤回多余的材料。';
    const unknown = next.filter((r) => !discovered.includes(r.id));
    const clue = unknown[0] ?? next[0];
    return `「${tokenName(product)}」${unknown.length ? `还有 ${unknown.length} 条待发现的催化方向` : '的分支都已发现，可继续炼制或换一条路径'}。${clue.hint}`;
  }
  if (tokens.length >= 3 && new Set(tokens).size === 1)
    return '同一象已经足够，试着减少一份材料，或更换材料来寻找另一条路径。';
  const match = matchRecipe(tokens);
  if (match)
    return match.ordered
      ? '产物在前、元素在后，催化顺序已就位。'
      : '基础元素顺序不限；同一象的数量会改变产物。';
  if (tokens.length === 1) return '再加入一份基础元素。同象相叠、异象相遇，都可能成形。';
  return '试着减少一份材料，或用水、火、土中的另一象替换；基础组合只需要两至三份材料。';
}

export type Severity = 'safe' | 'caution' | 'warning' | 'critical';
export function severity(key: keyof Environment, value: number): Severity {
  const distance = key === 'nutrients' ? value : Math.min(value, 10 - value);
  return distance === 0
    ? 'critical'
    : distance === 1
      ? 'warning'
      : distance === 2
        ? 'caution'
        : 'safe';
}
export function environmentHint(key: keyof Environment, value: number): string {
  const level = severity(key, value);
  if (key === 'nutrients')
    return level === 'critical'
      ? '养分耗尽 · 先调息'
      : level === 'warning'
        ? '养分将尽 · 建议调息'
        : level === 'caution'
          ? '养分偏少 · 留意成本'
          : '生态持续回补';
  if (level === 'critical')
    return key === 'heat'
      ? value === 0
        ? '炉温失衡 · 禁水'
        : '炉温失衡 · 禁火'
      : value === 0
        ? '湿度归零 · 水系受限'
        : '湿度失衡 · 失败 25%';
  if (level === 'warning')
    return `${value < 5 ? '偏低' : '偏高'}危险 · 再${value < 5 ? '降' : '升'}将失衡`;
  if (level === 'caution')
    return key === 'moisture' && value >= 8
      ? '高湿 · 失败风险 25%'
      : `${value < 5 ? '偏低' : '偏高'} · 距失衡 2`;
  return key === 'heat' ? '水降 · 火升' : '水升 · 土降';
}
