import { useState } from "react";
import { useGame } from "../../engine/store.js";
import { useT } from "../i18n.js";

const SEEN_KEY = "castingboard.introSeen";

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Forget the introduction, so a wiped save is a genuinely fresh start. */
export function forgetIntro(): void {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    // A browser refusing storage will simply show the introduction again.
  }
}

/**
 * The first thing a stranger sees.
 *
 * Everything else in this game explains itself by happening — the objective
 * spine introduces one system at a time, the Desk says what needs deciding.
 * None of that helps with the one thing a Pokémon player will get wrong by
 * default, which is assuming they are the trainer.
 *
 * So: three beats, in the order the misunderstanding has to be dismantled. You
 * are not a challenger, you are the league. You never fight. What you do
 * instead is pick people and pair them with creatures, and watch how that goes.
 *
 * It shows once, before the founding choice, and never gates anything after.
 */
export function Welcome() {
  const t = useT();
  const state = useGame((s) => s.state);
  const [dismissed, setDismissed] = useState(alreadySeen);

  // Only at the founding of a first league. A returning player promoting into
  // the next tier has met the premise already.
  const founding = state.gymOrder.length === 0 && state.meta.season === 1;
  if (dismissed || !founding) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Not worth failing over; they will see it once more next time.
    }
    setDismissed(true);
  };

  return (
    <div className="offer welcome">
      <div className="offer-body">
        <p className="offer-eyebrow">{t("welcome.eyebrow")}</p>
        <h2>{t("welcome.title")}</h2>

        <ol className="welcome-beats">
          <li>
            <b>{t("welcome.beat1")}</b>
            <span>{t("welcome.beat1detail")}</span>
          </li>
          <li>
            <b>{t("welcome.beat2")}</b>
            <span>{t("welcome.beat2detail")}</span>
          </li>
          <li>
            <b>{t("welcome.beat3")}</b>
            <span>{t("welcome.beat3detail")}</span>
          </li>
        </ol>

        <p className="welcome-idle">{t("welcome.idle")}</p>

        <button type="button" className="btn primary welcome-go" onClick={dismiss}>
          {t("welcome.begin")}
        </button>
      </div>
    </div>
  );
}
