/**
 * Print what the wild encounter rules actually produce.
 *
 *   npx tsx scripts/encounters-report.ts
 */
import { catalog, encounterWeight } from "../src/data/catalog.js";

const all = catalog.all();
const buckets = new Map<string, { n: number; w: number }>();
for (const s of all) {
  const key = s.isStarter
    ? "starter (excluded)"
    : s.isLegendary
      ? "legendary (excluded)"
      : s.stage === 1
        ? s.evolvesTo.length > 0 ? "stage 1, evolves" : "stage 1, standalone"
        : s.stage === 2
          ? s.evolvesTo.length > 0 ? "stage 2, mid-form" : "stage 2, final"
          : "stage 3, final";
  const b = buckets.get(key) ?? { n: 0, w: 0 };
  b.n += 1;
  b.w = encounterWeight(s);
  buckets.set(key, b);
}

console.log("\n  BUCKET                  COUNT   WEIGHT");
console.log("  " + "-".repeat(40));
for (const [k, v] of [...buckets].sort((a, b) => b[1].w - a[1].w)) {
  console.log(`  ${k.padEnd(22)} ${String(v.n).padStart(5)}   ${v.w.toFixed(2)}`);
}

const total = all.reduce((a, s) => a + encounterWeight(s), 0);
const fully = all.filter((s) => s.stage >= 3).reduce((a, s) => a + encounterWeight(s), 0);
console.log(`\n  Findable species: ${all.filter((s) => encounterWeight(s) > 0).length}/${all.length}`);
console.log(`  Chance a wild find is fully evolved: ${((fully / total) * 100).toFixed(1)}%\n`);
