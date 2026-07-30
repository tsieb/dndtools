---
name: map-editor-cluster
description: Structure and recurring defect patterns of the gm-react map/atlas cluster (Atlas → MapBuilder wrapper → app/map/MapEditor + ToolRail/ToolOptionsBar/dock/canvas), with FIXED vs STILL-OPEN triage as of 7bdf2908 (run #11)
metadata:
  type: reference
---

## Surface map (re-verified 2026-07-30 @ c93c5206 — no map/* file changed since 329bcc58)
- `screens/Atlas.tsx` is the map library; "Open in map editor" (`Atlas.tsx:508`) mounts `MapBuilder`
  (`Atlas.tsx:1084`), which since MAP-021 is a thin back-compat wrapper rendering
  `app/map/MapEditor.tsx` (1067 ln). `MapBuilder.tsx` (1679) still owns the shared renderer
  (`MapCanvas:399`, `FeatureShape:222`, `CATEGORY_VAR:82`).
- **Renderer blast radius:** `FeatureShape` has exactly TWO call sites — `MapBuilder.tsx:740` and
  `EditorCanvas.tsx:801`. `MapCanvas` mounts only at `Atlas.tsx:563` + `EditorCanvas.tsx:747`. No
  separate player-projection renderer, so a FeatureShape change hits Atlas preview + editor canvas only.
- Editor split: `useMapEditor.ts` (402) · `tools.ts` (330) · `ToolRail` (192) · `ToolOptionsBar` (490) ·
  `StatusBar` (61) · `dock/{Inspector(776),Layers(429),Assets(246),History(162)}Panel` ·
  `canvas/EditorCanvas` (1038) · `generate/{GeneratePanel(524),ParamControls(326)}` · `keyboard.ts` (206).
  Leaf panels never read `isPhone`; MapEditor owns all `isPhone`/`quickMapMode` branching.
- Two gesture owners on one canvas: EditorCanvas's overlay owns `DRAWING_TOOLS`
  (`EditorCanvas.tsx:32-52`); `MapCanvas` owns select/pan/poi/token/fog (`canvasTool` at :570-581).
  A tool in NEITHER set is silently inert.
- **THREE phone-ish layouts.** `quickMapMode` (Android only) `MapEditor.tsx:723-804`;
  `isPhone && !quickMapMode` `:805-849`; desktop grid `:850-895`.

## FIXED in run #10/#11 (c93c5206 → 7bdf2908) — do NOT re-report
- **`--layer-terrain` NOW DECLARED** in all three blocks (`colors.css:267` `:root`, `:304` parchment,
  `:416` forced-colors) and `mapVocab.ts:53` dropped its fallback. Grass ≠ Forest at last. The unit
  guard is `mapVocab.test.ts` "gives visually distinct paint" — now asserts ALL 8 swatch strings
  distinct, not `size > 1`. ⚠️ It compares STRINGS, so `terrain:stone`(--layer-base) vs
  `terrain:snow`(--color-text-tertiary) can still render near-identically; it will not catch that.
- **Notice tone travels**: `useMapEditor` gained `MapNoticeTone`/`noticeTone` + `setNotice(msg, tone)`
  (default `warning`); `MapEditor.tsx:710-722` picks `role`, `--color-status-<tone>-*` and
  `NOTICE_ICON` (`:33-37`). All 6 status tokens × 4 themes exist; `check`/`info` are real Icon names.
- undo/redo now `catch` (`useMapEditor.ts:336,374`). `MapBuilder.ImportMapDialog` commit now catches.
- `keyboard.ts` gained `suspended`; `MapEditor.tsx:149` `dialogUp` gates the keymap AND the Tab trap.
- `EditorCanvas.tsx:307-314` capture-phase Enter/Escape now has an `isTypingTarget` guard;
  `:910` dead `measure ? crosshair : crosshair` ternary gone.
- AssetsPanel: `autoFocus` gone, Recents/Favorites lifted to `MapEditor` state (`:105-106`, passed
  `:466-473`), `arm()` now always arms Stamp, "Drag also works." + `draggable` gone.
- `GeneratePanel.tsx:352-357` Enter no longer rerolls (just `preventDefault`); hint copy fixed.
- Hover added to `LayersPanel.MenuItem:348-370` and `MapEditor.HeaderMenuItem:1016-1032`.

## FIXED — do not re-report
- ToolRail flyout covering ToolOptionsBar (`ToolRail.tsx:117` `top:54`). Zoom cluster under Minimap
  header (`EditorCanvas.tsx:941` `bottom:170`). Notice `role="alert"` + 24px Dismiss (`MapEditor:681-719`).
- Water River/Lake style (`EditorCanvas.tsx:362-367` writes `water:river|water:lake`).
- `terrainColor()` for `terrain:*` (`mapVocab.ts:66`, applied `MapBuilder.tsx:229` for fill/room/default).
  **PARTIAL — see open item T below.**
- Fog brush size (`ToolOptionsBar.tsx:401-410`). Pinch-zoom no longer Android-gated (`EditorCanvas:151-166`).
- `role="application"` name uses `TOOLS_BY_ID.get(tool)?.label` (`EditorCanvas.tsx:734`).
- Stale export notice + Popover-over-notice, **MapEditor copy only** (`MapEditor.tsx:242,246`).
- All THREE single-flight sliders (`InspectorPanel.CommitSlider:42-82` @ `:380`, `:631`; LayerRow opacity).
- AssetsPanel dead drag-copy deleted (`:138-143`); favourite toggle 24px (`:210-236`).
- `<Tabs idBase="map-dock">` + `tabPanelProps` (`MapEditor.tsx:437-451`). LayersPanel Enter/Space wrapper.
- NumberControl draft-then-commit-on-blur. Route-tool inertness. Label/Stamp option-key collision.
- Minimap real `<button>` + arrow-key pan. LayerRow opacity Popover `zIndex:20`.
- **Atlas notice is now the GOOD twin** (`Atlas.tsx:112-114,222,523-556`: tone-aware `alert`/`status`,
  error-only warning tokens, `run()` clears it). The EDITOR's banner is now the worse one — see item N.

## Verified NON-defects (do not spend effort)
- `tools.ts:104` `icon:'Hand'` IS registered (`ds/.../Icon.jsx:501`). Pan's glyph renders.
- `LayersPanel` `role="list"` with a generic wrapper div between it and `LayerRow`'s `role="listitem"`
  does NOT trip axe's `aria-required-children` — the critical/serious gate (`map-editor.spec.ts:755-777`)
  passes today.
- The `isPhone && !quickMapMode` layout IS covered by `responsive.spec.ts:808-858`. What it does NOT
  catch: elements that SHRINK (`:204` only asserts `h1` COUNT, never text/width) and vertical crowding.

## NEW @ 7bdf2908 (run #11) — top of the queue
- **N1 (HIGH). `MapEditor.projectToPlayers` (`:266-299`) is the LAST uncaught dispatch in the editor.**
  Two bare `await runtime.dispatch` with no try/catch. `SceneRuntime.ts:524` RETHROWS on persist
  failure and `:508` THROWS `PREVIEW_READONLY_MESSAGE` while previewing. `editor.run`/undo/redo/
  `exportUvtt` all catch now — this one doesn't. It also bypasses `editor.run`, so `editor.busy`
  never latches and `disabled={editor.busy}` (`:694`) is dead ⇒ double-click double-projects.
- **N2 (MED-HIGH). The vertical ToolRail flyout permanently covers the map's top-left.**
  `ToolRail.tsx:96-129` renders UNCONDITIONALLY (`openGroup` always has a value), `position:absolute
  left:56 top:54`, `background: T.overlay` (opaque; `Canvas` in forced-colors), `zIndex:8` — above the
  draw overlay (`EditorCanvas:907` z4) and the minimap (z6). The rail cell is only 56px of the
  `56px | 1fr | 348px` grid (`MapEditor:880`), so `left:56` is INSIDE the canvas column. ~190×66px
  (1-tool group) to ~190×170px (Structure). No collapse affordance, and it eats pointer events.
  This is the same class as the already-fixed "flyout covers ToolOptionsBar", one axis over.
- **N3 (MED). 12 stamp assets → 5 icons** (`mapVocab.ts:81-94`): `tool-stamp` ×6 (crate/barrel/chest/
  table/chair/statue), `layer-terrain` ×2, `tool-light` ×2. The Assets browser exists to pick
  visually. Distinct from the deferred `FeatureShape` prop-case item — this is the BROWSER, not the
  canvas. Spec-safe: `map-editor.spec.ts:868` names the tile by its text span, not the glyph.
- **N4 (MED). `AssetsPanel.arm` (`:45-53`) force-switches the tool with ZERO announcement** and the
  panel takes no `announce` prop at all (InspectorPanel/LayersPanel both do). On compact the panel
  lives inside the "Map panels" Sheet (`MapEditor:868`), so the tool changes behind a full-screen sheet.
- **N5 (MED). The tone fix REGRESSED SR announcement for success/info.** `MapEditor:702` mounts the
  banner conditionally, so a `role="status"` node is inserted TOGETHER with its text — the exact
  pattern the repo documents as unreliable and fixed with a permanent wrapper at
  `ds/components/overlay/Toast.jsx:136-141` + `:315-320`. `warning` still works (`alert` announces on
  insertion). The `info` notice (`MapEditor:677-680`) has no `announce()` companion ⇒ now fully silent.
  Same shape exists in Atlas (`atlas.spec.ts:44` already accepts alert OR status, so a fix is safe).
- **N6 (MED). Favourite state is colour-only.** `AssetsPanel.tsx:229-255`: same `flag` glyph,
  `color: fav ? T.acc : T.ter`. Violates the repo's own A11Y-011 grayscale-safe-glyph convention
  (cited at `Toast.jsx:6-8`, `mapVocab.ts:12`). Under forced-colors it IS Highlight vs GrayText, so
  not invisible — the failure is grayscale/colour-blind, WCAG 1.4.1.
- **N7 (MED, phone). "Panels" lies about being a toggle.** `MapEditor.tsx:857-866`
  `aria-pressed={mobileDock}` but `onClick` only `setMobileDock(true)`.
- **N8 (LOW-MED, Android only). `QuickToolStrip` is `role="status" aria-live="polite"` around an
  interactive `SegmentedControl`** (`MapEditor:955-1001`, control at `:986`). Every fog-mode press
  re-announces the tool name + "· armed" + the 20-word guidance paragraph. Put the region on `:998`.
- **N9 (LOW). `ToolOptionsBar.tsx:331` prints the raw id** (`crate`) where the Assets tile says `Crate`.

## STILL OPEN @ c93c5206
⚠️ Run #11 triage: items **3/T, 7, 10, 11, 12, 13, 27, 29** below are now FIXED (see the run #10/#11
block above) — ignore them. Item 14 is PARTLY fixed (Enter no longer rerolls; "Copy seed" silence and
the missing `role="alert"` on the generator error block remain). Everything else still verified open.

### Root cause A — the renderer still drops presentation data
1. `MapBuilder.tsx:295-307` `case 'prop'` = one accent circle for all 12 `STAMP_ASSETS`
   (`mapVocab.ts:77-90`), all 5 `SCATTER_SETS` (`:106-112`), and all 8 core scatter families. Ignores
   `feature.style`, `props.asset`, `props.rotation`. Data shapes: stamp `prop:crate`; editor scatter
   `prop:trees` (**PLURAL** — `useMapEditor.ts:93` `scatterObject:'trees'` must move with any change);
   core scatter `prop:tree` + `props.asset='tree.oak'`. Key on
   `(props.asset ?? style.replace(/^prop:/,'')).split(/[.:]/)[0]` and singularise.
2. `MapBuilder.tsx:329-343` `case 'door'` branches only on `archway`/`secret` → `portcullis` is
   pixel-identical to `door`; 4 `DOOR_KINDS` yield 3 appearances.
3. T. **`--layer-terrain` IS UNDEFINED** (`styles/tokens/colors.css:264-278` has base/height/political/
   climate/roads/water/wshed/fog/poi/dm/player/combat/custom — no `terrain`). So `mapVocab.ts:49`
   `terrain:forest` → `var(--layer-terrain, var(--layer-height))` = `--layer-height` = exactly
   `terrain:grass` (`:44`). Grass and Forest still paint identically after the terrainColor fix. Also
   `terrain:stone`(`--layer-base`) vs `terrain:snow`(`--color-text-tertiary`) are both near-grey.
4. `TERRAIN_STYLES[].swatch` is never RENDERED — `TerrainSelect` (`ToolOptionsBar.tsx:475-490`) is a
   native `Select` showing labels only; the swatch exists solely to feed `terrainColor`.

### Root cause B — `run()` is single-flight and drops silently; ~20 announcements ignore it
`useMapEditor.ts:272` `if (busyRef.current) return false` with NO notice. `run` returns
`Promise<boolean>`; the awaited-`.then(accepted)` shape at `EditorCanvas.tsx:620,645,674` /
`InspectorPanel.tsx:582,666` / `GeneratePanel.tsx:200,231` / `keyboard.ts:178` is the in-repo fix.
5. `EditorCanvas.addFeatures` (`:323-333`) is `void editor.run` AND early-returns when `!activeId`, yet
   every caller announces success: `:354,369,383,402,430,463,471,482,490,504,508,519`. The drawing
   overlay (`:893`) has NO `busy` guard, so two fast brush strokes = second silently lost + "Painted
   terrain." announced.
6. `LayersPanel.tsx:64` "Layer added." and `:321` "Layer …deleted."; `InspectorPanel.tsx:195`
   "Derived walls, doors, and lights."
7. `undo`/`redo` (`useMapEditor.ts:309-360`) have `try/finally` with **NO catch** — and
   `runtime.dispatch` THROWS on persist failure → undo silently no-ops, no notice, stack not popped.
   `run` (`:298`) does catch.

### Interaction / keyboard
8. `ToolRail.tsx:29-45` `role="toolbar"`, every button natively tabbable (`:61`, `:148`), `grep
   onKeyDown|tabIndex` → ZERO. ~14 tab stops in the phone bottom bar. Do NOT reuse screen-kit's
   `radioGroupKeyDown` (selection-follows-focus → would ARM a tool by arrowing). Copy the inlined
   `refs`+`tabStopIndex`+`moveFocus` from `ds/components/core/Tabs.jsx:28,35-45,77-90`.
9. `keyboard.ts:25-138` has NO overlay guard — `MapEditor` never gates `useMapKeyboard` on its own
   `overlayUp` (`:174-179`). With the Keyboard-shortcuts Dialog / Import dialog / palette open,
   `v`/`b`/`[`/`0` still arm tools and move the viewport behind the modal.
10. `EditorCanvas.tsx:304-320` binds Enter/Escape on `document` in **capture** phase with
    `stopPropagation` and NO isTyping guard (contrast `:281-284`, which has one). With a wall path in
    progress, Enter in the map-name field or Search finishes the path and never reaches the input.
11. `AssetsPanel.tsx:53` `autoFocus` on the search Input + Tabs' selection-follows-focus arrow keys
    (`Tabs.jsx:35-45` calls `onChange` inside `moveFocus`) ⇒ arrowing onto the Assets tab yanks focus
    into the text field; a keyboard user cannot reach the History tab by arrow.
12. `AssetsPanel.arm` (`:32-36`) writes `stampAsset`, but Scatter reads `scatterObject` — with Scatter
    armed, clicking any asset tile is a pure no-op (and does not switch tool, per `:34`).
13. `AssetsPanel` Recents/Favorites are component `useState` (`:17-18`) and the panel unmounts on every
    dock-tab change (`MapEditor.tsx:454`) → both lists wipe on each tab switch.
14. `GeneratePanel.tsx:352-357` Enter in the Seed field REROLLS, discarding the seed just typed
    (documented at `:378`, but Enter is the universal commit key). `:374` "Copy seed" swallows the
    clipboard rejection AND gives no success feedback. `:424-440` the generator error block has no
    `role="alert"`. `seedRef` (`:116`) is dead.
15. `InspectorPanel.MultiInspector.deleteAll` (`:726-742`) bulk-deletes with NO confirm dialog while
    LayersPanel's single-layer delete DOES confirm (`:297-330`); its three buttons (`:753-772`) are the
    only writes in the file not `disabled={editor.busy}`.
16. `InspectorPanel.tsx:559-572` "Save link" dispatches with zero feedback (no announce, stays enabled).
    Contrast `:216` Save name & description, which self-disables once saved.
17. `LayersPanel.tsx:27,123,126` drag-reorder: `dragIndex` drives NO styling — no drop indicator at all
    while the help text (`:291`) advertises dragging. No `onDragEnd` reset.
18. `LayersPanel.TagsDialog` Save (`:396-413`) closes unconditionally, no announce, no rejection path.

### Copy that lies about behaviour (same class as the fixed "Drag also works.")
19. `tools.ts:131` Fill hint "Click a closed region to flood it with the active terrain" — the code fills
    exactly ONE grid cell (`EditorCanvas.tsx:509-519`, "Filled a cell.").
20. `tools.ts:99` Marquee hint "Shift adds, Alt subtracts" — `selectInRect` (`:537-550`) has NO
    Alt-subtract path.
21. `tools.ts:179` Water hint "Draw a river (click a path) or a lake (close the loop)" — the choice is
    the "Water type" SegmentedControl; closing the loop does nothing. `tools.ts:171` Door hint omits
    Portcullis (4 kinds listed as 3). `AssetsPanel.tsx:10-11` docstring still claims drag works.
22. `useMapEditor.ts:49` "remembered per tool" but `ToolOptions` is one flat object → `brushSize` is
    shared by brush/erase/fog and `[`/`]` mutate all three.

### Layout / visual
23. **Phone header squeezes the `<h1>` to ~20px.** `MapEditor.tsx:487-679` at 375px: `nav` (`:510`) is
    the only `flex:1 minWidth:0` child; siblings have hard minima — VisibilityChip nowrap ≈88, Search 34,
    undo+redo 58, Export ≈62, Project ≈44, back ≈28 — plus 7 gaps ×4 + 12 padding ≈ 354 of 375.
    Cheapest fix: `flexWrap:'wrap'` on the header + `flex:'1 1 100%'` on the nav when `isPhone`.
24. `EditorCanvas.tsx:1018-1035` path-tool hint (`left:14 bottom:16`, ~322px wide) paints over the
    Minimap (`:985-998`, `right:16 bottom:16`, 160×~138) on a 375px phone — same `zIndex:6`, hint later
    in DOM. The Minimap renders on phone at all (`!quickMapMode`), eating 160×138 of a ~375×460 canvas.
25. `InspectorPanel.tsx:412-424` "Show grid" is a raw 16px `<input type=checkbox>` in a ~19px row
    (WCAG 2.5.8) — inconsistent with `SnapMenu` (`ToolOptionsBar.tsx:185`), which uses the DS `Switch`.
26. `StatusBar.tsx:41-43` cursor readout is permanently `x — · y —` on touch AND for every non-drawing
    tool (`onCursor` fires only from the drawing overlay, `EditorCanvas.tsx:448`).
27. `EditorCanvas.tsx:899` dead ternary `cursor: tool==='measure' ? 'crosshair' : 'crosshair'`.
28. `ToolOptionsBar.tsx:258-261` the Room tool paints with `options.terrainStyle`
    (`EditorCanvas.tsx:470`) but its options bar shows only SnapMenu — the option that decides the
    room's colour is invisible under the tool that uses it (the exact shape of the fixed fog-brush bug).
29. N. **The editor notice is warning-only but carries successes and info.** `MapEditor.tsx:681-719`
    hard-codes `--color-status-warning-*` + the `warning` icon, yet `:281` writes the SUCCESS
    "Projected "X" to N players." and `:657` writes an informational blurb through it. Copy Atlas's
    tone-aware shape (`Atlas.tsx:112-114,529-548`).
30. `HistoryPanel.Row` (`:113-145`) has no hover, no `aria-label` saying it undoes/redoes (SR hears only
    the step label), uses `tool-select` as the past-step icon, and no `busy` disable.

### Zero pointer feedback (`grep -rn ':hover' src --include=*.css` → NOTHING)
The only global interactive rule is the `:focus-visible` ring. DS components WITH hover:
`Button`, `IconButton`, `Card`, `Breadcrumb`, `SegmentedControl`, `NavItem`, `DataTable`, `NpcCard`,
`Popover`, `Dialog`, `Sheet`, `Toast`, `Tooltip`, `map/{LayerRow,LayerPanel,ToolPalette}`.
**`Chip` has NONE.** Hand-rolled offenders, highest value first (both are MENUS):
`LayersPanel.MenuItem:349-371` · `MapEditor.HeaderMenuItem:991-1011` · `ToolRail:61-90`+`:148-186` ·
`AssetsPanel:72-93` tag rail + `:178-209` tiles · `HistoryPanel.Row:113-145` ·
`MapEditor:558-590` Search · `ToolOptionsBar.stepBtn:107-120` / `SnapMenu:126-147` / Choose… `:333-350` ·
`GeneratePanel:256-271` group chips / `:282-308` generator cards / `:319-336` presets.
In-repo pattern is `onMouseEnter/Leave` (`ds/components/map/LayerRow.jsx:106`, `ToolPalette.jsx:67`,
`Button.jsx:102-113`, `IconButton.jsx:49-50`).

## Theming gap (verified 2026-07-29, colors.css re-checked 2026-07-30)
`--layer-*` are re-cut DARK under parchment (`colors.css:301-306`) and mapped to `CanvasText` under
forced-colors (`:412-417`), so the old "unconditioned :root" claim is WRONG for parchment/HC. The live
gap is the MISSING `--layer-terrain` (item T above). `LayerTypeBadge.jsx:42-43` using a `--layer-*` as
badge TEXT on a 16%-mix background still needs a real contrast measurement.

## e2e coverage (re-grepped 2026-07-30 @ c93c5206)
- `map-editor.spec.ts` (11 tests; axe critical/serious gate at `:755-777`). Pins: toolbar name
  "Map tools" `:206`; group names "Structure"/"Lighting" `:223-227`; `role=group name="<Tool label>
  options"` via `expectActiveTool` `:176`; `getByLabel('Size value')` `:248,476,479,730`;
  `getByRole('application')` `:153,208,317,372,410,697,741`; "Panels" `:170`; layer rename/visibility/
  lock/delete `:504-560`; Export `:574-577`; palette rows `:602-618`; `h1` COUNT only `:204`.
- `responsive.spec.ts:808-858` compact map editor (see NON-defects above).
- `android-quick-map.spec.ts:76` asserts "Map tools" is ABSENT in quickMapMode; `:111,:273` use "Panels".
- `a11y-axe-gate.spec.ts:27` covers `/atlas` but NOT the editor overlay — that gate is map-editor.spec's.
- `canvas.spec.ts` is /board + /scene ONLY. Do not cite it for this cluster.
- **ZERO spec references** for: "Water type", "Terrain style", "Fog shape"/"Fog mode", "Show grid",
  "Snapping options", "Grid cells across", "Token size", "Move up"/"Move down", Favorite/Unfavorite,
  "Brush size", "Save link", "Copy seed", "Reroll seed", "Delete selection", the tag-filter chips.

## Constraints when proposing fixes here
- Ids come from `runtime.newId()` via `editor.nextId()` (`useMapEditor.ts:258-267`) — PLAT-006.
- The zoom cluster + `[`/`]`/`+`/`-`/`0` keymap is a required a11y affordance (UX-CANVAS) — never remove.
- `LayerRow` spreads `{...rest}` AFTER its own `onKeyDown`, so passing `onKeyDown` as a prop CLOBBERS
  Alt+Arrow reorder. Put handlers on the LayersPanel wrapper (`LayersPanel.tsx:135-142` does this).
- `T` (screen-kit, `src/app/screen-kit.tsx`) has NO spacing tokens; one-off px paddings are the
  established convention here. `T.accFg` = `--color-accent-foreground` exists (`screen-kit.tsx:49`).
