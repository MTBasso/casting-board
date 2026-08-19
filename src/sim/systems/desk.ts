import { DESK, MORALE, PROMOTION } from "../constants.js";
import { built as dayCareBuilt, freeSlots } from "./daycare.js";
import { eliteUnlocked } from "./elite.js";
import { crewName } from "./crews.js";
import { expeditionOf } from "./expeditions.js";
import { reserveCeiling, usableReserve } from "./roster.js";
import { isSuspended } from "./morale.js";
import { couldFill, partyCapOf } from "./party.js";
import { readiness } from "./promotion.js";
import { nextRival, timeUntil } from "./rivals.js";
import type { LeagueState } from "../types.js";

/**
 * What the league needs from you.
 *
 * The game has never asked the player for anything. Every decision it holds is
 * available on some screen, and a decision nobody surfaces is a decision that
 * does not happen — measured over a hundred and sixty retirements, the Day-Care
 * was used **zero times**, not because it was hard but because nothing ever
 * mentioned it.
 *
 * So this is derived rather than authored: it reads the league and reports what
 * is standing open. It lives in the sim because these are rules about the
 * league, not about a screen — the Desk renders them, it does not decide them.
 */

/** Where a decision gets resolved. The UI maps these to its tabs. */
export type DeskTarget =
  | "gyms"
  | "pc"
  | "field"
  | "elite"
  | "hall"
  | "daycare"
  | "facilities";

export interface Decision {
  id: string;
  /** `urgent` is something losing you the league right now. */
  urgency: "urgent" | "waiting" | "idle";
  /** Keys, not sentences — the sim has no language. */
  title: string;
  detail: string;
  params?: Record<string, string | number>;
  where: DeskTarget;
}

export function pendingDecisions(state: LeagueState): Decision[] {
  const out: Decision[] = [];
  const say = (
    id: string,
    urgency: Decision["urgency"],
    stem: string,
    where: DeskTarget,
    params?: Record<string, string | number>,
  ) => {
    out.push(
      params
        ? { id, urgency, title: `${stem}.title`, detail: `${stem}.detail`, params, where }
        : { id, urgency, title: `${stem}.title`, detail: `${stem}.detail`, where },
    );
  };

  // --- The board ----------------------------------------------------------

  if (state.gymOffer && state.gymOffer.length > 0) {
    say("gym-offer", "waiting", "decision.gymOffer", "gyms");
  }
  if (state.leaderOffer && state.leaderOffer.trainerIds.length > 0) {
    say("leader-offer", "waiting", "decision.leaderOffer", "gyms");
  }

  for (const gymId of state.gymOrder) {
    const gym = state.gyms[gymId];
    if (!gym) continue;

    if (!gym.leaderId) {
      say(`no-leader-${gymId}`, "urgent", "decision.noLeader", "gyms", { gym: gym.name });
      continue;
    }
    if ((state.trainers[gym.leaderId]?.party.length ?? 0) === 0) {
      say(`empty-${gymId}`, "urgent", "decision.emptyGym", "pc", {
        gym: gym.name,
        type: gym.type,
      });
    }
  }

  // --- People -------------------------------------------------------------

  for (const trainer of Object.values(state.trainers)) {
    if (trainer.kind === "candidate") continue;
    const where: DeskTarget =
      trainer.kind === "elite" || trainer.kind === "champion" ? "elite" : "gyms";

    if (isSuspended(state, trainer)) {
      say(`suspended-${trainer.id}`, "urgent", "decision.suspended", where, {
        name: trainer.name,
      });
    } else if (trainer.strain > MORALE.strainToSuspend * 0.5) {
      say(`strain-${trainer.id}`, "waiting", "decision.strain", where, {
        name: trainer.name,
      });
    }
  }

  const idle = state.crews.filter((c) => !expeditionOf(state, c.id));
  if (idle.length > 0) {
    out.push({
      id: "idle-crews",
      urgency: "idle",
      title: "decision.idleCrews.title",
      detail: "decision.idleCrews.detail",
      params: { n: idle.length },
      where: "field",
    });
  }

  for (const trip of state.expeditions) {
    if (!trip.pending) continue;
    out.push({
      id: `choice-${trip.crewId}`,
      urgency: "urgent",
      title: "decision.choice.title",
      detail: trip.pending.prompt,
      ...(trip.pending.promptParams ? { params: trip.pending.promptParams } : {}),
      where: "field",
    });
  }

  // --- The Elite ----------------------------------------------------------

  if (eliteUnlocked(state)) {
    const empty = state.elite.filter((s) => s.trainerId === null).length;
    if (empty > 0) {
      out.push({
        id: "elite-empty",
        urgency: "urgent",
        title: "decision.eliteEmpty.title",
        detail: "decision.eliteEmpty.detail",
        params: { n: empty },
        where: "elite",
      });
    }
  }

  // --- Endings ------------------------------------------------------------

  const retirees = Object.values(state.creatures).filter((c) => c.role === "retired");
  if (retirees.length > 0 && dayCareBuilt(state) && freeSlots(state) > 0) {
    say("daycare-free", "waiting", "decision.daycareFree", "daycare", {
      n: retirees.length,
    });
  } else if (retirees.length >= DESK.retireesBeforeNudge && !dayCareBuilt(state)) {
    say("daycare-unbuilt", "idle", "decision.daycareUnbuilt", "facilities");
  }

  const check = readiness(state);
  if (check.ok) {
    say(
      "promotion",
      "waiting",
      check.path === "forced" ? "decision.promotionForced" : "decision.promotionEarned",
      "elite",
      { n: PROMOTION.inductCount },
    );
  }

  // A crew whose standing orders ended is the one Desk item that is genuinely
  // news rather than an alert about neglect: something happened out there, and
  // the reason is the interesting part.
  for (const crew of state.crews) {
    const why = crew.orders?.stoppedBecause;
    if (!why) continue;
    out.push({
      id: `orders-${crew.id}`,
      urgency: why === "floor" || why === "worn" ? "waiting" : "idle",
      title: "decision.ordersStopped.title",
      detail: `decision.ordersStopped.${why}`,
      params: { name: crewName(state, crew) },
      where: "field",
    });
  }

  // --- Supply -------------------------------------------------------------

  if (usableReserve(state) >= reserveCeiling(state)) {
    say("box-full", "waiting", "decision.boxFull", "pc");
  }

  const short = state.gymOrder.flatMap((id) => {
    const gym = state.gyms[id];
    if (!gym) return [];
    return [...gym.trainerIds, ...(gym.leaderId ? [gym.leaderId] : [])]
      .map((tid) => state.trainers[tid])
      .filter(
        (t) =>
          t !== undefined &&
          t.party.length > 0 &&
          t.party.length < partyCapOf(t, state) &&
          // Only when the box could actually fill it. Otherwise this is the
          // supply situation rather than a decision, and it never clears.
          couldFill(state, t),
      );
  });
  if (short.length > 0) {
    out.push({
      id: "short-handed",
      urgency: "idle",
      title: "decision.shortHanded.title",
      detail: "decision.shortHanded.detail",
      params: { n: short.length },
      where: "pc",
    });
  }

  // --- Threats ------------------------------------------------------------

  const rival = nextRival(state);
  if (rival) {
    const mins = Math.ceil(timeUntil(state, rival) / 60);
    say(`rival-${rival.id}`, mins <= 10 ? "urgent" : "waiting", "decision.rival", "gyms", {
      name: rival.name,
      mins,
      type: rival.type,
      gym: state.gyms[rival.gymId]?.name ?? "",
    });
  }

  const rank = { urgent: 0, waiting: 1, idle: 2 } as const;
  return out.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}
