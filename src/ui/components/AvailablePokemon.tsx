import { useState } from "react";
import { useGame } from "../../engine/store.js";
import { Sprite } from "./Sprite.js";
import { bench, candidatesFor, join, unbench } from "../../sim/index.js";
import { creatureName } from "../names.js";
import { TypeBadges } from "./TypeBadge.js";

/**
 * What this trainer could field, and what they could not.
 *
 * Replaces the Trade Desk on this screen — trading belongs in the PC, next to
 * everything you own. What the player needs *here* is the answer to one
 * question: who else could go in this party right now? Blocked creatures are
 * shown with the rule that blocks them, because "already has one of that line"
 * is a rule worth learning and an absent row teaches nothing.
 */
export function AvailablePokemon({ trainerId }: { trainerId: string }) {
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const [over, setOver] = useState(false);

  const trainer = state.trainers[trainerId];
  const candidates = candidatesFor(state, trainerId);
  if (!trainer) return null;

  if (candidates.length === 0) {
    return (
      <div className="available">
        <p className="empty">
          Nothing in the box {trainer.name} could field. Work a route that
          supplies {trainer.affinity}{" "}
          types, or trade for one in the PC.
        </p>
      </div>
    );
  }

  return (
    <div className="available">
      <div className="section-head">
        <span>Available</span>
        <span className="section-tag">{candidates.filter((c) => c.ok).length} ready</span>
      </div>

      <ul
        className={`available-list ${over ? "is-target" : ""}`}
        onDragOver={(e) => {
          // Dropping a party member here takes them out of the party.
          if (e.dataTransfer.types.includes("text/party-member")) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          const id = e.dataTransfer.getData("text/party-member");
          setOver(false);
          if (!id) return;
          e.preventDefault();
          act((s) => bench(s, id));
        }}
      >
        {candidates.slice(0, 14).map(({ creature, ok, reason }) => {

          return (
            <li
              key={creature.id}
              className={ok ? "" : "is-blocked"}
              draggable={ok}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/creature", creature.id);
                e.dataTransfer.effectAllowed = "move";
              }}
            >
              <Sprite speciesId={creature.speciesId} kind="icon" size={38} />
              <span className="available-id">
                <span className="available-name">
                  {creatureName(creature)}
                  {creature.benched && <span className="aside-mark">set aside</span>}
                </span>
                <span className="available-meta">
                  Lv{creature.level} · {creature.power} power
                </span>
              </span>

              <TypeBadges types={creature.types} size="sm" />

              {ok ? (
                <button
                  type="button"
                  className="btn sm"
                  onClick={() =>
                    act((s) => {
                      if (creature.benched) unbench(s, creature.id);
                      join(s, creature.id, trainerId);
                    })
                  }
                >
                  Add
                </button>
              ) : (
                <span className="blocked-reason">{reason}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
