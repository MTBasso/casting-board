import { useMemo, useState } from "react";
import { useGame } from "../../engine/store.js";
import { useT } from "../i18n.js";
import { Sprite } from "./Sprite.js";
import {
  bench,
  partyOf,
  tradeableStock,
  togglePin,
  TYPES,
  unbench,
  type Creature,
  type TypeId,
} from "../../sim/index.js";
import { creatureName } from "../names.js";
import { TypeBadges } from "./TypeBadge.js";
import { TradeBar } from "./TradeDesk.js";
import { Rosters } from "./Rosters.js";
import { CreatureSummary } from "./CreatureSummary.js";

const PER_BOX = 30;

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
  const [tradeFor, setTradeFor] = useState<TypeId | null>(null);
  const [offered, setOffered] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const mine = useMemo(
    () => Object.values(state.creatures).filter((c) => c.owned && c.role !== "retired"),
    [state.creatures],
  );

  // In trade mode the grid narrows to what the desk will actually accept, so
  // there is one box on this screen rather than two — picking what to give up
  // is the same browsing task as looking through the box, with the same
  // filters and the same sort.
  const tradable = useMemo(
    () => new Set(tradeableStock(state).map((c) => c.id)),
    [state.creatures, state.trainers],
  );

  const shown = useMemo(() => {
    const filtered = mine.filter((c) => {
      if (typeFilter !== "all" && !c.types.includes(typeFilter)) return false;
      if (tradeFor) return tradable.has(c.id);
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
  }, [mine, typeFilter, scope, sort, tradeFor, tradable]);

  const boxes = Math.max(1, Math.ceil(shown.length / PER_BOX));
  const page = Math.min(box, boxes - 1);
  const slice = shown.slice(page * PER_BOX, page * PER_BOX + PER_BOX);

  const gymTypes = [
    ...new Set(state.gymOrder.map((id) => state.gyms[id]?.type).filter(Boolean)),
  ] as TypeId[];

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

        <label className="field">
          <span>{t("pc.tradeFor")}</span>
          <select
            value={tradeFor ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setTradeFor(v === "" ? null : (v as TypeId));
              setOffered([]);
              setBox(0);
            }}
          >
            <option value="">{t("pc.notTrading")}</option>
            {gymTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

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

      {scope === "rosters" && !tradeFor ? (
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
            <p className="empty">
              {tradeFor
                ? t("pc.nothingTradeable")
                : t("common.nothing")}
            </p>
          ) : (
            <ul className={`box-grid ${tradeFor ? "is-trading" : ""}`}>
              {slice.map((c) => (
                <BoxCell
                  key={c.id}
                  creature={c}
                  trading={tradeFor !== null}
                  selected={offered.includes(c.id)}
                  onOpen={() =>
                    tradeFor
                      ? setOffered((prev) =>
                          prev.includes(c.id)
                            ? prev.filter((x) => x !== c.id)
                            : [...prev, c.id],
                        )
                      : setOpen(c.id)
                  }
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

      {tradeFor && (
        <TradeBar
          wanted={tradeFor}
          offered={offered.filter((id) => state.creatures[id] !== undefined)}
          onClear={() => setOffered([])}
          onDone={() => {
            setOffered([]);
            setTradeFor(null);
          }}
        />
      )}
    </div>
  );
}

function nameOf(c: Creature): string {
  return creatureName(c);
}

function BoxCell({
  creature,
  trading,
  selected,
  onOpen,
  onPin,
  onBench,
}: {
  creature: Creature;
  /** While trading, a cell selects rather than opens. */
  trading: boolean;
  selected: boolean;
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
    <li
      className={`box-cell ${creature.pinned ? "is-pinned" : ""} ${
        selected ? "is-offered" : ""
      }`}
    >
      <button
        type="button"
        className="box-open"
        onClick={onOpen}
        title={t(trading ? "pc.offerThis" : "creature.openSummary")}
      >
        {trading && <span className="offer-tick">{selected ? "✓" : ""}</span>}
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
