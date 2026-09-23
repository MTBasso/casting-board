/**
 * Gym escalation curve shared by engine.ts (battle difficulty) and
 * growth.ts (ambient catch pacing) — split out to avoid a circular import
 * between the two.
 */

/** Party size a gym leader fields at a given Ante — escalates toward the Championship. */
export function gymPartySizeFor(ante: number, maxAntes: number): number {
  const frac = maxAntes <= 1 ? 1 : (ante - 1) / (maxAntes - 1);
  return Math.round(2 + frac * 4); // 2 at Ante 1 up to 6 at the final Ante
}

/** Gym power scale at Ante 1 vs the final Ante — matches the contested-difficulty range scripts/switch-probe.ts swept. */
const GYM_SCALE_MIN = 1.2;
const GYM_SCALE_MAX = 2.0;

export function gymScaleFor(ante: number, maxAntes: number): number {
  const frac = maxAntes <= 1 ? 1 : (ante - 1) / (maxAntes - 1);
  return GYM_SCALE_MIN + frac * (GYM_SCALE_MAX - GYM_SCALE_MIN);
}
