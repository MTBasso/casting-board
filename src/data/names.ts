import { pick } from "../sim/rng.js";
import type { RngState } from "../sim/types.js";

/**
 * Auto-nicknames and staff names.
 *
 * Per the design doc: nobody manually names fifty creatures, but everybody
 * renames the one they grew attached to. Auto-names give attachment somewhere
 * to land without demanding it up front — so these need to be evocative enough
 * that the player would keep one.
 */

const NICKNAMES = [
  "Vesper", "Umbra", "Solace", "Cinder", "Marrow", "Quill", "Tally", "Bramble",
  "Nocturne", "Harrow", "Pallas", "Kestrel", "Ember", "Sable", "Verity", "Rook",
  "Halcyon", "Tundra", "Vellum", "Onyx", "Wren", "Fable", "Cobalt", "Lumen",
  "Saffron", "Draft", "Gale", "Thistle", "Pyre", "Meridian", "Salt", "Compass",
  "Juniper", "Slate", "Rill", "Ashen", "Bellow", "Cairn", "Drift", "Echo",
];

const FIRST = [
  "Marnie", "Blaise", "Corin", "Ilse", "Rowan", "Tessa", "Dov", "Neve",
  "Kestrel", "Aldo", "Sian", "Mercer", "Juno", "Brac", "Odile", "Finn",
  "Vance", "Perrin", "Isolde", "Tarn", "Hale", "Wren", "Cassia", "Bram",
];

const LAST = [
  "Ashgrove", "Vell", "Rook", "Cardew", "Stannis", "Maren", "Holt", "Bray",
  "Fenwick", "Orlow", "Sable", "Thorne", "Quill", "Draven", "Marsh", "Alder",
];

export function nickname(rng: RngState): string {
  return pick(rng, NICKNAMES);
}

export function trainerName(rng: RngState): string {
  return `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
}
