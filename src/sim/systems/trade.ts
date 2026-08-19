import {
  catalog,
  encounterWeight,
  grantableAtLevel,
  isGrantable,
  type Species,
} from "../../data/catalog.js";
import { TRADE } from "../constants.js";
import { tradeEfficiency } from "./facilities.js";
import { powerOf, statsFor } from "./stats.js";
import { makeCreature } from "../factory.js";
import { int, weighted } from "../rng.js";
import type { Creature, LeagueState, TypeId } from "../types.js";

/**
 * The Trade Desk.
 *
 * Its first job is to give reserve creatures an alternative use, so benching one
 * costs you something. Its second is to be the escape hatch when your routes
 * simply do not supply a type your gym needs.
 *
 * What you offer decides what you get. The exchange is deliberately lossy and
 * *sublinear* in the number of creatures given up — you can climb, but slowly,
 * and you burn roster doing it. Dumping twelve Rattata does not buy a Dragonite.
 */

/**
 * Creatures the desk will accept: owned, in the box, and doing nothing.
 *
 * "Doing nothing" is stricter than `role === "reserve"` looks. A creature a
 * Handler took out on an expedition is `role: "field"` and so already excluded,
 * but one left at the Day-Care is still reserve and is very much in use —
 * trading it out from under the system holding it leaves a dangling id that
 * only surfaces much later.
 */
export function tradeableStock(state: LeagueState): Creature[] {
  const parked = new Set(state.dayCare.map((slot) => slot.creatureId));
  return Object.values(state.creatures).filter(
    (c) => c.role === "reserve" && c.owned && !parked.has(c.id),
  );
}

/**
 * The power the desk will aim for, given what is on the table.
 *
 * Mean rather than sum, with a gentle bonus for volume: `log2` means the second
 * creature adds a lot and the eighth adds very little, which is what stops
 * hoarding-then-dumping from being a strategy.
 */
export function tradeTarget(
  offered: readonly Creature[],
  state?: LeagueState,
): number {
  if (offered.length === 0) return 0;
  const mean = offered.reduce((sum, c) => sum + c.power, 0) / offered.length;
  const volume = 1 + TRADE.volumeBonus * Math.log2(offered.length);
  const desk = state ? tradeEfficiency(state) : 1;
  return mean * volume * TRADE.efficiency * desk;
}

export function canTrade(
  state: LeagueState,
  wanted: TypeId,
  offered: readonly string[],
): { ok: true } | { ok: false; reason: string } {
  if (offered.length < TRADE.minOffered) {
    return { ok: false, reason: `Offer at least ${TRADE.minOffered} creatures` };
  }
  if (state.money < TRADE.fee) {
    return { ok: false, reason: `Needs a ${TRADE.fee} fee` };
  }
  if (candidatesFor(wanted).length === 0) {
    return { ok: false, reason: "Nothing of that type is traded" };
  }
  const idle = new Set(tradeableStock(state).map((c) => c.id));
  for (const id of offered) {
    if (!idle.has(id)) {
      return { ok: false, reason: "Only creatures doing nothing can be traded" };
    }
  }
  return { ok: true };
}

/** Species the desk will hand over — no starters or legendaries. */
function candidatesFor(wanted: TypeId): readonly Species[] {
  return catalog.byType(wanted).filter((s) => encounterWeight(s) > 0 && isGrantable(s));
}

/**
 * Pick what comes back: species near the target power, preferring the closest.
 * Nothing meaningfully above target is reachable, so the ceiling holds.
 */
/** The power range the desk promises, for a given offer. */
export function tradeBand(target: number): { low: number; high: number } {
  return { low: target * (1 - TRADE.band), high: target * (1 + TRADE.band) };
}

/**
 * What a species would actually be worth at the level it will arrive at.
 *
 * `Species.power` is a base-stat summary spanning roughly 32-113 and says
 * nothing about level; a creature's `power` is its stats *at its level* and
 * starts near 10. Matching one against the other — which is what this did —
 * compares different units, so early on no species could ever be "close to"
 * a target of 14 and the desk fell back to whatever was nearest in the wrong
 * scale. The promise on the screen was unkeepable because the comparison was.
 */
function powerAtLevel(species: Species, level: number): number {
  return powerOf(statsFor(species.stats, level, 1));
}

function receiveFor(
  state: LeagueState,
  wanted: TypeId,
  target: number,
  level: number,
): Species | null {
  // Only species that can legitimately exist at this level. `makeCreature`
  // clamps *upward* to a species' evolution floor, so offering a stage-three
  // form for a level-twelve trade quietly produces a level-forty creature —
  // the same trap that once handed out level-forty rivals at the first gym.
  const all = grantableAtLevel(candidatesFor(wanted), level);
  if (all.length === 0) return null;

  // Inside the band, or — when this type simply has nothing in range — the
  // closest thing to it. The fallback matters: a narrow type can have a gap
  // where the band falls, and refusing the trade there would be a dead end the
  // player cannot see the cause of.
  const { low, high } = tradeBand(target);
  const rated = all.map((s) => ({ species: s, power: powerAtLevel(s, level) }));
  const inBand = rated.filter((r) => r.power >= low && r.power <= high);
  const pool =
    inBand.length > 0
      ? inBand
      : [...rated]
          .sort((a, b) => Math.abs(a.power - target) - Math.abs(b.power - target))
          .slice(0, 3);

  const weights: Record<string, number> = {};
  for (const { species, power } of pool) {
    // Sharply favour the closest match, so the offer visibly drives the result.
    weights[species.slug] = 1 / (1 + Math.abs(power - target) ** 1.6);
  }
  return catalog.get(weighted(state.rng, weights)) ?? null;
}


/** A preview of what an offer would fetch, for the UI to show before committing. */
export function tradePreview(
  state: LeagueState,
  wanted: TypeId,
  offered: readonly string[],
): { target: number; low: number; high: number; example: string | null } {
  const creatures = offered
    .map((id) => state.creatures[id])
    .filter((c): c is Creature => c !== undefined);
  const target = tradeTarget(creatures, state);
  const { low, high } = tradeBand(target);
  const level = creatures.length
    ? Math.round(creatures.reduce((sum, c) => sum + c.level, 0) / creatures.length)
    : 1;
  const inBand = grantableAtLevel(candidatesFor(wanted), level)
    .map((s) => ({ species: s, power: powerAtLevel(s, level) }))
    .filter((r) => r.power >= low && r.power <= high);
  const best = [...inBand].sort((a, b) => b.power - a.power)[0];
  return { target, low, high, example: best?.species.name ?? null };
}

/**
 * Trade the offered creatures plus a fee for one of `wanted`. The creatures
 * given up are gone — the one place the game deletes a creature, and always as
 * an explicit choice by the player.
 */
export function trade(
  state: LeagueState,
  wanted: TypeId,
  offered: readonly string[],
): { ok: true; creatureId: string } | { ok: false; reason: string } {
  const check = canTrade(state, wanted, offered);
  if (!check.ok) return check;

  const creatures = offered
    .map((id) => state.creatures[id])
    .filter((c): c is Creature => c !== undefined);

  const target = tradeTarget(creatures, state);

  // The received creature arrives around the level of what you gave up, so a
  // trade is a sideways move rather than a reset to level one. That level has
  // to be settled *before* choosing the species, because what a species is
  // worth depends entirely on it.
  const meanLevel = Math.round(
    creatures.reduce((sum, c) => sum + c.level, 0) / creatures.length,
  );
  const species = receiveFor(state, wanted, target, meanLevel);
  if (!species) return { ok: false, reason: "Nothing of that type is traded" };

  for (const c of creatures) delete state.creatures[c.id];
  state.money -= TRADE.fee;

  const received = makeCreature(state, species, "reserve", {
    level: Math.max(1, int(state.rng, meanLevel - 2, meanLevel + 1)),
  });
  return { ok: true, creatureId: received.id };
}

/** Types the player could usefully trade for: the types their gyms run. */
export function wantedTypes(state: LeagueState): TypeId[] {
  const types = new Set<TypeId>();
  for (const id of state.gymOrder) {
    const gym = state.gyms[id];
    if (gym) types.add(gym.type);
  }
  return [...types];
}
