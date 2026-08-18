import { create } from "zustand";
import type { BattleRecord } from "../sim/index.js";

/**
 * One clock for every battle being watched.
 *
 * The sim resolves a whole gym run inside a single tick, so "live" is a UI
 * fiction — but it has to be a *consistent* one. The gym list draws a shield bar
 * that empties as a challenger works through a gym, and the battle view draws
 * the same fight blow by blow; if each ran its own timer they would disagree,
 * and the bar would be pointing at a moment the panel had already passed.
 *
 * So the cursor lives here, one per gym, advanced by a single driver.
 */

interface ReplayState {
  /** Battle timestamp being played, and how far through it we are. */
  cursors: Record<string, { at: number; cursor: number; total: number }>;
  sync: (gymId: string, record: BattleRecord) => void;
  advance: () => void;
}

/** Every blow in a record, flattened — one cursor drives the whole run. */
export function timelineOf(record: BattleRecord) {
  return record.stages.flatMap((stage, stageIndex) =>
    stage.events.map((event) => ({ event, stage, stageIndex })),
  );
}

export const useReplay = create<ReplayState>((set) => ({
  cursors: {},
  sync: (gymId, record) =>
    set((s) => {
      const existing = s.cursors[gymId];
      if (existing?.at === record.at) return s;
      // A new battle restarts the clock rather than continuing the old count.
      return {
        cursors: {
          ...s.cursors,
          [gymId]: { at: record.at, cursor: 0, total: timelineOf(record).length },
        },
      };
    }),
  advance: () =>
    set((s) => {
      let moved = false;
      const next: ReplayState["cursors"] = {};
      for (const [gymId, c] of Object.entries(s.cursors)) {
        if (c.cursor < c.total) {
          next[gymId] = { ...c, cursor: c.cursor + 1 };
          moved = true;
        } else {
          next[gymId] = c;
        }
      }
      return moved ? { cursors: next } : s;
    }),
}));

/** How long one blow is held on screen. */
export const STEP_MS = 420;

/**
 * How much of the Leader's shield is still standing, 0..1.
 *
 * Deliberately *not* a measure of the whole gym: it counts the junior trainers
 * between a challenger and the Leader, because that is the thing the player can
 * act on. It reaches zero the moment the Leader has to fight, which is exactly
 * when the player should want to be watching.
 */
export function shieldOf(record: BattleRecord, cursor: number): number {
  const juniors = record.stages.filter((s) => !s.isLeader);
  if (juniors.length === 0) return 0;

  const timeline = timelineOf(record);
  const at = Math.min(cursor, timeline.length - 1);
  const reached = timeline[at]?.stageIndex ?? record.stages.length;
  const fallen = Math.min(juniors.length, reached);
  return Math.max(0, 1 - fallen / juniors.length);
}

/** True while the Leader is the one fighting. */
export function leaderStanding(record: BattleRecord, cursor: number): boolean {
  const timeline = timelineOf(record);
  const at = Math.min(cursor, timeline.length - 1);
  return timeline[at]?.stage.isLeader ?? false;
}

/** Whether this record has finished playing out. */
export function isDone(record: BattleRecord, cursor: number): boolean {
  return cursor >= timelineOf(record).length - 1;
}
