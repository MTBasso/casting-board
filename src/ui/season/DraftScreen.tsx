import { STARTER_PICK_COUNT } from "../../sim/season/draft.js";
import { rarityOf } from "../../sim/season/roster.js";
import { TYPE_COLORS, needsDarkText } from "../typeColors.js";
import { spriteUrl } from "../sprites.js";
import { useSeason } from "./store.js";

const RARITY_COLOR: Record<string, string> = {
  common: "var(--sn-text-dim)",
  rare: "var(--sn-accent)",
  legendary: "var(--sn-gold)",
};

export function DraftScreen() {
  const run = useSeason((s) => s.run);
  const offer = useSeason((s) => s.offer);
  const pickDraft = useSeason((s) => s.pickDraft);
  const beginSeason = useSeason((s) => s.beginSeason);

  const full = run.party.length >= STARTER_PICK_COUNT;

  return (
    <div className="season-root">
      <div className="sn-header">
        <div>
          <div className="sn-eyebrow">Season 1 // Ante 0 // Draft</div>
          <h1 className="sn-title sn-display">Choose Your Starter</h1>
        </div>
        <div className="sn-meta">
          {run.party.length}/{STARTER_PICK_COUNT} chosen
        </div>
      </div>

      <div className="sn-grid">
        {offer.map((mon) => {
          const type = mon.types[0] ?? "normal";
          const color = TYPE_COLORS[type];
          const dark = needsDarkText(type);
          const rarity = rarityOf(mon);
          const sprite = spriteUrl(mon.slug);
          return (
            <div key={mon.slug} className="sn-card" style={{ "--sn-card-accent": color } as Record<string, string>}>
              <div className="sn-card-row">
                <span className="sn-tag" style={{ color: RARITY_COLOR[rarity] }}>
                  {rarity}
                </span>
                <span className="sn-badge" style={{ background: color, color: dark ? "#1c1c14" : "#fff" }}>
                  {type}
                </span>
              </div>
              <div className="sn-portrait">
                {sprite && <img src={sprite} alt="" loading="lazy" />}
              </div>
              <div className="sn-name sn-display">{mon.name}</div>
              <button className="sn-btn" onClick={() => pickDraft(mon.slug)} disabled={full}>
                Draft
              </button>
            </div>
          );
        })}
      </div>

      <div className="sn-footer">
        <span className="sn-label">Starter</span>
        <div className="sn-slots">
          {Array.from({ length: STARTER_PICK_COUNT }, (_, i) => {
            const mon = run.party[i];
            const sprite = mon ? spriteUrl(mon.slug) : null;
            return (
              <div key={i} className="sn-slot">
                {sprite && <img src={sprite} alt="" loading="lazy" />}
              </div>
            );
          })}
        </div>
        <button className="sn-btn is-primary" onClick={beginSeason} disabled={!full}>
          Begin Season →
        </button>
      </div>
    </div>
  );
}
