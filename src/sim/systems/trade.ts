import {
  catalog,
  encounterWeight,
  isGrantable,
  type Species,
} from "../../data/catalog.js";
import { TRADE } from "../constants.js";
import { tradeEfficiency } from "./facilities.js";
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

export function tradeableStock(state: LeagueState): Creature[] {
  return Object.values(state.creatures).filter((c) => c.role === "reserve" && c.owned);
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
  for (const id of offered) {
    const c = state.creatures[id];
    if (!c || c.role !== "reserve") {
      return { ok: false, reason: "Only reserve creatures can be traded" };
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
function receiveFor(state: LeagueState, wanted: TypeId, target: number): Species | null {
  const candidates = candidatesFor(wanted).filter((s) => s.power <= target * 1.1);
  const pool = candidates.length > 0 ? candidates : candidatesFor(wanted);
  if (pool.length === 0) return null;

  const weights: Record<string, number> = {};
  for (const species of pool) {
    // Sharply favour the closest match, so the offer visibly drives the result.
    weights[species.slug] = 1 / (1 + Math.abs(species.power - target) ** 1.6);
  }
  return catalog.get(weighted(state.rng, weights)) ?? null;
}

/** A preview of what an offer would fetch, for the UI to show before committing. */
export function tradePreview(
  state: LeagueState,
  wanted: TypeId,
  offered: readonly string[],
): { target: number; example: string | null } {
  const creatures = offered
    .map((id) => state.creatures[id])
    .filter((c): c is Creature => c !== undefined);
  const target = tradeTarget(creatures, state);
  const candidates = candidatesFor(wanted).filter((s) => s.power <= target * 1.1);
  const best = [...candidates].sort((a, b) => b.power - a.power)[0];
  return { target, example: best?.name ?? null };
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
  const species = receiveFor(state, wanted, target);
  if (!species) return { ok: false, reason: "Nothing of that type is traded" };

  // The received creature arrives around the level of what you gave up, so a
  // trade is a sideways move rather than a reset to level one.
  const meanLevel = Math.round(
    creatures.reduce((sum, c) => sum + c.level, 0) / creatures.length,
  );

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
