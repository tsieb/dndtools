---
name: ds-layer-audit
description: FIXED-vs-OPEN split for visual/interactive defects in apps/gm-react/src/ds/components/** — dead exports, token traps, e2e label coupling, and what is still broken as of run #12 (2026-07-30 @ 9aeebdde)
metadata:
  type: project
---

Design-system audit of `apps/gm-react/src/ds/components/**` + `src/ds/index.d.ts`.
NOTE: `screen-kit` lives at **`src/app/screen-kit.tsx`**, not `src/screens/` — task briefs cite the wrong path.
NOTE: the global focus ring is in **`styles/tokens/base.css`** (NOT `styles/base.css` — that file does not exist).

**How to apply:** these are STRUCTURAL classes; every consuming screen inherits them. Fix once in `ds/`,
not per-screen. Re-verify before reporting — this file has been wrong before (see the "corrections" block).

## LIVE-vs-DEAD map (re-grepped 2026-07-30 @ 9aeebdde — do NOT spend effort on the dead column)

**DEAD, zero consumers:** `core/Breadcrumb`, `core/Tooltip`, `navigation/NavSidebar`,
`map/LayerPanel`, `map/ToolPalette`, `map/FogControls`, `map/GenerationPanel`, `map/ImportWizard`,
`creature/StatBlock`, `domain/InitiativeRow`, `spell/SpellCard`. Latent: `DataTable`'s
`sortable`/`onSort`, `Chip`'s `onRemove`, `Toaster.error(msg,{action})`.
⚠️ **LIVE, do not call dead:** `navigation/NavItem` (NavRail → `AppShell.tsx`), `map/Minimap`
(`EditorCanvas.tsx`), `map/MapCreationForm` (`Atlas.tsx`), `campaign/QuestCard` (`Campaign.tsx`),
`spell/SpellSlots` (Player/Characters), `condition/ConditionTracker` (Characters),
`system/ProgressMeter` (EncounterBuilder + Player ×2), `core/Stepper` (MapBuilder),
`Slider steppers` (Audio.tsx:884,1350 via the `CommitSlider` wrapper at Audio.tsx:229).
Use `grep -rl "<Comp\b"` — `grep "<Comp[ />]"` MISSES multi-line JSX and produced a false "dead" list once.

## FIXED — do NOT re-report

- **Run #12 (9aeebdde):** `Input`/`Textarea`/`Select` inline `outline:'none'` GONE, real focus-ring
  tokens · `ToastViewport` `aria-atomic="false"` + `overflowY:'auto'` + `data-modal-exempt` ·
  `LayerRow` Enter/F2 rename (name unchanged) · `platform/modalIsolation` `data-modal-exempt` opt-out.
- **Run #11 (7bdf2908):** `Slider` focus ring + 24px thumb · `Sheet` opens on the BODY not Close ·
  `VisibilityChip` no longer double-announces · `DefinitionList` `minmax(0,auto) minmax(0,1fr)`.
- `Tabs` ARIA `idBase`/`aria-controls`/`tabPanelProps()` — all 7 consumers wired.
- Radiogroups: `SegmentedControl` + screen-kit `Seg` roving-tabIndex + Arrow/Home/End; all 6
  `<SegmentedControl>` call sites pass `ariaLabel`.
- 24px targets: `Checkbox`, `Switch`, `Chip.onRemove`, `Slider.stepBtn` all on `--density-touch-target`.
- `DataTable` overflow wrapper (`:16`). `POIMarker:39` `--color-text-inverse`. `Button` danger
  `--color-status-error-foreground`. `Minimap` jump = real `<button>` + arrow panning.
- `Popover`/`Dialog`/`Sheet`/`CommandPalette` focus-in, trap, Escape, focus-return, scroll-lock.
- `Field` auto-`htmlFor`, `aria-required`, `aria-describedby` + `role="alert"`.
- Clean on structural read: `Card`, `EmptyState`, `Badge`, `LayerTypeBadge`, `StatPill`, `Stat`,
  `SessionTimeline`, `AbilityScore`, `HPBar`, `DiceResult`, `DataTable`, `SegmentedControl`, `Field`.

## ⚠️ CORRECTIONS to my own earlier claims (verified wrong at 9aeebdde)

1. `Tabs.jsx` — `{...rest}` at `:60` is AFTER the `aria-label="Sections"` literal at `:50`, so a caller
   CAN override it. The old note said the opposite. The real gap is that none of the 7 call sites does.
2. `ProgressMeter` is NOT an unnamed progressbar in practice — all three live sites
   (`EncounterBuilder.tsx:685`, `Player.tsx:1235`, `Player.tsx:2055`) pass a STRING `label`.
   The only live gap is the missing `aria-valuetext` (EncounterBuilder's `"12 / 40 pts"` is painted,
   never announced).
3. `LayerTypeBadge:42/:51` `background:` + `backgroundImage:` is NOT the shorthand trap — React applies
   style keys in object order, so the later `backgroundImage` wins and `background-color` survives.
4. `map/POIMarker`/`POIPopover` are live via `MapBuilder.tsx` + `EditorCanvas.tsx:783` + `Atlas.tsx:620`.

## STILL OPEN (run #12, ranked by user impact)

1. **`core/Popover.jsx:86-102` — no viewport collision clamp.** `left:anchor.x` + `translate(-50%,…)`,
   `width:320`, `maxWidth:90vw`, no clamp/flip. `anchor.x` is a **percent of the map well**
   (`MapBuilder.tsx:1061-1066`), so a POI in the outer ~40% of a 393px phone canvas renders half
   off-screen and the POIPopover footer (Focus on map / Edit / link) is unclickable. Live:
   `EditorCanvas.tsx:783`, `Atlas.tsx:620`, `POIPopover.jsx:70`. Vertical IS handled by the consumer
   (`placement = v.y < 0.42 ? 'bottom' : 'top'`); horizontal is not.
2. **`map/MapCreationForm.jsx:64` hard `disabled={!name.trim()||submitting}`** makes the soft path
   already written at `:26` (`setTouched(true)`) DEAD CODE, and `Field`'s error only fires on blur.
   Trivially safe fix: drop `!name.trim()`. No e2e names "Create map".
3. **`campaign/QuestCard.jsx:60-70`** — objectives have no `aria-pressed`, so `done` is strikethrough-only
   (silent to AT); and `disabled={!onToggleObjective}` (`:62`) makes a read-only quest's whole checklist
   native-disabled/out of tab order. Live `Campaign.tsx:187-199`.
4. **`condition/ConditionTracker.jsx:29-50`** add button ≈21px (below the 24px floor, vs 44px comfortable).
   Also `:15` — "No conditions" only renders when `!addable`, contradicting the docstring.
5. **`spell/SpellSlots.jsx:32-41`** 16×16 pip buttons. NB the `rotate(45deg)` is ON the button, so
   growing it rotates the hit box — move the rotate to the inner span when fixing.
6. **`map/Minimap.jsx:53`** "Collapse minimap" `padding:2` + 14px icon ≈18px, while its Expand twin
   (`:18`) is a correct 36×36.
7. **`forms/Slider.jsx:107-116` (`stepBtn`)** — the WCAG-2.5.7 non-drag −/+ alternative is a STATIC
   style object with NO `onMouseEnter/Leave` ⇒ zero pointer feedback (no global `button:hover`).
   Same gap `IconButton.jsx:49` was fixed for. LIVE at `Audio.tsx:884,1350`.
8. **`core/Tabs.jsx:50`** all 7 live tablists announce "Sections" (no call site overrides).
   **`:93-113`** inactive tabs have no hover at all (only `transition:'color'`).
9. **`system/Skeleton.jsx:19,24,32`** every variant `aria-hidden="true"`, no `role="status"`/label opt-in
   ⇒ total silence during loads. Live: Atlas/Extensions/Community/Settings.
10. **`feedback/StatusDot.jsx`** — `:49 if(!label) return dot;` silently drops `style` AND `{...rest}`
    (latent: no live caller passes them). The LIVE half: 6 sites use it with no label and no adjacent
    text — `Atlas.tsx:491` signals "pushed to players" with a green dot alone, and forced-colors
    flattens every status colour to `CanvasText`. Its own docstring forbids this.
11. **`navigation/NavItem.jsx:51-53` + `BottomTabBar.jsx:54-68`** collapsed/mobile badge dot is
    `aria-hidden` with no text equivalent (the expanded sidebar DOES announce the count).
12. **`core/Avatar.jsx:28`** the `ring` state (active/turn/danger) is `box-shadow`-only — not painted
    under forced-colors — and has no text equivalent. `:33` initials/`alt={name}` not `aria-hidden`
    ⇒ "T S" then "Tanya Strom" next to the visible name. 9 live sites.
13. **`condition/ConditionBadge.jsx:85`** Clear button hard-codes 24×24 instead of
    `var(--density-touch-target,24px)` like every migrated sibling. Phone combat hot path.
14. **`feedback/VisibilityChip.jsx:19`** collapses `shared` → "Players" while `map/LayerRow.jsx:29-33`
    models `shared` as a distinct third state. Product decision, not a code fix.
15. **`command/CommandPalette.jsx:314`** inline `outline:'none'` on the combobox input — same class HEAD
    just fixed elsewhere. Mitigated: Tab is trapped (`:222-227`) and the input is the only focusable child.
16. **Systemic latent: `{...rest}` spread AFTER the component's own handlers** — `Button.jsx:117`,
    `IconButton.jsx:51`, `Chip.jsx:50`, `Checkbox.jsx:29`, `Switch.jsx:43`, `Tabs.jsx:60`,
    `NpcCard.jsx:46`. Verified NO live consumer passes a colliding handler today (every
    `onMouseEnter/Leave` in app/screens is on a raw element), so this is latent, not broken.
    `Input`/`Select` already solve it properly with `composeFocus`.
17. **`overlay/Toast.jsx:314,320`** `pointerEvents:'none'` + `overflowY:'auto'` — the new scroll range
    cannot be scrolled by wheel/touch (the container is not a hit target) and has no `tabindex`; only
    the keyboard scroll-into-view path reaches a clipped row.
18. **`overlay/Sheet.jsx:19`** `SIDE_SIZE.bottom='88vh'` inside a `100dvh` scrim with `align:flex-end`
    (`:131`) ⇒ where browser chrome takes >12 %, the panel overflows at the TOP and the title + Close go
    off-screen. UNVERIFIED — mobile-chromium has no dynamic URL bar so the gate cannot catch it.
19. **`map/MapCreationForm.jsx:48`** `'1fr 1fr'` with no `minmax(0,…)`/collapse for two Selects at 375px.
20. **`core/Stepper.jsx:24`** nowrap labels in a non-wrapping `<ol>` (`MapBuilder.tsx`). UNVERIFIED at 375px.
21. **`navigation/NavItem.jsx:46`** `aria-hidden={!collapsed}` is INVERTED, and `Icon.jsx:532` spreads
    `{...rest}` after `{...a11y}` (`:531`), so the collapsed rail icon is emitted `aria-hidden="false"`
    with no name. Harmless today (the button owns the name); the expression reads backwards.
22. **`feedback/StatusDot.jsx:42-46`** re-emits its `@keyframes` `<style>` per instance (7 live sites).
23. **Unguarded enum maps degrade silently:** `Icon.jsx:527` (`GLYPHS[p] || Square`),
    `StatusDot.jsx:16` (`colors[status] || colors.idle`).
24. **`ds/index.d.ts:7`** every export is `ComponentType<Record<string,unknown>>` — `idBase`, `ariaLabel`,
    `label` unenforceable at compile time, so every regression above can silently reappear.

## Token-layer landmines (read BEFORE writing any color/theme finding)

- **`--color-visibility-dm{,-subtle}` are UNDEFINED** yet written at 7 sites in `PlayerView`/`Player`/
  `Community`. Real names: **`--color-dm-only-badge` / `--color-dm-only-subtle`** (the ds itself is correct).
- `:root` `--layer-*` are LIGHT; only `[data-theme='parchment']` re-cuts them DARK. A white glyph on
  them breaks in the DEFAULT theme, not parchment.
- `--color-interactive-selected` (16 % alpha, ~1.4:1) is a SELECTION wash, NOT a focus colour — the repo
  has a TEST saying so (`ds-interaction-fixes.test.tsx`). The ring is `--focus-ring-{width,offset,color}`
  applied globally by `styles/tokens/base.css`. Any inline `outline:'none'` defeats it.
- `--density-touch-target` = 2rem desktop / **2.75rem comfortable (all mobile/tablet)** / 1.75rem compact.
  `--touch-target-floor` = 1.5rem hard minimum.
- forced-colors (`colors.css:364+`) flattens ALL status colours to `CanvasText` and all `-subtle` to
  `Canvas`, so status differentiation there rests entirely on the redundant ICON. **`box-shadow` is not
  painted in forced-colors; `outline` and `border` are.**
- `isolateModalSiblings` inerts everything outside an open overlay; `data-modal-exempt` is the opt-out
  (only `ToastViewport` uses it).
- `[data-motion]` in `styles/index.css` globally zeroes animation, so per-component
  `prefers-reduced-motion` is genuinely unneeded. z-index IS fully tokenized.

## e2e coupling (grepped 2026-07-30 — SAFE column = no spec references the label)

**SAFE to change:** `'Collapse minimap'` / `'Expand minimap'` / `'Minimap'` / `'Jump viewport'` ·
`'Create map'` · `'Condition'` (the tracker add button) · `getByRole('tablist')` / `'Sections'` ·
`'Steps'` (Stepper) · `'Level n slot n'` (SpellSlots) · `role('progressbar')` · `'Dismiss'` (Toast) ·
`'DM only'` as an a11y name · Skeleton (nothing references it).

**LOCKED — a rename breaks a spec:**
- `android-quick-map.spec.ts:291,298,299` pins **`'Visibility: dm-only'` / `'Visibility: players'` /
  `'Visibility: shared'`** and `map-editor.spec.ts:521` pins `/^Visibility:/` ⇒ **LayerRow.jsx:142's
  raw-enum accessible name CANNOT be humanised without updating 2 specs.**
- `android-quick-map.spec.ts:277-284` `'Base: DM display on/off'` (LayerRow `:132`).
- `android-quick-map.spec.ts:185-233` `'Point of interest'`, `'POI: New POI'` — places a POI at
  0.7×width and dismisses with Escape; it never clicks INSIDE the popover, so a Popover clamp is safe.
- `map-editor.spec.ts:506-509` dblclicks the layer name button (`exact:true`).
- `campaign.spec.ts:119` clicks `getByRole('button',{name:'Find who is buying the shipments'})` — the
  QuestCard objective button, AUTHORABLE case only. Adding `aria-pressed` / changing only the
  read-only branch is safe; renaming or de-buttoning the authorable row is not.
- `command-palette.spec.ts:88-118` `getByRole('option')` names.
- `onboarding-consent.spec.ts` / `settings.spec.ts` radiogroup names.

`a11y-axe-gate.spec.ts` sweeps 17 routes but only each route's DEFAULT tab, so DS defects behind a
non-default tab are invisible to it.

See [[gm-react-ds]], [[completion-pass-ux-patterns]], [[onboarding-viewas-cluster]].
