import { catalog } from "../data/catalog.js";
import { RANGER, ELITE, MORALE } from "./constants.js";
import { pick } from "./rng.js";
import { makeCreature } from "./factory.js";
import {
  addToCrew,
  canHire,
  canPost,
  crewOf,
  eligibleRoutes,
  fieldOffer,
  fieldStaff,
  hire,
  post,
  postingFor,
} from "./systems/field.js";
import { canStaff, ensureSeats, eliteUnlocked, runGauntlet } from "./systems/elite.js";
import { staffSeat } from "./systems/elite.js";
import { acceptGymOffer, canHireGymTrainer, checkGymUnlock, chooseLeader, hireGymTrainer } from "./systems/league.js";
import { autoFillAll } from "./systems/party.js";
import { emptyReport } from "./tick.js";
import { nextRival, tickRivals } from "./systems/rivals.js";
import { TYPES, type LeagueState, type TypeId } from "./types.js";

/**
 * Situations the game takes hours to reach, reachable in one click.
 *
 * These live in the sim rather than the DevBar because they are *state*
 * transitions, and the sim owns those — a dev button that reached into the
 * league from the UI would be the one code path not covered by the same rules
 * as everything else.
 *
 * They exist because the states worth testing are the ones furthest from the
 * opening screen. The Elite tier shipped losing 89% of its gauntlets partly
 * because reaching it took forty sim-hours, so nobody watched one often enough
 * to notice.
 *
 * Only ever called from dev-gated UI; the bundler drops the callers in a
 * production build.
 */

/** Open and staff every gym the tier allows. */
export function buildOutBoard(state: LeagueState): void {
  state.money += 5_000_000;
  state.peakRenown = Math.max(state.peakRenown, 100_000);

  for (let i = 0; i < 20; i++) {
    checkGymUnlock(state);
    const type = state.gymOffer?.[0];
    if (type) acceptGymOffer(state, type);
    const candidate = state.leaderOffer?.trainerIds[0];
    if (candidate) chooseLeader(state, candidate);
  }
  ensureSeats(state);
}

/** Fill every junior slot, every Elite seat, and every posting. */
export function staffEverything(state: LeagueState): void {
  state.money += 5_000_000;

  for (const gymId of state.gymOrder) {
    let guard = 0;
    while (canHireGymTrainer(state, gymId).ok && guard < 8) {
      hireGymTrainer(state, gymId);
      guard += 1;
    }
  }

  ensureSeats(state);
  for (const seat of state.elite) {
    if (seat.trainerId !== null) continue;
    const type = TYPES.find((t) => canStaff(state, seat.rank, t).ok);
    if (type) staffSeat(state, seat.rank, type);
  }

  fillFieldStaff(state);
  postEveryone(state);
  autoFillAll(state);
}

/** Hire up to every field slot, taking whatever the offer happens to show. */
function fillFieldStaff(state: LeagueState): void {
  for (const role of ["ranger", "handler"] as const) {
    let guard = 0;
    while (canHire(state, role).ok && guard < 12) {
      const type = fieldOffer(state, role)[0];
      if (!type) break;
      hire(state, role, type);
      guard += 1;
    }
  }
}

/** Crew and post every idle field trainer on the best ground they can hold. */
function postEveryone(state: LeagueState): void {
  const routes = [...eligibleRoutes(state)].sort((a, b) => b.levelMax - a.levelMax);

  for (const role of ["ranger", "handler"] as const) {
    for (const trainer of fieldStaff(state, role)) {
      if (postingFor(state, trainer.id)) continue;

      const bench = Object.values(state.creatures)
        .filter((c) => c.role === "reserve" && c.owned)
        .sort((a, b) => b.level - a.level);
      for (const c of bench) {
        if (crewOf(state, trainer.id).length >= trainer.partyCap) break;
        addToCrew(state, c.id, trainer.id);
      }

      for (const route of routes) {
        if (canPost(state, route.id, trainer.id).ok) {
          post(state, route.id, trainer.id);
          break;
        }
      }
    }
  }
}

/**
 * Drop assorted creatures into the box.
 *
 * Weighted toward types the board actually staffs, because the interesting test
 * is a full roster to cast from — not a box of things no gym can field.
 */
export function fillBox(state: LeagueState, count: number): void {
  const wanted = Object.values(state.trainers)
    .filter((t) => t.kind !== "candidate" && t.kind !== "ranger")
    .map((t) => t.affinity);

  for (let i = 0; i < count; i++) {
    const type: TypeId =
      wanted.length > 0 && i % 3 !== 0 ? pick(state.rng, wanted) : pick(state.rng, TYPES);
    const pool = catalog.wildByType(type);
    if (pool.length === 0) continue;
    makeCreature(state, pick(state.rng, pool), "reserve", { level: 12 });
  }
}

/** Land the next rival challenge right now. */
export function forceRival(state: LeagueState): void {
  const report = emptyReport();
  if (!nextRival(state)) {
    state.rivalCooldown = 0;
    tickRivals(state, 1, report);
  }
  const rival = nextRival(state);
  if (rival) rival.arrivesAt = state.time;
  tickRivals(state, 1, report);
}

/** Run an Elite gauntlet immediately — the only way to see forced recruitment. */
export function forceGauntlet(state: LeagueState): void {
  ensureSeats(state);
  if (!eliteUnlocked(state)) return;
  const report = emptyReport();
  runGauntlet(state, report);
  state.gauntletCooldown = ELITE.intervalSeconds;
}

/**
 * Push every trainer to the edge of a suspension.
 *
 * The morale staircase is the hardest thing in the game to reach honestly —
 * money is never scarce enough for long enough — so it is the thing most in
 * need of a button.
 */
export function grindMorale(state: LeagueState): void {
  for (const trainer of Object.values(state.trainers)) {
    if (trainer.kind === "candidate") continue;
    trainer.morale = 0;
    trainer.strain = MORALE.strainToSuspend * 0.95;
  }
}

/** Fatigue every posted partner, to watch a duty cycle turn over. */
export function tireCrews(state: LeagueState): void {
  for (const posting of state.postings) {
    for (const c of crewOf(state, posting.trainerId)) c.fatigue = RANGER.tiredAt;
  }
}
