import { GYM_TRAINERS, MORALE, PARTY } from "../constants.js";
import type { Report } from "../report.js";
import { resign } from "./economy.js";
import { partyCapOf } from "./party.js";
import { log } from "../tick.js";
import type { LeagueState, Trainer } from "../types.js";

/**
 * The morale staircase, and the way off it.
 *
 * Morale used to be a cliff: it hit zero and the trainer walked, with nothing
 * the player could do on the descent. Now it descends in steps —
 *
 *   slump      performance suffers, and the player can see it
 *   suspension the trainer is off the board for a while, at reduced standing
 *   departure  after enough suspensions, they are gone for good
 *
 * — and every step lowers `standing`, the ceiling morale can recover to, so the
 * next step arrives sooner. Escalating, not infinite: losing someone for good
 * takes genuine neglect, and standing has a floor so the fall is never bottomless.
 *
 * The load-bearing part is `demote`. A trainer under strain can be moved to a
 * lower posting, which restores morale and standing and takes their party with
 * them. That is the whole reason the staircase exists rather than a cliff: it
 * gives the player a *move*, so morale becomes a decision instead of a tax.
 */

export function isSuspended(state: LeagueState, trainer: Trainer): boolean {
  return trainer.suspendedUntil !== null && state.time < trainer.suspendedUntil;
}

/** Sim-seconds until a suspended trainer is back, or 0. */
export function suspensionRemaining(state: LeagueState, trainer: Trainer): number {
  if (trainer.suspendedUntil === null) return 0;
  return Math.max(0, trainer.suspendedUntil - state.time);
}

/**
 * How well this trainer's creatures fight right now.
 *
 * Full effect above the slump threshold; degrading to `worstPerformance` at
 * zero. Deliberately a modest penalty — morale should make a gym wobble, not
 * collapse, because collapse is what the suspension step is for.
 */
export function moraleFactor(trainer: Trainer): number {
  if (trainer.morale >= MORALE.slumpAt) return 1;
  const t = Math.max(0, trainer.morale) / MORALE.slumpAt;
  return MORALE.worstPerformance + (1 - MORALE.worstPerformance) * t;
}

/** Where a trainer sits in the hierarchy. Higher is more pressure. */
export function postingRank(trainer: Trainer): number {
  switch (trainer.kind) {
    case "champion":
      return 3;
    case "elite":
      return 2;
    case "leader":
      return 1;
    default:
      return 0;
  }
}

export function tickMorale(state: LeagueState, dt: number, report: Report): void {
  for (const trainer of Object.values(state.trainers)) {
    if (trainer.kind === "candidate") continue;

    // Standing caps recovery. A trainer back from two suspensions never returns
    // to full heart, which is what makes the third one arrive faster.
    trainer.morale = Math.min(trainer.morale, trainer.standing);

    if (isSuspended(state, trainer)) {
      // Time off is the point: morale climbs while they are away.
      trainer.morale = Math.min(
        trainer.standing,
        trainer.morale + MORALE.strainRecovery * dt * 0.002,
      );
      continue;
    }

    if (trainer.suspendedUntil !== null) {
      trainer.suspendedUntil = null;
      trainer.strain = 0;
      report.reinstated(trainer.name);
      log(state, "staff", "log.backOnDuty", { name: trainer.name });
      continue;
    }

    if (trainer.morale < MORALE.strainAt) {
      trainer.strain += dt;
    } else {
      trainer.strain = Math.max(0, trainer.strain - MORALE.strainRecovery * dt);
    }

    if (trainer.strain >= MORALE.strainToSuspend) suspend(state, trainer, report);
  }
}

function suspend(state: LeagueState, trainer: Trainer, report: Report): void {
  trainer.suspensions += 1;

  // The last step of the staircase. It takes three of these to get here, and
  // every one of them was avoidable.
  if (trainer.suspensions > MORALE.suspensionsBeforeDeparture) {
    log(state, "staff", "log.goneForGood", { name: trainer.name });
    resign(state, trainer.id, report);
    return;
  }

  trainer.suspendedUntil = state.time + MORALE.suspensionSeconds;
  trainer.strain = 0;
  trainer.standing = Math.max(
    MORALE.minStanding,
    trainer.standing - MORALE.standingPerSuspension,
  );
  trainer.morale = trainer.standing * MORALE.returnMorale;

  report.suspended(trainer.name, trainer.suspensions);
  log(
    state,
    "staff",
    "log.suspended",
    {
      name: trainer.name,
      n: trainer.suspensions,
      max: MORALE.suspensionsBeforeDeparture,
    },
  );
}

// ---------------------------------------------------------------------------
// Demotion — the release valve
// ---------------------------------------------------------------------------

export type DemotionTarget =
  | { kind: "elite"; rank: number; label: string }
  | { kind: "leader"; gymId: string; label: string }
  | { kind: "gym"; gymId: string; label: string };

/**
 * Every lower posting this trainer could actually take.
 *
 * Restricted to gyms matching their affinity, because gyms are type-bound and a
 * Fire leader arriving at a Water gym with a Fire party would quietly break the
 * board's identity. Elite seats are type-free, so any trainer may fill one.
 */
export function demotionTargets(state: LeagueState, trainerId: string): DemotionTarget[] {
  const trainer = state.trainers[trainerId];
  if (!trainer) return [];
  if (trainer.demotionLockedUntil !== null && state.time < trainer.demotionLockedUntil) {
    return [];
  }

  const rank = postingRank(trainer);
  const out: DemotionTarget[] = [];

  if (rank > 2) {
    for (const seat of state.elite) {
      if (seat.trainerId !== null) continue;
      if (seat.rank >= state.elite.length - 1) continue; // the Champion's own seat
      out.push({ kind: "elite", rank: seat.rank, label: `Elite ${seat.rank + 1}` });
    }
  }

  for (const gymId of state.gymOrder) {
    const gym = state.gyms[gymId];
    if (!gym) continue;
    if (gym.type !== trainer.affinity) continue;

    if (rank > 1 && gym.leaderId === null) {
      out.push({ kind: "leader", gymId, label: `${gym.name} — Leader` });
    }
    if (rank > 0 && gym.trainerIds.length < gym.trainerSlots && gym.id !== trainer.gymId) {
      out.push({ kind: "gym", gymId, label: `${gym.name} — Gym Trainer` });
    }
  }

  return out;
}

/** Detach a trainer from whatever post currently holds them. */
function vacate(state: LeagueState, trainer: Trainer): void {
  const gym = trainer.gymId ? state.gyms[trainer.gymId] : undefined;
  if (gym) {
    if (gym.leaderId === trainer.id) gym.leaderId = null;
    gym.trainerIds = gym.trainerIds.filter((id) => id !== trainer.id);
  }
  for (const seat of state.elite) {
    if (seat.trainerId === trainer.id) seat.trainerId = null;
  }
  trainer.gymId = null;
}

/**
 * Move a trainer to a lower posting, voluntarily.
 *
 * Their party travels with them, capped to the new role, overflow to the box —
 * and crucially **bond is untouched**. A demoted Leader arriving with the
 * creature they have been bonded to for nine hundred battles is the story the
 * bond system exists to tell; resetting it here would throw that away to save a
 * line of code.
 */
export function demote(
  state: LeagueState,
  trainerId: string,
  target: DemotionTarget,
): { ok: true } | { ok: false; reason: string } {
  const trainer = state.trainers[trainerId];
  if (!trainer) return { ok: false, reason: "No such trainer" };
  if (trainer.demotionLockedUntil !== null && state.time < trainer.demotionLockedUntil) {
    return { ok: false, reason: `${trainer.name} refuses to step down` };
  }

  const legal = demotionTargets(state, trainerId).some(
    (t) =>
      t.kind === target.kind &&
      (t.kind === "elite"
        ? t.rank === (target as { rank: number }).rank
        : (t as { gymId: string }).gymId === (target as { gymId: string }).gymId),
  );
  if (!legal) return { ok: false, reason: "That posting is not open" };

  vacate(state, trainer);

  if (target.kind === "elite") {
    const seat = state.elite.find((s) => s.rank === target.rank);
    if (!seat) return { ok: false, reason: "Seat vanished" };
    seat.trainerId = trainer.id;
    trainer.kind = "elite";
    trainer.partyCap = PARTY.max;
  } else {
    const gym = state.gyms[target.gymId];
    if (!gym) return { ok: false, reason: "Gym vanished" };
    trainer.gymId = gym.id;
    if (target.kind === "leader") {
      gym.leaderId = trainer.id;
      trainer.kind = "leader";
      trainer.partyCap = PARTY.max;
    } else {
      gym.trainerIds.push(trainer.id);
      trainer.kind = "gym";
      trainer.partyCap = Math.min(trainer.partyCap, GYM_TRAINERS.partyMax);
    }
  }

  trimParty(state, trainer);

  // The valve opens: less pressure, and some standing back.
  trainer.morale = Math.min(1, trainer.morale + MORALE.demotionRelief);
  trainer.standing = Math.min(1, trainer.standing + MORALE.demotionStandingRelief);
  trainer.morale = Math.min(trainer.morale, trainer.standing);
  trainer.strain = 0;

  log(state, "staff", "log.stepsDown", { name: trainer.name, post: target.label });
  return { ok: true };
}

/**
 * Shed party members the new posting cannot hold — signature creature first in
 * the queue to stay, since it is welded to the trainer and cannot be boxed.
 */
function trimParty(state: LeagueState, trainer: Trainer): void {
  const cap = partyCapOf(trainer, state);
  if (trainer.party.length <= cap) return;

  const ordered = [
    ...trainer.party.filter((id) => id === trainer.signatureId),
    ...trainer.party.filter((id) => id !== trainer.signatureId),
  ];
  const keep = ordered.slice(0, cap);
  const drop = ordered.slice(cap);

  for (const id of drop) {
    const c = state.creatures[id];
    if (!c) continue;
    // Bond survives the move. That is the entire point.
    c.role = "reserve";
    c.trainerId = null;
    c.gymId = null;
  }
  trainer.party = keep;
}
