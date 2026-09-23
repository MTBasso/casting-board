# Battle resolution (`src/sim/systems/challenge.ts`): options

Judged the challenge/battle-resolution mechanic — challenger generation, the per-bout fight loop, and the readiness estimate that reuses its level math — against this repo's contract: `src/sim` stays pure and deterministic given its `rng`, every derived number must reflect the actual population it claims to describe (see the `fieldedLevel` doc: "recomputed... a plain mean is dilutable... exactly backwards"), and reports/UI numbers must not silently lie about what happened in the sim.

**Contract confirmed:** invariants — no `Math.random`, no DOM, no wall clock in `src/sim`; a bout always ends with exactly one side at 0 HP or the loop's guard fires; `favoured()`/report fields must reflect what the fight loop actually decided. Valid ranges — `badges` 0..7, levels clamped by `minChallengerLevel`/`maxLevelRatio` against whichever roster is actually being measured. "Correct" here means: a challenger's assigned level and a bout's winner both trace back to the specific gym roster in front of them, per the `facing`-parameter design already in `levelFor`/`fieldedLevel`. Not reopening: badge-count determinism (no longer rolled per ROADMAP), the mercy/upset/rotation designs are settled and untouched below.

Pick one option per finding (e.g. `F1b, F2a`) and send them back in chat.

---

## F1 · The 40-round bout cap silently hands the fight to "ours" `high`

`bout()` (`src/sim/systems/challenge.ts:335-373`) loops `while (ours.hp > 0 && theirs.hp > 0 && guard < 40)`, and on exit returns `ours.hp > 0 ? "ours" : "theirs"`. `damage()` (`src/sim/systems/stats.ts:93`) floors every hit at `Math.max(1, ...)`, so a heavily-resisted matchup (double type resist plus the 0.9–1.1 roll) can land 1 damage per hit against a high-level, high-HP defender. At level 80 a 255-base-HP wall has 498 HP; at `eff = 0.0625` the attacker deals 1 per hit, so killing it needs ~498 rounds against a cap of 40. When the guard fires with both fighters still standing, the function does not report a stalemate — it always credits "ours", because the check is `ours.hp > 0`, not "who actually won." That reads as a normal win in the log and in `favoured()`'s upset detection, even though nothing was decided by the stated combat rules.

Evidence: `src/sim/systems/challenge.ts:270` (guard constant), `src/sim/systems/stats.ts:81-94` (`damage`, `Math.max(1, ...)` floor), computed above (hpAt(255,80)=498, dmgPerHit=1 at eff=0.0625).

| Option | What it does | Trade-off | Tanky double-resist, lvl 80 (498 HP, 1 dmg/hit) | Ordinary matchup (dmg ≈ HP/6) | Effect on `favoured()`/upset log |
|---|---|---|---|---|---|
| **F1a · Now** | Loop exits at 40 rounds, always credits "ours" | leave as it is | "ours" wins at round 40 despite 458/498 HP still standing | resolves normally well under cap, no effect | can log a false "upset" when the disfavoured side wins by timeout, not by damage |
| **F1b · Raise the cap to the real worst case** | Cap scales to e.g. `Math.ceil(maxHp / 1)` or a generous fixed 250, so min-damage matchups can actually finish | simplest fix, no new state, but a truly pathological matchup still stalls at 250-499 rounds — slower, rarer bugs, not zero | resolves for real by round ~498 (or times out later, same failure mode) | no false "ours" credit at the common resist levels; only the most extreme dual-resist + max-level case still risks it |
| **F1c · Detect the stall and record a draw/timeout outcome** | On guard exhaustion with both `hp > 0`, return a distinct `"stalemate"` and have `battleParty` treat it as "held" (defender survives, no knockout either way) rather than a fabricated win | matches what actually happened; requires one new branch in `battleParty`'s winner-handling and a report field, but that's the same "write the verb, don't guess" pattern `report.ts` already uses | correctly reports no result at round 40 instead of an "ours" win | unaffected | `favoured()` never gets asked to explain a timeout as an upset |

Note: F1b and F1c aren't exclusive — b removes the bug for all but the most extreme case, c makes the remainder honest instead of silently favouring the player.

---

## F2 · `readinessAgainst` scores a specific gym against the *global* challenger level, not that gym's `high`

`readinessAgainst` (`src/sim/systems/rivals.ts:246-258`) computes `ours` from `defenders(state, rival.gymId)` — the actual roster of the gym the rival is threatening — but then computes `theirs` via `levelFor(state, rival.badges)` with **no `facing` argument**. `levelFor`'s `facing` parameter exists precisely so the challenger's level ceiling scales to "the people standing in front of them rather than a league-wide average" (its own doc comment); omitting it here falls through to `fieldedLevel(state)`, the league-wide top-third mean the same doc warns is the wrong population for a specific fight. The `roster` already sitted in scope two lines above is never passed through.

Evidence: `src/sim/systems/rivals.ts:246-258`; contrast with the correct call one function up, `src/sim/systems/rivals.ts:132` (`makeChallenger(state, rival.badges, defenders(state, rival.gymId))`, which does pass `facing`).

| Option | What it does | Trade-off | Weak new gym (roster lvl 12) targeted while league fields lvl 60 elsewhere | Same-strength gym (roster lvl matches league) |
|---|---|---|---|---|
| **F2a · Now** | `theirs` ceiling uses global fielded level (60) | leave as it is | challenger level ceiling computed as if facing a lvl-60 roster (ceiling ≈126) even though the gym only has lvl-12 defenders (power 25) — readiness reads far worse than the actual fight would be | matches by coincidence, no visible bug |
| **F2b · Pass the roster already in hand** | `levelFor(state, rival.badges, roster)` | one-line fix, same shape as the working call at line 132; only touches this readiness estimate | ceiling computed from the lvl-12 roster (≈25.2) — readiness reflects the gym actually being threatened | unchanged, still correct |
| **F2c · Pass roster and floor it at the gym's own rank-implied level** | as F2b, plus a `floor` argument so a freshly-opened, unstaffed gym doesn't read as trivially safe | closer to what `makeChallenger`'s real `floor` use elsewhere does, but adds a second knob to keep in sync with the live-challenge path | same as F2b unless the gym is unstaffed, then floors instead of returning 0-power readiness | unchanged |

---

## F3 · `badgeSkew` is a dead constant, and `rollBadges`'s leading comment describes a mechanic that no longer exists `medium`

`CHALLENGE.badgeSkew` (`src/sim/constants.ts:147`) has exactly one occurrence in the codebase — its own definition. `rollBadges` (`src/sim/systems/challenge.ts`, just above `describeChallenger`) carries two doc comments back to back: a leftover one-liner — `/** Pick a badge count for an ordinary challenger, biased toward the low end. */` — immediately followed by the real, current docstring explaining that badge count is now deterministic from `gymCount` and the "biased toward the low end" behaviour actually comes from `badgePassRate`'s population fall-off (ROADMAP: "the population holding exactly `k` badges falls as `passRate ** k`"), not from any skew roll. Both artifacts are debris from the switch to deterministic badges that ROADMAP's "Settled decisions" table already confirms; neither should still exist.

Evidence: `src/sim/constants.ts:144-147` (`badgeSkew: 1.8` with a comment describing a roll-skew mechanic), `grep -rn "badgeSkew" src` returns only the definition; the stray one-line comment directly above `rollBadges`'s real docstring in `src/sim/systems/challenge.ts`.

| Option | What it does | Trade-off | Reading the file cold | Grep for "what tunes badge distribution" |
|---|---|---|---|---|
| **F3a · Now** | Dead constant and stale comment stay | leave as it is | a reader sees `badgeSkew: 1.8` and a "biased toward the low end" comment and reasonably concludes badges are still skew-rolled | grep finds `badgeSkew` but following it teaches nothing, since it's never read |
| **F3b · Delete both** | Remove `CHALLENGE.badgeSkew` and the stray leading comment on `rollBadges` | zero behavior change (nothing reads the constant); loses nothing since ROADMAP already records the old mechanic and why it was replaced | `badgeSkew` no longer appears at all | grep for badge-distribution tuning lands only on `badgePassRate`, which is the one that's live |
| **F3c · Keep the constant but wire a comment pointing at ROADMAP** | Leave `badgeSkew` as documented dead history with a `@deprecated` note citing the ROADMAP block that replaced it | avoids a diff for a value some other in-flight branch might reference | still dead, but at least honest about it | grep still surfaces two names, one flagged unused |

---
