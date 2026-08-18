/**
 * Print the derived route table.
 *
 * Offer weights are computed from the strength of what each route supplies, so
 * this is the check that adding or repricing species has not quietly made a
 * dangerous route common.
 *
 *   npx tsx scripts/routes-report.ts
 */
import { ROUTES, routePower, offerWeight } from "../src/data/routes.js";

const rows = ROUTES.map((r) => ({
  name: r.name,
  power: routePower(r),
  weight: offerWeight(r),
  unlock: r.unlockAt,
  cost: r.cost,
}));

const total = rows.reduce((a, r) => a + r.weight, 0);

console.log("\n  ROUTE              POWER   WEIGHT   SHARE   UNLOCK   COST");
console.log("  " + "-".repeat(58));
for (const r of [...rows].sort((a, b) => b.weight - a.weight)) {
  console.log(
    `  ${r.name.padEnd(18)} ${r.power.toFixed(1).padStart(5)}   ${r.weight
      .toFixed(2)
      .padStart(6)}  ${((r.weight / total) * 100).toFixed(1).padStart(5)}%   ${String(
      r.unlock,
    ).padStart(6)}  ${String(r.cost).padStart(5)}`,
  );
}
console.log();
