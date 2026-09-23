import { useSeason } from "./store.js";

/** The moment REDESIGN.md's "Extra-life archetype" and "Shop-bought extra lives" earn — a fatal Ante loss undone once per season, shown before the retried battle opens. */
export function ReprieveScreen() {
  const reprieve = useSeason((s) => s.reprieve);
  const continueAfterReprieve = useSeason((s) => s.continueAfterReprieve);

  if (!reprieve) return null;

  return (
    <div className="season-root">
      <div className="sn-end">
        <div className="sn-end-title sn-display" style={{ color: "var(--sn-gold)" }}>
          One More Chance
        </div>
        <p style={{ color: "var(--sn-text-dim)", maxWidth: 420 }}>
          {reprieve.releasedName
            ? `${reprieve.releasedName} triggers its Sacrifice and is released, buying the season one more life.`
            : "Phoenix Clause fires — the season survives, this once."}
        </p>
        <p style={{ color: "var(--sn-text-dim)", fontSize: 12 }}>
          The party rests. This extra life won't fire again this season.
        </p>
        <button className="sn-btn is-primary" onClick={continueAfterReprieve}>
          Retry the Ante →
        </button>
      </div>
    </div>
  );
}
