/**
 * Every tunable number in the game, in one file.
 *
 * These are starting values, not balanced ones. Use `npm run sim -- --hours 200`
 * to see what they do to the progression curve before changing them by feel.
 */

/** One sim tick is this many sim-seconds. The sim never sees real time. */
export const TICK_SECONDS = 1;

/** Offline accrual is capped here. 12 hours, per the design doc. */
/**
 * Sim-seconds the league lives per real second.
 *
 * Every constant in this file is written in sim-seconds — a career is ~160 of
 * those hours, a rival announces twenty minutes out — and at 1:1 that made the
 * game unplayably slow to actually sit with. This is the one number that decides
 * how fast the clock runs, and it applies everywhere: the live loop, offline
 * catch-up, the balance runner. Nothing about the *relationships* between the
 * constants changes when it moves, which is why it is a single knob rather than
 * a rebalance.
 */
export const TIME_SCALE = 25;

/**
 * How long an absence pays for, in **real** hours.
 *
 * Expressed in real time and scaled by the clock, because the two are different
 * questions and conflating them broke this once already: the cap was twelve
 * hours of *league* time, which at 40× was reached after eighteen real minutes.
 * A night's sleep and stepping out for coffee credited exactly the same.
 *
 * Eight rather than twelve so that returning once a day still leaves something
 * on the table, and there is a reason to look before bed.
 */
/**
 * How well the league runs itself while nobody is watching.
 *
 * Offline used to be a flat 0.85 of par — a penalty the player could neither
 * see nor do anything about. It is now a floor you raise: the Operations Office
 * buys the bulk of it, and how content the staff are decides the last of it.
 *
 * Never reaches 1. Playing has to beat not playing, or the optimal move is to
 * close the app.
 */
export const AWAY = {
  /** With no Operations Office and a miserable staff. */
  base: 0.55,
  /** Four levels take it to 0.85. */
  perLevel: 0.075,
  /** What a fully content staff adds on top. */
  moraleBonus: 0.05,
  max: 0.9,
} as const;

export const OFFLINE_CAP_REAL_HOURS = 8;

export const OFFLINE_CAP_SECONDS = OFFLINE_CAP_REAL_HOURS * 60 * 60 * TIME_SCALE;

/**
 * Above this much elapsed time, the loader resolves offline analytically
 * instead of stepping ticks. Keeps app-open instant.
 *
 * Also scaled, and for the same reason: this is "two real minutes of stepping",
 * which is a statement about how long a freeze the player will tolerate — not
 * about league time. Below it the real sim runs and the result is exact.
 */
export const OFFLINE_ANALYTIC_THRESHOLD_SECONDS = 2 * 60 * TIME_SCALE;

/**
 * Challenges.
 *
 * A gym challenge is an event, not weather. Under party-vs-party a single one
 * runs to fifteen or twenty exchanges, so it has to be rare enough that a
 * creature's career is measured in weeks rather than an afternoon.
 */
export const CHALLENGE = {
  /**
   * Share of challengers who, having taken a badge, go on to try the next gym.
   *
   * This is the whole ladder in one number. The population holding exactly `k`
   * badges falls as `passRate ** k`, so the first gym sees ~6.8x the traffic of
   * the eighth — derived rather than asserted, which matters because the threat
   * report already reasons about who is arriving and why.
   */
  badgePassRate: 0.765,
  /**
   * How often somebody turns up over-qualified — more badges than the gym needs.
   *
   * Without this, what walks into each gym is fully determined by its rank, and
   * a screen that exists to say *what is coming and can you handle it* has
   * nothing left to report. It is also where the occasional scare at an early
   * gym comes from.
   */
  overQualified: 0.15,
  /**
   * Gate receipts and renown multiplier per rank.
   *
   * Deliberately steeper than the interval growth (~1.31x), so a late gym earns
   * roughly 1.8x per second what the first one does. Equal growth would make
   * the ladder cosmetic; steeper still would make early gyms irrelevant.
   */
  gatePerRank: 1.45,
  /**
   * Challenger level multiplier while the opening objectives are unclaimed.
   *
   * Invisible by construction: nothing is disallowed, the arrivals are just
   * softer. See `openingMercy`.
   */
  openingMercy: 0.72,
  /** The objective whose claim ends it — the one that explains junior trainers. */
  mercyUntil: "staff-a-gym",
  /** Sim-seconds between challengers at a single gym. */
  intervalSeconds: 6 * 60,
  maxParty: 6,
  baseLevel: 8,
  levelPerBadge: 5,
  levelPerThousandRenown: 4,
  /**
   * Party size a challenger carries before depth starts costing them level.
   *
   * Beyond it every extra creature shaves `levelPerExtraMon` off the whole
   * party, so a full team of six is a real threat by *weight* rather than by
   * quality — which is what lets the early gyms field two and still be a fair
   * fight.
   */
  freeDepth: 2,
  levelPerExtraMon: 0.09,
  /**
   * How lopsided a bout has to look before its result counts as an upset.
   *
   * Type advantage times bulk advantage; above this the favourite is clear, and
   * a loss is worth telling the player about. Set loose enough that ordinary
   * close fights never generate noise.
   */
  upsetMargin: 1.6,
  /** However deep they come, never greener than this fraction of their level. */
  minDepthScale: 0.6,
  /** One Revive per this many badges. */
  badgesPerRevive: 3,
  /** Chance a held Revive is actually spent on a faint. */
  reviveChance: 0.7,
  /**
   * Skew on the badge roll. Above 1 biases toward rookies, so gym 1 stays busy
   * and gym 8 sees only the people who earned their way there.
   */
  badgeSkew: 1.8,
  /**
   * Ceiling on challenger level, as a multiple of what the league itself
   * fields.
   *
   * Without this, renown drives challengers to level 88 while the league's own
   * creatures sit in the twenties — because renown climbs on its own and
   * creature levels do not. The Elite tier was losing 89% of its gauntlets to
   * opponents it could not have beaten with any casting decision, which makes
   * the whole defence fantasy a formality.
   *
   * Renown should govern *how many* challengers arrive and what is at stake,
   * not make them arbitrarily out of reach. The real fix is a system that levels
   * the league's own creatures at a comparable rate — that is what Battlers are
   * for — and this ceiling is what keeps the game honest until they land.
   */
  maxLevelRatio: 2.1,
  /** Never clamp below this, or an unstaffed league would face nothing at all. */
  minChallengerLevel: 10,
  reportWindow: 20,
  watchLossRate: 0.2,
  criticalLossRate: 0.4,
} as const;

/** What a resolved challenge pays. */
export const CHALLENGE_GATE = {
  /** For turning up at all — a challenge fills the stands either way. */
  base: 260,
  /** Plus this for every trainer the challenger fought through. */
  perTrainerCleared: 180,
} as const;

export const WAVE = {
  /** Sim-seconds between challenger waves at a single gym, before doctrine. */
  intervalSeconds: 8,
  /**
   * How much faster challengers arrive as the league becomes famous.
   *
   * Income is `waves x receipts`. Every other multiplier scales *receipts*, and
   * receipts are held in check by challenger power rising with renown — so they
   * equilibrate and income goes flat. Arrival volume does not fight that
   * equilibrium, which makes it the only axis that can actually bend the curve.
   */
  arrivalPerRenown: 0.00012,
  /** Floor on the interval multiplier, so attendance cannot run away entirely. */
  minArrivalMultiplier: 0.3,
  /** Gate receipts per wave the gym survives, before renown scaling. */
  baseReceipts: 12,
  /** Renown multiplier applied to receipts: 1 + renown * this. */
  receiptsPerRenown: 0.0004,
  /** Challenger power scales with league renown to keep pressure on. */
  challengerBasePower: 40,
  challengerPowerPerRenown: 0.02,
} as const;

export const FATIGUE = {
  /** Added per wave fought by a bonded creature. */
  perWaveBonded: 0.02,
  /** Undercard creatures tire far more slowly — they fight shallow rounds. */
  perWaveUndercard: 0.015,
  /** Added per one-on-one exchange in a party battle. */
  perExchange: 0.05,
  /** Extra on top when a creature actually faints. Losing costs more. */
  faintPenalty: 0.18,
  /** Recovered per sim-second while not deployed. Full rest ≈ 20 minutes. */
  recoveryPerSecond: 1 / (20 * 60),
  /** At or above this, a creature is pulled from rotation automatically. */
  exhausted: 0.95,
} as const;

export const CAREER = {
  /**
   * Lifetime battles for a freshly caught creature, before variance.
   *
   * Derived from the balance runner, not chosen by feel. The target is that a
   * bonded creature lasts one to two weeks of daily play — roughly 150 sim-hours,
   * since ~12 sim-hours accrue per real day (a short session plus the 12h
   * offline cap). At 250 the average career was under six sim-hours, which is
   * far too short for bond to mean anything.
   *
   * The number is large because waves are frequent; the Card shows a career bar
   * and a condition label rather than the raw figure.
   *
   * Re-derived twice against real leagues. At 6,500 a creature in daily gym
   * duty spent 5.4% of its career in forty hours — a career past seven hundred,
   * which was neither a constraint nor an arc, and retirement, breeding and
   * pedigree never happened at all.
   *
   * At 1,400 the *juniors* churned properly and it looked fixed, but the
   * creatures the player actually owns had used only **33.7% after a hundred
   * and forty hours** — a career near four hundred, because a Leader's party is
   * shielded by the undercard and fights a fraction of what a junior does. The
   * Hall stayed empty and induction, the choice this game is built toward, was
   * unreachable in any real play window.
   *
   * 520 puts an owned creature's career at roughly the stated target, measured
   * on the creatures it is actually about rather than on the average.
   */
  base: 520,
  variance: 130,
  /** Career spent per wave fought in the bonded front line. */
  costBonded: 1,
  /** Career spent per exchange in a party battle. */
  costPerExchange: 1,
  /** Extra when the creature faints — leading badly spends a life. */
  faintPenalty: 3,
  /** Undercard rounds are cheaper, but they still count. */
  costUndercard: 0.25,
  /** Drillmaster doctrine multiplies career cost by this. */
  drillmasterMultiplier: 0.75,
} as const;

export const BOND = {
  /**
   * Bond gained per bout won alongside a trainer.
   *
   * Tripled once duty was actually shared. At 0.004 a creature needed 125 wins
   * to reach the promotion bar — fine when position one fought every bout and
   * racked them up alone, hopeless once the party started taking turns and each
   * slot saw a quarter of the traffic. Measured on a real league, second-string
   * creatures sat at 0.05 bond after forty hours and no gym could ever qualify.
   *
   * Bond has to arrive within a creature's career, or the arc the whole design
   * is about never completes.
   *
   * Then halved again, once losses started counting and retiring veterans began
   * handing bond to their successors: three multipliers stacked put every gym in
   * the league at a flat 1.00 after forty hours, which is not an arc, it is a
   * formality. At 0.006 a league still reaches the promotion bar inside forty
   * hours and roughly half its fighting creatures are still short of it.
   */
  perWave: 0.006,
  /**
   * What a *lost* bout is worth, against a won one.
   *
   * Bond used to be awarded only on a win, which quietly made it a record of
   * victories rather than of service — and a weaker party member loses most of
   * its bouts, so it could serve for twenty hours and end at nothing. Measured:
   * a gym's second creature finished a run with 9 wins, 37 losses and no bond
   * at all, and no gym with an uneven party could ever meet the promotion bar.
   *
   * A creature that stood up and got knocked down was still there. It learns
   * less than one that won, and it does learn.
   */
  perLoss: 0.45,
  /**
   * Bond a creature must have reached before it leaves anything to a successor.
   *
   * Only a genuine veteran hands over. A fraction from every washout would just
   * be a flat discount on bonding.
   */
  handoverFloor: 0.75,
  /** Share of a veteran's bond that its replacement starts with. */
  handoverShare: 0.4,
  /** Mentor doctrine multiplier on bond gain. */
  mentorMultiplier: 1.6,
  /**
   * Outcome variance at zero bond vs. full bond. Bond buys reliability:
   * a fully bonded creature performs at its stated numbers, an unbonded one
   * swings wildly in both directions.
   */
  varianceAtZero: 0.55,
  varianceAtFull: 0.06,
} as const;

/**
 * Renown movement per wave.
 *
 * These have to stay net-positive at a sustainable win rate or the league
 * spirals to zero and never unlocks anything. Pricing an absorbed wave far
 * below a loss also made a deep bench actively harmful to renown — the exact
 * inversion the undercard is supposed to avoid.
 *
 */
export const RENOWN = {
  perWin: 1,
  /**
   * An absorbed wave is a challenge the league *won* — the bench turned it away.
   * Pricing it far below a front-line win made a deep bench drag renown down,
   * which is the opposite of what the undercard is for. The difference between
   * the two shows up in gate receipts instead, where it belongs.
   */
  perAbsorbed: 0.8,
  /**
   * Deliberately lighter than a win. Challenger power scales with renown, so
   * the win rate falls as the league climbs and that negative feedback is what
   * sets the ceiling.
   *
   * Two knobs, two jobs, and they are easy to confuse: this ratio fixes the
   * *equilibrium win rate* (roughly perLoss / (perLoss + average gain), so ~61%
   * here), while `WAVE.challengerPowerPerRenown` fixes how high renown must
   * climb before the league is pushed back to it.
   */
  perLoss: 1.4,
  /**
   * How much worse a loss is at a badly-matched gym.
   *
   * Applied to the gym's threat pressure, so a Fire gym drowning in Water pays
   * roughly double for every loss. This is what gives the drifting meta teeth —
   * before it, a red Threat Report was something the player could simply ignore.
   */
  mismatchExponent: 2,
  /** Gained when a gym turns a challenger away. */
  perChallengeHeld: 9,
  /** Lost when a challenger beats the Leader and takes the badge. */
  perBadgeLost: 26,
  /**
   * Standing fades. Proportional decay, expressed as the fraction of current
   * renown lost per sim-second.
   *
   * This is now what sets the ceiling. It used to be challenger level scaling —
   * renown made challengers stronger until the win rate fell back to
   * equilibrium — but that put challengers at level 88 against a league fielding
   * level 25, which no casting decision could answer. With levels capped to the
   * league's own band, renown had no brake at all and ran to 88,000.
   *
   * A decay term is the better shape anyway, and the honest one: a league's
   * standing is not a score it banks, it is a reputation it has to keep earning.
   * Equilibrium is now inflow times this time constant, so a league that stops
   * holding challenges slides back on its own.
   *
   * Re-fitted after trainers stopped being handed fully evolved creatures: with
   * honest, level-appropriate parties the early league is far weaker, and a 4h
   * half-life ate the inflow faster than a five-gym board could produce it. The
   * league stalled at 1,175 renown and never opened the Elite tier at all.
   */
  decayHalfLifeSeconds: 16 * 3600,
} as const;

export const LEVELS = {
  max: 60,
  /**
   * Power gained per level. This is one of the few genuinely compounding forces
   * the player has before facilities exist: a level 40 creature is roughly 1.6x
   * the same creature at level 1.
   */
  powerPerLevel: 0.015,
  /**
   * XP awarded for fighting a bout in the front line.
   *
   * Was 1, against an `xpBase` of 12 — a creature needed a dozen bouts to reach
   * level 2 and hundreds to matter, so gym duty read as teaching nothing at all.
   * Defending the board is the game's central activity and it has to be one of
   * the ways a creature grows, or every level in the league comes from a route.
   */
  xpPerBattle: 6,
  /** Undercard rounds teach less than a real bout. */
  xpPerUndercardBattle: 0.35,
  /** XP to reach the next level, from the current one. */
  xpBase: 12,
  xpPerLevel: 6,
} as const;

export const PARTY = {
  /** Six. It has always been six. */
  max: 6,
  /**
   * How much better a box creature must be before auto-fill swaps an unpinned
   * party member out. Well above 1 so parties settle rather than churn.
   */
  upgradeThreshold: 1.25,
  /**
   * Bond above which a creature is never swapped out, pinned or not.
   *
   * Without this, auto-fill quietly ate the game's whole point: it kept
   * replacing party members with marginally stronger ones from the box, and
   * every replacement reset that slot's bond to zero. Parties never matured,
   * and the league could not meet the bond requirement for promotion at all.
   *
   * A creature that has served earns its place. Bond is its own protection.
   *
   * Lowered from 0.35 once the trap was measured: the threshold sat *above*
   * where most creatures ever reached, so the churn it was meant to stop simply
   * happened below it. Fighting creatures averaged 0.33 bond with only 28 of 106
   * past the promotion bar, and every gym deeper than two was blocked. The
   * protection has to begin where bonding begins, not where it ends.
   */
  bondProtection: 0.12,
  /** Sim-seconds between auto-fill passes. */
  refreshSeconds: 30,
} as const;

/*
 * Wildcards are gone.
 *
 * They existed because the Threat Report was unanswerable across Gen 1 alone —
 * eleven of seventeen gym types had no roster answer to their worst matchup. Two
 * off-type slots per Leader were the escape hatch.
 *
 * Gens 2 and 3 took that down to three of eighteen, and the type rule is a
 * better game than the escape hatch: a gym is its type, and answering a hostile
 * meta means casting *within* it or building a different gym. Every trainer in
 * the league is now strictly type-bound, juniors included.
 */

/**
 * Crews, expeditions, and the kit they go out with.
 *
 * The Field used to be two payrolls, two lists and a progress bar. A crew is one
 * hire; an expedition is one decision, priced up front; and what ends a trip is
 * something the player chose rather than a timer.
 */
export const FIELD = {
  /** Crews on offer at once. Take one, or pass and see more. */
  offerSize: 3,
  /**
   * How often a middle slot draws from types the league already fields.
   *
   * The first slot is guaranteed relevant and the last is deliberately wild;
   * this is the lean applied to everything between them.
   */
  offerRelevance: 0.7,
  /**
   * Wild-draw weight at or below which a find is worth waking someone for.
   *
   * The catalog scores staples at 1.0 and 0.55, second-stage forms at 0.35 and
   * 0.12, and final third-stage forms at 0.04. This threshold takes the last
   * two — the things a crew should not quietly decide on your behalf.
   */
  rareWeight: 0.12,
  /** Crews employable before the Scouting Office is upgraded. */
  baseSlots: 2,
  /** Further crews per level of the Scouting Office. */
  slotsPerOfficeLevel: 1,

  hireCostBase: 1600,
  hireCostGrowth: 1.45,
  /** Each of the two draws a wage. */
  salaryFactor: 0.5,

  /** Creatures a Handler can take out to train. */
  partyMax: 4,

  /** Sim-seconds per round of work, before the route's difficulty. */
  baseRoundSeconds: 55,
  secondsPerRouteLevel: 4,

  /** Chance a round turns up something worth a ball, at zero competence. */
  findChanceGreen: 0.35,
  /** And at full competence. Knowing the ground is most of the job. */
  findChanceSeasoned: 0.8,
  /** Competence gained per completed expedition on a route. */
  competencePerTrip: 0.16,
  /** Expeditions on a route before the league can push on from it. */
  tripsToPushOn: 3,

  /** Experience each party member takes from a round. */
  xpPerRound: 30,
  /** Pokéyen a round pays, before route scaling. */
  payBase: 38,
  payPerRouteLevel: 9,

  /** Chance per round that something happens beyond the ordinary. */
  eventChance: 0.16,
  /** Wear a hazard costs when no Potion is spent. */
  hazardHurt: 0.18,
  /** Wear absorbed instead when one is. */
  hazardHurtSalved: 0.05,
  /** Wear from trouble the crew has no Revive for. */
  troubleHurt: 0.4,
  /** Wear recovered per round on sheltered ground. */
  shelteredRecovery: 0.02,

  /** Sim-seconds a held choice waits before the crew acts in character. */
  choiceWindow: 20 * 60,

  /** Levels above a route's band a seasoned crew can find. */
  skillLevelBonus: 6,
  /** How far competence tilts the draw toward rarity. */
  rarityTilt: 0.5,
  /** And how far a Lure does, when one is spent. */
  lureTilt: 0.35,

  /** Rest a creature out with a crew still gets, against resting at home. */
  restWhilePosted: 0.35,
  /** Fraction of unused kit that comes back as money. They sold it on. */
  refund: 0.5,

  /**
   * Idle creatures the box will hold before crews stop bringing more.
   *
   * Absolute: exempting "somebody is short-handed" was tried twice and both
   * times the roster ran past a thousand, because a gym can be short of a type
   * no open route supplies and the exemption never resolves.
   */
  reserveCeilingBase: 24,
  reserveCeilingPerGym: 14,
  hardCeilingFactor: 3,
} as const;

/** What each item costs, and what it is for. */
export const KIT = {
  balls: { cost: 90, max: 60 },
  potions: { cost: 140, max: 30 },
  revives: { cost: 400, max: 10 },
  lures: { cost: 260, max: 20 },
} as const;

/**
 * What each trait does.
 *
 * `find` and `pay` bias the ordinary work; `peril` shifts how often events fire;
 * `rarity` tilts the draw. `decides` is the one that matters most — it is how a
 * held choice resolves for a player who is asleep, and it is why the trait is a
 * character rather than a stat block.
 */
export const TRAITS = {
  meticulous: { find: 0.85, pay: 1, peril: 0.7, rarity: 1.35, decides: "cautious" },
  reckless:   { find: 1.2, pay: 1.15, peril: 1.5, rarity: 1.1, decides: "bold" },
  patient:    { find: 1, pay: 0.9, peril: 0.85, rarity: 1, decides: "cautious" },
  lucky:      { find: 1.05, pay: 1.1, peril: 1, rarity: 1.2, decides: "bold" },
} as const;

export const SCOUTING = {
  /** Creatures a new league is founded with, before any route is staffed. */
  startingBench: 4,
  /**
   * Pokéyen a new league opens with.
   *
   * Enough to hire the first Ranger immediately. Creatures now come *only*
   * from staffed routes, so opening at zero meant the player could not catch
   * anything until gate receipts trickled in — the game's central supply chain
   * was locked behind a wait on the very first screen.
   */
  startingMoney: 900,
} as const;

/**
 * Junior Gym Trainers.
 *
 * What the games actually put between a challenger and the Leader, and what the
 * old "undercard" was reaching for. Depth here is how the Leader's party — the
 * creatures the player is attached to — stays off the field.
 */
export const GYM_TRAINERS = {
  /** Junior trainers a fresh gym can employ. Every gym opens here. */
  startingSlots: 2,
  /**
   * Ceiling by rank: two for the first two gyms, three for the middle three,
   * four for the last three.
   *
   * Replaces a tier-wide ceiling that gave every gym on the board the same
   * depth, which flattened the ladder in the one place it should be steepest —
   * the gym a seven-badge challenger reaches should be the deepest thing they
   * have walked into, not the same screen the first one had.
   */
  slotsByRank: [2, 2, 3, 3, 3, 4, 4, 4],
  /**
   * Juniors run small parties — they thin the field, they do not hold it.
   *
   * Tried at one to two, and it was worse: fewer juniors each fought *more*,
   * and the Leader still never stood, because a thinner screen still finished
   * the same weak challengers. Count was not the lever; whether the screen
   * *holds* is.
   */
  partyMin: 2,
  partyMax: 4,
  /** Level band a junior's creatures arrive at, relative to league renown. */
  levelBase: 6,
  levelPerThousandRenown: 6,
  /**
   * Levels added across the board, first gym to last.
   *
   * Rank was simply not read: every junior in the league was granted the same
   * level whether they stood in gym one or gym eight, so a challenger with seven
   * badges met the same rookies a first-timer did. A board without a ladder in
   * it is eight copies of the same gym.
   */
  levelAcrossBoard: 24,
  slotCostBase: 2200,
  slotCostGrowth: 1.7,
  /** Hiring a junior is far cheaper than hiring a Leader. */
  hireCostBase: 900,
  hireCostGrowth: 1.45,
  /** Juniors are paid less than Leaders. */
  salaryFactor: 0.35,
  /**
   * How good a junior's creatures are, against the real thing.
   *
   * A Gym Trainer's Machamp is a Machamp — and not as good a one as yours. They
   * are the people you walk past on the way to the Leader, and they should
   * fight like it.
   *
   * This exists because the undercard had quietly replaced the player's roster
   * rather than shielding it. Measured over twenty hours: the creatures you own
   * fought **71 battles each** while junior trainers' creatures fought **211**,
   * and there were six times as many of them. Your own creatures were spectators
   * in your own league — the same failure the whole design exists to answer, one
   * level up. Weaker juniors means challengers get through them and the Leader
   * actually stands.
   */
  rollPenalty: 0.55,
} as const;

export const TRADE = {
  /** Fewest creatures the desk will take in one trade. */
  minOffered: 2,
  /**
   * What you get back is priced off the *mean* power of your offer, not the
   * sum — otherwise dumping twelve Rattata would buy a Dragonite.
   */
  efficiency: 0.92,
  /**
   * Volume bonus, applied as `1 + volumeBonus * log2(count)`. Logarithmic on
   * purpose: the second creature you add matters, the eighth barely does, so
   * hoarding-then-dumping is never the optimal play.
   */
  volumeBonus: 0.16,
  /** Flat fee on top of the creatures traded away. */
  fee: 80,
} as const;

/**
 * Losing the title.
 *
 * The largest event in the game, and until now it incremented a counter. It is
 * now forced recruitment: the challenger who clears the board becomes your
 * Champion, and you manage them — expensive, hard to please, and impossible to
 * bench while their protection holds.
 *
 * Every number here exists to keep the event *rare and consequential* rather
 * than frequent and numb.
 */
export const TITLE = {
  /** Real-time days the title cannot be lost while the player is away. */
  safeDays: 15,
  /** Days over which that protection decays to nothing after the safe window. */
  decayDays: 10,
  /** Sim-seconds a usurper Champion refuses demotion or dismissal. */
  protectionSeconds: 4 * 3600,
  /** A usurper knows what they are worth. Multiplier on base salary. */
  usurperSalary: 2.4,
  /** Extra morale lost per sim-second by a usurper — ego is a running cost. */
  usurperMoraleDecay: 1 / (150 * 60),
  /** Morale each cleanly-beaten seat loses when the title falls. */
  defeatMoraleHit: 0.25,
  /** Strain a cleanly-beaten seat takes — this is what pushes them toward 8.1. */
  defeatStrain: 6 * 60,
  /** Renown a returning grudge challenger carries per grudge level. */
  grudgePowerPerLevel: 0.12,
  /** Grudges tracked at once. */
  grudgeCap: 8,
} as const;

/**
 * The morale staircase.
 *
 * Morale used to have exactly one failure mode: it reached zero and the trainer
 * walked. A cliff, with no move the player could make on the way down.
 *
 * It is now a staircase — slump, then suspension, then departure — and the point
 * of a staircase is that the player can step off it. Voluntary demotion is the
 * release valve: a legitimate way to keep someone by asking less of them.
 */
export const MORALE = {
  /** Below this a trainer's creatures start each bout on the back foot. */
  slumpAt: 0.35,
  /** Worst performance multiplier, reached at zero morale. */
  worstPerformance: 0.7,
  /** Below this, strain accumulates toward a suspension. */
  strainAt: 0.15,
  /** Sim-seconds spent under strainAt before a suspension triggers. */
  strainToSuspend: 20 * 60,
  /** Strain bled off per sim-second once morale recovers past strainAt. */
  strainRecovery: 1 / 3,
  /** How long a suspension keeps a trainer off the board. */
  suspensionSeconds: 30 * 60,
  /** Morale a trainer returns on, as a fraction of their standing. */
  returnMorale: 0.6,
  /** Standing lost per suspension — the escalation. */
  standingPerSuspension: 0.2,
  /** Standing never falls below this; the staircase is finite, not a spiral. */
  minStanding: 0.4,
  /** Suspensions served before the trainer leaves for good. */
  suspensionsBeforeDeparture: 3,
  /** Morale a voluntary demotion restores. */
  demotionRelief: 0.45,
  /** Standing a voluntary demotion restores. */
  demotionStandingRelief: 0.15,
} as const;

export const STAFF = {
  startingBondSlots: 2,
  /**
   * Retainer a trainer draws per sim-hour before what they field is counted.
   *
   * Deliberately small: most of a wage is `upkeepPerLevel` below, because a flat
   * retainer is a fixed cost and the league is not a fixed size. Measured before
   * this pass, payroll was **0.5% of income** over a hundred and twenty hours —
   * ₽266,000 against ₽54,000,000 — which made every system built on the tension
   * between money and staffing purely decorative: no suspensions, no
   * resignations, no reason to weigh a hire against anything.
   */
  baseSalaryPerHour: 150,
  /** Salary grows with tenure: base * (1 + tenureHours * this). */
  salaryPerTenureHour: 0.02,
  /**
   * Wage added per level of creature a trainer fields, as a multiple of the
   * retainer.
   *
   * This is what makes payroll grow with the league instead of with headcount
   * alone — and it prices *depth*, which until now was free. A gym running six
   * veterans costs many times one running two rookies, so casting a deep party
   * is a decision with a bill attached rather than a strict upgrade.
   */
  upkeepPerLevel: 1 / 5,
  /** Morale lost per sim-second while payroll cannot be met. */
  moraleLossUnpaid: 1 / (30 * 60),
  /** Morale lost per sim-second while a leader's gym is losing badly. */
  moraleLossLosing: 1 / (90 * 60),
  /** Morale regained per sim-second when paid and winning. */
  moraleRecovery: 1 / (60 * 60),
} as const;

export const META = {
  /** Sim-seconds between drift steps. One "season". */
  driftIntervalSeconds: 20 * 60,
  /** How far weights move per drift step. Higher = more chaotic. */
  driftMagnitude: 0.35,
  /** Rolling window, in waves, that a Threat Report averages over. */
  reportWindow: 40,
  /** Loss rate above which a gym shows `watch`. */
  watchLossRate: 0.15,
  /** Loss rate above which a gym shows `critical`. */
  criticalLossRate: 0.35,
} as const;

/**
 * Retraining a Leader's stance. Mid-game only — see systems/league.ts.
 */
export const DOCTRINE = {
  unlockAtGyms: 4,
  costBase: 3000,
  costGrowth: 1.5,
  moraleCost: 0.2,
} as const;

export const LEADER_OFFER = {
  /** Levels a Leader's signature gains across the board, first gym to last. */
  levelAcrossBoard: 20,
  /** Candidates shown when a gym opens. Choosing one is free. */
  candidates: 3,
  /** Their signature creature arrives already trained and fully bonded. */
  signatureLevelBase: 14,
  signatureLevelPerThousandRenown: 8,
} as const;

/**
 * How deep a gym's Leader runs.
 *
 * Gym one opening with a full party of six was the wrong shape twice over: it
 * handed the player their whole roster problem on the first screen, and it made
 * the first badge as hard as the eighth. Depth is a thing the board *earns* —
 * a Leader's party grows as the gym's rank rises, exactly as it does in the
 * source, where the first gym fields two and the last fields a full team.
 */
export const LEADER_DEPTH = {
  /** Creatures the first gym's Leader fields. */
  atFirstGym: 2,
  /** And the last. Everything between is interpolated across the board. */
  atLastGym: 6,
} as const;

export const LEAGUE = {
  /** Prototype scope: three gyms is enough to make casting a real decision. */
  maxGyms: 8,
  /** Peak renown needed before gym N+1 is offered. */
  /**
   * Peak renown each gym opens at.
   *
   * Fitted against a measured curve rather than guessed: an attentive league
   * reaches ~1,100 peak by fifteen real minutes, ~4,800 by an hour, ~8,800 by
   * two hours, and then flattens — renown equilibrates where inflow meets
   * decay, and 24 hours only reaches ~10,500. The last gym therefore has to sit
   * below ~9,000 or it is unreachable, which caps how far this axis can stretch
   * pacing at all.
   *
   * That ceiling is the argument for moving these gates onto counts that time
   * cannot inflate — badges defended, routes reached, careers completed.
   *
   * Refitted for Block 11. The ladder lowered the curve in two ways: renown now
   * scales with rank in both directions, and the rank slot caps made the two
   * busiest gyms shallower, so the board loses more badges where it is hit
   * hardest. A solvent league now reaches eight gyms at about two real hours.
   *
   * "Solvent" is doing work in that sentence — the first fit was made against a
   * probe that spent to zero, went bankrupt, lost its staff and flatlined, and
   * every threshold chosen against that was fitted to a spiral rather than to
   * the game.
   */
  gymUnlockRenown: [0, 200, 500, 950, 1600, 2400, 3300, 4200],
  /** Building an available gym costs this — unlocking is a timing decision. */
  gymCostBase: 5200,
  gymCostGrowth: 2.1,
  /** How many types the player chooses between when a gym unlocks. */
  gymOfferSize: 3,
  gymSlots: 3,
  hireCostBase: 1400,
  hireCostGrowth: 1.8,
} as const;

export const BREEDING = {
  cost: 900,
  /** Offspring hatch as the base form of a parent's line, at this level. */
  hatchLevel: 3,
  /** How much a parent's bond lifts its offspring's floor. */
  bondWeight: 0.12,
  /** How much of a career actually spent lifts it. */
  careerWeight: 0.15,
  /** Ceiling on the inherited power roll, so lineages cannot run away. */
  maxRoll: 1.45,
} as const;

/**
 * The Elite Four.
 *
 * Deliberately tuned around *throughput* rather than receipts — see
 * systems/elite.ts for why that is the only lever that can bend the curve.
 */
/**
 * The Elite Four and the Champion.
 *
 * The penultimate and ultimate bosses of the league. A challenger who clears
 * every gym earns a run at them, facing each seat in order. Beating the whole
 * gauntlet takes the league — a real, visible defeat rather than a lost battle.
 */
/**
 * Named rivals.
 *
 * The warning window is the mechanic. Long enough to actually prepare, short
 * enough that a player who ignores it pays for it.
 */
export const RIVAL = {
  /** Sim-seconds between announcements. */
  intervalSeconds: 25 * 60,
  /** How far ahead they announce themselves. */
  warningSeconds: 12 * 60,
  /** Rivals are far stronger than the daily trickle. */
  powerMultiplier: 1.6,
  /** On top of what their badge count already grants. */
  extraRevives: 2,
  /** Badges a rival may gain between appearances. */
  badgeGrowth: 2,
  /** Rough strength-per-level-per-creature, for the readiness estimate. */
  readinessScale: 2.6,
  purse: 4200,
  renownForWinning: 90,
  renownForLosing: 150,
  historyCap: 24,
} as const;

export const ELITE = {
  /** Four Elite seats plus the Champion. */
  seats: 4,
  championRank: 4,
  /** Hiring an Elite trainer costs far more than a Gym Leader. */
  hireCostBase: 8000,
  hireCostGrowth: 1.9,
  /** Creatures each seat can field. */
  teamSize: 4,
  /** Sim-seconds between gauntlet attempts once the tier is open. */
  intervalSeconds: 45 * 60,
  /** Only challengers who cleared every gym reach the Elite tier. */
  challengerBadges: 8,
  /** On top of what eight badges already grant them. */
  extraRevives: 2,
  /**
   * Gauntlet challengers are stronger than gym-level ones — but not so much
   * stronger that a staffed tier loses routinely. Losing the league has to stay
   * a rare, memorable event; at the first pass it happened every 27 minutes and
   * meant nothing at all.
   */
  powerMultiplier: 1.15,
  /** Each seat cleared makes the challenger more dangerous still. */
  powerPerStage: 0.08,
  /**
   * Gate for a gauntlet run at all. A challenger good enough to reach the Elite
   * tier fills the stands whether or not they get past the first seat.
   */
  receiptsBase: 2200,
  /** Plus this for each further seat they reached. */
  receiptsPerStage: 900,
  /**
   * Experience multiplier for a bout fought at an Elite seat.
   *
   * The Elite tier fights roughly once an hour; a gym fights every few seconds.
   * With a flat award its creatures never develop at all — the runner had seats
   * fielding level 6 against a league whose gyms were in the twenties, and the
   * tier lost 89% of its gauntlets to opponents nobody could have staffed for.
   *
   * An Elite bout genuinely is a far bigger fight than a gym wave, so paying it
   * accordingly is both the fix and the honest description.
   */
  /** How much stronger an Elite's signature creature is than a Leader's. */
  signatureLevelFactor: 1.5,
  xpMultiplier: 40,
  /**
   * Floor on the gauntlet challenger's reference level, as a fraction of what
   * the league fields elsewhere.
   *
   * Scaling the gauntlet purely to the Elite's own strength made neglect *safe*
   * — a tier of rookies drew rookie challengers and never fell. Scaling it
   * purely to the league made neglect fatal, because the Elite fights an hour
   * apart and can never match gyms fighting every few seconds.
   *
   * So: a challenger is as strong as the Elite tier that will meet them, but
   * never weaker than this share of the league that produced them. Under-staff
   * the tier and it is a real liability; staff it and it holds.
   */
  challengerFloorOfLeague: 0.7,
  /** Renown for stopping a run. */
  renownForHolding: 60,
  /** Renown lost when a challenger takes the league. */
  renownForLosing: 400,
} as const;

export const DAYCARE = {
  /** The couple take two, exactly as they always have. */
  slots: 2,
  /** Sim-seconds of training worth one experience point. */
  secondsPerXp: 4,
  /** Flat fee to collect a creature. */
  baseFee: 100,
  /** Plus this per level it gained while it was there. */
  feePerLevel: 100,
  /** Sim-seconds two compatible parents need before an egg appears. */
  eggSeconds: 45 * 60,
} as const;

/**
 * The Hall of Fame.
 *
 * A record of creatures whose careers ended in your service — and deliberately
 * not all of them. Careers now end properly, which is roughly eighty a run, and
 * a hall that everyone enters is a staff list rather than an honour.
 */
/**
 * The Desk's thresholds.
 *
 * Only the numbers that decide *when* something is worth saying. The Desk is
 * the one screen that interrupts, so it has to be right about that.
 */
export const DESK = {
  /** Careers ended before the Desk suggests building somewhere for them to go. */
  retireesBeforeNudge: 3,
} as const;

export const HALL = {
  /**
   * Fraction of its own career a creature must have spent to be remembered.
   *
   * A creature that served most of a life earned the record; one benched after
   * a dozen battles did not. Reading it as a *fraction* rather than a count is
   * what makes it fair to a short-lived creature.
   */
  minCareerServed: 0.55,
  /**
   * Battles a creature must have *won* as well as served.
   *
   * Career served alone let a creature that lost its way through a short life
   * into the Hall — measured, entries with three wins and a career spent almost
   * entirely on faint penalties, which burn career faster than fighting does.
   * A hall of fame that rewards attrition is a casualty list.
   */
  minWins: 20,
  /** However distinguished the league, the record has to stay readable. */
  cap: 300,
} as const;

export const PROMOTION = {
  /** Creatures carried into the Hall of Fame per promotion. */
  inductCount: 3,
  /**
   * Bond each of a gym's core creatures must reach before the league is ready.
   *
   * Read against the most bonded `coreSize`, never the party average — see
   * `hasBondedCore`. An average made depth a liability, and the league that had
   * built the most was the one that could never promote.
   */
  bondBar: 0.5,
  /** How many bonded creatures make a core. */
  coreSize: 2,
  /**
   * Peak renown needed to leave each tier.
   *
   * These must sit *below* the renown a competent league can actually reach at
   * that tier. Renown climbs until challenger scaling drags the win rate back to
   * equilibrium, so the ceiling is roughly (maxCreaturePower - challengerBase) /
   * challengerPowerPerRenown. The first pass set the national bar at 9000, which
   * was essentially that ceiling — the league promoted once and then stalled for
   * 350 sim-hours with nowhere to go.
   */
  renownBar: [2500, 6000],
  /** Gate receipts multiply by this per tier climbed. */
  receiptsPerTier: 1.7,
  /** Bond gain multiplier each matching Mentor confers. */
  mentorBondBonus: 0.25,
  /**
   * Levels each matching Mentor grants creatures of its type on acquisition.
   *
   * Bond speed alone was not enough to make a second run faster: bond buys
   * reliability, and it is raw power that drives renown. A Mentor training the
   * next generation is both the thematically right effect and the one that
   * actually bends the curve.
   */
  mentorLevelBonus: 4,
} as const;

export const TIERS = {
  regional: { gyms: 8, next: "national" },
  national: { gyms: 12, next: "world" },
  world: { gyms: 18, next: null },
} as const;

export const LOG_CAP = 60;
