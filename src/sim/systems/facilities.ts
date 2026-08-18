import { FACILITIES, facilityDef } from "../../data/facilities.js";
import { GYM_TRAINERS } from "../constants.js";
import type { FacilityId, LeagueState } from "../types.js";

/**
 * Facility effects.
 *
 * Every multiplier the support tier confers is read through this module, so
 * there is exactly one place to look when asking "what does upgrading actually
 * do". Levels are stored on state; everything else is derived.
 *
 * Facilities reset on promotion along with the rest of the league — only the
 * Hall of Fame carries across.
 */

export function level(state: LeagueState, id: FacilityId): number {
  return state.facilities[id] ?? 0;
}

export function upgradeCost(state: LeagueState, id: FacilityId): number | null {
  const def = facilityDef(id);
  if (!def) return null;
  const current = level(state, id);
  if (current >= def.maxLevel) return null;
  return Math.round(def.baseCost * def.costGrowth ** current);
}

export function canUpgrade(
  state: LeagueState,
  id: FacilityId,
): { ok: true; cost: number } | { ok: false; reason: string } {
  const cost = upgradeCost(state, id);
  if (cost === null) return { ok: false, reason: "Fully upgraded" };
  if (state.money < cost) return { ok: false, reason: `Costs ${cost}` };
  return { ok: true, cost };
}

export function upgrade(
  state: LeagueState,
  id: FacilityId,
): { ok: true } | { ok: false; reason: string } {
  const check = canUpgrade(state, id);
  if (!check.ok) return check;

  state.money -= check.cost;
  state.facilities[id] = level(state, id) + 1;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Derived effects
// ---------------------------------------------------------------------------

/**
 * Postings the Scouting Office supports beyond the first.
 *
 * This is where the old auto-scout upgrade went. Buying *headcount* rather than
 * a percentage is the concept draft's "progression is headcount-driven" thesis
 * exactly, and it is a cleaner unlock: another slot is another route worked by
 * another pair of people, not a number quietly going up.
 */
export function rangerSlots(state: LeagueState): number {
  return level(state, "scouting_office");
}

/** Whether routes are surveyed before you visit them. */
export function hasSurvey(state: LeagueState): boolean {
  return level(state, "scouting_office") >= 2;
}

/**
 * Handler postings the Training Grounds support beyond the first few.
 *
 * The Grounds already bought bonding speed; buying *headcount* alongside it is
 * the same shape the Scouting Office has, and it keeps every facility answering
 * the question "how many people can I have out working".
 */
export function handlerSlots(state: LeagueState): number {
  return level(state, "training_grounds");
}

export function bondSpeed(state: LeagueState): number {
  return 1 + level(state, "training_grounds") * 0.3;
}

export function recoverySpeed(state: LeagueState): number {
  return 1 + level(state, "medical_center") * 0.22;
}

export function careerLength(state: LeagueState): number {
  return 1 + level(state, "medical_center") * 0.1;
}

export function tradeEfficiency(state: LeagueState): number {
  return 1 + level(state, "trade_desk") * 0.06;
}

/**
 * How many junior Gym Trainers a gym can employ.
 *
 * Depth here is what keeps the Leader's party off the field, so buying a slot
 * is buying protection for the creatures the player actually cares about.
 */
export function gymTrainerSlotCost(state: LeagueState, gymId: string): number | null {
  const gym = state.gyms[gymId];
  if (!gym) return null;
  const ceiling =
    state.tier === "world" ? GYM_TRAINERS.maxSlotsEndgame : GYM_TRAINERS.maxSlots;
  if (gym.trainerSlots >= ceiling) return null;
  const bought = gym.trainerSlots - GYM_TRAINERS.startingSlots;
  return Math.round(GYM_TRAINERS.slotCostBase * GYM_TRAINERS.slotCostGrowth ** bought);
}

export function expandGymTrainers(
  state: LeagueState,
  gymId: string,
): { ok: true } | { ok: false; reason: string } {
  const gym = state.gyms[gymId];
  if (!gym) return { ok: false, reason: "Gym not found" };
  const cost = gymTrainerSlotCost(state, gymId);
  if (cost === null) return { ok: false, reason: "Gym is at capacity" };
  if (state.money < cost) return { ok: false, reason: `Costs ${cost}` };

  state.money -= cost;
  gym.trainerSlots += 1;
  return { ok: true };
}

export function allFacilities() {
  return FACILITIES;
}
