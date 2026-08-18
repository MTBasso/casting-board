import { useGame } from "../../engine/store.js";
import { chooseLeader, partyOf, type Trainer } from "../../sim/index.js";
import { spriteUrl } from "../sprites.js";
import { creatureName } from "../names.js";
import { TypeBadges } from "./TypeBadge.js";

/**
 * Choosing a Gym Leader.
 *
 * Free — the building was the expense. What the player is picking is an
 * archetype and a partner: each candidate turns up with their own creature,
 * already trained and fully bonded, so the decision has a face on it instead of
 * being three interchangeable stat blocks.
 */
const ARCHETYPES: Record<string, { name: string; blurb: string }> = {
  stall: {
    name: "Defensive",
    blurb: "Wears challengers down. Their party tires more slowly and holds harder.",
  },
  sweep: {
    name: "Aggressive",
    blurb: "Ends battles fast, and tires fast doing it.",
  },
  mentor: {
    name: "Mentor",
    blurb: "Creatures under them settle in far quicker.",
  },
  drillmaster: {
    name: "Drillmaster",
    blurb: "Spends their creatures' careers sparingly. They last longer.",
  },
};

export function LeaderOffer() {
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const offer = state.leaderOffer;

  if (!offer) return null;
  const gym = state.gyms[offer.gymId];
  const candidates = offer.trainerIds
    .map((id) => state.trainers[id])
    .filter((t): t is Trainer => t !== undefined);

  if (candidates.length === 0) return null;

  return (
    <div className="offer">
      <div className="offer-body wide">
        <p className="offer-eyebrow">{gym?.name ?? "New gym"} needs a Leader</p>
        <h2>Choose who runs it</h2>
        <p className="offer-sub">
          Free — you have already paid for the building. Each brings their own
          partner, and their own way of running a gym.
        </p>

        <div className="leader-choices">
          {candidates.map((t) => (
            <LeaderCard key={t.id} trainer={t} onPick={() => act((s) => void chooseLeader(s, t.id))} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LeaderCard({ trainer, onPick }: { trainer: Trainer; onPick: () => void }) {
  const state = useGame((s) => s.state);
  const party = partyOf(state, trainer.id);
  const partner = party[0];
  const archetype = ARCHETYPES[trainer.doctrine] ?? {
    name: trainer.doctrine,
    blurb: "",
  };

  return (
    <button type="button" className="leader-card" onClick={onPick}>
      <span className="leader-name">{trainer.name}</span>
      <span className="leader-archetype">{archetype.name}</span>
      <span className="leader-blurb">{archetype.blurb}</span>

      {partner && (
        <span className="leader-partner">
          {spriteUrl(partner.speciesId) && (
            <img
              className="sprite"
              src={spriteUrl(partner.speciesId) ?? ""}
              alt=""
              width={48}
              height={48}
            />
          )}
          <span className="leader-partner-id">
            <span>{creatureName(partner)}</span>
            <span className="dim">
              Lv{partner.level} · {partner.power} power
            </span>
            <TypeBadges types={partner.types} size="sm" />
          </span>
        </span>
      )}
    </button>
  );
}
