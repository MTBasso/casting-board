import { DESK, MORALE, PROMOTION } from "../constants.js";
import { built as dayCareBuilt, freeSlots } from "./daycare.js";
import { eliteUnlocked } from "./elite.js";
import { fieldStaff, postingFor, reserveCeiling, usableReserve } from "./field.js";
import { isSuspended } from "./morale.js";
import { partyCapOf } from "./party.js";
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
  title: string;
  detail: string;
  where: DeskTarget;
}

export function pendingDecisions(state: LeagueState): Decision[] {
  const out: Decision[] = [];

  // --- The board ----------------------------------------------------------

  if (state.gymOffer && state.gymOffer.length > 0) {
    out.push({
      id: "gym-offer",
      urgency: "waiting",
      title: "A new gym is open to you",
      detail: "Choose the type it will defend. You cannot change it afterwards.",
      where: "gyms",
    });
  }

  if (state.leaderOffer && state.leaderOffer.trainerIds.length > 0) {
    out.push({
      id: "leader-offer",
      urgency: "waiting",
      title: "Leader candidates are waiting",
      detail: "Three trainers have applied. Each brings their own partner.",
      where: "gyms",
    });
  }

  for (const gymId of state.gymOrder) {
    const gym = state.gyms[gymId];
    if (!gym) continue;

    if (!gym.leaderId) {
      out.push({
        id: `no-leader-${gymId}`,
        urgency: "urgent",
        title: `${gym.name} has no Leader`,
        detail: "It forfeits every challenge until somebody stands there.",
        where: "gyms",
      });
      continue;
    }

    const party = state.trainers[gym.leaderId]?.party.length ?? 0;
    if (party === 0) {
      out.push({
        id: `empty-${gymId}`,
        urgency: "urgent",
        title: `${gym.name} is fielding nobody`,
        detail: `No ${gym.type} creatures to cast. Trade for one, or work a route that supplies them.`,
        where: "pc",
      });
    }
  }

  // --- People -------------------------------------------------------------

  for (const trainer of Object.values(state.trainers)) {
    if (trainer.kind === "candidate") continue;

    if (isSuspended(state, trainer)) {
      out.push({
        id: `suspended-${trainer.id}`,
        urgency: "urgent",
        title: `${trainer.name} is suspended`,
        detail: "Their post stands empty, and a challenger walks straight through it.",
        where: trainer.kind === "elite" || trainer.kind === "champion" ? "elite" : "gyms",
      });
    } else if (trainer.strain > MORALE.strainToSuspend * 0.5) {
      out.push({
        id: `strain-${trainer.id}`,
        urgency: "waiting",
        title: `${trainer.name} is close to walking`,
        detail: "Pay them properly, or step them down to something they can carry.",
        where: trainer.kind === "elite" || trainer.kind === "champion" ? "elite" : "gyms",
      });
    }
  }

  const idle = [...fieldStaff(state, "ranger"), ...fieldStaff(state, "handler")].filter(
    (t) => !postingFor(state, t.id),
  );
  if (idle.length > 0) {
    out.push({
      id: "idle-field",
      urgency: "idle",
      title: `${idle.length} field staff on the payroll and not working`,
      detail: `${idle.map((t) => t.name).join(", ")} draw wages either way.`,
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
        title: `${empty} Elite seat${empty === 1 ? "" : "s"} unstaffed`,
        detail: "An empty seat is a free pass on the way to taking your league.",
        where: "elite",
      });
    }
  }

  // --- Endings ------------------------------------------------------------

  const retirees = Object.values(state.creatures).filter((c) => c.role === "retired");
  if (retirees.length > 0 && dayCareBuilt(state) && freeSlots(state) > 0) {
    out.push({
      id: "daycare-free",
      urgency: "waiting",
      title: `${retirees.length} retired, and the Day-Care has room`,
      detail:
        "A long career makes better offspring. This is what retirement was for.",
      where: "daycare",
    });
  } else if (retirees.length >= DESK.retireesBeforeNudge && !dayCareBuilt(state)) {
    out.push({
      id: "daycare-unbuilt",
      urgency: "idle",
      title: "Careers are ending with nowhere to go",
      detail: "The Day-Care turns a finished career into the next generation.",
      where: "facilities",
    });
  }

  const check = readiness(state);
  if (check.ok) {
    out.push({
      id: "promotion",
      urgency: "waiting",
      title:
        check.path === "forced"
          ? "You can leave for the next tier"
          : "The league is ready to promote",
      detail:
        check.path === "forced"
          ? "Take the tier now with the Champion who beat you, or stay and win the title back."
          : `Induct up to ${PROMOTION.inductCount} from the Hall. They become Mentors, and they are all that survives.`,
      where: "elite",
    });
  }

  // --- Supply -------------------------------------------------------------

  if (usableReserve(state) >= reserveCeiling(state)) {
    out.push({
      id: "box-full",
      urgency: "waiting",
      title: "The box is full and catching has stopped",
      detail: "Cast what you have, or trade the types nobody can field.",
      where: "pc",
    });
  }

  const short = state.gymOrder.flatMap((id) => {
    const gym = state.gyms[id];
    if (!gym) return [];
    return [...gym.trainerIds, ...(gym.leaderId ? [gym.leaderId] : [])]
      .map((tid) => state.trainers[tid])
      .filter((t) => t !== undefined && t.party.length > 0 && t.party.length < partyCapOf(t, state));
  });
  if (short.length > 0) {
    out.push({
      id: "short-handed",
      urgency: "idle",
      title: `${short.length} trainer${short.length === 1 ? "" : "s"} fielding less than they could`,
      detail: "Empty slots fill themselves when the box holds the right type.",
      where: "pc",
    });
  }

  // --- Threats ------------------------------------------------------------

  const rival = nextRival(state);
  if (rival) {
    const mins = Math.ceil(timeUntil(state, rival) / 60);
    out.push({
      id: `rival-${rival.id}`,
      urgency: mins <= 10 ? "urgent" : "waiting",
      title: `${rival.name} arrives in ${mins}m`,
      detail: `${rival.type} type, coming for ${state.gyms[rival.gymId]?.name ?? "a gym"}.`,
      where: "gyms",
    });
  }

  const rank = { urgent: 0, waiting: 1, idle: 2 } as const;
  return out.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}
