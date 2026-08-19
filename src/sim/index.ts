/**
 * The sim's public surface.
 *
 * Everything the UI, the balance runner and the tests are allowed to touch goes
 * through this file, and nothing inside `src/sim` imports React, the DOM,
 * `Date.now()` or `Math.random()`. That constraint is what makes the sim
 * deterministic, replayable from a seed, and testable without a browser.
 */

export * as constants from "./constants.js";

export * from "./types.js";
export * from "./state.js";
export * from "./tick.js";
export * from "./factory.js";
export * from "./migrate.js";
export { resolveOffline } from "./offline.js";
export * from "./rng.js";
export * from "./devtools.js";
export * from "./systems/desk.js";

export {
  addToCrew,
  buyIntel,
  canCrew,
  canHire,
  canPost,
  rangers,
  ceilingFor,
  crewLevel,
  crewOf,
  dismiss,
  drawFrom,
  eligibleRoutes,
  handlers,
  fatigueRate,
  fieldOffer,
  fieldStaff,
  hasIntel,
  hire,
  hireCost as fieldHireCost,
  intelCost,
  knownRoutes,
  passOnOffer,
  post,
  postingFor,
  postingOnRoute,
  postingsOnRoute,
  recall,
  removeFromCrew,
  reserveCeiling,
  reserveCount,
  rollFieldOffer,
  roundSeconds,
  seedBench,
  slotsAvailable,
  setAutoWork,
  skillOf,
  stretchOf,
  suppliesType,
  takesCrew,
  trainableFor,
  throughBand,
  tickField,
  usableReserve,
} from "./systems/field.js";
export * from "./systems/challenge.js";
export {
  baseFormOf,
  built as dayCareBuilt,
  canDropOff,
  collect,
  collectionFee,
  dropOff,
  freeSlots,
  occupants,
  parentQuality,
  pedigree,
  tickDayCare,
} from "./systems/daycare.js";
export * from "./systems/economy.js";
export {
  assignToSeat,
  canAssign,
  canStaff,
  ensureSeats,
  eliteUnlocked,
  hireCost as eliteHireCost,
  isChampion,
  removeFromSeat,
  runGauntlet,
  seatParty,
  seatTitle,
  staffedSeats,
  staffSeat,
  tickElite,
} from "./systems/elite.js";
export {
  allFacilities,
  bondSpeed,
  canUpgrade,
  careerLength,
  rangerSlots,
  expandGymTrainers,
  gymTrainerSlotCost,
  hasSurvey,
  level as facilityLevel,
  recoverySpeed,
  tradeEfficiency,
  upgrade,
  upgradeCost,
} from "./systems/facilities.js";
export * from "./systems/growth.js";
export * from "./systems/league.js";
export * from "./systems/meta.js";
export * from "./systems/morale.js";
export * from "./systems/party.js";
export * from "./systems/promotion.js";
export * from "./systems/rivals.js";
export * from "./systems/stats.js";
export * from "./systems/title.js";
export * from "./systems/trade.js";
export * from "./systems/wave.js";

export { offerWeight, routeById, routePower, ROUTES, routesUpTo } from "../data/routes.js";
export { FACILITIES, facilityDef } from "../data/facilities.js";
export {
  catalog,
  encounterWeight,
  familyOf,
  grantableAtLevel,
  isGrantable,
  minLevelFor,
  type BaseStats,
  type Species,
} from "../data/catalog.js";
export { effectiveness, effectivenessAgainst, emptyTally } from "../data/typechart.js";
