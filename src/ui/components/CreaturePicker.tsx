import { useEffect, useState } from "react";
import { useGame } from "../../engine/store.js";
import { useT } from "../i18n.js";
import { Sprite } from "./Sprite.js";
import {
  candidatesFor,
  join,
  partyCapOf,
  unbench,
  TYPES,
  type TypeId,
} from "../../sim/index.js";
import { creatureName } from "../names.js";
import { TypeBadges } from "./TypeBadge.js";

/**
 * Everything this trainer could field, when you ask for it.
 *
 * It used to be a permanent list under every party — always open, always the
 * length of the box, and pushing the thing you were actually working on off the
 * screen. Casting is something you do in a moment and then stop doing, so it
 * belongs in a modal you summon from the empty slot itself.
 */
export function CreaturePicker({
  trainerId,
  onClose,
  onPick,
  title,
}: {
  trainerId: string;
  onClose: () => void;
  /** What taking one means. Defaults to joining the trainer's party. */
  onPick?: (creatureId: string) => void;
  title?: string;
}) {
  const t = useT();
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const [filter, setFilter] = useState<TypeId | "all">("all");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trainer = state.trainers[trainerId];
  if (!trainer) return null;

  const all = candidatesFor(state, trainerId);
  const shown = all
    .filter((o) => filter === "all" || o.creature.types.includes(filter))
    .sort((a, b) => {
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      return b.creature.power - a.creature.power;
    });

  // Only types actually present, so the filter never offers a dead end.
  const present = TYPES.filter((t) =>
    all.some((o) => o.creature.types.includes(t)),
  );

  return (
    <div className="summary-backdrop" onClick={onClose} role="presentation">
      <div
        className="summary picker"
        role="dialog"
        aria-modal="true"
        aria-label={`Choose a creature for ${trainer.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="summary-bar">
          <span>{title ?? t("party.pickerTitle", { name: trainer.name })}</span>
          <span className="section-tag">
            {trainer.party.length}/{partyCapOf(trainer, state)}
          </span>
          <button type="button" className="summary-close" onClick={onClose} aria-label={t("common.close")}>
            ×
          </button>
        </header>

        {present.length > 1 && (
          <div className="toolbar">
            <label className="field">
              <span>{t("common.type")}</span>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as TypeId | "all")}
              >
                <option value="all">{t("common.all")} ({all.length})</option>
                {present.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {shown.length === 0 ? (
          <p className="empty">
{t("party.pickerEmpty", { name: trainer.name, type: trainer.affinity })}
          </p>
        ) : (
          <ul className="picker-grid">
            {shown.map(({ creature, ok, reason }) => (
              <li key={creature.id}>
                <button
                  type="button"
                  className={`picker-cell ${ok ? "" : "is-blocked"}`}
                  disabled={!ok}
                  title={ok ? undefined : reason}
                  onClick={() => {
                    if (onPick) {
                      onPick(creature.id);
                    } else {
                      act((s) => {
                        if (creature.benched) unbench(s, creature.id);
                        join(s, creature.id, trainerId);
                      });
                    }
                    onClose();
                  }}
                >
                  <Sprite speciesId={creature.speciesId} size={52} />
                  <span className="picker-name">{creatureName(creature)}</span>
                  <span className="picker-meta">
                    Lv{creature.level} · {creature.power}
                  </span>
                  <TypeBadges types={creature.types} size="sm" />
                  {!ok && <span className="picker-why">{reason}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
