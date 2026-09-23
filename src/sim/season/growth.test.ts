import { describe, it, expect } from "vitest";
import {
  EGG_POOL,
  eggOffer,
  hatchEggs,
  wildOffer,
  targetPartySize,
  tradeOffer,
  applyGrowth,
  BENCH_CAP,
  evolutionCandidatesFor,
  rollEvolutionOffer,
  applyEvolution,
} from "./growth.js";
import { createRun } from "./engine.js";
import { makeFighter } from "./battle.js";
import type { FighterState } from "./battle.js";
import type { RunState } from "./types.js";
import { ROSTER } from "./roster.js";
import { DEX } from "../../data/species.dex.js";

function fighter(overrides: Partial<FighterState> = {}): FighterState {
  return { slug: "rattata", name: "Rattata", types: ["normal"], power: 50, maxHp: 100, hp: 100, fatigue: 0, ...overrides };
}

function runWith(overrides: Partial<RunState>): RunState {
  return { ...createRun(1), status: "shopping", ...overrides };
}

describe("mid-run roster growth", () => {
  it("the egg pool has exactly 7 common, 5 rare, 3 legendary species (REDESIGN.md)", () => {
    expect(EGG_POOL.common).toHaveLength(7);
    expect(EGG_POOL.rare).toHaveLength(5);
    expect(EGG_POOL.legendary).toHaveLength(3);
  });

  it("eggOffer always returns a species from the egg pool, never the main roster", () => {
    const allEggSlugs = new Set([...EGG_POOL.common, ...EGG_POOL.rare, ...EGG_POOL.legendary].map((s) => s.slug));
    for (let seed = 1; seed <= 30; seed++) {
      const species = eggOffer({ seed });
      expect(allEggSlugs).toContain(species.slug);
    }
  });

  it("an unhatched egg has hp 0 and hatchEggs restores it to full and clears the flag", () => {
    const egg: FighterState = { ...makeFighter(ROSTER[0]!), hp: 0, isEgg: true };
    const [hatched] = hatchEggs([egg]);
    expect(hatched!.isEgg).toBe(false);
    expect(hatched!.hp).toBe(hatched!.maxHp);
  });

  it("hatchEggs leaves already-hatched party members untouched", () => {
    const normal = fighter({ hp: 42 });
    const [result] = hatchEggs([normal]);
    expect(result).toEqual(normal);
  });

  it("targetPartySize lands one above or below the next gym's party size, never below 1 or above the bench cap", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const size = targetPartySize({ seed, ante: 4, maxAntes: 8 });
      expect(size).toBeGreaterThanOrEqual(1);
      expect(size).toBeLessThanOrEqual(BENCH_CAP);
    }
  });

  it("wildOffer always returns a roster species", () => {
    const rosterSlugs = new Set(ROSTER.map((s) => s.slug));
    for (let seed = 1; seed <= 30; seed++) {
      expect(rosterSlugs).toContain(wildOffer({ seed }).slug);
    }
  });

  it("tradeOffer never proposes a species the party already owns", () => {
    const party = [fighter({ slug: ROSTER[0]!.slug })];
    for (let seed = 1; seed <= 30; seed++) {
      const offered = tradeOffer({ seed }, party);
      expect(offered.slug).not.toBe(ROSTER[0]!.slug);
    }
  });

  it("applyGrowth never grows the party past the bench cap", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const run = runWith({ rng: { seed }, party: [fighter(), fighter({ slug: "pikachu" })] });
      const grown = applyGrowth(run);
      expect(grown.party.length).toBeLessThanOrEqual(BENCH_CAP);
    }
  });

  it("applyGrowth doesn't touch the party when it's already the roster's strongest possible bench", () => {
    // The whole roster's top BENCH_CAP by power: nothing catch/trade/egg could
    // offer beats the weakest of these, on a full bench, so nothing should change.
    const strongest = ROSTER.slice().sort((a, b) => b.power - a.power).slice(0, BENCH_CAP);
    const party = strongest.map((s) => makeFighter(s));
    const run = runWith({ rng: { seed: 3 }, party });
    const grown = applyGrowth(run);
    expect(grown.party.map((f) => f.slug).sort()).toEqual(party.map((f) => f.slug).sort());
  });

  it("a full bench can still be upgraded by a catch or egg replacing the current weakest member", () => {
    // A full bench of otherwise-strong mons but one deliberately weak member
    // should get swapped out eventually, even though there's no free slot.
    const strongRest = ROSTER.slice()
      .sort((a, b) => b.power - a.power)
      .slice(0, BENCH_CAP - 1)
      .map((s) => makeFighter(s));
    const weakLink = fighter({ slug: "magikarp-ish-filler", power: 1 });
    let sawUpgrade = false;
    for (let seed = 1; seed <= 100; seed++) {
      const run = runWith({ rng: { seed }, party: [...strongRest, weakLink] });
      const grown = applyGrowth(run);
      expect(grown.party.length).toBeLessThanOrEqual(BENCH_CAP);
      if (!grown.party.some((f) => f.slug === weakLink.slug)) sawUpgrade = true;
    }
    expect(sawUpgrade).toBe(true);
  });

  it("applyGrowth's trade only fires when the offered species is strictly stronger than the current weakest", () => {
    const weak = fighter({ slug: ROSTER[0]!.slug, power: 1 });
    let sawTrade = false;
    for (let seed = 1; seed <= 50; seed++) {
      const run = runWith({ rng: { seed }, party: [weak] });
      const grown = applyGrowth(run);
      const stillWeak = grown.party.find((f) => f.slug === weak.slug);
      if (!stillWeak) {
        sawTrade = true;
        expect(grown.party[0]!.power).toBeGreaterThan(weak.power);
      }
    }
    expect(sawTrade).toBe(true);
  });

  describe("Evolution Stone (F2c)", () => {
    const eevee = DEX.find((s) => s.slug === "eevee")!;
    const pikachu = DEX.find((s) => s.slug === "pikachu")!;
    const raichu = DEX.find((s) => s.slug === "raichu")!;

    it("evolutionCandidatesFor offers one entry per evolvesTo branch, for every alive non-egg, non-fully-evolved member", () => {
      const party: FighterState[] = [
        makeFighter(eevee),
        { ...makeFighter(pikachu), hp: 0 }, // fainted — excluded
        { ...makeFighter(pikachu), isEgg: true },
        makeFighter(raichu), // fully evolved — no evolvesTo — excluded
      ];
      const candidates = evolutionCandidatesFor(party);
      expect(candidates).toHaveLength(eevee.evolvesTo.length);
      expect(candidates.every((c) => c.memberIndex === 0 && c.memberSlug === "eevee")).toBe(true);
      const targetSlugs = candidates.map((c) => c.target.slug).sort();
      expect(targetSlugs).toEqual([...eevee.evolvesTo].sort());
    });

    it("evolutionCandidatesFor keys candidates by party-array index, distinguishing two members of the same species", () => {
      const party: FighterState[] = [makeFighter(eevee), makeFighter(eevee)];
      const candidates = evolutionCandidatesFor(party);
      expect(candidates.filter((c) => c.memberIndex === 0)).toHaveLength(eevee.evolvesTo.length);
      expect(candidates.filter((c) => c.memberIndex === 1)).toHaveLength(eevee.evolvesTo.length);
    });

    it("rollEvolutionOffer never offers a candidate for a fainted or egg party member", () => {
      const party: FighterState[] = [{ ...makeFighter(eevee), hp: 0 }, { ...makeFighter(pikachu), isEgg: true }];
      for (let seed = 1; seed <= 50; seed++) {
        const run = runWith({ rng: { seed }, party });
        const offer = rollEvolutionOffer(run);
        expect(offer).toBeNull();
      }
    });

    it("rollEvolutionOffer never offers a species not reachable by exactly one evolution step from the member's current species", () => {
      const party: FighterState[] = [makeFighter(eevee), makeFighter(pikachu)];
      const validTargets: Record<string, Set<string>> = {
        eevee: new Set(eevee.evolvesTo),
        pikachu: new Set(pikachu.evolvesTo),
      };
      for (let seed = 1; seed <= 200; seed++) {
        const run = runWith({ rng: { seed }, party });
        const offer = rollEvolutionOffer(run);
        if (!offer) continue;
        expect(offer.length).toBeGreaterThan(0);
        expect(offer.length).toBeLessThanOrEqual(3);
        for (const candidate of offer) {
          expect(validTargets[candidate.memberSlug]!.has(candidate.target.slug)).toBe(true);
        }
      }
    });

    it("applyEvolution preserves the member's HP fraction, not the raw value, since max HP changes", () => {
      const half = { ...makeFighter(eevee), hp: Math.round(makeFighter(eevee).maxHp / 2), fatigue: 0.3 };
      const party: FighterState[] = [half];
      const vaporeon = DEX.find((s) => s.slug === "vaporeon")!;
      const [evolved] = applyEvolution(party, 0, vaporeon);
      expect(evolved!.slug).toBe("vaporeon");
      expect(evolved!.maxHp).not.toBe(half.maxHp);
      expect(evolved!.hp / evolved!.maxHp).toBeCloseTo(0.5, 1);
      expect(evolved!.fatigue).toBe(0.3);
    });

    it("applyEvolution only touches the targeted party-array index", () => {
      const untouched = makeFighter(pikachu);
      const party: FighterState[] = [makeFighter(eevee), untouched];
      const vaporeon = DEX.find((s) => s.slug === "vaporeon")!;
      const result = applyEvolution(party, 0, vaporeon);
      expect(result[1]).toEqual(untouched);
    });
  });
});
