import { useState } from "react";
import { useGame } from "../../engine/store.js";
import { useT } from "../i18n.js";
import {
  canDropOff,
  collect,
  collectionFee,
  constants,
  dayCareBuilt,
  dropOff,
  freeSlots,
  occupants,
  type Creature,
} from "../../sim/index.js";
import { Sprite } from "./Sprite.js";
import { creatureName } from "../names.js";
import { TypeBadges } from "./TypeBadge.js";

/**
 * The Day-Care.
 *
 * The couple take two. What is left with them trains by the passage of time
 * rather than by battle, which makes this the one place where being away from
 * the game grows something other than a bank balance.
 *
 * Dropping off is free; collecting is not. The fee climbs with every level
 * gained, so a creature left a long while is a bill as well as a windfall.
 */
export function DayCare() {
  const t = useT();
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const [picking, setPicking] = useState(false);

  if (!dayCareBuilt(state)) {
    return (
      <div className="daycare">
        <h2 className="col-title">{t("daycare.title")}</h2>
        <p className="empty">
          {t("daycare.unbuilt")}
        </p>
      </div>
    );
  }

  const inCare = occupants(state);
  const free = freeSlots(state);
  const eggPct = Math.min(
    100,
    Math.round((state.eggProgress / constants.DAYCARE.eggSeconds) * 100),
  );
  const pairCompatible =
    inCare.length === 2 &&
    (inCare[0]?.types ?? []).some((t) => (inCare[1]?.types ?? []).includes(t));

  const candidates = Object.values(state.creatures)
    .filter((c) => canDropOff(state, c.id).ok)
    .sort((a, b) => a.level - b.level)
    .slice(0, 10);

  return (
    <div className="daycare">
      <h2 className="col-title">
        Day-Care
        <span className="counter">
          {inCare.length}/{constants.DAYCARE.slots}
        </span>
      </h2>

      {inCare.length === 0 ? (
        <p className="empty">{t("daycare.empty")}</p>
      ) : (
        <ul className="thin-list">
          {inCare.map((c) => (
            <InCareRow key={c.id} creature={c} />
          ))}
        </ul>
      )}

      {inCare.length === 2 && (
        <div className="egg">
          {pairCompatible ? (
            <>
              <span className="egg-label">Egg developing · {eggPct}%</span>
              <span className="track">
                <span className="fill" style={{ width: `${eggPct}%` }} />
              </span>
            </>
          ) : (
            <span className="egg-label dim">
              {t("daycare.noEgg")}
            </span>
          )}
        </div>
      )}

      {free > 0 && (
        <>
          <button
            type="button"
            className="btn sm ghost wide"
            onClick={() => setPicking((v) => !v)}
          >
            {picking ? "Cancel" : `Leave a creature (${free} free)`}
          </button>
          {picking && (
            <ul className="thin-list">
              {candidates.length === 0 ? (
                <li className="dim">{t("daycare.nothingToLeave")}</li>
              ) : (
                candidates.map((c) => (
                  <li key={c.id}>
                    <span className="row-id">
                      <Portrait creature={c} />
                      <span>
                        {creatureName(c)}
                        <span className="dim"> Lv{c.level}</span>
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => {
                        act((s) => void dropOff(s, c.id));
                        setPicking(false);
                      }}
                    >
                      Leave
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Day-Care rows are tight, so they take the box icon. */
function Portrait({ creature }: { creature: Creature }) {
  return <Sprite speciesId={creature.speciesId} kind="icon" size={30} />;
}

function InCareRow({ creature }: { creature: Creature }) {
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);

  const slot = state.dayCare.find((s) => s.creatureId === creature.id);
  const gained = slot ? creature.level - slot.levelAtDropoff : 0;
  const fee = collectionFee(state, creature.id);
  const affordable = state.money >= fee;

  return (
    <li>
      <span className="row-id">
        <Portrait creature={creature} />
        <span>
          {creatureName(creature)}
          <span className="dim">
            {" "}
            Lv{creature.level}
            {gained > 0 && ` (+${gained})`}
          </span>
        </span>
      </span>
      <TypeBadges types={creature.types} size="sm" />
      <button
        type="button"
        className="btn sm"
        disabled={!affordable}
        title={affordable ? undefined : `The couple want ${fee}`}
        onClick={() => act((s) => void collect(s, creature.id))}
      >
        Collect · {fee}
      </button>
    </li>
  );
}
