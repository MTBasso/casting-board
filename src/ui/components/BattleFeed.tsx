import { useEffect, useMemo } from "react";
import { useGame } from "../../engine/store.js";
import { STEP_MS, isDone, timelineOf, useReplay } from "../replay.js";
import type { BattleEvent, BattleFighter, BattleRecord } from "../../sim/index.js";
import { Sprite } from "./Sprite.js";

/**
 * The one clock every replay runs on.
 *
 * Mounted once, at the top of the app, so a gym's shield bar keeps emptying
 * whether or not that gym's panel happens to be open — otherwise the list would
 * only animate for whichever gym you were already looking at, and the bar could
 * never do its job of telling you where to look next.
 */
export function ReplayDriver() {
  const advance = useReplay((s) => s.advance);
  useEffect(() => {
    const timer = setInterval(advance, STEP_MS);
    return () => clearInterval(timer);
  }, [advance]);
  return null;
}

/**
 * Watching a challenge happen.
 *
 * The sim resolves a whole gym run in an instant; this replays it blow by blow.
 * Both benches are on screen from the first frame — the challenger's team on the
 * left, the defending trainer's on the right — because the drama is in seeing
 * what is *still coming*, not only what has already been hit. The two currently
 * in the ring sit large in the middle with their health.
 *
 * The Leader's stand is the climax, so it plays slower and is marked as such.
 */
export function BattleFeed({ gymId }: { gymId: string }) {
  const state = useGame((s) => s.state);
  const record = state.battles[gymId];
  const sync = useReplay((s) => s.sync);
  const entry = useReplay((s) => s.cursors[gymId]);

  useEffect(() => {
    if (record) sync(gymId, record);
  }, [record, gymId, sync]);

  const cursor = entry?.at === record?.at ? (entry?.cursor ?? 0) : 0;
  const timeline = useMemo(() => (record ? timelineOf(record) : []), [record]);
  const current = timeline[Math.min(cursor, timeline.length - 1)];
  const done = record ? isDone(record, cursor) : true;

  if (!record || record.stages.length === 0 || !current) {
    return (
      <div className="battle">
        <div className="section-head">
          <span>Battle</span>
          <span className="section-tag">waiting</span>
        </div>
        <p className="empty">No challenger yet. The next one is on their way.</p>
      </div>
    );
  }

  const { stage } = current;
  const hp = healthAt(record, timeline, cursor, current.stageIndex);

  return (
    <div className={`battle ${stage.isLeader ? "is-leader" : ""}`}>
      <div className="section-head">
        <span>{stage.isLeader ? `${stage.trainer} — Leader` : stage.trainer}</span>
        <span className="section-tag">
          {done ? (record.tookBadge ? "badge lost" : "held") : "live"}
        </span>
      </div>

      <div className="arena">
        <Bench
          side="them"
          label="Challenger"
          fighters={record.challenger}
          hp={hp.theirs}
          active={hp.theirActive}
        />

        <Ring event={current.event} hp={hp} record={record} stageIndex={current.stageIndex} />

        <Bench
          side="us"
          label={stage.trainer}
          fighters={stage.party}
          hp={hp.ours}
          active={hp.ourActive}
        />
      </div>

      <ol className="blows">
        {timeline
          .slice(Math.max(0, cursor - 3), cursor + 1)
          .reverse()
          .map((t, i) => (
            <li key={`${cursor}-${i}`} className={t.event.ours ? "is-ours" : "is-theirs"}>
              <Blow event={t.event} />
            </li>
          ))}
      </ol>
    </div>
  );
}

/** The two currently in the ring, with their health. */
function Ring({
  event,
  hp,
  record,
  stageIndex,
}: {
  event: BattleEvent;
  hp: Health;
  record: BattleRecord;
  stageIndex: number;
}) {
  const theirs = record.challenger[hp.theirActive];
  const ours = record.stages[stageIndex]?.party[hp.ourActive];

  return (
    <div className="ring">
      <Combatant
        fighter={theirs}
        hp={hp.theirs[hp.theirActive] ?? 0}
        side="them"
        struck={!event.ours && event.kind === "hit"}
      />
      <span className="versus" aria-hidden="true">
        vs
      </span>
      <Combatant
        fighter={ours}
        hp={hp.ours[hp.ourActive] ?? 0}
        side="us"
        struck={event.ours && event.kind === "hit"}
      />
    </div>
  );
}

function Combatant({
  fighter,
  hp,
  side,
  struck,
}: {
  fighter: BattleFighter | undefined;
  hp: number;
  side: "us" | "them";
  struck: boolean;
}) {
  if (!fighter) return <div className="combatant is-gone" />;
  const pct = fighter.maxHp > 0 ? Math.max(0, hp / fighter.maxHp) : 0;
  const band = pct > 0.5 ? "ok" : pct > 0.2 ? "low" : "critical";

  return (
    <div className={`combatant side-${side} ${struck ? "is-struck" : ""}`}>
      <Sprite speciesId={fighter.speciesId} size={88} flip={side === "us"} />
      <span className="combatant-name">
        {fighter.name} <span className="dim">Lv{fighter.level}</span>
      </span>
      <span className={`hp-track band-${band}`}>
        <span className="hp-fill" style={{ width: `${pct * 100}%` }} />
      </span>
      <span className="hp-count">
        {Math.max(0, Math.round(hp))}/{fighter.maxHp}
      </span>
    </div>
  );
}

/** A side's bench, with everyone who has already fallen greyed out. */
function Bench({
  side,
  label,
  fighters,
  hp,
  active,
}: {
  side: "us" | "them";
  label: string;
  fighters: readonly BattleFighter[];
  hp: number[];
  active: number;
}) {
  return (
    <div className={`bench side-${side}`}>
      <span className="bench-label">{label}</span>
      <ul>
        {fighters.map((f, i) => {
          const left = hp[i] ?? f.maxHp;
          const out = left <= 0;
          return (
            <li
              key={`${f.speciesId}-${i}`}
              className={`${out ? "is-out" : ""} ${i === active ? "is-active" : ""}`}
              title={`${f.name} Lv${f.level} · ${Math.max(0, Math.round(left))}/${f.maxHp}`}
            >
              {/* The box icon, not the battler. Box icons are *drawn* to read
                  at this size; the animated sprites are drawn to be looked at,
                  and shrinking one into a bench slot loses the silhouette that
                  makes it recognisable. Size still matters — 44px, not 30. */}
              <Sprite speciesId={f.speciesId} kind="icon" size={44} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Blow({ event }: { event: BattleEvent }) {
  if (event.kind === "revive") {
    return (
      <>
        <b>{event.defender}</b> is revived.
      </>
    );
  }
  if (event.kind === "faint") {
    return (
      <>
        <b>{event.defender}</b> faints.
      </>
    );
  }
  const eff =
    event.effectiveness > 1
      ? " — super effective"
      : event.effectiveness < 1
        ? " — not very effective"
        : "";
  return (
    <>
      <b>{event.attacker}</b> hits <b>{event.defender}</b> for {event.damage}
      {eff}.
    </>
  );
}

interface Health {
  ours: number[];
  theirs: number[];
  ourActive: number;
  theirActive: number;
}

/**
 * Everyone's health at this point in the replay.
 *
 * Rebuilt from the blows rather than stored per frame: the record holds opening
 * rosters and a list of hits, and replaying them is both smaller to save and
 * impossible to get out of step with what the feed is showing.
 */
function healthAt(
  record: BattleRecord,
  timeline: ReturnType<typeof timelineOf>,
  cursor: number,
  stageIndex: number,
): Health {
  const theirs = record.challenger.map((f) => f.maxHp);
  const ours = (record.stages[stageIndex]?.party ?? []).map((f) => f.maxHp);
  let ourActive = 0;
  let theirActive = 0;

  for (let i = 0; i <= Math.min(cursor, timeline.length - 1); i++) {
    const step = timeline[i];
    if (!step) continue;
    const { event } = step;

    // Blows landed on earlier stages still matter to the challenger's health —
    // that carry-over is the entire reason a deep gym is worth staffing.
    if (event.ours) {
      if (event.kind === "hit") {
        theirs[event.defenderIndex] = Math.max(0, event.defenderHp);
      } else if (event.kind === "revive") {
        theirs[event.defenderIndex] = event.defenderHp;
      }
      theirActive = event.defenderIndex;
      if (step.stageIndex === stageIndex) ourActive = event.attackerIndex;
    } else {
      if (step.stageIndex === stageIndex && event.kind === "hit") {
        ours[event.defenderIndex] = Math.max(0, event.defenderHp);
      }
      theirActive = event.attackerIndex;
      if (step.stageIndex === stageIndex) ourActive = event.defenderIndex;
    }
  }

  return { ours, theirs, ourActive, theirActive };
}
