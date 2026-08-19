/** Small numeric helpers the systems share. */

/** Clamp to 0..1. Fatigue, bond, wear and knowledge are all fractions. */
export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
