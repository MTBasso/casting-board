/**
 * The 1v1 battle engine — slice 2 of the redesign (REDESIGN.md).
 *
 * Mechanics carried over verbatim from scripts/switch-probe.ts, which probed
 * this exact question first: real type multipliers, fatigue that decays an
 * active mon's power and recovers on the bench, switch-only coach calls.
 * The probe found fatigue rides along for free rather than changing switch
 * decisions on its own — REDESIGN.md's settled call is to ship it as
 * pacing/flavor, not a load-bearing signal, so the default auto-policy below
 * only reads type matchups.
 *
 * `initBattle`/`switchActive`/`resolveTurn` are the API a future interactive
 * UI drives turn-by-turn with real player input. `autoResolveBattle` runs a
 * whole fight headlessly with a policy function, for the season engine and
 * for tests/sims before that UI exists.
 */
import type { TypeId } from "../types.js";
import { effectivenessAgainst } from "../../data/typechart.js";
import type { Species } from "../../data/catalog.js";
import { next } from "../rng.js";
import type { RngState } from "../types.js";

export const FATIGUE_PER_TURN = 0.12;
export const FATIGUE_RECOVERY_PER_TURN = 0.2;
export const FATIGUE_POWER_FLOOR = 0.5;

export interface FighterState {
  slug: string;
  name: string;
  types: readonly TypeId[];
  power: number;
  maxHp: number;
  hp: number;
  fatigue: number;
  /**
   * An unhatched egg (REDESIGN.md "Mid-run roster growth"): occupies a bench
   * slot like any party member, but hp is 0 so it can never be switched in
   * or fought with — the existing fainted-mon handling in resolveTurn and
   * canSwitchTo does the work, no extra battle-side casing needed. Hatches
   * (isEgg cleared, hp restored) at the next shop visit — see growth.ts.
   */
  isEgg?: boolean;
}

export type BattleResult = "ongoing" | "won" | "lost";

export interface BattleState {
  playerParty: readonly FighterState[];
  activeIndex: number;
  gymParty: readonly FighterState[];
  gymIndex: number;
  result: BattleResult;
}

export function makeFighter(species: Species, scale = 1): FighterState {
  const maxHp = Math.round((60 + species.stats.hp) * scale);
  return {
    slug: species.slug,
    name: species.name,
    types: species.types,
    power: species.power * scale,
    maxHp,
    hp: maxHp,
    fatigue: 0,
  };
}

export function primaryType(f: FighterState): TypeId {
  const t = f.types[0];
  if (!t) throw new Error(`fighter ${f.name} has no types`);
  return t;
}

export function powerMult(f: FighterState): number {
  return 1 - f.fatigue * (1 - FATIGUE_POWER_FLOOR);
}

export function initBattle(
  playerParty: readonly FighterState[],
  gymParty: readonly FighterState[],
): BattleState {
  if (playerParty.length === 0) throw new Error("initBattle requires a non-empty player party");
  if (gymParty.length === 0) throw new Error("initBattle requires a non-empty gym party");
  return { playerParty, activeIndex: 0, gymParty, gymIndex: 0, result: "ongoing" };
}

function activeOf(battle: BattleState): FighterState {
  const f = battle.playerParty[battle.activeIndex];
  if (!f) throw new Error("battle has no active fighter");
  return f;
}

function gymActiveOf(battle: BattleState): FighterState {
  const f = battle.gymParty[battle.gymIndex];
  if (!f) throw new Error("battle has no active gym fighter");
  return f;
}

export function canSwitchTo(battle: BattleState, index: number): boolean {
  if (battle.result !== "ongoing") return false;
  if (index === battle.activeIndex) return false;
  const target = battle.playerParty[index];
  return !!target && target.hp > 0;
}

/** The player's coach call — swap the active mon, no time cost beyond the exchange it precedes. */
export function switchActive(battle: BattleState, index: number): BattleState {
  if (!canSwitchTo(battle, index)) return battle;
  return { ...battle, activeIndex: index };
}

function firstAliveIndex(party: readonly FighterState[]): number {
  return party.findIndex((f) => f.hp > 0);
}

/**
 * Resolves one auto-fought exchange: both sides hit once, fatigue ticks.
 * Does not switch — call switchActive first if the coach call is to swap.
 * If the active mon faints, auto-advances to the next alive party member
 * (or ends the battle) so callers never have to babysit fainting mid-turn.
 */
export function resolveTurn(battle: BattleState, rng: RngState): BattleState {
  if (battle.result !== "ongoing") return battle;

  const playerParty = battle.playerParty.map((f) => ({ ...f }));
  const gymParty = battle.gymParty.map((f) => ({ ...f }));
  let activeIndex = battle.activeIndex;
  let gymIndex = battle.gymIndex;
  const active = playerParty[activeIndex];
  const opp = gymParty[gymIndex];
  if (!active || !opp) return { ...battle, playerParty, gymParty };

  const atkMult = effectivenessAgainst(primaryType(active), opp.types) * powerMult(active);
  opp.hp -= active.power * atkMult * (0.85 + next(rng) * 0.3);

  if (opp.hp > 0) {
    const defMult = effectivenessAgainst(primaryType(opp), active.types) * powerMult(opp);
    active.hp -= opp.power * defMult * (0.85 + next(rng) * 0.3) * 0.5;
  }

  active.fatigue = Math.min(1, active.fatigue + FATIGUE_PER_TURN);
  for (let i = 0; i < playerParty.length; i++) {
    if (i !== activeIndex) {
      const f = playerParty[i];
      if (f) f.fatigue = Math.max(0, f.fatigue - FATIGUE_RECOVERY_PER_TURN);
    }
  }

  let result: BattleResult = "ongoing";

  if (opp.hp <= 0) {
    const nextGymIndex = gymIndex + 1;
    if (nextGymIndex >= gymParty.length) {
      result = "won";
    } else {
      gymIndex = nextGymIndex;
    }
  }

  if (result === "ongoing" && active.hp <= 0) {
    const nextIndex = firstAliveIndex(playerParty);
    if (nextIndex < 0) {
      result = "lost";
    } else {
      activeIndex = nextIndex;
    }
  }

  return { playerParty, activeIndex, gymParty, gymIndex, result };
}

/** Switches to the best type matchup on the bench, ignoring fatigue — see file header for why. */
export function typeAwarePolicy(battle: BattleState): number | null {
  const active = activeOf(battle);
  const opp = gymActiveOf(battle);
  let bestIndex: number | null = null;
  let bestScore = effectivenessAgainst(primaryType(active), opp.types);
  battle.playerParty.forEach((f, i) => {
    if (i === battle.activeIndex || f.hp <= 0) return;
    const score = effectivenessAgainst(primaryType(f), opp.types);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  });
  return bestIndex;
}

const MAX_TURNS = 500; // safety cap: a stalemate of 0x-immune matchups on both sides would otherwise loop forever

/** Runs a whole battle headlessly with a switch policy — the season engine's default until a real UI drives coach calls turn-by-turn. */
export function autoResolveBattle(
  playerParty: readonly FighterState[],
  gymParty: readonly FighterState[],
  rng: RngState,
  policy: (battle: BattleState) => number | null = typeAwarePolicy,
): BattleState {
  let battle = initBattle(playerParty, gymParty);
  for (let turn = 0; turn < MAX_TURNS && battle.result === "ongoing"; turn++) {
    const swapTo = policy(battle);
    if (swapTo !== null) battle = switchActive(battle, swapTo);
    battle = resolveTurn(battle, rng);
  }
  return battle;
}
