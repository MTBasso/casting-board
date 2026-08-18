import { catalog } from "../../data/catalog.js";
import { LEVELS } from "../constants.js";
import { powerOf, statsFor } from "./stats.js";
import { pick } from "../rng.js";
import type { Creature, LeagueState } from "../types.js";

/**
 * Levels and evolution.
 *
 * Creatures get stronger over their career, which does two things at once: it
 * gives the player a compounding force that exists before facilities, and it
 * gives a bonded creature an arc. A creature you cast at level 8 and watched
 * become a Dragonair at 30 is a different proposition from a stat line — which
 * is the entire reason the design cares about individuals.
 *
 * Levelling is bounded by career, not by time: every battle spends a finite
 * life, so a creature that levels a lot is a creature nearing the end.
 */

export function xpToNext(level: number): number {
  return LEVELS.xpBase + level * LEVELS.xpPerLevel;
}

/** Effective power for a species/level/roll combination. */
export function powerFor(speciesId: string, level: number, roll: number): number {
  const species = catalog.get(speciesId);
  if (!species) return 1;
  // A single figure standing in for six, because half the game reasons about
  // "how good is this creature" and none of it wants a six-dimensional answer.
  return powerOf(statsFor(species.stats, level, roll));
}

/** Recompute a creature's cached power from its current species and level. */
export function refreshPower(creature: Creature): void {
  creature.power = powerFor(creature.speciesId, creature.level, creature.powerRoll);
}

/**
 * Evolve if the creature has reached its species' threshold.
 *
 * Branching lines pick at random — Eevee has three Gen 1 forms and choosing
 * between them is a mechanic that does not exist yet, so the league gets
 * whichever it gets. Returns the new species name when something happened.
 */
export function tryEvolve(state: LeagueState, creature: Creature): string | null {
  const species = catalog.get(creature.speciesId);
  if (!species) return null;
  if (species.evolvesTo.length === 0) return null;
  if (species.evolveLevel === null || creature.level < species.evolveLevel) return null;

  const nextSlug = pick(state.rng, species.evolvesTo);
  const next = catalog.get(nextSlug);
  if (!next) return null;

  creature.speciesId = next.slug;
  creature.types = next.types;
  refreshPower(creature);
  return next.name;
}

/**
 * Award XP and apply any levels and evolutions that follow.
 * Returns the species name if the creature evolved.
 */
export function gainXp(
  state: LeagueState,
  creature: Creature,
  amount: number,
): string | null {
  if (creature.level >= LEVELS.max) return null;

  creature.xp += amount;
  let evolved: string | null = null;
  let guard = 0;

  while (
    creature.level < LEVELS.max &&
    creature.xp >= xpToNext(creature.level) &&
    guard < 64
  ) {
    creature.xp -= xpToNext(creature.level);
    creature.level += 1;
    guard += 1;

    const became = tryEvolve(state, creature);
    if (became) evolved = became;
  }

  if (guard > 0) refreshPower(creature);
  return evolved;
}
