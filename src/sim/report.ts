import type { TickReport } from "./types.js";

/**
 * What happened during one tick, recorded rather than assembled.
 *
 * `TickReport` used to be handed to every system as a mutable struct, and each
 * one reached in and pushed. Nothing connected *declaring* a field to *filling*
 * it, and three fields shipped declared-but-never-written:
 *
 *   - `returned` was read by `tallyTick`, so the objective spine dead-ended at
 *     its third step for months while every test stayed green.
 *   - `upsets` was read by the log, so bond's only visible payoff was invisible.
 *   - `released` was neither written nor read — a feature removed years of
 *     commits ago that left its field behind.
 *
 * So the struct is now private and systems call verbs. A field with no verb
 * cannot be filled, a verb with no caller is a dead export, and
 * `report.test.ts` fails the build on either — which is the guarantee the
 * struct never offered.
 *
 * The verbs also hold the invariants that used to live in whoever remembered
 * them: a challenge always counts as resolved, a held one always counts as won.
 */
export class Report {
  private readonly out: TickReport = {
    wavesResolved: 0,
    wavesWon: 0,
    earned: 0,
    paid: 0,
    badgesLost: 0,
    retirements: [],
    resignations: [],
    caught: [],
    evolutions: [],
    hatched: [],
    upsets: [],
    rivals: [],
    revives: [],
    recruited: [],
    gauntlets: [],
    suspended: [],
    reinstated: [],
    usurped: null,
    departures: [],
    beaten: [],
    returned: [],
  };

  // -- Challenges ----------------------------------------------------------

  /**
   * One challenge, resolved.
   *
   * Held and resolved move together because they always did — every call site
   * incremented both, and the one that forgot would have been a silent
   * miscount rather than an error.
   */
  challenge(held: boolean, receipts: number): void {
    this.out.wavesResolved += 1;
    this.out.earned += receipts;
    if (held) this.out.wavesWon += 1;
    else this.out.badgesLost += 1;
  }

  /** A span of challenges resolved at once, as the offline pass does it. */
  challenges(resolved: number, held: number, receipts: number): void {
    this.out.wavesResolved += resolved;
    this.out.wavesWon += held;
    this.out.badgesLost += resolved - held;
    this.out.earned += receipts;
  }

  /** Money in from somewhere that is not a gym gate. */
  took(amount: number): void {
    this.out.earned += amount;
  }

  /** Wages actually paid, which is not always what was owed. */
  paid(amount: number): void {
    this.out.paid += amount;
  }

  // -- Creatures -----------------------------------------------------------

  caught(creatureId: string): void {
    this.out.caught.push(creatureId);
  }

  retired(name: string): void {
    this.out.retirements.push(name);
  }

  evolved(text: string): void {
    this.out.evolutions.push(text);
  }

  hatched(name: string): void {
    this.out.hatched.push(name);
  }

  revived(name: string): void {
    this.out.revives.push(name);
  }

  /** A result that contradicted the matchup — what bond actually buys down. */
  upset(name: string, bond: number, won: boolean): void {
    this.out.upsets.push({ name, bond, won });
  }

  // -- People --------------------------------------------------------------

  resigned(name: string): void {
    this.out.resignations.push(name);
  }

  suspended(name: string, count: number): void {
    this.out.suspended.push({ name, count });
  }

  reinstated(name: string): void {
    this.out.reinstated.push(name);
  }

  /** Walked out, and now holds a grudge. */
  departed(name: string): void {
    this.out.departures.push(name);
  }

  // -- The field -----------------------------------------------------------

  /** A crew home from a trip that ran its course. */
  returned(name: string, caught: number): void {
    this.out.returned.push({ name, caught });
  }

  /** A crew home early, from ground over their heads. */
  beaten(name: string): void {
    this.out.beaten.push(name);
  }

  // -- The top of the ladder -----------------------------------------------

  rival(name: string, held: boolean, gymId: string): void {
    this.out.rivals.push({ name, held, gymId });
  }

  /** A rival who lost and joined the league. */
  recruited(name: string): void {
    this.out.recruited.push(name);
  }

  gauntlet(cleared: number, tookLeague: boolean, receipts: number): void {
    this.out.gauntlets.push({ cleared, tookLeague, receipts });
  }

  /** Took the title. There can only be one in a tick, so this is not a list. */
  usurped(name: string): void {
    this.out.usurped = name;
  }

  // -- Reading it ----------------------------------------------------------

  /**
   * The finished report.
   *
   * Not frozen: the offline pass merges spans of exact ticks into one total,
   * and the store keeps a running digest across ticks. Both read it as data
   * afterwards; neither writes through this seam.
   */
  done(): TickReport {
    return this.out;
  }
}

export function newReport(): Report {
  return new Report();
}
