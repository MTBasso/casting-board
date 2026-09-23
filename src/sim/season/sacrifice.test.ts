import { describe, it, expect } from "vitest";
import { hasExtraLifeAvailable, consumeExtraLife, isSacrifice, SACRIFICE_SLUGS } from "./sacrifice.js";
import { createRun } from "./engine.js";
import type { FighterState } from "./battle.js";
import type { RunState } from "./types.js";

function fighter(overrides: Partial<FighterState> = {}): FighterState {
  return {
    slug: "rattata",
    name: "Rattata",
    types: ["normal"],
    power: 50,
    maxHp: 100,
    hp: 100,
    fatigue: 0,
    ...overrides,
  };
}

function runWith(overrides: Partial<RunState>): RunState {
  return { ...createRun(1), ...overrides };
}

describe("Sacrifice archetype and extra-life mitigation", () => {
  it("recognizes the curated Sacrifice slugs and nothing else", () => {
    expect(isSacrifice(fighter({ slug: SACRIFICE_SLUGS[0]! }))).toBe(true);
    expect(isSacrifice(fighter({ slug: "not-a-sacrifice-mon" }))).toBe(false);
  });

  it("no extra life is available with a plain party and no Doctrine", () => {
    const run = runWith({ party: [fighter(), fighter({ slug: "pikachu" })] });
    expect(hasExtraLifeAvailable(run)).toBe(false);
  });

  it("a living Sacrifice party member (with a partymate alive too) grants an extra life", () => {
    const run = runWith({
      party: [fighter(), fighter({ slug: SACRIFICE_SLUGS[0]! })],
    });
    expect(hasExtraLifeAvailable(run)).toBe(true);
  });

  it("a fainted Sacrifice party member does not grant an extra life", () => {
    const run = runWith({
      party: [fighter(), fighter({ slug: SACRIFICE_SLUGS[0]!, hp: 0 })],
    });
    expect(hasExtraLifeAvailable(run)).toBe(false);
  });

  it("a Sacrifice mon that is the party's only living member does not grant an extra life", () => {
    // Releasing it would leave nothing to take the reprieve with.
    const run = runWith({
      party: [fighter({ hp: 0 }), fighter({ slug: SACRIFICE_SLUGS[0]! })],
    });
    expect(hasExtraLifeAvailable(run)).toBe(false);
  });

  it("owning the Phoenix Clause Doctrine grants an extra life with no Sacrifice mon needed", () => {
    const run = runWith({ party: [fighter()], doctrines: ["phoenix_clause"] });
    expect(hasExtraLifeAvailable(run)).toBe(true);
  });

  it("consumeExtraLife releases the Sacrifice mon permanently and marks the life used", () => {
    const sac = fighter({ slug: SACRIFICE_SLUGS[0]!, name: "Sac" });
    const other = fighter({ slug: "pikachu", name: "Other" });
    const run = runWith({ party: [other, sac] });
    const next = consumeExtraLife(run);
    expect(next.extraLifeUsed).toBe(true);
    expect(next.party.map((f) => f.name)).toEqual(["Other"]);
  });

  it("consumeExtraLife via the Doctrine leaves the party untouched", () => {
    const run = runWith({ party: [fighter()], doctrines: ["phoenix_clause"] });
    const next = consumeExtraLife(run);
    expect(next.extraLifeUsed).toBe(true);
    expect(next.party).toHaveLength(1);
  });

  it("once used, no further source grants another extra life this season", () => {
    const run = runWith({
      party: [fighter(), fighter({ slug: SACRIFICE_SLUGS[0]! })],
      doctrines: ["phoenix_clause"],
      extraLifeUsed: true,
    });
    expect(hasExtraLifeAvailable(run)).toBe(false);
  });
});
