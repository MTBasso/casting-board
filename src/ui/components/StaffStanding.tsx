import { useState } from "react";
import { useGame } from "../../engine/store.js";
import {
  constants,
  demote,
  demotionTargets,
  isSuspended,
  suspensionRemaining,
  type DemotionTarget,
  type Trainer,
} from "../../sim/index.js";

/**
 * A trainer's standing, and the one move the player can make about it.
 *
 * Morale used to be a percentage in a subtitle — information with no action
 * attached, which is the worst kind. This shows the staircase instead: where
 * they are on it, how many steps are left, and the door out.
 */
export function StaffStanding({ trainer }: { trainer: Trainer }) {
  const state = useGame((s) => s.state);
  const [open, setOpen] = useState(false);

  const M = constants.MORALE;
  const suspended = isSuspended(state, trainer);
  const targets = demotionTargets(state, trainer.id);
  const slumping = trainer.morale < M.slumpAt;
  const straining = trainer.strain > 0;

  // How close a suspension is, so the warning is a countdown rather than a mood.
  const toSuspension = Math.min(1, trainer.strain / M.strainToSuspend);

  const mood = suspended
    ? "Suspended"
    : trainer.morale >= 0.75
      ? "Content"
      : trainer.morale >= M.slumpAt
        ? "Restless"
        : straining
          ? "At breaking point"
          : "Unhappy";

  // Nothing to say is worth saying quietly. A full meter reading "Content" under
  // every trainer on every screen is noise pretending to be information — and
  // under a *party* heading it read as a fact about the party, which it is not.
  const needsAttention = suspended || slumping || straining || trainer.suspensions > 0;

  if (!needsAttention) {
    return (
      <div className="standing is-quiet">
        <span className="dim">Settled · morale {Math.round(trainer.morale * 100)}%</span>
        {targets.length > 0 && (
          <button
            type="button"
            className="linky"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "cancel" : "step down…"}
          </button>
        )}
        {open && <DemoteList trainer={trainer} targets={targets} onDone={() => setOpen(false)} />}
      </div>
    );
  }

  return (
    <div className={`standing ${suspended ? "is-suspended" : "is-slump"}`}>
      <div className="standing-head">
        <span className="mood">{mood}</span>
        {suspended ? (
          <span className="dim">
            back in {formatMinutes(suspensionRemaining(state, trainer))}
          </span>
        ) : (
          <span className="dim">
            {trainer.suspensions > 0 &&
              `${trainer.suspensions} of ${M.suspensionsBeforeDeparture} suspensions · `}
            morale {Math.round(trainer.morale * 100)}%
          </span>
        )}
      </div>

      {/* Morale fills to standing, not to full — the ceiling is visible, which
          is what makes a second suspension read as worse than the first. */}
      <span className="morale-track" title={`Ceiling ${Math.round(trainer.standing * 100)}%`}>
        <span className="morale-fill" style={{ width: `${trainer.morale * 100}%` }} />
        <span className="morale-ceiling" style={{ left: `${trainer.standing * 100}%` }} />
      </span>

      {straining && !suspended && (
        <p className="warn">
          Suspension in {Math.round((1 - toSuspension) * 100)}% —{" "}
          {targets.length > 0
            ? "step them down or pay them properly."
            : "no lower posting is open."}
        </p>
      )}

      {targets.length > 0 && (
        <div className="standing-actions">
          <button type="button" className="btn sm ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "Step down…"}
          </button>
          {open && <DemoteList trainer={trainer} targets={targets} onDone={() => setOpen(false)} />}
        </div>
      )}
    </div>
  );
}

function DemoteList({
  trainer,
  targets,
  onDone,
}: {
  trainer: Trainer;
  targets: DemotionTarget[];
  onDone: () => void;
}) {
  const act = useGame((s) => s.act);
  return (
    <>
      <ul className="demote-list">
        {targets.map((t) => (
          <li key={labelKey(t)}>
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                act((s) => void demote(s, trainer.id, t));
                onDone();
              }}
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">
        Their party comes with them, trimmed to the new post. Nothing they have
        bonded to is forgotten.
      </p>
    </>
  );
}

function labelKey(t: DemotionTarget): string {
  return t.kind === "elite" ? `e${t.rank}` : `${t.kind}:${t.gymId}`;
}

function formatMinutes(seconds: number): string {
  const m = Math.ceil(seconds / 60);
  return m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`;
}
