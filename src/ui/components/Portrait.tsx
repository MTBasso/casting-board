import { FACE_BOUNDS, FACE_CANVAS } from "../../data/faceBounds.js";
import type { Trainer } from "../../sim/index.js";

/**
 * A trainer's face.
 *
 * Chosen at hire and stored, so it never changes under the player — the same
 * person you promoted is recognisably the same person afterwards. Type and rank
 * both constrain the pool: no Fire specialist in a Bug Catcher's hat, and nobody
 * holding a league post looking like a schoolkid.
 *
 * The sprite is a whole 80x80 person, so this crops to the head — measured once
 * by `scripts/face-bounds.ts`. Uncropped, a 44px slot rendered a face about
 * eight pixels tall, which reads as a figure in the distance rather than as
 * somebody you employ.
 */
export function Portrait({
  trainer,
  size = 40,
}: {
  trainer: Trainer;
  size?: number;
}) {
  if (!trainer.look) return null;

  const box = FACE_BOUNDS[trainer.look];
  const src = `${import.meta.env.BASE_URL}trainers/${trainer.look}.png`;

  // An unmeasured sprite still renders, whole, rather than disappearing.
  if (!box) {
    return (
      <span className="portrait" style={{ width: size, height: size }}>
        <img src={src} alt="" loading="lazy" />
      </span>
    );
  }

  const [x, y, crop] = box;
  const scale = size / crop;

  return (
    <span className="portrait is-face" style={{ width: size, height: size }}>
      <img
        src={src}
        alt=""
        loading="lazy"
        // Absolute pixels, not percentages: a percentage resolves against the
        // frame, and the number that matters is how far the *sprite* is scaled.
        style={{
          width: FACE_CANVAS * scale,
          height: FACE_CANVAS * scale,
          marginLeft: -x * scale,
          marginTop: -y * scale,
        }}
      />
    </span>
  );
}
