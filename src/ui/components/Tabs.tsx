export type TabId = "gyms" | "pc" | "field" | "staff" | "hall" | "daycare" | "facilities";

export const TABS: { id: TabId; label: string }[] = [
  { id: "gyms", label: "Gyms" },
  { id: "pc", label: "PC Box" },
  { id: "field", label: "Field" },
  { id: "staff", label: "Elite" },
  { id: "hall", label: "Hall" },
  { id: "daycare", label: "Day-Care" },
  { id: "facilities", label: "Facilities" },
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
}: {
  active: TabId;
  onChange: (id: TabId) => void;
  badges?: Partial<Record<TabId, string>>;
}) {
  return (
    <nav className="tabs" aria-label="Sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tab ${active === tab.id ? "is-active" : ""}`}
          onClick={() => onChange(tab.id)}
          aria-current={active === tab.id ? "page" : undefined}
        >
          {tab.label}
          {badges?.[tab.id] && <span className="tab-badge">{badges[tab.id]}</span>}
        </button>
      ))}
    </nav>
  );
}
