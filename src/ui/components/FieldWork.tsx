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
  candidatesFor,
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
  postingsOnRoute,
  recall,
  removeFromCrew,
  reserveCeiling,
  roundSeconds,
  stretchOf,
  slotsAvailable,
  usableReserve,
  constants,
  TYPES,
  type FieldRole,
  type Route,
  type Trainer,
} from "../../sim/index.js";
import { TypeBadge } from "./TypeBadge.js";
import { StaffStanding } from "./StaffStanding.js";
import { creatureName } from "../names.js";

/**
 * Routes, and the two kinds of people who work them.
 *
 * `Ground` is the map: what lives where, and who is standing on it. `Rangers`
 * and `Handlers` are the two payrolls — collecting and training, kept apart
 * because they are different jobs done at different times, and stacking them on
 * one screen left neither any room.
 */
type View = "routes" | "ranger" | "handler";

export function FieldWork() {
  const state = useGame((s) => s.state);
  const [view, setView] = useState<View>("routes");

  const idle = usableReserve(state);
  const cap = reserveCeiling(state);
  const boxFull = idle >= cap;

  const routes = [...eligibleRoutes(state)].sort((a, b) => a.levelMin - b.levelMin);
  const unposted = (role: FieldRole) =>
    fieldStaff(state, role).filter((t) => !postingFor(state, t.id)).length;

  return (
    <div className="rangers">
      <h2 className="col-title">
        Field
        <span className="counter">
          {state.postings.length} posted · {idle}/{cap} usable in the box
        </span>
      </h2>

      <div className="subtabs" role="tablist">
        {(
          [
            ["routes", "Routes", 0],
            ["ranger", "Rangers", unposted("ranger")],
            ["handler", "Handlers", unposted("handler")],
          ] as const
        ).map(([id, label, badge]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={`subtab ${view === id ? "is-active" : ""}`}
            onClick={() => setView(id)}
          >
            {label}
            {badge > 0 && <span className="tab-badge">{badge}</span>}
          </button>
        ))}
      </div>

      {boxFull && view !== "handler" && (
        <p className="warn-banner">
          {cap} creatures your trainers could field are sitting idle. Catching has
          stopped until you put some of them to work.
        </p>
      )}

      {view === "routes" ? (
        <>
          <p className="hint">
            Rangers bring creatures in; Handlers take a party out and bring it
            back stronger. Route work costs fatigue and never career — this is the
            safe posting, and the only one your spare creatures can hold.
          </p>
          <ul className="route-list">
            {routes.map((r) => (
              <RouteCard key={r.id} route={r} />
            ))}
          </ul>
        </>
      ) : (
        <Payroll role={view} />
      )}
    </div>
  );
}

/**
 * One role's staff, and the hiring offer above them.
 *
 * The offer is drawn, not chosen: three types turn up, you take one or you pass
 * and see three more. That is what makes a Water Ranger a piece of luck you
 * build around rather than a component you buy.
 */
function Payroll({ role }: { role: FieldRole }) {
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);

  const staff = fieldStaff(state, role);
  const slots = slotsAvailable(state, role);
  const check = canHire(state, role);
  const offer = fieldOffer(state, role);
  const cost = fieldHireCost(state, role);

  const blurb =
    role === "ranger"
      ? "A Ranger works a route with one partner of their own type, and brings back what lives there. They will not take ground their partner cannot handle."
      : `An Handler takes up to ${constants.HANDLER.partyMax} of their own type onto a route, earns Pokéyen, and brings them back levelled. They *may* be posted over their heads — it pays better and teaches faster, and one day they come back beaten.`;

  return (
    <>
      <p className="hint">{blurb}</p>

      <section className="group">
        <h3>
          Hiring
          <span className="counter">
            {staff.length}/{slots} employed
          </span>
        </h3>

        {staff.length >= slots ? (
          <p className="empty">
            Every slot is filled. Upgrade the{" "}
            {role === "ranger" ? "Scouting Office" : "Training Grounds"} for
            another.
          </p>
        ) : (
          <>
            <div className="offer-choices compact">
              {offer.map((t) => (
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
            <p className="hint">
              &#8369;{cost.toLocaleString()} to hire. Pass and three more turn up —
              but you lose the three in front of you.
            </p>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => act((s) => passOnOffer(s, role))}
            >
              Pass
            </button>
          </>
        )}
      </section>

      {staff.length === 0 ? (
        <p className="empty">
          Nobody employed.{" "}
          {role === "ranger"
            ? "This is where every creature on the roster comes from."
            : "This is the only way your creatures gain levels outside a gym."}
        </p>
      ) : (
        <ul className="trainer-list">
          {staff.map((t) => (
            <FieldRow key={t.id} trainer={t} />
          ))}
        </ul>
      )}
    </>
  );
}

function FieldRow({ trainer }: { trainer: Trainer }) {
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const [adding, setAdding] = useState(false);

  const posting = postingFor(state, trainer.id);
  const crew = crewOf(state, trainer.id);
  const route = posting
    ? eligibleRoutes(state).find((r) => r.id === posting.routeId)
    : undefined;

  const secs = posting ? roundSeconds(state, posting) : 0;
  const pct = posting && secs > 0 ? Math.min(1, posting.progress / secs) : 0;
  const stretch = posting ? stretchOf(state, posting) : 0;
  const capped =
    posting !== undefined && crewLevel(state, trainer.id) >= ceilingFor(posting.routeId);

  const options = adding ? candidatesFor(state, trainer.id).filter((o) => o.ok) : [];

  return (
    <li className="trainer-row">
      <div className="trainer-head">
        <span className="trainer-id">
          <TypeBadge type={trainer.affinity} size="sm" />
          <span>{trainer.name}</span>
          <span className="dim">{trainer.kind === "handler" ? "Handler" : "Ranger"}</span>
        </span>
        {posting ? (
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => act((s) => recall(s, trainer.id))}
          >
            Recall
          </button>
        ) : (
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? "Done" : "Crew…"}
          </button>
        )}
      </div>

      <StaffStanding trainer={trainer} />

      <ul className="crew">
        {crew.map((c) => (
          <li key={c.id} title={`${creatureName(c)} Lv${c.level}`}>
            <Sprite speciesId={c.speciesId} kind="icon" size={34} />
            <span className="crew-lv">Lv{c.level}</span>
            {!posting && (
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
        {crew.length === 0 && <li className="empty">No crew</li>}
      </ul>

      {adding && !posting && (
        <div className="post-options">
          {options.length === 0 ? (
            <p className="empty">
              Nothing in the box of their type. Work a route that supplies{" "}
              {trainer.affinity}, or trade for one.
            </p>
          ) : (
            <ul className="thin-list">
              {options.slice(0, 8).map(({ creature }) => (
                <li key={creature.id}>
                  <span className="row-id">
                    <Sprite speciesId={creature.speciesId} kind="icon" size={30} />
                    <span>
                      {creatureName(creature)}
                      <span className="dim"> Lv{creature.level}</span>
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => act((s) => void addToCrew(s, creature.id, trainer.id))}
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {posting && route && (
        <div className="posting">
          <div className="posting-who">
            <span>
              <strong>{route.name}</strong>
              <span className="dim">
                {" "}
                Lv{route.levelMin}–{route.levelMax}
              </span>
            </span>
            <span className="dim">
              {posting.role === "ranger"
                ? `${posting.caught} caught`
                : `₱${Math.round(posting.earned).toLocaleString()} earned`}
            </span>
          </div>

          <span className="track" title={`${Math.round(secs)}s per round`}>
            <span className="fill" style={{ width: `${pct * 100}%` }} />
          </span>

          {stretch > 0 && (
            <p className="warn">
              {stretch} levels over their heads — better pay and faster growth,
              and {posting.beaten > 0 ? `beaten ${posting.beaten} times so far` : "a real chance of coming back beaten"}.
            </p>
          )}
          {capped && (
            <p className="warn">
              This route has taught them all it can. Move them to harder ground.
            </p>
          )}
          {posting.resting && <p className="warn">Resting between shifts.</p>}
        </div>
      )}
    </li>
  );
}

function RouteCard({ route }: { route: Route }) {
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);

  const known = hasIntel(state, route.id);
  const here = postingsOnRoute(state, route.id);

  const rows = TYPES.map((t) => ({ type: t, share: route.supply[t] }))
    .filter((r) => r.share > 0)
    .sort((a, b) => b.share - a.share);
  const total = rows.reduce((a, r) => a + r.share, 0) || 1;

  const ready = open
    ? [...fieldStaff(state, "ranger"), ...fieldStaff(state, "handler")].filter(
        (t) => canPost(state, route.id, t.id).ok,
      )
    : [];

  return (
    <li className={`route-card ${here.length > 0 ? "is-worked" : ""}`}>
      <div className="route-head">
        <span>
          <strong>{route.name}</strong>
          <span className="dim">
            {" "}
            Lv{route.levelMin}–{route.levelMax}
          </span>
        </span>
        <button type="button" className="btn sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "Post…"}
        </button>
      </div>

      <div className="supply">
        {rows.map((r) => (
          <span key={r.type} className="supply-row">
            <TypeBadge type={r.type} size="sm" />
            {known && <b>{Math.round((r.share / total) * 100)}%</b>}
          </span>
        ))}
      </div>

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

      {here.length > 0 && (
        <ul className="on-route">
          {here.map((p) => {
            const who = state.trainers[p.trainerId];
            return (
              <li key={p.trainerId}>
                <span className="worked-by">
                  {p.role === "ranger" ? "Ranger" : "Handler"}
                </span>
                <span className="dim">{who?.name}</span>
                <span className="dim">
                  {p.role === "ranger"
                    ? `${p.caught} caught`
                    : `\u20b1${Math.round(p.earned).toLocaleString()}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <div className="post-options">
          {ready.length === 0 ? (
            <p className="empty">
              Nobody crewed who could work this ground. Rangers need Lv
              {route.levelMin}; Handlers can be pushed{" "}
              {constants.HANDLER.maxStretch} levels under it.
            </p>
          ) : (
            <ul className="thin-list">
              {ready.map((t) => {
                const under = Math.max(0, route.levelMin - crewLevel(state, t.id));
                return (
                  <li key={t.id}>
                    <span className="row-id">
                      <TypeBadge type={t.affinity} size="sm" />
                      <span>
                        {t.name}
                        <span className="dim">
                          {" "}
                          {t.kind === "handler" ? "Handler" : "Ranger"} · crew Lv
                          {crewLevel(state, t.id)}
                          {under > 0 && ` · ${under} under`}
                        </span>
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => {
                        act((s) => void post(s, route.id, t.id));
                        setOpen(false);
                      }}
                    >
                      Post
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
