import {
  CHALLENGE,
  CHALLENGE_GATE,
  LOG_CAP,
  PARTY,
  RENOWN,
  TICK_SECONDS,
  WAVE,
} from "./constants.js";
import { threatAgainst } from "../data/typechart.js";
import {
  makeChallenger,
  recordThreat,
  rollBadges,
  runChallenge,
  type ChallengeResult,
} from "./systems/challenge.js";
import { tierMultiplier } from "./systems/promotion.js";
import { payroll, recover } from "./systems/economy.js";
import { tickMorale } from "./systems/morale.js";
import { tickUsurper } from "./systems/title.js";
import { markBondedGyms } from "./systems/promotion.js";
import { tallyTick } from "./systems/objectives.js";
import { checkGymUnlock } from "./systems/league.js";
import { driftMeta } from "./systems/meta.js";
import { tickElite } from "./systems/elite.js";
import { tickRivals } from "./systems/rivals.js";
import { tickDayCare } from "./systems/daycare.js";
import { autoFillAll } from "./systems/party.js";
import { tickField } from "./systems/field.js";
import { partyOf } from "./systems/party.js";
import type { BattleRecord, Gym, LeagueState, LogKind, TickReport } from "./types.js";
import { newReport, type Report } from "./report.js";

/**
 * How often challengers arrive, in sim-seconds.
 *
 * A famous league draws a bigger crowd. This is the game's only compounding
 * force: renown buys attendance, attendance buys renown.
 */
export function waveInterval(state: LeagueState): number {
  const multiplier = Math.max(
    WAVE.minArrivalMultiplier,
    1 / (1 + state.renown * WAVE.arrivalPerRenown),
  );
  return WAVE.intervalSeconds * multiplier;
}

/**
 * How often a challenger turns up at one gym.
 *
 * A famous league draws a bigger crowd — the same attendance curve as before,
 * just applied to whole challenges rather than single exchanges.
 */
export function challengeInterval(state: LeagueState): number {
  const multiplier = Math.max(
    WAVE.minArrivalMultiplier,
    1 / (1 + state.renown * WAVE.arrivalPerRenown),
  );
  return CHALLENGE.intervalSeconds * multiplier;
}

/**
 * How often challengers reach *this* gym.
 *
 * Every gym used to run on the same interval — measured, all eight took exactly
 * the same number of challenges over the same span — which quietly contradicted
 * the premise the whole board rests on: you need seven badges to stand in front
 * of the eighth gym, so hardly anybody should.
 *
 * The curve is derived rather than imposed. If `badgePassRate` of challengers
 * who take a badge go on to try the next gym, the population holding exactly
 * `k` badges falls as `passRate ** k`, and the first gym sees about 6.8x the
 * traffic of the eighth. One parameter, and it is a fact about people rather
 * than a number chosen to feel right.
 *
 * Total volume is preserved: the weights are normalised against the number of
 * gyms, so this redistributes the crowd instead of resizing it. The consequence
 * is that a gym's own rate moves as the league grows — with one gym it is
 * exactly today's rate, and by eight the first is ~2.1x faster and the last
 * ~3.2x slower. That is the intended reading: a bigger league draws a bigger
 * crowd, and a crowd is mostly beginners.
 */
export function gymChallengeInterval(state: LeagueState, rank: number): number {
  const gyms = Math.max(1, state.gymOrder.length);
  const k: number = CHALLENGE.badgePassRate;
  // Sum of k^0..k^(gyms-1) — the total weight the crowd is split across.
  // A pass rate of exactly 1 would divide by zero, and is the flat league.
  const totalWeight = k === 1 ? gyms : (1 - k ** gyms) / (1 - k);
  const weight = k ** Math.max(0, rank);
  return (challengeInterval(state) * totalWeight) / (gyms * weight);
}

/**
 * Gate receipts and renown multiplier for a gym at this rank.
 *
 * Normalised so the *weighted average across the board is exactly 1* — weighted
 * by how often each gym is actually challenged. Without that the ladder is not
 * a redistribution but a 3.15x raise: gym eight paying 13x while the crowd is
 * merely redistributed inflates total income and renown, and renown is the
 * unlock spine that was fitted against a measured curve one block ago.
 *
 * So the shape is preserved and the level is not touched. Gym eight earns about
 * 2.1x per second what gym one does, and the league as a whole earns what it
 * earned before.
 */
export function rankMultiplier(state: LeagueState, rank: number): number {
  const gyms = Math.max(1, state.gymOrder.length);
  const k: number = CHALLENGE.badgePassRate;
  const g: number = CHALLENGE.gatePerRank;

  // Weighted mean of g^r under crowd weights k^r, over the gyms that exist.
  const kg = k * g;
  const paid = kg === 1 ? gyms : (1 - kg ** gyms) / (1 - kg);
  const crowd = k === 1 ? gyms : (1 - k ** gyms) / (1 - k);
  const mean = paid / crowd;

  return g ** Math.max(0, rank) / mean;
}

/**
 * Pay out a resolved challenge.
 *
 * Every trainer the challenger got past is money in the gate — they filled the
 * stands on the way through. Losing the badge costs renown, scaled by how badly
 * the meta is beating this gym.
 */
function applyChallenge(
  state: LeagueState,
  gym: Gym,
  result: ChallengeResult,
  report: Report,
): void {
  // The whole gate scales with rank, base and per-trainer alike. Scaling one
  // half and not the other is the kind of split nobody remembers later, and
  // "how far they got" should stay the shape of the payout at every rank.
  const rank = state.gymOrder.indexOf(gym.id);
  const byRank = rankMultiplier(state, rank);

  const gate =
    (CHALLENGE_GATE.base + result.cleared * CHALLENGE_GATE.perTrainerCleared) *
    byRank *
    (1 + state.renown * WAVE.receiptsPerRenown) *
    tierMultiplier(state.tier);

  state.money += gate;
  report.challenge(!result.tookBadge, gate);

  if (result.tookBadge) {
    const pressure = threatAgainst(gym.type, gym.threat.distribution);
    // Both directions of the ladder, or the early gyms are renown-negative:
    // scaling the win to 0.32x while a loss still costs full means the busiest
    // gym on the board bleeds standing no matter how well it does.
    state.renown = Math.max(
      0,
      state.renown -
        RENOWN.perBadgeLost * byRank * Math.max(1, pressure ** RENOWN.mismatchExponent),
    );
  } else {
    // Renown follows money up the ladder. Flat would mean an unstaffed gym
    // eight barely dented progression, which contradicts the promotion gate.
    state.renown += RENOWN.perChallengeHeld * byRank;
  }
}

/** A report with nothing in it, for callers that need the shape and no events. */
export function emptyReport(): TickReport {
  return newReport().done();
}

export function log(
  state: LeagueState,
  kind: LogKind,
  key: string,
  params?: Record<string, string | number>,
): void {
  state.log.unshift(params ? { at: state.time, kind, key, params } : { at: state.time, kind, key });
  if (state.log.length > LOG_CAP) state.log.length = LOG_CAP;
}

/**
 * Advance the league by `dt` sim-seconds.
 *
 * Pure with respect to the outside world: no clock reads, no Math.random, no
 * DOM. It mutates the state object it is handed, which is the one concession —
 * structural sharing would cost more than it buys at this roster size, and
 * `cloneState` exists for the cases that need isolation.
 *
 * Callers should keep `dt` small and fixed (see `engine/loop.ts`). Long spans
 * belong in `offline.ts`, which resolves them analytically instead.
 */
export function tick(
  state: LeagueState,
  dt: number = TICK_SECONDS,
  /**
   * Record into this rather than a fresh one.
   *
   * The offline pass steps many ticks and wants one report for the span. It
   * used to merge each tick's struct into a running total with a hand-written
   * `merge` that copied six of the twenty-one fields — so a short absence
   * silently dropped every catch, evolution and gauntlet it produced.
   */
  into?: Report,
): TickReport {
  const report = into ?? newReport();

  // Challenges, per gym. A challenger fights up through the juniors and then
  // the Leader; how far they get is the whole story.
  for (const gymId of state.gymOrder) {
    const gym = state.gyms[gymId];
    if (!gym) continue;

    gym.waveCooldown -= dt;
    let guard = 0;
    while (gym.waveCooldown <= 0 && guard < 16) {
      const rank = state.gymOrder.indexOf(gymId);
      const defending = [
        ...gym.trainerIds,
        ...(gym.leaderId ? [gym.leaderId] : []),
      ].flatMap((id) => partyOf(state, id));
      const challenger = makeChallenger(state, rollBadges(state, rank + 1), defending);
      const record: BattleRecord = {
        gymId,
        challenger: [],
        stages: [],
        heldAt: 0,
        tookBadge: false,
        at: state.time,
      };
      const result = runChallenge(state, gym, challenger, report, record);
      record.heldAt = result.cleared;
      record.tookBadge = result.tookBadge;
      // Only the most recent challenge per gym is kept — the feed replays the
      // last thing that happened, not a history nobody will scroll.
      state.battles[gymId] = record;

      recordThreat(gym, challenger, !result.tookBadge);
      applyChallenge(state, gym, result, report);

      gym.waveCooldown += gymChallengeInterval(state, rank);
      guard += 1;
    }
  }

  payroll(state, dt, report);
  // Payroll moves morale; the staircase reads it. Order matters — a trainer
  // suspended this tick should not also have been paid for it.
  tickMorale(state, dt, report);
  // The promotion gate ratchets, so the moment a gym reaches the standard has
  // to be caught while it is happening.
  markBondedGyms(state);
  recover(state, dt);
  checkGymUnlock(state);

  tickField(state, dt, report);

  // Parties top themselves up from the box on a timer. The player never sorts
  // hundreds of creatures; they pin the ones that matter and the rest is
  // handled. Attention is the scarce resource, so only spend it where it counts.
  state.autoFillIn -= dt;
  if (state.autoFillIn <= 0) {
    autoFillAll(state);
    state.autoFillIn = PARTY.refreshSeconds;
  }
  tickDayCare(state, dt, report);
  tickElite(state, dt, report);
  tickUsurper(state, dt, report);
  tickRivals(state, dt, report);

  // Standing fades. This is the ceiling on renown: it equilibrates where the
  // league's inflow matches the decay, so holding the board is a thing you keep
  // doing rather than a number you bank.
  state.renown *= Math.pow(0.5, dt / RENOWN.decayHalfLifeSeconds);

  // Renown is volatile; peak renown ratchets. Every gate reads the peak, so a
  // bad season can cost you income but never takes progress away.
  if (state.renown > state.peakRenown) state.peakRenown = state.renown;

  // The drifting meta. One step per elapsed interval.
  state.meta.nextDriftIn -= dt;
  let driftGuard = 0;
  while (state.meta.nextDriftIn <= 0 && driftGuard < 64) {
    driftMeta(state);
    driftGuard += 1;
  }

  state.time += dt;

  // Everything below reads the report rather than writing it, so it reads the
  // finished one. `done()` hands back the same object each time — this is a
  // change of stance, not a copy.
  const events = report.done();

  for (const name of events.retirements) {
    log(state, "retire", "log.retired", { name });
  }
  for (const name of events.hatched) {
    log(state, "breed", "log.hatched", { name });
  }
  for (const name of events.revives) {
    log(state, "wave", "log.revived", { name });
  }
  if (events.badgesLost > 0) {
    log(state, "wave", "log.badgesClaimed", { n: events.badgesLost });
  }
  for (const r of events.rivals) {
    log(state, "rival", r.held ? "log.rivalHeld" : "log.rivalWon", { name: r.name });
  }
  for (const name of events.recruited) {
    log(state, "hire", "log.rivalJoined", { name });
  }
  for (const run of events.gauntlets) {
    log(
      state,
      "gauntlet",
      run.tookLeague ? "log.eliteLost" : "log.eliteHeld",
      { n: run.cleared },
    );
  }
  // Only report upsets from creatures that are still settling in. A veteran
  // having an off day is noise; an unfamiliar creature throwing a battle it
  // should have won is the mechanic explaining itself.
  for (const upset of events.upsets) {
    if (upset.bond >= 0.6) continue;
    log(
      state,
      "upset",
      upset.won ? "log.upsetWon" : "log.upsetLost",
      { name: upset.name },
    );
  }
  for (const text of events.evolutions) {
    log(state, "evolve", "log.evolved", { text });
  }
  for (const name of events.resignations) {
    log(state, "quit", "log.resigned", { name });
  }

  // Objectives count against history, which nothing else was keeping. This has
  // to come *last*: the report is built up across the tick, and tallying it
  // half-way through counts only the systems that had run by then. It sat above
  // `tickField` for a long time, which meant `caught` and `returned` were read
  // before anything wrote them — so two of the twelve measures could only ever
  // be zero, and the objective spine dead-ended at "Send them out".
  tallyTick(state, events.wavesWon, events.caught.length, events.returned.length);

  return events;
}
