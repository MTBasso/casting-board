import { catalog } from "../../sim/index.js";
import { ICON_BOUNDS, ICON_CANVAS } from "../../data/iconBounds.js";
import { iconUrl, spriteUrl } from "../sprites.js";

/**
 * How much of the slot a normalised icon's figure fills.
 *
 * Not the whole slot: leaving a margin keeps the grid from looking like a wall
 * of creatures pressed against their own edges, and gives tall figures like
 * Onix somewhere to be tall.
 */
const ICON_FILL = 0.86;

/**
 * A creature's sprite, at a given size, without distorting it.
 *
 * The Gen 5 animated sprites are not square and not a uniform size — Onix is
 * tall, Wailord is wide, Diglett is tiny. Every call site used to set matching
 * `width` and `height` attributes, which stretched half the dex to fit a box it
 * was never drawn for.
 *
 * So the *box* is square and the sprite is contained inside it, bottom-aligned
 * the way the games stand a creature on the ground rather than floating it in
 * the middle of a frame.
 */
export function Sprite({
  speciesId,
  size,
  kind = "sprite",
  className,
  flip = false,
}: {
  speciesId: string;
  size: number;
  /** `icon` is the small box sprite; `sprite` is the animated battler. */
  kind?: "sprite" | "icon";
  className?: string;
  /** Face the other way, for the league's own side of a battle. */
  flip?: boolean;
}) {
  const url = kind === "icon" ? iconUrl(speciesId) : spriteUrl(speciesId);
  if (!url) return null;

  const box = `sprite-box ${kind === "icon" ? "is-icon" : ""} ${flip ? "is-flipped" : ""} ${className ?? ""}`;

  if (kind === "icon") {
    // Box icons all share one canvas but draw the creature at true relative
    // scale — Mr. Mime fills 37x36 of it, Wurmple 18x17. Authentic at full
    // size; at bench size it left Wurmple about twelve pixels of actual
    // creature. So scale by the *figure*, measured once by
    // `scripts/icon-bounds.ts`, and every creature reads at every size.
    const dex = catalog.get(speciesId)?.id ?? 0;
    const bounds = ICON_BOUNDS[dex];

    if (bounds) {
      const [bx, by, bw, bh] = bounds;
      const scale = (size * ICON_FILL) / Math.max(bw, bh);
      return (
        <span className={box} style={{ width: size, height: size }}>
          <img
            src={url}
            alt=""
            loading="lazy"
            className="icon-normalised"
            style={{
              width: ICON_CANVAS.width * scale,
              height: ICON_CANVAS.height * scale,
              // Placed outright rather than nudged with margins: the figure's
              // own centre goes to the slot's centre, and the result does not
              // depend on how the box happens to align its child.
              left: size / 2 - (bx + bw / 2) * scale,
              top: size / 2 - (by + bh / 2) * scale,
            }}
          />
        </span>
      );
    }
  }

  return (
    <span className={box} style={{ width: size, height: size }}>
      <img src={url} alt="" loading="lazy" />
    </span>
  );
}
