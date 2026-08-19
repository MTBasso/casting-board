import { useState } from "react";
import { useGame } from "../../engine/store.js";
import {
  ROUTES,
  TYPES,
  crewById,
  crewName,
  expeditionOn,
  isOpen,
  bannedOn,
  knownOf,
  seenOn,
  toggleBan,
  routeById,
  type Route,
} from "../../sim/index.js";
import { TypeBadge } from "./TypeBadge.js";
import { Sprite } from "./Sprite.js";
import { speciesName } from "../sprites.js";
import { useT } from "../i18n.js";

/**
 * The map.
 *
 * Sixteen places in a web with loops, three of them open from the first hour and
 * the rest reached by pushing on from ground you already know. Routes used to
 * unlock at renown thresholds — a number that happened *to* you — and the point
 * of drawing this is that the frontier is a thing you can see and choose
 * between, rather than a queue you empty.
 *
 * Unreached ground is drawn as a rumour: you can see there is something that
 * way, and not what.
 */
export function FieldMap({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (routeId: string) => void;
}) {
  const t = useT();
  const state = useGame((s) => s.state);

  // Every edge once, drawn under the nodes.
  const edges: { a: Route; b: Route; known: boolean }[] = [];
  for (const route of ROUTES) {
    for (const id of route.neighbours) {
      if (id <= route.id) continue;
      const other = routeById(id);
      if (!other) continue;
      const known = isOpen(state, route.id) || isOpen(state, other.id);
      if (!known) continue;
      edges.push({ a: route, b: other, known: isOpen(state, route.id) && isOpen(state, other.id) });
    }
  }

  const visible = ROUTES.filter(
    (r) => isOpen(state, r.id) || r.neighbours.some((n) => isOpen(state, n)),
  );

  return (
    <div className="fieldmap">
      <svg viewBox="0 0 100 92" role="img" aria-label={t("a11y.map")}>
        {edges.map(({ a, b, known }) => (
          <line
            key={`${a.id}-${b.id}`}
            className={`path ${known ? "is-known" : "is-rumour"}`}
            x1={a.at.x}
            y1={a.at.y}
            x2={b.at.x}
            y2={b.at.y}
          />
        ))}
      </svg>

      {visible.map((route) => (
        <Node
          key={route.id}
          route={route}
          selected={selected === route.id}
          onSelect={() => onSelect(route.id)}
        />
      ))}
    </div>
  );
}

function Node({
  route,
  selected,
  onSelect,
}: {
  route: Route;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useT();
  const state = useGame((s) => s.state);
  const open = isOpen(state, route.id);
  const trip = expeditionOn(state, route.id);
  const crew = trip ? crewById(state, trip.crewId) : undefined;
  const frontier = !open;

  const known = knownOf(state, route.id);
  const lead = TYPES.filter((t) => route.supply[t] > 0).sort(
    (a, b) => route.supply[b] - route.supply[a],
  )[0];

  return (
    <button
      type="button"
      className={`node ${open ? "is-open" : "is-rumour"} ${selected ? "is-selected" : ""} ${
        trip ? "is-busy" : ""
      }`}
      style={{ left: `${route.at.x}%`, top: `${route.at.y}%` }}
      onClick={onSelect}
      title={open ? t(`route.${route.id}` as never) : t("field.somewhereOut")}
    >
      <span className="node-dot">
        {open && lead && <TypeBadge type={lead} size="sm" />}
        {frontier && <span aria-hidden="true">?</span>}
      </span>
      <span className="node-name">
        {open ? t(`route.${route.id}` as never) : t("field.unexplored")}
      </span>
      {open && (
        <span className="node-known" title={`${Math.round(known * 100)}% known`}>
          <span style={{ width: `${known * 100}%` }} />
        </span>
      )}
      {crew && <span className="node-crew">{crewName(state, crew).split(" ")[0]}…</span>}
    </button>
  );
}

/**
 * What the league has met here, and what it would rather not bring home.
 *
 * A crew brings back its Ranger's type, and by the mid-game most of that is
 * things you already have six of. Banning a species is how you say *stop* —
 * and because you can only ban what you have actually seen, the list doubles as
 * the honest beginning of a Pokédex: a record of what this league has met, and
 * where, rather than a catalogue handed to you.
 */
function WhatLivesHere({ route }: { route: Route }) {
  const t = useT();
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);

  const seen = seenOn(state, route.id);
  const banned = bannedOn(state, route.id);
  if (seen.length === 0) {
    return (
      <p className="dim">
{t("field.nothingMet")}
      </p>
    );
  }

  return (
    <div className="seen-here">
      <button type="button" className="linky" onClick={() => setOpen((v) => !v)}>
{open
          ? t("field.hide")
          : banned.length > 0
            ? t("field.metHereRefused", { n: seen.length, r: banned.length })
            : t("field.metHere", { n: seen.length })}
      </button>

      {open && (
        <>
          <ul className="seen-grid">
            {seen.map((slug) => {
              const off = banned.includes(slug);
              return (
                <li key={slug}>
                  <button
                    type="button"
                    className={`seen ${off ? "is-banned" : ""}`}
                    title={off ? t("field.banOff") : t("field.banOn")}
                    onClick={() => act((s) => toggleBan(s, route.id, slug))}
                  >
                    <Sprite speciesId={slug} kind="icon" size={34} />
                    <span>{speciesName(slug)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="dim">
{t("field.refusedNote")}
          </p>
        </>
      )}
    </div>
  );
}

/** Everything about one place, once you have been there. */
export function RouteDetail({ routeId }: { routeId: string }) {
  const t = useT();
  const state = useGame((s) => s.state);
  const route = routeById(routeId);
  if (!route) return null;

  const open = isOpen(state, route.id);
  const trip = expeditionOn(state, route.id);
  const known = knownOf(state, route.id);

  if (!open) {
    const from = route.neighbours.filter((n) => isOpen(state, n)).map((n) => routeById(n));
    return (
      <section className="route-detail is-rumour">
        <h3>{t("field.unexplored")}</h3>
        <p className="hint">
          {t("field.rumourFrom", {
            from: from
              .map((r) => (r ? t(`route.${r.id}` as never) : ""))
              .filter(Boolean)
              .join(" / "),
          })}
        </p>
      </section>
    );
  }

  const rows = TYPES.map((t) => ({ type: t, share: route.supply[t] }))
    .filter((r) => r.share > 0)
    .sort((a, b) => b.share - a.share);
  const total = rows.reduce((a, r) => a + r.share, 0) || 1;

  return (
    <section className="route-detail">
      <header>
        <h3>{t(`route.${route.id}` as never)}</h3>
        <span className="dim">
          Lv{route.levelMin}&ndash;{route.levelMax} ·{" "}
          {t("field.peril", { n: Math.round(route.peril * 100) })}
        </span>
      </header>

      <div className="route-supply">
        {rows.map((r) => (
          <span key={r.type} className="route-type">
            <TypeBadge type={r.type} size="sm" />
            <b>{Math.round((r.share / total) * 100)}%</b>
          </span>
        ))}
      </div>

      <div className="landmark">
        <Sprite speciesId={route.resident} size={44} />
        <div>
          <strong>{t(`mark.${route.id}` as never)}</strong>
          <p>{t(`blurb.${route.id}` as never)}</p>
          <span className="dim">
            {t("field.livesHere", { name: speciesName(route.resident) })}
          </span>
        </div>
      </div>

      <div className="route-known">
        <span className="dim">
          {known >= 1
            ? t("field.knownEnough")
            : t("field.knownPartly", { n: Math.round(known * 100) })}
        </span>
        <span className="track">
          <span className="fill" style={{ width: `${known * 100}%` }} />
        </span>
      </div>

      {trip && <p className="hint">{t("field.crewHereNow")}</p>}

      <WhatLivesHere route={route} />
    </section>
  );
}
