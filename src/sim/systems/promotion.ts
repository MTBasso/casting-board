import { catalog } from "../../data/catalog.js";
import { LEAGUE, PARTY, PROMOTION } from "../constants.js";
import { makeCreature, makeTrainer } from "../factory.js";
import { log } from "../tick.js";
import { partyOf } from "./party.js";
import { foundLeague } from "../state.js";
import type { Creature, HallEntry, LeagueState, Mentor, Tier, TypeId } from "../types.js";

/**
 * Promotion and the Hall of Fame.
 *
 * This is the reset loop, and it is deliberately crude for now: readiness check,
 * induct a few creatures, take the Mentors forward, start again one tier up. No
 * Champion challenge and no ceremony — those come later.
 *
 * It exists this early to answer one question while it is still cheap to answer:
 * does a second run go meaningfully faster than the first? Everything built
 * after this amplifies the loop, so if the loop is flat there is nothing worth
 * amplifying.
 */

const ORDER: readonly Tier[] = ["regional", "national", "world"];

export function nextTier(tier: Tier): Tier | null {
  const index = ORDER.indexOf(tier);
  return ORDER[index + 1] ?? null;
}

export function tierIndex(tier: Tier): number {
  return Math.max(0, ORDER.indexOf(tier));
}

/** Receipts multiplier the current tier confers. */
export function tierMultiplier(tier: Tier): number {
  return PROMOTION.receiptsPerTier ** tierIndex(tier);
}

/**
 * Whether this gym has people who know each other, as opposed to a crowd.
 *
 * Measured on the gym's **most bonded few**, not the party average — because an
 * average punishes exactly what the rest of the game rewards. Auto-fill keeps
 * topping parties up from the box, every new arrival lands at zero bond, and so
 * deepening a gym *lowers* its average. Measured on a real league at 120 hours:
 * the one-deep Dragon gym sat at 1.00 and the five-deep Ground gym at 0.22, and
 * the well-built gym was the one blocking promotion.
 *
 * The question promotion should ask is "does this gym have a core?", which is
 * also the question the design has always been about.
 */
export function hasBondedCore(party: readonly Creature[]): boolean {
  if (party.length === 0) return false;
  const needed = Math.min(PROMOTION.coreSize, party.length);
  const best = [...party].sort((a, b) => b.bond - a.bond).slice(0, needed);
  return best.every((c) => c.bond >= PROMOTION.bondBar);
}

/**
 * Record gyms that currently hold a bonded core.
 *
 * Called on the tick rather than read at promotion time, because the whole
 * point of the ratchet is that the moment passes: a gym reaches the standard,
 * its veterans age out, and the fact that it *got there* has to survive that.
 */
export function markBondedGyms(state: LeagueState): void {
  for (const gymId of state.gymOrder) {
    const gym = state.gyms[gymId];
    if (!gym || gym.everBonded || !gym.leaderId) continue;
    if (hasBondedCore(partyOf(state, gym.leaderId))) gym.everBonded = true;
  }
}

export interface Readiness {
  ok: boolean;
  /** Everything still standing between the league and promotion. */
  blockers: string[];
  /**
   * Which path is open. `earned` is the readiness check across the whole board;
   * `forced` is the one a lost title opens, on very different terms.
   */
  path: "earned" | "forced";
}

/**
 * The two ways up, and what each one carries.
 *
 * The trade is speed against payload. Promote the moment the title falls and you
 * arrive at the harder tier with one monster and a thin bench; grind the title
 * back and you arrive properly staffed, with your own legends and the Mentors
 * that actually bend the curve.
 *
 * That shape is also the anti-throw guard, and it is structural rather than a
 * rule: a league thrown on purpose promotes into a harder tier with a weaker
 * roster, so the exploit punishes itself.
 */
export function forcedPathOpen(state: LeagueState): boolean {
  return state.titleLost && nextTier(state.tier) !== null;
}

/**
 * Promotion is a readiness check across the whole board, not a price.
 *
 * That is the point: a currency gate would mean idling until a number is big
 * enough, and one stacked gym could carry you. Requiring every gym staffed and
 * bonded is what makes promotion test the thing the game is actually about.
 */
export function readiness(state: LeagueState): Readiness {
  const blockers: string[] = [];

  if (nextTier(state.tier) === null) {
    return { ok: false, blockers: ["Already at the highest tier"], path: "earned" };
  }

  // A lost title opens the climb immediately. It never forces it — staying and
  // winning the title back is always a legal move, and it is the better one if
  // you can afford the time.
  if (forcedPathOpen(state)) {
    return { ok: true, blockers: [], path: "forced" };
  }

  const required = LEAGUE.gymUnlockRenown.length;
  if (state.gymOrder.length < required) {
    blockers.push(`Build all ${required} gyms (${state.gymOrder.length} so far)`);
  }

  for (const gymId of state.gymOrder) {
    const gym = state.gyms[gymId];
    if (!gym) continue;
    if (gym.leaderId === null) {
      blockers.push(`${gym.name} has no leader`);
      continue;
    }
    const party = partyOf(state, gym.leaderId);
    if (party.length === 0) {
      blockers.push(`${gym.name} has an empty party`);
      continue;
    }
    if (!gym.everBonded) {
      blockers.push(`${gym.name} has never had a bonded core`);
    }
  }

  const bar = PROMOTION.renownBar[tierIndex(state.tier)] ?? Infinity;
  if (state.peakRenown < bar) {
    blockers.push(`Reach ${bar} peak renown (${Math.round(state.peakRenown)})`);
  }

  return { ok: blockers.length === 0, blockers, path: "earned" };
}

/** Creatures eligible for induction: anything currently serving the league. */
/**
 * Who can be carried forward as a Mentor.
 *
 * Drawn from the **Hall** — creatures whose careers ended in your service and
 * earned the record — rather than from whoever happens to be serving when you
 * press the button. Induction is meant to be the loaded choice in the game, and
 * choosing between finished stories is a better decision than choosing between
 * whoever is currently on the board.
 */
export function inductable(state: LeagueState): HallEntry[] {
  return [...state.legends]
    .filter((e) => !e.inducted)
    .sort((a, b) => b.wins + b.bond * 100 - (a.wins + a.bond * 100));
}

/** How many Mentors in the Hall match any of these types. */
export function mentorsFor(state: LeagueState, types: readonly TypeId[]): number {
  let count = 0;
  for (const mentor of state.hall) {
    if (types.includes(mentor.type)) count += 1;
  }
  return count;
}

/** Bond gain multiplier the Hall confers on a given type. */
export function mentorBonus(state: LeagueState, types: readonly TypeId[]): number {
  return 1 + mentorsFor(state, types) * PROMOTION.mentorBondBonus;
}

/**
 * Levels a newly acquired creature starts with, courtesy of the Hall.
 *
 * "The creature that carried you now trains the ones that follow" is the design
 * doc's line, and this is where it becomes mechanical rather than decorative.
 */
export function mentorLevels(state: LeagueState, types: readonly TypeId[]): number {
  return mentorsFor(state, types) * PROMOTION.mentorLevelBonus;
}

/**
 * Promote. Everything resets except the Hall — that is the whole bargain, and
 * the reason induction is the most loaded button in the game.
 */
export function promote(
  state: LeagueState,
  inductIds: readonly string[],
): { ok: true; tier: Tier } | { ok: false; reason: string } {
  const check = readiness(state);
  if (!check.ok) return { ok: false, reason: check.blockers[0] ?? "Not ready" };

  const tier = nextTier(state.tier);
  if (!tier) return { ok: false, reason: "Already at the highest tier" };

  const forced = check.path === "forced";

  // The forced path carries the usurper and nothing else: no inductees, no
  // Mentors. Mentors are what actually bend the curve, so handing them out on
  // the fast path would collapse the trade into a free shortcut.
  const carried = forced ? carryUsurper(state) : null;
  const induct = forced ? [] : inductIds;

  if (induct.length > PROMOTION.inductCount) {
    return { ok: false, reason: `Induct at most ${PROMOTION.inductCount}` };
  }

  for (const id of induct) {
    const entry = state.legends.find((e) => e.id === id);
    if (!entry || entry.inducted) continue;
    entry.inducted = true;
    const mentor: Mentor = {
      speciesId: entry.speciesId,
      name: entry.name,
      type: entry.type,
      wins: entry.wins,
      losses: entry.losses,
      tier: state.tier,
    };
    state.hall.push(mentor);
  }

  // Wipe the league. The Hall, the tier, and the save version survive.
  state.creatures = {};
  state.trainers = {};
  state.gyms = {};
  state.gymOrder = [];
  state.gymOffer = null;
  state.money = 0;
  state.renown = 0;
  state.peakRenown = 0;
  state.tier = tier;
  state.crews = [];
  state.expeditions = [];
  state.crewOffer = [];
  state.explored = [];
  state.known = {};
  state.bans = {};
  state.routeIntel = {};
  state.nextIds = {};
  state.facilities = {};
  state.elite = [];
  state.gauntletCooldown = 0;
  state.dayCare = [];
  state.eggProgress = 0;

  state.usurperId = null;
  state.titleLost = false;
  // The ratchet is per tier: a new board earns its own bonded cores.
  for (const gym of Object.values(state.gyms)) gym.everBonded = false;

  // Re-found through the same path a brand new league takes, so a promoted
  // league can never start out worse than a fresh one.
  foundLeague(state);

  // And then the one thing the forced path brings: the person who beat you,
  // and the team that did it, standing in your new league on day one.
  if (carried) reinstateUsurper(state, carried);

  return { ok: true, tier };
}

interface CarriedChampion {
  name: string;
  affinity: TypeId;
  salary: number;
  party: { speciesId: string; level: number; bond: number }[];
}

/** Lift the usurper out of the league about to be wiped. */
function carryUsurper(state: LeagueState): CarriedChampion | null {
  const usurper = state.usurperId ? state.trainers[state.usurperId] : undefined;
  if (!usurper) return null;
  return {
    name: usurper.name,
    affinity: usurper.affinity,
    salary: usurper.salary,
    party: usurper.party
      .map((id) => state.creatures[id])
      .filter((c): c is NonNullable<typeof c> => c !== undefined)
      .map((c) => ({ speciesId: c.speciesId, level: c.level, bond: c.bond })),
  };
}

/**
 * Put them back on the board in the new tier.
 *
 * They take a Leader's post if their type has a gym, and otherwise wait in the
 * wings — the new league has one gym on day one, and a Champion without a
 * Champion's seat is exactly the awkwardness this path should have.
 */
function reinstateUsurper(state: LeagueState, carried: CarriedChampion): void {
  const trainer = makeTrainer(state, carried.affinity, "leader", {
    bond: 0.5,
    partyCap: PARTY.max,
  });
  trainer.name = carried.name;
  trainer.salary = carried.salary;
  trainer.origin = "usurper";

  for (const mon of carried.party) {
    if (trainer.party.length >= PARTY.max) break;
    const species = catalog.get(mon.speciesId);
    if (!species) continue;
    const creature = makeCreature(state, species, "party", {
      level: mon.level,
      bond: mon.bond,
      owned: false,
    });
    creature.trainerId = trainer.id;
    trainer.party.push(creature.id);
  }

  const gym = state.gymOrder
    .map((id) => state.gyms[id])
    .find((g) => g !== undefined && g.type === carried.affinity);

  if (gym && gym.leaderId === null) {
    gym.leaderId = trainer.id;
    trainer.gymId = gym.id;
  } else {
    // No seat for them yet. They stay on the payroll, which is the point.
    trainer.kind = "elite";
  }

  state.usurperId = trainer.id;
  log(state, "promote", "log.cameWithYou", { name: trainer.name });
}
