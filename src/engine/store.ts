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
interface GameStore {
  state: LeagueState;
  revision: number;
  lastReport: TickReport;
  /** Cumulative totals since load, for the UI's session readouts. */
  session: { waves: number; earned: number };

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

  bump(report) {
    const s = get().session;
    set({
      revision: get().revision + 1,
      lastReport: report,
      session: {
        waves: s.waves + report.wavesResolved,
        earned: s.earned + report.earned,
      },
    });
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
