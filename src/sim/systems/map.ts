import { catalog, encounterWeight, minLevelFor } from "../../data/catalog.js";
import { ROUTES, neighboursOf, routeById, startingRoutes } from "../../data/routes.js";
import { FIELD, SCOUTING } from "../constants.js";
import { makeCreature } from "../factory.js";
import { int, pick, weighted } from "../rng.js";
import { clamp01 } from "../math.js";
import { log } from "../tick.js";
import type { Creature, LeagueState, Route, TypeId } from "../types.js";

/**
 * The region: where the league can go, and what lives there.
 *
 * Sixteen places in a web with loops, three open from the first hour and the
 * rest reached by pushing on from somewhere you already know well. Routes do not
 * unlock at a renown number nobody acts on — you get there by going there.
 *
 * Knowing a place is separate from being able to reach it. Familiarity is what
 * the *league* has learned about the ground: which creatures turn up, and how
 * fast a crew levels here. It is shared, and it never decays.
 *
 * Split out of `field.ts`, which held this, the crews and the expeditions behind
 * one interface of forty-two exports — nearly every one of them serving exactly
 * one call site, which is a flat mirror of the implementation rather than a
 * module.
 */

/** Ground the league has reached. */
export function openRoutes(state: LeagueState): Route[] {
  return ROUTES.filter((r) => state.explored.includes(r.id));
}

export function isOpen(state: LeagueState, routeId: string): boolean {
  return state.explored.includes(routeId);
}

/** How well the league knows this ground, 0..1. */
export function knownOf(state: LeagueState, routeId: string): number {
  return clamp01((state.known[routeId] ?? 0) / FIELD.tripsToPushOn);
}

/** Whether the league knows this ground well enough to push on from it. */
export function canPushOnFrom(state: LeagueState, routeId: string): boolean {
  return knownOf(state, routeId) >= 1;
}

/** Everywhere reachable from open ground that has not been reached yet. */
export function frontier(state: LeagueState): { from: Route; to: Route }[] {
  const out: { from: Route; to: Route }[] = [];
  for (const from of openRoutes(state)) {
    if (!canPushOnFrom(state, from.id)) continue;
    for (const to of neighboursOf(from.id)) {
      if (isOpen(state, to.id)) continue;
      if (out.some((e) => e.to.id === to.id)) continue;
      out.push({ from, to });
    }
  }
  return out;
}

/** Record that this species has actually been found here. */
export function note_seen(state: LeagueState, routeId: string, speciesId: string): void {
  const list = state.seen[routeId] ?? [];
  if (!list.includes(speciesId)) state.seen[routeId] = [...list, speciesId];
}

/** What this league has met on this ground. */
export function seenOn(state: LeagueState, routeId: string): string[] {
  return state.seen[routeId] ?? [];
}

/** Species a crew has been told to leave alone on this route. */
export function bannedOn(state: LeagueState, routeId: string): string[] {
  return state.bans[routeId] ?? [];
}

export function toggleBan(state: LeagueState, routeId: string, speciesId: string): void {
  const list = state.bans[routeId] ?? [];
  state.bans[routeId] = list.includes(speciesId)
    ? list.filter((s) => s !== speciesId)
    : [...list, speciesId];
}

/**
 * What could turn up here for this Ranger.
 *
 * Their own type and nothing else — a Grass Ranger is only worth what your Grass
 * gym is worth — filtered by whatever the player has told them to leave alone.
 */
export function catchPool(
  state: LeagueState,
  route: Route,
  type: TypeId,
  ceiling: number,
) {
  const banned = new Set(bannedOn(state, route.id));
  return catalog
    .wildByType(type)
    .filter((s) => minLevelFor(s) <= ceiling && !banned.has(s.slug));
}

/** Draw one creature, at this crew's competence and with this much greed. */
export function drawOne(
  state: LeagueState,
  route: Route,
  type: TypeId,
  known: number,
  tilt: number,
): Creature | null {
  const ceiling = route.levelMax + Math.round(known * FIELD.skillLevelBonus);
  const pool = catchPool(state, route, type, ceiling);
  if (pool.length === 0) return null;

  const weights: Record<string, number> = {};
  for (const species of pool) {
    weights[species.slug] = Math.pow(encounterWeight(species), 1 - tilt);
  }
  const species = catalog.get(weighted(state.rng, weights));
  if (!species) return null;

  return makeCreature(state, species, "reserve", {
    level: int(state.rng, route.levelMin, ceiling),
  });
}

/** Reach a new place. Its resident and its landmark come with it. */
export function open(state: LeagueState, routeId: string): void {
  if (state.explored.includes(routeId)) return;
  const route = routeById(routeId);
  if (!route) return;

  state.explored.push(routeId);
  const species = catalog.get(route.resident);
  log(
    state,
    "scout",
    "log.reached",
    { route: route.id, resident: species?.name ?? "" },
  );
}

/** The ground a league starts knowing. */
export function seedMap(state: LeagueState): void {
  for (const route of startingRoutes()) open(state, route.id);

  // A thin opening bench, drawn from the ground they already know.
  const open3 = openRoutes(state);
  for (let i = 0; i < SCOUTING.startingBench; i++) {
    const route = open3[i % Math.max(1, open3.length)];
    if (!route) break;
    const type = weighted(state.rng, route.supply) as TypeId;
    const pool = catchPool(state, route, type, route.levelMax);
    if (pool.length === 0) continue;
    makeCreature(state, pick(state.rng, pool), "reserve", {
      level: int(state.rng, route.levelMin, route.levelMax),
    });
  }
}
