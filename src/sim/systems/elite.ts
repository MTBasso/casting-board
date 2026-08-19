import { ELITE, LEAGUE } from "../constants.js";
import { emptyThreatReport, makeTrainer } from "../factory.js";
import { isSuspended } from "./morale.js";
import { leaderLevel } from "./league.js";
import { canJoin, join, leaveParty, partyOf } from "./party.js";
import { fieldedLevel, makeChallenger, runChallenge } from "./challenge.js";
import { tierMultiplier } from "./promotion.js";
import { forceRecruit } from "./title.js";
import type {
  Challenger,
  Creature,
  EliteSeat,
  Gym,
  LeagueState,
  TickReport,
  Trainer,
  TypeId,
} from "../types.js";

/**
 * The Elite Four, and the Champion above them.
 *
 * These are *people* — trainers stronger than any Gym Leader, each with their
 * own team, and the Champion stronger still. A challenger who beats every gym
 * earns a run at them and faces each seat in order.
 *
 * Mechanically this is the league's endgame: rare, high-stakes events rather
 * than the steady trickle the gyms handle. Turning a run away pays far more than
 * any gym wave. Losing one means a challenger has taken your league.
 */

export function eliteUnlocked(state: LeagueState): boolean {
  return state.gymOrder.length >= LEAGUE.maxGyms;
}

export function isChampion(seat: EliteSeat): boolean {
  return seat.rank === ELITE.championRank;
}

/** A key and its parameter, like everything else the sim names. */
export function seatTitle(seat: EliteSeat): { key: string; n: number } {
  return isChampion(seat)
    ? { key: "elite.champion", n: 0 }
    : { key: "elite.seat", n: seat.rank + 1 };
}

/** Create the empty seats the moment the board is complete. */
export function ensureSeats(state: LeagueState): void {
  if (!eliteUnlocked(state)) return;
  if (state.elite.length > 0) return;

  for (let rank = 0; rank <= ELITE.championRank; rank++) {
    state.elite.push({ rank, trainerId: null });
  }
  // Give the player a full interval to staff the seats before the first
  // challenger arrives — opening the tier should not immediately cost them it.
  state.gauntletCooldown = ELITE.intervalSeconds;
}

export function staffedSeats(state: LeagueState): number {
  return state.elite.filter((s) => s.trainerId !== null).length;
}

export function hireCost(state: LeagueState): number {
  return Math.round(ELITE.hireCostBase * ELITE.hireCostGrowth ** staffedSeats(state));
}

export function canStaff(
  state: LeagueState,
  rank: number,
  type: TypeId,
): { ok: true; cost: number } | { ok: false; reason: string } {
  if (!eliteUnlocked(state)) {
    return { ok: false, reason: `Build all ${LEAGUE.maxGyms} gyms first` };
  }
  const seat = state.elite.find((s) => s.rank === rank);
  if (!seat) return { ok: false, reason: "No such seat" };
  if (seat.trainerId !== null) return { ok: false, reason: "Already staffed" };

  const cost = hireCost(state);
  if (state.money < cost) return { ok: false, reason: `Costs ${cost}` };
  void type;
  return { ok: true, cost };
}

/**
 * Hire an Elite trainer into a seat. Like a Gym Leader they arrive with their
 * signature creature, which joins their team.
 */
export function staffSeat(
  state: LeagueState,
  rank: number,
  type: TypeId,
): { ok: true; trainerId: string } | { ok: false; reason: string } {
  const check = canStaff(state, rank, type);
  if (!check.ok) return check;

  const seat = state.elite.find((s) => s.rank === rank);
  if (!seat) return { ok: false, reason: "No such seat" };

  state.money -= check.cost;
  // The Elite are the strongest people in the league; they do not arrive with
  // level 1 creatures. Scaled a step above what a Gym Leader brings.
  const trainer = makeTrainer(
    state,
    type,
    seat.rank === ELITE.championRank ? "champion" : "elite",
    { level: Math.round(leaderLevel(state) * ELITE.signatureLevelFactor) },
  );
  seat.trainerId = trainer.id;
  return { ok: true, trainerId: trainer.id };
}

/** An Elite seat's party is just its trainer's party. */
export function seatParty(state: LeagueState, seat: EliteSeat): Creature[] {
  if (!seat.trainerId) return [];
  return partyOf(state, seat.trainerId);
}

export function canAssign(
  state: LeagueState,
  creatureId: string,
  rank: number,
): { ok: true } | { ok: false; reason: string } {
  const seat = state.elite.find((s) => s.rank === rank);
  if (!seat) return { ok: false, reason: "No such seat" };
  if (seat.trainerId === null) return { ok: false, reason: "Seat has no trainer" };
  return canJoin(state, creatureId, seat.trainerId);
}

export function assignToSeat(
  state: LeagueState,
  creatureId: string,
  rank: number,
): { ok: true } | { ok: false; reason: string } {
  const seat = state.elite.find((s) => s.rank === rank);
  if (!seat?.trainerId) return { ok: false, reason: "Seat has no trainer" };
  return join(state, creatureId, seat.trainerId);
}

export function removeFromSeat(
  state: LeagueState,
  creatureId: string,
): { ok: true } | { ok: false; reason: string } {
  const creature = state.creatures[creatureId];
  if (!creature) return { ok: false, reason: "Not found" };
  const trainer = creature.trainerId ? state.trainers[creature.trainerId] : undefined;
  if (trainer?.signatureId === creatureId) {
    return { ok: false, reason: "Signature creatures stay with their trainer" };
  }
  leaveParty(state, creatureId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The gauntlet
// ---------------------------------------------------------------------------

export interface GauntletResult {
  /** How many seats the challenger got past. */
  cleared: number;
  /** True when the challenger beat every seat and took the league. */
  tookLeague: boolean;
  receipts: number;
}

/**
 * Run one challenger through the seats in order.
 *
 * The same party-against-party battle a gym runs, against the five strongest
 * trainers in the league — and only challengers who cleared all eight gyms get
 * here, so they arrive with a full team and a pocketful of Revives. Faints carry
 * from seat to seat, which is why an Elite tier staffed four deep is worth so
 * much more than one staffed twice.
 */
export function runGauntlet(state: LeagueState, report: TickReport): GauntletResult {
  const seats = [...state.elite].sort((a, b) => a.rank - b.rank);
  // Scaled to the tier that will meet them, floored against the league that
  // produced the challenger. Someone who fought through eight gyms is a product
  // of the board the player built, so an under-staffed Elite stays a genuine
  // liability — but the tier fights an hour apart, so it is never asked to match
  // gyms that fight every few seconds.
  const defending = seats.flatMap((seat) =>
    seat.trainerId ? partyOf(state, seat.trainerId) : [],
  );
  const floor = fieldedLevel(state) * ELITE.challengerFloorOfLeague;
  const reference = defending.length > 0 ? defending : undefined;
  const challenger = makeChallenger(
    state,
    ELITE.challengerBadges,
    reference,
    floor,
  );
  challenger.revives += ELITE.extraRevives;

  let cleared = 0;
  for (const seat of seats) {
    const trainer = seat.trainerId ? state.trainers[seat.trainerId] : undefined;
    // An empty seat is a free pass — and a suspended one is the same hole by a
    // different name, which is what makes morale an endgame concern too.
    if (!trainer || trainer.party.length === 0 || isSuspended(state, trainer)) {
      cleared += 1;
      continue;
    }

    const outcome = battleSeat(state, trainer, challenger, report);
    if (outcome) break;
    cleared += 1;
  }

  const tookLeague = cleared >= seats.length;
  const receipts =
    (ELITE.receiptsBase + cleared * ELITE.receiptsPerStage) *
    tierMultiplier(state.tier) *
    (tookLeague ? 0.4 : 1);

  state.money += receipts;
  if (tookLeague) {
    state.leagueTaken += 1;
    state.renown = Math.max(0, state.renown - ELITE.renownForLosing);
    // Not a fail state — a staffing problem with a face on it.
    forceRecruit(state, challenger, cleared, report);
  } else {
    state.renown += ELITE.renownForHolding;
  }

  report.earned += receipts;
  return { cleared, tookLeague, receipts };
}

/** True when the seat held. */
function battleSeat(
  state: LeagueState,
  trainer: Trainer,
  challenger: Challenger,
  report: TickReport,
): boolean {
  // Reuse the gym battle wholesale by treating the seat as a one-trainer gym.
  const fake: Gym = {
    id: `elite_${trainer.id}`,
    type: trainer.affinity,
    name: trainer.name,
    leaderId: trainer.id,
    trainerIds: [],
    trainerSlots: 0,
    everBonded: false,
    waveCooldown: 0,
    threat: emptyThreatReport(),
  };
  const result = runChallenge(state, fake, challenger, report);
  return !result.tookBadge;
}

export function tickElite(state: LeagueState, dt: number, report: TickReport): void {
  ensureSeats(state);
  if (!eliteUnlocked(state)) return;

  state.gauntletCooldown -= dt;
  let guard = 0;
  while (state.gauntletCooldown <= 0 && guard < 16) {
    const result = runGauntlet(state, report);
    report.gauntlets.push(result);
    state.gauntletCooldown += ELITE.intervalSeconds;
    guard += 1;
  }
}
