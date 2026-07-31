---
name: ds-layer-audit
description: FIXED-vs-OPEN split for visual/interactive defects in apps/gm-react/src/ds/components/** — dead exports, token traps, e2e label coupling, and what is still broken as of run #18 (2026-07-31 @ e702bb6f)
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

- **Run #18 verified fixed (commit e702bb6f) — this CLOSED run #17's whole top-3 plus half of #9:**
  `Slider.jsx:18` `height:6px` → **`min-height:24px`** (the 6px drag strip is DEAD; band still painted
  by `background-size:100% 6px`) · `Dialog.jsx:163`/`Sheet.jsx:121` now call
  **`restoreReturnFocus()`** from `platform/returnFocus` + null the ref (detached-opener guard) ·
  `Button.jsx:71-77` **`accent` variant added**, vocabularies re-converged with IconButton ·
  `SegmentedControl.jsx:102` **`whiteSpace:'nowrap'`** added so `textOverflow:ellipsis` finally bites.
- **Run #18 checked and found to be NON-defects — retire these, do not re-open:**
  `@keyframes dnd-shimmer` IS defined (`styles/tokens/base.css:51`) — Skeleton/ProgressMeter animate ·
  the three `aria-label="Primary"` navs (`AppShell.tsx:516` Sidebar / NavRail / BottomTabBar) are
  **viewport-exclusive** ternaries at `AppShell.tsx:1123-1124,1157` ⇒ no duplicate-landmark violation ·
  **`Chip onRemove` really is 0 live** (all 6 `onRemove=` hits are SceneBoardCanvas / Inspector /
  ConditionTracker / ConditionBadge / combat tracker, NOT Chip) · **`DataTable sortable` 0 live**
  (`grep sortable` outside ds/ = 0) · all **27 `Field htmlFor` sites also set a matching `id` on the
  DIRECT child**, so the describedby/invalid clone lands on the real control · `Session.tsx:2013`
  label-less StatusDot IS backed by a "Hand raised"/"Ready"/"Connected" `Badge` at `:2033-2045` ·
  `Settings.tsx:2349` label-less StatusDot IS backed by "Online/Offline · local-only" text.
- ⚠️ **PREMISE CORRECTION to old item #5:** `IconButton size="sm"` = 1.75rem = **28px, which PASSES
  WCAG 2.5.8's 24px floor.** The defect is a violation of the app's own comfortable-density contract
  (44px below 1200px), NOT a WCAG failure. Downgrade it accordingly; stop calling it an a11y blocker.
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

## STILL OPEN (run #18, ranked). New this run marked ★

1. ★ **`core/IconButton.jsx:49-50` hover handlers DISCARD a caller's `style.color` permanently.**
   `onMouseLeave` resets `color` to `v.color` (the VARIANT default), not to what the caller passed.
   **1 LIVE site — `screens/PlayerView.tsx:432-438`** `<IconButton label="Dismiss scene banner"
   style={{color: theme.ink}}>` on the PLAYER-FACING projected display, which runs its own theme.
   One hover and the glyph permanently flips to `--color-text-secondary`. Same class as `Button.jsx:
   111-116` (which is still 0-live). Fix: capture the resting `color`/`background` on mouseenter
   (or read `style.color` first) and restore THAT. SAFE — `scene-cards.spec.ts:345` matches the
   button by NAME only.
2. ★ **`core/Avatar.jsx:48` `ring="turn"` paints `2px solid var(--color-accent)` — and
   `--color-accent` (`#e0b06f`) is the SAME hex as `--color-interactive-focus-ring`
   (`colors.css:49` vs `:81`, and `:111` vs `:135`).** The turn ring is pixel-identical to the app's
   focus ring at a similar offset. `Session.tsx:961` (live combat tracker) and
   `InitiativeRow.jsx:31` gate it on `active`; **`Characters.tsx:194,726` and `CharBuilder.tsx:1384,
   2245` pass `ring="turn"` UNCONDITIONALLY**, so four avatars permanently look focused (2.4.7 /
   3.2.4 confusion). Fix: give `turn` its own token or a distinct treatment (thicker/dashed/inset).
   SAFE (no spec asserts avatar styling).
3. ★ **`data/DataTable.jsx:60-61` every row gets a gold `--color-interactive-hover` wash on
   mouseenter, but DataTable has NO row-click prop at all.** A pure false affordance on 2 live
   tables (`Characters.tsx:1029`, `Settings.tsx:2067`). Fix: only attach the hover pair when the
   caller supplies an `onRowClick`/`rowHref` (and then also give the row a real control). SAFE.
4. **`data/DataTable.jsx:16`** the `overflowX:'auto'` port still has no `tabIndex={0}` / `role="region"`
   / accessible name ⇒ axe `scrollable-region-focusable`, and a keyboard-only user cannot scroll
   Settings' 6-column grants table on a 393px phone (WCAG 2.1.1). `:54` also hand-rolls
   "Nothing here yet." instead of `EmptyState`. SAFE (no spec references the string).
5. **`forms/SegmentedControl.jsx:82-108` is STILL the only interactive DS primitive with no
   `minHeight`** (the run-#18 fix only added `whiteSpace`). `padding` + `lineHeight:1` ⇒ sm ≈ 24px,
   md ≈ 28px on every profile, versus the 44px comfortable-density floor every sibling honours.
   22 live sites incl. `POIPopover.jsx:158`, the DM only / Players / Shared safety control at
   `size="sm"`. Fix: `minHeight: 'var(--density-touch-target, 1.75rem)'`.
   ⚠️ Also `:68 disabled={o.disabled}` natively disables a `role="radio"`, removing it from the
   roving-tabindex group (ARIA wants `aria-disabled`) — LATENT, 0 live sites pass `disabled` options.
6. ★ **`feedback/StatusDot.jsx:13-14` `syncing` and `pending` map to the IDENTICAL colour**
   (`--color-status-info`) with no other differentiator — two distinct states render the same pixel.
   `:42-46` also re-emits the whole `@keyframes dndPulse` `<style>` element **per instance and
   unconditionally, even when `pulse` is false** (8 live sites ⇒ 8 duplicate style tags). `:49`
   `if(!label) return dot;` still drops `style` + `{...rest}` (LATENT — all label-less sites pass
   neither, and run #18 confirmed every one has adjacent explanatory text).
7. **`core/IconButton.jsx:10,35-36`** fixed rem `width/height` (sm 1.75rem/28px, md 2.25rem/36px,
   lg 2.75rem/44px), never consults `--density-touch-target`. **76 live sites, 59 at `size="sm"`.**
   ⚠️ 28px PASSES WCAG 2.5.8 — this is a DENSITY-CONTRACT violation (44px below 1200px), not an a11y
   blocker. Also `:28 title={label}` duplicates `aria-label` (double announcement on some AT) and
   `:53` keeps the icon at `md` even for `size="lg"`.
8. **`forms/Field.jsx:13-21,34-40,66` mis-associates when the child is a LAYOUT WRAPPER.**
   `onlyChild` is any valid element, so a `<div>` of two Inputs gets `id`/`aria-required`/
   `aria-invalid`/`aria-describedby` cloned onto it and `<label for>` points at a `<div>`.
   Live: `map/MapCreationForm.jsx:93-112` ("Scale", rendered by `Atlas.tsx:591`). 114 Field sites.
   ⚠️ Run #18 CLEARED the `htmlFor` variant (all 27 sites also set a matching child `id`).
9. **`forms/Switch.jsx:26` native `disabled`** — the last DS control that hard-disables (Slider's
   `:146` is the other, but only `Session.tsx:1868` gates it). 17 live sites, 5 gate on `busy` ⇒ the
   switch disables itself under your focus. Port Button's soft pattern.
   ⚠️ `upgrade.spec.ts:49` / `atlas.spec.ts:39` use `getByRole('switch')` + `toBeDisabled()`.
10. **`forms/Switch.jsx:74-78` the inline label is a bare `<span onClick>`** that is ALSO the
    switch's `aria-labelledby` target. Mouse-only activation, no keyboard equivalent, no focus move
    (axe `click-events-have-key-events` shape). `:13` the WRAPPER also carries `cursor:pointer`
    across the `gap` where nothing is clickable. Fix: drop the handler (the `:34-35` density hit box
    already covers the target). Name unaffected ⇒ SAFE.
11. ★ **`core/Stepper.jsx:12,24` the `<ol>` is `display:flex` with NO `flexWrap`/`overflow`, and each
    label is `whiteSpace:'nowrap'` with no `overflow:hidden`/`textOverflow`.** `MapBuilder.tsx:1334`
    renders Source · Preview · Result inside the import wizard — on a 393px phone the three 24px
    pucks + connectors + nowrap labels overrun the container. Fix: add `overflow:hidden;
    textOverflow:ellipsis` to the label span (`minWidth:0` is already on the `<li>`). SAFE —
    `'Steps'` and the three step names appear in no spec.
12. **`overlay/Sheet.jsx:20,149-150` bottom sheets are a FIXED `height:'88vh'`, not a max.**
   `AppShell.tsx:956` "Table controls" = 4 compact buttons as an 88%-screen slab. `vh` ≠ the app's
   `--app-viewport-height` (`100dvh`, minus titlebar under Electron).
   Fix: `height:'auto'` + `maxHeight: calc(var(--app-viewport-height) * .88)`.
13. **`system/ProgressMeter.jsx:124-142`** `role="progressbar"` has PRESENTATIONAL CHILDREN (ARIA 1.2)
    so the markers' `title` can never be exposed — difficulty bands are position+colour only
    (WCAG 1.4.1). Also over-budget: with no `valueLabel`, both the readout (`:77`) and valuenow clamp
    to 100% so 150/100 is INVISIBLE, not just unannounced. 7 live sites (EncounterBuilder:709,
    Player:1233, Player:2065).
14. **`system/Skeleton.jsx:19,24,32`** `aria-hidden` at all three returns, no `label` opt-in ⇒ **22 live
    loading placeholders are completely silent to AT**. (`@keyframes dnd-shimmer` IS defined — the
    shimmer itself works. `className="dnd-skeleton"` sits BEFORE `{...rest}` so a caller `className`
    would clobber the reduce-motion rule at `tokens/base.css:55` — LATENT, 0 sites pass one.)
15. **`command/CommandPalette.jsx:314`** inline `outline:'none'` on the `role="combobox"` input — the
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
19. ★ **`core/Card.jsx:12,47-48`** `interactive` WITHOUT an `onClick` still paints `cursor:pointer` +
    a hover elevation lift but gets NO role/tabindex — a false affordance. `onMouseEnter/Leave` also
    sit BEFORE `{...rest}` so a caller's own hover handler kills them. Both LATENT (0 live
    `<Card interactive>`; `Extensions.tsx:1108` documents avoiding it).
20. **`navigation/NavItem.jsx:97-111` + `BottomTabBar.jsx:54-68`** the "session is live" badge dot is
    `aria-hidden` with no text equivalent in BOTH collapsed navs (the expanded sidebar does announce it).
21. **`overlay/Sheet.jsx:216-235`** 36×4 drag-to-dismiss grab handle with ZERO pointer handlers — a
    false affordance on the phone's primary overlay. **`:138`/`:337`** `justifyContent:'stretch'` is
    invalid for flex (footer case LATENT — 0 live `Sheet footer`).
22. **`forms/Checkbox.jsx:33`** `tabIndex={disabled ? -1 : 0}` does what its own comment calls the bug.
    LATENT (0 live `<Checkbox disabled>`).
23. ★ **`navigation/NavItem.jsx:97-111`** the collapsed badge dot is `position:'absolute'` but NavItem
    itself never sets `position:relative` — only `NavRail.jsx:41`'s inline style does. Any future
    `collapsed` consumer that omits it has the dot escape to the nearest positioned ancestor. LATENT.
24. **Hard-coded targets ignoring `--density-touch-target`:** `LayerRow.jsx:327-328` (RowBtn 26px, ×5
    per row — beside a 48×48 opacity button in the SAME row), `ConditionBadge.jsx:85` (24),
    `Chip.jsx:55` (uses the token, but a 44px remove button inflates the whole chip under the
    comfortable profile — LATENT, 0 live `Chip onRemove`), `Toast.jsx:246` (24),
    `Dialog.jsx:303`/`Sheet.jsx:293` (Close 30), `Popover.jsx:213` (Close 28),
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
