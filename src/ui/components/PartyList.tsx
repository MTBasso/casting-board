import { useState } from "react";
import { useGame } from "../../engine/store.js";
import { join, partyOf, unbench, type Creature } from "../../sim/index.js";
import { CreatureCard } from "./CreatureCard.js";
import { CreatureSummary } from "./CreatureSummary.js";

/**
 * A party, in lead order, rearrangeable by dragging.
 *
 * Order is strategy under sequential knockouts: position one goes out first and
 * the rest follow as each faints. Leading with something that resists what is
 * coming — or with something expendable, to wear the challenger down — is a
 * real decision made with a gesture.
 */
export function PartyList({
  trainerId,
  onRemove,
}: {
  trainerId: string;
  onRemove?: (creature: Creature) => void;
}) {
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const trainer = state.trainers[trainerId];
  const party = partyOf(state, trainerId);
  if (!trainer) return null;

  const move = (fromId: string, toId: string) => {
    act((s) => {
      const t = s.trainers[trainerId];
      if (!t) return;
      const from = t.party.indexOf(fromId);
      const to = t.party.indexOf(toId);
      if (from === -1 || to === -1 || from === to) return;
      const next = [...t.party];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      t.party = next;
    });
  };

  return (
    <ol
      className={`party-list ${over === "party" ? "is-target" : ""}`}
      onDragOver={(e) => {
        // Accept creatures dragged in from the available list.
        if (e.dataTransfer.types.includes("text/creature")) {
          e.preventDefault();
          setOver("party");
        }
      }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => {
        const id = e.dataTransfer.getData("text/creature");
        setOver(null);
        if (!id) return;
        e.preventDefault();
        act((s) => {
          const c = s.creatures[id];
          if (c?.benched) unbench(s, id);
          join(s, id, trainerId);
        });
      }}
    >
      {party.map((c, i) => (
        <li
          key={c.id}
          className={`party-slot ${dragging === c.id ? "is-dragging" : ""} ${
            over === c.id && dragging !== c.id ? "is-over" : ""
          }`}
          draggable
          onDragStart={(e) => {
            setDragging(c.id);
            // Tagged so the available list knows a party member is incoming.
            e.dataTransfer.setData("text/party-member", c.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(c.id);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging) move(dragging, c.id);
            setDragging(null);
            setOver(null);
          }}
        >
          <span className="party-order" title={i === 0 ? "Leads the battle" : undefined}>
            {i + 1}
            {i === 0 && <span className="lead-mark">lead</span>}
          </span>

          <CreatureCard creature={c} onOpen={() => setOpen(c.id)} />

          <span className="party-actions">
            <button
              type="button"
              className="btn sm ghost"
              disabled={i === 0}
              onClick={() => {
                const prev = party[i - 1];
                if (prev) move(c.id, prev.id);
              }}
              aria-label="Move earlier"
            >
              ↑
            </button>
            <button
              type="button"
              className="btn sm ghost"
              disabled={i === party.length - 1}
              onClick={() => {
                const nextOne = party[i + 1];
                if (nextOne) move(c.id, nextOne.id);
              }}
              aria-label="Move later"
            >
              ↓
            </button>
            {onRemove && c.id !== trainer.signatureId && (
              <button type="button" className="btn sm ghost" onClick={() => onRemove(c)}>
                Remove
              </button>
            )}
          </span>
        </li>
      ))}
      {open && state.creatures[open] && (
        <CreatureSummary
          creature={state.creatures[open]!}
          onClose={() => setOpen(null)}
        />
      )}
    </ol>
  );
}
