# The Casting Board — Milestones

ROADMAP.md is the log: what was built, what it measured, what that forced.
This is the other half — **what state the game is in**, stated as things a
player can do that they could not before.

A milestone is done when a player can do the thing, not when the code exists.
Where that distinction has bitten us it is recorded, because it bit hard: six
systems were fully built and tested for weeks while never once firing in play.

---

## M1 — A league exists and defends itself ✅

You found a league, choose its first gym and Leader, and challengers arrive and
are turned away. Money accrues, renown climbs, more gyms open.

*Done.* This has worked since Block 3.

## M2 — The board is yours to cast ✅

Trainers are type-bound people with portraits and parties. You hire Leaders and
Gym Trainers, cast creatures into parties, reorder them, pin the ones that
matter. Creatures level, evolve, bond, and wear out.

*Done.* Party model rework, Gens 1–3, real base stats.

## M3 — Creatures come from somewhere ✅

**Rebuilt as crews, a map, and expeditions.** A crew is one hire and two people
— the Ranger brings creatures back, the Handler raises the ones they took — with
one shared trait that decides what they do when nobody answers them. Competence
is per crew per route and never decays.

Sixteen places in a web with loops, three open from the first hour, the rest
reached by pushing on from ground the league knows. Every place has a resident
that lives nowhere else and a landmark that does real work. Routes stopped
unlocking at renown thresholds: you get there by going there.

A trip is outfitted and finite — balls, potions, revives, lures, paid up front —
and ends when the balls run out or the crew is too worn to carry on. Five kinds
of event, each answering to one line of the kit.

*Done, on the fourth attempt.* The three before it fixed layout complaints; this
one fixed the shape, which was that the two halves were parallel systems that
never met.

## M4 — A career ends, and that means something ✅

Careers deplete at a rate you can feel. A creature that serves most of a life
enters the **Hall of Fame**; a bonded veteran hands part of what it knew to
whoever takes its place. Bond is earned by service rather than by victory, so a
creature that stands up and gets knocked down still learns.

*Done this pass.* Retirements went from 3 to 81 per run when careers were fixed,
and the Hall is where those 81 endings now lead.

## M5 — A run can be finished ✅

**Done.** A 90-hour league reads 8/8 gyms bonded, and the Hall fills with real
careers — `Claydol 331W bond 1.00`, `Exeggutor 294W`. Induction draws from
finished stories. The one thing still blocking the earned path in a measured run
is a gym short of its own type, which is a supply problem the Trade Desk answers.

Two corrections it took to get here, both from measuring the wrong population:
career was fitted against the league *average*, which is dominated by junior
trainers' creatures who fight three times as much — the creatures the player
actually owns were on a completely different curve and would have taken 415
hours to retire. And the Hall's first cut admitted creatures with three wins that
had burned short lives losing, because faint penalties spend career faster than
fighting does. A hall that rewards attrition is a casualty list.

*Superseded notes from when this was the current milestone:* Promotion fires: eight gyms reach a bonded core, you
induct from the Hall, and the Mentors you choose carry into a harder tier.

The gate now ratchets — a gym that has *held* a core keeps the credit — because
careers end and gyms cycle, and demanding eight cores simultaneously was a
target that never aligned. A 40-hour league now reads `path earned, READY`.

What is left:
- The **Hall screen**: 80 finished careers a run and nowhere to see them.
- **Induction with weight**: choosing between finished stories rather than a
  stat column. DESIGN.md calls this the emotional peak; it has never been seen.
- Confirm a full run end-to-end in the app, not only in the balance runner.

## M6 — The game asks something of you ✅ (first pass)

A **Desk**: the first tab and the landing screen. What happened while you were
away, and what needs a decision — retirees awaiting the Day-Care, a rival
announced, a suspension pending, a Professor at the door — each linking to the
screen that resolves it.

*Built.* The Desk is the first tab and the landing screen. `pendingDecisions`
lives in the sim — these are rules about the league, not about a screen — and
reads out what is standing open: gyms fielding nobody, unstaffed Elite seats,
staff close to walking, retirees the Day-Care has room for, a rival's countdown,
a full box, a promotion available. Each links to the screen that settles it, and
the Desk itself does nothing, which keeps every other screen's job intact.

Above it, a digest of what happened since you last read it — held, lost, taken,
caught, retired, plus the named events worth a line.

Still open: objectives (M7) belong here, and the digest currently resets per
session rather than per visit-with-offline-time.

## M7 — There is something to work toward ✅

**Objectives**: an authored spine that introduces systems in order — hire a
Ranger, work a route, cast what they bring back — plus derived repeatables for
the long tail. They suggest rather than gate, because renown is already the
progression spine and two gates would contradict each other. They pay in
**posting slots and facility levels**, the things every screen is waiting on.

*Built.* Eleven authored steps in the order a Director meets the game — open a
gym, put a crew on the payroll, send them out, reach somewhere new, build a
bonded core, see a career out, climb a tier — plus three derived repeatables so
the list never empties. They live on the Desk, and only the *claims* are stored:
whether something is finished is read live off the league, so a rule can change
without a save carrying a stale answer.

Rewards are crew slots and facility levels, with kit and money as seasoning. Kit
granted this way sits in hand and is spent before money, so a reward paid in
Poké Balls feels like Poké Balls rather than a discount.

## M8 — Breeding is a reason to keep someone 🔲

The Day-Care exists, is gated behind a facility, and has produced **zero eggs in
every measured run** because nothing ever asks you to use it. M6 surfaces the
decision; M8 makes the payoff worth the slot — pedigree that rewards a long
career, and offspring that inherit something you recognise.

## M9 — The Professor, and the people who leave 🔲

Recurring offers that cost something either way: a prodigy with a real flaw
whose refusal sends them away to come back stronger, and an egg that is rare
rather than powerful. Block 8.4, designed and unbuilt.

## M10 — The curve bends 🔲

The oldest open question in the project, unanswered since Block 4. Every lever
added so far — facilities, Elite throughput, renown-scaled attendance, route
income — has been a level shift rather than an acceleration. A second run is
only marginally faster than the first, which means prestige currently buys
almost nothing.

Deliberately last: it is a question about what the game *is* over fifty hours,
and it cannot be answered until a run can be finished at all.

## M13 — The board reads like a ladder 🔲

Eight gyms that were, measurably, the same gym eight times: identical challenge
rate, identical payout base, identical depth, and a badge roll that sent
*fewer*-badged challengers to the harder gyms.

Block 11 makes rank mean something. Arrivals are derived from a badge
population, so the first gym takes 26.6% of all challenges and the eighth takes
4.1% — the fiction the board already claimed, now true. A late gym is rarer,
deeper, and worth about 2.1x per second. The row's bar became a cycle you can
read at a glance, and an undefended gym shows a deadline rather than a status.

Two corrections found by measuring rather than by reasoning: normalising the
rank multiplier, without which the ladder was a 3.15x raise for the whole
league; and scaling renown in *both* directions, without which the busiest gym
on the board lost standing no matter how well it did.

## M12 — The game is worth leaving 🔲

An idle game whose offline ceiling is eighteen real minutes is a game with a
pause button. Absence now pays for eight real hours, at a rate you can *invest*
in rather than one you are silently penalised by, and crews keep working under
standing orders instead of idling the moment a trip ends.

And something waits for you: a rare encounter holds until the crew comes home,
so the Desk has news that is a decision rather than an alert about neglect.

Block 10. Grilled and decided; building.

## M11 — Somebody else plays it 🔜

Onboarding that works without explanation, a first hour that teaches by
happening, and the balance to survive a stranger. Ships to
[the Pages build](https://mtbasso.github.io/casting-board/) on every push
already; what is missing is the confidence to point someone at it.

*In progress.* The premise now gets said once, before anything else — the one
thing that cannot teach by happening, because a Pokémon player will assume they
are the trainer. The objective spine no longer dead-ends at its third step,
which it had been doing since the Field rewrite. About sixty strings that had
never been translated are, including the two screens a new player sees first.

What Block 10 adds: the spine becomes *directive* rather than a list — a strip
saying what to do next and a tab glow saying where — plus coach marks on each
tab, replayable from a "?" in its header. And the opening meta softens until the
spine's fourth step is claimed, so a stranger cannot lose a badge to a mistake
they had no way to see coming. Invisible by construction: the challengers are
weaker, rather than the loss being disallowed.

Still open after that: pacing. A first hour reaches eight gyms and the promotion
offer, which is [#16](https://github.com/MTBasso/casting-board/issues/16).

---

## The rule we keep relearning

**A system that never fires is not balanced or unbalanced — it is absent.** It
contributes nothing to any other measurement, so nothing else you measure will
tell you it is missing. `scripts/diagnose.ts` exists to ask the blunt question
directly: over a full playthrough, how often does each mechanic happen at all?

Run it before starting any milestone. Twice now it has turned out that the
honest next step was not the next feature but the last one, still not working.
