import { spriteUrl } from "../sprites.js";
import { useSeason } from "./store.js";

/**
 * An Evolution Stone offer — F2c. Up to 3 (party member, evolution target)
 * pairs; picking one evolves that member one stage (Q4: never a whole line
 * at once), and a branching member like Eevee can show more than one pair
 * across different offers, each a different target.
 */
export function EvolveScreen() {
  const evolutionOffer = useSeason((s) => s.evolutionOffer);
  const run = useSeason((s) => s.run);
  const resolveEvolutionOffer = useSeason((s) => s.resolveEvolutionOffer);

  if (evolutionOffer.length === 0) return null;

  return (
    <div className="season-root">
      <div className="sn-header">
        <div>
          <div className="sn-eyebrow">Between Antes // Evolution Stone</div>
          <h1 className="sn-title sn-display">An Evolution Stone</h1>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
        {evolutionOffer.map((candidate) => {
          const member = run.party[candidate.memberIndex];
          if (!member) return null;
          return (
            <div key={`${candidate.memberIndex}-${candidate.target.slug}`} className="sn-card" style={{ width: "220px" }}>
              <div className="sn-card-row" style={{ justifyContent: "center", alignItems: "center", gap: 10 }}>
                <div className="sn-portrait" style={{ width: "72px", height: "72px" }}>
                  {spriteUrl(member.slug) && <img src={spriteUrl(member.slug) ?? ""} alt="" />}
                </div>
                <span style={{ color: "var(--sn-text-dim)" }}>→</span>
                <div className="sn-portrait" style={{ width: "72px", height: "72px" }}>
                  {spriteUrl(candidate.target.slug) && <img src={spriteUrl(candidate.target.slug) ?? ""} alt="" />}
                </div>
              </div>
              <div className="sn-name sn-display" style={{ textAlign: "center" }}>
                {member.name} → {candidate.target.name}
              </div>
              <button
                className="sn-btn is-primary"
                style={{ width: "100%", marginTop: 8 }}
                onClick={() => resolveEvolutionOffer(candidate)}
              >
                Evolve
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: "auto" }}>
        <button className="sn-btn" style={{ flex: 1 }} onClick={() => resolveEvolutionOffer(null)}>
          Skip
        </button>
      </div>
    </div>
  );
}
