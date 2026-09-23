import { describe, it, expect } from "vitest";
import { ROSTER, rarityOf, rosterByRarity } from "./roster.js";

describe("roster rarity tiering", () => {
  it("every roster entry resolves to exactly one rarity", () => {
    for (const s of ROSTER) {
      expect(["common", "rare", "legendary"]).toContain(rarityOf(s));
    }
  });

  it("isLegendary species are always Legendary tier", () => {
    const legendary = ROSTER.filter((s) => s.isLegendary);
    expect(legendary.length).toBeGreaterThan(0);
    for (const s of legendary) expect(rarityOf(s)).toBe("legendary");
  });

  it("rosterByRarity partitions the whole roster with no overlap", () => {
    const common = rosterByRarity("common");
    const rare = rosterByRarity("rare");
    const legendary = rosterByRarity("legendary");
    expect(common.length + rare.length + legendary.length).toBe(ROSTER.length);
    const slugs = new Set([...common, ...rare, ...legendary].map((s) => s.slug));
    expect(slugs.size).toBe(ROSTER.length);
  });

  it("Rare tier reads as stronger on average than Common", () => {
    const avg = (list: readonly { power: number }[]) => list.reduce((a, b) => a + b.power, 0) / list.length;
    expect(avg(rosterByRarity("rare"))).toBeGreaterThan(avg(rosterByRarity("common")));
  });
});
