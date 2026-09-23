# The Casting Board

A Pokémon League roguelike. You play as a trainer challenging gyms directly —
a bounded season of escalating Antes (gym tiers), coach-call battles where you
decide when to switch, and a build-crafting shop between fights. See
[REDESIGN.md](REDESIGN.md) for the full design.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # sim + engine test suite
npm run typecheck  # tsc --noEmit, strict
npm run build      # static PWA build into dist/
npx tsx scripts/fetch-dex.ts   # regenerate species data + sprites (rarely)
```

Pushing to `main` builds, tests, and deploys to GitHub Pages automatically
(`.github/workflows/deploy.yml`).

## The one architectural rule

**`src/sim` is pure.** Nothing inside it imports React, touches the DOM, reads a
clock, or calls `Math.random`. State goes in, state comes out.

Hold that line and three things stay free:

- **Saves** are `JSON.stringify` on the run/career state
- **Offline catch-up and balance testing** are just calling the same functions
  in a loop, headless
- **The UI is replaceable** without touching the game

## Layout

```
src/
  sim/
    types.ts       Domain types shared across the sim (TypeId, RngState, ...)
    rng.ts         Seeded mulberry32 — the seed lives in state
    season/        The game itself — one season/Ante run engine
      types.ts       RunState, LeagueCharter, Rarity, Doctrine
      engine.ts      createRun, startRun, applyAnteResult — the run's lifecycle
      battle.ts      1-on-1 coach-call battles: switching, turn resolution
      draft.ts       The opening starter draft
      growth.ts      Mid-run roster growth: wild catches, eggs, trades, evolution
      doctrines.ts   The between-Ante shop
      career.ts      Cross-season meta-progression: Mentors, the Pokédex log
      sacrifice.ts   The extra-life archetype
      gym.ts         Gym party sizing/scaling per Ante
      roster.ts      The curated species pool, rarity-tiered
  data/           The swappable creature layer
    catalog.ts      Species lookups behind a CreatureCatalog interface
    species.dex.ts  Generated dex data (Gen 1-5)
    roster.ts       The curated 223-species roster slugs
    typechart.ts    Type effectiveness + threat scoring
  persist/
    seasonSave.ts   IndexedDB-backed Career persistence (Mentors, Pokédex)
  ui/
    season/         React. Reads the sim, never simulates. One screen per
                     RunStatus/growth phase (Draft, Ante, Shop, Trade, Egg,
                     Evolve, Reprieve, End) plus the Pokédex overlay.
scripts/
  fetch-dex.ts        Regenerates species data and sprites
  switch-probe.ts     Redesign probe: does switch-only coach-calling hold up?
  evolution-probe.ts  Redesign probe: do evolution lines finish in a season?
  analysis.ts         Ad-hoc design analysis over the type chart
```

## Determinism

The RNG seed lives in `RunState`, so a run resumes the exact stream it left and
two runs from the same seed produce byte-identical outcomes. That is what makes
the redesign probes (`scripts/switch-probe.ts`, `scripts/evolution-probe.ts`)
trustworthy.
