import { GYM_TRAINERS, META } from "./constants.js";
import { emptyThreatReport } from "./factory.js";
import { uniformTally } from "../data/typechart.js";
import { catalog } from "../data/catalog.js";
import { refreshPower } from "./systems/growth.js";
import { SAVE_VERSION } from "./state.js";
import type { LeagueState } from "./types.js";

/**
 * Save migration and repair.
 *
 * The state is a plain object with no schema system, which is what makes
 * save/load a one-liner — and the price of that is this file. Two layers:
 *
 *   1. `migrate` — explicit, versioned reshaping. Add a step per version bump
 *      and never delete one; players return with old saves.
 *   2. `normalize` — a defensive backfill that runs on *every* load regardless
 *      of version.
 *
 * Layer 2 exists because of a real incident: Block 2 added `routes`,
 * `expeditions` and `undercardSlots` without bumping the version, so old saves
 * sailed through the version check and then crashed on the first missing field,
 * taking the whole app down with them. A missing field should degrade, never
 * blank the screen.
 */

type Loose = Record<string, unknown>;

function isObject(v: unknown): v is Loose {
  return typeof v === "object" && v !== null;
}

/**
 * Backfill anything absent. Runs on every load, so forgetting a migration
 * costs a default value rather than a white screen.
 */
export function normalize(raw: unknown): LeagueState | null {
  if (!isObject(raw)) return null;
  const state = raw as unknown as LeagueState & Loose;

  // Core collections — without these there is no game to repair.
  if (!isObject(state.creatures)) return null;
  if (!isObject(state.gyms)) return null;
  if (!Array.isArray(state.gymOrder)) return null;

  state.trainers ??= {};
  state.nextIds ??= {};
  state.log ??= [];
  state.time ??= 0;
  state.money ??= 0;
  state.tier ??= "regional";
  state.rng ??= { seed: 1 };

  state.meta ??= {
    weights: uniformTally(),
    nextDriftIn: META.driftIntervalSeconds,
    season: 0,
  };
  state.meta.weights ??= uniformTally();

  // Renown was called `prestige` before Block 3.
  const loose = state as Loose;
  if (state.renown === undefined && typeof loose.prestige === "number") {
    state.renown = loose.prestige;
  }
  state.renown ??= 0;
  state.peakRenown ??= state.renown;

  // Scouting became staffed Catchers: no offers, no banked charges. Intel
  // survives as a purchase, so whatever the league already knew it keeps.
  state.routeIntel ??= {};
  state.postings ??= [];
  delete loose.scoutOffer;
  delete loose.scoutCharges;
  delete loose.nextChargeIn;
  delete loose.routes;
  delete loose.expeditions;
  delete loose.expeditionSlots;

  // Block 1 late additions.
  state.gymOffer ??= null;
  state.gymOfferMinimized ??= false;
  state.leaderOffer ??= null;
  state.hall ??= [];
  state.facilities ??= {};
  // The Elite Four were briefly a list of seated creature ids; they are seats
  // held by trainers now. An old-shaped value is discarded rather than coerced.
  if (!Array.isArray(state.elite) || state.elite.some((e) => typeof e === "string")) {
    state.elite = [];
  }
  state.gauntletCooldown ??= 0;
  state.autoFillIn ??= 0;
  state.battles ??= {};
  state.rivals ??= [];
  state.rivalCooldown ??= 0;
  state.doctrineChanges ??= 0;
  state.retiredRivals ??= [];
  state.leagueTaken ??= 0;
  state.usurperId ??= null;
  state.titleLost ??= false;
  state.grudges ??= [];
  state.lastSeenAt ??= 0;
  state.dayCare ??= [];
  state.eggProgress ??= 0;

  // Trainers gained parties and a kind when every defender became a trainer.
  for (const trainer of Object.values(state.trainers)) {
    if (!trainer) continue;
    trainer.kind ??= "leader";
    trainer.partyCap ??= 6;
    trainer.party ??= trainer.signatureId ? [trainer.signatureId] : [];
    trainer.party = trainer.party
      .filter((id) => state.creatures[id] !== undefined)
      .slice(0, 6);

    // The morale staircase. Existing staff start on a clean record.
    trainer.standing ??= 1;
    trainer.strain ??= 0;
    trainer.suspensions ??= 0;
    trainer.suspendedUntil ??= null;
    trainer.demotionLockedUntil ??= null;
    trainer.origin ??= "hired";
  }

  for (const gym of Object.values(state.gyms)) {
    if (!gym) continue;
    gym.trainerIds ??= [];
    gym.trainerSlots ??= GYM_TRAINERS.startingSlots;
    gym.waveCooldown ??= 0;
    gym.threat ??= emptyThreatReport();
    gym.threat.distribution ??= emptyThreatReport().distribution;
  }

  for (const creature of Object.values(state.creatures)) {
    if (!creature) continue;
    // Pre-Block-2 saves nicknamed every wild catch; that is still a valid value.
    if (creature.nickname === undefined) creature.nickname = null;
    creature.types ??= [];
    creature.wins ??= 0;
    creature.losses ??= 0;
    creature.parents ??= null;
    creature.generation ??= 0;
    creature.pinned ??= false;
    creature.benched ??= false;
    creature.owned ??= true;

    // Roles collapsed to party/reserve/retired when everything became a
    // trainer's party. Old roles map onto the nearest survivor.
    const role = creature.role as string;
    if (role === "bonded" || role === "signature" || role === "elite") {
      creature.role = "party";
    } else if (role === "undercard") {
      creature.role = "reserve";
    }

    // Levels arrived in Block 4. Pre-level creatures start at 1 with the power
    // they already had, so nobody is nerfed by the upgrade.
    creature.level ??= 1;
    creature.xp ??= 0;
    if (creature.powerRoll === undefined) {
      const species = catalog.get(creature.speciesId);
      creature.powerRoll = species && species.power > 0
        ? creature.power / species.power
        : 1;
    }
    refreshPower(creature);
  }

  // A posting whose trainer or partner no longer exists is a ghost that would
  // tick forever against nothing.
  // Postings became role-aware and crew-based: a Catcher's single partner is
  // now just the first member of their party, exactly like an Evolver's four.
  for (const p of state.postings) {
    p.resting ??= false;
    p.role ??= "catcher";
    p.earned ??= 0;
    p.beaten ??= 0;
    const legacy = (p as unknown as { partnerId?: string }).partnerId;
    const trainer = legacy ? state.trainers[p.trainerId] : undefined;
    if (legacy && trainer && !trainer.party.includes(legacy)) trainer.party = [legacy];
    delete (p as unknown as { partnerId?: string }).partnerId;
  }
  state.postings = state.postings.filter(
    (p) => (state.trainers[p.trainerId]?.party.length ?? 0) > 0,
  );
  state.fieldOffer ??= { catcher: [], evolver: [] };

  // Drop gym ids that no longer resolve, so the board cannot render a hole.
  state.gymOrder = state.gymOrder.filter((id) => state.gyms[id] !== undefined);

  state.dayCare = state.dayCare.filter((s) => state.creatures[s.creatureId] !== undefined);

  state.version = SAVE_VERSION;
  return state;
}

/**
 * Versioned migration steps, oldest first. Each takes the state as the previous
 * version left it and returns it shaped for the next.
 */
const STEPS: Record<number, (state: LeagueState) => LeagueState> = {
  // v1 → v2: Block 2 introduced routes, expeditions and bench capacity.
  // `normalize` does the actual backfilling; this step exists so the version
  // number advances honestly and the intent is recorded.
  1: (state) => state,
  // v2 → v3: prestige became renown, and timed expeditions became a redrawing
  // offer with banked charges. `normalize` performs the reshaping; these steps
  // record that the version moved and why.
  2: (state) => state,
  // v3 → v4: creatures gained levels, xp and a stable power roll; species data
  // gained evolution chains. `normalize` backfills; this records the bump.
  3: (state) => state,
  // v4 → v5: the Hall of Fame arrived with the promotion loop.
  4: (state) => state,
  // v5 → v6: facilities, bench upgrades, and the board grew to eight gyms.
  5: (state) => state,
  // v6 → v7: breeding, and the Elite Four unlock after eight gyms.
  6: (state) => state,
  // v7 → v8: the Elite Four became staffed seats with a gauntlet, and the
  // Day-Care became a training and breeding post rather than a retiree shelf.
  7: (state) => state,
  // v8 → v9: every defender became a trainer with a party of six, the undercard
  // became junior Gym Trainers, and the box became inert storage.
  8: (state) => state,
  // v9 → v10: leader candidates, junior party caps, and a minimisable gym offer.
  9: (state) => state,
  // v10 → v11: one creature per evolution line in a party, and benching.
  10: (state) => state,
  // v11 → v12: named rivals with a warning window.
  11: (state) => state,
  // v12 → v13: mid-game doctrine retraining.
  12: (state) => state,
  // v13 → v14: party-vs-party challenges, Gens 1-3, creature ownership.
  13: (state) => state,
  // v14 → v15: real base stats, HP, and watchable battles.
  14: (state) => state,
  // v15 → v16: the morale staircase — standing, strain, suspensions, demotion.
  15: (state) => state,
  // v16 → v17: forced recruitment, grudges, and the second promotion path.
  16: (state) => state,
  // v17 → v18: Catchers replace paid scouting. Charges and offers are gone.
  17: (state) => state,
  // v18 → v19: Evolvers, crew-based postings, and drawn hiring offers.
  18: (state) => state,
};

export function migrateState(
  raw: unknown,
  fromVersion: number,
): { state: LeagueState; migrated: boolean } | null {
  const normalized = normalize(raw);
  if (!normalized) return null;

  let version = fromVersion;
  let state = normalized;
  let migrated = false;

  while (version < SAVE_VERSION) {
    const step = STEPS[version];
    if (step) {
      state = step(state);
      migrated = true;
    }
    version += 1;
  }

  state.version = SAVE_VERSION;
  return { state, migrated };
}
