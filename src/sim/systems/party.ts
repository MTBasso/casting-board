import { familyOf, grantableAtLevel, type Species } from "../../data/catalog.js";
import { makeCreature } from "../factory.js";
import { int, pick } from "../rng.js";
import { PARTY } from "../constants.js";
import { leaderPartyCap } from "./league.js";
import { nameOnBond } from "./wave.js";
import type { Creature, LeagueState, Trainer } from "../types.js";

/**
 * Parties.
 *
 * Six creatures per trainer, exactly as the games have always done — and the
 * *only* place a creature ever fights. Everything else sits in the box.
 *
 * The box is deliberately inert. By the mid-game the player owns hundreds of
 * creatures, and asking them to sort that is asking for a chore, not a decision.
 * So parties top themselves up on their own, and the player's real input is
 * **pinning**: marking the creatures that must never be swapped out. Attention
 * is the scarce resource the design cares about, so the interface only spends it
 * where it matters.
 */

export function partyOf(state: LeagueState, trainerId: string): Creature[] {
  const trainer = state.trainers[trainerId];
  if (!trainer) return [];
  return trainer.party
    .map((id) => state.creatures[id])
    .filter((c): c is Creature => c !== undefined);
}

export function partyCapOf(trainer: Trainer, state?: LeagueState): number {
  const stored = Math.min(PARTY.max, trainer.partyCap ?? PARTY.max);
  // A Leader's depth follows their gym's rank: the first gym fields two, the
  // last a full six. Passing state is optional so the many call sites that only
  // want the stored cap stay unchanged.
  if (state && trainer.kind === "leader" && trainer.gymId) {
    return Math.min(stored, leaderPartyCap(state, trainer.gymId));
  }
  return stored;
}

export function partyFull(trainer: Trainer, state?: LeagueState): boolean {
  return trainer.party.length >= partyCapOf(trainer, state);
}

/** Detach a creature from whatever party currently holds it. */
export function leaveParty(state: LeagueState, creatureId: string): void {
  for (const trainer of Object.values(state.trainers)) {
    if (!trainer.party.includes(creatureId)) continue;
    trainer.party = trainer.party.filter((id) => id !== creatureId);
  }
  const creature = state.creatures[creatureId];
  if (creature && creature.role === "party") {
    creature.role = "reserve";
    creature.trainerId = null;
  }
}

export function canJoin(
  state: LeagueState,
  creatureId: string,
  trainerId: string,
): { ok: true } | { ok: false; reason: string } {
  const trainer = state.trainers[trainerId];
  const creature = state.creatures[creatureId];
  if (!trainer || !creature) return { ok: false, reason: "Not found" };
  if (creature.role === "retired") return { ok: false, reason: "Retired" };
  if (!creature.owned) return { ok: false, reason: "Not yours to assign" };
  if (partyFull(trainer, state)) {
    return { ok: false, reason: `Party is full (${partyCapOf(trainer, state)})` };
  }
  if (trainer.party.includes(creatureId)) return { ok: false, reason: "Already here" };
  // Every trainer is their type, all the way through. No wildcards, no
  // exceptions for juniors — a gym *is* its type, and answering a hostile meta
  // means casting within it or building a different gym.
  if (!creature.types.includes(trainer.affinity)) {
    return { ok: false, reason: `${trainer.name} only fields ${trainer.affinity} types` };
  }
  if (state.dayCare.some((slot) => slot.creatureId === creatureId)) {
    return { ok: false, reason: "At the Day-Care" };
  }

  // One per evolution line. A party holding both a Charmander and a Charizard
  // is not a team, it is a collection — and the games have never allowed it.
  const family = familyOf(creature.speciesId);
  for (const id of trainer.party) {
    const member = state.creatures[id];
    if (!member) continue;
    if (familyOf(member.speciesId) === family) {
      return {
        ok: false,
        reason: `${trainer.name} already has one of that line`,
      };
    }
  }
  return { ok: true };
}

export function join(
  state: LeagueState,
  creatureId: string,
  trainerId: string,
): { ok: true } | { ok: false; reason: string } {
  const check = canJoin(state, creatureId, trainerId);
  if (!check.ok) return check;

  const trainer = state.trainers[trainerId];
  const creature = state.creatures[creatureId];
  if (!trainer || !creature) return { ok: false, reason: "Not found" };

  leaveParty(state, creatureId);
  nameOnBond(state, creature);
  creature.role = "party";
  creature.trainerId = trainerId;
  creature.gymId = trainer.gymId;
  trainer.party.push(creatureId);
  return { ok: true };
}

export function togglePin(state: LeagueState, creatureId: string): void {
  const creature = state.creatures[creatureId];
  if (creature) creature.pinned = !creature.pinned;
}

/**
 * Take a creature out of its party and keep it out.
 *
 * Benching is the player saying "not this one". Auto-fill respects it, so the
 * removal sticks instead of being undone on the next pass.
 */
export function bench(state: LeagueState, creatureId: string): void {
  const creature = state.creatures[creatureId];
  if (!creature) return;
  const trainer = creature.trainerId ? state.trainers[creature.trainerId] : undefined;
  // A trainer's own signature creature is not the player's to remove.
  if (trainer?.signatureId === creatureId) return;

  leaveParty(state, creatureId);
  creature.benched = true;
  creature.pinned = false;
}

/** Put a benched creature back in circulation. */
export function unbench(state: LeagueState, creatureId: string): void {
  const creature = state.creatures[creatureId];
  if (creature) creature.benched = false;
}

/**
 * Creatures sitting in the box, eligible for a given trainer.
 *
 * On-type only. Wildcards exist so the *player* can answer a threat; filling
 * them automatically would take that decision straight back off them.
 */
function boxFor(state: LeagueState, trainer: Trainer): Creature[] {
  const parked = new Set(state.dayCare.map((slot) => slot.creatureId));
  return Object.values(state.creatures)
    .filter(
      (c) =>
        c.role === "reserve" &&
        c.owned &&
        !c.benched &&
        !parked.has(c.id) &&
        c.types.includes(trainer.affinity),
    )
    .sort((a, b) => b.power - a.power);
}

/**
 * Keep one trainer's party stocked.
 *
 * Three rules:
 *
 *   1. Empty slots fill with the strongest legal creature in the box.
 *   2. A party member is replaced only when the box holds something *clearly*
 *      better — clearly, not marginally, so parties do not churn.
 *   3. Nothing pinned, and nothing that has already bonded, is ever replaced.
 *
 * The contract: the game handles the roster, the player decides who matters —
 * and a creature that has served decides for itself.
 */
export function autoFill(state: LeagueState, trainerId: string): void {
  const trainer = state.trainers[trainerId];
  if (!trainer) return;

  const box = boxFor(state, trainer);
  if (box.length === 0 && partyFull(trainer)) return;

  // 1. Fill empty slots.
  let cursor = 0;
  while (!partyFull(trainer, state) && cursor < box.length) {
    const candidate = box[cursor++];
    if (!candidate) break;
    if (candidate.role !== "reserve") continue;
    // canJoin rejects duplicate evolution lines, so a failed attempt is normal
    // here — move on rather than stalling the whole fill.
    join(state, candidate.id, trainer.id);
  }

  // 2. Upgrade the weakest replaceable member, if the box clearly beats it.
  // A creature is replaceable only while it is pinned by nobody *and* has not
  // yet bonded — once it has served, swapping it out would throw away the
  // reliability it earned, which is the one thing the game is about.
  const members = partyOf(state, trainer.id).filter(
    (c) =>
      !c.pinned &&
      c.id !== trainer.signatureId &&
      c.bond < PARTY.bondProtection,
  );
  if (members.length === 0) return;

  const weakest = members.reduce((lo, c) => (c.power < lo.power ? c : lo), members[0]!);

  // Find a replacement that could *actually* take the slot. Removing first and
  // asking later left the party a creature short whenever the candidate clashed
  // on evolution line with someone already there.
  const candidate = boxFor(state, trainer).find(
    (c) =>
      c.power > weakest.power * PARTY.upgradeThreshold &&
      familyOf(c.speciesId) !== familyOf(weakest.speciesId) &&
      !trainer.party.some((id) => {
        const member = state.creatures[id];
        return member !== undefined && familyOf(member.speciesId) === familyOf(c.speciesId);
      }),
  );
  if (!candidate) return;

  leaveParty(state, weakest.id);
  if (!join(state, candidate.id, trainer.id).ok) {
    // Should not happen, but never leave the party smaller than we found it.
    join(state, weakest.id, trainer.id);
  }
}

/**
 * Give a trainer a party of their own, one creature per evolution line.
 *
 * Trainers used to be equipped by pushing straight into `party`, which skipped
 * `canJoin` and produced squads holding a Charmeleon, a Charizard and another
 * Charmeleon. Everything that grants a party goes through here.
 */
export function grantParty(
  state: LeagueState,
  trainer: Trainer,
  pool: readonly Species[],
  count: number,
  opts: { level: number; bond: number; jitter?: number; owned?: boolean },
): void {
  const used = new Set(
    trainer.party.map((id) => {
      const c = state.creatures[id];
      return c ? familyOf(c.speciesId) : "";
    }),
  );

  // Only species this trainer could actually have at this level. Without it,
  // `makeCreature`'s upward clamp to the evolution floor turns a request for a
  // level 8 team into a level 36 one.
  const eligible = grantableAtLevel(pool, opts.level + (opts.jitter ?? 0));
  const available = eligible.filter((s) => !used.has(familyOf(s.slug)));
  let guard = 0;

  while (trainer.party.length < Math.min(count, partyCapOf(trainer)) && guard < 64) {
    guard += 1;
    const remaining = available.filter((s) => !used.has(familyOf(s.slug)));
    if (remaining.length === 0) break;

    const species = pick(state.rng, remaining);
    used.add(familyOf(species.slug));

    const jitter = opts.jitter ?? 0;
    const mon = makeCreature(state, species, "party", {
      bond: opts.bond,
      level: Math.max(1, opts.level + (jitter > 0 ? int(state.rng, -jitter, jitter) : 0)),
      // Junior trainers bring their own; those creatures are never the
      // player's, so they stay out of the PC entirely.
      owned: opts.owned ?? true,
    });
    mon.trainerId = trainer.id;
    mon.gymId = trainer.gymId;
    nameOnBond(state, mon);
    trainer.party.push(mon.id);
  }
}

/**
 * What could join this party, and what could not — with the reason.
 *
 * The player needs to see *why* a creature is unavailable, not just that it is
 * missing from a list. "Already has one of that line" is a rule they can learn;
 * an absent row is a mystery.
 */
export interface Candidate {
  creature: Creature;
  ok: boolean;
  reason?: string;
}

export function candidatesFor(state: LeagueState, trainerId: string): Candidate[] {
  const trainer = state.trainers[trainerId];
  if (!trainer) return [];

  const parked = new Set(state.dayCare.map((slot) => slot.creatureId));

  return Object.values(state.creatures)
    .filter(
      (c) =>
        c.owned &&
        c.role === "reserve" &&
        !parked.has(c.id) &&
        // Only creatures this trainer could field, which is their own type.
        c.types.includes(trainer.affinity),
    )
    .map((creature) => {
      const check = canJoin(state, creature.id, trainerId);
      return check.ok
        ? { creature, ok: true }
        : { creature, ok: false, reason: check.reason };
    })
    .sort((a, b) => {
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      return b.creature.power - a.creature.power;
    });
}

/** Keep every party in the league stocked. Cheap enough to run on a timer. */
export function autoFillAll(state: LeagueState): void {
  for (const [trainerId, trainer] of Object.entries(state.trainers)) {
    // A candidate's party is their own; the box does not stock it.
    if (trainer.kind === "candidate") continue;
    autoFill(state, trainerId);
  }
}
