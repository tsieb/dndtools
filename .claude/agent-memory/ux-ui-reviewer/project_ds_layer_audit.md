---
name: ds-layer-audit
description: FIXED-vs-OPEN split for visual/interactive defects in apps/gm-react/src/ds/components/** — dead exports, token traps, e2e label coupling, and what is still broken as of run #13 (2026-07-30 @ 45adf828)
metadata:
  type: project
---

Design-system audit of `apps/gm-react/src/ds/components/**` + `src/ds/index.d.ts`.
NOTE: `screen-kit` lives at **`src/app/screen-kit.tsx`**. `Tooltip` lives at **`overlay/Tooltip.jsx`**
(not `core/`). Global focus ring is in **`styles/tokens/base.css`**.

**How to apply:** these are STRUCTURAL classes; every consuming screen inherits them. Fix once in `ds/`.
Re-verify before reporting — this file has been wrong before.

## LIVE-vs-DEAD map (re-grepped 2026-07-30 @ 45adf828)

**DEAD, zero consumers:** `core/Breadcrumb`, `overlay/Tooltip`, `navigation/NavSidebar`,
`map/LayerPanel`, `map/ToolPalette`, `map/FogControls`, `map/GenerationPanel`, `map/ImportWizard`,
`creature/StatBlock`, `domain/InitiativeRow`, `spell/SpellCard`. Latent: `DataTable.sortable`,
`Chip.onRemove`, `HPBar showText={false}` (0 sites), `Select invalid` (0 sites),
`Button/IconButton` caller-supplied `style.background|color` (0 sites → the onMouseLeave clobber is latent).
⚠️ **LIVE:** `navigation/NavItem` (via NavRail → AppShell), `map/Minimap` (EditorCanvas),
`map/MapCreationForm` (Atlas.tsx:581, INLINE — not in a Dialog), `campaign/QuestCard` (Campaign),
`campaign/NpcCard` (Campaign.tsx:869, interactive), `spell/SpellSlots` (Characters:1229 w/
`readOnly={!isDm}`, Player:1415), `condition/ConditionTracker`, `system/ProgressMeter`, `core/Stepper`,
`data/DataTable` (Characters:968, Settings:2028).

## FIXED — do NOT re-report

- **Run #13 verified fixed:** `forms/Slider` `stepBtn` hover (`stepHover()` at `:188`) + `aria-valuetext`
  (`:126`) · `map/Minimap` Collapse now 24×24 · `condition/ConditionTracker` "No conditions" + density
  token add button + "Add condition" name · `campaign/QuestCard` `aria-pressed` + read-only `<li>` ·
  `map/MapCreationForm` soft submit (`:179` only `submitting` disables) · `map/LayerRow` Enter/F2 rename.
  ALL `--layer-*` (13 + terrain) are defined in `:root`, `[data-theme=parchment]` AND the
  `forced-colors` block. `--map-canvas-bg` too.
- **Run #12:** `Input`/`Textarea`/`Select` outline + `composeFocus` · `ToastViewport`
  `aria-atomic=false` + `overflowY:auto` + `data-modal-exempt`.
- **Run #11:** `Slider` 24px thumb · `Sheet` opens on BODY not Close · `VisibilityChip` no double-announce ·
  `DefinitionList` `minmax(0,auto) minmax(0,1fr)`.
- `Tabs` ARIA `idBase`/`tabPanelProps` + inactive-tab hover (`:85-92`) · `SegmentedControl` roving
  tabindex · 24px targets on `Checkbox`/`Switch`/`Chip.onRemove`/`Slider.stepBtn` · `DataTable` overflow
  wrapper · `POIMarker` `--color-text-inverse` · `Button` danger foreground · `Avatar` `outline` ring +
  `aria-hidden` initials · `Field` auto-htmlFor/aria-required/describedby/role=alert ·
  `Popover`/`Dialog`/`Sheet`/`CommandPalette` trap + Escape + focus-return + scroll-lock.
- Clean on structural read: `Card`, `EmptyState`, `Badge`, `LayerTypeBadge`, `StatPill`, `Stat`,
  `SessionTimeline`, `AbilityScore`, `HPBar`, `DiceResult`, `DefinitionList`.

## STILL OPEN (run #13, ranked)

1. **`core/Icon.jsx:320` `'dm-only':'Eye'` and `:323` `'visibility-players':'Eye'` are the SAME GLYPH.**
   `VisibilityChip` compact renders icon-only (8+ live sites: Session×4, Atlas:887/998, Knowledge:1107,
   Graph:660, QuestCard:109, NpcCard:68) ⇒ the app's safety-critical DM-only vs player-visible cue is
   COLOR ALONE, contradicting the component's own docstring + A11Y-011 + WCAG 1.4.1. `LayerRow`'s VIS
   map (`:20`,`:26`) inherits it. Accessible NAMES are fine. Glyph swap is e2e-safe.
2. **`overlay/Dialog.jsx:78-91` focus-in is DOM-order `panel.querySelector(FOCUSABLE)`** ⇒ the header
   Close (rendered first) takes focus. 37 `<Dialog>` mounts, only 4 pass `initialFocus`
   (AuthModal:251, Settings:927/2438/2544/2928). Also steals React `autoFocus`. `Popover.jsx:64-66` and
   `Sheet.jsx:57-58` were BOTH fixed with a `bodyRef`-first query; Dialog has NO `bodyRef`.
3. **`core/Popover.jsx:86-98`** no horizontal clamp/flip (`left:anchor.x`, w320, `maxWidth:90vw`).
   `anchor.x` is a % of the map well ⇒ POIPopover half off-screen at 393px. Vertical IS handled by
   consumers. `android-quick-map.spec.ts:185-233` never clicks inside the popover ⇒ a clamp is safe.
4. **`map/Minimap.jsx:143` `onClick={jump}` derives from `e.clientX/Y`** — a keyboard Enter/Space
   synthesizes a click with clientX/Y = 0, so activating the jump button by keyboard jumps to the map's
   top-left. Guard with `if (e.detail === 0) return;`. `Minimap.test.tsx` never presses Enter ⇒ safe.
5. **`spell/SpellSlots.jsx:28` `disabled={readOnly}`** natively disables every pip for a player
   (`Characters.tsx:1229`) ⇒ whole slot economy out of the tab order + UA-dimmed. Exact defect
   `QuestCard:217` was just fixed for. Pips also 16×16 (`:32-41`); the `rotate(45deg)` is ON the button.
6. **`map/LayerRow.jsx:179`** inline `outline:'none'` on the rename input — same class HEAD fixed in
   Input/Textarea/Select. Also `command/CommandPalette.jsx:314` (mitigated: Tab is trapped).
7. **`overlay/Toast.jsx:314,320`** `pointerEvents:'none'` + `overflowY:'auto'` ⇒ the scroll range cannot
   be reached by wheel/touch. `Toaster.show` has no stack cap.
8. **`forms/Slider.jsx:108,134`** steppers `disabled` at the endpoint ⇒ focus drops to `<body>` when you
   step to min/max. Live at `Audio.tsx:884,1350`.
9. **`system/ProgressMeter.jsx:36`** missing `aria-valuetext` (EncounterBuilder's "12 / 40 pts" is
   painted, never announced). All 3 live sites DO pass a string `label`.
10. **`system/Skeleton.jsx:19,24,32`** `aria-hidden` at all three returns, no `label` opt-in; ~7 call
    sites wrap it in an otherwise-EMPTY `role="status"`.
11. **`map/MapCreationForm.jsx:94`** flex row of 2 Inputs and **`:114`** `'1fr 1fr'` of 2 Selects —
    neither sets `minWidth:0`/`minmax(0,1fr)`; `<input>`/`<select>` have a non-zero automatic min size.
    UNVERIFIED in browser; the fix is free.
12. **`map/POIPopover.jsx:97-107`** Delete is a `variant="danger"` button with `marginLeft:auto` (phone
    thumb zone) inside a popover, no confirm, no undo in the component.
13. **`data/DataTable.jsx:16`** the `overflowX:auto` port has no `tabIndex`/name (axe
    `scrollable-region-focusable` — only fires when no focusable cell content). `:23-47` sortable `<th>`
    has `onClick` but no `<button>`/`tabIndex`/`aria-sort` (latent: `sortable` unused).
14. **`map/POIMarker.jsx:40`** hard-coded `rgba(255,255,255,0.7)` non-DM ring; invisible on the parchment
    map well. Only bare colour left in `ds/` besides `Minimap.jsx:157,171`.
15. **26px / 24px hard-coded targets that ignore `--density-touch-target`:** `LayerRow.jsx:319-320`
    (RowBtn ×5 per row — the phone layer-panel hot path), `ConditionBadge.jsx:85`, `Toast.jsx:246`
    (Dismiss), `Dialog.jsx:287`/`Sheet.jsx:284` (Close 30px), `Popover.jsx:157` (Close 28px).
16. **`navigation/NavItem.jsx:51-53` + `BottomTabBar.jsx:54-68`** badge dot `aria-hidden`, no text
    equivalent (the expanded sidebar DOES announce the count).
17. **`feedback/StatusDot.jsx:49`** `if(!label) return dot;` drops `style` + `{...rest}` (latent). LIVE
    half: 6 sites use it label-less with no adjacent text (`Atlas.tsx:491`). `:42-46` re-emits its
    `@keyframes <style>` per instance (same in Dialog/Sheet/Toast/CommandPalette).
18. **`forms/Checkbox.jsx:16`** `disabled` sets `tabIndex={-1}` on `role="checkbox"` but no
    `aria-disabled` ⇒ announced as enabled but unreachable. 1 live site.
19. **`forms/Select.jsx`** never sets `aria-invalid` although it takes `invalid` (Input does at `:66,:81`).
    Latent — 0 live sites pass `invalid`; `Field` injects it when `error` is set.
20. **`overlay/Sheet.jsx:330`** `justifyContent:'stretch'` is invalid for flex (computes `flex-start`),
    so a bottom-sheet footer never fills as intended. **`:19`** `SIDE_SIZE.bottom='88vh'` inside a
    `100dvh` scrim (UNVERIFIED — mobile-chromium has no dynamic URL bar).
21. **`core/Tabs.jsx:50`** all 7 live tablists announce "Sections" (no call site overrides; `{...rest}`
    at `:62` means they CAN).
22. **`core/Card.jsx:44`** `cursor:'pointer'` + hover keys off `interactive`, but the a11y role keys off
    `interactive && onClick` (`:12`) ⇒ `interactive` without `onClick` looks clickable and is not.
23. **`campaign/NpcCard.jsx:57`** `textOverflow:'ellipsis'` with NO `overflow:hidden` (removed to unclip
    the focus ring) ⇒ a long name on a NON-interactive card overflows instead of ellipsizing. The one
    live site is interactive, so latent.
24. **`map/LayerTypeBadge.jsx:35`** `title={text}` fires even non-compact, where the text is visible —
    same redundant-tooltip class VisibilityChip was fixed for. Same at `LayerRow` RowBtn `:311`
    (`title || label`).
25. **`feedback/VisibilityChip.jsx:19`** collapses `shared`→"Players" while `LayerRow.jsx:29-33` and
    `POIPopover.jsx:167` model `shared` as a distinct third state. Product decision.
26. **`core/Stepper.jsx:24`** nowrap labels in a non-wrapping `<ol>`. UNVERIFIED at 393px.
27. **`forms/SegmentedControl.jsx:17`** if every option is `disabled`, `tabStopIndex` is -1 ⇒ the
    radiogroup has no tab stop at all.
28. **Unguarded enum maps degrade silently:** `Icon.jsx:526` (`GLYPHS[p] || Square`),
    `StatusDot.jsx:16`. **`Icon.jsx:532`** `{...rest}` after `{...a11y}` (`:531`).
29. **`navigation/NavItem.jsx:27`** `--density-nav-item-height` is used but NEVER DEFINED anywhere in
    `styles/` ⇒ always the 40px fallback, never density-aware. NavRail overrides inline (`:41`
    `height:44`) so the live rail is fine. Same undefined-with-fallback class: `--space-2-5`, `--space-3-5`.
30. **`ds/index.d.ts:7`** every export is `ComponentType<Record<string,unknown>>` ⇒ `idBase`,
    `ariaLabel`, `label` unenforceable, so every regression above can silently reappear.
31. **Systemic latent: `{...rest}` spread AFTER the component's own handlers** — `Button.jsx:117`,
    `IconButton.jsx:51`, `Chip.jsx:50`, `Checkbox.jsx:29`, `Switch.jsx:43`, `Tabs.jsx:60`,
    `NpcCard.jsx:46`. And `Button.jsx:113-115`/`IconButton.jsx:50` `onMouseLeave` resets to the VARIANT
    colour, clobbering a caller `style.background|color`. Verified 0 live colliding sites.

## Token-layer landmines (read BEFORE writing any color/theme finding)

- **`--color-visibility-dm{,-subtle}` are UNDEFINED** yet written at 7 sites in `PlayerView`/`Player`/
  `Community`. Real names: **`--color-dm-only-badge` / `--color-dm-only-subtle`** (the ds is correct).
- Sweep command that found the above: `grep -rhoE "var\(--[a-z0-9-]+" src/ds/components | sed 's/var(//' |
  sort -u` vs `grep -rhoE "^\s*--[a-z0-9-]+\s*:" src/styles/`. Only 3 undefined in `ds/`, all with fallbacks.
- `:root` `--layer-*` are LIGHT; only `[data-theme='parchment']` re-cuts them DARK. Under `forced-colors`
  ALL 13 flatten to `CanvasText` (fog/custom→GrayText, dm→Highlight) — differentiation there rests on
  LayerTypeBadge's per-type icon + label, which it has.
- `--color-interactive-selected` (~1.4:1) is a SELECTION wash, NOT a focus colour — there is a TEST
  saying so (`ds-interaction-fixes.test.tsx`). The ring is `--focus-ring-{width,offset,color}` applied
  globally by `styles/tokens/base.css`. Any inline `outline:'none'` defeats it.
- `--density-touch-target` = 2rem desktop / **2.75rem comfortable (all mobile/tablet)** / 1.75rem compact.
  `--touch-target-floor` = 1.5rem.
- **`box-shadow` is NOT painted under `forced-colors: active`; `outline` and `border` are.**
- **NO global `button:hover`** — every inline-styled `<button>` needs explicit `onMouseEnter/Leave`.
- `[data-motion]` in `styles/index.css` globally zeroes animation ⇒ per-component
  `prefers-reduced-motion` is genuinely unneeded. z-index IS fully tokenized.
- `isolateModalSiblings` inerts everything outside an open overlay; `data-modal-exempt` is the opt-out
  (only `ToastViewport` uses it).

## e2e coupling (grepped 2026-07-30 — SAFE = no spec references the label)

**SAFE to change:** `'Collapse minimap'` / `'Expand minimap'` / `'Jump viewport'` (only
`Minimap.test.tsx`, which matches `^Jump viewport` and never presses Enter) · `'Create map'` ·
`'Add condition'` · `getByRole('tablist')` / `'Sections'` · `'Steps'` · `'Level n slot n'` ·
`role('progressbar')` · `'Dismiss'` · Skeleton · every ICON GLYPH (no spec asserts a glyph).

**LOCKED — a rename breaks a spec:**
- `android-quick-map.spec.ts:291,298,299` pins `'Visibility: dm-only'`/`'…players'`/`'…shared'` and
  `map-editor.spec.ts:521` pins `/^Visibility:/` ⇒ `LayerRow.jsx:142` CANNOT be humanised alone.
- `android-quick-map.spec.ts:277-284` `'Base: DM display on/off'` (LayerRow `:132`).
- `android-quick-map.spec.ts:185-233` `'Point of interest'`, `'POI: New POI'`.
- `map-editor.spec.ts:506-509` dblclicks the layer name button (`exact:true`).
- `campaign.spec.ts:119` clicks the QuestCard objective button (authorable case only).
- `command-palette.spec.ts:88-118` `getByRole('option')` names.
- `'Close'` as an a11y name: `android-quick-map.spec.ts:121,171,196,306`, `responsive.spec.ts:844`,
  `map-editor.spec.ts:686,878`, `knowledge.spec.ts:379`, `canvas.spec.ts:366,449,779` (the last three
  `.focus()` it explicitly, so moving Dialog's INITIAL focus off Close does not break them).
- `onboarding-consent.spec.ts` / `settings.spec.ts` radiogroup names.

`a11y-axe-gate.spec.ts` sweeps 17 routes but only each route's DEFAULT tab.

See [[gm-react-ds]], [[completion-pass-ux-patterns]], [[onboarding-viewas-cluster]].
