# The Casting Board — Redesign Plan

A living plan, not a retrospective log — ROADMAP.md and MILESTONES.md stay as
they are (they document the *current shipped game*, which this replaces).
This file tracks the new concept as it's being decided, in the same spirit as
ROADMAP.md's "Settled decisions" table: what was decided, why, and what's
still open. Once implementation starts for real, this becomes the new
DESIGN.md and the old one is archived, not merged.

Process for changes to this file: follow `.claude/skills/redesign/SKILL.md` —
ideate, critique with the user, cheap probe before real code, measure, only
then implement. Update this doc at each settled decision, not at the end.

---

## Settled decisions

| Decision | Call | Why |
|---|---|---|
| Premise | Player is a **trainer challenging gyms**, not an off-screen league manager | Removes the old design's stated biggest risk (battles never visible, all charm had to live in menus/text) and fits a roguelike run shape naturally |
| Run structure | **Roguelike, Balatro-inspired.** A season is a bounded run of escalating Antes (gym tiers), each with a Boss Gym (hard modifier wave), ending in a Championship attempt | Gives the idle-forever shape a real finish line and replay pressure |
| Season length | **Short: ~30-60 min real playtime total** | Matches roguelike run pacing over the old 3-5 min/day idle-forever cadence |
| Failure state | **Losing any gym ends the season immediately** — not a soft loss, a run-ending one, unless mitigated (see extra-life mechanics below) | Sharper and more roguelike than the earlier "gyms can be permanently lost, season continues" call; real stakes on every single fight, replacing "you cannot lose" from the old design |
| Extra-life archetype | A cross-type **"Sacrifice" archetype** (not a type — an archetype like Doctrines, could theme around Ghost-flavored fiction without being Ghost-type-locked): owning one, on what would be a fatal gym loss, triggers its ability, releases that Pokémon, and grants the player one more chance instead of ending the run | Gives the permadeath stakes a build-around answer instead of just raw luck — an archetype is legible and shoppable like everything else in the Doctrine system |
| Shop-bought extra lives | Separate from the Sacrifice archetype, **some shop traits/items directly grant a resurrection/extra life** | A second, purchasable path to the same safety net — not everyone will draft/catch a Sacrifice-archetype Pokémon, so the insurance shouldn't be locked to one RNG-dependent source |
| Extra-life stacking | **Does not stack** — one extra life maximum per season, regardless of how many Sacrifice Pokémon or resurrection items are owned | Owning both sources shouldn't compound; keeps "losing a gym ends the run" as real stakes rather than something a well-stocked run can no-sell |
| Economy/build loop | **Shop phase between Antes** offering random Doctrines (build-defining perks, Balatro's Jokers), signature upgrades, roster adds, with reroll cost | Replaces the old slow facility-grind economy with a build-crafting decision every few minutes |
| Season variance | **League Charter** at season start (which types are live, a base-rule twist) + randomized Doctrine pool + rival leagues that remember prior seasons | Makes season 5 a different puzzle from season 1, not just harder |
| Meta-progression | **Hall of Fame → Mentors carry between seasons**, capped so it improves survivability without trivializing a full clear | Validated cheaply: toy sim showed early seasons hold ~2/8 gyms, climbing to ~5-6/8 by season 11-20, then plateauing below a full clear once the Mentor cap kicks in — real "getting better" arc without walling off or trivializing |
| Roster storage | **PC Box mechanic is cut.** Nothing persists between seasons except Mentors | Randomness of each draft/run is the fun; storage/hoarding was the old design's whole apparatus and doesn't apply anymore |
| Collection layer | **Pokédex as a meta progression / collection log**, not gameplay-relevant within a run | Balatro-shaped: "I've never drafted a Dragon starter" is a reason to run it again, tracked outside any single run |
| Roster pool | **223 curated species, Gen 1-5 only (expanded from 100 to include every family's pre-evolutions, docs/reviews/starters-and-evolution-2026-09-23.md F1)** — see `src/data/roster.ts` | Full 649-species dex is too much for legible drafts/shop offers; cut for recognizability and type/family spread |
| Roster sourcing | ~41 real popularity picks (public ranking, filtered to Gen ≤5) + algorithmic diversity fill: one species per evolution family (final stage preferred), round-robined across all 18 types | Pure "most popular" over-indexes Gen 6+ and duplicate-feeling species (many Pikachu-likes); hybrid keeps recognizability and type coverage |
| Draft/season start | **Draft from a limited random pool**, weighted by Mentors from past seasons | Classic roguelike opening — different every run, meaningfully shaped by meta-progression |
| Dex data generation | `scripts/fetch-dex.ts` expanded from Gen 1-3 (386) to Gen 1-5 (649), regenerated `src/data/species.dex.ts` | Needed the full Gen 4-5 stat/type/evolution data before the roster cut could be made |
| Shop offer weighting | **Owning one half of a Doctrine synergy pair increases the odds its partner appears in the next shop offer** | Probed: a naive random-3-offer shop converged 26-27/30 seeded runs on the same handful of high-standalone-power Doctrines; a genuine synergy pair was picked in 1/30 runs because a one-step-lookahead pick can't see a future payoff sitting behind a weaker card. Weighted offers is the standard fix (Balatro does the same) and keeps the shop legible instead of requiring raw-power rebalancing across the whole pool. |
| Battle format | **1-on-1** — one Pokémon active per side at a time, like mainline combat, not a multi-Pokémon team fight | Player's own call, replacing the old design's off-screen full-party defense |
| What stops one ace carrying the season | **Fatigue forces rotation, and type matchups are real** — a tired favorite must be benched, and a bad type matchup can't be brute-forced by raw power alone | Fatigue survives from the old design (previously gated casting decisions, now gates which Pokémon you can even send out); type-matters is new teeth that a single stacked ace can't route around |
| Battle presentation | **Coach calls** — the player makes mid-fight decisions (switches, moves/items) rather than full manual turn-by-turn play or a hands-off auto-resolve | Middle ground: more engagement per fight than a passive auto-battle, without the dev cost/pacing hit of full manual combat in a 30-60min run |
| Mid-run roster growth | **Three pipelines**, all mid-season: wild encounters (catch with Poké Balls), gifted eggs (a rarer/stronger Pokémon, likely tied to Ante progress), trade offers from NPC trainers | The draft-only start isn't the only way the roster grows within a season — roster composition keeps evolving as you play, not just at season start |
| Shop contents | Not just Doctrines: **Poké Balls** (enables wild catching), **healing items** (fatigue/HP recovery), and **battle items with TFT-style trait bonuses** — e.g. owning 2+ Pokémon of the same type grants a composition bonus | Reuses the existing, fully-modeled type chart as the trait system instead of inventing new lore; gives the shop actual purchasing tension beyond just Doctrines |
| Shop rarity tiers | **Items/Doctrines are rarity-tiered** (common → rare → build-defining), which also weights offer odds | Directly answers the Doctrine-shop convergence problem measured earlier: common items push toward completing a set cheaply, rare items stay powerful without flooding every shop |
| Traits vs Doctrines | **One system, one shop.** Type-composition bonuses (TFT-style "2 Fire = bonus") are just another kind of Doctrine, not a separate always-on layer | Simpler shop, one rarity scale, one offer-weighting mechanism to tune instead of two interacting systems |
| Idle scope | **Ambient catches happen within a season** (background encounters between Antes/shop visits), not a separate idle layer sitting outside seasons | Keeps "idle" as a texture inside the bounded run rather than reintroducing the open-ended idle-forever layer the redesign is moving away from |
| Coach call scope | **Switches only** — the player calls when to swap the active Pokémon (reading fatigue/matchup); moves auto-resolve once someone's in | One clear decision type per fight, fast enough for many fights across a 30-60min season |
| Bench size | **Small: 3-4 total including the active Pokémon** | Keeps fatigue rotation and type coverage in constant tension — every catch/trade/egg is a real roster decision, not padding |
| Type matchup strength | **Real multiplier, mainline-style** (standard super-effective/not-very-effective math) | Familiar to any Pokémon player, no new system to learn, and the type chart is already fully modeled in this repo (`src/data/typechart.ts`) |
| Rarity tiers | **3 tiers: Common / Rare / Legendary** | Simplest to balance and read at a glance |
| Pokémon rarity | **The full roster is rarity-tiered by strength**, using the same Common/Rare/Legendary scale as items/Doctrines | One rarity language across the whole game instead of items having tiers and Pokémon not |
| Egg pool | **Eggs draw from a small, separate curated list**, not the full roster | Keeps eggs feeling like a distinct, special pipeline rather than a random catch with extra steps |
| Egg payoff | **An egg hatches into something stronger/rarer than a typical catch** — biased toward higher rarity tiers, not a guaranteed Legendary (considered and rejected as too uncanny) | The trade-off (see below) needs a real payoff, but a guaranteed top-tier hatch every time removes the gamble |
| Egg bench cost | **An unhatched egg occupies a bench slot**, same as a Pokémon would — with a bench of only 3-4, carrying one may mean releasing something to make room | Makes taking an egg a genuine opportunity-cost decision, not a free bonus |
| Egg offer pacing | **More eggs are offered early in a season, fewer as it progresses** | Early on you need fewer battle-ready Pokémon to clear a gym, so spare bench space for a gamble is cheap; later the bench is precious and needed for matchups, so the trade-off gets harder |
| Egg pool size/rarity | **15 curated species: 7 Common / 5 Rare / 3 Legendary** | Small enough to feel distinct from the main roster, biased toward the higher tiers as the earlier "payoff" decision required |
| Sacrifice release | **Permanent removal from the party** — bench slot freed, that Pokémon is gone for the rest of the season, same as any other release | Resolves the open question; matches what "released" already means everywhere else in the design |
| Stacked extra-life sources | **Ignored — no special handling.** A second Sacrifice Pokémon or resurrection item past the first does nothing; it just sits as dead weight | Not worth a bespoke refund/conversion system for an edge case; simplest answer, revisit only if playtesting shows it matters |
| Ambient catch pacing | **Party size drifts toward the size of the next gym leader's party**, landing one above or one below it depending on run luck | Ties the "how many encounters am I offered" question to the actual upcoming fight instead of a flat schedule, and keeps some randomness in how prepared a run feels |

## Rejected / superseded from the old design

- **Off-screen league management** (you never battle) — superseded by playing as the trainer.
- **PC Box / hoarding depth** ("depth of roster protects your stars") — the entire undercard/attention-rationing apparatus from DESIGN.md no longer applies; nothing persists to hoard.
- **Open-ended idle-forever progression** — replaced by bounded seasons with a real end.
- **Breeding/Day-Care (old M8)** — never fired even once in a measured run per ROADMAP.md; not carried into the redesign pending a reason to bring it back.
- **"You cannot lose" pillar** — superseded by permanent mid-season gym loss.

## Open questions — next to probe

*(none — the last open question was probed, see below)*

## Probe: does switch-only coach-calling carry real tension?

`scripts/switch-probe.ts` (throwaway, not wired into `src/sim`) ran many
simulated 1v1 gym fights — bench of 4, real type multipliers from
`src/data/typechart.ts`, a fatigue model where the active mon's power decays
the longer it stays in and recovers on the bench — comparing four switch
policies: never switch, switch at random turns (control), switch to the best
type matchup only, and switch weighing both type and fatigue. Gym toughness
was swept from an easy fight (~95% clear with no switching) down to a coin
flip (~35-60% clear) to make sure the comparison wasn't happening at a
ceiling where nothing was at stake.

**Result, consistent across the whole toughness sweep:**

- Switch-aware play beats never-switching by **13-17 points of clear rate**
  at contested difficulty, and most switches it makes are "consequential" by
  the probe's own margin check — the decision is real, not busywork.
- Random switching barely beats never-switching (2-14 pts, well behind
  type-aware) — so the value isn't "any switch helps because fresh mon," it's
  genuinely picking the right mon.
- **Type-aware and fatigue+type-aware are statistically indistinguishable**
  (differences of -0.1 to +0.9 pts, no consistent direction). Fatigue rode
  along for free; it never changed a decision the type read didn't already
  make.

**Verdict:** switch-only coach calls do hold up as real tension — confirmed,
not just assumed — but as currently modeled that tension is coming almost
entirely from reading type matchups. Fatigue is not yet pulling its own
weight as a second decision input. Before locking "switches only, reading
fatigue/matchup" into gameplay, fatigue needs to bite harder (steeper power
falloff, or a hard forced-bench past a threshold instead of a soft power
malus) — or the design should be honest that fatigue is pacing/flavor, not a
load-bearing decision.

| Decision | Call | Why |
|---|---|---|
| Switch-only coach calls | **Confirmed as sufficient tension** — kept as the only mid-fight decision | Probed: type-aware switching beats never-switching by 13-17 clear-rate points at contested difficulty, and random switching doesn't, so the decision has real skill in it |
| Fatigue's role in the switch decision | **Shipping as pacing/flavor, not a load-bearing decision input**, for the first implementation pass. Fatigue still visibly builds and forces some rotation, but the switch decision's real weight is the type read. Revisiting a harder fatigue model (steeper falloff or forced-bench threshold) is tracked separately, not blocking implementation | Same probe — type-only and full-aware policies were statistically indistinguishable across the whole toughness sweep. Re-tuning fatigue to matter is real work with an uncertain payoff; not worth blocking step 5 on it when the core switch decision is already confirmed to hold up on type alone |

## UI direction

Four visual directions were mocked as static comps (Card Table, League Ledger,
Type Terminal, and a Card Table x Type Terminal merge) and compared before any
real component code — same discipline as the mechanics probes above, applied
to the look instead of a system.

| Decision | Call | Why |
|---|---|---|
| Visual direction | **"Terminal Cards"** — dark HUD background and neon teal/gold accents (from the Type Terminal direction) combined with Card Table's rounded, chunky, glow-on-select cards | User's pick after comparing all four side by side; reads as roguelike-run/HUD without losing the tactile card-draft feel |
| First real slice | **Draft + Ante coach-call**, wired to the actual engine (`src/sim/season`), not another mock | Confirms the sim's turn-by-turn battle primitives (`switchActive`, `resolveTurn`, `canSwitchTo`) are UI-drivable, not just fit for `autoResolveBattle` — the coach-call decision the switch-only probe validated is now something a player can actually make |
| Where it lives | `src/ui/season/`, mounted unconditionally from `main.tsx` | Started as a vertical slice deployed alongside the old league-manager `App` (per this file's own process note); the old game has since been deleted entirely, so this is now the whole game |
| Shop screen | **Built** — a real 3-Doctrine offer (`offerDoctrines`/`pickDoctrine` from `doctrines.ts`), player picks one, party rests and the next Ante opens | Doctrine choice is a build decision worth making by hand |
| Growth pipelines | **Trade and egg offers are now real player decisions**; hatching and ambient catches stay automatic | REDESIGN.md "Idle scope" is explicit that catches are ambient texture, not a decision — so only trade and egg got a screen. Both were already headless "auto-accept if it's an upgrade" logic (`growth.ts`'s own comments called this out as a stand-in); `acceptNewcomer` replaces that gate with an explicit accept/decline the player makes after seeing the offer, including the egg's real opportunity cost (which bench member gets released when full) |
| Extra-life reprieve | **Built** — a "One More Chance" screen names what actually fired (the Sacrifice Pokémon released, or Phoenix Clause) before the retried Ante opens, instead of only a battle-log line | The whole point of REDESIGN.md's Sacrifice archetype is that it's a legible, shoppable answer to permadeath — that's wasted if the player only sees it scroll past in a feed |
| Hall of Fame / Mentors | **Built** — the win/lose end screen shows which party members were just inducted as Mentors and the career's running total against `MAX_MENTORS`; a new season's draft offers are Mentor-weighted (`draftOffer`'s existing `mentorSlugs` param, previously always empty from the UI) | `career.ts` was fully implemented and tested but nothing in the UI ever called `inductMentors` or threaded mentors into a new draft — the meta-progression arc ROADMAP.md's probe validated (2/8 gyms early, climbing to 5-6/8 by season 11-20) wasn't visible or even active in play |

## Carried forward unchanged

- `src/sim` purity rule, `revision`-keyed reactivity, i18n key discipline, `makeCreature` level-clamp trap — all still apply once real implementation starts (root/project CLAUDE.md).
- Testing discipline: test the mechanism not the tuning; measure before building.
