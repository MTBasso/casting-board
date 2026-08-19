import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { en, pt, translate } from "./i18n";

const UI = new URL(".", import.meta.url).pathname;
const COMPONENTS = join(UI, "components");

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

/**
 * The English-string sweep.
 *
 * Sixty user-facing strings were still hardcoded English when the first
 * Portuguese playtest was being prepared — including the two screens a new
 * player sees before anything else. They were invisible because nothing failed:
 * the page rendered, in the wrong language. This is the check that would have
 * caught them.
 *
 * It is deliberately a lint, not a proof. It looks for capitalised prose in JSX
 * text nodes and in the attributes a screen reader or tooltip will read out.
 * DevBar is exempt: it is a developer tool, and no playtester sees it.
 */
describe("no hardcoded English in the interface", () => {
  const EXEMPT = /DevBar\.tsx$/;
  const files = readdirSync(COMPONENTS)
    .filter((f) => f.endsWith(".tsx") && !EXEMPT.test(f))
    .map((f) => join(COMPONENTS, f))
    .concat([join(UI, "App.tsx")]);

  it("has files to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const file of files) {
    it(`${basename(file)} routes its text through t()`, () => {
      const src = readFileSync(file, "utf8");
      const offenders: string[] = [];

      for (const [i, line] of src.split("\n").entries()) {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("import")) {
          continue;
        }
        // Prose sitting directly in a JSX text node.
        for (const m of line.matchAll(/>([^<>{}\n]*[A-Za-z]{3}[^<>{}\n]*)</g)) {
          const text = (m[1] ?? "").trim();
          if (text && /[a-z]{3}/.test(text)) offenders.push(`${i + 1}: ${text}`);
        }
        // Prose in the attributes a user actually reads.
        for (const m of line.matchAll(/\b(title|placeholder|aria-label|alt)="([^"]{3,})"/g)) {
          offenders.push(`${i + 1}: ${m[1]}="${m[2]}"`);
        }
      }

      expect(offenders, offenders.join("\n")).toEqual([]);
    });
  }
});

/**
 * Every key the sim can emit must exist in both dictionaries.
 *
 * The strict `t()` cannot check these: the sim is language-free and hands the
 * screen a `string`. Those call sites used to be written `t(entry.key as never)`
 * — the check switched off at exactly the places a missing translation comes
 * from. `useTk` is now honest about being dynamic, and this is the guarantee
 * that replaces the cast.
 */
describe("keys the sim emits", () => {
  const SIM = join(UI, "..", "sim");
  const DATA = join(UI, "..", "data");

  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sources(path);
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) return [];
      return [readFileSync(path, "utf8")];
    });
  }

  const code = [...sources(SIM), ...sources(DATA)].join("\n");

  /** Key literals, by the shapes the sim actually writes them in. */
  const emitted = new Set<string>();
  for (const re of [
    // log(state, kind, "key.name", …) and note(trip, kind, "key.name", …)
    /\b(?:log|note)\(\s*[^,]+,\s*[^,]+,\s*"([a-z][\w.]*\.[\w.]+)"/g,
    // key: "x", prompt: "x", label: "x", title: "x", detail: "x"
    /\b(?:key|prompt|label|title|detail)\s*:\s*"([a-z][\w.]*\.[\w.]+)"/g,
  ]) {
    for (const m of code.matchAll(re)) emitted.add(m[1] as string);
  }
  // The Desk's `say` helper takes a *stem* and appends both halves itself.
  for (const m of code.matchAll(/\bsay\(\s*[^,]+,\s*[^,]+,\s*"([a-z][\w.]*)"/g)) {
    emitted.add(`${m[1]}.title`);
    emitted.add(`${m[1]}.detail`);
  }

  it("finds keys to check", () => {
    expect(emitted.size).toBeGreaterThan(40);
  });

  it("has an English string for each", () => {
    const missing = [...emitted].filter((k) => !(k in en)).sort();
    expect(missing, `sim emits keys with no English string:\n  ${missing.join("\n  ")}`).toEqual(
      [],
    );
  });

  it("has a Portuguese string for each", () => {
    const missing = [...emitted].filter((k) => !(k in pt)).sort();
    expect(missing, `sim emits keys with no Portuguese string:\n  ${missing.join("\n  ")}`).toEqual(
      [],
    );
  });
});
