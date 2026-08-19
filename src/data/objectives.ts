import type { FacilityId } from "../sim/types.js";

/**
 * What the league is working toward.
 *
 * An authored spine, in order, plus derived repeatables for the long tail. The
 * spine exists because a procedural goal can never introduce systems in a
 * deliberate sequence — *hire a crew, work a route, cast what they bring back*
 * — and that sequence is the onboarding this game has never had.
 *
 * They **suggest, never gate**. Renown is already the progression spine, and two
 * gating systems on the same content contradict each other the first time either
 * is tuned. An objective that pays rather than permits still teaches the order.
 *
 * Rewards are **crew slots and facility levels**: the two things every screen is
 * waiting on. Money is the one thing the mid-game has too much of, so paying in
 * it would make a milestone feel like nothing.
 */

export type Reward =
  | { kind: "crew" }
  | { kind: "facility"; id: FacilityId }
  | { kind: "kit"; balls: number; potions: number; revives: number; lures: number }
  | { kind: "money"; amount: number };

export interface ObjectiveDef {
  id: string;
  title: string;
  /** What doing it teaches, in the player's words. */
  detail: string;
  goal: number;
  /** What is being counted. Resolved in `systems/objectives.ts`. */
  measure: MeasureId;
  reward: Reward;
  /** Only offered once these are claimed. */
  after?: readonly string[];
}

export type MeasureId =
  | "gyms"
  | "crews"
  | "trips"
  | "routes"
  | "caught"
  | "bonded"
  | "legends"
  | "gymTrainers"
  | "facilityLevels"
  | "eliteSeats"
  | "challengesHeld"
  | "promotions";

/**
 * The spine, in the order a new Director meets the game.
 *
 * Each one is the smallest complete use of a system, and its reward is the thing
 * that makes the *next* one possible.
 */
export const SPINE: readonly ObjectiveDef[] = [
  {
    id: "first-gym",
    title: "Open your first gym",
    detail: "Choose its type and the Leader who will hold it. Neither can be undone.",
    goal: 1,
    measure: "gyms",
    reward: { kind: "kit", balls: 15, potions: 6, revives: 2, lures: 1 },
  },
  {
    id: "first-crew",
    title: "Put a crew on the payroll",
    detail:
      "Two people who work together. The Ranger brings creatures back; the Handler raises the ones they take.",
    goal: 1,
    measure: "crews",
    reward: { kind: "money", amount: 2500 },
    after: ["first-gym"],
  },
  {
    id: "first-trip",
    title: "Send them out",
    detail:
      "Outfit a crew and work a route. What ends a trip is the kit you paid for, not a timer.",
    goal: 1,
    measure: "trips",
    reward: { kind: "kit", balls: 25, potions: 10, revives: 3, lures: 3 },
    after: ["first-crew"],
  },
  {
    id: "staff-a-gym",
    title: "Hire two Gym Trainers",
    detail:
      "Juniors stand between a challenger and your Leader. They field lesser creatures, and they buy your Leader time.",
    goal: 2,
    measure: "gymTrainers",
    reward: { kind: "facility", id: "scouting_office" },
    after: ["first-trip"],
  },
  {
    id: "push-on",
    title: "Reach somewhere new",
    detail:
      "Walk a route until the league knows it, then send a crew past it. The map grows because you went there.",
    goal: 4,
    measure: "routes",
    reward: { kind: "crew" },
    after: ["first-trip"],
  },
  {
    id: "a-bonded-gym",
    title: "Build a bonded core",
    detail:
      "Two creatures in one gym who have served long enough to be reliable. Bond buys certainty, not power.",
    goal: 1,
    measure: "bonded",
    reward: { kind: "facility", id: "training_grounds" },
    after: ["staff-a-gym"],
  },
  {
    id: "four-gyms",
    title: "Hold four gyms",
    detail: "A board wide enough that the types coming at you start to matter.",
    goal: 4,
    measure: "gyms",
    reward: { kind: "crew" },
    after: ["a-bonded-gym"],
  },
  {
    id: "a-full-board",
    title: "Hold all eight",
    detail: "Every badge in the region, defended by people you chose.",
    goal: 8,
    measure: "gyms",
    reward: { kind: "facility", id: "medical_center" },
    after: ["four-gyms"],
  },
  {
    id: "staff-the-elite",
    title: "Seat the Elite Four",
    detail:
      "And the Champion above them. An empty seat is a free pass on the way to taking your league.",
    goal: 5,
    measure: "eliteSeats",
    reward: { kind: "crew" },
    after: ["a-full-board"],
  },
  {
    id: "first-legend",
    title: "See a career out",
    detail:
      "A creature that serves most of a life enters the Hall. That is what retirement is for.",
    goal: 1,
    measure: "legends",
    reward: { kind: "facility", id: "day_care" },
    after: ["a-bonded-gym"],
  },
  {
    id: "promote",
    title: "Climb a tier",
    detail:
      "Induct from the Hall and start again, harder. The Mentors you choose are all that survives.",
    goal: 1,
    measure: "promotions",
    reward: { kind: "crew" },
    after: ["staff-the-elite", "first-legend"],
  },
];

/**
 * The long tail.
 *
 * Derived so the list never empties, and deliberately dull next to the spine —
 * these are something to be *making progress on*, not something to read.
 */
export const REPEATABLE: readonly {
  id: string;
  title: (n: number) => string;
  detail: string;
  measure: MeasureId;
  /** Goal for tier n, counting from 1. */
  goal: (n: number) => number;
  reward: (n: number) => Reward;
}[] = [
  {
    id: "held",
    title: (n) => `Turn away ${n.toLocaleString()} challengers`,
    detail: "The board holding is the whole job.",
    measure: "challengesHeld",
    goal: (n) => 250 * 2 ** (n - 1),
    reward: (n) => ({ kind: "kit", balls: 20 * n, potions: 8 * n, revives: 2 * n, lures: 2 * n }),
  },
  {
    id: "collected",
    title: (n) => `Bring home ${n.toLocaleString()} creatures`,
    detail: "Every one of them arrived because somebody went and got it.",
    measure: "caught",
    goal: (n) => 100 * 2 ** (n - 1),
    reward: (n) => ({ kind: "money", amount: 5000 * n }),
  },
  {
    id: "mapped",
    title: (n) => `Reach ${n} places`,
    detail: "The map grows because crews walked it.",
    measure: "routes",
    goal: (n) => Math.min(16, 6 + n * 2),
    reward: () => ({ kind: "crew" }),
  },
];
