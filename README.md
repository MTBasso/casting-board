# The Casting Board

A Pokémon League Manager idle game. You never battle and never walk a route —
you hire people, build facilities, and decide which creatures stand in which gym.

Design document: [DESIGN.md](DESIGN.md)

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # sim determinism + offline suite
npm run sim        # headless balance runner
npm run build      # static PWA build into dist/
npx tsx scripts/fetch-dex.ts   # regenerate species data + sprites (rarely)
```

Pushing to `main` builds, tests, and deploys to GitHub Pages automatically
(`.github/workflows/deploy.yml`). Enable Pages → "GitHub Actions" in repo
settings once, and set a remote.

## The one architectural rule

**`src/sim` is pure.** Nothing inside it imports React, touches the DOM, reads a
clock, or calls `Math.random`. State goes in, state comes out.

Hold that line and four things stay free:

- **Save/load** is `JSON.stringify` on the state object
- **Offline catch-up** is the same `tick()` the game already runs
- **Balance testing** is a `for` loop in a terminal
- **The UI is replaceable** without touching the game

Everything outside `src/sim` reaches in through [`src/sim/index.ts`](src/sim/index.ts)
and nothing else.

## Layout

```
src/
  sim/          Pure simulation core — no React, no DOM, no clock, no Math.random
    types.ts      Domain types (Creature, Trainer, Gym, LeagueState)
    constants.ts  Every tunable number in the game, in one file
    rng.ts        Seeded mulberry32 — the seed lives in state
    state.ts      createInitialState: one trainer, one gym, no money
    tick.ts       tick(state, dt) — the only way time passes
    offline.ts    Analytic catch-up for long absences
    factory.ts    Creating and casting creatures, trainers, gyms
    migrate.ts    Save migrations plus a defensive backfill on every load
    systems/      wave (battles), economy (payroll/upkeep), meta (drift),
                  league (gyms/hiring), catchers (routes/postings), trade,
                  growth (levels/evolution), promotion (tiers/Hall of Fame),
                  facilities (support tier multipliers),
                  daycare (training/eggs/pedigree), elite (seats/gauntlet),
                  morale (staircase/demotion), title (forced recruitment),
                  party (six-cap, auto-fill, pinning),
                  challenge (party-vs-party battles), rivals
  data/         The swappable creature layer
    catalog.ts    Gens 1-3 (386) behind a CreatureCatalog interface
    routes.ts     Where creatures come from; offer weights derived from strength
    typechart.ts  Gen 6+ effectiveness + threat scoring
  engine/       Bridges the sim to the browser
    loop.ts       Fixed-timestep RAF driver
    store.ts      Zustand binding (revision counter, not state identity)
  persist/
    save.ts       IndexedDB, versioned envelope, debounced autosave
  ui/           React. Reads the sim, never simulates.
scripts/
  sim.ts            Headless balance runner
  routes-report.ts     Derived route weights — run after touching species data
  encounters-report.ts Wild encounter distribution by evolution stage
  fetch-gen1.ts     Regenerates species data and sprites
```

## Determinism

The RNG seed lives in `LeagueState`, so a save resumes the exact stream it left
and two runs from the same seed produce byte-identical leagues. That is what
makes the balance runner trustworthy and offline catch-up reproducible. The test
suite asserts it directly — if you ever reach for `Math.random` inside `src/sim`,
those tests are what will catch you.

## Offline catch-up

Twelve hours at one tick per second is 43,200 ticks, which is a multi-second
freeze on every app open. So absences resolve two ways:

- **under two minutes** — step the real sim (exact, cheap)
- **over two minutes** — resolve analytically in one pass (approximate, instant)

The analytic path runs deliberately pessimistic. Offline must never outperform
playing, or the optimal strategy becomes closing the app. A test asserts this.

## The balance runner

```sh
npm run sim -- --hours 200 --every 20
npm run sim -- --hours 100 --seed 7 --policy idle
```

`--policy greedy` (default) simulates an attentive manager: takes gym offers,
hires leaders for unstaffed gyms, dispatches expeditions when reserve runs low,
and keeps bond slots and the bench filled. `--bench <n>` caps how deep it fills
each bench — use `--bench 0` to test whether upkeep has inverted the undercard. `--policy idle` simulates nobody playing at all — useful for seeing how
fast an unattended league collapses.

Run this before changing any number in `constants.ts`.

## The party model

Every defender in the league is a **trainer with a party of six** — Gym Leaders,
junior Gym Trainers, the Elite Four and the Champion all work identically. There
are no loose creatures standing in slots with nobody attached.

A challenger works up through a gym the way they do in the games: the junior
**Gym Trainers** first, in order, then the **Leader**. Depth of juniors is what
keeps the Leader's party — the creatures the player is attached to — off the
field. (This replaced an invented "undercard" mechanic that had no analogue in
the games.)

**The box is inert.** By the mid-game the player owns hundreds of creatures, and
sorting that is a chore rather than a decision. So parties top themselves up from
the box on a timer, and the player's real input is **pinning** — marking the
creatures that must never be swapped out. Auto-fill obeys two rules:

1. Empty slots fill with the strongest legal creature in the box.
2. An *unpinned* member is replaced only when the box holds something **clearly**
   better (25%+), so parties settle rather than churn.

**Three rules, not two.** Nothing pinned is ever replaced, and neither is
anything that has already **bonded** (above 0.35). Bond is its own protection: a
creature that has served earns its place.

That third rule was not optional. Without it, auto-fill kept swapping party
members for marginally stronger ones and every swap reset that slot's bond to
zero — parties never matured, and the league could not meet the bond requirement
for promotion at all. The balance runner sat in Regional tier indefinitely.

### Party sizes

| Role | Party |
|---|---|
| Gym Leader, Elite Four, Champion | 6 |
| Junior Gym Trainer | 2–4, rolled on hire |

Junior trainers per gym are capped at **3**, rising to **4** at World tier. They
arrive with their own creatures of the gym's type, already partly bonded — a
junior who turned up empty-handed and waited for the box would be a slot, not a
person.

### Party composition

- **One creature per evolution line.** A party cannot hold both a Charmander and
  a Charizard — `familyOf()` resolves any stage to its base form, and that is the
  identity a party checks against.
- **Removing a creature sticks.** Benching sets a creature aside; auto-fill
  ignores benched creatures until the player allows them again. Without this,
  removing one just meant auto-fill put it straight back and "do not use this
  one" was inexpressible.
- A trainer's **signature creature** can never be removed by the player.

### Founding a league

`createInitialState` deliberately builds **no gym**. A league opens with a type
offer instead — the first gym is free, and picking it opens the Leader offer, so
the player's first two actions are choosing what their league *is*. Promotion
re-founds through the same path, so every run starts by picking a fresh identity.

### Battles

Every challenge is **party against party, resolved as sequential knockouts**. A
challenger arrives at one gym and fights up through it — junior trainers in
order, then the Leader — and **faints persist across the whole run**. Losing two
creatures to your first junior means meeting the second four-strong and reaching
the Leader worn down. That is what makes hiring depth *literally* protect the
creatures the player cares about.

Challengers carry a **badge count**, and it decides everything: which gym they
attack (`gym number = badges + 1`), how large their party is, how strong it is,
and how many **Revives** they brought. A gym is hard because the people who reach
it have already beaten seven others.

Creatures use their **real base stats** — HP, Attack, Defence, Sp. Atk, Sp. Def,
Speed — scaled by level roughly the way the source does it. Speed decides who
strikes first; the attacker's better offensive stat is weighed against the
matching defensive one, so a physical wall genuinely walls physical attackers.
Bouts run in rounds until somebody drops, and **every blow is recorded** so the
battle feed can replay a challenge happening rather than announce a result.

**Party order is lead order** — position one goes out first — so dragging a party
around is strategy, not decoration. Fainting costs extra fatigue and career, so
leading with the wrong creature spends its life rather than just the round.

Gym **type availability is tied to rank**, derived from each type's mean roster
power. Gym 1 offers from the weaker half; Dragon and Ghost appear only high up.

### Interface

Six screens rather than one: **Gyms**, **PC Box**, **Routes**, **Elite**,
**Day-Care**, **Facilities**, with a rival countdown and a collapsible event
ticker along the bottom.

**Routes is a staffing screen, not a shop.** You hire a Catcher, pair them with a
field partner, and post them; creatures arrive because somebody went and got
them. Route work costs fatigue and never career — routes are the safe posting,
and the only one a spare creature can hold indefinitely. A partner levels only as
far as the route's band goes, so outgrowing a posting is the signal to move them
to harder ground.

The visual grammar borrows from the DS-era games, which were unusually good at
being readable at a glance: every panel wears a titled bar with its state on the
right, creatures are **status cards** — sprite first, then name, level, type
badges and meters — and the PC is a real box grid, thirty to a page.

Parties are laid out **two across and three down**, the party screen's own shape.
Each slot is deliberately compact — who this is, and how they are doing. Clicking
one opens a **summary**: the stat hexagon, the six stats as rows, and a Trainer
Memo panel.

**Career and Bond are drawn differently on purpose.** They used to be two
identical bars, which made two very different facts look like the same fact.

- **Career drains.** A thin strip under the name, and in the summary the actual
  number — "Seasoned — 1,204 battles left" — because every battle spending
  something you cannot get back is the game's central bargain, and a bar hides it.
- **Bond fills.** Five pips rather than a percentage, described in words the way
  the games describe friendship ("Warming to you", "Inseparable"), and — the part
  that was missing entirely — **a plain statement of what it does**: *"Unpredictable
  — swings ±41%, and will throw battles it should win."* The number is computed
  from the actual variance constants, so it is the truth rather than flavour. Both are the numbers the design
actually cares about, shown the way a party screen shows HP.

The gym screen answers one question directly: **who else could go in this
party?** Blocked creatures are listed with the rule that blocks them — "already
has one of that line" is worth learning, and an absent row teaches nothing.
Trading lives in the PC, next to everything you own.

### The battle feed

The sim resolves a whole gym run instantly; the feed replays the last one blow by
blow, with HP bars draining and a rolling log. The **Leader's stand is the
climax**, so that stage is highlighted, enlarged, and paced more slowly than the
junior trainers before it.

### Sprites

Gen 5 Black/White **animated** sprites in `public/sprites/*.gif`, plus **box
icons** in `public/icons/*.png` for the places a full sprite would crowd a row —
the available list, the battle feed. Both vendored by `scripts/fetch-dex.ts`. They total ~14MB, which is far too much
to precache, so the service worker caches them **at runtime** on first view — the
app installs at ~300KB and still works offline once you have seen a creature.

### Creature legitimacy

Two rules enforced at creation, so no path can violate them:

- **Evolution level floors.** A species can never exist below the level its
  pre-evolution evolves at — there is no level 12 Gengar. Routes only supply
  species whose floor fits their level band.
- **Legendaries are never *granted*.** No trainer arrives with one, and no egg
  produces one. They can only ever be found.

### Does the reset loop pay? (Block 4's question)

Eight seeds, hours for each tier to reach the same 2,500 renown:

| | Mean |
|---|---|
| Regional | 9.0h |
| National | 8.5h |
| **Change** | **−5%**, faster in 6/8 seeds |

**Marginal.** The loop works but is far too weak to motivate prestiging. Mentors
are typed, so inducting creatures whose types the next league does not need does
almost nothing.

### Does the curve bend? (Blocks 5 and 6)

Two levers were measured against the same 250-hour baseline:

| Lever | Effect on income |
|---|---|
| Facilities (Block 5) | +41% |
| Elite Four throughput (Block 6) | **2.5x steady-state slope** |

Income is `waves × receipts`. Facilities, renown and tier all scale *receipts*,
which are checked by challenger power rising with renown — so they equilibrate.
The Elite Four scales *throughput*, which does not fight that equilibrium, and is
worth roughly six times more per unit of investment.

**The curve is still linear.** Both are straight lines; the Elite Four raises the
slope. Every multiplier in the game has a ceiling, so acceleration needs an
uncapped axis — and the measurement says throughput is the axis worth uncapping.
See ROADMAP.md Block 6.

### Does the bench pay for itself?

The roadmap flagged a risk that upkeep would invert the undercard — making an
empty bench the correct play. Run `--bench 0` against `--bench 3` to re-check
after any tuning change. As of Block 2 it does not invert:

| Bench | Money | Win rate | Renown | Retirements |
|---|---|---|---|---|
| Empty | 641,356 | 51.9% | **0** | 8 |
| Full | 679,979 | 57.7% | **538** | 5 |

A full bench earns more, wins more, sustains renown that an empty bench cannot
hold at all, and burns through front-line creatures more slowly — which is
precisely the mechanic working as designed.

Career length was derived rather than chosen: the target is one to two weeks of
daily play per bonded creature (~150 sim-hours, since roughly 12 sim-hours accrue
per real day), which put `CAREER.base` at 6500 battles. The Card shows a career
bar and a condition label instead of that raw figure.

## Playtest #1

The build exists to answer three questions, each of which can honestly come back
"no":

1. Do you voluntarily re-cast a gym without the game prompting you?
2. Can you name two of your creatures from memory after twenty minutes?
3. Shown a red gym, can you say why it's red?

Use the dev bar (bottom of the screen, dev builds only) to run at ×10/×100 or
jump the league forward by hours — otherwise you will only ever playtest your own
onboarding.

## Not yet built

Breeding and pedigree · promotion tiers · Hall of Fame and Mentors · Trade Desk ·
facilities · morale and resignation UI · route targeting · rival challengers ·
offline accrual polish.

Note what that fence costs: two of the three acquisition pipelines are absent, so
this tests casting against **scouted creatures only**. A flat result from playtest
#1 is a verdict on casting, not on the design.
