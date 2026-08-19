/**
 * Headless balance runner.
 *
 * The highest-leverage tool in an incremental game: fast-forward two hundred
 * hours of progression in a couple of seconds and look at the curve, instead of
 * tuning constants by feel and finding out three weeks later.
 *
 *   npm run sim -- --hours 200
 *   npm run sim -- --hours 50 --seed 7 --every 2
 */
import {
  levelFor,
  partySizeFor,
  revivesFor,
  acceptGymOffer,
  canHireGymTrainer,
  expandGymTrainers,
  chooseLeader,
  hireGymTrainer,
  createInitialState,
  allFacilities,
  addToCrew,
  canHire,
  crewOf,
  fieldOffer,
  fieldStaff,
  canPost,
  rangers,
  handlers,
  stretchOf,
  eligibleRoutes,
  hire,
  setAutoWork,
  post,
  partyCapOf,
  postingFor,
  reserveCeiling,
  usableReserve,
  canTrade,
  canStaff,
  canUpgrade,
  inductable,
  promote,
  readiness,
  autoFillAll,
  canDropOff,
  dropOff,
  eliteUnlocked,
  staffSeat,
  trade,
  upgrade,
  tick,
  type LeagueState,
} from "../src/sim/index.js";

interface Args {
  hours: number;
  seed: number;
  every: number;
  /** "idle" plays nobody; "greedy" plays a simple attentive manager. */
  policy: "idle" | "greedy";
  /**
   * How deep the policy fills each bench. Set to 0 to test whether upkeep has
   * inverted the undercard — if an empty bench outperforms a full one, the
   * mechanic is teaching the opposite of what it should.
   */
  bench: number;
  /** Set false to measure the curve with the support tier switched off. */
  facilities: boolean;
  /** Set false to measure the curve without the Elite Four throughput lever. */
  elite: boolean;
  /** Set false to stay in one tier, so promotion resets do not muddy a curve. */
  promote: "always" | "earned" | "off";
}

/**
 * A stand-in for an attentive player.
 *
 * Without this the runner only ever measures "what happens if you never open
 * the app" — every creature retires, the gym forfeits forever, and the curve
 * tells you nothing about balance. The policy keeps slots full and the
 * undercard stocked, which is the floor of competent play.
 */
function greedyPolicy(
  state: LeagueState,
  benchDepth: number,
  buildFacilities: boolean,
  args_elite: boolean,
  allowPromote: "always" | "earned" | "off",
): void {
  // Take any gym on offer — pick the type the box is deepest in.
  if (state.gymOffer && state.gymOffer.length > 0) {
    const best = [...state.gymOffer].sort((a, b) => {
      const count = (t: typeof a) =>
        Object.values(state.creatures).filter(
          (c) => c.role === "reserve" && c.types.includes(t),
        ).length;
      return count(b) - count(a);
    })[0];
    if (best) acceptGymOffer(state, best);
  }

  // Gyms now open with three Leader candidates; take the first on offer.
  if (state.leaderOffer) {
    const pick = state.leaderOffer.trainerIds[0];
    if (pick) chooseLeader(state, pick);
  }

  // Promote the moment the league is ready, inducting the winningest creatures.
  // `--promote earned` refuses the forced path, which is the only way to observe
  // the Elite tier over a long run: a greedy policy takes the fast path the
  // instant the title falls and resets the league out from under the sample.
  const check = readiness(state);
  const takesPath = allowPromote === "always" || check.path === "earned";
  if (allowPromote !== "off" && takesPath && check.ok) {
    const induct = inductable(state).slice(0, 3).map((c) => c.id);
    promote(state, induct);
    return;
  }

  if (buildFacilities) {
    for (const def of allFacilities()) {
      if (canUpgrade(state, def.id).ok) upgrade(state, def.id);
    }
  }

  // Staff the Elite Four and Champion once the board is complete.
  if (args_elite && eliteUnlocked(state)) {
    for (const seatRow of state.elite) {
      if (seatRow.trainerId !== null) continue;
      const gym = state.gyms[state.gymOrder[seatRow.rank % state.gymOrder.length] ?? ""];
      if (gym && canStaff(state, seatRow.rank, gym.type).ok) {
        staffSeat(state, seatRow.rank, gym.type);
      }
    }
  }

  for (const gymId of state.gymOrder) {
    const gym = state.gyms[gymId];
    if (!gym) continue;

    // Then hire juniors, and buy room for more. Depth here is what keeps the
    // Leader's party off the field.
    if (benchDepth > 0) {
      if (gym.trainerIds.length >= gym.trainerSlots) expandGymTrainers(state, gymId);
      while (
        gym.trainerIds.length < Math.min(benchDepth, gym.trainerSlots) &&
        canHireGymTrainer(state, gymId).ok
      ) {
        if (!hireGymTrainer(state, gymId).ok) break;
      }
    }

    // Trade for the gym's type when the box has nothing on-type left.
    const onType = Object.values(state.creatures).filter(
      (c) => c.role === "reserve" && c.types.includes(gym.type),
    );
    if (onType.length === 0) {
      const offcuts = Object.values(state.creatures)
        .filter((c) => c.role === "reserve" && !c.types.includes(gym.type))
        .slice(0, 3)
        .map((c) => c.id);
      if (canTrade(state, gym.type, offcuts).ok) trade(state, gym.type, offcuts);
    }
  }

  // Park a compatible pair of retirees at the Day-Care so a lineage develops.
  if (state.dayCare.length < 2) {
    const retirees = Object.values(state.creatures).filter((c) => c.role === "retired");
    outer: for (const a of retirees) {
      for (const b of retirees) {
        if (a.id === b.id) continue;
        if (!a.types.some((t) => b.types.includes(t))) continue;
        if (canDropOff(state, a.id).ok) dropOff(state, a.id);
        if (canDropOff(state, b.id).ok) dropOff(state, b.id);
        break outer;
      }
    }
  }

  // Prefer ground that supplies the types this board actually staffs. Route
  // supply is by type and parties only accept their trainer's type, so working
  // the hardest route regardless of what lives there fills the box with
  // creatures no gym can field — the league starves with a full box.
  const wanted = new Set(state.gymOrder.map((id) => state.gyms[id]?.type));

  // Gyms first. Field crews draw from the same box, and a policy that crews
  // greedily leaves every Leader short-handed while sixteen creatures stand on
  // routes — which is a real trap for the player too, not just the runner.
  autoFillAll(state);

  for (const role of ["ranger", "handler"] as const) {
    // Hiring is an offer now, so the policy takes whatever type turns up that
    // the board could use, and passes otherwise.
    let guard = 0;
    while (canHire(state, role).ok && guard < 12) {
      guard += 1;
      const offer = fieldOffer(state, role);
      const useful = offer.find((t) => wanted.has(t)) ?? offer[0];
      if (!useful) break;
      const hired = hire(state, role, useful);
      // Keep them working: idle field staff draw wages for nothing.
      if (hired.ok) setAutoWork(state, hired.trainerId, true);
    }

    for (const trainer of fieldStaff(state, role)) {
      if (postingFor(state, trainer.id)) continue;

      // Crew from the box, on-type — the same rule a gym obeys.
      // Only from genuine surplus, so casting the board always wins the tie.
      // Rangers work alone; only a Handler needs anyone with them.
      if (role === "handler") {
        const bench = Object.values(state.creatures)
          .filter((c) => c.role === "reserve" && c.owned)
          .sort((a, b) => a.level - b.level);
        for (const c of bench.slice(0, Math.max(0, bench.length - 6))) {
          if (crewOf(state, trainer.id).length >= trainer.partyCap) break;
          addToCrew(state, c.id, trainer.id);
        }
        if (crewOf(state, trainer.id).length === 0) continue;
      }

      const routes = [...eligibleRoutes(state)].sort((a, b) => {
        if (role === "ranger") {
          const fit = (r: typeof a) =>
            [...wanted].reduce((sum, t) => sum + (t ? r.supply[t] : 0), 0);
          return fit(b) - fit(a) || b.levelMax - a.levelMax;
        }
        // Handlers want the hardest ground they are allowed to stand on.
        return b.levelMax - a.levelMax;
      });

      for (const route of routes) {
        if (canPost(state, route.id, trainer.id).ok) {
          post(state, route.id, trainer.id);
          break;
        }
      }
    }
  }

  autoFillAll(state);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { hours: 100, seed: 1, every: 10, policy: "greedy", bench: 99, facilities: true, elite: true, promote: "always" };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined) continue;
    if (flag === "--hours") args.hours = Number(value);
    if (flag === "--seed") args.seed = Number(value);
    if (flag === "--every") args.every = Number(value);
    if (flag === "--policy" && (value === "idle" || value === "greedy")) {
      args.policy = value;
    }
    if (flag === "--bench") args.bench = Number(value);
    if (flag === "--facilities") args.facilities = value !== "off";
    if (flag === "--elite") args.elite = value !== "off";
    if (flag === "--promote") args.promote = value === "off" ? "off" : value === "earned" ? "earned" : "always";
  }
  return args;
}

function pad(s: string | number, n: number): string {
  return String(s).padStart(n);
}

function activeRoster(state: LeagueState): number {
  return Object.values(state.creatures).filter((c) => c.role !== "retired").length;
}

function avgBond(state: LeagueState): number {
  const inParty = Object.values(state.creatures).filter((c) => c.role === "party");
  if (inParty.length === 0) return 0;
  return inParty.reduce((a, c) => a + c.bond, 0) / inParty.length;
}

function run(): void {
  const args = parseArgs(process.argv.slice(2));
  const state = createInitialState(args.seed);

  // Founding is the player's opening decision, so the policy has to make it.
  {
    const type = state.gymOffer?.[0];
    if (type) acceptGymOffer(state, type);
    const leader = state.leaderOffer?.trainerIds[0];
    if (leader) chooseLeader(state, leader);
  }

  const totalTicks = Math.round(args.hours * 3600);
  let waves = 0;
  let wins = 0;
  let earned = 0;
  let retirements = 0;
  let resignations = 0;
  let gauntlets = 0;
  let caught = 0;
  let shifts = 0;
  let suspensions = 0;
  let evolutions = 0;
  let hatched = 0;

  // The curve test: how long each tier takes to reach the *same* renown mark.
  // If the Hall of Fame is doing its job, later tiers get there faster.
  const BENCHMARK = 2500;
  const reached = new Map<string, number>();
  let tierStartedAt = 0;
  let lastTier = state.tier;

  const started = performance.now();

  console.log(
    `\n  The Casting Board — balance run · ${args.hours}h · seed ${args.seed} · ${args.policy}\n`,
  );
  console.log(
    `  ${pad("HOUR", 5)} ${pad("MONEY", 10)} ${pad("PRESTIGE", 9)} ${pad("WAVES", 8)} ${pad("WIN%", 6)} ${pad("ROSTER", 7)} ${pad("BOND", 6)} ${pad("SEASON", 7)} ${pad("TIER", 4)} ${pad("HALL", 4)}`,
  );
  console.log(`  ${"-".repeat(80)}`);

  for (let t = 0; t < totalTicks; t++) {
    const report = tick(state, 1);
    waves += report.wavesResolved;
    wins += report.wavesWon;
    earned += report.earned;
    retirements += report.retirements.length;
    resignations += report.resignations.length;
    gauntlets += report.gauntlets.length;
    caught += report.caught.length;
    shifts += report.returned.length;
    suspensions += report.suspended.length;
    evolutions += report.evolutions.length;
    hatched += report.hatched.length;

    if (state.tier !== lastTier) {
      tierStartedAt = t;
      lastTier = state.tier;
    }
    if (!reached.has(state.tier) && state.peakRenown >= BENCHMARK) {
      reached.set(state.tier, (t - tierStartedAt) / 3600);
    }

    // The policy checks in once a sim-minute — roughly an attentive player.
    if (args.policy === "greedy" && t % 60 === 0) greedyPolicy(state, args.bench, args.facilities, args.elite, args.promote);

    const hour = (t + 1) / 3600;
    if (Number.isInteger(hour) && hour % args.every === 0) {
      const winRate = waves > 0 ? (wins / waves) * 100 : 0;
      console.log(
        `  ${pad(hour, 5)} ${pad(Math.round(state.money), 10)} ${pad(Math.round(state.renown), 9)} ${pad(waves, 8)} ${pad(winRate.toFixed(1), 6)} ${pad(activeRoster(state), 7)} ${pad(avgBond(state).toFixed(2), 6)} ${pad(state.meta.season, 7)} ${pad(state.tier.slice(0, 3), 4)} ${pad(state.hall.length, 4)}`,
      );
    }
  }

  const ms = performance.now() - started;
  console.log(`  ${"-".repeat(70)}\n`);
  console.log(`  Waves resolved   ${waves}`);
  console.log(`  Win rate         ${((wins / Math.max(1, waves)) * 100).toFixed(1)}%`);
  console.log(`  Gate receipts    ${Math.round(earned)}`);
  console.log(`  Retirements      ${retirements}`);
  console.log(`  Resignations     ${resignations}`);
  console.log(`  Seasons drifted  ${state.meta.season}`);
  console.log(`  Evolutions       ${evolutions}`);
  console.log(`  Final tier       ${state.tier} · ${state.gymOrder.length} gyms · peak renown ${Math.round(state.peakRenown)}`);
  console.log(`  Hall of Fame     ${state.hall.length}`);
  const seatParties = state.elite.map(
    (e) => (e.trainerId ? state.trainers[e.trainerId]?.party.length : 0) ?? 0,
  );
  const seatLevels = state.elite.map((e) => {
    const t = e.trainerId ? state.trainers[e.trainerId] : undefined;
    if (!t || t.party.length === 0) return 0;
    const lv = t.party.map((id) => state.creatures[id]?.level ?? 0);
    return Math.round(lv.reduce((a, b) => a + b, 0) / lv.length);
  });
  console.log(
    `  Elite staffed    ${state.elite.filter((e) => e.trainerId).length}/5 · parties [${seatParties.join(",")}] · avg Lv [${seatLevels.join(",")}]`,
  );
  console.log(
    `  Challenger Lv    ${levelFor(state, 8)} at ${Math.round(state.renown)} renown (party of ${partySizeFor(8)}, ${revivesFor(8)} revives)`,
  );
  console.log(
    `  Gauntlets        ${gauntlets} run · ${state.leagueTaken} lost (${((state.leagueTaken / Math.max(1, gauntlets)) * 100).toFixed(0)}% fall rate)`,
  );
  console.log(`  Suspensions      ${suspensions}`);
  console.log(
    `  Rangers         ${rangers(state).length} hired · ${state.postings.filter((p) => p.role === "ranger").length} posted · ${caught} caught over ${shifts} shifts`,
  );
  {
    const posts = state.postings.filter((p) => p.role === "handler");
    const earned = posts.reduce((a, p) => a + p.earned, 0);
    const beaten = posts.reduce((a, p) => a + p.beaten, 0);
    const stretch = posts.map((p) => stretchOf(state, p));
    console.log(
      `  Handlers         ${handlers(state).length} hired · ${posts.length} posted · \u20b1${Math.round(earned).toLocaleString()} earned · ${beaten} beaten · stretch [${stretch.join(",")}]`,
    );
  }
  console.log(
    `  Box              ${usableReserve(state)}/${reserveCeiling(state)} usable · ${state.postings.filter((p) => p.resting).length} resting · routes ${state.postings.map((p) => p.routeId).join(",")}`,
  );
  {
    const short = state.gymOrder.flatMap((id) => {
      const gym = state.gyms[id];
      if (!gym) return [];
      const ids = [...gym.trainerIds, ...(gym.leaderId ? [gym.leaderId] : [])];
      return ids
        .map((tid) => state.trainers[tid])
        .filter((t) => t !== undefined && t.party.length < partyCapOf(t, state))
        .map((t) => `${t!.affinity}:${t!.party.length}/${partyCapOf(t!, state)}`);
    });
    console.log(`  Short-handed     ${short.length ? short.join(" ") : "none"}`);
  }
  console.log(`  Grudges open     ${state.grudges.length}`);
  console.log(`  Hatched          ${hatched}`);
  const roles = new Map<string, number>();
  for (const c of Object.values(state.creatures)) {
    roles.set(c.role, (roles.get(c.role) ?? 0) + 1);
  }
  console.log(`  Roster by role   ${[...roles].map(([r, n]) => `${r}=${n}`).join(" ")}`);
  console.log(`  Trainers         ${Object.keys(state.trainers).length}`);
  console.log(`\n  Hours for each tier to reach ${BENCHMARK} renown:`);
  if (reached.size === 0) {
    console.log("    (never reached)");
  }
  for (const [tier, hours] of reached) {
    console.log(`    ${tier.padEnd(10)} ${hours.toFixed(1)}h`);
  }
  console.log(
    `\n  Simulated ${args.hours}h in ${ms.toFixed(0)}ms (${((args.hours * 3600) / (ms / 1000) / 1000).toFixed(0)}k ticks/s)\n`,
  );
}

run();
