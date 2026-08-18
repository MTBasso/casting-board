/**
 * Design analysis: can a type-locked gym actually answer the threat meta?
 *
 *   npx tsx scripts/analysis.ts
 */
import { catalog, encounterWeight } from "../src/data/catalog.js";
import { effectivenessAgainst } from "../src/data/typechart.js";
import { TYPES, type TypeId } from "../src/sim/types.js";

console.log("\n  Can a gym respond to its threat meta?\n");
console.log("  GYM TYPE    FINDABLE  DUAL  BEST ANSWER TO ITS WORST MATCHUP");
console.log("  " + "-".repeat(66));

const rows: { type: TypeId; findable: number; dual: number; spread: number; note: string }[] = [];

for (const gymType of TYPES) {
  const roster = catalog.wildByType(gymType).filter((s) => encounterWeight(s) > 0);
  if (roster.length === 0) continue;

  const dual = roster.filter((s) => s.types.length > 1).length;

  // The attacking type this gym most fears.
  let worst: TypeId = "normal";
  let worstMult = 0;
  for (const atk of TYPES) {
    const m = effectivenessAgainst(atk, [gymType]);
    if (m > worstMult) { worstMult = m; worst = atk; }
  }

  // How much the roster's own typing can vary that matchup.
  const mults = roster.map((s) => effectivenessAgainst(worst, s.types));
  const best = Math.min(...mults);
  const typical = effectivenessAgainst(worst, [gymType]);
  const spread = typical / best;

  rows.push({
    type: gymType,
    findable: roster.length,
    dual,
    spread,
    note:
      spread >= 2
        ? `vs ${worst}: can halve it or better`
        : spread > 1
          ? `vs ${worst}: marginal (${spread.toFixed(2)}x)`
          : `vs ${worst}: NOTHING helps`,
  });
}

for (const r of rows.sort((a, b) => a.spread - b.spread)) {
  console.log(
    `  ${r.type.padEnd(11)} ${String(r.findable).padStart(6)}  ${String(r.dual).padStart(4)}  ${r.note}`,
  );
}

const stuck = rows.filter((r) => r.spread <= 1);
console.log(
  `\n  ${stuck.length}/${rows.length} gym types have no roster answer to their worst matchup.`,
);
console.log(`  Stuck: ${stuck.map((r) => r.type).join(", ")}\n`);
