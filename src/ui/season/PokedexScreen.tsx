import { ROSTER, rarityOf } from "../../sim/season/roster.js";
import { TYPE_COLORS, needsDarkText } from "../typeColors.js";
import { spriteUrl } from "../sprites.js";
import { useSeason } from "./store.js";

const RARITY_COLOR: Record<string, string> = {
  common: "var(--sn-text-dim)",
  rare: "var(--sn-accent)",
  legendary: "var(--sn-gold)",
};

/**
 * REDESIGN.md "Collection layer": a cross-season log, not gameplay-relevant
 * within a run — reachable from the Draft and End screens rather than a
 * RunStatus of its own, since checking it isn't a decision the season engine
 * needs to know about.
 */
export function PokedexScreen() {
  const seenSpecies = useSeason((s) => s.career.seenSpecies);
  const setViewingDex = useSeason((s) => s.setViewingDex);
  const seen = new Set(seenSpecies);

  return (
    <div className="season-root">
      <div className="sn-header">
        <div>
          <div className="sn-eyebrow">Hall of Fame // Pokédex</div>
          <h1 className="sn-title sn-display">Species Log</h1>
        </div>
        <div className="sn-meta">
          {seen.size}/{ROSTER.length} seen
        </div>
      </div>

      <div className="sn-dex-grid">
        {ROSTER.map((mon) => {
          const isSeen = seen.has(mon.slug);
          const type = mon.types[0] ?? "normal";
          const color = TYPE_COLORS[type];
          const dark = needsDarkText(type);
          const rarity = rarityOf(mon);
          const sprite = isSeen ? spriteUrl(mon.slug) : null;
          return (
            <div
              key={mon.slug}
              className={`sn-dex-card${isSeen ? "" : " is-unseen"}`}
              style={{ "--sn-card-accent": isSeen ? color : "var(--sn-border)" } as Record<string, string>}
            >
              <div className="sn-dex-portrait">
                {sprite ? <img src={sprite} alt="" loading="lazy" /> : <span>?</span>}
              </div>
              <div className="sn-dex-name">{isSeen ? mon.name : "???"}</div>
              {isSeen && (
                <div className="sn-card-row" style={{ justifyContent: "center", gap: 6 }}>
                  <span className="sn-tag" style={{ color: RARITY_COLOR[rarity] }}>
                    {rarity}
                  </span>
                  <span className="sn-badge" style={{ background: color, color: dark ? "#1c1c14" : "#fff" }}>
                    {type}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button className="sn-btn is-primary" onClick={() => setViewingDex(false)}>
        Close
      </button>
    </div>
  );
}
