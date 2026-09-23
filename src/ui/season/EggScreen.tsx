import { DRAFT_BENCH_SIZE } from "../../sim/season/draft.js";
import { rarityOf } from "../../sim/season/roster.js";
import { TYPE_COLORS, needsDarkText } from "../typeColors.js";
import { spriteUrl } from "../sprites.js";
import { useSeason } from "./store.js";

const RARITY_COLOR: Record<string, string> = {
  common: "var(--sn-text-dim)",
  rare: "var(--sn-accent)",
  legendary: "var(--sn-gold)",
};

/** A gifted egg — REDESIGN.md "Egg bench cost": occupies a bench slot like any Pokémon, so taking it may mean releasing something if the bench is already full. */
export function EggScreen() {
  const run = useSeason((s) => s.run);
  const eggCandidate = useSeason((s) => s.eggCandidate);
  const resolveEggOffer = useSeason((s) => s.resolveEggOffer);

  if (!eggCandidate) return null;
  const rarity = rarityOf(eggCandidate);
  const type = eggCandidate.types[0] ?? "normal";
  const color = TYPE_COLORS[type];
  const full = run.party.length >= DRAFT_BENCH_SIZE;
  const weakest = full
    ? [...run.party].filter((f) => f.hp > 0 && !f.isEgg).reduce((a, b) => (b.power < a.power ? b : a))
    : null;

  return (
    <div className="season-root">
      <div className="sn-header">
        <div>
          <div className="sn-eyebrow">Between Antes // Egg Offer</div>
          <h1 className="sn-title sn-display">A Gift Egg</h1>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <div className="sn-card" style={{ "--sn-card-accent": color, width: "220px" } as Record<string, string>}>
          <div className="sn-card-row">
            <span className="sn-tag" style={{ color: RARITY_COLOR[rarity] }}>
              {rarity} egg
            </span>
            <span className="sn-badge" style={{ background: color, color: needsDarkText(type) ? "#1c1c14" : "#fff" }}>
              {type}
            </span>
          </div>
          <div className="sn-portrait">
            {spriteUrl(eggCandidate.slug) && <img src={spriteUrl(eggCandidate.slug) ?? ""} alt="" />}
          </div>
          <div className="sn-name sn-display">{eggCandidate.name}</div>
        </div>
      </div>

      <p style={{ color: "var(--sn-text-dim)", fontSize: 12, textAlign: "center" }}>
        {full
          ? `The bench is full. Taking it releases ${weakest?.name ?? "your weakest"}. It hatches at your next shop visit.`
          : "Takes a bench slot until it hatches at your next shop visit."}
      </p>

      <div style={{ display: "flex", gap: 14, marginTop: "auto" }}>
        <button className="sn-btn" style={{ flex: 1 }} onClick={() => resolveEggOffer(false)}>
          Skip
        </button>
        <button className="sn-btn is-primary" style={{ flex: 1 }} onClick={() => resolveEggOffer(true)}>
          Take the Egg
        </button>
      </div>
    </div>
  );
}
