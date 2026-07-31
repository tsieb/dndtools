---
name: ds-layer-audit
description: FIXED-vs-OPEN split for visual/interactive defects in apps/gm-react/src/ds/components/** — dead exports, token traps, e2e label coupling, and what is still broken as of run #15 (2026-07-30 @ 016b696c)
metadata:
  type: project
---

Design-system audit of `apps/gm-react/src/ds/components/**` + `src/ds/index.d.ts`.
NOTE: `screen-kit` lives at **`src/app/screen-kit.tsx`**. `Tooltip` lives at **`overlay/Tooltip.jsx`**
(not `core/`). Global focus ring is in **`styles/tokens/base.css`**.

**How to apply:** these are STRUCTURAL classes; every consuming screen inherits them. Fix once in `ds/`.
Re-verify before reporting — this file has been wrong before.

## LIVE-vs-DEAD map (re-grepped 2026-07-30 @ 016b696c)

**DEAD, zero consumers:** `core/Breadcrumb`, `overlay/Tooltip`, `navigation/NavSidebar`,
`map/LayerPanel`, `map/ToolPalette`, `map/FogControls`, `map/GenerationPanel`, `map/ImportWizard`,
`creature/StatBlock`, `domain/InitiativeRow`, `spell/SpellCard`. Latent: `DataTable.sortable`,
`Chip.onRemove`, `HPBar showText={false}`, `Select invalid`, `Dialog/Sheet dismissible={false}`
(0 live sites — grep confirmed run #15), `Button/IconButton` caller `style.background|color`.
⚠️ **LIVE:** `navigation/NavItem` (NavRail → AppShell), `map/Minimap` (EditorCanvas),
`map/MapCreationForm` (Atlas:581 INLINE), `campaign/QuestCard`/`NpcCard`, `spell/SpellSlots`,
`condition/ConditionTracker`, `system/ProgressMeter`, `core/Stepper`, `data/DataTable`.
Counts: **`IconButton` 71 sites (59 at `size="sm"`)**, `SegmentedControl` 15, `Field` 115,
`Switch` w/ `disabled` 7, interactive `Chip` 7.

## FIXED — do NOT re-report

- **Run #15 verified fixed:** `core/Icon.jsx:324` `'dm-only':'VenetianMask'` (≠ `visibility-players`
  `Eye`) · `overlay/Dialog.jsx:95-100` bodyRef-first + `initialFocus` + `preferred.disabled` guard ·
  `core/Popover.jsx:23-30,105-118` `popoverShiftX` clamp (measured, self-stabilising) ·
  `map/Minimap.jsx:65` `e.detail===0` guard + `onJumpKeyDown` arrow panning ·
  `spell/SpellSlots.jsx:62-79` readOnly renders `role="img"` spans (no native `disabled`), 24px pips ·
  `forms/Slider.jsx:114-121,145-153` steppers soft-disable at the bound + `stepHover` + density-token
  `stepBtn` · `forms/Checkbox.jsx:32` `aria-disabled` · `system/ProgressMeter.jsx:87` `aria-valuetext` ·
  `core/Tabs.jsx:85-92` inactive-tab hover.
- **Run #12–13:** `Input`/`Textarea`/`Select` outline + `composeFocus` · `ToastViewport`
  `aria-atomic=false` + `overflowY:auto` + `data-modal-exempt` · `Slider` 24px thumb · `Sheet` opens on
  BODY · `VisibilityChip` no double-announce · `DefinitionList` `minmax(0,auto) minmax(0,1fr)` ·
  `ConditionTracker` "No conditions" + "Add condition" + density add button · `QuestCard` `aria-pressed`
  + read-only `<li>` · `MapCreationForm` soft submit · `LayerRow` Enter/F2 rename.
- Earlier: `Tabs` `idBase`/`tabPanelProps` · `SegmentedControl` roving tabindex · 24px targets on
  `Checkbox`/`Switch`/`Chip.onRemove` · `DataTable` overflow wrapper · `POIMarker`
  `--color-text-inverse` · `Button` danger foreground · `Avatar` outline ring + `aria-hidden` initials ·
  `Field` auto-htmlFor/aria-required/describedby/role=alert · overlay trap/Escape/focus-return/scroll-lock.
- Clean on structural read: `Card`, `EmptyState`, `Badge`, `LayerTypeBadge`, `StatPill`, `Stat`,
  `SessionTimeline`, `AbilityScore`, `HPBar`, `DiceResult`.

## STILL OPEN (run #15, ranked)

1. **`core/IconButton.jsx:10,35-36`** `width/height` are fixed rem (sm 28 / md 36 / lg 44) and NEVER
   consult `--density-touch-target`; its own docstring admits it. 71 live sites, 59 at `size="sm"`.
   The prepaint locks `data-density='comfortable'` (44px) below 1200px, so on a phone every sibling
   primitive is 44px and IconButton is 28px. Android is masked by
   `html[data-android] button{min-height:48px;min-width:48px}`; plain mobile web is NOT.
   Fix: swap `width/height` → `minWidth/minHeight: max(dim, var(--density-touch-target))`.
2. **Escape cascades through nested overlays.** `Popover.jsx:63-66`, `Sheet.jsx:62-65` and
   `Dialog.jsx:105-108` all attach `keydown` on **`document`** with `capture:true` and call
   `e.stopPropagation()` — which does NOT stop other listeners on the SAME node
   (`stopImmediatePropagation` appears NOWHERE in `src/`). LIVE: `MapEditor.tsx:892` renders
   `<Sheet title="Map panels">` around `dockBody`, whose `LayersPanel.tsx:203` and `LayerRow.jsx:247`
   render `<Popover>`. On a phone, Escape in the opacity/⋯ flyout closes the flyout AND the sheet.
3. **`map/Minimap.jsx:31-57` vs `:89-181`** — the collapsed branch returns a bare `<button>` while the
   expanded branch returns `<div role="group">`. Different element types at the same position ⇒
   pressing "Collapse minimap" DESTROYS the focused button and focus falls to `<body>`.
   Fix: focus the surviving button in a `useLayoutEffect` keyed on `collapsed`.
4. **`forms/Switch.jsx:26` native `disabled`** — the last DS control that hard-disables. 7 live sites,
   5 of them `disabled={busy}` (Atlas:894, Extensions:431, Settings:2393/4077/4206) ⇒ the switch you
   just flipped disables itself under your focus. `Button`/`IconButton` already have the soft
   (`aria-disabled` + swallow `onClick`) pattern; port it.
5. **`overlay/Toast.jsx:346`** `<div role="alert">` has no `aria-atomic="false"`. `role=alert` implies
   atomic ⇒ a second error toast re-reads every visible error toast. Exactly the bug fixed at `:340`
   for the polite region, not applied to the assertive one.
6. **`core/Popover.jsx:77`** its focus SELECTOR is `'button, [href], input, select, textarea, [tabindex]'`
   — it does NOT exclude `[disabled]` or `tabindex="-1"`, unlike `Dialog`/`Sheet`'s shared `FOCUSABLE`.
   LIVE: `LayersPanel.tsx` `MenuItem` uses native `disabled`, so opening the ⋯ menu on the TOP layer
   picks "Move up" (disabled) ⇒ `.focus()` no-ops ⇒ focus never enters the flyout.
7. **`forms/SegmentedControl.jsx:73-93`** the only interactive DS primitive with NO
   `minHeight`/`--density-touch-target`: `padding` + `lineHeight:1` ⇒ sm ≈ 24px, md ≈ 27px on every
   profile. 15 live sites incl. `POIPopover.jsx:158` — the DM only / Players / Shared safety control —
   at `size="sm"` inside a 320px popover.
8. **`forms/Slider.jsx:18` `.dnds-range{height:6px}`** loses to
   `html[data-android] :is(…input…){min-height:48px}` ⇒ under the Android runtime every slider's
   6px track inflates to a 48px full-height two-tone capsule (the `background` gradient paints the
   whole box). Reproducible: `responsive.spec.ts:721` / `android-quick-map.spec.ts:14` set
   `__DNDTOOLS_TEST_RUNTIME_KIND__='android'`. Fix: add `min-height:6px` to `.dnds-range`.
9. **`overlay/Sheet.jsx:219-226`** paints the universal 36×4 drag-to-dismiss grab handle, but the Sheet
   has ZERO pointer handlers — a false affordance on the phone's primary overlay.
10. **`map/LayerRow.jsx:247` + `LayersPanel.tsx:203`** pass no `title` ⇒ `Popover.jsx:144` renders
    `role="dialog"` with NO accessible name (axe `aria-dialog-name`). Safe to name: every spec filters
    `getByRole('dialog', { name: 'Map panels' })`.
11. **`navigation/NavItem.jsx:46`** `aria-hidden={!collapsed}` is spread through `Icon`'s `{...rest}`
    (`Icon.jsx:532`) AFTER `{...a11y}` ⇒ in the collapsed rail the decorative glyph gets an explicit
    `aria-hidden="false"`. Intent inverted.
12. **`condition/ConditionBadge.jsx:72-77`** `level` and `duration` render as bare numbers next to an
    `aria-hidden` hourglass ⇒ "Poisoned 3" / "Exhaustion 4" with no unit. Its `onRemove` (`:85`) also
    has no hover feedback while being the destructive control in the combat tracker.
13. **`forms/Field.jsx:26,47-53`** `error` REPLACES `help` — the format hint vanishes exactly when the
    user is being told the format is wrong. 115 live `<Field>` sites. Render both.
14. **`command/CommandPalette.jsx:314`** inline `outline:'none'` on the `role="combobox"` input — same
    class HEAD fixed in Input/Textarea/Select. Tab is trapped, so Tabbing back to the query field
    shows no ring at all. Also `aria-expanded="true"` is hard-coded even with 0 results.
15. **`overlay/Toast.jsx:314,320`** `pointerEvents:'none'` on the viewport makes the `overflowY:'auto'`
    scroll range unreachable by wheel/touch (focus-scroll only). `Toaster.show` has no stack cap.
16. **`system/Skeleton.jsx:19,24,32`** `aria-hidden` at all three returns, no `label` opt-in.
17. **`feedback/StatusDot.jsx:49`** `if(!label) return dot;` drops `style` + `{...rest}` (6 label-less
    live sites, e.g. `Atlas.tsx:491`). `:42-46` re-emits its `@keyframes <style>` per instance (same in
    Dialog/Sheet/Toast/CommandPalette).
18. **`system/ProgressMeter.jsx:124-139`** `markers` put `title={m.label}` on an `aria-hidden` span ⇒
    threshold bands (encounter difficulty) are position + colour only. `:90` also leaves the
    progressbar unnamed when `label` is not a string.
19. **`navigation/NavItem.jsx:51-53` + `BottomTabBar.jsx:54-68`** badge dot `aria-hidden`, no text
    equivalent (the expanded sidebar DOES announce the count).
20. **`data/DataTable.jsx:16`** the `overflowX:auto` port has no `tabIndex`/name (axe
    `scrollable-region-focusable`). `:23-47` sortable `<th>` has `onClick` but no button/`aria-sort`
    (latent). `:54` hand-rolls "Nothing here yet." instead of `EmptyState`.
21. **`feedback/VisibilityChip.jsx:19`** collapses `shared`→"Players" while `LayerRow.jsx:29-33` and
    `POIPopover.jsx:167` model `shared` as a distinct third state. Product decision.
22. **`overlay/Sheet.jsx:19`** `SIDE_SIZE.bottom='88vh'` in an app that measures with
    `var(--app-viewport-height)`. **`:330`** `justifyContent:'stretch'` is invalid for flex.
23. **`core/Card.jsx:12,44`** `cursor:'pointer'` + hover key off `interactive`, but the a11y role keys
    off `interactive && onClick` ⇒ `interactive` without `onClick` looks clickable and is not.
24. **`core/Tabs.jsx:52`** all live tablists fall back to "Sections" unless the call site names them
    (they can — `{...rest}` at `:62`). **`:80`** natively `disabled` tabs leave the tab order.
25. **`map/POIPopover.jsx:97-107`** Delete is `variant="danger"` with `marginLeft:auto` (phone thumb
    zone) inside a popover, no confirm, no undo. **`:158`** the visibility SegmentedControl is not
    `aria-describedby`-linked to its own "Independent of the layer…" explanation at `:170`.
26. **`map/POIMarker.jsx:40`** hard-coded `rgba(255,255,255,0.7)`; **`Minimap.jsx:176`**
    `boxShadow:'0 0 0 1px rgba(0,0,0,.4)'` (box-shadow is not painted under `forced-colors`).
27. **Hard-coded targets ignoring `--density-touch-target`:** `LayerRow.jsx:319-320` (RowBtn ×5/row),
    `ConditionBadge.jsx:85`, `Toast.jsx:246`, `Dialog.jsx:297`/`Sheet.jsx:286` (Close 30px),
    `Popover.jsx:194` (Close 28px), `Minimap.jsx:138` (24px).
28. **`core/Stepper.jsx:24`** nowrap labels in a non-wrapping `<ol>` (dead-ish: only ImportWizard).
    **`forms/SegmentedControl.jsx:17`** all-disabled ⇒ `tabStopIndex` -1 ⇒ no tab stop.
29. **Unguarded enum maps degrade silently:** `Icon.jsx:530` (`GLYPHS[p] || Square`), `StatusDot.jsx:16`.
    **`Icon.jsx:536`** `{...rest}` after `{...a11y}` (this is what breaks #11).
30. **`navigation/NavItem.jsx:27`** `--density-nav-item-height` is used but NEVER DEFINED (always the
    40px fallback). NavRail overrides inline (`:41 height:44`) so the live rail is fine. Same
    undefined-with-fallback class: `--space-2-5`, `--space-3-5`, `--space-0-5`.
31. **`ds/index.d.ts:7`** every export is `ComponentType<Record<string,unknown>>` ⇒ `idBase`,
    `ariaLabel`, `label` unenforceable, so every regression above can silently reappear.
32. **Systemic latent: `{...rest}` spread AFTER the component's own handlers** — `Button.jsx:117`,
    `IconButton.jsx:51`, `Chip.jsx:50`, `Checkbox.jsx:51`, `Switch.jsx:43`, `Tabs.jsx:62`,
    `NpcCard.jsx:46`, `Slider.jsx:139`. Verified 0 live colliding sites.

## Token / platform landmines (read BEFORE writing any sizing, colour or theme finding)

- **Density is NOT a media query.** `public/prepaint.js` (3rd IIFE) writes `data-density` ONCE at boot
  from `window.innerWidth`: `>=1200` → the user's saved pref, **anything narrower → forced
  `comfortable` (44px)**. So `--density-touch-target` IS 44px on a phone — do not claim otherwise.
  Two consequences: (a) there is no `resize` listener, so a desktop window dragged narrow keeps
  `standard`; (b) `Settings.tsx:347` lets a phone user pick `compact`, which the prepaint silently
  reverts on the next reload (same class as the reduce-motion Switch bug in [[settings-extensions-cluster]]).
- `--density-touch-target` = 2rem standard / **2.75rem comfortable** / 1.75rem compact.
  `--touch-target-floor` = 1.5rem. `html[data-android]` (`styles/index.css:32-90`) overrides ALL the
  density vars to 3rem AND adds `min-height:48px; min-width:48px` to every
  `button, a[href], [role=button|option|menuitem|radio|checkbox|tab|switch], input, select, textarea`.
  `min-*` beats a smaller inline `width`/`height`, so android masks most fixed-size defects — and
  inflates anything that relies on a small `height` (see open #8).
- **`--color-visibility-dm{,-subtle}` are UNDEFINED** yet written at 7 sites in `PlayerView`/`Player`/
  `Community`. Real names: **`--color-dm-only-badge` / `--color-dm-only-subtle`** (the ds is correct).
- Sweep: `grep -rhoE "var\(--[a-z0-9-]+" src/ds/components | sed 's/var(//' | sort -u` vs
  `grep -rhoE "^\s*--[a-z0-9-]+\s*:" src/styles/`. Only 3 undefined in `ds/`, all with fallbacks.
- `:root` `--layer-*` are LIGHT; only `[data-theme='parchment']` re-cuts them DARK. Under
  `forced-colors` all 13 flatten. `--layer-terrain` IS declared (colors.css).
- `--color-interactive-selected` (~1.4:1) is a SELECTION wash, NOT a focus colour — there is a TEST
  saying so (`ds-interaction-fixes.test.tsx`). The ring is `--focus-ring-{width,offset,color}` applied
  globally by `styles/tokens/base.css`. Any inline `outline:'none'` defeats it.
- **`box-shadow` is NOT painted under `forced-colors: active`; `outline` and `border` are.**
- **NO global `button:hover`** — every inline-styled `<button>` needs explicit `onMouseEnter/Leave`.
- `[data-motion]` in `styles/index.css` globally zeroes animation ⇒ per-component
  `prefers-reduced-motion` is genuinely unneeded. z-index IS fully tokenized.
- `isolateModalSiblings` inerts everything outside an open overlay; `data-modal-exempt` is the opt-out
  (only `ToastViewport` uses it).

## e2e coupling (re-grepped 2026-07-30 — SAFE = no spec references the label)

**SAFE to change:** `'Collapse minimap'` / `'Expand minimap'` / `'Jump viewport'` (NO spec at all;
`Minimap.test.tsx` matches `^Jump viewport` and never presses Enter) · `'Create map'` ·
`'Add condition'` · `getByRole('tablist')` / `'Sections'` · `'Steps'` · `'Level n slot n'` ·
`role('progressbar')` · `'Dismiss'` · Skeleton · every ICON GLYPH (no spec asserts a glyph) ·
adding an accessible NAME to the LayerRow / LayersPanel popovers (every spec filters
`getByRole('dialog', { name: 'Map panels' })`).

**LOCKED — a rename breaks a spec:**
- `android-quick-map.spec.ts:291,298,299` pins `'Visibility: dm-only'`/`'…players'`/`'…shared'`,
  `map-editor.spec.ts:521` pins `/^Visibility:/` ⇒ `LayerRow.jsx:142` cannot be humanised alone.
- `android-quick-map.spec.ts:277-284` `'Base: DM display on/off'` (LayerRow `:132`).
- `android-quick-map.spec.ts:185-233` `'Point of interest'`, `'POI: New POI'`.
- `map-editor.spec.ts:506-509` dblclicks the layer name button (`exact:true`).
- `campaign.spec.ts:119` clicks the QuestCard objective button.
- `command-palette.spec.ts:88-118` `getByRole('option')` names.
- `map-editor.spec.ts:168,685,877` + `responsive.spec.ts:835` `getByRole('dialog', {name:'Map panels'})`.
- `upgrade.spec.ts:49` / `atlas.spec.ts:39` `getByRole('switch', {name})` — a Switch soft-disable may
  change what Playwright's `toBeDisabled()` reports; check before landing #4.
- `'Close'` as an a11y name: `android-quick-map.spec.ts:121,171,196,306`, `responsive.spec.ts:844`,
  `map-editor.spec.ts:686,878`, `knowledge.spec.ts:379`, `canvas.spec.ts:366,449,779`.
- `onboarding-consent.spec.ts` / `settings.spec.ts` radiogroup names.

**Gates that would catch a sizing regression:** `responsive.spec.ts:785` enforces `>=47.5px` on
`#main-content, header, nav[aria-label="Primary"]` controls — but ONLY inside the Android test
(`__DNDTOOLS_TEST_RUNTIME_KIND__='android'`, 360×640). Plain `mobile-chromium` has NO size gate, only
`clippedControls` (X/Y clipping) and `expectNoHorizontalOverflow`.
`a11y-axe-gate.spec.ts` sweeps 17 routes but only each route's DEFAULT tab.

See [[gm-react-ds]], [[completion-pass-ux-patterns]], [[onboarding-viewas-cluster]].
