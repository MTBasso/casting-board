import { catalog, encounterWeight, familyOf, minLevelFor } from "../../data/catalog.js";
import { effectivenessAgainst } from "../../data/typechart.js";
import { BOND, CAREER, CHALLENGE, ELITE, FATIGUE, LEVELS } from "../constants.js";
import { chance, int, next, pick, range, weighted } from "../rng.js";
import { damage, powerOf, statsFor, statsOf, type Stats } from "./stats.js";
import { gainXp } from "./growth.js";
import { bondSpeed } from "./facilities.js";
import { isSuspended, moraleFactor } from "./morale.js";
import { mentorBonus } from "./promotion.js";
import { displayName, retire } from "./wave.js";
import type {
  BattleEvent,
  BattleFighter,
  BattleRecord,
  Challenger,
  ChallengerMon,
  Creature,
  Gym,
  LeagueState,
  TickReport,
  Trainer,
  TypeId,
} from "../types.js";

/**
 * Challenges.
 *
 * A challenger arrives at one gym and fights up through it — junior trainers in
 * order, then the Leader — exactly as a gym works in the games. Every battle is
 * party against party, resolved as a run of one-on-one knockouts.
 *
 * Two rules carry the weight:
 *
 *   - **Faints persist across the whole gym run.** A challenger who loses two
 *     creatures to your first junior meets the second four-strong and reaches
 *     your Leader worn down. This is what makes hiring depth *literally* protect
 *     the creatures the player cares about, rather than statistically.
 *   - **Challengers carry Revives.** A well-stocked one gets back up, which is
 *     why grinding them down is not merely a matter of numbers.
 *
 * A challenger's badge count decides which gym they attack, how large their
 * party is, how strong it is, and how many items they brought. That one number
 * is the whole difficulty curve.
 */

// ---------------------------------------------------------------------------
// Generating a challenger
// ---------------------------------------------------------------------------

/** Party size, level and item count all follow from badges. */
export function partySizeFor(badges: number): number {
  return Math.max(1, Math.min(CHALLENGE.maxParty, 1 + badges));
}

/**
 * A challenger's level, adjusted for how many they brought.
 *
 * A challenger walking into gym one may well have six creatures — people do
 * arrive with a full box — but six *at the gym's level* is not a first badge,
 * it is a wall. So depth and quality trade against each other: the bigger the
 * party, the greener it is.
 *
 * This is the same bargain the player makes on their own side. A Leader at the
 * first gym fields two good creatures; the challenger's answer to depth is that
 * theirs are not ready yet.
 */
export function depthPenalty(size: number): number {
  const extra = Math.max(0, size - CHALLENGE.freeDepth);
  return Math.max(CHALLENGE.minDepthScale, 1 - extra * CHALLENGE.levelPerExtraMon);
}

export function levelFor(
  state: LeagueState,
  badges: number,
  /**
   * The creatures this challenger will actually meet. Challengers scale to the
   * people standing in front of them rather than to one league-wide average —
   * a gym staffed with veterans draws harder challengers than the Elite tier
   * does if the Elite tier is fielding rookies, which is both fairer and the
   * only version that cannot be gamed by owning a lot of weak creatures.
   */
  facing?: readonly Creature[],
  /** Reference level this challenger never scales below. */
  floor = 0,
): number {
  const raw =
    CHALLENGE.baseLevel +
    badges * CHALLENGE.levelPerBadge +
    (state.renown / 1000) * CHALLENGE.levelPerThousandRenown;

  // Renown governs how many arrive and what is at stake; it must not put them
  // out of reach of any casting decision the player could make.
  const reference = Math.max(
    floor,
    facing && facing.length > 0 ? meanLevel(facing) : fieldedLevel(state),
  );
  const ceiling = Math.max(
    CHALLENGE.minChallengerLevel,
    reference * CHALLENGE.maxLevelRatio,
  );
  return Math.round(Math.min(raw, ceiling));
}

function meanLevel(creatures: readonly Creature[]): number {
  if (creatures.length === 0) return CHALLENGE.baseLevel;
  return creatures.reduce((a, c) => a + c.level, 0) / creatures.length;
}

/**
 * The level the league can actually put in front of a challenger — the mean of
 * its strongest third of fielded creatures.
 *
 * The strongest third rather than the mean of everything, because a plain mean
 * is dilutable: once Rangers are running, the roster fills with low-level
 * catches, and averaging over all of them would make challengers *weaker* the
 * more creatures you own. That is exactly backwards, and it would reward
 * hoarding junk — the behaviour this whole design exists to make unnecessary.
 *
 * Recomputed rather than cached: it is O(party count) a few times a minute, and
 * a stale value here would silently mistune every challenger in the game.
 */
export function fieldedLevel(state: LeagueState): number {
  const levels: number[] = [];
  for (const trainer of Object.values(state.trainers)) {
    if (trainer.kind === "candidate" || trainer.kind === "ranger") continue;
    for (const id of trainer.party) {
      const c = state.creatures[id];
      if (c) levels.push(c.level);
    }
  }
  if (levels.length === 0) return CHALLENGE.baseLevel;

  levels.sort((a, b) => b - a);
  const top = levels.slice(0, Math.max(1, Math.ceil(levels.length / 3)));
  return top.reduce((a, b) => a + b, 0) / top.length;
}

export function revivesFor(badges: number): number {
  return Math.floor(badges / CHALLENGE.badgesPerRevive);
}

/**
 * Challenger creatures are **not type-bound**. A trainer walking in off the
 * road runs whatever they caught, which is exactly why a type-locked gym needs
 * a spread of answers rather than six of one thing.
 */
function rollMon(state: LeagueState, level: number): ChallengerMon | null {
  const pool = catalog
    .all()
    .filter((s) => encounterWeight(s) > 0 && minLevelFor(s) <= level);
  if (pool.length === 0) return null;

  const weights: Record<string, number> = {};
  for (const s of pool) weights[s.slug] = encounterWeight(s);
  const species = catalog.get(weighted(state.rng, weights));
  if (!species) return null;

  const actual = Math.max(minLevelFor(species), level + int(state.rng, -2, 2));
  const power = Math.round(
    species.power * range(state.rng, 0.9, 1.1) * (1 + (actual - 1) * LEVELS.powerPerLevel),
  );

  return {
    speciesId: species.slug,
    types: species.types,
    level: actual,
    power,
    hp: 0,
    fainted: false,
  };
}

export function makeChallenger(
  state: LeagueState,
  badges: number,
  facing?: readonly Creature[],
  floor = 0,
): Challenger {
  const size = partySizeFor(badges);
  const level = Math.max(1, Math.round(levelFor(state, badges, facing, floor) * depthPenalty(size)));
  const party: ChallengerMon[] = [];
  const families = new Set<string>();

  let guard = 0;
  while (party.length < size && guard < 40) {
    guard += 1;
    const mon = rollMon(state, level);
    if (!mon) break;
    // Even a stranger does not carry two of the same line.
    if (families.has(familyOf(mon.speciesId))) continue;
    families.add(familyOf(mon.speciesId));
    party.push(mon);
  }

  return { badges, party, revives: revivesFor(badges) };
}

// ---------------------------------------------------------------------------
// One bout, fought in rounds
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Bond buys reliability, not power — this is the spread a bonded creature
 * narrows, applied to every blow it strikes.
 */
function reliability(state: LeagueState, bond: number): number {
  const spread =
    BOND.varianceAtZero + (BOND.varianceAtFull - BOND.varianceAtZero) * clamp01(bond);
  return range(state.rng, 1 - spread, 1 + spread);
}

interface Fighter {
  name: string;
  speciesId: string;
  types: readonly TypeId[];
  level: number;
  stats: Stats;
  hp: number;
  maxHp: number;
  /** Present only for the league's own creatures. */
  creature?: Creature;
  /** Slot in its own party, so the battle view can address it. */
  slot: number;
}

function ourFighter(c: Creature, slot: number): Fighter {
  const stats = statsOf(c);
  return {
    slot,
    name: displayName(c),
    speciesId: c.speciesId,
    types: c.types,
    level: c.level,
    stats,
    hp: stats.hp,
    maxHp: stats.hp,
    creature: c,
  };
}

const FALLBACK_STATS = {
  hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50,
};

function theirFighter(mon: ChallengerMon, slot: number): Fighter {
  const species = catalog.get(mon.speciesId);
  const stats = statsFor(species?.stats ?? FALLBACK_STATS, mon.level, 1);
  return {
    slot,
    name: species?.name ?? mon.speciesId,
    speciesId: mon.speciesId,
    types: mon.types,
    level: mon.level,
    stats,
    hp: mon.hp > 0 ? mon.hp : stats.hp,
    maxHp: stats.hp,
  };
}

function event(
  kind: BattleEvent["kind"],
  attacker: Fighter,
  defender: Fighter,
  dealt: number,
  eff: number,
): BattleEvent {
  return {
    kind,
    attacker: attacker.name,
    attackerSpecies: attacker.speciesId,
    defender: defender.name,
    defenderSpecies: defender.speciesId,
    damage: dealt,
    effectiveness: eff,
    defenderHp: defender.hp,
    defenderMaxHp: defender.maxHp,
    ours: attacker.creature !== undefined,
    attackerIndex: attacker.slot,
    defenderIndex: defender.slot,
  };
}

/** A party as it stood at the start, for the battle view's two benches. */
function snapshot(fighters: readonly Fighter[]): BattleFighter[] {
  return fighters.map((f) => ({
    speciesId: f.speciesId,
    name: f.name,
    level: f.level,
    maxHp: f.maxHp,
  }));
}

/**
 * Who should have won, if nothing surprising happened.
 *
 * Null when it was close enough that either result is unremarkable — an upset
 * only means something when the matchup was clear.
 */
function favoured(ours: Fighter, theirs: Fighter): boolean | null {
  const oursVsThem = effectivenessAgainst(ours.types[0] ?? "normal", theirs.types);
  const themVsOurs = effectivenessAgainst(theirs.types[0] ?? "normal", ours.types);
  const typeEdge = oursVsThem / Math.max(0.25, themVsOurs);
  const bulkEdge = (powerOf(ours.stats) * ours.level) / Math.max(1, powerOf(theirs.stats) * theirs.level);

  const edge = typeEdge * bulkEdge;
  if (edge > CHALLENGE.upsetMargin) return true;
  if (edge < 1 / CHALLENGE.upsetMargin) return false;
  return null;
}

/**
 * One creature against one, fought until somebody drops.
 *
 * Faster strikes first, which is the whole reason Speed exists. Every blow is
 * recorded so the feed can show a bout *happening* rather than announcing a
 * result — a challenger's team coming apart is most of the drama the game has.
 */
function bout(
  state: LeagueState,
  ours: Fighter,
  theirs: Fighter,
  log: BattleEvent[],
): "ours" | "theirs" {
  let guard = 0;

  while (ours.hp > 0 && theirs.hp > 0 && guard < 40) {
    guard += 1;
    const weFirst = ours.stats.speed >= theirs.stats.speed;
    const order: [Fighter, Fighter][] = weFirst
      ? [
          [ours, theirs],
          [theirs, ours],
        ]
      : [
          [theirs, ours],
          [ours, theirs],
        ];

    for (const [attacker, defender] of order) {
      if (attacker.hp <= 0 || defender.hp <= 0) continue;

      const eff = effectivenessAgainst(attacker.types[0] ?? "normal", defender.types);
      const roll = attacker.creature
        ? reliability(state, attacker.creature.bond)
        : range(state.rng, 0.9, 1.1);

      const dealt = damage(attacker.stats, defender.stats, attacker.level, eff, roll);
      defender.hp = Math.max(0, defender.hp - dealt);

      log.push(event("hit", attacker, defender, dealt, eff));
      if (defender.hp <= 0) {
        log.push(event("faint", attacker, defender, 0, 1));
        break;
      }
    }
  }

  return ours.hp > 0 ? "ours" : "theirs";
}

// ---------------------------------------------------------------------------
// One trainer's party against the challenger's
// ---------------------------------------------------------------------------

interface BattleOutcome {
  held: boolean;
  knockouts: number;
  /** Who this trainer actually fielded, in order, for the battle view. */
  party: BattleFighter[];
}

/**
 * Party against party.
 *
 * Order matters: index 0 leads, and the next steps up as each one drops. That
 * is the whole reason the player can drag their party around.
 */
function battleParty(
  state: LeagueState,
  trainer: Trainer,
  challenger: Challenger,
  report: TickReport,
  log: BattleEvent[],
): BattleOutcome {
  const bench = trainer.party
    .map((id) => state.creatures[id])
    .filter(
      (c): c is Creature =>
        c !== undefined &&
        c.role !== "retired" &&
        c.fatigue < FATIGUE.exhausted &&
        !state.dayCare.some((slot) => slot.creatureId === c.id),
    );

  if (bench.length === 0) return { held: false, knockouts: 0, party: [] };

  // Health is set once and carried across the whole stand, so a creature that
  // took a beating and rotated out is still hurt when it comes back round.
  // Fatigue and a dispirited trainer both show up here: starting worn down.
  const roster = bench.map((c, i) => {
    const f = ourFighter(c, i);
    f.hp = Math.max(1, Math.round(f.maxHp * (1 - c.fatigue * 0.45) * moraleFactor(trainer)));
    return f;
  });

  // **The party takes turns leading.** Position one leads a challenge, position
  // two leads the next, and so on round the party.
  //
  // Order still matters — it is the sequence, and it decides who backs up whom
  // once a stand runs long. What it is not any more is a permanent posting.
  // Measured on a real league under the old rule, every gym looked like this:
  //
  //     ground   1.00 bond / 202 wins · 0.08 / 8 · 0.00 / 0 · 0.01 / 1 · 0.00 / 0
  //
  // One creature and five spectators, because a stand is usually a single bout
  // and every stand began at position one. That is the genre failure this whole
  // design exists to answer, arriving through the back door.
  //
  // Rotating on a knockout (see `nextDefender`) fixes long stands; taking turns
  // fixes short ones. Both are needed.
  let ours = trainer.leadIndex % bench.length;
  // Skip anyone too worn to start, so the turn passes rather than stalls.
  for (let step = 0; step < bench.length; step++) {
    const i = (trainer.leadIndex + step) % bench.length;
    if ((bench[i]?.fatigue ?? 1) < FATIGUE.exhausted) {
      ours = i;
      break;
    }
  }
  trainer.leadIndex = (ours + 1) % bench.length;

  let knockouts = 0;
  let guard = 0;

  while (guard < 60) {
    guard += 1;

    const nextTheirs = challenger.party.findIndex((m) => !m.fainted);
    if (nextTheirs === -1) break;

    const defender = bench[ours];
    const attackerMon = challenger.party[nextTheirs];
    const us = roster[ours];
    if (!defender || !attackerMon || !us) break;

    const them = theirFighter(attackerMon, nextTheirs);
    const winner = bout(state, us, them, log);

    // An upset is a bout whose result contradicted the matchup. This is the
    // only place bond becomes *visible*: a creature that swings wildly is the
    // one you have not got to know yet, and the feed says so by name.
    //
    // The report field for this existed from the first pass and was never once
    // written to — bond has been buying reliability in silence for the whole
    // project, which is as good as not buying anything.
    const expected = favoured(us, them);
    if (expected !== null && expected !== (winner === "ours")) {
      report.upsets.push({ name: us.name, bond: defender.bond, won: winner === "ours" });
    }

    spend(state, defender, CAREER.costPerExchange, trainer, report);
    defender.fatigue = clamp01(defender.fatigue + FATIGUE.perExchange);
    // An Elite bout is worth far more than a gym wave, because there are far
    // fewer of them. Without this the tier can never develop its own roster.
    const stakes =
      trainer.kind === "elite" || trainer.kind === "champion" ? ELITE.xpMultiplier : 1;
    grow(state, defender, LEVELS.xpPerBattle * stakes, report);

    if (winner === "ours") {
      defender.wins += 1;
      knockouts += 1;
      attackerMon.fainted = true;
      attackerMon.hp = 0;

      if (challenger.revives > 0 && chance(state.rng, CHALLENGE.reviveChance)) {
        challenger.revives -= 1;
        attackerMon.fainted = false;
        attackerMon.hp = Math.round(them.maxHp * 0.5);
        report.revives.push(them.name);
        them.hp = attackerMon.hp;
        log.push(event("revive", them, them, 0, 1));
      }
      gainBondFor(state, defender, trainer);
    } else {
      defender.losses += 1;
      defender.fatigue = clamp01(defender.fatigue + FATIGUE.faintPenalty);
      spend(state, defender, CAREER.faintPenalty, trainer, report);
      gainBondFor(state, defender, trainer, "lost");
      us.hp = 0;
      // The challenger's creature carries its damage onward.
      attackerMon.hp = them.hp;
    }

    const next = nextDefender(roster, ours, winner === "ours");
    if (next === -1) break;
    ours = next;
  }

  return {
    held: challenger.party.every((m) => m.fainted),
    knockouts,
    party: snapshot(roster),
  };
}

/**
 * Who steps up next.
 *
 * **A creature rotates out after it scores a knockout.** This is the single
 * most consequential rule in the battle system, and getting it wrong hid the
 * game's oldest problem inside its newest feature.
 *
 * With the old rule — step aside only when you faint — position one won 88% of
 * its bouts and therefore fought essentially every bout there was. Measured on a
 * real league, every gym looked like this:
 *
 *     ground   1.00 bond / 202 wins · 0.08 / 8 · 0.00 / 0 · 0.01 / 1 · 0.00 / 0
 *
 * One creature and five spectators. Which is exactly the failure this whole
 * design exists to answer — "you end up with one strong Pokémon and a bunch of
 * weak ones" — reappearing through the back door.
 *
 * Rotating on a knockout means a six-strong challenger meets up to six of yours,
 * so depth answers depth, bond spreads across a party instead of pooling in one
 * creature, and career wears down a roster rather than a single life.
 */
function nextDefender(roster: readonly Fighter[], current: number, rotate: boolean): number {
  const standing = (i: number) => roster[i] !== undefined && roster[i]!.hp > 0;

  // Look forward from the current slot, wrapping, for the next one still up.
  for (let step = 1; step <= roster.length; step++) {
    const i = (current + step) % roster.length;
    if (standing(i)) return i;
  }
  // Nobody else is left. The incumbent fights on if it can.
  if (!rotate && standing(current)) return current;
  return standing(current) ? current : -1;
}

function gainBondFor(
  state: LeagueState,
  c: Creature,
  trainer: Trainer,
  /** A lost bout still counts — see `BOND.perLoss`. */
  outcome: "won" | "lost" = "won",
): void {
  if (c.role !== "party" || !c.owned) return;
  const share = outcome === "won" ? 1 : BOND.perLoss;
  const doctrine = trainer.doctrine === "mentor" ? BOND.mentorMultiplier : 1;
  c.bond = clamp01(
    c.bond + BOND.perWave * share * doctrine * mentorBonus(state, c.types) * bondSpeed(state),
  );
}

function grow(state: LeagueState, c: Creature, xp: number, report: TickReport): void {
  const became = gainXp(state, c, xp);
  if (became) report.evolutions.push(`${displayName(c)} evolved into ${became}`);
}

function spend(
  state: LeagueState,
  c: Creature,
  cost: number,
  trainer: Trainer,
  report: TickReport,
): void {
  const mult = trainer.doctrine === "drillmaster" ? CAREER.drillmasterMultiplier : 1;
  c.careerSpent += cost * mult;
  if (c.careerSpent >= c.careerTotal && c.role !== "retired") {
    const name = displayName(c);
    retire(state, c);
    report.retirements.push(name);
  }
}

// ---------------------------------------------------------------------------
// The whole gym
// ---------------------------------------------------------------------------

export interface ChallengeResult {
  /** How many of the gym's trainers the challenger got past. */
  cleared: number;
  /** True when they beat the Leader and earned the badge. */
  tookBadge: boolean;
  /** Trainers the challenger never reached, thanks to the ones who stopped them. */
  spared: number;
  challengerType: TypeId;
}

/** The typing a challenger's party leads with, for the Threat Report. */
function reportTypes(challenger: Challenger): TypeId[] {
  return challenger.party.flatMap((m) => [...m.types]);
}

export function runChallenge(
  state: LeagueState,
  gym: Gym,
  challenger: Challenger,
  report: TickReport,
  record?: BattleRecord,
): ChallengeResult {
  const order = [
    ...gym.trainerIds,
    ...(gym.leaderId ? [gym.leaderId] : []),
  ];

  if (record) {
    record.challenger = snapshot(challenger.party.map((m, i) => theirFighter(m, i)));
  }

  let cleared = 0;
  for (let i = 0; i < order.length; i++) {
    const trainerId = order[i] ?? "";
    const trainer = state.trainers[trainerId];
    // A suspended trainer is a hole in the gym, and the challenger walks
    // straight through it. That is the cost of letting morale run down.
    if (!trainer || isSuspended(state, trainer)) {
      cleared += 1;
      continue;
    }

    const events: BattleEvent[] = [];
    const outcome = battleParty(state, trainer, challenger, report, events);
    record?.stages.push({
      trainer: trainer.name,
      isLeader: trainerId === gym.leaderId,
      party: outcome.party,
      events,
    });
    if (outcome.held) {
      // Everyone further up the gym never had to fight.
      const spared = order.length - i - 1;
      gym.threat.absorbed += spared;
      return {
        cleared,
        tookBadge: false,
        spared,
        challengerType: reportTypes(challenger)[0] ?? "normal",
      };
    }
    cleared += 1;
  }

  return {
    cleared,
    tookBadge: true,
    spared: 0,
    challengerType: reportTypes(challenger)[0] ?? "normal",
  };
}

/** Fold a resolved challenge into the gym's rolling Threat Report. */
export function recordThreat(gym: Gym, challenger: Challenger, held: boolean): void {
  const report = gym.threat;
  const types = reportTypes(challenger);
  if (types.length === 0) return;

  // Aggregated across every creature the challenger brought — "38% of what
  // walks through that door is Water" is a truer number than the lead's type.
  const w = 1 / Math.max(1, CHALLENGE.reportWindow);
  for (const key of Object.keys(report.distribution) as TypeId[]) {
    report.distribution[key] *= 1 - w;
  }
  for (const t of types) {
    report.distribution[t] += w / types.length;
  }

  report.lossRate = report.lossRate * (1 - w) + (held ? 0 : 1) * w;
  report.samples += 1;
  report.status =
    report.lossRate >= CHALLENGE.criticalLossRate
      ? "critical"
      : report.lossRate >= CHALLENGE.watchLossRate
        ? "watch"
        : "stable";
}

/** Pick a badge count for an ordinary challenger, biased toward the low end. */
export function rollBadges(state: LeagueState, gymCount: number): number {
  const max = Math.max(0, gymCount - 1);
  // Most people who walk in are early in their journey.
  const roll = next(state.rng) ** CHALLENGE.badgeSkew;
  return Math.min(max, Math.floor(roll * (max + 1)));
}

export function describeChallenger(challenger: Challenger): string {
  const lead = challenger.party.find((m) => !m.fainted) ?? challenger.party[0];
  const name = lead ? (catalog.get(lead.speciesId)?.name ?? lead.speciesId) : "someone";
  return `${challenger.badges}-badge challenger leading with ${name}`;
}

export { pick };
