import { catalog, isGrantable } from "../../data/catalog.js";
import { BREEDING, DAYCARE } from "../constants.js";
import { makeCreature } from "../factory.js";
import { pick, range } from "../rng.js";
import { gainXp } from "./growth.js";
import { level as facilityLevel } from "./facilities.js";
import { displayName } from "./wave.js";
import type { Creature, LeagueState, TickReport } from "../types.js";

/**
 * The Day-Care.
 *
 * The couple take two creatures and look after them. Left alone, a creature
 * gains experience with the passing of time rather than from battle — so the
 * Day-Care is where a creature you cannot afford to deploy still gets better,
 * and where time away from the app turns into something other than money.
 *
 * Dropping off is free. Collecting is not: the couple charge a flat fee plus a
 * sum for every level the creature gained in their care.
 *
 * If the two in their care share a type, an egg eventually appears — which is
 * how a spent career becomes a lineage.
 */

export function built(state: LeagueState): boolean {
  return facilityLevel(state, "day_care") > 0;
}

export function occupants(state: LeagueState): Creature[] {
  return state.dayCare
    .map((slot) => state.creatures[slot.creatureId])
    .filter((c): c is Creature => c !== undefined);
}

export function freeSlots(state: LeagueState): number {
  return Math.max(0, DAYCARE.slots - state.dayCare.length);
}

/** What the couple will charge to hand this creature back. */
export function collectionFee(state: LeagueState, creatureId: string): number {
  const slot = state.dayCare.find((s) => s.creatureId === creatureId);
  const creature = state.creatures[creatureId];
  if (!slot || !creature) return 0;
  const gained = Math.max(0, creature.level - slot.levelAtDropoff);
  return DAYCARE.baseFee + gained * DAYCARE.feePerLevel;
}

export function canDropOff(
  state: LeagueState,
  creatureId: string,
): { ok: true } | { ok: false; reason: string } {
  if (!built(state)) return { ok: false, reason: "Build the Day-Care first" };
  if (freeSlots(state) <= 0) return { ok: false, reason: "The couple have their hands full" };

  const creature = state.creatures[creatureId];
  if (!creature) return { ok: false, reason: "Not found" };
  if (!creature.owned) return { ok: false, reason: "Not yours" };

  const trainer = creature.trainerId ? state.trainers[creature.trainerId] : undefined;
  if (trainer && trainer.signatureId === creatureId) {
    return { ok: false, reason: "Signature creatures stay with their trainer" };
  }
  if (state.dayCare.some((s) => s.creatureId === creatureId)) {
    return { ok: false, reason: "Already there" };
  }
  return { ok: true };
}

/** Dropping off is free — it is collecting that costs. */
export function dropOff(
  state: LeagueState,
  creatureId: string,
): { ok: true } | { ok: false; reason: string } {
  const check = canDropOff(state, creatureId);
  if (!check.ok) return check;

  const creature = state.creatures[creatureId];
  if (!creature) return { ok: false, reason: "Not found" };

  // Deliberately *not* removed from its party. A creature in training holds its
  // slot but cannot defend, so parking your best is a real trade — otherwise
  // auto-fill backfills the gap and leaving one here costs nothing at all.
  if (creature.role === "reserve") creature.benched = true;

  state.dayCare.push({
    creatureId,
    levelAtDropoff: creature.level,
    since: state.time,
  });
  return { ok: true };
}

export function collect(
  state: LeagueState,
  creatureId: string,
): { ok: true; fee: number } | { ok: false; reason: string } {
  const slot = state.dayCare.find((s) => s.creatureId === creatureId);
  if (!slot) return { ok: false, reason: "Not at the Day-Care" };

  const fee = collectionFee(state, creatureId);
  if (state.money < fee) return { ok: false, reason: `The couple want ${fee}` };

  state.money -= fee;
  state.dayCare = state.dayCare.filter((s) => s.creatureId !== creatureId);
  const creature = state.creatures[creatureId];
  if (creature) creature.benched = false;
  return { ok: true, fee };
}

/**
 * Training and egg development.
 *
 * Retired creatures do not level — their careers are over — but they still
 * count toward an egg, which is what keeps the Day-Care the place a lineage
 * comes from.
 */
export function tickDayCare(state: LeagueState, dt: number, report: TickReport): void {
  if (state.dayCare.length === 0) return;

  const xp = dt / DAYCARE.secondsPerXp;
  for (const slot of state.dayCare) {
    const creature = state.creatures[slot.creatureId];
    if (!creature || creature.role === "retired") continue;
    const became = gainXp(state, creature, xp);
    if (became) {
      report.evolutions.push(`${displayName(creature)} evolved into ${became} at the Day-Care`);
    }
  }

  tickEgg(state, dt, report);
}

function tickEgg(state: LeagueState, dt: number, report: TickReport): void {
  const pair = occupants(state);
  if (pair.length < 2) {
    state.eggProgress = 0;
    return;
  }

  const [a, b] = pair;
  if (!a || !b) return;
  if (!a.types.some((t) => b.types.includes(t))) {
    state.eggProgress = 0;
    return;
  }

  state.eggProgress += dt;
  if (state.eggProgress < DAYCARE.eggSeconds) return;

  state.eggProgress = 0;
  const child = hatch(state, a, b);
  if (child) report.hatched.push(displayName(child));
}

/** Walk an evolution line back to its first form. Eggs hatch as base forms. */
export function baseFormOf(speciesId: string): string {
  let cursor = catalog.get(speciesId);
  let guard = 0;
  while (cursor?.evolvesFrom && guard < 5) {
    const parent = catalog.get(cursor.evolvesFrom);
    if (!parent) break;
    cursor = parent;
    guard += 1;
  }
  return cursor?.slug ?? speciesId;
}

/**
 * What a parent passes on.
 *
 * Bond and a career actually spent both count, so deploying the creature you
 * care about pays forward into its descendants instead of only costing you.
 */
export function parentQuality(parent: Creature): number {
  const careerShare =
    parent.careerTotal > 0 ? Math.min(1, parent.careerSpent / parent.careerTotal) : 0;
  return (
    parent.powerRoll *
    (1 + parent.bond * BREEDING.bondWeight + careerShare * BREEDING.careerWeight)
  );
}

function hatch(state: LeagueState, a: Creature, b: Creature): Creature | null {
  const lineFrom = pick(state.rng, [a, b]);
  const speciesId = baseFormOf(lineFrom.speciesId);
  const species = catalog.get(speciesId);
  // No egg has ever produced a legendary, and none will here.
  if (!species || !isGrantable(species)) return null;

  const child = makeCreature(state, species, "reserve", {
    level: BREEDING.hatchLevel,
    parents: [a.id, b.id],
    generation: Math.max(a.generation, b.generation) + 1,
  });

  const inherited = (parentQuality(a) + parentQuality(b)) / 2;
  child.powerRoll = Math.min(
    BREEDING.maxRoll,
    Math.max(Math.min(a.powerRoll, b.powerRoll), inherited * range(state.rng, 0.97, 1.05)),
  );
  child.power = Math.max(
    1,
    Math.round(species.power * child.powerRoll * (1 + (child.level - 1) * 0.015)),
  );
  return child;
}

/** Ancestry chain, most recent first. */
export function pedigree(state: LeagueState, creatureId: string, depth = 4): Creature[] {
  const chain: Creature[] = [];
  let cursor = state.creatures[creatureId];
  let guard = 0;

  while (cursor?.parents && guard < depth) {
    const parent = state.creatures[cursor.parents[0]];
    if (!parent) break;
    chain.push(parent);
    cursor = parent;
    guard += 1;
  }
  return chain;
}
