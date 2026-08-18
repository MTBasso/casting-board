import type { TypeId } from "../../sim/index.js";
import { needsDarkText, TYPE_COLORS } from "../typeColors.js";

/**
 * A type badge, drawn the way the series draws them: a filled pill in the
 * type's own colour. One component so every badge in the game is identical —
 * and so contrast is decided once rather than per call site.
 */
export function TypeBadge({
  type,
  size = "md",
}: {
  type: TypeId;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`type-badge ${size} ${needsDarkText(type) ? "on-light" : ""}`}
      style={{ background: TYPE_COLORS[type] }}
    >
      {type}
    </span>
  );
}

/** A row of badges for a creature's typing. */
export function TypeBadges({
  types,
  size = "md",
}: {
  types: readonly TypeId[];
  size?: "sm" | "md";
}) {
  return (
    <span className="type-badges">
      {types.map((t) => (
        <TypeBadge key={t} type={t} size={size} />
      ))}
    </span>
  );
}
