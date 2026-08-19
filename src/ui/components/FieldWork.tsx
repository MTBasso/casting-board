import { useState } from "react";
import { useGame } from "../../engine/store.js";
import { Sprite } from "./Sprite.js";
import {
  addToCrew,
  buyIntel,
  canHire,
  canPost,
  ceilingFor,
  crewLevel,
  crewOf,
  takesCrew,
  eligibleRoutes,
  fieldHireCost,
  fieldOffer,
  fieldStaff,
  hasIntel,
  hire,
  intelCost,
  passOnOffer,
  post,
  postingFor,
  postingOnRoute,
  recall,
  removeFromCrew,
  reserveCeiling,
  roundSeconds,
  slotsAvailable,
  stretchOf,
  unbench,
  usableReserve,
  constants,
  TYPES,
  type FieldRole,
  type Posting,
  type Route,
  type Trainer,
} from "../../sim/index.js";
import { TypeBadge } from "./TypeBadge.js";
import { CreaturePicker } from "./CreaturePicker.js";
import { creatureName } from "../names.js";
import { Portrait } from "./Portrait.js";

/**
 * The Field: routes, and the people working them.
 *
 * Built around the **route**, because the route is the unit of work. The screen
 * used to be three separate lists — one of routes, one of Rangers, one of
 * Handlers — which meant posting somebody required holding all three in your
 * head at once: is this route free, is that Ranger idle, does she have a crew.
 * Three views of the same decision, none of them able to make it.
 *
 * Now every route carries its two slots, a Ranger's and a Handler's, and each
 * slot is either the work happening in it or a way to start some.
 */
export function FieldWork() {
  const state = useGame((s) => s.state);

  const idle = usableReserve(state);
  const cap = reserveCeiling(state);
  const routes = [...eligibleRoutes(state)].sort((a, b) => a.levelMin - b.levelMin);

  const unposted = [...fieldStaff(state, "ranger"), ...fieldStaff(state, "handler")].filter(
    (t) => !postingFor(state, t.id),
  );

  return (
    <div className="field">
      <h2 className="col-title">
        Field
        <span className="counter">
          {state.postings.length} at work · {idle}/{cap} usable in the box
        </span>
      </h2>

      <div className="hire-row">
        <HireCard role="ranger" />
        <HireCard role="handler" />
      </div>

      {unposted.length > 0 && (
        <p className="warn-banner">
          {unposted.length} on the payroll and not on a route:{" "}
          {unposted.map((t) => t.name).join(", ")}.
        </p>
      )}

      <ul className="route-list">
        {routes.map((r) => (
          <RouteRow key={r.id} route={r} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Hiring, as an offer.
 *
 * Three types turn up; take one or pass and see three more. Free choice made a
 * Ranger a component you bought — you already knew the type you wanted, so the
 * only question was affordability.
 */
function HireCard({ role }: { role: FieldRole }) {
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);

  const staff = fieldStaff(state, role);
  const slots = slotsAvailable(state, role);
  const check = canHire(state, role);
  const cost = fieldHireCost(state, role);
  const full = staff.length >= slots;

  return (
    <section className={`hire-card ${full ? "is-full" : ""}`}>
      <div className="hire-head">
        <strong>{role === "ranger" ? "Rangers" : "Handlers"}</strong>
        <span className="dim">
          {staff.length}/{slots}
        </span>
      </div>
      <p className="hint">
        {role === "ranger"
          ? "Bring creatures back. They work alone, a shift at a time — finding creatures is their whole job, not training them."
          : `Take up to ${constants.HANDLER.partyMax} of their own type out and bring them back levelled.`}
      </p>

      {full ? (
        <p className="dim">
          Every slot filled. Upgrade the{" "}
          {role === "ranger" ? "Scouting Office" : "Training Grounds"} for another.
        </p>
      ) : (
        <>
          <div className="offer-choices compact">
            {fieldOffer(state, role).map((t) => (
              <button
                key={t}
                type="button"
                className="offer-choice"
                disabled={!check.ok}
                title={check.ok ? `Hire a ${t} ${role}` : check.reason}
                onClick={() => act((s) => void hire(s, role, t))}
              >
                <TypeBadge type={t} size="sm" />
              </button>
            ))}
          </div>
          <div className="hire-foot">
            <span className="dim">&#8369;{cost.toLocaleString()}</span>
            <button
              type="button"
              className="linky"
              onClick={() => act((s) => passOnOffer(s, role))}
            >
              pass, redraw
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** One route, and the two jobs that can be done on it. */
function RouteRow({ route }: { route: Route }) {
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);

  const known = hasIntel(state, route.id);
  const rows = TYPES.map((t) => ({ type: t, share: route.supply[t] }))
    .filter((r) => r.share > 0)
    .sort((a, b) => b.share - a.share);
  const total = rows.reduce((a, r) => a + r.share, 0) || 1;

  return (
    <li className="route-row">
      <div className="route-head">
        <span>
          <strong>{route.name}</strong>
          <span className="dim">
            {" "}
            Lv{route.levelMin}&ndash;{route.levelMax}
          </span>
        </span>
        {!known && (
          <button
            type="button"
            className="btn sm ghost"
            disabled={state.money < intelCost(route.id)}
            onClick={() => act((s) => void buyIntel(s, route.id))}
          >
            Survey · &#8369;{intelCost(route.id)}
          </button>
        )}
      </div>

      <div className="supply">
        {rows.map((r) => (
          <span key={r.type} className="supply-row">
            <TypeBadge type={r.type} size="sm" />
            {known && <b>{Math.round((r.share / total) * 100)}%</b>}
          </span>
        ))}
      </div>

      <div className="route-slots">
        <Slot route={route} role="ranger" />
        <Slot route={route} role="handler" />
      </div>
    </li>
  );
}

/**
 * A route's slot for one role: the work in it, or the way to start some.
 *
 * Both states live here on purpose. An empty slot that only says "empty" makes
 * the player go and find the screen where staffing happens; an empty slot that
 * offers you the eligible staff *is* that screen.
 */
function Slot({ route, role }: { route: Route; role: FieldRole }) {
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const [choosing, setChoosing] = useState(false);

  const posting = postingOnRoute(state, route.id, role);
  const label = role === "ranger" ? "Ranger" : "Handler";

  if (posting) {
    return <AtWork posting={posting} route={route} label={label} />;
  }

  const staff = fieldStaff(state, role);
  const ready = staff.filter((t) => canPost(state, route.id, t.id).ok);
  const blocked = staff
    .filter((t) => !canPost(state, route.id, t.id).ok && !postingFor(state, t.id))
    .map((t) => ({ trainer: t, why: (canPost(state, route.id, t.id) as { reason: string }).reason }));

  return (
    <div className={`slot slot-${role}`}>
      <span className="slot-role">{label}</span>

      {staff.length === 0 ? (
        <p className="dim">None employed.</p>
      ) : ready.length === 0 && !choosing ? (
        <p className="dim">
          {blocked[0]?.why ?? "Everyone is posted elsewhere."}
        </p>
      ) : null}

      {!choosing && ready.length > 0 && (
        <button type="button" className="btn sm" onClick={() => setChoosing(true)}>
          Post a {label}
        </button>
      )}

      {choosing && (
        <ul className="slot-picks">
          {ready.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="slot-pick"
                onClick={() => {
                  act((s) => void post(s, route.id, t.id));
                  setChoosing(false);
                }}
              >
                <Portrait trainer={t} size={26} />
                <TypeBadge type={t.affinity} size="sm" />
                <span>{t.name}</span>
                <span className="dim">
                  {takesCrew(t)
                    ? `crew Lv${crewLevel(state, t.id)}${
                        route.levelMin - crewLevel(state, t.id) > 0
                          ? ` · ${route.levelMin - crewLevel(state, t.id)} under`
                          : ""
                      }`
                    : "works alone"}
                </span>
              </button>
            </li>
          ))}
          {blocked.map(({ trainer, why }) => (
            <li key={trainer.id} className="is-blocked">
              <span className="slot-pick">
                <Portrait trainer={trainer} size={26} />
                <TypeBadge type={trainer.affinity} size="sm" />
                <span>{trainer.name}</span>
                <span className="dim">{why}</span>
              </span>
              {takesCrew(trainer) && <Crew trainer={trainer} />}
            </li>
          ))}
          <li>
            <button type="button" className="linky" onClick={() => setChoosing(false)}>
              cancel
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

/** A posting in progress. */
function AtWork({
  posting,
  route,
  label,
}: {
  posting: Posting;
  route: Route;
  label: string;
}) {
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);

  const trainer = state.trainers[posting.trainerId];
  if (!trainer) return null;

  const secs = roundSeconds(state, posting);
  const pct = secs > 0 ? Math.min(1, posting.progress / secs) : 0;
  const stretch = stretchOf(state, posting);
  const capped = crewLevel(state, trainer.id) >= ceilingFor(posting.routeId);
  const left = posting.endsAt === null ? null : Math.max(0, posting.endsAt - state.time);

  return (
    <div className={`slot slot-${posting.role} is-working`}>
      <span className="slot-role">{label}</span>

      <div className="slot-who">
        <Portrait trainer={trainer} size={30} />
        <TypeBadge type={trainer.affinity} size="sm" />
        <strong>{trainer.name}</strong>
        <button
          type="button"
          className="linky"
          onClick={() => act((s) => recall(s, trainer.id))}
        >
          recall
        </button>
      </div>

      {takesCrew(trainer) && <Crew trainer={trainer} />}

      <span className="track" title={`${Math.round(secs)}s per round`}>
        <span className="fill" style={{ width: `${pct * 100}%` }} />
      </span>

      <span className="slot-stat">
        {posting.role === "ranger"
          ? `${posting.caught} caught${left !== null ? ` · ${Math.ceil(left / 60)}m of shift left` : ""}`
          : `₱${Math.round(posting.earned).toLocaleString()} earned`}
      </span>

      {posting.resting && <p className="warn">Resting between shifts.</p>}
      {stretch > 0 && (
        <p className="warn">
          {stretch} levels over their heads
          {posting.beaten > 0 ? ` · beaten ${posting.beaten}×` : ""}
        </p>
      )}
      {capped && <p className="warn">Learned all {route.name} can teach.</p>}
    </div>
  );
}

/** Who a field trainer has with them, and how to change it. */
function Crew({ trainer }: { trainer: Trainer }) {
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const [adding, setAdding] = useState(false);

  const crew = crewOf(state, trainer.id);
  const posted = postingFor(state, trainer.id) !== undefined;
  const room = crew.length < trainer.partyCap;

  return (
    <>
      <ul className="crew">
        {crew.map((c) => (
          <li key={c.id} title={`${creatureName(c)} Lv${c.level}`}>
            <Sprite speciesId={c.speciesId} kind="icon" size={32} />
            <span className="crew-lv">Lv{c.level}</span>
            {!posted && (
              <button
                type="button"
                className="crew-drop"
                title="Take them out of the crew"
                onClick={() => act((s) => removeFromCrew(s, c.id))}
              >
                ×
              </button>
            )}
          </li>
        ))}
        {!posted && room && (
          <li>
            <button
              type="button"
              className="crew-add"
              onClick={() => setAdding(true)}
              title={`Add a ${trainer.affinity} creature to the crew`}
            >
              +
            </button>
          </li>
        )}
      </ul>

      {adding && (
        <CreaturePicker
          trainerId={trainer.id}
          title={`${trainer.name}’s crew`}
          onClose={() => setAdding(false)}
          onPick={(id) =>
            act((s) => {
              if (s.creatures[id]?.benched) unbench(s, id);
              void addToCrew(s, id, trainer.id);
            })
          }
        />
      )}
    </>
  );
}
