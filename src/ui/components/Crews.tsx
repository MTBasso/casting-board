import { useState } from "react";
import { useGame } from "../../engine/store.js";
import {
  canHireCrew,
  canPushOnFrom,
  canSend,
  crewHireCost,
  crewName,
  crewOffer,
  crewSlots,
  competence,
  decide,
  dismissCrew,
  expeditionOf,
  expeditionOn,
  hireCrew,
  isOpen,
  kitCost,
  openRoutes,
  passOnCrewOffer,
  setOrders,
  recall,
  routeById,
  send,
  trainableFor,
  constants,
  type Crew,
  type Kit,
} from "../../sim/index.js";
import { Portrait } from "./Portrait.js";
import { Sprite } from "./Sprite.js";
import { TypeBadge } from "./TypeBadge.js";
import { creatureName } from "../names.js";
import { useT, useTk } from "../i18n.js";

/**
 * The crews, and sending them out.
 *
 * A crew is one hire and one decision. Everything about them lives here — who
 * they are, what they are like, where they have been, and what it would take to
 * send them somewhere.
 */
export function Crews() {
  const t = useT();
  const state = useGame((s) => s.state);
  const [outfitting, setOutfitting] = useState<string | null>(null);

  return (
    <div className="crews">
      <h2 className="col-title">
        {t("crews.title")}
        <span className="counter">
          {t("crews.count", {
            n: state.crews.length,
            max: crewSlots(state),
            out: state.expeditions.length,
          })}
        </span>
      </h2>

      <HireOffer />

      {state.crews.length === 0 ? (
        <p className="empty">
{t("crews.none")}
        </p>
      ) : (
        <ul className="crew-list">
          {state.crews.map((crew) => (
            <CrewRow
              key={crew.id}
              crew={crew}
              outfitting={outfitting === crew.id}
              onOutfit={() => setOutfitting(outfitting === crew.id ? null : crew.id)}
              onDone={() => setOutfitting(null)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Three crews, drawn. Take one, or pass and see three more. */
function HireOffer() {
  const t = useT();
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const check = canHireCrew(state);
  const offers = crewOffer(state);

  if (state.crews.length >= crewSlots(state)) {
    return (
      <p className="hint">
{t("crews.slotsFull")}
      </p>
    );
  }

  return (
    <section className="group">
      <h3>
        {t("crews.looking")}
        <span className="counter">&#8369;{crewHireCost(state).toLocaleString()}</span>
      </h3>
      <p className="hint">
{t("crews.offerNote")}
      </p>

      <ul className="offer-crews">
        {offers.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              className="offer-crew"
              disabled={!check.ok}
              title={check.ok ? undefined : check.reason}
              onClick={() => act((s) => void hireCrew(s, o.id))}
            >
              <span className="offer-faces">
                <span className="portrait" style={{ width: 40, height: 40 }}>
                  <img src={`${import.meta.env.BASE_URL}trainers/${o.rangerLook}.png`} alt="" />
                </span>
                <span className="portrait" style={{ width: 40, height: 40 }}>
                  <img src={`${import.meta.env.BASE_URL}trainers/${o.handlerLook}.png`} alt="" />
                </span>
              </span>
              <span className="offer-name">
                {o.rangerName} &amp; {o.handlerName}
              </span>
              <span className="offer-types">
                <TypeBadge type={o.rangerType} size="sm" />
                <TypeBadge type={o.handlerType} size="sm" />
              </span>
              <span className={`trait trait-${o.trait}`}>{o.trait}</span>
            </button>
          </li>
        ))}
      </ul>

      <button type="button" className="linky" onClick={() => act((s) => passOnCrewOffer(s))}>
        {t("crews.pass")}
      </button>
    </section>
  );
}

function CrewRow({
  crew,
  outfitting,
  onOutfit,
  onDone,
}: {
  crew: Crew;
  outfitting: boolean;
  onOutfit: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);

  const ranger = state.trainers[crew.rangerId];
  const handler = state.trainers[crew.handlerId];
  const trip = expeditionOf(state, crew.id);
  if (!ranger || !handler) return null;

  const best = Object.entries(crew.familiar)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <li className={`crew-row ${trip ? "is-out" : ""}`}>
      <div className="crew-head">
        <Portrait trainer={ranger} size={38} />
        <Portrait trainer={handler} size={38} />
        <span className="crew-id">
          <span className="crew-name">{crewName(state, crew)}</span>
          <span className="crew-types">
            <TypeBadge type={ranger.affinity} size="sm" />
            <TypeBadge type={handler.affinity} size="sm" />
            <span className={`trait trait-${crew.trait}`}>{crew.trait}</span>
          </span>
        </span>
        {!trip && (
          <button type="button" className="linky danger" onClick={() => act((s) => dismissCrew(s, crew.id))}>
            {t("crews.letGo")}
          </button>
        )}
      </div>

      {best.length > 0 && (
        <div className="crew-known">
          {best.map(([id, level]) => (
            <span key={id} title={`${Math.round(level * 100)}% at home here`}>
              {routeById(id)?.name}
              <b>{Math.round(level * 100)}%</b>
            </span>
          ))}
        </div>
      )}

      {trip ? <OnTheGround crew={crew} /> : outfitting ? (
        <Outfit crew={crew} onDone={onDone} />
      ) : (
        <button type="button" className="btn sm" onClick={onOutfit}>
          {t("crews.sendOut")}
        </button>
      )}
    </li>
  );
}

/** A crew out, what they have left, and anything waiting on you. */
function OnTheGround({ crew }: { crew: Crew }) {
  const t = useT();
  const tk = useTk();
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const trip = expeditionOf(state, crew.id);
  const route = trip ? routeById(trip.routeId) : undefined;
  if (!trip || !route) return null;

  return (
    <div className="on-ground">
      <div className="on-ground-head">
        <strong>
{trip.objective === "explore"
            ? t("crews.pushingOn", { route: tk(`route.${route.id}`) })
            : t("crews.working", { route: tk(`route.${route.id}`) })}
        </strong>
        <button type="button" className="linky" onClick={() => act((s) => recall(s, crew.id))}>
          {t("crews.callBack")}
        </button>
      </div>

      <p className="standing-state">
        {crew.orders ? (
          <>
            {t("crews.standingOn", { route: tk(`route.${crew.orders.routeId}`) })}
            <button
              type="button"
              className="linky"
              onClick={() => act((s) => void setOrders(s, crew.id, null))}
            >
              {t("crews.stopOrders")}
            </button>
          </>
        ) : (
          <span className="dim">{t("crews.standingOff")}</span>
        )}
      </p>

      <div className="kit-left">
        {(["balls", "potions", "revives", "lures"] as const).map((k) => (
          <span key={k} className={trip.kit[k] === 0 ? "is-out" : ""}>
            {tk(`kit.${k}`)} <b>{trip.kit[k]}</b>
          </span>
        ))}
        <span>
          {t("crews.caught")} <b>{trip.caught}</b>
        </span>
        <span className={trip.hurt > 0.6 ? "is-out" : ""}>
          {t("crews.worn")} <b>{Math.round(trip.hurt * 100)}%</b>
        </span>
      </div>

      {trip.pending && (
        <div className="choice">
          <p>{tk(trip.pending.prompt, trip.pending.promptParams)}</p>
          <div className="choice-options">
            {trip.pending.options.map((o) => (
              <button
                key={o.id}
                type="button"
                className="btn sm"
                onClick={() => act((s) => void decide(s, crew.id, o.id))}
              >
                {tk(o.label, o.labelParams)}
              </button>
            ))}
          </div>
          <span className="dim">
{t("crews.willDecide", { trait: tk(`trait.${crew.trait}`) })}
          </span>
        </div>
      )}

      <ol className="trip-log">
        {[...trip.log].reverse().slice(0, 5).map((e, i) => (
          <li key={i} className={`ev-${e.kind}`}>
            {tk(e.key, e.params)}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Choose ground, choose a party, buy the kit. Money changes hands on setting off. */
function Outfit({ crew, onDone }: { crew: Crew; onDone: () => void }) {
  const t = useT();
  const tk = useTk();
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);

  const free = openRoutes(state).filter((r) => !expeditionOn(state, r.id));
  const [routeId, setRouteId] = useState(free[0]?.id ?? "");
  const [toward, setToward] = useState<string | null>(null);
  const [kit, setKit] = useState<Kit>({ balls: 10, potions: 5, revives: 1, lures: 0 });
  const [party, setParty] = useState<string[]>([]);
  const [standing, setStanding] = useState(false);
  const [floor, setFloor] = useState(0);

  const route = routeById(routeId);
  const onward = route
    ? route.neighbours.filter((n) => !isOpen(state, n))
    : [];
  const canExplore = route ? canPushOnFrom(state, route.id) : false;

  const objective = toward ? "explore" : "work";
  const check = route
    ? canSend(state, crew.id, route.id, objective, toward, kit)
    : { ok: false as const, reason: t("crews.nowhereFree") };

  const candidates = route ? trainableFor(state, crew, route).slice(0, 12) : [];

  if (free.length === 0) {
    return <p className="empty">{t("crews.allGroundBusy")}</p>;
  }

  return (
    <div className="outfit">
      <label className="field">
        <span>{t("crews.ground")}</span>
        <select
          value={routeId}
          onChange={(e) => {
            setRouteId(e.target.value);
            setToward(null);
            setParty([]);
          }}
        >
          {free.map((r) => (
            <option key={r.id} value={r.id}>
{tk(`route.${r.id}`)} · Lv{r.levelMin}–{r.levelMax}
            </option>
          ))}
        </select>
      </label>

      {route && (
        <p className="dim">
{t("crews.atHome", {
            trait: tk(`trait.${crew.trait}`),
            n: Math.round(competence(crew, route.id) * 100),
          })}
        </p>
      )}

      {onward.length > 0 && (
        <label className="field">
          <span>{t("crews.objective")}</span>
          <select
            value={toward ?? ""}
            onChange={(e) => setToward(e.target.value || null)}
            disabled={!canExplore}
          >
            <option value="">{t("crews.workHere")}</option>
            {onward.map((id) => (
              <option key={id} value={id}>
{t("crews.pushTo")} — {tk(`route.${id}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      {onward.length > 0 && !canExplore && (
        <p className="dim">
{t("crews.cannotPush")}
        </p>
      )}

      <div className="kit-buy">
        {(["balls", "potions", "revives", "lures"] as const).map((k) => (
          <label key={k} className="kit-line">
            <span>{tk(`kit.${k}`)}</span>
            <input
              type="range"
              min={0}
              max={constants.KIT[k].max}
              value={kit[k]}
              onChange={(e) => setKit({ ...kit, [k]: Number(e.target.value) })}
            />
            <b>{kit[k]}</b>
            <span className="dim">&#8369;{(kit[k] * constants.KIT[k].cost).toLocaleString()}</span>
          </label>
        ))}
      </div>

      {candidates.length > 0 && (
        <div className="take-party">
          <span className="dim">
{t("crews.takeParty", { n: constants.FIELD.partyMax })}
          </span>
          <ul>
            {candidates.map((c) => {
              const on = party.includes(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`take ${on ? "is-on" : ""}`}
                    onClick={() =>
                      setParty(
                        on
                          ? party.filter((x) => x !== c.id)
                          : party.length < constants.FIELD.partyMax
                            ? [...party, c.id]
                            : party,
                      )
                    }
                  >
                    <Sprite speciesId={c.speciesId} kind="icon" size={30} />
                    <span>{creatureName(c)}</span>
                    <span className="dim">Lv{c.level}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Standing orders remove the repetition, never the decision — the route
          and the kit above are still the player's, and this only says whether
          to do it again. */}
      <div className="standing">
        <label className="standing-toggle">
          <input
            type="checkbox"
            checked={standing}
            onChange={(e) => setStanding(e.target.checked)}
          />
          <span>
            <b>{t("crews.standing")}</b>
            <span className="dim">{t("crews.standingHint")}</span>
          </span>
        </label>

        {standing && (
          <label className="field">
            <span>{t("crews.floor")}</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={floor}
              onChange={(e) => setFloor(Math.max(0, Number(e.target.value)))}
            />
            <span className="dim">{t("crews.floorHint")}</span>
          </label>
        )}
      </div>

      <div className="outfit-foot">
        <span>
{t("crews.kitCost", { n: kitCost(kit).toLocaleString() })}
          <span className="dim">{t("crews.unspentBack")}</span>
        </span>
        <button
          type="button"
          className="btn"
          disabled={!check.ok}
          title={check.ok ? undefined : check.reason}
          onClick={() => {
            act((s) => {
              setOrders(
                s,
                crew.id,
                standing ? { routeId, objective, towardId: toward, kit, floor } : null,
              );
              send(s, crew.id, routeId, objective, toward, kit, party);
            });
            onDone();
          }}
        >
          {t("crews.setOff")}
        </button>
      </div>
    </div>
  );
}
