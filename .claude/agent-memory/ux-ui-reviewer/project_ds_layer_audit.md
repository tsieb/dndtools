---
name: ds-layer-audit
description: FIXED-vs-OPEN split for visual/interactive defects in apps/gm-react/src/ds/components/** — dead exports, token traps, e2e label coupling, and what is still broken as of run #17 (2026-07-31 @ 21e4f86e)
metadata:
  type: project
---

Design-system audit of `apps/gm-react/src/ds/components/**` + `src/ds/index.d.ts`.
NOTE: `screen-kit` lives at **`src/app/screen-kit.tsx`**. `Tooltip` lives at **`overlay/Tooltip.jsx`**
(not `core/`). Global focus ring is in **`styles/tokens/base.css`**.

⚠️ **The loop's control dir `dndtools-review-loop-ctl` is NOT a git worktree** — it holds the loop
scripts only. The repo (and this memory dir) is `/home/trinkle/Programming/dndtools-review-loop`.

**How to apply:** these are STRUCTURAL classes; every consuming screen inherits them. Fix once in `ds/`.
Re-verify before reporting — this file has been wrong before.

## LIVE call-site counts (re-grepped 2026-07-31 @ 21e4f86e, `grep -rn "<X\b" src --include=*.tsx --include=*.jsx`)

`Button` **389** · `Icon` 306 · `Input` 124 · `Field` 114 · `IconButton` **76** (59 `size="sm"`) ·
`Select` 65 · `Dialog` 42 · `VisibilityChip` 37 · `EmptyState` 35 · `Card` 30 · `Textarea` 27 ·
`Slider` **24** · `SegmentedControl` 22 · `Skeleton` 22 · `Badge` 19 · `Switch` 17 · `Tabs` 13 ·
`Popover` 12 · `Minimap` 11 · `Chip` 11 · `ConditionBadge` 9 · `Sheet` 8 · `StatusDot` 8 ·
`HPBar` 7 · `ProgressMeter` 7 · `DataTable` 4 · `ConditionTracker` 3 · `Stepper` 2 · `QuestCard` 1 ·
`NpcCard` 1 · `SessionTimeline` 1.

**DEAD, zero consumers:** `core/Breadcrumb`, `overlay/Tooltip`, `navigation/NavSidebar`,
`map/LayerPanel`, `map/ToolPalette`, `map/FogControls`, `map/GenerationPanel`, `map/ImportWizard`,
`creature/StatBlock`, `domain/InitiativeRow`, `spell/SpellCard`.
**Latent props (0 live sites — RE-VERIFIED run #17 by AST-ish scan):** `Card interactive`,
`Chip onClick`, `Chip onRemove`, `Checkbox disabled`, `Sheet footer`, `DataTable sortable`,
`Select invalid`, `HPBar showText={false}`, `Dialog/Sheet dismissible={false}`,
**`Button style` carrying `background`/`color`** (so Button's hover reset clobbering a caller's
custom colour is LATENT), **`Field` wrapping >1 top-level child** (0 live).

## FIXED — do NOT re-report

- **Run #17 verified fixed (commit 21e4f86e):** `Popover.jsx:44,66` **`triggerRef`** — a toggle
  trigger can now close its own popover (all 4 map flyouts wired) · `EmptyState.jsx` no longer
  `role="status"` · `ProgressMeter.jsx:87` `aria-valuenow` clamped to `[0,max]` ·
  `Slider.jsx:18-26` track repainted as a centered `background-size:100% 6px` band so the Android
  `min-height:48px` rule no longer inflates it into a two-tone slab.
- **Run #16:** `platform/escapeLayers.ts` DOM-containment (Dialog:105/Sheet:63/Popover:69) ·
  `Field.jsx:75-93` error AND help both render/describe, error id first · `Toast.jsx:349`
  `aria-atomic="false"` · `Popover.jsx:94-95` strict FOCUSABLE + `:110-116` guarded focus restore ·
  `Minimap.jsx:29-42` `toggleRef` hand-off · `NavItem.jsx:74` `label={null}` ·
  LayerRow/LayersPanel popover `aria-label` · `Button`/`IconButton` soft-disable + `outline`-variant
  hover · `Input`/`Textarea`/`Select` `composeFocus` + no inline `outline:none` · `Slider` stepper
  soft-disable/`stepHover`/density `stepBtn` · `Icon.jsx` `dm-only`→`VenetianMask` · `SpellSlots`
  readOnly `role="img"` pips · `Checkbox aria-disabled` · `ProgressMeter aria-valuetext` · `Tabs`
  inactive hover · `ToastViewport` `data-modal-exempt` + `overflowY:auto`.
- Earlier: `Tabs idBase`/`tabPanelProps` · `SegmentedControl` roving tabindex · `DataTable` overflow
  wrapper · `POIMarker --color-text-inverse` · `Button` danger foreground · `Avatar` ring→`outline`
  (forced-colors) · `VisibilityChip` no double-announce + `CORE_ALIASES` normalisation ·
  `MapCreationForm` soft submit · `ConditionTracker` empty line + density add button ·
  `LayerRow` Enter/F2 rename · `DefinitionList minmax(0,…)` · overlay trap/scroll-lock ·
  `QuestCard` read-only objectives = plain `<li>` + `aria-pressed` · `NpcCard` name-is-the-control.
- Clean on structural read (run #17): `Card`, `Badge`, `LayerTypeBadge`, `StatPill`, `Stat`,
  `SessionTimeline`, `AbilityScore`, `HPBar`, `DiceResult`, `DefinitionList`, `Stepper`,
  `BottomTabBar`, `NavRail`, `ConditionTracker`, `EmptyState`.

## STILL OPEN (run #17, ranked). New this run marked ★

1. ★ **`forms/Slider.jsx:18` `.dnds-range{height:6px}` + `steppers` passed at 0 of 14 live sites.**
   On every non-Android profile (desktop AND `mobile-chromium` Pixel 5) the ONLY pointer route to
   brush size / fog radius / layer opacity / master volume / every generation param is a 6px-tall
   strip. The 24px thumb is a `::-webkit-slider-thumb` painted overflowing a 6px box; click-to-position
   uses the element box. WCAG 2.5.8, and 2.5.7's documented non-drag alternative is dead code.
   Sites: `ToolOptionsBar.tsx:51`, `InspectorPanel.tsx:70`, `ParamControls.tsx:91`, `LayerRow.jsx:278`,
   `Audio.tsx:248`, `Session.tsx:1861` (+ dead FogControls/GenerationPanel).
   **Fix: `height:6px` → `min-height:24px`.** The band is already drawn by `background-size:100% 6px;
   background-position:center`, so the track looks identical. SAFE (`audio-presets.spec.ts:212-231`
   is role+`aria-valuetext`+keyboard only).
2. ★ **`overlay/Dialog.jsx:162-163` and `overlay/Sheet.jsx:120-121` restore focus unguarded.**
   `const rf = returnFocusRef.current; if (rf && rf.focus) rf.focus();` — no `document.contains`.
   `core/Popover.jsx:110-116` ALREADY has the right guard (`stranded && document.contains`).
   42 Dialog + 8 Sheet sites. (a) A confirm that removes its own opener (row ⋯ delete) no-ops the
   `.focus()` ⇒ focus lands on `<body>`, next Tab restarts the document (2.4.3). (b) A caller that
   deliberately moves focus on close has it yanked back (`AppShell.tsx:795` "All sections" navigates
   on select). Fix: port Popover's guard + fall back to the `<main>` landmark, not `<body>`.
3. ★ **`core/Button.jsx:72` silently downgrades an unknown `variant`, and the vocabularies diverge.**
   `variants` = primary/secondary/ghost/danger; `IconButton.jsx:18-22` ALSO has `accent`.
   `screens/Session.tsx:1578` `<Button variant="accent" icon="dice">Roll</Button>` — the dice
   roller's primary action renders as a plain secondary. `index.d.ts:7` can't catch it.
   Fix: add `accent` to Button (mirror IconButton) or change the one site to `primary`. SAFE (no
   spec matches "Roll").
4. **`overlay/Sheet.jsx:20,149-150` bottom sheets are a FIXED `height:'88vh'`, not a max.**
   `AppShell.tsx:956` "Table controls" = 4 compact buttons as an 88%-screen slab. `vh` ≠ the app's
   `--app-viewport-height` (`100dvh`, minus titlebar under Electron).
   Fix: `height:'auto'` + `maxHeight: calc(var(--app-viewport-height) * .88)`.
5. **`core/IconButton.jsx:10,35-36`** fixed rem `width/height` (sm 28 / md 36 / lg 44), never consults
   `--density-touch-target`. **76 live sites, 59 at `size="sm"`.** Android masks it; plain mobile web
   does not. Fix → `minWidth/minHeight: max(dim, var(--density-touch-target))`.
6. **`forms/Field.jsx:13-21,34-40,66` mis-associates when the child is a LAYOUT WRAPPER.**
   `onlyChild` is any valid element, so a `<div>` of two Inputs gets `id`/`aria-required`/
   `aria-invalid`/`aria-describedby` cloned onto it and `<label for>` points at a `<div>`.
   Live: `map/MapCreationForm.jsx:93-112` ("Scale", rendered by `Atlas.tsx:591`) and
   `screens/SceneEditor.tsx:1046` (Field wrapping a raw `<input type="color">` — that one is fine).
   114 Field sites ⇒ live trap. Re-verified run #17: the >1-child variant is 0 live.
7. **`forms/Switch.jsx:26` native `disabled`** — the last DS control that hard-disables. 17 live sites,
   5 gate on `busy` ⇒ the switch disables itself under your focus. Port Button's soft pattern.
   ⚠️ `upgrade.spec.ts:49` / `atlas.spec.ts:39` use `getByRole('switch')` + `toBeDisabled()`.
8. ★ **`forms/Switch.jsx:74-78` the inline label is a bare `<span onClick>`** that is ALSO the
   switch's `aria-labelledby` target. Mouse-only activation with no keyboard equivalent and no focus
   move (axe `click-events-have-key-events` shape). Fix: drop the handler — the `:34-35` density hit
   box already covers the target — or render the label inside the `<button>`. Name is unaffected, SAFE.
9. **`forms/SegmentedControl.jsx:73-93`** the only interactive DS primitive with NO `minHeight`:
   `padding` + `lineHeight:1` ⇒ sm ≈ 24px, md ≈ 27px on every profile. 22 live sites incl.
   `POIPopover.jsx:158`, the DM only / Players / Shared safety control at `size="sm"`.
   ★ **`:88-89` also declares `textOverflow:'ellipsis'` with no `whiteSpace:'nowrap'`** — inert while
   text can wrap, so long labels ("Equirectangular", "Mountainous") wrap at `lineHeight:1` and the
   control jumps in height instead of truncating. Fix both together.
10. **`system/ProgressMeter.jsx:124-142`** `role="progressbar"` has PRESENTATIONAL CHILDREN (ARIA 1.2)
    so the markers' `title` can never be exposed — difficulty bands are position+colour only
    (WCAG 1.4.1). Also over-budget: with no `valueLabel`, both the readout (`:77`) and valuenow clamp
    to 100% so 150/100 is INVISIBLE, not just unannounced. 7 live sites (EncounterBuilder:709,
    Player:1233, Player:2065).
11. **`system/Skeleton.jsx:19,24,32`** `aria-hidden` at all three returns, no `label` opt-in ⇒ **22 live
    loading placeholders are completely silent to AT**.
12. **`command/CommandPalette.jsx:314`** inline `outline:'none'` on the `role="combobox"` input — the
    palette's ONLY focusable control has no ring. **`:304`** `aria-expanded="true"` hard-coded.
    **`:337-365`** with 0 results the `role="listbox"` owns a bare `<div>` (axe `aria-required-children`).
    **`:265`** `maxHeight:'70vh'` not `--app-viewport-height`.
13. **`overlay/Toast.jsx:314,320`** `pointerEvents:'none'` makes the `overflowY:'auto'` stack scroll
    range unreachable by wheel/touch. `Toaster.show` has no cap; re-showing an existing `id`
    (`:65`) removes+re-appends, so an updated toast JUMPS to the end. `:210` the action button (the
    Undo affordance, 8 sites) has no distinguishing `aria-label` and no density target (~25px).
14. **`core/Tabs.jsx:116-117`** `marginBottom:'-1px'` + container `borderBottom` + `flexWrap:'wrap'`
    ⇒ when 13 live tablists wrap to two rows on a phone the active gold underline is drawn mid-control.
    **`:80`** natively `disabled` tabs leave the tab order (ARIA wants `aria-disabled`).
15. **`data/DataTable.jsx:16`** the `overflowX:auto` port has no `tabIndex`/`role`/name
    (axe `scrollable-region-focusable`); 4 live sites. `:54` hand-rolls "Nothing here yet."
16. **`condition/ConditionBadge.jsx:65`** `whiteSpace:'nowrap'` with no `maxWidth`, and
    `ConditionTracker.jsx:50` passes an arbitrary homebrew key as `label` ⇒ a long custom condition
    overflows its row. **`:72-77`** `level`/`duration` announce as bare numbers ("Poisoned 3").
    **`:78-89`** `onRemove` — the combat tracker's destructive control — has NO hover.
17. **`map/Minimap.jsx:56-57,153-154`** 36×36 and 24×24 hard-coded targets in a floating map overlay.
    **`:191`** `boxShadow:'0 0 0 1px rgba(0,0,0,.4)'` is not painted under `forced-colors`.
18. **`core/Popover.jsx:173`** `overflow:'hidden'`, no `maxHeight`, no scrollable body and NO vertical
    viewport clamp (`popoverShiftX` is X-only). Vertical fit is delegated to the caller —
    `MapBuilder.tsx:1058` does a coarse `v.y < 0.42 ? 'bottom' : 'top'` flip that ignores panel height.
    `:167` `maxWidth:'90vw'` is also raw `vw`.
19. **`feedback/StatusDot.jsx:49`** `if(!label) return dot;` drops `style` + `{...rest}` — LATENT:
    all 12 live label-less sites pass neither. `:42-46` re-emits `@keyframes` per instance
    (same in Dialog/Sheet/Toast/CommandPalette).
20. **`navigation/NavItem.jsx:97-111` + `BottomTabBar.jsx:54-68`** the "session is live" badge dot is
    `aria-hidden` with no text equivalent in BOTH collapsed navs (the expanded sidebar does announce it).
21. **`overlay/Sheet.jsx:216-235`** 36×4 drag-to-dismiss grab handle with ZERO pointer handlers — a
    false affordance on the phone's primary overlay. **`:138`/`:337`** `justifyContent:'stretch'` is
    invalid for flex (footer case LATENT — 0 live `Sheet footer`).
22. **`forms/Checkbox.jsx:33`** `tabIndex={disabled ? -1 : 0}` does what its own comment calls the bug.
    LATENT (0 live `<Checkbox disabled>`).
23. **`core/Card.jsx:15`** `role="button"` has presentational children ⇒ nested-interactive violation.
    LATENT (0 live `<Card interactive>`; `Extensions.tsx:1108` documents avoiding it).
24. **Hard-coded targets ignoring `--density-touch-target`:** `LayerRow.jsx:327-328` (RowBtn 26px, ×5
    per row — beside a 48×48 opacity button in the SAME row), `ConditionBadge.jsx:85` (24),
    `Toast.jsx:246` (24), `Dialog.jsx:303`/`Sheet.jsx:293` (Close 30), `Popover.jsx:213` (Close 28),
    `QuestCard.jsx:207` (objective row 24 — meets 2.5.8 exactly, cosmetic only).
25. **`feedback/VisibilityChip.jsx:19`** collapses `shared`→"Players" while `LayerRow.jsx:29-33` and
    `POIPopover.jsx:167` model `shared` as a distinct third state. Product decision.
26. **`map/POIPopover.jsx:97-107`** Delete is `variant="danger"` `marginLeft:auto` (phone thumb zone)
    in a popover, no confirm/undo. **`:158`** the visibility control is not `aria-describedby`-linked
    to its own "Independent of the layer…" explanation at `:170`.
27. **`navigation/NavItem.jsx:38`** `--density-nav-item-height` is used but NEVER DEFINED (re-verified
    run #17). NavRail overrides inline (`NavRail.jsx:41` 44×44) so the live rail is fine.
28. **Unguarded enum maps degrade silently:** `Icon.jsx:530` `GLYPHS[p] || Square`, `StatusDot.jsx:16`,
    `Button.jsx:72`, `IconButton.jsx:23`, `Badge.jsx:48`, `VisibilityChip.jsx:20`, `ConditionBadge:47`.
    Only `Button` has a LIVE miss today (open #3).
29. **`ds/index.d.ts:7`** every export is `ComponentType<Record<string,unknown>>` ⇒ `idBase`,
    `ariaLabel`, `label`, `variant` unenforceable, so every regression above can silently reappear.
30. **Systemic latent: `{...rest}` spread AFTER the component's own handlers** — `Button.jsx:117`,
    `IconButton.jsx:51`, `Chip.jsx:50`, `Checkbox.jsx:51`, `Switch.jsx:43`, `Tabs.jsx:62`,
    `Slider.jsx:149`, `Icon.jsx:536`. 0 live colliding sites.
    ★ Related-but-different, also LATENT: **`Button.jsx:111-116` `onMouseLeave` resets `background`
    and `color` to the VARIANT defaults**, permanently discarding a caller's `style.background`
    after the first hover. 0 live sites pass a coloured `style` (verified run #17).
31. **`overlay/Dialog.jsx`/`Sheet.jsx` Tab traps are NOT layered** the way Escape now is — both attach
    document-capture `keydown`. Benign for today's nesting; the asymmetry is a trap. Their node filter
    `n.offsetParent !== null` (`Dialog:119`/`Sheet:77`) also drops any `position:fixed` focusable.
32. **`command/CommandPalette.jsx`** never calls `isolateModalSiblings` and does not use `escapeLayers`.
33. ★ **`campaign/NpcCard.jsx:57`** the `<h3>` carries `whiteSpace:nowrap`+`textOverflow:ellipsis` but
    (deliberately) no `overflow:hidden`; the clipping lives on the inner `<button>` at `:62`, which
    only renders when `onClick` is passed. A READ-ONLY NpcCard with a long name spills out of the card.
    LATENT (the sole live site `Campaign.tsx:876` always passes `onClick`) — a trap for the next caller.
34. ★ **`core/Avatar.jsx:30` `aria-hidden` hides the `<img alt={name}>` at `:55`.** Correct today
    (every live site prints the name beside it) but the `alt` should be `""` so the intent is clear.

## Token / platform landmines (read BEFORE writing any sizing, colour or theme finding)

- **Density is NOT a media query.** `public/prepaint.js` (3rd IIFE) writes `data-density` ONCE at boot
  from `window.innerWidth`: `>=1200` → the user's saved pref, **anything narrower → forced
  `comfortable` (44px)**. No `resize` listener.
- `--density-touch-target` = 2rem standard / **2.75rem comfortable** / 1.75rem compact.
  `--density-button-height` / `--density-input-height` = 2.25 / 2.75 / 1.75rem — **all three ARE
  defined** (`styles/tokens/spacing.css:107-138`). `html[data-android]` (`styles/index.css:32-73`)
  sets them to 3rem AND adds `min-height:48px; min-width:48px` to
  `button, a[href], [role=button|option|menuitem|radio|checkbox|tab|switch], input, select, textarea`.
  `min-*` beats a smaller inline `width`/`height` ⇒ android masks most fixed-size defects.
- **Undefined vars referenced from `ds/` (full sweep run #17):** ONLY `--density-nav-item-height`,
  `--space-2-5`, `--space-3-5`. The latter two always carry fallbacks. Sweep command:
  `grep -rhoE "var\(--[a-z0-9-]+" src/ds/components | sed 's/var(//' | sort -u` vs
  `grep -rhoE "^\s*--[a-z0-9-]+\s*:" src/styles/ | sed 's/\s//g;s/:$//' | sort -u`, then `comm -23`.
- `--app-viewport-height` = `100dvh` (`styles/index.css:23`), `calc(100dvh - --native-titlebar-height)`
  under Electron. Any raw `vh` in `ds/` is a bug (`Sheet:20`, `CommandPalette:265`, `Popover:167` `vw`).
- **`--color-visibility-dm{,-subtle}` are UNDEFINED** yet written at 7 sites in `PlayerView`/`Player`/
  `Community`. Real names: **`--color-dm-only-badge` / `--color-dm-only-subtle`** (the ds is correct).
- `:root` `--layer-*` are LIGHT; only `[data-theme='parchment']` re-cuts them DARK. `--layer-terrain`
  IS declared.
- `--color-interactive-selected` (~1.4:1) is a SELECTION wash, NOT a focus colour (test:
  `ds-interaction-fixes.test.tsx`). Ring = `--focus-ring-{width,offset,color}` from `tokens/base.css`.
- **`box-shadow` is NOT painted under `forced-colors: active`; `outline`/`border` are.**
- **NO global `button:hover`** — every inline-styled `<button>` needs explicit `onMouseEnter/Leave`.
- `[data-motion='reduced'|'none']` in `styles/index.css:255-265` globally forces
  `animation-duration:.001ms !important` (beats inline `animation`) ⇒ never file a per-component
  `prefers-reduced-motion` finding. `.dnd-skeleton` also has its own rule at `tokens/base.css:55`.
- `isolateModalSiblings` inerts everything outside an open overlay; `data-modal-exempt` is the opt-out
  (only `ToastViewport` uses it).
- **Measure WCAG 2.5.8 with the Spacing exception** before filing a chip/pill size finding.
- `Icon` defaults to `aria-hidden` unless `label` is passed (`Icon.jsx:532`) — so `<Button icon>`,
  `<Badge>`, `<Chip icon>` glyphs are correctly decorative. Do NOT file "icon needs aria-hidden".

## e2e coupling (re-grepped 2026-07-31 @ 21e4f86e — SAFE = no spec references the label)

Specs live at **`apps/gm-react/tests/e2e/*.spec.ts`** (33 files). `tests/a11y/known-violations.json`.

**SAFE to change:** `'Collapse minimap'` / `'Expand minimap'` / `'Jump viewport'` · `'Create map'` ·
`'Add condition'` · `getByRole('tablist')` / `'Sections'` · `'Steps'` · `'Level n slot n'` ·
`role('progressbar')` · `'Dismiss'` · Skeleton · every ICON GLYPH · the Popover triggers ·
**Slider GEOMETRY** (`audio-presets.spec.ts:212-231` is role + `aria-valuetext` + keyboard only) ·
**Dialog/Sheet post-close FOCUS** (no spec asserts it) · **`'Roll'`** (no spec matches it) ·
**Switch label markup** (specs match `getByRole('switch',{name})`, name comes from `aria-labelledby`).

**LOCKED — a rename breaks a spec:**
- `android-quick-map.spec.ts:291,298,299` pins `'Visibility: dm-only'`/`'…players'`/`'…shared'`;
  `map-editor.spec.ts:521` pins `/^Visibility:/` ⇒ `LayerRow.jsx:142` can't be humanised alone.
- `android-quick-map.spec.ts:277-284` `'Base: DM display on/off'` (LayerRow `:132`).
- `android-quick-map.spec.ts:185-233` `'Point of interest'`, `'POI: New POI'`.
- `android-quick-map.spec.ts:373` + `map-editor.spec.ts:577` `'Export for other VTTs (.dd2vtt)'`.
- `map-editor.spec.ts:506-509` dblclicks the layer name button (`exact:true`).
- `campaign.spec.ts:124` clicks the QuestCard OBJECTIVE button by its text
  (`getByRole('button',{name:'Find who is buying the shipments'})`) and `:121` asserts `'0/2'`.
- `command-palette.spec.ts:88-118` `getByRole('option')` names.
- `map-editor.spec.ts:168,685,877` + `responsive.spec.ts:835` `getByRole('dialog',{name:'Map panels'})`.
- `upgrade.spec.ts:49` / `atlas.spec.ts:39` `getByRole('switch',{name})` + `toBeDisabled()` — a
  Switch soft-disable CHANGES what `toBeDisabled()` reports; must be updated with open #7.
- `'Close'` as an a11y name: `android-quick-map.spec.ts:121,171,196,306`, `responsive.spec.ts:844`,
  `map-editor.spec.ts:686,878`, `knowledge.spec.ts:379`, `canvas.spec.ts:366,449,779`.
- `onboarding-consent.spec.ts` / `settings.spec.ts` radiogroup names.

**Gates that would catch a sizing regression:** `responsive.spec.ts:785` enforces `>=47.5px` — but ONLY
inside the Android test (`__DNDTOOLS_TEST_RUNTIME_KIND__='android'`, 360×640), which is exactly why
open #1 (the 6px slider) has never been caught. Plain `mobile-chromium` (Pixel 5, 393×851) has NO size
gate, only `clippedControls` and `expectNoHorizontalOverflow`. `a11y-axe-gate.spec.ts` sweeps 17 routes
but only each route's DEFAULT tab — it never opens a Popover, Dialog or Sheet.

See [[gm-react-ds]], [[completion-pass-ux-patterns]], [[onboarding-viewas-cluster]].
