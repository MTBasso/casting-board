/**
 * Sacrifice archetype and extra-life mitigation — slice 4 of the redesign
 * (REDESIGN.md "Failure state" / "Extra-life archetype" / "Extra-life
 * stacking"). Losing a gym ends the season immediately unless one of these
 * fires first, and at most one fires per season no matter how many sources
 * are owned.
 *
 * The Sacrifice archetype isn't a type — it's a themed cross-type roster
 * subset (Ghost/Dark-flavored, per REDESIGN.md), owning one of which is a
 * live extra-life source for as long as it's alive and in the party.
 */
import type { FighterState } from "./battle.js";
import type { RunState } from "./types.js";

/** Curated subset of roster.ts's ROSTER_SLUGS themed around release/sacrifice fiction. */
export const SACRIFICE_SLUGS: readonly string[] = [
  "gengar",
  "dusknoir",
  "mismagius",
  "drifblim",
  "chandelure",
  "hydreigon",
  "zoroark",
  "umbreon",
];

export function isSacrifice(f: FighterState): boolean {
  return SACRIFICE_SLUGS.includes(f.slug);
}

/**
 * A living Sacrifice party member the run could still release, if any —
 * excluding one that's the party's only living member, since releasing it
 * would leave nothing to actually take the "one more chance" with.
 */
function liveSacrificeIndex(party: readonly FighterState[]): number {
  const aliveCount = party.filter((f) => f.hp > 0).length;
  if (aliveCount <= 1) return -1;
  return party.findIndex((f) => f.hp > 0 && isSacrifice(f));
}

export function hasExtraLifeAvailable(run: RunState): boolean {
  if (run.extraLifeUsed) return false;
  return liveSacrificeIndex(run.party) >= 0 || run.doctrines.some((id) => id === "phoenix_clause");
}

/**
 * Consumes the run's one extra life on what would otherwise be a fatal Ante
 * loss. Prefers releasing a Sacrifice Pokémon when one is available — that's
 * the source whose fiction is "it triggers and is released" — falling back
 * to the shop-bought Doctrine, which costs nothing but itself.
 */
export function consumeExtraLife(run: RunState): RunState {
  const sacrificeIndex = liveSacrificeIndex(run.party);
  const party =
    sacrificeIndex >= 0
      ? run.party.filter((_, i) => i !== sacrificeIndex) // released — permanently gone, bench slot freed
      : run.party;
  return { ...run, party, extraLifeUsed: true };
}
