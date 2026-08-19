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
  report: TickReport,
): void {
  report.wavesResolved += 1;

  const gate =
    (CHALLENGE_GATE.base + result.cleared * CHALLENGE_GATE.perTrainerCleared) *
    (1 + state.renown * WAVE.receiptsPerRenown) *
    tierMultiplier(state.tier);

  state.money += gate;
  report.earned += gate;

  if (result.tookBadge) {
    const pressure = threatAgainst(gym.type, gym.threat.distribution);
    state.renown = Math.max(
      0,
      state.renown - RENOWN.perBadgeLost * Math.max(1, pressure ** RENOWN.mismatchExponent),
    );
    report.badgesLost += 1;
  } else {
    report.wavesWon += 1;
    state.renown += RENOWN.perChallengeHeld;
  }
}

export function emptyReport(): TickReport {
  return {
    wavesResolved: 0,
    wavesWon: 0,
    earned: 0,
    paid: 0,
    retirements: [],
    resignations: [],
    caught: [],
    evolutions: [],
    hatched: [],
    upsets: [],
    revives: [],
    badgesLost: 0,
    rivals: [],
    recruited: [],
    gauntlets: [],
    suspended: [],
    reinstated: [],
    usurped: null,
    departures: [],
    released: [],
    beaten: [],
    returned: [],
  };
}

export function log(state: LeagueState, kind: LogKind, text: string): void {
  state.log.unshift({ at: state.time, kind, text });
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
export function tick(state: LeagueState, dt: number = TICK_SECONDS): TickReport {
  const report = emptyReport();

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

      gym.waveCooldown += challengeInterval(state);
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
  // Objectives count against history, which nothing else was keeping.
  tallyTick(state, report.wavesWon, report.caught.length, report.returned.length);
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

  for (const name of report.retirements) {
    log(state, "retire", `${name} retired to the Day-Care.`);
  }
  for (const name of report.hatched) {
    log(state, "breed", `An egg hatched at the Day-Care: ${name}.`);
  }
  for (const name of report.revives) {
    log(state, "wave", `A challenger revived their ${name}.`);
  }
  if (report.badgesLost > 0) {
    log(
      state,
      "wave",
      `${report.badgesLost} ${report.badgesLost === 1 ? "badge" : "badges"} claimed by challengers.`,
    );
  }
  for (const r of report.rivals) {
    log(
      state,
      "rival",
      r.held
        ? `${r.name} challenged and lost.`
        : `${r.name} beat your gym and took a badge.`,
    );
  }
  for (const name of report.recruited) {
    log(state, "hire", `${name} joined the league after losing.`);
  }
  for (const run of report.gauntlets) {
    log(
      state,
      "gauntlet",
      run.tookLeague
        ? `A challenger beat the Elite Four and took the league.`
        : `A challenger cleared ${run.cleared} of the Elite tier before falling.`,
    );
  }
  // Only report upsets from creatures that are still settling in. A veteran
  // having an off day is noise; an unfamiliar creature throwing a battle it
  // should have won is the mechanic explaining itself.
  for (const upset of report.upsets) {
    if (upset.bond >= 0.6) continue;
    log(
      state,
      "upset",
      upset.won
        ? `${upset.name} won one they had no business winning.`
        : `${upset.name} lost one they should have won \u2014 still settling in.`,
    );
  }
  for (const text of report.evolutions) {
    log(state, "evolve", `${text}.`);
  }
  for (const name of report.resignations) {
    log(state, "quit", `${name} resigned and took their partner with them.`);
  }

  return report;
}
