import { useMemo, useState } from "react";
import { useGame } from "../../engine/store.js";
import { useT } from "../i18n.js";
import { Sprite } from "./Sprite.js";
import {
  bench,
  partyOf,
  togglePin,
  TYPES,
  unbench,
  type Creature,
  type TypeId,
} from "../../sim/index.js";
import { creatureName } from "../names.js";
import { TypeBadges } from "./TypeBadge.js";
import { TradeModal } from "./TradeModal.js";
import { Rosters } from "./Rosters.js";
import { CreatureSummary } from "./CreatureSummary.js";

/** Seven across, five down. The grid is laid out to match. */
const PER_BOX = 35;

type SortKey = "power" | "level" | "name" | "type";

/**
 * The PC.
 *
 * Everything the player owns, thirty to a box, exactly as the source does it.
 * The box is inert by design — parties fill themselves — but inert should never
 * mean invisible, and until now there was no screen that simply showed you your
 * creatures.
 *
 * Junior Gym Trainers' creatures are not here. They were never yours.
 */
export function PcBox() {
  const t = useT();
  const state = useGame((s) => s.state);
  const act = useGame((s) => s.act);

  const [box, setBox] = useState(0);
  const [sort, setSort] = useState<SortKey>("power");
  const [typeFilter, setTypeFilter] = useState<TypeId | "all">("all");
  const [scope, setScope] = useState<"all" | "box" | "parties" | "rosters">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [trading, setTrading] = useState(false);

  // The sim mutates its state in place, so `state` and everything hanging off it
  // keep their identity forever — a memo keyed on them never recomputes. The
  // store bumps `revision` for exactly this reason, and it is the only honest
  // dependency for anything derived from league state.
  const revision = useGame((s) => s.revision);
  const mine = useMemo(
    () => Object.values(state.creatures).filter((c) => c.owned && c.role !== "retired"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision, state],
  );

  // In trade mode the grid narrows to what the desk will actually accept, so
  // there is one box on this screen rather than two — picking what to give up
  // is the same browsing task as looking through the box, with the same
  // filters and the same sort.
  const shown = useMemo(() => {
    const filtered = mine.filter((c) => {
      if (typeFilter !== "all" && !c.types.includes(typeFilter)) return false;
      if (scope === "box" && c.role !== "reserve") return false;
      if (scope === "parties" && c.role !== "party") return false;
      return true;
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "power") return b.power - a.power;
      if (sort === "level") return b.level - a.level;
      if (sort === "type") return (a.types[0] ?? "").localeCompare(b.types[0] ?? "");
      return nameOf(a).localeCompare(nameOf(b));
    });
    return sorted;
  }, [mine, typeFilter, scope, sort]);

  const boxes = Math.max(1, Math.ceil(shown.length / PER_BOX));
  const page = Math.min(box, boxes - 1);
  const slice = shown.slice(page * PER_BOX, page * PER_BOX + PER_BOX);

  return (
    <div className="pc">
      <h2 className="col-title">
        {t("pc.title")}
        <span className="counter">{t("pc.creatures", { n: mine.length })}</span>
      </h2>

      <div className="toolbar">
        <label className="field">
          <span>{t("common.show")}</span>
          <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="all">{t("pc.everything")}</option>
            <option value="box">{t("pc.inBox")}</option>
            <option value="parties">{t("pc.inParties")}</option>
            <option value="rosters">{t("pc.byTrainer")}</option>
          </select>
        </label>

        <label className="field">
          <span>{t("common.type")}</span>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as TypeId | "all");
              setBox(0);
            }}
          >
            <option value="all">{t("common.all")}</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="btn sm trade-open" onClick={() => setTrading(true)}>
          {t("trade.open")}
        </button>

        <label className="field">
          <span>{t("common.sort")}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="power">{t("pc.power")}</option>
            <option value="level">{t("common.level")}</option>
            <option value="name">{t("pc.name")}</option>
            <option value="type">{t("common.type")}</option>
          </select>
        </label>
      </div>

      {scope === "rosters" ? (
        <Rosters />
      ) : (
        <>
          <div className="box-nav">
            <button
              type="button"
              className="btn sm ghost"
              disabled={page === 0}
              onClick={() => setBox(page - 1)}
            >
              ←
            </button>
            <span className="box-label">
              {t("pc.box", { n: page + 1, total: boxes })}
            </span>
            <button
              type="button"
              className="btn sm ghost"
              disabled={page >= boxes - 1}
              onClick={() => setBox(page + 1)}
            >
              →
            </button>
          </div>

          {slice.length === 0 ? (
            <p className="empty">{t("common.nothing")}</p>
          ) : (
            <ul className="box-grid">
              {slice.map((c) => (
                <BoxCell
                  key={c.id}
                  creature={c}
                  onOpen={() => setOpen(c.id)}
                  onPin={() => act((s) => togglePin(s, c.id))}
                  onBench={() =>
                    act((s) => (c.benched ? unbench(s, c.id) : bench(s, c.id)))
                  }
                />
              ))}
            </ul>
          )}
        </>
      )}

      {open && state.creatures[open] && (
        <CreatureSummary
          creature={state.creatures[open]!}
          onClose={() => setOpen(null)}
        />
      )}

      {trading && <TradeModal onClose={() => setTrading(false)} />}
    </div>
  );
}

function nameOf(c: Creature): string {
  return creatureName(c);
}

function BoxCell({
  creature,
  onOpen,
  onPin,
  onBench,
}: {
  creature: Creature;
  onOpen: () => void;
  onPin: () => void;
  onBench: () => void;
}) {
  const t = useT();
  const state = useGame((s) => s.state);
  const trainer = creature.trainerId ? state.trainers[creature.trainerId] : undefined;
  const where =
    creature.role === "party"
      ? (trainer?.name ?? "in a party")
      : creature.benched
        ? "set aside"
        : "in the box";

  return (
    <li className={`box-cell ${creature.pinned ? "is-pinned" : ""}`}>
      <button
        type="button"
        className="box-open"
        onClick={onOpen}
        title={t("creature.openSummary")}
      >
        <Sprite speciesId={creature.speciesId} size={56} />
        <span className="box-name">{nameOf(creature)}</span>
        <span className="box-meta">Lv{creature.level} · {creature.power}</span>
        <TypeBadges types={creature.types} size="sm" />
        <span className="box-where">{where}</span>
      </button>
      <span className="box-actions">
        <button
          type="button"
          className={`pin ${creature.pinned ? "is-on" : ""}`}
          onClick={onPin}
          title={t(creature.pinned ? "pc.pinned" : "pc.pin")}
        >
          {creature.pinned ? "★" : "☆"}
        </button>
        {creature.role !== "party" && (
          <button type="button" className="btn sm ghost" onClick={onBench}>
            {creature.benched ? "Allow" : "Set aside"}
          </button>
        )}
      </span>
    </li>
  );
}

export { partyOf };
