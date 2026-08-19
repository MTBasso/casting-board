import { useMemo, useState } from "react";
import { useGame } from "../../engine/store.js";
import {
  canTrade,
  constants,
  displayName,
  trade,
  tradePreview,
  tradeableStock,
  wantedTypes,
  type Creature,
  type TypeId,
} from "../../sim/index.js";
import { useT } from "../i18n.js";
import { creatureName } from "../names.js";
import { Sprite } from "./Sprite.js";
import { TypeBadge } from "./TypeBadge.js";

/**
 * The Trade Desk, as one task in one place.
 *
 * It used to be a fourth dropdown among the box filters that put the whole grid
 * into a selecting mode — discoverable only if you read every filter, and it
 * took over the screen you were using to browse. Trading is a small, complete
 * job with a beginning and an end, which is what a modal is for.
 *
 * Only creatures doing nothing are offered. A Handler's expedition party and
 * anyone left at the Day-Care are excluded by `tradeable`, so there is no way to
 * trade a creature out from under the system holding it.
 */
export function TradeModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);

  // The sim mutates its state in place, so `state` and everything hanging off it
  // keep their identity forever — a memo keyed on them never recomputes. The
  // store bumps `revision` for exactly this reason, and it is the only honest
  // dependency for anything derived from league state.
  const revision = useGame((s) => s.revision);
  const idle = useMemo(
    () => tradeableStock(state).sort((a, b) => b.power - a.power),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision, state],
  );
  const types = wantedTypes(state);

  const [wanted, setWanted] = useState<TypeId | null>(types[0] ?? null);
  const [offered, setOffered] = useState<string[]>([]);
  const [got, setGot] = useState<Creature | null>(null);

  // A trade deletes what it consumed, so drop anything that has stopped
  // existing rather than leaving dead ids selected.
  const live = offered.filter((id) => state.creatures[id] !== undefined);
  const check = wanted ? canTrade(state, wanted, live) : null;
  const preview = wanted ? tradePreview(state, wanted, live) : null;

  const toggle = (id: string) =>
    setOffered((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  const commit = () => {
    if (!wanted) return;
    act((s) => {
      const result = trade(s, wanted, live);
      if (result.ok) setGot(s.creatures[result.creatureId] ?? null);
    });
    setOffered([]);
  };

  return (
    <div className="offer trade-modal" role="dialog" aria-modal="true">
      <div className="offer-body">
        <div className="offer-top">
          <p className="offer-eyebrow">{t("trade.title")}</p>
          <button type="button" className="btn sm ghost" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        {idle.length === 0 ? (
          <p className="empty">{t("trade.nothingIdle")}</p>
        ) : types.length === 0 ? (
          <p className="empty">{t("trade.noGyms")}</p>
        ) : (
          <>
            <p className="offer-sub">{t("trade.explain", { pct: constants.TRADE.band * 100 })}</p>

            <div className="trade-step">
              <span className="trade-step-label">{t("trade.giveUp")}</span>
              <ul className="trade-pool">
                {idle.slice(0, 60).map((c) => {
                  const on = offered.includes(c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={`trade-pick ${on ? "is-on" : ""}`}
                        onClick={() => toggle(c.id)}
                        title={`${displayName(c)} · ${t("pc.power")} ${c.power}`}
                      >
                        <Sprite speciesId={c.speciesId} kind="icon" size={32} />
                        <span className="trade-pick-name">{creatureName(c)}</span>
                        <span className="dim">
                          Lv{c.level} · {c.power}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="trade-step">
              <span className="trade-step-label">{t("trade.aimFor")}</span>
              <div className="trade-types">
                {types.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`trade-type ${wanted === type ? "is-on" : ""}`}
                    onClick={() => setWanted(type)}
                  >
                    <TypeBadge type={type} size="sm" />
                  </button>
                ))}
              </div>
            </div>

            <div className="trade-verdict">
              {live.length === 0 || !preview ? (
                <p className="dim">{t("trade.pickSome", { n: constants.TRADE.minOffered })}</p>
              ) : (
                <p>
                  {t("trade.range", {
                    low: Math.round(preview.low),
                    high: Math.round(preview.high),
                  })}
                  {preview.example && ` ${t("trade.like", { name: preview.example })}`}
                </p>
              )}
            </div>

            {got && (
              <p className="trade-got">
                <Sprite speciesId={got.speciesId} kind="icon" size={34} />
                {t("trade.received", { name: creatureName(got), n: got.power })}
              </p>
            )}

            <div className="outfit-foot">
              <span className="dim">{t("trade.fee", { n: constants.TRADE.fee })}</span>
              <button
                type="button"
                className="btn"
                disabled={!check?.ok}
                title={check && !check.ok ? check.reason : undefined}
                onClick={commit}
              >
                {t("pc.trade", { n: live.length, fee: constants.TRADE.fee })}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
