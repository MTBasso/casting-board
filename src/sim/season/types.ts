/**
 * Types for the redesign's season/Ante run — see REDESIGN.md.
 *
 * Lives alongside the old league-manager sim (src/sim/*.ts) rather than
 * replacing it yet: each redesign slice lands and is played before the next
 * starts, so the old game stays buildable/testable until a slice actually
 * supersedes it (ROADMAP.md's "Cross-cutting work" rule: deploy every
 * block). Old `src/sim` files get removed once nothing points at them.
 */
import type { RngState } from "../types.js";
import type { TypeId } from "../types.js";
import type { FighterState } from "./battle.js";

/** Which types are live this season, decided once at run start. */
export interface LeagueCharter {
  liveTypes: readonly TypeId[];
}

/** One rarity language across Pokémon, Doctrines and items — REDESIGN.md "Rarity tiers". */
export type Rarity = "common" | "rare" | "legendary";

/**
 * "draft" — picking the opening party, nothing else can happen yet.
 * "active" — an Ante is open, fighting toward it.
 * "shopping" — between Antes, choosing a Doctrine before the next one opens.
 * "won" / "lost" — the run has ended.
 */
export type RunStatus = "draft" | "active" | "shopping" | "won" | "lost";

export interface AnteOutcome {
  ante: number;
  cleared: boolean;
}

/** A build-defining perk offered in the between-Ante shop — REDESIGN.md "Economy/build loop". */
export interface Doctrine {
  id: string;
  name: string;
  rarity: Rarity;
  /** Pure: returns the party this Doctrine's effect applies to (stat mods, synergy bonuses, etc). */
  apply: (party: readonly FighterState[]) => readonly FighterState[];
  /**
   * REDESIGN.md "Shop-bought extra lives": a second, purchasable path to the
   * same one-per-season safety net the Sacrifice archetype grants. Doesn't
   * stack with itself or with owning a Sacrifice Pokémon — see extraLifeUsed.
   */
  grantsExtraLife?: boolean;
}

export interface RunState {
  /** Save format version — bump and migrate on shape changes, same discipline as LeagueState. */
  version: number;
  rng: RngState;
  charter: LeagueCharter;
  /** Total Antes (gym tiers) this season runs, the last one being the Championship attempt. */
  maxAntes: number;
  /** 0 while status is "draft"; 1-indexed once active. */
  ante: number;
  status: RunStatus;
  history: readonly AnteOutcome[];
  /** Empty until the draft (slice 3) fills it; persists and grows across the whole run. */
  party: readonly FighterState[];
  /** Doctrine ids already owned this run — same Doctrine can't be picked twice. */
  doctrines: readonly string[];
  /**
   * REDESIGN.md "Extra-life stacking": true once the one-per-season reprieve
   * has already fired, regardless of how many Sacrifice Pokémon or
   * resurrection Doctrines are owned — further sources just sit dead weight.
   */
  extraLifeUsed: boolean;
}
