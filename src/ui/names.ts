import { speciesName } from "./sprites.js";
import type { Creature } from "../sim/index.js";

/**
 * What a creature is called on screen.
 *
 * The species. A roster of two hundred invented nicknames is unreadable, and
 * the player reasons in species — "do I have anything that answers Water" is a
 * question about Poliwag, not about Bramble. The nickname is still there and
 * still earned; it belongs on the summary screen, as a detail about *this* one.
 */
export function creatureName(c: Creature): string {
  return speciesName(c.speciesId);
}
