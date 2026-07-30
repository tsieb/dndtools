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
- Editor split: `useMapEditor.ts` (state + single-flight `run()` + local undo stack) ·
  `tools.ts` (TOOL_GROUPS grammar) · `ToolRail` · `ToolOptionsBar` (verb params) ·
  `dock/{Inspector,Layers,Assets,History}Panel` (noun params) · `canvas/EditorCanvas` ·
  `generate/{GeneratePanel,ParamControls}` · `keyboard.ts`.
- Two gesture owners on one canvas: `EditorCanvas`'s own overlay handles the tools in its
  `DRAWING_TOOLS` set; `MapCanvas` handles select/pan/poi/token/fog. A tool in NEITHER set is
  silently inert. That set and `PATH_TOOLS` drifting apart is a live bug class (Route tool).

## Recurring defect patterns in this cluster
1. **`Popover` has no z-index unless you pass `anchor`.** `ds/components/core/Popover.jsx` only
   applies `zIndex: var(--z-overlay)` inside its `anchor` branch. Every inline/`style`-positioned
   Popover must supply its own `zIndex` or it paints under later positioned siblings (the canvas
   well). Header export menu (zIndex 30) and LayersPanel row menu (zIndex 20) do; ToolOptionsBar's
   SnapMenu does not. Check this on ANY new inline Popover, repo-wide.
2. **Clamp-on-every-keystroke number inputs.** `ToolOptionsBar.NumberControl` and
   `generate/ParamControls` both do `onChange={e => commit(clamp(Number(e.target.value)))}` on a
   controlled `type=number`, so a multi-digit or cleared value is impossible to type. Any new
   slider+number pair here will likely copy it — the fix pattern is raw string state committed on
   blur/Enter.
3. **One `ToolOptions` key serving two tools.** `stampAsset` is shared by Stamp and the Label
   (`text`) tool via a `text:` prefix hack, so the tools corrupt each other. When reviewing new
   tools, check `ToolOptions` (in `useMapEditor.ts`) for key reuse; also `options.brushSize` doubles
   as the fog brush radius with no fog-side control.
4. **`editor.run()` is single-flight and returns false when re-entered.** Loops over a selection and
   per-drag-step slider dispatches MUST await/commit-on-release or values are silently dropped.
   Several sites were already fixed for this (HistoryPanel jumps, bulk delete/visibility,
   keyboard deleteSelection); sliders (grid size, token size, layer opacity) still dispatch per step.
5. **Fire-and-forget `void run(...)` followed by an immediate `announce()`/`clearSelection()`** —
   announces success even when the command was rejected. Fixed in the bulk paths, still present in
   the single POI/token delete and `deriveAll`.
6. **Renderer flattens authored variety.** `FeatureShape` draws every `prop` feature as the same
   circle regardless of `style`, so the whole Assets browser has no visible effect on the canvas.
7. `ds/components/map/Minimap.jsx` jump target is a bare `div onClick` (no role/tabIndex) and paints
   a hardcoded decorative texture when no `thumb` is passed — the editor passes none.

## Constraints to respect when proposing fixes here
- Ids for maps/routes/layers/features come from `runtime.newId()` via `editor.nextId()` (PLAT-006);
  `map.create-layer`'s `id` is OPTIONAL in core (`commands/map-layer.ts`), so Atlas omitting it is
  NOT a bug.
- The canvas zoom cluster + `[`/`]`/`+`/`-`/`0` keymap is a required a11y affordance (UX-CANVAS) —
  never propose removing it.
