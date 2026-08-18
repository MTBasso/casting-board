import { catalog } from "../../data/catalog.js";
import { nickname } from "../../data/names.js";
import type { Creature, LeagueState } from "../types.js";

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
  for (const trainer of Object.values(state.trainers)) {
    trainer.party = trainer.party.filter((id) => id !== c.id);
  }
  c.role = "retired";
  c.gymId = null;
  c.trainerId = null;
  c.pinned = false;
}

