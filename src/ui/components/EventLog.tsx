import { useState } from "react";
import { useGame } from "../../engine/store.js";
import { useT } from "../i18n.js";

function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Glanceable, never required. Per the design doc the battle feed exists for
 * flavor — the player should be able to ignore it entirely and still play well.
 */
export function EventLog() {
  const t = useT();
  const state = useGame((s) => s.state);
  const session = useGame((s) => s.session);
  const [open, setOpen] = useState(false);

  const latest = state.log[0];

  return (
    <div className={`feed ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="feed-bar"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="feed-caret" aria-hidden="true">
          {open ? "\u25BE" : "\u25B4"}
        </span>
        <span className="feed-latest">
          {latest ? (
            <>
              <time>{clock(latest.at)}</time>
              <span className={`log-${latest.kind}`}>{t(latest.key as never, latest.params)}</span>
            </>
          ) : (
            <span className="dim">{t("log.incoming")}</span>
          )}
        </span>
        <span className="feed-session">
          {session.waves.toLocaleString()} challenges ·{" "}
          {Math.round(session.earned).toLocaleString()} earned
        </span>
      </button>

      {open && (
        <ul className="log">
          {state.log.map((entry, i) => (
            <li key={`${entry.at}-${i}`} className={`log-${entry.kind}`}>
              <time>{clock(entry.at)}</time>
              <span>{t(entry.key as never, entry.params)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
