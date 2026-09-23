import { MAX_MENTORS } from "../../sim/season/career.js";
import { speciesName } from "../sprites.js";
import { spriteUrl } from "../sprites.js";
import { useSeason } from "./store.js";

export function EndScreen() {
  const run = useSeason((s) => s.run);
  const career = useSeason((s) => s.career);
  const justInducted = useSeason((s) => s.justInducted);
  const newRun = useSeason((s) => s.newRun);
  const won = run.status === "won";
  const cleared = run.history.filter((o) => o.cleared).length;

  return (
    <div className="season-root">
      <div className={`sn-end ${won ? "is-won" : "is-lost"}`}>
        <div className="sn-end-title sn-display">{won ? "Championship Cleared" : "Season Over"}</div>
        <p style={{ color: "var(--sn-text-dim)" }}>
          {cleared} of {run.maxAntes} Antes cleared. Season {career.seasonsPlayed} of this career.
        </p>

        {justInducted.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            <span className="sn-label">New Mentors inducted</span>
            <div style={{ display: "flex", gap: 10 }}>
              {justInducted.map((slug) => (
                <div key={slug} className="sn-slot" title={speciesName(slug)}>
                  {spriteUrl(slug) && <img src={spriteUrl(slug) ?? ""} alt="" />}
                </div>
              ))}
            </div>
          </div>
        )}

        <p style={{ color: "var(--sn-text-dim)", fontSize: 12 }}>
          Hall of Fame: {career.mentors.length}/{MAX_MENTORS} Mentors carried forward.
        </p>

        <button className="sn-btn is-primary" onClick={() => newRun()}>
          New Season →
        </button>
      </div>
    </div>
  );
}
