import type { TypeId } from "../sim/types.js";
import { DEX } from "./species.dex.js";

/**
 * The swappable creature layer.
 *
 * Nothing in src/sim imports this file directly — it goes through the
 * `CreatureCatalog` interface. Reskinning to original monsters is a data swap
 * behind this seam, not a rewrite.
 *
 * Generations 1-3. The roster was Gen 1 only, and that was measurably too thin:
 * eleven of seventeen gym types had *no* creature in their pool that answered
 * their worst matchup, because Gen 1 typing is mono-heavy. Gen 2 brings Dark and
 * Steel and a wave of dual-types; Gen 3 deepens nearly everything.
 */
export interface Species {
  /** National dex number. Doubles as the sprite filename. */
  id: number;
  /** Stable key stored in saves; survives renames and reorderings. */
  slug: string;
  name: string;
  types: readonly TypeId[];
  /** Derived from base stat total. Spans roughly 32–113 across Gen 1. */
  power: number;

  /** Position in its evolution chain: 1 unevolved, 3 fully evolved. */
  stage: number;
  evolvesFrom: string | null;
  /** Forms this can become. Empty when final; Eevee branches three ways. */
  evolvesTo: readonly string[];
  /** Level at which it evolves. Null when there is nothing to evolve into. */
  evolveLevel: number | null;
  /** Starter lines never appear in the wild; they get their own mechanic. */
  isStarter: boolean;
  isLegendary: boolean;
  /** The real base stats. Drives battles and the summary radar. */
  stats: BaseStats;
}

export interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

export interface CreatureCatalog {
  all(): readonly Species[];
  get(slug: string): Species | undefined;
  /** Species that can legally serve a gym of this type (mono or dual match). */
  byType(type: TypeId): readonly Species[];
  /** Those of them that can actually be found in the wild. */
  wildByType(type: TypeId): readonly Species[];
  /** Those a trainer can arrive with or an egg can hatch. Never legendary. */
  staffableByType(type: TypeId): readonly Species[];
}

/**
 * How likely a species is to turn up in the wild.
 *
 * Derived from where it sits in its evolution chain, so the rule holds for any
 * creature set rather than being a hand-written rarity table:
 *
 *   - **Starters never appear.** They get their own acquisition mechanic.
 *   - **Legendaries never appear** in routes either, for the same reason.
 *   - **Unevolved forms are the staple** of every route.
 *   - **Mid-evolutions turn up regularly** — you find plenty of Gloom in the
 *     real games, and that is worth preserving.
 *   - **Fully evolved forms are rare but possible**, so a scouting result can
 *     genuinely surprise you.
 */
export function encounterWeight(species: Species): number {
  if (species.isStarter || species.isLegendary) return 0;

  const canStillEvolve = species.evolvesTo.length > 0;
  if (species.stage <= 1) return canStillEvolve ? 1 : 0.55;
  if (species.stage === 2) return canStillEvolve ? 0.35 : 0.12;
  return 0.04;
}

/**
 * The lowest level this species can legitimately exist at.
 *
 * A Gengar cannot be level 12: it evolved from Haunter, which evolves at a
 * level, so every Gengar in the world is at least that old. Walking the chain
 * back gives the floor, and everything that creates a creature respects it —
 * otherwise routes and the Trade Desk quietly hand out impossible creatures.
 */
export function minLevelFor(species: Species): number {
  let floor = 1;
  let cursor: Species | undefined = species;
  let guard = 0;

  while (cursor?.evolvesFrom && guard < 5) {
    const parent: Species | undefined = bySlug.get(cursor.evolvesFrom);
    if (!parent) break;
    if (parent.evolveLevel !== null) floor = Math.max(floor, parent.evolveLevel);
    cursor = parent;
    guard += 1;
  }
  return floor;
}

/**
 * Species a trainer may arrive with, or the Day-Care may hatch.
 *
 * Legendaries are excluded everywhere a creature is *granted* rather than
 * earned — no trainer walks in with a Mewtwo, and no egg produces one.
 */
/**
 * The base form of a species' line, used as a family identity.
 *
 * Charmander, Charmeleon and Charizard all answer "charmander" — which is how a
 * party knows it already has one of those, whatever stage it happens to be at.
 */
export function familyOf(speciesId: string): string {
  let cursor = bySlug.get(speciesId);
  let guard = 0;
  while (cursor?.evolvesFrom && guard < 5) {
    const parent = bySlug.get(cursor.evolvesFrom);
    if (!parent) break;
    cursor = parent;
    guard += 1;
  }
  return cursor?.slug ?? speciesId;
}

/**
 * Whether a trainer may arrive with this species, or an egg hatch it.
 *
 * Legendaries are one-of-a-kind and must never be handed out. Starters are
 * excluded for the same reason they are kept off routes: a starter is something
 * a person is *given* at the beginning of their story, not something that turns
 * up in a hiring pool.
 */
export function isGrantable(species: Species): boolean {
  return !species.isLegendary && !species.isStarter;
}

/**
 * Those a trainer of this calibre could plausibly have.
 *
 * A trainer asking for level 8 creatures must not be handed a Charizard.
 * `makeCreature` clamps *upward* to a species' evolution floor, so without this
 * filter the request silently produced a level 36 monster — which is exactly how
 * a rival turned up at the first gym with a party of level 40s.
 */
export function grantableAtLevel(
  pool: readonly Species[],
  level: number,
): readonly Species[] {
  const fits = pool.filter((s) => minLevelFor(s) <= level);
  // Never return nothing: fall back to the least-evolved options available, so
  // a very low level still produces a plausible team rather than an empty one.
  if (fits.length > 0) return fits;
  const floor = Math.min(...pool.map((s) => minLevelFor(s)));
  return pool.filter((s) => minLevelFor(s) === floor);
}

const bySlug = new Map(DEX.map((s) => [s.slug, s]));

const byTypeCache = new Map<TypeId, readonly Species[]>();

const wildCache = new Map<TypeId, readonly Species[]>();
const staffCache = new Map<TypeId, readonly Species[]>();

export const catalog: CreatureCatalog = {
  all: () => DEX,
  get: (slug) => bySlug.get(slug),
  byType(type) {
    const cached = byTypeCache.get(type);
    if (cached) return cached;
    const list = DEX.filter((s) => s.types.includes(type));
    byTypeCache.set(type, list);
    return list;
  },
  wildByType(type) {
    const cached = wildCache.get(type);
    if (cached) return cached;
    const list = this.byType(type).filter((s) => encounterWeight(s) > 0);
    wildCache.set(type, list);
    return list;
  },
  staffableByType(type) {
    const cached = staffCache.get(type);
    if (cached) return cached;
    const list = this.byType(type).filter(isGrantable);
    staffCache.set(type, list);
    return list;
  },
};
