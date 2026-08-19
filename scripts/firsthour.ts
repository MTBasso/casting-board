import {
  createInitialState, tick, acceptGymOffer, chooseLeader, checkGymUnlock,
  objectives, claim, pendingDecisions, canHireCrew, hireCrew, crewOffer,
  openRoutes, send, canSend, autoFillAll, canHireGymTrainer, hireGymTrainer,
  expeditionOf, trainableFor, kitCost,
} from "../src/sim/index.js";
import { TIME_SCALE } from "../src/sim/constants.js";
import type { LeagueState } from "../src/sim/index.js";
import { translate } from "../src/ui/i18n.js";

/**
 * The first hour, as a stranger meets it.
 *
 * Not "is the curve right" — "is there anything to do, and does the game say
 * so". Two players: one who never touches it after choosing a gym, and one who
 * does exactly what the game visibly asks and nothing more.
 */

const T = (k: string, p?: Record<string, string | number>) => translate("en", k, p);
/** Real minutes at the keyboard. The league's clock runs at TIME_SCALE. */
const MARKS = (process.env.MARKS ?? '1,5,15,30,60').split(',').map(Number);

function start(seed: number): LeagueState {
  const s = createInitialState(seed);
  const type = s.gymOffer?.[0];
  if (type) {
    const r = acceptGymOffer(s, type);
    if (!r.ok) throw new Error(`gym: ${r.reason}`);
  }
  const leader = s.leaderOffer?.trainerIds[0];
  if (leader) {
    const r = chooseLeader(s, leader);
    if (!r.ok) throw new Error(`leader: ${r.reason}`);
  }
  return s;
}

function snapshot(s: LeagueState, label: string) {
  const objs = objectives(s);
  const next = objs.find((o) => !o.done);
  const ready = objs.filter((o) => o.done);
  const dec = pendingDecisions(s);
  const owned = Object.values(s.creatures).filter((c) => c.role !== "retired").length;
  console.log(
    `  ${label.padEnd(7)} ₱${Math.round(s.money).toString().padStart(6)}  ren ${Math.round(s.renown).toString().padStart(4)}` +
    `  owned ${String(owned).padStart(3)}  gyms ${s.gymOrder.length}  crews ${s.crews.length}` +
    `  desk ${dec.length}  claimable ${ready.length}`,
  );
  if (next) console.log(`          next: "${T(next.title, next.titleParams)}" ${next.have}/${next.goal}`);
  for (const d of dec.slice(0, 3)) console.log(`          desk: ${T(d.title, d.params)}`);
}

const minuteOf = { n: 0 };

function run(name: string, act: (s: LeagueState) => void) {
  console.log(`\n── ${name} ${"─".repeat(58 - name.length)}`);
  const s = start(7);
  snapshot(s, "0m");
  // One act() per real second of play, so the "player" cannot out-click a human.
  let second = 0;
  for (const mark of MARKS) {
    while (second < mark * 60) {
      tick(s, TIME_SCALE);
      checkGymUnlock(s);
      minuteOf.n = Math.floor(second / 60);
      act(s);
      second++;
    }
    snapshot(s, `${mark}m`);
  }
}

run("A player who does nothing", () => {});

run("A player who does only what the game asks", (s) => {
  for (const o of objectives(s)) if (o.done) claim(s, o.id);
  // The Desk says "a new gym is open to you", so they open it.
  const type = s.gymOffer?.[0];
  if (type) acceptGymOffer(s, type);
  const leader = s.leaderOffer?.trainerIds[0];
  if (leader) chooseLeader(s, leader);
  if (s.crews.length === 0 && canHireCrew(s).ok) {
    const offer = crewOffer(s)[0];
    if (offer) {
      const r = hireCrew(s, offer.id);
      if (!r.ok) console.log(`          !! hireCrew: ${r.reason}`);
    }
  }
  for (const crew of s.crews) {
    if (expeditionOf(s, crew.id)) continue;
    const route = openRoutes(s)[0];
    if (!route) continue;
    const kit = { balls: 20, potions: 5, revives: 2, lures: 1 };
    if (s.money < kitCost(kit)) continue;
    const party = trainableFor(s, crew, route).slice(0, 2).map((c) => c.id);
    const c = canSend(s, crew.id, route.id, "work", null, kit);
    if (c.ok) send(s, crew.id, route.id, "work", null, kit, party);
    else void c;
  }
  for (const g of s.gymOrder) if (canHireGymTrainer(s, g).ok) hireGymTrainer(s, g);
  autoFillAll(s);
});
