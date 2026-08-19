import { useState } from "react";
import { useGame } from "../../engine/store.js";
import { useT } from "../i18n.js";
import {
  assignToSeat,
  canAssign,
  canStaff,
  constants,
  eliteHireCost,
  eliteUnlocked,
  isChampion,
  isProtected,
  protectionRemaining,
  removeFromSeat,
  seatParty,
  seatTitle,
  staffSeat,
  TYPES,
  type EliteSeat,
} from "../../sim/index.js";
import { creatureName } from "../names.js";
import { PartyList } from "./PartyList.js";
import { StaffStanding } from "./StaffStanding.js";
import { Promotion } from "./Promotion.js";
import { Portrait } from "./Portrait.js";
import { TypeBadge } from "./TypeBadge.js";

/**
 * The Elite Four, and the Champion above them.
 *
 * Trainers stronger than any Gym Leader. A challenger who beats every gym earns
 * a run at them and faces each seat in order — so an empty seat is not merely
 * idle, it is a free pass on the way to taking your league.
 */
export function EliteFour() {
  const t = useT();
  const state = useGame((s) => s.state);

  if (!eliteUnlocked(state)) {
    return (
      <div className="elite">
        <h2 className="col-title">{t("elite.title")}</h2>
        <p className="empty">
{t("elite.locked", { n: constants.LEAGUE.maxGyms, have: state.gymOrder.length })}
        </p>
      </div>
    );
  }

  const seats = [...state.elite].sort((a, b) => a.rank - b.rank);
  const staffed = seats.filter((s) => s.trainerId !== null).length;
  const nextRun = Math.max(0, Math.ceil(state.gauntletCooldown / 60));

  return (
    <div className="elite">
      <h2 className="col-title">
        {t("elite.title")}
        <span className="counter">
          {t("elite.staffed", { n: staffed, total: seats.length, m: nextRun })}
        </span>
      </h2>

      {staffed < seats.length && (
        <p className="hint">
{t("elite.freePass")}
        </p>
      )}
      {state.leagueTaken > 0 && (
        <p className="absorbed">
{t("elite.taken", { n: state.leagueTaken })}
        </p>
      )}

      <Promotion />

      <ul className="seat-list">
        {seats.map((seat) => (
          <SeatRow key={seat.rank} seat={seat} />
        ))}
      </ul>
    </div>
  );
}

function SeatRow({ seat }: { seat: EliteSeat }) {
  const t = useT();
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const [hiring, setHiring] = useState(false);

  const trainer = seat.trainerId ? state.trainers[seat.trainerId] : undefined;
  const team = seatParty(state, seat);
  const cost = eliteHireCost(state);

  if (!trainer) {
    const check = canStaff(state, seat.rank, "fire");
    const options = check.ok ? [...TYPES] : [];
    return (
      <li className={`seat is-empty ${isChampion(seat) ? "is-champion" : ""}`}>
        <div className="seat-head">
          <span className="seat-title">
            {t(seatTitle(seat).key as never, { n: seatTitle(seat).n })}
          </span>
          <button
            type="button"
            className="btn sm"
            disabled={!check.ok}
            title={check.ok ? undefined : check.reason}
            onClick={() => setHiring((v) => !v)}
          >
            {hiring ? "Cancel" : `Hire · ${cost.toLocaleString()}`}
          </button>
        </div>
        <p className="seat-empty">{t("elite.unstaffedWarning")}</p>
        {hiring && (
          <div className="offer-choices compact">
            {options.map((t) => (
              <button
                key={t}
                type="button"
                className="offer-choice"
                onClick={() => {
                  act((s) => void staffSeat(s, seat.rank, t));
                  setHiring(false);
                }}
              >
                <TypeBadge type={t} size="sm" />
              </button>
            ))}
          </div>
        )}
      </li>
    );
  }

  const candidates = Object.values(state.creatures)
    .filter((c) => c.role === "reserve" && canAssign(state, c.id, seat.rank).ok)
    .sort((a, b) => b.power - a.power)
    .slice(0, 4);

  return (
    <li className={`seat ${isChampion(seat) ? "is-champion" : ""}`}>
      <div className="seat-head">
        <Portrait trainer={trainer} size={44} />
        <span className="seat-title">
          {t(seatTitle(seat).key as never, { n: seatTitle(seat).n })}
          <span className="seat-trainer">
            {trainer.name} · {trainer.affinity}
            {trainer.origin === "usurper" && (
              <span
                className="usurper-mark"
                title={
                  isProtected(state, trainer)
                    ? `Took the title from you. Cannot be moved for ${Math.ceil(protectionRemaining(state, trainer) / 60)}m.`
                    : "Took the title from you."
                }
              >
                ✦ took the title
              </span>
            )}
          </span>
        </span>
        <span className="counter">
          {team.length}/{constants.PARTY.max}
        </span>
      </div>

      <StaffStanding trainer={trainer} />

      {seat.trainerId && (
        <PartyList
          trainerId={seat.trainerId}
          onRemove={(c) => act((s) => void removeFromSeat(s, c.id))}
        />
      )}

      {team.length < constants.PARTY.max && candidates.length > 0 && (
        <ul className="thin-list">
          {candidates.map((c) => (
            <li key={c.id} className="is-candidate">
              <span className="row-id">
                <span>
                  {creatureName(c)}
                  <span className="dim">
                    {" "}
                    Lv{c.level} · {c.power}
                  </span>
                </span>
              </span>
              <button
                type="button"
                className="btn sm"
                onClick={() => act((s) => void assignToSeat(s, c.id, seat.rank))}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
