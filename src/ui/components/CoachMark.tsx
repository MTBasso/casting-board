import { useEffect, useState } from "react";
import { useT, type Key } from "../i18n.js";
import type { TabId } from "./Tabs.js";

const SEEN_KEY = "castingboard.coached";

function seen(): Set<TabId> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as TabId[]);
  } catch {
    return new Set();
  }
}

function remember(tab: TabId): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen(), tab]));
  } catch {
    // A browser refusing storage simply explains itself again next time.
  }
}

/** Forget every explanation, so a wiped save teaches from scratch. */
export function forgetCoaching(): void {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    // Nothing to do; the marks will simply not reappear.
  }
}

/**
 * What each screen is *for*, said once.
 *
 * The guided step handles the sequence, but a sequence is linear and this game
 * is eight tabs — a player who wanders into the Hall of Fame on their second
 * minute deserves a sentence about it rather than a screen of plaques with no
 * frame. This is the part no ordered list can cover.
 *
 * Every one is replayable from the "?" beside it. That costs almost nothing and
 * removes the small anxiety of dismissing something before you finished reading
 * — which matters more than usual here, where a good share of the audience is
 * reading their second language.
 */
export function CoachMark({ tab }: { tab: TabId }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!seen().has(tab)) setOpen(true);
  }, [tab]);

  const dismiss = () => {
    remember(tab);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        className="coach-replay"
        onClick={() => setOpen(true)}
        title={t("coach.replay")}
        aria-label={t("coach.replay")}
      >
        ?
      </button>
    );
  }

  return (
    <aside className="coach">
      <p className="coach-title">{t(`coach.${tab}.title` as Key)}</p>
      <p className="coach-body">{t(`coach.${tab}.body` as Key)}</p>
      <button type="button" className="btn sm" onClick={dismiss}>
        {t("coach.got")}
      </button>
    </aside>
  );
}
