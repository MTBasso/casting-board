import { useT, useTk } from "../i18n.js";
import { TYPES, type Gym, type TypeId } from "../../sim/index.js";
import { effectiveness } from "../../data/typechart.js";
import { TypeBadge } from "./TypeBadge.js";
import { TYPE_COLORS } from "../typeColors.js";

/**
 * The mechanic that teaches the type chart to a player who never watches a
 * battle: show what is *coming*, not what the chart says. Types that beat this
 * gym are marked, so the read is "who is hurting me" rather than "recall 18x18".
 */
export function ThreatReport({ gym }: { gym: Gym }) {
  const t = useT();
  const tk = useTk();
  const rows = TYPES.map((t) => ({
    type: t,
    share: gym.threat.distribution[t],
    beats: effectiveness(t, gym.type) > 1,
  }))
    .filter((r) => r.share > 0.005)
    .sort((a, b) => b.share - a.share)
    .slice(0, 6);

  const total = rows.reduce((a, r) => a + r.share, 0) || 1;

  return (
    <div className={`threat status-${gym.threat.status}`}>
      <div className="threat-head">
        <h3>{t("threat.title")}</h3>
        <span className={`status-pill status-${gym.threat.status}`}>
          {tk(`threat.${gym.threat.status}`)}
        </span>
      </div>
      <p className="threat-sub">
{t("threat.sub", {
          n: gym.threat.samples.toLocaleString(),
          pct: Math.round(gym.threat.lossRate * 100),
        })}
      </p>

      {gym.threat.samples < 10 ? (
        <p className="empty">{t("threat.tooEarly")}</p>
      ) : (
        <div className="bars">
          {rows.map((r) => (
            <Row key={r.type} type={r.type} pct={r.share / total} beats={r.beats} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ type, pct, beats }: { type: TypeId; pct: number; beats: boolean }) {
  const t = useT();
  return (
    <div className={`bar-row ${beats ? "is-threat" : ""}`}>
      <span className="bar-label">
        <TypeBadge type={type} size="sm" />
        {beats && <b title={t("threat.superEffective")}>▲</b>}
      </span>
      <span className="track">
        <span
          className="fill"
          style={{ width: `${(pct * 100).toFixed(1)}%`, background: TYPE_COLORS[type] }}
        />
      </span>
      <span className="pct">{Math.round(pct * 100)}%</span>
    </div>
  );
}
