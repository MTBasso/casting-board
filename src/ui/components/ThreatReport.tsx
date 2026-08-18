import { TYPES, type Gym, type TypeId } from "../../sim/index.js";
import { effectiveness } from "../../data/typechart.js";
import { TypeBadge } from "./TypeBadge.js";
import { TYPE_COLORS } from "../typeColors.js";

const STATUS_LABEL = {
  stable: "Stable",
  watch: "Watch",
  critical: "Critical",
} as const;

/**
 * The mechanic that teaches the type chart to a player who never watches a
 * battle: show what is *coming*, not what the chart says. Types that beat this
 * gym are marked, so the read is "who is hurting me" rather than "recall 18x18".
 */
export function ThreatReport({ gym }: { gym: Gym }) {
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
        <h3>Threat Report</h3>
        <span className={`status-pill status-${gym.threat.status}`}>
          {STATUS_LABEL[gym.threat.status]}
        </span>
      </div>
      <p className="threat-sub">
        Incoming challenger types · {gym.threat.samples.toLocaleString()} waves observed ·{" "}
        {Math.round(gym.threat.lossRate * 100)}% lost
      </p>

      {gym.threat.samples < 10 ? (
        <p className="empty">Not enough waves yet to read a pattern.</p>
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
  return (
    <div className={`bar-row ${beats ? "is-threat" : ""}`}>
      <span className="bar-label">
        <TypeBadge type={type} size="sm" />
        {beats && <b title="Super effective against this gym">▲</b>}
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
