import type { FacilityId } from "../sim/types.js";

/**
 * Facilities.
 *
 * The support tier behind the gyms. They hold no creatures; they change what
 * the front line can do — and they are the first system in the game whose
 * investment *multiplies* rather than adds. Together with gym count they are the
 * in-tier progression the player actually feels.
 */
export interface FacilityDef {
  id: FacilityId;
  name: string;
  /** What it does, in the player's words. */
  blurb: string;
  maxLevel: number;
  baseCost: number;
  costGrowth: number;
  /** Rendered per level so the upgrade button can say what it buys. */
  effect: (level: number) => string;
}

export const FACILITIES: readonly FacilityDef[] = [
  {
    id: "scouting_office",
    name: "Scouting Office",
    blurb: "Supports your Catchers. Every level is another route you can staff \u2014 headcount, not a percentage \u2014 and from level 2 it surveys ground nobody has worked yet.",
    maxLevel: 5,
    baseCost: 3200,
    costGrowth: 2.2,
    effect: (l) =>
      `+${l} posting${l === 1 ? "" : "s"}` + (l >= 2 ? " · surveys every route" : ""),
  },
  {
    id: "training_grounds",
    name: "Training Grounds",
    blurb: "Creatures settle in with their trainer far faster. Parties are always six \u2014 what the Grounds buy is how quickly those six become reliable.",
    maxLevel: 5,
    baseCost: 4000,
    costGrowth: 2.4,
    effect: (l) => `+${Math.round(l * 30)}% bonding speed`,
  },
  {
    id: "medical_center",
    name: "Medical Center",
    blurb: "Creatures recover between waves faster, and their careers last longer.",
    maxLevel: 5,
    baseCost: 3400,
    costGrowth: 2.2,
    effect: (l) => `+${Math.round(l * 22)}% recovery · +${Math.round(l * 10)}% career length`,
  },
  {
    id: "trade_desk",
    name: "Trade Desk",
    blurb: "Better terms at the exchange, so what you give up buys more.",
    maxLevel: 4,
    baseCost: 4600,
    costGrowth: 2.5,
    effect: (l) => `+${Math.round(l * 6)}% trade value`,
  },
  {
    id: "day_care",
    name: "Day-Care",
    blurb: "Houses retired creatures. Breeding arrives with the next expansion.",
    maxLevel: 1,
    baseCost: 7000,
    costGrowth: 1,
    effect: () => "Retirees have somewhere to go",
  },
];

const byId = new Map(FACILITIES.map((f) => [f.id, f]));

export function facilityDef(id: FacilityId): FacilityDef | undefined {
  return byId.get(id);
}
