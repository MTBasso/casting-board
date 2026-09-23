import { get, set } from "idb-keyval";
import type { Career } from "../sim/season/career.js";
import { createCareer } from "../sim/season/career.js";

/**
 * Persistence for the season redesign's `Career` (Mentors, Pokédex) — the
 * old game's `src/persist/save.ts` pattern (IndexedDB via idb-keyval), kept
 * as its own envelope/key so the two games' saves never collide while they
 * sit side by side (REDESIGN.md's own "small vertical slice, deployed
 * alongside the current game" note).
 */

const KEY = "incremon.season.career.v1";
const CAREER_VERSION = 1;

interface CareerEnvelope {
  version: number;
  career: Career;
}

export async function saveCareer(career: Career): Promise<void> {
  const envelope: CareerEnvelope = { version: CAREER_VERSION, career };
  await set(KEY, envelope);
}

/** Falls back to a fresh Career on anything unreadable — a corrupt career save shouldn't block starting a season. */
export async function loadCareer(): Promise<Career> {
  try {
    const raw = await get<CareerEnvelope>(KEY);
    if (!raw || raw.version !== CAREER_VERSION) return createCareer();
    // seenSpecies was added after the first shape of this save — backfill
    // rather than reject, since only one version has ever shipped.
    return { ...raw.career, seenSpecies: raw.career.seenSpecies ?? [] };
  } catch {
    return createCareer();
  }
}
