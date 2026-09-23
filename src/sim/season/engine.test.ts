import { describe, it, expect } from "vitest";
import {
  createRun,
  draftParty,
  startRun,
  resolveCurrentAnte,
  resolveShop,
  gymPartySizeFor,
  samplePlayerParty,
} from "./engine.js";
import { DRAFT_BENCH_SIZE } from "./draft.js";
import type { RunState } from "./types.js";

/** Draft + start in one step — most tests care about what happens after the run is underway. */
function readyRun(seed: number, maxAntes = 8) {
  return startRun(draftParty(createRun(seed, maxAntes)));
}

describe("season run engine", () => {
  it("starts in draft with no Ante open and no party", () => {
    const run = createRun(1);
    expect(run.status).toBe("draft");
    expect(run.ante).toBe(0);
    expect(run.party).toHaveLength(0);
  });

  it("draws a Charter with a plausible subset of the 18 types, not all or none", () => {
    const run = createRun(1);
    expect(run.charter.liveTypes.length).toBeGreaterThanOrEqual(10);
    expect(run.charter.liveTypes.length).toBeLessThanOrEqual(13);
    expect(new Set(run.charter.liveTypes).size).toBe(run.charter.liveTypes.length);
  });

  it("draftParty fills the bench and is a no-op once already drafted", () => {
    const drafted = draftParty(createRun(1));
    expect(drafted.party).toHaveLength(DRAFT_BENCH_SIZE);
    expect(drafted.status).toBe("draft");

    const draftedAgain = draftParty(drafted);
    expect(draftedAgain).toEqual(drafted);
  });

  it("startRun requires a drafted party, then opens Ante 1", () => {
    const undrafted = startRun(createRun(1));
    expect(undrafted.status).toBe("draft"); // no-op: nothing drafted yet

    const started = readyRun(1);
    expect(started.status).toBe("active");
    expect(started.ante).toBe(1);

    expect(startRun(started)).toEqual(started); // no-op once already active
  });

  it("clearing a non-final Ante opens the shop instead of advancing directly", () => {
    let run = readyRun(1);
    let guard = 0;
    while (run.status === "active" && guard++ < 50) {
      const before = run.ante;
      run = resolveCurrentAnte(run);
      if (run.status === "shopping") {
        expect(run.ante).toBe(before); // Ante hasn't advanced yet
        run = resolveShop(run);
        expect(run.ante).toBe(before + 1);
        expect(run.status).toBe("active");
      }
    }
    expect(["won", "lost"]).toContain(run.status);
  });

  it("losing an Ante ends the run immediately, mid-season", () => {
    let run = readyRun(1, 8);
    let guard = 0;
    while (run.status !== "won" && run.status !== "lost" && guard++ < 50) {
      run = run.status === "shopping" ? resolveShop(run) : resolveCurrentAnte(run);
    }
    expect(["won", "lost"]).toContain(run.status);
    if (run.status === "lost") {
      const last = run.history[run.history.length - 1];
      expect(last?.cleared).toBe(false);
    }
  });

  it("clearing the final Ante wins the run without opening a shop", () => {
    // maxAntes=1 makes it a single fight, resolved (possibly with a
    // Sacrifice-mon reprieve — the drafted party can include one) to a final
    // won/lost outcome.
    let sawWon = false;
    let sawLost = false;
    for (let seed = 1; seed <= 20; seed++) {
      let run = readyRun(seed, 1);
      let guard = 0;
      while (run.status === "active" && guard++ < 5) {
        run = resolveCurrentAnte(run);
      }
      expect(["won", "lost"]).toContain(run.status);
      if (run.status === "won") sawWon = true;
      if (run.status === "lost") sawLost = true;
    }
    expect(sawWon).toBe(true);
    expect(sawLost).toBe(true);
  });

  it("resolveCurrentAnte and resolveShop are no-ops outside their phase", () => {
    let run = readyRun(1, 1);
    run = resolveCurrentAnte(run);
    expect(run.status).not.toBe("active");
    expect(resolveCurrentAnte(run)).toEqual(run);
    expect(resolveShop(run)).toEqual(run);
  });

  it("gym party size escalates from 2 toward the Championship, never shrinking", () => {
    const maxAntes = 8;
    let prev = 0;
    for (let ante = 1; ante <= maxAntes; ante++) {
      const size = gymPartySizeFor(ante, maxAntes);
      expect(size).toBeGreaterThanOrEqual(prev);
      prev = size;
    }
    expect(gymPartySizeFor(1, maxAntes)).toBe(2);
  });

  it("samplePlayerParty still works standalone for callers that don't want a real draft", () => {
    const party = samplePlayerParty({ seed: 42 }, 4);
    expect(party).toHaveLength(4);
  });

  it("a would-be fatal loss is survived once when a Sacrifice Pokémon is in the party, then ends for real", () => {
    // A deliberately hopeless party (near-zero power/HP) plus one healthy
    // Sacrifice mon guarantees the Ante is lost, so the reprieve is
    // deterministic rather than dependent on finding a losing seed.
    const hopeless = { ...readyRun(1, 8).party[0]!, power: 1, maxHp: 1, hp: 1 };
    // Weak too, so the whole party loses regardless of which one the
    // auto-policy switches to mid-battle — the point is the reprieve fires
    // whenever the pre-battle party had a living Sacrifice mon, not whether
    // it happened to be the one still standing at the end.
    const sac = { ...hopeless, slug: "gengar", name: "Gengar" };
    let run: RunState = { ...readyRun(1, 8), party: [hopeless, sac] };

    expect(run.party.some((f) => f.slug === "gengar")).toBe(true);
    const before = run;
    run = resolveCurrentAnte(run);

    // Reprieved: still active at the same Ante, extra life spent, Sacrifice mon released.
    expect(run.status).toBe("active");
    expect(run.ante).toBe(before.ante);
    expect(run.extraLifeUsed).toBe(true);
    expect(run.party.some((f) => f.slug === "gengar")).toBe(false);

    // The reprieve doesn't fire twice: the next loss ends the run for real.
    const rehopeless = { ...run.party[0]!, power: 1, maxHp: 1, hp: 1 };
    run = { ...run, party: [rehopeless] };
    run = resolveCurrentAnte(run);
    expect(run.status).toBe("lost");
  });
});
