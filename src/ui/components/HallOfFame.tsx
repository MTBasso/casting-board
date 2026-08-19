import { useMemo, useState } from "react";
import { useGame } from "../../engine/store.js";
import { useT, type Key } from "../i18n.js";
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
  const t = useT();
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
        <h2 className="col-title">{t("hall.title")}</h2>
        <p className="empty">
{t("hall.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="hall">
      <h2 className="col-title">
        {t("hall.title")}
        <span className="counter">
          {t("hall.count", { n: state.legends.length, i: inducted })}
        </span>
      </h2>

      <p className="hint">
{t("hall.hint")}
      </p>

      <div className="toolbar">
        <label className="field">
          <span>{t("common.sort")}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="recent">{t("hall.mostRecent")}</option>
            <option value="wins">{t("hall.battlesWon")}</option>
            <option value="bond">{t("hall.bondEnd")}</option>
            <option value="served">{t("hall.careerServed")}</option>
          </select>
        </label>

        {present.length > 1 && (
          <label className="field">
            <span>{t("common.type")}</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as TypeId | "all")}
            >
              <option value="all">{t("common.all")} ({state.legends.length})</option>
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
  const t = useT();
  const served = entry.careerTotal > 0 ? entry.served / entry.careerTotal : 0;
  const record = entry.wins + entry.losses;
  const rate = record > 0 ? Math.round((entry.wins / record) * 100) : 0;

  return (
    <li className={`plaque ${entry.inducted ? "is-mentor" : ""}`}>
      {entry.inducted && (
        <span className="mentor-mark" title={t("hall.mentorTitle")}>
          {t("hall.mentor")}
        </span>
      )}

      <Sprite speciesId={entry.speciesId} size={72} />

      <span className="plaque-name">{entry.name}</span>
      <TypeBadge type={entry.type} size="sm" />

      <dl className="plaque-facts">
        <div>
          <dt>{t("creature.record")}</dt>
          <dd>
            {entry.wins}–{entry.losses}
            <span className="dim"> {rate}%</span>
          </dd>
        </div>
        <div>
          <dt>{t("common.level")}</dt>
          <dd>{entry.level}</dd>
        </div>
        <div>
          <dt>{t("hall.served")}</dt>
          <dd>{Math.round(served * 100)}%</dd>
        </div>
        <div>
          <dt>{t("hall.bond")}</dt>
          <dd>{Math.round(entry.bond * 100)}%</dd>
        </div>
      </dl>

      {/* Said in words, because a percentage is not what you remember about
          someone. */}
      <span className="plaque-note">{t(epitaph(entry, served))}</span>
    </li>
  );
}

/** What this career was, in a line. */
function epitaph(entry: HallEntry, served: number): Key {
  if (entry.bond >= 0.95 && entry.wins >= 200) return "epitaph.complete";
  if (entry.bond >= 0.95) return "epitaph.knew";
  if (entry.wins >= 200) return "epitaph.turned";
  if (served >= 0.98) return "epitaph.gave";
  if (entry.losses > entry.wins) return "epitaph.stood";
  return "epitaph.served";
}
