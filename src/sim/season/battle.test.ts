import { describe, it, expect } from "vitest";
import {
  initBattle,
  resolveTurn,
  switchActive,
  canSwitchTo,
  autoResolveBattle,
  typeAwarePolicy,
  makeFighter,
  type FighterState,
} from "./battle.js";
import { DEX } from "../../data/species.dex.js";
import type { RngState } from "../types.js";

function bySlug(slug: string): FighterState {
  const s = DEX.find((s) => s.slug === slug);
  if (!s) throw new Error(`fixture species ${slug} missing from DEX`);
  return makeFighter(s);
}

describe("battle engine", () => {
  it("a super-effective attacker beats a resisted one, all else equal", () => {
    // Water vs Fire is 2x; the reverse matchup is 0.5x — the type read alone
    // should decide this fight regardless of any RNG variance.
    const rng: RngState = { seed: 1 };
    const battle = autoResolveBattle([bySlug("blastoise")], [bySlug("charizard")], rng);
    expect(battle.result).toBe("won");
  });

  it("switching is illegal onto a fainted mon or the mon already active", () => {
    const battle = initBattle([bySlug("pikachu"), bySlug("bulbasaur")], [bySlug("onix")]);
    expect(canSwitchTo(battle, 0)).toBe(false); // already active
    const fainted = {
      ...battle,
      playerParty: [battle.playerParty[0]!, { ...battle.playerParty[1]!, hp: 0 }],
    };
    expect(canSwitchTo(fainted, 1)).toBe(false);
  });

  it("switchActive is a no-op for an illegal target", () => {
    const battle = initBattle([bySlug("pikachu"), bySlug("bulbasaur")], [bySlug("onix")]);
    expect(switchActive(battle, 0)).toBe(battle);
  });

  it("a fainted active auto-advances to the next alive party member", () => {
    const rng: RngState = { seed: 3 };
    // A lone, badly-matched mon against a tough gym should faint and hand off.
    let battle = initBattle(
      [{ ...bySlug("caterpie"), hp: 1 }, bySlug("blastoise")],
      [bySlug("onix")],
    );
    battle = resolveTurn(battle, rng);
    expect(battle.activeIndex).toBe(1);
    expect(battle.result).toBe("ongoing");
  });

  it("the run ends lost once every party member has fainted", () => {
    const rng: RngState = { seed: 5 };
    let battle = initBattle([{ ...bySlug("caterpie"), hp: 1 }], [bySlug("onix")]);
    battle = resolveTurn(battle, rng);
    expect(battle.result).toBe("lost");
  });

  it("the type-aware policy only recommends a switch that improves the matchup", () => {
    // Water lead into a Fire gym mon is already favored, and the bench option
    // (Bug, resisted by Fire) is worse — no switch should fire.
    const battle = initBattle([bySlug("blastoise"), bySlug("caterpie")], [bySlug("charizard")]);
    expect(typeAwarePolicy(battle)).toBeNull();

    // Fire lead into a Water gym mon is resisted (0.5x, by primary type);
    // Rock-primary Onix is merely neutral (1x) but that's still an
    // improvement, so the policy should recommend switching to it.
    const badLead = initBattle([bySlug("charizard"), bySlug("onix")], [bySlug("blastoise")]);
    expect(typeAwarePolicy(badLead)).toBe(1);
  });

  it("resolveTurn and autoResolveBattle are no-ops once the battle has ended", () => {
    const rng: RngState = { seed: 1 };
    const battle = autoResolveBattle([bySlug("blastoise")], [bySlug("charizard")], rng);
    expect(battle.result).not.toBe("ongoing");
    expect(resolveTurn(battle, rng)).toEqual(battle);
    expect(autoResolveBattle([bySlug("blastoise")], [bySlug("charizard")], { seed: 1 })).toEqual(
      battle,
    );
  });
});
