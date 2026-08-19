import { catalog, encounterWeight, minLevelFor } from "../../data/catalog.js";
import {
  ROUTES,
  neighboursOf,
  routeById,
  startingRoutes,
} from "../../data/routes.js";
import { FIELD, KIT, SCOUTING, STAFF, TRAITS } from "../constants.js";
import { makeCreature, makeTrainer, nextId, pickLook } from "../factory.js";
import { trainerName } from "../../data/names.js";
import { chance, int, pick, range, weighted } from "../rng.js";
import { catcherSlots } from "./facilities.js";
import { gainXp } from "./growth.js";
import { isSuspended } from "./morale.js";
import { canJoin, candidatesFor, leaveParty } from "./party.js";
import { displayName } from "./wave.js";
import { log } from "../tick.js";
import { TYPES } from "../types.js";
import type {
  Creature,
  Crew,
  CrewOffer,
  CrewTrait,
  Expedition,
  Kit,
  LeagueState,
  Route,
  TickReport,
  Trainer,
  TypeId,
} from "../types.js";

/**
 * The Field: crews, the ground, and what happens out there.
 *
 * Three ideas, and the whole feature is the three of them together.
 *
 * **A crew is one hire.** Two people who already work together — the Ranger
 * brings creatures back, the Handler raises the ones they took. They were two
 * separate payrolls, which is why the screen read as two half-features sharing
 * a tab, and why neither half ever cared what the other did.
 *
 * **The ground is a map.** Sixteen places in a web with loops, three of them
 * open from the first hour and the rest reached by pushing on from somewhere you
 * know well. Routes stopped unlocking by a renown number nobody acts on; you get
 * there by going there.
 *
 * **A trip is finite and paid for up front.** You outfit a crew — balls, potions,
 * revives, lures — and they work until the balls run out or they are too beaten
 * to carry on. How long that is, is what you chose at the counter.
 */

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

/** Ground the league has reached. */
export function openRoutes(state: LeagueState): Route[] {
  return ROUTES.filter((r) => state.explored.includes(r.id));
}

export function isOpen(state: LeagueState, routeId: string): boolean {
  return state.explored.includes(routeId);
}

/** How well the league knows this ground, 0..1. */
export function knownOf(state: LeagueState, routeId: string): number {
  return clamp01((state.known[routeId] ?? 0) / FIELD.tripsToPushOn);
}

/** Whether the league knows this ground well enough to push on from it. */
export function canPushOnFrom(state: LeagueState, routeId: string): boolean {
  return knownOf(state, routeId) >= 1;
}

/** Everywhere reachable from open ground that has not been reached yet. */
export function frontier(state: LeagueState): { from: Route; to: Route }[] {
  const out: { from: Route; to: Route }[] = [];
  for (const from of openRoutes(state)) {
    if (!canPushOnFrom(state, from.id)) continue;
    for (const to of neighboursOf(from.id)) {
      if (isOpen(state, to.id)) continue;
      if (out.some((e) => e.to.id === to.id)) continue;
      out.push({ from, to });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Crews
// ---------------------------------------------------------------------------

export function crewSlots(state: LeagueState): number {
  return FIELD.baseSlots + catcherSlots(state) + state.objectives.crewSlots;
}

export function crewHireCost(state: LeagueState): number {
  return Math.round(FIELD.hireCostBase * FIELD.hireCostGrowth ** state.crews.length);
}

/**
 * Draw a fresh set of crews to choose between.
 *
 * Offered rather than assembled. Picking two individuals off a list made a crew
 * a component you bought — you already knew which types you wanted, so the only
 * question was affordability. Being offered *these two people, who work
 * together, and are like this* is a choice.
 */
export function rollCrewOffer(state: LeagueState): void {
  const out: CrewOffer[] = [];
  for (let i = 0; i < FIELD.offerSize; i++) {
    const rangerType = pick(state.rng, [...TYPES]);
    // Usually a second type, sometimes the same — a single-type crew is
    // narrower and deeper, and that is a legitimate thing to be offered.
    const handlerType = chance(state.rng, 0.15)
      ? rangerType
      : pick(state.rng, TYPES.filter((t) => t !== rangerType));

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

// ---------------------------------------------------------------------------
// Outfitting
// ---------------------------------------------------------------------------

export function emptyKit(): Kit {
  return { balls: 0, potions: 0, revives: 0, lures: 0 };
}

export function kitCost(kit: Kit): number {
  return (
    kit.balls * KIT.balls.cost +
    kit.potions * KIT.potions.cost +
    kit.revives * KIT.revives.cost +
    kit.lures * KIT.lures.cost
  );
}

/** What comes back when a trip ends with kit unspent. They sold it on. */
/**
 * What comes back when a trip ends with kit unspent.
 *
 * A loss on purpose: over-buying has to cost something, or the outfitting
 * decision collapses into "buy the maximum every time". Kit *granted* by an
 * objective is different — that sits in hand until it is used.
 */
export function refundFor(kit: Kit): number {
  return Math.round(kitCost(kit) * FIELD.refund);
}

// ---------------------------------------------------------------------------
// Sending them out
// ---------------------------------------------------------------------------

export function expeditionOf(state: LeagueState, crewId: string): Expedition | undefined {
  return state.expeditions.find((e) => e.crewId === crewId);
}

export function expeditionOn(state: LeagueState, routeId: string): Expedition | undefined {
  return state.expeditions.find((e) => e.routeId === routeId);
}

export function canSend(
  state: LeagueState,
  crewId: string,
  routeId: string,
  objective: "work" | "explore",
  towardId: string | null,
  kit: Kit,
): { ok: true; cost: number } | { ok: false; reason: string } {
  const crew = crewById(state, crewId);
  if (!crew) return { ok: false, reason: "No such crew" };
  if (expeditionOf(state, crewId)) return { ok: false, reason: "Already out" };
  if (!isOpen(state, routeId)) return { ok: false, reason: "Not reached yet" };
  if (expeditionOn(state, routeId)) return { ok: false, reason: "Another crew is there" };

  const { ranger, handler } = crewMembers(state, crew);
  if (!ranger || !handler) return { ok: false, reason: "Crew is incomplete" };
  if (isSuspended(state, ranger) || isSuspended(state, handler)) {
    return { ok: false, reason: "One of them is suspended" };
  }

  if (kit.balls < 1) {
    return { ok: false, reason: "They need Poké Balls to bring anything back" };
  }

  if (objective === "explore") {
    if (!canPushOnFrom(state, routeId)) {
      return { ok: false, reason: "The league does not know this ground well enough yet" };
    }
    if (!towardId || !routeById(routeId)?.neighbours.includes(towardId)) {
      return { ok: false, reason: "Nothing to push on to that way" };
    }
    if (isOpen(state, towardId)) return { ok: false, reason: "Already reached" };
  }

  // Whatever is already in hand does not need buying again.
  const owed = kitCost({
    balls: Math.max(0, kit.balls - state.stock.balls),
    potions: Math.max(0, kit.potions - state.stock.potions),
    revives: Math.max(0, kit.revives - state.stock.revives),
    lures: Math.max(0, kit.lures - state.stock.lures),
  });
  if (state.money < owed) return { ok: false, reason: `The kit costs ${owed}` };
  return { ok: true, cost: owed };
}

export function send(
  state: LeagueState,
  crewId: string,
  routeId: string,
  objective: "work" | "explore",
  towardId: string | null,
  kit: Kit,
  party: readonly string[] = [],
): { ok: true } | { ok: false; reason: string } {
  const check = canSend(state, crewId, routeId, objective, towardId, kit);
  if (!check.ok) return check;

  const crew = crewById(state, crewId);
  const handler = crew ? state.trainers[crew.handlerId] : undefined;
  if (!crew || !handler) return { ok: false, reason: "Gone" };

  // Kit already in hand goes first — an objective that paid in Poké Balls
  // should feel like Poké Balls, not like a discount.
  const fromStock: Kit = { balls: 0, potions: 0, revives: 0, lures: 0 };
  for (const k of ["balls", "potions", "revives", "lures"] as const) {
    fromStock[k] = Math.min(state.stock[k], kit[k]);
    state.stock[k] -= fromStock[k];
  }
  const owed = kitCost({
    balls: kit.balls - fromStock.balls,
    potions: kit.potions - fromStock.potions,
    revives: kit.revives - fromStock.revives,
    lures: kit.lures - fromStock.lures,
  });
  // Money changes hands now: they bought the rest before setting off.
  state.money -= owed;

  const taken: string[] = [];
  for (const id of party) {
    if (taken.length >= FIELD.partyMax) break;
    if (!canJoin(state, id, handler.id).ok) continue;
    leaveParty(state, id);
    const c = state.creatures[id];
    if (!c) continue;
    c.role = "field";
    c.trainerId = handler.id;
    c.gymId = null;
    taken.push(id);
  }
  handler.party = taken;

  state.expeditions.push({
    crewId,
    routeId,
    objective,
    towardId: objective === "explore" ? towardId : null,
    kit: { ...kit },
    bought: { ...kit },
    spent: check.cost,
    party: taken,
    progress: 0,
    caught: 0,
    earned: 0,
    hurt: 0,
    log: [],
    pending: null,
    startedAt: state.time,
  });
  return { ok: true };
}

/** Bring a crew home early. They keep what they found; the kit is refunded. */
export function recall(state: LeagueState, crewId: string): void {
  const trip = expeditionOf(state, crewId);
  if (!trip) return;
  finish(state, trip, "recalled");
}

// ---------------------------------------------------------------------------
// Out on the ground
// ---------------------------------------------------------------------------

/** Sim-seconds per round of work for this trip. */
export function roundSeconds(state: LeagueState, trip: Expedition): number {
  const route = routeById(trip.routeId);
  const crew = crewById(state, trip.crewId);
  if (!route || !crew) return Infinity;

  const base = FIELD.baseRoundSeconds + route.levelMax * FIELD.secondsPerRouteLevel;
  // A crew that knows the ground wastes less time on it.
  return base / (1 + competence(crew, route.id) * 0.6);
}

/**
 * How dangerous this trip is, 0..1.
 *
 * The route's own peril, raised by how far the party is out of its depth and
 * lowered by knowing the ground. This is the single risk dial: the Handler's
 * old "stretch" multiplier folded into it, so pushing a young party onto hard
 * ground shows up as *more happening, and more of it going wrong* rather than as
 * a separate number nobody could see.
 */
export function danger(state: LeagueState, trip: Expedition): number {
  const route = routeById(trip.routeId);
  const crew = crewById(state, trip.crewId);
  if (!route || !crew) return 0;

  const party = trip.party
    .map((id) => state.creatures[id])
    .filter((c): c is Creature => c !== undefined);
  const level = party.length > 0 ? Math.min(...party.map((c) => c.level)) : route.levelMin;
  const outOfDepth = Math.max(0, route.levelMin - level) / 20;

  const known = competence(crew, route.id);
  return clamp01((route.peril + outOfDepth) * (1 - known * 0.4) * TRAITS[crew.trait].peril);
}

export function reserveCeiling(state: LeagueState): number {
  return FIELD.reserveCeilingBase + state.gymOrder.length * FIELD.reserveCeilingPerGym;
}

export function reserveCount(state: LeagueState): number {
  let n = 0;
  for (const c of Object.values(state.creatures)) if (c.role === "reserve") n += 1;
  return n;
}

/** Types some trainer on the board could field. */
function fieldableTypes(state: LeagueState): Set<string> {
  const types = new Set<string>();
  for (const t of Object.values(state.trainers)) {
    if (t.kind === "candidate") continue;
    types.add(t.affinity);
  }
  return types;
}

export function usableReserve(state: LeagueState): number {
  const types = fieldableTypes(state);
  let n = 0;
  for (const c of Object.values(state.creatures)) {
    if (c.role !== "reserve") continue;
    if (c.types.some((t) => types.has(t))) n += 1;
  }
  return n;
}

/** Record that this species has actually been found here. */
function note_seen(state: LeagueState, routeId: string, speciesId: string): void {
  const list = state.seen[routeId] ?? [];
  if (!list.includes(speciesId)) state.seen[routeId] = [...list, speciesId];
}

/** What this league has met on this ground. */
export function seenOn(state: LeagueState, routeId: string): string[] {
  return state.seen[routeId] ?? [];
}

/** Species a crew has been told to leave alone on this route. */
export function bannedOn(state: LeagueState, routeId: string): string[] {
  return state.bans[routeId] ?? [];
}

export function toggleBan(state: LeagueState, routeId: string, speciesId: string): void {
  const list = state.bans[routeId] ?? [];
  state.bans[routeId] = list.includes(speciesId)
    ? list.filter((s) => s !== speciesId)
    : [...list, speciesId];
}

/**
 * What could turn up here for this Ranger.
 *
 * Their own type and nothing else — a Grass Ranger is only worth what your Grass
 * gym is worth — filtered by whatever the player has told them to leave alone.
 */
export function catchPool(
  state: LeagueState,
  route: Route,
  type: TypeId,
  ceiling: number,
) {
  const banned = new Set(bannedOn(state, route.id));
  return catalog
    .wildByType(type)
    .filter((s) => minLevelFor(s) <= ceiling && !banned.has(s.slug));
}

/** Draw one creature, at this crew's competence and with this much greed. */
function drawOne(
  state: LeagueState,
  route: Route,
  type: TypeId,
  known: number,
  tilt: number,
): Creature | null {
  const ceiling = route.levelMax + Math.round(known * FIELD.skillLevelBonus);
  const pool = catchPool(state, route, type, ceiling);
  if (pool.length === 0) return null;

  const weights: Record<string, number> = {};
  for (const species of pool) {
    weights[species.slug] = Math.pow(encounterWeight(species), 1 - tilt);
  }
  const species = catalog.get(weighted(state.rng, weights));
  if (!species) return null;

  return makeCreature(state, species, "reserve", {
    level: int(state.rng, route.levelMin, ceiling),
  });
}

export function tickField(state: LeagueState, dt: number, report: TickReport): void {
  if (state.crewOffer.length === 0) rollCrewOffer(state);
  if (state.expeditions.length === 0) return;

  const boxFull = usableReserve(state) >= reserveCeiling(state);

  for (const trip of [...state.expeditions]) {
    const crew = crewById(state, trip.crewId);
    const route = routeById(trip.routeId);
    if (!crew || !route) {
      state.expeditions = state.expeditions.filter((e) => e !== trip);
      continue;
    }

    // A held choice does not stop the work; it just waits, and then the crew
    // decides for themselves.
    if (trip.pending && state.time >= trip.pending.decidesAt) {
      resolveInCharacter(state, trip, crew.trait);
    }

    const { ranger, handler } = crewMembers(state, crew);
    if (!ranger || !handler) {
      finish(state, trip, "returned");
      continue;
    }
    if (isSuspended(state, ranger) || isSuspended(state, handler)) continue;

    trip.progress += dt;
    const needed = roundSeconds(state, trip);
    let guard = 0;

    while (trip.progress >= needed && guard < 8) {
      trip.progress -= needed;
      guard += 1;
      workRound(state, trip, crew, route, boxFull, report);
      if (!state.expeditions.includes(trip)) break;
    }
  }
}

/** One round of work: pay, training, a chance of a find, a chance of an event. */
function workRound(
  state: LeagueState,
  trip: Expedition,
  crew: Crew,
  route: Route,
  boxFull: boolean,
  report: TickReport,
): void {
  const known = competence(crew, route.id);
  const trait = TRAITS[crew.trait];

  // Pay.
  const pay =
    (FIELD.payBase + route.levelMax * FIELD.payPerRouteLevel) *
    trait.pay *
    (route.landmark.effect === "lucrative" && isOpen(state, route.id) ? 1.25 : 1);
  state.money += pay;
  trip.earned += pay;
  report.earned += pay;

  // Training. The route caps what it can teach, as it always has.
  for (const id of trip.party) {
    const c = state.creatures[id];
    if (!c || c.level >= route.levelMax) continue;
    const became = gainXp(state, c, FIELD.xpPerRound);
    if (became) {
      report.evolutions.push(became);
      log(state, "evolve", "log.evolvedOnRoute", { name: became, route: route.id });
    }
  }

  // A find, if the Ranger has a ball for it and there is room in the box.
  const findChance =
    (FIELD.findChanceGreen + (FIELD.findChanceSeasoned - FIELD.findChanceGreen) * known) *
    trait.find;

  if (trip.kit.balls > 0 && !boxFull && chance(state.rng, findChance)) {
    const spendLure = trip.kit.lures > 0 && chance(state.rng, 0.35);
    if (spendLure) trip.kit.lures -= 1;

    const tilt = Math.min(
      0.9,
      known * FIELD.rarityTilt * trait.rarity + (spendLure ? FIELD.lureTilt : 0),
    );
    const ranger = state.trainers[crew.rangerId];
    const caught = ranger ? drawOne(state, route, ranger.affinity, known, tilt) : null;

    if (caught) {
      trip.kit.balls -= 1;
      trip.caught += 1;
      note_seen(state, route.id, caught.speciesId);
      ranger && (ranger.experience += 1);
      report.caught.push(caught.id);
    }
  }

  // Sheltered ground lets them recover between rounds.
  if (route.landmark.effect === "sheltered") {
    trip.hurt = clamp01(trip.hurt - FIELD.shelteredRecovery);
  }

  if (chance(state.rng, FIELD.eventChance)) {
    fireEvent(state, trip, crew, route, report);
    if (!state.expeditions.includes(trip)) return;
  }

  // They come home when the balls run out or they cannot carry on.
  if (trip.kit.balls <= 0 || trip.hurt >= 1) {
    finish(state, trip, trip.hurt >= 1 ? "beaten" : "returned");
  }
}

export { FIELD, KIT };

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * Something happens.
 *
 * Five kinds, and each answers to exactly one line of the kit — which is what
 * makes outfitting an allocation rather than a slider. Cut the Potions and
 * hazards start costing you the trip.
 *
 * Most resolve themselves and get reported. A few hold a real choice, and if the
 * player never answers, the crew decides in character. That default has to be
 * defensible: an idle game that punishes you for sleeping is punishing you for
 * playing it the way it is built.
 */
function fireEvent(
  state: LeagueState,
  trip: Expedition,
  crew: Crew,
  route: Route,
  report: TickReport,
): void {
  const risk = danger(state, trip);
  const roll = range(state.rng, 0, 1);

  // The more dangerous the ground, the more of what happens is trouble.
  if (roll < risk * 0.45) return trouble(state, trip, crew, route, report);
  if (roll < risk * 0.9) return hazard(state, trip, route);
  if (roll < risk * 0.9 + 0.25) return windfall(state, trip, route);
  if (trip.objective === "explore" && chance(state.rng, 0.35)) {
    return discovery(state, trip);
  }
  return encounter(state, trip, crew, route);
}

function note(
  trip: Expedition,
  kind: FieldEventKind,
  key: string,
  params: Record<string, string | number>,
  at: number,
): void {
  trip.log.push({ kind, key, params, at });
  if (trip.log.length > 24) trip.log.shift();
}

type FieldEventKind = Expedition["log"][number]["kind"];

/** The ground hurts them. Potions are what it costs, if they brought any. */
function hazard(state: LeagueState, trip: Expedition, route: Route): void {
  if (trip.kit.potions > 0) {
    trip.kit.potions -= 1;
    trip.hurt = clamp01(trip.hurt + FIELD.hazardHurtSalved);
    note(trip, "hazard", "ev.hazardSalved", { route: route.id }, state.time);
    return;
  }
  trip.hurt = clamp01(trip.hurt + FIELD.hazardHurt);
  note(trip, "hazard", "ev.hazardRaw", { route: route.id }, state.time);
}

/** Something fights back. A Revive is the difference between a scare and a trip ended. */
function trouble(
  state: LeagueState,
  trip: Expedition,
  crew: Crew,
  route: Route,
  report: TickReport,
): void {
  if (trip.kit.revives > 0) {
    trip.kit.revives -= 1;
    trip.hurt = clamp01(trip.hurt + 0.1);
    note(trip, "trouble", "ev.troubleSaved", { route: route.id }, state.time);
    return;
  }
  trip.hurt = clamp01(trip.hurt + FIELD.troubleHurt);
  note(trip, "trouble", "ev.troubleRaw", { route: route.id }, state.time);
  report.beaten.push(crewName(state, crew));
}

/** A cache, a haul, a favour returned. */
function windfall(state: LeagueState, trip: Expedition, route: Route): void {
  const purse = Math.round(range(state.rng, 400, 1400) * (1 + route.levelMax / 20));
  state.money += purse;
  trip.earned += purse;
  note(trip, "windfall", "ev.windfall", { route: route.id, n: purse }, state.time);
}

/**
 * Something notable is here — and taking it costs balls they may not have.
 *
 * This is the event that most wants a choice, and it is the clearest case for
 * the trait as a default: a Reckless crew spends the last of the kit on it, a
 * Meticulous one leaves it and comes home with what they have.
 */
function encounter(
  state: LeagueState,
  trip: Expedition,
  crew: Crew,
  route: Route,
): void {
  const ranger = state.trainers[crew.rangerId];
  if (!ranger) return;

  const known = competence(crew, route.id);
  const found = drawOne(state, route, ranger.affinity, known, 0.85);
  if (!found) return;

  const cost = Math.min(trip.kit.balls, int(state.rng, 2, 5));
  if (cost <= 0) {
    note(trip, "encounter", "ev.encounterNoBalls", { name: displayName(found), route: route.id }, state.time);
    delete state.creatures[found.id];
    return;
  }

  trip.pending = {
    id: `enc_${found.id}`,
    prompt: "ev.choicePrompt",
    promptParams: { name: displayName(found), route: route.id, n: cost },
    options: [
      { id: `take:${found.id}:${cost}`, label: "ev.choiceTake", labelParams: { n: cost } },
      { id: "leave", label: "ev.choiceLeave" },
    ],
    decidesAt: state.time + FIELD.choiceWindow,
  };
  note(trip, "encounter", "ev.encounter", { name: displayName(found), route: route.id }, state.time);
}

/** Progress toward the ground beyond. */
function discovery(state: LeagueState, trip: Expedition): void {
  const toward = trip.towardId ? routeById(trip.towardId) : undefined;
  if (!toward) return;
  note(trip, "discovery", "ev.wayThrough", { route: toward.id }, state.time);
  trip.progress += roundSeconds(state, trip) * 2;
}

/** Answer a held choice. */
export function decide(
  state: LeagueState,
  crewId: string,
  optionId: string,
): { ok: true } | { ok: false; reason: string } {
  const trip = expeditionOf(state, crewId);
  if (!trip?.pending) return { ok: false, reason: "Nothing waiting" };
  apply(state, trip, optionId);
  trip.pending = null;
  return { ok: true };
}

/** What the crew does when nobody answers. */
function resolveInCharacter(state: LeagueState, trip: Expedition, trait: CrewTrait): void {
  const pending = trip.pending;
  if (!pending) return;
  const bold = TRAITS[trait].decides === "bold";
  const choice = bold ? pending.options[0] : pending.options[pending.options.length - 1];
  apply(state, trip, choice?.id ?? "leave");
  trip.pending = null;
}

function apply(state: LeagueState, trip: Expedition, optionId: string): void {
  if (!optionId.startsWith("take:")) {
    const id = trip.pending?.id.replace("enc_", "");
    if (id && state.creatures[id]) delete state.creatures[id];
    return;
  }
  const [, creatureId, costText] = optionId.split(":");
  const cost = Number(costText ?? 0);
  if (!creatureId || !state.creatures[creatureId]) return;

  if (trip.kit.balls < cost) {
    delete state.creatures[creatureId];
    note(trip, "encounter", "ev.notEnough", {}, state.time);
    return;
  }
  trip.kit.balls -= cost;
  trip.caught += 1;
  note(trip, "encounter", "ev.tookIt", { n: cost }, state.time);
}

// ---------------------------------------------------------------------------
// Coming home
// ---------------------------------------------------------------------------

/**
 * The trip ends.
 *
 * Whatever is left of the kit is sold on, the crew's competence on this ground
 * grows, and if they were pushing onward the way is open. The party comes home
 * to the box — training a creature should never cost you the creature.
 */
function finish(
  state: LeagueState,
  trip: Expedition,
  how: "returned" | "beaten" | "recalled",
): void {
  const crew = crewById(state, trip.crewId);
  const route = routeById(trip.routeId);
  state.expeditions = state.expeditions.filter((e) => e !== trip);

  // Unspent kit is sold on, at a loss. Carrying it home in full would make
  // over-buying free, and the size of the kit is meant to be the decision.
  const refund = refundFor(trip.kit);
  if (refund > 0) state.money += refund;

  const handler = crew ? state.trainers[crew.handlerId] : undefined;
  if (handler) {
    for (const id of handler.party) {
      const c = state.creatures[id];
      if (c) {
        c.role = "reserve";
        c.trainerId = null;
      }
    }
    handler.party = [];
  }

  if (!crew || !route) return;

  // A trip that ran its course teaches the crew this ground. One cut short
  // teaches them less, which is what makes recalling them a real cost.
  const learned =
    how === "returned"
      ? FIELD.competencePerTrip
      : FIELD.competencePerTrip * (how === "beaten" ? 0.5 : 0.25);
  crew.familiar[route.id] = clamp01(competence(crew, route.id) + learned);

  if (how === "returned") {
    state.known[route.id] = (state.known[route.id] ?? 0) + 1;
    if (route.landmark.effect === "mapped") {
      state.known[route.id] = (state.known[route.id] ?? 0) + 1;
    }
  }

  if (how === "returned" && trip.objective === "explore" && trip.towardId) {
    open(state, trip.towardId);
  }

  log(
    state,
    "catch",
    how === "beaten" ? "log.crewBeaten" : "log.crewHome",
    { name: crewName(state, crew), route: route.id, n: trip.caught },
  );
}

/** Reach a new place. Its resident and its landmark come with it. */
export function open(state: LeagueState, routeId: string): void {
  if (state.explored.includes(routeId)) return;
  const route = routeById(routeId);
  if (!route) return;

  state.explored.push(routeId);
  const species = catalog.get(route.resident);
  log(
    state,
    "scout",
    "log.reached",
    { route: route.id, resident: species?.name ?? "" },
  );
}

/** The ground a league starts knowing. */
export function seedMap(state: LeagueState): void {
  for (const route of startingRoutes()) open(state, route.id);
  rollCrewOffer(state);

  // A thin opening bench, drawn from the ground they already know.
  const open3 = openRoutes(state);
  for (let i = 0; i < SCOUTING.startingBench; i++) {
    const route = open3[i % Math.max(1, open3.length)];
    if (!route) break;
    const type = weighted(state.rng, route.supply) as TypeId;
    const pool = catchPool(state, route, type, route.levelMax);
    if (pool.length === 0) continue;
    makeCreature(state, pick(state.rng, pool), "reserve", {
      level: int(state.rng, route.levelMin, route.levelMax),
    });
  }
}

/** Creatures a Handler could take out, best first. */
export function trainableFor(state: LeagueState, crew: Crew, route: Route): Creature[] {
  return candidatesFor(state, crew.handlerId, true)
    .filter((o) => o.ok && o.creature.level < route.levelMax)
    .map((o) => o.creature)
    .sort((a, b) => b.power - a.power);
}
