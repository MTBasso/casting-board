/**
 * Rarity tiering for the curated roster — REDESIGN.md "Pokémon
 * rarity": the same Common/Rare/Legendary scale as items/Doctrines, so
 * there's one rarity language across the whole game.
 */
import { DEX } from "../../data/species.dex.js";
import { ROSTER_SLUGS } from "../../data/roster.js";
import type { Species } from "../../data/catalog.js";
import type { Rarity } from "./types.js";

const ROSTER_SET = new Set(ROSTER_SLUGS);

export const ROSTER: readonly Species[] = DEX.filter((s) => ROSTER_SET.has(s.slug));

if (ROSTER.length !== ROSTER_SLUGS.length) {
  throw new Error(
    `roster.ts: ${ROSTER_SLUGS.length - ROSTER.length} ROSTER_SLUGS entries didn't resolve against DEX`,
  );
}

/**
 * Non-legendary-flagged species are split by power into Common/Rare: the top
 * quarter by power (the pseudo-legendary band — Dragonite, Tyranitar,
 * Garchomp and the like, power 100+) reads as Rare, the rest as Common.
 * `isLegendary` species are always Legendary regardless of power.
 */
const nonLegendaryByPower = ROSTER.filter((s) => !s.isLegendary)
  .slice()
  .sort((a, b) => b.power - a.power);
const RARE_CUTOFF_INDEX = Math.floor(nonLegendaryByPower.length * 0.25);
const RARE_SLUGS = new Set(nonLegendaryByPower.slice(0, RARE_CUTOFF_INDEX).map((s) => s.slug));

export function rarityOf(species: Species): Rarity {
  if (species.isLegendary) return "legendary";
  if (RARE_SLUGS.has(species.slug)) return "rare";
  return "common";
}

export function rosterByRarity(rarity: Rarity): readonly Species[] {
  return ROSTER.filter((s) => rarityOf(s) === rarity);
}
