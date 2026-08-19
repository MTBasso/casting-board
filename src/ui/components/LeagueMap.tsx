import { useEffect } from "react";
import { useGame } from "../../engine/store.js";
import { isDone, leaderStanding, shieldOf, useReplay } from "../replay.js";
import { TYPE_COLORS } from "../typeColors.js";
import { useT } from "../i18n.js";

/**
 * How much of the Leader's shield is left, live.
 *
 * The bar starts full and empties as the challenger works through the junior
 * trainers; when it hits zero the Leader is fighting, and the row asks to be
 * clicked. It is the only thing in the interface that says *something is
 * happening right now, come and look* — which is the whole reason the game
 * bothers to replay battles at all.
 */
function Shield({ gymId }: { gymId: string }) {
  const t = useT();
  const record = useGame((s) => s.state.battles[gymId]);
  const sync = useReplay((s) => s.sync);
  const entry = useReplay((s) => s.cursors[gymId]);

  useEffect(() => {
    if (record) sync(gymId, record);
  }, [record, gymId, sync]);

  if (!record || record.stages.length === 0) return null;

  const cursor = entry?.at === record.at ? entry.cursor : 0;
  const done = isDone(record, cursor);
  const shield = shieldOf(record, cursor);
  const atLeader = leaderStanding(record, cursor);

  const state: "clear" | "pressed" | "leader" | "lost" = done
    ? record.tookBadge
      ? "lost"
      : "clear"
    : atLeader
      ? "leader"
      : "pressed";

  return (
    <span className={`shield shield-${state}`}>
      <span className="shield-track">
        <span className="shield-fill" style={{ width: `${shield * 100}%` }} />
      </span>
      <span className="shield-label">
        {t(
          state === "leader"
            ? "map.leaderFighting"
            : state === "pressed"
              ? "map.challengerInside"
              : state === "lost"
                ? "map.badgeLost"
                : "map.held",
        )}
      </span>
    </span>
  );
}

/**
 * The home screen: gyms as buildings, each carrying its own warning light.
 * The daily session is "fix what's glowing" — so status has to read from
 * across the room, before any number is parsed.
 */
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
                <Shield gymId={id} />
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
