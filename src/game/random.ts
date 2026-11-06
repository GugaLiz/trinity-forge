export function nextRandom(state: number): [number, number] {
  let n = state >>> 0 || 0x9e3779b9;
  n ^= n << 13;
  n ^= n >>> 17;
  n ^= n << 5;
  return [(n >>> 0) / 4294967296, n >>> 0];
}
export function normalizeSeed(seed: number) {
  return seed >>> 0 || 0x9e3779b9;
}
