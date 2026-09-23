import { useEffect } from "react";
import { DraftScreen } from "./DraftScreen.js";
import { AnteScreen } from "./AnteScreen.js";
import { TradeScreen } from "./TradeScreen.js";
import { EggScreen } from "./EggScreen.js";
import { EvolveScreen } from "./EvolveScreen.js";
import { ShopScreen } from "./ShopScreen.js";
import { ReprieveScreen } from "./ReprieveScreen.js";
import { EndScreen } from "./EndScreen.js";
import { useSeason } from "./store.js";
import "./season.css";

/**
 * The redesign's own entry point — REDESIGN.md's roguelike season, played
 * turn-by-turn with real coach calls, sitting next to the old league-manager
 * App (src/ui/App.tsx) rather than replacing it yet. Mounted behind
 * `#season` in main.tsx until enough slices land to make the switch.
 */
export function SeasonApp() {
  const status = useSeason((s) => s.run.status);
  const offer = useSeason((s) => s.offer);
  const growthPhase = useSeason((s) => s.growthPhase);
  const reprieve = useSeason((s) => s.reprieve);
  const newRun = useSeason((s) => s.newRun);

  useEffect(() => {
    if (status === "draft" && offer.length === 0) newRun();
    // Only fires once, on mount, for a genuinely fresh store — offer.length
    // changes every draft pick and must not retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A reprieve notice pre-empts whatever run.status says — the retried
  // battle is already built and waiting in `reprieve`, held back until the
  // player acknowledges what just saved the season.
  if (reprieve) return <ReprieveScreen />;

  switch (status) {
    case "draft":
      return <DraftScreen />;
    case "active":
      return <AnteScreen />;
    case "shopping":
      if (growthPhase === "trade") return <TradeScreen />;
      if (growthPhase === "egg") return <EggScreen />;
      if (growthPhase === "evolve") return <EvolveScreen />;
      return <ShopScreen />;
    case "won":
    case "lost":
      return <EndScreen />;
    default:
      return null;
  }
}
