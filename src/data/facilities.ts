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
  maxLevel: number;
  baseCost: number;
  costGrowth: number;
  /**
   * What this level buys, as a key and its numbers.
   *
   * Keys rather than sentences, like everything else the sim hands the screen:
   * the level is the only thing the data knows, and the wording is the
   * dictionary's problem in whichever language is on.
   */
  effect: (level: number) => { key: string; params?: Record<string, string | number> };
}

export const FACILITIES: readonly FacilityDef[] = [
  {
    id: "scouting_office",
    maxLevel: 5,
    baseCost: 3200,
    costGrowth: 2.2,
    effect: (l) => ({
      key: l >= 2 ? "facility.scouting_office.effect2" : "facility.scouting_office.effect",
      params: { n: l },
    }),
  },
  {
    id: "training_grounds",
    maxLevel: 5,
    baseCost: 4000,
    costGrowth: 2.4,
    effect: (l) => ({ key: "facility.training_grounds.effect", params: { n: Math.round(l * 30) } }),
  },
  {
    id: "medical_center",
    maxLevel: 5,
    baseCost: 3400,
    costGrowth: 2.2,
    effect: (l) => ({
      key: "facility.medical_center.effect",
      params: { n: Math.round(l * 22), c: Math.round(l * 10) },
    }),
  },
  {
    id: "trade_desk",
    maxLevel: 4,
    baseCost: 4600,
    costGrowth: 2.5,
    effect: (l) => ({ key: "facility.trade_desk.effect", params: { n: Math.round(l * 6) } }),
  },
  {
    id: "day_care",
    maxLevel: 1,
    baseCost: 7000,
    costGrowth: 1,
    effect: () => ({ key: "facility.day_care.effect" }),
  },
];

const byId = new Map(FACILITIES.map((f) => [f.id, f]));

export function facilityDef(id: FacilityId): FacilityDef | undefined {
  return byId.get(id);
}
