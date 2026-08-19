import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Trainer portraits.
 *
 * Every trainer in the league is a person with a name, a type and a posting, and
 * until now they all looked like nothing at all. These are the Pokémon Showdown
 * trainer sprites, vendored rather than hotlinked — the app is a PWA with a
 * strict offline story, and an asset it cannot cache is an asset it does not
 * really have.
 *
 * Two rules the casting obeys, both of them the player's:
 *
 *   - **A portrait respects the type.** No Fire specialist wearing a Bug
 *     Catcher's hat. Every class listed under a type is someone who could
 *     plausibly specialise in it.
 *   - **Rank matters.** Youngsters and schoolkids never hold a league post.
 *     Gym Leaders, Elite seats and Champions draw from `senior` — canon Leaders
 *     of that type where they exist, and dignified generics where they do not.
 *
 * Committed output, like the dex. Run when the pools change:
 *
 *   npx tsx scripts/fetch-trainers.ts
 */

const BASE = "https://play.pokemonshowdown.com/sprites/trainers";

/**
 * Who can look like what.
 *
 * `senior` is league-worthy: canon Gym Leaders and Elite members of the type,
 * plus veterans and ace trainers where the canon roster is thin. `junior` is
 * everyone else — the classes you meet on a route, which is exactly what a Gym
 * Trainer, a Ranger or a Handler is.
 */
const LOOKS: Record<string, { senior: string[]; junior: string[] }> = {
  normal:   { senior: ["whitney", "norman", "veteran", "veteranf"],       junior: ["youngster", "lass", "schoolkid", "camper", "picnicker", "pokefan", "pokefanf", "teacher"] },
  fire:     { senior: ["blaine", "flannery"],                             junior: ["firebreather", "biker", "roughneck", "camper"] },
  water:    { senior: ["misty", "wallace", "juan", "crasherwake"],         junior: ["swimmer", "swimmerf", "fisherman", "sailor", "tuber", "tuberf"] },
  electric: { senior: ["ltsurge", "wattson", "volkner"],                   junior: ["guitarist", "scientist", "scientistf", "officeworker", "worker"] },
  grass:    { senior: ["erika", "gardenia"],                               junior: ["aromalady", "gardener", "picnicker", "rancher", "camper"] },
  ice:      { senior: ["pryce", "candice", "glacia"],                      junior: ["skier", "skierf", "workerice"] },
  fighting: { senior: ["brawly", "chuck", "maylene", "bruno"],             junior: ["blackbelt", "battlegirl", "striker", "smasher", "linebacker"] },
  poison:   { senior: ["koga", "veteran"],                                 junior: ["burglar", "punkguy", "punkgirl", "biker"] },
  ground:   { senior: ["giovanni", "bertha"],                              junior: ["hiker", "ruinmaniac", "worker", "rancher"] },
  flying:   { senior: ["falkner", "winona", "skyla"],                      junior: ["birdkeeper", "pilot", "cyclist", "cyclistf"] },
  psychic:  { senior: ["sabrina", "tate", "liza", "will", "lucian"],       junior: ["psychic", "psychicf", "medium", "supernerd"] },
  bug:      { senior: ["bugsy", "aaron"],                                  junior: ["bugcatcher", "ninjaboy", "picnicker"] },
  rock:     { senior: ["brock", "roxanne", "roark"],                       junior: ["hiker", "ruinmaniac", "collector", "worker"] },
  ghost:    { senior: ["morty", "fantina"],                                junior: ["medium", "madame", "artist", "psychicf"] },
  dragon:   { senior: ["clair", "lance"],                         junior: ["dragontamer", "acetrainer", "acetrainerf"] },
  dark:     { senior: ["karen", "sidney"],                                 junior: ["punkguy", "punkgirl", "biker", "roughneck", "burglar"] },
  steel:    { senior: ["jasmine", "byron", "steven"],                      junior: ["worker", "scientist", "officeworker", "policeman"] },
  fairy:    { senior: ["valerie", "veteranf", "lady"],                     junior: ["parasollady", "beauty", "madame", "twins"] },
};

/** The Champion always looks the part, whatever they specialise in. */
const CHAMPIONS = ["cynthia", "steven", "lance", "wallace"];

const wanted = new Set<string>(CHAMPIONS);
for (const pools of Object.values(LOOKS)) {
  for (const name of [...pools.senior, ...pools.junior]) wanted.add(name);
}

const dir = join(process.cwd(), "public", "trainers");
mkdirSync(dir, { recursive: true });

let fetched = 0;
let skipped = 0;
const missing: string[] = [];

for (const name of [...wanted].sort()) {
  const out = join(dir, `${name}.png`);
  if (existsSync(out)) {
    skipped += 1;
    continue;
  }
  const res = await fetch(`${BASE}/${name}.png`);
  if (!res.ok) {
    missing.push(name);
    continue;
  }
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  fetched += 1;
}

if (missing.length > 0) {
  console.error(`Missing upstream: ${missing.join(", ")}`);
  process.exitCode = 1;
}

const lines = Object.entries(LOOKS).map(
  ([type, p]) =>
    `  ${type}: {\n    senior: [${p.senior.map((n) => `"${n}"`).join(", ")}],\n    junior: [${p.junior.map((n) => `"${n}"`).join(", ")}],\n  },`,
);

writeFileSync(
  join(process.cwd(), "src", "data", "trainerLooks.ts"),
  `// Generated by scripts/fetch-trainers.ts. Do not edit by hand.
//
// Who can look like what. Two rules, both of them the player's:
//
//   - a portrait respects the trainer's type — no Fire specialist in a Bug
//     Catcher's hat;
//   - rank matters — youngsters and schoolkids never hold a league post, so
//     Leaders, Elite seats and Champions draw only from \`senior\`.

export interface LookPool {
  /** League-worthy: canon Leaders of the type, and veterans where thin. */
  readonly senior: readonly string[];
  /** Route classes — Gym Trainers, Rangers, Handlers. */
  readonly junior: readonly string[];
}

/** The Champion looks the part whatever they specialise in. */
export const CHAMPION_LOOKS: readonly string[] = [${CHAMPIONS.map((n) => `"${n}"`).join(", ")}];

export const TRAINER_LOOKS: Record<string, LookPool> = {
${lines.join("\n")}
};
`,
);

console.log(`Trainer portraits: ${fetched} fetched, ${skipped} already present.`);
