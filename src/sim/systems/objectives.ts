import { REPEATABLE, SPINE, type MeasureId, type ObjectiveDef, type Reward } from "../../data/objectives.js";
import { level as facilityLevel } from "./facilities.js";
import { hasBondedCore } from "./promotion.js";
import { partyOf } from "./party.js";
import { FACILITIES } from "../../data/facilities.js";
import { log } from "../tick.js";
import type { LeagueState } from "../types.js";

/**
 * Objectives.
 *
 * The game had no stated goal at any moment: you opened it to a board, some
 * numbers, and no indication of what you were working toward or whether you were
 * doing well. This is the smallest honest fix — say what the league could be
 * doing next, and pay for it.
 *
 * They **suggest, never gate**. Nothing here withholds content; renown already
 * does the gating, and a second gate would contradict it the first time either
 * was tuned. What an objective buys is a **crew slot or a facility level** —
 * the two things every screen is waiting on, and the two things money alone
 * cannot hurry.
 */

export interface Objective {
  id: string;
  /** Keys, not sentences — the sim has no language. */
  title: string;
  detail: string;
  titleParams?: Record<string, string | number>;
  have: number;
  goal: number;
  reward: Reward;
  done: boolean;
}

/** What each measure is counting, read live off the league. */
function measure(state: LeagueState, id: MeasureId): number {
  switch (id) {
    case "gyms":
      return state.gymOrder.length;
    case "crews":
      return state.crews.length;
    case "trips":
      return state.tally.trips;
    case "routes":
      return state.explored.length;
    case "caught":
      return state.tally.caught;
    case "challengesHeld":
      return state.tally.held;
    case "promotions":
      return state.hall.length > 0 ? 1 : 0;
    case "legends":
      return state.legends.length;
    case "eliteSeats":
      return state.elite.filter((s) => s.trainerId !== null).length;
    case "gymTrainers":
      return state.gymOrder.reduce(
        (n, id2) => n + (state.gyms[id2]?.trainerIds.length ?? 0),
        0,
      );
    case "facilityLevels":
      return FACILITIES.reduce((n: number, f) => n + facilityLevel(state, f.id), 0);
    case "bonded":
      return state.gymOrder.filter((id2) => {
        const gym = state.gyms[id2];
        return gym?.leaderId ? hasBondedCore(partyOf(state, gym.leaderId)) : false;
      }).length;
  }
}

function shape(state: LeagueState, def: ObjectiveDef): Objective {
  const have = measure(state, def.measure);
  return {
    id: def.id,
    title: `obj.${def.id}.title`,
    detail: `obj.${def.id}.detail`,
    have: Math.min(have, def.goal),
    goal: def.goal,
    reward: def.reward,
    done: have >= def.goal,
  };
}

/**
 * What the league could be working on now.
 *
 * The spine in order, gated only on what has been *claimed* — so the list stays
 * short and reads as a sequence rather than a wall — plus the current tier of
 * each repeatable behind it.
 */
export function objectives(state: LeagueState): Objective[] {
  const claimed = new Set(state.objectives.claimed);
  const out: Objective[] = [];

  for (const def of SPINE) {
    if (claimed.has(def.id)) continue;
    if (def.after?.some((id) => !claimed.has(id))) continue;
    out.push(shape(state, def));
  }

  for (const rep of REPEATABLE) {
    let tier = 1;
    while (claimed.has(`${rep.id}-${tier}`) && tier < 20) tier += 1;
    const goal = rep.goal(tier);
    const have = measure(state, rep.measure);
    out.push({
      id: `${rep.id}-${tier}`,
      title: `obj.${rep.id}.title`,
      detail: `obj.${rep.id}.detail`,
      titleParams: { n: goal.toLocaleString() },
      have: Math.min(have, goal),
      goal,
      reward: rep.reward(tier),
      done: have >= goal,
    });
  }

  // Finished ones first: an objective you can collect is the one worth seeing.
  return out.sort((a, b) => Number(b.done) - Number(a.done));
}

export function claim(
  state: LeagueState,
  id: string,
): { ok: true } | { ok: false; reason: string } {
  const objective = objectives(state).find((o) => o.id === id);
  if (!objective) return { ok: false, reason: "Not offered" };
  if (!objective.done) return { ok: false, reason: "Not done yet" };

  state.objectives.claimed.push(id);
  grant(state, objective.reward);
  log(state, "promote", "log.objectiveDone", { title: objective.title });
  return { ok: true };
}

/** Hand over what an objective promised. */
function grant(state: LeagueState, reward: Reward): void {
  switch (reward.kind) {
    case "crew":
      state.objectives.crewSlots += 1;
      return;
    case "facility": {
      // Given outright rather than paid for: the objective *was* the price.
      const def = FACILITIES.find((f) => f.id === reward.id);
      if (!def) return;
      if (facilityLevel(state, reward.id) >= def.maxLevel) {
        state.money += 5000;
        return;
      }
      state.facilities[reward.id] = facilityLevel(state, reward.id) + 1;
      return;
    }
    case "kit":
      state.stock.balls += reward.balls;
      state.stock.potions += reward.potions;
      state.stock.revives += reward.revives;
      state.stock.lures += reward.lures;
      return;
    case "money":
      state.money += reward.amount;
      return;
  }
}

/** Running totals objectives count against, kept because state does not. */
export function tallyTick(state: LeagueState, held: number, caught: number, trips: number): void {
  state.tally.held += held;
  state.tally.caught += caught;
  state.tally.trips += trips;
}
