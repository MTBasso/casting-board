import { get, set, del } from "idb-keyval";
import { migrateState, SAVE_VERSION, type LeagueState } from "../sim/index.js";

/**
 * Persistence.
 *
 * IndexedDB rather than localStorage: localStorage is synchronous and caps
 * around 5 MB, and a mature roster of several hundred creatures with pedigrees
 * will blow past that while blocking the main thread on every write.
 */

const KEY = "incremon.save.v1";

export interface SaveEnvelope {
  version: number;
  /** Wall-clock ms at save time — the only place real time enters the game. */
  savedAt: number;
  state: LeagueState;
}

export async function saveGame(state: LeagueState): Promise<void> {
  const envelope: SaveEnvelope = {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    state,
  };
  await set(KEY, envelope);
}

export async function loadGame(): Promise<SaveEnvelope | null> {
  let raw: SaveEnvelope | undefined;
  try {
    raw = await get<SaveEnvelope>(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  return migrate(raw);
}

/**
 * Move a save that could not be loaded out of the way instead of deleting it.
 * A prototype player who loses a league to a bad migration will not report the
 * bug — they will just stop playing.
 */
export async function quarantineSave(): Promise<void> {
  try {
    const raw = await get<SaveEnvelope>(KEY);
    if (raw) await set(`${KEY}.broken.${Date.now()}`, raw);
    await del(KEY);
  } catch {
    // Nothing recoverable; the caller is already starting fresh.
  }
}

export async function clearGame(): Promise<void> {
  await del(KEY);
}

/**
 * Save migrations.
 *
 * There is no schema system here on purpose — the state is a plain object, so
 * a migration is a function that reshapes it. Add a case per version bump and
 * never remove one; players will return with old saves.
 */
function migrate(envelope: SaveEnvelope): SaveEnvelope | null {
  if (envelope.version > SAVE_VERSION) {
    // A save from a newer build. Refuse rather than corrupt it.
    return null;
  }

  const result = migrateState(envelope.state, envelope.version ?? 1);
  if (!result) return null;

  return { ...envelope, version: SAVE_VERSION, state: result.state };
}

/** Seconds of real time between `savedAt` and now, for offline catch-up. */
export function elapsedSince(envelope: SaveEnvelope): number {
  return Math.max(0, (Date.now() - envelope.savedAt) / 1000);
}

/**
 * Debounced autosave. Also flushes when the page is hidden, which is the only
 * save that reliably happens on mobile — tab close often never fires.
 */
export function createAutosave(getState: () => LeagueState, everyMs = 5000) {
  let timer: ReturnType<typeof setInterval> | null = null;

  const flush = () => {
    void saveGame(getState());
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush();
  };

  timer = setInterval(flush, everyMs);
  document.addEventListener("visibilitychange", onVisibility);

  return {
    flush,
    stop() {
      if (timer !== null) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
