import { createInitialState, tick, constants } from "../src/sim/index.js";
import {
  acceptGymOffer,
  chooseLeader,
  checkGymUnlock,
  autoFillAll,
  partyOf,
  partyCapOf,
  canHire,
  fieldOffer,
  fieldStaff,
  hire,
  addToCrew,
  crewOf,
  canPost,
  post,
  postingFor,
  eligibleRoutes,
  canUpgrade,
  upgrade,
  allFacilities,
  canHireGymTrainer,
  hireGymTrainer,
  canStaff,
  staffSeat,
  ensureSeats,
  eliteUnlocked,
  setAutoWork,
  readiness,
  TYPES,
} from "../src/sim/index.js";
import type { LeagueState, TickReport } from "../src/sim/index.js";

/**
 * Which of the league's systems actually happen.
 *
 * The balance runner answers "is the curve right". This answers a blunter and
 * more useful question: over a full playthrough, how often does each mechanic
 * fire *at all*? A system that never triggers is not balanced or unbalanced, it
 * is absent — and absent systems are invisible in every other measurement we
 * take, because they contribute nothing to any of them.
 *
 *   npx tsx scripts/diagnose.ts [hours]
 */

const HOURS = Number(process.argv[2] ?? 120);

function play(state: LeagueState): void {
  // A competent player: staff everything affordable, keep everyone working.
  checkGymUnlock(state);
  const type = state.gymOffer?.[0];
  if (type) acceptGymOffer(state, type);
  const candidate = state.leaderOffer?.trainerIds[0];
  if (candidate) chooseLeader(state, candidate);

  for (const f of allFacilities()) {
    if (canUpgrade(state, f.id).ok) upgrade(state, f.id);
  }
  for (const gymId of state.gymOrder) {
    if (canHireGymTrainer(state, gymId).ok) hireGymTrainer(state, gymId);
  }

  ensureSeats(state);
  if (eliteUnlocked(state)) {
    for (const seat of state.elite) {
      if (seat.trainerId !== null) continue;
      const t = TYPES.find((x) => canStaff(state, seat.rank, x).ok);
      if (t) staffSeat(state, seat.rank, t);
    }
  }

  autoFillAll(state);

  // What the board is short of, worst first — a Ranger only brings back their
  // own type now, so hiring is how you answer a starved gym.
  const needed = new Map<string, number>();
  for (const t of Object.values(state.trainers)) {
    if (t.kind === "candidate" || t.kind === "ranger" || t.kind === "handler") continue;
    const gap = partyCapOf(t, state) - t.party.length;
    if (gap > 0) needed.set(t.affinity, (needed.get(t.affinity) ?? 0) + gap);
  }

  for (const role of ["ranger", "handler"] as const) {
    while (canHire(state, role).ok) {
      const offer = fieldOffer(state, role);
      if (offer.length === 0) break;
      const useful =
        offer.slice().sort((a, b) => (needed.get(b) ?? 0) - (needed.get(a) ?? 0))[0] ??
        offer[0];
      if (!useful) break;
      const hired = hire(state, role, useful);
      // Keep them working: idle staff draw wages for nothing.
      if (hired.ok) setAutoWork(state, hired.trainerId, true);
    }
    for (const trainer of fieldStaff(state, role)) {
      if (postingFor(state, trainer.id)) continue;
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
      for (const route of [...eligibleRoutes(state)].sort((a, b) => b.levelMax - a.levelMax)) {
        if (canPost(state, route.id, trainer.id).ok) {
          post(state, route.id, trainer.id);
          break;
        }
      }
    }
  }
}

const state = createInitialState(7);
const tally = {
  waves: 0,
  wavesWon: 0,
  badgesLost: 0,
  gauntlets: 0,
  leagueTaken: 0,
  rivals: 0,
  rivalsHeld: 0,
  recruited: 0,
  suspended: 0,
  reinstated: 0,
  departures: 0,
  resignations: 0,
  retirements: 0,
  hatched: 0,
  evolutions: 0,
  caught: 0,
  shifts: 0,
  beaten: 0,
  released: 0,
  upsets: 0,
  earned: 0,
  paid: 0,
};

function absorb(r: TickReport): void {
  tally.waves += r.wavesResolved;
  tally.wavesWon += r.wavesWon;
  tally.badgesLost += r.badgesLost;
  tally.gauntlets += r.gauntlets.length;
  tally.rivals += r.rivals.length;
  tally.rivalsHeld += r.rivals.filter((x) => x.held).length;
  tally.recruited += r.recruited.length;
  tally.suspended += r.suspended.length;
  tally.reinstated += r.reinstated.length;
  tally.departures += r.departures.length;
  tally.resignations += r.resignations.length;
  tally.retirements += r.retirements.length;
  tally.hatched += r.hatched.length;
  tally.evolutions += r.evolutions.length;
  tally.caught += r.caught.length;
  tally.shifts += r.returned.length;
  tally.beaten += r.beaten.length;
  tally.released += r.released.length;
  tally.upsets += r.upsets.length;
  tally.earned += r.earned;
  tally.paid += r.paid;
}

play(state);
for (let s = 0; s < HOURS * 3600; s++) {
  absorb(tick(state, 1));
  if (s % 60 === 0) play(state);
}
tally.leagueTaken = state.leagueTaken;

const bonded = Object.values(state.creatures).filter((c) => c.role !== "retired");
const avgBond = bonded.reduce((a, c) => a + c.bond, 0) / Math.max(1, bonded.length);
const wellBonded = bonded.filter((c) => c.bond >= 0.5).length;
const careerUsed =
  bonded.reduce((a, c) => a + c.careerSpent / Math.max(1, c.careerTotal), 0) /
  Math.max(1, bonded.length);

const pad = (v: unknown, n: number) => String(v).padStart(n);
const row = (label: string, value: unknown, note = "") =>
  console.log(`  ${label.padEnd(22)} ${pad(value, 12)}  ${note}`);

console.log(`\n  ${HOURS}h, one seed, a player who staffs everything they can afford\n`);
console.log("  ── The board ──────────────────────────────────────────────");
row("Tier", state.tier);
row("Gyms", state.gymOrder.length);
row("Renown", Math.round(state.renown));
row("Peak renown", Math.round(state.peakRenown));
row("Hall of Fame", state.hall.length);
row("Trainers", Object.keys(state.trainers).length);
row("Creatures", Object.keys(state.creatures).length);

console.log("\n  ── The economy ────────────────────────────────────────────");
row("Banked", Math.round(state.money));
row("Earned", Math.round(tally.earned));
row("Wages paid", Math.round(tally.paid));
row("Wages as % of income", `${((tally.paid / Math.max(1, tally.earned)) * 100).toFixed(1)}%`);

console.log("\n  ── What actually happens ──────────────────────────────────");
row("Challenges", tally.waves, `${((tally.wavesWon / Math.max(1, tally.waves)) * 100).toFixed(1)}% held`);
row("Badges lost", tally.badgesLost);
row("Upsets", tally.upsets, "bond doing its job");
row("Rivals", tally.rivals, `${tally.rivalsHeld} turned away, ${tally.recruited} hired`);
row("Gauntlets", tally.gauntlets, `${tally.leagueTaken} lost`);
row("Ranger shifts", tally.shifts, `${tally.caught} caught`);
row("Handler beatings", tally.beaten);
row("Evolutions", tally.evolutions);
row("Eggs hatched", tally.hatched);
row("Retirements", tally.retirements);
row("Suspensions", tally.suspended, `${tally.reinstated} returned`);
row("Departures", tally.departures);
row("Resignations", tally.resignations);
row("Released", tally.released);

console.log("\n  ── The creatures ──────────────────────────────────────────");
row("Average bond", avgBond.toFixed(2));
row("Bonded past 0.5", `${wellBonded}/${bonded.length}`);
{
  const fighting = bonded.filter((c) => c.role === "party");
  const avg = fighting.reduce((a, c) => a + c.bond, 0) / Math.max(1, fighting.length);
  row("Bond (fighting)", avg.toFixed(2), `${fighting.filter((c) => c.bond >= 0.5).length}/${fighting.length} past the bar`);
}
row("Career used (all)", `${(careerUsed * 100).toFixed(1)}%`);
{
  const fighting = bonded.filter((c) => c.role === "party");
  const used =
    fighting.reduce((a, c) => a + c.careerSpent / Math.max(1, c.careerTotal), 0) /
    Math.max(1, fighting.length);
  const worst = Math.max(0, ...fighting.map((c) => c.careerSpent / Math.max(1, c.careerTotal)));
  row("Career used (fighting)", `${(used * 100).toFixed(1)}%`, `worst ${(worst * 100).toFixed(0)}%`);
  const battles = fighting.reduce((a, c) => a + c.wins + c.losses, 0) / Math.max(1, fighting.length);
  row("Battles each", Math.round(battles));
}
row("Day-Care slots", `${state.dayCare.length}/${constants.DAYCARE.slots}`);

console.log("\n  ── Promotion ──────────────────────────────────────────────");
const check = readiness(state);
console.log(`  path ${check.path}, ${check.ok ? "READY" : "blocked"}`);
for (const b of check.blockers) console.log(`    · ${b}`);
console.log(
  `  gyms that have held a bonded core: ${state.gymOrder.filter((id) => state.gyms[id]?.everBonded).length}/${state.gymOrder.length}`,
);

console.log("\n  ── The Hall ───────────────────────────────────────────────");
row("Legends", state.legends.length);
for (const e of [...state.legends].sort((a, b) => b.wins - a.wins).slice(0, 5)) {
  console.log(
    `    ${e.name.padEnd(12)} ${String(e.wins).padStart(4)}W  bond ${e.bond.toFixed(2)}  served ${Math.round((e.served / e.careerTotal) * 100)}%`,
  );
}

console.log("\n  ── Bond, per gym ──────────────────────────────────────────");
for (const id of state.gymOrder) {
  const gym = state.gyms[id];
  if (!gym?.leaderId) continue;
  const party = partyOf(state, gym.leaderId);
  const avg = party.reduce((a, c) => a + c.bond, 0) / Math.max(1, party.length);
  const each = party
    .map((c) => `${c.bond.toFixed(2)}/${c.wins}w`)
    .join(" ");
  console.log(`  ${gym.type.padEnd(9)} mean ${avg.toFixed(2)}  ${each}`);
}

console.log("\n  ── Short-handed ───────────────────────────────────────────");
const short = state.gymOrder.flatMap((id) => {
  const gym = state.gyms[id];
  if (!gym) return [];
  return [...gym.trainerIds, ...(gym.leaderId ? [gym.leaderId] : [])]
    .map((tid) => state.trainers[tid])
    .filter((t) => t !== undefined && partyOf(state, t.id).length < partyCapOf(t, state))
    .map((t) => `${t!.affinity} ${partyOf(state, t!.id).length}/${partyCapOf(t!, state)}`);
});
console.log(`  ${short.length === 0 ? "nobody" : short.join(", ")}\n`);
