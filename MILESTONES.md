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

Rangers and Handlers work routes. A Ranger catches their own type and gets
better at it; a Handler takes a party out and brings it back stronger, and may
be pushed onto ground over their heads for more pay and a real risk. Field staff
are hired from a drawn offer, can be fired, and can be told to keep working.

*Done.* Blocks 8.3 and 8.3b.

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

## M7 — There is something to work toward 🔜

**Objectives**: an authored spine that introduces systems in order — hire a
Ranger, work a route, cast what they bring back — plus derived repeatables for
the long tail. They suggest rather than gate, because renown is already the
progression spine and two gates would contradict each other. They pay in
**posting slots and facility levels**, the things every screen is waiting on.

This is also the onboarding the game has never had.

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

## M11 — Somebody else plays it 🔲

Onboarding that works without explanation, a first hour that teaches by
happening, and the balance to survive a stranger. Ships to
[the Pages build](https://mtbasso.github.io/casting-board/) on every push
already; what is missing is the confidence to point someone at it.

---

## The rule we keep relearning

**A system that never fires is not balanced or unbalanced — it is absent.** It
contributes nothing to any other measurement, so nothing else you measure will
tell you it is missing. `scripts/diagnose.ts` exists to ask the blunt question
directly: over a full playthrough, how often does each mechanic happen at all?

Run it before starting any milestone. Twice now it has turned out that the
honest next step was not the next feature but the last one, still not working.
