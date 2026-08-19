import { useState } from "react";
import { useGame } from "../../engine/store.js";
import { useT } from "../i18n.js";
import { Sprite } from "./Sprite.js";
import {
  constants,
  inductable,
  promote,
  readiness,
} from "../../sim/index.js";


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
  const t = useT();
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
          <h2>{forced ? t("promo.lostTitle") : t("promo.title")}</h2>
          <p className="panel-sub">
{forced
              ? t("promo.forcedSub", { name: usurper?.name ?? "" })
              : t("promo.sub", { tier: state.tier })}
          </p>
        </div>
      </header>

      {forced ? (
        <>
          <div className="path-compare">
            <div className="path is-open">
              <h3>{t("promo.goNow")}</h3>
              <p>
{t("promo.goNowDetail", { name: usurper?.name ?? "" })}
              </p>
            </div>
            <div className="path">
              <h3>{t("promo.winBack")}</h3>
              <p>
{t("promo.winBackDetail", { n: max })}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn danger"
            onClick={() => act((s) => void promote(s, []))}
          >
            {t("promo.takeNow")}
          </button>
        </>
      ) : check.ok ? (
        <>
          <p className="hint">
{t("promo.inductHint", { n: max })}
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
                    <span className="induct-name">{c.name}</span>
                    <span className="dim">
                      {c.wins}W · bond {Math.round(c.bond * 100)}%
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
            {t("promo.induct", { n: picked.length, max })}
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
