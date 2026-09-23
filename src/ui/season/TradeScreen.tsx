import { TYPE_COLORS, needsDarkText } from "../typeColors.js";
import { spriteUrl } from "../sprites.js";
import { useSeason } from "./store.js";

/** A trader's offer against the party's weakest member — REDESIGN.md "Mid-run roster growth": trade offers from NPC trainers. */
export function TradeScreen() {
  const run = useSeason((s) => s.run);
  const tradeCandidate = useSeason((s) => s.tradeCandidate);
  const resolveTradeOffer = useSeason((s) => s.resolveTradeOffer);

  if (!tradeCandidate) return null;
  const weakest = [...run.party]
    .filter((f) => f.hp > 0 && !f.isEgg)
    .reduce((a, b) => (b.power < a.power ? b : a));

  const offerType = tradeCandidate.types[0] ?? "normal";
  const offerColor = TYPE_COLORS[offerType];
  const weakType = weakest.types[0] ?? "normal";
  const weakColor = TYPE_COLORS[weakType];

  return (
    <div className="season-root">
      <div className="sn-header">
        <div>
          <div className="sn-eyebrow">Between Antes // Trade Offer</div>
          <h1 className="sn-title sn-display">A Trainer Wants to Trade</h1>
        </div>
      </div>

      <div className="sn-matchup">
        <div className="sn-card" style={{ "--sn-card-accent": weakColor } as Record<string, string>}>
          <div className="sn-card-row">
            <span className="sn-tag" style={{ color: "var(--sn-text-dim)" }}>Your weakest</span>
            <span
              className="sn-badge"
              style={{ background: weakColor, color: needsDarkText(weakType) ? "#1c1c14" : "#fff" }}
            >
              {weakType}
            </span>
          </div>
          <div className="sn-portrait">
            {spriteUrl(weakest.slug) && <img src={spriteUrl(weakest.slug) ?? ""} alt="" />}
          </div>
          <div className="sn-name sn-display">{weakest.name}</div>
        </div>

        <div className="sn-vs">
          <div className="sn-vs-label">→</div>
        </div>

        <div className="sn-card" style={{ "--sn-card-accent": offerColor } as Record<string, string>}>
          <div className="sn-card-row">
            <span className="sn-tag" style={{ color: "var(--sn-accent)" }}>Offered</span>
            <span
              className="sn-badge"
              style={{ background: offerColor, color: needsDarkText(offerType) ? "#1c1c14" : "#fff" }}
            >
              {offerType}
            </span>
          </div>
          <div className="sn-portrait">
            {spriteUrl(tradeCandidate.slug) && <img src={spriteUrl(tradeCandidate.slug) ?? ""} alt="" />}
          </div>
          <div className="sn-name sn-display">{tradeCandidate.name}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: "auto" }}>
        <button className="sn-btn" style={{ flex: 1 }} onClick={() => resolveTradeOffer(false)}>
          Decline
        </button>
        <button className="sn-btn is-primary" style={{ flex: 1 }} onClick={() => resolveTradeOffer(true)}>
          Accept Trade
        </button>
      </div>
    </div>
  );
}
