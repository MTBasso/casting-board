import { useGame } from "../../engine/store.js";
import { useT } from "../i18n.js";
import { Sprite } from "./Sprite.js";
import {
  canTrade,
  constants,
  trade,
  tradePreview,
  type TypeId,
} from "../../sim/index.js";
import { creatureName } from "../names.js";

/**
 * The Trade Desk, as a bar over the PC rather than a screen of its own.
 *
 * It used to render a second full grid, with its own filters and its own sort,
 * directly under the box grid — the same creatures, listed twice, on one screen.
 * Choosing what to give up is the same browsing task as looking through the box,
 * so it now happens *in* the box: pick a type to trade for, the grid narrows to
 * what the desk will take, and cells select instead of opening.
 *
 * What is left is the part the grid could not show: what you are offering, what
 * it is worth, and the button.
 */
export function TradeBar({
  wanted,
  offered,
  onClear,
  onDone,
}: {
  wanted: TypeId;
  offered: readonly string[];
  onClear: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);

  const live = [...offered];
  const check = canTrade(state, wanted, live);
  const preview = tradePreview(state, wanted, live);

  return (
    <div className="trade-bar">
      <div className="trade-offer">
        <span className="trade-label">{t("pc.offering", { type: wanted })}</span>
        {live.length === 0 ? (
          <p className="hint">
{t("pc.tradeHint")}
          </p>
        ) : (
          <>
            <ul className="trade-picks">
              {live.map((id) => {
                const c = state.creatures[id];
                if (!c) return null;
                return (
                  <li key={id} title={`${creatureName(c)} Lv${c.level} · ${c.power}`}>
                    <Sprite speciesId={c.speciesId} kind="icon" size={34} />
                  </li>
                );
              })}
            </ul>
            <p className="absorbed">
{t("pc.tradeAim", { n: Math.round(preview.target) })}
              {preview.example && t("pc.tradeAimExample", { name: preview.example })}.
            </p>
          </>
        )}
      </div>

      <div className="trade-actions">
        {live.length > 0 && (
          <button type="button" className="btn sm ghost" onClick={onClear}>
            {t("pc.clear", { n: live.length })}
          </button>
        )}
        <button
          type="button"
          className="btn"
          disabled={!check.ok}
          title={check.ok ? undefined : check.reason}
          onClick={() => {
            act((s) => void trade(s, wanted, live));
            onDone();
          }}
        >
          {t("pc.trade", { n: live.length > 0 ? live.length : "", fee: constants.TRADE.fee })}
        </button>
      </div>
    </div>
  );
}
