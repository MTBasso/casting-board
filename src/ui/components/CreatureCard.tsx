import { useGame } from "../../engine/store.js";
import { Sprite } from "./Sprite.js";
import { type Creature } from "../../sim/index.js";
import { speciesName } from "../sprites.js";
import { TYPE_COLORS } from "../typeColors.js";
import { TypeBadges } from "./TypeBadge.js";

/**
 * A party slot.
 *
 * Deliberately compact: six of these sit two-by-three, so the card has to say
 * who this is and how they are doing at a glance, and nothing more. Everything
 * else — the six stats, the pedigree, what bond actually does — lives in the
 * summary a click away.
 *
 * The two things it does show are the two the game is about: how much life this
 * creature has left, and how well you know each other. They are drawn
 * differently on purpose — career *drains*, bond *fills* — because a pair of
 * identical bars made two very different facts look like the same fact.
 */
export function CreatureCard({
  creature,
  onOpen,
}: {
  creature: Creature;
  onOpen?: () => void;
}) {
  const state = useGame((s) => s.state);

  const species = speciesName(creature.speciesId);
  const primary = creature.types[0] ?? "normal";

  const left = Math.max(0, Math.round(creature.careerTotal - creature.careerSpent));
  const remaining = creature.careerTotal > 0 ? left / creature.careerTotal : 0;
  const nearingEnd = remaining <= 0.25;

  const trainer = creature.trainerId ? state.trainers[creature.trainerId] : undefined;
  const isSignature = trainer?.signatureId === creature.id;
  const bondPips = Math.max(1, Math.round(creature.bond * 5));

  return (
    <article
      className={`creature ${nearingEnd ? "is-ending" : ""} ${creature.pinned ? "is-pinned" : ""}`}
      style={{ ["--type-tint" as string]: TYPE_COLORS[primary] }}
    >
      <button
        type="button"
        className="creature-open"
        onClick={onOpen}
        title="Open summary"
        aria-label={`Open ${creature.nickname ?? species} summary`}
      >
        <div className="creature-portrait">
          <Sprite speciesId={creature.speciesId} size={52} />
        </div>

        <div className="creature-body">
          <header className="creature-top">
            <h4>{creature.nickname ?? species}</h4>
            <span className="creature-level">Lv{creature.level}</span>
          </header>

          <TypeBadges types={creature.types} size="sm" />

          {/* Career drains, so it reads as a depleting strip under the name. */}
          <span className="career-track slim" title={`${left.toLocaleString()} battles left`}>
            <span
              className={`career-fill ${nearingEnd ? "is-low" : ""}`}
              style={{ width: `${Math.max(2, remaining * 100)}%` }}
            />
          </span>

          <div className="card-foot">
            {/* Bond fills, so it reads as pips earned rather than a level. */}
            <span className="pips" title="How well you know each other">
              {"●".repeat(bondPips)}
              <span className="pips-empty">{"○".repeat(5 - bondPips)}</span>
            </span>
            <span className="card-condition">
              {creature.fatigue > 0.9
                ? "Exhausted"
                : creature.fatigue > 0.5
                  ? "Tiring"
                  : "Rested"}
            </span>
            {creature.pinned && <span className="card-pin">★</span>}
            {isSignature && <span className="card-sig">SIG</span>}
          </div>
        </div>
      </button>
    </article>
  );
}
