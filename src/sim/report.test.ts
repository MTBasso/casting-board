import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { newReport } from "./report.js";

const SIM = new URL(".", import.meta.url).pathname;

function simSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return simSources(path);
    if (!entry.name.endsWith(".ts")) return [];
    if (entry.name.endsWith(".test.ts") || entry.name === "report.ts") return [];
    return [path];
  });
}

/**
 * The guarantee the struct never offered.
 *
 * `TickReport` used to be a mutable bag every system reached into, and nothing
 * connected declaring a field to filling one. Three shipped
 * declared-but-never-written — two of them *read*, so they reported zero for
 * months while every test stayed green, and one of those silently dead-ended
 * the objective spine at its third step.
 *
 * A verb nobody calls is the same bug wearing a method's clothes, so this is
 * the check that has to exist alongside the seam.
 */
describe("the tick report", () => {
  const sources = simSources(SIM).map((p) => readFileSync(p, "utf8"));
  const everything = sources.join("\n");

  const verbs = Object.getOwnPropertyNames(Object.getPrototypeOf(newReport())).filter(
    (name) => name !== "constructor" && name !== "done",
  );

  it("has verbs to check", () => {
    expect(verbs.length).toBeGreaterThan(12);
  });

  for (const verb of verbs) {
    it(`something records ${verb}()`, () => {
      // A field can only be filled through its verb, so a verb with no caller
      // is a field that can only ever read zero.
      expect(everything, `nothing calls report.${verb}()`).toContain(`.${verb}(`);
    });
  }

  it("fills every field it declares", () => {
    // The other direction: a field the builder never touches would sit at its
    // initial value forever no matter how many verbs exist.
    const builder = readFileSync(join(SIM, "report.ts"), "utf8");
    const declared = builder
      .slice(builder.indexOf("private readonly out"), builder.indexOf("// -- Challenges"))
      .matchAll(/^\s{4}(\w+):/gm);

    for (const [, field] of declared) {
      expect(builder, `report.ts declares ${field} but never writes it`).toMatch(
        new RegExp(`this\\.out\\.${field}\\b\\s*(\\+?=|\\.push)`),
      );
    }
  });

  it("records a challenge as resolved whether it was held or lost", () => {
    // The invariant that used to live in whoever remembered it: every call site
    // incremented resolved *and* the outcome, and forgetting one would have
    // been a silent miscount rather than an error.
    const held = newReport();
    held.challenge(true, 100);
    expect(held.done()).toMatchObject({ wavesResolved: 1, wavesWon: 1, badgesLost: 0, earned: 100 });

    const lost = newReport();
    lost.challenge(false, 40);
    expect(lost.done()).toMatchObject({ wavesResolved: 1, wavesWon: 0, badgesLost: 1, earned: 40 });

    const span = newReport();
    span.challenges(10, 7, 500);
    expect(span.done()).toMatchObject({ wavesResolved: 10, wavesWon: 7, badgesLost: 3 });
  });
});
