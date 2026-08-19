import { useGame } from "../../engine/store.js";
import { Sprite } from "./Sprite.js";
import { StaffStanding } from "./StaffStanding.js";
import { Portrait } from "./Portrait.js";
import {
  bench,
  canHireGymTrainer,
  expandGymTrainers,
  gymTrainerSlotCost,
  hireCost,
  gymTrainerCost,
  hireGymTrainer,
  hireTrainer,
  partyCapOf,
  partyOf,
  type Trainer,
} from "../../sim/index.js";
import { TYPE_COLORS } from "../typeColors.js";
import { creatureName } from "../names.js";
import { PartyList } from "./PartyList.js";
import { ThreatReport } from "./ThreatReport.js";
import { BattleFeed } from "./BattleFeed.js";

/**
 * One gym.
 *
 * A challenger works up through it the way they do in the games: the junior
 * Gym Trainers first, in order, and the Leader last. Every party is six, and
 * parties top themselves up from the box — so what the player decides here is
 * *who matters*, by pinning, and *how deep the gym goes*, by hiring.
 */
export function GymPanel({ gymId }: { gymId: string }) {
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);

  const gym = state.gyms[gymId];
  if (!gym) return <p className="empty">Gym not found.</p>;

  const leader = gym.leaderId ? state.trainers[gym.leaderId] : undefined;
  const juniors = gym.trainerIds
    .map((id) => state.trainers[id])
    .filter((t): t is Trainer => t !== undefined);

  const leaderCost = hireCost(state);
  const juniorCheck = canHireGymTrainer(state, gym.id);
  const slotCost = gymTrainerSlotCost(state, gym.id);

  return (
    <div className="panel">
      <header className="panel-head">
        <span className="gym-type lg" style={{ background: TYPE_COLORS[gym.type] }} />
        {leader && <Portrait trainer={leader} size={52} />}
        <div>
          <h2>{gym.name}</h2>
          <p className="panel-sub">
            {leader ? (
              <>
                {leader.name} · {leader.doctrine}
              </>
            ) : (
              "No Leader — this gym forfeits every challenge"
            )}
          </p>
        </div>
        {!leader && (
          <button
            type="button"
            className="btn"
            disabled={state.money < leaderCost}
            onClick={() => act((s) => void hireTrainer(s, gym.type))}
          >
            Hire Leader · {leaderCost.toLocaleString()}
          </button>
        )}
      </header>

      {leader && <StaffStanding trainer={leader} />}

      <BattleFeed gymId={gym.id} />

      <ThreatReport gym={gym} />

      <section className="group">
        <h3>
          Gym Trainers
          <span className="counter">
            {juniors.length}/{gym.trainerSlots}
            {slotCost !== null && (
              <button
                type="button"
                className="btn sm ghost"
                disabled={state.money < slotCost}
                onClick={() => act((s) => void expandGymTrainers(s, gym.id))}
              >
                +1 slot · {slotCost}
              </button>
            )}
            <button
              type="button"
              className="btn sm"
              disabled={!juniorCheck.ok}
              title={juniorCheck.ok ? undefined : juniorCheck.reason}
              onClick={() => act((s) => void hireGymTrainer(s, gym.id))}
            >
              Hire {gym.type} · &#8369;{gymTrainerCost(state, gym.id)}
            </button>
          </span>
        </h3>

        <p className="absorbed">
          Your Leader&rsquo;s party fought{" "}
          <strong>{gym.threat.absorbed.toLocaleString()}</strong> fewer battles
          because of these {juniors.length}.
        </p>

        {juniors.length === 0 ? (
          <p className="empty">
            No junior trainers — every challenger goes straight at your Leader.
          </p>
        ) : (
          <ul className="trainer-list">
            {juniors.map((t) => (
              <TrainerRow key={t.id} trainer={t} />
            ))}
          </ul>
        )}
      </section>

      {leader && (
        <section className="group">
          <h3>
            {leader.name}&rsquo;s party
            <span className="counter">
              {leader.party.length}/{partyCapOf(leader, state)}
            </span>
          </h3>
          <p className="hint">
            Position one leads; the rest follow as each faints. Drag to reorder.
            Parties fill themselves from the box — pin the ones that matter and
            they will never be swapped out.
          </p>
          <PartyList
            trainerId={leader.id}
            onRemove={(c) => act((s) => bench(s, c.id))}
          />

        </section>
      )}

    </div>
  );
}

/**
 * A junior trainer and the creatures they actually use.
 *
 * Showing the party matters: a gym trainer whose team you cannot see is a
 * number, and the whole game is about creatures being individuals. Their
 * sprites are right there.
 */
function TrainerRow({ trainer }: { trainer: Trainer }) {
  const state = useGame((s) => s.state);
  const party = partyOf(state, trainer.id);
  const avgLevel =
    party.length > 0
      ? Math.round(party.reduce((a, c) => a + c.level, 0) / party.length)
      : 0;
  const rested = Math.round(
    (party.reduce((a, c) => a + (1 - c.fatigue), 0) / Math.max(1, party.length)) * 100,
  );

  return (
    <li className="trainer-row">
      <div className="trainer-head">
        <span className="trainer-id">
          <Portrait trainer={trainer} size={34} />
          <span>{trainer.name}</span>
          <span className="dim">
            {trainer.affinity} · {trainer.doctrine}
          </span>
        </span>
        <span className="dim">
          {party.length}/{partyCapOf(trainer, state)} · avg Lv{avgLevel} · {rested}% rested
        </span>
      </div>

      <StaffStanding trainer={trainer} />

      <ul className="mini-party">
        {party.map((c) => {
          return (
            <li key={c.id} title={`${creatureName(c)} · Lv${c.level} · ${c.power} power`}>
              <Sprite speciesId={c.speciesId} kind="icon" size={38} />
              <span className="mini-level">Lv{c.level}</span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
