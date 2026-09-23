# UI plan — Terminal Cards design system

**From:** [docs/reviews/terminal-cards-design-system-2026-09-23.html](../reviews/terminal-cards-design-system-2026-09-23.html)

## What and why

`/judge-ui` reviewed the Terminal Cards reference doc (`project/Main.dc.html`
in the judged artifact) against its live source, `src/ui/season/season.css`,
and the six screens shipping it. Five findings survived: contrast, focus,
touch target, missing states, and doc drift from the CSS it claims to mirror
verbatim. This plan turns the picked options into concrete edits.

## Decisions

| Finding | Pick | Answer |
|---|---|---|
| F1 — dim text contrast | b · lighten the token | `--sn-text-dim` becomes `#88919c` (5.79:1 on `--sn-panel-2`, 6.06:1 on `--sn-bg`) |
| F2 — no focus style | b · one focus rule, reused | `:focus-visible { outline: 2px solid var(--sn-accent); outline-offset: 2px; }` scoped to `.sn-btn, .sn-card, .sn-bench-card` |
| F3 — button tap target | b · raise the floor | `min-height: 44px` on `.sn-btn`; confirmed no crowding (`ShopScreen.tsx`'s `DoctrineCard` has one button per card, plenty of headroom) |
| F4 — no empty/loading/error states | c · full state set in doc | New "08 — States" section: `.sn-empty` (reuses `.sn-slot`'s dashed-box language), an error pattern, **and** a loading pattern — user chose to include loading despite it having no current trigger in the pure, synchronous sim (`src/sim` never awaits); documented as forward-looking, not yet wired to any screen |
| F5 — doc missing `.sn-matchup` | c · audit for other gaps | Full diff of `season.css` classes vs. the doc; add `.sn-matchup` (the composed VS grid), `.sn-bench-list`, and the `img` fit rules (`.sn-portrait img`, `.sn-slot img`, `.sn-bench-portrait img`) that were the other misses found in the audit |

## Status

Not started.

## Steps

1. **Token + focus + button fixes** — `feat/terminal-cards-contrast-focus-target`
   - Change `--sn-text-dim` to `#88919c` in `src/ui/season/season.css`.
   - Add the single `:focus-visible` rule scoped to `.sn-btn, .sn-card, .sn-bench-card`.
   - Add `min-height: 44px` to `.sn-btn`.
   - **Done when:** matches F1b/F2b/F3b in `docs/reviews/terminal-cards-design-system-2026-09-23.html`; `npm test` and `npx tsc --noEmit` pass; a manual check in the running app (`npm run dev`, Draft/Ante/Shop screens) shows no layout crowding from the taller buttons.
   - **Checked by:** `npm test`, `npx tsc --noEmit`, visual pass in dev.

2. **States section (empty / error / loading)** — `feat/terminal-cards-states`
   - Add `.sn-empty` to `season.css`, reusing `.sn-slot`'s dashed border/dim label language.
   - Add an error pattern (color: `--sn-danger`, same card shell as `.sn-log`).
   - Add a loading pattern (documented only — no screen wires it yet).
   - Add "08 — States" to the reference doc (`project/Main.dc.html` in the artifact, or its repo equivalent once one exists) showing all three, with a note that loading has no current call site.
   - **Done when:** matches F4c in the review page; new classes exist in `season.css` with no unused-selector lint warning if one is configured.
   - **Checked by:** visual pass of the doc/reference page; `npx tsc --noEmit`.

3. **Doc audit for drift** — `feat/terminal-cards-doc-audit`
   - Diff every `.sn-*` selector in `season.css` against the reference doc's sections.
   - Add the composed `.sn-matchup` example (two `.sn-fighter` panels + `.sn-vs`, matching what `AnteScreen.tsx` ships).
   - Add `.sn-bench-list` and the `img` fit rules to whichever section they belong under.
   - **Done when:** matches F5c; no `.sn-*` class in `season.css` is absent from the doc, verified by re-running the same `grep -n "^\.sn-"` audit used in the review.
   - **Checked by:** the grep audit above, run again with zero misses.

## Memory

No memory pointer needed — this is a bounded doc/CSS cleanup, not an ongoing decision worth tracking in [[casting-board-figma-progress]] or elsewhere.
