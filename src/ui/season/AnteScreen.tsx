import { useEffect, useRef } from "react";
import { canSwitchTo, powerMult } from "../../sim/season/battle.js";
import { effectivenessAgainst } from "../../data/typechart.js";
import type { TypeId } from "../../sim/types.js";
import { TYPE_COLORS, needsDarkText } from "../typeColors.js";
import { spriteUrl } from "../sprites.js";
import { useSeason } from "./store.js";

function FighterPanel({
  name,
  types,
  hp,
  maxHp,
  fatigue,
  slug,
}: {
  name: string;
  types: readonly TypeId[];
  hp: number;
  maxHp: number;
  fatigue: number;
  slug: string;
}) {
  const type: TypeId = types[0] ?? "normal";
  const color = TYPE_COLORS[type];
  const dark = needsDarkText(type);
  const hpPct = Math.max(0, Math.round((hp / maxHp) * 100));
  return (
    <div className="sn-fighter" style={{ background: "var(--sn-panel)", border: `2px solid ${color}` }}>
      <div className="sn-card-row">
        <span className="sn-name sn-display">{name}</span>
        <span className="sn-badge" style={{ background: color, color: dark ? "#1c1c14" : "#fff" }}>
          {type}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 44, height: 44, flexShrink: 0 }}>
          {spriteUrl(slug) && <img src={spriteUrl(slug) ?? ""} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", imageRendering: "pixelated" }} />}
        </div>
        <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="sn-bar-row">
            <span>HP</span>
            <span>{hpPct}%</span>
          </div>
          <div className="sn-bar">
            <div style={{ width: `${hpPct}%`, background: "var(--sn-accent)" }} />
          </div>
          <div className="sn-bar-row">
            <span>Fatigue</span>
            <span>{Math.round(fatigue * 100)}%</span>
          </div>
          <div className="sn-bar is-thin">
            <div style={{ width: `${Math.round(fatigue * 100)}%`, background: "var(--sn-gold)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnteScreen() {
  const run = useSeason((s) => s.run);
  const battle = useSeason((s) => s.battle);
  const log = useSeason((s) => s.log);
  const switchTo = useSeason((s) => s.switchTo);
  const advanceTurn = useSeason((s) => s.advanceTurn);
  const retreat = useSeason((s) => s.retreat);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  if (!battle) return null;

  const active = battle.playerParty[battle.activeIndex];
  const gymActive = battle.gymParty[battle.gymIndex];
  if (!active || !gymActive) return null;

  const mult = effectivenessAgainst(active.types[0] ?? "normal", gymActive.types);
  const calloutClass = mult > 1 ? "is-strong" : mult < 1 ? "is-weak" : "is-neutral";
  const calloutLabel =
    mult > 1 ? `${mult}× STRONG` : mult < 1 ? `${mult}× WEAK` : "NEUTRAL";

  return (
    <div className="season-root">
      <div className="sn-header">
        <div>
          <div className="sn-eyebrow">
            Ante {run.ante} // Leader's mon {battle.gymIndex + 1} of {battle.gymParty.length}
          </div>
          <h1 className="sn-title sn-display">Coach Call</h1>
        </div>
        <div className="sn-meta">
          Power <strong>{Math.round(powerMult(active) * 100)}%</strong>
        </div>
      </div>

      <div className="sn-matchup">
        <FighterPanel
          name={active.name}
          types={active.types}
          hp={active.hp}
          maxHp={active.maxHp}
          fatigue={active.fatigue}
          slug={active.slug}
        />
        <div className="sn-vs">
          <div className="sn-vs-label">VS</div>
          <div className={`sn-matchup-callout ${calloutClass}`}>{calloutLabel}</div>
        </div>
        <FighterPanel
          name={gymActive.name}
          types={gymActive.types}
          hp={gymActive.hp}
          maxHp={gymActive.maxHp}
          fatigue={gymActive.fatigue}
          slug={gymActive.slug}
        />
      </div>

      {battle.gymParty.length > battle.gymIndex + 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="sn-label">Leader's remaining team</span>
          <div className="sn-bench-list">
            {battle.gymParty.map((mon, i) => {
              if (i <= battle.gymIndex) return null;
              const type = mon.types[0] ?? "normal";
              const color = TYPE_COLORS[type];
              return (
                <div key={i} className="sn-bench-card" style={{ "--sn-card-accent": color } as Record<string, string>}>
                  <div className="sn-bench-portrait">
                    {spriteUrl(mon.slug) && <img src={spriteUrl(mon.slug) ?? ""} alt="" />}
                  </div>
                  <div className="sn-bench-body">
                    <span className="sn-bench-name">{mon.name}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="sn-log" ref={logRef}>
        {log.slice(-6).map((line) => (
          <div key={line.id} className="sn-log-line">
            {line.text}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="sn-label">Switch in — bench</span>
        <div className="sn-bench-list">
          {battle.playerParty.map((mon, i) => {
            if (i === battle.activeIndex) return null;
            const isEgg = !!mon.isEgg;
            const canSwitch = canSwitchTo(battle, i);
            const type = mon.types[0] ?? "normal";
            const color = TYPE_COLORS[type];
            return (
              <button
                key={i}
                className="sn-bench-card"
                style={{ "--sn-card-accent": color } as Record<string, string>}
                disabled={!canSwitch}
                onClick={() => switchTo(i)}
              >
                <div className="sn-bench-portrait">
                  {!isEgg && spriteUrl(mon.slug) && <img src={spriteUrl(mon.slug) ?? ""} alt="" />}
                </div>
                <div className="sn-bench-body">
                  <span className="sn-bench-name">{isEgg ? "Egg" : mon.name}</span>
                  <div className="sn-bar is-thin">
                    <div style={{ width: `${Math.round((mon.hp / mon.maxHp) * 100)}%`, background: "var(--sn-accent)" }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="sn-btn" onClick={retreat}>
          Retreat
        </button>
        <button className="sn-btn is-primary" style={{ flex: 1 }} onClick={advanceTurn}>
          Fight Turn →
        </button>
      </div>
    </div>
  );
}
