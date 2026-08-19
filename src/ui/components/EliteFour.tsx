import { useState } from "react";
import { useGame } from "../../engine/store.js";
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
  const state = useGame((s) => s.state);

  if (!eliteUnlocked(state)) {
    return (
      <div className="elite">
        <h2 className="col-title">Elite Four</h2>
        <p className="empty">
          Locked. Build all {constants.LEAGUE.maxGyms} gyms
          {" "}({state.gymOrder.length} so far) to open the Elite tier.
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
        Elite Four
        <span className="counter">
          {staffed}/{seats.length} staffed · next run {nextRun}m
        </span>
      </h2>

      {staffed < seats.length && (
        <p className="hint">
          Every empty seat is a free pass. A challenger who clears all five takes
          your league.
        </p>
      )}
      {state.leagueTaken > 0 && (
        <p className="absorbed">
          Your league has been taken <strong>{state.leagueTaken}</strong>{" "}
          {state.leagueTaken === 1 ? "time" : "times"}.
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
          <span className="seat-title">{seatTitle(seat)}</span>
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
        <p className="seat-empty">Unstaffed — challengers walk straight through.</p>
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
          {seatTitle(seat)}
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
