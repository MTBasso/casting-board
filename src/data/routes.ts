import { catalog } from "./catalog.js";
import { TYPES, type Route, type TypeId, type TypeTally } from "../sim/types.js";
import { emptyTally } from "./typechart.js";

/**
 * Route definitions.
 *
 * A route's supply distribution is the mirror of a gym's Threat Report — same
 * visual grammar, opposite direction. Between them they answer the two questions
 * the player has: what is coming at me, and what can I get.
 *
 * Routes are not a menu you pick freely from. A small set is *offered*, you take
 * one, and the offer redraws — so every choice costs you the alternatives. How
 * often a route shows up is derived from the strength of what lives there, not
 * hand-tuned: strong routes are rare because they are strong.
 */

function supply(weights: Partial<Record<TypeId, number>>): TypeTally {
  const tally = emptyTally();
  for (const [type, weight] of Object.entries(weights)) {
    tally[type as TypeId] = weight ?? 0;
  }
  return tally;
}

interface RouteDef {
  id: string;
  name: string;
  weights: Partial<Record<TypeId, number>>;
  unlockAt: number;
  cost: number;
  yieldMin: number;
  yieldMax: number;
  /** Level band of creatures found here. Later routes hold older creatures. */
  levelMin: number;
  levelMax: number;
}

const DEFS: readonly RouteDef[] = [
  { id: "cinder_ridge", levelMin: 3, levelMax: 9, name: "Cinder Ridge", weights: { fire: 0.4, rock: 0.3, ground: 0.3 }, unlockAt: 0, cost: 120, yieldMin: 1, yieldMax: 2 },
  { id: "verdant_path", levelMin: 2, levelMax: 8, name: "Verdant Path", weights: { grass: 0.3, bug: 0.25, poison: 0.25, normal: 0.2 }, unlockAt: 0, cost: 110, yieldMin: 1, yieldMax: 3 },
  { id: "coastal_road", levelMin: 4, levelMax: 10, name: "Coastal Road", weights: { water: 0.4, flying: 0.25, normal: 0.2, ice: 0.15 }, unlockAt: 0, cost: 140, yieldMin: 1, yieldMax: 2 },
  { id: "thunder_plain", levelMin: 6, levelMax: 13, name: "Thunder Plain", weights: { electric: 0.4, normal: 0.25, flying: 0.2, steel: 0.15 }, unlockAt: 60, cost: 180, yieldMin: 1, yieldMax: 2 },
  { id: "quarry_flats", levelMin: 6, levelMax: 12, name: "Quarry Flats", weights: { ground: 0.35, rock: 0.35, fighting: 0.3 }, unlockAt: 60, cost: 170, yieldMin: 1, yieldMax: 3 },
  { id: "hollow_wood", levelMin: 10, levelMax: 18, name: "Hollow Wood", weights: { ghost: 0.3, psychic: 0.3, poison: 0.25, fairy: 0.15 }, unlockAt: 150, cost: 260, yieldMin: 1, yieldMax: 2 },
  { id: "tidal_caverns", levelMin: 14, levelMax: 24, name: "Tidal Caverns", weights: { water: 0.35, ice: 0.3, psychic: 0.2, dragon: 0.15 }, unlockAt: 260, cost: 340, yieldMin: 1, yieldMax: 2 },
  { id: "dragons_spine", levelMin: 18, levelMax: 30, name: "Dragon's Spine", weights: { dragon: 0.3, ice: 0.25, fighting: 0.25, rock: 0.2 }, unlockAt: 400, cost: 480, yieldMin: 1, yieldMax: 2 },
];

function makeRoute(def: RouteDef): Route {
  return {
    id: def.id,
    name: def.name,
    supply: supply(def.weights),
    unlockAt: def.unlockAt,
    cost: def.cost,
    yieldMin: def.yieldMin,
    yieldMax: def.yieldMax,
    levelMin: def.levelMin,
    levelMax: def.levelMax,
  };
}

export const ROUTES: readonly Route[] = DEFS.map(makeRoute);

export function routeById(id: string): Route | undefined {
  return ROUTES.find((r) => r.id === id);
}

/**
 * The expected power of a single draw from this route.
 *
 * A supply-weighted mean, because draws are uniform within a type pool — this
 * is the honest statistic, not a flourish. An upper percentile was tried first
 * and failed: nearly every Gen 1 type has a strong member, so the top end looks
 * identical everywhere and Dragon's Spine came out *commoner* than Verdant Path.
 */
export function routePower(route: Route): number {
  let total = 0;
  let weight = 0;

  for (const type of TYPES) {
    const share = route.supply[type];
    if (share <= 0) continue;

    const species = catalog.byType(type);
    if (species.length === 0) continue;

    const mean = species.reduce((sum, s) => sum + s.power, 0) / species.length;
    total += share * mean;
    weight += share;
  }
  return weight > 0 ? total / weight : 0;
}

/** Pivot for the rarity curve — roughly the weakest route's expected draw. */
const REFERENCE_POWER = 62;
/**
 * Higher makes strong routes rarer.
 *
 * It needs to be large because expected-draw power only spans about 63–76
 * across Gen 1: a narrow input range needs a steep curve to produce a rarity
 * spread anyone can feel. One knob, tuned against `scripts/routes-report.ts`.
 */
const RARITY_EXPONENT = 11;

/**
 * How often a route appears in an offer.
 *
 * Derived from the strength of what lives there, so a route full of Dragonites
 * shows up rarely without anyone having written down "rare". Adding a species to
 * the catalog automatically reprices every route that supplies its type.
 */
export function offerWeight(route: Route): number {
  const power = routePower(route);
  if (power <= 0) return 0;
  return (REFERENCE_POWER / power) ** RARITY_EXPONENT;
}

/** Routes whose unlock threshold this peak renown clears. */
export function routesUpTo(peak: number): Route[] {
  return ROUTES.filter((r) => r.unlockAt <= peak);
}
