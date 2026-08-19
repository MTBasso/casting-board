import { create } from "zustand";
import {
  createInitialState,
  emptyReport,
  tick,
  type LeagueState,
  type TickReport,
} from "../sim/index.js";

/**
 * Thin binding between the mutable sim state and React.
 *
 * The sim mutates its state object in place — cheaper than structural sharing
 * at this roster size — so selectors can't detect change by identity. Instead
 * every tick bumps `revision`, components subscribe to that, and they read the
 * live state directly. One integer of indirection, and React stays out of the
 * simulation entirely.
 */
/** A running account of what happened, for the Desk to read out. */
export interface Digest {
  held: number;
  lost: number;
  earned: number;
  caught: number;
  retired: number;
  evolved: string[];
  rivals: string[];
  usurped: string | null;
  suspended: string[];
}

function emptyDigest(): Digest {
  return {
    held: 0,
    lost: 0,
    earned: 0,
    caught: 0,
    retired: 0,
    evolved: [],
    rivals: [],
    usurped: null,
    suspended: [],
  };
}

interface GameStore {
  state: LeagueState;
  revision: number;
  lastReport: TickReport;
  /** Cumulative totals since load, for the UI's session readouts. */
  session: { waves: number; earned: number };
  /**
   * What has happened since the player last read the Desk.
   *
   * Accumulated here rather than in the sim because it is a fact about *this
   * viewer*, not about the league — a save reopened on another device has not
   * been read by anyone. Cleared when the Desk is opened.
   */
  digest: Digest;
  clearDigest(): void;

  /** Dev-only time multiplier. See LoopOptions.getSpeed. */
  speed: number;

  bump(report: TickReport): void;
  replace(state: LeagueState): void;
  /** Run a mutation against the sim state and notify React. */
  act(fn: (state: LeagueState) => void): void;
  setSpeed(speed: number): void;
  /**
   * Jump the league forward. Playtesting an idle game otherwise means only ever
   * testing your own onboarding, which is the most over-tested hour in games.
   */
  fastForward(hours: number): void;
}

export const useGame = create<GameStore>((set, get) => ({
  state: createInitialState(Date.now() & 0x7fffffff),
  revision: 0,
  speed: 1,
  lastReport: emptyReport(),
  session: { waves: 0, earned: 0 },
  digest: emptyDigest(),

  bump(report) {
    const s = get().session;
    const d = get().digest;
    set({
      revision: get().revision + 1,
      lastReport: report,
      session: {
        waves: s.waves + report.wavesResolved,
        earned: s.earned + report.earned,
      },
      digest: {
        held: d.held + report.wavesWon,
        lost: d.lost + report.badgesLost,
        earned: d.earned + report.earned,
        caught: d.caught + report.caught.length,
        retired: d.retired + report.retirements.length,
        evolved: [...d.evolved, ...report.evolutions].slice(-6),
        rivals: [...d.rivals, ...report.rivals.map((r) => r.name)].slice(-6),
        usurped: report.usurped ?? d.usurped,
        suspended: [...d.suspended, ...report.suspended.map((x) => x.name)].slice(-6),
      },
    });
  },

  clearDigest() {
    set({ digest: emptyDigest() });
  },

  replace(state) {
    set({
      state,
      revision: get().revision + 1,
      session: { waves: 0, earned: 0 },
    });
  },

  act(fn) {
    fn(get().state);
    set({ revision: get().revision + 1 });
  },

  setSpeed(speed) {
    set({ speed });
  },

  fastForward(hours) {
    const state = get().state;
    const total = emptyReport();
    const ticks = Math.round(hours * 3600);
    for (let i = 0; i < ticks; i++) {
      const r = tick(state, 1);
      total.wavesResolved += r.wavesResolved;
      total.wavesWon += r.wavesWon;
      total.earned += r.earned;
      total.paid += r.paid;
      total.retirements.push(...r.retirements);
      total.resignations.push(...r.resignations);
    }
    get().bump(total);
  },
}));

/** Read the live sim state without subscribing to it. */
export const getState = (): LeagueState => useGame.getState().state;
