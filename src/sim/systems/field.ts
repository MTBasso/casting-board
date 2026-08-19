import { catalog, encounterWeight, minLevelFor } from "../../data/catalog.js";
import { ROUTES, routeById, routesUpTo } from "../../data/routes.js";
import { RANGER, HANDLER, FIELD, SCOUTING, STAFF } from "../constants.js";
import { makeCreature, makeTrainer } from "../factory.js";
import { chance, int, pick, weighted } from "../rng.js";
import { rangerSlots, handlerSlots, hasSurvey } from "./facilities.js";
import { gainXp } from "./growth.js";
import { isSuspended } from "./morale.js";
import { canJoin, candidatesFor, leaveParty, partyCapOf } from "./party.js";
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
 * Field staff: Rangers, and Handlers.
 *
 * Both are a trainer standing on a route with their own party, which is why
 * they share a module and a `Posting`. What differs is what the route gives
 * back.
 *
 *   Rangers  bring creatures *in*. One partner, and the ground has to be
 *             within that partner's reach.
 *   Handlers  bring the ones they took back *stronger*, and paid. Up to four,
 *             and the ground may be deliberately over their heads.
 *
 * Three rules hold for both:
 *
 *   - **type-bound, like everyone else.** A Fire Ranger works with Fire
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
  return route ? Math.round(route.cost * RANGER.intelCostFactor) : 0;
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
  return Math.max(floor, Math.round((state.peakRenown / 1000) * RANGER.levelPerThousandRenown));
}

export function fieldStaff(state: LeagueState, role: FieldRole): Trainer[] {
  return Object.values(state.trainers).filter((t) => t.kind === role);
}

export function rangers(state: LeagueState): Trainer[] {
  return fieldStaff(state, "ranger");
}

export function handlers(state: LeagueState): Trainer[] {
  return fieldStaff(state, "handler");
}

export function slotsAvailable(state: LeagueState, role: FieldRole): number {
  return role === "ranger"
    ? RANGER.baseSlots + rangerSlots(state)
    : HANDLER.baseSlots + handlerSlots(state);
}

export function hireCost(state: LeagueState, role: FieldRole): number {
  const n = fieldStaff(state, role).length;
  return Math.round(
    role === "ranger"
      ? RANGER.hireCostBase * RANGER.hireCostGrowth ** n
      : HANDLER.hireCostBase * HANDLER.hireCostGrowth ** n,
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
    const where = role === "ranger" ? "Scouting Office" : "Training Grounds";
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
  // A Ranger works alone. Their job is to find creatures, not to train them —
  // pairing them with a partner meant every Ranger tied up a creature that a
  // gym could have fielded, and gave the role a training function it was
  // explicitly not supposed to have.
  const cap = role === "ranger" ? 0 : HANDLER.partyMax;
  // They arrive with a working partner, not a hatchling. A level 1 signature
  // meant a Ranger could never be posted anywhere at all — every route has a
  // floor, and theirs was below all of them.
  const trainer = makeTrainer(state, type, role, {
    partyCap: cap,
    level: fieldStartingLevel(state),
  });
  trainer.salary =
    STAFF.baseSalaryPerHour *
    (role === "ranger" ? RANGER.salaryFactor : HANDLER.salaryFactor);

  if (role === "ranger") {
    // Even the signature creature goes to the box: a Ranger travels light.
    for (const id of trainer.party) {
      const c = state.creatures[id];
      if (c) {
        c.role = "reserve";
        c.trainerId = null;
      }
    }
    trainer.party = [];
    trainer.signatureId = "";
  } else {
    for (const id of trainer.party) {
      const c = state.creatures[id];
      if (c) c.role = "field";
    }
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
  if (!trainer || (trainer.kind !== "ranger" && trainer.kind !== "handler")) {
    return { ok: false, reason: "Not field staff" };
  }
  if (postingFor(state, trainerId)) {
    return { ok: false, reason: "Recall them before changing the crew" };
  }
  // A trainer's signature creature is welded to them and cannot be borrowed.
  const owner = state.creatures[creatureId]?.trainerId;
  if (owner && state.trainers[owner]?.signatureId === creatureId) {
    return { ok: false, reason: "Their trainer's own partner" };
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
    if (trainer.kind !== "ranger" && trainer.kind !== "handler") continue;
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

/**
 * What is happening on a route right now.
 *
 * A route holds one Ranger *and* one Handler at a time. They are doing
 * different things on the same ground — one is looking for creatures, the other
 * is training the ones they brought — and making them compete for the same slot
 * meant Handlers, who stay until recalled, quietly squeezed Rangers off the map
 * entirely: eight Rangers managed ten shifts each across sixty hours.
 */
export function postingsOnRoute(state: LeagueState, routeId: string): Posting[] {
  return state.postings.filter((p) => p.routeId === routeId);
}

export function postingOnRoute(
  state: LeagueState,
  routeId: string,
  role?: FieldRole,
): Posting | undefined {
  return state.postings.find(
    (p) => p.routeId === routeId && (role === undefined || p.role === role),
  );
}

/** The crew's level, as the route judges it: the weakest one there. */
export function crewLevel(state: LeagueState, trainerId: string): number {
  const crew = crewOf(state, trainerId);
  if (crew.length === 0) return 0;
  return Math.min(...crew.map((c) => c.level));
}

/** Whether this role brings creatures with it. Rangers do not. */
export function takesCrew(trainer: Trainer): boolean {
  return trainer.kind === "handler";
}

/**
 * How far under a route's floor this crew is standing.
 *
 * Zero for a Ranger, always — they refuse ground they cannot handle. For an
 * Handler it is the whole mechanic: the stretch pays better, teaches faster,
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
  const trainer = state.trainers[trainerId];
  if (!trainer || (trainer.kind !== "ranger" && trainer.kind !== "handler")) {
    return { ok: false, reason: "Not field staff" };
  }
  const role: FieldRole = trainer.kind === "handler" ? "handler" : "ranger";
  if (postingOnRoute(state, routeId, role)) {
    return {
      ok: false,
      reason: role === "ranger" ? "A Ranger is already working here" : "A Handler is already here",
    };
  }
  if (postingFor(state, trainerId)) return { ok: false, reason: "Already posted" };

  if (trainer.kind === "ranger") {
    // They go alone, but they only bring back their own type — so ground that
    // does not hold it is a shift spent walking.
    if (!suppliesType(route, trainer.affinity)) {
      return { ok: false, reason: `No ${trainer.affinity} lives here` };
    }
    return { ok: true };
  }

  const crew = crewOf(state, trainerId);
  if (crew.length === 0) return { ok: false, reason: "Nobody in their crew" };

  const level = Math.min(...crew.map((c) => c.level));
  if (level < route.levelMin - HANDLER.maxStretch) {
    return {
      ok: false,
      reason: `Lv${route.levelMin - HANDLER.maxStretch} at the very least — this is far over their heads`,
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

  const role: FieldRole = trainer.kind === "handler" ? "handler" : "ranger";
  state.postings.push({
    routeId,
    trainerId,
    role,
    progress: 0,
    caught: 0,
    earned: 0,
    beaten: 0,
    resting: false,
    // A Ranger works a shift and comes home; a Handler stays until recalled.
    // Expeditions that ran forever meant the whole system was one decision made
    // once, and the route screen never asked anything of the player again.
    endsAt: role === "ranger" ? state.time + RANGER.shiftSeconds : null,
  });
  return { ok: true };
}

/**
 * Let a field trainer go.
 *
 * Their crew goes back to the box — those creatures are yours, and always were.
 * What you lose is the person and everything they had learned: a Ranger's skill
 * is earned by catching, so dismissing a veteran and hiring a replacement is a
 * real step backwards, not a sideways move.
 */
export function dismiss(
  state: LeagueState,
  trainerId: string,
): { ok: true } | { ok: false; reason: string } {
  const trainer = state.trainers[trainerId];
  if (!trainer || (trainer.kind !== "ranger" && trainer.kind !== "handler")) {
    return { ok: false, reason: "Not field staff" };
  }

  recall(state, trainerId);
  for (const id of [...trainer.party]) removeFromCrew(state, id);

  delete state.trainers[trainerId];
  log(state, "quit", `${trainer.name} has been let go.`);
  return { ok: true };
}

/** Whether they take themselves back out when a shift ends. */
export function setAutoWork(state: LeagueState, trainerId: string, on: boolean): void {
  const trainer = state.trainers[trainerId];
  if (trainer) trainer.autoWork = on;
}

/**
 * Put idle staff who asked for it back to work.
 *
 * Field staff draw wages whether or not they are on a route, so a Ranger
 * standing about between shifts is money going out for nothing. The player is
 * still choosing *what kind* of work — a Ranger only ever takes ground holding
 * their own type, a Handler the hardest they can stand on — so this removes the
 * chore of re-posting without removing the decision of who to employ.
 */
function repostIdle(state: LeagueState): void {
  const open = eligibleRoutes(state);

  for (const trainer of Object.values(state.trainers)) {
    if (trainer.kind !== "ranger" && trainer.kind !== "handler") continue;
    if (!trainer.autoWork) continue;
    if (postingFor(state, trainer.id)) continue;

    const ranked =
      trainer.kind === "ranger"
        ? [...open]
            .filter((r) => suppliesType(r, trainer.affinity))
            // Richest ground for their type first, then the best they can reach.
            .sort(
              (a, b) =>
                (b.supply[trainer.affinity] ?? 0) - (a.supply[trainer.affinity] ?? 0) ||
                b.levelMax - a.levelMax,
            )
        : // A Handler works the *lowest* ground that still has something to
          // teach somebody. Finishing a route before moving up is the whole
          // shape of training: bring everyone to ten on the 5–10, then go on.
          [...open].sort((a, b) => a.levelMax - b.levelMax);

    for (const route of ranked) {
      if (trainer.kind === "handler" && !anyoneToTeach(state, trainer, route)) continue;
      if (canPost(state, route.id, trainer.id).ok) {
        post(state, route.id, trainer.id);
        break;
      }
    }
  }
}

/** Whether this trainer could bring anybody to this route's ceiling. */
function anyoneToTeach(state: LeagueState, trainer: Trainer, route: Route): boolean {
  if (crewOf(state, trainer.id).some((c) => c.level < route.levelMax)) return true;
  return trainableFor(state, trainer, route).length > 0;
}

/**
 * Creatures this Handler could take to this route, best first.
 *
 * "Best" is the strongest that still has something to gain here — the point of
 * a training run is to raise what you will actually field, so a Handler works
 * on the creature that will matter most, not the one that needs it most.
 *
 * Includes creatures currently serving a gym: those are usually the ones worth
 * raising, and a Leader's creature that could never be trained again was stuck
 * at whatever level it happened to be cast at.
 */
export function trainableFor(
  state: LeagueState,
  trainer: Trainer,
  route: Route,
  /**
   * Whether creatures currently defending a gym are on the table.
   *
   * True for the player choosing by hand — taking a Leader's creature away to
   * raise it is exactly what a Handler is for. False for automation: left to
   * itself it stripped gyms down to three of six while it trained their
   * defenders, and pulling a gym apart is a decision, not a chore.
   */
  includeServing = false,
): Creature[] {
  return candidatesFor(state, trainer.id, includeServing)
    .filter((o) => o.ok && o.creature.level < route.levelMax)
    .map((o) => o.creature)
    .sort((a, b) => b.power - a.power);
}

/**
 * Keep auto-managed Handlers working on whoever benefits most.
 *
 * Three rules, and they are the ones a player would follow by hand:
 *
 *   - a creature that has hit the route's ceiling has learned all it can here,
 *     so it goes home and its slot opens;
 *   - empty slots take the strongest creature that can still gain, because the
 *     point of training is to raise what you will field;
 *   - when nobody on this route has anything left to learn, move up.
 *
 * This is an idle game. The player decides who they employ and whether staff
 * manage themselves; they should not have to hand-shuffle four creatures every
 * time one of them hits ten.
 */
function reviewCrews(state: LeagueState, dt: number): void {
  state.crewReviewIn -= dt;
  if (state.crewReviewIn > 0) return;
  state.crewReviewIn = HANDLER.reviewSeconds;

  for (const posting of [...state.postings]) {
    if (posting.role !== "handler") continue;
    const trainer = state.trainers[posting.trainerId];
    if (!trainer?.autoWork) continue;
    const route = routeById(posting.routeId);
    if (!route) continue;

    // Send home anyone who has learned all this ground can teach.
    for (const c of crewOf(state, trainer.id)) {
      if (c.level >= route.levelMax) removeFromCrew(state, c.id);
    }

    // Fill the space with whoever gains most from being here — but leave the
    // gyms something to draw on. Training costs you availability; it must not
    // cost you the gym.
    const room = () => trainer.partyCap - crewOf(state, trainer.id).length;
    const spare = trainableFor(state, trainer, route);
    const takeable = Math.max(0, spare.length - HANDLER.leaveInBox);
    for (const c of spare.slice(0, takeable)) {
      if (room() <= 0) break;
      addToCrew(state, c.id, trainer.id);
    }

    // Nothing left to teach on this ground: go and find harder ground.
    if (crewOf(state, trainer.id).length === 0) recall(state, trainer.id);
  }
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
  // A Ranger has no crew to have outgrown the ground; they work it at a steady
  // pace and go home when the shift is up.
  if (posting.role === "ranger") return 0;
  const band = Math.max(1, route.levelMax - route.levelMin);
  return clamp01((crewLevel(state, posting.trainerId) - route.levelMin) / band);
}

/** Sim-seconds this posting needs per round. */
export function roundSeconds(state: LeagueState, posting: Posting): number {
  const route = routeById(posting.routeId);
  if (!route) return Infinity;

  const base =
    posting.role === "ranger"
      ? RANGER.baseCatchSeconds + route.levelMax * RANGER.secondsPerRouteLevel
      : HANDLER.baseRoundSeconds + route.levelMax * HANDLER.secondsPerRouteLevel;

  // A crew that has outgrown the ground works it fast — and is telling you to
  // move them on.
  return base / (1 + throughBand(state, posting) * RANGER.partnerSpeedBonus);
}

/** Fatigue this posting costs its crew per sim-second. */
export function fatigueRate(state: LeagueState, posting: Posting): number {
  const through = throughBand(state, posting);
  if (posting.role === "ranger") {
    return (
      RANGER.fatiguePerSecondAtFloor *
      (1 - through * (1 - RANGER.fatigueAtCeiling))
    );
  }
  const stretch = stretchOf(state, posting);
  return (
    HANDLER.fatiguePerSecondAtFloor *
    (1 - through * (1 - HANDLER.fatigueAtCeiling)) *
    (1 + stretch * HANDLER.fatiguePerStretch)
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
    RANGER.reserveCeilingBase + state.gymOrder.length * RANGER.reserveCeilingPerGym
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
  const hard = reserveCeiling(state) * RANGER.hardCeilingFactor;
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
export function drawFrom(
  state: LeagueState,
  route: Route,
  /** The Ranger walking it. Their type decides what they bring back. */
  ranger?: Trainer,
): Creature | null {
  // A Ranger catches their own type and nothing else. It is what makes hiring
  // one a decision rather than a purchase: a Grass Ranger is only worth what
  // your Grass gym is worth, and the ground you send them to has to hold Grass
  // in the first place.
  const type = ranger
    ? ranger.affinity
    : (weighted(state.rng, route.supply) as TypeId);

  const skill = ranger ? skillOf(ranger) : 0;
  // Skill does not make creatures stronger; it finds the ones a rookie walks
  // past. A seasoned Ranger reaches a little above the route's own ceiling.
  const ceiling = route.levelMax + Math.round(skill * RANGER.skillLevelBonus);

  const pool = catalog.wildByType(type).filter((s) => minLevelFor(s) <= ceiling);
  if (pool.length === 0) return null;

  const weights: Record<string, number> = {};
  for (const species of pool) {
    // Encounter weight falls off sharply with evolution stage, so skill is
    // applied as an exponent: common things stay common, and rare things stop
    // being nearly impossible.
    const base = encounterWeight(species);
    weights[species.slug] = Math.pow(base, 1 - skill * RANGER.rarityTilt);
  }

  const slug = weighted(state.rng, weights);
  const species = catalog.get(slug);
  if (!species) return null;

  return makeCreature(state, species, "reserve", {
    level: int(state.rng, route.levelMin, ceiling),
  });
}

/**
 * How good a Ranger has got at the job, 0..1.
 *
 * Earned by catching, so it is a record of work done rather than of time on the
 * payroll — and it is why firing a veteran costs you something a replacement
 * cannot make up on their first day.
 */
export function skillOf(trainer: Trainer): number {
  return clamp01(trainer.experience / RANGER.catchesToMaster);
}

/** Whether this ground holds anything a Ranger of this type would find. */
export function suppliesType(route: Route, type: TypeId): boolean {
  return (route.supply[type] ?? 0) > 0;
}

export function tickField(state: LeagueState, dt: number, report: TickReport): void {
  reviewCrews(state, dt);
  repostIdle(state);
  if (state.postings.length === 0) return;

  releaseSpillover(state, report);
  // The ceiling is absolute. Exempting "somebody is short-handed" was tried and
  // is a trap: a gym can be short of a type *no open route supplies*, so the
  // exemption never resolves and the roster ran to thirteen hundred creatures.
  //
  // A gym starved of its own type is a supply problem, and the game already has
  // the answer to it — the Trade Desk, which exists to turn the types you have
  // into the type you need.
  const boxFull = usableReserve(state) >= reserveCeiling(state);

  for (const posting of [...state.postings]) {
    const trainer = state.trainers[posting.trainerId];
    const crew = crewOf(state, posting.trainerId);
    if (!trainer || (posting.role === "handler" && crew.length === 0)) {
      state.postings = state.postings.filter((p) => p !== posting);
      continue;
    }
    if (isSuspended(state, trainer)) continue;

    // The shift ends and they come home, whatever they were in the middle of.
    if (posting.endsAt !== null && state.time >= posting.endsAt) {
      state.postings = state.postings.filter((p) => p !== posting);
      report.returned.push({ name: trainer.name, caught: posting.caught });
      log(
        state,
        "catch",
        `${trainer.name} is back from ${routeById(posting.routeId)?.name ?? "the field"} with ${posting.caught}.`,
      );
      continue;
    }

    // Only a Handler has anyone to wear out. A Ranger's shift is its own limit.
    if (posting.role === "handler") {
      const worst = Math.max(...crew.map((c) => c.fatigue));
      // A shift, then a break. The hysteresis is what makes this a duty cycle
      // rather than a stall.
      if (posting.resting) {
        if (worst <= HANDLER.rested) posting.resting = false;
        continue;
      }
      if (worst >= HANDLER.tiredAt) {
        posting.resting = true;
        continue;
      }
    }
    // Rangers with nowhere to put anyone idle; an Handler is still training.
    if (posting.role === "ranger" && boxFull) continue;

    posting.progress += dt;
    if (posting.role === "handler") {
      const wear = fatigueRate(state, posting) * dt;
      for (const c of crew) c.fatigue = clamp01(c.fatigue + wear);
    }

    const needed = roundSeconds(state, posting);
    let guard = 0;
    while (posting.progress >= needed && guard < 8) {
      posting.progress -= needed;
      guard += 1;
      const route = routeById(posting.routeId);
      if (!route) break;

      if (posting.role === "ranger") {
        workCatch(state, posting, route, trainer, report);
      } else {
        workTraining(state, posting, route, trainer, crew, report);
      }
    }
  }
}

/**
 * A Ranger's round: something turns up, or it does not.
 *
 * Deliberately no experience. Rangers and Handlers used to both level their
 * crews, which left no reason to run a Handler at all — catching taught you
 * *and* paid you in creatures. Collecting and training are now genuinely
 * different jobs with genuinely different rewards.
 */
function workCatch(
  state: LeagueState,
  posting: Posting,
  route: Route,
  ranger: Trainer,
  report: TickReport,
): void {
  const caught = drawFrom(state, route, ranger);
  if (caught) {
    posting.caught += 1;
    ranger.experience += 1;
    report.caught.push(caught.id);
  }
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
    (HANDLER.payBase + route.levelMax * HANDLER.payPerRouteLevel) *
    (1 + stretch * HANDLER.payPerStretch);
  state.money += pay;
  posting.earned += pay;
  report.earned += pay;

  const xp = HANDLER.xpPerRound * (1 + stretch * HANDLER.xpPerStretch);
  teach(state, posting, route, crew, xp, report);

  if (stretch > 0 && chance(state.rng, stretch * HANDLER.beatenChancePerStretch)) {
    posting.beaten += 1;
    for (const c of crew) c.fatigue = clamp01(c.fatigue + HANDLER.beatenFatigue);
    trainer.morale = Math.max(0, trainer.morale - HANDLER.beatenMorale);
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
 * things a Ranger would actually bring back.
 */
export function seedBench(state: LeagueState): void {
  const starters = routesUpTo(0);
  for (let i = 0; i < SCOUTING.startingBench; i++) {
    const route = starters[i % Math.max(1, starters.length)];
    if (!route) break;
    drawFrom(state, route);
  }
  rollFieldOffer(state, "ranger");
  rollFieldOffer(state, "handler");
}

/** Every route the league knows about, for the intel screen. */
export function knownRoutes(state: LeagueState): Route[] {
  return ROUTES.filter((r) => hasIntel(state, r.id));
}

export { partyCapOf, pick };
