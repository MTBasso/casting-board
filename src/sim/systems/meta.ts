import { TYPES } from "../types.js";
import type { LeagueState } from "../types.js";
import { META } from "../constants.js";
import { next } from "../rng.js";

/**
 * The drifting challenger meta.
 *
 * This is the live-service engine described in the design doc: type weights
 * take a slow random walk, so a gym cast perfectly this season is misconfigured
 * two seasons from now. It generates unlimited re-casting pressure and costs
 * nothing to author.
 *
 * Tuning note: too slow and the board is static, too fast and casting feels
 * futile. `driftMagnitude` is the dial. Watch it with `npm run sim`.
 */
export function driftMeta(state: LeagueState): void {
  const w = state.meta.weights;

  for (const t of TYPES) {
    const nudge = (next(state.rng) - 0.5) * META.driftMagnitude;
    w[t] = Math.max(0.01, w[t] * (1 + nudge));
  }

  // Renormalize so the distribution stays a distribution.
  let total = 0;
  for (const t of TYPES) total += w[t];
  for (const t of TYPES) w[t] = w[t] / total;

  state.meta.season += 1;
  // Add rather than set, so a long dt can drift several seasons in one call.
  state.meta.nextDriftIn += META.driftIntervalSeconds;
}
