import { describe, it, expect } from "vitest";
import { draftOffer, starterOffer, runDraft, typeDiversePolicy, DRAFT_OFFER_SIZE, DRAFT_BENCH_SIZE } from "./draft.js";
import { ROSTER } from "./roster.js";
import type { RngState } from "../types.js";

function countAppearances(slug: string, seeds: number[], mentorSlugs: readonly string[]): number {
  let count = 0;
  for (const seed of seeds) {
    const offer = draftOffer({ seed }, [], mentorSlugs);
    if (offer.some((s) => s.slug === slug)) count++;
  }
  return count;
}

describe("season draft", () => {
  it("offers distinct species, and never repeats an excluded slug", () => {
    const rng: RngState = { seed: 1 };
    const excluded = [ROSTER[0]!.slug, ROSTER[1]!.slug];
    const offer = draftOffer(rng, excluded);
    expect(offer.length).toBeLessThanOrEqual(DRAFT_OFFER_SIZE);
    expect(new Set(offer.map((s) => s.slug)).size).toBe(offer.length);
    for (const s of offer) expect(excluded).not.toContain(s.slug);
  });

  it("runDraft fills exactly the bench size with no duplicates", () => {
    const rng: RngState = { seed: 7 };
    const party = runDraft(rng);
    expect(party).toHaveLength(DRAFT_BENCH_SIZE);
    expect(new Set(party.map((f) => f.slug)).size).toBe(DRAFT_BENCH_SIZE);
  });

  it("the type-diverse policy prefers new type coverage over a same-type option, even at a power cost", () => {
    const grass = ROSTER.find((s) => s.types.includes("grass") && !s.types.includes("fire"));
    const fire = ROSTER.find((s) => s.types.includes("fire") && !s.types.includes("grass"));
    if (!grass || !fire) throw new Error("fixture assumption broken: need a pure Grass and pure Fire roster entry");

    const partySoFar = [
      { slug: "x", name: "X", types: grass.types, power: 999, maxHp: 100, hp: 100, fatigue: 0 },
    ];
    // Offer a same-type (Grass) option with higher power against a new-type (Fire) option with lower power.
    const sameTypeHigherPower = { ...grass, power: 200 };
    const newTypeLowerPower = { ...fire, power: 10 };
    const choice = typeDiversePolicy([sameTypeHigherPower, newTypeLowerPower], partySoFar);
    expect(choice.slug).toBe(newTypeLowerPower.slug);
  });

  it("a Mentor-backed species appears in offers noticeably more often than an unweighted one", () => {
    const seeds = Array.from({ length: 400 }, (_, i) => i + 1);
    const mentor = ROSTER[0]!.slug;
    const plain = ROSTER[1]!.slug;

    const baseline = countAppearances(mentor, seeds, []);
    const boosted = countAppearances(mentor, seeds, [mentor]);
    const unaffected = countAppearances(plain, seeds, [mentor]);

    expect(boosted).toBeGreaterThan(baseline * 1.5);
    // The weighting is per-slug — a species that isn't a Mentor shouldn't be
    // pushed around just because a completely different one got boosted.
    expect(Math.abs(unaffected - countAppearances(plain, seeds, []))).toBeLessThan(seeds.length * 0.1);
  });

  it("the starter offer (pick 1) is always a subset of the stage-1-non-Legendary pool, every later pick unaffected (F1c)", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const offer = starterOffer({ seed });
      for (const s of offer) {
        expect(s.stage).toBe(1);
        expect(s.isLegendary).toBe(false);
      }
    }
    // Picks 2-4 still go through the unfiltered draftOffer — same pool, same
    // behavior as before F1c, verified by the existing draftOffer tests above.
    const legendaryOrEvolved = ROSTER.filter((s) => s.stage !== 1 || s.isLegendary);
    expect(legendaryOrEvolved.length).toBeGreaterThan(0);
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    const sawNonStarterInFullDraft = seeds.some((seed) =>
      draftOffer({ seed }).some((s) => s.stage !== 1 || s.isLegendary),
    );
    expect(sawNonStarterInFullDraft).toBe(true);
  });

  it("runDraft threads Mentor weighting through the whole draft, not just the first offer", () => {
    const mentor = ROSTER[0]!.slug;
    let sawMentor = false;
    for (let seed = 1; seed <= 100; seed++) {
      const party = runDraft({ seed }, typeDiversePolicy, DRAFT_BENCH_SIZE, [mentor]);
      if (party.some((f) => f.slug === mentor)) {
        sawMentor = true;
        break;
      }
    }
    expect(sawMentor).toBe(true);
  });
});
