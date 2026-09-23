/**
 * Mid-run roster growth — slice 5 of the redesign (REDESIGN.md "Mid-run
 * roster growth"): three pipelines, all resolved at the between-Ante shop
 * step alongside the Doctrine offer — wild encounters, gifted eggs, and
 * trade offers. Poké Ball/healing-item currency isn't modeled (same
 * deferral as doctrines.ts's shop economy) — catches and trades are free
 * but bounded by bench space and by whether they're actually an upgrade.
 */
import { DEX } from "../../data/species.dex.js";
import { weighted, pick, int, chance } from "../rng.js";
import { makeFighter, type FighterState } from "./battle.js";
import { ROSTER, rarityOf } from "./roster.js";
import { DRAFT_BENCH_SIZE } from "./draft.js";
import { gymPartySizeFor } from "./gym.js";
import type { RngState } from "../types.js";
import type { RunState, Rarity } from "./types.js";
import type { Species } from "../../data/catalog.js";

export const BENCH_CAP = DRAFT_BENCH_SIZE;

/** Curated 15-species pool, separate from the main roster — REDESIGN.md "Egg pool". */
const EGG_TIERS: Record<Rarity, readonly string[]> = {
  common: ["togepi", "cleffa", "pichu", "azurill", "budew", "riolu", "happiny"],
  rare: ["larvitar", "bagon", "dratini", "beldum", "gible"],
  legendary: ["jirachi", "manaphy", "celebi"],
};

function resolveTier(tier: Rarity): Species[] {
  return EGG_TIERS[tier].map((slug) => {
    const s = DEX.find((d) => d.slug === slug);
    if (!s) throw new Error(`growth.ts: egg pool slug "${slug}" missing from DEX`);
    return s;
  });
}

export const EGG_POOL: Record<Rarity, readonly Species[]> = {
  common: resolveTier("common"),
  rare: resolveTier("rare"),
  legendary: resolveTier("legendary"),
};

export function aliveNonEgg(party: readonly FighterState[]): FighterState[] {
  return party.filter((f) => f.hp > 0 && !f.isEgg);
}

/** The party's weakest battle-ready member — what a full bench gives up for a catch, trade or egg. Null with nothing eligible (an all-egg or all-fainted bench). */
export function weakestOf(party: readonly FighterState[]): FighterState | null {
  const candidates = aliveNonEgg(party);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.power < a.power ? b : a));
}

/**
 * Adds the newcomer if there's room, otherwise swaps out the party's
 * current weakest member unconditionally — for a real UI, where the player
 * has already seen the trade being offered and chosen to accept it. Unlike
 * addOrReplace (the headless auto-policy below), this never silently
 * refuses a downgrade: that's the player's call once it's in front of them.
 */
export function acceptNewcomer(
  party: readonly FighterState[],
  newcomer: FighterState,
): { party: readonly FighterState[]; released: FighterState | null } {
  if (party.length < BENCH_CAP) return { party: [...party, newcomer], released: null };
  const weakest = weakestOf(party);
  if (!weakest) return { party, released: null };
  return { party: party.map((f) => (f === weakest ? newcomer : f)), released: weakest };
}

/**
 * Adds the newcomer if there's a free bench slot; otherwise swaps out the
 * party's current weakest member, but only if the newcomer is a genuine
 * upgrade over it. The draft already fills the bench to BENCH_CAP, so
 * without this, catches and eggs would never have anywhere to land for the
 * rest of the run — exactly the "system that never fires" trap CLAUDE.md
 * warns about.
 */
function addOrReplace(party: readonly FighterState[], newcomer: FighterState): readonly FighterState[] {
  if (party.length < BENCH_CAP) return [...party, newcomer];
  const candidates = aliveNonEgg(party);
  if (candidates.length === 0) return party;
  const weakest = candidates.reduce((a, b) => (b.power < a.power ? b : a));
  if (newcomer.power <= weakest.power) return party;
  return party.map((f) => (f === weakest ? newcomer : f));
}

// --- Eggs -------------------------------------------------------------

/**
 * Eggs hatch stronger than a typical wild catch and skew toward the higher
 * tiers vs. a normal roster draw (REDESIGN.md "Egg payoff") — but a
 * guaranteed Legendary was explicitly rejected as too uncanny, so it stays a
 * weighted roll, not a lock.
 */
const EGG_TIER_WEIGHT: Record<Rarity, number> = { common: 45, rare: 35, legendary: 20 };
const EGG_POWER_BONUS = 1.15;

export function eggOffer(rng: RngState): Species {
  const tier = weighted(rng, EGG_TIER_WEIGHT);
  return pick(rng, EGG_POOL[tier]);
}

/** More eggs early, fewer as the season progresses — REDESIGN.md "Egg offer pacing". */
export function eggOfferChance(run: RunState): number {
  const frac = run.maxAntes <= 1 ? 0 : (run.ante - 1) / (run.maxAntes - 1);
  return 0.6 - frac * 0.4; // 60% at Ante 1 down to 20% by the final Ante
}

/** Takes an egg if the pacing roll hits — headless default until a real UI offers the choice. */
function maybeTakeEgg(run: RunState): RunState {
  const rng = run.rng;
  const species = rollEggOffer({ ...run, rng });
  if (!species) return run;
  const egg: FighterState = { ...makeFighter(species, EGG_POWER_BONUS), hp: 0, isEgg: true };
  return { ...run, party: addOrReplace(run.party, egg) };
}

/** Rolls this shop visit's egg-offer pacing chance and, if it hits, the species offered — a real UI's egg-decision step, and what the headless default above accepts unconditionally. Mutates the passed rng. */
export function rollEggOffer(run: RunState): Species | null {
  const rng = run.rng;
  if (int(rng, 0, 99) >= Math.round(eggOfferChance(run) * 100)) return null;
  return eggOffer(rng);
}

/** Turns an accepted egg offer into the bench slot it occupies until it hatches — REDESIGN.md "Egg bench cost". */
export function eggFighterFor(species: Species): FighterState {
  return { ...makeFighter(species, EGG_POWER_BONUS), hp: 0, isEgg: true };
}

/** Every egg that's spent a shop visit in the bench hatches into a battle-ready fighter. */
export function hatchEggs(party: readonly FighterState[]): FighterState[] {
  return party.map((f) => (f.isEgg ? { ...f, isEgg: false, hp: f.maxHp } : f));
}

// --- Wild encounters ----------------------------------------------------

const WILD_TIER_WEIGHT: Record<Rarity, number> = { common: 70, rare: 25, legendary: 5 };

export function wildOffer(rng: RngState): Species {
  const tier = weighted(rng, WILD_TIER_WEIGHT);
  const pool = ROSTER.filter((s) => rarityOf(s) === tier);
  return pick(rng, pool.length > 0 ? pool : ROSTER);
}

/**
 * REDESIGN.md "Ambient catch pacing": party size drifts toward the size of
 * the next gym leader's party, landing one above or below based on run luck.
 */
export function targetPartySize(run: RngState & Pick<RunState, "ante" | "maxAntes">): number {
  const gymSize = gymPartySizeFor(run.ante, run.maxAntes);
  const drift = int(run, 0, 1) === 0 ? -1 : 1;
  return Math.max(1, Math.min(BENCH_CAP, gymSize + drift));
}

/** Catches a wild mon if the party is under its target size — ambient, not a player decision (REDESIGN.md "Idle scope"), so no interactive counterpart. */
export function autoCatch(run: RunState): RunState {
  const target = targetPartySize({ seed: run.rng.seed, ante: run.ante, maxAntes: run.maxAntes });
  if (aliveNonEgg(run.party).length >= target) return run;
  const species = wildOffer(run.rng);
  return { ...run, party: addOrReplace(run.party, makeFighter(species)) };
}

// --- Trades ---------------------------------------------------------------

/** Proposes a random roster species not already owned, to swap for the party's weakest member. */
export function tradeOffer(rng: RngState, party: readonly FighterState[]): Species {
  const owned = new Set(party.map((f) => f.slug));
  const pool = ROSTER.filter((s) => !owned.has(s.slug));
  return pick(rng, pool.length > 0 ? pool : ROSTER);
}

/** Accepts the trade only if it's a genuine upgrade over the party's current weakest member. */
function maybeTrade(run: RunState): RunState {
  const candidates = aliveNonEgg(run.party);
  if (candidates.length === 0) return run;
  const weakest = candidates.reduce((a, b) => (b.power < a.power ? b : a));
  const offered = tradeOffer(run.rng, run.party);
  if (offered.power <= weakest.power) return run;
  const traded = makeFighter(offered);
  return { ...run, party: run.party.map((f) => (f === weakest ? traded : f)) };
}

// --- Evolution Stone --------------------------------------------------

/**
 * Flat per-shop-visit chance of an Evolution Stone offer (F2c, Q5) — no
 * Ante-based taper, since unlike eggs a Stone costs no bench slot, so
 * there's no early-game reason to front-load it. Tunable: retune via Step
 * 4's measurement of how often evolution lines actually finish.
 */
export const EVOLUTION_STONE_CHANCE = 0.4;

export interface EvolutionCandidate {
  /** Party-array index, not just the slug — a party can carry two of the same species (wild catches). */
  memberIndex: number;
  memberSlug: string;
  target: Species;
}

/**
 * Every (party member, evolution target) pair reachable by exactly one
 * evolution step — one entry per branch, so a branching species (Eevee)
 * contributes up to as many entries as it has `evolvesTo` targets.
 */
export function evolutionCandidatesFor(party: readonly FighterState[]): EvolutionCandidate[] {
  const candidates: EvolutionCandidate[] = [];
  party.forEach((f, memberIndex) => {
    if (f.hp <= 0 || f.isEgg) return;
    const species = DEX.find((d) => d.slug === f.slug);
    if (!species) return;
    for (const targetSlug of species.evolvesTo) {
      const target = DEX.find((d) => d.slug === targetSlug);
      if (!target) continue;
      candidates.push({ memberIndex, memberSlug: f.slug, target });
    }
  });
  return candidates;
}

/**
 * This shop visit's Evolution Stone offer: a pacing roll, then up to 3
 * distinct (member, target) pairs drawn without replacement — same
 * "fewer than 3 if the pool's thin" handling as draftOffer. Mutates the
 * passed rng.
 */
export function rollEvolutionOffer(run: RunState): EvolutionCandidate[] | null {
  if (!chance(run.rng, EVOLUTION_STONE_CHANCE)) return null;
  const remaining = evolutionCandidatesFor(run.party);
  if (remaining.length === 0) return null;
  const offer: EvolutionCandidate[] = [];
  for (let i = 0; i < 3 && remaining.length > 0; i++) {
    const idx = int(run.rng, 0, remaining.length - 1);
    offer.push(remaining.splice(idx, 1)[0]!);
  }
  return offer;
}

/**
 * Evolves the party member at `memberIndex` into `target`, one stage
 * (Q4: never a whole line at once). Carries over current HP as a fraction
 * of max — not the raw value, since max HP changes on evolution — and
 * fatigue unchanged (already a 0-1 fraction), so an evolved mon doesn't
 * walk out of the shop at full HP for free.
 */
export function applyEvolution(
  party: readonly FighterState[],
  memberIndex: number,
  target: Species,
): FighterState[] {
  return party.map((f, i) => {
    if (i !== memberIndex) return f;
    const hpFraction = f.maxHp > 0 ? f.hp / f.maxHp : 0;
    const evolved = makeFighter(target);
    return { ...evolved, hp: Math.round(evolved.maxHp * hpFraction), fatigue: f.fatigue };
  });
}

/** Runs the whole growth step for one shop visit: hatch, trade, catch, egg — in that order. */
export function applyGrowth(run: RunState): RunState {
  let next: RunState = { ...run, party: hatchEggs(run.party) };
  next = maybeTrade(next);
  next = autoCatch(next);
  next = maybeTakeEgg(next);
  return next;
}
