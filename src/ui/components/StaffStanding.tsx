import { useState } from "react";
import { useGame } from "../../engine/store.js";
import { useT } from "../i18n.js";
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
  const t = useT();
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
    ? t("staff.suspended")
    : trainer.morale >= 0.75
      ? t("staff.content")
      : trainer.morale >= M.slumpAt
        ? t("staff.restless")
        : straining
          ? t("staff.breaking")
          : t("staff.unhappy");

  // Nothing to say is worth saying quietly. A full meter reading "Content" under
  // every trainer on every screen is noise pretending to be information — and
  // under a *party* heading it read as a fact about the party, which it is not.
  const needsAttention = suspended || slumping || straining || trainer.suspensions > 0;

  if (!needsAttention) {
    return (
      <div className="standing is-quiet">
        <span className="dim">{t("staff.settled", { n: Math.round(trainer.morale * 100) })}</span>
        {targets.length > 0 && (
          <button
            type="button"
            className="linky"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? t("common.cancel").toLowerCase() : t("staff.stepDown")}
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
            {t("staff.backIn", { t: formatMinutes(suspensionRemaining(state, trainer)) })}
          </span>
        ) : (
          <span className="dim">
{trainer.suspensions > 0 &&
              t("staff.suspensions", {
                n: trainer.suspensions,
                max: M.suspensionsBeforeDeparture,
              })}
            {t("staff.morale", { n: Math.round(trainer.morale * 100) })}
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
{targets.length > 0
            ? t("staff.warnTargets", { n: Math.round((1 - toSuspension) * 100) })
            : t("staff.warnNoPost", { n: Math.round((1 - toSuspension) * 100) })}
        </p>
      )}

      {targets.length > 0 && (
        <div className="standing-actions">
          <button type="button" className="btn sm ghost" onClick={() => setOpen((v) => !v)}>
            {open ? t("common.cancel") : t("staff.stepDownBtn")}
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
  const t = useT();
  return (
    <>
      <ul className="demote-list">
        {targets.map((target) => (
          <li key={labelKey(target)}>
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                act((s) => void demote(s, trainer.id, target));
                onDone();
              }}
            >
              {target.label}
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">
{t("staff.demoteNote")}
      </p>
    </>
  );
}

function labelKey(target: DemotionTarget): string {
  return target.kind === "elite" ? `e${target.rank}` : `${target.kind}:${target.gymId}`;
}

function formatMinutes(seconds: number): string {
  const m = Math.ceil(seconds / 60);
  return m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`;
}
