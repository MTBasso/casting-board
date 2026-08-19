import { create } from "zustand";

/**
 * Language.
 *
 * Two dictionaries and a lookup, rather than an i18n library — the game has a
 * few hundred strings and one translator, and a framework would buy locale
 * negotiation and CLDR plural categories that two languages sharing one/other
 * do not need. What it *does* need is that adding an English string without its
 * Portuguese counterpart fails to compile, which the `Dict` type below enforces.
 *
 * Plurals are inline, in the string — see `fill`. They live there rather than at
 * the call site because the caller knows a count, not a grammar: Portuguese
 * needs the adjective to agree too, and English does not.
 *
 * The sim stays language-free: it emits keys and parameters, and translation
 * happens at render. A league saved in one language reads correctly in the
 * other, which would not be true if the log held sentences.
 */

export type Lang = "en" | "pt";

const STORE_KEY = "castingboard.lang";

function initialLang(): Lang {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORE_KEY) : null;
  if (saved === "pt" || saved === "en") return saved;
  // A Brazilian playtester should not have to find a setting first.
  const nav = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "en";
  return nav.startsWith("pt") ? "pt" : "en";
}

interface LangStore {
  lang: Lang;
  setLang(lang: Lang): void;
}

export const useLang = create<LangStore>((set) => ({
  lang: initialLang(),
  setLang(lang) {
    try {
      localStorage.setItem(STORE_KEY, lang);
    } catch {
      // A private-mode browser refusing storage is not worth failing over.
    }
    set({ lang });
  },
}));

/**
 * Fill `{name}` style holes. Values are stringified as they come.
 *
 * `{n}` is the value. `{n:one|many}` is the *word* that has to agree with it —
 * `"{n} {n:badge|badges}"`, `"{n} {n:insígnia|insígnias} {n:levada|levadas}"`.
 * Each word gets its own group, which is what makes Portuguese gender agreement
 * work without the string knowing any grammar.
 *
 * English and Portuguese share the rule that matters here: exactly one is
 * singular, everything else — zero included — is plural. A language that splits
 * it further would need a real plural engine, and would be the moment to stop
 * hand-rolling this.
 */
function fill(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(
    /\{(\w+)(?::([^{}|]*)\|([^{}|]*))?\}/g,
    (whole, key: string, one: string | undefined, many: string) => {
      if (!(key in params)) return whole;
      if (one === undefined) return String(params[key]);
      return Number(params[key]) === 1 ? one : many;
    },
  );
}

/**
 * Translate.
 *
 * A hook rather than a bare function so a language change re-renders the tree —
 * every caller is a component, and the alternative is a context nobody reads.
 */
export function useT() {
  const lang = useLang((s) => s.lang);
  return (key: Key, params?: Record<string, string | number>): string =>
    fill((lang === "pt" ? pt : en)[key] ?? en[key] ?? key, params);
}

/**
 * Translate a key the sim produced at runtime.
 *
 * The strict `t()` only accepts keys that exist, which is the whole point of
 * `Dict` — a missing Portuguese string should fail the build. But logs, field
 * events, decisions, objectives, routes, traits and kit all arrive as `string`,
 * because the sim is language-free and cannot import this file. Every one of
 * those call sites was written `t(entry.key as never)`, which switched the
 * check off at precisely the places a missing translation comes from.
 *
 * So they say what they mean instead. The guarantee moves from the type, which
 * was being lied to, into `i18n.test.ts`, which reads every key literal the sim
 * can emit and fails if either dictionary is missing it.
 */
export function useTk() {
  const lang = useLang((s) => s.lang);
  return (key: string, params?: Record<string, string | number>): string =>
    translate(lang, key, params);
}

/** For the handful of places that need translation outside a component. */
export function translate(
  lang: Lang,
  key: string,
  params?: Record<string, string | number>,
): string {
  const dict = lang === "pt" ? pt : en;
  const text = (dict as Record<string, string>)[key] ?? (en as Record<string, string>)[key];
  return text ? fill(text, params) : key;
}

export const en = {
  // -- Chrome --------------------------------------------------------------
  "app.title": "The Casting Board",
  "app.money": "Pokéyen",
  "app.renown": "Renown",
  "app.inParties": "In parties",
  "app.owned": "Owned",
  "app.season": "Season",

  "tab.desk": "Desk",
  "tab.gyms": "Gyms",
  "tab.pc": "PC Box",
  "tab.field": "Map",
  "tab.elite": "Elite",
  "tab.hall": "Hall",
  "tab.daycare": "Day-Care",
  "tab.facilities": "Facilities",

  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.hire": "Hire",
  "common.remove": "Remove",
  "common.add": "Add",
  "common.all": "All",
  "common.type": "Type",
  "common.sort": "Sort",
  "common.show": "Show",
  "common.level": "Level",
  "common.nothing": "Nothing here.",
  "common.locked": "Locked",

  // -- Desk ----------------------------------------------------------------
  "desk.title": "Desk",
  "desk.nothingOpen": "nothing outstanding",
  "desk.open": "{n} open",
  "desk.openUrgent": "{n} open · {u} urgent",
  "desk.allClear":
    "Nothing is waiting on you. The league is holding, everyone is working, and the box has room. Go and watch a gym.",
  "desk.quiet": "Quiet since you last looked.",
  "desk.since": "Since you last looked",
  "desk.held": "Held",
  "desk.badgesLost": "Badges lost",
  "desk.taken": "Taken",
  "desk.caught": "Caught",
  "desk.retired": "Retired",
  "desk.usurped": "{name} took the league, and is your Champion now.",
  "desk.suspended": "{name} was suspended.",
  "desk.rival": "{name} came for a badge.",
  "desk.workingToward": "Working toward",
  "desk.collect": "Collect",

  // -- Decisions the Desk raises -------------------------------------------
  "decision.gymOffer.title": "A new gym is open to you",
  "decision.gymOffer.detail":
    "Choose the type it will defend. You cannot change it afterwards.",
  "decision.leaderOffer.title": "Leader candidates are waiting",
  "decision.leaderOffer.detail":
    "Three trainers have applied. Each brings their own partner.",
  "decision.noLeader.title": "{gym} has no Leader",
  "decision.noLeader.detail":
    "It forfeits every challenge until somebody stands there.",
  "decision.emptyGym.title": "{gym} is fielding nobody",
  "decision.emptyGym.detail":
    "No {type} creatures to cast. Trade for one, or work a route that supplies them.",
  "decision.suspended.title": "{name} is suspended",
  "decision.suspended.detail":
    "Their post stands empty, and a challenger walks straight through it.",
  "decision.strain.title": "{name} is close to walking",
  "decision.strain.detail":
    "Pay them properly, or step them down to something they can carry.",
  "decision.idleCrews.title": "{n} {n:crew|crews} in from the field",
  "decision.idleCrews.detail":
    "They draw wages between trips. Outfit them and send them somewhere.",
  "decision.choice.title": "A crew is waiting on you",
  "decision.eliteEmpty.title": "{n} Elite {n:seat|seats} unstaffed",
  "decision.eliteEmpty.detail":
    "An empty seat is a free pass on the way to taking your league.",
  "decision.daycareFree.title": "{n} retired, and the Day-Care has room",
  "decision.daycareFree.detail":
    "A long career makes better offspring. This is what retirement was for.",
  "decision.daycareUnbuilt.title": "Careers are ending with nowhere to go",
  "decision.daycareUnbuilt.detail":
    "The Day-Care turns a finished career into the next generation.",
  "decision.promotionForced.title": "You can leave for the next tier",
  "decision.promotionForced.detail":
    "Take the tier now with the Champion who beat you, or stay and win the title back.",
  "decision.promotionEarned.title": "The league is ready to promote",
  "decision.promotionEarned.detail":
    "Induct up to {n} from the Hall. They become Mentors, and they are all that survives.",
  "decision.boxFull.title": "The box is full and catching has stopped",
  "decision.boxFull.detail":
    "Cast what you have, or trade the types nobody can field.",
  "decision.shortHanded.title": "{n} {n:trainer|trainers} fielding less than they could",
  "decision.shortHanded.detail":
    "Empty slots fill themselves when the box holds the right type.",
  "decision.rival.title": "{name} arrives in {mins}m",
  "decision.rival.detail": "{type} type, coming for {gym}.",

  // -- The map and the field ------------------------------------------------
  "field.map": "The map",
  "field.reached": "{n}/{total} reached",
  "field.unexplored": "Unexplored",
  "field.somewhereOut": "Somewhere out that way",
  "field.rumourFrom":
    "Reachable from {from}. Send a crew that way once the league knows the ground well enough.",
  "field.peril": "peril {n}%",
  "field.livesHere": "{name} lives here and nowhere else.",
  "field.knownEnough": "Well enough known to push on from.",
  "field.knownPartly":
    "Known {n}% — walk it again to learn what lies beyond.",
  "field.crewHereNow": "A crew is out here now.",
  "field.metHere": "{n} met here",
  "field.metHereRefused": "{n} met here, {r} refused",
  "field.hide": "hide",
  "field.nothingMet": "Nothing met here yet. Send a crew and this fills in.",
  "field.refusedNote":
    "Refused species are left where they are. Crews still spend the trip looking, so refusing everything common is how you go hunting.",
  "field.banOn": "Tell crews to leave these alone",
  "field.banOff": "Crews leave these alone",

  // -- Crews ---------------------------------------------------------------
  "crews.title": "Crews",
  "crews.count": "{n}/{max} employed · {out} out",
  "crews.none":
    "Nobody on the books. A crew is two people who already work together — the Ranger brings creatures back, the Handler raises the ones they took.",
  "crews.slotsFull":
    "Every crew slot is filled. Upgrade the Scouting Office to employ another.",
  "crews.looking": "Looking for work",
  "crews.offerNote":
    "Two people who already work together. What they are like is fixed, and it decides what they do when nobody answers them.",
  "crews.pass": "pass, and see three more",
  "crews.letGo": "let go",
  "crews.sendOut": "Send them out…",
  "crews.callBack": "call them back",
  "crews.working": "Working {route}",
  "crews.pushingOn": "Pushing on from {route}",
  "crews.caught": "caught",
  "crews.worn": "worn",
  "crews.willDecide":
    "Leave it and they will decide themselves — {trait} crews usually do.",
  "crews.atHome": "{trait} crew, {n}% at home here.",
  "crews.ground": "Ground",
  "crews.objective": "Objective",
  "crews.workHere": "Work this ground",
  "crews.pushTo": "Push on to what lies beyond",
  "crews.cannotPush":
    "The league does not know this ground well enough to push on from it yet.",
  "crews.takeParty":
    "Take up to {n} for the Handler to raise. They come home when the crew does.",
  "crews.kitCost": "Kit ₱{n}",
  "crews.unspentBack": " · unspent comes back",
  "crews.setOff": "Set off",
  "crews.allGroundBusy": "Every route you know has a crew on it.",
  "kit.balls": "balls",
  "kit.potions": "potions",
  "kit.revives": "revives",
  "kit.lures": "lures",
  "trait.meticulous": "meticulous",
  "trait.reckless": "reckless",
  "trait.patient": "patient",
  "trait.lucky": "lucky",

  // -- Gyms ----------------------------------------------------------------
  "gyms.title": "Gyms",
  "gyms.noLeader": "No Leader — this gym forfeits every challenge",
  "gyms.hireLeader": "Hire Leader · ₱{n}",
  "gyms.gymTrainers": "Gym Trainers",
  "gyms.hireJunior": "Hire {type} · ₱{n}",
  "gyms.addSlot": "+1 slot · ₱{n}",
  "gyms.absorbed":
    "Your Leader's party fought {n} fewer {n:battle|battles} thanks to {c} {c:junior|juniors}.",
  "gyms.noJuniors":
    "No junior trainers — every challenger goes straight at your Leader.",
  "gyms.partyOf": "{name}'s party",
  "gyms.partyHint":
    "Position one leads; the rest follow as each faints. Drag to reorder. Parties fill themselves from the box — pin the ones that matter and they will never be swapped out.",
  "gyms.rested": "{n}% rested",
  "gyms.notFound": "Gym not found.",

  // -- Battle --------------------------------------------------------------
  "battle.title": "Battle",
  "battle.waiting": "waiting",
  "battle.live": "live",
  "battle.held": "held",
  "battle.badgeLost": "badge lost",
  "battle.noChallenger": "No challenger yet. The next one is on their way.",
  "battle.challenger": "Challenger",
  "battle.leaderSuffix": "{name} — Leader",
  "battle.hits": "{a} hits {b} for {n}",
  "battle.superEffective": " — super effective",
  "battle.notVery": " — not very effective",
  "battle.faints": "{name} faints.",
  "battle.revived": "{name} is revived.",

  // -- Threat report -------------------------------------------------------
  "threat.title": "Threat Report",
  "threat.sub":
    "Incoming challenger types · {n} waves observed · {pct}% lost",
  "threat.tooEarly": "Not enough waves yet to read a pattern.",
  "threat.stable": "Stable",
  "threat.watch": "Watch",
  "threat.critical": "Critical",

  // -- Party and creatures --------------------------------------------------
  "party.leads": "lead",
  "party.takeOut": "Take {name} out of the party",
  "party.addSlot": "Add",
  "party.pickerTitle": "{name}'s party",
  "party.pickerEmpty":
    "Nothing in the box {name} could field. Work a route that supplies {type} types, or trade for one in the PC.",
  "creature.summary": "Summary",
  "creature.info": "Pokémon Info",
  "creature.skills": "Skills",
  "creature.memo": "Trainer Memo",
  "creature.dexNo": "Dex No.",
  "creature.species": "Species",
  "creature.record": "Record",
  "creature.trainer": "Trainer",
  "creature.battlesLeft": "{n:battle|battles} left",
  "creature.bondTitle": "How well you know each other",

  // -- PC ------------------------------------------------------------------
  "pc.title": "PC Box",
  "pc.creatures": "{n} {n:creature|creatures}",
  "pc.everything": "Everything",
  "pc.inBox": "In the box",
  "pc.inParties": "In parties",
  "pc.byTrainer": "By trainer",
  "pc.tradeFor": "Trade for",
  "pc.notTrading": "Not trading",
  "pc.box": "Box {n} of {total}",
  "pc.nothingTradeable":
    "Nothing here the desk will take. Creatures in a Leader's party are not on the table.",
  "pc.offering": "Offering for a {type}",
  "pc.tradeHint":
    "Pick creatures from the box above. Offers are priced off average power with only a small bonus for volume, so quality moves the needle and quantity barely does.",
  "pc.tradeAim": "The desk will aim for around {n} power",
  "pc.tradeAimExample": ", something like a {name}",
  "pc.clear": "Clear {n}",
  "pc.trade": "Trade {n} · ₱{fee}",
  "pc.pinned": "Pinned",
  "pc.pin": "Pin so this one is never swapped out",
  "pc.setAside": "Set aside",
  "pc.allow": "Allow",
  "pc.inTheBox": "in the box",
  "pc.setAsideState": "set aside",
  "pc.inAParty": "in a party",
  "pc.noRosters": "No parties to manage yet.",

  // -- Hall ----------------------------------------------------------------
  "hall.title": "Hall of Fame",
  "hall.count": "{n} remembered · {i} carried forward",
  "hall.empty":
    "Nobody yet. A creature enters the Hall when its career ends after serving most of a life — which takes a long service, not a good one.",
  "hall.hint":
    "Careers that ran their course in your service. At promotion you induct from here, and the ones you choose become Mentors — the only thing that survives a league.",
  "hall.mostRecent": "Most recent",
  "hall.battlesWon": "Battles won",
  "hall.bondEnd": "Bond at the end",
  "hall.careerServed": "Career served",
  "hall.mentor": "Mentor",
  "hall.mentorTitle": "Carried forward as a Mentor",
  "hall.served": "Served",
  "hall.bond": "Bond",
  "epitaph.complete": "Knew you completely, and never let the gym fall.",
  "epitaph.knew": "Knew you completely.",
  "epitaph.turned": "Turned away more challengers than you can name.",
  "epitaph.gave": "Gave every battle it had.",
  "epitaph.stood": "Stood up more often than it won, every time.",
  "epitaph.served": "Served out its career on the board.",

  // -- Elite and promotion --------------------------------------------------
  "elite.title": "Elite Four",
  "elite.locked": "Locked. Build all {n} gyms ({have} so far) to open the Elite tier.",
  "elite.staffed": "{n}/{total} staffed · next run {m}m",
  "elite.freePass":
    "Every empty seat is a free pass. A challenger who clears all five takes your league.",
  "elite.taken": "Your league has been taken {n} {n:time|times}.",
  "elite.tookTitle": "✦ took the title",
  "elite.champion": "Champion",
  "elite.seat": "Elite {n}",
  "promo.title": "Promotion",
  "promo.lostTitle": "The league is not yours",
  "promo.sub": "Climb from {tier} to the next tier. Everything resets but the Hall.",
  "promo.forcedSub":
    "{name} holds the title. You can take the tier now, or stay and win it back.",
  "promo.goNow": "Go now",
  "promo.goNowDetail":
    "You arrive at the next tier with {name} and the team that beat you. Nothing else — no inductees, no Mentors.",
  "promo.winBack": "Win it back first",
  "promo.winBackDetail":
    "Out-develop them, retake the title, then promote the earned way — with {n} of your own and the Mentors that actually bend the curve. Slower, and worth it.",
  "promo.takeNow": "Take the tier now",
  "promo.inductHint":
    "Choose up to {n} from the Hall to induct. Each becomes a Mentor: they train every creature of their type in every league that follows. This is the only thing that survives.",
  "promo.induct": "Induct {n}/{max} and promote",

  // -- Staff standing ------------------------------------------------------
  "staff.settled": "Settled · morale {n}%",
  "staff.stepDown": "step down…",
  "staff.stepDownBtn": "Step down…",
  "staff.suspended": "Suspended",
  "staff.content": "Content",
  "staff.restless": "Restless",
  "staff.breaking": "At breaking point",
  "staff.unhappy": "Unhappy",
  "staff.backIn": "back in {t}",
  "staff.suspensions": "{n} of {max} {max:suspension|suspensions} · ",
  "staff.morale": "morale {n}%",
  "staff.warnTargets":
    "Suspension in {n}% — step them down or pay them properly.",
  "staff.warnNoPost": "Suspension in {n}% — no lower posting is open.",
  "staff.demoteNote":
    "Their party comes with them, trimmed to the new post. Nothing they have bonded to is forgotten.",

  // -- Day-Care and facilities ---------------------------------------------
  "daycare.title": "Day-Care",
  "facilities.title": "Facilities",
  "facilities.upgrade": "Upgrade · ₱{n}",
  "facilities.maxed": "Fully upgraded",

  // -- Log -----------------------------------------------------------------
  "log.title": "Recent",
  "log.empty": "Nothing yet.",

  // -- Generated by the sim ------------------------------------------------
  "log.refusedToServe": "{name} leaves rather than serve under a rival.",
  "log.usurperWalks": "{name} walks out — and they will be back.",
  "log.tookLeague": "{name} has taken the league. They are your Champion now.",
  "log.retired": "{name} retired to the Day-Care.",
  "log.hatched": "An egg hatched at the Day-Care: {name}.",
  "log.revived": "A challenger revived their {name}.",
  "log.rivalJoined": "{name} joined the league after losing.",
  "log.evolved": "{text}.",
  "log.resigned": "{name} resigned and took their partner with them.",
  "log.cameWithYou": "{name} came with you.",
  "log.objectiveDone": "{title} — done.",
  "log.crewLetGo": "{name} have been let go.",
  "log.evolvedOnRoute": "{name} evolved out on {route}.",
  "log.backOnDuty": "{name} is back on duty.",
  "log.goneForGood": "{name} has left the league for good.",
  "log.stepsDown": "{name} steps down to {post}.",
  "log.rivalAgreed": "{name} has finally agreed to work for you.",
  "log.badgesClaimed": "{n} {n:badge|badges} claimed by challengers.",
  "log.rivalHeld": "{name} challenged and lost.",
  "log.rivalWon": "{name} beat your gym and took a badge.",
  "log.eliteLost": "A challenger beat the Elite Four and took the league.",
  "log.eliteHeld": "A challenger cleared {n} {n:seat|seats} of the Elite tier before falling.",
  "log.upsetWon": "{name} won one they had no business winning.",
  "log.upsetLost": "{name} lost one they should have won — still settling in.",
  "log.whileAway":
    "While you were away: {waves} challenges, ₱{money} taken, {caught} caught.",
  "log.suspended": "{name} is suspended ({n} of {max}).",
  "log.crewBeaten": "{name} came back beaten from {route}.",
  "log.crewHome": "{name} are back from {route} with {n} {n:catch|catches}.",
  "log.reached": "{route} is on the map. And {resident} lives here.",

  "ev.hazardSalved": "Rough going on {route}. A Potion covered it.",
  "ev.hazardRaw": "Rough going on {route}, and nothing left to treat it.",
  "ev.troubleSaved": "Something came at them on {route}. A Revive saved it.",
  "ev.troubleRaw": "Badly handled on {route}, and no Revives left.",
  "ev.windfall": "Found something worth ₱{n} on {route}.",
  "ev.encounter": "A {name} on {route}.",
  "ev.encounterNoBalls": "A {name} on {route}, and nothing to catch it with.",
  "ev.wayThrough": "A way through toward {route}.",
  "ev.notEnough": "Not enough left to take it.",
  "ev.tookIt": "Took it. {n} {n:Poké Ball|Poké Balls} gone.",
  "ev.choicePrompt": "A {name} on {route}. Taking it will cost {n} {n:Poké Ball|Poké Balls}.",
  "ev.choiceTake": "Spend {n} and take it",
  "ev.choiceLeave": "Leave it",

  // -- Places --------------------------------------------------------------
  "route.verdant_path": "Verdant Path",
  "route.cinder_ridge": "Cinder Ridge",
  "route.coastal_road": "Coastal Road",
  "route.millbrook": "Millbrook",
  "route.quarry_flats": "Quarry Flats",
  "route.hollow_wood": "Hollow Wood",
  "route.saltwind_pier": "Saltwind Pier",
  "route.ashfall_run": "Ashfall Run",
  "route.thunder_plain": "Thunder Plain",
  "route.gloaming_fen": "Gloaming Fen",
  "route.emberworks": "The Emberworks",
  "route.tidal_caverns": "Tidal Caverns",
  "route.the_stillfields": "The Stillfields",
  "route.kiln_reach": "Kiln Reach",
  "route.hoarfrost_shelf": "Hoarfrost Shelf",
  "route.dragons_spine": "Dragon's Spine",

  "mark.verdant_path": "The Orchard Rows",
  "mark.cinder_ridge": "The Warm Stones",
  "mark.coastal_road": "The Milestone",
  "mark.millbrook": "The Old Mill",
  "mark.quarry_flats": "The Cut Face",
  "mark.hollow_wood": "The Lantern Tree",
  "mark.saltwind_pier": "The Long Jetty",
  "mark.ashfall_run": "The Grey Fall",
  "mark.thunder_plain": "The Iron Pylons",
  "mark.gloaming_fen": "The Sunken Road",
  "mark.emberworks": "The Cold Furnace",
  "mark.tidal_caverns": "The Tide Clock",
  "mark.the_stillfields": "The Standing Circle",
  "mark.kiln_reach": "The Glassed Plain",
  "mark.hoarfrost_shelf": "The Blue Crevasse",
  "mark.dragons_spine": "The Last Ridge",

  "blurb.verdant_path": "Somebody still tends these. There is always something in the branches.",
  "blurb.cinder_ridge": "They hold the day's heat all night. A crew sleeps well here.",
  "blurb.coastal_road": "Every distance on this coast is measured from here.",
  "blurb.millbrook": "The wheel still turns. Traders stop here, and they pay well.",
  "blurb.quarry_flats": "A century of quarrying laid the whole hillside open.",
  "blurb.hollow_wood": "Somebody hangs a light here. Nobody has ever seen who.",
  "blurb.saltwind_pier": "Reaches further out than any boat needs. Good fishing at the end.",
  "blurb.ashfall_run": "Ash drifts here like snow, and hides what is underfoot.",
  "blurb.thunder_plain": "Long dead, still humming. Nobody remembers what they carried.",
  "blurb.gloaming_fen": "It goes somewhere. Half of it is under the water.",
  "blurb.emberworks": "Out for thirty years. Things nest in it now.",
  "blurb.tidal_caverns": "The water comes to the same mark, to the minute, every time.",
  "blurb.the_stillfields": "Older than the league. Creatures gather here and nobody knows why.",
  "blurb.kiln_reach": "Something burned here hot enough to turn the sand to glass.",
  "blurb.hoarfrost_shelf": "You can see forty years down it. Something moves at the bottom.",
  "blurb.dragons_spine": "Nothing beyond it has been mapped. People keep going anyway.",

  // -- Objectives ----------------------------------------------------------
  "obj.first-gym.title": "Open your first gym",
  "obj.first-gym.detail": "Choose its type and the Leader who will hold it. Neither can be undone.",
  "obj.first-crew.title": "Put a crew on the payroll",
  "obj.first-crew.detail": "Two people who work together. The Ranger brings creatures back; the Handler raises the ones they take.",
  "obj.first-trip.title": "Send them out",
  "obj.first-trip.detail": "Outfit a crew and work a route. What ends a trip is the kit you paid for, not a timer.",
  "obj.staff-a-gym.title": "Hire two Gym Trainers",
  "obj.staff-a-gym.detail": "Juniors stand between a challenger and your Leader. They field lesser creatures, and they buy your Leader time.",
  "obj.push-on.title": "Reach somewhere new",
  "obj.push-on.detail": "Walk a route until the league knows it, then send a crew past it. The map grows because you went there.",
  "obj.a-bonded-gym.title": "Build a bonded core",
  "obj.a-bonded-gym.detail": "Two creatures in one gym who have served long enough to be reliable. Bond buys certainty, not power.",
  "obj.four-gyms.title": "Hold four gyms",
  "obj.four-gyms.detail": "A board wide enough that the types coming at you start to matter.",
  "obj.a-full-board.title": "Hold all eight",
  "obj.a-full-board.detail": "Every badge in the region, defended by people you chose.",
  "obj.staff-the-elite.title": "Seat the Elite Four",
  "obj.staff-the-elite.detail": "And the Champion above them. An empty seat is a free pass on the way to taking your league.",
  "obj.first-legend.title": "See a career out",
  "obj.first-legend.detail": "A creature that serves most of a life enters the Hall. That is what retirement is for.",
  "obj.promote.title": "Climb a tier",
  "obj.promote.detail": "Induct from the Hall and start again, harder. The Mentors you choose are all that survives.",
  "obj.held.title": "Turn away {n} {n:challenger|challengers}",
  "obj.held.detail": "The board holding is the whole job.",
  "obj.collected.title": "Bring home {n} {n:creature|creatures}",
  "obj.collected.detail": "Every one of them arrived because somebody went and got it.",
  "obj.mapped.title": "Reach {n} {n:place|places}",
  "obj.mapped.detail": "The map grows because crews walked it.",

  "reward.crew": "a crew slot",
  "reward.facility": "a level of {name}",
  "reward.kit": "{balls} balls, {potions} potions",
  "reward.money": "₱{n}",

  "bond.inseparable": "Inseparable",
  "bond.veryAttached": "Very attached",
  "bond.warming": "Warming to you",
  "bond.gettingUsed": "Getting used to you",
  "bond.wary": "Wary of you",
  "bond.exact": "Fights exactly as its stats promise — swings only ±{n}%.",
  "bond.dependable": "Mostly dependable, swinging ±{n}% either way.",
  "bond.unpredictable": "Unpredictable — swings ±{n}%, and will throw battles it should win.",
  "career.fresh": "Fresh",
  "career.seasoned": "Seasoned",
  "career.veteran": "Veteran",
  "career.fading": "Fading",
  "career.final": "Final days",

  "memo.career": "Every battle spends a little of this. When it runs out they retire to the Day-Care, where their line continues.",
  "daycare.unbuilt": "Build the Day-Care to leave creatures in training — and to hatch eggs from a pair that share a type.",
  "daycare.empty": "Nobody in care. Leaving a creature here levels it over time.",
  "daycare.noEgg": "These two share no type — no egg will come of it.",
  "daycare.nothingToLeave": "Nothing available to leave.",
  "log.incoming": "Challengers are on their way.",
  "gymOffer.title": "Choose your first type",
  "gymOffer.detail": "This is the type your league is built around, and the only one you will be able to field at first. Everything after this is chosen against it.",
  "gymOffer.cost": "Construction costs",
  "leaderOffer.title": "Choose who runs it",
  "leaderOffer.detail": "Free — you have already paid for the building. Each brings their own partner, and their own way of running a gym.",

  "gymOffer.firstTitle": "Choose your first gym’s type",
  "gymOffer.nextTitle": "Choose your next gym’s type",
  "gymOffer.founding": "This is the type your league is built around, and the only one you will be able to field at first. Free — everything starts here.",
  "gymOffer.costLine": "Construction costs {cost}. You have {money}.",
  "gymOffer.keepEarning": " Keep earning — the offer will wait.",

  // -- Strings that were left in English until the first playtest ----------
  "app.gyms": "Gyms",
  "app.noGyms": "No gyms yet.",
  "app.switchTo": "Mudar para português",

  "gymOffer.foundEyebrow": "Found your league",
  "gymOffer.newEyebrow": "New gym available",
  "gymOffer.later": "Later",
  "gymOffer.chip": "New gym available · {cost}",
  "gymOffer.owned": "Owned",
  "gymOffer.challengers": "Challengers",
  "gymOffer.suppliedBy": "Supplied by",

  "arch.stall": "Defensive",
  "arch.stall.blurb": "Wears challengers down. Their party tires more slowly and holds harder.",
  "arch.sweep": "Aggressive",
  "arch.sweep.blurb": "Ends battles fast, and tires fast doing it.",
  "arch.mentor": "Mentor",
  "arch.mentor.blurb": "Creatures under them settle in far quicker.",
  "arch.drillmaster": "Drillmaster",
  "arch.drillmaster.blurb": "Spends their creatures' careers sparingly. They last longer.",

  "map.leaderFighting": "Leader is fighting — watch",
  "map.challengerInside": "Challenger inside",
  "map.badgeLost": "Badge lost",
  "map.held": "Held",
  "map.noLeader": "No leader — undefended",
  "map.trainers": "{n}/{max} {max:trainer|trainers}",

  "rival.ready": "Your gym should hold",
  "rival.close": "Too close to call",
  "rival.outmatched": "You are outmatched",

  "creature.openSummary": "Open summary",
  "creature.exhausted": "Exhausted",
  "creature.tiring": "Tiring",
  "creature.rested": "Rested",
  "creature.stats": "Stats",
  "creature.condition": "Condition",
  "creature.careerHead": "Career",
  "creature.pedigree": "Pedigree",
  "creature.signature": "Signature",
  "creature.sigShort": "SIG",
  "creature.inTheBox": "In the box",
  "creature.statSpread": "Base stat spread",

  "party.lead": "lead",

  "pc.power": "Power",
  "pc.name": "Name",
  "pc.offerThis": "Offer this one",

  "a11y.map": "The league's map",
  "a11y.sections": "Sections",

  "crews.nowhereFree": "Nowhere free",
  "elite.unstaffedWarning": "Unstaffed — challengers walk straight through.",
  "facilities.complete": "Complete",
  "threat.superEffective": "Super effective against this gym",

  "facility.scouting_office.name": "Scouting Office",
  "facility.scouting_office.blurb": "Supports your Rangers. Every level is another route you can staff — headcount, not a percentage — and from level 2 it surveys ground nobody has worked yet.",
  "facility.scouting_office.effect": "+{n} {n:posting|postings}",
  "facility.scouting_office.effect2": "+{n} {n:posting|postings} · surveys every route",
  "facility.training_grounds.name": "Training Grounds",
  "facility.training_grounds.blurb": "Creatures settle in with their trainer far faster. Parties are always six — what the Grounds buy is how quickly those six become reliable.",
  "facility.training_grounds.effect": "+{n}% bonding speed",
  "facility.medical_center.name": "Medical Center",
  "facility.medical_center.blurb": "Creatures recover between waves faster, and their careers last longer.",
  "facility.medical_center.effect": "+{n}% recovery · +{c}% career length",
  "facility.trade_desk.name": "Trade Desk",
  "facility.trade_desk.blurb": "Better terms at the exchange, so what you give up buys more.",
  "facility.trade_desk.effect": "+{n}% trade value",
  "facility.day_care.name": "Day-Care",
  "facility.day_care.blurb": "Houses retired creatures. Breeding arrives with the next expansion.",
  "facility.day_care.effect": "Retirees have somewhere to go",
  "facilities.build": "Build · {cost}",
  "facilities.upgradeCost": "Upgrade · {cost}",

  // -- The first screen a stranger sees ------------------------------------
  "welcome.eyebrow": "A post has opened",
  "welcome.title": "You run the league. You never battle.",
  "welcome.beat1": "You are not the challenger.",
  "welcome.beat1detail":
    "Trainers arrive to take your badges. Your job is to make sure they leave without one.",
  "welcome.beat2": "You hire people, and you cast creatures to them.",
  "welcome.beat2detail":
    "A Leader holds a gym. A crew works a route and brings creatures home. Who stands where is the whole game.",
  "welcome.beat3": "Everyone here wears out.",
  "welcome.beat3detail":
    "Careers run down, trainers lose patience, and a creature that served a long time is remembered. Nothing you build lasts forever.",
  "welcome.idle": "It keeps running while you are away. Come back and see what happened.",
  "welcome.begin": "Take the post",
  "gymOffer.noRoute": "nowhere you have reached",
  "facility.operations_office.name": "Operations Office",
  "facility.operations_office.blurb": "Keeps the league running properly when you are not here. Without one it coasts; with one it works. How content the staff are decides the rest.",
  "facility.operations_office.effect": "{n}% of full output while you are away",
  "decision.ordersStopped.title": "{name} have stopped working",
  "decision.ordersStopped.floor": "Another trip would take them below the floor you set. Lower it, or send them somewhere cheaper.",
  "decision.ordersStopped.boxFull": "The box is full, so there is nowhere to put anything else they catch.",
  "decision.ordersStopped.worn": "They came home beaten. That ground is rougher than the kit you sent them with.",
  "decision.ordersStopped.held": "They are waiting on you to answer something.",
  "decision.ordersStopped.routeTaken": "Another crew is working that route now.",
  "decision.ordersStopped.stopped": "Their standing orders have ended.",
  "crews.standing": "Keep going",
  "crews.standingHint": "When they get home, buy this kit again and send them back out. Stops on anything worth telling you about.",
  "crews.floor": "Stop below",
  "crews.floorHint": "They will not outfit another trip if it would take you under this.",
  "crews.standingOn": "Working {route} until you say otherwise",
  "crews.standingOff": "One trip, then home",
  "crews.stopOrders": "Cancel standing orders",
  "coach.replay": "What is this screen for?",
  "coach.got": "Got it",
  "coach.desk.title": "The Desk is where you find out what needs you.",
  "coach.desk.body": "What happened while you were away, what is waiting on a decision, and what the league is working toward. Everything here links to the screen that settles it. If nothing is open, there is genuinely nothing to do — go and do something else.",
  "coach.gyms.title": "Gyms are where badges are defended.",
  "coach.gyms.body": "Each has a Leader and up to a few junior trainers, all of one type. Juniors stand between a challenger and your Leader: they field lesser creatures and they buy your Leader time. Parties fill themselves from the box — pin the ones that matter and they will never be swapped out.",
  "coach.pc.title": "The box holds everyone not currently standing somewhere.",
  "coach.pc.body": "Creatures your crews bring home land here, and parties draw from it automatically. It has a ceiling: once it is full, catching stops, because a league that hoards is not a league. The Trade Desk is how you turn a surplus of the wrong type into the right one.",
  "coach.field.title": "The Field is where creatures come from.",
  "coach.field.body": "A crew is two people who work together — the Ranger brings creatures back, the Handler raises the ones they take with them. You outfit each trip and pay for it up front, and what ends the trip is the kit you bought, not a timer. Reach new ground by pushing on from ground you know.",
  "coach.staff.title": "The Elite tier is the last thing between a challenger and your title.",
  "coach.staff.body": "Four seats and a Champion, staffed from your own trainers. A challenger who clears every gym comes here. This screen also shows how your staff are holding up: underpay or overwork them and they step down, or leave.",
  "coach.hall.title": "The Hall remembers creatures whose careers ended well.",
  "coach.hall.body": "Every creature has a finite career, and a long one spent defending earns a place here. When you promote to the next tier, the Hall is what you choose from — inducted creatures become Mentors, and they are the only thing that survives the reset.",
  "coach.daycare.title": "The Day-Care is where retirees go.",
  "coach.daycare.body": "Creatures left here keep gaining levels without fighting, and a retired pair sharing a type will eventually produce an egg. It is the one place a career ending leads somewhere rather than simply stopping.",
  "coach.facilities.title": "Facilities change what the front line can do.",
  "coach.facilities.body": "They hold nobody. Each one multiplies something — how many crews you can post, how fast creatures bond, how long careers run, how well the league runs while you are away. This is where money goes once you have more of it than gyms to build.",
  "map.nextIn": "Next challenger in {n}s",
  "map.nextDue": "Undefended — a challenger is on the way",
  "trade.open": "Trade",
  "trade.title": "The Trade Desk",
  "trade.explain": "Give up creatures you are not using, and name a type. What comes back lands within {pct}% of what you offered, at about the same level.",
  "trade.giveUp": "Give up",
  "trade.aimFor": "Ask for",
  "trade.pickSome": "Pick at least {n}. The desk prices your offer on its average, not its total — adding a weak one drags it down.",
  "trade.range": "You should get back something worth {low}–{high} power.",
  "trade.like": "Something like a {name}.",
  "trade.received": "{name} joined the box, at {n} power.",
  "trade.fee": "₱{n} on top, either way",
  "trade.nothingIdle": "Nothing is spare. Everything you own is in a party, out with a crew, or at the Day-Care.",
  "trade.noGyms": "Open a gym first — the desk trades for types your league actually fields.",
  "gyms.noParty": "Nobody cast yet — the box will fill this in.",
} as const;

export type Key = keyof typeof en;
export type Dict = Record<Key, string>;

/**
 * Brazilian Portuguese.
 *
 * Translated for a player, not for a dictionary: the game's voice is plain and
 * a little dry, and that survives better as idiom than as literal wording. Where
 * the series has established Brazilian terms — *Líder de Ginásio*, *Elite dos
 * Quatro*, *Centro Pokémon* — those are used rather than invented ones.
 */
export const pt: Dict = {
  "app.title": "A Mesa de Escalação",
  "app.money": "Pokéyen",
  "app.renown": "Renome",
  "app.inParties": "Em equipes",
  "app.owned": "Capturados",
  "app.season": "Temporada",

  "tab.desk": "Mesa",
  "tab.gyms": "Ginásios",
  "tab.pc": "PC",
  "tab.field": "Mapa",
  "tab.elite": "Elite",
  "tab.hall": "Hall",
  "tab.daycare": "Creche",
  "tab.facilities": "Instalações",

  "common.cancel": "Cancelar",
  "common.close": "Fechar",
  "common.hire": "Contratar",
  "common.remove": "Remover",
  "common.add": "Adicionar",
  "common.all": "Todos",
  "common.type": "Tipo",
  "common.sort": "Ordenar",
  "common.show": "Mostrar",
  "common.level": "Nível",
  "common.nothing": "Nada aqui.",
  "common.locked": "Bloqueado",

  "desk.title": "Mesa",
  "desk.nothingOpen": "nada pendente",
  "desk.open": "{n} {n:pendente|pendentes}",
  "desk.openUrgent": "{n} {n:pendente|pendentes} · {u} {u:urgente|urgentes}",
  "desk.allClear":
    "Nada depende de você agora. A liga está aguentando, todo mundo está trabalhando e ainda há espaço no PC. Vá assistir a uma batalha.",
  "desk.quiet": "Tudo tranquilo desde a última vez.",
  "desk.since": "Desde a última vez",
  "desk.held": "Defendidos",
  "desk.badgesLost": "Insígnias perdidas",
  "desk.taken": "Arrecadado",
  "desk.caught": "Capturados",
  "desk.retired": "Aposentados",
  "desk.usurped": "{name} tomou a liga, e agora é seu Campeão.",
  "desk.suspended": "{name} foi suspenso.",
  "desk.rival": "{name} veio atrás de uma insígnia.",
  "desk.workingToward": "Trabalhando para",
  "desk.collect": "Receber",

  "decision.gymOffer.title": "Um novo ginásio está disponível",
  "decision.gymOffer.detail":
    "Escolha o tipo que ele vai defender. Não dá para mudar depois.",
  "decision.leaderOffer.title": "Candidatos a Líder esperando",
  "decision.leaderOffer.detail":
    "Três treinadores se candidataram. Cada um traz o próprio parceiro.",
  "decision.noLeader.title": "{gym} está sem Líder",
  "decision.noLeader.detail":
    "Perde todo desafio até alguém assumir o posto.",
  "decision.emptyGym.title": "{gym} não tem ninguém para escalar",
  "decision.emptyGym.detail":
    "Nenhum Pokémon do tipo {type}. Troque por um, ou trabalhe uma rota que forneça.",
  "decision.suspended.title": "{name} está suspenso",
  "decision.suspended.detail":
    "O posto fica vazio, e o desafiante passa direto por ele.",
  "decision.strain.title": "{name} está a ponto de sair",
  "decision.strain.detail":
    "Pague direito, ou rebaixe para um posto que ele consiga carregar.",
  "decision.idleCrews.title": "{n} {n:equipe|equipes} de campo {n:parada|paradas}",
  "decision.idleCrews.detail":
    "Elas recebem salário entre viagens. Equipe-as e mande para algum lugar.",
  "decision.choice.title": "Uma equipe está esperando você decidir",
  "decision.eliteEmpty.title": "{n} {n:cadeira|cadeiras} da Elite {n:vazia|vazias}",
  "decision.eliteEmpty.detail":
    "Cadeira vazia é passagem livre no caminho para tomar sua liga.",
  "decision.daycareFree.title": "{n} {n:aposentado|aposentados}, e a Creche tem vaga",
  "decision.daycareFree.detail":
    "Uma carreira longa gera filhotes melhores. Era para isso que servia a aposentadoria.",
  "decision.daycareUnbuilt.title": "Carreiras acabando sem ter para onde ir",
  "decision.daycareUnbuilt.detail":
    "A Creche transforma uma carreira encerrada na geração seguinte.",
  "decision.promotionForced.title": "Você pode subir de divisão",
  "decision.promotionForced.detail":
    "Suba agora levando o Campeão que te venceu, ou fique e retome o título.",
  "decision.promotionEarned.title": "A liga está pronta para subir de divisão",
  "decision.promotionEarned.detail":
    "Consagre até {n} do Hall. Eles viram Mentores, e é só isso que sobrevive.",
  "decision.boxFull.title": "O PC está cheio e as capturas pararam",
  "decision.boxFull.detail":
    "Escale o que você tem, ou troque os tipos que ninguém consegue usar.",
  "decision.shortHanded.title": "{n} {n:treinador|treinadores} escalando menos do que {n:poderia|poderiam}",
  "decision.shortHanded.detail":
    "As vagas se preenchem sozinhas quando o PC tem o tipo certo.",
  "decision.rival.title": "{name} chega em {mins}min",
  "decision.rival.detail": "Tipo {type}, indo para {gym}.",

  "field.map": "O mapa",
  "field.reached": "{n}/{total} alcançadas",
  "field.unexplored": "Inexplorado",
  "field.somewhereOut": "Algum lugar por ali",
  "field.rumourFrom":
    "Dá para chegar a partir de {from}. Mande uma equipe quando a liga conhecer bem o terreno.",
  "field.peril": "perigo {n}%",
  "field.livesHere": "{name} vive aqui e em nenhum outro lugar.",
  "field.knownEnough": "Conhecida o bastante para avançar a partir daqui.",
  "field.knownPartly":
    "Conhecida {n}% — percorra de novo para descobrir o que há além.",
  "field.crewHereNow": "Há uma equipe aqui agora.",
  "field.metHere": "{n} {n:encontrado|encontrados} aqui",
  "field.metHereRefused": "{n} {n:encontrado|encontrados} aqui, {r} {r:recusado|recusados}",
  "field.hide": "esconder",
  "field.nothingMet": "Nada encontrado aqui ainda. Mande uma equipe e isto se preenche.",
  "field.refusedNote":
    "Espécies recusadas ficam onde estão. As equipes continuam procurando, então recusar tudo que é comum é o jeito de caçar algo raro.",
  "field.banOn": "Mandar as equipes deixarem estes em paz",
  "field.banOff": "As equipes deixam estes em paz",

  "crews.title": "Equipes",
  "crews.count": "{n}/{max} contratadas · {out} em campo",
  "crews.none":
    "Ninguém na folha. Uma equipe são duas pessoas que já trabalham juntas — o Ranger traz Pokémon, o Treinador cria os que levou.",
  "crews.slotsFull":
    "Todas as vagas de equipe estão ocupadas. Melhore o Escritório de Batedores para contratar outra.",
  "crews.looking": "Procurando trabalho",
  "crews.offerNote":
    "Duas pessoas que já trabalham juntas. O jeito delas é fixo, e é o que decide o que fazem quando ninguém responde.",
  "crews.pass": "passar, e ver outras três",
  "crews.letGo": "dispensar",
  "crews.sendOut": "Mandar para campo…",
  "crews.callBack": "chamar de volta",
  "crews.working": "Trabalhando em {route}",
  "crews.pushingOn": "Avançando a partir de {route}",
  "crews.caught": "capturas",
  "crews.worn": "desgaste",
  "crews.willDecide":
    "Deixe pra lá e elas decidem sozinhas — equipes {trait} costumam decidir.",
  "crews.atHome": "Equipe {trait}, {n}% ambientada aqui.",
  "crews.ground": "Terreno",
  "crews.objective": "Objetivo",
  "crews.workHere": "Trabalhar este terreno",
  "crews.pushTo": "Avançar para o que há além",
  "crews.cannotPush":
    "A liga ainda não conhece este terreno bem o bastante para avançar a partir dele.",
  "crews.takeParty":
    "Leve até {n} para o Treinador criar. Voltam quando a equipe voltar.",
  "crews.kitCost": "Equipamento ₱{n}",
  "crews.unspentBack": " · o que sobrar volta",
  "crews.setOff": "Partir",
  "crews.allGroundBusy": "Toda rota que você conhece já tem uma equipe.",
  "kit.balls": "bolas",
  "kit.potions": "poções",
  "kit.revives": "revives",
  "kit.lures": "iscas",
  "trait.meticulous": "meticulosa",
  "trait.reckless": "imprudente",
  "trait.patient": "paciente",
  "trait.lucky": "sortuda",

  "gyms.title": "Ginásios",
  "gyms.noLeader": "Sem Líder — este ginásio perde todos os desafios",
  "gyms.hireLeader": "Contratar Líder · ₱{n}",
  "gyms.gymTrainers": "Treinadores do Ginásio",
  "gyms.hireJunior": "Contratar {type} · ₱{n}",
  "gyms.addSlot": "+1 vaga · ₱{n}",
  "gyms.absorbed":
    "A equipe do seu Líder lutou {n} {n:batalha|batalhas} a menos graças a {c} {c:auxiliar|auxiliares}.",
  "gyms.noJuniors":
    "Sem treinadores auxiliares — todo desafiante vai direto no seu Líder.",
  "gyms.partyOf": "Equipe de {name}",
  "gyms.partyHint":
    "A posição um entra primeiro; os outros seguem conforme cada um cai. Arraste para reordenar. As equipes se completam sozinhas com o PC — fixe os que importam e eles nunca serão trocados.",
  "gyms.rested": "{n}% descansados",
  "gyms.notFound": "Ginásio não encontrado.",

  "battle.title": "Batalha",
  "battle.waiting": "aguardando",
  "battle.live": "ao vivo",
  "battle.held": "defendido",
  "battle.badgeLost": "insígnia perdida",
  "battle.noChallenger": "Nenhum desafiante ainda. O próximo está a caminho.",
  "battle.challenger": "Desafiante",
  "battle.leaderSuffix": "{name} — Líder",
  "battle.hits": "{a} acerta {b} causando {n}",
  "battle.superEffective": " — super eficaz",
  "battle.notVery": " — pouco eficaz",
  "battle.faints": "{name} desmaiou.",
  "battle.revived": "{name} foi revivido.",

  "threat.title": "Relatório de Ameaças",
  "threat.sub":
    "Tipos que estão vindo · {n} ondas observadas · {pct}% perdidas",
  "threat.tooEarly": "Ondas insuficientes para enxergar um padrão.",
  "threat.stable": "Estável",
  "threat.watch": "Atenção",
  "threat.critical": "Crítico",

  "party.leads": "entra",
  "party.takeOut": "Tirar {name} da equipe",
  "party.addSlot": "Adicionar",
  "party.pickerTitle": "Equipe de {name}",
  "party.pickerEmpty":
    "Nada no PC que {name} possa escalar. Trabalhe uma rota que forneça o tipo {type}, ou troque por um no PC.",
  "creature.summary": "Resumo",
  "creature.info": "Dados do Pokémon",
  "creature.skills": "Atributos",
  "creature.memo": "Anotações do Treinador",
  "creature.dexNo": "Nº da Dex",
  "creature.species": "Espécie",
  "creature.record": "Cartel",
  "creature.trainer": "Treinador",
  "creature.battlesLeft": "{n:batalha|batalhas} {n:restante|restantes}",
  "creature.bondTitle": "O quanto vocês se conhecem",

  "pc.title": "PC",
  "pc.creatures": "{n} Pokémon",
  "pc.everything": "Tudo",
  "pc.inBox": "No PC",
  "pc.inParties": "Em equipes",
  "pc.byTrainer": "Por treinador",
  "pc.tradeFor": "Trocar por",
  "pc.notTrading": "Sem troca",
  "pc.box": "Caixa {n} de {total}",
  "pc.nothingTradeable":
    "Nada aqui que a mesa aceite. Pokémon na equipe de um Líder não entram na troca.",
  "pc.offering": "Oferecendo por um {type}",
  "pc.tradeHint":
    "Escolha Pokémon na caixa acima. As ofertas são avaliadas pela força média, com bônus pequeno por quantidade — qualidade pesa, quantidade quase nada.",
  "pc.tradeAim": "A mesa vai mirar em torno de {n} de força",
  "pc.tradeAimExample": ", algo como um {name}",
  "pc.clear": "Limpar {n}",
  "pc.trade": "Trocar {n} · ₱{fee}",
  "pc.pinned": "Fixado",
  "pc.pin": "Fixar para nunca ser trocado",
  "pc.setAside": "Reservar",
  "pc.allow": "Liberar",
  "pc.inTheBox": "no PC",
  "pc.setAsideState": "reservado",
  "pc.inAParty": "em uma equipe",
  "pc.noRosters": "Nenhuma equipe para gerenciar ainda.",

  "hall.title": "Hall da Fama",
  "hall.count": "{n} {n:lembrado|lembrados} · {i} {i:levado|levados} adiante",
  "hall.empty":
    "Ninguém ainda. Um Pokémon entra no Hall quando encerra a carreira depois de servir a maior parte da vida — o que exige serviço longo, não brilhante.",
  "hall.hint":
    "Carreiras que chegaram ao fim a seu serviço. Ao subir de divisão você consagra alguns daqui, e os escolhidos viram Mentores — a única coisa que sobrevive a uma liga.",
  "hall.mostRecent": "Mais recentes",
  "hall.battlesWon": "Vitórias",
  "hall.bondEnd": "Vínculo no fim",
  "hall.careerServed": "Carreira cumprida",
  "hall.mentor": "Mentor",
  "hall.mentorTitle": "Levado adiante como Mentor",
  "hall.served": "Cumpriu",
  "hall.bond": "Vínculo",
  "epitaph.complete": "Conhecia você por completo, e nunca deixou o ginásio cair.",
  "epitaph.knew": "Conhecia você por completo.",
  "epitaph.turned": "Barrou mais desafiantes do que você consegue lembrar.",
  "epitaph.gave": "Deu cada batalha que tinha.",
  "epitaph.stood": "Levantou mais vezes do que venceu, todas as vezes.",
  "epitaph.served": "Cumpriu a carreira inteira no posto.",

  "elite.title": "Elite dos Quatro",
  "elite.locked": "Bloqueado. Construa os {n} ginásios ({have} até agora) para abrir a Elite.",
  "elite.staffed": "{n}/{total} ocupadas · próxima investida em {m}min",
  "elite.freePass":
    "Cada cadeira vazia é passagem livre. Um desafiante que vencer as cinco toma sua liga.",
  "elite.taken": "Sua liga já foi tomada {n} {n:vez|vezes}.",
  "elite.tookTitle": "✦ tomou o título",
  "elite.champion": "Campeão",
  "elite.seat": "Elite {n}",
  "promo.title": "Subir de divisão",
  "promo.lostTitle": "A liga não é sua",
  "promo.sub": "Subir de {tier} para a próxima divisão. Tudo é zerado, menos o Hall.",
  "promo.forcedSub":
    "{name} está com o título. Você pode subir agora, ou ficar e retomá-lo.",
  "promo.goNow": "Subir agora",
  "promo.goNowDetail":
    "Você chega na próxima divisão com {name} e a equipe que te venceu. Nada além disso — nenhum consagrado, nenhum Mentor.",
  "promo.winBack": "Retomar o título primeiro",
  "promo.winBackDetail":
    "Desenvolva sua liga, retome o título e suba pelo caminho merecido — com {n} dos seus e os Mentores que realmente mudam a curva. Mais devagar, e vale a pena.",
  "promo.takeNow": "Subir de divisão agora",
  "promo.inductHint":
    "Escolha até {n} do Hall para consagrar. Cada um vira Mentor: treina todo Pokémon do tipo dele em todas as ligas seguintes. É a única coisa que sobrevive.",
  "promo.induct": "Consagrar {n}/{max} e subir",

  "staff.settled": "Tranquilo · moral {n}%",
  "staff.stepDown": "rebaixar…",
  "staff.stepDownBtn": "Rebaixar…",
  "staff.suspended": "Suspenso",
  "staff.content": "Tranquilo",
  "staff.restless": "Inquieto",
  "staff.breaking": "No limite",
  "staff.unhappy": "Insatisfeito",
  "staff.backIn": "volta em {t}",
  "staff.suspensions": "{n} de {max} {max:suspensão|suspensões} · ",
  "staff.morale": "moral {n}%",
  "staff.warnTargets":
    "Suspensão em {n}% — rebaixe ou pague direito.",
  "staff.warnNoPost": "Suspensão em {n}% — não há posto menor disponível.",
  "staff.demoteNote":
    "A equipe vai junto, ajustada ao novo posto. Nada do que criou vínculo é esquecido.",

  "daycare.title": "Creche",
  "facilities.title": "Instalações",
  "facilities.upgrade": "Melhorar · ₱{n}",
  "facilities.maxed": "No nível máximo",

  "log.title": "Recentes",
  "log.empty": "Nada ainda.",

  "log.refusedToServe": "{name} vai embora em vez de servir sob um rival.",
  "log.usurperWalks": "{name} foi embora — e vai voltar.",
  "log.tookLeague": "{name} tomou a liga. Agora é seu Campeão.",
  "log.retired": "{name} se aposentou na Creche.",
  "log.hatched": "Um ovo chocou na Creche: {name}.",
  "log.revived": "Um desafiante reviveu o {name} dele.",
  "log.rivalJoined": "{name} entrou para a liga depois de perder.",
  "log.evolved": "{text}.",
  "log.resigned": "{name} pediu demissão e levou o parceiro junto.",
  "log.cameWithYou": "{name} veio com você.",
  "log.objectiveDone": "{title} — concluído.",
  "log.crewLetGo": "{name} foram dispensados.",
  "log.evolvedOnRoute": "{name} evoluiu em {route}.",
  "log.backOnDuty": "{name} voltou ao posto.",
  "log.goneForGood": "{name} deixou a liga de vez.",
  "log.stepsDown": "{name} foi rebaixado para {post}.",
  "log.rivalAgreed": "{name} finalmente aceitou trabalhar para você.",
  "log.badgesClaimed": "{n} {n:insígnia|insígnias} {n:levada|levadas} por desafiantes.",
  "log.rivalHeld": "{name} desafiou e perdeu.",
  "log.rivalWon": "{name} venceu seu ginásio e levou uma insígnia.",
  "log.eliteLost": "Um desafiante venceu a Elite dos Quatro e tomou a liga.",
  "log.eliteHeld": "Um desafiante passou por {n} {n:cadeira|cadeiras} da Elite antes de cair.",
  "log.upsetWon": "{name} venceu uma que não tinha como vencer.",
  "log.upsetLost": "{name} perdeu uma que devia ter vencido — ainda se ambientando.",
  "log.whileAway":
    "Enquanto você esteve fora: {waves} desafios, ₱{money} arrecadados, {caught} capturados.",
  "log.suspended": "{name} está suspenso ({n} de {max}).",
  "log.crewBeaten": "{name} voltaram derrotados de {route}.",
  "log.crewHome": "{name} voltaram de {route} com {n} {n:captura|capturas}.",
  "log.reached": "{route} entrou no mapa. E {resident} vive por lá.",

  "ev.hazardSalved": "Terreno difícil em {route}. Uma Poção resolveu.",
  "ev.hazardRaw": "Terreno difícil em {route}, e nada para tratar.",
  "ev.troubleSaved": "Algo partiu para cima deles em {route}. Um Revive salvou.",
  "ev.troubleRaw": "Deu tudo errado em {route}, e sem Revives.",
  "ev.windfall": "Acharam algo que vale ₱{n} em {route}.",
  "ev.encounter": "Um {name} em {route}.",
  "ev.encounterNoBalls": "Um {name} em {route}, e nada para capturar.",
  "ev.wayThrough": "Uma passagem em direção a {route}.",
  "ev.notEnough": "Não sobrou o bastante para capturar.",
  "ev.tookIt": "Capturaram. {n} {n:Poké Bola gasta|Poké Bolas gastas}.",
  "ev.choicePrompt": "Um {name} em {route}. Capturar vai custar {n} {n:Poké Bola|Poké Bolas}.",
  "ev.choiceTake": "Gastar {n} e capturar",
  "ev.choiceLeave": "Deixar passar",

  "route.verdant_path": "Trilha Verdejante",
  "route.cinder_ridge": "Serra das Brasas",
  "route.coastal_road": "Estrada Costeira",
  "route.millbrook": "Ribeirão do Moinho",
  "route.quarry_flats": "Chapada da Pedreira",
  "route.hollow_wood": "Mata Oca",
  "route.saltwind_pier": "Píer do Vento Salgado",
  "route.ashfall_run": "Vale das Cinzas",
  "route.thunder_plain": "Planície do Trovão",
  "route.gloaming_fen": "Charco do Crepúsculo",
  "route.emberworks": "A Fundição",
  "route.tidal_caverns": "Cavernas da Maré",
  "route.the_stillfields": "Os Campos Quietos",
  "route.kiln_reach": "Confins da Fornalha",
  "route.hoarfrost_shelf": "Platô de Geada",
  "route.dragons_spine": "Espinha do Dragão",

  "mark.verdant_path": "As Fileiras do Pomar",
  "mark.cinder_ridge": "As Pedras Mornas",
  "mark.coastal_road": "O Marco",
  "mark.millbrook": "O Moinho Velho",
  "mark.quarry_flats": "A Face Cortada",
  "mark.hollow_wood": "A Árvore da Lanterna",
  "mark.saltwind_pier": "O Píer Comprido",
  "mark.ashfall_run": "A Queda Cinzenta",
  "mark.thunder_plain": "As Torres de Ferro",
  "mark.gloaming_fen": "A Estrada Submersa",
  "mark.emberworks": "A Fornalha Fria",
  "mark.tidal_caverns": "O Relógio da Maré",
  "mark.the_stillfields": "O Círculo de Pedras",
  "mark.kiln_reach": "A Planície de Vidro",
  "mark.hoarfrost_shelf": "A Fenda Azul",
  "mark.dragons_spine": "A Última Crista",

  "blurb.verdant_path": "Alguém ainda cuida disto. Sempre tem algo nos galhos.",
  "blurb.cinder_ridge": "Guardam o calor do dia a noite toda. Uma equipe dorme bem aqui.",
  "blurb.coastal_road": "Toda distância nesta costa é medida a partir daqui.",
  "blurb.millbrook": "A roda ainda gira. Comerciantes param aqui, e pagam bem.",
  "blurb.quarry_flats": "Um século de extração abriu a encosta inteira.",
  "blurb.hollow_wood": "Alguém pendura uma luz aqui. Ninguém nunca viu quem.",
  "blurb.saltwind_pier": "Avança mais do que qualquer barco precisa. Boa pescaria na ponta.",
  "blurb.ashfall_run": "A cinza cai como neve e esconde o que está no chão.",
  "blurb.thunder_plain": "Desativadas há muito, ainda zumbindo. Ninguém lembra o que carregavam.",
  "blurb.gloaming_fen": "Vai dar em algum lugar. Metade dela está debaixo d'água.",
  "blurb.emberworks": "Apagada há trinta anos. Agora bicho faz ninho lá dentro.",
  "blurb.tidal_caverns": "A água chega na mesma marca, no mesmo minuto, sempre.",
  "blurb.the_stillfields": "Mais antigo que a liga. Pokémon se reúnem aqui e ninguém sabe por quê.",
  "blurb.kiln_reach": "Algo queimou aqui quente o bastante para virar a areia em vidro.",
  "blurb.hoarfrost_shelf": "Dá para enxergar quarenta anos lá embaixo. E algo se mexe no fundo.",
  "blurb.dragons_spine": "Nada além dela foi mapeado. E mesmo assim gente continua indo.",

  "obj.first-gym.title": "Abra seu primeiro ginásio",
  "obj.first-gym.detail": "Escolha o tipo e o Líder que vai defendê-lo. Nenhum dos dois tem volta.",
  "obj.first-crew.title": "Contrate uma equipe de campo",
  "obj.first-crew.detail": "Duas pessoas que trabalham juntas. O Ranger traz Pokémon; o Treinador cria os que levou.",
  "obj.first-trip.title": "Mande-os a campo",
  "obj.first-trip.detail": "Equipe uma equipe e trabalhe uma rota. O que encerra a viagem é o equipamento que você pagou, não um cronômetro.",
  "obj.staff-a-gym.title": "Contrate dois Treinadores de Ginásio",
  "obj.staff-a-gym.detail": "Os auxiliares ficam entre o desafiante e seu Líder. Escalam Pokémon mais fracos, e compram tempo para o Líder.",
  "obj.push-on.title": "Alcance um lugar novo",
  "obj.push-on.detail": "Percorra uma rota até a liga conhecê-la, e mande uma equipe além. O mapa cresce porque alguém foi lá.",
  "obj.a-bonded-gym.title": "Forme um núcleo enturmado",
  "obj.a-bonded-gym.detail": "Dois Pokémon de um ginásio que serviram tempo suficiente para serem confiáveis. Vínculo compra constância, não força.",
  "obj.four-gyms.title": "Mantenha quatro ginásios",
  "obj.four-gyms.detail": "Um circuito largo o bastante para os tipos que vêm começarem a importar.",
  "obj.a-full-board.title": "Mantenha os oito",
  "obj.a-full-board.detail": "Todas as insígnias da região, defendidas por gente que você escolheu.",
  "obj.staff-the-elite.title": "Ocupe a Elite dos Quatro",
  "obj.staff-the-elite.detail": "E o Campeão acima deles. Cadeira vazia é passagem livre no caminho para tomar sua liga.",
  "obj.first-legend.title": "Veja uma carreira até o fim",
  "obj.first-legend.detail": "Um Pokémon que serve a maior parte da vida entra no Hall. É para isso que serve a aposentadoria.",
  "obj.promote.title": "Suba de divisão",
  "obj.promote.detail": "Consagre alguém do Hall e recomece, mais difícil. Os Mentores que você escolher são tudo que sobrevive.",
  "obj.held.title": "Barre {n} {n:desafiante|desafiantes}",
  "obj.held.detail": "Segurar o circuito é o trabalho inteiro.",
  "obj.collected.title": "Traga {n} Pokémon para casa",
  "obj.collected.detail": "Cada um deles chegou porque alguém foi lá buscar.",
  "obj.mapped.title": "Alcance {n} {n:lugar|lugares}",
  "obj.mapped.detail": "O mapa cresce porque as equipes o percorreram.",

  "reward.crew": "uma vaga de equipe",
  "reward.facility": "um nível de {name}",
  "reward.kit": "{balls} bolas, {potions} poções",
  "reward.money": "₱{n}",

  "bond.inseparable": "Inseparáveis",
  "bond.veryAttached": "Muito apegado",
  "bond.warming": "Se afeiçoando",
  "bond.gettingUsed": "Se acostumando",
  "bond.wary": "Desconfiado",
  "bond.exact": "Luta exatamente como os números prometem — varia só ±{n}%.",
  "bond.dependable": "Bastante confiável, variando ±{n}% para cada lado.",
  "bond.unpredictable": "Imprevisível — varia ±{n}%, e perde batalhas que devia vencer.",
  "career.fresh": "Novo",
  "career.seasoned": "Rodado",
  "career.veteran": "Veterano",
  "career.fading": "Se apagando",
  "career.final": "Últimos dias",

  "memo.career": "Cada batalha gasta um pouco disso. Quando acaba, ele se aposenta na Creche, onde a linhagem continua.",
  "daycare.unbuilt": "Construa a Creche para deixar Pokémon treinando — e para chocar ovos de um casal do mesmo tipo.",
  "daycare.empty": "Ninguém aos cuidados. Deixar um Pokémon aqui o faz subir de nível com o tempo.",
  "daycare.noEgg": "Estes dois não compartilham tipo — não vai sair ovo daí.",
  "daycare.nothingToLeave": "Nada disponível para deixar.",
  "log.incoming": "Desafiantes estão a caminho.",
  "gymOffer.title": "Escolha seu primeiro tipo",
  "gymOffer.detail": "É o tipo em torno do qual sua liga é construída, e o único que você vai conseguir escalar no começo. Tudo depois disso é escolhido em relação a ele.",
  "gymOffer.cost": "Custo de construção",
  "leaderOffer.title": "Escolha quem comanda",
  "leaderOffer.detail": "Grátis — você já pagou pela construção. Cada um traz o próprio parceiro, e o próprio jeito de tocar um ginásio.",

  "gymOffer.firstTitle": "Escolha o tipo do seu primeiro ginásio",
  "gymOffer.nextTitle": "Escolha o tipo do próximo ginásio",
  "gymOffer.founding": "É o tipo em torno do qual sua liga é construída, e o único que você vai conseguir escalar no começo. De graça — tudo começa aqui.",
  "gymOffer.costLine": "A construção custa {cost}. Você tem {money}.",
  "gymOffer.keepEarning": " Continue arrecadando — a oferta espera.",

  // -- Strings that were left in English until the first playtest ----------
  "app.gyms": "Ginásios",
  "app.noGyms": "Nenhum ginásio ainda.",
  "app.switchTo": "Switch to English",

  "gymOffer.foundEyebrow": "Funde sua liga",
  "gymOffer.newEyebrow": "Novo ginásio disponível",
  "gymOffer.later": "Depois",
  "gymOffer.chip": "Novo ginásio disponível · {cost}",
  "gymOffer.owned": "No plantel",
  "gymOffer.challengers": "Desafiantes",
  "gymOffer.suppliedBy": "Abastecido por",

  "arch.stall": "Defensivo",
  "arch.stall.blurb": "Desgasta os desafiantes. A equipe dele cansa mais devagar e segura mais.",
  "arch.sweep": "Agressivo",
  "arch.sweep.blurb": "Acaba as batalhas rápido, e cansa rápido fazendo isso.",
  "arch.mentor": "Mentor",
  "arch.mentor.blurb": "Os Pokémon sob o comando dele se entrosam muito mais rápido.",
  "arch.drillmaster": "Instrutor",
  "arch.drillmaster.blurb": "Poupa a carreira dos Pokémon dele. Eles duram mais.",

  "map.leaderFighting": "O Líder está lutando — acompanhe",
  "map.challengerInside": "Desafiante lá dentro",
  "map.badgeLost": "Insígnia perdida",
  "map.held": "Seguro",
  "map.noLeader": "Sem Líder — indefeso",
  "map.trainers": "{n}/{max} {max:treinador|treinadores}",

  "rival.ready": "Seu ginásio deve segurar",
  "rival.close": "Está muito parelho",
  "rival.outmatched": "Você está em desvantagem",

  "creature.openSummary": "Abrir ficha",
  "creature.exhausted": "Exausto",
  "creature.tiring": "Cansando",
  "creature.rested": "Descansado",
  "creature.stats": "Atributos",
  "creature.condition": "Condição",
  "creature.careerHead": "Carreira",
  "creature.pedigree": "Linhagem",
  "creature.signature": "Marca registrada",
  "creature.sigShort": "MR",
  "creature.inTheBox": "No PC",
  "creature.statSpread": "Distribuição dos atributos base",

  "party.lead": "entra primeiro",

  "pc.power": "Força",
  "pc.name": "Nome",
  "pc.offerThis": "Oferecer este",

  "a11y.map": "O mapa da liga",
  "a11y.sections": "Seções",

  "crews.nowhereFree": "Nenhum lugar livre",
  "elite.unstaffedWarning": "Vazia — os desafiantes passam direto.",
  "facilities.complete": "Completo",
  "threat.superEffective": "Super efetivo contra este ginásio",

  "facility.scouting_office.name": "Escritório de Batedores",
  "facility.scouting_office.blurb": "Dá suporte aos seus Batedores. Cada nível é mais uma rota que você pode ocupar — gente, não porcentagem — e a partir do nível 2 ele mapeia terreno que ninguém trabalhou ainda.",
  "facility.scouting_office.effect": "+{n} {n:posto|postos}",
  "facility.scouting_office.effect2": "+{n} {n:posto|postos} · mapeia todas as rotas",
  "facility.training_grounds.name": "Centro de Treinamento",
  "facility.training_grounds.blurb": "Os Pokémon se entrosam com o treinador muito mais rápido. As equipes são sempre de seis — o que o Centro compra é a velocidade com que esses seis viram confiáveis.",
  "facility.training_grounds.effect": "+{n}% de velocidade de entrosamento",
  "facility.medical_center.name": "Centro Médico",
  "facility.medical_center.blurb": "Os Pokémon se recuperam mais rápido entre as ondas, e a carreira deles dura mais.",
  "facility.medical_center.effect": "+{n}% de recuperação · +{c}% de carreira",
  "facility.trade_desk.name": "Mesa de Trocas",
  "facility.trade_desk.blurb": "Condições melhores no balcão, então o que você abre mão rende mais.",
  "facility.trade_desk.effect": "+{n}% no valor das trocas",
  "facility.day_care.name": "Creche",
  "facility.day_care.blurb": "Abriga os Pokémon aposentados. A criação chega na próxima expansão.",
  "facility.day_care.effect": "Os aposentados têm para onde ir",
  "facilities.build": "Construir · {cost}",
  "facilities.upgradeCost": "Melhorar · {cost}",

  // -- The first screen a stranger sees ------------------------------------
  "welcome.eyebrow": "Abriu uma vaga",
  "welcome.title": "Você comanda a liga. Você nunca batalha.",
  "welcome.beat1": "Você não é o desafiante.",
  "welcome.beat1detail":
    "Os treinadores vêm buscar suas insígnias. Seu trabalho é garantir que eles saiam sem nenhuma.",
  "welcome.beat2": "Você contrata gente, e escala Pokémon para eles.",
  "welcome.beat2detail":
    "Um Líder segura um ginásio. Uma equipe trabalha uma rota e traz Pokémon para casa. Quem fica onde é o jogo inteiro.",
  "welcome.beat3": "Todo mundo aqui se desgasta.",
  "welcome.beat3detail":
    "As carreiras acabam, os treinadores perdem a paciência, e um Pokémon que serviu por muito tempo é lembrado. Nada do que você constrói dura para sempre.",
  "welcome.idle": "Continua rodando enquanto você está fora. Volte e veja o que aconteceu.",
  "welcome.begin": "Assumir o cargo",
  "gymOffer.noRoute": "nenhum lugar que você alcançou",
  "facility.operations_office.name": "Escritório de Operações",
  "facility.operations_office.blurb": "Mantém a liga funcionando direito quando você não está. Sem ele, ela fica no piloto automático; com ele, ela trabalha. O quanto a equipe está satisfeita decide o resto.",
  "facility.operations_office.effect": "{n}% do rendimento total enquanto você está fora",
  "decision.ordersStopped.title": "{name} pararam de trabalhar",
  "decision.ordersStopped.floor": "Mais uma viagem passaria do limite que você definiu. Abaixe o limite, ou mande para um lugar mais barato.",
  "decision.ordersStopped.boxFull": "O PC está cheio, então não há onde colocar mais nada que eles capturem.",
  "decision.ordersStopped.worn": "Voltaram derrotados. Aquele terreno é mais bruto que o equipamento que você mandou.",
  "decision.ordersStopped.held": "Estão esperando você responder uma coisa.",
  "decision.ordersStopped.routeTaken": "Outra equipe está trabalhando naquela rota agora.",
  "decision.ordersStopped.stopped": "As ordens permanentes deles acabaram.",
  "crews.standing": "Continuar indo",
  "crews.standingHint": "Quando voltarem, comprar este equipamento de novo e mandar de volta. Para em qualquer coisa que valha te contar.",
  "crews.floor": "Parar abaixo de",
  "crews.floorHint": "Eles não vão equipar outra viagem se isso te deixar abaixo disso.",
  "crews.standingOn": "Trabalhando {route} até você mandar parar",
  "crews.standingOff": "Uma viagem, e voltam",
  "crews.stopOrders": "Cancelar ordens permanentes",
  "coach.replay": "Para que serve esta tela?",
  "coach.got": "Entendi",
  "coach.desk.title": "A Mesa é onde você descobre o que precisa de você.",
  "coach.desk.body": "O que aconteceu enquanto você estava fora, o que está esperando uma decisão, e o que a liga está buscando. Tudo aqui leva para a tela que resolve. Se não tem nada aberto, realmente não tem nada a fazer — vá fazer outra coisa.",
  "coach.gyms.title": "Os ginásios são onde as insígnias são defendidas.",
  "coach.gyms.body": "Cada um tem um Líder e alguns treinadores auxiliares, todos de um tipo só. Os auxiliares ficam entre o desafiante e o seu Líder: escalam Pokémon mais fracos e compram tempo para ele. As equipes se completam sozinhas com o PC — fixe os que importam e eles nunca serão trocados.",
  "coach.pc.title": "O PC guarda todo mundo que não está escalado em algum lugar.",
  "coach.pc.body": "Os Pokémon que suas equipes trazem chegam aqui, e as equipes se abastecem daqui sozinhas. Tem um limite: quando enche, as capturas param, porque uma liga que acumula não é uma liga. A Mesa de Trocas é como você transforma sobra do tipo errado no tipo certo.",
  "coach.field.title": "O Campo é de onde vêm os Pokémon.",
  "coach.field.body": "Uma equipe são duas pessoas que trabalham juntas — o Batedor traz Pokémon, o Treinador cria os que ele leva junto. Você equipa cada viagem e paga adiantado, e o que termina a viagem é o equipamento que você comprou, não um relógio. Alcance terreno novo avançando a partir do que já conhece.",
  "coach.staff.title": "A Elite é a última coisa entre um desafiante e o seu título.",
  "coach.staff.body": "Quatro cadeiras e um Campeão, ocupadas pelos seus próprios treinadores. Um desafiante que passa por todos os ginásios chega aqui. Esta tela também mostra como sua equipe está aguentando: pague mal ou sobrecarregue, e eles são rebaixados, ou vão embora.",
  "coach.hall.title": "O Hall lembra os Pokémon cuja carreira terminou bem.",
  "coach.hall.body": "Todo Pokémon tem uma carreira finita, e uma carreira longa defendendo ginásios ganha um lugar aqui. Quando você sobe de nível, é do Hall que você escolhe — os consagrados viram Mentores, e são a única coisa que sobrevive ao recomeço.",
  "coach.daycare.title": "A Creche é para onde vão os aposentados.",
  "coach.daycare.body": "Os Pokémon deixados aqui continuam subindo de nível sem lutar, e um casal aposentado do mesmo tipo acaba gerando um ovo. É o único lugar onde o fim de uma carreira leva a algum lugar em vez de simplesmente parar.",
  "coach.facilities.title": "As instalações mudam o que a linha de frente consegue fazer.",
  "coach.facilities.body": "Elas não abrigam ninguém. Cada uma multiplica alguma coisa — quantas equipes você mantém, a velocidade do entrosamento, a duração das carreiras, o quanto a liga rende enquanto você está fora. É para cá que vai o dinheiro quando você tem mais dele do que ginásios para construir.",
  "map.nextIn": "Próximo desafiante em {n}s",
  "map.nextDue": "Indefeso — vem desafiante aí",
  "trade.open": "Trocar",
  "trade.title": "A Mesa de Trocas",
  "trade.explain": "Abra mão de Pokémon que você não está usando, e escolha um tipo. O que voltar fica dentro de {pct}% do que você ofereceu, mais ou menos no mesmo nível.",
  "trade.giveUp": "Abrir mão de",
  "trade.aimFor": "Pedir",
  "trade.pickSome": "Escolha pelo menos {n}. A mesa avalia sua oferta pela média, não pelo total — colocar um fraco puxa tudo para baixo.",
  "trade.range": "Você deve receber algo entre {low} e {high} de força.",
  "trade.like": "Algo como um {name}.",
  "trade.received": "{name} entrou no PC, com {n} de força.",
  "trade.fee": "₱{n} por fora, de qualquer jeito",
  "trade.nothingIdle": "Não há ninguém de sobra. Tudo que você tem está em uma equipe, em campo com uma equipe, ou na Creche.",
  "trade.noGyms": "Abra um ginásio primeiro — a mesa troca pelos tipos que sua liga realmente escala.",
  "gyms.noParty": "Ninguém escalado ainda — o PC vai preencher.",
};
