import { TICK_SECONDS } from "../sim/constants.js";
import { tick } from "../sim/index.js";
import type { LeagueState, TickReport } from "../sim/index.js";

/**
 * Fixed-timestep driver.
 *
 * Real elapsed time accumulates here and is spent in whole `TICK_SECONDS`
 * steps, so the sim advances at the same rate regardless of frame rate or
 * how long a background tab was throttled. The sim itself never sees a clock.
 */
export interface LoopHandle {
  stop(): void;
  /** Force a step now — useful after the player takes an action. */
  flush(): void;
}

export interface LoopOptions {
  getState(): LeagueState;
  onTick(report: TickReport): void;
  /**
   * Dev-only time multiplier. An idle game's pacing is measured in days and you
   * cannot wait days per iteration, so this exists to make a session cover
   * them. Ships disabled; it is one number applied to elapsed real time.
   */
  getSpeed?: () => number;
  /** Guards against enormous catch-ups if the tab was hidden for hours. */
  maxCatchUpSeconds?: number;
}

export function startLoop(opts: LoopOptions): LoopHandle {
  const maxCatchUp = opts.maxCatchUpSeconds ?? 30;
  let accumulator = 0;
  let last = performance.now();
  let raf = 0;
  let running = true;

  function step(now: number): void {
    if (!running) return;

    const speed = opts.getSpeed?.() ?? 1;
    const realDelta = Math.min((now - last) / 1000, maxCatchUp) * speed;
    last = now;
    accumulator += realDelta;

    // The step budget scales with speed, or ×100 would just queue up backlog.
    const budget = Math.max(240, Math.ceil(speed * 240));
    let steps = 0;
    while (accumulator >= TICK_SECONDS && steps < budget) {
      const report = tick(opts.getState(), TICK_SECONDS);
      opts.onTick(report);
      accumulator -= TICK_SECONDS;
      steps += 1;
    }

    raf = requestAnimationFrame(step);
  }

  raf = requestAnimationFrame(step);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    flush() {
      const report = tick(opts.getState(), TICK_SECONDS);
      opts.onTick(report);
    },
  };
}
