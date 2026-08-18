import { catalog, encounterWeight, minLevelFor } from "../../data/catalog.js";
import { ROUTES, routeById, routesUpTo } from "../../data/routes.js";
import { CATCHER, EVOLVER, FIELD, SCOUTING, STAFF } from "../constants.js";
import { makeCreature, makeTrainer } from "../factory.js";
import { chance, int, pick, weighted } from "../rng.js";
import { catcherSlots, evolverSlots, hasSurvey } from "./facilities.js";
import { gainXp } from "./growth.js";
import { isSuspended } from "./morale.js";
import { canJoin, leaveParty, partyCapOf } from "./party.js";
import { displayName } from "./wave.js";
import { log } from "../tick.js";
import { TYPES } from "../types.js";
import type {
  Creature,
  FieldRole,
  LeagueState,
  Posting,
  Route,
  TickReport,
  Trainer,
  TypeId,
} from "../types.js";

/**
 * Field staff: Catchers, and Evolvers.
 *
 * Both are a trainer standing on a route with their own party, which is why
 * they share a module and a `Posting`. What differs is what the route gives
 * back.
 *
 *   Catchers  bring creatures *in*. One partner, and the ground has to be
 *             within that partner's reach.
 *   Evolvers  bring the ones they took back *stronger*, and paid. Up to four,
 *             and the ground may be deliberately over their heads.
 *
 * Three rules hold for both:
 *
 *   - **type-bound, like everyone else.** A Fire Catcher works with Fire
 *     creatures. Field staff used to be the one place in the league where type
 *     did not matter, which made them the one place with no casting decision.
 *   - **the route caps them.** Route work levels a creature only to the top of
 *     the route's band, so outgrowing a posting is the signal to move on.
 *   - **fatigue, never career.** Routes are the safe posting. A shift, then a
 *     break — the duty cycle is what paces the whole system.
 */

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Routes the league has earned access to. */
export function eligibleRoutes(state: LeagueState): Route[] {
  return routesUpTo(state.peakRenown);
}

/** Intel is a purchase, made before committing anyone to a route. */
export function hasIntel(state: LeagueState, routeId: string): boolean {
  return state.routeIntel[routeId] === true || hasSurvey(state);
}

export function intelCost(routeId: string): number {
  const route = routeById(routeId);
  return route ? Math.round(route.cost * CATCHER.intelCostFactor) : 0;
}

export function buyIntel(
  state: LeagueState,
  routeId: string,
): { ok: true } | { ok: false; reason: string } {
  if (hasIntel(state, routeId)) return { ok: false, reason: "Already surveyed" };
  const cost = intelCost(routeId);
  if (state.money < cost) return { ok: false, reason: `Costs ${cost}` };
  state.money -= cost;
  state.routeIntel[routeId] = true;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Hiring — the offer, not the catalogue
// ---------------------------------------------------------------------------

/**
 * The level field staff arrive with.
 *
 * Pegged to the easiest ground the league has open, so a new hire can always be
 * put to work immediately, and rising with renown so late hires are not useless.
 */
export function fieldStartingLevel(state: LeagueState): number {
  const open = eligibleRoutes(state);
  const floor = open.length > 0 ? Math.min(...open.map((r) => r.levelMin)) : 1;
  return Math.max(floor, Math.round((state.peakRenown / 1000) * CATCHER.levelPerThousandRenown));
}

export function fieldStaff(state: LeagueState, role: FieldRole): Trainer[] {
  return Object.values(state.trainers).filter((t) => t.kind === role);
}

export function catchers(state: LeagueState): Trainer[] {
  return fieldStaff(state, "catcher");
}

export function evolvers(state: LeagueState): Trainer[] {
  return fieldStaff(state, "evolver");
}

export function slotsAvailable(state: LeagueState, role: FieldRole): number {
  return role === "catcher"
    ? CATCHER.baseSlots + catcherSlots(state)
    : EVOLVER.baseSlots + evolverSlots(state);
}

export function hireCost(state: LeagueState, role: FieldRole): number {
  const n = fieldStaff(state, role).length;
  return Math.round(
    role === "catcher"
      ? CATCHER.hireCostBase * CATCHER.hireCostGrowth ** n
      : EVOLVER.hireCostBase * EVOLVER.hireCostGrowth ** n,
  );
}

/** Draw a fresh set of types for a role. Distinct, so it is a real choice. */
export function rollFieldOffer(state: LeagueState, role: FieldRole): void {
  const pool = [...TYPES];
  const chosen: TypeId[] = [];
  while (chosen.length < FIELD.offerSize && pool.length > 0) {
    const [taken] = pool.splice(int(state.rng, 0, pool.length - 1), 1);
    if (taken) chosen.push(taken);
  }
  state.fieldOffer[role] = chosen;
}

export function fieldOffer(state: LeagueState, role: FieldRole): TypeId[] {
  if (state.fieldOffer[role].length === 0) rollFieldOffer(state, role);
  return state.fieldOffer[role];
}

export function canHire(
  state: LeagueState,
  role: FieldRole,
): { ok: true; cost: number } | { ok: false; reason: string } {
  if (fieldStaff(state, role).length >= slotsAvailable(state, role)) {
    const where = role === "catcher" ? "Scouting Office" : "Training Grounds";
    return { ok: false, reason: `No slots left — upgrade the ${where}` };
  }
  const cost = hireCost(state, role);
  if (state.money < cost) return { ok: false, reason: `Costs ${cost}` };
  return { ok: true, cost };
}

/**
 * Hire one of the types currently on offer.
 *
 * Refusing a type you cannot use is a real cost, because the offer redraws and
 * the next one may be worse — which is the trade-off free choice never had.
 */
export function hire(
  state: LeagueState,
  role: FieldRole,
  type: TypeId,
): { ok: true; trainerId: string } | { ok: false; reason: string } {
  const check = canHire(state, role);
  if (!check.ok) return check;
  if (!fieldOffer(state, role).includes(type)) {
    return { ok: false, reason: "Not on offer" };
  }

  state.money -= check.cost;
  const cap = role === "catcher" ? 1 : EVOLVER.partyMax;
  // They arrive with a working partner, not a hatchling. A level 1 signature
  // meant a Catcher could never be posted anywhere at all — every route has a
  // floor, and theirs was below all of them.
  const trainer = makeTrainer(state, type, role, {
    partyCap: cap,
    level: fieldStartingLevel(state),
  });
  trainer.salary =
    STAFF.baseSalaryPerHour *
    (role === "catcher" ? CATCHER.salaryFactor : EVOLVER.salaryFactor);

  // Their signature creature is their first field partner, not a defender.
  for (const id of trainer.party) {
    const c = state.creatures[id];
    if (c) c.role = "field";
  }

  rollFieldOffer(state, role);
  return { ok: true, trainerId: trainer.id };
}

/** Redraw without hiring. Costs the offer you had. */
export function passOnOffer(state: LeagueState, role: FieldRole): void {
  rollFieldOffer(state, role);
}

// ---------------------------------------------------------------------------
// Crews
// ---------------------------------------------------------------------------

export function crewOf(state: LeagueState, trainerId: string): Creature[] {
  const trainer = state.trainers[trainerId];
  if (!trainer) return [];
  return trainer.party
    .map((id) => state.creatures[id])
    .filter((c): c is Creature => c !== undefined);
}

/**
 * Whether this creature can join this field trainer's crew.
 *
 * Delegates the type rule to `canJoin`, so field staff obey exactly the same
 * casting rules as a Gym Leader — one place decides what "their type" means.
 */
export function canCrew(
  state: LeagueState,
  creatureId: string,
  trainerId: string,
): { ok: true } | { ok: false; reason: string } {
  const trainer = state.trainers[trainerId];
  if (!trainer || (trainer.kind !== "catcher" && trainer.kind !== "evolver")) {
    return { ok: false, reason: "Not field staff" };
  }
  if (postingFor(state, trainerId)) {
    return { ok: false, reason: "Recall them before changing the crew" };
  }
  return canJoin(state, creatureId, trainerId);
}

export function addToCrew(
  state: LeagueState,
  creatureId: string,
  trainerId: string,
): { ok: true } | { ok: false; reason: string } {
  const check = canCrew(state, creatureId, trainerId);
  if (!check.ok) return check;

  const trainer = state.trainers[trainerId];
  const creature = state.creatures[creatureId];
  if (!trainer || !creature) return { ok: false, reason: "Gone" };

  leaveParty(state, creatureId);
  trainer.party.push(creatureId);
  creature.trainerId = trainerId;
  creature.gymId = null;
  // `field` rather than `party`, so auto-fill can never quietly pull someone
  // off a route to plug a gym. A crew is a commitment.
  creature.role = "field";
  return { ok: true };
}

export function removeFromCrew(state: LeagueState, creatureId: string): void {
  for (const trainer of Object.values(state.trainers)) {
    if (trainer.kind !== "catcher" && trainer.kind !== "evolver") continue;
    if (!trainer.party.includes(creatureId)) continue;
    if (postingFor(state, trainer.id)) return;
    trainer.party = trainer.party.filter((id) => id !== creatureId);
  }
  const creature = state.creatures[creatureId];
  if (creature) {
    creature.role = "reserve";
    creature.trainerId = null;
  }
}

// ---------------------------------------------------------------------------
// Postings
// ---------------------------------------------------------------------------

export function postingFor(state: LeagueState, trainerId: string): Posting | undefined {
  return state.postings.find((p) => p.trainerId === trainerId);
}

export function postingOnRoute(state: LeagueState, routeId: string): Posting | undefined {
  return state.postings.find((p) => p.routeId === routeId);
}

/** The crew's level, as the route judges it: the weakest one there. */
export function crewLevel(state: LeagueState, trainerId: string): number {
  const crew = crewOf(state, trainerId);
  if (crew.length === 0) return 0;
  return Math.min(...crew.map((c) => c.level));
}

/**
 * How far under a route's floor this crew is standing.
 *
 * Zero for a Catcher, always — they refuse ground they cannot handle. For an
 * Evolver it is the whole mechanic: the stretch pays better, teaches faster,
 * and is how a party comes back beaten.
 */
export function stretchOf(state: LeagueState, posting: Posting): number {
  const route = routeById(posting.routeId);
  if (!route) return 0;
  return Math.max(0, route.levelMin - crewLevel(state, posting.trainerId));
}

export function canPost(
  state: LeagueState,
  routeId: string,
  trainerId: string,
): { ok: true } | { ok: false; reason: string } {
  const route = routeById(routeId);
  if (!route) return { ok: false, reason: "Route unknown" };
  if (!eligibleRoutes(state).some((r) => r.id === routeId)) {
    return { ok: false, reason: "Route not open yet" };
  }
  if (postingOnRoute(state, routeId)) {
    return { ok: false, reason: "Already being worked" };
  }

  const trainer = state.trainers[trainerId];
  if (!trainer || (trainer.kind !== "catcher" && trainer.kind !== "evolver")) {
    return { ok: false, reason: "Not field staff" };
  }
  if (postingFor(state, trainerId)) return { ok: false, reason: "Already posted" };

  const crew = crewOf(state, trainerId);
  if (crew.length === 0) return { ok: false, reason: "Nobody in their crew" };

  const level = Math.min(...crew.map((c) => c.level));
  if (trainer.kind === "catcher") {
    if (level < route.levelMin) {
      return { ok: false, reason: `Needs Lv${route.levelMin} to work here` };
    }
  } else if (level < route.levelMin - EVOLVER.maxStretch) {
    return {
      ok: false,
      reason: `Lv${route.levelMin - EVOLVER.maxStretch} at the very least — this is far over their heads`,
    };
  }
  return { ok: true };
}

export function post(
  state: LeagueState,
  routeId: string,
  trainerId: string,
): { ok: true } | { ok: false; reason: string } {
  const check = canPost(state, routeId, trainerId);
  if (!check.ok) return check;

  const trainer = state.trainers[trainerId];
  if (!trainer) return { ok: false, reason: "Gone" };

  state.postings.push({
    routeId,
    trainerId,
    role: trainer.kind === "evolver" ? "evolver" : "catcher",
    progress: 0,
    caught: 0,
    earned: 0,
    beaten: 0,
    resting: false,
  });
  return { ok: true };
}

/** End a posting. The crew stays together — you built that team. */
export function recall(state: LeagueState, trainerId: string): void {
  state.postings = state.postings.filter((p) => p.trainerId !== trainerId);
}

// ---------------------------------------------------------------------------
// The work
// ---------------------------------------------------------------------------

/** How far through the route's band this crew has come, 0..1. */
export function throughBand(state: LeagueState, posting: Posting): number {
  const route = routeById(posting.routeId);
  if (!route) return 0;
  const band = Math.max(1, route.levelMax - route.levelMin);
  return clamp01((crewLevel(state, posting.trainerId) - route.levelMin) / band);
}

/** Sim-seconds this posting needs per round. */
export function roundSeconds(state: LeagueState, posting: Posting): number {
  const route = routeById(posting.routeId);
  if (!route) return Infinity;

  const base =
    posting.role === "catcher"
      ? CATCHER.baseCatchSeconds + route.levelMax * CATCHER.secondsPerRouteLevel
      : EVOLVER.baseRoundSeconds + route.levelMax * EVOLVER.secondsPerRouteLevel;

  // A crew that has outgrown the ground works it fast — and is telling you to
  // move them on.
  return base / (1 + throughBand(state, posting) * CATCHER.partnerSpeedBonus);
}

/** Fatigue this posting costs its crew per sim-second. */
export function fatigueRate(state: LeagueState, posting: Posting): number {
  const through = throughBand(state, posting);
  if (posting.role === "catcher") {
    return (
      CATCHER.fatiguePerSecondAtFloor *
      (1 - through * (1 - CATCHER.fatigueAtCeiling))
    );
  }
  const stretch = stretchOf(state, posting);
  return (
    EVOLVER.fatiguePerSecondAtFloor *
    (1 - through * (1 - EVOLVER.fatigueAtCeiling)) *
    (1 + stretch * EVOLVER.fatiguePerStretch)
  );
}

/** The level a crew can reach working this route, and no further. */
export function ceilingFor(routeId: string): number {
  return routeById(routeId)?.levelMax ?? 0;
}

export function reserveCount(state: LeagueState): number {
  let n = 0;
  for (const c of Object.values(state.creatures)) {
    if (c.role === "reserve") n += 1;
  }
  return n;
}

export function reserveCeiling(state: LeagueState): number {
  return (
    CATCHER.reserveCeilingBase + state.gymOrder.length * CATCHER.reserveCeilingPerGym
  );
}

/** Types some trainer on the board could actually field. */
function fieldableTypes(state: LeagueState): Set<string> {
  const types = new Set<string>();
  for (const t of Object.values(state.trainers)) {
    if (t.kind === "candidate") continue;
    types.add(t.affinity);
  }
  return types;
}

/**
 * Idle creatures the league could actually put in a party.
 *
 * The ceiling counts *these*, not everything in the box. Counting everything
 * deadlocked the game: work a Fire route with a Bug board and the box fills with
 * creatures no gym can field, which stops the only thing that could have brought
 * in the ones you needed.
 */
export function usableReserve(state: LeagueState): number {
  const types = fieldableTypes(state);
  let n = 0;
  for (const c of Object.values(state.creatures)) {
    if (c.role !== "reserve") continue;
    if (c.types.some((t) => types.has(t))) n += 1;
  }
  return n;
}

/**
 * Let go of spillover once the box is genuinely overrun.
 *
 * A hard backstop so an unattended league cannot grow a roster of hundreds. Only
 * ever releases a creature nobody has invested anything in.
 */
function releaseSpillover(state: LeagueState, report: TickReport): void {
  const hard = reserveCeiling(state) * CATCHER.hardCeilingFactor;
  if (reserveCount(state) <= hard) return;

  const types = fieldableTypes(state);
  const spare = Object.values(state.creatures)
    .filter(
      (c) =>
        c.role === "reserve" &&
        !c.pinned &&
        c.bond <= 0 &&
        c.wins === 0 &&
        !c.types.some((t) => types.has(t)),
    )
    .sort((a, b) => a.level - b.level);

  let over = reserveCount(state) - hard;
  for (const c of spare) {
    if (over <= 0) break;
    delete state.creatures[c.id];
    report.released.push(displayName(c));
    over -= 1;
  }
}

/**
 * Draw one creature from a route's supply distribution.
 *
 * The route decides which *type* turns up, the encounter rules decide which
 * species within it. That is what keeps starters and legendaries out of the
 * wild and fully evolved forms rare.
 */
export function drawFrom(state: LeagueState, route: Route): Creature | null {
  const type = weighted(state.rng, route.supply) as TypeId;
  const pool = catalog
    .wildByType(type)
    .filter((s) => minLevelFor(s) <= route.levelMax);
  if (pool.length === 0) return null;

  const weights: Record<string, number> = {};
  for (const species of pool) weights[species.slug] = encounterWeight(species);

  const slug = weighted(state.rng, weights);
  const species = catalog.get(slug);
  if (!species) return null;

  return makeCreature(state, species, "reserve", {
    level: int(state.rng, route.levelMin, route.levelMax),
  });
}

export function tickField(state: LeagueState, dt: number, report: TickReport): void {
  if (state.postings.length === 0) return;

  releaseSpillover(state, report);
  const boxFull = usableReserve(state) >= reserveCeiling(state);

  for (const posting of [...state.postings]) {
    const trainer = state.trainers[posting.trainerId];
    const crew = crewOf(state, posting.trainerId);
    if (!trainer || crew.length === 0) {
      state.postings = state.postings.filter((p) => p !== posting);
      continue;
    }
    if (isSuspended(state, trainer)) continue;

    const tiredAt = posting.role === "catcher" ? CATCHER.tiredAt : EVOLVER.tiredAt;
    const restedAt = posting.role === "catcher" ? CATCHER.rested : EVOLVER.rested;
    const worst = Math.max(...crew.map((c) => c.fatigue));

    // A shift, then a break. The hysteresis is what makes this a duty cycle
    // rather than a stall.
    if (posting.resting) {
      if (worst <= restedAt) posting.resting = false;
      continue;
    }
    if (worst >= tiredAt) {
      posting.resting = true;
      continue;
    }
    // Catchers with nowhere to put anyone idle; an Evolver is still training.
    if (posting.role === "catcher" && boxFull) continue;

    posting.progress += dt;
    const wear = fatigueRate(state, posting) * dt;
    for (const c of crew) c.fatigue = clamp01(c.fatigue + wear);

    const needed = roundSeconds(state, posting);
    let guard = 0;
    while (posting.progress >= needed && guard < 8) {
      posting.progress -= needed;
      guard += 1;
      const route = routeById(posting.routeId);
      if (!route) break;

      if (posting.role === "catcher") {
        workCatch(state, posting, route, crew, report);
      } else {
        workTraining(state, posting, route, trainer, crew, report);
      }
    }
  }
}

function workCatch(
  state: LeagueState,
  posting: Posting,
  route: Route,
  crew: Creature[],
  report: TickReport,
): void {
  const caught = drawFrom(state, route);
  if (caught) {
    posting.caught += 1;
    report.caught.push(caught.id);
  }
  teach(state, posting, route, crew, CATCHER.xpPerCatch, report);
}

/**
 * A training round.
 *
 * Pay and experience both rise with the stretch — how far under the route's
 * floor the crew is standing — and so does the chance of being beaten. That is
 * the whole decision: push a young party onto ground it cannot really hold,
 * and it grows fast until the day it does not come back clean.
 */
function workTraining(
  state: LeagueState,
  posting: Posting,
  route: Route,
  trainer: Trainer,
  crew: Creature[],
  report: TickReport,
): void {
  const stretch = stretchOf(state, posting);

  const pay =
    (EVOLVER.payBase + route.levelMax * EVOLVER.payPerRouteLevel) *
    (1 + stretch * EVOLVER.payPerStretch);
  state.money += pay;
  posting.earned += pay;
  report.earned += pay;

  const xp = EVOLVER.xpPerRound * (1 + stretch * EVOLVER.xpPerStretch);
  teach(state, posting, route, crew, xp, report);

  if (stretch > 0 && chance(state.rng, stretch * EVOLVER.beatenChancePerStretch)) {
    posting.beaten += 1;
    for (const c of crew) c.fatigue = clamp01(c.fatigue + EVOLVER.beatenFatigue);
    trainer.morale = Math.max(0, trainer.morale - EVOLVER.beatenMorale);
    report.beaten.push(trainer.name);
    log(state, "wave", `${trainer.name}'s party came back beaten from ${route.name}.`);
  }
}

/** Route work levels a crew only as far as the route goes. */
function teach(
  state: LeagueState,
  posting: Posting,
  route: Route,
  crew: Creature[],
  xp: number,
  report: TickReport,
): void {
  const ceiling = ceilingFor(posting.routeId);
  for (const c of crew) {
    if (c.level >= ceiling) continue;
    const became = gainXp(state, c, xp);
    if (became) {
      report.evolutions.push(became);
      log(state, "evolve", `${became} evolved out on ${route.name}.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Opening position
// ---------------------------------------------------------------------------

/**
 * The creatures a league opens with.
 *
 * Drawn from the starting routes, so the opening bench is made of the same
 * things a Catcher would actually bring back.
 */
export function seedBench(state: LeagueState): void {
  const starters = routesUpTo(0);
  for (let i = 0; i < SCOUTING.startingBench; i++) {
    const route = starters[i % Math.max(1, starters.length)];
    if (!route) break;
    drawFrom(state, route);
  }
  rollFieldOffer(state, "catcher");
  rollFieldOffer(state, "evolver");
}

/** Every route the league knows about, for the intel screen. */
export function knownRoutes(state: LeagueState): Route[] {
  return ROUTES.filter((r) => hasIntel(state, r.id));
}

export { partyCapOf, pick };
