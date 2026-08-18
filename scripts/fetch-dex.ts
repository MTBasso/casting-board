/**
 * Generates the species table (Gens 1-3) and downloads its animated sprites.
 *
 *   npx tsx scripts/fetch-dex.ts
 *
 * Output is committed, so builds and CI never touch the network. Re-run only
 * when the creature layer needs to change — which, per the design doc, is the
 * seam a reskin to original monsters would go through.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEX_COUNT = 386;
const OUT_TS = resolve("src/data/species.dex.ts");
const SPRITE_DIR = resolve("public/sprites");
const ICON_DIR = resolve("public/icons");

/**
 * Starter lines are excluded from wild encounters entirely — they get their own
 * acquisition mechanic. Three families per generation, nine species each.
 */
const STARTER_IDS = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, // Kanto
  152, 153, 154, 155, 156, 157, 158, 159, 160, // Johto
  252, 253, 254, 255, 256, 257, 258, 259, 260, // Hoenn
]);

interface ApiType { slot: number; type: { name: string } }
interface ApiStat { base_stat: number; stat: { name: string } }
interface ApiPokemon { id: number; name: string; types: ApiType[]; stats: ApiStat[] }

interface ApiSpecies {
  id: number;
  name: string;
  is_legendary: boolean;
  is_mythical: boolean;
  evolves_from_species: { name: string } | null;
  evolution_chain: { url: string };
}

interface ChainLink {
  species: { name: string };
  evolution_details: { min_level: number | null }[];
  evolves_to: ChainLink[];
}
interface ApiChain { id: number; chain: ChainLink }

interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

interface Row {
  id: number;
  slug: string;
  name: string;
  types: string[];
  bst: number;
  stats: BaseStats;
  evolvesFrom: string | null;
  evolvesTo: string[];
  evolveLevel: number | null;
  stage: number;
  isStarter: boolean;
  isLegendary: boolean;
}

function readStats(stats: ApiStat[]): BaseStats {
  const by = (name: string) =>
    stats.find((s) => s.stat.name === name)?.base_stat ?? 1;
  return {
    hp: by("hp"),
    attack: by("attack"),
    defense: by("defense"),
    spAttack: by("special-attack"),
    spDefense: by("special-defense"),
    speed: by("speed"),
  };
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}

/**
 * Base stat totals in Gen 1 run about 195 (Caterpie) to 680 (Mewtwo).
 * Dividing by six lands power in a ~32–113 band, which is the range the sim's
 * challenger scaling is tuned against.
 */
function powerFromBst(bst: number): number {
  return Math.round(bst / 6);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string, attempt = 0): Promise<T> {
  const res = await fetch(url);
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) throw new Error(`${url} → HTTP ${res.status} after retries`);
    await sleep(500 * 2 ** attempt);
    return getJson<T>(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Gen 5 animated sprites, with the static ones as a fallback.
 *
 * Black/White animated GIFs exist for every Pokémon up to Gen 5, so all 151 are
 * covered — and a creature that breathes reads as a character rather than an
 * icon, which matters in a game about getting attached to them.
 */
const ANIMATED =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated";
const STATIC = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

async function fetchBinary(url: string, attempt = 0): Promise<Buffer | null> {
  const res = await fetch(url);
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) throw new Error(`${url} → HTTP ${res.status} after retries`);
    await sleep(500 * 2 ** attempt);
    return fetchBinary(url, attempt + 1);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const missingAnimated: number[] = [];
const ICONS =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-viii/icons";

/**
 * The little box icons.
 *
 * Where a 56px sprite would crowd a row — the available list, party summaries —
 * these read instantly at a fraction of the space, which is exactly the job
 * they do in the games' own PC.
 */
async function fetchIcon(id: number): Promise<void> {
  const png = await fetchBinary(`${ICONS}/${id}.png`);
  if (png) await writeFile(resolve(ICON_DIR, `${id}.png`), png);
}

async function fetchSprite(id: number): Promise<void> {
  const gif = await fetchBinary(`${ANIMATED}/${id}.gif`);
  if (gif) {
    await writeFile(resolve(SPRITE_DIR, `${id}.gif`), gif);
    return;
  }
  missingAnimated.push(id);
  const png = await fetchBinary(`${STATIC}/${id}.png`);
  if (png) await writeFile(resolve(SPRITE_DIR, `${id}.png`), png);
}

/** Small concurrency pool — PokeAPI is free, so don't hammer it. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      if (item === undefined) continue;
      out[index] = await fn(item);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return out;
}

interface EvoNode {
  /** Every form this can become. Eevee branches three ways in Gen 1. */
  to: string[];
  level: number | null;
  parent: string | null;
}

/**
 * Walk an evolution chain into a flat map.
 *
 * Keeps *all* branches — Eevee has three Gen 1 evolutions and taking only the
 * first would silently delete two of them. Stone and trade evolutions carry no
 * `min_level`, so they get a synthetic one by depth: the sim needs some level
 * for every evolution and there is no item economy yet.
 */
function walkChain(link: ChainLink, depth: number, out: Map<string, EvoNode>): void {
  const declared = link.evolves_to
    .flatMap((child) => child.evolution_details)
    .find((d) => d.min_level !== null)?.min_level ?? null;

  out.set(link.species.name, {
    to: link.evolves_to.map((child) => child.species.name),
    level: link.evolves_to.length > 0 ? (declared ?? (depth === 0 ? 16 : 32)) : null,
    parent: null,
  });

  for (const child of link.evolves_to) {
    walkChain(child, depth + 1, out);
    const node = out.get(child.species.name);
    if (node) node.parent = link.species.name;
  }
}

async function main(): Promise<void> {
  await mkdir(SPRITE_DIR, { recursive: true });
  await mkdir(ICON_DIR, { recursive: true });
  const ids = Array.from({ length: DEX_COUNT }, (_, i) => i + 1);

  process.stdout.write(`Fetching ${DEX_COUNT} pokemon... `);
  const mons = await pool(ids, 8, (id) =>
    getJson<ApiPokemon>(`https://pokeapi.co/api/v2/pokemon/${id}`),
  );
  process.stdout.write("done\n");

  process.stdout.write(`Fetching ${DEX_COUNT} species... `);
  const species = await pool(ids, 8, (id) =>
    getJson<ApiSpecies>(`https://pokeapi.co/api/v2/pokemon-species/${id}`),
  );
  process.stdout.write("done\n");

  const chainUrls = [...new Set(species.map((s) => s.evolution_chain.url))];
  process.stdout.write(`Fetching ${chainUrls.length} evolution chains... `);
  const chains = await pool(chainUrls, 6, (url) => getJson<ApiChain>(url));
  process.stdout.write("done\n");

  const evo = new Map<string, EvoNode>();
  for (const chain of chains) walkChain(chain.chain, 0, evo);

  // Chains include later generations — Pikachu "evolves from" Pichu, Snorlax
  // from Munchlax. Clamp everything to the 151 we actually ship, or those
  // species come out mis-staged and pointing at forms that do not exist here.
  const gen1 = new Set(mons.map((m) => m.name));

  function parentInGen1(slug: string): string | null {
    const parent = evo.get(slug)?.parent ?? null;
    return parent !== null && gen1.has(parent) ? parent : null;
  }

  function stageOf(slug: string): number {
    let depth = 1;
    let cursor = parentInGen1(slug);
    while (cursor !== null && depth < 5) {
      depth += 1;
      cursor = parentInGen1(cursor);
    }
    return depth;
  }

  const rows: Row[] = mons.map((mon, i) => {
    const spec = species[i];
    const node = evo.get(mon.name);
    const to = (node?.to ?? []).filter((name) => gen1.has(name));
    const declaredParent = spec?.evolves_from_species?.name ?? null;

    return {
      id: mon.id,
      slug: mon.name,
      name: titleCase(mon.name),
      types: [...mon.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
      bst: mon.stats.reduce((sum, s) => sum + s.base_stat, 0),
      stats: readStats(mon.stats),
      evolvesFrom:
        declaredParent !== null && gen1.has(declaredParent) ? declaredParent : null,
      evolvesTo: to,
      evolveLevel: to.length > 0 ? (node?.level ?? 32) : null,
      stage: stageOf(mon.name),
      isStarter: STARTER_IDS.has(mon.id),
      isLegendary: (spec?.is_legendary ?? false) || (spec?.is_mythical ?? false),
    };
  });

  const entries = rows
    .map((r) => {
      const types = r.types.map((t) => `"${t}"`).join(", ");
      const from = r.evolvesFrom ? `"${r.evolvesFrom}"` : "null";
      const to = `[${r.evolvesTo.map((t) => `"${t}"`).join(", ")}]`;
      const st = r.stats;
      return (
        `  { id: ${r.id}, slug: "${r.slug}", name: "${r.name}", types: [${types}], ` +
        `power: ${powerFromBst(r.bst)}, stage: ${r.stage}, evolvesFrom: ${from}, ` +
        `evolvesTo: ${to}, evolveLevel: ${r.evolveLevel}, ` +
        `isStarter: ${r.isStarter}, isLegendary: ${r.isLegendary}, ` +
        `stats: { hp: ${st.hp}, attack: ${st.attack}, defense: ${st.defense}, ` +
        `spAttack: ${st.spAttack}, spDefense: ${st.spDefense}, speed: ${st.speed} } },`
      );
    })
    .join("\n");

  const file = `// GENERATED by scripts/fetch-dex.ts — do not edit by hand.
// Source: PokeAPI. Power is derived from base stat total (BST / 6).
// Evolution levels come from the API where declared; stone and trade
// evolutions get a synthetic level by chain depth, since no item economy exists.
import type { Species } from "./catalog.js";

export const DEX: readonly Species[] = [
${entries}
];
`;

  await writeFile(OUT_TS, file, "utf8");
  console.log(`Wrote ${OUT_TS} (${rows.length} species)`);

  process.stdout.write(`Downloading ${DEX_COUNT} animated sprites... `);
  await pool(ids, 3, (id) => fetchSprite(id));
  process.stdout.write("done\n");

  process.stdout.write(`Downloading ${DEX_COUNT} box icons... `);
  await pool(ids, 4, (id) => fetchIcon(id));
  process.stdout.write("done\n");
  console.log(`Wrote ${SPRITE_DIR}/`);
  if (missingAnimated.length > 0) {
    console.log(
      `  No animated sprite for ${missingAnimated.length}: ${missingAnimated.join(", ")} (fell back to static)`,
    );
  }
}

void main();
