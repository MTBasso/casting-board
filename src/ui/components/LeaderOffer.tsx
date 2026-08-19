import { useGame } from "../../engine/store.js";
import { useT } from "../i18n.js";
import { chooseLeader, partyOf, type Trainer } from "../../sim/index.js";
import { spriteUrl } from "../sprites.js";
import { creatureName } from "../names.js";
import { TypeBadges } from "./TypeBadge.js";
import { Portrait } from "./Portrait.js";

/**
 * Choosing a Gym Leader.
 *
 * Free — the building was the expense. What the player is picking is an
 * archetype and a partner: each candidate turns up with their own creature,
 * already trained and fully bonded, so the decision has a face on it instead of
 * being three interchangeable stat blocks.
 */
const ARCHETYPES = ["stall", "sweep", "mentor", "drillmaster"] as const;

/** A doctrine the offer screen has words for. Others fall back to their id. */
function known(doctrine: string): doctrine is (typeof ARCHETYPES)[number] {
  return (ARCHETYPES as readonly string[]).includes(doctrine);
}

export function LeaderOffer() {
  const t = useT();
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
        <h2>{t("leaderOffer.title")}</h2>
        <p className="offer-sub">
          {t("leaderOffer.detail")}
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
  const t = useT();
  const state = useGame((s) => s.state);
  const party = partyOf(state, trainer.id);
  const partner = party[0];
  const archetype = known(trainer.doctrine)
    ? { name: t(`arch.${trainer.doctrine}`), blurb: t(`arch.${trainer.doctrine}.blurb`) }
    : { name: trainer.doctrine, blurb: "" };

  return (
    <button type="button" className="leader-card" onClick={onPick}>
      <Portrait trainer={trainer} size={56} />
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
