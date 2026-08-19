import { FIELD, STAFF, TRAITS } from "../constants.js";
import { trainerName } from "../../data/names.js";
import { makeTrainer, nextId, pickLook } from "../factory.js";
import { chance, pick } from "../rng.js";
import { clamp01 } from "../math.js";
import { catcherSlots } from "./facilities.js";
import { recall } from "./expeditions.js";
import { log } from "../tick.js";
import { TYPES } from "../types.js";
import type {
  Crew,
  CrewTrait,
  CrewOffer,
  LeagueState,
  StandingOrders,
  StandingStop,
  Trainer,
  TypeId,
} from "../types.js";

/**
 * The people who work the ground.
 *
 * A crew is **one hire and two people** who already work together: the Ranger
 * brings creatures back, the Handler raises the ones they took with them. They
 * used to be two separate payrolls, which is why the screen read as two half
 * features sharing a tab and why neither half ever cared what the other did.
 *
 * Competence is *this crew* on *this ground*, and is deliberately not the same
 * thing as the league's familiarity with a route: a new crew does badly on
 * well-known ground. It never decays, because decay would punish the one thing
 * the map exists to encourage — going somewhere new means neglecting somewhere
 * known.
 */

export function crewSlots(state: LeagueState): number {
  return FIELD.baseSlots + catcherSlots(state) + state.objectives.crewSlots;
}

export function crewHireCost(state: LeagueState): number {
  return Math.round(FIELD.hireCostBase * FIELD.hireCostGrowth ** state.crews.length);
}

/** The types the league actually fields, which is what makes a crew useful. */
function fielded(state: LeagueState): TypeId[] {
  const out = new Set<TypeId>();
  for (const id of state.gymOrder) {
    const type = state.gyms[id]?.type;
    if (type) out.add(type);
  }
  return [...out];
}

/**
 * Draw a fresh set of crews to choose between.
 *
 * Offered rather than assembled. Picking two individuals off a list made a crew
 * a component you bought — you already knew which types you wanted, so the only
 * question was affordability. Being offered *these two people, who work
 * together, and are like this* is a choice.
 *
 * It stopped being a choice in practice. Both members were drawn uniformly from
 * eighteen types while passing was free, instant and unlimited, so with one gym
 * only **28% of draws contained anybody who could help you** — and rerolling
 * until one did was not impatience, it was correct play.
 *
 * So the draw is weighted toward what the league fields, and the first slot is
 * *guaranteed* to be useful. The last is deliberately left wild: a crew for a
 * type you do not have yet is how the Field suggests what your next gym could
 * be, and without it the offer collapses into your own types read back to you.
 * It carries no label — the type badge already says what it is, and annotating
 * your own dice is a strange thing for a game to do.
 */
export function rollCrewOffer(state: LeagueState): void {
  const ours = fielded(state);
  const theirs = TYPES.filter((t) => !ours.includes(t));
  const last = FIELD.offerSize - 1;

  /** Which types a given slot draws from. */
  const drawFrom = (slot: number): TypeId[] => {
    // Before the founding choice there is nothing to be relevant to.
    if (ours.length === 0) return [...TYPES];
    if (slot === 0) return ours;
    if (slot === last && theirs.length > 0) return theirs;
    return chance(state.rng, FIELD.offerRelevance) ? ours : [...TYPES];
  };

  const drawType = (slot: number): TypeId => pick(state.rng, drawFrom(slot));

  const out: CrewOffer[] = [];
  for (let i = 0; i < FIELD.offerSize; i++) {
    const rangerType = drawType(i);

    // Usually a second type, sometimes the same — a single-type crew is
    // narrower and deeper, and that is a legitimate thing to be offered.
    //
    // The handler leans the same way as its slot, so a crew drawn to be useful
    // is useful in both halves rather than half-wasted.
    let handlerType = rangerType;
    if (!chance(state.rng, 0.15)) {
      const pool = drawFrom(i).filter((t) => t !== rangerType);
      handlerType = pool.length > 0 ? pick(state.rng, pool) : rangerType;
    }

    out.push({
      id: `co_${state.time}_${i}_${state.crews.length}`,
      rangerType,
      handlerType,
      trait: pick(state.rng, Object.keys(TRAITS) as CrewTrait[]),
      rangerName: trainerName(state.rng),
      handlerName: trainerName(state.rng),
      rangerLook: pickLook(state.rng, rangerType, "ranger"),
      handlerLook: pickLook(state.rng, handlerType, "handler"),
      cost: crewHireCost(state),
    });
  }
  state.crewOffer = out;
}

export function crewOffer(state: LeagueState): CrewOffer[] {
  if (state.crewOffer.length === 0) rollCrewOffer(state);
  return state.crewOffer;
}

export function canHireCrew(
  state: LeagueState,
): { ok: true; cost: number } | { ok: false; reason: string } {
  if (state.crews.length >= crewSlots(state)) {
    return { ok: false, reason: "No room — upgrade the Scouting Office" };
  }
  const cost = crewHireCost(state);
  if (state.money < cost) return { ok: false, reason: `Costs ${cost}` };
  return { ok: true, cost };
}

export function hireCrew(
  state: LeagueState,
  offerId: string,
): { ok: true; crewId: string } | { ok: false; reason: string } {
  const check = canHireCrew(state);
  if (!check.ok) return check;

  const offer = state.crewOffer.find((o) => o.id === offerId);
  if (!offer) return { ok: false, reason: "Not on offer" };

  state.money -= check.cost;

  const ranger = makeFieldHand(state, offer.rangerType, "ranger", offer.rangerName, offer.rangerLook);
  const handler = makeFieldHand(state, offer.handlerType, "handler", offer.handlerName, offer.handlerLook);

  const crew: Crew = {
    id: nextId(state, "cw"),
    rangerId: ranger.id,
    handlerId: handler.id,
    trait: offer.trait,
    familiar: {},
    orders: null,
  };
  state.crews.push(crew);
  rollCrewOffer(state);
  return { ok: true, crewId: crew.id };
}

/** One half of a crew. They travel light: a Ranger brings nobody of their own. */
function makeFieldHand(
  state: LeagueState,
  type: TypeId,
  kind: "ranger" | "handler",
  name: string,
  look: string,
): Trainer {
  const trainer = makeTrainer(state, type, kind, {
    partyCap: kind === "handler" ? FIELD.partyMax : 0,
    level: 1,
  });
  trainer.name = name;
  trainer.look = look;
  trainer.salary = STAFF.baseSalaryPerHour * FIELD.salaryFactor;

  for (const id of trainer.party) {
    const c = state.creatures[id];
    if (c) {
      c.role = "reserve";
      c.trainerId = null;
    }
  }
  trainer.party = [];
  trainer.signatureId = "";
  return trainer;
}

export function passOnCrewOffer(state: LeagueState): void {
  rollCrewOffer(state);
}

export function crewById(state: LeagueState, crewId: string): Crew | undefined {
  return state.crews.find((c) => c.id === crewId);
}

export function crewMembers(
  state: LeagueState,
  crew: Crew,
): { ranger: Trainer | undefined; handler: Trainer | undefined } {
  return {
    ranger: state.trainers[crew.rangerId],
    handler: state.trainers[crew.handlerId],
  };
}

export function crewName(state: LeagueState, crew: Crew): string {
  const { ranger, handler } = crewMembers(state, crew);
  return `${ranger?.name ?? "?"} & ${handler?.name ?? "?"}`;
}

/** How well this crew knows this ground, 0..1. Never decays. */
export function competence(crew: Crew, routeId: string): number {
  return clamp01(crew.familiar[routeId] ?? 0);
}

/**
 * Let a crew go.
 *
 * Their trained creatures come home — those were always yours. What you lose is
 * the pair, their trait, and every hour of competence they had built on ground
 * they knew, which a replacement starts without.
 */
export function dismissCrew(state: LeagueState, crewId: string): void {
  const crew = crewById(state, crewId);
  if (!crew) return;

  recall(state, crewId);
  for (const id of [crew.rangerId, crew.handlerId]) {
    const trainer = state.trainers[id];
    if (!trainer) continue;
    for (const cid of trainer.party) {
      const c = state.creatures[cid];
      if (c) {
        c.role = "reserve";
        c.trainerId = null;
      }
    }
    delete state.trainers[id];
  }
  state.crews = state.crews.filter((c) => c.id !== crewId);
  log(state, "quit", "log.crewLetGo", { name: crewName(state, crew) });
}

/**
 * Tell a crew to keep going, or to stop.
 *
 * Set while they are out or while they are home; either way it takes effect the
 * next time a trip ends. Giving fresh orders clears whatever stopped the last
 * ones, because the player has just answered that.
 */
export function setOrders(
  state: LeagueState,
  crewId: string,
  orders: Omit<StandingOrders, "stoppedBecause"> | null,
): { ok: true } | { ok: false; reason: string } {
  const crew = crewById(state, crewId);
  if (!crew) return { ok: false, reason: "No such crew" };
  crew.orders = orders ? { ...orders, stoppedBecause: null } : null;
  return { ok: true };
}

/** Why a crew stopped working, if it did. */
export function standingStop(state: LeagueState, crewId: string): StandingStop | null {
  return crewById(state, crewId)?.orders?.stoppedBecause ?? null;
}
