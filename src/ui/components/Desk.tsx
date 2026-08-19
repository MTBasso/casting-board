import { useEffect } from "react";
import { useGame } from "../../engine/store.js";
import { pendingDecisions, type DeskTarget } from "../../sim/index.js";
import type { TabId } from "./Tabs.js";

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
        Desk
        <span className="counter">
          {decisions.length === 0
            ? "nothing outstanding"
            : `${decisions.length} open${urgent > 0 ? ` · ${urgent} urgent` : ""}`}
        </span>
      </h2>

      <Digest />

      {decisions.length === 0 ? (
        <p className="empty">
          Nothing is waiting on you. The league is holding, everyone is working,
          and the box has room. Go and watch a gym.
        </p>
      ) : (
        <ul className="decisions">
          {decisions.map((d) => (
            <li key={d.id} className={`decision is-${d.urgency}`}>
              <button type="button" onClick={() => onGo(WHERE[d.where])}>
                <span className="decision-title">{d.title}</span>
                <span className="decision-detail">{d.detail}</span>
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

/** What the league did while you were not reading. */
function Digest() {
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
        <p className="dim">Quiet since you last looked.</p>
      </section>
    );
  }

  return (
    <section className="digest">
      <h3>Since you last looked</h3>
      <dl className="digest-facts">
        <div>
          <dt>Held</dt>
          <dd>{digest.held.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Badges lost</dt>
          <dd className={digest.lost > 0 ? "is-bad" : ""}>{digest.lost}</dd>
        </div>
        <div>
          <dt>Taken</dt>
          <dd>&#8369;{Math.round(digest.earned).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Caught</dt>
          <dd>{digest.caught}</dd>
        </div>
        <div>
          <dt>Retired</dt>
          <dd>{digest.retired}</dd>
        </div>
      </dl>

      <ul className="digest-notes">
        {digest.usurped && (
          <li className="is-bad">
            <b>{digest.usurped}</b> took the league, and is your Champion now.
          </li>
        )}
        {digest.suspended.map((name, i) => (
          <li key={`s${i}`}>
            <b>{name}</b> was suspended.
          </li>
        ))}
        {digest.rivals.map((name, i) => (
          <li key={`r${i}`}>
            <b>{name}</b> came for a badge.
          </li>
        ))}
        {digest.evolved.map((text, i) => (
          <li key={`e${i}`}>{text}.</li>
        ))}
      </ul>
    </section>
  );
}
