---
name: ds-layer-audit
description: Structural a11y/visual defects in the gm-react ds/components layer (radiogroup pattern, tablist/tabpanel wiring, sub-24px targets, unguarded enum maps) and how to re-check them
metadata:
  type: project
---

Design-system-layer audit of `apps/gm-react/src/ds/components/**` + `src/app/screen-kit.tsx`
(2026-07-29). NOTE: screen-kit lives at **`src/app/screen-kit.tsx`**, not `src/screens/` — earlier
task briefs cite the wrong path.

**How to apply:** these are STRUCTURAL classes in the DS layer, so every consuming screen inherits
them. Re-check them component-first (fix once in `ds/`, not per-screen).

1. **Two independent `role="radiogroup"` implementations, both incomplete.** `Seg`
   (`src/app/screen-kit.tsx`) and `SegmentedControl` (`ds/components/forms/SegmentedControl.jsx`)
   both render `role="radiogroup"` + `role="radio"` `<button>`s with **no roving `tabIndex` and no
   arrow-key handler** — so every option is a tab stop and arrows do nothing (ARIA radiogroup
   pattern / WCAG 2.1.1). `Tabs` (`ds/components/core/Tabs.jsx`) DOES implement roving tabIndex +
   Arrow/Home/End correctly — **copy Tabs' `moveFocus` into both**. Two hand-rolled segmented
   controls coexisting is itself the root problem; `Seg` should collapse into `SegmentedControl`.

2. **`Seg` takes an OPTIONAL `ariaLabel`, so unnamed radiogroups keep reappearing.** Most call sites
   pass it; the ones that don't ship an unnamed group. Make it required (or derive a fallback) rather
   than fixing call sites one at a time — this has now regressed twice.

3. **`Tabs` has no `aria-controls` and generates no tab `id`s, and there is ZERO `role="tabpanel"`
   in the whole app.** Every `<Tabs>` consumer (Audio/Community/Extensions/Campaign/Characters/
   Player/MapEditor) renders its body as a bare conditional `<div>`. Fix in `Tabs` (emit
   `id`/`aria-controls` + export a `TabPanel`), then wire consumers. Grep `role="tabpanel"` to check.

4. **Sub-24px interactive targets are systemic (WCAG 2.5.8).** `Switch` track 38x22, `Checkbox` box
   18x18, `SpellSlots` pips 16x16, `Chip`'s `onRemove` button (12px icon, `padding:0`). `Button`/
   `Tabs` correctly use `minHeight: var(--density-touch-target)` — that token is the established fix.

5. **Unguarded enum-map lookups silently degrade to a wrong-but-plausible default.** Pattern:
   `const MAP={...}; const c = MAP[prop] || MAP.<default>`. `StatusDot`'s map has `warning`, and a
   caller passing `'warn'` falls through to `idle` (gray) — a lost warning signal with no type error.
   Aggravated by call sites writing `status={SOME_TONE[x] as 'neutral'}` casts, which defeat TS.
   When auditing, grep expression-form props (`status={...ternary...}`), not just string literals —
   literal-only greps miss these.

6. **`role`-less clickable containers:** `Minimap.jsx` viewport-jump surface and `Chip`'s optional
   `onClick` are bare `<div>`/`<span>` + `cursor:pointer`; `DataTable`'s sortable `<th onClick>` also
   lacks keyboard access AND `aria-sort` (currently dead code — no call site passes `sortable`).

7. **`Tooltip` is `position:absolute`, not portaled,** with `whiteSpace:'nowrap'` and a fixed 4-way
   `POS` map and no flip/clamp — it clips inside any `overflow:hidden` ancestor (Card, Minimap,
   Dialog scroll body) and overflows the viewport on edge-of-toolbar triggers.

8. **z-index IS fully tokenized** (`--z-base`…`--z-dm-boundary` in `styles/tokens/spacing.css`) and
   every overlay component uses a token — do not report raw z-index here. Likewise `[data-motion]`
   in `styles/index.css` globally zeroes animation, so per-component `prefers-reduced-motion`
   queries are genuinely unnecessary (StatusDot's inline `dndPulse` is covered).

Raw-hex violations are rare and worth naming individually: `Button.jsx` danger `color:'#fff'`,
`POIMarker.jsx` `color:'#fff'` over category colors (incl. gold `--color-accent` for `treasure`).
See [[gm-react-ds]] and [[completion-pass-ux-patterns]].
