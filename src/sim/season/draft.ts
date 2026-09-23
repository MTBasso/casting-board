/**
 * Season-start draft — REDESIGN.md "Draft/season start": draft from a
 * limited random pool, weighted by Mentors carried from past seasons
 * (career.ts). With no Mentors (a fresh career, or any caller that doesn't
 * pass any), every offer draws uniformly — that's the slice 1-5 behavior,
 * unchanged.
 */
import { pick, weighted } from "../rng.js";
import { makeFighter, type FighterState } from "./battle.js";
import { ROSTER } from "./roster.js";
import type { RngState } from "../types.js";
import type { Species } from "../../data/catalog.js";

export const DRAFT_OFFER_SIZE = 3;
export const DRAFT_BENCH_SIZE = 4;

/**
 * A Mentor-backed species shows up this many times as likely as a plain one.
 *
 * Scaled up from 3 when the roster grew 100 → 223 species (evolution-line
 * fill, docs/reviews/starters-and-evolution-2026-09-23.md F1): the same
 * per-mentor bonus spread across a much bigger "everyone else" pool more
 * than halved a Mentor's actual draw odds (24/116 → 24/239 at 8 Mentors),
 * which silently weakened the meta-progression signal the career test
 * measures. 7 restores roughly the old draw-probability share.
 */
export const MENTOR_WEIGHT_BONUS = 7;

/** One round of the draft: a small random offer to choose one from, Mentor slugs weighted heavier. */
export function draftOffer(
  rng: RngState,
  excluding: readonly string[] = [],
  mentorSlugs: readonly string[] = [],
): Species[] {
  return offerFromPool(ROSTER, rng, excluding, mentorSlugs);
}

/**
 * The season's opening pick, F1c (docs/reviews/starters-and-evolution-2026-09-23.md):
 * filtered to stage-1, non-Legendary species so pick 1 can't hand a run a
 * Legendary or fully-evolved "starter." Every later pick keeps calling
 * `draftOffer` against the full roster unchanged.
 */
export function starterOffer(rng: RngState, mentorSlugs: readonly string[] = []): Species[] {
  const starters = ROSTER.filter((s) => s.stage === 1 && !s.isLegendary);
  return offerFromPool(starters, rng, [], mentorSlugs);
}

function offerFromPool(
  pool: readonly Species[],
  rng: RngState,
  excluding: readonly string[],
  mentorSlugs: readonly string[],
): Species[] {
  pool = pool.filter((s) => !excluding.includes(s.slug));
  const offer: Species[] = [];
  const taken = new Set<string>();
  for (let i = 0; i < DRAFT_OFFER_SIZE && taken.size < pool.length; i++) {
    const remaining = pool.filter((s) => !taken.has(s.slug));
    if (mentorSlugs.length === 0) {
      // No career weighting to apply — plain uniform pick, same as before slice 6.
      const choice = pick(rng, remaining);
      taken.add(choice.slug);
      offer.push(choice);
      continue;
    }
    const weights: Record<string, number> = {};
    for (const s of remaining) weights[s.slug] = mentorSlugs.includes(s.slug) ? MENTOR_WEIGHT_BONUS : 1;
    const slug = weighted(rng, weights);
    const choice = remaining.find((s) => s.slug === slug);
    if (!choice) continue; // weighted() only ever returns a key that was in weights
    taken.add(choice.slug);
    offer.push(choice);
  }
  return offer;
}

export type DraftPolicy = (offer: readonly Species[], partySoFar: readonly FighterState[]) => Species;

/** Prefers whichever offered species adds the most new type coverage to the party so far, tie-broken by power. */
export function typeDiversePolicy(
  offer: readonly Species[],
  partySoFar: readonly FighterState[],
): Species {
  const covered = new Set(partySoFar.flatMap((f) => f.types));
  let best = offer[0];
  let bestScore = -1;
  for (const s of offer) {
    const newTypes = s.types.filter((t) => !covered.has(t)).length;
    const score = newTypes * 1000 + s.power;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  if (!best) throw new Error("draftOffer produced an empty offer");
  return best;
}

/** Runs the whole draft headlessly with a pick policy until the bench is full — the season engine's default until a real UI drives picks one at a time. */
export function runDraft(
  rng: RngState,
  policy: DraftPolicy = typeDiversePolicy,
  benchSize = DRAFT_BENCH_SIZE,
  mentorSlugs: readonly string[] = [],
): FighterState[] {
  const party: FighterState[] = [];
  const picked: string[] = [];
  while (party.length < benchSize) {
    const offer = draftOffer(rng, picked, mentorSlugs);
    const choice = policy(offer, party);
    picked.push(choice.slug);
    party.push(makeFighter(choice));
  }
  return party;
}
