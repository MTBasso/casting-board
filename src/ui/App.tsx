import { useState } from "react";
import { useGame } from "../engine/store.js";
import { ROUTES, doctrineUnlocked, expeditionOf, pendingDecisions } from "../sim/index.js";
import { LeagueMap } from "./components/LeagueMap.js";
import { GymPanel } from "./components/GymPanel.js";
import { EventLog } from "./components/EventLog.js";
import { GymOffer } from "./components/GymOffer.js";
import { LeaderOffer } from "./components/LeaderOffer.js";
import { DevBar } from "./components/DevBar.js";
import { FieldMap, RouteDetail } from "./components/FieldMap.js";
import { Crews } from "./components/Crews.js";
import { ReplayDriver } from "./components/BattleFeed.js";
import { HallOfFame } from "./components/HallOfFame.js";
import { Desk } from "./components/Desk.js";
import { useLang, useT } from "./i18n.js";
import { Facilities } from "./components/Facilities.js";
import { EliteFour } from "./components/EliteFour.js";
import { DayCare } from "./components/DayCare.js";
import { RivalWatch } from "./components/RivalWatch.js";
import { Tabs, type TabId } from "./components/Tabs.js";
import { PcBox } from "./components/PcBox.js";
import { Welcome } from "./components/Welcome.js";
import { Guide, OBJECTIVE_TAB, guidedStep } from "./components/Guide.js";
import { CoachMark } from "./components/CoachMark.js";

/**
 * The Field: the map on one side, the crews on the other.
 *
 * Staffing and going somewhere are one decision — you hire *because* there is
 * ground you want worked — and the two used to sit on separate lists.
 */
function FieldScreen() {
  const t = useT();
  const state = useGame((s) => s.state);
  const [route, setRoute] = useState<string | null>(null);
  const selected = route ?? state.explored[0] ?? null;

  return (
    <div className="field-screen">
      <section className="map-pane">
        <h2 className="col-title">
          {t("field.map")}
          <span className="counter">
            {t("field.reached", { n: state.explored.length, total: ROUTES.length })}
          </span>
        </h2>
        <FieldMap selected={selected} onSelect={setRoute} />
        {selected && <RouteDetail routeId={selected} />}
      </section>

      <aside className="crew-pane">
        <Crews />
      </aside>
    </div>
  );
}

export function App() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  // Subscribing to `revision` is what re-renders the tree; the sim mutates its
  // state in place, so nothing else here would ever change identity.
  const revision = useGame((s) => s.revision);
  const state = useGame((s) => s.state);

  const [tab, setTab] = useState<TabId>("desk");
  const [selected, setSelected] = useState<string | null>(null);
  const activeGymId = selected ?? state.gymOrder[0] ?? null;

  const inParty = Object.values(state.creatures).filter((c) => c.role === "party").length;
  const owned = Object.values(state.creatures).filter((c) => c.role !== "retired").length;

  const badges: Partial<Record<TabId, string>> = {};
  // The Desk carries the count, so the other tabs stop shouting.
  const open = pendingDecisions(state);
  const urgent = open.filter((d) => d.urgency === "urgent").length;
  if (open.length > 0) badges.desk = urgent > 0 ? String(urgent) : "•";
  // Crews between trips draw wages for nothing.
  const idle = state.crews.filter((c) => !expeditionOf(state, c.id)).length;
  if (idle > 0) badges.field = String(idle);
  if (doctrineUnlocked(state) && state.elite.some((s) => s.trainerId === null)) {
    badges.staff = "!";
  }

  // The tab the guided step is done on, so it can ask to be visited. A finished
  // step points back at the Desk, where it is collected.
  const step = guidedStep(state);
  const pointingAt = step ? (step.done ? "desk" : OBJECTIVE_TAB[step.where]) : null;

  return (
    <div className="app" data-revision={revision}>
      <ReplayDriver />
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◈</span>
          <span>{t("app.title")}</span>
        </div>
        <dl className="stats">
          <div>
            <dt>{t("app.money")}</dt>
            <dd>&#8367;{Math.round(state.money).toLocaleString()}</dd>
          </div>
          <div>
            <dt>{t("app.renown")}</dt>
            <dd>{Math.round(state.renown).toLocaleString()}</dd>
          </div>
          <div>
            <dt>{t("app.inParties")}</dt>
            <dd>{inParty}</dd>
          </div>
          <div>
            <dt>{t("app.owned")}</dt>
            <dd>{owned}</dd>
          </div>
          <div>
            <dt>{t("app.season")}</dt>
            <dd>{state.meta.season}</dd>
          </div>
        </dl>

        {/* A playtester should be able to change this without hunting for it. */}
        <button
          type="button"
          className="lang"
          onClick={() => setLang(lang === "pt" ? "en" : "pt")}
          title={t("app.switchTo")}
        >
          {lang === "pt" ? "EN" : "PT"}
        </button>
      </header>

      {/* The strip says what; the glow says where. Both stop with the spine. */}
      <Tabs active={tab} onChange={setTab} badges={badges} pointingAt={pointingAt} />

      <Guide onGo={setTab} />

      <main className="screen">
        {/* Keyed on the tab so it re-evaluates on every change: one explanation
            per screen, then a "?" in its place. */}
        <CoachMark key={tab} tab={tab} />

        {tab === "desk" && (
          <div className="single-screen">
            <Desk onGo={setTab} />
          </div>
        )}

        {tab === "gyms" && (
          <div className="league-screen">
            <aside className="league-side">
              <RivalWatch />
              <h2 className="col-title">{t("app.gyms")}</h2>
              <LeagueMap selected={activeGymId} onSelect={setSelected} />
            </aside>
            <section className="league-detail">
              {activeGymId ? (
                <GymPanel gymId={activeGymId} />
              ) : (
                <p className="empty">{t("app.noGyms")}</p>
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
            <FieldScreen />
          </div>
        )}

        {tab === "staff" && (
          <div className="single-screen">
            <EliteFour />
          </div>
        )}

        {tab === "hall" && (
          <div className="single-screen wide">
            <HallOfFame />
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
      <Welcome />
      <GymOffer />
      <LeaderOffer />
      <DevBar />
    </div>
  );
}
