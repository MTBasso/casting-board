import {
  CAREER,
  CHALLENGE_GATE,
  FATIGUE,
  OFFLINE_ANALYTIC_THRESHOLD_SECONDS,
  OFFLINE_CAP_SECONDS,
  RENOWN,
  STAFF,
  TITLE,
  WAVE,
} from "./constants.js";
import { levelFor, partySizeFor } from "./systems/challenge.js";
import { runGauntlet } from "./systems/elite.js";
import { awayRate } from "./systems/facilities.js";
import { tierMultiplier } from "./systems/promotion.js";
import { driftMeta } from "./systems/meta.js";
import { tickField } from "./systems/field.js";
import { displayName, retire } from "./systems/wave.js";
import { challengeInterval, emptyReport, log, tick } from "./tick.js";
import type { Creature, LeagueState, TickReport } from "./types.js";

/**
 * Offline catch-up.
 *
 * This is the load-bearing performance decision of the whole project. Twelve
 * hours at one tick per second is 43,200 ticks; stepping those on every app
 * open is a multi-second freeze that gets worse as the roster grows. So:
 *
 *   - short absences step the real sim (exact, cheap)
 *   - long absences resolve analytically (approximate, instant)
 *
 * The approximation deliberately runs a little *pessimistic*. Offline should
 * never outperform playing, or the optimal strategy becomes closing the app.
 */
export function resolveOffline(
  state: LeagueState,
  elapsedSeconds: number,
): TickReport {
  // The true absence and the *credited* absence are different numbers. Earnings
  // are capped at twelve hours; the title rule needs to know you were gone three
  // weeks, which capped time can never tell it.
  const absence = Math.max(0, elapsedSeconds);
  const elapsed = Math.min(absence, OFFLINE_CAP_SECONDS);
  if (elapsed <= 0) return emptyReport();

  const report =
    elapsed <= OFFLINE_ANALYTIC_THRESHOLD_SECONDS
      ? stepExact(state, elapsed)
      : stepAnalytic(state, elapsed);

  resolveTitleWhileAway(state, absence, report);
  return report;
}

/**
 * The 15-day rule.
 *
 * The title cannot be taken while the player is away — not for a night, not for
 * a fortnight. Past that the protection *decays* rather than snapping, and the
 * sim then runs the real gauntlet against the real lineup. A player who left a
 * fortress may genuinely hold, which is the whole reason the rule is worth
 * having: it rewards leaving the league in good shape instead of just punishing
 * absence.
 *
 * Note this is the only place a gauntlet runs offline at all. The analytic pass
 * deliberately does not, which is what makes "safe while away" true rather than
 * merely likely.
 */
function resolveTitleWhileAway(
  state: LeagueState,
  absenceSeconds: number,
  report: TickReport,
): void {
  const days = absenceSeconds / 86_400;
  if (days <= TITLE.safeDays) return;

  const exposure = Math.min(1, (days - TITLE.safeDays) / TITLE.decayDays);
  const runs = 1 + Math.floor(exposure * 3);

  const before = state.leagueTaken;
  for (let i = 0; i < runs; i++) {
    const result = runGauntlet(state, report);
    report.gauntlets.push(result);
    if (result.tookLeague) break;
  }

  cushionOnReturn(state, state.leagueTaken > before);
}

/**
 * The returning-player cushion.
 *
 * Coming back to a wrecked league and a demoralised staff is how an idle game
 * loses someone for good. Whatever happened while they were gone, the roster is
 * rested and nobody is one bad hour from walking out.
 */
function cushionOnReturn(state: LeagueState, titleFell: boolean): void {
  for (const trainer of Object.values(state.trainers)) {
    trainer.morale = trainer.standing;
    trainer.strain = 0;
    trainer.suspendedUntil = null;
  }
  for (const creature of Object.values(state.creatures)) {
    creature.fatigue = 0;
  }
  if (titleFell) {
    // Half the usual protection: you were not there to make the call, so you
    // get the argument sooner.
    const usurper = state.usurperId ? state.trainers[state.usurperId] : undefined;
    if (usurper && usurper.demotionLockedUntil !== null) {
      usurper.demotionLockedUntil =
        state.time + (usurper.demotionLockedUntil - state.time) / 2;
    }
  }
}

function stepExact(state: LeagueState, elapsed: number): TickReport {
  const total = emptyReport();
  let remaining = elapsed;
  while (remaining > 0) {
    const dt = Math.min(1, remaining);
    merge(total, tick(state, dt));
    remaining -= dt;
  }
  return total;
}

// The flat 0.85 that used to live here is now `awayRate` — a floor the player
// raises with the Operations Office and their staff's morale, rather than a
// penalty they could neither see nor do anything about.

/**
 * Long absences, resolved in one pass.
 *
 * Deliberately an estimate rather than a replay. A challenge is now fifteen to
 * twenty exchanges across several parties, and simulating twelve hours of them
 * on every app open is exactly the freeze this path exists to avoid.
 *
 * It runs pessimistic on purpose: offline must never outperform playing.
 */
function stepAnalytic(state: LeagueState, elapsed: number): TickReport {
  const report = emptyReport();
  const away = awayRate(state);

  for (const gymId of state.gymOrder) {
    const gym = state.gyms[gymId];
    if (!gym) continue;

    const challenges = Math.floor(elapsed / challengeInterval(state));
    if (challenges <= 0) continue;

    const rank = state.gymOrder.indexOf(gymId);
    const defenders = [...gym.trainerIds, ...(gym.leaderId ? [gym.leaderId] : [])];

    // How much the gym can field, versus what a typical challenger brings.
    let ours = 0;
    let bodies = 0;
    const facing: Creature[] = [];
    for (const tid of defenders) {
      for (const id of state.trainers[tid]?.party ?? []) {
        const c = state.creatures[id];
        if (!isActive(c)) continue;
        ours += c.power * (1 - c.fatigue * 0.4);
        bodies += 1;
        facing.push(c);
      }
    }

    if (bodies === 0) {
      state.renown = Math.max(0, state.renown - challenges * RENOWN.perBadgeLost);
      report.wavesResolved += challenges;
      report.badgesLost += challenges;
      continue;
    }

    const badges = Math.max(0, rank);
    const theirs =
      partySizeFor(badges) *
      // Same challenger the online path would send: scaled to this gym's own
      // defenders, not to a league-wide average. Modelling a different opponent
      // offline is how offline drifts away from being pessimistic.
      levelFor(state, badges, facing) *
      OFFLINE_CHALLENGER_SCALE;
    const holdRate = clamp01(ours / Math.max(1, ours + theirs));

    const held = Math.round(challenges * holdRate);
    const lost = challenges - held;

    // Receipts follow how far a challenger got, so they have to follow the
    // modelled hold rate. A flat "cleared 60% of the gym" assumption paid for a
    // gym being overrun even while the same gym was holding 96% of the time
    // online — which is how offline came to out-earn playing.
    const cleared = defenders.length * (1 - holdRate);
    const gate =
      challenges *
      (CHALLENGE_GATE.base + cleared * CHALLENGE_GATE.perTrainerCleared) *
      (1 + state.renown * WAVE.receiptsPerRenown) *
      tierMultiplier(state.tier) *
      away;

    state.money += gate;
    state.renown = Math.max(
      0,
      state.renown + held * RENOWN.perChallengeHeld * away - lost * RENOWN.perBadgeLost,
    );

    report.wavesResolved += challenges;
    report.wavesWon += held;
    report.earned += gate;
    report.badgesLost += lost;

    // Spread the wear across everyone who would have fought.
    const exchangesEach = (challenges * OFFLINE_EXCHANGES_PER_CHALLENGE) / bodies;
    for (const tid of defenders) {
      for (const id of state.trainers[tid]?.party ?? []) {
        const c = state.creatures[id];
        if (!isActive(c)) continue;
        c.careerSpent += exchangesEach * CAREER.costPerExchange;
        c.fatigue = clamp01(c.fatigue + exchangesEach * FATIGUE.perExchange * 0.25);
        if (c.careerSpent >= c.careerTotal) {
          report.retirements.push(displayName(c));
          retire(state, c);
        }
      }
    }
  }

  // Payroll for the whole span.
  const hours = elapsed / 3600;
  for (const trainer of Object.values(state.trainers)) {
    if (trainer.kind === "candidate") continue;
    trainer.tenure += elapsed;
    const owed =
      trainer.salary * (1 + (trainer.tenure / 3600) * STAFF.salaryPerTenureHour) * hours;
    const paid = Math.min(state.money, owed);
    state.money -= paid;
    report.paid += paid;
    if (paid < owed) {
      trainer.morale = Math.max(
        0,
        trainer.morale - STAFF.moraleLossUnpaid * (elapsed * (1 - paid / Math.max(owed, 1))),
      );
    }
  }

  // Creatures rest between challenges.
  for (const c of Object.values(state.creatures)) {
    if (c.fatigue > 0) {
      c.fatigue = Math.max(0, c.fatigue - FATIGUE.recoveryPerSecond * elapsed * 0.5);
    }
  }

  state.meta.nextDriftIn -= elapsed;
  let guard = 0;
  while (state.meta.nextDriftIn <= 0 && guard < 128) {
    driftMeta(state);
    guard += 1;
  }

  state.time += elapsed;
  tickField(state, elapsed, report);

  // Standing fades offline exactly as it does online. Without this the analytic
  // pass let renown climb un-braked while away, and offline quietly out-earned
  // playing — which makes closing the app the optimal move.
  state.renown *= Math.pow(0.5, elapsed / RENOWN.decayHalfLifeSeconds);

  if (state.renown > state.peakRenown) state.peakRenown = state.renown;

  log(
    state,
    "wave",
    "log.whileAway",
    {
      waves: report.wavesResolved,
      money: Math.round(report.earned),
      caught: report.caught.length,
    },
  );

  return report;
}

/** Rough strength-per-level-per-creature for a challenger, offline only. */
const OFFLINE_CHALLENGER_SCALE = 2.6;
/** Typical exchanges a single challenge costs the gym. */
const OFFLINE_EXCHANGES_PER_CHALLENGE = 6;

function isActive(c: Creature | undefined): c is Creature {
  return c !== undefined && c.role !== "retired";
}


function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function merge(into: TickReport, from: TickReport): void {
  into.wavesResolved += from.wavesResolved;
  into.wavesWon += from.wavesWon;
  into.earned += from.earned;
  into.paid += from.paid;
  into.retirements.push(...from.retirements);
  into.resignations.push(...from.resignations);
}
