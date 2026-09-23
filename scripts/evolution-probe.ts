/**
 * Redesign probe: do evolution lines actually finish across a season?
 *
 * Throwaway script per docs/plans/mechanics-starters-and-evolution.md step 4
 * (F2's Q4 risk) — not wired into src/sim; delete once EVOLUTION_STONE_CHANCE
 * is confirmed or retuned.
 *
 * resolveShop() in src/sim/season/engine.ts never rolls the Evolution Stone
 * offer headlessly (that's a UI-only step, per plan step 3) so this probe
 * reimplements the shop sequence with an "always accept if offered" policy
 * standing in for the player, then asks: of every party member that ever
 * reached stage 2 mid-run, what fraction reached the family's final stage
 * (stage 3, when one exists) by the run's end?
 *
 *   npx tsx scripts/evolution-probe.ts
 *   npx tsx scripts/evolution-probe.ts --seasons 500 --seed 1 --chance 0.4
 */
import { DEX } from "../src/data/species.dex.js";
import { chance, int } from "../src/sim/rng.js";
import { createRun, draftParty, startRun, resolveCurrentAnte } from "../src/sim/season/engine.js";
import { applyGrowth, evolutionCandidatesFor, applyEvolution, EVOLUTION_STONE_CHANCE } from "../src/sim/season/growth.js";
import { offerDoctrines, pickDoctrine, restParty, greedyRarityPolicy } from "../src/sim/season/doctrines.js";
import type { RunState } from "../src/sim/season/types.js";

interface Args {
  seasons: number;
  seed: number;
  chance: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string, fallback: number) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? Number(argv[i + 1]) : fallback;
  };
  return {
    seasons: get("--seasons", 500),
    seed: get("--seed", 1),
    chance: get("--chance", EVOLUTION_STONE_CHANCE),
  };
}

/** Runs one season, always taking the first offered Evolution Stone candidate when one appears, and returns every species slug any party member reached stage 2 at (keyed by family root) plus the party's final species set. */
function runSeason(seed: number, chanceOverride: number): { reachedStage2Families: Set<string>; finalSlugs: Set<string> } {
  let run: RunState = createRun(seed);
  run = draftParty(run);
  run = startRun(run);

  const reachedStage2Families = new Set<string>();

  const recordStage2 = (party: RunState["party"]) => {
    for (const f of party) {
      const species = DEX.find((d) => d.slug === f.slug);
      if (species && species.stage === 2) reachedStage2Families.add(f.slug);
    }
  };
  recordStage2(run.party);

  while (run.status === "active") {
    run = resolveCurrentAnte(run);
    if (run.status !== "shopping") continue;

    run = applyGrowth(run);

    if (chance(run.rng, chanceOverride)) {
      const candidates = evolutionCandidatesFor(run.party);
      if (candidates.length > 0) {
        const choice = candidates[int(run.rng, 0, candidates.length - 1)]!;
        run = { ...run, party: applyEvolution(run.party, choice.memberIndex, choice.target) };
      }
    }
    recordStage2(run.party);

    const doctrineOffer = offerDoctrines(run);
    let next = run;
    if (doctrineOffer.length > 0) {
      const doctrine = greedyRarityPolicy(doctrineOffer);
      next = pickDoctrine(run, doctrineOffer, doctrine);
    }
    run = { ...next, party: restParty(next.party), ante: run.ante + 1, status: "active" };
  }

  const finalSlugs = new Set(run.party.map((f) => f.slug));
  return { reachedStage2Families, finalSlugs };
}

function main() {
  const args = parseArgs();
  let eligible = 0; // reached stage 2, and the family has a stage 3
  let finished = 0; // ... and a party member of that family is at its final stage by season end

  for (let i = 0; i < args.seasons; i++) {
    const { reachedStage2Families, finalSlugs } = runSeason(args.seed + i, args.chance);
    for (const slug of reachedStage2Families) {
      const species = DEX.find((d) => d.slug === slug);
      if (!species || species.evolvesTo.length === 0) continue; // already final, nothing to finish
      eligible++;
      // Finished if the final party has this exact stage-2 species (still
      // mid-line, not counted) evolved into one of its direct targets —
      // stage 2 -> stage 3 is always a single hop in this roster.
      const didFinish = species.evolvesTo.some((target) => finalSlugs.has(target));
      if (didFinish) finished++;
    }
  }

  const rate = eligible > 0 ? ((finished / eligible) * 100).toFixed(1) : "n/a";
  console.log(`Evolution-probe over ${args.seasons} seasons (seed ${args.seed}, EVOLUTION_STONE_CHANCE ${args.chance})\n`);
  console.log(`eligible lines (reached stage 2, stage 3 exists): ${eligible}`);
  console.log(`finished by season end (reached their final stage): ${finished}`);
  console.log(`finish rate: ${rate}%`);
}

main();
