---
name: ds-layer-audit
description: FIXED-vs-OPEN split for visual/interactive defects in apps/gm-react/src/ds/components/** — which DS exports are dead, which token traps exist, and what is still broken as of run #11 (2026-07-30 @ 7bdf2908)
metadata:
  type: project
---

Design-system audit of `apps/gm-react/src/ds/components/**` + `src/ds/index.d.ts`.
NOTE: `screen-kit` lives at **`src/app/screen-kit.tsx`**, not `src/screens/` — task briefs cite the wrong path.
NOTE: the global focus ring is in **`styles/tokens/base.css:35-39`** (NOT `styles/base.css` — that file does not exist).

**How to apply:** these are STRUCTURAL classes; every consuming screen inherits them. Fix once in `ds/`,
not per-screen. Re-verify before reporting — this file has been wrong before.

## LIVE-vs-DEAD map (re-grepped 2026-07-30 @ 7bdf2908 — do NOT spend effort on the dead column)

**DEAD, zero consumers:** `core/Breadcrumb`, `core/Tooltip`, `navigation/NavSidebar`,
`map/LayerPanel`, `map/ToolPalette`, `map/FogControls`, `map/GenerationPanel`, `map/ImportWizard`,
`creature/StatBlock`, `domain/InitiativeRow`, `spell/SpellCard`. Also latent: `DataTable`'s
`sortable`/`onSort` (2 consumers, neither passes it) and **`Chip`'s `onRemove`** (re-grepped run #11:
every live `onRemove=` in app/screens goes to ConditionBadge / SceneBoardCanvas / SceneEditor, none to Chip).
⚠️ **`navigation/NavItem` is NOT dead** — `NavRail` (live at `app/AppShell.tsx:710`) imports it.

## FIXED — do NOT re-report

- **NEW in run #11 (commit 7bdf2908):** `Slider` focus ring (now `--focus-ring-*`, `outline:none` gone,
  `Slider.jsx:20-21`) · `Slider` thumb now **24×24** both engines (`:22-26`) · `Sheet` opens focused on
  the BODY not Close (`Sheet.jsx:57-58`, + bounded `height` so the body owns the scroll) ·
  `VisibilityChip` no longer double-announces (`:27,47` — icon `label` only when `compact`) ·
  `DefinitionList` now `minmax(0,auto) minmax(0,1fr)` (`:28`).
  These are locked by `ds/components/ds-interaction-fixes.test.tsx:507-545`.
- `Tabs` ARIA: `idBase` → `id` + `aria-controls`, `tabPanelProps()` exported, all 7 consumers wired.
- Radiogroups: `SegmentedControl` + `screen-kit`'s `Seg` both roving-tabIndex + Arrow/Home/End.
  ✅ **All 6 live `<SegmentedControl>` call sites pass `ariaLabel`** (MapBuilder, ToolOptionsBar ×4,
  ParamControls, MapEditor, Extensions ×2) — do not re-report "unnamed radiogroup".
- 24px targets: `Checkbox` (`:25-26`), `Switch` (`:34-35`), `Chip.onRemove` (`:55`),
  `Slider`'s `stepBtn` (`:112`) all use `var(--density-touch-target)`.
- `DataTable` NOW has the `maxWidth:100%; overflowX:auto` wrapper (`:16`).
- `POIMarker:39` uses `var(--color-text-inverse)`. `Button` danger uses `--color-status-error-foreground`
  (defined in all 4 themes + forced-colors).
- `Minimap` jump surface is a real `<button>` with arrow-key panning (`:41-59`).
- `Toast`: permanent live-region wrapper + pausable auto-dismiss (hover AND focus flags).
  ✅ `Toaster.error(msg, {action})` (7 s duration overriding the action's `0`) has **zero live callers** — latent.
- `Popover`: `returnFocusRef` + body-first initial focus. `Dialog`: `backdropDismissible`, `initialFocus`.
- `Input`/`Select`/`Textarea`: `composeFocus` — `{...rest}` no longer clobbers the ring handlers.
- `Field`: auto-`htmlFor`, `aria-required`, `aria-describedby` + `role="alert"` on error.
- `Card`, `EmptyState`, `Skeleton`, `Badge`, `LayerTypeBadge`, `StatPill`, `Stat`, `Avatar`,
  `SessionTimeline`, `AbilityScore`, `HPBar`, `DiceResult`, `Stepper`, `BottomTabBar` read clean structurally.

## STILL OPEN (run #11, ranked)

1. **`map/LayerRow.jsx:183-205` — layer rename is DOUBLE-CLICK ONLY.** The name is a `<button>` with
   `onDoubleClick` and NO `onClick`/`onKeyDown`: a focusable dead control. `onRename` is live at
   `app/map/dock/LayersPanel.tsx:160`, and that wrapper's Enter/Space handler (`:136-142`) bails unless
   the target IS the `[role=listitem]`, so Enter on the name does literally nothing. WCAG 2.1.1.
   ⚠️ `tests/e2e/map-editor.spec.ts:506-509` `dblclick`s `getByRole('button',{name:'Base',exact:true})` —
   a fix must NOT change the accessible name and must NOT add a single-click `onClick`.
2. **`forms/Input.jsx:14,19` + `forms/Select.jsx:33,4` — inline `outline:'none'` kills the global 2px gold
   ring on EVERY text field / dropdown / textarea**, replaced by `0 0 0 3px var(--color-interactive-selected)`
   — the exact 16 %-alpha wash the repo's own `ds-interaction-fixes.test.tsx:530-532` forbids for Slider.
   Only a 1px border swap survives. Same defect class the Slider fix just closed; Input/Select were missed.
3. **`core/Popover.jsx:86-102` — no viewport collision handling.** `left:anchor.x` + `translate(-50%,…)`,
   `width:320`, `maxWidth:90vw`, no clamp/flip. A POI near a screen edge (or near the top with
   `placement='top'`) renders half off-screen at 375px. Live: `app/map/canvas/EditorCanvas.tsx:784`,
   `screens/Atlas.tsx:620`. Spec-adjacent: `android-quick-map.spec.ts:185-233` drives POI markers.
4. **`map/MapCreationForm.jsx:64` — hard `disabled={!name.trim()||submitting}`** on Create map with no
   explanation; `Field` only shows the error after blur. The repo's own soft-disable (`aria-disabled`,
   `Button.jsx:20-26`) exists for exactly this. Live: `screens/Atlas.tsx:582`. No e2e locks it.
5. **`condition/ConditionBadge.jsx:85` — Clear button hard-codes `minWidth/minHeight:24`**, ignoring
   `--density-touch-target` (44px on the comfortable/phone profile) that every sibling migrated to.
   Live in the phone combat hot path: `screens/Session.tsx:917`, `screens/Characters.tsx:1143`.
6. **`map/Minimap.jsx:53` — "Collapse minimap" is `padding:2` + a 14px Icon ≈ 18×18**, below the 24px
   floor, while its "Expand minimap" twin (`:18`) is a correct 36×36. Live: `EditorCanvas.tsx:998`.
7. **`overlay/Toast.jsx:328` — the polite wrapper is `role="status"`, whose implicit `aria-atomic` is
   `true`**, so it wraps the WHOLE stack: adding a 2nd toast re-announces every visible toast.
   Needs an explicit `aria-atomic="false"` on the wrapper (`Toast` rows already drop their own).
8. **`navigation/NavItem.jsx:51-53` — the COLLAPSED badge dot is `aria-hidden` with no text equivalent**
   (same class as `BottomTabBar:54-68`, but this is the desktop/tablet NavRail at `AppShell.tsx:710`).
9. **`overlay/Toast.jsx:309-310` — `maxHeight: var(--app-viewport-height)` + `overflow:'hidden'`**: a tall
   stack clips silently, so toasts past the fold are unreadable AND their Dismiss/Undo unclickable.
10. **`system/Skeleton.jsx:19,24,32` — every variant is `aria-hidden="true"` with no `role="status"` /
    "Loading" affordance and no `label` prop**, so a screen-reader user gets total silence during loads.
11. **`feedback/VisibilityChip.jsx:19` collapses `shared` → "Players"** while `map/LayerRow.jsx:29-33` and
    `map/POIPopover.jsx:167` model `shared` as a distinct THIRD state with its own icon + colour.
12. **`core/Tabs.jsx:50` hard-codes `aria-label="Sections"`** — all 7 tablists announce identically; no
    consumer overrides it (`{...rest}` is spread before the literal). Also `:93-113` no inactive hover.
13. **`campaign/QuestCard.jsx:60-70`** objectives: no `aria-pressed`; `disabled={!onToggleObjective}` (`:62`)
    makes a read-only quest's checklist keyboard-unreachable. Live `screens/Campaign.tsx:187`.
14. **`spell/SpellSlots.jsx:32-34`** 16×16 `rotate(45deg)` pips at `gap:var(--space-1)`.
15. **`condition/ConditionTracker.jsx:30-50`** add button ≈21px, accessible name only "Condition"
    (`<Icon name="add">` at `:49` has no `label` ⇒ aria-hidden). Also `:15` — the "No conditions" empty
    text only renders when `!addable`, contradicting its own docstring.
16. **`system/ProgressMeter.jsx:36`** `aria-label` only when `label` is a `string`; no `aria-valuetext`.
17. **`campaign/NpcCard.jsx:28-29`** `onClick` + `cursor:pointer` on a bare `<article>` (mouse-only
    duplicate path; the heading button at `:59` IS the real tab stop, so this is now cosmetic).
18. **`overlay/Sheet.jsx:19`** `SIDE_SIZE.bottom='88vh'` vs the app's `--app-viewport-height:100dvh`.
    UNVERIFIED on device; mobile-chromium has no dynamic URL bar so the gate can't catch it.
19. **Unguarded enum maps degrade silently:** `core/Icon.jsx:527` (`GLYPHS[p] || Square`),
    `feedback/StatusDot.jsx:16` (`colors[status] || colors.idle`).
20. **`feedback/StatusDot.jsx:42-46`** re-emits its `@keyframes` `<style>` per instance (10 sites).
21. **`core/Stepper.jsx:24`** `nowrap` labels in a non-wrapping `<ol>` (MapBuilder.tsx:1329). UNVERIFIED at 375px.
22. **`screen-kit.tsx:22-32`** `radioGroupKeyDown` has no Home/End and doesn't filter disabled radios.
    **`screen-kit.tsx:254-271`** BackBar target ≈17px.
23. **`ds/index.d.ts:7`** every export is `ComponentType<Record<string, unknown>>` — `idBase`, `ariaLabel`,
    `label` are unenforceable at compile time, so every regression above can silently reappear.

## Token-layer landmines (read BEFORE writing any color/theme finding)

- **`--color-visibility-dm{,-subtle}` are UNDEFINED** yet written at 7 sites in
  `screens/PlayerView.tsx:281-285,1794-1799`, `screens/Player.tsx:2252-2253`, `screens/Community.tsx:640-641`.
  Real names: **`--color-dm-only-badge` / `--color-dm-only-subtle`**.
- `:root` `--layer-*` are LIGHT (tuned for the candle-lit map well); only `[data-theme='parchment']`
  re-cut them DARK. A white glyph on them breaks in the DEFAULT theme, not parchment.
- `--color-interactive-selected` (16 % alpha, ~1.4:1) is a SELECTION wash, NOT a focus color — the repo
  now has a TEST saying so. The real ring is `--focus-ring-{width,offset,color}` (2px / 2px / #e0b06f),
  applied globally by **`styles/tokens/base.css:36-39`**. Any inline `outline:'none'` defeats it.
- `--density-touch-target` = 2rem desktop / **2.75rem comfortable (all mobile/tablet)** / 1.75rem compact
  (`styles/tokens/spacing.css:107/119/131`). `--touch-target-floor` = 1.5rem hard minimum.
- forced-colors (`colors.css:364-410`) flattens ALL status colours to `CanvasText` and all `-subtle` to
  `Canvas` — so status differentiation there rests entirely on the redundant ICON. `box-shadow` is not
  painted in forced-colors, so any focus/selection cue built on box-shadow disappears; border does survive.
- z-index IS fully tokenized; `[data-motion]` in `styles/index.css` globally zeroes animation, so
  per-component `prefers-reduced-motion` is genuinely unneeded.
- The legacy alias bridge (`colors.css:319-328`) has ZERO consumers. `--color-bg` IS defined everywhere.

## e2e coupling

No spec locks: `getByRole('tablist')`, `'All sections'`, `'DM only'` (as an a11y name), `role('slider')`,
`'Minimap'`, `'Jump viewport'`, `'Expand/Collapse minimap'`, `'Create map'`, `'Dismiss'` (Toast's).
DO lock: `map-editor.spec.ts:506-509` (layer name button, `exact:true`, via `dblclick`) ·
`android-quick-map.spec.ts:277-284` (`'Base: DM display on/off'`) · `:185-233` (`'Point of interest'`,
`'POI: New POI'`) · `command-palette.spec.ts:88-118` (`getByRole('option')` names) ·
`onboarding-consent.spec.ts` / `settings.spec.ts` (radiogroup names "Vault privacy mode",
"Experience complexity"). `a11y-axe-gate.spec.ts:24-38,177-178` sweeps 17 routes but only each
route's DEFAULT tab, so DS defects behind a non-default tab are invisible to it.

See [[gm-react-ds]], [[completion-pass-ux-patterns]], [[onboarding-viewas-cluster]].
