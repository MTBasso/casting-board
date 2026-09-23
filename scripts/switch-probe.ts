/**
 * Redesign probe: does a switch-only coach call carry real tension?
 *
 * Throwaway script per .claude/skills/redesign/SKILL.md step 3 — hand-fed
 * numbers, no UI, answers one question: "does the central tension hold up
 * repeated for N cycles." Not wired into src/sim; delete once the open
 * question in REDESIGN.md is settled.
 *
 * Battle model: 1-on-1, bench of 3-4, real type multipliers (reused from
 * src/data/typechart.ts), fatigue that decays an active mon's power the
 * longer it stays in and recovers while benched. The player's only lever
 * is when to swap the active mon; moves auto-resolve.
 *
 * Compares four switch policies across many simulated gym fights:
 *   - static:    never switches
 *   - random:    switches at random turns (control — isolates "any switch
 *                helps because fresh mon" from "good decisions help")
 *   - type-only: switches to the best type matchup, ignoring fatigue
 *   - full:      considers both fatigue and type
 *
 *   npx tsx scripts/switch-probe.ts
 *   npx tsx scripts/switch-probe.ts --fights 2000 --seed 7
 */
import type { TypeId } from "../src/sim/types.js";
import { effectivenessAgainst } from "../src/data/typechart.js";
import { DEX } from "../src/data/species.dex.js";

interface Args {
  fights: number;
  seed: number;
  bench: number;
  gymScale: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string, fallback: number) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? Number(argv[i + 1]) : fallback;
  };
  return {
    fights: get("--fights", 1000),
    seed: get("--seed", 1),
    bench: get("--bench", 4),
    gymScale: get("--gymScale", 1),
  };
}

// Small xorshift PRNG so runs are reproducible from --seed.
function makeRng(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s |= 0;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

interface Fighter {
  name: string;
  types: readonly TypeId[];
  power: number;
  maxHp: number;
  hp: number;
  fatigue: number; // 0 = fresh, 1 = fully tired
}

function toFighter(species: (typeof DEX)[number]): Fighter {
  const maxHp = 60 + species.stats.hp;
  return {
    name: species.name,
    types: species.types,
    power: species.power,
    maxHp,
    hp: maxHp,
    fatigue: 0,
  };
}

const FATIGUE_PER_TURN = 0.12;
const FATIGUE_RECOVERY_PER_TURN = 0.2;
const FATIGUE_POWER_FLOOR = 0.5; // power multiplier at full fatigue

function powerMult(f: Fighter): number {
  return 1 - f.fatigue * (1 - FATIGUE_POWER_FLOOR);
}

/** Every species has at least one type — this is just satisfying noUncheckedIndexedAccess. */
function primaryType(f: Fighter): TypeId {
  const t = f.types[0];
  if (!t) throw new Error(`fighter ${f.name} has no types`);
  return t;
}

function rosterSample(rng: () => number, n: number, scale = 1): Fighter[] {
  const pool = DEX.filter((s) => s.stage >= 2 || s.evolvesTo.length === 0);
  const picks: Fighter[] = [];
  for (let i = 0; i < n; i++) {
    const s = pool[Math.floor(rng() * pool.length)];
    if (!s) continue;
    const f = toFighter(s);
    f.power *= scale;
    f.maxHp *= scale;
    f.hp *= scale;
    picks.push(f);
  }
  return picks;
}

type Policy = "static" | "random" | "type-only" | "full";

function bestByType(active: Fighter, bench: Fighter[], oppTypes: readonly TypeId[]): Fighter | null {
  let best: Fighter | null = null;
  let bestScore = effectivenessAgainst(primaryType(active), oppTypes);
  for (const b of bench) {
    if (b.hp <= 0) continue;
    const score = effectivenessAgainst(primaryType(b), oppTypes);
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return best;
}

function bestByFullPicture(active: Fighter, bench: Fighter[], oppTypes: readonly TypeId[]): Fighter | null {
  const scoreOf = (f: Fighter) => effectivenessAgainst(primaryType(f), oppTypes) * powerMult(f);
  let best: Fighter | null = null;
  let bestScore = scoreOf(active);
  for (const b of bench) {
    if (b.hp <= 0) continue;
    const score = scoreOf(b);
    if (score > bestScore + 0.05) {
      bestScore = score;
      best = b;
    }
  }
  return best;
}

/** Runs one gym fight (player party vs a sequence of opposing mons) and returns whether the player cleared it. */
function runFight(
  policy: Policy,
  playerParty: Fighter[],
  gymParty: Fighter[],
  rng: () => number,
): { cleared: boolean; switches: number; consequentialSwitches: number } {
  const party = playerParty.map((f) => ({ ...f }));
  const first = party[0];
  if (!first) throw new Error("runFight requires a non-empty party");
  let active = first;
  let switches = 0;
  let consequentialSwitches = 0;
  const MAX_TURNS_PER_MON = 200; // safety cap: a 0x immune matchup can otherwise stalemate forever

  for (const oppTemplate of gymParty) {
    const opp: Fighter = { ...oppTemplate };
    let turns = 0;
    while (opp.hp > 0) {
      if (++turns > MAX_TURNS_PER_MON) return { cleared: false, switches, consequentialSwitches };
      if (active.hp <= 0) {
        const next = party.find((f) => f.hp > 0);
        if (!next) return { cleared: false, switches, consequentialSwitches };
        active = next;
      }

      const bench = party.filter((f) => f !== active);
      let swapTo: Fighter | null = null;
      if (policy === "random") {
        if (rng() < 0.25) {
          const alive = bench.filter((f) => f.hp > 0);
          if (alive.length > 0) swapTo = alive[Math.floor(rng() * alive.length)] ?? null;
        }
      } else if (policy === "type-only") {
        swapTo = bestByType(active, bench, opp.types);
      } else if (policy === "full") {
        swapTo = bestByFullPicture(active, bench, opp.types);
      }

      if (swapTo && swapTo.hp > 0) {
        // Would the switch have changed who's favored this exchange? Used to
        // gauge how often the decision is actually live vs a non-choice.
        const beforeEff = effectivenessAgainst(primaryType(active), opp.types) * powerMult(active);
        const afterEff = effectivenessAgainst(primaryType(swapTo), opp.types) * powerMult(swapTo);
        if (Math.abs(afterEff - beforeEff) > 0.3) consequentialSwitches++;
        active = swapTo;
        switches++;
      }

      // Auto-resolved exchange: both sides hit once.
      const atkMult = effectivenessAgainst(primaryType(active), opp.types) * powerMult(active);
      const dmgToOpp = active.power * atkMult * (0.85 + rng() * 0.3);
      opp.hp -= dmgToOpp;
      if (opp.hp <= 0) break;

      const defMult = effectivenessAgainst(primaryType(opp), active.types) * powerMult(opp);
      const dmgToActive = opp.power * defMult * (0.85 + rng() * 0.3) * 0.5;
      active.hp -= dmgToActive;

      active.fatigue = Math.min(1, active.fatigue + FATIGUE_PER_TURN);
      for (const f of bench) f.fatigue = Math.max(0, f.fatigue - FATIGUE_RECOVERY_PER_TURN);

      if (active.hp <= 0) {
        const next = party.find((f) => f !== active && f.hp > 0);
        if (!next) return { cleared: false, switches, consequentialSwitches };
      }
    }
  }
  return { cleared: true, switches, consequentialSwitches };
}

function main() {
  const args = parseArgs();
  const rng = makeRng(args.seed);
  const policies: Policy[] = ["static", "random", "type-only", "full"];
  const results: Record<Policy, { wins: number; switches: number; consequential: number }> = {
    static: { wins: 0, switches: 0, consequential: 0 },
    random: { wins: 0, switches: 0, consequential: 0 },
    "type-only": { wins: 0, switches: 0, consequential: 0 },
    full: { wins: 0, switches: 0, consequential: 0 },
  };

  for (let i = 0; i < args.fights; i++) {
    // Same matchup replayed across all four policies so the comparison
    // isn't muddied by different opponents/rosters between arms.
    const playerParty = rosterSample(rng, args.bench);
    const gymSize = 2 + Math.floor(rng() * 3); // 2-4 mon gym parties
    const gymParty = rosterSample(rng, gymSize, args.gymScale);

    for (const policy of policies) {
      const localRng = makeRng(Math.floor(rng() * 1_000_000) + 1);
      const r = runFight(policy, playerParty, gymParty, localRng);
      if (r.cleared) results[policy].wins++;
      results[policy].switches += r.switches;
      results[policy].consequential += r.consequentialSwitches;
    }
  }

  console.log(`Switch-probe over ${args.fights} fights (bench ${args.bench}, seed ${args.seed})\n`);
  console.log("policy      | clear rate | avg switches/fight | consequential switches/fight");
  console.log("------------|------------|--------------------|-----------------------------");
  for (const policy of policies) {
    const r = results[policy];
    const clearRate = ((r.wins / args.fights) * 100).toFixed(1);
    const avgSwitches = (r.switches / args.fights).toFixed(2);
    const avgConsequential = (r.consequential / args.fights).toFixed(2);
    console.log(
      `${policy.padEnd(11)} | ${clearRate.padStart(9)}% | ${avgSwitches.padStart(18)} | ${avgConsequential.padStart(28)}`,
    );
  }

  console.log(`\nstatic -> full clear-rate delta: ${(
    ((results.full.wins - results.static.wins) / args.fights) *
    100
  ).toFixed(1)} pts`);
  console.log(`random -> full clear-rate delta: ${(
    ((results.full.wins - results.random.wins) / args.fights) *
    100
  ).toFixed(1)} pts`);
  console.log(`type-only -> full clear-rate delta: ${(
    ((results.full.wins - results["type-only"].wins) / args.fights) *
    100
  ).toFixed(1)} pts`);
}

main();
