import { catalog, encounterWeight } from "../../data/catalog.js";
import { routeById } from "../../data/routes.js";
import { FIELD, KIT, TRAITS } from "../constants.js";
import { chance, int, range } from "../rng.js";
import { gainXp } from "./growth.js";
import { canJoin, candidatesFor, leaveParty } from "./party.js";
import { displayName } from "./wave.js";
import { competence, crewById, crewMembers, crewName, rollCrewOffer } from "./crews.js";
import { isSuspended } from "./morale.js";
import { canPushOnFrom, drawOne, isOpen, note_seen, open } from "./map.js";
import { reserveCeiling, usableReserve } from "./roster.js";
import { log } from "../tick.js";
import type { Report } from "../report.js";
import type {
  Creature,
  Crew,
  CrewTrait,
  Expedition,
  Kit,
  LeagueState,
  Route,
  StandingStop,
} from "../types.js";
import { clamp01 } from "../math.js";

/**
 * A trip: finite, outfitted, and paid for up front.
 *
 * You choose the ground, the party the Handler takes, and the kit — balls,
 * potions, revives, lures — and the crew works until the balls run out or they
 * are too beaten to carry on. How long that is, is what you chose at the
 * counter, not a timer.
 *
 * Standing orders re-buy the same kit and send them out again, stopping on
 * anything worth being told about. That is what makes the return moment mean
 * something: you come back to *why* they stopped rather than to an idle crew.
 */

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

export function tickField(state: LeagueState, dt: number, report: Report): void {
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
    if (trip.pending?.decidesAt !== null && trip.pending && state.time >= trip.pending.decidesAt) {
      resolveInCharacter(state, trip, crew.trait);
    }

    const { ranger, handler } = crewMembers(state, crew);
    if (!ranger || !handler) {
      finish(state, trip, "returned", report);
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
  report: Report,
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
  report.took(pay);

  // Training. The route caps what it can teach, as it always has.
  for (const id of trip.party) {
    const c = state.creatures[id];
    if (!c || c.level >= route.levelMax) continue;
    const became = gainXp(state, c, FIELD.xpPerRound);
    if (became) {
      report.evolved(became);
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
      report.caught(caught.id);
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
    finish(state, trip, trip.hurt >= 1 ? "beaten" : "returned", report);
  }
}

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
  report: Report,
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
  report: Report,
): void {
  if (trip.kit.revives > 0) {
    trip.kit.revives -= 1;
    trip.hurt = clamp01(trip.hurt + 0.1);
    note(trip, "trouble", "ev.troubleSaved", { route: route.id }, state.time);
    return;
  }
  trip.hurt = clamp01(trip.hurt + FIELD.troubleHurt);
  note(trip, "trouble", "ev.troubleRaw", { route: route.id }, state.time);
  report.beaten(crewName(state, crew));
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

  // How unlikely this was to turn up at all. Final forms and stage three sit at
  // or below the threshold; the staples are well above it.
  const species = catalog.get(found.speciesId);
  const rare = species !== undefined && encounterWeight(species) <= FIELD.rareWeight;

  trip.pending = {
    id: `enc_${found.id}`,
    prompt: "ev.choicePrompt",
    promptParams: { name: displayName(found), route: route.id, n: cost },
    options: [
      { id: `take:${found.id}:${cost}`, label: "ev.choiceTake", labelParams: { n: cost } },
      { id: "leave", label: "ev.choiceLeave" },
    ],
    decidesAt: rare ? null : state.time + FIELD.choiceWindow,
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
  report?: Report,
): void {
  const crew = crewById(state, trip.crewId);
  const route = routeById(trip.routeId);

  // A rare find waits for the whole trip rather than a timer, so one can still
  // be open when the crew starts for home. They settle it themselves on the way
  // — which is what bounds the waiting to one per crew instead of a backlog.
  if (trip.pending && crew) resolveInCharacter(state, trip, crew.trait);

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

  // A trip that ran its course is one the league can count. A recall is the
  // player pulling them back early, which is not the same thing and does not
  // satisfy an objective that asked for a trip to be worked.
  if (report && how !== "recalled") {
    report.returned(crewName(state, crew), trip.caught);
  }

  if (crew) reissue(state, crew, how);
}

/**
 * Should this crew go straight back out, and if not, why not?
 *
 * Pulled out as a pure decision so it can be tested as a rule rather than as
 * weather: simulating until a crew happens to come home a particular way makes
 * the test depend on the seed, and it will start failing for reasons that have
 * nothing to do with the rule.
 *
 * Order matters. Everything above the floor check is a fact about the world
 * that money cannot fix, so reporting "you are out of money" when the real
 * problem is a full box would send the player to the wrong screen.
 */
export function standingVerdict(
  state: LeagueState,
  crew: Crew,
  how: "returned" | "beaten" | "recalled",
): StandingStop | "go" {
  if (!crew.orders) return "stopped";
  // Pulling a crew back by hand is an instruction; re-sending them ignores it.
  if (how === "recalled") return "stopped";
  // Coming home beaten is the crew telling you the ground is rougher than the
  // kit you sent them with.
  if (how === "beaten") return "worn";
  if (usableReserve(state) >= reserveCeiling(state)) return "boxFull";
  if (expeditionOn(state, crew.orders.routeId)) return "routeTaken";
  if (state.money - kitCost(crew.orders.kit) < crew.orders.floor) return "floor";
  return "go";
}

/**
 * Send a crew straight back out, if that is what they were told to do.
 *
 * Everything that stops them is something the player would want to hear about,
 * which is the point — the Desk can report *why* the crew is home rather than
 * simply that it is.
 */
function reissue(state: LeagueState, crew: Crew, how: "returned" | "beaten" | "recalled"): void {
  const orders = crew.orders;
  if (!orders) return;

  const verdict = standingVerdict(state, crew, how);
  if (verdict !== "go") {
    orders.stoppedBecause = verdict;
    return;
  }

  const again = send(
    state,
    crew.id,
    orders.routeId,
    orders.objective,
    orders.towardId,
    orders.kit,
    // The party stays home. A standing order should never quietly walk off with
    // creatures the player cast into a gym while they were not looking.
    [],
  );
  if (!again.ok) orders.stoppedBecause = "stopped";
}

/** Creatures a Handler could take out, best first. */
export function trainableFor(state: LeagueState, crew: Crew, route: Route): Creature[] {
  return candidatesFor(state, crew.handlerId, true)
    .filter((o) => o.ok && o.creature.level < route.levelMax)
    .map((o) => o.creature)
    .sort((a, b) => b.power - a.power);
}
