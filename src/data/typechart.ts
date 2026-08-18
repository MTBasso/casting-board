import { TYPES, type TypeId, type TypeTally } from "../sim/types.js";

/**
 * Gen 6+ type effectiveness, stored sparsely by attacking type.
 * Anything not listed is neutral (x1).
 */
interface Matchups {
  strong?: readonly TypeId[]; // x2
  weak?: readonly TypeId[]; // x0.5
  immune?: readonly TypeId[]; // x0
}

const CHART: Record<TypeId, Matchups> = {
  normal: { weak: ["rock", "steel"], immune: ["ghost"] },
  fire: {
    strong: ["grass", "ice", "bug", "steel"],
    weak: ["fire", "water", "rock", "dragon"],
  },
  water: {
    strong: ["fire", "ground", "rock"],
    weak: ["water", "grass", "dragon"],
  },
  electric: {
    strong: ["water", "flying"],
    weak: ["electric", "grass", "dragon"],
    immune: ["ground"],
  },
  grass: {
    strong: ["water", "ground", "rock"],
    weak: ["fire", "grass", "poison", "flying", "bug", "dragon", "steel"],
  },
  ice: {
    strong: ["grass", "ground", "flying", "dragon"],
    weak: ["fire", "water", "ice", "steel"],
  },
  fighting: {
    strong: ["normal", "ice", "rock", "dark", "steel"],
    weak: ["poison", "flying", "psychic", "bug", "fairy"],
    immune: ["ghost"],
  },
  poison: {
    strong: ["grass", "fairy"],
    weak: ["poison", "ground", "rock", "ghost"],
    immune: ["steel"],
  },
  ground: {
    strong: ["fire", "electric", "poison", "rock", "steel"],
    weak: ["grass", "bug"],
    immune: ["flying"],
  },
  flying: {
    strong: ["grass", "fighting", "bug"],
    weak: ["electric", "rock", "steel"],
  },
  psychic: {
    strong: ["fighting", "poison"],
    weak: ["psychic", "steel"],
    immune: ["dark"],
  },
  bug: {
    strong: ["grass", "psychic", "dark"],
    weak: ["fire", "fighting", "poison", "flying", "ghost", "steel", "fairy"],
  },
  rock: {
    strong: ["fire", "ice", "flying", "bug"],
    weak: ["fighting", "ground", "steel"],
  },
  ghost: { strong: ["psychic", "ghost"], weak: ["dark"], immune: ["normal"] },
  dragon: { strong: ["dragon"], weak: ["steel"], immune: ["fairy"] },
  dark: {
    strong: ["psychic", "ghost"],
    weak: ["fighting", "dark", "fairy"],
  },
  steel: {
    strong: ["ice", "rock", "fairy"],
    weak: ["fire", "water", "electric", "steel"],
  },
  fairy: {
    strong: ["fighting", "dragon", "dark"],
    weak: ["fire", "poison", "steel"],
  },
};

/** Multiplier for one attacking type against one defending type. */
export function effectiveness(attack: TypeId, defend: TypeId): number {
  const m = CHART[attack];
  if (m.immune?.includes(defend)) return 0;
  if (m.strong?.includes(defend)) return 2;
  if (m.weak?.includes(defend)) return 0.5;
  return 1;
}

/** Multiplier against a mono- or dual-typed defender. */
export function effectivenessAgainst(
  attack: TypeId,
  defend: readonly TypeId[],
): number {
  let mult = 1;
  for (const d of defend) mult *= effectiveness(attack, d);
  return mult;
}

/**
 * How dangerous a challenger meta is to a gym of a given type.
 *
 * This is the number behind the Threat Report's status light: > 1 means the
 * incoming distribution is, on average, super-effective against this gym.
 */
export function threatAgainst(gymType: TypeId, dist: TypeTally): number {
  let total = 0;
  let weight = 0;
  for (const t of TYPES) {
    const w = dist[t];
    if (w <= 0) continue;
    total += w * effectiveness(t, gymType);
    weight += w;
  }
  return weight > 0 ? total / weight : 1;
}

export function emptyTally(): TypeTally {
  const t = {} as TypeTally;
  for (const k of TYPES) t[k] = 0;
  return t;
}

export function uniformTally(): TypeTally {
  const t = {} as TypeTally;
  for (const k of TYPES) t[k] = 1 / TYPES.length;
  return t;
}
