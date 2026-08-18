import { catalog, type BaseStats } from "../../data/catalog.js";
import type { Creature } from "../types.js";

/**
 * Derived stats.
 *
 * The real six, scaled by level the way the games do it — roughly, and without
 * IVs or EVs, which would be six more numbers the player cannot influence.
 * What matters is that a Blissey is a wall and a Jolteon is fast, and that
 * survives this simplification intact.
 */
export interface Stats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

/** HP scales harder than the rest, exactly as it does in the source. */
function hpAt(base: number, level: number): number {
  return Math.floor((2 * base * level) / 100) + level + 10;
}

function statAt(base: number, level: number, roll: number): number {
  return Math.max(1, Math.floor(((2 * base * level) / 100 + 5) * roll));
}

export function statsFor(base: BaseStats, level: number, roll: number): Stats {
  return {
    hp: Math.max(1, Math.floor(hpAt(base.hp, level) * roll)),
    attack: statAt(base.attack, level, roll),
    defense: statAt(base.defense, level, roll),
    spAttack: statAt(base.spAttack, level, roll),
    spDefense: statAt(base.spDefense, level, roll),
    speed: statAt(base.speed, level, roll),
  };
}

export function statsOf(creature: Creature): Stats {
  const species = catalog.get(creature.speciesId);
  if (!species) {
    return { hp: 1, attack: 1, defense: 1, spAttack: 1, spDefense: 1, speed: 1 };
  }
  return statsFor(species.stats, creature.level, creature.powerRoll);
}

/**
 * A single number standing in for overall strength.
 *
 * Kept because half the game reasons about "how good is this creature" —
 * auto-fill, trade pricing, the Elite seat threshold — and none of those want
 * a six-dimensional answer.
 */
export function powerOf(stats: Stats): number {
  return Math.round(
    (stats.hp * 0.8 +
      stats.attack +
      stats.defense +
      stats.spAttack +
      stats.spDefense +
      stats.speed * 0.9) /
      6,
  );
}

/** Whether this creature hits harder physically or specially. */
export function usesPhysical(stats: Stats): boolean {
  return stats.attack >= stats.spAttack;
}

/**
 * Damage for one hit.
 *
 * A pared-down version of the real formula: level, the attacking stat over the
 * defending one, and type effectiveness. No moves, no STAB variance beyond the
 * attacker's own typing — enough that a physical wall genuinely walls physical
 * attackers, which is the part players actually feel.
 */
export function damage(
  attacker: Stats,
  defender: Stats,
  level: number,
  effectiveness: number,
  roll: number,
): number {
  const physical = usesPhysical(attacker);
  const atk = physical ? attacker.attack : attacker.spAttack;
  const def = physical ? defender.defense : defender.spDefense;

  const base = ((2 * level) / 5 + 2) * 45 * (atk / Math.max(1, def));
  return Math.max(1, Math.round((base / 50 + 2) * effectiveness * roll));
}
