# Battle resolution: fix the bout guard-cap (F1)

From: [docs/reviews/challenge-2026-09-23.md](../reviews/challenge-2026-09-23.md), finding F1.

## What and why

`bout()` in `src/sim/systems/challenge.ts` caps at 40 rounds and, on hitting the
cap, returns `ours.hp > 0 ? "ours" : "theirs"` — which always credits "ours"
when both fighters are still standing, because nothing decided the fight, the
loop just quit. `damage()` floors every hit at 1, so a heavily-resisted,
high-level matchup (measured: 498 HP vs 1 dmg/hit → 498 rounds needed) blows
through the cap and gets a fabricated win logged as a real one, feeding
`favoured()`'s upset detection with a result the combat math never actually
produced.

Fixing this only by raising the cap (F1b alone) still leaves genuinely
pathological matchups grinding hundreds of rounds for no narrative reason. The
chosen design instead gives reserves a way out, and only lets the worst case
run to a real, bounded finish:

- **Last mon vs last mon (no bench either side):** no artificial cap. Run to
  a real decisive finish, bounded only by the true worst case —
  `Math.max(ours.maxHp, theirs.maxHp)` rounds, since minimum damage is 1. This
  always terminates for real; it is a safety bound, not a tie-break.
- **Either side still has a reserve:** after a few rounds play out (so an
  ordinary roll isn't second-guessed), if `favoured()` reads a clear, lopsided
  edge against one side, that side's *opponent* retreats un-fainted — its HP
  carries over, same as any other rotation — and its reserve steps in for the
  next bout. This models the AI trainer pulling an overmatched mon; the player
  has no live-battle controls (per README/DESIGN — "you never battle"), so
  their only lever stays the party order they set before the challenge
  resolves, not a mid-fight intervention. (Considered and rejected: giving the
  player an actual pause-and-react window mid-bout — that's a real feature,
  not a bug fix, and belongs in its own design pass, not this one.)

## Decisions

| # | Question | Answer |
|---|---|---|
| Q1 | What replaces the flat 40-round cap? | Derive it from the actual matchup: `Math.max(ours.maxHp, theirs.maxHp)`, since min damage is 1 and that's the true worst case. |
| Q2 | What happens when a bout would grind past a normal length? | If neither side has a reserve, let it run to the real finish (bounded by Q1's cap). If either side has a reserve, the disadvantaged side retreats un-fainted after a few rounds and its reserve steps in. |
| Q2b | When is "disadvantaged" checked? | Once, before round 1, via the existing `favoured()` computation (stats-only, not roll-dependent — a later check would only reveal what round 1 already knew). |
| Q3 (this session) | Does the player get any mid-bout say? | No — no live battle UI exists. Only the AI/opponent side retreats. Player influence stays pre-fight party ordering. |

Everything else on the review page (F2 `readinessAgainst`, F3 `badgeSkew`) is
explicitly deferred — the user picked F1 first.

## Status

Planned, not started.

## Steps

### Step 1 — Add a "few rounds" grace constant and the reserve-check helper

Branch: `fix/challenge-bout-guard`

- Add `CHALLENGE.retreatGraceRounds` (start at `6` — arbitrary "a few rounds",
  tunable like every other constant here) to `src/sim/constants.ts`, next to
  `upsetMargin`.
- Add a helper (e.g. `hasReserve(roster: readonly Fighter[], current: number)`
  for the defender side, and an equivalent check against
  `challenger.party.some(m => !m.fainted && m !== currentMon)` for the
  challenger side) so `bout()` can ask "does either side have someone left to
  swap to" without reaching into `battleParty`'s state.

Done when: both compile under `npx tsc --noEmit` and have no other callers yet
(dead code is fine mid-step; step 2 wires them in).

Checked by: `npx tsc --noEmit`.

### Step 2 — Replace the flat guard with the two-branch resolution in `bout()`

Branch: same, `fix/challenge-bout-guard`

- Compute `hasOursReserve` / `hasTheirsReserve` once at the top of `bout()`
  (needs `battleParty` to pass down enough to answer this — either pass the
  full `roster`/`challenger` in instead of single `Fighter`s, or pass the two
  booleans in as extra `bout()` params computed by the caller, whichever
  keeps `bout()`'s signature closest to what it already is).
- If **neither** side has a reserve: keep looping, but replace the `guard < 40`
  bound with `guard < Math.max(ours.maxHp, theirs.maxHp)`. On exit, one side
  is guaranteed at `hp <= 0` (proof: 1 dmg/hit minimum, so worst case is
  exactly `maxHp` hits against the tankier fighter) — return based on actual
  HP, no fabricated branch needed since the loop always finishes for real now.
- If **either** side has a reserve: after `CHALLENGE.retreatGraceRounds` rounds,
  compute `favoured(ours, theirs)`. If it's non-null and reads against a side
  that has a reserve available, end the bout early with a new outcome shape
  that says "retreat" rather than "ours"/"theirs" — the retreating fighter
  keeps its current `hp` (already tracked on the `Fighter` object, nothing to
  reset).
- Update `battleParty`'s call site: on a "retreat" outcome, don't apply
  `spend`/`fatigue`/`bond`/`grow` (nobody won or lost an exchange), advance to
  the retreating side's next standing member (`nextDefender` for ours,
  `challenger.party.findIndex` for theirs — whichever side retreated), and
  continue the stand loop without incrementing `knockouts`.

Done when: `favoured()`'s upset log can no longer fire from a guard-cap
timeout — i.e. a constructed double-resist, high-level, reserve-less matchup
(same shape as the review's computed example: level 80, 255-base-HP defender,
0.0625 effectiveness) resolves to a real winner reflecting which side's HP
hits 0 first, not to a fixed "ours" default. A matching matchup *with* a
reserve on the disadvantaged side ends in a retreat within
`retreatGraceRounds`, not a 40-round grind.

Checked by: a new case in `src/sim/report.test.ts` or `sim.test.ts`
constructing both shapes above and asserting on the outcome, not on a
hardcoded constant (per this repo's testing rule — "test the mechanism, not
the tuning").

### Step 3 — Full suite and a manual pass

Branch: same

- `npm test`, `npx tsc --noEmit`.
- `npx tsx scripts/diagnose.ts` — confirm challenge/upset firing rates didn't
  silently shift from this change (the review's whole premise is that a
  timeout was previously masquerading as a normal win, so some upset-rate
  movement is expected and correct, not a regression).

Done when: suite green, and diagnose.ts output reviewed by eye for anything
surprising beyond the expected upset-rate shift.

Checked by: `npm test`, `npx tsc --noEmit`, `npx tsx scripts/diagnose.ts`.

## Deferred (not part of this plan)

- **F2** — `readinessAgainst` in `src/sim/systems/rivals.ts` scoring a gym
  against the league-wide fielded level instead of that gym's own roster.
- **F3** — dead `CHALLENGE.badgeSkew` constant and the stale leading comment
  on `rollBadges`.

Revisit both via the same review page when ready; no `/judge-mechanics` re-run
needed, the options are already written up.
