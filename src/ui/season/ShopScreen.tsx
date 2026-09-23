import type { Doctrine, Rarity } from "../../sim/season/types.js";
import { useSeason } from "./store.js";

const RARITY_COLOR: Record<Rarity, string> = {
  common: "var(--sn-text-dim)",
  rare: "var(--sn-accent)",
  legendary: "var(--sn-gold)",
};

/** Shop-facing flavor for the current Doctrine catalog (doctrines.ts) — the sim only carries id/rarity/apply, not display copy. */
const BLURB: Record<string, string> = {
  iron_resolve: "+5% power, whole party.",
  sturdy_frames: "+10% max HP, whole party.",
  kindred_bond: "+15% power for anyone sharing a type with a partymate.",
  overclock: "+15% power, -20% max HP, whole party.",
  ace_up_sleeve: "+30% power for your strongest mon.",
  phoenix_clause: "Grants the season's one extra life, if nothing already has.",
};

function DoctrineCard({ doctrine, onPick }: { doctrine: Doctrine; onPick: () => void }) {
  return (
    <div className="sn-card" style={{ "--sn-card-accent": RARITY_COLOR[doctrine.rarity] } as Record<string, string>}>
      <div className="sn-card-row">
        <span className="sn-tag" style={{ color: RARITY_COLOR[doctrine.rarity] }}>
          {doctrine.rarity}
        </span>
      </div>
      <div className="sn-name sn-display">{doctrine.name}</div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--sn-text-dim)", textAlign: "center", minHeight: 32 }}>
        {BLURB[doctrine.id] ?? ""}
      </p>
      <button className="sn-btn" onClick={onPick}>
        Take It
      </button>
    </div>
  );
}

export function ShopScreen() {
  const run = useSeason((s) => s.run);
  const shopOffer = useSeason((s) => s.shopOffer);
  const pickShopDoctrine = useSeason((s) => s.pickShopDoctrine);

  return (
    <div className="season-root">
      <div className="sn-header">
        <div>
          <div className="sn-eyebrow">Between Antes // Shop</div>
          <h1 className="sn-title sn-display">Ante {run.ante} Cleared</h1>
        </div>
        <div className="sn-meta">
          Owned <strong>{run.doctrines.length}</strong>
        </div>
      </div>

      <div className="sn-grid">
        {shopOffer.map((doctrine) => (
          <DoctrineCard key={doctrine.id} doctrine={doctrine} onPick={() => pickShopDoctrine(doctrine.id)} />
        ))}
      </div>

      <p style={{ color: "var(--sn-text-dim)", fontSize: 12, textAlign: "center", marginTop: "auto" }}>
        Taking a Doctrine rests the party and opens Ante {run.ante + 1}.
      </p>
    </div>
  );
}
