import { useGame } from "../../engine/store.js";
import { acceptGymOffer, briefType, gymCost } from "../../sim/index.js";
import { TypeBadge } from "./TypeBadge.js";

/**
 * The Regional-tier identity decision at prototype scale: which types is your
 * league?
 *
 * Each option carries what you need to judge it — how many of that type you
 * already own, which surveyed routes feed it, and how much of the incoming
 * challenger meta it will have to face. A blind pick between three type names
 * is a coin flip, not an identity.
 */
export function GymOffer() {
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const offer = state.gymOffer;

  if (!offer || offer.length === 0) return null;

  const founding = state.gymOrder.length === 0;

  // Set aside rather than dismissed. A gym you cannot afford yet should wait
  // quietly, not block the screen and not disappear. The founding choice is the
  // exception — there is no game to go back to until it is made.
  if (state.gymOfferMinimized && !founding) {
    return (
      <button
        type="button"
        className="offer-chip"
        onClick={() => act((s) => void (s.gymOfferMinimized = false))}
      >
        New gym available · {gymCost(state).toLocaleString()}
      </button>
    );
  }

  const cost = gymCost(state);
  const affordable = state.money >= cost;

  return (
    <div className="offer">
      <div className="offer-body">
        <div className="offer-top">
          <p className="offer-eyebrow">
            {founding ? "Found your league" : "New gym available"}
          </p>
          {!founding && (
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => act((s) => void (s.gymOfferMinimized = true))}
            >
              Later
            </button>
          )}
        </div>
        <h2>
          {founding ? "Choose your first gym\u2019s type" : "Choose your next gym\u2019s type"}
        </h2>
        <p className="offer-sub">
          {founding ? (
            <>
              This is the type your league is built around, and the only one you
              will be able to field at first. Free — everything starts here.
            </>
          ) : (
            <>
              Construction costs <strong>{cost.toLocaleString()}</strong>. You have{" "}
              {Math.round(state.money).toLocaleString()}.
              {!affordable && " Keep earning — the offer will wait."}
            </>
          )}
        </p>

        <div className="offer-choices">
          {offer.map((type) => {
            const brief = briefType(state, type);
            return (
              <button
                key={type}
                type="button"
                className="offer-choice"
                disabled={!affordable}
                onClick={() => act((s) => void acceptGymOffer(s, type))}
              >
                <span className="offer-choice-head">
                  <TypeBadge type={type} />
                </span>
                <dl className="brief">
                  <div>
                    <dt>Owned</dt>
                    <dd>{brief.owned}</dd>
                  </div>
                  <div>
                    <dt>Challengers</dt>
                    <dd>{Math.round(brief.metaShare * 100)}%</dd>
                  </div>
                  <div>
                    <dt>Supplied by</dt>
                    <dd>
                      {brief.routes.length > 0
                        ? brief.routes.join(", ")
                        : "no surveyed route"}
                    </dd>
                  </div>
                </dl>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
