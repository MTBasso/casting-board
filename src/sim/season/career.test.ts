import { describe, it, expect } from "vitest";
import { createCareer, inductMentors, startSeason, MAX_MENTORS } from "./career.js";
import { resolveCurrentAnte, resolveShop, createRun, startRun } from "./engine.js";
import type { FighterState } from "./battle.js";
import type { RunState } from "./types.js";
import type { DraftPolicy } from "./draft.js";

function fighter(overrides: Partial<FighterState> = {}): FighterState {
  return { slug: "rattata", name: "Rattata", types: ["normal"], power: 50, maxHp: 100, hp: 100, fatigue: 0, ...overrides };
}

function endedRun(status: "won" | "lost", party: FighterState[]): RunState {
  return { ...createRun(1), status, party };
}

describe("Hall of Fame / Mentor meta-progression", () => {
  it("starts with an empty career", () => {
    const career = createCareer();
    expect(career.mentors).toHaveLength(0);
    expect(career.seasonsPlayed).toBe(0);
  });

  it("inducts every surviving, non-egg party member from an ended run", () => {
    const run = endedRun("won", [fighter({ slug: "a" }), fighter({ slug: "b" })]);
    const career = inductMentors(createCareer(), run);
    expect(career.mentors.map((m) => m.slug).sort()).toEqual(["a", "b"]);
    expect(career.seasonsPlayed).toBe(1);
  });

  it("does not induct a fainted or unhatched party member", () => {
    const run = endedRun("lost", [
      fighter({ slug: "fainted", hp: 0 }),
      fighter({ slug: "egg", isEgg: true, hp: 0 }),
      fighter({ slug: "alive" }),
    ]);
    const career = inductMentors(createCareer(), run);
    expect(career.mentors.map((m) => m.slug)).toEqual(["alive"]);
  });

  it("induction is a no-op for a run that hasn't ended yet", () => {
    const active = { ...createRun(1), status: "active" as const, party: [fighter()] };
    const career = inductMentors(createCareer(), active);
    expect(career.mentors).toHaveLength(0);
    expect(career.seasonsPlayed).toBe(0);
  });

  it("never inducts the same slug twice", () => {
    let career = createCareer();
    career = inductMentors(career, endedRun("won", [fighter({ slug: "a" })]));
    career = inductMentors(career, endedRun("won", [fighter({ slug: "a" })]));
    expect(career.mentors).toHaveLength(1);
    expect(career.seasonsPlayed).toBe(2); // still counts as a season played
  });

  it("stops adding new Mentors once MAX_MENTORS is reached — the plateau mechanism", () => {
    let career = createCareer();
    for (let i = 0; i < MAX_MENTORS + 5; i++) {
      career = inductMentors(career, endedRun("won", [fighter({ slug: `mon-${i}` })]));
    }
    expect(career.mentors).toHaveLength(MAX_MENTORS);
    expect(career.seasonsPlayed).toBe(MAX_MENTORS + 5);
  });

  it("startSeason drafts a party weighted by the career's Mentors", () => {
    // A policy that grabs the Mentor whenever it's on offer isolates whether
    // the weighting actually gets it offered often enough to matter, rather
    // than being confounded by typeDiversePolicy's own unrelated preferences.
    const takeMentorIfOffered: DraftPolicy = (offer) => offer.find((s) => s.slug === "pikachu") ?? offer[0]!;
    const career = { mentors: [{ slug: "pikachu" }], seasonsPlayed: 3 };
    let sawMentor = false;
    for (let seed = 1; seed <= 100; seed++) {
      const run = startSeason(career, seed, undefined, takeMentorIfOffered);
      if (run.party.some((f) => f.slug === "pikachu")) {
        sawMentor = true;
        break;
      }
    }
    expect(sawMentor).toBe(true);
  });

  it("a career with more Mentors clears more Antes on average across many seasons than a fresh one", () => {
    function averageAntesCleared(career: ReturnType<typeof createCareer>, seeds: number[]): number {
      let total = 0;
      for (const seed of seeds) {
        let run = startRun(startSeason(career, seed, 8));
        let guard = 0;
        while (run.status !== "won" && run.status !== "lost" && guard++ < 100) {
          run = run.status === "shopping" ? resolveShop(run) : resolveCurrentAnte(run);
        }
        total += run.history.filter((h) => h.cleared).length;
      }
      return total / seeds.length;
    }

    const seeds = Array.from({ length: 150 }, (_, i) => i + 1);
    const fresh = createCareer();

    // Build up a capped-out career from an unrelated seed range so it doesn't
    // overlap with the seeds used to measure the comparison.
    let seasoned = createCareer();
    for (let seed = 10000; seed < 10000 + MAX_MENTORS * 3 && seasoned.mentors.length < MAX_MENTORS; seed++) {
      let run = startRun(startSeason(seasoned, seed, 8));
      let guard = 0;
      while (run.status !== "won" && run.status !== "lost" && guard++ < 100) {
        run = run.status === "shopping" ? resolveShop(run) : resolveCurrentAnte(run);
      }
      seasoned = inductMentors(seasoned, run);
    }
    expect(seasoned.mentors.length).toBeGreaterThan(0);

    const freshAvg = averageAntesCleared(fresh, seeds);
    const seasonedAvg = averageAntesCleared(seasoned, seeds);
    expect(seasonedAvg).toBeGreaterThan(freshAvg);
  });
});
