import { createInitialState, tick, constants } from "../src/sim/index.js";
import {
  ROUTES,
  canHireCrew,
  crewName,
  crewSlots,
  canPushOnFrom,
  crewOffer,
  expeditionOf,
  expeditionOn,
  hireCrew,
  isOpen,
  openRoutes,
  send,
  trainableFor,
  acceptGymOffer,
  chooseLeader,
  checkGymUnlock,
  autoFillAll,
  partyOf,
  partyCapOf,
  canUpgrade,
  upgrade,
  allFacilities,
  canHireGymTrainer,
  hireGymTrainer,
  canStaff,
  staffSeat,
  ensureSeats,
  eliteUnlocked,
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

  // Field: keep every crew slot filled and every crew out on ground that suits
  // them. A Ranger brings back only their own type, so hiring is how a starved
  // gym gets answered — and a trip is a real spend, outfitted up front.
  const wanted = new Set(state.gymOrder.map((id) => state.gyms[id]?.type));
  while (canHireCrew(state).ok) {
    const offers = crewOffer(state);
    const useful = offers.find((o) => wanted.has(o.rangerType)) ?? offers[0];
    if (!useful) break;
    if (!hireCrew(state, useful.id).ok) break;
  }

  for (const crew of state.crews) {
    if (expeditionOf(state, crew.id)) continue;

    const ranger = state.trainers[crew.rangerId];
    const free = openRoutes(state).filter((r) => !expeditionOn(state, r.id));
    if (!ranger || free.length === 0) continue;

    const route = [...free].sort(
      (a, b) => (b.supply[ranger.affinity] ?? 0) - (a.supply[ranger.affinity] ?? 0),
    )[0];
    if (!route) continue;

    // Push on when the ground is known and there is somewhere new beyond it.
    const onward = canPushOnFrom(state, route.id)
      ? route.neighbours.find((n) => !isOpen(state, n))
      : undefined;

    const party = trainableFor(state, crew, route)
      .slice(0, 4)
      .map((c) => c.id);

    send(
      state,
      crew.id,
      route.id,
      onward ? "explore" : "work",
      onward ?? null,
      { balls: 12, potions: 6, revives: 2, lures: 2 },
      party,
    );
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

console.log("\n  ── The field ──────────────────────────────────────────────");
row("Crews", `${state.crews.length}/${crewSlots(state)}`);
row("Out now", state.expeditions.length);
row("Map reached", `${state.explored.length}/${ROUTES.length}`);
for (const crew of state.crews) {
  const best = Object.entries(crew.familiar).sort((a, b) => b[1] - a[1])[0];
  const trip = expeditionOf(state, crew.id);
  console.log(
    `    ${crewName(state, crew).padEnd(22)} ${crew.trait.padEnd(11)} ` +
      `${best ? `${best[0]} ${Math.round(best[1] * 100)}%` : "green"}` +
      `${trip ? ` · out on ${trip.routeId} (${trip.kit.balls} balls left)` : " · in"}`,
  );
}
{
  const open = ROUTES.filter((r) => state.explored.includes(r.id));
  console.log(`    reached: ${open.map((r) => r.name).join(", ")}`);
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
