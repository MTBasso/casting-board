import { catalog } from "../data/catalog.js";
import { ROUTES } from "../data/routes.js";
import { ELITE, MORALE } from "./constants.js";
import { pick } from "./rng.js";
import { makeCreature } from "./factory.js";
import {
  canHireCrew,
  canPushOnFrom,
  crewOffer,
  expeditionOf,
  expeditionOn,
  hireCrew,
  isOpen,
  open as openRoute,
  openRoutes,
  send,
  trainableFor,
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

  staffField(state);
  autoFillAll(state);
}

/** Hire up to every crew slot and send them all somewhere useful. */
function staffField(state: LeagueState): void {
  let guard = 0;
  while (canHireCrew(state).ok && guard < 12) {
    const offer = crewOffer(state)[0];
    if (!offer || !hireCrew(state, offer.id).ok) break;
    guard += 1;
  }

  for (const crew of state.crews) {
    if (expeditionOf(state, crew.id)) continue;
    const route = openRoutes(state).find((r) => !expeditionOn(state, r.id));
    if (!route) continue;

    const onward = canPushOnFrom(state, route.id)
      ? route.neighbours.find((n) => !isOpen(state, n))
      : undefined;

    send(
      state,
      crew.id,
      route.id,
      onward ? "explore" : "work",
      onward ?? null,
      { balls: 16, potions: 8, revives: 3, lures: 3 },
      trainableFor(state, crew, route).slice(0, 4).map((c) => c.id),
    );
  }
}

/** Put the whole map on the table, for testing the far end. */
export function revealMap(state: LeagueState): void {
  for (const route of ROUTES) {
    openRoute(state, route.id);
    state.known[route.id] = 99;
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
export function wearCrews(state: LeagueState): void {
  for (const trip of state.expeditions) trip.hurt = 0.9;
}
