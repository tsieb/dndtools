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

1. **Two independent `role="radiogroup"` implementations — FIXED 2026-07-29 (commit 5274a5f9).**
   `Seg` (`src/app/screen-kit.tsx`) and `SegmentedControl` (`ds/components/forms/SegmentedControl.jsx`)
   both now implement roving `tabIndex` + Arrow/Home/End, ported from `Tabs`' `moveFocus`. Verified
   in code 2026-07-29. Two hand-rolled segmented controls still coexist (DRY note only, not an a11y bug).

2. **`Seg`'s `ariaLabel` prop is still OPTIONAL in its TS signature**, but as of 2026-07-29 all 14 live
   call sites (grepped repo-wide) DO pass it — no unnamed radiogroup currently ships. Low-priority type
   hardening only; do not report as a live defect unless a new call site regresses it.

3. **`Tabs` STILL has no `aria-controls`/tab `id`s, and there is STILL ZERO `role="tabpanel"` in the
   whole app — confirmed unchanged 2026-07-29,** explicitly left as deferred by commit 5274a5f9's own
   message. Read `ds/components/core/Tabs.jsx` top to bottom: `tabs.map` renders each `<button
   role="tab">` with no `id` and no `aria-controls`; the parent conditionally renders a bare `<div>`
   per active tab with no `role="tabpanel"` pairing. Live call sites (grep `<Tabs` — 7 files):
   `app/map/MapEditor.tsx:431` (dock switcher — Selected/Layers/Assets/History,
   `editor.dock`/`editor.setDock`) plus `screens/{Community,Campaign,Audio,Extensions,Player,
   Characters}.tsx`. Minimal fix: in `Tabs.jsx`, derive `const baseId = React.useId()` (or accept an
   `id` prop), emit `id={`${baseId}-tab-${id}`}` + `aria-controls={`${baseId}-panel-${id}`}` on each
   tab button, and export a small `TabPanel({ id, activeId, baseId, children })` that renders
   `role="tabpanel" id={`${baseId}-panel-${id}`} aria-labelledby={`${baseId}-tab-${id}`}` only when
   `id === activeId` — then swap each consumer's bare conditional `<div>` for it.

4. **Sub-24px interactive targets — PARTIALLY FIXED 2026-07-29.** `Switch`/`Chip`'s `onRemove` now
   clear the WCAG 2.5.8 24px floor (commit 5274a5f9). **STILL OPEN, confirmed in code 2026-07-29:**
   `ds/components/forms/Checkbox.jsx:23-24` — the `role="checkbox"` box is a fixed `width:18,
   height:18`; `ds/components/spell/SpellSlots.jsx:33-34` — each slot pip `<button>` is
   `width:16, height:16` with `padding:0`, laid out `gap:'var(--space-1)'` apart (adjacent tiny
   targets compound the problem — mis-taps land on the neighboring slot). `Button`/`Tabs` correctly
   use `minHeight: var(--density-touch-target)` — that token is the established fix; Slider's own
   `stepBtn` helper already migrated to it as a good reference implementation.

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
