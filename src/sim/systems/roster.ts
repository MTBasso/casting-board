import type { Creature, LeagueState } from "../types.js";

/**
 * Who the league has, and what each of them is doing.
 *
 * Four screens used to answer this privately, each with its own
 * `Object.values(state.creatures).filter(...)` and its own idea of what counts.
 * Three of them answered it *wrongly at the same time*, because the sim mutates
 * its state in place and a `useMemo` keyed on `state.creatures` never
 * recomputes — the box did not show new catches, the Hall did not show new
 * plaques, and the Trade Desk still listed creatures it had just given away.
 *
 * A private filter is also a private definition. "Doing nothing" is the one
 * that drifts: a Handler's expedition party is `role: "field"` and excluded for
 * free, but a creature parked at the Day-Care is still `reserve` and very much
 * in use — a fact `trade.ts` knew and the Elite seat picker did not.
 *
 * So the questions live here, once, and every screen asks rather than answers.
 */

/** Everyone still on the books. Retirees have their own place. */
export function owned(state: LeagueState): Creature[] {
  return Object.values(state.creatures).filter((c) => c.owned && c.role !== "retired");
}

/** Standing in somebody's party right now. */
export function fielded(state: LeagueState): Creature[] {
  return Object.values(state.creatures).filter((c) => c.role === "party");
}

/** In the box: owned, not retired, not out with a crew. */
export function inBox(state: LeagueState): Creature[] {
  return Object.values(state.creatures).filter((c) => c.owned && c.role === "reserve");
}

/**
 * In the box and genuinely spare.
 *
 * The stricter question, and the one most callers actually mean. Anything the
 * Day-Care is holding is excluded: it is still `reserve`, and handing it to
 * something else leaves a dangling id that surfaces much later as a different
 * system's bug.
 */
export function idle(state: LeagueState): Creature[] {
  const parked = new Set(state.dayCare.map((slot) => slot.creatureId));
  return inBox(state).filter((c) => !parked.has(c.id));
}

/** Is this creature free to be given a new job? */
export function isIdle(state: LeagueState, creatureId: string): boolean {
  const creature = state.creatures[creatureId];
  if (!creature || !creature.owned || creature.role !== "reserve") return false;
  return !state.dayCare.some((slot) => slot.creatureId === creatureId);
}
