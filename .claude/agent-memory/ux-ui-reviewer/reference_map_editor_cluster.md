---
name: map-editor-cluster
description: Structure and recurring defect patterns of the gm-react map/atlas cluster (Atlas → MapBuilder wrapper → app/map/MapEditor + ToolRail/QuickMapRail/ToolOptionsBar/dock/canvas/generate), FIXED vs STILL-OPEN triage as of e702bb6f (run #21)
metadata:
  type: reference
---

## Surface map (re-verified 2026-07-31 @ e702bb6f, run #21)
- `screens/Atlas.tsx` → "Open in map editor" mounts `MapBuilder` (MAP-021 back-compat wrapper, 1691 ln)
  which renders `app/map/MapEditor.tsx` (1134). `MapBuilder` still owns the shared renderer
  (`FeatureShape:222`, `MapCanvas:399`, `CATEGORY_VAR`).
- **`FeatureShape` has exactly TWO call sites** — `MapBuilder.tsx:740` and `EditorCanvas.tsx:835`.
  Both parent SVGs are `viewBox="0 0 100 100"` + **`preserveAspectRatio="none"`** (`MapBuilder:722`,
  `EditorCanvas:828`) ⇒ every non-stroke primitive is anisotropically scaled.
- Editor split: `useMapEditor.ts` (426) · `tools.ts` (330) · `ToolRail` (192) · `QuickMapRail` (125,
  Android-only) · `quickMap.ts` · `ToolOptionsBar` (493) · `StatusBar` (61) ·
  `dock/{Inspector(776),Layers(456),Assets(265),History(162)}Panel` · `canvas/EditorCanvas` (1072) ·
  `generate/{GeneratePanel(525),ParamControls(326)}` · `keyboard.ts` (214).
- THREE phone-ish layouts: `quickMapMode` (Android) `MapEditor:767-861`; `isPhone && !quickMapMode`
  `:862-909`; desktop grid `:910-954` (`gridTemplateColumns:'56px minmax(0,1fr) 348px'` @ `:916`).
- Live region: `MapEditor:523` `<div aria-live="polite" style={srOnly}>` fed by `announce` (`:135`).

## FIXED — do NOT re-report (verified @ e702bb6f)
Everything in the run-#15 fixed list, PLUS newly closed at 21e4f86e/e702bb6f:
- **EditorCanvas's ~14 unconditional success announcements are CLOSED.** `addFeatures(features, okMessage)`
  (`:334-352`) now `.then(accepted => accepted && announce(okMessage))`; route/erase/poi/token/fog all
  check `accepted` (`:394,:421,:654,:679,:708`). This whole class is dead in EditorCanvas.
- `ToolOptionsBar` `SnapMenu` now passes `triggerRef` (`:124,:154`).
- `MapEditor` export Popover has a `display:contents` `<span ref={exportTriggerRef}>` + `triggerRef`.
- `LayersPanel` row menu passes `actionRef`/`actionExpanded`/`triggerRef` (`:207-215`).
- `MapEditor:574-581` phone header `VisibilityChip` is now `compact={isPhone}` — the `<h1>` squeeze is CLOSED.
- `--layer-terrain` IS declared; `terrainColor()` is live; the fallback was deliberately removed so
  `styles/token-references.test.ts` guards it.
- `Icon.jsx:324` `dm-only` → `VenetianMask`.
- `AssetsPanel` favourite button is `minWidth/minHeight:24` (`:249-250`) — 2.5.8 PASSES, retired.
- `ToolOptionsBar` `stepBtn` is 26×26 — 2.5.8 PASSES, retired.

## Verified NON-defects (stop re-hunting)
- `Button.jsx:26,:74` `aria-disabled` really swallows clicks; Playwright 1.61 `toBeDisabled()` honours it.
- ToolRail's `overflowY:auto/overflowX:visible` does NOT clip the flyout (sibling, not child).
- `responsive.spec.ts:810-858` DOES cover the phone editor at 375×667 and asserts
  `map-canvas-well` **width ≥ 374** — but never HEIGHT, and it explicitly blesses the rail as
  "intentionally horizontally-scrollable". Vertical crush is the uncovered axis.
- The spec scopes `clippedControls` to `… > header` only, so nothing below the header is gated.

## STILL OPEN @ e702bb6f — ranked (run #21)
1. **`EditorCanvas.tsx:280-301` hold-Space pan has no `blur` reset and no `preventDefault`.**
   `keydown ' '` → `setSpacePan(true)`; the only reset is `keyup ' '` on `window`. Alt+Tab while
   holding Space ⇒ keyup never arrives ⇒ the `zIndex:9` full-canvas grab overlay (`:951-964`) is stuck
   over the drawing overlay (z4), zoom cluster and Minimap (z6) until Space is tapped again. And with
   no `preventDefault`, Space also ACTIVATES the focused button (the tool/zoom button you just
   clicked) on release. Fix: `window.blur` → `setSpacePan(false)`; `e.preventDefault()` when the
   target is not a text field. NEW run #21.
2. `ToolRail.tsx:96-129` vertical flyout renders UNCONDITIONALLY (`openGroup` always set, `:22,:24`)
   at `absolute left:56 top:54 zIndex:8` = inside the canvas column, opaque, pointer-eating.
   **NEW half:** `:67` `aria-expanded={isOpen}` on a group button whose `onClick` (`:68-72`) only ever
   does `setOpenGroup(g.id)` — it can never collapse, so the disclosure contract is a lie.
   ⚠️ `map-editor.spec.ts:224,:449-450` require flyout AND options group visible together ⇒ any
   collapse must default OPEN; or just drop `aria-expanded` and keep `aria-pressed`.
3. `ToolRail.tsx:29-45` `role="toolbar"`, ~14 native tab stops, ZERO onKeyDown; `QuickMapRail:24-26`
   identical. Copy `ds/core/Tabs.jsx:28,35-45,77-90`; do NOT reuse `screen-kit.radioGroupKeyDown`.
4. **`keyboard.ts:180-211` `deleteSelection` calls `editor.clearSelection()` unconditionally**, so a
   rejected delete (locked layer / permission ceiling) destroys the selection AND announces
   "Deleted 0 objects." — no retry without reselecting. It also only walks pois+tokens, and
   `selectInRect` (`EditorCanvas:571-584`) only ever selects pois+tokens ⇒ **Marquee can never select
   a wall/room/terrain feature and Delete can never remove one.** Move `clearSelection()` inside
   `if (deleted > 0)`.
5. `keyboard.ts:149-176` `nudge()` — `void run`, no announce, no accepted check, only `selection[0]`,
   and `:123` gates on `selection.length === 1` so arrows are a silent no-op on a multi-selection,
   while `tools.ts:91` promises "Arrow keys nudge the selection". This is the documented 2.5.7
   drag alternative.
6. `LayersPanel.tsx:64-67` (`Layer added.`) and `:319-328` (delete-layer, `Layer "X" deleted.`) —
   `void run(...)` then announce unconditionally. The exact class EditorCanvas just closed; the
   correct shape is inlined two files away.
7. `InspectorPanel.tsx:495-500` (POI `patch`) and `:610-615` (Token `patch`) are `void run`; the resync
   effect keys on the DURABLE value, which didn't change ⇒ a commit-on-blur field keeps text that was
   never saved. Hits Label / Notes / Category / Visibility / Entity id.
8. `MapEditor.tsx:153` `dialogUp = paletteOpen||helpOpen||importOpen||exportOpen` omits `mobileDock`
   (which `overlayUp:194` includes) and every Popover. With the SnapMenu / layer-row menu open,
   letter keys still arm tools behind it (Switches are `<button>`, not caught by the typing guard).
9. **Phone vertical crush** (`MapEditor:862-909`). `ToolOptionsBar` (`flexWrap`, `minHeight:46`) sits
   ABOVE the canvas: with Fog armed it is 2 SegmentedControls + up to 2 `NumberControl`s (~300px each)
   ⇒ 3 wrapped rows ≈ 138px. Below it the horizontal `ToolRail` renders TWO stacked scrollers
   (44px group strip + ~35px sub-tool row, `ToolRail:46-55` and `:100-108`) ≈ 82px. Plus header ~52 +
   StatusBar ~26. At 667px the well is ~370px, and the Minimap (`EditorCanvas:1019-1032`, 160×~138)
   and the path hint (`:1052-1069`, ~330px wide at `left:14 bottom:16`) then overlap each other in it
   (same z6; hint is later in DOM so it paints over the minimap). Only `quickMapMode` drops the
   Minimap. `responsive.spec.ts:827` asserts width only.
10. `tools.ts` lying hints — these strings ARE the StatusBar one-liner (`StatusBar:57`) and the
    ToolRail tooltip (`ToolRail:152`), i.e. the editor's only in-product docs:
    `:131` Fill "Click a closed region to flood it" — `EditorCanvas:541-553` fills ONE grid cell ·
    `:99` Marquee "Alt subtracts" — `selectInRect:571,:497` takes only `shiftKey` · `:171` Door
    "Cycle door / secret / archway in the options bar" — `DOOR_KINDS` has FOUR (portcullis) and it's a
    `SegmentedControl`, not a cycle · `:91` Arrow-nudge (see 5) · `useMapEditor:52` "remembered per
    tool" — `ToolOptions` is one FLAT object.
11. `MapBuilder.tsx:295-306 case 'prop'` — one accent circle for all 12 `STAMP_ASSETS`; ignores
    `feature.style`, `props.asset`, `props.rotation`. `:328-343 case 'door'` handles secret/archway/
    open only ⇒ **`portcullis` is pixel-identical to `door`**. `mapVocab:81-93` 12 stamps → 5 icons
    (`tool-stamp` ×6), so Crate/Barrel/Chest/Table/Chair/Statue are identical tiles in AssetsPanel.
12. `LayersPanel:120-133` drag reorder: `dragIndex` drives NO drop indicator and there is no
    `onDragEnd` reset, while `onDragOver={e=>e.preventDefault()}` accepts ANY external payload (a
    file, dragged text) ⇒ such a drop reorders using a stale `dragIndex`. `:302-304` advertises
    dragging as a first-class affordance.
13. `LayersPanel:95-118` tag chips: the wrapping `<button>` has no `aria-pressed`/`aria-label`, and
    `on` is `filter.trim().toLowerCase() === tag` — they share ONE `filter` string with the free-text
    `Input:87-93`, so typing "wall" lights the "wall" chip and clicking a chip wipes typed text.
14. `InspectorPanel:411-424` "Show grid" is a raw 16px `<input type=checkbox>` (WCAG 2.5.8) while the
    SnapMenu two panels away uses the DS `Switch`. `:726-742` `deleteAll` bulk-deletes with NO confirm
    while `LayersPanel:302-336` confirms a single layer — and it too `clearSelection()`s on a total
    rejection. `:753-768` bulk visibility offers 2 of the 3 levels (no "Shared") though every `Select`
    in the same panel offers 3. `:559-572` "Save link" dispatches with zero feedback.
15. `ToolOptionsBar:261-264` Room/Wall show only SnapMenu, but Room paints with `options.terrainStyle`
    (`EditorCanvas:511`) — no terrain picker while Room is armed. `:478-493` `TERRAIN_STYLES[].swatch`
    is never RENDERED (8 plain `<Select>` labels; the swatch data exists and is unused). `:334` prints
    the raw id (`crate`), not "Crate", beside a `Choose…` button.
16. `GeneratePanel:126-151` runs the generator TWICE per keystroke, synchronously (preview `useEffect`
    + `localOutput` `useMemo`, identical deps). `:361-369` "Reroll" vs `:475-477` "Again" = same
    `reroll()`; `:244` "Done" vs `:478` "Cancel" = same `onExit`. `:425-441` error block has no
    `role="alert"`. `:456` "Fix the highlighted setting" — nothing is ever highlighted. `:373-377`
    "Copy seed" is icon-only, swallows the rejection (`.catch(()=>{})`) and gives no success cue.
    `:469` Accept hard-disables on its own click ⇒ focus to `<body>`.
17. `AssetsPanel:45-53` `arm()` force-switches the ACTIVE TOOL to Stamp with no `announce` prop at all
    (and on phone the panel is inside a bottom Sheet that stays open over the map). `:229-255`
    favourite state is COLOUR-ONLY (`Icon name="flag"` both states, only `color` differs) — the
    `aria-pressed` is correct but 1.4.1 is not. `:259-261` "No matches." is a bare `<span>` as a grid
    item in a `minmax(76px,1fr)` track (wraps to ~4 words/line) with no `role="status"`.
18. `EditorCanvas:943-948` the generate overlay is `pointerEvents:'none'` WITH an `onPointerMove` —
    dead. `onCursor` is wired only there and to the drawing overlay, so `StatusBar:41-43` reads
    `x — · y —` for select/pan/poi/token/fog (deliberate; see below).
19. `MapEditor:978-1039` `QuickToolStrip` is `role="status" aria-live` WRAPPED AROUND the interactive
    Fog `SegmentedControl` (`:1022-1035`) ⇒ every press re-announces a ~25-word paragraph. Android-only.
20. `preserveAspectRatio="none"` (`MapBuilder:722`, `EditorCanvas:828`) stretches `case 'text'` glyphs
    and prop/marker circles into ellipses on any non-square well (~1.8× on 16:9). The brush cursor ring
    (`EditorCanvas:908-924`) is sized in % of width AND height, so it is an ellipse too.
21. `EditorCanvas:716-742` `handleMovePoi`/`handleMoveToken`/`handleUpdatePoiVis` are bare `void run` —
    a rejected drag snaps the marker back and a rejected DM-only↔player-visible flip reverts, both with
    zero explanation. (No lying announcement, so lower rank — but the visual revert IS the lie.)
22. `mapVocab:54` Snow paints with `--color-text-tertiary` (a TEXT token) landing near `--layer-base`
    (Stone). `mapVocab.test.ts` compares swatch STRINGS so it cannot catch near-identical colours.
23. ZERO pointer feedback across the cluster (no global `button:hover`): `ToolRail:61-90,148-186` ·
    `QuickMapRail` · `AssetsPanel:91-113,197-228,229-255` · `HistoryPanel:32-49,113-145` ·
    `ToolOptionsBar` stepBtn/SnapMenu/`:336-353` · `GeneratePanel:256-338` · `ParamControls`.
    Pattern to copy: `ds/map/LayerRow.jsx:96-106`.
24. `tools.ts:88` vs `:96` — "Select & move" and "Marquee" share `tool-select`; the Select flyout shows
    two identical glyphs. Raw z-index/hard-coded colour: `ToolRail:127`, `EditorCanvas:829,932,945,956,979`.
25. `HistoryPanel:113-145` rows: accessible name is the bare label; nothing says clicking undoes TO
    that point; no hover, `tool-select` glyph, no busy disable.

## DELIBERATELY NOT FIXED — never re-report
- `StatusBar:41-43` blank cursor readout for non-drawing tools (the only fix re-renders the editor on
  every mouse move).

## e2e coupling (re-grepped @ e702bb6f)
- `map-editor.spec.ts`: axe gate `:755-777`; toolbar name "Map tools" `:206`; groups
  "Structure"/"Lighting" `:223-227`; **`:449-450` flyout + options group visible TOGETHER**;
  `role=group "<Tool label> options"` via `expectActiveTool:176`; `getByLabel('Size value')`
  `:248,476,479,730`; `getByRole('application')` `:153,208,317,372,410,697,741`; "Panels" `:170`;
  layer rename/vis/lock/delete `:504-560`; `{name:'Export',exact:true}` `:574`; "Reroll seed" `:843`;
  asset tile `{name:'Crate',exact:true}` `:869`; `getByLabel('Generation seed')` `:836`;
  "Accept"/"Done" `:284,:292`; h1 COUNT only `:204`.
- `responsive.spec.ts:810-858` phone editor: `:827` well width ≥374 (NO height), `:830` toolbar
  "Map tools" + `aria-orientation=horizontal`, `:833` "Panels", `:848` `{name:'Export',exact:true}`,
  `clippedControls` scoped to `… > header` and to the dock Sheet only.
- `android-quick-map.spec.ts:75-76` "Quick map actions" present / "Map tools" ABSENT; `:111,:273`
  "Panels"; `:259,:261` Undo/Redo; `:317` Accept; `:352` "Project to players"; `:373` export.
- `atlas.spec.ts:26,49,60` "Project to players"; `:44` accepts alert OR status; `:134-138` pins
  `touch-action: pan-y` on `[data-testid="map-canvas-well"]`.
- **ZERO spec refs** (⇒ SPEC-SAFE to change): "Terrain style", "Show grid", "Snapping options",
  "Delete selection", "Scatter object", "Door type", "Add layer", "Filter layers", the tag chips,
  "Copy seed", "Again", "Save link", "Save name & description", Favorite/Unfavorite, "Choose…",
  hold-Space, the ToolRail flyout's `aria-expanded`, `nudge`, `deleteSelection`.

## Constraints when proposing fixes here
- Ids via `editor.nextId()` → `runtime.newId()` (PLAT-006).
- The zoom cluster + `[`/`]`/`+`/`-`/`0` keymap is a required a11y affordance (UX-CANVAS) — never remove.
- `LayerRow` spreads `{...rest}` AFTER its own `onKeyDown`; passing `onKeyDown` as a prop CLOBBERS the
  Alt+Arrow reorder. Put handlers on the LayersPanel wrapper.
- `T` (`app/screen-kit.tsx`) has NO spacing tokens; one-off px paddings are the convention here.
- `main.tsx:17-22` globally toasts unhandled rejections — a bare `await dispatch` is GENERIC, not
  silent. Only file a missing-catch where the UI ALSO lies.
