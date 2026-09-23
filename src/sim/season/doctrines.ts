/**
 * Between-Ante shop — REDESIGN.md "Economy/build loop" and "Shop rarity
 * tiers". Doctrine effects are a small, concrete starting catalog, not the
 * full item/trait system REDESIGN.md describes (Poké Balls, healing items,
 * TFT-style composition bonuses aren't modeled yet) — enough to make the
 * shop a real decision without building the whole economy in one slice.
 *
 * Reroll and shop currency are deferred along with the rest of the economy:
 * every shop visit currently offers 3 free picks, one of which is taken.
 */
import { weighted } from "../rng.js";
import type { FighterState } from "./battle.js";
import type { Doctrine, Rarity, RunState } from "./types.js";

function scalePower(mult: number) {
  return (party: readonly FighterState[]): FighterState[] =>
    party.map((f) => ({ ...f, power: f.power * mult }));
}

export const DOCTRINES: readonly Doctrine[] = [
  {
    id: "iron_resolve",
    name: "Iron Resolve",
    rarity: "common",
    apply: scalePower(1.05),
  },
  {
    id: "sturdy_frames",
    name: "Sturdy Frames",
    rarity: "common",
    apply: (party) => party.map((f) => ({ ...f, maxHp: Math.round(f.maxHp * 1.1) })),
  },
  {
    id: "kindred_bond",
    name: "Kindred Bond",
    rarity: "rare",
    // TFT-style composition bonus: members sharing a type with a partymate hit harder.
    apply: (party) => {
      const typeCounts = new Map<string, number>();
      for (const f of party) for (const t of f.types) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
      return party.map((f) => {
        const inSynergy = f.types.some((t) => (typeCounts.get(t) ?? 0) >= 2);
        return inSynergy ? { ...f, power: f.power * 1.15 } : f;
      });
    },
  },
  {
    id: "overclock",
    name: "Overclock",
    rarity: "rare",
    apply: (party) =>
      party.map((f) => ({
        ...f,
        power: f.power * 1.15,
        maxHp: Math.round(f.maxHp * 0.8),
        hp: Math.min(f.hp, Math.round(f.maxHp * 0.8)),
      })),
  },
  {
    id: "ace_up_sleeve",
    name: "Ace Up Sleeve",
    rarity: "legendary",
    apply: (party) => {
      if (party.length === 0) return party;
      let aceIndex = 0;
      for (let i = 1; i < party.length; i++) if (party[i]!.power > party[aceIndex]!.power) aceIndex = i;
      return party.map((f, i) => (i === aceIndex ? { ...f, power: f.power * 1.3 } : f));
    },
  },
  {
    id: "phoenix_clause",
    name: "Phoenix Clause",
    rarity: "legendary",
    // No stat effect of its own — see sacrifice.ts. Doesn't stack with itself
    // or with a Sacrifice Pokémon (REDESIGN.md "Extra-life stacking").
    apply: (party) => party,
    grantsExtraLife: true,
  },
];

const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, rare: 30, legendary: 10 };

/** Whether the party already has 2+ members sharing a type — a partial payoff for kindred_bond. */
function hasTypeSynergyPotential(party: readonly FighterState[]): boolean {
  const counts = new Map<string, number>();
  for (const f of party) for (const t of f.types) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.values()].some((n) => n >= 2);
}

function weightFor(doctrine: Doctrine, run: RunState): number {
  let w = RARITY_WEIGHT[doctrine.rarity];
  // Owning half of a payoff raises the odds of the piece that completes it —
  // REDESIGN.md's probed shop-weighting fix, applied to the one synergy
  // Doctrine this catalog has so far.
  if (doctrine.id === "kindred_bond" && hasTypeSynergyPotential(run.party)) w *= 2.5;
  return w;
}

export const SHOP_OFFER_SIZE = 3;

/** Draws a shop offer: up to SHOP_OFFER_SIZE distinct, not-yet-owned Doctrines, rarity- and synergy-weighted. */
export function offerDoctrines(run: RunState): Doctrine[] {
  const rng = run.rng;
  const available = DOCTRINES.filter((d) => !run.doctrines.includes(d.id));
  const offer: Doctrine[] = [];
  const remaining = [...available];
  for (let i = 0; i < SHOP_OFFER_SIZE && remaining.length > 0; i++) {
    const weights: Record<string, number> = {};
    for (const d of remaining) weights[d.id] = weightFor(d, run);
    const pickedId = weighted(rng, weights);
    const idx = remaining.findIndex((d) => d.id === pickedId);
    const [picked] = remaining.splice(idx, 1);
    if (picked) offer.push(picked);
  }
  return offer;
}

export type ShopPolicy = (offer: readonly Doctrine[], run: RunState) => Doctrine;

const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, legendary: 2 };

/** Headless default: always take the rarest thing on offer. */
export function greedyRarityPolicy(offer: readonly Doctrine[]): Doctrine {
  const best = offer.reduce((a, b) => (RARITY_RANK[b.rarity] > RARITY_RANK[a.rarity] ? b : a));
  return best;
}

/** Applies a Doctrine, marks it owned, and can't be called with an offer that isn't actually on it. */
export function pickDoctrine(run: RunState, offer: readonly Doctrine[], doctrine: Doctrine): RunState {
  if (!offer.some((d) => d.id === doctrine.id)) {
    throw new Error(`pickDoctrine: ${doctrine.id} was not part of the offer`);
  }
  return {
    ...run,
    party: doctrine.apply(run.party),
    doctrines: [...run.doctrines, doctrine.id],
  };
}

/**
 * Rest-and-recover between Antes: no healing-item economy yet, so the shop
 * visit itself fully mends the party. Leaves an unhatched egg alone — its
 * hp: 0 is what keeps it unusable in battle until growth.ts hatches it.
 */
export function restParty(party: readonly FighterState[]): FighterState[] {
  return party.map((f) => (f.isEgg ? f : { ...f, hp: f.maxHp, fatigue: 0 }));
}
