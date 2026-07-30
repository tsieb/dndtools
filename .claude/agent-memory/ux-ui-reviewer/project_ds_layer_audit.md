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

## Token-layer findings (re-verified 2026-07-29 after commit fc40e764)

9. **UNDEFINED TOKEN FAMILY — `--color-visibility-dm` / `--color-visibility-dm-subtle` do not exist**
   anywhere in `styles/`, yet are written at 7 sites in 3 files: `screens/PlayerView.tsx:281,282,285`
   and `:1794,1795,1799`, `screens/Player.tsx:2252,2253`, `screens/Community.tsx:640,641`. Result:
   `background: var(…-subtle)` falls back to transparent AND `1px solid var(…)` is an invalid
   shorthand so the container renders with NO BORDER — on the app's most safety-critical affordance
   (the DM-only purple boundary banner). This is the EXACT bug fc40e764 fixed for
   `--color-status-*-border`; the author missed this second family. The real tokens are
   **`--color-dm-only-badge` / `--color-dm-only-subtle`** (defined in all 4 themes + forced-colors,
   colors.css ~71/126/179/231/393). Fix = rename the 7 sites, or alias under `:root, [data-theme]`.

10. **`POIMarker.jsx:36` `color:'#fff'` is broken in the DEFAULT/dark theme, not parchment.**
    colors.css's own comment (~283) states the `:root` `--layer-*` set is tuned LIGHT (L≈0.65-0.78)
    to read against the candle-lit `--map-canvas-bg`; `[data-theme='parchment']` re-cut them DARK
    (L≈0.45) in fc40e764. POIMarker paints a WHITE glyph on those fills, so in dark/tavern/high-contrast
    5 of 6 categories land ~1.8-2.6:1 (quest→`--layer-political` 0.77, npc→`--layer-player` 0.78,
    note→`--layer-custom` 0.72, location→`--layer-poi` 0.65, treasure→`--color-accent` #e0b06f ≈2:1).
    Only `danger`→`--color-status-error` clears 3:1. Live at `app/MapBuilder.tsx:1019`.
    Fix: `color: 'var(--color-text-inverse)'` — dark ink in dark themes, light ink in parchment,
    i.e. it inverts in exactly the right direction in all 4 themes.

11. **`Button.jsx:60` danger `color:'#fff'` fails WCAG 1.4.3 in 3 of 4 themes** (27 `variant="danger"`
    call sites): `--color-status-error` is `#ef5350` in dark/tavern → 3.47:1, `#ff8080` in
    high-contrast → 2.43:1, `#c0271f` in parchment → passes. Text is semibold `--text-base` (16px),
    NOT large text, so 4.5:1 applies. There is **no on-fill foreground token** to reach for —
    `--color-status-*-text` is tuned for the `-subtle` background, not the fill. Fix needs a new
    per-theme `--color-status-error-foreground` mirroring `--color-accent-foreground`.

12. **`DataTable.jsx:12-13` is a bare `<table width:100%>` with NO `overflowX` wrapper**, and every
    `<td>` defaults to `whiteSpace:'nowrap'` unless a column passes `wrap`. `Settings.tsx:1990`
    ("Active grants") has 6 nowrap columns incl. a Revoke Button and sits directly in a `Panel`
    (`minWidth:0`, no overflow). Overflows at 393px — but ONLY once a grant exists, and the seeded
    vault has zero, so the `/settings` entry in `responsive.spec.ts`'s ROUTES sweep renders the
    single "Nothing here yet." colSpan row and never sees it. DS-level fix (wrap the table) covers
    both consumers (`Characters.tsx:927` is 2-col and safe).

13. **`Chip.jsx` has NO raw `#fff`** — that older backlog line is STALE; Chip is fully tokenized and
    already has `aria-pressed` + Enter/Space + a 24px `onRemove` target. `EmptyState.jsx` is clean
    (`role="status"`, aria-hidden icon, all tokens).

14. **The legacy alias bridge (`colors.css:319-328`: `--bg/--fg/--accent/--muted/--card/--border/
    --danger/--surface-subtle`) is on plain `:root` and WOULD resolve the wrong theme inside the
    nested `data-theme="parchment"` subtrees — but it has ZERO consumers** (grepped `var(--bg)` etc.
    across all css/tsx/jsx: 0 hits). Dead code; do not report as a live theming bug.

## Overlay/feedback primitives — audited 2026-07-30 @ c93c5206 (run #9, FIRST real sweep)

15. **`Tabs` item 3 is now FULLY CLOSED.** `Tabs.jsx` emits `id` + `aria-controls` from `idBase`, and
    `tabPanelProps(idBase, tabId)` (`:18-25`) emits `role=tabpanel` + `aria-labelledby`. **All 7 live
    consumers pass both** (MapEditor, Audio, Extensions, Campaign, Characters, Player, Community) —
    grep-verified. Item 4's radiogroup half is likewise done. Do not re-report either.

16. **`Toast.jsx` — the live region is mounted TOGETHER WITH its content.** `Toast` puts
    `role={status==='error'?'alert':'status'}` on the row itself (`:84`) and `ToastViewport` (`:221-242`)
    is a plain `<div>` with no `aria-live` host. Inserting a polite live region and its text in one
    mutation is unreliably announced by SRs, so every `Toaster.success/info/warning` — the app's ONLY
    confirmation channel, mounted once at `AppShell.tsx:1140` — is silently unannounced. Fix: put a
    permanent `role="status" aria-live="polite"` (+ a `role="alert"` sibling) in `ToastViewport` and
    drop the per-row role. Recurring class in this repo (see [[player-surface-audit]]).

17. **`Toast` auto-dismiss ignores WCAG 2.2.1 (Level A).** `Toaster.show` fires a bare
    `setTimeout(dismiss, duration)` (`:31-34`), default 4500ms / 7000ms for errors, with NO pause on
    hover or focus. **8 call sites put the project's established destructive-op `Undo` inside it**
    (`Atlas.tsx:360`, `Knowledge.tsx:427`, `Settings.tsx:2076`, `Audio.tsx:525`/`:722`,
    `ScenesCreator.tsx:130`, …) and NONE override `duration`. Tab to Undo and the toast vanishes under
    your focus. Fix: pause on `pointerenter`/`focusin` in the viewport; longer floor for `action` toasts.

18. **`Popover.jsx` has no focus restoration and focuses the wrong thing.** `:52-63` pushes focus into
    the panel on open but the cleanup never restores it, so Escape / outside-pointerdown / unmount all
    drop focus to `<body>`. And `:55`'s `querySelector('button, …')` runs in DOM order where the header
    (with the Close button) precedes `children`, so any Popover given `onClose` opens focused on
    **Close**. It also declares `role="dialog"` with no `aria-modal` and no Tab trap. **5 LIVE call
    sites, all map-editor:** `app/map/dock/LayersPanel.tsx:203`, `app/map/ToolOptionsBar.tsx:149`,
    `app/map/MapEditor.tsx:624`, `ds/…/POIPopover.jsx:70`, `ds/…/LayerRow.jsx:229`. Fix = copy
    `Dialog.jsx:69` + `:142-143` (returnFocusRef) and add an `initialFocus` selector prop.

19. **`ds/components/command/CommandPalette.jsx` — no status announcement.** The `{n} results` readout
    (`:572`) and the bespoke "No matches" block (`:337-365`) are plain text; WCAG 4.1.3 wants a live
    region on the app's primary search. (`EmptyState.jsx` already has `role="status"` — this file
    hand-rolls its own instead of reusing it.) Everything else in this file is exemplary: real
    combobox/listbox with `aria-activedescendant`, Tab trapped, body scroll locked, focus restored.

20. **CommandPalette phone sizing mixes `vh` with the dynamic viewport.** `:244` top pad `max(14vh,…)`
    and `:265` panel `maxHeight:'70vh'` sit inside a container whose height is
    `var(--app-viewport-height)` = `100dvh` (`styles/index.css:23`/`:89`). The palette autofocuses its
    input so the phone keyboard is ALWAYS up: 14vh + 70vh keep measuring the full viewport while the
    flex container shrank. Fix: `dvh` / `calc(var(--app-viewport-height) * .7)`.

21. **`Switch.jsx:43` spreads `{...rest}` onto the inner `<button>` AFTER its own `onClick` (`:27`)** —
    the same clobber shape a prior run fixed in `forms/Input.jsx`/`Select.jsx`. LATENT: none of the 17
    `<Switch>` sites passes `onClick`. `Button`/`IconButton` DESTRUCTURE `onClick` so they are safe;
    their `onMouseEnter`/`onMouseLeave` do sit before `{...rest}` but no app caller passes those to a DS
    component (grep-verified) — also latent. Cheap hardening, not a live bug.

22. **`Stepper.jsx:24`** labels are `whiteSpace:'nowrap'` on an `<ol>` with no `flexWrap`/`overflow`;
    "Source › Preview › Result" + three 24px pips + two ≥16px connectors is within a few px of the
    375px phone content box (`ds/…/ImportWizard.jsx:50`, `app/MapBuilder.tsx:1322`). UNVERIFIED at 375px.

23. `Dialog.jsx` is the reference implementation for modal a11y in this repo — focus trap, return
    focus, body scroll lock, `isolateModalSiblings`, `initialFocus`, safe-area padding, Android
    keyboard `scrollIntoView`. Point every overlay fix at it. `Chip.jsx` and `EmptyState.jsx` remain
    clean.

## Dead DS exports — confirmed ZERO consumers (do not spend fix effort here)
- **`core/Breadcrumb.jsx`** — NEW 2026-07-30: zero call sites app-wide. So its ~21px crumb buttons
  (`crumbBase` `padding:'2px var(--space-1)'` at `:58`) are latent.
- **`map/LayerPanel.jsx`** — NEW 2026-07-30: zero call sites. So `:51`'s `<Chip onClick … onRemove>`
  (a real `<button>` nested inside `role="button"` ⇒ axe `nested-interactive`, plus the ✕ and the body
  doing the identical `setFilter(null)`) is latent.
- **`Chip`'s ~22px interactive height** is latent too: there is NO live `<Chip onClick>` call site
  (all 8 grep hits were `Chip.test.tsx` + dead `LayerPanel`). Its `onRemove` target is already 24px.
- **`Tooltip.jsx`** — zero call sites app-wide (only the `ds/index.d.ts:117` barrel line). So the
  unportaled/nowrap/no-flip clipping problem in item 7 above is entirely LATENT. Nothing to fix.
- **`navigation/NavSidebar.jsx` + `NavItem.jsx`** — zero consumers (only `ds/index.d.ts:89,91`).
  `AppShell.tsx` hand-rolls the desktop sidebar, so DS fixes here can never ship.
- **`DataTable` `sortable`** — 2 consumers (Characters, Settings), NEITHER passes `sortable`/`onSort`,
  so the keyboard-dead `<th onClick>` + missing `aria-sort` is latent. LEAVE ALONE. (Its
  overflow problem in item 12 is NOT latent — that one is live.)

See [[gm-react-ds]], [[completion-pass-ux-patterns]], [[onboarding-viewas-cluster]].
