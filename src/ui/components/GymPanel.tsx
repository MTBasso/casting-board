import type { CSSProperties } from "react";
import { useGame } from "../../engine/store.js";
import { useT, type Key } from "../i18n.js";
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
      {/* Order matters: what is happening now, then who holds this gym, then
          the bench behind them. The identity banner used to sit on top, which
          made the live battle — the only thing on this screen that changes by
          itself — the second thing you saw. */}
      <BattleFeed gymId={gym.id} />

      {/* The Leader and their party as one banner, washed in the gym's own type
          colour. They were two sections at opposite ends of the screen, which
          asked the player to hold "who this is" in their head while scrolling to
          "what they field". */}
      <section
        className="gym-banner"
        style={{ "--gym": TYPE_COLORS[gym.type] } as CSSProperties}
      >
        <header className="gym-banner-head">
          {leader ? (
            <Portrait trainer={leader} size={72} />
          ) : (
            <span className="gym-vacant lg" aria-hidden="true">
              ?
            </span>
          )}
          <div className="gym-banner-id">
            <h2>{gym.name}</h2>
            <p className="gym-banner-sub">
              {leader ? (
                <>
                  <b>{leader.name}</b>
                  <span className="dot" aria-hidden="true">
                    ·
                  </span>
                  {t(`arch.${leader.doctrine}` as Key, {})}
                </>
              ) : (
                t("gyms.noLeader")
              )}
            </p>
            {leader && <StaffStanding trainer={leader} />}
          </div>
          {leader ? (
            <span className="counter">
              {leader.party.length}/{partyCapOf(leader, state)}
            </span>
          ) : (
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

        {leader && (
          <div className="gym-banner-party">
            <PartyList
              trainerId={leader.id}
              onRemove={(c) => act((s) => bench(s, c.id))}
            />
            <p className="hint">{t("gyms.partyHint")}</p>
          </div>
        )}
      </section>

      <section className="group gym-juniors">
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
          <p className="empty">{t("gyms.noJuniors")}</p>
        ) : (
          <ul className="trainer-list">
            {juniors.map((junior) => (
              <TrainerRow key={junior.id} trainer={junior} />
            ))}
          </ul>
        )}
      </section>

      {/* Last: useful, but it is a forecast rather than a thing you act on. */}
      <ThreatReport gym={gym} />
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
        <Portrait trainer={trainer} size={44} />
        <span className="trainer-id">
          <span className="trainer-name">{trainer.name}</span>
          <span className="dim">
            {trainer.affinity} · {t(`arch.${trainer.doctrine}` as Key, {})}
          </span>
          <span className="dim">
            {party.length}/{partyCapOf(trainer, state)} · Lv{avgLevel} ·{" "}
            {t("gyms.rested", { n: rested })}
          </span>
        </span>
      </div>

      <StaffStanding trainer={trainer} />

      {party.length === 0 ? (
        <p className="empty sm">{t("gyms.noParty")}</p>
      ) : (
        <ul className="mini-party">
          {party.map((c) => (
            <li
              key={c.id}
              className={c.fatigue > 0.6 ? "is-spent" : ""}
              title={`${creatureName(c)} · Lv${c.level} · ${c.power} ${t("pc.power")}`}
            >
              <Sprite speciesId={c.speciesId} kind="icon" size={44} />
              <span className="mini-level">Lv{c.level}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
