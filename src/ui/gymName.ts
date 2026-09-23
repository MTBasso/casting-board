import type { Gym } from "../sim/index.js";

/**
 * What to call a gym.
 *
 * A gym that stands in a town is named by the town, because the board and the
 * map are one world — "Azalea Gym", not "Bug Gym" on one screen and Azalea on
 * the other. The type-derived name survives only for a gym the authored map has
 * no room for yet, which is a real state while the region is built a slice at a
 * time.
 *
 * The name is composed at render rather than stored, so a league saved in one
 * language reads correctly in the other.
 */
export function gymTitle(gym: Gym, tk: (key: string) => string): string {
  if (!gym.placeId) return gym.name;
  return tk(`gymName.${gym.placeId}`);
}
