# CLAUDE.md

Guidance for agents working in this repo. [README.md](README.md) has the
commands, the layout, and the purity rule — read it first and take it as given.
What follows is only what the code cannot tell you by being read.

## Documents, and when to open them

- **[ROADMAP.md](ROADMAP.md)** — the build log. Every block records what was
  measured, what that forced, and what was rejected. Open it before changing a
  balance constant or re-litigating a settled decision; the "Settled decisions"
  table at the end is the short version.
- **[MILESTONES.md](MILESTONES.md)** — what state the game is in, as things a
  player can do. Open it when picking what to work on next.
- **[DESIGN.md](DESIGN.md)** — the pillars and the fiction. Open it when a
  mechanic needs to mean something, not just work.
- **GitHub Project #4** — the board. `gh project item-list 4 --owner MTBasso`.
  Status and a `Fires?` column; the user moves cards to direct work.

## Measure before building

A system that never fires is not balanced or unbalanced — it is **absent**. It
contributes nothing to any other measurement, so nothing else you measure will
reveal it. Six systems here were fully built and tested for weeks while never
once firing in play.

- `npx tsx scripts/diagnose.ts [hours]` — how often each mechanic fires at all.
- `npx tsx scripts/firsthour.ts` — the opening, played twice: once doing
  nothing, once doing only what the game visibly asks.
- `npm run sim` — the balance runner.

Twice the honest next step turned out to be not the next feature but the last
one, still not working.

**Probes must stay solvent.** A player model that spends to zero goes bankrupt,
loses its staff and flatlines, and every constant fitted against that is fitted
to a spiral. Give the model a working reserve before trusting a curve from it.

**Watch which population you are measuring.** League-wide averages are dominated
by junior trainers' creatures, which the player does not own and which fight
three times as often. Career was mis-fitted twice this way. Filter to owned
creatures when the question is about the player's experience.

## The traps

**State is mutated in place.** `revision` in `src/engine/store.ts` is the only
honest dependency for anything derived from league state — `state`,
`state.creatures` and `state.legends` keep their identity forever, so a `useMemo`
keyed on them never recomputes. Three components shipped with stale lists this
way.

**The sim holds keys, not sentences.** Logs, events, decisions and objectives all
carry `{ key, params }`, and translation happens at render, so a league saved in
one language reads correctly in the other. `Dict` in `src/ui/i18n.ts` makes a
missing Portuguese string a compile error — except where a call site casts
`as never`, which several do. Plurals live inline in the string as
`{n:one|many}`, one group per word, because Portuguese needs the adjective to
agree too.

**Time is scaled.** `TIME_SCALE` multiplies the loop and offline catch-up.
Constants about *the player's experience* — how long an absence pays for, how
long a freeze is tolerable — belong in real units and get scaled; constants about
the league belong in league seconds. Conflating them silently capped offline
progress at eighteen real minutes for a whole block.

**`makeCreature` clamps level upward** to a species' evolution floor. Ask for a
level-8 Charizard and you get a level-36 one. Filter species with
`grantableAtLevel` wherever a level is chosen first.

**`TickReport` fields can be dead.** `report.returned` and `report.upsets` were
each declared, initialised, and never written to for months, so everything
reading them measured zero. Grep for a `.push` before trusting a report field.

**`normalize()` in `src/sim/migrate.ts` runs on every load**, not only on version
change, and it deletes fields as well as backfilling them. It once backfilled a
field at the top and deleted it two hundred lines below, which crashed the
founding screen for every save.

## Tests

**Test the mechanism, not the tuning.** A test that hardcodes a constant's
current value fails when the constant moves, for a reason that has nothing to do
with what it was checking. Read the constant, or construct the situation the
test needs.

The corollary bit hardest on stochastic systems: simulating until a crew happens
to come home a particular way tests the seed, not the rule. Extract the rule as a
pure function, assert on that, and keep one integration test that it is wired up.

## Running it

`npm test` and `npx tsc --noEmit` cover the sim. To see a change in the actual
interface, drive it in headless chromium over CDP — launch `npm run dev`, then
`chromium --remote-debugging-port=9222 --headless=new`, click through
`.welcome-go` → `.offer-choice` → `.leader-card` to found a league, and
screenshot. `.devbar-toggle` opens the dev strip, whose buttons fast-forward,
fill the box and force events. **Look at the screenshot** — a blank frame is a
failure to launch.

## Conventions

Commit messages are prose that explains *why*, and say plainly when a measurement
overturned an earlier assumption. Match the surrounding comment density: this
codebase comments the reasoning behind a decision, never the mechanics of the
line below it.
