import { useState } from "react";
import { useGame } from "../../engine/store.js";
import { Sprite } from "./Sprite.js";
import {
  constants,
  displayName,
  inductable,
  promote,
  readiness,
} from "../../sim/index.js";
import { speciesName } from "../sprites.js";

/**
 * The two ways up, and the choice between them.
 *
 * The earned path is a readiness check across the whole board, and it carries
 * your own legends forward as Mentors. The forced path opens the moment a
 * challenger takes the title, and carries only the person who beat you.
 *
 * Nothing here ever promotes on its own. A lost title makes the climb available;
 * staying and winning it back is always a legal move, and the better one if you
 * can afford the time.
 */
export function Promotion() {
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);
  const [picked, setPicked] = useState<string[]>([]);

  const check = readiness(state);
  const forced = check.path === "forced";
  const usurper = state.usurperId ? state.trainers[state.usurperId] : undefined;
  const candidates = inductable(state).slice(0, 12);
  const max = constants.PROMOTION.inductCount;

  function toggle(id: string) {
    setPicked((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= max
          ? prev
          : [...prev, id],
    );
  }

  return (
    <section className={`panel promotion ${forced ? "is-forced" : ""}`}>
      <header className="panel-head">
        <div>
          <h2>{forced ? "The league is not yours" : "Promotion"}</h2>
          <p className="panel-sub">
            {forced
              ? `${usurper?.name ?? "A challenger"} holds the title. You can take the tier now, or stay and win it back.`
              : `Climb from ${state.tier} to the next tier. Everything resets but the Hall.`}
          </p>
        </div>
      </header>

      {forced ? (
        <>
          <div className="path-compare">
            <div className="path is-open">
              <h3>Go now</h3>
              <p>
                You arrive at the next tier with <strong>{usurper?.name ?? "the usurper"}</strong>{" "}
                and the team that beat you. Nothing else — no inductees, no Mentors.
              </p>
            </div>
            <div className="path">
              <h3>Win it back first</h3>
              <p>
                Out-develop them, retake the title, then promote the earned way —
                with {max} of your own and the Mentors that actually bend the
                curve. Slower, and worth it.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn danger"
            onClick={() => act((s) => void promote(s, []))}
          >
            Take the tier now
          </button>
        </>
      ) : check.ok ? (
        <>
          <p className="hint">
            Choose up to {max} to induct. Each becomes a Mentor: they train every
            creature of their type in every league that follows. This is the only
            thing that survives.
          </p>
          <ul className="induct-grid">
            {candidates.map((c) => {
              const on = picked.includes(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`induct ${on ? "is-on" : ""}`}
                    onClick={() => toggle(c.id)}
                  >
                    <Sprite speciesId={c.speciesId} size={48} />
                    <span className="induct-name">{displayName(c)}</span>
                    <span className="dim">
                      {speciesName(c.speciesId)} · {c.wins}W
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="btn"
            disabled={picked.length === 0}
            onClick={() => {
              act((s) => void promote(s, picked));
              setPicked([]);
            }}
          >
            Induct {picked.length}/{max} and promote
          </button>
        </>
      ) : (
        <ul className="blockers">
          {check.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
