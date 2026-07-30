---
name: map-editor-cluster
description: Structure and recurring defect patterns of the gm-react map/atlas cluster (Atlas → MapBuilder wrapper → app/map/MapEditor + ToolRail/ToolOptionsBar/dock/canvas), with FIXED vs STILL-OPEN triage as of b5ed692f
metadata:
  type: reference
---

## Surface map (re-verified 2026-07-30 @ b5ed692f)
- `screens/Atlas.tsx` is the map library; "Open in map editor" mounts `MapBuilder`, which since MAP-021
  is a thin back-compat wrapper (`app/MapBuilder.tsx:1652`) rendering `app/map/MapEditor.tsx` (1057 ln).
  `MapBuilder.tsx` (1675) still owns the shared renderer (`MapCanvas:395`, `FeatureShape:221`).
- **Renderer blast radius:** `FeatureShape` has exactly TWO call sites — `MapBuilder.tsx:740` and
  `EditorCanvas.tsx:786`. `MapCanvas` mounts only at `Atlas.tsx:563` + `EditorCanvas.tsx:732`. There is
  NO separate player-projection renderer, so a FeatureShape change hits Atlas preview + editor canvas
  and nothing else.
- Editor split: `useMapEditor.ts` (403) · `tools.ts` · `ToolRail` (187) · `ToolOptionsBar` (477) ·
  `StatusBar` (61) · `dock/{Inspector(777),Layers(430),Assets(247),History}Panel` · `canvas/EditorCanvas`
  (1020) · `generate/*` · `keyboard.ts` (207). Leaf panels never read `isPhone`; MapEditor owns all
  `isPhone`/`quickMapMode` branching.
- Two gesture owners on one canvas: EditorCanvas's overlay owns `DRAWING_TOOLS`; `MapCanvas` owns
  select/pan/poi/token/fog. A tool in NEITHER set is silently inert.
- **THREE phone-ish layouts, not two.** `quickMapMode` (Android only, `platform/capabilities.ts:120`),
  `isPhone && !quickMapMode` (`MapEditor.tsx:800-844`), desktop grid (`:845-889`).

## FIXED — do not re-report
- Notice banner `role="alert"` + warning tokens (`MapEditor.tsx:676-715`). Dismiss now minWidth/Height 24.
- `<Tabs idBase="map-dock">` + `tabPanelProps`. LayersPanel active-layer Enter/Space on the wrapper.
- All THREE single-flight sliders: `InspectorPanel.CommitSlider` (`:42-82`, used at `:380` grid cells and
  `:631` token size) and `LayerRow.jsx` per-gesture opacity commit.
- `LayerRow.jsx:243` opacity Popover now has `zIndex: 20`.
- `AssetsPanel` dead-drag copy + `draggable`/`onDragStart` DELETED (`:139-143`); favourite toggle is 24px.
- `ToolOptionsBar.NumberControl` draft-then-commit-on-blur. Route-tool inertness. Label/Stamp key collision.
- `Minimap.jsx` real `<button>` + arrow-key pan.
- **Premise correction:** the `isPhone && !quickMapMode` layout IS covered — `responsive.spec.ts:808-858`
  ("the compact map builder keeps the canvas and inspector reachable", 375x667): no-h-overflow,
  `clippedControls` on `> header`, canvas width >= 374, rail `aria-orientation=horizontal`, Panels sheet
  bounds. Do NOT claim it is uncovered again. What it does NOT catch: elements that SHRINK (an `<h1>` is
  not in the `clippedControls` selector list) and vertical crowding.

## STILL OPEN @ b5ed692f — with current line numbers

### The renderer drops `feature.style` for THREE of the authoring tools (one root cause, one file)
1. **Water River/Lake is a no-op.** `EditorCanvas.tsx:347-356` writes `style:'water'`; `FeatureShape`
   `case 'water'` (`MapBuilder.tsx:264-265`) decides river-vs-lake from
   `style.includes('river') || props.biome==='river' || props.flow!==undefined` — none set, so BOTH draw
   as a filled lake polygon. Core's own convention is `'water:river'|'water:lake'|'water:sea'`
   (`generation/{region,world,city}.ts`). Fix = one-line style string.
2. **Terrain style is dropped.** `EditorCanvas.tsx:449` (brush→`stroke`), `:457` (room), `:503` (fill) pass
   `options.terrainStyle`; `FeatureShape` `case 'fill'/'room'` (`:227-243`) and `default` (`:381-391`) use
   only the layer `color`. All 8 `TERRAIN_STYLES` (`mapVocab.ts:43-52`, each with a distinct `swatch`)
   paint identically.
3. **`prop` ignores style AND `props.rotation`.** `MapBuilder.tsx:291-303` = one accent circle for all 12
   `STAMP_ASSETS`, all 5 `SCATTER_SETS`, and all 8 core scatter families. Data shapes: editor stamp
   `style='prop:crate'`; editor scatter `style='prop:trees'` (**PLURAL** — `SCATTER_SETS` ids at
   `mapVocab.ts:90-96` diverge from core's singular `prop:tree`); core scatter `style='prop:tree'` +
   `props.asset='tree.oak'` + `props.rotation` + `props.scale`. Any glyph lookup must key on the family
   = `(props.asset ?? style.replace(/^prop:/,'')).split(/[.:]/)[0]` and singularise.
4. Minor sibling: `portcullis` renders identically to a plain `door` (`MapBuilder.tsx:325-339` only
   branches on `archway`/`secret`), so 4 `DOOR_KINDS` yield 3 appearances.

### Interaction
5. **Pinch-zoom is Android-gated.** `EditorCanvas.tsx:151,160,184` all early-return
   `if (!quickMapMode || event.pointerType !== 'touch')`, and the container sets `touchAction:'none'`
   (`:729`) so the browser's own pinch is suppressed too → NO pinch zoom in any non-Android touch
   browser. Worse with a drawing tool armed: the overlay at `:878-893` (zIndex 4) covers the canvas,
   MapCanvas's pan never fires, and space-pan (`:279`) needs a hardware keyboard — the only pan left is
   tapping the Minimap. Fix = drop the `quickMapMode` clause; the pinch path is pure viewport state.
6. **Fog brush size hidden but keymapped.** `ToolOptionsBar.tsx:375-407` `case 'fog'` renders
   Mode/Shape/Feather only; `brushSize` is surfaced only under brush (`:233-241`) and erase (`:246-256`).
   Yet `fogShape:'stroke'` ("Brush") drives `fogBrushRadius={options.brushSize/1000}`
   (`EditorCanvas.tsx:742`) and `[`/`]` mutate it (`keyboard.ts:80-89`).
7. **`ToolRail.tsx:29-93`** `role="toolbar"` with every button natively tabbable; `grep onKeyDown|tabIndex`
   → ZERO. ~14 tab stops in the phone bottom bar. **No reusable helper exists:** screen-kit's
   `radioGroupKeyDown(e)` (`screen-kit.tsx:22-32`) queries `[role="radio"]` and CALLS `.click()` on the
   next node — selection-follows-focus, which for a toolbar would ACTIVATE a tool merely by arrowing.
   The right pattern is inlined (not exported) in `ds/components/core/Tabs.jsx:28,77-90`
   (`refs` array + `tabStopIndex` + `moveFocus`). Copy ~20 lines into ToolRail.
8. **Unconditional success announcements** (announce fired without awaiting the single-flight `run`):
   `LayersPanel.tsx:64` (Layer added) and `:321` (Layer deleted); `EditorCanvas.tsx:389,417,450,458,469,
   477,491,495,506,370` (Erased/Scattered/Painted/Room/Placed…/Filled/Route). The awaited `.then(accepted)`
   pattern at `EditorCanvas.tsx:607,632,661` and `InspectorPanel.tsx:582,666` is the in-repo fix shape.
9. **Stale notice on the export path** (`run()` clears notice at `useMapEditor.ts:280`, but exportFile is
   not a command): `MapEditor.tsx:233-240` and `InspectorPanel.tsx:158` announce success without
   `editor.setNotice(null)`, so a prior export-failure banner survives. `MapEditor.tsx:241-247` also
   leaves the export Popover open on failure, covering the notice it just set.

### Layout / phone
10. **Phone header squeezes the map title to ~25-41px.** `MapEditor.tsx:482-674`: `nav` is the only
    `flex:1 minWidth:0` child; every sibling has a hard min (chip `whiteSpace:nowrap` ≈88, undo+redo 58,
    Export ≈62, Project ≥44 via `--density-touch-target:2.75rem` on mobile, back 28, Search 34) plus 24
    of gaps + 12 padding ≈ 350 of 391. `responsive.spec` cannot catch it (h1 isn't a "control"; nothing
    overflows). Cheapest fix: `flexWrap:'wrap'` + `flex:'1 1 100%'` on the nav when `isPhone`.
11. **HUD collisions.** `EditorCanvas.tsx:922` `bottom: quickMapMode ? 16 : 150` is a magic number; the
    Minimap (`:966-979`, width 160, `aspect 1.4` → ~138 tall, `bottom:16`) tops out at 154, so the zoom
    cluster's % readout overlaps it by ~4px on EVERY profile. On phone the Minimap also renders
    (`!quickMapMode`) eating 160x138 of a ~391x517 canvas, and the path-tool hint (`:999-1016`,
    `left:14 bottom:16`, ~322px wide) paints straight over it (same zIndex 6, hint later in DOM).
12. `InspectorPanel.tsx:412-424` "Show grid" is a raw 16px `<input type=checkbox>` in a ~19px-tall label
    row — WCAG 2.5.8. Inconsistent with `SnapMenu`, which uses the DS `Switch` for the same shape.
13. `StatusBar.tsx:41-43` cursor readout is permanently `x — · y —` on touch (no hover) and wraps to a
    second row on phone.
14. **Zero pointer feedback** — `grep -rn ':hover' src --include=*.css` still returns NOTHING; the only
    global interactive rule is the `:focus-visible` ring (`styles/tokens/base.css:35-36`). Worst offenders
    are the two hand-rolled MENUS: `LayersPanel.MenuItem:349-371` and `MapEditor.HeaderMenuItem:986-1005`.
    Then `ToolRail:61-90` + `:143-181`, `AssetsPanel:72-93` tag rail + `:178-209` tiles,
    `MapEditor:553-585` Search, `ToolOptionsBar` `stepBtn:107-120` / `SnapMenu:126-147` / Choose… `:333-350`.
    In-repo pattern is `onMouseEnter/Leave` (`ds/components/map/LayerRow.jsx:106`, `ToolPalette.jsx:67`,
    `LayerPanel.jsx:81`, `Button.jsx:100-113`).
15. `LayersPanel.tsx:97-107` tag-filter buttons: no `aria-pressed` (only visual `Chip selected`), and the
    chips share one `filter` string with the text Input — typing a tag name lights a chip, clicking a chip
    wipes the typed query.
16. `EditorCanvas.tsx:719` `role="application"` name interpolates the RAW tool id ("Drawing tool: poi")
    instead of `TOOLS_BY_ID.get(tool)?.label`.
17. `EditorCanvas.tsx:884` dead ternary `cursor: tool === 'measure' ? 'crosshair' : 'crosshair'`.
18. `useMapEditor.ts:49-53` doc says options are "remembered per tool"; `ToolOptions` is one flat object,
    so `brushSize` is shared by brush/erase/fog and `[`/`]` mutate all three.
19. `InspectorPanel.tsx:559-572` "Save link" dispatches and gives zero feedback (no announce, stays
    enabled). Contrast `:216` Save name & description, which at least self-disables once saved.
20. `Atlas.tsx` notice channel is still the un-fixed twin of the fixed editor banner (`role="status"`,
    `info` icon, carries rejections) and `Atlas.tsx run()` never clears `notice`. Atlas reorder chevrons
    (`ghostBtn`, `padding:2` + 12px icon ≈ 16px) still stacked vertically adjacent.

## Theming gap (verified 2026-07-29, not re-checked since)
`--layer-*`/`--map-*` (`styles/tokens/colors.css:258-282`) sit in an UNCONDITIONED `:root` — no parchment,
no high-contrast, no forced-colors remap. `LayerTypeBadge.jsx:42-43` uses a light OKLCH `--layer-*` as
badge TEXT on a 16%-mix background → under parchment that is light-on-near-white (WCAG 1.4.3). Same
mechanism on `POIMarker`/`POIPopover` dots and `LayerRow.jsx:90`'s `--layer-dm` border.

## e2e coverage (re-grepped 2026-07-30)
- `map-editor.spec.ts` (11 tests, axe critical/serious gate at `:651`). Pins: toolbar name "Map tools"
  `:193`; group names "Structure"/"Lighting" `:207-212`; tool-options group names via
  `expectActiveTool` → `role=group name="<Tool label> options"` (Terrain brush, Select & move, Room, Fog,
  Point of interest, Generate); `getByLabel('Size value')` `:235`,`:626`; `getByRole('application')`
  (unnamed) `:140`; "Panels" `:157`; layer rename/visibility/lock/Alt+Arrow/delete `:386-456`; Export `:470`.
- `responsive.spec.ts:808-858` compact map editor (see premise correction above).
- `android-quick-map.spec.ts:76` asserts "Map tools" is ABSENT in quickMapMode; `:111`,`:273` use "Panels".
- `canvas.spec.ts` is /board + /scene ONLY. Do not cite it for this cluster.
- **ZERO spec references** for: "Water type", "Terrain style", "Fog shape"/"Fog mode", "Show grid",
  "Snapping options", "Map canvas" (as a name), "Grid cells across", "Token size", "Move up"/"Move down",
  Favorite/Unfavorite, "Brush size". Every fix above is therefore near-zero regression risk.

## Constraints when proposing fixes here
- Ids come from `runtime.newId()` via `editor.nextId()` (`useMapEditor.ts:258-267`) — PLAT-006.
- The zoom cluster + `[`/`]`/`+`/`-`/`0` keymap is a required a11y affordance (UX-CANVAS) — never remove.
- `LayerRow` spreads `{...rest}` AFTER its own `onKeyDown` (`LayerRow.jsx`), so passing `onKeyDown` as a
  prop CLOBBERS Alt+Arrow reorder. Put handlers on the LayersPanel wrapper.
- `T` (screen-kit) has NO spacing tokens; one-off px paddings are an established app convention here.
