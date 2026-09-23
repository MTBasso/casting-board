/**
 * Hall of Fame / Mentor meta-progression — slice 6 of the redesign
 * (REDESIGN.md "Meta-progression" and "Roster storage"). Nothing persists
 * between seasons except Mentors; there's no PC Box, no carried-over party.
 *
 * The cap is load-bearing, not a placeholder: an early throwaway sim (see
 * REDESIGN.md's settled-decisions table) showed early seasons holding ~2/8
 * gyms, climbing toward ~5-6/8 by season 11-20, then plateauing below a full
 * clear once the cap kicks in — Mentors are meant to make survival easier
 * over a career without eventually trivializing a run.
 */
import { draftParty, createRun } from "./engine.js";
import type { DraftPolicy } from "./draft.js";
import type { RunState } from "./types.js";

/** Validated by the probe referenced above — this is what makes the curve plateau instead of climbing forever. */
export const MAX_MENTORS = 8;

export interface Mentor {
  slug: string;
}

export interface Career {
  mentors: readonly Mentor[];
  seasonsPlayed: number;
  /** REDESIGN.md "Collection layer": every species slug seen across the whole career, tracked outside any single run. */
  seenSpecies: readonly string[];
}

export function createCareer(): Career {
  return { mentors: [], seasonsPlayed: 0, seenSpecies: [] };
}

/** Adds newly-seen species slugs to the Pokédex log, deduped — same shape as inductMentors. */
export function recordSeen(career: Career, slugs: readonly string[]): Career {
  const seen = new Set(career.seenSpecies);
  let changed = false;
  for (const slug of slugs) {
    if (!seen.has(slug)) {
      seen.add(slug);
      changed = true;
    }
  }
  return changed ? { ...career, seenSpecies: [...seen] } : career;
}

/**
 * Inducts every party member still standing when the run ended — win or
 * lose, since even a loss can be a season played well past its early Antes.
 * Already-inducted slugs don't duplicate; once MAX_MENTORS is reached no
 * more are added this season, which is the whole plateau mechanism.
 */
export function inductMentors(career: Career, run: RunState): Career {
  if (run.status !== "won" && run.status !== "lost") return career;

  const survivors = run.party.filter((f) => f.hp > 0 && !f.isEgg);
  const mentors = [...career.mentors];
  for (const f of survivors) {
    if (mentors.length >= MAX_MENTORS) break;
    if (mentors.some((m) => m.slug === f.slug)) continue;
    mentors.push({ slug: f.slug });
  }
  return { ...career, mentors, seasonsPlayed: career.seasonsPlayed + 1 };
}

/** Starts a fresh season, drafting a party weighted by the career's Mentors so far. */
export function startSeason(
  career: Career,
  seed: number,
  maxAntes?: number,
  policy?: DraftPolicy,
): RunState {
  return draftParty(
    createRun(seed, maxAntes),
    policy,
    career.mentors.map((m) => m.slug),
  );
}
