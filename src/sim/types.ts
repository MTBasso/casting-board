/**
 * Domain types for the sim core.
 *
 * Everything in `src/sim` is pure, serializable TypeScript. It must not import
 * React, touch the DOM, read the clock, or call Math.random. State goes in,
 * state comes out. That constraint is what makes offline catch-up, save/load,
 * and headless balance runs possible.
 */

export const TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice",
  "fighting", "poison", "ground", "flying", "psychic", "bug",
  "rock", "ghost", "dragon", "dark", "steel", "fairy",
] as const;

export type TypeId = (typeof TYPES)[number];

/** Per-type counts or weights. Always dense — every type has an entry. */
export type TypeTally = Record<TypeId, number>;

// ---------------------------------------------------------------------------
// Creatures
// ---------------------------------------------------------------------------

/**
 * Where a creature currently sits in the league.
 *
 * - `party`   — on some trainer's team. The only place a creature ever fights.
 * - `reserve` — in the PC box. Inert storage; never needs sorting.
 * - `retired` — career spent. Breeds at the Day-Care.
 */
/**
 * `field` is a creature posted to a route as a Catcher's working partner. It is
 * a separate role from `reserve` so auto-fill cannot quietly pull someone off a
 * route to plug a gym — a posting is a commitment, not a suggestion.
 */
export type CreatureRole = "party" | "reserve" | "field" | "retired";

export interface Creature {
  id: string;
  /** Species slug from the catalog. */
  speciesId: string;
  /**
   * Null until a trainer takes this creature on.
   *
   * A wild catch is a species, not an individual — it shows up in the roster as
   * "Growlithe". It earns a name at the moment someone bonds with it, which is
   * what makes a nickname mean "this one is mine" rather than being noise on
   * every scouting result. The player may rename it afterwards.
   */
  nickname: string | null;
  types: readonly TypeId[];
  /**
   * Current effective power. Recomputed whenever the creature levels or
   * evolves — cached rather than derived at each read because the wave loop
   * touches it constantly.
   */
  power: number;
  /**
   * Per-individual roll applied to species power, so two Growlithe are not
   * identical. Stored rather than baked in so it survives evolution.
   */
  powerRoll: number;
  level: number;
  xp: number;

  role: CreatureRole;
  /** Trainer holding this creature's bond slot, if any. */
  trainerId: string | null;
  /** Gym this creature currently defends, if any. */
  gymId: string | null;

  /**
   * Protected from auto-fill.
   *
   * Parties top themselves up from the box so the player never sorts hundreds
   * of creatures — but a pinned creature is never swapped out for a stronger
   * one. Pinning is how the player says "this one matters", which is the whole
   * point of the game.
   */
  /**
   * Whether this creature is the player's.
   *
   * Junior Gym Trainers bring their own team — those creatures never enter the
   * PC, cannot be traded, benched, or parked at the Day-Care, and do not count
   * as owned. Stating it once here beats enforcing it in six places.
   */
  owned: boolean;

  pinned: boolean;
  /**
   * Set aside by the player.
   *
   * Removing a creature from a party has to *stick* — otherwise auto-fill puts
   * the same one straight back, and "I do not want this one used" becomes
   * impossible to express. Benched creatures sit in the box and are ignored by
   * auto-fill until the player says otherwise.
   */
  benched: boolean;

  /** 0..1. Buys reliability, not power — see `variance()`. */
  bond: number;
  /** 0..1. 1 means exhausted and unusable until rested. */
  fatigue: number;

  /** Lifetime battles this creature will ever fight. */
  careerTotal: number;
  /** Battles already spent. At >= careerTotal the creature retires. */
  careerSpent: number;

  wins: number;
  losses: number;

  /** Parent creature ids, oldest-first ancestry is walked via the roster. */
  parents: readonly [string, string] | null;
  /** Generation depth from the first wild-caught ancestor. */
  generation: number;
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export type Doctrine =
  | "stall"       // slower challenger throughput, less fatigue per wave
  | "sweep"       // faster throughput, more fatigue
  | "mentor"      // faster bonding
  | "drillmaster";// slower career burn

/**
 * What a trainer is employed as.
 *
 * Every defender in the league is a trainer with a party — gyms, the Elite
 * seats and the Champion all work the same way. Nothing stands in a slot
 * without a person attached to it.
 */
export type TrainerKind =
  | "leader"
  | "gym"
  | "elite"
  | "champion"
  /** Works a route with a field partner. Catches rather than defends. */
  | "catcher"
  /** Takes a party onto a route and brings it back stronger. */
  | "evolver"
  /** Offered for a gym but not yet hired. Draws no salary and defends nothing. */
  | "candidate";

export interface Trainer {
  id: string;
  name: string;
  affinity: TypeId;
  doctrine: Doctrine;
  kind: TrainerKind;
  /**
   * How many creatures this trainer fields. Leaders and the Elite run full
   * parties of six; junior Gym Trainers run smaller ones.
   */
  partyCap: number;
  /** Creature ids in this trainer's party. */
  party: string[];
  /** Permanently welded partner. Never reassignable, always in the party. */
  signatureId: string;
  /** Gym this trainer works at, if any. */
  gymId: string | null;
  /** Paid per sim-hour out of gate receipts. */
  salary: number;
  /** 0..1. Falls under underpayment or bad casting. At 0 they quit. */
  morale: number;
  /** Sim-seconds employed. Salary escalates with this. */
  tenure: number;

  // -- The morale staircase -------------------------------------------------

  /**
   * Ceiling on morale, 0..1. Each suspension lowers it, so the next slump
   * arrives sooner. This is what makes the staircase escalate rather than
   * repeat forever.
   */
  standing: number;
  /** Accumulated sim-seconds spent below the strain threshold. */
  strain: number;
  /** Suspensions served. At the cap, the next one is a departure. */
  suspensions: number;
  /** Sim-time this trainer returns to duty, or null if they are working. */
  suspendedUntil: number | null;
  /**
   * Sim-time before which this trainer refuses demotion. Set for a usurper
   * Champion during their protection window, and for arrogant prodigies.
   */
  demotionLockedUntil: number | null;
  /**
   * How this trainer came to work here. A usurper beat you for the job and is
   * managed differently: dearer, prouder, and quicker to lose heart.
   */
  origin: TrainerOrigin;
}

/** Where a trainer came from. Changes how they are managed, not what they do. */
export type TrainerOrigin = "hired" | "usurper" | "prodigy";

/**
 * Someone who left the league and means to come back for it.
 *
 * One rule covers every departure: the declined prodigy, the usurper Champion
 * who walked. They return as named challengers, stronger for the grudge, and
 * each defeat softens them until they finally accept a post.
 */
export interface Grudge {
  name: string;
  type: TypeId;
  /** Rises when they leave, falls each time you beat them. */
  level: number;
  /** Defeats suffered since the grudge began. */
  losses: number;
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

export type ThreatStatus = "stable" | "watch" | "critical";

export interface ThreatReport {
  /** Rolling distribution of incoming challenger types. Sums to ~1. */
  distribution: TypeTally;
  /** Waves observed so far. The report is unreliable below ~10. */
  samples: number;
  /** Derived each tick from distribution vs. the gym's roster. */
  status: ThreatStatus;
  /** 0..1 share of recent waves this gym lost. Drives `status`. */
  lossRate: number;
  /** Waves the junior trainers turned away before the Leader was reached. */
  absorbed: number;
}

export interface Gym {
  id: string;
  type: TypeId;
  name: string;
  /** The Gym Leader. Fought last, after the junior trainers. */
  leaderId: string | null;
  /**
   * Junior Gym Trainers, fought in order before the Leader.
   *
   * This is what the games actually have, and it does the job the old
   * "undercard" did: depth here is what keeps the Leader's party — the
   * creatures the player cares about — off the field.
   */
  trainerIds: string[];
  /** How many junior trainers this gym can employ. */
  trainerSlots: number;
  /** Sim-seconds until the next challenger wave arrives here. */
  waveCooldown: number;
  threat: ThreatReport;
}

// ---------------------------------------------------------------------------
// Scouting
// ---------------------------------------------------------------------------

/**
 * A place creatures come from.
 *
 * The supply distribution is the mirror image of a Threat Report: one readout
 * for what is attacking you, one for what you can obtain. You cannot acquire a
 * type no route supplies, which is what makes type scarcity a structural fact
 * rather than a rule.
 */
export interface Route {
  id: string;
  name: string;
  /** Weights over types. Need not be normalized. */
  supply: TypeTally;
  /** Peak renown needed before this route can appear in an offer. */
  unlockAt: number;
  /** Cost to scout here. */
  cost: number;
  /** How many creatures come back. */
  yieldMin: number;
  yieldMax: number;
  /** Level band of creatures found here. */
  levelMin: number;
  levelMax: number;
}

// ---------------------------------------------------------------------------
// League state
// ---------------------------------------------------------------------------

export type FacilityId =
  | "scouting_office"
  | "training_grounds"
  | "medical_center"
  | "trade_desk"
  | "day_care";

/**
 * One Elite Four seat, or the Champion's.
 *
 * These are people, not creatures — trainers stronger than any Gym Leader, each
 * with their own team. The Champion sits above all four.
 */
export interface EliteSeat {
  /** 0–3 for the Elite Four, 4 for the Champion. */
  rank: number;
  trainerId: string | null;
}

/**
 * A creature left at the Day-Care.
 *
 * It trains while it is here, gaining experience with the passage of time rather
 * than from battle — and the couple charge for their trouble when you collect
 * it, scaled by how much it grew.
 */
export interface DayCareSlot {
  creatureId: string;
  /** Level the creature had when it was dropped off. */
  levelAtDropoff: number;
  /** Sim-time it was left. */
  since: number;
}

/**
 * A named challenger who announces themselves before arriving.
 *
 * The only deadline in the game. They name the gym and the type, so the warning
 * is actionable — and beating one puts them on your payroll.
 */
export interface Rival {
  id: string;
  name: string;
  type: TypeId;
  gymId: string;
  announcedAt: number;
  arrivesAt: number;
  /** Badges they have already earned. Grows while they are away. */
  badges: number;
  resolved: boolean;
  /**
   * Whether the *league* turned them away.
   *
   * Named for the gym, not the rival, because every other outcome flag in the
   * codebase is written from the league's side — and this field was previously
   * called `won` while meaning the opposite, which is how a beaten rival ended
   * up being hired on the branch that reads like a defeat.
   */
  held: boolean;
}

/** One creature on a challenger's team. Transient — never enters the roster. */
export interface ChallengerMon {
  speciesId: string;
  types: readonly TypeId[];
  level: number;
  power: number;
  /** Health carried between bouts. 0 means "not yet computed" or fainted. */
  hp: number;
  fainted: boolean;
}

/**
 * One blow in a battle.
 *
 * Recorded so the feed can show a fight *happening* — a challenger's team being
 * worn down blow by blow is most of the drama the game has, and announcing only
 * the result throws it away.
 */
export interface BattleEvent {
  kind: "hit" | "faint" | "revive";
  attacker: string;
  attackerSpecies: string;
  defender: string;
  defenderSpecies: string;
  damage: number;
  effectiveness: number;
  defenderHp: number;
  defenderMaxHp: number;
  /** True when the blow was struck by one of the league's own creatures. */
  ours: boolean;
  /** Slot the attacker occupies in its own party. */
  attackerIndex: number;
  /** Slot the defender occupies in its own party. */
  defenderIndex: number;
}

/** One creature as it stood when a battle began, for the battle view. */
export interface BattleFighter {
  speciesId: string;
  name: string;
  level: number;
  maxHp: number;
}

/**
 * A battle the player can watch.
 *
 * Kept only for the most recent challenge at each gym; the Leader's stand gets
 * flagged so the interface can give it the weight it deserves.
 */
export interface BattleRecord {
  gymId: string;
  /**
   * The challenger's team as it stood at the start.
   *
   * Recorded whole rather than inferred from the blows, because the battle view
   * shows both benches from the first frame — you should be able to see what is
   * still coming, not just what has already been hit.
   */
  challenger: BattleFighter[];
  /** Trainer name currently defending, per stage, and who they fielded. */
  stages: {
    trainer: string;
    isLeader: boolean;
    party: BattleFighter[];
    events: BattleEvent[];
  }[];
  heldAt: number;
  tookBadge: boolean;
  at: number;
}

/**
 * Someone attempting a gym.
 *
 * Their badge count decides everything: which gym they attack, how big their
 * party is, how strong it is, and how many Revives they carry.
 */
export interface Challenger {
  badges: number;
  party: ChallengerMon[];
  revives: number;
}

/**
 * A Catcher working a route, with the creature that works it alongside them.
 *
 * The field partner is the concept draft's whole anti-duplicate thesis made
 * literal: your fortieth Zubat is not inventory, it is somebody's working
 * partner. Route work costs fatigue and never career, so a posting is honest
 * work that never uses anyone up.
 */
export interface Posting {
  routeId: string;
  trainerId: string;
  /**
   * What this posting is for. Catchers bring creatures back; Evolvers bring the
   * ones they took stronger. Both are a trainer standing on a route with their
   * party, which is why they share a shape.
   */
  role: FieldRole;
  /** Sim-seconds banked toward the next catch or training round. */
  progress: number;
  /** Creatures brought in since this posting began. Catchers only. */
  caught: number;
  /** Pokéyen earned since this posting began. Evolvers only. */
  earned: number;
  /** Times the party has come back beaten. Evolvers only. */
  beaten: number;
  /** True while the party is sitting the shift out to recover. */
  resting: boolean;
}

export type FieldRole = "catcher" | "evolver";

export type Tier = "regional" | "national" | "world";

/**
 * An inducted creature, carried across promotions.
 *
 * Mentors are the *whole* prestige layer — there is no prestige currency and no
 * prestige shop. Each one permanently speeds bonding for its type, so induction
 * commits the next league to a direction rather than just making numbers bigger.
 */
export interface Mentor {
  speciesId: string;
  name: string;
  type: TypeId;
  wins: number;
  losses: number;
  /** The tier they were inducted from. */
  tier: Tier;
}

export interface RngState {
  seed: number;
}

export interface Meta {
  /**
   * Drifting challenger meta: the type weights new waves are drawn from.
   * This is the live-service engine. It walks, slowly, forever.
   */
  weights: TypeTally;
  /** Sim-seconds until the next drift step. */
  nextDriftIn: number;
  /** How many drift steps have happened. Seasons, effectively. */
  season: number;
}

export interface LeagueState {
  /** Save format version. Bump when the shape changes; migrate on load. */
  version: number;
  /** Sim-seconds elapsed. The only clock the sim knows about. */
  time: number;
  rng: RngState;

  tier: Tier;
  money: number;
  /**
   * Current league standing. Rises on wins, falls on losses — volatile by
   * design, because it is a rating rather than a currency.
   */
  renown: number;
  /**
   * High-water mark of renown. Only ever ratchets up, and every unlock gate
   * reads this rather than live renown, so progress cannot be taken away by a
   * bad season.
   */
  peakRenown: number;

  creatures: Record<string, Creature>;
  trainers: Record<string, Trainer>;
  gyms: Record<string, Gym>;
  /** Stable ordering for UI; gym ids in board order. */
  gymOrder: string[];

  meta: Meta;

  /**
   * Routes the league has bought a survey of.
   *
   * Intel used to be a side effect of scouting; now it is a purchase made
   * *before* committing a trainer and a partner to a route — which makes it a
   * better buy than it ever was, because there is now something at stake in the
   * commitment.
   */
  routeIntel: Record<string, boolean>;

  /**
   * Candidate Leaders for a gym that has just opened. Choosing one is free.
   * Trainer ids; the unchosen are discarded.
   */
  leaderOffer: { gymId: string; trainerIds: string[] } | null;

  /**
   * True when the player has set the gym offer aside. The offer itself stays
   * pending — a decision they cannot afford yet should wait, not vanish.
   */
  gymOfferMinimized: boolean;

  /**
   * Types on offer for the next gym, or null when nothing is pending.
   * Lives in state rather than the UI so the choice survives a reload.
   */
  gymOffer: TypeId[] | null;

  /** Inducted creatures, kept across every promotion. */
  hall: Mentor[];

  /** Facility levels. Absent or 0 means unbuilt. Resets on promotion. */
  facilities: Partial<Record<FacilityId, number>>;

  /**
   * The Elite Four and the Champion — the league's last line of defence.
   *
   * Challengers who clear every gym come here and face each seat in order.
   * Unlocked once all gyms stand.
   */
  elite: EliteSeat[];
  /** Sim-seconds until the next challenger reaches the gauntlet. */
  gauntletCooldown: number;
  /** Sim-seconds until parties next top themselves up from the box. */
  autoFillIn: number;

  /** The most recent watchable battle, per gym. */
  battles: Record<string, BattleRecord>;

  /** Announced and resolved rivals, newest last. Capped. */
  rivals: Rival[];
  /** Sim-seconds until the next rival announces themselves. */
  rivalCooldown: number;
  /** How many times a Leader has been retrained. Prices the next one. */
  doctrineChanges: number;
  /** Rivals who beat you, and the badge count they will return with. */
  retiredRivals: { name: string; badges: number }[];
  /** How many times the league has been taken by a challenger. */
  leagueTaken: number;
  /**
   * Trainer id of the Champion who took the title from you, if one holds it.
   * They are staff now, which is the entire point of forced recruitment.
   */
  usurperId: string | null;
  /**
   * Set when the title falls. Promotion becomes available without the readiness
   * check — but on the loss path's terms, carrying the usurper instead of your
   * own legends. It never forces the climb; staying and winning the title back
   * is always a legal move.
   */
  titleLost: boolean;
  /** People who left and intend to come back for the league. */
  grudges: Grudge[];
  /** Field staff currently working routes. */
  postings: Posting[];
  /**
   * Types on offer when hiring field staff, per role.
   *
   * Drawn rather than chosen. Picking freely made a Catcher a component you
   * bought; being *offered* three types means the staff you end up with is
   * partly the staff that turned up, exactly as the Leader offer works.
   */
  fieldOffer: Record<FieldRole, TypeId[]>;
  /**
   * Wall-clock ms at the last save. The 15-day rule needs real elapsed time,
   * which credited sim time cannot answer — offline is capped at twelve hours.
   */
  lastSeenAt: number;

  /** Creatures parked in the Day-Care, training or breeding. */
  dayCare: DayCareSlot[];
  /** Sim-seconds two compatible occupants have spent together. */
  eggProgress: number;

  /** Rolling log of notable events, newest first. Capped. */
  log: LogEntry[];

  /** Counters for id generation. Kept in state so ids are deterministic. */
  nextIds: Record<string, number>;
}

export type LogKind =
  | "wave"
  | "evolve"
  | "scout"
  | "trade"
  | "breed"
  | "gauntlet"
  | "upset"
  | "rival"
  | "retire"
  | "quit"
  | "hire"
  | "staff"
  | "catch"
  | "promote"
  | "drift";

export interface LogEntry {
  at: number;
  kind: LogKind;
  text: string;
}

// ---------------------------------------------------------------------------
// Tick reporting
// ---------------------------------------------------------------------------

/** What one tick changed, for the UI to react to without diffing state. */
export interface TickReport {
  wavesResolved: number;
  wavesWon: number;
  earned: number;
  paid: number;
  retirements: string[];
  resignations: string[];
  /** Creature ids returned by expeditions that landed this tick. */
  caught: string[];
  /** Human-readable evolution events, for the feed. */
  evolutions: string[];
  /** Names of creatures hatched at the Day-Care. */
  hatched: string[];
  /** Results that contradicted the matchup — what bond actually buys down. */
  upsets: { name: string; bond: number; won: boolean }[];
  /** Rival challenges resolved this tick. */
  rivals: { name: string; held: boolean; gymId: string }[];
  /** Species a challenger revived mid-battle, for the feed. */
  revives: string[];
  /** Badges lost to challengers who beat a Leader. */
  badgesLost: number;
  /** Rivals who lost and joined the league. */
  recruited: string[];
  /** Gauntlet runs resolved this tick. */
  gauntlets: { cleared: number; tookLeague: boolean; receipts: number }[];
  /** Trainers suspended this tick, and how many they have now served. */
  suspended: { name: string; count: number }[];
  /** Trainers who came back from suspension this tick. */
  reinstated: string[];
  /** The name of a challenger who took the title this tick, if any. */
  usurped: string | null;
  /** People who walked out and now hold a grudge. */
  departures: string[];
  /** Spillover released because the box was overrun. */
  released: string[];
  /** Evolvers whose party came back beaten from ground over their heads. */
  beaten: string[];
}
