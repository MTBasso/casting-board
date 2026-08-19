
import { uniformTally } from "../data/typechart.js";
import { META, SCOUTING } from "./constants.js";
import { seedMap } from "./systems/field.js";
import { checkGymUnlock } from "./systems/league.js";
import type { LeagueState } from "./types.js";

/**
 * Bump this whenever LeagueState gains or changes a field, and add a step in
 * `migrate.ts`. Block 2 added routes/expeditions/undercardSlots without bumping
 * it, which let stale saves through the version check and crashed the app on
 * load — hence v2 and the defensive normalize pass.
 */
export const SAVE_VERSION = 25;

/**
 * The first hour, per the design doc: one trainer, one signature creature,
 * one gym, no money. Systems arrive one at a time. The player's third named
 * creature should not exist yet — attention is the constraint being taught.
 */
export function createInitialState(seed = 1): LeagueState {
  const state: LeagueState = {
    version: SAVE_VERSION,
    time: 0,
    rng: { seed: seed | 0 },
    tier: "regional",
    money: 0,
    renown: 0,
    peakRenown: 0,
    creatures: {},
    trainers: {},
    gyms: {},
    gymOrder: [],
    meta: {
      weights: uniformTally(),
      nextDriftIn: META.driftIntervalSeconds,
      season: 0,
    },
    routeIntel: {},
    hall: [],
    legends: [],
    facilities: {},
    elite: [],
    gauntletCooldown: 0,
    autoFillIn: 0,
    battles: {},
    rivals: [],
    rivalCooldown: 0,
    doctrineChanges: 0,
    retiredRivals: [],
    leagueTaken: 0,
    usurperId: null,
    titleLost: false,
    grudges: [],
    crews: [],
    expeditions: [],
    crewOffer: [],
    explored: [],
    known: {},
    bans: {},
    lastSeenAt: 0,
    dayCare: [],
    eggProgress: 0,
    gymOffer: null,
    gymOfferMinimized: false,
    leaderOffer: null,
    log: [],
    nextIds: {},
  };

  foundLeague(state);
  return state;
}

/**
 * Set up a league's opening position: one gym, one leader, a thin bench.
 *
 * Shared by `createInitialState` and by promotion. They used to build the
 * opening separately, and promotion quietly skipped the starting undercard —
 * which made every league after the first *worse off* than the first, and made
 * the balance runner report that run two was slower than run one. Anything that
 * founds a league goes through here.
 */
export function foundLeague(state: LeagueState): void {
  // A league begins with a decision, not a gym somebody else chose. The type
  // offer opens immediately and the first gym is free; picking it opens the
  // Leader offer, exactly as every later gym does.
  //
  // It also begins with a handful of creatures. Rangers have to be hired and
  // posted, and a league with nobody to post would open on a dead screen.
  seedMap(state);
  // A league opens able to make its first move. Rangers are the only source of
  // creatures now, so the money to hire one is part of the opening position.
  state.money = Math.max(state.money, SCOUTING.startingMoney);
  checkGymUnlock(state);
}

/** Structural clone that survives JSON round-tripping. Used by save and tests. */
export function cloneState(state: LeagueState): LeagueState {
  return JSON.parse(JSON.stringify(state)) as LeagueState;
}
