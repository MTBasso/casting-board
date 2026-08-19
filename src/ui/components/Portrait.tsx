import type { Trainer } from "../../sim/index.js";

/**
 * A trainer's face.
 *
 * Chosen at hire and stored, so it never changes under the player — the same
 * person you promoted is recognisably the same person afterwards. Type and rank
 * both constrain the pool: no Fire specialist in a Bug Catcher's hat, and nobody
 * holding a league post looking like a schoolkid.
 */
export function Portrait({
  trainer,
  size = 40,
}: {
  trainer: Trainer;
  size?: number;
}) {
  if (!trainer.look) return null;
  return (
    <span className="portrait" style={{ width: size, height: size }}>
      <img
        src={`${import.meta.env.BASE_URL}trainers/${trainer.look}.png`}
        alt=""
        loading="lazy"
      />
    </span>
  );
}
