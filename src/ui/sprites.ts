import { catalog } from "../data/catalog.js";

/**
 * Sprites are vendored into public/sprites by scripts/fetch-gen1.ts and served
 * from the app itself, so the PWA still shows creatures with no network.
 */
export function spriteUrl(speciesId: string): string | null {
  const species = catalog.get(speciesId);
  if (!species) return null;
  // Gen 5 Black/White animated sprites. A creature that breathes reads as a
  // character rather than an icon, which is the whole point of the game.
  return `${import.meta.env.BASE_URL}sprites/${species.id}.gif`;
}

/**
 * The little box icon.
 *
 * Where a full sprite would crowd a row — the available list, battle feed,
 * party summaries — these read instantly at a fraction of the space, which is
 * exactly the job they do in the games' own PC.
 */
export function iconUrl(speciesId: string): string | null {
  const species = catalog.get(speciesId);
  if (!species) return null;
  return `${import.meta.env.BASE_URL}icons/${species.id}.png`;
}

export function speciesName(speciesId: string): string {
  return catalog.get(speciesId)?.name ?? speciesId;
}
