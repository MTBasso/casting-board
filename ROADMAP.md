# The Casting Board — Development Roadmap

Blocks 2 through 7. Each block has a goal, a falsifiable question, and exit
criteria. Build them in order; the dependencies are real.

See [DESIGN.md](DESIGN.md) for the design itself and [README.md](README.md) for
the architecture.

---

## The three structural problems this roadmap fixes

Everything below exists to solve three things that Block 1 left broken.

**1. Type scarcity does not exist.** Scouting is a free, instant, type-targeted
button. The design says on-type scarcity should be the dominant early tension;
right now there is no scarcity of anything. Every downstream decision — which
gym type to open, whether a dual-type is precious, whether the undercard is worth
filling — is hollow until this is fixed. **This is the highest-priority fix in
the entire roadmap.**

**2. The undercard is a slider you always push to max.** It has no cost, no cap,
and competes with nothing, because reserve creatures have no alternative use. A
choice with no opportunity cost is not a choice.

**3. "Prestige" is two unrelated concepts sharing one identifier.** In code it is
a live rating that rises on wins and falls on losses, and also multiplies gate
receipts and gates gym unlocks. In the design document it is the meta-progression
layer — promotion and Hall of Fame Mentors.

### The naming fix, applied throughout

| Term | Meaning | Behaviour |
|---|---|---|
| **Renown** | Current league standing | Rises on wins, falls on losses. Drives gate receipts and challenger scaling. Volatile by design. |
| **Peak renown** | High-water mark of renown | Only ever ratchets up. All unlock gates read this, never live renown. |
| **Promotion** | Regional → National → World | Discrete. Gated by a readiness check, not a number. |
| **Hall of Fame** | Inducted creatures, kept across promotions | Each becomes a Mentor. This *is* the prestige layer — **there is no separate prestige scalar and no prestige shop.** |

Renaming the existing `prestige` field to `renown` is the first commit of Block 3.

### The two progression axes

Keep these distinct; conflating them is how idle games turn into spreadsheets.

**Within a tier — what the player actually feels as progress:** more gyms, and
better facilities. The board visibly grows and the machinery behind it visibly
improves. This is the real in-game progression and it should carry the entire
mid-game.

**Across tiers — what makes a second run worth starting:** Mentors. Faster
bonding → reliability sooner → higher win rate sooner → faster renown → faster
promotion. Nothing else carries over.

Money is currently linear and stays linear until facilities land. If the curve is
still flat after Block 5, the design has a real problem and that is the point to
stop and rethink.

---

## Block 2 — The creature economy ✅ DONE

**Scouting, the undercard, and reserve, reworked together — because they are one
system.** The undercard cannot become a decision until reserve creatures have a
competing use, and neither matters until creatures are scarce.

### Scouting becomes expeditions

Scouting is dispatched to a **Route**, not a type.

- Each route has a **supply distribution** over types — the mirror image of a
  Threat Report. You cannot obtain Ghost creatures unless a route supplies Ghost.
  One visual grammar, used twice: what is attacking you, and what you can obtain.
- An expedition costs **money** and takes **sim-time** (10–30 minutes), and
  occupies one of a limited number of **expedition slots**.
- It returns 1–3 creatures drawn from that route's distribution.
- You start with one route. More unlock on peak renown.
- **Route intel** is a Scouting Office upgrade: until you have it, a route's
  supply distribution is only approximate.

Known cost of this approach: type scarcity becomes fixed by route access, so a
player can end up wanting a type nothing feeds. The Trade Desk is the escape
hatch until breeding lands in Block 6.

### The undercard gets a cost, a cap, and a quality dimension

- **Capacity**: each gym has `undercardSlots`, upgradeable with money.
- **Upkeep**: each undercard creature costs a small per-hour fee, competing
  directly with salaries.
- **Quality matters**: absorption already uses the specific defender's matchup —
  surface it, so the Threat Report becomes actionable for the bench too.
- **Attrition**: undercard creatures burn career and retire, creating constant
  resupply pressure that keeps expeditions relevant forever.

> **Watch this one.** Upkeep risks making the correct play "keep the bench empty
> and eat the losses", which would invert the mechanic entirely. If the balance
> runner shows an empty bench outperforming a full one, **drop upkeep to zero**
> and let slots plus attrition carry the cost alone.

### Reserve gets a use, so the undercard has an opportunity cost

Minimal **Trade Desk**: off-type creatures convert to on-type ones at an
unfavourable rate. Enough to make "bench it or trade it" a real fork. Breeding
deepens the same fork in Block 6.

**Falsifiable question:** *Do you ever decline to fill an undercard slot because
you would rather do something else with the creature?*

**Exit criteria — all met.** Scouting costs money and takes sim-time through six
routes with supply distributions; the bench has slots and upkeep; the Trade Desk
gives reserve an alternative use; the runner dispatches expeditions and takes a
`--bench` flag for the inversion check.

**Measured:** the bench does *not* invert — a full bench beats an empty one on
money, win rate, renown, and front-line attrition. Upkeep stays at 6/hour.

**Found along the way:** renown movement was net-negative at a realistic win rate
(an absorbed wave scored +0.2 against a −2 loss), so a deep bench actively
destroyed renown and the league spiralled to zero. Retuned to +1 / +0.5 / −1 and
pulled into a `RENOWN` constant. Block 3 should revisit this properly.

---

## Block 3 — Renown and the gym economy ✅ DONE

### The rename

`prestige` → `renown`, plus a new `peakRenown` that only ratchets. This is a
save-format change, so it needs a migration in `persist/save.ts` — the first one
the project will have.

### Gym unlocks, reworked

- **Gate on peak renown**, so unlocks arrive predictably instead of oscillating
  in and out of reach.
- **Availability is not acquisition.** Clearing the threshold makes a gym
  *available*; building it costs money. Unlocking becomes a decision about timing
  rather than an event that happens to you.
- **The offer carries information.** For each candidate type, show: how many
  creatures you own of it, which of your routes supply it, and its share of the
  current challenger meta.
- **Scale to four gyms.** Not eight — four is enough board to make casting
  interesting without eight salaries and eight undercards stressing an economy
  you just rewrote. The rest of the Regional tier arrives in Block 5, paid for by
  facilities.

**Falsifiable question:** *Can you explain, in one sentence, why you chose the
gym type you chose?*

**Exit criteria — all met.** `prestige` → `renown` with a ratcheting `peakRenown`
that every gate reads; save v3 migration; four gyms; construction costs money;
the type offer briefs owned count, supplying routes, and challenger meta share.

**Scouting was reworked in this block too**, replacing Block 2's timed
expeditions. No waiting: three routes are *offered*, taking one redraws the set,
and creatures arrive at once — the cost of a choice is the alternatives given up.
Charges bank over time (cap 5) so time away hands you a burst of moves rather
than a queue of timers, and keeps scarcity intact once facilities make money
abundant. Scouting a route grants permanent intel on it.

**Offer weight is derived, not authored.** A route's frequency comes from the
expected power of a draw from it, so strong routes are rare because they are
strong — 8:1 between commonest and rarest. Adding species to the catalog
reprices every route automatically. Check it with
`npx tsx scripts/routes-report.ts`.

**Found along the way:** an upper-percentile power statistic was tried first and
inverted the result — nearly every Gen 1 type has a strong member, so the top end
looked identical everywhere and Dragon's Spine came out *commoner* than Verdant
Path. Expected-draw mean with a steep exponent is the honest statistic.

**Renown equilibrium had to be tuned twice.** These are two knobs doing two jobs
and they are easy to confuse: the win/absorbed/loss *ratio* sets the equilibrium
win rate (~61%), while `WAVE.challengerPowerPerRenown` sets how high renown
climbs before the league is pushed back to it. The first pass had a symmetric
penalty, which put the equilibrium at zero and meant nothing ever unlocked.

---

## Block 4 — Crude promotion: the curve test ⚠️ DONE — RESULT IS MARGINAL

**This block exists to answer one question as early as possible, and it is
deliberately ugly.**

The riskiest remaining assumption is that the reset loop makes run two feel
meaningfully faster than run one. Everything after this block *amplifies* that
loop — so if the loop is flat, Blocks 5 through 7 would be amplifying nothing.
Finding that out now costs a week; finding it out after breeding costs months.

Build the minimum that tests it:

- **Readiness check**: every gym staffed, every gym bonded above a minimum, peak
  renown above a bar.
- **Induction**: choose three creatures for the Hall of Fame.
- **Mentors**: each permanently accelerates bonding for its type in all future
  tiers.
- **Tier scaling**: a receipts multiplier and a higher gym cap.
- **No Champion challenge**, no ceremony, no polish. Those come in Block 7.

Accept that promotion here resets very little, because facilities and breeding do
not exist yet. That is fine — the question is not "does resetting feel good", it
is "does Mentors make the next run faster". The balance runner answers it.

**Falsifiable question:** *Measured with `npm run sim`, does tier two reach the
same renown in meaningfully less time than tier one?* If not, Mentors are too
weak or the whole reset premise is wrong — and either way you want to know here.

**Exit criteria — met, but read the result before building on it.**

Also landed in this block, at the user's request: **creature levels and
evolution**, **wild encounter rules** (starters and legendaries never appear;
unevolved forms are the staple; only ~7% of finds are final forms), and a
**reworked Trade Desk** where the player picks what goes on the table and the
offer's average power drives what comes back.

### The measurement

Eight seeds, 260 sim-hours each, measuring how long each tier takes to reach the
same 2,500 renown mark:

| | Mean |
|---|---|
| Regional | 9.0h |
| National | 8.5h |
| **Change** | **−5%** |

Tier two was faster in **6 of 8 seeds**. So the loop is *not* flat — but a 5%
speedup is nowhere near enough to make a player want to prestige, and the
variance between seeds is larger than the effect.

### Why it is weak

Mentors are typed. If the three creatures you induct do not match what the next
league needs, they do almost nothing — that is the entire source of the
variance. The player currently has no way to steer toward types they will want.

### What the first pass got wrong

- **Mentors were bond-speed only.** Bond buys *reliability*; raw power is what
  drives renown. Bond-only mentors barely moved the curve at all. They now also
  train new arrivals of their type up several levels, which is both the
  thematically right effect and the one that works.
- **Promoted leagues were founded differently from fresh ones** and quietly
  skipped the starting bench, so every run after the first began *worse off*.
  This alone made tier two 27–38% slower. Founding now goes through one shared
  `foundLeague`.
- **The national renown bar was set at essentially the reachable ceiling**, so
  the league promoted once and then stalled for 350 sim-hours with nowhere to go.

### Before building Block 5 on top of this

Options, roughly in order of expected effect: let the player influence which
types they can induct; raise the induct count; carry something else across
(route intel is the obvious candidate); or accept that facilities in Block 5 are
what will actually make the loop pay. **Do not assume Block 5 fixes it** — decide
deliberately.

---

## Block 5 — Facilities, and the rest of the board ⚠️ DONE — CURVE DID NOT BEND

Where multiplicative growth enters, and where the board grows to full Regional
size. Together these are the in-tier progression the player actually feels.

| Facility | Effect |
|---|---|
| Scouting Office | More expedition slots, route intel, better yields |
| Training Grounds | More bond slots per trainer; faster bonding |
| Medical Center | Faster fatigue recovery; extends career length |
| Trade Desk | Improves the off-type conversion rate |
| Day-Care | Built here; does nothing until Block 6 |

Also in this block: **expand from four gyms to eight**, funded by facility-driven
income. The board growing is the most legible progress signal the game has.

Watch the runner closely — this is where the curve should visibly bend, and where
runaway growth is easiest to create by accident.

**Falsifiable question:** *Does the money curve bend upward after facilities land?*
Measure it, do not feel it.

**Exit criteria — partly met. Read the measurement before Block 6.**

Five facilities, all with real multipliers; eight gyms reachable; bench slots
purchasable per gym. Also landed at the user's request: **recall**, which returns
a creature from the front line or bench to reserve, and a **Trade Desk that
offers every reserve creature** rather than only off-type ones — creatures that
could serve the gym are marked, not hidden.

### The measurement

200 sim-hours, facilities on versus off:

| | Off | On | Change |
|---|---|---|---|
| Money | 13.0M | 18.3M | +41% |
| Renown | 2,731 | 5,046 | +85% |
| Active roster | 34 | 110 | +224% |

Facilities clearly pay. **But the curve did not bend.** Money gained per 50-hour
window at steady state: 5.23M, 5.76M, 5.60M — a straight line at a higher slope,
not acceleration.

### Why, and the decision it forces

**Every multiplier in the game is capped.** Facilities max out at level 4–5. Gyms
cap at 8. Renown equilibrates against challenger scaling by design. So income
within a tier is structurally bounded, and the only unbounded axis is tier
progression — which Block 4 already measured as worth only ~5%.

This is the point the roadmap named for stopping and rethinking. Three ways out:

1. **Uncapped facility tracks** with escalating costs — the standard incremental
   upgrade curve. Money always has somewhere to go and buying more always yields
   more. Smallest change, most genre-conventional.
2. **More gyms per tier**, so the board keeps growing.
3. **Accept linear-within-tier** and make tier progression the growth axis —
   which requires many more tiers than three, and a much stronger reset bonus
   than Block 4 measured.

**Do not start Block 6 until this is decided.** Breeding amplifies whatever
curve exists; it cannot create one.

### Found along the way

**Training Grounds bought bond slots the gyms had no room for.** A gym's own
`slots` cap bound first, so the facility silently did nothing past the third
creature — and worse, it meant *architecture* was the binding constraint rather
than trainer attention, quietly overriding the design's central pillar. Caught by
a test, not by playing. Front-line capacity now rises with the facility.

---

## Block 6 — Breeding, pedigree, retirement ✅ DONE

The emotional engine from the design document, and the thing that turns a spent
career into an asset.

- Retirees move to the Day-Care as breeders (already true; now it matters).
- A child inherits a **stat floor** from both parents, **one trait**, and a
  **visible pedigree** — a named ancestry chain showing each ancestor's record.
- **Parents' bond affects offspring quality**, so bonding pays forward.
- **A long career produces better children.**

This closes the loop: career → lineage → career. It is also the second answer to
type scarcity — breed toward a type your routes do not supply.

**Falsifiable question:** *Do you look at a pedigree unprompted?*

**Exit criteria — all met.** Retirees breed in the Day-Care, offspring hatch as
the *base form* of a parent's line, both parents are recorded, and the pedigree
renders on the Card. Bond and career spent both lift the inherited power roll,
capped so lineages cannot run away.

Also landed at the user's request: a **Trade Desk grid** with type filter, sort
by power/level/name/type and a hide-usable toggle; **auto-scouting** at Scouting
Office level 4 (reduced yield — automation removes the chore without making
attention worthless); and the **Elite Four**, unlocked once all eight gyms stand.

### Correction: the Elite Four were built wrong the first time

The first pass made them a throughput multiplier — you seated *creatures* and
challengers arrived faster. That is not what the Elite Four are. They are four
**trainers**, stronger than any Gym Leader, with the **Champion** above them,
and they are the penultimate bosses of a league.

Rebuilt to match:

- Five seats — four Elite plus the Champion — opened once all eight gyms stand.
- Each seat is **staffed by a hired trainer** who arrives with their signature
  creature, and fields a team of up to four of their own type.
- A challenger who beats every gym earns a **gauntlet run**, facing each seat in
  order. Every seat they clear makes them more dangerous.
- **An empty seat is a free pass.** Clearing all five takes your league.
- Turning a run away pays far more than any gym wave; a challenger reaching the
  Elite tier at all fills the stands whether or not they get past the first seat.

This is an endgame *event* layer rather than a stat buff, which is both correct
to the source and better design — the drama is in how far a challenger gets.

### Correction: the Day-Care was doing the wrong job

It was a shelf for retirees. In the games the couple take **two** creatures and
raise them: they gain experience with the passage of time rather than from
battle, dropping off is free, and collecting costs a flat fee plus a sum per
level gained. Rebuilt exactly that way, and eggs now come from a compatible pair
left in their care — which is what makes it the place a lineage comes from
rather than a graveyard.

It also gives time away from the app something to grow other than a bank balance.

### Balance notes

Both systems needed real retuning, and the runner found each problem:

- **The gauntlet fired the instant the eighth gym was built.** Opening the tier
  should not immediately cost you the league; there is now a full interval of
  grace.
- **A challenger turned away at the first seat paid nothing.** Reaching the
  Elite tier is itself a paying event now.
- **The league was being taken every 27 minutes.** Losing has to stay rare and
  memorable. After tuning it sits around a third of runs under the balance
  runner — and the runner deliberately under-equips the Elite tier, staffing it
  from leftover reserve while a real player would put their best there.
- **Auto-scouting quietly recreated the hoarding problem.** With no ceiling the
  office collected forever, the roster hit 720, and the runner slowed six-fold.
  It now stops once reserve is comfortably stocked.

## Block 7 — The human layer, and promotion properly

The last systems layer, and the first block that is mostly content.

- **Champion challenge**: the discrete, hard, multi-gym gauntlet that Block 4
  skipped. Promotion gets its ceremony, and the induction screen gets the polish
  it deserves — it is the emotional peak of the game and the one moment the player
  is asked to say which creatures mattered.
- **Named rivals** arrive on a slow cadence and queue rather than expire.
  Defeating one makes them **hireable**, bringing their signature creature — the
  only way to obtain creatures you can neither scout nor breed.
- **Morale and resignations** get real UI.
- **Onboarding**: the scripted first hour, including the first fatigue moment at
  the fifteen-minute mark.
- **Offline polish**: a proper "while you were away" summary.

**Falsifiable question:** *Is the induction choice hard?* If you can pick
inductees by scanning a stat column, the design has failed at its central goal.

**Exit criteria:** a new player reaches their second gym without explanation.

---

## The party model rework

Landed after Block 6, correcting two things at once.

**The undercard had no analogue in the games.** It became junior **Gym
Trainers** — cheap hires with their own parties who stand between challengers and
the Leader, exactly as gyms work in the source. Every mechanic it had survives
(depth protects your aces, spare creatures get a purpose, "lots of Pokémon"
matters) and the vocabulary is now uniform: after the Elite Four correction,
*everything* is a trainer with a party.

**Parties are six.** Everywhere. Training Grounds stopped buying party slots and
now buys bonding speed instead, which is the better shape anyway — the design's
scarce resource is trainer attention, not architecture.

**Roster management became auto-fill plus pinning.** Rather than auto-selecting
everything (which would dissolve casting, the verb the game is built on) or
capping ownership (which fights "getting strong means having a lot of Pokémon"),
parties restock themselves and the player pins what matters. The box is never
sorted. Playtest #1's first question — *"do you voluntarily re-cast a gym?"* —
stays answerable, because pinning and hiring are still real, voluntary acts.

**Note:** the Elite Four correction removed the throughput multiplier, so the
"throughput beats receipts 2.5x" measurement recorded under Block 6 no longer
describes the current build. The curve question is open again and needs
re-measuring before the uncapping decision.

## Block 8 — The League Director layer

Sourced from `League-Director-Concept.pdf`, an earlier concept draft for this
same game found after Block 7 was scoped. Most of it agrees with what is already
built — the Director premise, type-bound gyms, the Elite Four and Champion as
staffed people, morale as wage tension, telegraphed threats, pessimistic offline.
This block is the delta: the five things it had that the build did not, plus the
one place it was simply wrong.

**What the concept had that the build lacked.** An org chart — trainers employed
as something other than defenders, which is its answer to the duplicate problem.
A loss state that is a twist rather than a counter. A morale staircase with a
release valve instead of a cliff. Recurring offers that cost something either
way. And a single screen that tells you what happened while you were gone.

**What the build has that the concept lacked.** Bond and career. The concept's
answer to "no sense of connection" is that every creature has a *job*; this
build's answer is that creatures wear out and you come to know them. These are
complementary and both are kept — the workforce gives the box a purpose, career
gives individuals an arc.

**What was rejected.** Rival leagues, present in the concept as the origin of
challengers and the destination of declined prodigies. They are not a thing in
the source games. A declined prodigy instead becomes *motivated*: they return as
a named, stronger challenger who comes for the league. One rule now covers every
departure — **anyone who leaves your league comes back to fight it** — and it
serves the declined prodigy and the walked-out Champion alike.

Also rejected: the concept's rule that the League *cannot lose while actively
played*. That removes the stakes from the thing the whole game defends. The rule
adopted instead is that the title cannot be lost **while away** — see 8.2.

### 8.1 — The morale staircase

Morale currently has one failure mode: it reaches zero and the trainer resigns.
A cliff, with no move the player can make on the way down.

It becomes a staircase: low morale degrades performance → sustained low morale
triggers a **suspension** (unavailable for a period, returns at reduced standing)
→ repeated suspensions end in **permanent departure**. Escalating, not infinite;
losing someone for good takes real neglect.

The load-bearing addition is **voluntary demotion as a release valve**. The
player picks any lower posting — Champion to an Elite seat, Elite to a Leader, a
Leader to a junior — and the trainer's **party travels with them**, capped to the
new role, overflow to the box, **no bond reset**. That last clause is the point: a
demoted Leader arriving with the creature they have been bonded to for nine
hundred battles is the story the bond system exists to tell. Demotion is a tool
for keeping someone, not a punishment.

Built first because 8.2 lands its consequences *through* this system.

### 8.2 — Losing the title, and the second prestige path

Today a challenger who clears the board increments `leagueTaken` and costs some
renown. A number moves. This is the game's largest event and nothing happens.

**Forced recruitment.** The challenger who clears every gym, every Elite seat and
the Champion **becomes your Champion**. You now manage them: higher salary
escalation, faster morale decay, and they refuse demotion during a protection
window, so you cannot simply bench the upstart. If mismanaged they **walk** — and
then return later as a challenger, on the same loop as the declined prodigy.

**The ripple.** The seats the challenger beat cleanly take morale damage and
suspension risk; the trainers who held take nothing. The loss is felt through the
8.1 staircase, which already has recovery paths, rather than through a new
punishment mechanic. Trainers who held are quietly identified as the ones worth
keeping.

**The prestige fork.** Losing the title **unlocks** promotion; it does not force
it. The player chooses: take the tier now, or stay and win the title back first.

| Path | Trigger | Carries forward |
|---|---|---|
| Voluntary | Readiness check across the whole board | 3 Hall of Fame inductees + Mentors |
| Forced-recruitment | Title lost | The usurper — trainer and their whole party. Nothing else. |

The trade is purely speed versus payload. Promote immediately and arrive at the
harder tier with one monster and a thin bench, or grind the title back and arrive
properly staffed with your own legends and the Mentors that actually bend the
curve. This also makes the anti-throw guard structural rather than a rule: a
thrown league promotes into a harder tier with a weak roster, so the exploit
punishes itself.

**Offline protection.** The title cannot be lost while the player is away, up to
**~15 days**, after which the protection *decays* rather than snapping. Past that
point the sim runs the real gauntlet against the real lineup — a player who left
a fortress may genuinely hold, which is what makes the rule reward leaving the
league in good shape. Needs its own wall-clock stamp: `OFFLINE_CAP_SECONDS` is
twelve hours of *credited* time and cannot answer "how long has it been".

### 8.3 — The workforce

The concept's anti-duplicate mechanism, and the largest addition here. Every
trainer in the build today is a defender. These are not.

**Catchers** replace paid scouting outright. You staff a route with a trainer
**and a field partner** — the concept's own thesis made literal: your fortieth
Zubat is not inventory, it is somebody's working partner. Continuous work, not
timed expeditions, because continuous assignment is the correct idle grammar and
it makes the route screen a *staffing* screen. Route work costs **fatigue, never
career** — routes are the safe posting, and the box has a job that never kills
anyone. Intel survives as a purchase and is now a better one, since committing a
trainer and a partner to a route is a real commitment. The auto-scout upgrade
becomes **Catcher slots** — headcount, not a percentage.

**Battlers** work routes for money *and experience*, scaling with route tier and
party strength, with real risk: posted above their weight they earn more and come
back beaten, costing morale and downtime. Party capped at **four** through the
mid-game — they are not gym parties.

This is likely the answer to the flat-curve problem. Every lever added since
Block 4 — facilities, Elite throughput, renown-scaled attendance — was a level
shift that renown then absorbed, because renown equilibrates by design. Route
income scales with **headcount and route tier**, which renown cannot equilibrate
away. It is the first income axis in the game that does not self-correct.

**Coaches** are hireable staff, separate from Mentors (which remain the prestige
carry-forward). Their signature move is the concept's "exp share done properly",
narrowed to one specific case: a creature at the **end of its career** passes its
levels to a young one. A generic level-shredder turns the box into fuel; this
version is the payoff the whole bond/career system has been building toward and
never landed. Today a veteran runs out of battles, goes to the Day-Care, and that
is the end of them. With this, the last act of a creature you have had for twelve
hundred battles is to make the next one.

**Currency is Pokéyen.** "Gate receipts" describes where money comes from, not
what it is. The workforce draws wages from the same pot.

### 8.4 — The Professor

Recurring offers that cost something whichever way you answer.

**The prodigy** has real upside and a real flaw, drawn from a typed set so that
each one bites a system that already exists: *bad coverage* (locked to a type
already crowded on your board — reads against the Threat Report), *fragile* (high
power, low morale floor — reads against 8.1), *arrogant* (refuses demotion, steep
salary escalation — reads against the demotion valve). Accepting costs a wage slot
and pulls a mentor off their own job. **Declining is not free**: they return as a
named, stronger challenger. Beating them softens them by degrees, and after
several defeats they finally accept a post — so the refusal is priced honestly at
several hard fights instead of one wage slot, and the reconciliation is earned.

**The egg** hatches into something **rare, not strong** — unusual species,
starter-tier lines, collection value. Deliberately not power creep. It is the only
mechanic in either document that rewards collecting rather than optimising.

**Day-Care** moves behind a **facility purchase**. The concept is right that
breeding must not be an always-on tap, and a purchase is a trade-off where a badge
gate is only a timer.

### 8.5 — The Desk

A new first tab and the default landing screen: what happened overnight, then the
things awaiting a decision, each linking to the tab that resolves it. The
professor at the door, a suspension pending, a rival announced, a Catcher back
with something unusual.

A modal gets dismissed and its information is gone; a banner cannot hold a
night's events. The Desk is the only version still useful at minute three, and it
gives the game the thing it currently lacks entirely — a place where it talks to
you.

Built last, once there is something to report.

**Falsifiable questions.**
- *Does route income bend the curve?* If headcount-driven income equilibrates the
  way renown does, the flat-curve problem is structural and the uncapping decision
  can no longer be deferred.
- *Is demotion ever chosen?* If the runner and playtests only ever see trainers
  suspended and never demoted, the release valve is decorative.
- *Does anyone stay after losing the title?* If promoting immediately is always
  correct, the fork in 8.2 is a fork in name only.

**Exit criteria:** a league can be lost, rebuilt, and lost again without the
player ever seeing a fail screen — and the second loss feels different from the
first.

### Measured on landing 8.1 and 8.2

**The Elite tier was losing 89% of its gauntlets, and it was not a tuning
problem.** Challenger level scales with renown; renown climbed to ~10,000; so
challengers arrived at **level 88 against Elite seats fielding level 17–25**. No
casting decision answers that. The league's own creatures level only through
battle XP, which career deliberately bounds, so nothing on the player's side
tracks a renown-driven curve.

Two constants — `ELITE.powerMultiplier` and `ELITE.powerPerStage` — turned out to
be dead. Never referenced. The gauntlet challenger was an ordinary badge-8
challenger the whole time.

Fixed with `CHALLENGE.maxLevelRatio`: challengers scale *toward* the league's own
fielded level, never past it. Fall rate **89% → 14%**. This is a holding measure.
The real answer is a system that levels the league's creatures at a comparable
rate, which is what Battlers are for — re-measure the fall rate when they land.

**Capping challenger level removed the only brake on renown.** The `RENOWN.perLoss`
comment said so explicitly: challenger power scaling *was* the ceiling. With it
capped, renown ran to **88,660** and gate receipts to 94M.

Replaced with `RENOWN.decayHalfLifeSeconds` — proportional decay. Renown now
equilibrates at ~7,000–9,000 where inflow matches decay. This is the better shape
regardless: standing is a reputation you keep earning, not a score you bank. Two
knobs with two clear jobs — the level ratio sets the win rate, decay sets the
renown ceiling.

**Where it landed** (60h, 8 seeds, `--promote earned`): win rate 96.5%, renown
~7,200, 42 gauntlets with 6 lost, regional tier at 8.9h.

**Still open.** The morale staircase never fires in the runner — money is never
scarce (12.7M banked, zero resignations), so nobody is ever underpaid. 8.1 is
built and tested but currently unreachable in normal play. The Battler wage
economy is where that gets pressure-tested.

**Promotion had no UI at all.** The prestige loop existed only in the sim and the
balance runner — a player could never actually promote. Built as part of 8.2,
since the forced path needed a screen anyway.

### Measured on landing 8.3 (Catchers)

Paid scouting is gone. Catchers are hired, posted with a field partner, and work
continuously; 6 Catchers brought in ~135 creatures over 60h.

**Fatigue was charged per catch, which had it exactly backwards.** Harder routes
are slower, so they yielded fewer catches and therefore tired the partner *less*.
Worse, `recover()` did not know a posted creature was working, so rest outpaced
the cost entirely and a partner sat at zero fatigue forever — route work was
free. Now fatigue is charged for **time on the ground**, scaled down as the
partner grows into the route's band, and a posted partner recovers at 35%. A
partner at the route's floor wears out in about half an hour; one at the top
never does. That is the whole system in one number.

**Scaling challengers to a league-wide average is gameable.** Once Catchers run,
the roster fills with low-level catches — and averaging over all of them made
challengers *weaker the more creatures you owned*, rewarding exactly the hoarding
the design exists to make unnecessary. `fieldedLevel` now reads the strongest
third, and gym challengers scale to **that gym's own defenders** rather than to
any global number.

**The Elite tier could not develop its roster.** It fights once an hour; a gym
fights every few seconds, so with a flat XP award the Elite fielded level 6
creatures against a league in the twenties. Elite bouts now pay 40× — an Elite
battle genuinely is a far bigger fight — and seats reached level 24–49.

**The gauntlet needed a floor, not a reference.** Scaled purely to the Elite's
own strength, neglect became *safe*: a tier of rookies drew rookie challengers
and never fell (0% fall rate). Scaled purely to the league, neglect was fatal
(28%). It now scales to the tier that will meet them, floored at 70% of the
league that produced the challenger.

**Where it landed** (60h, `--promote earned`): win rate 95.6%, 47 gauntlets with
**1 lost**, Elite seats at level 24–49, 133 caught, zero resignations.

**Still open.** Morale never fires — money is never scarce, so nobody is ever
underpaid, and the 8.1 staircase remains unreachable in normal play. Battlers are
where the wage economy gets its pressure test.

### From the first real playtest

Six defects, four of them structural.

**Trainers were being handed fully evolved monsters.** `grantParty` asked for a
level 8 team; `makeCreature` clamps *upward* to a species' evolution floor; so a
Fire trainer's "level 8" party could contain a level 36 Charizard. That is where
the level 40+ rival at the first gym came from, and the free starting trainer had
the same problem. Fixed at the source with `grantableAtLevel`, which filters the
pool to species a trainer could plausibly have at that level. Starters are now
excluded from grants as well as from routes — a starter is something a person is
*given* at the beginning of their story, not something in a hiring pool.

**`Rival.won` meant the opposite of what it said.** It was assigned
`!result.tookBadge` — true when the *league* held. Renamed to `held`. The branch
that hires a beaten rival reads correctly now instead of looking like it fires on
a defeat.

**A beaten rival was stationed at the gym they had just attacked.** Rivals pick a
type that *beats* the gym they target, so turning one away installed a Fire
trainer in the Bug gym. They now join a gym of their own type, or not at all.

**Rivals were the one challenger path with no level reference** and drew on the
league-wide number, so they could arrive at gym one with a party nobody there
could answer. They now scale to the gym they walk into.

**A new league could not hire a Catcher.** Money started at zero and creatures
now come *only* from staffed routes, so the game's central supply chain was
locked behind a wait on the opening screen. Leagues open with enough for the
first hire.

**Names show the species, not the nickname.** Nicknames are still earned and
still shown on the summary screen; a roster of two hundred invented names is
unreadable, and the player reasons in species.

### Consequences, measured

**The box deadlocked.** Route supply is by type and a party only accepts its
trainer's type, so a flat idle-creature ceiling filled with creatures no gym
could field — and stopped the only thing that could have brought in the ones it
needed. The ceiling now counts **usable** reserve, scales with the board, and a
much higher hard cap releases pure spillover (unusable type, unbonded, never
fielded) so an unattended league still cannot grow a roster of hundreds.

**Route fatigue had no duty cycle.** A worn-out partner recovered a hair, worked
one second, and tired out again — postings ran at a trickle forever while the
Catchers screen showed everyone hard at work. Now a tired partner *sits down*,
recovers at the normal rate, and resumes at `CATCHER.rested`: a shift, then a
break.

**Honest trainer parties broke the renown economy.** With level-appropriate
teams the early league is far weaker, and the 4h renown half-life ate the inflow
faster than a five-gym board could produce it — the league stalled at 1,175
renown and never opened the Elite tier at all. Re-fitted to 16h.

**Where it landed** (60h, `--promote earned`): 8 gyms, peak renown 9,858, win
rate 87.7% (was an implausible 95%+), Elite staffed 5/5, 31 gauntlets with none
lost, 247 caught, nobody short-handed. First tier gate at 29.8h rather than 8.9h
— slower, and honest: the board is no longer defended by creatures its trainers
could never have had.

**Watch next:** the gauntlet fall rate is now 0 in 31. Rare was the goal, but
never is not — re-measure once Battlers change how fast the Elite develops.

### Wildcards removed

Leaders and Elite seats kept two off-type slots, and juniors could be hired off
the gym's type entirely. Both existed for one measured reason: across Gen 1
alone, **eleven of seventeen** gym types had no roster answer to their worst
matchup, so a Fire gym drowning in Water could do nothing at all.

Gens 2 and 3 took that to **three of eighteen**. The escape hatch has outlived
its problem, and the rule it replaced is the better game: a gym *is* its type,
all the way through, and answering a hostile meta means casting within it or
building a different gym. Every trainer in the league is now strictly type-bound.

### Interface work alongside it

- **Sprites stopped being squashed.** Every call site set matching `width` and
  `height`, which stretched half the dex — Onix is tall, Wailord is wide. A
  `Sprite` component now keeps the *box* square and contains the sprite inside
  it, bottom-aligned the way the games stand a creature on the ground.
- **The challenger's bench is legible.** It drew 30px box icons; it now draws
  the battler sprites at 44px, because knowing what is *still coming* is the
  whole reason the bench is on screen.
- **The PC stopped rendering two boxes.** Picking a trade type used to open a
  second full grid, with its own filter and sort, directly under the first —
  the same creatures listed twice. Trading is now a *mode* on the one grid: the
  box narrows to what the desk will take and cells select instead of opening,
  with a sticky bar for what you are offering and what it is worth.
- **Every party is manageable in one place.** A "By trainer" view in the PC
  shows each Leader's and each Elite seat's party side by side, draggable, with
  the available box under each. Comparing what your Leaders field is the casting
  decision, and it could not be done one gym screen at a time.
- **Routes split into Ground and Catchers.** Deciding *where* to work and
  managing *who* works are different tasks, and stacking them left neither any
  room. Training becomes a third view here when Battlers land.
- **The dev strip reaches the far states.** Build the board, staff everything,
  fill the box, force a rival, force a gauntlet, grind morale, add money. These
  live in `src/sim/devtools.ts` rather than the UI, because they are state
  transitions and the sim owns those. They exist because the Elite tier shipped
  losing 89% of its gauntlets partly because reaching it took forty sim-hours.

### 8.3b — Evolvers

The training half of field work, and what Block 8's plan called Battlers. Named
**Evolvers** to stay clear of Gym Trainers, and named for what they do.

An Evolver takes up to four of their own type onto a route, earns Pokéyen, and
brings them back levelled. Catchers and Evolvers now share a module and a
`Posting`, because they are the same shape: a trainer standing on a route with
their own party.

**The stretch** is the mechanic that makes it a decision. A Catcher refuses
ground its partner could not handle; an Evolver may be posted *below* a route's
band on purpose, up to fourteen levels. The further under, the more they earn and
the faster the party levels — and the higher the chance per round of coming back
beaten, which costs the whole crew fatigue and their trainer some heart.

**Field staff are type-bound**, like everyone else in the league. They were the
one place where type did not matter, which made them the one place with no
casting decision in it.

**Hiring is an offer, not a catalogue.** Three types are drawn; take one or pass
and see three more. Free choice made a Catcher a component you bought — you
already knew which type you wanted, so the only question was affordability.
Drawing them means a Water Catcher is a piece of luck you build around.

Base slots are 3 per role. The Scouting Office buys Catcher postings; the
Training Grounds now buys Evolver postings alongside bonding speed.

**Measured** (60h, `--promote earned`): 8 gyms, peak renown 5,816, win rate
86.8%, first tier gate at **14.9h** — down from 29.8h, because training finally
exists. 236 caught, ₱3.6M earned by Evolvers, 8 parties beaten, nobody
short-handed.

**Two findings.**

*Evolver pay was halved after the first pass*, where six postings out-earned two
thirds of the league's gate receipts and training quietly became the whole
economy. It should be a second income axis — one that scales with headcount
rather than renown, and so cannot be equilibrated away — not the primary one.

*Wages still do not bite.* Sixteen field staff cost roughly ₱21,000 over sixty
hours against millions in income, so the 8.1 morale staircase remains
unreachable in normal play. The imbalance is on the wage side, not the income
side, and it wants its own pass.

*The Elite still does not develop.* Seats sit at level 14–21 and the gauntlet
fall rate is 0 in 51. Evolvers train **their own crews**, and moving a trained
creature onto an Elite seat is a player action the balance runner does not model
— but Coaches, and the end-of-career level transfer, are the real answer.

### Naming, and the second playtest pass

**Catchers → Rangers. Evolvers → Handlers. The Routes tab → Field, and its first
view → Routes.** "Catcher" and "Evolver" described mechanics rather than people,
and the tab was named after one of the three things on it.

**Rangers no longer teach their partner anything.** Both roles levelling their
crews left no reason to run a Handler — catching taught you *and* paid you in
creatures. Collecting and training are now different jobs with different rewards.

**A Ranger's posting is a shift**, forty-five minutes and then they come home
with whatever they found. Postings that never ended made the whole screen one
decision made once: staff every route, never look again.

**A route now holds one Ranger and one Handler.** They are doing different things
on the same ground, and making them compete for one slot meant Handlers — who
stay until recalled — quietly squeezed Rangers off the map: eight Rangers managed
ten shifts each across sixty hours. With the split, 213.

**Gym duty teaches something.** `xpPerBattle` was 1 against an `xpBase` of 12, so
a creature needed a dozen bouts to reach level 2 and hundreds to matter. Now 6.
Defending the board is the game's central activity; it cannot be the one activity
that grows nobody.

**A Leader's depth follows their gym's rank** — two creatures at the first gym,
six at the last, interpolated across the board. Gym one opening with a full party
was the wrong shape twice over: it handed the player their whole roster problem
on the first screen, and made the first badge as hard as the eighth.

**Challengers trade depth against quality.** A full team of six may well walk into
gym one — people do arrive with a full box — but six at the gym's level is a wall,
not a first badge. Every creature past the second shaves level off the whole
party, so depth is a threat by weight rather than by quality. `maxLevelRatio` and
`depthPenalty` are two halves of one number: this pass raised the ratio from 1.8
to 2.1 to pay for the penalty, and the win rate landed back at 88.4%.

### Interface

- **One control per party slot.** Up, down and REMOVE made a six-slot party
  eighteen buttons competing with the creatures for attention. Reordering already
  had a better gesture in dragging, so what is left is a single × that appears on
  the slot you are pointing at.
- **Empty slots ask to be filled**, opening a picker of everything that trainer
  could field. The permanent available-list under every party is gone — it was
  always open, always the length of the box, and pushed the party off screen.
- **"Content" stopped being printed everywhere.** A full meter reading *Content*
  under every trainer on every screen is noise pretending to be information, and
  under a *party* heading it read as a fact about the party. Standing now shows
  only when something needs attention; otherwise one quiet line.
- **Tabs fit.** Six of them scrolled sideways on a phone — the one navigation
  element in the app was the one thing you could not see all of.

**Measured** (60h, `--promote earned`): 8 gyms, win rate 88.4%, first tier gate at
14.4h, 215 caught over 213 shifts, ₱3.9M earned by Handlers, 14 parties beaten.

**Still open, unchanged:** the gauntlet fall rate is 0 in 57, wages do not bite,
and renown now equilibrates around 26,000 with receipts to match. The economy
wants its own pass rather than another round of income tuning.

## Block 9 — The scarcity pass

Sourced from `scripts/diagnose.ts`, added to answer a blunter question than the
balance runner asks: over a full playthrough, how often does each mechanic fire
*at all*? A system that never triggers is not balanced or unbalanced, it is
absent — and absent systems are invisible in every other measurement, because
they contribute nothing to any of them.

**The 120-hour reading was that six built systems never ran.** No promotion, no
Hall of Fame, no Mentors. No eggs, no pedigree. No suspensions. 288 rivals and
zero hired. Career at 7.4%. And zero upsets — because `report.upsets` was read
in `tick.ts` and **never written to anywhere**: bond had been buying reliability
in total silence for the whole project.

### The root cause was one battle rule

Every gym looked like this:

```
ground   1.00 bond / 202 wins · 0.08 / 8 · 0.00 / 0 · 0.01 / 1 · 0.00 / 0
```

**One creature and five spectators.** Sequential knockout meant position two
stepped up only when position one fainted, and position one won 88% of its
bouts — so it fought essentially every bout in the league. Which is the genre
failure this entire design exists to answer, *"you end up with one strong Pokémon
and a bunch of weak ones"*, arriving through the back door of its own battle
system.

Nothing downstream could work. Bond pooled in one creature, so no gym could meet
the promotion bar, so the prestige layer never ran. Career wore down one life
instead of a roster, so nothing retired, so the Day-Care never opened.

Fixed in three places, because a stand has two shapes and both were broken:

- **Parties take turns leading.** Position one leads a challenge, position two
  the next. Order still decides the sequence and who backs up whom; it is no
  longer a permanent posting.
- **A creature rotates out after it scores a knockout**, so a six-strong
  challenger meets up to six defenders and depth answers depth.
- **Auto-fill stopped upgrading.** It replaced the weakest unbonded member
  whenever the box held something 1.25× better — and by the mid-game the box
  holds three hundred creatures, so something better is *always* available.
  Every slot below the protection threshold churned faster than it could earn
  any bond. Auto-fill now only fills empty slots; deciding who to drop is the
  game, and it belongs to the player.

### The four fixes

**Upsets exist.** A bout whose result contradicts the matchup now reports itself,
so bond is visible: 3,258 in a 90-hour league. That the number is *high* is
itself the mechanic explaining itself — an unbonded roster is that unreliable.

**The promotion gate stopped punishing depth.** It read *average* bond per gym,
and since every new arrival lands at zero, deepening a gym lowered its average.
Measured: the one-deep Dragon gym at 1.00, the five-deep Ground gym at 0.22, and
the well-built gym was the one blocking promotion. It now asks whether a gym has
a **bonded core** — its best two, whatever else is standing there.

**Career means something.** At 6,500 battles a creature in daily gym duty had
spent 5.4% of its life in forty hours, putting a full career past seven hundred.
Now 1,400, which lands near the stated one-to-two-weeks target. Retirements went
from 3 to 23 in ninety hours.

That exposed a second bug immediately: a junior Gym Trainer's creatures are
theirs, not yours, so the box can never restock them — and once careers ran at a
realistic rate juniors emptied out and became free passes standing in a gym. They
now bring a replacement.

**Wages bite.** Payroll was **0.5% of income** — ₽266,000 against ₽54,000,000.
Salary now carries upkeep for every level of creature a trainer fields, so
payroll grows with the league rather than with headcount, and *depth costs
money* where it used to be free. Wages are now ~30% of income and the bank sits
in the low millions rather than at fifty.

**Bond gain tripled**, because sharing duty divided it. At 0.004 a creature
needed 125 wins to reach the bar — fine when one creature took every bout,
hopeless once each slot saw a quarter of the traffic.

**Catching no longer stalls while gyms stand short.** The box ceiling exists to
stop hoarding, not to stop the league being staffed, and it was doing the second.

### The Field, rebuilt around the route

Three lists — routes, Rangers, Handlers — meant posting somebody required
holding all three in your head: is this route free, is that Ranger idle, does she
have a crew. Three views of one decision, none able to make it.

Every route now carries **two slots**, a Ranger's and a Handler's, and each slot
is either the work happening in it or the way to start some — eligible staff,
their crew, and why anyone ineligible is. Crews are edited in place.

### Build order

Morale staircase ✅ → title loss, forced recruitment, prestige fork ✅ →
Catchers ✅ → Evolvers ✅ → Coaches → Professor → Desk.

---

## Cross-cutting work

Not blocks; these run alongside everything.

- **Balance runner policy** must be updated with each block, or its numbers
  silently stop meaning anything.
- **Save migrations** from Block 3 onward. Never delete an old migration.
- **Test the mechanism, not the tuning.** Block 1 already had a test break purely
  because a constant changed — write tests that construct the situation they need.
- **Deploy every block.** Pushing to `main` ships it; play each block on a phone
  before starting the next.

---

## Settled decisions

Agreed rather than assumed:

| Decision | Call |
|---|---|
| Prestige collision | Renown / peak renown / promotion / Hall of Fame. **No prestige scalar, no prestige shop.** |
| Scarcity mechanism | Routes with supply distributions — not rarity tiers, not catch rates |
| Undercard cost | Slots **and** upkeep, with upkeep dropped to zero if measurement inverts the mechanic |
| Promotion timing | Crude version at Block 4, before facilities and breeding, to test the curve early |
| Board size | Four gyms in Block 3; eight in Block 5, funded by facilities |
| In-tier progression | Gym count plus facility upgrades — the visible progress the mid-game runs on |
| Rival leagues | **Rejected.** Not a thing in the source games. Departures return as challengers instead. |
| Losing while away | Title is safe offline for ~15 days, then protection decays. Losses while *playing* stay real. |
| Title loss | Forced recruitment — the challenger becomes your Champion. Unlocks promotion, never forces it. |
| Second prestige path | Speed vs payload: the usurper now, or your own legends later. No new meta-currency. |
| Route work and career | Routes spend fatigue, never career. The box has a job that never kills anyone. |
| Paid scouting | Replaced by staffed Catchers. Intel survives as a purchase; auto-scout becomes Catcher slots. |
| Exp share | Narrowed to end-of-career level transfer via a Coach. No generic level shredding. |
| Currency | Pokéyen. "Gate receipts" is a source, not a currency. |
