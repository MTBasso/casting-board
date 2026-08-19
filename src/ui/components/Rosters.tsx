import { useGame } from "../../engine/store.js";
import { useT } from "../i18n.js";
import { bench, partyCapOf, partyOf, type Trainer } from "../../sim/index.js";
import { PartyList } from "./PartyList.js";
import { TypeBadge } from "./TypeBadge.js";
import { Portrait } from "./Portrait.js";

/**
 * Every party in the league, on one screen.
 *
 * The gym screen shows one gym at a time, which is right for watching a battle
 * and wrong for the job of *casting* — comparing what your Leaders are fielding
 * means seeing them side by side. The Elite seats and the Champion belong here
 * for the same reason: they are your parties too, and until now the only way to
 * rearrange one was to go to the Elite tab and find the seat.
 *
 * Junior Gym Trainers are deliberately absent. Their creatures were never yours.
 */
export function Rosters() {
  const t = useT();
  const state = useGame((s) => s.state);

  const leaders = state.gymOrder
    .map((id) => state.gyms[id])
    .filter((g) => g !== undefined)
    .map((gym) => ({
      gym,
      trainer: gym.leaderId ? state.trainers[gym.leaderId] : undefined,
    }))
    .filter((row): row is { gym: NonNullable<typeof row.gym>; trainer: Trainer } =>
      row.trainer !== undefined,
    );

  const seats = [...state.elite]
    .sort((a, b) => a.rank - b.rank)
    .map((seat) => ({
      seat,
      trainer: seat.trainerId ? state.trainers[seat.trainerId] : undefined,
    }))
    .filter((row): row is { seat: (typeof row)["seat"]; trainer: Trainer } =>
      row.trainer !== undefined,
    );

  if (leaders.length === 0 && seats.length === 0) {
    return <p className="empty">{t("pc.noRosters")}</p>;
  }

  return (
    <div className="rosters">
      {leaders.map(({ gym, trainer }) => (
        <Roster
          key={trainer.id}
          trainer={trainer}
          title={gym.name}
          subtitle={`${trainer.name} — Leader`}
        />
      ))}
      {seats.map(({ seat, trainer }) => (
        <Roster
          key={trainer.id}
          trainer={trainer}
          title={
            seat.rank === state.elite.length - 1
              ? t("elite.champion")
              : t("elite.seat", { n: seat.rank + 1 })
          }
          subtitle={trainer.name}
        />
      ))}
    </div>
  );
}

function Roster({
  trainer,
  title,
  subtitle,
}: {
  trainer: Trainer;
  title: string;
  subtitle: string;
}) {
  const act = useGame((s) => s.act);
  const state = useGame((s) => s.state);
  const party = partyOf(state, trainer.id);

  return (
    <section className="roster">
      <header className="roster-head">
        <span className="roster-id">
          <Portrait trainer={trainer} size={32} />
          <TypeBadge type={trainer.affinity} size="sm" />
          <span>
            <strong>{title}</strong>
            <span className="dim"> {subtitle}</span>
          </span>
        </span>
        <span className="counter">
          {party.length}/{partyCapOf(trainer, state)}
        </span>
      </header>

      <PartyList trainerId={trainer.id} onRemove={(c) => act((s) => bench(s, c.id))} />
    </section>
  );
}
