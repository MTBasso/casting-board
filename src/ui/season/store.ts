import { create } from "zustand";
import { draftOffer, starterOffer, DRAFT_BENCH_SIZE } from "../../sim/season/draft.js";
import {
  applyAnteResult,
  createRun,
  gymPartyFor,
  startRun,
} from "../../sim/season/engine.js";
import {
  acceptNewcomer,
  autoCatch,
  eggFighterFor,
  hatchEggs,
  rollEggOffer,
  tradeOffer,
  weakestOf,
} from "../../sim/season/growth.js";
import { offerDoctrines, pickDoctrine, restParty } from "../../sim/season/doctrines.js";
import { createCareer, inductMentors, type Career } from "../../sim/season/career.js";
import {
  canSwitchTo,
  initBattle,
  makeFighter,
  primaryType,
  resolveTurn,
  switchActive,
  type BattleState,
} from "../../sim/season/battle.js";
import { effectivenessAgainst } from "../../data/typechart.js";
import type { Doctrine, RunState } from "../../sim/season/types.js";
import type { Species } from "../../data/catalog.js";

/** One line of the Ante's battle feed — see AnteScreen. */
export interface BattleLogLine {
  id: number;
  text: string;
}

/** Which between-Ante growth decision (growth.ts) is currently in front of the player, if any — trade and egg offers precede the Doctrine shop. */
export type GrowthPhase = "trade" | "egg" | "shop" | null;

/** What kept the season alive on what would have been a fatal Ante loss — shown once before the retried battle opens. */
export interface ReprieveNotice {
  releasedName: string | null;
  run: RunState;
  battle: BattleState;
}

interface SeasonStore {
  run: RunState;
  offer: Species[];
  excluded: string[];
  battle: BattleState | null;
  log: BattleLogLine[];
  shopOffer: Doctrine[];
  growthPhase: GrowthPhase;
  tradeCandidate: Species | null;
  eggCandidate: Species | null;
  career: Career;
  justInducted: string[];
  reprieve: ReprieveNotice | null;
  newRun: (seed?: number) => void;
  pickDraft: (slug: string) => void;
  beginSeason: () => void;
  switchTo: (index: number) => void;
  advanceTurn: () => void;
  continueAfterReprieve: () => void;
  resolveTradeOffer: (accept: boolean) => void;
  resolveEggOffer: (accept: boolean) => void;
  pickShopDoctrine: (id: string) => void;
}

let nextLogId = 0;
function logLine(text: string): BattleLogLine {
  return { id: nextLogId++, text };
}

/** Draws the season's first draft offer for a fresh run, weighted by the career's Mentors so far (REDESIGN.md "Draft/season start"). */
function initialOffer(run: RunState, mentorSlugs: readonly string[]): { run: RunState; offer: Species[] } {
  const rng = { seed: run.rng.seed };
  const offer = starterOffer(rng, mentorSlugs);
  return { run: { ...run, rng }, offer };
}

/** Opens the next Ante: draws its gym party and starts a fresh coach-call battle. */
function openAnteBattle(run: RunState): { run: RunState; battle: BattleState } {
  const rng = { seed: run.rng.seed };
  const gymParty = gymPartyFor({ ...run, rng });
  const battle = initBattle(run.party, gymParty);
  return { run: { ...run, rng }, battle };
}

/**
 * Between-Ante growth, split into its three pipelines (growth.ts): hatching
 * and ambient catches stay automatic (REDESIGN.md "Idle scope" — catches
 * are texture, not a decision), but trade and egg offers are now real
 * choices the player sees and answers before the Doctrine shop opens.
 */
interface GrowthStep {
  run: RunState;
  phase: GrowthPhase;
  tradeCandidate: Species | null;
  eggCandidate: Species | null;
  shopOffer: Doctrine[];
}

function tradeCandidateFor(run: RunState): { run: RunState; candidate: Species | null } {
  if (!weakestOf(run.party)) return { run, candidate: null };
  const rng = { seed: run.rng.seed };
  const candidate = tradeOffer(rng, run.party);
  return { run: { ...run, rng }, candidate };
}

function eggCandidateFor(run: RunState): { run: RunState; candidate: Species | null } {
  const rng = { seed: run.rng.seed };
  const candidate = rollEggOffer({ ...run, rng });
  return { run: { ...run, rng }, candidate };
}

/** Hatches any carried egg and resolves the ambient catch — the automatic half of a shop visit, run once on entry. */
function startGrowth(run: RunState): RunState {
  const hatched = { ...run, party: hatchEggs(run.party) };
  const rng = { seed: hatched.rng.seed };
  return autoCatch({ ...hatched, rng });
}

/** Advances through the remaining growth decisions until one needs the player, or the Doctrine shop is ready. */
function advanceGrowth(run: RunState, opts: { skipTrade?: boolean; skipEgg?: boolean } = {}): GrowthStep {
  let next = run;
  if (!opts.skipTrade) {
    const { run: withRng, candidate } = tradeCandidateFor(next);
    next = withRng;
    if (candidate) return { run: next, phase: "trade", tradeCandidate: candidate, eggCandidate: null, shopOffer: [] };
  }
  if (!opts.skipEgg) {
    const { run: withRng, candidate } = eggCandidateFor(next);
    next = withRng;
    if (candidate) return { run: next, phase: "egg", tradeCandidate: null, eggCandidate: candidate, shopOffer: [] };
  }
  const offer = offerDoctrines(next);
  return { run: next, phase: "shop", tradeCandidate: null, eggCandidate: null, shopOffer: offer };
}

/** The Doctrine catalog exhausted — nothing to pick, same as the headless resolveShop: rest and open the next Ante directly. */
function skipToNextAnte(run: RunState): { run: RunState; battle: BattleState } {
  const advanced: RunState = { ...run, party: restParty(run.party), ante: run.ante + 1, status: "active" };
  return openAnteBattle(advanced);
}

export const useSeason = create<SeasonStore>((set, get) => ({
  run: createRun(Date.now() & 0x7fffffff),
  offer: [],
  excluded: [],
  battle: null,
  log: [],
  shopOffer: [],
  growthPhase: null,
  tradeCandidate: null,
  eggCandidate: null,
  career: createCareer(),
  justInducted: [],
  reprieve: null,

  newRun: (seed = Date.now() & 0x7fffffff) => {
    const fresh = createRun(seed);
    const mentorSlugs = get().career.mentors.map((m) => m.slug);
    const { run, offer } = initialOffer(fresh, mentorSlugs);
    set({
      run,
      offer,
      excluded: [],
      battle: null,
      log: [],
      shopOffer: [],
      growthPhase: null,
      tradeCandidate: null,
      eggCandidate: null,
      justInducted: [],
      reprieve: null,
    });
  },

  pickDraft: (slug) => {
    const { run, offer, excluded, career } = get();
    const choice = offer.find((s) => s.slug === slug);
    if (!choice || run.status !== "draft") return;
    const party = [...run.party, makeFighter(choice)];
    const nextExcluded = [...excluded, slug];
    if (party.length >= DRAFT_BENCH_SIZE) {
      set({ run: { ...run, party }, offer: [], excluded: nextExcluded });
      return;
    }
    const mentorSlugs = career.mentors.map((m) => m.slug);
    const rng = { seed: run.rng.seed };
    const nextOffer = draftOffer(rng, nextExcluded, mentorSlugs);
    set({ run: { ...run, party, rng }, offer: nextOffer, excluded: nextExcluded });
  },

  beginSeason: () => {
    const started = startRun(get().run);
    const { run, battle } = openAnteBattle(started);
    set({ run, battle, log: [logLine(`Ante ${run.ante} — ${run.party.length} on the bench.`)] });
  },

  switchTo: (index) => {
    const { battle, log } = get();
    if (!battle || !canSwitchTo(battle, index)) return;
    const incoming = battle.playerParty[index];
    set({
      battle: switchActive(battle, index),
      log: incoming ? [...log, logLine(`Coach call: ${incoming.name} switches in.`)] : log,
    });
  },

  advanceTurn: () => {
    const { run, battle, log } = get();
    if (!battle || battle.result !== "ongoing") return;

    const before = battle.playerParty[battle.activeIndex];
    const beforeOpp = battle.gymParty[battle.gymIndex];
    const rng = { seed: run.rng.seed };
    const nextBattle = resolveTurn(battle, rng);
    const runWithRng = { ...run, rng };

    const lines: BattleLogLine[] = [...log];
    if (before && beforeOpp) {
      const mult = effectivenessAgainst(primaryType(before), beforeOpp.types);
      const tag = mult > 1 ? "super effective" : mult < 1 ? "not very effective" : null;
      lines.push(logLine(`${before.name} clashes with ${beforeOpp.name}${tag ? ` — ${tag}!` : "."}`));
    }
    const faintedOpp = nextBattle.gymIndex !== battle.gymIndex || nextBattle.result === "won";
    if (faintedOpp && beforeOpp) lines.push(logLine(`${beforeOpp.name} is out.`));
    const faintedMine = nextBattle.activeIndex !== battle.activeIndex && nextBattle.result === "ongoing";
    if (faintedMine && before) lines.push(logLine(`${before.name} is out. Auto-sent the next ready mon.`));

    if (nextBattle.result === "ongoing") {
      set({ run: runWithRng, battle: nextBattle, log: lines });
      return;
    }

    lines.push(logLine(nextBattle.result === "won" ? "Ante cleared." : "The party went down."));
    const resolved = applyAnteResult(runWithRng, nextBattle);
    if (resolved.status === "active") {
      // A Sacrifice/extra-life reprieve — same Ante, rested party, fresh battle,
      // held behind a notice screen instead of applied silently.
      const released = runWithRng.party.find((f) => !resolved.party.includes(f)) ?? null;
      const { run: retryRun, battle: retryBattle } = openAnteBattle(resolved);
      set({
        run: resolved,
        battle: nextBattle,
        log: lines,
        reprieve: { releasedName: released?.name ?? null, run: retryRun, battle: retryBattle },
      });
      return;
    }
    if (resolved.status === "won" || resolved.status === "lost") {
      const { career } = get();
      const nextCareer = inductMentors(career, resolved);
      const justInducted = nextCareer.mentors
        .filter((m) => !career.mentors.some((old) => old.slug === m.slug))
        .map((m) => m.slug);
      set({ run: resolved, battle: nextBattle, log: lines, career: nextCareer, justInducted });
      return;
    }
    if (resolved.status === "shopping") {
      const step = advanceGrowth(startGrowth(resolved));
      if (step.phase === "shop" && step.shopOffer.length === 0) {
        const { run: nextRun, battle: nextAnteBattle } = skipToNextAnte(step.run);
        set({
          run: nextRun,
          battle: nextAnteBattle,
          growthPhase: null,
          shopOffer: [],
          log: [...lines, logLine(`No Doctrines left to offer. Ante ${nextRun.ante} opens.`)],
        });
        return;
      }
      set({
        run: step.run,
        battle: nextBattle,
        log: lines,
        growthPhase: step.phase,
        tradeCandidate: step.tradeCandidate,
        eggCandidate: step.eggCandidate,
        shopOffer: step.shopOffer,
      });
      return;
    }
    set({ run: resolved, battle: nextBattle, log: lines });
  },

  continueAfterReprieve: () => {
    const { reprieve, log } = get();
    if (!reprieve) return;
    set({
      run: reprieve.run,
      battle: reprieve.battle,
      reprieve: null,
      log: [...log, logLine("Retrying the Ante, rested.")],
    });
  },

  resolveTradeOffer: (accept) => {
    const { run, tradeCandidate, log } = get();
    if (run.status !== "shopping" || !tradeCandidate) return;
    let next = run;
    const lines = [...log];
    if (accept) {
      const { party, released } = acceptNewcomer(run.party, makeFighter(tradeCandidate));
      next = { ...run, party };
      lines.push(
        logLine(
          released
            ? `Traded ${released.name} for ${tradeCandidate.name}.`
            : `${tradeCandidate.name} joins the bench, traded in.`,
        ),
      );
    } else {
      lines.push(logLine(`Declined the trade for ${tradeCandidate.name}.`));
    }
    const step = advanceGrowth(next, { skipTrade: true });
    if (step.phase === "shop" && step.shopOffer.length === 0) {
      const { run: nextRun, battle } = skipToNextAnte(step.run);
      set({ run: nextRun, battle, growthPhase: null, shopOffer: [], log: [...lines, logLine(`No Doctrines left to offer. Ante ${nextRun.ante} opens.`)] });
      return;
    }
    set({
      run: step.run,
      log: lines,
      growthPhase: step.phase,
      tradeCandidate: step.tradeCandidate,
      eggCandidate: step.eggCandidate,
      shopOffer: step.shopOffer,
    });
  },

  resolveEggOffer: (accept) => {
    const { run, eggCandidate, log } = get();
    if (run.status !== "shopping" || !eggCandidate) return;
    let next = run;
    const lines = [...log];
    if (accept) {
      const { party, released } = acceptNewcomer(run.party, eggFighterFor(eggCandidate));
      next = { ...run, party };
      lines.push(
        logLine(
          released
            ? `Released ${released.name} for an egg — ${eggCandidate.name}, most likely.`
            : `Took the egg — ${eggCandidate.name}, most likely.`,
        ),
      );
    } else {
      lines.push(logLine(`Skipped the egg — ${eggCandidate.name}, most likely.`));
    }
    const step = advanceGrowth(next, { skipTrade: true, skipEgg: true });
    if (step.shopOffer.length === 0) {
      const { run: nextRun, battle } = skipToNextAnte(step.run);
      set({ run: nextRun, battle, growthPhase: null, shopOffer: [], log: [...lines, logLine(`No Doctrines left to offer. Ante ${nextRun.ante} opens.`)] });
      return;
    }
    set({
      run: step.run,
      log: lines,
      growthPhase: step.phase,
      tradeCandidate: step.tradeCandidate,
      eggCandidate: step.eggCandidate,
      shopOffer: step.shopOffer,
    });
  },

  pickShopDoctrine: (id) => {
    const { run, shopOffer } = get();
    const doctrine = shopOffer.find((d) => d.id === id);
    if (!doctrine || run.status !== "shopping") return;
    const bought = pickDoctrine(run, shopOffer, doctrine);
    const advanced: RunState = {
      ...bought,
      party: restParty(bought.party),
      ante: run.ante + 1,
      status: "active",
    };
    const { run: nextRun, battle } = openAnteBattle(advanced);
    set({
      run: nextRun,
      battle,
      growthPhase: null,
      shopOffer: [],
      log: [logLine(`Took ${doctrine.name}. Ante ${nextRun.ante} — the shop's behind you.`)],
    });
  },
}));
