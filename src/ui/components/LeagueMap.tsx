import { useEffect } from "react";
import { useGame } from "../../engine/store.js";
import { constants, gymChallengeInterval } from "../../sim/index.js";
import { isDone, leaderStanding, shieldOf, useReplay } from "../replay.js";
import { TYPE_COLORS } from "../typeColors.js";
import { useT } from "../i18n.js";

/**
 * What this gym is doing right now.
 *
 * One bar, two things, because they are the same question. Most of the time it
 * is a **cycle**: how close the next challenger is, filling at a rate set by the
 * gym's rank — the first gym fills six times faster than the eighth, because
 * hardly anybody has seven badges. That is the AdventureCapitalist reading, and
 * its whole value is being steady and predictable enough to glance at.
 *
 * While a challenge is playing out it *becomes* the shield: full at the start,
 * emptying as the challenger works through the juniors, and at zero the Leader
 * is fighting. That is the only thing in the interface that says *something is
 * happening right now, come and look*, which is the reason battles are replayed
 * at all. The status word underneath says which of the two you are looking at,
 * as it already did.
 *
 * For a gym that cannot fight, the cycle keeps running in a warning colour. A
 * bar filling toward a certain loss is a deadline, and a deadline is the most
 * useful thing this list can tell you.
 */
function GymBar({ gymId }: { gymId: string }) {
  const t = useT();
  const state = useGame((s) => s.state);
  const record = useGame((s) => s.state.battles[gymId]);
  const sync = useReplay((s) => s.sync);
  const entry = useReplay((s) => s.cursors[gymId]);

  useEffect(() => {
    if (record) sync(gymId, record);
  }, [record, gymId, sync]);

  const gym = state.gyms[gymId];
  const cursor = record && entry?.at === record.at ? entry.cursor : 0;
  const replaying = !!record && record.stages.length > 0 && !isDone(record, cursor);

  if (replaying && record) {
    const shield = shieldOf(record, cursor);
    const mode = leaderStanding(record, cursor) ? "leader" : "pressed";
    return (
      <span className={`shield shield-${mode}`}>
        <span className="shield-track">
          <span className="shield-fill" style={{ width: `${shield * 100}%` }} />
        </span>
        <span className="shield-label">
          {t(mode === "leader" ? "map.leaderFighting" : "map.challengerInside")}
        </span>
      </span>
    );
  }

  if (!gym) return null;

  const rank = state.gymOrder.indexOf(gymId);
  const interval = gymChallengeInterval(state, rank);
  // waveCooldown counts down to the next arrival, so the bar fills as it drains.
  const filled = interval > 0 ? 1 - Math.max(0, Math.min(1, gym.waveCooldown / interval)) : 0;

  const undefended = !gym.leaderId;
  const lost = record?.tookBadge === true;
  const mode = undefended ? "due" : lost ? "lost" : "cycle";

  return (
    <span className={`shield shield-${mode}`}>
      <span className="shield-track">
        <span className="shield-fill" style={{ width: `${filled * 100}%` }} />
      </span>
      <span className="shield-label">
        {undefended
          ? t("map.nextDue")
          : lost
            ? t("map.badgeLost")
            : t("map.nextIn", {
                // Real seconds, not league seconds. The player is watching a
                // wall clock; a number counting down 25x faster than it reads
                // is worse than no number.
                n: Math.max(0, Math.ceil(gym.waveCooldown / constants.TIME_SCALE)),
              })}
      </span>
    </span>
  );
}


export function LeagueMap({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const state = useGame((s) => s.state);

  return (
    <ul className="gym-list">
      {state.gymOrder.map((id) => {
        const gym = state.gyms[id];
        if (!gym) return null;
        const leader = gym.leaderId ? state.trainers[gym.leaderId] : undefined;

        return (
          <li key={id}>
            <button
              type="button"
              className={`gym-card status-${gym.threat.status} ${
                selected === id ? "is-selected" : ""
              }`}
              onClick={() => onSelect(id)}
            >
              <span
                className="gym-type"
                style={{ background: TYPE_COLORS[gym.type] }}
              />
              <span className="gym-body">
                <span className="gym-name">{gym.name}</span>
                <span className="gym-leader">
                  {leader ? leader.name : t("map.noLeader")}
                </span>
                <span className="gym-counts">
                  {t("map.trainers", { n: gym.trainerIds.length, max: gym.trainerSlots })}
                </span>
                <GymBar gymId={id} />
              </span>
              <span className={`light light-${gym.threat.status}`} aria-hidden="true" />
              <span className="sr-only">
                {t(`threat.${gym.threat.status}` as const)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
