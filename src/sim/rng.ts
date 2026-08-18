import type { RngState } from "./types.js";

/**
 * mulberry32 — small, fast, good enough, and fully reproducible.
 *
 * The seed lives in LeagueState, so a save resumes the exact stream it left.
 * Never use Math.random inside src/sim: offline catch-up and balance tests both
 * depend on being able to replay a run and get the same league back.
 */
export function next(rng: RngState): number {
  rng.seed = (rng.seed + 0x6d2b79f5) | 0;
  let t = rng.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform float in [min, max). */
export function range(rng: RngState, min: number, max: number): number {
  return min + next(rng) * (max - min);
}

/** Uniform integer in [min, max]. */
export function int(rng: RngState, min: number, max: number): number {
  return Math.floor(range(rng, min, max + 1));
}

export function pick<T>(rng: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick() from empty array");
  const item = items[int(rng, 0, items.length - 1)];
  // Index is bounded above, so this is unreachable — it satisfies the checker.
  if (item === undefined) throw new Error("pick() out of range");
  return item;
}

/** Weighted pick. Weights need not be normalized; non-positive entries skipped. */
export function weighted<T extends string>(
  rng: RngState,
  weights: Record<T, number>,
): T {
  const keys = Object.keys(weights) as T[];
  let total = 0;
  for (const k of keys) total += Math.max(0, weights[k]);
  if (total <= 0) return pick(rng, keys);

  let roll = next(rng) * total;
  for (const k of keys) {
    roll -= Math.max(0, weights[k]);
    if (roll <= 0) return k;
  }
  return keys[keys.length - 1] as T;
}

export function chance(rng: RngState, p: number): boolean {
  return next(rng) < p;
}
