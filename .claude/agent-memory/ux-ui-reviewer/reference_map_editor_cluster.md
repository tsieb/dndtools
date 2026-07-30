---
name: map-editor-cluster
description: Structure and recurring defect patterns of the gm-react map/atlas cluster (Atlas → MapBuilder wrapper → app/map/MapEditor + ToolRail/ToolOptionsBar/dock/canvas), incl. the Popover z-index gotcha
metadata:
  type: reference
---

## Surface map (verify before citing — these were true 2026-07-29)
- `screens/Atlas.tsx` is the map library; its "Open in map editor" mounts `MapBuilder`, which since
  MAP-021 is only a thin back-compat wrapper (`app/MapBuilder.tsx` ~line 1656) that renders
  `app/map/MapEditor.tsx`. `MapBuilder.tsx` still owns the shared renderer (`MapCanvas`,
  `FeatureShape`, `VIS_CHIP`, `dsToVis/visToDs`) that BOTH Atlas and the editor consume.
- Editor split: `useMapEditor.ts` (state + local undo stack) · `tools.ts` (TOOL_GROUPS grammar) ·
  `ToolRail` · `ToolOptionsBar` (verb params) · `dock/{Inspector,Layers,Assets,History}Panel` (noun
  params) · `canvas/EditorCanvas` · `generate/{GeneratePanel,ParamControls}` · `keyboard.ts`. None of
  ToolRail/ToolOptionsBar/dock leaf panels read `isPhone` themselves — MapEditor.tsx (the orchestrator)
  owns all `isPhone`/`quickMapMode` branching and passes plain props down; that's correct layering,
  not a gap.
- Two gesture owners on one canvas: `EditorCanvas`'s own overlay handles the tools in its
  `DRAWING_TOOLS` set; `MapCanvas` handles select/pan/poi/token/fog. A tool in NEITHER set is
  silently inert (Route tool WAS this bug — fixed 2026-07-29 commit 5274a5f9).

## Recurring defect patterns in this cluster
1. **`Popover` has no z-index unless you pass `anchor`.** `ds/components/core/Popover.jsx` only
   applies `zIndex: var(--z-overlay)` inside its `anchor` branch. Every inline/`style`-positioned
   Popover must supply its own `zIndex` or it paints under later DOM-order positioned siblings.
   FIXED (has explicit zIndex): MapEditor.tsx header export menu (30), LayersPanel.tsx row action
   menu (20), ToolOptionsBar's SnapMenu. **STILL OPEN as of 5274a5f9**:
   `ds/components/map/LayerRow.jsx:219-224` — the per-row **opacity** Popover (`opacityOpen` state,
   wraps a `<Slider>`) has NO `zIndex` in its `style` prop, unlike its sibling action-menu Popover in
   the same file's parent (LayersPanel.tsx) which does. Symptom: opening the opacity flyout on any
   layer row other than the last can paint it underneath a later layer row's own positioned wrapper
   (position:relative elements paint in DOM order when z-index:auto), making the slider invisible/
   unclickable. Minimal fix: add `zIndex: 20` (matching LayersPanel's row-menu convention) to that
   Popover's inline style.
2. **Clamp-on-every-keystroke number inputs — FIXED 2026-07-29.** `ToolOptionsBar.NumberControl` and
   `generate/ParamControls.ParamControl` now both hold raw draft text and commit (clamped) on
   blur/Enter; the Slider/steppers still clamp live. Re-verify this pattern on any NEW number+slider
   pairing added to either file.
3. **One `ToolOptions` key serving two tools — FIXED 2026-07-29** (Label tool now owns `labelText`,
   no longer collides with Stamp's `stampAsset`).
4. **`editor.run()` is single-flight** (`busyRef` in `useMapEditor.ts` ~line 270-273): concurrent
   calls silently return `false` while one is in flight. Bulk paths (HistoryPanel jumps, bulk delete/
   visibility, keyboard deleteSelection) were fixed to await/serialize. **STILL OPEN as of 5274a5f9:
   three continuous `<Slider>` controls dispatch `run()`/a run-backed patch directly from `onChange`,
   which fires on every drag step** (React's onChange for `type=range` fires like `input`, not just on
   release) — so a fast drag silently drops most intermediate dispatches with zero user-visible
   feedback (no error, no queue, just an unresponsive-feeling slider that "catches up" late):
   - `app/map/dock/InspectorPanel.tsx:328-343` — map overlay "Cells across" (grid size) slider,
     `onChange` directly does `void run({type:'map.configure-overlay', ...})`.
   - `app/map/dock/InspectorPanel.tsx:576-585` — token "Size" slider, `onChange` calls `patch({size:v})`
     which is itself `run`-backed (see the `patch` helper a few lines above in the same file).
   - `ds/components/map/LayerRow.jsx:226-235` → `app/map/dock/LayersPanel.tsx` `onOpacityChange` —
     layer opacity slider, same direct-dispatch-per-step shape.
   Contrast with `generate/ParamControls.tsx`'s number/slider controls, whose `onChange` only updates
   LOCAL React state (`setParam`) until the user hits Generate/Accept — those are NOT affected because
   nothing hits `editor.run()` per drag step. The general fix shape (not yet applied here) is what
   `NumberControl`/`ParamControl` already did for typing: hold intermediate value in local state,
   dispatch once on release/blur, OR debounce the dispatch.
5. **Fire-and-forget `void run(...)` followed by an immediate `announce()`/`clearSelection()`** —
   the bulk paths were fixed 2026-07-29; single POI/token delete was also fixed (now awaited). Re-check
   `deriveAll` if touched again.
6. **Renderer flattens authored variety.** `FeatureShape` (in `MapBuilder.tsx`) draws every `prop`
   feature as the same circle regardless of `style`, so the whole Assets browser has no visible effect
   on the canvas. Still true 2026-07-29, not touched by any recent fix pass.
7. `ds/components/map/Minimap.jsx` jump target was fixed 2026-07-29 (real `<button>` + arrow-key pan).

## Theming gap confirmed 2026-07-29 (map/layer tokens)
`--layer-*`/`--map-*` tokens (`styles/tokens/colors.css:258-282`) live in an UNCONDITIONED `:root`
block — no override in `[data-theme='parchment']` (144-191), `[data-theme='high-contrast']`
(196-243), or the `@media (forced-colors: active)` remap (306-352). Every other semantic
`--color-*` token gets all three treatments; these thirteen layer hues + `--map-canvas-bg`/
`--map-grid-line`/`--map-fog-fill` get none. CONCRETE, VERIFIED contrast break (not just a
theoretical gap): `ds/components/map/LayerTypeBadge.jsx:42-43` sets `color: var(--layer-*)` (a
light OKLCH color, L≈0.7–0.78, tuned for the dark tavern `--color-surface:#1f1810`) directly as the
badge TEXT color, with the badge background mixed from the SAME token at 16% against
`--color-surface`. In `[data-theme='parchment']`, `--color-surface` becomes `#fdf8f0` (near-white)
but the text-color token is unchanged — light text on a near-white background, a real WCAG 1.4.3
failure on every layer-type badge (LayersPanel rows), and by the same mechanism on
`ds/components/map/POIMarker.jsx`/`POIPopover.jsx`'s category dot colors and
`LayerRow.jsx:90`'s `--layer-dm` left-border accent. Minimal fix: add a parchment-tuned override
block for the thirteen `--layer-*` tokens (darker/more saturated so L drops for AA against a light
surface) plus a forced-colors remap (likely collapsing them to `CanvasText`/`Highlight` alongside
the existing semantic remap).

## Constraints to respect when proposing fixes here
- Ids for maps/routes/layers/features come from `runtime.newId()` via `editor.nextId()` (PLAT-006);
  `map.create-layer`'s `id` is OPTIONAL in core (`commands/map-layer.ts`), so Atlas omitting it is
  NOT a bug.
- The canvas zoom cluster + `[`/`]`/`+`/`-`/`0` keymap is a required a11y affordance (UX-CANVAS) —
  never propose removing it.
