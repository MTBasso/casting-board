import { useEffect } from "react";
import { useGame } from "../../engine/store.js";
import { Sprite } from "./Sprite.js";
import { catalog } from "../../data/catalog.js";
import {
  constants,
  pedigree,
  statsOf,
  togglePin,
  type Creature,
} from "../../sim/index.js";
import { speciesName } from "../sprites.js";
import { creatureName } from "../names.js";
import { TypeBadges } from "./TypeBadge.js";
import { StatRadar, StatRows } from "./StatRadar.js";

/**
 * How attached a creature is, in words.
 *
 * A bar said "0.62", which is a number about nothing. Bond is a relationship,
 * and the games have always described it rather than measured it — so it gets a
 * description, a row of pips, and, crucially, a plain statement of what it
 * actually does.
 */
function bondReading(bond: number): { label: string; effect: string; pips: number } {
  const spread =
    constants.BOND.varianceAtZero +
    (constants.BOND.varianceAtFull - constants.BOND.varianceAtZero) * bond;
  const swing = Math.round(spread * 100);

  const label =
    bond >= 0.85
      ? "Inseparable"
      : bond >= 0.6
        ? "Very attached"
        : bond >= 0.35
          ? "Warming to you"
          : bond >= 0.15
            ? "Getting used to you"
            : "Wary of you";

  const effect =
    bond >= 0.85
      ? `Fights exactly as its stats promise — swings only ±${swing}%.`
      : bond >= 0.5
        ? `Mostly dependable, swinging ±${swing}% either way.`
        : `Unpredictable — swings ±${swing}%, and will throw battles it should win.`;

  return { label, effect, pips: Math.max(1, Math.round(bond * 5)) };
}

/**
 * How much life a creature has left.
 *
 * Career is the game's central bargain — every battle spends something you
 * cannot get back — so it deserves the actual number rather than a bar that
 * looks like everything else.
 */
function careerReading(creature: Creature) {
  const left = Math.max(0, Math.round(creature.careerTotal - creature.careerSpent));
  const ratio = creature.careerTotal > 0 ? left / creature.careerTotal : 0;
  const label =
    ratio > 0.75
      ? "Fresh"
      : ratio > 0.5
        ? "Seasoned"
        : ratio > 0.25
          ? "Veteran"
          : ratio > 0.08
            ? "Fading"
            : "Final days";
  return { left, ratio, label };
}

export function CreatureSummary({
  creature,
  onClose,
}: {
  creature: Creature;
  onClose: () => void;
}) {
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const species = catalog.get(creature.speciesId);
  const stats = statsOf(creature);
  const bond = bondReading(creature.bond);
  const career = careerReading(creature);
  const ancestry = pedigree(state, creature.id);
  const trainer = creature.trainerId ? state.trainers[creature.trainerId] : undefined;
  const isSignature = trainer?.signatureId === creature.id;

  return (
    <div className="summary-backdrop" onClick={onClose} role="presentation">
      <div
        className="summary"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${creatureName(creature)} summary`}
      >
        <div className="summary-bar">
          <span>Pokémon Info</span>
          <span className="summary-tag">Summary</span>
          <button type="button" className="summary-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="summary-head">
          <div className="summary-portrait">
            <Sprite speciesId={creature.speciesId} size={96} />
          </div>
          <div className="summary-id">
            <h3>
              {creatureName(creature)}
              <button
                type="button"
                className={`pin ${creature.pinned ? "is-on" : ""}`}
                onClick={() => act((s) => togglePin(s, creature.id))}
                title={creature.pinned ? "Pinned" : "Pin so this one is never swapped out"}
              >
                {creature.pinned ? "★" : "☆"}
              </button>
            </h3>
            <dl className="summary-facts">
              <div>
                <dt>Dex No.</dt>
                <dd>{String(species?.id ?? 0).padStart(3, "0")}</dd>
              </div>
              <div>
                <dt>Species</dt>
                <dd>{speciesName(creature.speciesId)}</dd>
              </div>
              <div>
                <dt>Level</dt>
                <dd>{creature.level}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>
                  <TypeBadges types={creature.types} size="sm" />
                </dd>
              </div>
              <div>
                <dt>Record</dt>
                <dd>
                  {creature.wins}W / {creature.losses}L
                </dd>
              </div>
              <div>
                <dt>Trainer</dt>
                <dd>{trainer?.name ?? "In the box"}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="summary-bar">
          <span>Skills</span>
          <span className="summary-tag">Stats</span>
        </div>

        <div className="summary-stats">
          <StatRadar stats={stats} size={168} />
          <StatRows stats={stats} />
        </div>

        <div className="summary-bar">
          <span>Trainer Memo</span>
          <span className="summary-tag">Condition</span>
        </div>

        <div className="summary-memo">
          <section>
            <h4>
              Bond
              <span className="pips" aria-hidden="true">
                {"●".repeat(bond.pips)}
                <span className="pips-empty">{"○".repeat(5 - bond.pips)}</span>
              </span>
            </h4>
            <p className="memo-label">{bond.label}</p>
            <p className="memo-effect">{bond.effect}</p>
          </section>

          <section>
            <h4>Career</h4>
            <p className="memo-label">
              {career.label} — <b>{career.left.toLocaleString()}</b> battles left
            </p>
            <span className="career-track">
              <span
                className={`career-fill ${career.ratio <= 0.25 ? "is-low" : ""}`}
                style={{ width: `${Math.max(2, career.ratio * 100)}%` }}
              />
            </span>
            <p className="memo-effect">
              Every battle spends a little of this. When it runs out they retire to
              the Day-Care, where their line continues.
            </p>
          </section>

          <section>
            <h4>Condition</h4>
            <p className="memo-label">
              {creature.fatigue > 0.9
                ? "Exhausted"
                : creature.fatigue > 0.5
                  ? "Tiring"
                  : "Rested"}
            </p>
            <p className="memo-effect">
              {Math.round((1 - creature.fatigue) * 100)}% fresh. A tired creature
              starts a bout already worn down.
            </p>
          </section>

          {ancestry.length > 0 && (
            <section>
              <h4>Pedigree</h4>
              <p className="memo-effect">
                {[creature, ...ancestry]
                  .map((c) => creatureName(c))
                  .join(" ← ")}
              </p>
            </section>
          )}

          {isSignature && (
            <section>
              <h4>Signature</h4>
              <p className="memo-effect">
                {trainer?.name}&rsquo;s own. Never reassignable, and they leave
                together.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
