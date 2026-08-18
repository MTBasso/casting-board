import { catalog } from "../../data/catalog.js";
import { ROUTES } from "../../data/routes.js";
import { DOCTRINE, GYM_TRAINERS, LEADER_DEPTH, LEADER_OFFER, LEAGUE } from "../constants.js";
import {
  addGymTrainer,
  assignLeader,
  makeGym,
  makeTrainer,
} from "../factory.js";
import { autoFill, grantParty } from "./party.js";
import { int } from "../rng.js";
import { TYPES, type Doctrine, type LeagueState, type TypeId } from "../types.js";

/**
 * Gym unlocks and hiring.
 *
 * Scoped to what playtest #1 needs: three gyms, and enough hiring to staff
 * them. Morale and resignation UI stay out of this block — they test nothing
 * the playtest is asking about.
 */

/** Types the catalog can actually staff a gym with. */
function viableTypes(): TypeId[] {
  return TYPES.filter((t) => catalog.staffableByType(t).length >= 6);
}

/**
 * Mean power of a type's staffable roster — how strong that type is to run.
 * Derived, so adding species reprices every type automatically.
 */
function typeStrength(type: TypeId): number {
  const pool = catalog.staffableByType(type);
  if (pool.length === 0) return 0;
  return pool.reduce((sum, s) => sum + s.power, 0) / pool.length;
}

/**
 * Types a gym of this rank may be built around.
 *
 * Gym 1 is Rock or Water in the games, never Dragon — a region's first badge is
 * meant to be winnable. Rank opens progressively stronger types, ordered by the
 * strength of their roster rather than by a hand-kept list.
 */
export function typesForRank(rank: number): TypeId[] {
  const ranked = [...viableTypes()].sort((a, b) => typeStrength(a) - typeStrength(b));
  const share = (rank + 1) / Math.max(1, LEAGUE.maxGyms);
  const cut = Math.max(4, Math.ceil(ranked.length * share));
  return ranked.slice(0, cut);
}

/**
 * Offer the player a choice of types for their next gym.
 *
 * This is the Regional-tier identity decision — "which types is my league?" —
 * at prototype scale. Each new gym is a type the player has almost no creatures
 * for, which is exactly the scarcity that should dominate early play.
 */
export function checkGymUnlock(state: LeagueState): void {
  if (state.gymOffer !== null) return;
  if (state.gymOrder.length >= LEAGUE.maxGyms) return;

  // Peak renown, not live renown — a bad season should cost you income, never
  // take back a gym you already earned the right to build.
  const threshold = LEAGUE.gymUnlockRenown[state.gymOrder.length];
  if (threshold === undefined || state.peakRenown < threshold) return;

  const taken = new Set(
    state.gymOrder.map((id) => state.gyms[id]?.type).filter(Boolean),
  );
  const pool = typesForRank(state.gymOrder.length).filter((t) => !taken.has(t));
  if (pool.length === 0) return;

  const offer: TypeId[] = [];
  const remaining = [...pool];
  while (offer.length < LEAGUE.gymOfferSize && remaining.length > 0) {
    const [picked] = remaining.splice(int(state.rng, 0, remaining.length - 1), 1);
    if (picked) offer.push(picked);
  }
  state.gymOffer = offer;
}

/**
 * What building the next gym costs.
 *
 * Clearing the renown threshold makes a gym *available*; paying for it is a
 * separate decision. That turns unlocking into a question of timing rather than
 * something that simply happens to you.
 */
export function gymCost(state: LeagueState): number {
  // The first gym of a league is free. It is the player's opening decision, and
  // charging for it would mean starting the game unable to play it.
  if (state.gymOrder.length === 0) return 0;
  return Math.round(
    LEAGUE.gymCostBase * LEAGUE.gymCostGrowth ** (state.gymOrder.length - 1),
  );
}

export function acceptGymOffer(
  state: LeagueState,
  type: TypeId,
): { ok: true } | { ok: false; reason: string } {
  if (state.gymOffer === null) return { ok: false, reason: "No gym on offer" };
  if (!state.gymOffer.includes(type)) {
    return { ok: false, reason: "That type was not offered" };
  }
  const cost = gymCost(state);
  if (state.money < cost) {
    return { ok: false, reason: `Construction costs ${cost}` };
  }

  state.money -= cost;
  const gym = makeGym(state, type);
  state.gymOffer = null;
  state.gymOfferMinimized = false;
  offerLeaders(state, gym.id);
  return { ok: true };
}

/**
 * Put three Leaders forward for a newly built gym.
 *
 * Choosing one is free — the building was the expense. What the player is
 * actually picking is an **archetype** and a partner: each candidate arrives
 * with their own creature, already trained and fully bonded, so the choice has
 * a face on it rather than being three identical stat blocks.
 */
export function offerLeaders(state: LeagueState, gymId: string): void {
  const gym = state.gyms[gymId];
  if (!gym) return;

  const level = leaderLevel(state);

  // Distinct doctrines, so the three are a real choice rather than a reroll.
  const doctrines: Doctrine[] = ["stall", "sweep", "mentor", "drillmaster"];
  const chosen: Doctrine[] = [];
  const pool = [...doctrines];
  while (chosen.length < LEADER_OFFER.candidates && pool.length > 0) {
    const [taken] = pool.splice(int(state.rng, 0, pool.length - 1), 1);
    if (taken) chosen.push(taken);
  }

  const trainerIds: string[] = [];
  for (const doctrine of chosen) {
    const trainer = makeTrainer(state, gym.type, "candidate", { bond: 1, level });
    trainer.doctrine = doctrine;
    trainerIds.push(trainer.id);
  }

  state.leaderOffer = { gymId, trainerIds };
}

/** Take one of the offered Leaders. The others go home. */
/**
 * The calibre of creature a Leader arrives with.
 *
 * Shared by the offer and the direct hire, which used to disagree: the offer
 * passed a proper level while `hireTrainer` passed none at all. That was
 * harmless while creature levels were clamped *up* to the evolution floor, and
 * became a real defect the moment species were filtered *down* to what fits the
 * level — a hired Leader started turning up with a level 1 signature.
 */
/**
 * How many creatures the Leader of a gym at this rank may field.
 *
 * Read live rather than stored, so a gym that rises in rank deepens on its own
 * and every existing save picks up the curve without a migration.
 */
export function leaderPartyCap(state: LeagueState, gymId: string): number {
  const rank = state.gymOrder.indexOf(gymId);
  const last = Math.max(1, LEAGUE.maxGyms - 1);
  const t = Math.min(1, Math.max(0, rank) / last);
  return Math.round(
    LEADER_DEPTH.atFirstGym + (LEADER_DEPTH.atLastGym - LEADER_DEPTH.atFirstGym) * t,
  );
}

export function leaderLevel(state: LeagueState): number {
  return (
    LEADER_OFFER.signatureLevelBase +
    Math.round((state.peakRenown / 1000) * LEADER_OFFER.signatureLevelPerThousandRenown)
  );
}

export function chooseLeader(
  state: LeagueState,
  trainerId: string,
): { ok: true } | { ok: false; reason: string } {
  const offer = state.leaderOffer;
  if (!offer) return { ok: false, reason: "No Leaders on offer" };
  if (!offer.trainerIds.includes(trainerId)) {
    return { ok: false, reason: "That trainer was not offered" };
  }

  for (const id of offer.trainerIds) {
    if (id === trainerId) continue;
    dismissCandidate(state, id);
  }

  const trainer = state.trainers[trainerId];
  if (trainer) trainer.kind = "leader";
  assignLeader(state, trainerId, offer.gymId);
  autoFill(state, trainerId);
  state.leaderOffer = null;

  // The very first gym opens with one junior already in place, so the player
  // sees challengers being turned away before the Leader has to fight — and
  // understands what hiring depth buys before anyone explains it.
  if (state.gymOrder.length === 1) {
    const gym = state.gyms[offer.gymId];
    if (gym && gym.trainerIds.length === 0) {
      const junior = makeTrainer(state, gym.type, "gym", {
        bond: 0.4,
        level: 4,
        partyCap: GYM_TRAINERS.partyMin,
        owned: false,
      });
      addGymTrainer(state, junior.id, gym.id);
      grantParty(state, junior, catalog.staffableByType(gym.type), GYM_TRAINERS.partyMin, {
        level: 4,
        bond: 0.3,
        owned: false,
      });
    }
  }
  return { ok: true };
}

/** Send an unchosen candidate away, taking their creature with them. */
function dismissCandidate(state: LeagueState, trainerId: string): void {
  const trainer = state.trainers[trainerId];
  if (!trainer) return;
  for (const id of trainer.party) delete state.creatures[id];
  delete state.trainers[trainerId];
}

/**
 * What the player needs to know to choose a gym type, rather than guessing.
 *
 * A blind pick between three type names is a coin flip, not an identity
 * decision — so surface how many creatures they already own, which known routes
 * feed the type, and how much of the current challenger meta it will face.
 */
export interface TypeBriefing {
  type: TypeId;
  /** Creatures already owned that could serve this gym. */
  owned: number;
  /** Names of known routes that supply this type. */
  routes: string[];
  /** Share of recent challengers of this type, 0..1. */
  metaShare: number;
}

export function briefType(state: LeagueState, type: TypeId): TypeBriefing {
  const owned = Object.values(state.creatures).filter(
    (c) => c.role !== "retired" && c.types.includes(type),
  ).length;

  const routes = ROUTES.filter(
    (r) => state.routeIntel[r.id] === true && r.supply[type] > 0,
  ).map((r) => r.name);

  return {
    type,
    owned,
    routes,
    metaShare: state.meta.weights[type] ?? 0,
  };
}

export function hireCost(state: LeagueState): number {
  // Each hire costs more than the last — attention is meant to get expensive.
  return Math.round(
    LEAGUE.hireCostBase * LEAGUE.hireCostGrowth ** Object.keys(state.trainers).length,
  );
}

/**
 * Hire a trainer of a given type. They arrive with their signature creature,
 * which is how that mechanic reaches the player in the first place — and if the
 * matching gym has no leader, they take it.
 */
export function hireTrainer(
  state: LeagueState,
  type: TypeId,
): { ok: true; trainerId: string } | { ok: false; reason: string } {
  const cost = hireCost(state);
  if (state.money < cost) {
    return { ok: false, reason: `Not enough receipts — ${cost} needed` };
  }
  if (catalog.byType(type).length === 0) {
    return { ok: false, reason: `No ${type} trainers available` };
  }

  state.money -= cost;
  const trainer = makeTrainer(state, type, "leader", { level: leaderLevel(state) });

  const vacancy = state.gymOrder
    .map((id) => state.gyms[id])
    .find((g) => g !== undefined && g.type === type && g.leaderId === null);
  if (vacancy) assignLeader(state, trainer.id, vacancy.id);

  return { ok: true, trainerId: trainer.id };
}

/** Types the player could usefully hire for right now. */
/**
 * Retraining a Leader's archetype.
 *
 * Deliberately a mid-game tool. Early on, a Leader's doctrine is a constraint
 * the player works around — that is what makes the hiring choice matter. Once
 * the league is established, being able to answer a shifting meta by changing
 * stance is the lever that keeps a session interesting rather than routine.
 */
export function doctrineUnlocked(state: LeagueState): boolean {
  return state.tier !== "regional" || state.gymOrder.length >= DOCTRINE.unlockAtGyms;
}

export function doctrineCost(state: LeagueState): number {
  return Math.round(
    DOCTRINE.costBase * DOCTRINE.costGrowth ** (state.doctrineChanges ?? 0),
  );
}

export function canRetrain(
  state: LeagueState,
  trainerId: string,
): { ok: true; cost: number } | { ok: false; reason: string } {
  if (!doctrineUnlocked(state)) {
    return {
      ok: false,
      reason: `Unlocks at ${DOCTRINE.unlockAtGyms} gyms`,
    };
  }
  const trainer = state.trainers[trainerId];
  if (!trainer) return { ok: false, reason: "Not found" };
  if (trainer.kind === "gym" || trainer.kind === "candidate") {
    return { ok: false, reason: "Only Leaders and the Elite retrain" };
  }
  const cost = doctrineCost(state);
  if (state.money < cost) return { ok: false, reason: `Costs ${cost}` };
  return { ok: true, cost };
}

export function retrain(
  state: LeagueState,
  trainerId: string,
  doctrine: Doctrine,
): { ok: true } | { ok: false; reason: string } {
  const check = canRetrain(state, trainerId);
  if (!check.ok) return check;

  const trainer = state.trainers[trainerId];
  if (!trainer) return { ok: false, reason: "Not found" };
  if (trainer.doctrine === doctrine) return { ok: false, reason: "Already that stance" };

  state.money -= check.cost;
  trainer.doctrine = doctrine;
  // Changing how someone works costs them a little standing with their team.
  trainer.morale = Math.max(0.3, trainer.morale - DOCTRINE.moraleCost);
  state.doctrineChanges = (state.doctrineChanges ?? 0) + 1;
  return { ok: true };
}

/** What a junior Gym Trainer costs — far less than a Leader. */
export function gymTrainerCost(state: LeagueState, gymId: string): number {
  const gym = state.gyms[gymId];
  const hired = gym?.trainerIds.length ?? 0;
  return Math.round(
    GYM_TRAINERS.hireCostBase * GYM_TRAINERS.hireCostGrowth ** hired,
  );
}

export function canHireGymTrainer(
  state: LeagueState,
  gymId: string,
): { ok: true; cost: number } | { ok: false; reason: string } {
  const gym = state.gyms[gymId];
  if (!gym) return { ok: false, reason: "Gym not found" };
  const cap = Math.min(gym.trainerSlots, gymTrainerCap(state));
  if (gym.trainerIds.length >= cap) {
    return { ok: false, reason: "No room — expand the gym first" };
  }
  const cost = gymTrainerCost(state, gymId);
  if (state.money < cost) return { ok: false, reason: `Costs ${cost}` };
  return { ok: true, cost };
}

/**
 * Hire a junior Gym Trainer.
 *
 * They stand between challengers and the Leader, exactly as they do in the
 * games — and every one they turn away is a battle the Leader's party never
 * had to fight.
 */
/**
 * Hire a junior Gym Trainer.
 *
 * They are the gym's type, like everyone else who works there. Juniors used to
 * be hireable off-type, as the lever a Fire gym drowning in Water challengers
 * could pull — but that lever existed because Gen 1 alone left eleven of
 * seventeen gym types with no answer to their worst matchup. With three
 * generations in the dex the roster answers for itself, and a gym that *is* its
 * type is the better game.
 */
export function hireGymTrainer(
  state: LeagueState,
  gymId: string,
): { ok: true; trainerId: string } | { ok: false; reason: string } {
  const check = canHireGymTrainer(state, gymId);
  if (!check.ok) return check;

  const gym = state.gyms[gymId];
  if (!gym) return { ok: false, reason: "Gym not found" };

  const affinity = gym.type;
  if (catalog.staffableByType(affinity).length === 0) {
    return { ok: false, reason: `No ${affinity} trainers available` };
  }

  state.money -= check.cost;

  // Juniors run small parties and bring their own creatures — one who turned up
  // empty-handed and waited for the box would be a slot, not a person.
  const cap = int(state.rng, GYM_TRAINERS.partyMin, GYM_TRAINERS.partyMax);
  const level =
    GYM_TRAINERS.levelBase +
    Math.round((state.peakRenown / 1000) * GYM_TRAINERS.levelPerThousandRenown);

  const trainer = makeTrainer(state, affinity, "gym", {
    bond: 0.5,
    level,
    partyCap: cap,
    owned: false,
  });
  addGymTrainer(state, trainer.id, gymId);
  grantParty(state, trainer, catalog.staffableByType(affinity), cap, {
    level,
    bond: 0.4,
    jitter: 2,
    owned: false,
  });

  return { ok: true, trainerId: trainer.id };
}

/** How many juniors a gym may employ at the league's current tier. */
export function gymTrainerCap(state: LeagueState): number {
  return state.tier === "world"
    ? GYM_TRAINERS.maxSlotsEndgame
    : GYM_TRAINERS.maxSlots;
}

export function hirableTypes(state: LeagueState): TypeId[] {
  const types = new Set<TypeId>();
  for (const id of state.gymOrder) {
    const gym = state.gyms[id];
    if (gym) types.add(gym.type);
  }
  return [...types];
}
