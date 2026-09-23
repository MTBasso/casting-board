# CLAUDE.md

Guidance for agents working in this repo. [README.md](README.md) has the
commands, the layout, and the purity rule — read it first and take it as given.
What follows is only what the code cannot tell you by being read.

## Documents, and when to open them

- **[REDESIGN.md](REDESIGN.md)** — the current design and its build log in one:
  a "Settled decisions" table (what was decided and why), the probes that
  validated or overturned earlier calls, and the UI-direction table tracking
  what's actually built. Open it before changing a balance constant,
  re-litigating a settled decision, or picking what to work on next.
- **[DESIGN.md](DESIGN.md)**, **[ROADMAP.md](ROADMAP.md)**,
  **[MILESTONES.md](MILESTONES.md)** — archived. They document the old
  off-screen league-manager game, which has been deleted from the codebase.
  Historical record only; REDESIGN.md is the live doc now.
- **GitHub Project #4** — the board. `gh project item-list 4 --owner MTBasso`.
  Status and a `Fires?` column; the user moves cards to direct work.

## Measure before building

A system that never fires is not balanced or unbalanced — it is **absent**. It
contributes nothing to any other measurement, so nothing else you measure will
reveal it. See REDESIGN.md's own settled-decisions table for examples this
project has already hit (a naive shop offer converging on the same handful of
Doctrines, fatigue not pulling its own weight in the switch decision).

- `npx tsx scripts/switch-probe.ts` — does switch-only coach-calling carry real
  tension, across a sweep of gym difficulty?
- `npx tsx scripts/evolution-probe.ts` — do evolution lines actually finish
  within a season?

Both are throwaway per `.claude/skills/redesign/SKILL.md`'s process — probe
cheaply before building, keep the probe only as long as the question is open.

## The traps

**`GrowthPhase` gates screens, not just `RunStatus`.** Between Antes, `run.status`
is `"shopping"` the whole time trade, egg, evolution and the Doctrine shop are
each shown — `SeasonApp.tsx`'s switch reads `growthPhase` (`store.ts`) to pick
which of those four screens is actually up. A new growth step needs a new
`GrowthPhase` value wired into that switch, not just a new `RunStatus`.

**An egg's species is already resolved, but must stay hidden until hatch.**
`eggFighterFor` (`growth.ts`) sets the real species and `isEgg: true` the moment
an egg offer is accepted — `EggScreen`/`PokedexScreen` deliberately don't render
the species for an unhatched egg (REDESIGN.md's payoff is the reveal). Anything
that reads a party member's species for display has to check `isEgg` first or
it spoils the gamble.

**`Career` has to load before the first draft offer is drawn.** The season's
starter offer is Mentor-weighted (`initialOffer` in `store.ts`, `career.mentors`
in `career.ts`), and `Career` is loaded asynchronously from IndexedDB
(`persist/seasonSave.ts`). `SeasonApp.tsx`'s mount effect awaits `loadCareer()`
before calling `newRun()` for exactly this reason — calling `newRun()` first
would silently draft against an empty, un-weighted Career every session.

**`resolveBattleOutcome` (`store.ts`) is the single tail for anything that ends
a battle.** `advanceTurn` and `retreat` both funnel into it rather than each
handling reprieve/win/loss/shop resolution themselves — a third way to end a
battle should call it too, not reimplement its branches.

**There is no level system.** `FighterState` (`battle.ts`) has no `level` field
— `makeFighter` derives `power`/`maxHp` straight from a `Species`'s base stats
and a scale multiplier (eggs and gym scaling use it), not from a level curve.
Don't reach for the pre-redesign `makeCreature`/`grantableAtLevel` mental model;
it doesn't apply here.

## Tests

**Test the mechanism, not the tuning.** A test that hardcodes a constant's
current value fails when the constant moves, for a reason that has nothing to do
with what it was checking. Read the constant, or construct the situation the
test needs.

The corollary bit hardest on stochastic systems: simulating a battle or a shop
roll until it happens to come out a particular way tests the seed, not the
rule. Extract the rule as a pure function, assert on that, and keep one
integration test that it is wired up.

## Running it

`npm test` and `npx tsc --noEmit` cover the sim. To see a change in the actual
interface, launch `npm run dev` and drive it in a real browser: `DraftScreen`
(pick a starter) → `AnteScreen` (fight or retreat) → whichever `GrowthPhase`
screen comes up (`TradeScreen`/`EggScreen`/`EvolveScreen`/`ShopScreen`) →
`EndScreen` on a win or loss. There is no dev-strip fast-forward in the season
UI — `retreat` on the Ante screen is the fastest way to force a loss and see
the end-of-run screens without playing a full battle out.

## Agent skills

### Issue tracker

GitHub Issues on `MTBasso/casting-board`, via the `gh` CLI. See
[`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

The five canonical roles, each label string equal to its name. See
[`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root, both created
lazily rather than upfront. See [`docs/agents/domain.md`](docs/agents/domain.md).

## Conventions

Commit messages are prose that explains *why*, and say plainly when a measurement
overturned an earlier assumption. Match the surrounding comment density: this
codebase comments the reasoning behind a decision, never the mechanics of the
line below it.
