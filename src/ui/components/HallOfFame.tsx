import { useMemo, useState } from "react";
import { useGame } from "../../engine/store.js";
import { Sprite } from "./Sprite.js";
import { TYPES, type HallEntry, type TypeId } from "../../sim/index.js";
import { TypeBadge } from "./TypeBadge.js";

/**
 * The Hall of Fame.
 *
 * Where careers end. Every creature here served most of a life in your league
 * and then ran out of battles — which is the arc the whole design is built on
 * and which, until now, the player never saw: eighty careers ended per run into
 * a role change and nothing else.
 *
 * Entry is selective on purpose. A hall everyone enters is a staff list, and it
 * would bury the dozen you remember under four hundred you do not.
 *
 * Mentors are drawn from here at promotion, so this is also the shortlist for
 * the most loaded decision in the game.
 */
type SortKey = "recent" | "wins" | "bond" | "served";

export function HallOfFame() {
  const state = useGame((s) => s.state);
  const [sort, setSort] = useState<SortKey>("recent");
  const [filter, setFilter] = useState<TypeId | "all">("all");

  const shown = useMemo(() => {
    const list = state.legends.filter(
      (e) => filter === "all" || e.type === filter,
    );
    return [...list].sort((a, b) => {
      if (sort === "wins") return b.wins - a.wins;
      if (sort === "bond") return b.bond - a.bond;
      if (sort === "served") return b.served - a.served;
      return b.retiredAt - a.retiredAt;
    });
  }, [state.legends, sort, filter]);

  const present = TYPES.filter((t) => state.legends.some((e) => e.type === t));
  const inducted = state.legends.filter((e) => e.inducted).length;

  if (state.legends.length === 0) {
    return (
      <div className="hall">
        <h2 className="col-title">Hall of Fame</h2>
        <p className="empty">
          Nobody yet. A creature enters the Hall when its career ends after
          serving most of a life — which takes a long service, not a good one.
        </p>
      </div>
    );
  }

  return (
    <div className="hall">
      <h2 className="col-title">
        Hall of Fame
        <span className="counter">
          {state.legends.length} remembered · {inducted} carried forward
        </span>
      </h2>

      <p className="hint">
        Careers that ran their course in your service. At promotion you induct
        from here, and the ones you choose become Mentors — the only thing that
        survives a league.
      </p>

      <div className="toolbar">
        <label className="field">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="recent">Most recent</option>
            <option value="wins">Battles won</option>
            <option value="bond">Bond at the end</option>
            <option value="served">Career served</option>
          </select>
        </label>

        {present.length > 1 && (
          <label className="field">
            <span>Type</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as TypeId | "all")}
            >
              <option value="all">All ({state.legends.length})</option>
              {present.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <ul className="hall-grid">
        {shown.map((e) => (
          <Plaque key={e.id} entry={e} />
        ))}
      </ul>
    </div>
  );
}

function Plaque({ entry }: { entry: HallEntry }) {
  const served = entry.careerTotal > 0 ? entry.served / entry.careerTotal : 0;
  const record = entry.wins + entry.losses;
  const rate = record > 0 ? Math.round((entry.wins / record) * 100) : 0;

  return (
    <li className={`plaque ${entry.inducted ? "is-mentor" : ""}`}>
      {entry.inducted && (
        <span className="mentor-mark" title="Carried forward as a Mentor">
          Mentor
        </span>
      )}

      <Sprite speciesId={entry.speciesId} size={72} />

      <span className="plaque-name">{entry.name}</span>
      <TypeBadge type={entry.type} size="sm" />

      <dl className="plaque-facts">
        <div>
          <dt>Record</dt>
          <dd>
            {entry.wins}–{entry.losses}
            <span className="dim"> {rate}%</span>
          </dd>
        </div>
        <div>
          <dt>Level</dt>
          <dd>{entry.level}</dd>
        </div>
        <div>
          <dt>Served</dt>
          <dd>{Math.round(served * 100)}%</dd>
        </div>
        <div>
          <dt>Bond</dt>
          <dd>{Math.round(entry.bond * 100)}%</dd>
        </div>
      </dl>

      {/* Said in words, because a percentage is not what you remember about
          someone. */}
      <span className="plaque-note">{epitaph(entry, served)}</span>
    </li>
  );
}

/** What this career was, in a line. */
function epitaph(entry: HallEntry, served: number): string {
  if (entry.bond >= 0.95 && entry.wins >= 200) return "Knew you completely, and never let the gym fall.";
  if (entry.bond >= 0.95) return "Knew you completely.";
  if (entry.wins >= 200) return "Turned away more challengers than you can name.";
  if (served >= 0.98) return "Gave every battle it had.";
  if (entry.losses > entry.wins) return "Stood up more often than it won, every time.";
  return "Served out its career on the board.";
}
