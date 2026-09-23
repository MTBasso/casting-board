// The curated species pool for the roguelike redesign — draft pools, shop
// offers, and rival rosters all draw from this list rather than the full
// 649-species dex.
//
// Sourcing: ~40 slugs are real popularity picks, cross-referenced from a
// current public ranking and filtered to species introduced by Gen 5 (the
// original poll's top entries skew Gen 6+, which this project doesn't ship).
// The remaining slots are an algorithmic diversity fill — one species per
// evolution family (preferring the final stage, so the roster reads as
// recognizable adults), round-robined across all 18 types so no type
// dominates the pool. Regenerate with a fresh pass over species.dex.ts if
// the popularity source or the fill heuristic changes; don't hand-edit
// piecemeal or the two halves drift apart.
export const ROSTER_SLUGS: readonly string[] = [
  // Popularity picks (Gen 1-5 filtered)
  "pikachu", "mewtwo", "charizard", "eevee", "bulbasaur", "lucario", "gengar",
  "lapras", "rayquaza", "gardevoir", "dragonite", "metagross", "garchomp",
  "groudon", "snorlax", "tyranitar", "kyogre", "volcarona", "kirlia", "riolu",
  "blastoise", "alakazam", "charmander", "lugia", "infernape", "venusaur",
  "ho-oh", "gyarados", "typhlosion", "mew", "scizor", "empoleon", "espeon",
  "umbreon", "zoroark", "haxorus", "slaking", "togekiss", "staraptor",
  "chandelure", "glaceon",
  // Diversity fill: one per family, final stage, round-robined across types
  "blissey", "arcanine", "kingdra", "tangrowth", "electivire", "vanilluxe",
  "poliwrath", "crobat", "rhyperior", "salamence", "exeggutor", "yanmega",
  "archeops", "dusknoir", "hydreigon", "krookodile", "magnezone", "clefable",
  "porygon-z", "magmortar", "milotic", "roserade", "luxray", "cloyster",
  "mienshao", "tentacruel", "hippowdon", "aerodactyl", "starmie", "shuckle",
  "aggron", "drifblim", "flygon", "weavile", "probopass", "whimsicott",
  "lickilicky", "ninetales", "walrein", "cradily", "eelektross", "mamoswine",
  "machamp", "nidoqueen", "steelix", "gliscor", "claydol", "pinsir",
  "gigalith", "mismagius", "altaria", "mandibuzz", "klinklang", "mr-mime",
  "braviary", "rapidash", "seismitoad", "simisage", "ampharos",
  // Evolution-line fill: every pre-evolution and mid-evolution of a family
  // already represented above, so a family exists in the roster at every
  // stage rather than only its final form. Landed for the season-start
  // draft's "starter" pick (docs/reviews/starters-and-evolution-2026-09-23.md
  // F1) — without this, only 8 of 100 species were both unevolved and
  // non-legendary, so 77.7% of first-pick offers had no valid starter at
  // all. Same derive-don't-hand-pick rule as the two fills above: every slug
  // here is an ancestor of a slug already in this list.
  "pichu", "charmeleon", "gastly", "haunter", "ralts", "dratini", "dragonair", "beldum",
  "metang", "gible", "gabite", "munchlax", "larvitar", "pupitar", "larvesta", "squirtle",
  "wartortle", "abra", "kadabra", "chimchar", "monferno", "ivysaur", "magikarp", "cyndaquil",
  "quilava", "scyther", "piplup", "prinplup", "zorua", "axew", "fraxure", "slakoth",
  "vigoroth", "togepi", "togetic", "starly", "staravia", "litwick", "lampent", "happiny",
  "chansey", "growlithe", "horsea", "seadra", "tangela", "elekid", "electabuzz", "vanillite",
  "vanillish", "poliwag", "poliwhirl", "zubat", "golbat", "rhyhorn", "rhydon", "bagon",
  "shelgon", "exeggcute", "yanma", "archen", "duskull", "dusclops", "deino", "zweilous",
  "sandile", "krokorok", "magnemite", "magneton", "cleffa", "clefairy", "porygon", "porygon2",
  "magby", "magmar", "feebas", "budew", "roselia", "shinx", "luxio", "shellder",
  "mienfoo", "tentacool", "hippopotas", "staryu", "aron", "lairon", "drifloon", "trapinch",
  "vibrava", "sneasel", "nosepass", "cottonee", "lickitung", "vulpix", "spheal", "sealeo",
  "lileep", "tynamo", "eelektrik", "swinub", "piloswine", "machop", "machoke", "nidoran-f",
  "nidorina", "onix", "gligar", "baltoy", "roggenrola", "boldore", "misdreavus", "swablu",
  "vullaby", "klink", "klang", "mime-jr", "rufflet", "ponyta", "tympole", "palpitoad",
  "pansage", "mareep", "flaaffy",
];
