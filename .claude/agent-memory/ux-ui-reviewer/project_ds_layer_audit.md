---
name: ds-layer-audit
description: FIXED-vs-OPEN split for visual/interactive defects in apps/gm-react/src/ds/components/** — dead exports, token traps, e2e label coupling, and what is still broken as of run #16 (2026-07-30 @ 33651613)
metadata:
  type: project
---

Design-system audit of `apps/gm-react/src/ds/components/**` + `src/ds/index.d.ts`.
NOTE: `screen-kit` lives at **`src/app/screen-kit.tsx`**. `Tooltip` lives at **`overlay/Tooltip.jsx`**
(not `core/`). Global focus ring is in **`styles/tokens/base.css`**.

**How to apply:** these are STRUCTURAL classes; every consuming screen inherits them. Fix once in `ds/`.
Re-verify before reporting — this file has been wrong before.

## LIVE call-site counts (re-grepped 2026-07-30 @ 33651613, `grep -rn "<X" src --include=*.tsx --include=*.jsx | grep -v /ds/`)

`Field` **133** · `IconButton` **76** (59 at `size="sm"`) · `Dialog` 41 · `EmptyState` 34 · `Card` 30 ·
`Chip` 23 · `SegmentedControl` 22 · `Skeleton` 22 · `Switch` 17 · `Tabs` 13 · `Popover` 11 ·
`Minimap` 11 · `ConditionBadge` 9 · `Sheet` 9 · `ProgressMeter` 5 · `SpellSlots` 5 · `DataTable` 4.

**DEAD, zero consumers:** `core/Breadcrumb`, `overlay/Tooltip`, `navigation/NavSidebar`,
`map/LayerPanel`, `map/ToolPalette`, `map/FogControls`, `map/GenerationPanel`, `map/ImportWizard`,
`creature/StatBlock`, `domain/InitiativeRow`, `spell/SpellCard`.
**Latent props (0 live sites — verified run #16):** `Card interactive`, `Chip onClick`,
`Chip onRemove`, `Checkbox disabled`, `Sheet footer`, `DataTable sortable`, `Select invalid`,
`HPBar showText={false}`, `Dialog/Sheet dismissible={false}`.

## FIXED — do NOT re-report

- **Run #16 verified fixed:** Escape no longer cascades (`platform/escapeLayers.ts`, DOM-containment,
  used by `Dialog:105`/`Sheet:63`/`Popover:60`) · `Field.jsx:75-93` error AND help both render, both
  described, error id first · `Toast.jsx:349` assertive region `aria-atomic="false"` ·
  `Popover.jsx:85-86` strict FOCUSABLE (`:not([disabled])`) + `:101-107` focus restore ·
  `Minimap.jsx:29-42` `toggleRef` + `useLayoutEffect`-ish focus hand-off across the element-type swap ·
  `NavItem.jsx:74` `label={null}`, no more inverted `aria-hidden` · `LayerRow.jsx:254` +
  `LayersPanel.tsx:207` popovers now carry `aria-label` · `Button`/`IconButton` soft-disable +
  `outline`-variant hover · `Input`/`Textarea`/`Select` `composeFocus` + no inline `outline:none` ·
  `Slider` stepper soft-disable/`stepHover`/density `stepBtn` · `Icon.jsx` `dm-only`→`VenetianMask` ·
  `SpellSlots` readOnly `role="img"` pips · `Checkbox` `aria-disabled` · `ProgressMeter aria-valuetext` ·
  `Tabs` inactive-tab hover · `ToastViewport` `data-modal-exempt` + `overflowY:auto`.
- Earlier: `Tabs idBase`/`tabPanelProps` · `SegmentedControl` roving tabindex · `DataTable` overflow
  wrapper · `POIMarker --color-text-inverse` · `Button` danger foreground · `Avatar` ring ·
  `VisibilityChip` no double-announce · `MapCreationForm` soft submit · `ConditionTracker` empty line +
  density add button · `LayerRow` Enter/F2 rename · `DefinitionList minmax(0,…)` · overlay
  trap/focus-return/scroll-lock.
- Clean on structural read: `Card`, `Badge`, `LayerTypeBadge`, `StatPill`, `Stat`, `SessionTimeline`,
  `AbilityScore`, `HPBar`, `DiceResult`, `EmptyState` (modulo its `role="status"`).

## STILL OPEN (run #16, ranked)

1. **BLOCKER `core/Popover.jsx:57-58,72` — a toggle trigger can never close its own popover.**
   `onDown` (document `pointerdown`, capture) fires `onClose` for ANY target outside the panel,
   INCLUDING the button that opened it. React flushes the close, then the button's `click` re-opens.
   4 live toggle sites: `LayerRow.jsx:229`, `LayersPanel.tsx:203` (`onAction`), `ToolOptionsBar.tsx:130`,
   `MapEditor.tsx:657`. `aria-expanded` also sticks `true`. Fix: `triggerRef` prop, skip when
   `triggerRef.current?.contains(e.target)`. NO spec clicks a trigger twice (verified).
2. **`overlay/Sheet.jsx:20,149-150` bottom sheets are a FIXED `height:'88vh'`, not a max.**
   `AppShell.tsx:956` "Table controls" = 4 compact buttons rendered as an 88%-screen slab. Also `vh`
   ≠ the app's own `--app-viewport-height` (`100dvh`, and `100dvh - titlebar` under Electron).
   Fix: `height:'auto'` + `maxHeight: calc(var(--app-viewport-height) * .88)`.
3. **`core/IconButton.jsx:10,35-36`** fixed rem `width/height` (sm 28 / md 36 / lg 44), never consults
   `--density-touch-target`. **76 live sites, 59 at `size="sm"`.** Android masks it
   (`min-height:48px`); plain mobile web does not. Fix → `minWidth/minHeight: max(dim, var(--density-touch-target))`.
4. **`forms/Field.jsx:13-21,34-40,66` mis-associates when the child is a LAYOUT WRAPPER.**
   `onlyChild` is any valid element, so a `<div>` of two Inputs gets `id`, `aria-required`,
   `aria-invalid`, `aria-describedby` cloned onto it and `<label for>` points at a `<div>`.
   Live: `MapCreationForm.jsx:93-112` ("Scale"). 133 Field sites ⇒ live trap. Also
   `aria-required` on a generic div = axe `aria-allowed-attr`.
5. **`forms/Switch.jsx:26` native `disabled`** — the last DS control that hard-disables. 17 live sites,
   5 gate on `busy` ⇒ the switch disables itself under your focus. Port Button's soft pattern.
   ⚠️ `upgrade.spec.ts:49` / `atlas.spec.ts:39` use `getByRole('switch')` + `toBeDisabled()`.
6. **`forms/SegmentedControl.jsx:73-93`** the only interactive DS primitive with NO `minHeight`:
   `padding` + `lineHeight:1` ⇒ sm ≈ 24px, md ≈ 27px on every profile. 22 live sites incl.
   `POIPopover.jsx:158`, the DM only / Players / Shared safety control at `size="sm"`.
7. **`forms/Slider.jsx:18` `.dnds-range{height:6px}`** loses to `html[data-android] input{min-height:48px}`
   ⇒ under the Android runtime every slider inflates into a 48px two-tone capsule (the `background`
   gradient paints the whole box). Fix: `min-height:6px`. Repro: `android-quick-map.spec.ts:14`.
8. **`system/ProgressMeter.jsx:84,124-139`** `aria-valuenow={value}` is NOT clamped (the fill at `:31`
   is) ⇒ an over-budget encounter announces 150/100. And `role="progressbar"` has PRESENTATIONAL
   CHILDREN (ARIA 1.2) so the markers' `title` can never be exposed — difficulty bands are
   position+colour only (WCAG 1.4.1). 5 live sites.
9. **`system/Skeleton.jsx:19,24,32`** `aria-hidden` at all three returns, no `label` opt-in ⇒ **22 live
   loading placeholders are completely silent to AT** (no "Loading…").
10. **`command/CommandPalette.jsx:314`** inline `outline:'none'` on the `role="combobox"` input — the
    palette's ONLY focusable control has no ring. **`:304`** `aria-expanded="true"` hard-coded.
    **`:337-365`** with 0 results the `role="listbox"` owns a bare `<div>` (axe `aria-required-children`).
    **`:265`** `maxHeight:'70vh'` not `--app-viewport-height`.
11. **`overlay/Toast.jsx:314,320`** `pointerEvents:'none'` makes the `overflowY:'auto'` stack scroll
    range unreachable by wheel/touch. `Toaster.show` has no cap; re-showing an existing `id`
    (`:65`) removes+re-appends, so an updated toast JUMPS to the end of the stack. `:210` the action
    button (the Undo affordance, 8 sites) has no distinguishing `aria-label` and no density target.
12. **`core/Tabs.jsx:116-117`** `marginBottom:'-1px'` + container `borderBottom` + `flexWrap:'wrap'`
    ⇒ when 13 live tablists wrap to two rows on a phone the active gold underline is drawn mid-control,
    not on the bottom rule. **`:80`** natively `disabled` tabs leave the tab order (ARIA wants `aria-disabled`).
13. **`data/DataTable.jsx:16`** the `overflowX:auto` port has no `tabIndex`/`role`/name
    (axe `scrollable-region-focusable`); 4 live sites. `:54` hand-rolls "Nothing here yet." not `EmptyState`.
14. **`condition/ConditionBadge.jsx:65`** `whiteSpace:'nowrap'` with no `maxWidth`, and
    `ConditionTracker.jsx:50` passes an arbitrary homebrew key as `label` ⇒ a long custom condition
    overflows its row instead of ellipsing. **`:72-77`** `level`/`duration` announce as bare numbers
    ("Poisoned 3"). **`:78-89`** `onRemove` — the combat tracker's destructive control — has NO hover.
15. **`map/Minimap.jsx:56-57,153-154`** 36×36 and 24×24 hard-coded targets in a floating map overlay.
    **`:191`** `boxShadow:'0 0 0 1px rgba(0,0,0,.4)'` is not painted under `forced-colors`.
16. **`core/Popover.jsx:164`** `overflow:'hidden'`, no `maxHeight`, no scrollable body and NO vertical
    viewport clamp (`popoverShiftX` is X-only). Vertical fit is delegated to the caller —
    `MapBuilder.tsx:1058` does a coarse `v.y < 0.42 ? 'bottom' : 'top'` flip that ignores panel height.
17. **`feedback/StatusDot.jsx:49`** `if(!label) return dot;` drops `style` + `{...rest}` — verified
    LATENT: all 12 live label-less sites pass neither. `:42-46` re-emits `@keyframes` per instance
    (same in Dialog/Sheet/Toast/CommandPalette/Slider).
18. **`navigation/NavItem.jsx:97-111` + `BottomTabBar.jsx:54-68`** the "session is live" badge dot is
    `aria-hidden` with no text equivalent in BOTH collapsed navs (the expanded sidebar does announce it).
    `NavItem:101` also relies on the CALLER for `position:relative` (`NavRail.jsx:41` supplies it).
19. **`overlay/Sheet.jsx:216-235`** 36×4 drag-to-dismiss grab handle with ZERO pointer handlers — a
    false affordance on the phone's primary overlay. **`:138`/`:337`** `justifyContent:'stretch'` is
    invalid for flex (falls back to `flex-start`); the footer case is LATENT (0 live `Sheet footer`).
20. **`system/EmptyState.jsx:13`** every one of 34 empty states is a permanent `role="status"` live
    region wrapping an `<h3>` + an action Button, with `aria-atomic` defaulting to TRUE.
21. **`forms/Checkbox.jsx:33`** `tabIndex={disabled ? -1 : 0}` does exactly what its own comment at
    `:29-31` calls the bug. LATENT (0 live `<Checkbox disabled>`).
22. **`core/Card.jsx:15`** `role="button"` has presentational children ⇒ any control inside an
    activatable Card is a nested-interactive violation. LATENT (0 live `<Card interactive>`;
    `Extensions.tsx:1108` documents avoiding it). `:12,44` `cursor:pointer` still keys off
    `interactive` while the role keys off `interactive && onClick`.
23. **Hard-coded targets ignoring `--density-touch-target`:** `LayerRow.jsx:327-328` (RowBtn 26px, ×5
    per row — beside a 48×48 opacity button in the SAME row), `ConditionBadge.jsx:85` (24),
    `Toast.jsx:246` (24), `Dialog.jsx:303`/`Sheet.jsx:293` (Close 30), `Popover.jsx:204` (Close 28).
24. **`feedback/VisibilityChip.jsx:19`** collapses `shared`→"Players" while `LayerRow.jsx:29-33` and
    `POIPopover.jsx:167` model `shared` as a distinct third state. Product decision.
25. **`map/POIPopover.jsx:97-107`** Delete is `variant="danger"` `marginLeft:auto` (phone thumb zone)
    in a popover, no confirm/undo. **`:158`** the visibility control is not `aria-describedby`-linked
    to its own "Independent of the layer…" explanation at `:170`.
26. **`navigation/NavItem.jsx:38`** `--density-nav-item-height` is used but NEVER DEFINED (re-verified
    run #16 — 0 hits in `src/styles/`). NavRail overrides inline so the live rail is fine.
27. **Unguarded enum maps degrade silently:** `Icon.jsx:530` `GLYPHS[p] || Square`, `StatusDot.jsx:16`.
28. **`ds/index.d.ts:7`** every export is `ComponentType<Record<string,unknown>>` ⇒ `idBase`,
    `ariaLabel`, `label` unenforceable, so every regression above can silently reappear.
29. **Systemic latent: `{...rest}` spread AFTER the component's own handlers** — `Button.jsx:117`,
    `IconButton.jsx:51`, `Chip.jsx:50`, `Checkbox.jsx:51`, `Switch.jsx:43`, `Tabs.jsx:62`,
    `Slider.jsx:139`, `Icon.jsx:536`. 0 live colliding sites.
30. **`overlay/Dialog.jsx`/`Sheet.jsx` Tab traps are NOT layered** the way Escape now is — both attach
    document-capture `keydown`. Verified benign for today's nesting, but the asymmetry is a trap.
31. **`command/CommandPalette.jsx`** never calls `isolateModalSiblings` (unlike Dialog/Sheet) and does
    not use `escapeLayers`; it relies on `aria-modal` + `preventDefault` on Tab.

## Token / platform landmines (read BEFORE writing any sizing, colour or theme finding)

- **Density is NOT a media query.** `public/prepaint.js` (3rd IIFE) writes `data-density` ONCE at boot
  from `window.innerWidth`: `>=1200` → the user's saved pref, **anything narrower → forced
  `comfortable` (44px)**. `--density-touch-target` IS 44px on a phone. No `resize` listener.
- `--density-touch-target` = 2rem standard / **2.75rem comfortable** / 1.75rem compact.
  `html[data-android]` (`styles/index.css:32-73`) sets ALL density vars to 3rem AND adds
  `min-height:48px; min-width:48px` to `button, a[href], [role=button|option|menuitem|radio|checkbox|tab|switch], input, select, textarea`.
  `min-*` beats a smaller inline `width`/`height` ⇒ android masks most fixed-size defects and
  INFLATES anything relying on a small `height` (open #7).
- `--app-viewport-height` = `100dvh` (`styles/index.css:23`), `calc(100dvh - --native-titlebar-height)`
  under Electron (`:110`). Any raw `vh` in `ds/` is a bug (`Sheet:20`, `CommandPalette:265`).
- **`--density-nav-item-height` is UNDEFINED.** So are `--space-2-5`, `--space-3-5`, `--space-0-5`
  (all written with fallbacks). Sweep:
  `grep -rhoE "var\(--[a-z0-9-]+" src/ds/components | sed 's/var(//' | sort -u` vs
  `grep -rhoE "^\s*--[a-z0-9-]+\s*:" src/styles/`.
- **`--color-visibility-dm{,-subtle}` are UNDEFINED** yet written at 7 sites in `PlayerView`/`Player`/
  `Community`. Real names: **`--color-dm-only-badge` / `--color-dm-only-subtle`** (the ds is correct).
- `:root` `--layer-*` are LIGHT; only `[data-theme='parchment']` re-cuts them DARK. `--layer-terrain`
  IS declared.
- `--color-interactive-selected` (~1.4:1) is a SELECTION wash, NOT a focus colour — there is a test
  (`ds-interaction-fixes.test.tsx`). Ring = `--focus-ring-{width,offset,color}` from
  `styles/tokens/base.css`. Any inline `outline:'none'` defeats it.
- **`box-shadow` is NOT painted under `forced-colors: active`; `outline`/`border` are.**
- **NO global `button:hover`** — every inline-styled `<button>` needs explicit `onMouseEnter/Leave`.
- `[data-motion]` in `styles/index.css` globally zeroes animation ⇒ never file a per-component
  `prefers-reduced-motion` finding. z-index IS fully tokenized.
- `isolateModalSiblings` inerts everything outside an open overlay; `data-modal-exempt` is the opt-out
  (only `ToastViewport` uses it).
- **Measure WCAG 2.5.8 with the Spacing exception** before filing a chip/pill size finding.

## e2e coupling (re-grepped 2026-07-30 @ 33651613 — SAFE = no spec references the label)

Specs live at **`apps/gm-react/tests/e2e/*.spec.ts`** (33 files). `tests/a11y/known-violations.json`.

**SAFE to change:** `'Collapse minimap'` / `'Expand minimap'` / `'Jump viewport'` · `'Create map'` ·
`'Add condition'` · `getByRole('tablist')` / `'Sections'` · `'Steps'` · `'Level n slot n'` ·
`role('progressbar')` · `'Dismiss'` · Skeleton · every ICON GLYPH · **the Popover triggers**
(`'Snapping options'`, the Export `<Button>`, the layer `⋯`, the opacity `%`) — NO spec clicks any of
them twice, so open #1's `triggerRef` fix is spec-safe · adding a name to the LayerRow/LayersPanel popovers.

**LOCKED — a rename breaks a spec:**
- `android-quick-map.spec.ts:291,298,299` pins `'Visibility: dm-only'`/`'…players'`/`'…shared'`;
  `map-editor.spec.ts:521` pins `/^Visibility:/` ⇒ `LayerRow.jsx:142` can't be humanised alone.
- `android-quick-map.spec.ts:277-284` `'Base: DM display on/off'` (LayerRow `:132`).
- `android-quick-map.spec.ts:185-233` `'Point of interest'`, `'POI: New POI'`.
- `android-quick-map.spec.ts:373` + `map-editor.spec.ts:577` `'Export for other VTTs (.dd2vtt)'`.
- `map-editor.spec.ts:506-509` dblclicks the layer name button (`exact:true`).
- `campaign.spec.ts:119` clicks the QuestCard objective button.
- `command-palette.spec.ts:88-118` `getByRole('option')` names.
- `map-editor.spec.ts:168,685,877` + `responsive.spec.ts:835` `getByRole('dialog', {name:'Map panels'})`.
- `upgrade.spec.ts:49` / `atlas.spec.ts:39` `getByRole('switch', {name})` + `toBeDisabled()` — a
  Switch soft-disable CHANGES what `toBeDisabled()` reports; must be updated with open #5.
- `'Close'` as an a11y name: `android-quick-map.spec.ts:121,171,196,306`, `responsive.spec.ts:844`,
  `map-editor.spec.ts:686,878`, `knowledge.spec.ts:379`, `canvas.spec.ts:366,449,779`.
- `onboarding-consent.spec.ts` / `settings.spec.ts` radiogroup names.

**Gates that would catch a sizing regression:** `responsive.spec.ts:785` enforces `>=47.5px` — but ONLY
inside the Android test (`__DNDTOOLS_TEST_RUNTIME_KIND__='android'`, 360×640). Plain `mobile-chromium`
(Pixel 5, 393×851) has NO size gate, only `clippedControls` (X/Y clipping) and
`expectNoHorizontalOverflow`. `a11y-axe-gate.spec.ts` sweeps 17 routes but only each route's DEFAULT tab —
it never opens a Popover, so open #1/#10/#13 are invisible to it.

See [[gm-react-ds]], [[completion-pass-ux-patterns]], [[onboarding-viewas-cluster]].
