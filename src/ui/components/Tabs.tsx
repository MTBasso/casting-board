import { useT, type Key } from "../i18n.js";
export type TabId = "desk" | "gyms" | "pc" | "field" | "staff" | "hall" | "daycare" | "facilities";

/** Tab order, with the key each label reads from. */
export const TABS: { id: TabId; key: Key }[] = [
  { id: "desk", key: "tab.desk" },
  { id: "gyms", key: "tab.gyms" },
  { id: "pc", key: "tab.pc" },
  { id: "field", key: "tab.field" },
  { id: "staff", key: "tab.elite" },
  { id: "hall", key: "tab.hall" },
  { id: "daycare", key: "tab.daycare" },
  { id: "facilities", key: "tab.facilities" },
];

/**
 * Top-level navigation.
 *
 * Everything used to share one screen, which left no room for any of it to be
 * done properly — and on a phone it meant scrolling past the whole league to
 * reach the gym you had just tapped. One screen per job.
 */
export function Tabs({
  active,
  onChange,
  badges,
  pointingAt,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
  badges?: Partial<Record<TabId, string>>;
  /** The tab the guided step wants, while onboarding is still running. */
  pointingAt?: TabId | null;
}) {
  const t = useT();
  return (
    <nav className="tabs" aria-label={t("a11y.sections")}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tab ${active === tab.id ? "is-active" : ""} ${
            pointingAt === tab.id && active !== tab.id ? "is-pointed" : ""
          }`}
          onClick={() => onChange(tab.id)}
          aria-current={active === tab.id ? "page" : undefined}
        >
          {t(tab.key)}
          {badges?.[tab.id] && <span className="tab-badge">{badges[tab.id]}</span>}
        </button>
      ))}
    </nav>
  );
}
