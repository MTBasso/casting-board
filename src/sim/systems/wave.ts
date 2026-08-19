import { catalog } from "../../data/catalog.js";
import { BOND, GYM_TRAINERS, HALL } from "../constants.js";
import { gymTrainerLevel } from "./league.js";
import { grantParty } from "./party.js";
import { nickname } from "../../data/names.js";
import type { Creature, LeagueState, Trainer } from "../types.js";

/**
 * Creature identity and retirement.
 *
 * Battle resolution lives in `systems/challenge.ts` now that challenges are
 * party against party; what remains here is the small set of facts about a
 * creature that everything else needs.
 */

/** A creature is a species until someone bonds with it; then it has a name. */
/**
 * What to call a creature.
 *
 * The species, not the nickname. Nicknames still exist — they are how a creature
 * becomes an individual when a trainer takes it on — but a roster of two hundred
 * invented names is unreadable, and the player thinks in species. The nickname
 * is now a detail on the summary screen rather than the primary label.
 */
export function displayName(c: Creature): string {
  return catalog.get(c.speciesId)?.name ?? c.speciesId;
}

/** The invented name a trainer gave them, if any. */
export function nicknameOf(c: Creature): string | null {
  return c.nickname;
}

/** Called when a creature is taken on by a trainer — the moment it becomes an individual. */
export function nameOnBond(state: LeagueState, c: Creature): void {
  if (c.nickname === null) c.nickname = nickname(state.rng);
}

/**
 * Retirement is never deletion. A career ends by becoming a lineage: retirees
 * move to the Day-Care as breeding stock, and a long career yields better
 * offspring.
 */
export function retire(state: LeagueState, c: Creature): void {
  const employer = c.trainerId ? state.trainers[c.trainerId] : undefined;

  remember(state, c);
  // What they knew goes to whoever takes their place. A career ending becomes
  // the next creature's start, which is the only way a gym's bonded core can
  // outlive the creature that built it.
  const legacy = handoverFrom(c);

  for (const trainer of Object.values(state.trainers)) {
    trainer.party = trainer.party.filter((id) => id !== c.id);
  }
  c.role = "retired";
  c.gymId = null;
  c.trainerId = null;
  c.pinned = false;

  if (employer) {
    if (legacy > 0) employer.handover = Math.max(employer.handover, legacy);
    // A junior Gym Trainer's creatures are their own, not yours, so the box can
    // never restock them — and once careers ran at a realistic rate they simply
    // emptied out and became free passes standing in a gym. They bring a
    // replacement, the way anyone whose partner retires would.
    if (
      employer.kind === "gym" ||
      employer.kind === "elite" ||
      employer.kind === "champion"
    ) {
      replaceRetired(state, employer);
    }
  }
}

/**
 * The bond a retiring creature leaves behind, if it earned the right to.
 *
 * Only a genuine veteran hands anything over. A fraction from every washout
 * would just be a flat discount on bonding; a threshold makes seeing a career
 * through worth more than rotating a creature out early.
 */
function handoverFrom(c: Creature): number {
  if (c.bond < BOND.handoverFloor) return 0;
  return c.bond * BOND.handoverShare;
}

/**
 * Write a creature into the Hall of Fame, if its career earned the record.
 *
 * Careers now end about eighty times a run. A hall everyone enters is a staff
 * list, so entry takes a real share of a life served — read as a fraction of
 * that creature's own career, which is what makes it fair to a short-lived one.
 */
function remember(state: LeagueState, c: Creature): void {
  // Only creatures that were actually yours. A junior Gym Trainer brings their
  // own and takes them when they go — they served *at* your league, not in it,
  // and the Hall filling up with other people's partners would make it a record
  // of everyone who ever walked through.
  if (!c.owned) return;

  const served = c.careerTotal > 0 ? c.careerSpent / c.careerTotal : 0;
  if (served < HALL.minCareerServed) return;
  if (c.wins < HALL.minWins) return;

  state.legends.push({
    id: c.id,
    speciesId: c.speciesId,
    name: displayName(c),
    type: c.types[0] ?? "normal",
    level: c.level,
    wins: c.wins,
    losses: c.losses,
    bond: c.bond,
    served: Math.round(c.careerSpent),
    careerTotal: Math.round(c.careerTotal),
    retiredAt: state.time,
    tier: state.tier,
    inducted: false,
  });

  // The record has to stay readable. The least distinguished go first, and a
  // creature already carried forward as a Mentor is never dropped.
  if (state.legends.length > HALL.cap) {
    state.legends.sort((a, b) => {
      if (a.inducted !== b.inducted) return a.inducted ? 1 : -1;
      return a.wins + a.bond * 100 - (b.wins + b.bond * 100);
    });
    state.legends = state.legends.slice(state.legends.length - HALL.cap);
  }
}

/** Hand a trainer a fresh creature after one of theirs retires. */
function replaceRetired(state: LeagueState, trainer: Trainer): void {
  const owned = trainer.kind !== "gym";
  const pool = catalog.staffableByType(trainer.affinity);
  if (pool.length === 0) return;

  // Replacements match the gym they stand in, not some league-wide average.
  const level = trainer.gymId
    ? gymTrainerLevel(state, trainer.gymId)
    : GYM_TRAINERS.levelBase;

  grantParty(state, trainer, pool, trainer.party.length + 1, {
    level,
    // A junior's replacement is a lesser version too — see GYM_TRAINERS.rollPenalty.
    rollFactor: owned ? 1 : GYM_TRAINERS.rollPenalty,
    bond: owned ? 0.4 : 0.5,
    jitter: 2,
    owned,
  });
}

