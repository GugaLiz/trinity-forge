import type { Element, Environment } from './types';
export const CONFIG = {
  turns: 12,
  goal: 8,
  max: 10,
  baseCost: 1,
  regenCap: 3,
  restNutrients: 2,
  freeRestInterval: 3,
  humidThreshold: 8,
  failChance: 0.25,
  initial: { heat: 5, moisture: 5, nutrients: 5 } satisfies Environment,
};
export const ELEMENTS: Record<
  Element,
  { name: string; label: string; glyph: string; hint: string }
> = {
  W: { name: '水', label: 'WATER', glyph: 'water', hint: '炉温 −1 · 湿度 +1' },
  F: { name: '火', label: 'FIRE', glyph: 'fire', hint: '炉温 +1' },
  E: { name: '土', label: 'EARTH', glyph: 'earth', hint: '湿度 −1' },
};
export const TUTORIAL_RECIPES = ['steam', 'cloud', 'rain'];
export const TUTORIAL_TEXT = [
  {
    title: '一 · 两象相遇',
    text: '依次点选「水」和「火」，再点合成。基础元素的先后顺序不限。',
    tokens: ['W', 'F'],
  },
  {
    title: '二 · 第三种力量',
    text: '切到「生态」，先放入蒸汽；再切回「元素」投入土。催化必须先产物、后元素。',
    tokens: ['steam', 'E'],
  },
  {
    title: '三 · 万物初生',
    text: '先投入生态里的云，再投入水。让第一场雨落下，完成这次入炉修习。',
    tokens: ['cloud', 'W'],
  },
];
