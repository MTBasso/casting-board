import { useGame } from "../../engine/store.js";
import { useT } from "../i18n.js";
import {
  allFacilities,
  canUpgrade,
  facilityLevel,
  upgrade,
  upgradeCost,
} from "../../sim/index.js";

/**
 * The support tier.
 *
 * Facilities hold no creatures — they change what the front line can do, and
 * they are the first investment in the game that multiplies rather than adds.
 * Together with the board growing, this is the progression the mid-game runs on.
 */
export function Facilities() {
  const t = useT();
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);

  return (
    <div className="facilities">
      <h2 className="col-title">{t("facilities.title")}</h2>
      <ul className="facility-list">
        {allFacilities().map((def) => {
          const lvl = facilityLevel(state, def.id);
          const check = canUpgrade(state, def.id);
          // Always show the price. "—" tells the player nothing about what they
          // are saving towards, which is the only reason to look at this panel
          // when they cannot yet afford anything on it.
          const cost = upgradeCost(state, def.id);
          const maxed = lvl >= def.maxLevel;

          return (
            <li key={def.id} className={`facility ${lvl > 0 ? "is-built" : ""}`}>
              <div className="facility-head">
                <span className="facility-name">
                  {def.name}
                  <span className="facility-level">
                    {maxed ? "max" : `lv ${lvl}/${def.maxLevel}`}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn sm"
                  disabled={!check.ok}
                  title={check.ok ? undefined : check.reason}
                  onClick={() => act((s) => void upgrade(s, def.id))}
                >
                  {maxed
                    ? "Complete"
                    : `${lvl === 0 ? "Build" : "Upgrade"} · ${cost?.toLocaleString() ?? ""}`}
                </button>
              </div>
              <p className="facility-blurb">{def.blurb}</p>
              {lvl > 0 && <p className="facility-effect">{def.effect(lvl)}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
