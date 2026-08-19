import { describe, expect, it } from "vitest";
import { en, pt, translate } from "./i18n";

/**
 * The translation is hand-maintained, and the ways it breaks are quiet: a hole
 * that never fills, a noun that disagrees with the number beside it. The `Dict`
 * type catches a missing key at compile time; these catch the rest.
 */

const holes = (s: string): Set<string> =>
  new Set(Array.from(s.matchAll(/\{(\w+)(?::[^{}|]*\|[^{}|]*)?\}/g), (m) => m[1] as string));

describe("translation", () => {
  it("agrees the noun with the number, in both languages", () => {
    expect(translate("en", "log.badgesClaimed", { n: 1 })).toBe("1 badge claimed by challengers.");
    expect(translate("en", "log.badgesClaimed", { n: 3 })).toBe("3 badges claimed by challengers.");
    // Zero is plural in both languages — the rule they happen to share.
    expect(translate("en", "log.badgesClaimed", { n: 0 })).toBe("0 badges claimed by challengers.");
  });

  it("agrees gender as well as number in Portuguese", () => {
    expect(translate("pt", "log.badgesClaimed", { n: 1 })).toBe(
      "1 insígnia levada por desafiantes.",
    );
    expect(translate("pt", "log.badgesClaimed", { n: 2 })).toBe(
      "2 insígnias levadas por desafiantes.",
    );
  });

  it("selects on the named parameter, not on whichever number came first", () => {
    expect(translate("en", "desk.openUrgent", { n: 4, u: 1 })).toBe("4 open · 1 urgent");
    expect(translate("pt", "desk.openUrgent", { n: 1, u: 4 })).toBe("1 pendente · 4 urgentes");
  });

  it("leaves a hole alone when nothing was passed for it", () => {
    expect(translate("en", "desk.open", {})).toBe("{n} open");
  });

  it("has no leftover (s) parenthetical plurals", () => {
    for (const [key, text] of Object.entries(pt)) {
      expect(text, key).not.toMatch(/\(s\)|\(es\)|\(a\)|\(as\)/);
    }
  });

  it("gives every Portuguese string the same holes as its English original", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const source = holes(en[key]);
      for (const hole of holes(pt[key])) {
        // A hole the English string never had will never be filled.
        expect(source, `${key}: pt has {${hole}}, en does not`).toContain(hole);
      }
    }
  });

  it("closes every plural group it opens", () => {
    for (const dict of [en, pt]) {
      for (const [key, text] of Object.entries(dict)) {
        // A `{n:one` with no `|many}` renders as literal text, silently.
        expect(text.replace(/\{\w+(?::[^{}|]*\|[^{}|]*)?\}/g, ""), key).not.toMatch(/[{}|]/);
      }
    }
  });
});
