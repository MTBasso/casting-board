# Season starters & evolution stones (F1c, F2c)

From: [docs/reviews/starters-and-evolution-2026-09-23.md](../reviews/starters-and-evolution-2026-09-23.md), findings F1 and F2.

## What and why

Two gaps in `src/sim/season`, the roguelike-redesign engine `REDESIGN.md` describes:

1. **F1 — the season's first draft pick had no rarity/stage limit.** `draftOffer()`
   drew pick 1 the same way as picks 2-4, uniformly from the full roster. Only
   8 of the original 100 curated species were both unevolved and non-legendary,
   so a computed `C(92,3)/C(100,3) ≈ 77.7%` of runs opened with a forced
   Legendary-or-fully-evolved "starter." **Already landed in this session**:
   `src/data/roster.ts` grew from 100 to 223 species by adding every missing
   pre-evolution/mid-evolution of a family already in the roster (`bulbasaur`
   was there, `ivysaur`/`venusaur`'s siblings like `charmeleon`, `gastly`,
   `squirtle`, `abra`, etc. were not). Stage-1-non-legendary options went from
   8 to 86, spanning nearly every type. `MENTOR_WEIGHT_BONUS` was bumped 3 → 7
   in `src/sim/season/draft.ts` to keep the Mentor meta-progression signal
   measurable against the bigger pool — confirmed via `career.test.ts`, which
   regressed to a dead heat at the old value and passes again at 7. Both are
   committed to the working tree already; **remaining work is F1c itself**:
   the first draft pick still draws from the *whole* 223-species pool, not
   filtered to the 86 valid starters.
2. **F2 — no evolution mechanic exists in `src/sim/season` at all.** The old
   engine's `tryEvolve`/`gainXp` (`src/sim/systems/growth.ts`) never got a
   counterpart in the redesign; `FighterState` (`src/sim/season/battle.ts`)
   carries no `level`/`xp` field to hang a level-based trigger on. Chosen
   design: **F2c, a shop-offered Evolution Stone** — free (no currency system
   exists yet, same as every other shop pipeline today), offering 3 random
   eligible (party member, evolution target) pairs to choose from, evolving
   exactly one stage per Stone, at a flat per-visit chance across the whole
   season (no early/late taper — unlike eggs, a Stone costs no bench slot, so
   there's no reason to front-load it).

## Decisions

| # | Question | Answer |
|---|---|---|
| Q1 (F1) | Separate curated starter list, or filter the existing roster? | Filter the existing (now much bigger) roster to `stage === 1 && !isLegendary` for pick 1 only — F1c. No new data file; the expansion above already makes the filtered pool rich enough (86 species, near-full type spread). |
| Q2 (F2) | How is a Stone obtained, given the shop has no currency? | A free offer slot at the shop step, same pattern as eggs/trade — not gated behind a currency system that doesn't exist. |
| Q3 (F2) | Who picks the evolution target on a branching line (Eevee)? | The player, from **3 random (party member, evolution target) pairs** — not a single auto-applied Stone. This reuses the offer-of-3 idiom already used by the draft and Doctrine shop, and doubles as the branch-choice mechanism: a branching member can appear more than once across different offers, each time offering a different target. |
| Q4 (F2) | One stage per Stone, or can it clear a whole 3-stage line at once? | One stage per Stone. Flagged risk, not yet resolved: since Stone offers are RNG-gated, a run can plausibly end with party members stuck mid-evolution through no fault of play. Not fixing this speculatively — Step 4 below measures how often it actually happens before deciding whether it needs a pity mechanic, a rising offer chance, or nothing. |
| Q5 (F2) | Offer pacing? | Flat chance per shop visit, independent of Ante — no bench-cost reason to taper like eggs do. |

## Status

1. Filter the first draft pick to valid starters (F1c): merged
2. Evolution Stone: sim-side offer and apply logic (F2c): merged
3. Wire the Evolution Stone into the shop-step UI: merged
4. Measure whether lines actually finish evolving across a season: merged — `scripts/evolution-probe.ts`, 500 seeded seasons each, "always accept the first Evolution Stone offer" policy: at the shipped `EVOLUTION_STONE_CHANCE = 0.4`, **~30% of stage-2 lines with a stage 3 reach it by season end** (451/500-season run: 135/451 = 29.9%; a second seed: 138/446 = 30.9%). Raising the chance to 0.7 only reaches 37.4%, and even `chance = 1.0` (an offer every shop visit) tops out at 44.6% — so the bottleneck isn't purely the pacing constant, it's opportunity: a member that first hits stage 2 late in the run may not see another shop visit before the season ends, and each visit resolves only one of up to 3 offered candidates. Confirms Q4's flagged risk is real at a meaningful rate; F2b (deferred, an Ante-milestone auto-evolve backstop) is worth revisiting rather than just retuning the constant, since the constant alone can't clear the gap.

## Steps

### Step 1 — Filter the first draft pick to valid starters (F1c)

Branch: `feat/starter-pick`

- `src/sim/season/draft.ts`: add a `starterOffer(rng, mentorSlugs)` (or a
  `firstPick: boolean` param on `draftOffer`) that filters `ROSTER` to
  `s.stage === 1 && !s.isLegendary` before drawing, same weighting logic
  otherwise (uniform, or Mentor-weighted if `mentorSlugs` is non-empty — a
  Mentor that happens to be a stage-2+/Legendary species just won't get its
  bonus applied to pick 1, which is correct, not a bug).
- `src/ui/season/store.ts`: `initialOffer()` (currently calls plain
  `draftOffer(rng, [], mentorSlugs)`) calls the new starter-only variant
  instead. Every later `pickDraft()` call keeps calling `draftOffer()`
  unchanged.
- `src/ui/season/DraftScreen.tsx`: no functional change needed, but consider
  a one-line eyebrow distinction ("Choose your starter" vs "Draft Your Opening
  Party") for pick 1 — cosmetic, skip if it complicates the component more
  than it's worth.

Done when: `initialOffer()`'s 3-species offer is always a subset of the
86-species stage-1-non-legendary pool computed above (spot-check: run it a
few hundred times with different seeds and assert every offered slug has
`stage === 1 && !isLegendary`), and picks 2-4 are provably unaffected (same
`draftOffer()` call, same test coverage as today).

Checked by: a new case in `src/sim/season/draft.test.ts` asserting the
starter-offer invariant across many seeds; `npm test`; `npx tsc --noEmit`.

### Step 2 — Evolution Stone: sim-side offer and apply logic (F2c)

Branch: `feat/evolution-stone`

- `src/sim/season/growth.ts`: add `EVOLUTION_STONE_CHANCE` (start arbitrary,
  e.g. `0.4` — tunable, same as every other pacing constant in this file,
  confirm or retune via Step 4's measurement) and:
  - `evolutionCandidatesFor(party): { memberSlug: string; target: Species }[]`
    — for every alive, non-egg party member whose species has
    `evolvesTo.length > 0`, one entry per branch (so Eevee contributes up to
    3 entries, everything else contributes 1). Draws are keyed by the
    member's party-array index, not just its slug, since a party can carry
    two of the same species mid-run (wild catches).
  - `rollEvolutionOffer(run): EvolutionCandidate[] | null` — pacing roll
    (flat `EVOLUTION_STONE_CHANCE`, no Ante-based taper) then up to 3 distinct
    candidates drawn without replacement from `evolutionCandidatesFor`, same
    "fewer than 3 if the pool's thin" handling `draftOffer` already has.
  - `applyEvolution(party, memberSlug, target): FighterState[]` — replaces
    the chosen member's `slug`/`name`/`types`/`power`/`maxHp` with the target
    species' via `makeFighter`-equivalent math, carrying over current
    `hp`/`fatigue` ratios rather than resetting them (an evolved mon shouldn't
    walk out of the shop at full HP for free).

Done when: `rollEvolutionOffer` never offers a candidate for a fainted or egg
party member, never offers a species not reachable by exactly one evolution
step from the member's current species, and `applyEvolution` preserves the
member's HP/fatigue *fraction* (not raw values, since max HP changes).

Checked by: new cases in a `growth.test.ts`-style file — construct a party
with a known evolvable member, assert the offer only contains valid
(member, target) pairs, assert `applyEvolution`'s HP fraction math with a
concrete example (test the mechanism, not a hardcoded constant, per this
repo's testing rule).

### Step 3 — Wire the Evolution Stone into the shop-step UI

Branch: same, `feat/evolution-stone`

- `src/ui/season/store.ts`: add `"evolve"` to `GrowthPhase`, an
  `evolveCandidateFor(run)` helper mirroring `eggCandidateFor`, and slot it
  into `advanceGrowth()` after the egg check and before `offerDoctrines()`.
  `resolveEvolutionOffer(memberSlug, target)` action applies the pick (or
  `null` to skip) and calls `advanceGrowth()` again, same shape as
  `resolveEggOffer`.
- `src/ui/season/EvolveScreen.tsx` (new, modeled directly on
  `EggScreen.tsx`): renders up to 3 cards (member's current sprite/name →
  target's sprite/name), a Skip button, and a pick button per card instead of
  Egg's single accept/skip pair.
- `src/ui/season/SeasonApp.tsx`: route `growthPhase === "evolve"` to the new
  screen, same pattern as the existing `"trade"`/`"egg"` routing.
- `src/sim/season/engine.ts`'s headless `resolveShop()` path (used by
  `career.test.ts` and any non-interactive run): default to skipping the
  Evolution Stone offer, same as it currently defaults through egg/trade —
  don't change headless behavior in this step.

Done when: driving the season in the browser (see verification below) shows
the Evolve screen when the roll hits, applies the chosen evolution visibly
(sprite, name, power all update), and the shop step still reaches the
Doctrine offer afterward whether a Stone was taken or skipped.

Checked by: `npm test`, `npx tsc --noEmit`, and a manual pass — `npm run dev`,
`chromium --remote-debugging-port=9222 --headless=new`, drive a run far
enough to hit at least one Evolution Stone offer (force it by temporarily
setting `EVOLUTION_STONE_CHANCE = 1` for the manual pass only, revert before
committing), screenshot the Evolve screen and the post-evolution party state.

### Step 4 — Measure whether lines actually finish evolving across a season

Branch: same, `feat/evolution-stone`

This step exists because of Q4's flagged risk: a flat, RNG-gated offer might
leave a meaningful fraction of runs ending with party members stuck
mid-evolution, which would read as a bug even though nothing malfunctioned.
Per this repo's own rule ("measure before building" — `CLAUDE.md`), decide
this from a number, not a guess.

- A small throwaway probe (not wired into `src/sim`, same convention as
  `scripts/switch-probe.ts`): run several hundred seeded seasons at the
  chosen `EVOLUTION_STONE_CHANCE`, and for every party member that ever
  reached `stage 2` mid-run, record whether it reached `stage 3` (when one
  exists) by the run's end.
- If a large share of eligible lines never finish, the fix is pacing (raise
  `EVOLUTION_STONE_CHANCE`, or scale it up with Ante like a soft pity), not a
  mechanic change — F2c stays as designed, only the constant moves.

Done when: the measured finish-rate is written into this plan's "Status"
section (or a follow-up note) alongside the seed count and chance used, so
the number — not a feeling — is what `EVOLUTION_STONE_CHANCE`'s final value
is justified against.

Checked by: the probe's own output, read by eye (same as `switch-probe.ts`'s
verdict) — not a committed test, since it's measuring balance, not a
mechanism invariant.

## Deferred (not part of this plan)

- **F1b** (separate curated starter pool) — superseded by the roster
  expansion; F1c does the same job without new data to maintain.
- **F2b** (Ante-milestone auto-evolve) — not picked. Could still be added
  later as a backstop specifically for the Q4 risk (a guaranteed evolution at
  a late Ante for anyone still mid-line) if Step 4's measurement shows F2c
  alone leaves too many lines unfinished — revisit via this same page rather
  than re-running `/judge-mechanics`.

## Next up (flagged by the user, not part of this plan)

A Balatro-style between-Ante shop overhaul — multiple purchasable choices,
reroll, rarity-weighted odds for balance — is wanted right after this lands.
`REDESIGN.md`'s "Economy/build loop" and "Shop rarity tiers" rows already
sketch the shape; `src/sim/season/doctrines.ts` is today's single-currency-less
shop this would replace or extend. Worth its own `/judge-mechanics` pass
rather than folding into this one, since it touches the Doctrine offer,
rarity weighting, and now this plan's Evolution Stone offer all at once.
