import { useEffect } from "react";
import { DraftScreen } from "./DraftScreen.js";
import { AnteScreen } from "./AnteScreen.js";
import { TradeScreen } from "./TradeScreen.js";
import { EggScreen } from "./EggScreen.js";
import { EvolveScreen } from "./EvolveScreen.js";
import { ShopScreen } from "./ShopScreen.js";
import { ReprieveScreen } from "./ReprieveScreen.js";
import { EndScreen } from "./EndScreen.js";
import { PokedexScreen } from "./PokedexScreen.js";
import { loadCareer } from "../../persist/seasonSave.js";
import { useSeason } from "./store.js";
import "./season.css";

/**
 * The app's entry point — REDESIGN.md's roguelike season, played turn-by-turn
 * with real coach calls. The old off-screen league-manager game this replaced
 * is gone; this is the whole game now.
 */
export function SeasonApp() {
  const status = useSeason((s) => s.run.status);
  const growthPhase = useSeason((s) => s.growthPhase);
  const reprieve = useSeason((s) => s.reprieve);
  const viewingDex = useSeason((s) => s.viewingDex);

  useEffect(() => {
    // Career (Mentors, Pokédex) has to load from disk before the first
    // draft offer is drawn, since the offer is Mentor-weighted — starting
    // the season on a synchronous, empty Career would silently un-weight
    // every player's very first draft of a session.
    let cancelled = false;
    loadCareer().then((career) => {
      if (cancelled) return;
      useSeason.setState({ career });
      const state = useSeason.getState();
      if (state.run.status === "draft" && state.offer.length === 0) state.newRun();
    });
    return () => {
      cancelled = true;
    };
    // Only fires once, on mount, for a genuinely fresh store — offer.length
    // changes every draft pick and must not retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A reprieve notice pre-empts whatever run.status says — the retried
  // battle is already built and waiting in `reprieve`, held back until the
  // player acknowledges what just saved the season.
  if (reprieve) return <ReprieveScreen />;
  if (viewingDex) return <PokedexScreen />;

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
