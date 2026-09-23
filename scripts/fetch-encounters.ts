/**
 * Generates the Johto encounter tables from the games' own data.
 *
 *   npx tsx scripts/fetch-encounters.ts
 *
 * Output is committed, so builds and CI never touch the network — the same rule
 * `fetch-dex.ts` follows. Re-run only when the map changes shape.
 *
 * Where the numbers come from: PokéAPI's location-area encounters, filtered to
 * the HeartGold version. That gives which species live where, at what levels,
 * and how often — so a route's character stops being authored and starts being
 * a fact about the region. What stays authored is the map's *shape*: PokéAPI
 * knows Route 32's inhabitants, not that Route 32 runs south out of Violet.
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const OUT = resolve("src/data/encounters.ts");
const API = "https://pokeapi.co/api/v2";

/** The dex this game ships. Anything past it is a Gen 4 species we do not have. */
const DEX_COUNT = 386;

/**
 * Ways of meeting a creature that count as *working the ground*.
 *
 * Rods are excluded outright: they put level-40 Poliwag on a level-3 starting
 * route, which is a fishing mechanic the game does not have rather than a fact
 * about the route. Surf is a fallback rather than an inclusion — see below.
 */
const LAND_METHODS = new Set(["walk", "headbutt", "rock-smash"]);
const WATER_METHODS = new Set(["surf"]);

/**
 * My ids to PokéAPI's areas.
 *
 * Multi-floor caves are several areas and get merged: a player thinks of Union
 * Cave as one place, and the level band across its floors is the honest range.
 *
 * Routes 38/39 are merged onto their lower number: there is no town between
 * them, and the graph needs a node at every joint, so merging keeps both
 * tables reachable rather than dropping one road's species.
 */
const AREAS: Record<string, readonly string[]> = {
  // --- Numbered roads ----------------------------------------------------
  route_29: ["johto-route-29-area"],
  route_30: ["johto-route-30-area"],
  route_31: ["johto-route-31-area"],
  route_32: ["johto-route-32-area"],
  route_33: ["johto-route-33-area"],
  route_34: ["johto-route-34-area"],
  route_35: ["johto-route-35-area"],
  route_36: ["johto-route-36-area"],
  route_37: ["johto-route-37-area"],
  route_38: ["johto-route-38-area", "johto-route-39-area"],
  // Routes 40 and 41 are open water and have no land area of their own.
  // The crossing is stocked from the sea on both shores, which is literally
  // what a crew rowing between them would meet.
  route_40: ["olivine-city-area", "cianwood-city-area"],
  route_42: ["johto-route-42-area"],
  route_43: ["johto-route-43-area"],
  route_44: ["johto-route-44-area"],
  route_45: ["johto-route-45-area"],
  route_46: ["johto-route-46-area"],

  // --- Landmarks ---------------------------------------------------------
  // A landmark is a node, and only roads are worked — so these tables are
  // folded into whichever roads touch them. Nothing here is unreachable.
  ruins_of_alph: ["ruins-of-alph-outside"],
  union_cave: ["union-cave-1f", "union-cave-b1f", "union-cave-b2f"],
  slowpoke_well: ["slowpoke-well-1f", "slowpoke-well-b1f"],
  ilex_forest: ["ilex-forest-area"],
  national_park: ["national-park-area"],
  burned_tower: ["burned-tower-1f", "burned-tower-b1f"],
  mt_mortar: ["mt-mortar-1f", "mt-mortar-lower-cave", "mt-mortar-upper-cave"],
  lake_of_rage: ["lake-of-rage-area"],
  ice_path: ["ice-path-1f", "ice-path-b1f", "ice-path-b2f"],
  dragons_den: ["dragons-den-area"],
  dark_cave: ["dark-cave-violet-city-entrance", "dark-cave-blackthorn-city-entrance"],
  sprout_tower: ["sprout-tower-2f", "sprout-tower-3f"],
};

interface Encounter {
  species: string;
  /** Relative frequency, summed across every way of meeting it. */
  weight: number;
  min: number;
  max: number;
}

interface RawDetail {
  chance: number;
  min_level: number;
  max_level: number;
  method: { name: string };
}

interface RawArea {
  pokemon_encounters: {
    pokemon: { name: string; url: string };
    version_details: {
      version: { name: string };
      encounter_details: RawDetail[];
    }[];
  }[];
}

const dexId = (url: string): number => Number(url.split("/").filter(Boolean).pop());

async function fetchArea(slug: string): Promise<RawArea> {
  const res = await fetch(`${API}/location-area/${slug}/`);
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  return (await res.json()) as RawArea;
}

/**
 * One place's table.
 *
 * Land encounters are preferred; a place that has none at all — open water, or
 * a cave whose floor is a lake — falls back to Surf, so sea roads are not empty
 * rather than being padded with fishing everywhere.
 */
function tableFor(areas: RawArea[]): Encounter[] {
  const pick = (methods: Set<string>): Map<string, Encounter> => {
    const found = new Map<string, Encounter>();
    for (const area of areas) {
      for (const pe of area.pokemon_encounters) {
        const id = dexId(pe.pokemon.url);
        if (id > DEX_COUNT) continue;

        const hg = pe.version_details.find((v) => v.version.name === "heartgold");
        if (!hg) continue;

        const details = hg.encounter_details.filter((d) => methods.has(d.method.name));
        if (details.length === 0) continue;

        const weight = details.reduce((a, d) => a + d.chance, 0);
        const min = Math.min(...details.map((d) => d.min_level));
        const max = Math.max(...details.map((d) => d.max_level));

        const prev = found.get(pe.pokemon.name);
        found.set(pe.pokemon.name, prev
          ? { species: pe.pokemon.name, weight: prev.weight + weight, min: Math.min(prev.min, min), max: Math.max(prev.max, max) }
          : { species: pe.pokemon.name, weight, min, max });
      }
    }
    return found;
  };

  const land = pick(LAND_METHODS);
  const table = land.size > 0 ? land : pick(WATER_METHODS);
  return [...table.values()].sort((a, b) => b.weight - a.weight);
}

async function main(): Promise<void> {
  const out: Record<string, Encounter[]> = {};
  const report: string[] = [];

  for (const [id, slugs] of Object.entries(AREAS)) {
    const areas: RawArea[] = [];
    for (const slug of slugs) {
      areas.push(await fetchArea(slug));
      // A public, rate-limited service. There is no hurry here.
      await new Promise((r) => setTimeout(r, 120));
    }
    const table = tableFor(areas);
    out[id] = table;
    const lo = Math.min(...table.map((e) => e.min));
    const hi = Math.max(...table.map((e) => e.max));
    report.push(
      `  ${id.padEnd(16)} ${String(table.length).padStart(2)} species  Lv${lo}-${hi}  ` +
      table.slice(0, 4).map((e) => e.species).join(", "),
    );
  }

  const body = `// Generated by scripts/fetch-encounters.ts. Do not edit by hand.
//
// What lives on each piece of Johto, taken from HeartGold's own encounter
// tables. Levels and frequencies are the games'; which roads join which towns
// is authored in places.ts and routes.ts, because that is map shape rather than
// wildlife.
//
// Rod encounters are excluded — they put level-40 Poliwag on a level-3 route.
// Species past #${DEX_COUNT} are excluded too; this game's dex stops there.

export interface Encounter {
  species: string;
  /** Relative frequency within this table. Need not be normalized. */
  weight: number;
  min: number;
  max: number;
}

export const ENCOUNTERS: Record<string, readonly Encounter[]> = ${JSON.stringify(out, null, 2)};
`;

  await writeFile(OUT, body, "utf8");
  console.log(`\nWrote ${OUT}\n`);
  console.log(report.join("\n"));
}

await main();
