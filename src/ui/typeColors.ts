import type { TypeId } from "../sim/index.js";

/**
 * The canonical type colours.
 *
 * These are the series' own values rather than something invented for this
 * project. Players already know them cold — a blue badge *is* Water — so using
 * anything else spends recognition the game gets for free.
 */
export const TYPE_COLORS: Record<TypeId, string> = {
  normal: "#A8A77A",
  fire: "#EE8130",
  water: "#6390F0",
  electric: "#F7D02C",
  grass: "#7AC74C",
  ice: "#96D9D6",
  fighting: "#C22E28",
  poison: "#A33EA1",
  ground: "#E2BF65",
  flying: "#A98FF3",
  psychic: "#F95587",
  bug: "#A6B91A",
  rock: "#B6A136",
  ghost: "#735797",
  dragon: "#6F35FC",
  dark: "#705746",
  steel: "#B7B7CE",
  fairy: "#D685AD",
};

/**
 * Whether a type's badge needs dark text.
 *
 * Several of these colours are pale — Electric, Ice, Steel, Ground — and white
 * text on them is unreadable. Derived from relative luminance rather than a
 * hand-kept list, so adding a type cannot quietly produce an illegible badge.
 */
export function needsDarkText(type: TypeId): boolean {
  const hex = TYPE_COLORS[type].slice(1);
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const channel = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const luminance =
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

  return luminance > 0.45;
}
