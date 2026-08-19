import { useEffect } from "react";
import { useGame } from "../../engine/store.js";
import {
  claim,
  objectives,
  pendingDecisions,
  type DeskTarget,
  type Reward,
} from "../../sim/index.js";
import type { TabId } from "./Tabs.js";
import { useT } from "../i18n.js";

/**
 * The Desk: what happened, and what needs you.
 *
 * The game has never spoken to the player. Everything it holds is available on
 * some screen, and a decision nobody surfaces is a decision that does not
 * happen — measured across a hundred and sixty retirements, the Day-Care was
 * used **zero times**, not because it was hard but because nothing ever
 * mentioned it.
 *
 * So this is the landing screen: a read-out of the night, then the things
 * standing open, each one a way through to the screen that resolves it. It is
 * deliberately not a place where anything is *done* — the Desk tells you where
 * to go, and the screens keep their own jobs.
 */
const WHERE: Record<DeskTarget, TabId> = {
  gyms: "gyms",
  pc: "pc",
  field: "field",
  elite: "staff",
  hall: "hall",
  daycare: "daycare",
  facilities: "facilities",
};

export function Desk({ onGo }: { onGo: (tab: TabId) => void }) {
  const t = useT();
  const state = useGame((s) => s.state);
  const clearDigest = useGame((s) => s.clearDigest);

  // Reading it is what marks it read. Clearing on unmount rather than on mount
  // so the summary survives being looked at.
  useEffect(() => () => clearDigest(), [clearDigest]);

  const decisions = pendingDecisions(state);
  const urgent = decisions.filter((d) => d.urgency === "urgent").length;

  return (
    <div className="desk">
      <h2 className="col-title">
        {t("desk.title")}
        <span className="counter">
          {decisions.length === 0
            ? t("desk.nothingOpen")
            : urgent > 0
              ? t("desk.openUrgent", { n: decisions.length, u: urgent })
              : t("desk.open", { n: decisions.length })}
        </span>
      </h2>

      <Digest />

      <Objectives />

      {decisions.length === 0 ? (
        <p className="empty">
{t("desk.allClear")}
        </p>
      ) : (
        <ul className="decisions">
          {decisions.map((d) => (
            <li key={d.id} className={`decision is-${d.urgency}`}>
              <button type="button" onClick={() => onGo(WHERE[d.where])}>
<span className="decision-title">{t(d.title as never, d.params)}</span>
                <span className="decision-detail">{t(d.detail as never, d.params)}</span>
                <span className="decision-go" aria-hidden="true">
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * What the league could be working toward.
 *
 * The game had no stated goal at any moment. These suggest and never gate —
 * renown already does the gating — and they pay in crew slots and facility
 * levels, the two things every screen is waiting on and the two things money
 * cannot hurry.
 */
function Objectives() {
  const t = useT();
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const list = objectives(state).slice(0, 5);
  if (list.length === 0) return null;

  return (
    <section className="objectives">
      <h3>{t("desk.workingToward")}</h3>
      <ul>
        {list.map((o) => (
          <li key={o.id} className={o.done ? "is-done" : ""}>
            <span className="obj-id">
<span className="obj-title">{t(o.title as never, o.titleParams)}</span>
              <span className="obj-detail">{t(o.detail as never)}</span>
            </span>

            <span className="obj-right">
              <span className="obj-reward">{rewardOf(t, o.reward)}</span>
              {o.done ? (
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => act((s) => void claim(s, o.id))}
                >
                  {t("desk.collect")}
                </button>
              ) : (
                <span className="obj-count">
                  {o.have.toLocaleString()}/{o.goal.toLocaleString()}
                </span>
              )}
            </span>

            <span className="obj-track">
              <span style={{ width: `${(o.have / Math.max(1, o.goal)) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What an objective pays, said plainly. */
function rewardOf(t: ReturnType<typeof useT>, reward: Reward): string {
  switch (reward.kind) {
    case "crew":
      return t("reward.crew");
    case "facility":
      return t("reward.facility", { name: t(`facility.${reward.id}.name`) });
    case "kit":
      return t("reward.kit", { balls: reward.balls, potions: reward.potions });
    case "money":
      return t("reward.money", { n: reward.amount.toLocaleString() });
  }
}

/** What the league did while you were not reading. */
function Digest() {
  const t = useT();
  const digest = useGame((s) => s.digest);
  const nothing =
    digest.held === 0 &&
    digest.lost === 0 &&
    digest.caught === 0 &&
    digest.retired === 0 &&
    digest.rivals.length === 0;

  if (nothing) {
    return (
      <section className="digest is-quiet">
        <p className="dim">{t("desk.quiet")}</p>
      </section>
    );
  }

  return (
    <section className="digest">
      <h3>{t("desk.since")}</h3>
      <dl className="digest-facts">
        <div>
          <dt>{t("desk.held")}</dt>
          <dd>{digest.held.toLocaleString()}</dd>
        </div>
        <div>
          <dt>{t("desk.badgesLost")}</dt>
          <dd className={digest.lost > 0 ? "is-bad" : ""}>{digest.lost}</dd>
        </div>
        <div>
          <dt>{t("desk.taken")}</dt>
          <dd>&#8369;{Math.round(digest.earned).toLocaleString()}</dd>
        </div>
        <div>
          <dt>{t("desk.caught")}</dt>
          <dd>{digest.caught}</dd>
        </div>
        <div>
          <dt>{t("desk.retired")}</dt>
          <dd>{digest.retired}</dd>
        </div>
      </dl>

      <ul className="digest-notes">
        {digest.usurped && (
          <li className="is-bad">
{t("desk.usurped", { name: digest.usurped })}
          </li>
        )}
        {digest.suspended.map((name, i) => (
          <li key={`s${i}`}>
{t("desk.suspended", { name })}
          </li>
        ))}
        {digest.rivals.map((name, i) => (
          <li key={`r${i}`}>
{t("desk.rival", { name })}
          </li>
        ))}
        {digest.evolved.map((text, i) => (
          <li key={`e${i}`}>{text}.</li>
        ))}
      </ul>
    </section>
  );
}
