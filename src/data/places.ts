import type { Place, PlaceKind, TypeId } from "../sim/types.js";

/**
 * The places on the map: the towns the league operates out of, and the
 * landmarks the roads run between.
 *
 * A place is not a route. Routes are where creatures come from — that is the
 * settled scarcity mechanism and it does not move. A place is where the league
 * *is*: a gym town holds one of your gyms, and a landmark is ground the roads
 * pass through on the way somewhere else.
 *
 * Both are selectable, and they read differently because they are different
 * things. Making a town into another expedition target would have given the
 * player two words for one verb.
 *
 * This is Johto without its late corners — no Safari Zone, no Battle Frontier,
 * no Whirl Islands. Eight gym towns, which is exactly the board the league
 * builds, so every gym the player opens has an address.
 *
 * Positions follow the region's own geography: New Bark east, Cianwood west,
 * Blackthorn and the Lake north.
 */

interface PlaceDef {
  id: string;
  name: string;
  kind: PlaceKind;
  at: { x: number; y: number };
  /**
   * The gym this town holds, and the type it fields.
   *
   * Authored, not chosen — a league that can put any gym anywhere makes the map
   * a backdrop. But these are not quite the source games' eight: the board fills
   * in order of how hard a type is to staff, and Steel, Dragon, Ice, Fighting
   * and Flying only become available at the very last rank. A board built from
   * Johto's real badges therefore always left a town standing empty — measured
   * at 0 of 25 full boards with every gym housed.
   *
   * These eight are the eight the ramp can actually reach, matched to each town
   * by what lives on the roads out of it: Violet gets Poison because Sprout
   * Tower is full of Bellsprout and Gastly, Olivine gets Electric because the
   * lighthouse Magnemite are Electric before they are Steel, Blackthorn gets
   * Ground because Dark Cave is Geodude to the ceiling. Azalea, Goldenrod and
   * Ecruteak keep their real types, which fit the ramp already.
   *
   * Cianwood is the exception and takes what is left: an island reached by one
   * sea road, with nothing living near it to recommend anything.
   */
  gym?: TypeId;
  /** Open from the first hour, with nothing to explore first. */
  starting?: boolean;
}

const DEFS: readonly PlaceDef[] = [
  // --- Towns -------------------------------------------------------------
  { id: "new_bark", name: "New Bark Town", kind: "city", at: { x: 92, y: 71 }, starting: true },
  { id: "cherrygrove", name: "Cherrygrove City", kind: "city", at: { x: 73, y: 71 } },
  { id: "violet_city", name: "Violet City", kind: "city", at: { x: 59, y: 47 }, gym: "poison" },
  { id: "azalea_town", name: "Azalea Town", kind: "city", at: { x: 46, y: 86 }, gym: "bug" },
  { id: "goldenrod", name: "Goldenrod City", kind: "city", at: { x: 39, y: 64 }, gym: "normal" },
  { id: "ecruteak", name: "Ecruteak City", kind: "city", at: { x: 48, y: 30 }, gym: "ghost" },
  { id: "olivine", name: "Olivine City", kind: "city", at: { x: 24, y: 52 }, gym: "electric" },
  { id: "cianwood", name: "Cianwood City", kind: "city", at: { x: 8, y: 67 }, gym: "fairy" },
  { id: "mahogany", name: "Mahogany Town", kind: "city", at: { x: 66, y: 30 }, gym: "grass" },
  { id: "blackthorn", name: "Blackthorn City", kind: "city", at: { x: 89, y: 30 }, gym: "ground" },

  // --- Landmarks ---------------------------------------------------------
  // Only the ones the roads genuinely run *through*. A landmark that is a dead
  // end — Sprout Tower, the Ruins, Dragon's Den — is not a node; its wildlife
  // is folded into the road that reaches it, in routes.ts. Otherwise the map
  // grows spurs that exist to be drawn rather than to be chosen between.
  { id: "dark_cave", name: "Dark Cave", kind: "site", at: { x: 80, y: 45 } },
  { id: "union_cave", name: "Union Cave", kind: "site", at: { x: 59, y: 86 } },
  { id: "national_park", name: "National Park", kind: "site", at: { x: 39, y: 47 } },
  { id: "lake_of_rage", name: "Lake of Rage", kind: "site", at: { x: 66, y: 10 } },
];

export const PLACES: readonly Place[] = DEFS.map((def) => ({
  id: def.id,
  name: def.name,
  kind: def.kind,
  at: def.at,
  gym: def.gym ?? null,
  starting: def.starting ?? false,
}));

export function placeById(id: string): Place | undefined {
  return PLACES.find((p) => p.id === id);
}

/** The towns that hold a gym, in map order. */
export function gymCities(): Place[] {
  return PLACES.filter((p) => p.gym !== null);
}

/** The one town a league starts in. */
export function startingPlaces(): Place[] {
  return PLACES.filter((p) => p.starting);
}
