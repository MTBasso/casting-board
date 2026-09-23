/**
 * Season/Ante run engine — slices 1-5 of the redesign (REDESIGN.md).
 *
 * The run owns its own party (drafted at season start, grown by shop
 * Doctrines and the mid-run growth pipelines in growth.ts: catches, eggs,
 * trades) instead of callers threading one through each call.
 */
import { TYPES, type TypeId } from "../types.js";
import { int, pick } from "../rng.js";
import { DEX } from "../../data/species.dex.js";
import { makeFighter, autoResolveBattle, type BattleState, type FighterState } from "./battle.js";
import { runDraft, type DraftPolicy } from "./draft.js";
import { offerDoctrines, pickDoctrine, restParty, greedyRarityPolicy, type ShopPolicy } from "./doctrines.js";
import { hasExtraLifeAvailable, consumeExtraLife } from "./sacrifice.js";
import { applyGrowth } from "./growth.js";
import { gymPartySizeFor, gymScaleFor } from "./gym.js";
import type { RunState, LeagueCharter, AnteOutcome } from "./types.js";

const CURRENT_VERSION = 1;
const DEFAULT_MAX_ANTES = 8;
/** Fully-evolved (or non-evolving) species only — a gym leader doesn't field a Caterpie. */
const GYM_POOL = DEX.filter((s) => s.evolvesTo.length === 0);

export { gymPartySizeFor };

function makeCharter(rng: RunState["rng"]): LeagueCharter {
  // Each season fields a random subset of types to keep drafts/shops from
  // repeating the same puzzle every run (REDESIGN.md "Season variance").
  const liveTypes: TypeId[] = [];
  const pool = [...TYPES];
  const count = 10 + int(rng, 0, 3); // 10-13 of 18 types live
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = int(rng, 0, pool.length - 1);
    const [picked] = pool.splice(idx, 1);
    if (picked) liveTypes.push(picked);
  }
  return { liveTypes };
}

export function createRun(seed: number, maxAntes = DEFAULT_MAX_ANTES): RunState {
  const rng = { seed };
  return {
    version: CURRENT_VERSION,
    rng,
    charter: makeCharter(rng),
    maxAntes,
    ante: 0,
    status: "draft",
    history: [],
    party: [],
    doctrines: [],
    extraLifeUsed: false,
  };
}

/**
 * Fills the party from the draft pool, weighted by Mentors carried in from a
 * Career (career.ts) if any are passed. No-op outside the draft phase or if
 * already drafted.
 */
export function draftParty(run: RunState, policy?: DraftPolicy, mentorSlugs: readonly string[] = []): RunState {
  if (run.status !== "draft" || run.party.length > 0) return run;
  const rng = { seed: run.rng.seed };
  const party = runDraft(rng, policy, undefined, mentorSlugs);
  return { ...run, rng, party };
}

/** Leaves the draft phase and opens Ante 1. Requires a drafted party. */
export function startRun(run: RunState): RunState {
  if (run.status !== "draft" || run.party.length === 0) return run;
  return { ...run, status: "active", ante: 1 };
}

/** Draws a gym party, biased toward the season's live Charter types when possible. */
/** The Ante's opposing party, biased toward the season's live Charter types when possible. Exported so a real coach-call UI can build the same matchup an auto-resolved run would face. */
export function gymPartyFor(run: RunState): FighterState[] {
  const size = gymPartySizeFor(run.ante, run.maxAntes);
  const scale = gymScaleFor(run.ante, run.maxAntes);
  const onCharter = GYM_POOL.filter((s) => s.types.some((t) => run.charter.liveTypes.includes(t)));
  const pool = onCharter.length > 0 ? onCharter : GYM_POOL;
  const party: FighterState[] = [];
  for (let i = 0; i < size; i++) {
    party.push(makeFighter(pick(run.rng, pool), scale));
  }
  return party;
}

/**
 * Applies an already-fought Ante's result to the run — the extra-life,
 * win/loss/shopping branching that both the headless auto-resolve
 * (resolveCurrentAnte) and a real coach-call UI (which fights the battle
 * turn-by-turn with switchActive/resolveTurn from battle.ts, then hands the
 * finished BattleState here) share, so the two paths can never disagree
 * about what a cleared or lost Ante means for the run.
 */
export function applyAnteResult(run: RunState, battle: BattleState): RunState {
  const cleared = battle.result === "won";
  const outcome: AnteOutcome = { ante: run.ante, cleared };
  const history = [...run.history, outcome];

  if (!cleared) {
    if (hasExtraLifeAvailable(run)) {
      const reprieved = consumeExtraLife(run);
      return { ...reprieved, party: restParty(reprieved.party), history };
    }
    return { ...run, status: "lost", history };
  }
  if (run.ante >= run.maxAntes) {
    return { ...run, status: "won", history };
  }
  return { ...run, status: "shopping", history };
}

/**
 * Resolves the current Ante and advances the run. Losing ends the season
 * immediately (REDESIGN.md "Failure state") unless a Sacrifice Pokémon or
 * the Phoenix Clause Doctrine grants a reprieve (see sacrifice.ts) — that
 * retries the same Ante with a rested party instead of ending the run, and
 * never fires twice in one season. Clearing anything but the final Ante
 * opens the shop instead of the next Ante directly — call resolveShop to
 * actually advance.
 */
export function resolveCurrentAnte(run: RunState): RunState {
  if (run.status !== "active") return run;

  const rng = { seed: run.rng.seed };
  const gymParty = gymPartyFor({ ...run, rng });
  const battle = autoResolveBattle(run.party, gymParty, rng);
  return applyAnteResult({ ...run, rng }, battle);
}

/**
 * Resolves the between-Ante shop: mid-run roster growth first (hatch any
 * carried egg, then trade/catch/egg-offer opportunities — growth.ts), then
 * the Doctrine offer, then the party rests to full and the next Ante opens.
 */
export function resolveShop(run: RunState, policy: ShopPolicy = greedyRarityPolicy): RunState {
  if (run.status !== "shopping") return run;

  const grown = applyGrowth(run);

  const offer = offerDoctrines(grown);
  let next = grown;
  if (offer.length > 0) {
    const choice = policy(offer, grown);
    next = pickDoctrine(grown, offer, choice);
  }
  return {
    ...next,
    party: restParty(next.party),
    ante: run.ante + 1,
    status: "active",
  };
}

/** Seeds a placeholder player party for tests/sims that want a party without running a draft. */
export function samplePlayerParty(rng: RunState["rng"], size = 4): FighterState[] {
  const pool = DEX.filter((s) => s.evolvesTo.length === 0);
  const party: FighterState[] = [];
  for (let i = 0; i < size; i++) party.push(makeFighter(pick(rng, pool)));
  return party;
}
