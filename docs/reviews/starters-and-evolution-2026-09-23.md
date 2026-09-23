# Starter selection & evolution: options

Judged the roguelike-redesign season engine (`src/sim/season/*`, driving `REDESIGN.md`'s Draft/season-start and Mid-run-roster-growth decisions) against two gaps the user flagged: the season's first draft pick ("the starter") has no rarity/evolution-stage limit, and there is no evolution mechanic at all in the redesigned engine (the old one, `src/sim/systems/growth.ts`, isn't used by `src/sim/season`).

**Contract confirmed with the user:** the 100-species `ROSTER` (`src/data/roster.ts`) is the pool for the general draft/wild/trade pipelines and stays unrestricted — only the run's very first pick changes. The egg pipeline's separate curated pool (`EGG_TIERS` in `src/sim/season/growth.ts`) is the existing precedent to follow, not the old engine's `isGrantable`/`grantableAtLevel`, which have no equivalent in `src/sim/season`. Evolution is not on REDESIGN.md's "Rejected/superseded" list (unlike Day-Care), so it reads as an open gap rather than a deliberate cut — but *what* should trigger it is a real open design question, since the new battle engine (`FighterState` in `src/sim/season/battle.ts`) carries no `level`/`xp` field at all, unlike the old one.

Pick one option per finding (e.g. `F1b, F2a`) and send them back in chat.

## F1 · The first draft pick can be a Legendary or a fully-evolved mon `high`

`draftOffer()` draws every pick — including the season's first — uniformly (or Mentor-weighted) from the full 100-species `ROSTER`, with no filter on evolution stage or `isLegendary`. Of the 100 curated species, only 8 are both unevolved and non-legendary (`bulbasaur`, `charmander`, `pinsir`, `lapras`, `eevee`, `aerodactyl`, `shuckle`, `riolu` — computed by filtering `ROSTER` for `stage===1 && !isLegendary`); 7 are Legendary (`mewtwo`, `mew`, `lugia`, `ho-oh`, `kyogre`, `groudon`, `rayquaza`) and the other 85 are evolved non-legendaries (the roster's diversity fill explicitly prefers final-stage species per its own doc comment in `roster.ts`). A 3-species offer drawn from 100 has a computed `C(92,3)/C(100,3) ≈ 77.7%` chance of containing *zero* stage-1 non-legendary options — so more than three out of four runs open with a forced choice between an already-evolved mon or a Legendary as the founding "starter."

Evidence: `src/sim/season/draft.ts:21-47` (`draftOffer`, `DRAFT_OFFER_SIZE = 3`), `src/data/roster.ts:14-42` (`ROSTER_SLUGS`, diversity fill "preferring the final stage"), `src/ui/season/store.ts:81` (`initialOffer` calls the same `draftOffer` as every later pick), `src/ui/season/DraftScreen.tsx:34-59` (all 4 picks render identically, no "starter" distinction in the UI)

| Option | What it does | Trade-off | P(offer has 0 valid starters) | New data needed | Type coverage of pool |
|---|---|---|---|---|---|
| **F1a · Now** | Pick 1 draws from the full 100-species `ROSTER`, same as picks 2-4 | leave as it is | 77.7% (computed above) | none | full 18 types, but mostly unreachable as a "starter" |
| **F1b · Curated starter pool** | New `STARTER_SLUGS` list (mirrors `EGG_TIERS`'s pattern exactly), a `starterOffer()` used only for pick 1; picks 2-4 keep `draftOffer()` unchanged | new data to author and keep in sync with `ROSTER`/`DEX`, like the egg pool already is | 0% — pool is 100% valid by construction | ~10-15 hand-picked slugs across varied types | as wide as the curated list is authored to be (egg pool covers 15 across 3 tiers as precedent) |
| **F1c · Inline filter on the existing pool** | `draftOffer()` takes an `isFirstPick` flag; when true, filters `ROSTER` to `stage===1 && !isLegendary` before drawing | zero new data, but the pool is only the 8 slugs computed above, and 10 of 18 types (electric, psychic, dragon, ghost, dark, steel, ...) have no representative | 0% | none | only 8/18 types (bulbasaur/charmander/pinsir/lapras/eevee/aerodactyl/shuckle/riolu) |

Note: F1b's authoring cost is small and bounded — the egg pool (`EGG_TIERS`) is the exact same shape already shipped, so it's copy-the-pattern work, not new plumbing.

---

## F2 · No evolution mechanic exists in the redesigned engine `high`

The old engine's `tryEvolve`/`gainXp` (`src/sim/systems/growth.ts:45-91`) evolve a creature on level-up and are wired into three call sites (`daycare.ts:125`, `expeditions.ts:290`, `challenge.ts:577`) — but `src/sim/season` (the code the redesign actually runs) never imports them, and its `FighterState` (`src/sim/season/battle.ts:27-40`) has no `level` or `xp` field to hang a level-based trigger on at all. `engine.ts:21-22` and `:158` even comment that gym-leader pools are filtered to `evolvesTo.length === 0` ("a gym leader doesn't field a Caterpie") — evolution is assumed *elsewhere* in the design but nothing produces it. REDESIGN.md's settled-decisions table and its "Rejected/superseded" list never mention evolution either way, so this reads as an open gap, not a decided cut.

Evidence: `src/sim/season/battle.ts:27-40` (`FighterState` — no level/xp), `src/sim/systems/growth.ts:45-91` (`tryEvolve`, old-engine-only), `src/sim/season/engine.ts:21-22,158` (gym pools assume final-stage mons exist without anything creating them), `REDESIGN.md` settled-decisions table (silent on evolution)

| Option | What it does | Trade-off | Needs new persistent field? | Fits "Shop contents" decision already in REDESIGN.md? | Computed example |
|---|---|---|---|---|---|
| **F2a · Now** | No evolution; a drafted Pikachu is a Pikachu for the whole run | leave as it is | no | n/a | n/a |
| **F2b · Ante-milestone auto-evolve** | At each Boss Gym clear (or every N Antes), every party member with `evolvesTo.length > 0` evolves automatically, resolved at the same shop step `growth.ts` already uses for eggs/wild/trade; branching lines (Eevee) pick at random, same rule as the old engine's `tryEvolve` | passive, no player choice — a drafted Charmander becomes Charizard whether or not the player wanted to keep the mid-stage for a matchup | no — trigger reads `run.ante`, not a per-mon counter | not listed as a shop item, so it's a new always-on rule alongside the shop rather than inside it | with `maxAntes` from `career.ts` and a clear-every-Boss-Gym rule, a `bulbasaur` (evolves at 16/32 in the old dex data) would hit both evolutions well before a short 30-60min run's final Ante, i.e. reliably fires at least once per run |
| **F2c · Shop-bought Evolution Stone item** | A new item type in the between-Ante shop (`doctrines.ts`) the player buys and applies to a chosen party member on demand | player-directed and build-crafty, matching the roguelike framing, but needs a new item category wired into the shop's offer/rarity/apply plumbing (`doctrines.ts` currently only models Doctrines) | no | yes — REDESIGN.md's "Shop contents" decision already lists "battle items with TFT-style trait bonuses" as a precedent for non-Doctrine shop items | none computed — behavior is player-choice-driven, not a fixed trigger |

Note: F2b and F2c aren't mutually exclusive (real Pokémon games ship both level-based and stone-based evolution) — if picked together, treat F2c as the pick and revisit F2b as a possible later addition rather than trying to land both in one pass.
