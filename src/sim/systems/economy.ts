import { CATCHER, FATIGUE, STAFF } from "../constants.js";
import { isSuspended } from "./morale.js";

import { recoverySpeed } from "./facilities.js";
import type { LeagueState, TickReport } from "../types.js";

/**
 * Recurring salary is what separates a tycoon from a shop: every hire is a
 * permanent commitment against future income. Underpay to expand and leaders
 * start quitting — taking their signature creature with them.
 */
export function payroll(state: LeagueState, dt: number, report: TickReport): void {
  const hours = dt / 3600;

  for (const trainer of Object.values(state.trainers)) {
    // Candidates are not on the payroll — they have not been hired yet.
    if (trainer.kind === "candidate") continue;
    // Nor is a suspended trainer: unpaid leave is what makes a suspension a
    // reprieve for the payroll as well as a hole in the board.
    if (isSuspended(state, trainer)) continue;
    trainer.tenure += dt;
    const tenureHours = trainer.tenure / 3600;
    const owed =
      trainer.salary * (1 + tenureHours * STAFF.salaryPerTenureHour) * hours;

    if (state.money >= owed) {
      state.money -= owed;
      report.paid += owed;
      trainer.morale = Math.min(1, trainer.morale + STAFF.moraleRecovery * dt);
    } else {
      // Partial payment still happens; morale absorbs the rest.
      report.paid += state.money;
      state.money = 0;
      trainer.morale -= STAFF.moraleLossUnpaid * dt;
    }

    // A leader watching their gym lose loses heart even when paid.
    const gym = trainer.gymId ? state.gyms[trainer.gymId] : undefined;
    if (gym && gym.threat.status === "critical") {
      trainer.morale -= STAFF.moraleLossLosing * dt;
    }

    // Standing is the ceiling; the staircase in `morale.ts` lowers it.
    trainer.morale = Math.max(0, Math.min(trainer.standing, trainer.morale));
  }
}

/**
 * A resignation evicts a pair. The signature creature is not yours — it was
 * never yours — so it leaves with its trainer.
 */
export function resign(
  state: LeagueState,
  trainerId: string,
  report: TickReport,
): void {
  const trainer = state.trainers[trainerId];
  if (!trainer) return;

  const gym = trainer.gymId ? state.gyms[trainer.gymId] : undefined;
  if (gym) {
    if (gym.leaderId === trainerId) gym.leaderId = null;
    gym.trainerIds = gym.trainerIds.filter((id) => id !== trainerId);
  }
  for (const seat of state.elite) {
    if (seat.trainerId === trainerId) seat.trainerId = null;
  }

  // The signature creature is not yours — it was never yours — so it leaves
  // with its trainer. The rest of the party goes back to the box.
  for (const id of trainer.party) {
    const c = state.creatures[id];
    if (!c) continue;
    if (id === trainer.signatureId) {
      delete state.creatures[id];
      continue;
    }
    c.role = "reserve";
    c.trainerId = null;
    c.gymId = null;
  }

  delete state.trainers[trainerId];
  report.resignations.push(trainer.name);
}

/**
 * Fatigue recovery for everyone not currently mid-wave.
 *
 * A creature out on a route is working, not resting, so it recovers at a
 * fraction of the normal rate. Without that, route work was free: rest outpaced
 * it and a posted partner sat at zero fatigue forever, which made the one cost
 * route work has into no cost at all.
 */
export function recover(state: LeagueState, dt: number): void {
  const amount = FATIGUE.recoveryPerSecond * dt * recoverySpeed(state);
  const working = new Set<string>();
  for (const posting of state.postings) {
    if (posting.resting) continue;
    for (const id of state.trainers[posting.trainerId]?.party ?? []) working.add(id);
  }
  for (const c of Object.values(state.creatures)) {
    if (c.fatigue <= 0) continue;
    // Only a partner actually on the route recovers slowly. One sitting the
    // shift out rests like anyone else, which is what lets the posting resume.
    const rate = working.has(c.id) ? amount * CATCHER.restWhilePosted : amount;
    c.fatigue = Math.max(0, c.fatigue - rate);
  }
}
