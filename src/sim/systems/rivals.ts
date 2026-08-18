import { catalog, minLevelFor } from "../../data/catalog.js";
import { effectivenessAgainst } from "../../data/typechart.js";
import { GYM_TRAINERS, RIVAL } from "../constants.js";
import { addGymTrainer, makeTrainer } from "../factory.js";
import { int, pick, weighted } from "../rng.js";
import { isSuspended } from "./morale.js";
import { beatGrudge, grudgeMultiplier } from "./title.js";
import { log } from "../tick.js";
import { grantParty } from "./party.js";
import {
  levelFor,
  makeChallenger,
  partySizeFor,
  recordThreat,
  runChallenge,
} from "./challenge.js";
import { tierMultiplier } from "./promotion.js";
import type { Creature, LeagueState, Rival, TickReport, TypeId } from "../types.js";

/**
 * Named rivals.
 *
 * The league's only "act before X" moment. A rival announces themselves days
 * ahead, names the gym they are coming for and the type they run — and then the
 * player has a window to do something about it: hire a junior that answers them,
 * rest the party, spend a wildcard slot.
 *
 * Everything else in the game can be done whenever you like. This cannot, and
 * that is the entire point: a session without a deadline in it has no shape.
 */

const NAMES = [
  "Corvin", "Sable", "Mireille", "Tarquin", "Vesna", "Halloran", "Ptolemy",
  "Isolde", "Brannock", "Odessa", "Cray", "Fennimore", "Ligeia", "Rusk",
];

export function pendingRivals(state: LeagueState): Rival[] {
  return state.rivals.filter((r) => !r.resolved);
}

/** The rival arriving soonest, for the UI's countdown. */
export function nextRival(state: LeagueState): Rival | undefined {
  return pendingRivals(state).sort((a, b) => a.arrivesAt - b.arrivesAt)[0];
}

/**
 * Announce a rival.
 *
 * They pick the gym they are *most* likely to beat, which is what makes the
 * warning worth reading — the game is telling the player exactly where they are
 * weakest, and daring them to fix it.
 */
function announce(state: LeagueState): void {
  const gymIds = state.gymOrder.filter((id) => state.gyms[id]);
  if (gymIds.length === 0) return;

  // Weight toward gyms already in trouble.
  const weights: Record<string, number> = {};
  for (const id of gymIds) {
    const gym = state.gyms[id];
    if (!gym) continue;
    weights[id] = 1 + gym.threat.lossRate * 3;
  }
  const gymId = weighted(state.rng, weights);
  const gym = state.gyms[gymId];
  if (!gym) return;

  // Someone with a score to settle comes before a stranger does. This is the
  // one rule that ties the walked-out Champion and the declined prodigy
  // together: anyone who leaves your league comes back to fight it.
  const grudge = state.grudges[0];
  const name = grudge?.name ?? pick(state.rng, NAMES);

  // A type that beats the gym, so the threat is real and legible.
  const beating: TypeId[] = [];
  for (const t of Object.keys(state.meta.weights) as TypeId[]) {
    if (effectivenessAgainst(t, [gym.type]) > 1) beating.push(t);
  }
  const type = grudge?.type ?? (beating.length > 0 ? pick(state.rng, beating) : gym.type);

  // A returning rival has been earning badges elsewhere. The rookie you brushed
  // off at gym 2 comes back for gym 6 with a full team.
  const veteran = state.retiredRivals.find((r) => r.name === name);
  const badges = veteran
    ? Math.min(state.gymOrder.length - 1, veteran.badges + int(state.rng, 1, RIVAL.badgeGrowth))
    : Math.min(state.gymOrder.length - 1, int(state.rng, 1, 3));

  const rival: Rival = {
    id: `r_${state.rivals.length + 1}_${Math.round(state.time)}`,
    name,
    type,
    gymId: state.gymOrder[Math.min(state.gymOrder.length - 1, badges)] ?? gymId,
    announcedAt: state.time,
    arrivesAt: state.time + RIVAL.warningSeconds,
    badges,
    resolved: false,
    held: false,
  };
  state.rivals.push(rival);
}

/** Everyone defending a gym, juniors first, exactly as a challenger meets them. */
function defenders(state: LeagueState, gymId: string): Creature[] {
  const gym = state.gyms[gymId];
  if (!gym) return [];
  const order = [...gym.trainerIds, ...(gym.leaderId ? [gym.leaderId] : [])];
  return order
    .flatMap((tid) => {
      const t = state.trainers[tid];
      // Readiness must reflect who will actually be standing there.
      return t && !isSuspended(state, t) ? t.party : [];
    })
    .map((id) => state.creatures[id])
    .filter((c): c is Creature => c !== undefined && c.role !== "retired")
    .filter((c) => !state.dayCare.some((slot) => slot.creatureId === c.id));
}

/**
 * A rival fights the same gauntlet an ordinary challenger does — juniors first,
 * the Leader last, faints carrying through. They are simply better at it.
 */
function resolve(state: LeagueState, rival: Rival, report: TickReport): void {
  rival.resolved = true;

  const gym = state.gyms[rival.gymId];
  if (!gym) return;

  // Scaled to the gym they are actually walking into. Rivals were the one
  // challenger path with no reference at all, so they drew on the league-wide
  // number and could arrive at gym one with a party nobody there could answer.
  const challenger = makeChallenger(state, rival.badges, defenders(state, rival.gymId));
  // A rival leads with their declared type, which is what made the warning
  // worth acting on.
  const lead = challenger.party[0];
  if (lead) {
    const pool = catalog
      .staffableByType(rival.type)
      .filter((sp) => minLevelFor(sp) <= lead.level);
    const species = pool.length > 0 ? pick(state.rng, pool) : undefined;
    if (species) {
      lead.speciesId = species.slug;
      lead.types = species.types;
      const grudge = state.grudges.find((g) => g.name === rival.name);
      lead.power = Math.round(
        lead.power * RIVAL.powerMultiplier * (grudge ? grudgeMultiplier(grudge) : 1),
      );
    }
  }
  challenger.revives += RIVAL.extraRevives;

  const result = runChallenge(state, gym, challenger, report);
  recordThreat(gym, challenger, !result.tookBadge);

  rival.held = !result.tookBadge;

  // A grudge softens each time you beat them, and eventually they accept a post
  // — so the refusal that created them is priced in hard fights, not forever.
  const settled = !rival.held && beatGrudge(state, rival.name);
  if (settled) {
    log(state, "hire", `${rival.name} has finally agreed to work for you.`);
  }

  if (rival.held) {
    const purse = RIVAL.purse * tierMultiplier(state.tier);
    state.money += purse;
    state.renown += RIVAL.renownForWinning;
    report.earned += purse;

    // Beaten rivals come to work for you, bringing their own team — unless they
    // are still carrying a grudge, in which case they are not done yet.
    //
    // They join a gym of *their own* type where one has room. A rival who
    // attacked your Bug gym with Fire and was then stationed at that Bug gym
    // read as nonsense, because it is: gyms are type-bound, and the person you
    // just turned away is not suddenly a Bug specialist.
    const post =
      state.gymOrder
        .map((id) => state.gyms[id])
        .find(
          (g) => g !== undefined && g.type === rival.type && g.trainerIds.length < g.trainerSlots,
        ) ?? undefined;

    if (post && !state.grudges.some((g) => g.name === rival.name)) {
      const level = Math.max(8, rival.badges * 6);
      const hired = makeTrainer(state, rival.type, "gym", {
        bond: 0.6,
        level,
        partyCap: GYM_TRAINERS.partyMax,
      });
      hired.name = rival.name;
      addGymTrainer(state, hired.id, post.id);
      grantParty(state, hired, catalog.staffableByType(rival.type), GYM_TRAINERS.partyMax, {
        level: Math.max(8, rival.badges * 6),
        bond: 0.5,
        jitter: 2,
        owned: false,
      });
      report.recruited.push(rival.name);
    }
  } else {
    state.renown = Math.max(0, state.renown - RIVAL.renownForLosing);
    // They keep the badge, and they will be back for the next one.
    state.retiredRivals = [
      ...state.retiredRivals.filter((r) => r.name !== rival.name),
      { name: rival.name, badges: rival.badges + 1 },
    ].slice(-RIVAL.historyCap);
  }

  report.rivals.push({ name: rival.name, held: rival.held, gymId: rival.gymId });
}

export function tickRivals(state: LeagueState, dt: number, report: TickReport): void {
  if (state.gymOrder.length === 0) return;

  state.rivalCooldown -= dt;
  let guard = 0;
  while (state.rivalCooldown <= 0 && guard < 8) {
    announce(state);
    state.rivalCooldown += RIVAL.intervalSeconds;
    guard += 1;
  }

  for (const rival of state.rivals) {
    if (rival.resolved) continue;
    if (state.time >= rival.arrivesAt) resolve(state, rival, report);
  }

  // Keep the list from growing without bound.
  if (state.rivals.length > RIVAL.historyCap) {
    state.rivals = state.rivals.slice(-RIVAL.historyCap);
  }
}

/** Sim-seconds until a rival lands, for the UI. */
export function timeUntil(state: LeagueState, rival: Rival): number {
  return Math.max(0, rival.arrivesAt - state.time);
}

/**
 * How well the targeted gym answers this rival, roughly. 1 is an even fight.
 *
 * Deliberately a summary rather than a simulation — the player needs to know
 * whether to act, not the exact odds.
 */
export function readinessAgainst(state: LeagueState, rival: Rival): number {
  const roster = defenders(state, rival.gymId);
  if (roster.length === 0) return 0;

  let ours = 0;
  for (const c of roster) {
    const eff = effectivenessAgainst(rival.type, c.types);
    ours += (c.power * (1 - c.fatigue)) / Math.max(0.5, eff);
  }
  const theirs =
    partySizeFor(rival.badges) *
    levelFor(state, rival.badges) *
    RIVAL.readinessScale;
  return ours / Math.max(1, theirs);
}

export function randomRivalName(state: LeagueState): string {
  return pick(state.rng, NAMES) + String(int(state.rng, 1, 9));
}
