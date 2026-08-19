import { catalog, grantableAtLevel, minLevelFor, type Species } from "../data/catalog.js";
import { CHAMPION_LOOKS, TRAINER_LOOKS } from "../data/trainerLooks.js";
import { trainerName } from "../data/names.js";
import { emptyTally } from "../data/typechart.js";
import { CAREER, GYM_TRAINERS, LEVELS, PARTY, STAFF, WAVE } from "./constants.js";
import { int, pick, range } from "./rng.js";
import { careerLength } from "./systems/facilities.js";
import { powerFor } from "./systems/growth.js";
import { mentorLevels } from "./systems/promotion.js";
import { nameOnBond } from "./systems/wave.js";
import type {
  Creature,
  CreatureRole,
  Doctrine,
  Gym,
  LeagueState,
  ThreatReport,
  Trainer,
  TrainerKind,
  RngState,
  TypeId,
} from "./types.js";

/** Deterministic id generation — counters live in state, so saves resume cleanly. */
export function nextId(state: LeagueState, prefix: string): string {
  const n = (state.nextIds[prefix] ?? 0) + 1;
  state.nextIds[prefix] = n;
  return `${prefix}_${n}`;
}

const DOCTRINES: readonly Doctrine[] = ["stall", "sweep", "mentor", "drillmaster"];

export function makeCreature(
  state: LeagueState,
  species: Species,
  role: CreatureRole,
  opts: {
    bond?: number;
    generation?: number;
    parents?: readonly [string, string];
    level?: number;
    owned?: boolean;
  } = {},
): Creature {
  const rng = state.rng;
  const roll = range(rng, 0.9, 1.15);
  // Mentors of a matching type train new arrivals up before they ever fight.
  // A species can never exist below the level its pre-evolution evolves at —
  // there is no such thing as a level 12 Gengar. Enforced here so every path
  // that creates a creature respects it, not just the ones we remembered.
  const level = Math.min(
    LEVELS.max,
    Math.max(
      minLevelFor(species),
      (opts.level ?? 1) + mentorLevels(state, species.types),
    ),
  );

  const creature: Creature = {
    id: nextId(state, "c"),
    speciesId: species.slug,
    // Wild catches are species, not individuals. A name arrives with a trainer.
    nickname: null,
    types: species.types,
    power: powerFor(species.slug, level, roll),
    powerRoll: roll,
    level,
    xp: 0,
    role,
    owned: opts.owned ?? true,
    pinned: false,
    benched: false,
    trainerId: null,
    gymId: null,
    bond: opts.bond ?? 0,
    fatigue: 0,
    careerTotal: Math.round(
      (CAREER.base + range(rng, -CAREER.variance, CAREER.variance)) * careerLength(state),
    ),
    careerSpent: 0,
    wins: 0,
    losses: 0,
    parents: opts.parents ?? null,
    generation: opts.generation ?? 0,
  };
  state.creatures[creature.id] = creature;
  return creature;
}

/**
 * Every defender in the league is a trainer with a party.
 *
 * They arrive welded to a signature creature — permanently theirs, first into
 * the party, and gone when they go. That is what makes every hire an emotional
 * unit from the first second rather than a line on a payroll.
 */
/**
 * A face for a new hire.
 *
 * Type first, then rank. A Fire specialist never wears a Bug Catcher's hat, and
 * nobody takes a league post looking like a schoolkid — Leaders, Elite seats and
 * Champions draw from the senior pool, which is the canon Leaders of that type
 * plus veterans where the canon roster is thin.
 */
export function pickLook(rng: RngState, affinity: TypeId, kind: TrainerKind): string {
  if (kind === "champion") return pick(rng, CHAMPION_LOOKS as string[]);

  const pools = TRAINER_LOOKS[affinity];
  if (!pools) return "acetrainer";

  const league = kind === "leader" || kind === "elite" || kind === "candidate";
  const pool = league ? pools.senior : pools.junior;
  return pick(rng, (pool.length > 0 ? pool : pools.junior) as string[]);
}

export function makeTrainer(
  state: LeagueState,
  affinity: TypeId,
  kind: TrainerKind = "leader",
  opts: { bond?: number; level?: number; partyCap?: number; owned?: boolean } = {},
): Trainer {
  const rng = state.rng;
  const pool = catalog.staffableByType(affinity);
  if (pool.length === 0) {
    throw new Error(`No species available for affinity "${affinity}"`);
  }
  // A trainer's signature creature has to be one they could plausibly have at
  // the level they are hired at — otherwise the evolution floor quietly hands a
  // rookie a fully evolved monster.
  const options = grantableAtLevel(pool, opts.level ?? 1);

  const signature = makeCreature(state, pick(rng, options), "party", {
    bond: opts.bond ?? 1,
    level: opts.level ?? 1,
    owned: opts.owned ?? true,
  });
  // Bonded from the first second, so it arrives with a name.
  nameOnBond(state, signature);

  const trainer: Trainer = {
    id: nextId(state, "t"),
    name: trainerName(rng),
    affinity,
    doctrine: pick(rng, DOCTRINES),
    kind,
    partyCap: opts.partyCap ?? PARTY.max,
    party: [signature.id],
    signatureId: signature.id,
    gymId: null,
    salary:
      STAFF.baseSalaryPerHour *
      range(rng, 0.9, 1.2) *
      (kind === "gym" ? GYM_TRAINERS.salaryFactor : 1),
    morale: 1,
    look: pickLook(rng, affinity, kind),
    tenure: 0,
    leadIndex: 0,
    standing: 1,
    strain: 0,
    suspensions: 0,
    suspendedUntil: null,
    demotionLockedUntil: null,
    origin: "hired",
  };

  signature.trainerId = trainer.id;
  state.trainers[trainer.id] = trainer;
  return trainer;
}

export function emptyThreatReport(): ThreatReport {
  return {
    distribution: emptyTally(),
    samples: 0,
    status: "stable",
    lossRate: 0,
    absorbed: 0,
  };
}

export function makeGym(state: LeagueState, type: TypeId): Gym {
  const gym: Gym = {
    id: nextId(state, "g"),
    type,
    name: `${type[0]?.toUpperCase()}${type.slice(1)} Gym`,
    leaderId: null,
    trainerIds: [],
    trainerSlots: GYM_TRAINERS.startingSlots,
    waveCooldown: range(state.rng, 0, WAVE.intervalSeconds),
    threat: emptyThreatReport(),
  };
  state.gyms[gym.id] = gym;
  state.gymOrder.push(gym.id);
  return gym;
}

/** Put a trainer in charge of a gym. Their whole party moves with them. */
export function assignLeader(state: LeagueState, trainerId: string, gymId: string): void {
  const trainer = state.trainers[trainerId];
  const gym = state.gyms[gymId];
  if (!trainer || !gym) return;
  if (trainer.affinity !== gym.type) {
    throw new Error(
      `${trainer.name} is a ${trainer.affinity} trainer and cannot lead ${gym.name}`,
    );
  }

  trainer.gymId = gymId;
  trainer.kind = "leader";
  gym.leaderId = trainerId;
  for (const id of trainer.party) {
    const c = state.creatures[id];
    if (c) c.gymId = gymId;
  }
}

/** Add a junior trainer to a gym, fought before the Leader. */
export function addGymTrainer(state: LeagueState, trainerId: string, gymId: string): void {
  const trainer = state.trainers[trainerId];
  const gym = state.gyms[gymId];
  if (!trainer || !gym) return;

  trainer.gymId = gymId;
  trainer.kind = "gym";
  if (!gym.trainerIds.includes(trainerId)) gym.trainerIds.push(trainerId);
  for (const id of trainer.party) {
    const c = state.creatures[id];
    if (c) c.gymId = gymId;
  }
}

/**
 * Create a wild creature directly.
 *
 * NOT the player-facing acquisition path — that is `systems/scouting.ts`, where
 * catches cost money and come from a route's supply distribution. This exists
 * for seeding tests and fixtures.
 */
export function scoutCatch(state: LeagueState, type?: TypeId): Creature {
  const pool = type ? catalog.wildByType(type) : catalog.all();
  const species = pick(state.rng, pool.length > 0 ? pool : catalog.all());
  return makeCreature(state, species, "reserve");
}

export function randomTier1Types(state: LeagueState, count: number): TypeId[] {
  const viable = (
    [
      "fire", "water", "grass", "electric", "psychic",
      "ground", "fighting", "ghost", "dragon", "normal",
      "flying", "poison", "rock", "steel", "dark", "ice", "bug", "fairy",
    ] as TypeId[]
  ).filter((t) => catalog.wildByType(t).length >= 3);

  const chosen: TypeId[] = [];
  const pool = [...viable];
  while (chosen.length < count && pool.length > 0) {
    const i = int(state.rng, 0, pool.length - 1);
    const [taken] = pool.splice(i, 1);
    if (taken) chosen.push(taken);
  }
  return chosen;
}
