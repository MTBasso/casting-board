import { describe, expect, it } from "vitest";
import {
  acceptGymOffer,
  briefType,
  checkGymUnlock,
  cloneState,
  createInitialState,
  displayName,
  hasIntel,
  doctrineUnlocked,
  nextRival,
  offerWeight,
  routeById,
  revivesFor,
  routePower,
  assignToSeat,
  canDropOff,
  canUpgrade,
  collect,
  collectionFee,
  bench,
  bondSpeed,
  canRetrain,
  retrain,
  constants,
  autoFill,
  canHireGymTrainer,
  canJoin,
  chooseLeader,
  expandGymTrainers,
  gymCost,
  gymTrainerCap,
  hireGymTrainer,
  join,
  leaveParty,
  makeChallenger,
  makeCreature,
  makeTrainer,
  partyCapOf,
  partySizeFor,
  partyOf,
  seatParty,
  dropOff,
  eliteUnlocked,
  emptyReport,
  drawFrom,
  buyIntel,
  canHire,
  canCrew,
  crewOf,
  stretchOf,
  fatigueRate,
  canPost,
  rangers,
  ceilingFor,
  eligibleRoutes,
  hire,
  fieldOffer,
  post,
  postingFor,
  recall,
  removeFromCrew,
  reserveCeiling,
  reserveCount,
  usableReserve,
  slotsAvailable,
  skillOf,
  suppliesType,
  dismiss,
  setAutoWork,
  runChallenge,
  forceRecruit,
  isProtected,
  remember,
  beatGrudge,
  demote,
  demotionTargets,
  isSuspended,
  tickMorale,
  isChampion,
  facilityLevel,
  gainXp,
  inductable,
  mentorBonus,
  mentorLevels,
  mentorsFor,
  migrateState,
  promote,
  parentQuality,
  pedigree,
  readiness,
  runGauntlet,
  staffSeat,
  tierMultiplier,
  upgrade,
  unbench,
  upgradeCost,
  waveInterval,
  powerFor,
  refreshPower,
  scoutCatch,
  statsFor,
  tick,
  trade,
  tradeTarget,
  tradeableStock,
  typesForRank,
  TYPES,
} from "./index.js";
import { resolveOffline } from "./offline.js";
import { effectivenessAgainst, emptyTally, threatAgainst } from "../data/typechart.js";
import { damage } from "./systems/stats.js";
import {
  catalog,
  encounterWeight,
  familyOf,
  minLevelFor,
} from "../data/catalog.js";
import type { Creature, LeagueState, Route } from "./types.js";

function run(state: LeagueState, seconds: number): void {
  for (let i = 0; i < seconds; i++) tick(state, 1);
}

/**
 * A league that has made its founding choices: first gym type picked, first
 * Leader chosen. `createInitialState` deliberately stops short of this, because
 * founding is the player's opening decision rather than something handed to them.
 */
function newLeague(seed: number): LeagueState {
  const state = createInitialState(seed);
  const type = state.gymOffer?.[0];
  if (type) acceptGymOffer(state, type);
  const leader = state.leaderOffer?.trainerIds[0];
  if (leader) chooseLeader(state, leader);
  return state;
}

/**
 * Build and staff every gym the readiness check demands.
 *
 * Gyms now open with three Leader candidates rather than an empty seat, so a
 * fixture that just calls acceptGymOffer leaves the league unstaffed.
 */
function buildOutLeague(state: LeagueState): void {
  for (let i = 0; i < 12; i++) {
    checkGymUnlock(state);
    const type = state.gymOffer?.[0];
    if (type) acceptGymOffer(state, type);
    const offered = state.leaderOffer?.trainerIds[0];
    if (offered) chooseLeader(state, offered);
  }
  for (const gymId of state.gymOrder) {
    const gym = state.gyms[gymId];
    if (!gym?.leaderId) continue;
    for (const id of state.trainers[gym.leaderId]?.party ?? []) {
      const c = state.creatures[id];
      if (c) c.bond = 1;
    }
  }
}

describe("determinism", () => {
  it("produces identical leagues from identical seeds", () => {
    const a = newLeague(42);
    const b = newLeague(42);
    run(a, 3600);
    run(b, 3600);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("diverges on different seeds", () => {
    const a = newLeague(1);
    const b = newLeague(2);
    run(a, 600);
    run(b, 600);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("survives a JSON round trip mid-run", () => {
    const original = newLeague(7);
    run(original, 300);

    const restored = cloneState(original);
    run(original, 300);
    run(restored, 300);

    expect(JSON.stringify(restored)).toBe(JSON.stringify(original));
  });
});

describe("offline resolution", () => {
  it("never earns more than playing the same span", () => {
    const played = newLeague(11);
    run(played, 3600);

    const idled = newLeague(11);
    resolveOffline(idled, 3600);

    // Offline runs deliberately pessimistic — closing the app must never be
    // the optimal strategy.
    expect(idled.money).toBeLessThanOrEqual(played.money * 1.05);
  });

  it("caps accrual at the offline window", () => {
    const a = newLeague(3);
    const b = newLeague(3);
    resolveOffline(a, 12 * 3600);
    resolveOffline(b, 48 * 3600);
    expect(b.time).toBe(a.time);
  });

  it("advances the clock by the elapsed span", () => {
    const state = newLeague(5);
    resolveOffline(state, 4 * 3600);
    expect(state.time).toBeCloseTo(4 * 3600, 0);
  });
});

describe("career and retirement", () => {
  it("retires creatures once their career is spent, without deleting them", () => {
    const state = newLeague(21);
    const before = Object.keys(state.creatures).length;

    // Careers are tuned to last weeks, so shorten one rather than simulating a
    // fortnight — this tests the mechanism, not the tuning. It has to be a
    // creature that actually fights, which means one in a defending party.
    const gym = state.gyms[state.gymOrder[0] ?? ""];
    const defenders = [...(gym?.trainerIds ?? []), gym?.leaderId ?? ""];
    const victim = defenders
      .flatMap((tid) => state.trainers[tid]?.party ?? [])
      .map((id) => state.creatures[id])
      .find((c) => c !== undefined);
    expect(victim).toBeDefined();
    if (victim) victim.careerTotal = 2;

    run(state, 6 * 3600);

    const retired = Object.values(state.creatures).filter((c) => c.role === "retired");
    expect(retired.length).toBeGreaterThan(0);
    // Retirement is never deletion — retirees become breeding stock.
    expect(Object.keys(state.creatures).length).toBeGreaterThanOrEqual(before);
    for (const c of retired) expect(c.gymId).toBeNull();
  });
});

describe("the duty roster", () => {
  it("gives creatures in one gym distinct records", () => {
    const state = newLeague(33);
    const gymId = state.gymOrder[0];
    expect(gymId).toBeDefined();

    // Challenges are rare and weighty now, so give the gym time to see several.
    run(state, 12 * 3600);

    const gym = state.gyms[gymId ?? ""];
    const everyone = [
      ...(gym?.leaderId ? state.trainers[gym.leaderId]?.party ?? [] : []),
      ...(gym?.trainerIds ?? []).flatMap((t) => state.trainers[t]?.party ?? []),
    ];
    const fought = everyone
      .map((id) => state.creatures[id])
      .filter((c) => c !== undefined && c.wins + c.losses > 0);

    expect(fought.length).toBeGreaterThan(1);

    // The whole reason one creature answers each wave: identical records across
    // a gym would make the Card's career history meaningless.
    const records = new Set(fought.map((c) => `${c?.wins}/${c?.losses}`));
    expect(records.size).toBeGreaterThan(1);
  });
});

describe("identity", () => {
  it("leaves wild catches unnamed until a trainer bonds with them", () => {
    const state = newLeague(44);
    const caught = scoutCatch(state, "fire");
    expect(caught.nickname).toBeNull();
    expect(displayName(caught)).not.toBe("");

    const gymId = state.gymOrder[0];
    expect(gymId).toBeDefined();
    const leaderId = state.gyms[gymId ?? ""]?.leaderId ?? "";
    const trainer = state.trainers[leaderId];
    // Clear a slot: parties auto-fill, and one creature per evolution line.
    for (const id of [...(trainer?.party ?? [])]) {
      if (id !== trainer?.signatureId) leaveParty(state, id);
    }
    const fresh = scoutCatch(state, trainer?.affinity);
    expect(fresh.nickname).toBeNull();

    const result = join(state, fresh.id, leaderId);
    expect(result.ok).toBe(true);
    expect(fresh.nickname).not.toBeNull();
  });

  it("names signature creatures immediately — they are bonded from the start", () => {
    const state = newLeague(45);
    for (const trainer of Object.values(state.trainers)) {
      const sig = state.creatures[trainer.signatureId];
      expect(sig?.nickname).not.toBeNull();
    }
  });
});

describe("rangers", () => {
  /**
   * A league with a Ranger hired.
   *
   * Rangers work alone — their job is to find creatures, not to train them — so
   * there is no partner to arrange, and any open ground will take them.
   */
  function withRanger(seed: number): {
    state: LeagueState;
    trainerId: string;
    /** Ground that actually holds their type — they catch nothing elsewhere. */
    route: Route;
  } {
    const state = newLeague(seed);
    state.money = 200_000;
    const type = fieldOffer(state, "ranger")[0];
    if (!type) throw new Error("no offer");
    const hired = hire(state, "ranger", type);
    if (!hired.ok) throw new Error(hired.reason);

    const trainer = state.trainers[hired.trainerId];
    if (!trainer) throw new Error("no trainer");

    // A Ranger brings back their own type and nothing else, so the fixture has
    // to send them somewhere it lives. Where the drawn type has no ground open,
    // re-specialise them rather than making the test depend on the draw.
    let route = eligibleRoutes(state).find((r) => suppliesType(r, trainer.affinity));
    if (!route) {
      route = eligibleRoutes(state)[0];
      if (!route) throw new Error("no routes");
      const supplied = TYPES.find((t) => suppliesType(route!, t));
      if (!supplied) throw new Error("route supplies nothing");
      trainer.affinity = supplied;
    }
    return { state, trainerId: hired.trainerId, route };
  }

  it("opens a league with a bench, so there is somebody to field", () => {
    const state = newLeague(2101);
    expect(Object.values(state.creatures).length).toBeGreaterThan(0);
  });

  it("works alone — no partner tied up on a route", () => {
    const { state, trainerId } = withRanger(2102);
    const trainer = state.trainers[trainerId];
    expect(trainer?.party).toHaveLength(0);
    expect(crewOf(state, trainerId)).toHaveLength(0);
    // And nothing of theirs is sitting in a `field` role.
    expect(Object.values(state.creatures).some((c) => c.role === "field")).toBe(false);
  });

  it("brings creatures in over time rather than on purchase", () => {
    const { state, trainerId, route } = withRanger(2103);
    expect(post(state, route.id, trainerId).ok).toBe(true);
    const before = Object.keys(state.creatures).length;
    run(state, Math.round(constants.RANGER.shiftSeconds * 0.9));
    expect(Object.keys(state.creatures).length).toBeGreaterThan(before);
  });

  it("refuses ground that does not hold their type", () => {
    const { state, trainerId } = withRanger(2104);
    const trainer = state.trainers[trainerId];
    if (!trainer) throw new Error("no trainer");

    const barren = eligibleRoutes(state).find(
      (r) => !suppliesType(r, trainer.affinity),
    );
    // A Ranger catches their own type and nothing else, so ground without it is
    // a shift spent walking.
    if (barren) expect(canPost(state, barren.id, trainerId).ok).toBe(false);
  });

  it("brings back their own type, whatever else lives there", () => {
    const { state, trainerId, route } = withRanger(2111);
    const trainer = state.trainers[trainerId];
    if (!trainer) throw new Error("no trainer");

    post(state, route.id, trainerId);
    const caught: string[] = [];
    for (let i = 0; i < Math.round(constants.RANGER.shiftSeconds * 0.9); i++) {
      caught.push(...tick(state, 1).caught);
    }
    expect(caught.length).toBeGreaterThan(0);
    for (const id of caught) {
      expect(state.creatures[id]?.types).toContain(trainer.affinity);
    }
  });

  it("gets better at it, and finds more as it does", () => {
    const { state, trainerId } = withRanger(2112);
    const trainer = state.trainers[trainerId];
    if (!trainer) throw new Error("no trainer");

    expect(skillOf(trainer)).toBe(0);
    trainer.experience = constants.RANGER.catchesToMaster;
    expect(skillOf(trainer)).toBe(1);

    // A seasoned Ranger reaches above the route's own ceiling — they are not
    // making creatures stronger, they are finding the ones a rookie walks past.
    const route = eligibleRoutes(state).find((r) => suppliesType(r, trainer.affinity));
    if (!route) return;
    let best = 0;
    for (let i = 0; i < 200; i++) {
      const c = drawFrom(state, route, trainer);
      if (c) best = Math.max(best, c.level);
    }
    expect(best).toBeGreaterThan(route.levelMax);
  });

  it("only yields types the route actually supplies", () => {
    const { state, trainerId, route } = withRanger(2105);
    post(state, route.id, trainerId);
    const caught: string[] = [];
    for (let i = 0; i < Math.round(constants.RANGER.shiftSeconds * 0.9); i++) {
      caught.push(...tick(state, 1).caught);
    }

    const supplied = TYPES.filter((t) => route.supply[t] > 0);
    let seen = 0;
    for (const id of caught) {
      const c = state.creatures[id];
      if (!c) continue;
      expect(c.types.some((t) => supplied.includes(t))).toBe(true);
      seen += 1;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("stops once the box holds all the trainers could field", () => {
    const { state, trainerId, route } = withRanger(2106);
    post(state, route.id, trainerId);

    run(state, 200 * 60 * 60);
    // The ceiling counts creatures the league could actually put in a party.
    expect(usableReserve(state)).toBeLessThanOrEqual(reserveCeiling(state) + 4);
    expect(reserveCount(state)).toBeLessThanOrEqual(
      reserveCeiling(state) * constants.RANGER.hardCeilingFactor + 8,
    );
  });

  it("works a shift and then comes home", () => {
    const { state, trainerId, route } = withRanger(2107);
    post(state, route.id, trainerId);
    expect(postingFor(state, trainerId)).toBeDefined();

    run(state, constants.RANGER.shiftSeconds + 5);
    // A posting that never ended made the whole screen one decision made once.
    expect(postingFor(state, trainerId)).toBeUndefined();
  });

  it("caps hiring at the slots the facilities support", () => {
    const state = newLeague(2108);
    state.money = 10_000_000;
    let guard = 0;
    while (canHire(state, "ranger").ok && guard < 20) {
      const type = fieldOffer(state, "ranger")[0];
      if (!type) break;
      hire(state, "ranger", type);
      guard += 1;
    }
    expect(rangers(state).length).toBe(slotsAvailable(state, "ranger"));
    expect(canHire(state, "ranger").ok).toBe(false);
  });

  it("hires only from the drawn offer, and redraws on taking one", () => {
    const state = newLeague(2109);
    state.money = 200_000;
    const offer = [...fieldOffer(state, "ranger")];
    const outside = TYPES.find((t) => !offer.includes(t));
    if (!outside) throw new Error("offer covers every type");

    expect(hire(state, "ranger", outside).ok).toBe(false);
    expect(hire(state, "ranger", offer[0]!).ok).toBe(true);
    expect(fieldOffer(state, "ranger")).not.toEqual(offer);
  });

  it("sells intel about ground you have not worked yet", () => {
    const state = newLeague(2110);
    state.money = 200_000;
    const route = eligibleRoutes(state)[0];
    if (!route) throw new Error("no routes");

    expect(hasIntel(state, route.id)).toBe(false);
    expect(buyIntel(state, route.id).ok).toBe(true);
    expect(hasIntel(state, route.id)).toBe(true);
  });

  it("can be let go, and their skill goes with them", () => {
    const { state, trainerId, route } = withRanger(2113);
    const trainer = state.trainers[trainerId];
    if (!trainer) throw new Error("no trainer");
    trainer.experience = 100;
    post(state, route.id, trainerId);

    expect(dismiss(state, trainerId).ok).toBe(true);
    expect(state.trainers[trainerId]).toBeUndefined();
    expect(postingFor(state, trainerId)).toBeUndefined();
  });

  it("puts itself back to work when told to", () => {
    const { state, trainerId, route } = withRanger(2114);
    post(state, route.id, trainerId);
    setAutoWork(state, trainerId, true);

    // Ride out the shift; they should take themselves straight back out.
    run(state, constants.RANGER.shiftSeconds + 30);
    expect(postingFor(state, trainerId)).toBeDefined();
  });

  it("stays idle when not told to, so the choice is still the player's", () => {
    const { state, trainerId, route } = withRanger(2115);
    post(state, route.id, trainerId);
    run(state, constants.RANGER.shiftSeconds + 30);
    expect(postingFor(state, trainerId)).toBeUndefined();
  });

  it("makes stronger routes rarer, derived from what lives there", () => {
    const spine = routeById("dragons_spine");
    const verdant = routeById("verdant_path");
    if (!spine || !verdant) throw new Error("routes missing");

    expect(routePower(spine)).toBeGreaterThan(routePower(verdant));
    expect(offerWeight(spine)).toBeLessThan(offerWeight(verdant));
  });
});

describe("handlers", () => {
  function withHandler(seed: number): {
    state: LeagueState;
    trainerId: string;
    crew: Creature[];
  } {
    const state = newLeague(seed);
    state.money = 500_000;
    const type = fieldOffer(state, "handler")[0];
    if (!type) throw new Error("no offer");
    const hired = hire(state, "handler", type);
    if (!hired.ok) throw new Error(hired.reason);
    return { state, trainerId: hired.trainerId, crew: crewOf(state, hired.trainerId) };
  }

  it("levels its crew and pays for the privilege", () => {
    const { state, trainerId, crew } = withHandler(2201);
    const route = eligibleRoutes(state)[0];
    if (!route || crew.length === 0) throw new Error("no route or crew");

    const member = crew[0]!;
    member.level = route.levelMin;
    expect(post(state, route.id, trainerId).ok).toBe(true);

    const money = state.money;
    const level = member.level;
    run(state, 4 * 60 * 60);

    expect(state.creatures[member.id]?.level).toBeGreaterThan(level);
    expect(state.money).toBeGreaterThan(money);
  });

  it("stops levelling at the top of the route's band", () => {
    const { state, trainerId, crew } = withHandler(2202);
    const route = eligibleRoutes(state)[0];
    if (!route || crew.length === 0) throw new Error("no route or crew");
    crew[0]!.level = route.levelMin;

    post(state, route.id, trainerId);
    run(state, 60 * 60 * 60);
    expect(state.creatures[crew[0]!.id]?.level).toBeLessThanOrEqual(route.levelMax);
  });

  it("may be pushed onto ground over their heads, but only so far", () => {
    const { state, trainerId, crew } = withHandler(2203);
    state.peakRenown = 100_000;
    const hard = [...eligibleRoutes(state)].sort((a, b) => b.levelMin - a.levelMin)[0];
    if (!hard || crew.length === 0) throw new Error("no route or crew");

    // A few levels under the floor: allowed, and that is the whole mechanic.
    crew[0]!.level = Math.max(1, hard.levelMin - 2);
    expect(canPost(state, hard.id, trainerId).ok).toBe(true);

    // Far under: refused. The stretch is a risk, not a cheat.
    crew[0]!.level = 1;
    if (hard.levelMin - 1 > constants.HANDLER.maxStretch) {
      expect(canPost(state, hard.id, trainerId).ok).toBe(false);
    }
  });

  it("pays and teaches more the further it is stretched", () => {
    const { state, trainerId, crew } = withHandler(2204);
    state.peakRenown = 100_000;
    const route = [...eligibleRoutes(state)].sort((a, b) => b.levelMin - a.levelMin)[0];
    if (!route || crew.length === 0) throw new Error("no route or crew");

    crew[0]!.level = route.levelMin;
    post(state, route.id, trainerId);
    const easy = state.postings.find((p) => p.trainerId === trainerId);
    if (!easy) throw new Error("no posting");
    expect(stretchOf(state, easy)).toBe(0);
    const restedRate = fatigueRate(state, easy);

    crew[0]!.level = Math.max(1, route.levelMin - 4);
    expect(stretchOf(state, easy)).toBe(4);
    // Stretching costs the crew more than standing on level ground does.
    expect(fatigueRate(state, easy)).toBeGreaterThan(restedRate);
  });

  it("keeps the crew together on recall, and frees them on request", () => {
    const { state, trainerId, crew } = withHandler(2206);
    const route = eligibleRoutes(state)[0];
    if (!route || crew.length === 0) throw new Error("no route or crew");
    crew[0]!.level = route.levelMin;

    post(state, route.id, trainerId);
    recall(state, trainerId);
    expect(postingFor(state, trainerId)).toBeUndefined();
    // A crew you assembled survives being taken off a route — you built it.
    expect(state.creatures[crew[0]!.id]?.role).toBe("field");

    removeFromCrew(state, crew[0]!.id);
    expect(state.creatures[crew[0]!.id]?.role).toBe("reserve");
  });

  it("keeps its crew type-bound, like every other trainer", () => {
    const { state, trainerId } = withHandler(2207);
    const trainer = state.trainers[trainerId];
    if (!trainer) throw new Error("no trainer");

    const wrong = Object.values(state.creatures).find(
      (c) => c.role === "reserve" && !c.types.includes(trainer.affinity),
    );
    if (wrong) expect(canCrew(state, wrong.id, trainerId).ok).toBe(false);
  });

  it("stops levelling at the ceiling the route sets", () => {
    const { state, trainerId, crew } = withHandler(2208);
    const route = eligibleRoutes(state)[0];
    if (!route || crew.length === 0) throw new Error("no route or crew");
    crew[0]!.level = route.levelMin;
    post(state, route.id, trainerId);
    run(state, 40 * 60 * 60);
    expect(state.creatures[crew[0]!.id]?.level).toBeLessThanOrEqual(ceilingFor(route.id));
  });

  it("never spends career, however hard the ground", () => {
    const { state, trainerId, crew } = withHandler(2205);
    const route = eligibleRoutes(state)[0];
    if (!route || crew.length === 0) throw new Error("no route or crew");
    crew[0]!.level = route.levelMin;
    const spent = crew[0]!.careerSpent;

    post(state, route.id, trainerId);
    run(state, 6 * 60 * 60);
    expect(state.creatures[crew[0]!.id]?.careerSpent).toBe(spent);
  });
});

describe("renown", () => {
  it("ratchets peak renown and never lowers it", () => {
    const state = newLeague(108);
    run(state, 2 * 3600);
    const peak = state.peakRenown;
    expect(peak).toBeGreaterThan(0);

    state.renown = 0;
    run(state, 60);
    expect(state.peakRenown).toBeGreaterThanOrEqual(peak);
  });
});


describe("the trade desk", () => {
  it("consumes reserve creatures at an unfavourable rate", () => {
    const state = newLeague(105);
    state.money = 5000;
    for (let i = 0; i < 5; i++) scoutCatch(state, "water");

    const offered = Object.values(state.creatures)
      .filter((c) => c.role === "reserve" && !c.types.includes("fire"))
      .slice(0, 3)
      .map((c) => c.id);
    expect(offered.length).toBe(3);

    const result = trade(state, "fire", offered);
    expect(result.ok).toBe(true);
    // The creatures given up are gone — the one place the game deletes one.
    for (const id of offered) expect(state.creatures[id]).toBeUndefined();
  });

  it("refuses when there is not enough stock", () => {
    const state = newLeague(106);
    state.money = 5000;
    expect(trade(state, "fire", []).ok).toBe(false);
  });
});

describe("save migration", () => {
  /** A Block 1 save: no routes, no expeditions, no bench capacity. */
  function legacySave(): unknown {
    const state = JSON.parse(JSON.stringify(newLeague(7))) as Record<
      string,
      unknown
    >;
    delete state.routes;
    delete state.expeditions;
    delete state.expeditionSlots;
    delete state.gymOffer;
    delete state.scoutOffer;
    delete state.scoutCharges;
    delete state.routeIntel;
    delete state.peakRenown;
    state.prestige = state.renown;
    delete state.renown;
    const gyms = state.gyms as Record<string, Record<string, unknown>>;
    for (const gym of Object.values(gyms)) delete gym.undercardSlots;
    state.version = 1;
    return state;
  }

  it("backfills fields a newer build added", () => {
    const result = migrateState(legacySave(), 1);
    expect(result).not.toBeNull();
    const state = result?.state;
    expect(Array.isArray(state?.postings)).toBe(true);
    expect(typeof state?.renown).toBe("number");
    expect(typeof state?.peakRenown).toBe("number");
    for (const id of state?.gymOrder ?? []) {
      expect(state?.gyms[id]?.trainerSlots).toBeGreaterThan(0);
    }
  });

  it("runs offline catch-up on a migrated legacy save without throwing", () => {
    // This is the exact crash a Block 1 save hit under Block 2 code:
    // resolveExpeditions read state.expeditions before it existed.
    const result = migrateState(legacySave(), 1);
    const state = result?.state;
    expect(state).toBeDefined();
    if (!state) return;
    expect(() => resolveOffline(state, 6 * 3600)).not.toThrow();
    expect(() => run(state, 120)).not.toThrow();
  });

  it("rejects junk rather than pretending it is a league", () => {
    expect(migrateState(null, 1)).toBeNull();
    expect(migrateState({ creatures: {} }, 1)).toBeNull();
  });
});

describe("wild encounter rules", () => {
  it("never offers starters or legendaries in the wild", () => {
    for (const species of catalog.all()) {
      if (species.isStarter || species.isLegendary) {
        expect(encounterWeight(species)).toBe(0);
      }
    }
    const wild = catalog.wildByType("fire");
    expect(wild.some((s) => s.isStarter)).toBe(false);
    expect(wild.some((s) => s.isLegendary)).toBe(false);
  });

  it("makes unevolved forms the staple and final forms rare", () => {
    const caterpie = catalog.get("caterpie");
    const metapod = catalog.get("metapod");
    const butterfree = catalog.get("butterfree");
    expect(caterpie && encounterWeight(caterpie)).toBeGreaterThan(
      metapod ? encounterWeight(metapod) : 0,
    );
    expect(metapod && encounterWeight(metapod)).toBeGreaterThan(
      butterfree ? encounterWeight(butterfree) : 0,
    );
  });

  it("in practice brings in mostly unevolved creatures", () => {
    const state = newLeague(301);
    state.peakRenown = 2000;
    const routes = eligibleRoutes(state);

    const found: string[] = [];
    for (let i = 0; i < 200; i++) {
      const route = routes[i % routes.length];
      if (!route) break;
      const drawn = drawFrom(state, route);
      if (drawn) found.push(drawn.id);
    }
    expect(found.length).toBeGreaterThan(50);

    const species = found
      .map((id) => catalog.get(state.creatures[id]?.speciesId ?? ""))
      .filter((sp) => sp !== undefined);
    expect(species.some((sp) => sp?.isStarter)).toBe(false);
    expect(species.some((sp) => sp?.isLegendary)).toBe(false);

    const finals = species.filter((sp) => sp?.evolvesTo.length === 0).length;
    expect(finals / species.length).toBeLessThan(0.3);
  });
});

describe("levels and evolution", () => {
  it("gains power with levels", () => {
    const low = powerFor("dratini", 1, 1);
    const high = powerFor("dratini", 40, 1);
    expect(high).toBeGreaterThan(low);
  });

  it("evolves on reaching the species threshold", () => {
    const state = newLeague(302);
    const dratini = scoutCatch(state, "dragon");
    dratini.speciesId = "dratini";
    dratini.level = 1;
    dratini.xp = 0;
    refreshPower(dratini);

    // Enough XP to blow past level 30, where Dratini becomes Dragonair.
    gainXp(state, dratini, 10000);
    expect(dratini.level).toBeGreaterThanOrEqual(30);
    expect(dratini.speciesId).not.toBe("dratini");
  });

  it("carries the new form's types through evolution", () => {
    const state = newLeague(303);
    const c = scoutCatch(state, "dragon");
    c.speciesId = "dragonair";
    c.level = 54;
    c.xp = 0;
    refreshPower(c);
    gainXp(state, c, 10000);
    expect(c.speciesId).toBe("dragonite");
    expect(c.types).toContain("flying");
  });

  it("never evolves a final form", () => {
    const state = newLeague(304);
    const c = scoutCatch(state, "normal");
    c.speciesId = "snorlax";
    c.level = 1;
    refreshPower(c);
    gainXp(state, c, 100000);
    expect(c.speciesId).toBe("snorlax");
  });
});

describe("the trade desk", () => {
  it("prices the result off what is offered", () => {
    const state = newLeague(305);
    state.money = 50000;

    const weak = [scoutCatch(state, "bug"), scoutCatch(state, "bug")];
    for (const c of weak) {
      c.power = 30;
      c.level = 5;
    }
    const strong = [scoutCatch(state, "bug"), scoutCatch(state, "bug")];
    for (const c of strong) {
      c.power = 95;
      c.level = 40;
    }

    expect(tradeTarget(strong)).toBeGreaterThan(tradeTarget(weak));
  });

  it("gives volume a sublinear bonus, so dumping is not a strategy", () => {
    const state = newLeague(306);
    const make = (n: number) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const c = scoutCatch(state, "bug");
        c.power = 40;
        out.push(c);
      }
      return out;
    };
    const two = tradeTarget(make(2));
    const four = tradeTarget(make(4));
    const sixteen = tradeTarget(make(16));

    expect(four).toBeGreaterThan(two);
    // Eight times the creatures must not be anywhere near eight times the value.
    expect(sixteen).toBeLessThan(two * 2);
  });

  it("consumes exactly what was offered and returns one creature", () => {
    const state = newLeague(307);
    state.money = 50000;
    const offered = [scoutCatch(state, "water"), scoutCatch(state, "water")].map(
      (c) => c.id,
    );

    const result = trade(state, "fire", offered);
    expect(result.ok).toBe(true);
    for (const id of offered) expect(state.creatures[id]).toBeUndefined();
    if (result.ok) {
      expect(state.creatures[result.creatureId]?.types).toContain("fire");
    }
  });

  it("never hands over a starter or legendary", () => {
    const state = newLeague(308);
    state.money = 500000;
    for (let i = 0; i < 40; i++) {
      const offered = [scoutCatch(state, "water"), scoutCatch(state, "water")];
      for (const c of offered) c.power = 110;
      const result = trade(state, "fire", offered.map((c) => c.id));
      if (result.ok) {
        const sp = catalog.get(state.creatures[result.creatureId]?.speciesId ?? "");
        expect(sp?.isStarter).toBe(false);
        expect(sp?.isLegendary).toBe(false);
      }
    }
  });
});

describe("the gym economy", () => {
  it("gates on peak renown, so a bad season cannot take a gym back", () => {
    const state = newLeague(109);
    state.peakRenown = 5000;
    state.renown = 0;
    state.gymOffer = null;
    checkGymUnlock(state);
    expect(state.gymOffer).not.toBeNull();
  });

  it("charges for construction, so unlocking is a timing decision", () => {
    const state = newLeague(110);
    state.peakRenown = 5000;
    state.gymOffer = null;
    checkGymUnlock(state);

    const type = state.gymOffer?.[0];
    expect(type).toBeDefined();
    if (!type) return;

    state.money = 0;
    expect(acceptGymOffer(state, type).ok).toBe(false);

    state.money = 1_000_000;
    const before = state.gymOrder.length;
    expect(acceptGymOffer(state, type).ok).toBe(true);
    expect(state.gymOrder.length).toBe(before + 1);
    expect(state.money).toBeLessThan(1_000_000);
  });

  it("briefs each offered type with something to decide on", () => {
    const state = newLeague(111);
    const brief = briefType(state, "fire");
    expect(brief.owned).toBeGreaterThanOrEqual(0);
    expect(brief.metaShare).toBeGreaterThan(0);
    expect(Array.isArray(brief.routes)).toBe(true);
  });
});

describe("facilities", () => {
  it("charges an escalating price and raises the level", () => {
    const state = newLeague(501);
    state.money = 1_000_000;
    const first = upgradeCost(state, "training_grounds");
    expect(upgrade(state, "training_grounds").ok).toBe(true);
    expect(facilityLevel(state, "training_grounds")).toBe(1);
    const second = upgradeCost(state, "training_grounds");
    expect(second).toBeGreaterThan(first ?? 0);
  });

  it("refuses past max level", () => {
    const state = newLeague(502);
    state.money = 100_000_000;
    for (let i = 0; i < 20; i++) upgrade(state, "trade_desk");
    expect(upgradeCost(state, "trade_desk")).toBeNull();
    expect(canUpgrade(state, "trade_desk").ok).toBe(false);
  });

  it("training grounds speed up bonding", () => {
    const state = newLeague(503);
    state.money = 1_000_000;
    const gymId = state.gymOrder[0] ?? "";
    const gym = state.gyms[gymId];
    expect(gym).toBeDefined();
    if (!gym) return;

    upgrade(state, "training_grounds");
    expect(bondSpeed(state)).toBeGreaterThan(1);
  });

  it("the scouting office buys another posting, not a percentage", () => {
    const state = newLeague(504);
    const base = slotsAvailable(state, "ranger");
    state.money = 1_000_000;
    upgrade(state, "scouting_office");
    expect(slotsAvailable(state, "ranger")).toBeGreaterThan(base);
  });

  it("resets on promotion — only the Hall carries across", () => {
    const state = newLeague(505);
    state.money = 10_000_000;
    upgrade(state, "medical_center");
    expect(facilityLevel(state, "medical_center")).toBe(1);

    state.peakRenown = 100000;
    buildOutLeague(state);
    if (readiness(state).ok) {
      promote(state, inductable(state).slice(0, 3).map((c) => c.id));
      expect(facilityLevel(state, "medical_center")).toBe(0);
      expect(state.hall.length).toBeGreaterThan(0);
    }
  });
});

describe("creature legitimacy", () => {
  it("never places a species below its evolution level", () => {
    const state = newLeague(801);
    const gengar = catalog.get("gengar");
    expect(gengar).toBeDefined();
    if (!gengar) return;

    const floor = minLevelFor(gengar);
    expect(floor).toBeGreaterThan(20);

    // Asking for a level 12 Gengar must not produce one.
    const mon = makeCreature(state, gengar, "reserve", { level: 12 });
    expect(mon.level).toBeGreaterThanOrEqual(floor);
  });

  it("keeps evolved forms off routes that are too low-level", () => {
    const state = newLeague(802);
    const routes = eligibleRoutes(state);

    const caught: string[] = [];
    for (let i = 0; i < 120; i++) {
      const route = routes[i % routes.length];
      if (!route) break;
      const c = drawFrom(state, route);
      const sp = c ? catalog.get(c.speciesId) : undefined;
      if (c && sp) {
        expect(c.level).toBeGreaterThanOrEqual(minLevelFor(sp));
        expect(minLevelFor(sp)).toBeLessThanOrEqual(route.levelMax);
        caught.push(c.id);
      }
    }
    expect(caught.length).toBeGreaterThan(0);
  });

  it("never gives a trainer a legendary", () => {
    const state = newLeague(803);
    for (let i = 0; i < 40; i++) {
      const t = makeTrainer(state, "psychic", "gym");
      for (const id of t.party) {
        const sp = catalog.get(state.creatures[id]?.speciesId ?? "");
        expect(sp?.isLegendary).toBe(false);
      }
    }
  });
});

describe("parties", () => {
  it("deepens a Leader's party with their gym's rank", () => {
    const state = newLeague(701);
    const gymId = state.gymOrder[0] ?? "";
    const leaderId = state.gyms[gymId]?.leaderId ?? "";
    const trainer = state.trainers[leaderId];
    if (!trainer) return;

    // The first gym fields a small team; a full six is something the board earns.
    expect(partyCapOf(trainer, state)).toBe(constants.LEADER_DEPTH.atFirstGym);
    expect(partyCapOf(trainer, state)).toBeLessThan(constants.PARTY.max);

    for (let i = 0; i < 20; i++) scoutCatch(state, trainer.affinity);
    autoFill(state, leaderId);
    expect(trainer.party.length).toBe(constants.LEADER_DEPTH.atFirstGym);

    // A late gym runs deep.
    state.money = 5_000_000;
    state.peakRenown = 100_000;
    buildOutLeague(state);
    const lastId = state.gymOrder[state.gymOrder.length - 1] ?? "";
    const lastLeader = state.trainers[state.gyms[lastId]?.leaderId ?? ""];
    if (lastLeader) {
      expect(partyCapOf(lastLeader, state)).toBeGreaterThan(
        constants.LEADER_DEPTH.atFirstGym,
      );
    }
  });

  it("only accepts creatures of the trainer's type", () => {
    const state = newLeague(702);
    // Asserted against a junior, not a Leader: Leaders keep wildcard slots by
    // design, so for them an off-type creature is legal until those are spent.
    const junior = makeTrainer(state, "fire", "gym", { partyCap: 4 });
    const wrong = Object.values(state.creatures).find(
      (c) => c.owned && c.role === "reserve" && !c.types.includes("fire"),
    );
    expect(wrong).toBeDefined();
    if (wrong) expect(canJoin(state, wrong.id, junior.id).ok).toBe(false);
  });

  it("auto-fills empty slots from the box", () => {
    const state = newLeague(703);
    const leaderId = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";
    const trainer = state.trainers[leaderId];
    for (let i = 0; i < 8; i++) scoutCatch(state, trainer?.affinity);

    const before = state.trainers[leaderId]?.party.length ?? 0;
    autoFill(state, leaderId);
    expect(state.trainers[leaderId]?.party.length).toBeGreaterThan(before);
  });

  it("never swaps out a pinned creature", () => {
    const state = newLeague(704);
    const leaderId = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";
    const trainer = state.trainers[leaderId];
    if (!trainer) return;

    // A weak, pinned party member, and a far stronger creature in the box.
    for (let i = 0; i < 8; i++) scoutCatch(state, trainer.affinity);
    autoFill(state, leaderId);

    const weakling = partyOf(state, leaderId).find((c) => c.id !== trainer.signatureId);
    expect(weakling).toBeDefined();
    if (!weakling) return;
    weakling.power = 1;
    weakling.pinned = true;

    const ringer = scoutCatch(state, trainer.affinity);
    ringer.power = 999;

    autoFill(state, leaderId);
    expect(trainer.party).toContain(weakling.id);
  });

  it("never swaps out a creature that has already bonded", () => {
    const state = newLeague(709);
    const leaderId = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";
    const trainer = state.trainers[leaderId];
    if (!trainer) return;

    for (let i = 0; i < 8; i++) scoutCatch(state, trainer.affinity);
    autoFill(state, leaderId);

    const server = partyOf(state, leaderId).find((c) => c.id !== trainer.signatureId);
    if (!server) return;
    server.power = 1;
    server.pinned = false;
    // It has served. Auto-fill must not throw that away for a bigger number.
    server.bond = 0.9;

    const ringer = scoutCatch(state, trainer.affinity);
    ringer.power = 999;

    autoFill(state, leaderId);
    expect(trainer.party).toContain(server.id);
  });

  it("never swaps out a party member on its own", () => {
    const state = newLeague(705);
    const leaderId = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";
    const trainer = state.trainers[leaderId];
    if (!trainer) return;

    for (let i = 0; i < 8; i++) scoutCatch(state, trainer.affinity);
    autoFill(state, leaderId);
    const before = [...trainer.party];
    expect(before.length).toBeGreaterThan(0);

    // Something far better arrives in the box. Auto-fill leaves the party alone:
    // by the mid-game something better is *always* available, and upgrading on
    // sight churned every unbonded slot faster than it could earn any bond.
    // Casting is the player's decision, not a background process.
    const ringer = scoutCatch(state, trainer.affinity);
    ringer.power = 9999;

    autoFill(state, leaderId);
    expect(trainer.party).toEqual(before);
  });
});

describe("founding a league", () => {
  it("starts with a type choice rather than a gym somebody picked for you", () => {
    const state = createInitialState(901);
    expect(state.gymOrder.length).toBe(0);
    expect(state.gymOffer?.length).toBeGreaterThan(0);
  });

  it("makes the first gym free", () => {
    const state = createInitialState(902);
    expect(gymCost(state)).toBe(0);
    // A league opens with just enough to hire its first Ranger — creatures now
    // come only from staffed routes, so that is part of the opening position.
    expect(state.money).toBe(constants.SCOUTING.startingMoney);

    const type = state.gymOffer?.[0];
    expect(type).toBeDefined();
    if (!type) return;
    expect(acceptGymOffer(state, type).ok).toBe(true);
    expect(state.gymOrder.length).toBe(1);
  });

  it("then offers Leaders for it, and starts with one junior in place", () => {
    const state = createInitialState(903);
    acceptGymOffer(state, state.gymOffer?.[0] ?? "fire");
    expect(state.leaderOffer?.trainerIds.length).toBe(3);

    chooseLeader(state, state.leaderOffer?.trainerIds[0] ?? "");
    const gym = state.gyms[state.gymOrder[0] ?? ""];
    expect(gym?.leaderId).not.toBeNull();
    expect(gym?.trainerIds.length).toBe(1);
  });
});

describe("party composition", () => {
  it("refuses two creatures from the same evolution line", () => {
    const state = newLeague(904);
    const leaderId = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";
    const trainer = state.trainers[leaderId];
    if (!trainer) return;
    for (const id of [...trainer.party]) {
      if (id !== trainer.signatureId) leaveParty(state, id);
    }

    const charmander = catalog.get("charmander");
    const charizard = catalog.get("charizard");
    expect(charmander && charizard).toBeTruthy();
    if (!charmander || !charizard) return;

    const a = makeCreature(state, charmander, "reserve");
    const b = makeCreature(state, charizard, "reserve");

    // A fire Leader will take one of the line...
    if (trainer.affinity !== "fire") return;
    expect(join(state, a.id, leaderId).ok).toBe(true);
    // ...but not the other, at any stage.
    expect(join(state, b.id, leaderId).ok).toBe(false);
    expect(familyOf("charizard")).toBe(familyOf("charmander"));
  });

  it("lets the player remove a creature, and keeps it removed", () => {
    const state = newLeague(905);
    const leaderId = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";
    const trainer = state.trainers[leaderId];
    if (!trainer) return;

    // A new league's box is empty, so stock it before there is anything to remove.
    for (let i = 0; i < 8; i++) scoutCatch(state, trainer.affinity);
    autoFill(state, leaderId);

    const victim = partyOf(state, leaderId).find((c) => c.id !== trainer.signatureId);
    expect(victim).toBeDefined();
    if (!victim) return;

    bench(state, victim.id);
    expect(trainer.party).not.toContain(victim.id);
    expect(victim.benched).toBe(true);

    // Auto-fill must respect it — otherwise the removal is meaningless.
    autoFill(state, leaderId);
    autoFill(state, leaderId);
    expect(trainer.party).not.toContain(victim.id);

    unbench(state, victim.id);
    expect(victim.benched).toBe(false);
  });

  it("will not let the player remove a trainer's signature creature", () => {
    const state = newLeague(906);
    const leaderId = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";
    const trainer = state.trainers[leaderId];
    if (!trainer) return;
    bench(state, trainer.signatureId);
    expect(trainer.party).toContain(trainer.signatureId);
  });
});

describe("granted parties", () => {
  it("never gives a trainer two creatures from one evolution line", () => {
    const state = newLeague(1001);
    state.money = 5_000_000;
    const gymId = state.gymOrder[0] ?? "";

    // The bug this covers: hireGymTrainer used to push straight into the party
    // array, skipping canJoin, and produced squads holding a Charmeleon, a
    // Charizard and another Charmeleon.
    for (let i = 0; i < 12; i++) {
      const result = hireGymTrainer(state, gymId);
      if (!result.ok) {
        expandGymTrainers(state, gymId);
        continue;
      }
      const party = partyOf(state, result.trainerId);
      const families = party.map((c) => familyOf(c.speciesId));
      expect(new Set(families).size).toBe(families.length);
    }
  });

  it("gives Leader candidates duplicate-free parties too", () => {
    const state = createInitialState(1002);
    acceptGymOffer(state, state.gymOffer?.[0] ?? "fire");
    for (const id of state.leaderOffer?.trainerIds ?? []) {
      const party = partyOf(state, id);
      const families = party.map((c) => familyOf(c.speciesId));
      expect(new Set(families).size).toBe(families.length);
    }
  });
});

describe("answering the meta", () => {
  it("hires juniors of the gym's own type, never off it", () => {
    const state = newLeague(1003);
    state.money = 5_000_000;
    const gymId = state.gymOrder[0] ?? "";
    const gym = state.gyms[gymId];
    if (!gym) return;

    const result = hireGymTrainer(state, gymId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(state.trainers[result.trainerId]?.affinity).toBe(gym.type);
    for (const c of partyOf(state, result.trainerId)) {
      expect(c.types).toContain(gym.type);
    }
  });

  it("refuses off-type creatures at every rank", () => {
    const state = newLeague(1004);
    const leaderId = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";
    const trainer = state.trainers[leaderId];
    if (!trainer) return;
    for (const id of [...trainer.party]) {
      if (id !== trainer.signatureId) leaveParty(state, id);
    }

    // Nothing off-type gets in, at any rank. A gym is its type all the way
    // through — the wildcard escape hatch is gone.
    const other = trainer.affinity === "water" ? "grass" : "water";
    let accepted = 0;
    for (let i = 0; i < 6; i++) {
      const mon = scoutCatch(state, other);
      if (mon.types.includes(trainer.affinity)) continue;
      if (join(state, mon.id, leaderId).ok) accepted += 1;
    }
    expect(accepted).toBe(0);
  });

  it("keeps auto-fill on-type", () => {
    const state = newLeague(1005);
    const leaderId = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";
    const trainer = state.trainers[leaderId];
    if (!trainer) return;

    const other = trainer.affinity === "water" ? "grass" : "water";
    for (let i = 0; i < 12; i++) scoutCatch(state, other);
    autoFill(state, leaderId);
    for (const c of partyOf(state, leaderId)) {
      expect(c.types).toContain(trainer.affinity);
    }
  });
});

describe("rivals", () => {
  it("announces itself ahead of time, naming the gym and the type", () => {
    const state = newLeague(1101);
    run(state, constants.RIVAL.intervalSeconds + 5);

    const rival = nextRival(state);
    expect(rival).toBeDefined();
    if (!rival) return;
    expect(rival.arrivesAt).toBeGreaterThan(state.time);
    expect(state.gyms[rival.gymId]).toBeDefined();
    expect(rival.resolved).toBe(false);
  });

  it("picks a type that actually beats the gym it targets", () => {
    const state = newLeague(1102);
    run(state, constants.RIVAL.intervalSeconds + 5);
    const rival = nextRival(state);
    if (!rival) return;
    const gym = state.gyms[rival.gymId];
    if (!gym) return;
    expect(effectivenessAgainst(rival.type, [gym.type])).toBeGreaterThan(1);
  });

  it("resolves when the window closes", () => {
    const state = newLeague(1103);
    run(state, constants.RIVAL.intervalSeconds + 5);
    const rival = nextRival(state);
    if (!rival) return;

    run(state, constants.RIVAL.warningSeconds + 10);
    expect(state.rivals.find((r) => r.id === rival.id)?.resolved).toBe(true);
  });

  it("costs renown when it wins", () => {
    const state = newLeague(1104);
    state.renown = 5000;
    run(state, constants.RIVAL.intervalSeconds + 5);
    const rival = nextRival(state);
    if (!rival) return;

    // Make the gym hopeless so the rival certainly wins.
    rival.badges = 7;
    for (const t of Object.values(state.trainers)) t.party = [];
    const before = state.renown;
    run(state, constants.RIVAL.warningSeconds + 10);
    expect(state.renown).toBeLessThan(before);
  });

  it("hands the player a purse and the rival themselves when beaten", () => {
    const state = newLeague(1105);
    run(state, constants.RIVAL.intervalSeconds + 5);
    const rival = nextRival(state);
    if (!rival) return;

    // A rookie rival against an overwhelming gym: the league certainly holds.
    rival.badges = 0;
    const gym = state.gyms[rival.gymId];
    if (gym) {
      for (const tid of [...gym.trainerIds, gym.leaderId ?? ""]) {
        for (const id of state.trainers[tid]?.party ?? []) {
          const c = state.creatures[id];
          if (c) {
            // Battles read the real stats, which derive from level.
            c.level = 90;
            c.bond = 1;
            c.fatigue = 0;
            c.careerTotal = 1_000_000;
            refreshPower(c);
          }
        }
      }
      gym.trainerSlots = 6;
    }

    const money = state.money;
    const trainers = Object.keys(state.trainers).length;

    // A beaten rival joins a gym of *their own* type, so one has to have room.
    run(state, 1);
    const pending = nextRival(state);
    const homeGym = state.gyms[state.gymOrder[0] ?? ""];
    if (pending && homeGym) {
      pending.type = homeGym.type;
      pending.gymId = homeGym.id;
    }
    run(state, constants.RIVAL.warningSeconds + 10);

    expect(state.money).toBeGreaterThan(money);
    expect(Object.keys(state.trainers).length).toBeGreaterThan(trainers);
  });
});

describe("the drifting meta bites", () => {
  it("makes losses cost more at a badly-matched gym", () => {
    // Asserted on the formula rather than by running the clock. Over any real
    // span renown decay dwarfs a single badge, and the hand-set threat
    // distribution is washed out by the waves the run itself records — so the
    // old version was measuring drift, not the mechanic.
    const state = newLeague(1106);
    const gym = state.gyms[state.gymOrder[0] ?? ""];
    if (!gym) throw new Error("no gym");

    // A type this gym *resists* — not its own type, which for Ghost and Dragon
    // is super-effective against itself.
    const resisted = TYPES.find((t) => effectivenessAgainst(t, [gym.type]) < 1);
    const beats = TYPES.find((t) => effectivenessAgainst(t, [gym.type]) > 1);
    if (!resisted || !beats) throw new Error("no contrast available");

    const matched = emptyTally();
    matched[resisted] = 1;
    const mismatched = emptyTally();
    mismatched[beats] = 1;

    const easy = threatAgainst(gym.type, matched);
    const hard = threatAgainst(gym.type, mismatched);
    expect(hard).toBeGreaterThan(easy);

    const cost = (p: number) =>
      constants.RENOWN.perBadgeLost *
      Math.max(1, p ** constants.RENOWN.mismatchExponent);
    expect(cost(hard)).toBeGreaterThan(cost(easy));
  });
});

describe("the Day-Care costs you a slot", () => {
  it("keeps a parked creature from defending", () => {
    const state = newLeague(1107);
    state.money = 1_000_000;
    upgrade(state, "day_care");

    const leaderId = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";
    const trainer = state.trainers[leaderId];
    if (!trainer) return;
    for (let i = 0; i < 6; i++) scoutCatch(state, trainer.affinity);
    autoFill(state, leaderId);

    const parked = partyOf(state, leaderId).find((c) => c.id !== trainer.signatureId);
    if (!parked) return;
    dropOff(state, parked.id);

    // Still theirs — the slot is held, not freed. That is the trade: parking
    // your best means the gym fights a creature short.
    expect(state.dayCare.some((s) => s.creatureId === parked.id)).toBe(true);
    expect(trainer.party).toContain(parked.id);

    const fought = parked.wins + parked.losses;
    run(state, 1800);
    expect(parked.wins + parked.losses).toBe(fought);
  });
});

describe("doctrine retraining", () => {
  it("is locked until the league is established", () => {
    const state = newLeague(1108);
    expect(doctrineUnlocked(state)).toBe(false);
    const leaderId = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";
    expect(canRetrain(state, leaderId).ok).toBe(false);
  });

  it("lets an established league change a Leader's stance for money", () => {
    const state = newLeague(1109);
    state.peakRenown = 100000;
    state.money = 10_000_000;
    buildOutLeague(state);
    expect(doctrineUnlocked(state)).toBe(true);

    const leaderId = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";
    const trainer = state.trainers[leaderId];
    if (!trainer) return;
    const target = trainer.doctrine === "stall" ? "sweep" : "stall";

    const before = state.money;
    expect(retrain(state, leaderId, target).ok).toBe(true);
    expect(trainer.doctrine).toBe(target);
    expect(state.money).toBeLessThan(before);
  });

  it("will not retrain a junior", () => {
    const state = newLeague(1110);
    state.peakRenown = 100000;
    state.money = 10_000_000;
    buildOutLeague(state);
    const gym = state.gyms[state.gymOrder[0] ?? ""];
    const junior = gym?.trainerIds[0];
    if (!junior) return;
    expect(canRetrain(state, junior).ok).toBe(false);
  });
});

describe("party battles", () => {
  it("resolves as knockouts, not a single exchange", () => {
    const state = newLeague(1201);
    const gym = state.gyms[state.gymOrder[0] ?? ""];
    if (!gym) return;

    const before = Object.values(state.creatures)
      .filter((c) => c.role === "party")
      .reduce((a, c) => a + c.wins + c.losses, 0);

    run(state, 3 * constants.CHALLENGE.intervalSeconds);

    const after = Object.values(state.creatures)
      .filter((c) => c.role === "party")
      .reduce((a, c) => a + c.wins + c.losses, 0);

    // A handful of challenges should produce many individual exchanges.
    expect(after - before).toBeGreaterThan(3);
  });

  it("sends the challenger through the juniors before the Leader", () => {
    const state = newLeague(1202);
    state.money = 5_000_000;
    const gymId = state.gymOrder[0] ?? "";
    hireGymTrainer(state, gymId);

    run(state, 8 * constants.CHALLENGE.intervalSeconds);
    const gym = state.gyms[gymId];
    // Juniors that hold spare the Leader entirely.
    expect(gym?.threat.samples).toBeGreaterThan(0);
  });

  it("scales the challenger with badge count", () => {
    const rookie = partySizeFor(0);
    const veteran = partySizeFor(7);
    expect(veteran).toBeGreaterThan(rookie);
    expect(veteran).toBeLessThanOrEqual(6);
    expect(revivesFor(7)).toBeGreaterThan(revivesFor(0));
  });

  it("gives challengers mixed-type parties, not one type", () => {
    const state = newLeague(1203);
    const challenger = makeChallenger(state, 5);
    expect(challenger.party.length).toBeGreaterThan(1);
    const families = challenger.party.map((m) => familyOf(m.speciesId));
    expect(new Set(families).size).toBe(families.length);
  });
});

describe("real stats", () => {
  it("scales the six stats with level", () => {
    const low = statsFor(catalog.get("chansey")!.stats, 5, 1);
    const high = statsFor(catalog.get("chansey")!.stats, 60, 1);
    expect(high.hp).toBeGreaterThan(low.hp);
    expect(high.speed).toBeGreaterThan(low.speed);
  });

  it("keeps species identity — a wall walls, a sweeper sweeps", () => {
    const chansey = statsFor(catalog.get("chansey")!.stats, 50, 1);
    const jolteon = statsFor(catalog.get("jolteon")!.stats, 50, 1);
    expect(chansey.hp).toBeGreaterThan(jolteon.hp);
    expect(jolteon.speed).toBeGreaterThan(chansey.speed);
  });

  it("hits harder through the stat the attacker is better at", () => {
    const physical = statsFor(catalog.get("machamp")!.stats, 50, 1);
    const special = statsFor(catalog.get("alakazam")!.stats, 50, 1);
    const wall = statsFor(catalog.get("chansey")!.stats, 50, 1);

    // Chansey has huge special defence and almost none physical, so a physical
    // attacker should get far more through than a special one.
    expect(damage(physical, wall, 50, 1, 1)).toBeGreaterThan(
      damage(special, wall, 50, 1, 1),
    );
  });

  it("respects type effectiveness", () => {
    const a = statsFor(catalog.get("charizard")!.stats, 50, 1);
    const b = statsFor(catalog.get("venusaur")!.stats, 50, 1);
    expect(damage(a, b, 50, 2, 1)).toBeGreaterThan(damage(a, b, 50, 1, 1));
    expect(damage(a, b, 50, 0.5, 1)).toBeLessThan(damage(a, b, 50, 1, 1));
  });
});

describe("watchable battles", () => {
  it("records the blows of the most recent challenge", () => {
    const state = newLeague(1301);
    run(state, 3 * constants.CHALLENGE.intervalSeconds);

    const gymId = state.gymOrder[0] ?? "";
    const record = state.battles[gymId];
    expect(record).toBeDefined();
    expect(record?.stages.length).toBeGreaterThan(0);

    const events = record?.stages.flatMap((st) => st.events) ?? [];
    expect(events.length).toBeGreaterThan(0);
    // HP goes down, and somebody eventually drops.
    expect(events.some((e) => e.kind === "hit" && e.damage > 0)).toBe(true);
    expect(events.some((e) => e.kind === "faint")).toBe(true);
  });

  it("flags the Leader's stage so it can be given emphasis", () => {
    const state = newLeague(1302);
    run(state, 20 * constants.CHALLENGE.intervalSeconds);
    const record = state.battles[state.gymOrder[0] ?? ""];
    // Not every challenge reaches the Leader — but when one does, it is marked.
    if (record?.stages.some((st) => st.isLeader)) {
      expect(record.stages[record.stages.length - 1]?.isLeader).toBe(true);
    }
  });

  it("keeps only the latest battle per gym", () => {
    const state = newLeague(1303);
    run(state, 10 * constants.CHALLENGE.intervalSeconds);
    expect(Object.keys(state.battles).length).toBeLessThanOrEqual(
      state.gymOrder.length,
    );
  });
});

describe("gym rank", () => {
  it("keeps the strongest types off the first gym", () => {
    const early = typesForRank(0);
    const late = typesForRank(7);
    expect(late.length).toBeGreaterThan(early.length);
    for (const t of early) expect(late).toContain(t);
  });
});

describe("ownership", () => {
  it("keeps junior trainers' creatures out of the player's hands", () => {
    const state = newLeague(1204);
    state.money = 5_000_000;
    const gymId = state.gymOrder[0] ?? "";
    const result = hireGymTrainer(state, gymId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const c of partyOf(state, result.trainerId)) {
      expect(c.owned).toBe(false);
      expect(canDropOff(state, c.id).ok).toBe(false);
    }
    // ...and they never appear in the box.
    expect(tradeableStock(state).some((c) => !c.owned)).toBe(false);
  });

  it("keeps a Leader's party as the player's own", () => {
    const state = newLeague(1205);
    const leaderId = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";
    for (const c of partyOf(state, leaderId)) expect(c.owned).toBe(true);
  });
});

describe("attendance", () => {
  it("draws challengers faster as the league becomes famous", () => {
    const quiet = newLeague(1006);
    quiet.renown = 0;
    const famous = newLeague(1006);
    famous.renown = 20000;
    expect(waveInterval(famous)).toBeLessThan(waveInterval(quiet));
  });

  it("floors the arrival rate so attendance cannot run away", () => {
    const state = newLeague(1007);
    state.renown = 10_000_000;
    expect(waveInterval(state)).toBeGreaterThan(0);
    expect(waveInterval(state)).toBeGreaterThanOrEqual(
      constants.WAVE.intervalSeconds * constants.WAVE.minArrivalMultiplier - 0.001,
    );
  });
});

describe("leader candidates", () => {
  it("offers three Leaders when a gym opens, and choosing is free", () => {
    const state = newLeague(710);
    state.peakRenown = 5000;
    state.money = 1_000_000;
    state.gymOffer = null;
    checkGymUnlock(state);

    const type = state.gymOffer?.[0];
    expect(type).toBeDefined();
    if (!type) return;

    const before = state.money;
    acceptGymOffer(state, type);
    const spentOnBuilding = before - state.money;

    expect(state.leaderOffer?.trainerIds.length).toBe(3);

    const moneyBefore = state.money;
    const pick = state.leaderOffer?.trainerIds[0] ?? "";
    expect(chooseLeader(state, pick).ok).toBe(true);
    // Free — the building was the expense.
    expect(state.money).toBe(moneyBefore);
    expect(spentOnBuilding).toBeGreaterThan(0);
  });

  it("gives each candidate a distinct archetype and a trained partner", () => {
    const state = newLeague(711);
    state.peakRenown = 5000;
    state.money = 1_000_000;
    state.gymOffer = null;
    checkGymUnlock(state);
    acceptGymOffer(state, state.gymOffer?.[0] ?? "fire");

    const candidates = (state.leaderOffer?.trainerIds ?? []).map(
      (id) => state.trainers[id],
    );
    const doctrines = new Set(candidates.map((c) => c?.doctrine));
    expect(doctrines.size).toBe(candidates.length);

    for (const c of candidates) {
      expect(c?.party.length).toBeGreaterThan(0);
      const partner = state.creatures[c?.party[0] ?? ""];
      expect(partner?.bond).toBe(1);
      expect(partner?.level).toBeGreaterThan(5);
    }
  });

  it("sends the unchosen candidates home with their creatures", () => {
    const state = newLeague(712);
    state.peakRenown = 5000;
    state.money = 1_000_000;
    state.gymOffer = null;
    checkGymUnlock(state);
    acceptGymOffer(state, state.gymOffer?.[0] ?? "fire");

    const all = [...(state.leaderOffer?.trainerIds ?? [])];
    const chosen = all[0] ?? "";
    const rejected = all.slice(1);
    chooseLeader(state, chosen);

    for (const id of rejected) expect(state.trainers[id]).toBeUndefined();
    expect(state.trainers[chosen]).toBeDefined();
    expect(state.leaderOffer).toBeNull();
  });

  it("does not put candidates on the payroll", () => {
    const state = newLeague(713);
    state.peakRenown = 5000;
    state.money = 1_000_000;
    state.gymOffer = null;
    checkGymUnlock(state);
    acceptGymOffer(state, state.gymOffer?.[0] ?? "fire");

    const candidate = state.trainers[state.leaderOffer?.trainerIds[0] ?? ""];
    expect(candidate?.kind).toBe("candidate");
    const before = candidate?.tenure ?? 0;
    run(state, 600);
    expect(state.trainers[candidate?.id ?? ""]?.tenure ?? 0).toBe(before);
  });
});

describe("gym trainers", () => {
  it("stand between challengers and the Leader", () => {
    const state = newLeague(706);
    const gymId = state.gymOrder[0] ?? "";
    const gym = state.gyms[gymId];
    // A league is founded with one junior already in place.
    expect(gym?.trainerIds.length).toBeGreaterThan(0);

    run(state, 2 * 3600);
    expect(gym?.threat.absorbed).toBeGreaterThan(0);
  });

  it("cost money to hire and are limited by gym slots", () => {
    const state = newLeague(707);
    state.money = 1_000_000;
    const gymId = state.gymOrder[0] ?? "";
    const gym = state.gyms[gymId];
    if (!gym) return;

    while (canHireGymTrainer(state, gymId).ok) hireGymTrainer(state, gymId);
    expect(gym.trainerIds.length).toBe(gym.trainerSlots);
    expect(canHireGymTrainer(state, gymId).ok).toBe(false);

    expandGymTrainers(state, gymId);
    expect(canHireGymTrainer(state, gymId).ok).toBe(true);
  });

  it("arrive with their own creatures, matching the gym type", () => {
    const state = newLeague(708);
    state.money = 1_000_000;
    const gymId = state.gymOrder[0] ?? "";
    const gym = state.gyms[gymId];
    const result = hireGymTrainer(state, gymId);
    expect(result.ok).toBe(true);
    if (!result.ok || !gym) return;

    const party = partyOf(state, result.trainerId);
    expect(party.length).toBeGreaterThanOrEqual(2);
    expect(party.length).toBeLessThanOrEqual(4);
    for (const c of party) expect(c.types).toContain(gym.type);
  });

  it("run smaller parties than a Leader", () => {
    const state = newLeague(714);
    state.money = 1_000_000;
    const gymId = state.gymOrder[0] ?? "";
    const result = hireGymTrainer(state, gymId);
    if (!result.ok) return;
    const junior = state.trainers[result.trainerId];
    expect(partyCapOf(junior!)).toBeLessThanOrEqual(4);
    expect(partyCapOf(junior!)).toBeGreaterThanOrEqual(2);
  });

  it("are capped at three before the endgame and four at World tier", () => {
    const state = newLeague(715);
    expect(gymTrainerCap(state)).toBe(3);
    state.tier = "world";
    expect(gymTrainerCap(state)).toBe(4);
  });
});

describe("the Day-Care", () => {
  function retiree(state: LeagueState, speciesId: string, bond = 1) {
    const c = scoutCatch(state, "water");
    c.speciesId = speciesId;
    const sp = catalog.get(speciesId);
    if (sp) c.types = sp.types;
    c.role = "retired";
    c.bond = bond;
    c.careerSpent = c.careerTotal;
    refreshPower(c);
    return c;
  }

  it("must be built before the couple take anyone", () => {
    const state = newLeague(601);
    const c = scoutCatch(state, "fire");
    expect(canDropOff(state, c.id).ok).toBe(false);
  });

  it("takes exactly two", () => {
    const state = newLeague(602);
    state.money = 100000;
    upgrade(state, "day_care");
    const a = scoutCatch(state, "fire");
    const b = scoutCatch(state, "fire");
    const c = scoutCatch(state, "fire");
    expect(dropOff(state, a.id).ok).toBe(true);
    expect(dropOff(state, b.id).ok).toBe(true);
    expect(dropOff(state, c.id).ok).toBe(false);
  });

  it("trains by the passage of time, not by battle", () => {
    const state = newLeague(603);
    state.money = 100000;
    upgrade(state, "day_care");

    const c = scoutCatch(state, "fire");
    const before = c.level;
    dropOff(state, c.id);
    run(state, 3600);
    expect(c.level).toBeGreaterThan(before);
  });

  it("charges a flat fee plus a sum per level gained", () => {
    const state = newLeague(604);
    state.money = 100000;
    upgrade(state, "day_care");

    const c = scoutCatch(state, "fire");
    dropOff(state, c.id);
    const idle = collectionFee(state, c.id);
    expect(idle).toBe(100);

    run(state, 2 * 3600);
    const trained = collectionFee(state, c.id);
    expect(trained).toBeGreaterThan(idle);

    const money = state.money;
    const result = collect(state, c.id);
    expect(result.ok).toBe(true);
    expect(state.money).toBe(money - trained);
    expect(state.dayCare.length).toBe(0);
  });

  it("produces an egg from two compatible occupants", () => {
    const state = newLeague(605);
    state.money = 100000;
    upgrade(state, "day_care");

    const a = retiree(state, "dratini");
    const b = retiree(state, "dragonair");
    dropOff(state, a.id);
    dropOff(state, b.id);

    const before = Object.keys(state.creatures).length;
    run(state, 60 * 60);
    expect(Object.keys(state.creatures).length).toBeGreaterThan(before);

    const child = Object.values(state.creatures).find((c) => c.parents !== null);
    expect(child).toBeDefined();
    // Eggs hatch as base forms — breeding a Dragonair gives you a Dratini.
    expect(child?.speciesId).toBe("dratini");
    expect(child?.generation).toBe(1);
    expect(pedigree(state, child?.id ?? "").length).toBeGreaterThan(0);
  });

  it("produces nothing from occupants that share no type", () => {
    const state = newLeague(606);
    state.money = 100000;
    upgrade(state, "day_care");

    const a = retiree(state, "dratini");
    const b = retiree(state, "growlithe");
    dropOff(state, a.id);
    dropOff(state, b.id);

    run(state, 90 * 60);
    expect(Object.values(state.creatures).some((c) => c.parents !== null)).toBe(false);
  });

  it("rewards bond and a career actually spent", () => {
    const state = newLeague(607);
    const idle = retiree(state, "dratini", 0);
    idle.careerSpent = 0;
    const veteran = retiree(state, "dratini", 1);
    veteran.powerRoll = idle.powerRoll;
    expect(parentQuality(veteran)).toBeGreaterThan(parentQuality(idle));
  });
});

describe("the Elite Four", () => {
  function fullBoard(seed: number) {
    const state = createInitialState(seed);
    state.money = 50_000_000;
    state.peakRenown = 100000;
    buildOutLeague(state);
    tick(state, 1);
    return state;
  }

  it("stays locked until every gym is built", () => {
    const state = newLeague(608);
    expect(eliteUnlocked(state)).toBe(false);
  });

  it("opens four seats and a Champion once the board is complete", () => {
    const state = fullBoard(609);
    expect(eliteUnlocked(state)).toBe(true);
    expect(state.elite.length).toBe(5);
    expect(state.elite.some(isChampion)).toBe(true);
  });

  it("is staffed by trainers, who bring their signature creature", () => {
    const state = fullBoard(610);
    const result = staffSeat(state, 0, "fire");
    expect(result.ok).toBe(true);

    const seat = state.elite.find((s) => s.rank === 0);
    expect(seat?.trainerId).not.toBeNull();
    expect(seatParty(state, seat!).length).toBeGreaterThan(0);
  });

  it("keeps a couple of wildcard slots, then holds the line", () => {
    const state = fullBoard(611);
    staffSeat(state, 1, "fire");

    // Elite seats are type-bound too. Nothing off-type takes a slot.
    let accepted = 0;
    for (let i = 0; i < 6; i++) {
      const wrong = scoutCatch(state, "water");
      if (wrong.types.includes("fire")) continue;
      if (assignToSeat(state, wrong.id, 1).ok) accepted += 1;
    }
    expect(accepted).toBe(0);
  });

  it("lets an unstaffed seat be walked straight past", () => {
    const state = fullBoard(612);
    const report = emptyReport();
    const result = runGauntlet(state, report);
    // Nothing is staffed, so a challenger clears every seat and takes the league.
    expect(result.cleared).toBe(5);
    expect(result.tookLeague).toBe(true);
    expect(state.leagueTaken).toBe(1);
  });

  it("pays out for every seat a challenger fails to clear", () => {
    const state = fullBoard(613);
    for (const seat of state.elite) staffSeat(state, seat.rank, "fire");
    // Battles read the real six stats, which derive from level — setting
    // `power` alone changes a summary field and nothing that fights.
    for (const seat of state.elite) {
      for (const c of seatParty(state, seat)) {
        c.level = 90;
        c.bond = 1;
        refreshPower(c);
      }
    }

    const money = state.money;
    const report = emptyReport();
    const result = runGauntlet(state, report);
    expect(result.tookLeague).toBe(false);
    expect(state.money).toBeGreaterThan(money);
  });
});


describe("promotion", () => {
  function readyLeague(seed: number) {
    const state = createInitialState(seed);
    state.peakRenown = 100000;
    state.money = 5_000_000;
    // Build out and staff every gym the readiness check demands.
    buildOutLeague(state);
    return state;
  }

  it("refuses while any gym is unstaffed or unbonded", () => {
    const state = newLeague(401);
    state.peakRenown = 100000;
    expect(readiness(state).ok).toBe(false);
    expect(readiness(state).blockers.length).toBeGreaterThan(0);
  });

  it("refuses on renown alone, however rich the league is", () => {
    const state = readyLeague(402);
    state.peakRenown = 0;
    expect(readiness(state).ok).toBe(false);
  });

  it("advances the tier and keeps only the Hall", () => {
    const state = readyLeague(403);
    expect(readiness(state).ok).toBe(true);

    const induct = inductable(state).slice(0, 3).map((c) => c.id);
    const result = promote(state, induct);
    expect(result.ok).toBe(true);
    expect(state.tier).toBe("national");
    expect(state.hall.length).toBe(induct.length);
    expect(state.renown).toBe(0);
    expect(state.money).toBe(constants.SCOUTING.startingMoney);
  });

  it("re-founds a promoted league through the same choice a new one makes", () => {
    // A promoted league used to be built differently from a fresh one, which
    // quietly made every run after the first worse than the first. Both now go
    // through foundLeague, so both start by choosing a type and a Leader.
    const promoted = readyLeague(404);
    promote(promoted, inductable(promoted).slice(0, 3).map((c) => c.id));

    expect(promoted.gymOrder.length).toBe(0);
    expect(promoted.gymOffer?.length).toBeGreaterThan(0);

    const type = promoted.gymOffer?.[0];
    if (type) acceptGymOffer(promoted, type);
    const leader = promoted.leaderOffer?.trainerIds[0];
    if (leader) chooseLeader(promoted, leader);

    const fresh = newLeague(404);
    expect(promoted.gymOrder.length).toBe(fresh.gymOrder.length);
    const newGym = promoted.gyms[promoted.gymOrder[0] ?? ""];
    expect(newGym?.leaderId).not.toBeNull();
    expect(newGym?.trainerIds.length).toBe(
      fresh.gyms[fresh.gymOrder[0] ?? ""]?.trainerIds.length,
    );
  });

  it("makes Mentors train new arrivals of their type", () => {
    const state = readyLeague(405);
    promote(state, inductable(state).slice(0, 3).map((c) => c.id));

    const mentored = state.hall[0]?.type;
    expect(mentored).toBeDefined();
    if (!mentored) return;

    expect(mentorsFor(state, [mentored])).toBeGreaterThan(0);
    expect(mentorLevels(state, [mentored])).toBeGreaterThan(0);
    expect(mentorBonus(state, [mentored])).toBeGreaterThan(1);

    const trained = scoutCatch(state, mentored);
    expect(trained.level).toBeGreaterThan(1);
  });

  it("raises gate receipts with each tier", () => {
    expect(tierMultiplier("national")).toBeGreaterThan(tierMultiplier("regional"));
    expect(tierMultiplier("world")).toBeGreaterThan(tierMultiplier("national"));
  });
});

describe("losing the title", () => {
  function fullBoard(seed: number): LeagueState {
    const state = createInitialState(seed);
    state.money = 50_000_000;
    state.peakRenown = 100000;
    buildOutLeague(state);
    tick(state, 1);
    for (let rank = 0; rank <= constants.ELITE.championRank; rank++) {
      staffSeat(state, rank, "fire");
    }
    return state;
  }

  it("seats the challenger as Champion rather than counting a loss", () => {
    const state = fullBoard(4201);
    const before = Object.keys(state.trainers).length;

    forceRecruit(state, makeChallenger(state, 8), 4, emptyReport());

    const champSeat = state.elite.find((s) => s.rank === constants.ELITE.championRank);
    const champ = champSeat?.trainerId ? state.trainers[champSeat.trainerId] : undefined;
    expect(champ).toBeDefined();
    expect(champ?.origin).toBe("usurper");
    expect(state.usurperId).toBe(champ?.id);
    expect(state.titleLost).toBe(true);
    // They arrive with the team that beat you, so the board grew rather than shrank.
    expect(Object.keys(state.trainers).length).toBeGreaterThanOrEqual(before);
    expect(champ!.party.length).toBeGreaterThan(1);
  });

  it("cannot be benched while their protection holds", () => {
    const state = fullBoard(4202);
    forceRecruit(state, makeChallenger(state, 8), 4, emptyReport());
    const champ = state.trainers[state.usurperId ?? ""];
    expect(champ).toBeDefined();
    expect(isProtected(state, champ!)).toBe(true);
    expect(demotionTargets(state, champ!.id)).toHaveLength(0);
  });

  it("bruises the seats that were beaten and leaves the ones that held", () => {
    const state = fullBoard(4203);
    const seats = [...state.elite].sort((a, b) => a.rank - b.rank);
    const beatenId = seats[0]?.trainerId ?? "";
    const heldId = seats[3]?.trainerId ?? "";
    const beatenBefore = state.trainers[beatenId]?.morale ?? 0;
    const heldBefore = state.trainers[heldId]?.morale ?? 0;

    // The challenger got through the first seat only.
    forceRecruit(state, makeChallenger(state, 8), 1, emptyReport());

    expect(state.trainers[beatenId]?.morale).toBeLessThan(beatenBefore);
    expect(state.trainers[heldId]?.morale).toBe(heldBefore);
  });

  it("unlocks promotion without forcing it", () => {
    const state = fullBoard(4204);
    expect(readiness(state).path).toBe("earned");

    state.titleLost = true;
    const check = readiness(state);
    expect(check.ok).toBe(true);
    expect(check.path).toBe("forced");
    // Nothing has moved on its own — staying is always legal.
    expect(state.tier).toBe("regional");
  });

  it("the forced path carries the usurper and no Mentors", () => {
    const state = fullBoard(4205);
    forceRecruit(state, makeChallenger(state, 8), 4, emptyReport());
    const usurperName = state.trainers[state.usurperId ?? ""]?.name;

    const result = promote(state, inductable(state).slice(0, 3).map((c) => c.id));
    expect(result.ok).toBe(true);
    // No legends of your own: that is what the speed costs.
    expect(state.hall).toHaveLength(0);
    // But the monster that beat you is standing in the new league on day one.
    expect(
      Object.values(state.trainers).some((t) => t.name === usurperName),
    ).toBe(true);
  });

  it("the earned path still carries Mentors", () => {
    const state = fullBoard(4206);
    const check = readiness(state);
    if (!check.ok) return; // board not bonded enough on this seed; nothing to assert
    promote(state, inductable(state).slice(0, 3).map((c) => c.id));
    expect(state.hall.length).toBeGreaterThan(0);
  });

  it("the title cannot fall while the player is away", () => {
    const state = fullBoard(4207);
    const before = state.leagueTaken;
    // Two full days: long enough for the analytic path, well inside the window.
    resolveOffline(state, 2 * 86_400);
    expect(state.leagueTaken).toBe(before);
    expect(state.titleLost).toBe(false);
  });

  it("runs a real gauntlet once the absence outlasts the window", () => {
    const state = fullBoard(4208);
    const report = resolveOffline(state, (constants.TITLE.safeDays + 20) * 86_400);
    expect(report.gauntlets.length).toBeGreaterThan(0);
    // Whatever happened, nobody comes back to a league one bad hour from collapse.
    for (const t of Object.values(state.trainers)) {
      expect(t.strain).toBe(0);
      expect(t.morale).toBe(t.standing);
    }
  });

  it("remembers whoever walks out, and softens them as they lose", () => {
    const state = newLeague(4209);
    remember(state, "Corvin", "dragon", 2);
    expect(state.grudges).toHaveLength(1);

    expect(beatGrudge(state, "Corvin")).toBe(false);
    expect(beatGrudge(state, "Corvin")).toBe(true);
    expect(state.grudges).toHaveLength(0);
  });
});

describe("the morale staircase", () => {
  /** Drive a trainer to the bottom without waiting out a payroll crisis. */
  function grind(state: LeagueState, trainerId: string, seconds: number): void {
    const t = state.trainers[trainerId];
    if (!t) throw new Error("no trainer");
    let left = seconds;
    while (left > 0) {
      t.morale = 0;
      tickMorale(state, 1, emptyReport());
      state.time += 1;
      left -= 1;
    }
  }

  it("suspends a trainer rather than losing them outright", () => {
    const state = newLeague(4101);
    const id = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";
    grind(state, id, constants.MORALE.strainToSuspend + 2);

    const t = state.trainers[id];
    expect(t).toBeDefined();
    expect(t?.suspensions).toBe(1);
    expect(isSuspended(state, t!)).toBe(true);
  });

  it("lowers standing with each suspension, so the next one comes sooner", () => {
    const state = newLeague(4102);
    const id = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";
    grind(state, id, constants.MORALE.strainToSuspend + 2);
    const first = state.trainers[id]?.standing ?? 1;

    // Serve it out, then run them down again.
    state.time += constants.MORALE.suspensionSeconds + 1;
    tickMorale(state, 1, emptyReport());
    grind(state, id, constants.MORALE.strainToSuspend + 2);

    expect(state.trainers[id]?.suspensions).toBe(2);
    expect(state.trainers[id]?.standing).toBeLessThan(first);
    expect(state.trainers[id]?.standing).toBeGreaterThanOrEqual(
      constants.MORALE.minStanding,
    );
  });

  it("only lets someone go after the staircase runs out", () => {
    const state = newLeague(4103);
    const id = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";

    for (let i = 0; i <= constants.MORALE.suspensionsBeforeDeparture; i++) {
      grind(state, id, constants.MORALE.strainToSuspend + 2);
      state.time += constants.MORALE.suspensionSeconds + 1;
      tickMorale(state, 1, emptyReport());
    }
    expect(state.trainers[id]).toBeUndefined();
  });

  it("a suspended trainer is a hole a challenger walks through", () => {
    const state = newLeague(4104);
    const gym = state.gyms[state.gymOrder[0] ?? ""];
    const id = gym?.leaderId ?? "";
    const t = state.trainers[id];
    if (!gym || !t) throw new Error("no gym");

    t.suspendedUntil = state.time + 1000;
    const result = runChallenge(state, gym, makeChallenger(state, 0), emptyReport());
    expect(result.tookBadge).toBe(true);
  });

  it("demotion carries the party across and keeps its bond", () => {
    const state = newLeague(4105);
    buildOutLeague(state);

    // A Leader with somewhere lower to go: another gym of their own type
    // needing a junior.
    const leaderId = state.gymOrder
      .map((gid) => state.gyms[gid]?.leaderId)
      .find((tid): tid is string => tid !== null && tid !== undefined);
    const leader = state.trainers[leaderId ?? ""];
    if (!leader) throw new Error("no leader");

    const targets = demotionTargets(state, leader.id);
    const target = targets.find((t) => t.kind === "gym");
    if (!target) return; // no same-type gym open; nothing to assert here

    const before = partyOf(state, leader.id).map((c) => ({ id: c.id, bond: c.bond }));
    leader.morale = 0.1;
    const res = demote(state, leader.id, target);

    expect(res.ok).toBe(true);
    expect(leader.kind).toBe("gym");
    expect(leader.morale).toBeGreaterThan(0.1);
    // Whoever travelled kept every point of bond they had earned.
    for (const c of partyOf(state, leader.id)) {
      const was = before.find((b) => b.id === c.id);
      if (was) expect(c.bond).toBe(was.bond);
    }
    // The signature creature never gets boxed.
    expect(leader.party).toContain(leader.signatureId);
    expect(leader.party.length).toBeLessThanOrEqual(partyCapOf(leader));
  });

  it("refuses demotion while a trainer is under protection", () => {
    const state = newLeague(4106);
    const id = state.gyms[state.gymOrder[0] ?? ""]?.leaderId ?? "";
    const t = state.trainers[id];
    if (!t) throw new Error("no trainer");

    t.demotionLockedUntil = state.time + 10_000;
    expect(demotionTargets(state, id)).toHaveLength(0);
  });
});

describe("the drifting meta", () => {
  it("keeps the challenger distribution normalized", () => {
    const state = newLeague(9);
    run(state, 3 * 3600);
    const total = Object.values(state.meta.weights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(state.meta.season).toBeGreaterThan(0);
  });
});
