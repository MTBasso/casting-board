import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App.js";
import { startLoop } from "./engine/loop.js";
import { getState, useGame } from "./engine/store.js";
import {
  createAutosave,
  elapsedSince,
  loadGame,
  quarantineSave,
} from "./persist/save.js";
import { createInitialState, resolveOffline } from "./sim/index.js";
import { TIME_SCALE } from "./sim/constants.js";
import "./ui/styles.css";

/**
 * Boot sequence. This is the only place real wall-clock time enters the game:
 * we ask the save how long the player has been away, hand that number to the
 * sim as a span of sim-seconds, and never mention clocks again.
 */
async function boot(): Promise<void> {
  // A save that cannot be restored must never take the app down with it. The
  // league is set aside rather than deleted, and play continues from a fresh
  // one — a white screen tells the player nothing and loses them anyway.
  try {
    const saved = await loadGame();
    if (saved) {
      useGame.getState().replace(saved.state);
      const away = elapsedSince(saved);
      if (away > 5) {
        // Away time is credited on the same clock the live game runs on, or
        // twelve hours asleep would be worth twenty minutes of playing.
        const report = resolveOffline(getState(), away * TIME_SCALE);
        useGame.getState().bump(report);
      }
    }
  } catch (error) {
    console.error("Could not restore the saved league; starting a new one.", error);
    await quarantineSave();
    useGame.getState().replace(createInitialState(Date.now() & 0x7fffffff));
  }

  startLoop({
    getState,
    onTick: (report) => useGame.getState().bump(report),
    getSpeed: () => useGame.getState().speed,
  });

  createAutosave(getState);

  const root = document.getElementById("root");
  if (!root) throw new Error("#root missing from index.html");
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
