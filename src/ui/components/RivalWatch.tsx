import { useGame } from "../../engine/store.js";
import { nextRival, readinessAgainst, timeUntil } from "../../sim/index.js";
import { TypeBadge } from "./TypeBadge.js";

/**
 * The rival countdown.
 *
 * The only deadline in the game, so it gets the most prominent place in the
 * chrome. It names the gym, the type and how ready that gym currently is —
 * everything the player needs to decide whether to act now or let it come.
 */
export function RivalWatch() {
  const state = useGame((s) => s.state);
  const rival = nextRival(state);
  if (!rival) return null;

  const gym = state.gyms[rival.gymId];
  const minutes = Math.ceil(timeUntil(state, rival) / 60);
  const readiness = readinessAgainst(state, rival);

  const status =
    readiness >= 1.15 ? "ready" : readiness >= 0.9 ? "close" : "outmatched";
  const label =
    status === "ready"
      ? "Your gym should hold"
      : status === "close"
        ? "Too close to call"
        : "You are outmatched";

  return (
    <div className={`rival-watch is-${status}`}>
      <div className="rival-head">
        <span className="rival-name">{rival.name} is coming</span>
        <span className="rival-eta">{minutes}m</span>
      </div>
      <div className="rival-detail">
        <TypeBadge type={rival.type} size="sm" />
        <span className="dim">vs {gym?.name ?? "your league"}</span>
      </div>
      <p className="rival-status">{label}</p>
    </div>
  );
}
