/**
 * Every tunable number in the game, in one file.
 *
 * These are starting values, not balanced ones. Use `npm run sim -- --hours 200`
 * to see what they do to the progression curve before changing them by feel.
 */

/** One sim tick is this many sim-seconds. The sim never sees real time. */
export const TICK_SECONDS = 1;

/** Offline accrual is capped here. 12 hours, per the design doc. */
export const OFFLINE_CAP_SECONDS = 12 * 60 * 60;

/**
 * Above this much elapsed time, the loader resolves offline analytically
 * instead of stepping ticks. Keeps app-open instant.
 */
export const OFFLINE_ANALYTIC_THRESHOLD_SECONDS = 120;

/**
 * Challenges.
 *
 * A gym challenge is an event, not weather. Under party-vs-party a single one
 * runs to fifteen or twenty exchanges, so it has to be rare enough that a
 * creature's career is measured in weeks rather than an afternoon.
 */
export const CHALLENGE = {
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
   * Re-derived after measuring a real league: at 6,500 a creature in daily gym
   * duty had spent **5.4% of its career in forty hours**, putting a full career
   * somewhere past seven hundred. Career is meant to be the finite life that
   * gives a creature an arc and eventually sends it to the Day-Care; at that
   * rate it was neither a constraint nor an arc, and retirement, breeding and
   * pedigree never happened at all.
   */
  base: 1400,
  variance: 350,
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
   */
  perWave: 0.012,
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
 * Rangers.
 *
 * Scouting used to be a purchase: spend a charge and some money, creatures
 * appear. It was the least characterful system in the game — the one place a
 * league about people acquired creatures from nowhere.
 *
 * Now you staff a route. A Ranger and a **field partner** work it continuously,
 * and creatures arrive because somebody went and got them. That is what turns a
 * box of four hundred into an org chart: the fortieth Zubat is not inventory,
 * it is somebody's working partner.
 *
 * Route work costs **fatigue, never career**. Routes are the safe posting, and
 * the box has a job that never kills anyone.
 */
export const RANGER = {
  /** Sim-seconds for one catch before the route's difficulty is applied. */
  baseCatchSeconds: 70,
  /** Added per point of the route's top level. Better ground is slower ground. */
  secondsPerRouteLevel: 5,
  /**
   * Speed a partner adds at the top of the route's level band, versus the
   * bottom. A partner who has outgrown a route works it quickly — which is the
   * signal to move them somewhere harder.
   */
  partnerSpeedBonus: 0.7,
  /**
   * Fatigue a partner takes per sim-second worked, at the very bottom of the
   * route's level band.
   *
   * Fatigue is charged for *time on the ground*, not per catch, and it scales
   * down as the partner grows into the route. Charging per catch had it exactly
   * backwards: harder routes are slower, so they yielded fewer catches and
   * therefore tired the partner *less*.
   *
   * Tuned so a partner working at the route's floor wears out in about half an
   * hour, and one at the top of the band never does. That is the whole shape of
   * the system in one number — hard ground you have not grown into is a
   * rotation, and ground you have outgrown is a standing posting.
   */
  fatiguePerSecondAtFloor: 0.0009,
  /** How much of that a partner still takes once they top the route's band. */
  fatigueAtCeiling: 0.3,
  /**
   * Rest a posted partner gets *while working*, as a fraction of normal
   * recovery. Working is not resting, but a route is not a battle either.
   */
  restWhilePosted: 0.35,
  /** Fatigue at which a partner stops working and sits down. */
  tiredAt: 0.9,
  /**
   * Fatigue they must come back down to before working again.
   *
   * The gap between this and `tiredAt` is what makes a posting a duty cycle
   * rather than a stall. Without it a tired partner recovered a hair, worked one
   * second, and tired out again — postings ran at a trickle forever and the
   * league starved with Rangers apparently hard at work.
   */
  rested: 0.3,
  /**
   * How long a Ranger's shift runs before they come home.
   *
   * A posting that never ended made the whole screen one decision, made once —
   * staff every route and never look at it again. A shift means the Field tab
   * asks something of the player on a rhythm, and it is the difference between a
   * system and a switch.
   */
  shiftSeconds: 45 * 60,
  /**
   * Postings stall once this many creatures sit idle in the box.
   *
   * Automation without a ceiling quietly recreated the hoarding problem once
   * before — the roster hit 720 and the runner slowed six-fold. Rangers stop
   * when there is nowhere to put anyone.
   */
  reserveCeilingBase: 24,
  /**
   * Extra idle creatures tolerated per gym on the board.
   *
   * A flat ceiling starved the league. Route supply is by *type*, and a party
   * only accepts its trainer's type, so an idle box is mostly creatures this
   * league cannot field — a fixed cap therefore fills with the wrong types and
   * stops every posting while gyms still stand short-handed. The ceiling has to
   * grow with how many types the board is actually trying to staff.
   */
  reserveCeilingPerGym: 14,
  /**
   * Multiple of the ceiling at which spillover starts being released.
   *
   * A hard backstop, not a design lever: it exists so an unattended league can
   * never grow the roster of hundreds that once slowed the balance runner
   * six-fold. It only ever touches creatures nobody has invested in.
   */
  hardCeilingFactor: 3,
  /** Rangers are paid less than Leaders; they are not holding the board. */
  salaryFactor: 0.45,
  hireCostBase: 700,
  hireCostGrowth: 1.4,
  /** Postings available before the Scouting Office is upgraded. */
  baseSlots: 3,
  /** Further postings per level of the Scouting Office. */
  slotsPerOfficeLevel: 1,
  /** Level field staff arrive at, per thousand peak renown. */
  levelPerThousandRenown: 5,
  /** Cost of a survey, as a multiple of the route's old scouting fee. */
  intelCostFactor: 2.5,
} as const;

/**
 * Field staff, and why you do not get to pick their type.
 *
 * Hiring offers a handful of types drawn at random; take one and the offer
 * redraws. Picking freely made a Ranger a component you bought — you already
 * knew which type you wanted, so the only question was whether you could afford
 * it, and there was no decision in it at all.
 *
 * Drawing them means the roster you end up with is partly the roster you were
 * *offered*, which is how staffing works everywhere else in this game: the
 * Leader offer, the gym type offer. You take the good Water trainer when they
 * turn up, not when you feel like it.
 */
export const FIELD = {
  /** Types on offer at once, per role. */
  offerSize: 3,
} as const;

/**
 * Handlers.
 *
 * Named to stay clear of Gym Trainers, and named for what they do: they take a
 * party out onto a route and bring it back stronger. This is the training half
 * of field work, opposite the Rangers' collecting half.
 *
 * The mechanic that makes it a decision is the **stretch**. A Ranger refuses
 * ground its partner could not handle; an Handler may be posted *below* a
 * route's level band on purpose. The further under, the more they earn and the
 * faster the party levels — and the more likely they come back beaten.
 *
 * It is also the answer to a measured problem: creature levels only ever rose
 * through gym waves, while challenger scaling rose with renown, so the Elite
 * tier fielded level 6 creatures against a league in the twenties. Training has
 * to be a thing the player can *do*, not a thing that happens to them.
 */
export const HANDLER = {
  /** Postings before the Training Grounds are upgraded. */
  baseSlots: 3,
  /** Further postings per level of the Training Grounds. */
  slotsPerFacilityLevel: 1,
  /** An Handler's party. Smaller than a gym's — they travel light. */
  partyMax: 4,

  hireCostBase: 1100,
  hireCostGrowth: 1.4,
  salaryFactor: 0.6,

  /** Sim-seconds per training round, before the route's difficulty. */
  baseRoundSeconds: 55,
  secondsPerRouteLevel: 4,

  /** Experience each party member takes from a round. */
  xpPerRound: 30,
  /**
   * Pokéyen a round pays, before route scaling.
   *
   * Halved from the first pass, where six postings out-earned two thirds of the
   * league's gate receipts and training became the whole economy. It should be a
   * second income axis — one that scales with headcount rather than renown, and
   * so cannot be equilibrated away — not the primary one.
   */
  payBase: 38,
  payPerRouteLevel: 9,

  /** Fatigue per sim-second at the bottom of the route's band. */
  fatiguePerSecondAtFloor: 0.0011,
  /** How much of that remains once the party tops the band. */
  fatigueAtCeiling: 0.35,
  tiredAt: 0.9,
  rested: 0.3,

  /** Levels below a route's floor a party may be pushed. */
  maxStretch: 14,
  /** Extra pay and experience per level of stretch. */
  payPerStretch: 0.07,
  xpPerStretch: 0.06,
  /** Extra fatigue per level of stretch. */
  fatiguePerStretch: 0.09,
  /** Chance per round, per level of stretch, that the party is beaten. */
  beatenChancePerStretch: 0.022,
  /** What being beaten costs: fatigue on everyone, and their trainer's heart. */
  beatenFatigue: 0.3,
  beatenMorale: 0.05,
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
  /** Junior trainers a fresh gym can employ. */
  startingSlots: 2,
  /** Ceiling before the World tier. */
  maxSlots: 3,
  /** Ceiling once the league reaches the World tier. */
  maxSlotsEndgame: 4,
  /** Juniors run small parties — they thin the field, they do not hold it. */
  partyMin: 2,
  partyMax: 4,
  /** Level band a junior's creatures arrive at, relative to league renown. */
  levelBase: 6,
  levelPerThousandRenown: 6,
  slotCostBase: 2200,
  slotCostGrowth: 1.7,
  /** Hiring a junior is far cheaper than hiring a Leader. */
  hireCostBase: 900,
  hireCostGrowth: 1.45,
  /** Juniors are paid less than Leaders. */
  salaryFactor: 0.35,
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
  gymUnlockRenown: [0, 120, 350, 700, 1100, 1600, 2200, 3000],
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
