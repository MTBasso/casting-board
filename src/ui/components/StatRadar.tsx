import type { Stats } from "../../sim/index.js";
import { useT } from "../i18n.js";

const AXES: { key: keyof Stats; label: string }[] = [
  { key: "hp", label: "HP" },
  { key: "attack", label: "Atk" },
  { key: "defense", label: "Def" },
  { key: "speed", label: "Spe" },
  { key: "spDefense", label: "SpD" },
  { key: "spAttack", label: "SpA" },
];

/**
 * The stat hexagon.
 *
 * Six numbers are hard to compare and a shape is not — a wall and a sweeper are
 * different silhouettes before you have read a single figure. Drawn as inline
 * SVG so it inherits the theme's colours rather than shipping a chart library
 * for one graphic.
 */
export function StatRadar({
  stats,
  size = 132,
  max = 260,
}: {
  stats: Stats;
  size?: number;
  max?: number;
}) {
  const t = useT();
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 18;

  const point = (i: number, ratio: number) => {
    // Start at the top and go clockwise, as the games do.
    const angle = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
    return [cx + Math.cos(angle) * r * ratio, cy + Math.sin(angle) * r * ratio];
  };

  const ring = (ratio: number) =>
    AXES.map((_, i) => point(i, ratio).join(",")).join(" ");

  const shape = AXES.map((axis, i) =>
    point(i, Math.max(0.06, Math.min(1, stats[axis.key] / max))).join(","),
  ).join(" ");

  return (
    <svg
      className="radar"
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={t("creature.statSpread")}
    >
      {[0.25, 0.5, 0.75, 1].map((ratio) => (
        <polygon key={ratio} className="radar-ring" points={ring(ratio)} />
      ))}
      {AXES.map((_, i) => {
        const [x, y] = point(i, 1);
        return <line key={i} className="radar-spoke" x1={cx} y1={cy} x2={x} y2={y} />;
      })}

      <polygon className="radar-shape" points={shape} />

      {AXES.map((axis, i) => {
        const [x, y] = point(i, 1.24);
        return (
          <text key={axis.key} className="radar-label" x={x} y={y}>
            {axis.label}
          </text>
        );
      })}
    </svg>
  );
}

/** The same six numbers as rows, for when the shape is not enough. */
export function StatRows({ stats }: { stats: Stats }) {
  const max = Math.max(...AXES.map((a) => stats[a.key]));
  return (
    <dl className="stat-rows">
      {AXES.map((axis) => (
        <div key={axis.key}>
          <dt>{axis.label}</dt>
          <dd>
            <span className="stat-track">
              <span
                className={`stat-fill stat-${axis.key}`}
                style={{ width: `${Math.max(4, (stats[axis.key] / max) * 100)}%` }}
              />
            </span>
            <b>{stats[axis.key]}</b>
          </dd>
        </div>
      ))}
    </dl>
  );
}
