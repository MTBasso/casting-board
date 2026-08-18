# The Casting Board — Design Document

*Working title. A Pokémon League Manager idle game.*

---

## Premise

You manage a Pokémon League. You never battle, and you never walk a route. You hire
people, build the facilities behind them, and decide which Pokémon stand in which gym.
Challengers come to take your badges. Your job is to make sure they don't — not by
having one unbeatable ace, but by running a deep, well-cast, well-bonded league.

## The problem this solves

Every idle Pokémon game has the same failure state: you end up with one absurdly strong
Pokémon and four hundred you have never looked at. The species become a resource, the
individuals disappear, and the thing that made Pokémon work — that you *know* your team —
is the first thing the genre throws away.

This design attacks that at the structural level. Three mechanics do the work:

1. **Attention is rationed, ownership is not.** You can own hundreds. You can only *bond*
   as many as your hired trainers have slots for. Hiring is literally buying the right to
   care about one more Pokémon.
2. **Every Pokémon has a finite career.** Battles are spent from a lifetime counter.
   Deploying your favorite costs something you cannot get back.
3. **Promotion requires breadth.** You advance by passing a league-wide readiness check.
   One stacked gym structurally cannot promote you.

## Design pillars

**You manage, you don't battle.** The player is never a combatant. The Champion slot is
filled by your best *trainer*. The moment the player battles, every system below becomes
a formality.

**Attention is the scarce resource.** Not money, not Pokémon, not time. Everything
expensive in this game is expensive because it buys attention.

**Consequences land on the cast, never on the run.** You cannot lose. Your Pokémon can
tire, age out, and retire. Your leaders can quit. That is where the weight lives.

---

## The board

**Gyms are type-bound buildings.** Each gym has a fixed type identity, a leader slot, and
N Pokémon slots. Upgrading the building adds slots and modifiers. The gym is literally the
casting board — you look at the building and see who is in it.

**Trainers are type-bound too.** A Fire trainer bonds Fire Pokémon. This is deliberate
constraint reduction: it turns casting from an eighteen-dimensional optimization into a
legible one.

**Dual-types are the release valve.** A Charizard can serve the Fire gym or the Flying gym.
Dual-typed Pokémon are the only pieces with optionality, which makes them the most valuable
assets in the game — a rarity tier that emerges from the type chart instead of being invented.

**Tier structure grows with promotion:**

| Tier | Gyms | Types |
|---|---|---|
| Regional | 8 | You choose which 8 |
| National | 12 | Expand to 12 |
| World | 18 | All types |

Choosing your 8 types at Regional is a genuine identity decision that makes two
playthroughs feel different without authoring new content.

---

## People

**Leaders** are casting constraints, not a second progression grind. Each has:

- A **type affinity** (fixed)
- One **signature doctrine** — e.g. *Stall*, *Sweep*, *Mentor* (bonds faster), *Drillmaster*
  (slower fatigue)
- **Morale**, which falls under underpayment or bad casting
- An **escalating salary** that grows with tenure and league prestige

Leaders do not level independently. The moment they do, the player optimizes leaders and
Pokémon become interchangeable equipment — the exact failure this design exists to avoid.

**Signature Pokémon.** Every trainer arrives welded to one partner. It is permanently
bonded, costs **zero attention**, cannot be reassigned or traded, and leaves when the
trainer leaves. This guarantees every hire is an emotional unit from minute one, even
when your attention budget is tiny. It also means firing someone evicts a pair.

**Morale and quitting.** Underpay to expand and leaders start quitting — taking their
signature Pokémon with them. This is the tycoon pressure, and it never ends the run.

---

## Pokémon

The **Pokémon Card** is the core UI object and the most polished screen in the game:

```
  ESPEON  "Vesper"                    PSYCHIC
  ──────────────────────────────────────────
  Trainer     Marnie (Psychic Gym)
  Bond        ████████░░  Level 4 — Reliable
  Career      212 W / 48 L
  Remaining   41 battles
  Fatigue     ▓▓▓░░░░░  Rested
  Pedigree    Vesper ← Umbra ← Solace ← "Sunny"
```

"Battles remaining: 41" sitting next to a four-generation pedigree is the entire design
compressed into one view.

### Bond

Bond buys **reliability, not power**. A high-bond Pokémon performs at its stated numbers.
A low-bond Pokémon has wide variance and throws upsets. An unbonded ace is a *liability*,
which is a far more interesting statement than "an unbonded ace is weaker" — and it is
what a manager actually wants to buy.

Bond thresholds unlock abilities so the player can feel it climbing.

### Attention

Attention is **per-trainer slots**, summed across staff.

- Start: 1 trainer, 2 bond slots, plus their free signature → **3 named Pokémon in hour one**
- Training Grounds upgrades raise slots per trainer
- Mid-game: ~20–30 bonded · World tier: 50+

The ceiling that matters is not a balance number. It is the point where the player stops
recognizing names. Never cross it.

### Fatigue and career

**Fatigue** is short-term. Each defense costs it; it recovers with rest, faster at the
Medical Center, instantly for money. Rotating tired Pokémon out is the daily session's
texture, and it is what makes roster depth mechanically necessary.

**Career** is permanent. Every Pokémon has a finite lifetime battle count (~250 base for a
bonded Pokémon; extendable via facilities). When it runs out, the Pokémon **retires** —
which is not deletion. Retirees move to the Day-Care as breeders. A career ends by
becoming a lineage.

---

## Acquisition

Three pipelines, deliberately differentiated by feel.

**Scouting — volume and randomness.** Dispatch trainers to routes; they return with
catches. This preserves the route-walking fantasy of the genre, just delegated — your
trainers do the walking, which is the entire premise. Scouting Office upgrades let you
target specific routes with known type distributions.

**Breeding — intentional and slow.** The Day-Care, staffed by retirees. The only source of
lineage.

**Recruiting rivals — rare and story-loaded.** Beating a named rival makes them *hireable*.
They join with their signature Pokémon, which is the only way to acquire creatures you can
neither scout nor breed. Your staff roster becomes a trophy case of everyone who once beat
you.

### Breeding mechanics

A child inherits:

- A **stat floor** derived from both parents
- **One trait** from a parent
- A **visible pedigree** — a named ancestry chain showing each ancestor's career record

Two rules close the loop:

- **Parents' bond level affects offspring quality**, so bonding pays forward into breeding.
- **A long career produces better children.** A Pokémon that fought 300 battles for you
  yields better offspring than one that idled.

**Career → lineage → career.** The pedigree is the artifact this entire game exists to
produce; the stat floor is just what makes you look at it.

---

## Resolved: what the unbonded hundreds do

Ownership is uncapped but only bonded Pokémon are individuals — so unbonded Pokémon need a
real job, or "strength means having a lot of Pokémon" quietly breaks.

**The Undercard.** Challengers must clear a gym's undercard before reaching the bonded
team. Unbonded Pokémon of that gym's type fill the undercard.

- A deeper undercard absorbs more of the challenger trickle
- More trickle absorbed = **more gate receipts** and **less fatigue on your bonded stars**
- Undercard Pokémon gain no bond and spend career slowly — but they *do* spend it, so a
  long undercard career is how a nobody becomes a good breeder

This is the design's best answer to hoarding: **depth of roster is how you protect the
Pokémon you love.** Every anonymous Pokémon you own is a battle your favorite doesn't have
to fight.

Secondary roles: unbonded Pokémon staff facilities (Day-Care hands, Medical Center support)
for small percentage bonuses, and they are the reserve you promote from when a bond slot
opens.

## Resolved: off-type scouting waste

Hard type-binding plus only 8 chosen types at Regional means much of what scouts bring home
is off-slate. Three layers fix it:

1. **Route targeting.** Scouting Office upgrades reveal and filter route type distributions,
   so off-type inflow becomes a function of investment rather than pure noise.
2. **The Trade Desk.** Off-type Pokémon are *trade goods*. Trade them to rival leagues for
   on-type Pokémon or facility materials. Running trades is exactly what a manager does,
   and it means no catch is ever worthless.
3. **Speculation.** Promotion expands your slate 8 → 12 → 18. Hoarded off-types become
   future assets. "I've been sitting on Ghosts for two tiers waiting to open a Ghost gym"
   is a real, intentional strategic position.

---

## Threat Reports and the drifting meta

The player never watches a battle, so the type chart has to reach them some other way.

Each gym displays a **Threat Report**: the type distribution of incoming challengers over
recent waves, with a status light.

```
  FIRE GYM — Leader: Blaise            ⚠ CRITICAL
  Incoming challenger types, last 40 waves
    Water    ████████████░░░░░░░░  34%
    Ground   ████████░░░░░░░░░░░░  22%
    Rock     ██████░░░░░░░░░░░░░░  18%
    Flying   █████░░░░░░░░░░░░░░░  14%
    Other    ████░░░░░░░░░░░░░░░░  12%
```

This converts casting from "recall the type chart" into "read the scouting report," which
is the actual manager fantasy. It teaches the chart implicitly to players who never
memorized it.

**The meta drifts.** This season Water surges; next season Ground does. That drift
generates infinite re-casting pressure with zero authored content. It is the live-service
engine, and it costs nothing to run.

---

## Facilities

Gyms are the front line. Behind them sits a support tier that holds no Pokémon but changes
what the front line can do.

| Facility | Effect |
|---|---|
| **Training Grounds** | +bond slots per trainer; faster bonding |
| **Day-Care** | Breeding; staffed by retirees |
| **Medical Center** | Faster fatigue recovery; extends career length |
| **Scouting Office** | Route targeting, filtering, more concurrent expeditions |
| **Trade Desk** | Converts off-type Pokémon into on-type or materials |
| **Hall of Fame** | Holds inducted Mentors across promotions |

---

## Economy

**Income:** gate receipts on the challenger trickle, scaling with league prestige. A
well-cast league wins more and therefore earns more.

**Primary sink: recurring salaries**, escalating with tenure and prestige. Recurring cost
is what separates a tycoon from a shop — every hire is a permanent commitment against
future income, and it is what gives morale its teeth.

**Secondary sinks:** facility construction and upgrades (one-time), scouting expeditions
and medical care (consumable).

---

## Progression and prestige

Promotion is gated by a **readiness check**, not a currency threshold:

- Every gym staffed
- Every gym bonded above a minimum
- League prestige above a bar

Only then does the tier Champion challenge unlock. A currency gate would mean idling until
a number is big enough — the exact failure mode this design reacts against. A readiness
check tests the thing the game is actually about.

**Hall of Fame induction.** On promotion you induct a small fixed number of Pokémon. They
return as **Mentors**: each occupies a Hall slot and permanently accelerates bonding for its
type across the whole league.

A flat multiplier would make induction a math problem solved by stat sheet. Mentorship makes
it a *typed strategic commitment* — inducting your Dragonite means the next league is a
Dragon league. And thematically it is exactly right: the Pokémon that carried you now trains
the ones that follow. The prestige currency is inherited experience.

---

## Session and offline

- Offline accrual **capped at ~12 hours**. No monetization means no reason to punish
  attendance.
- **Rival challenges queue rather than expire.** They wait politely for you to cast against
  them.
- Target daily session: **3–5 minutes.** Read the queue, fix what's glowing red, re-cast two
  or three gyms, dispatch scouts, close.

---

## The first hour

Open extremely narrow: one trainer, their signature Pokémon, one gym, no money. Systems
arrive one at a time.

| Time | Beat |
|---|---|
| 0:00 | One trainer, one signature Pokémon, one gym |
| 0:05 | Trickle challengers earn the first purse |
| 0:10 | First scout dispatched |
| **0:15** | **First fatigue moment — a favorite tires, forcing a substitution** |
| 0:20 | First named rival |
| 0:30 | First hire; second gym unlocks |
| 1:00 | 3–5 named Pokémon, one hard casting decision on the table |

The fatigue moment is the most important beat in the game. It teaches the thesis — these are
individuals with limits, not stat sticks — before any number ever could.

## Identity surfacing

Every Pokémon arrives with an **auto-generated nickname the player can edit**. Nobody
manually names fifty Pokémon, but everybody renames the one they've grown attached to.
Auto-names give attachment somewhere to land without demanding it upfront.

## Main screen

The **league map** is home: gyms as buildings, each showing type, leader portrait, bond
state, and a Threat Report warning light. The whole game state readable at a glance. Tap a
gym to cast it, back out.

The daily session is *fix what's glowing*. The battle feed lives on a secondary tab as a
glanceable ticker — present for flavor, never required.

---

## Platform and constraints

- **Free mobile-web PWA fangame.** itch.io / GitHub Pages. No app store, no monetization.
- This deletes the entire monetization subtree: no gacha, no energy timers, no ad breaks,
  no IAP pacing. Every pacing decision can be made for *feel* rather than retention.
- **Creature data is swappable from commit one.** Prototype with real Pokémon because you
  need known creature identities to test whether casting and bonding feel good —
  unfamiliar fakemon would mask a broken design as "I don't care about these monsters yet."

---

## Build order

The riskiest assumption in this entire document is that **casting against a drifting threat
meta is fun to do repeatedly.** Everything else amplifies that core, and none of it can
rescue a boring core.

1. **The casting core.** Three gyms, the Threat Report, bond, fatigue. Fake stats,
   hand-entered Pokémon data. No breeding, no promotion, no facilities, no hiring.
   *If ten minutes with three gyms and a shifting meta doesn't make you want an eleventh,
   the design is wrong — and you want to know that in week one, not month six.*
2. Hiring, salaries, morale, signature Pokémon
3. Scouting and the undercard
4. Facilities and the economy
5. Breeding, pedigree, retirement
6. Promotion, Hall of Fame, Mentors
7. Offline accrual, PWA packaging

---

## Open risks

**The player never battles and never watches.** All the charm has to live in the Card, the
map, and the writing. If those are inert, the game is a spreadsheet. This is the single
biggest execution risk and it is an art/UX risk, not a systems risk.

**Meta drift tuning.** The drift has to be slow enough to respond to and fast enough to
matter. Too slow and the game is static; too fast and casting feels futile. This needs
playtesting, not theory.

**Undercard clarity.** The undercard is mechanically excellent but conceptually invisible —
the player must *feel* that hoarding protects their stars, or it reads as a meaningless
number. Surface it explicitly: show "battles absorbed" per gym.

**Attention cap legibility.** If players can't see why they can't bond another Pokémon, the
core constraint reads as an arbitrary paywall-shaped wall. The UI must make "you need
another trainer" obvious at the moment of friction.
