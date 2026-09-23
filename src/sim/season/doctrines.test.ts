import { describe, it, expect } from "vitest";
import {
  DOCTRINES,
  offerDoctrines,
  pickDoctrine,
  restParty,
  greedyRarityPolicy,
  SHOP_OFFER_SIZE,
} from "./doctrines.js";
import { createRun } from "./engine.js";
import type { FighterState } from "./battle.js";
import type { RunState } from "./types.js";

function fighter(overrides: Partial<FighterState> = {}): FighterState {
  return {
    slug: "test",
    name: "Test",
    types: ["normal"],
    power: 50,
    maxHp: 100,
    hp: 60,
    fatigue: 0.5,
    ...overrides,
  };
}

function runWithParty(party: FighterState[]): RunState {
  return { ...createRun(1), party };
}

describe("between-Ante shop", () => {
  it("offers up to SHOP_OFFER_SIZE distinct, not-yet-owned Doctrines", () => {
    const run = { ...runWithParty([fighter()]), doctrines: [DOCTRINES[0]!.id] };
    const offer = offerDoctrines(run);
    expect(offer.length).toBeLessThanOrEqual(SHOP_OFFER_SIZE);
    expect(new Set(offer.map((d) => d.id)).size).toBe(offer.length);
    expect(offer.map((d) => d.id)).not.toContain(DOCTRINES[0]!.id);
  });

  it("stops offering once every Doctrine is owned", () => {
    const run = { ...runWithParty([fighter()]), doctrines: DOCTRINES.map((d) => d.id) };
    expect(offerDoctrines(run)).toHaveLength(0);
  });

  it("pickDoctrine rejects a Doctrine that wasn't actually offered", () => {
    const run = runWithParty([fighter()]);
    const offer = offerDoctrines(run);
    const notOffered = DOCTRINES.find((d) => !offer.some((o) => o.id === d.id));
    if (!notOffered) throw new Error("fixture assumption broken: expected at least one Doctrine left out of the offer");
    expect(() => pickDoctrine(run, offer, notOffered)).toThrow();
  });

  it("pickDoctrine marks the Doctrine owned and applies its effect", () => {
    const run = runWithParty([fighter({ power: 100 })]);
    const ironResolve = DOCTRINES.find((d) => d.id === "iron_resolve")!;
    const next = pickDoctrine(run, [ironResolve], ironResolve);
    expect(next.doctrines).toContain("iron_resolve");
    expect(next.party[0]!.power).toBeGreaterThan(run.party[0]!.power);
  });

  it("kindred_bond only boosts party members that actually share a type with a partymate", () => {
    const solo = fighter({ slug: "solo", types: ["water"], power: 100 });
    const pairA = fighter({ slug: "pairA", types: ["fire"], power: 100 });
    const pairB = fighter({ slug: "pairB", types: ["fire"], power: 100 });
    const kindredBond = DOCTRINES.find((d) => d.id === "kindred_bond")!;
    const result = kindredBond.apply([solo, pairA, pairB]);
    expect(result.find((f) => f.slug === "solo")!.power).toBe(100);
    expect(result.find((f) => f.slug === "pairA")!.power).toBeGreaterThan(100);
    expect(result.find((f) => f.slug === "pairB")!.power).toBeGreaterThan(100);
  });

  it("greedyRarityPolicy always takes the rarest option on offer", () => {
    const legendary = DOCTRINES.find((d) => d.rarity === "legendary")!;
    const common = DOCTRINES.find((d) => d.rarity === "common")!;
    expect(greedyRarityPolicy([common, legendary])).toBe(legendary);
  });

  it("restParty fully heals HP and clears fatigue without changing anything else", () => {
    const rested = restParty([fighter({ hp: 1, fatigue: 1, power: 77 })]);
    expect(rested[0]!.hp).toBe(rested[0]!.maxHp);
    expect(rested[0]!.fatigue).toBe(0);
    expect(rested[0]!.power).toBe(77);
  });
});
