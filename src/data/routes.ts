import { catalog } from "./catalog.js";
import {
  TYPES,
  type LandmarkEffect,
  type Route,
  type TypeId,
  type TypeTally,
} from "../sim/types.js";
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
  levelMin: number;
  levelMax: number;
  neighbours: string[];
  at: { x: number; y: number };
  starting?: boolean;
  /** The creature that lives here and nowhere else. */
  resident: string;
  landmark: { name: string; blurb: string; effect: LandmarkEffect };
  /** How dangerous the ground is in itself, 0..1. */
  peril: number;
}

/**
 * The world, as a web.
 *
 * Sixteen places with loops in them, because loops are what make *where a crew
 * stands* matter: with a tree the shortest path to anything is fixed and the map
 * becomes a checklist. Three routes are open from the first hour; everything
 * else is reached by pushing on from ground you already know.
 *
 * Adjacency, positions, residents and landmarks are authored rather than
 * derived. Supply, level bands and difficulty are the parts that want deriving,
 * and they still are — a route's character is a design decision, its numbers are
 * a consequence.
 */
const DEFS: readonly RouteDef[] = [
  // --- The opening three -------------------------------------------------
  {
    id: "verdant_path", name: "Verdant Path", starting: true,
    levelMin: 2, levelMax: 8, peril: 0.05,
    weights: { grass: 0.3, bug: 0.25, poison: 0.25, normal: 0.2 },
    neighbours: ["hollow_wood", "quarry_flats", "millbrook"],
    at: { x: 30, y: 78 },
    resident: "sunkern",
    landmark: { name: "The Orchard Rows", blurb: "Somebody still tends these. There is always something in the branches.", effect: "plentiful" },
  },
  {
    id: "cinder_ridge", name: "Cinder Ridge", starting: true,
    levelMin: 3, levelMax: 9, peril: 0.12,
    weights: { fire: 0.4, rock: 0.3, ground: 0.3 },
    neighbours: ["quarry_flats", "ashfall_run"],
    at: { x: 58, y: 84 },
    resident: "slugma",
    landmark: { name: "The Warm Stones", blurb: "They hold the day's heat all night. A crew sleeps well here.", effect: "sheltered" },
  },
  {
    id: "coastal_road", name: "Coastal Road", starting: true,
    levelMin: 4, levelMax: 10, peril: 0.08,
    weights: { water: 0.4, flying: 0.25, normal: 0.2, ice: 0.15 },
    neighbours: ["millbrook", "saltwind_pier"],
    at: { x: 14, y: 62 },
    resident: "wingull",
    landmark: { name: "The Milestone", blurb: "Every distance on this coast is measured from here.", effect: "mapped" },
  },

  // --- The near ring -----------------------------------------------------
  {
    id: "millbrook", name: "Millbrook", levelMin: 5, levelMax: 11, peril: 0.1,
    weights: { water: 0.3, normal: 0.25, grass: 0.25, bug: 0.2 },
    neighbours: ["verdant_path", "coastal_road", "hollow_wood", "saltwind_pier"],
    at: { x: 20, y: 46 },
    resident: "poliwag",
    landmark: { name: "The Old Mill", blurb: "The wheel still turns. Traders stop here, and they pay well.", effect: "lucrative" },
  },
  {
    id: "quarry_flats", name: "Quarry Flats", levelMin: 6, levelMax: 12, peril: 0.16,
    weights: { ground: 0.35, rock: 0.35, fighting: 0.3 },
    neighbours: ["verdant_path", "cinder_ridge", "thunder_plain", "ashfall_run"],
    at: { x: 46, y: 62 },
    resident: "aron",
    landmark: { name: "The Cut Face", blurb: "A century of quarrying laid the whole hillside open.", effect: "storied" },
  },
  {
    id: "hollow_wood", name: "Hollow Wood", levelMin: 10, levelMax: 18, peril: 0.28,
    weights: { ghost: 0.3, psychic: 0.3, poison: 0.25, fairy: 0.15 },
    neighbours: ["verdant_path", "millbrook", "gloaming_fen", "thunder_plain"],
    at: { x: 34, y: 34 },
    resident: "misdreavus",
    landmark: { name: "The Lantern Tree", blurb: "Somebody hangs a light here. Nobody has ever seen who.", effect: "sheltered" },
  },
  {
    id: "saltwind_pier", name: "Saltwind Pier", levelMin: 7, levelMax: 14, peril: 0.14,
    weights: { water: 0.4, flying: 0.3, ice: 0.15, steel: 0.15 },
    neighbours: ["coastal_road", "millbrook", "tidal_caverns"],
    at: { x: 6, y: 34 },
    resident: "tentacool",
    landmark: { name: "The Long Jetty", blurb: "Reaches further out than any boat needs. Good fishing at the end.", effect: "plentiful" },
  },
  {
    id: "ashfall_run", name: "Ashfall Run", levelMin: 9, levelMax: 16, peril: 0.3,
    weights: { fire: 0.35, ground: 0.25, dark: 0.2, rock: 0.2 },
    neighbours: ["cinder_ridge", "quarry_flats", "emberworks"],
    at: { x: 70, y: 64 },
    resident: "numel",
    landmark: { name: "The Grey Fall", blurb: "Ash drifts here like snow, and hides what is underfoot.", effect: "storied" },
  },
  {
    id: "thunder_plain", name: "Thunder Plain", levelMin: 6, levelMax: 13, peril: 0.18,
    weights: { electric: 0.4, normal: 0.25, flying: 0.2, steel: 0.15 },
    neighbours: ["quarry_flats", "hollow_wood", "emberworks", "the_stillfields"],
    at: { x: 56, y: 42 },
    resident: "mareep",
    landmark: { name: "The Iron Pylons", blurb: "Long dead, still humming. Nobody remembers what they carried.", effect: "mapped" },
  },

  // --- The far reaches ---------------------------------------------------
  {
    id: "gloaming_fen", name: "Gloaming Fen", levelMin: 13, levelMax: 21, peril: 0.36,
    weights: { poison: 0.3, ghost: 0.25, water: 0.25, dark: 0.2 },
    neighbours: ["hollow_wood", "the_stillfields", "tidal_caverns"],
    at: { x: 26, y: 18 },
    resident: "croagunk",
    landmark: { name: "The Sunken Road", blurb: "It goes somewhere. Half of it is under the water.", effect: "lucrative" },
  },
  {
    id: "emberworks", name: "The Emberworks", levelMin: 14, levelMax: 22, peril: 0.34,
    weights: { steel: 0.35, fire: 0.3, electric: 0.2, poison: 0.15 },
    neighbours: ["ashfall_run", "thunder_plain", "kiln_reach"],
    at: { x: 74, y: 40 },
    resident: "magnemite",
    landmark: { name: "The Cold Furnace", blurb: "Out for thirty years. Things nest in it now.", effect: "sheltered" },
  },
  {
    id: "tidal_caverns", name: "Tidal Caverns", levelMin: 14, levelMax: 24, peril: 0.38,
    weights: { water: 0.35, ice: 0.3, psychic: 0.2, dragon: 0.15 },
    neighbours: ["saltwind_pier", "gloaming_fen", "hoarfrost_shelf"],
    at: { x: 8, y: 12 },
    resident: "shellder",
    landmark: { name: "The Tide Clock", blurb: "The water comes to the same mark, to the minute, every time.", effect: "mapped" },
  },
  {
    id: "the_stillfields", name: "The Stillfields", levelMin: 16, levelMax: 25, peril: 0.4,
    weights: { psychic: 0.35, fairy: 0.25, normal: 0.2, grass: 0.2 },
    neighbours: ["thunder_plain", "gloaming_fen", "hoarfrost_shelf", "dragons_spine"],
    at: { x: 44, y: 14 },
    resident: "ralts",
    landmark: { name: "The Standing Circle", blurb: "Older than the league. Creatures gather here and nobody knows why.", effect: "storied" },
  },
  {
    id: "kiln_reach", name: "Kiln Reach", levelMin: 18, levelMax: 27, peril: 0.46,
    weights: { fire: 0.3, dragon: 0.25, rock: 0.25, dark: 0.2 },
    neighbours: ["emberworks", "dragons_spine"],
    at: { x: 86, y: 20 },
    resident: "trapinch",
    landmark: { name: "The Glassed Plain", blurb: "Something burned here hot enough to turn the sand to glass.", effect: "lucrative" },
  },
  {
    id: "hoarfrost_shelf", name: "Hoarfrost Shelf", levelMin: 19, levelMax: 28, peril: 0.5,
    weights: { ice: 0.4, water: 0.2, steel: 0.2, flying: 0.2 },
    neighbours: ["tidal_caverns", "the_stillfields"],
    at: { x: 20, y: 4 },
    resident: "snorunt",
    landmark: { name: "The Blue Crevasse", blurb: "You can see forty years down it. Something moves at the bottom.", effect: "storied" },
  },
  {
    id: "dragons_spine", name: "Dragon's Spine", levelMin: 22, levelMax: 32, peril: 0.6,
    weights: { dragon: 0.3, ice: 0.25, fighting: 0.25, rock: 0.2 },
    neighbours: ["the_stillfields", "kiln_reach"],
    at: { x: 66, y: 6 },
    resident: "bagon",
    landmark: { name: "The Last Ridge", blurb: "Nothing beyond it has been mapped. People keep going anyway.", effect: "plentiful" },
  },
];

function makeRoute(def: RouteDef): Route {
  return {
    id: def.id,
    name: def.name,
    supply: supply(def.weights),
    levelMin: def.levelMin,
    levelMax: def.levelMax,
    neighbours: def.neighbours,
    at: def.at,
    starting: def.starting ?? false,
    resident: def.resident,
    landmark: def.landmark,
    peril: def.peril,
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

/** The ground a league starts knowing, before it has explored anything. */
export function startingRoutes(): Route[] {
  return ROUTES.filter((r) => r.starting);
}

/** Everywhere you could push on to from here. */
export function neighboursOf(routeId: string): Route[] {
  const route = routeById(routeId);
  if (!route) return [];
  return route.neighbours
    .map((id) => routeById(id))
    .filter((r): r is Route => r !== undefined);
}
