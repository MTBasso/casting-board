import { useGame } from "../../engine/store.js";
import { useT } from "../i18n.js";
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
  const t = useT();
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);

  const gym = state.gyms[gymId];
  if (!gym) return <p className="empty">{t("gyms.notFound")}</p>;

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
              t("gyms.noLeader")
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
            {t("gyms.hireLeader", { n: leaderCost.toLocaleString() })}
          </button>
        )}
      </header>

      {leader && <StaffStanding trainer={leader} />}

      <BattleFeed gymId={gym.id} />

      <ThreatReport gym={gym} />

      <section className="group">
        <h3>
          {t("gyms.gymTrainers")}
          <span className="counter">
            {juniors.length}/{gym.trainerSlots}
            {slotCost !== null && (
              <button
                type="button"
                className="btn sm ghost"
                disabled={state.money < slotCost}
                onClick={() => act((s) => void expandGymTrainers(s, gym.id))}
              >
                {t("gyms.addSlot", { n: slotCost })}
              </button>
            )}
            <button
              type="button"
              className="btn sm"
              disabled={!juniorCheck.ok}
              title={juniorCheck.ok ? undefined : juniorCheck.reason}
              onClick={() => act((s) => void hireGymTrainer(s, gym.id))}
            >
              {t("gyms.hireJunior", { type: gym.type, n: gymTrainerCost(state, gym.id) })}
            </button>
          </span>
        </h3>

        <p className="absorbed">
{t("gyms.absorbed", { n: gym.threat.absorbed.toLocaleString(), c: juniors.length })}
        </p>

        {juniors.length === 0 ? (
          <p className="empty">
{t("gyms.noJuniors")}
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
            {t("gyms.partyOf", { name: leader.name })}
            <span className="counter">
              {leader.party.length}/{partyCapOf(leader, state)}
            </span>
          </h3>
          <p className="hint">
{t("gyms.partyHint")}
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
  const t = useT();
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
          {party.length}/{partyCapOf(trainer, state)} · avg Lv{avgLevel} · {t("gyms.rested", { n: rested })}
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
