export type Element = 'W' | 'F' | 'E';
export type Environment = { heat: number; moisture: number; nutrients: number };
export type Recipe = {
  id: string;
  name: string;
  glyph: string;
  tier: 1 | 2 | 3;
  inputs: string[];
  ordered: boolean;
  cost: Partial<Environment>;
  score: number;
  water: boolean;
  hint: string;
  description: string;
};
export type Material = { id: string; token: string; createdTurn?: number };
export type TurnLog = {
  turn: number;
  action: 'forge' | 'rest';
  inputs: string[];
  output?: string;
  fresh?: boolean;
  messages: string[];
  environment: Environment;
};
export type Run = {
  version: 1;
  id: string;
  mode: 'normal' | 'tutorial';
  seed: number;
  rng: number;
  turn: number;
  status: 'playing' | 'won' | 'lost' | 'learned';
  environment: Environment;
  hand: Material[];
  ecosystem: Material[];
  discovered: string[];
  forbidden: Element | null;
  logs: TurnLog[];
};
export type Profile = {
  version: 1;
  discovered: string[];
  bestScore: number;
  muted: boolean;
  reducedMotion: boolean;
  tutorialDone: boolean;
};
export type Preview = {
  valid: boolean;
  reason: string;
  recipe?: Recipe;
  afterInput: Environment;
  afterSuccess: Environment;
  highHumidity: boolean;
};
