import { catalog } from "../../data/catalog.js";
import { MORALE, PARTY, STAFF, TITLE } from "../constants.js";
import { makeCreature, makeTrainer } from "../factory.js";
import { resign } from "./economy.js";
import { demote, demotionTargets } from "./morale.js";
import { log } from "../tick.js";
import type {
  Challenger,
  Grudge,
  LeagueState,
  TickReport,
  Trainer,
  TypeId,
} from "../types.js";

/**
 * Losing the title.
 *
 * The old version incremented `leagueTaken` and docked some renown. A number
 * moved, on the biggest event in the game.
 *
 * Now the challenger who clears the whole board **becomes your Champion**. It is
 * not a fail state and there is no game-over screen: it is a staffing problem
 * with a face on it. You employ the person who beat you, you cannot bench them
 * while their protection holds, they are expensive and proud, and if you
 * mismanage them they walk — and come back for the league again.
 *
 * The one rule underneath all of it: **anyone who leaves your league comes back
 * to fight it.** The usurper who walks and the prodigy you turned away are the
 * same mechanism wearing different clothes.
 */

/** The type a challenger's party leans on hardest. */
function dominantType(challenger: Challenger): TypeId {
  const tally = new Map<TypeId, number>();
  for (const mon of challenger.party) {
    for (const t of mon.types) tally.set(t, (tally.get(t) ?? 0) + mon.power);
  }
  let best: TypeId = "normal";
  let bestScore = -1;
  for (const [t, score] of tally) {
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The challenger takes the Champion's seat, and your Champion makes room.
 *
 * Displacement is a demotion where one is available, and only a departure where
 * none is — losing the title should not also cost you the person who held it,
 * unless the board genuinely has nowhere to put them.
 */
export function forceRecruit(
  state: LeagueState,
  challenger: Challenger,
  clearedSeats: number,
  report: TickReport,
): Trainer | null {
  const seat = state.elite.find((s) => s.rank === Math.max(...state.elite.map((e) => e.rank)));
  if (!seat) return null;

  const affinity = dominantType(challenger);
  const incumbent = seat.trainerId ? state.trainers[seat.trainerId] : undefined;

  if (incumbent) {
    // Their protection, if they had any, does not survive being beaten.
    incumbent.demotionLockedUntil = null;
    const target = demotionTargets(state, incumbent.id)[0];
    if (target) {
      demote(state, incumbent.id, target);
    } else {
      log(state, "quit", `${incumbent.name} leaves rather than serve under a rival.`);
      remember(state, incumbent.name, incumbent.affinity, 1);
      report.departures.push(incumbent.name);
      resign(state, incumbent.id, report);
    }
    seat.trainerId = null;
  }

  const usurper = makeTrainer(state, affinity, "champion", {
    bond: 0.4,
    partyCap: PARTY.max,
  });
  usurper.origin = "usurper";
  // They know exactly what they are worth, and they say so every payday.
  usurper.salary = STAFF.baseSalaryPerHour * TITLE.usurperSalary;
  // You cannot simply bench the upstart because they embarrassed you.
  usurper.demotionLockedUntil = state.time + TITLE.protectionSeconds;

  // The team that beat you comes with them. Not yours — theirs, the way a
  // signature creature has always been.
  for (const mon of challenger.party) {
    if (usurper.party.length >= PARTY.max) break;
    const species = catalog.get(mon.speciesId);
    if (!species) continue;
    const creature = makeCreature(state, species, "party", {
      level: mon.level,
      bond: 0.5,
      owned: false,
    });
    creature.trainerId = usurper.id;
    usurper.party.push(creature.id);
  }

  seat.trainerId = usurper.id;
  state.usurperId = usurper.id;
  state.titleLost = true;

  // The ripple. Seats the challenger beat cleanly take it personally; the ones
  // who held take nothing, which quietly tells the player who is worth keeping.
  bruiseDefeated(state, clearedSeats);

  report.usurped = usurper.name;
  log(
    state,
    "gauntlet",
    `${usurper.name} has taken the league. They are your Champion now.`,
  );
  return usurper;
}

/**
 * Morale damage to everyone the challenger went through.
 *
 * Routed through the 8.1 staircase rather than a new punishment mechanic: the
 * loss lands on a system that already has recovery paths, so a bad night is
 * survivable and a run of them is not.
 */
function bruiseDefeated(state: LeagueState, clearedSeats: number): void {
  const beaten = [...state.elite]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, clearedSeats)
    .map((s) => (s.trainerId ? state.trainers[s.trainerId] : undefined));

  for (const trainer of beaten) {
    if (!trainer) continue;
    if (trainer.origin === "usurper") continue;
    trainer.morale = Math.max(0, trainer.morale - TITLE.defeatMoraleHit);
    trainer.strain += TITLE.defeatStrain;
  }
}

/**
 * Record someone who left with a score to settle.
 *
 * Rival leagues were the concept draft's answer to this and they are not a thing
 * in the source games. Motivation is: the person you lost comes back for you.
 */
export function remember(
  state: LeagueState,
  name: string,
  type: TypeId,
  level: number,
): void {
  const existing = state.grudges.find((g) => g.name === name);
  if (existing) {
    existing.level += level;
    return;
  }
  state.grudges.push({ name, type, level, losses: 0 });
  if (state.grudges.length > TITLE.grudgeCap) {
    state.grudges = state.grudges.slice(-TITLE.grudgeCap);
  }
}

/**
 * A grudge softens each time you beat them, and eventually they take a post.
 * Returns true when they are finally ready to be hired.
 */
export function beatGrudge(state: LeagueState, name: string): boolean {
  const grudge = state.grudges.find((g) => g.name === name);
  if (!grudge) return false;
  grudge.losses += 1;
  grudge.level = Math.max(0, grudge.level - 1);
  if (grudge.level <= 0) {
    state.grudges = state.grudges.filter((g) => g.name !== name);
    return true;
  }
  return false;
}

/** Extra power a returning grudge carries. */
export function grudgeMultiplier(grudge: Grudge): number {
  return 1 + grudge.level * TITLE.grudgePowerPerLevel;
}

/**
 * The usurper's running costs: pride is a morale drain, not a stat.
 *
 * Handled here rather than in `payroll` because it is a property of *how they
 * arrived*, and the next origin (the arrogant prodigy) will want the same hook.
 */
export function tickUsurper(state: LeagueState, dt: number, report: TickReport): void {
  if (!state.usurperId) return;
  const usurper = state.trainers[state.usurperId];
  if (!usurper) {
    state.usurperId = null;
    return;
  }

  usurper.morale = Math.max(0, usurper.morale - TITLE.usurperMoraleDecay * dt);

  // Protection lapses, and then they are an ordinary — if expensive — Champion.
  if (
    usurper.demotionLockedUntil !== null &&
    state.time >= usurper.demotionLockedUntil
  ) {
    usurper.demotionLockedUntil = null;
  }

  // Mismanaged past the end of the staircase, they walk. And they do not go
  // quietly: they go onto the list of people coming back for the league.
  if (usurper.suspensions > MORALE.suspensionsBeforeDeparture) {
    remember(state, usurper.name, usurper.affinity, 2);
    report.departures.push(usurper.name);
    log(state, "quit", `${usurper.name} walks out — and they will be back.`);
    resign(state, usurper.id, report);
    state.usurperId = null;
  }
}

/** Whether this trainer currently cannot be moved or dismissed. */
export function isProtected(state: LeagueState, trainer: Trainer): boolean {
  return (
    trainer.demotionLockedUntil !== null && state.time < trainer.demotionLockedUntil
  );
}

/** Sim-seconds of protection left, for the UI. */
export function protectionRemaining(state: LeagueState, trainer: Trainer): number {
  if (trainer.demotionLockedUntil === null) return 0;
  return Math.max(0, trainer.demotionLockedUntil - state.time);
}
