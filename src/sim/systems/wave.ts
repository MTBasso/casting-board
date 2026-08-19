import { catalog } from "../../data/catalog.js";
import { GYM_TRAINERS } from "../constants.js";
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

  for (const trainer of Object.values(state.trainers)) {
    trainer.party = trainer.party.filter((id) => id !== c.id);
  }
  c.role = "retired";
  c.gymId = null;
  c.trainerId = null;
  c.pinned = false;

  // A junior Gym Trainer's creatures are their own, not yours, so the box can
  // never restock them — and once careers ran at a realistic rate they simply
  // emptied out and became free passes standing in a gym. They bring a
  // replacement, the way anyone whose partner retires would.
  if (employer && (employer.kind === "gym" || employer.kind === "elite" || employer.kind === "champion")) {
    replaceRetired(state, employer);
  }
}

/** Hand a trainer a fresh creature after one of theirs retires. */
function replaceRetired(state: LeagueState, trainer: Trainer): void {
  const owned = trainer.kind !== "gym";
  const pool = catalog.staffableByType(trainer.affinity);
  if (pool.length === 0) return;

  const level =
    GYM_TRAINERS.levelBase +
    Math.round((state.peakRenown / 1000) * GYM_TRAINERS.levelPerThousandRenown);

  grantParty(state, trainer, pool, trainer.party.length + 1, {
    level,
    bond: owned ? 0.4 : 0.5,
    jitter: 2,
    owned,
  });
}

