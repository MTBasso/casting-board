import { useState } from "react";
import { useGame } from "../../engine/store.js";
import {
  buildOutBoard,
  createInitialState,
  eliteUnlocked,
  fillBox,
  forceGauntlet,
  forceRival,
  grindMorale,
  staffEverything,
} from "../../sim/index.js";
import { clearGame } from "../../persist/save.js";
import { forgetIntro } from "./Welcome.js";

/** On top of the league's own clock, which already runs at TIME_SCALE. */
const SPEEDS = [1, 5, 25] as const;

/**
 * Dev-only controls.
 *
 * An idle game's pacing is measured in days, and without these you will only
 * ever playtest your own onboarding — the most over-tested hour in games.
 * Gated behind import.meta.env.DEV so it never ships.
 */
export function DevBar() {
  const speed = useGame((s) => s.speed);
  const setSpeed = useGame((s) => s.setSpeed);
  const fastForward = useGame((s) => s.fastForward);
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  if (!import.meta.env.DEV) return null;

  // Collapsed by default: it is seven buttons of scaffolding sitting on top of
  // the game, and most sessions want to look at the game.
  if (!open) {
    return (
      <div className="devbar is-closed">
        <button type="button" className="devbar-toggle" onClick={() => setOpen(true)}>
          Dev ▸
        </button>
        <span className="devbar-clock">{(state.time / 3600).toFixed(1)}h</span>
      </div>
    );
  }

  const jump = (hours: number) => {
    setBusy(true);
    // Yield once so the button paints its disabled state before we block.
    requestAnimationFrame(() => {
      fastForward(hours);
      setBusy(false);
    });
  };

  return (
    <div className="devbar">
      <button type="button" className="devbar-toggle" onClick={() => setOpen(false)}>
        Dev ▾
      </button>

      <span className="devbar-group">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={`btn sm ${speed === s ? "" : "ghost"}`}
            onClick={() => setSpeed(s)}
          >
            ×{s}
          </button>
        ))}
      </span>

      <span className="devbar-group">
        {[1, 10, 40].map((h) => (
          <button
            key={h}
            type="button"
            className="btn sm ghost"
            disabled={busy}
            onClick={() => jump(h)}
          >
            +{h}h
          </button>
        ))}
      </span>

      {/* Jumps to the situations that are otherwise hours of play away. Every
          one of these was a state I could not reach by hand often enough to
          test it properly — which is how the Elite tier shipped losing 89% of
          its gauntlets without anybody noticing. */}
      <span className="devbar-group">
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => act((s) => buildOutBoard(s))}
          title="Fund and open every gym, with a Leader in each"
        >
          Board
        </button>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => act((s) => staffEverything(s))}
          title="Fill every gym, Elite seat and posting slot"
        >
          Staff
        </button>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => act((s) => fillBox(s, 40))}
          title="Drop 40 assorted creatures into the box"
        >
          +40 mons
        </button>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => act((s) => forceRival(s))}
          title="Land a rival challenge immediately"
        >
          Rival
        </button>
        <button
          type="button"
          className="btn sm ghost"
          disabled={!eliteUnlocked(state)}
          onClick={() => act((s) => forceGauntlet(s))}
          title="Run an Elite gauntlet now — the only way to see forced recruitment"
        >
          Gauntlet
        </button>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => act((s) => grindMorale(s))}
          title="Push every trainer to breaking point, to test suspension and demotion"
        >
          Morale
        </button>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => act((s) => void (s.money += 1_000_000))}
          title="Add a million Pokéyen"
        >
          +&#8369;1M
        </button>
      </span>

      <span className="devbar-clock">
        league age {(state.time / 3600).toFixed(1)}h
      </span>

      <button
        type="button"
        className="btn sm ghost"
        onClick={() => {
          void clearGame();
          // A reset that skips the introduction is not a fresh start.
          forgetIntro();
          useGame.getState().replace(createInitialState(Date.now() & 0x7fffffff));
        }}
        title="Wipe the save and start a fresh league"
      >
        Reset
      </button>
    </div>
  );
}
