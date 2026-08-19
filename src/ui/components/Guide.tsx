import { useGame } from "../../engine/store.js";
import { objectives, type ObjectiveTarget } from "../../sim/index.js";
import { useT, type Key } from "../i18n.js";
import type { TabId } from "./Tabs.js";

/** Where each objective is done. The sim names a screen; this maps it to a tab. */
export const OBJECTIVE_TAB: Record<ObjectiveTarget, TabId> = {
  gyms: "gyms",
  pc: "pc",
  field: "field",
  elite: "staff",
  hall: "hall",
  daycare: "daycare",
  facilities: "facilities",
};

/**
 * The spine, as an instruction rather than a list.
 *
 * The eleven authored objectives already introduce the systems in the right
 * order — they were just sitting on the Desk being a list, which is a thing you
 * read rather than a thing you do. This says one step at a time.
 *
 * It pairs with the tab glow, and the division of labour is the point: the
 * strip says *what*, the glow says *where*. The commonest way a new player
 * stalls here is not knowing which of eight tabs an instruction refers to, and
 * no amount of sentence can fix that.
 *
 * Both stop the moment the spine is finished. A permanent quest bar would
 * compete with the Desk exactly when the player is learning to read it.
 */
export function guidedStep(state: ReturnType<typeof useGame.getState>["state"]) {
  // Repeatables have no `after`, so they are always present; the spine is the
  // part that runs out, and running out is how the guide knows to stop.
  const spine = objectives(state).filter((o) => !o.id.match(/-\d+$/));
  if (spine.length === 0) return null;
  // A finished step waiting to be claimed is the instruction — collect it.
  return spine.find((o) => o.done) ?? spine[0] ?? null;
}

export function Guide({ onGo }: { onGo: (tab: TabId) => void }) {
  const t = useT();
  const state = useGame((s) => s.state);
  const step = guidedStep(state);
  if (!step) return null;

  const tab = OBJECTIVE_TAB[step.where];

  return (
    <div className={`guide ${step.done ? "is-ready" : ""}`}>
      <span className="guide-eyebrow">
        {step.done ? t("guide.ready") : t("guide.next")}
      </span>
      <span className="guide-what">
        <b>{t(step.title as Key, step.titleParams)}</b>
        <span className="guide-detail">{t(step.detail as Key)}</span>
      </span>
      {!step.done && step.goal > 1 && (
        <span className="guide-count">
          {step.have}/{step.goal}
        </span>
      )}
      <button type="button" className="btn sm" onClick={() => onGo(step.done ? "desk" : tab)}>
        {step.done ? t("guide.collect") : t("guide.take")}
      </button>
    </div>
  );
}
