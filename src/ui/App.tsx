import { useState } from "react";
import { useGame } from "../engine/store.js";
import { rangers, doctrineUnlocked, handlers, nextRival, postingFor } from "../sim/index.js";
import { LeagueMap } from "./components/LeagueMap.js";
import { GymPanel } from "./components/GymPanel.js";
import { EventLog } from "./components/EventLog.js";
import { GymOffer } from "./components/GymOffer.js";
import { LeaderOffer } from "./components/LeaderOffer.js";
import { DevBar } from "./components/DevBar.js";
import { FieldWork } from "./components/FieldWork.js";
import { ReplayDriver } from "./components/BattleFeed.js";
import { Facilities } from "./components/Facilities.js";
import { EliteFour } from "./components/EliteFour.js";
import { DayCare } from "./components/DayCare.js";
import { RivalWatch } from "./components/RivalWatch.js";
import { Tabs, type TabId } from "./components/Tabs.js";
import { PcBox } from "./components/PcBox.js";

export function App() {
  // Subscribing to `revision` is what re-renders the tree; the sim mutates its
  // state in place, so nothing else here would ever change identity.
  const revision = useGame((s) => s.revision);
  const state = useGame((s) => s.state);

  const [tab, setTab] = useState<TabId>("gyms");
  const [selected, setSelected] = useState<string | null>(null);
  const activeGymId = selected ?? state.gymOrder[0] ?? null;

  const inParty = Object.values(state.creatures).filter((c) => c.role === "party").length;
  const owned = Object.values(state.creatures).filter((c) => c.role !== "retired").length;

  const rival = nextRival(state);
  const badges: Partial<Record<TabId, string>> = {};
  if (rival) badges.gyms = "!";
  // Field staff off a route are money going out with nothing coming back.
  const unposted = [...rangers(state), ...handlers(state)].filter(
    (t) => !postingFor(state, t.id),
  ).length;
  if (unposted > 0) badges.field = String(unposted);
  if (doctrineUnlocked(state) && state.elite.some((s) => s.trainerId === null)) {
    badges.staff = "!";
  }

  return (
    <div className="app" data-revision={revision}>
      <ReplayDriver />
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◈</span>
          <span>The Casting Board</span>
        </div>
        <dl className="stats">
          <div>
            <dt>Pokéyen</dt>
            <dd>&#8367;{Math.round(state.money).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Renown</dt>
            <dd>{Math.round(state.renown).toLocaleString()}</dd>
          </div>
          <div>
            <dt>In parties</dt>
            <dd>{inParty}</dd>
          </div>
          <div>
            <dt>Owned</dt>
            <dd>{owned}</dd>
          </div>
          <div>
            <dt>Season</dt>
            <dd>{state.meta.season}</dd>
          </div>
        </dl>
      </header>

      <Tabs active={tab} onChange={setTab} badges={badges} />

      <main className="screen">
        {tab === "gyms" && (
          <div className="league-screen">
            <aside className="league-side">
              <RivalWatch />
              <h2 className="col-title">Gyms</h2>
              <LeagueMap selected={activeGymId} onSelect={setSelected} />
            </aside>
            <section className="league-detail">
              {activeGymId ? (
                <GymPanel gymId={activeGymId} />
              ) : (
                <p className="empty">No gyms yet.</p>
              )}
            </section>
          </div>
        )}

        {tab === "pc" && (
          <div className="single-screen wide">
            <PcBox />
          </div>
        )}

        {tab === "field" && (
          <div className="full-screen">
            <FieldWork />
          </div>
        )}

        {tab === "staff" && (
          <div className="single-screen">
            <EliteFour />
          </div>
        )}

        {tab === "daycare" && (
          <div className="single-screen">
            <DayCare />
          </div>
        )}

        {tab === "facilities" && (
          <div className="single-screen">
            <Facilities />
          </div>
        )}
      </main>

      <EventLog />
      <GymOffer />
      <LeaderOffer />
      <DevBar />
    </div>
  );
}
