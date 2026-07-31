---
name: map-editor-cluster
description: Structure and recurring defect patterns of the gm-react map/atlas cluster (Atlas → MapBuilder wrapper → app/map/MapEditor + ToolRail/QuickMapRail/ToolOptionsBar/dock/canvas/generate), FIXED vs STILL-OPEN triage as of 33651613 (run #15)
metadata:
  type: reference
---

## Surface map (re-verified 2026-07-30 @ 33651613, run #15)
- `screens/Atlas.tsx` → "Open in map editor" mounts `MapBuilder` (MAP-021 back-compat wrapper, 1691 ln)
  which renders `app/map/MapEditor.tsx` (1121). `MapBuilder` still owns the shared renderer
  (`FeatureShape:222`, `MapCanvas:399`, `CATEGORY_VAR`).
- **`FeatureShape` has exactly TWO call sites** — `MapBuilder.tsx:740` and `EditorCanvas.tsx:812`.
  Both parent SVGs are `viewBox="0 0 100 100"` + **`preserveAspectRatio="none"`** (`MapBuilder:722`,
  `EditorCanvas:803`) ⇒ every non-stroke primitive is anisotropically scaled. See open #4.
- Editor split: `useMapEditor.ts` (426) · `tools.ts` (330) · `ToolRail` (192) · `QuickMapRail` (125,
  Android-only) · `quickMap.ts` · `ToolOptionsBar` (490) · `StatusBar` (61) ·
  `dock/{Inspector(776),Layers(450),Assets(265),History(162)}Panel` · `canvas/EditorCanvas` (1049) ·
  `generate/{GeneratePanel(525),ParamControls(326)}` · `keyboard.ts` (214).
- Two gesture owners on one canvas: EditorCanvas overlay owns `DRAWING_TOOLS` (`:32-52`, `route` now
  included); `MapCanvas` owns select/pan/poi/token/fog. **`onCursor` is wired ONLY to the drawing
  overlay (`:459`) and to a dead `pointerEvents:'none'` generate overlay (`:923`)** — so with the
  DEFAULT tool (`select`) the StatusBar readout is permanently `x — · y —`.
- THREE phone-ish layouts: `quickMapMode` (Android) `MapEditor:767-848`; `isPhone && !quickMapMode`
  `:849-896`; desktop grid `:897-942` (`gridTemplateColumns:'56px minmax(0,1fr) 348px'` @ `:903`).

## FIXED — do NOT re-report (verified @ 33651613)
ToolRail flyout covering ToolOptionsBar · zoom cluster under Minimap header · Water River/Lake ·
`FeatureShape` honouring `terrain:*` · fog brush-size · pinch-zoom un-gated · stale export notice +
Popover-over-notice (MapEditor copy ONLY) · `role="application"` name · **`--layer-terrain` declared**
(`colors.css:267/304/416`) · undo/redo `catch` · `MapNoticeTone`+`NOTICE_ICON` · hover on
`LayersPanel.MenuItem` + `MapEditor.HeaderMenuItem` · EditorCanvas capture Enter/Escape `isTypingTarget`
guard · AssetsPanel `autoFocus` + Recents/Favorites lifted + `arm()` always arms Stamp · GeneratePanel
Enter-discards-seed · `projectToPlayers` try/catch + `projecting` latch (`:285`) · phone "Panels" real
toggle (`:888`) · `MapBuilder.commit()` catch · `MapBuilder:687 touchAction` · keymap `suspended` ·
all three single-flight sliders · `<Tabs idBase>` · `NumberControl`/`CommitSlider` draft-on-blur ·
route-tool inertness · Minimap real `<button>` + Enter-teleport guard · **LayerRow + LayersPanel
Popovers now `aria-label`ed** (33651613) · `Icon 'dm-only' → VenetianMask` (no longer collides with
`visibility-players`) · `escapeLayers.ts` nested-Escape ownership.

## Verified NON-defects (stop re-hunting)
- `Button.jsx:26,:74` `onClick={soft ? undefined : onClick}` — `aria-disabled` really swallows clicks.
- Playwright 1.61 `toBeDisabled()` honours `aria-disabled`.
- ToolRail's `overflowY:auto/overflowX:visible` does NOT clip the flyout (sibling, not child).
- `Icon.jsx` resolves `tool-crosshair`, `skip`, `display`, `flag`, `dice`, `Hand`, `tool-magnet`,
  `tool-scatter`, `tool-route`, `tool-measure`, `tool-fill`, `tool-room`, `tool-generate`.
- `LayersPanel role="list"` + generic wrapper above `LayerRow`'s `listitem` passes the axe gate when
  layers exist.
- `MapEditor.tsx:519` inline `outline:'none'` on the `role=dialog` shell is fine (`tabIndex=-1` shell).
- `responsive.spec.ts:808-858` covers the compact editor at 375×667 but only asserts h1 COUNT,
  horizontal overflow and header `clippedControls` — blind to SHRINKING and vertical crowding.

## STILL OPEN @ 33651613 — ranked (run #15)
1. `EditorCanvas.tsx:711-719` `handleUpdatePoiVis` — bare `void editor.run`; single-flight rejection
   silently reverts a **DM-only↔player-visible** flip. Same shape at `:695`/`:704` (POI/token drags
   snap back with no explanation).
2. `InspectorPanel.tsx:496,:509,:537,:613,:626` commit-on-blur `patch()` is `void run`; the resync
   effect keys on the DURABLE value, which didn't change ⇒ the field keeps text that was never saved.
3. Unconditional success announcements over single-flight `run()`: `EditorCanvas.addFeatures:334-344`
   is `void` while `:365,380,394,413,441,474,482,493,501,515,519,530` announce; `LayersPanel:64,:321`;
   `InspectorPanel:195`. Correct shape already inlined at `EditorCanvas:635,660,687` + `InspectorPanel:583`.
4. **`preserveAspectRatio="none"`** (`MapBuilder:722-723`, `EditorCanvas:803`) — `case 'text':345`
   glyphs and `case 'prop'/'marker'` circles are stretched into ellipses/condensed type on any
   non-square well (~1.8× on 16:9). `vectorEffect="non-scaling-stroke"` saves polylines only.
5. `MapEditor.tsx:575` phone header squeeze — the **non-compact `VisibilityChip` (≈97px, "DM ONLY"
   uppercase)** is the biggest eater; with back 30 + chip 97 + Search 36 + undo/redo 58 + Export 50 +
   Project 40 + 6×gap4 ≈ 335 of 381 (Pixel 5) the `<h1>` gets ~46px. Fix = `compact` chip on phone +
   `flexWrap` + `flex:'1 1 100%'` on the nav.
6. `MapBuilder.tsx:295-307 case 'prop'` — one accent circle for all 12 `STAMP_ASSETS` + 5
   `SCATTER_SETS` + core families; ignores `style`, `props.asset`, `props.rotation`. ⚠️ editor scatter
   ids are PLURAL (`prop:trees`, `EditorCanvas:418` + `useMapEditor:96`), core emits SINGULAR — move
   both together. `:329-343 case 'door'`: `portcullis` is pixel-identical to `door`.
7. `ToolRail.tsx:96-129` vertical flyout renders UNCONDITIONALLY (`openGroup` always set, `:22,:24`)
   at `absolute left:56 top:54 zIndex:8` = inside the canvas column, over the map's top-left, opaque,
   pointer-eating, no collapse. ⚠️ **`map-editor.spec.ts:224,:449-450` require the flyout AND the
   options group visible together** — any collapse must default OPEN.
8. `ToolRail.tsx:29-45` `role="toolbar"`, ~14 native tab stops, ZERO onKeyDown; `QuickMapRail:24-26`
   identical (9 stops). Copy `ds/core/Tabs.jsx:28,35-45,77-90`; do NOT reuse
   `screen-kit.radioGroupKeyDown` (selection-follows-focus would ARM a drawing tool).
9. `StatusBar.tsx:41-43` `x — · y —` permanently blank for select/pan/poi/token/fog (see surface map).
   `EditorCanvas:920-925` generate overlay is `pointerEvents:'none'` WITH an `onPointerMove` — dead.
10. `keyboard.ts:149-176` `nudge()` (the documented WCAG 2.5.7 drag alternative) — `void run`, no
    announce, no accepted check, and only ever moves `selection[0]` though `tools.ts:91` promises
    "Arrow keys nudge the selection".
11. Hard-disable-on-own-click drops focus to `<body>`: `MapEditor:637,:645` Undo/Redo ·
    `HistoryPanel:34,:46` · `QuickMapRail:78-79` · `GeneratePanel:469` Accept ·
    `InspectorPanel:218-232` "Save name & description" (also `void run`, zero announce for a rename).
12. `InspectorPanel.tsx:148-166` `exportUvtt` is a DIVERGENT TWIN of `MapEditor:236-267` — never calls
    `setNotice(null)` on success (the stale-warning bug is still live here) and announces a different
    string ("UVTT scene exported." vs "Map exported for other VTTs (.dd2vtt).").
13. `InspectorPanel:726-742` `deleteAll` ("Delete selection") — no confirm, while `LayersPanel:302-336`
    single layer delete DOES confirm. `:770-772` only write without `disabled={busy}`.
14. `tools.ts` lying hints: `:131` Fill "flood a closed region" (`EditorCanvas:520-530` fills ONE grid
    cell) · `:99` Marquee "Alt subtracts" (`selectInRect:548-561` takes only `e.shiftKey`) · `:179`
    Door "Cycle door/secret/archway" (4 kinds, and it's a SegmentedControl not a cycle) · `:171` Water.
    `useMapEditor:52` "remembered per tool" — `ToolOptions` is one FLAT object.
15. `ToolOptionsBar:258-261` Room paints with `options.terrainStyle` (`EditorCanvas:481`) but shows
    only SnapMenu — no terrain picker while Room is armed. `:475-490` `TERRAIN_STYLES[].swatch` is
    never RENDERED (8 plain `<Select>` labels). `:331` prints the raw id `crate`, not "Crate".
16. `LayersPanel:92-110` tag chips: no `aria-pressed`, no hover, and they share one `filter` string
    with the free-text `Input:85-91` (typing "wall" lights the "wall" chip). `:27,:123,:126` `dragIndex`
    drives NO styling/drop indicator/`onDragEnd` reset while `:298-301` advertises dragging.
17. `GeneratePanel:126-151` runs the generator TWICE per keystroke, synchronously (preview `useEffect`
    + `localOutput` `useMemo`, identical deps). `ParamControls:91-100` commits per slider step.
    `ParamControls:24,:37-52` "live"/"re-run" badge describes a distinction `GeneratePanel:126-140`
    does not make (it re-runs on EVERY change); explained only by a `title`.
18. `GeneratePanel` label chaos: `:361-369` "Reroll" (aria "Reroll seed") vs `:475-477` "Again" — same
    `reroll()`; `:244` "Done" vs `:478` "Cancel" — same `onExit`, and after Accept "Cancel" cancels
    nothing. `:425-441` error block has no `role="alert"`; `:456` "Fix the highlighted setting" —
    nothing is ever highlighted. `:374-376` "Copy seed" swallows the rejection AND gives no success cue.
19. `InspectorPanel:412-424` "Show grid" is a raw 16px checkbox in a ~19px row (WCAG 2.5.8) while
    SnapMenu uses the DS `Switch`. `:559-572` "Save link" zero feedback. `:753-768` bulk vis: 2 of 3.
20. `EditorCanvas:1029-1046` path hint (~330px @11.5px, `left:14 bottom:16`) overlaps the Minimap
    (`:989-1002`, `right:16 bottom:16`, 160px) at 375-393px — same z6, hint later in DOM. Minimap
    renders on phone at all (only `quickMapMode` excludes it), eating 160×~138 of a ~375×460 well.
21. ZERO pointer feedback (`grep ':hover' src/styles` → NOTHING; only 2 `onMouseEnter` in the whole
    cluster, `LayersPanel:366` + `MapEditor:1044`). Bare: `ToolRail:61-90,148-186` ·
    `QuickMapRail:43-71,97-123` · `AssetsPanel:91-113,197-228,229-255` · `HistoryPanel:32-49,113-145` ·
    `MapEditor:598-630` Search · `ToolOptionsBar` stepBtn/SnapMenu/`:333-350` "Choose…" ·
    `GeneratePanel:256-338` · `ParamControls:208-221,297-318`. Pattern: `ds/map/LayerRow.jsx:96-106`.
22. `AssetsPanel:229-255` favourite state is COLOUR-ONLY (`Icon name="flag"` both states, only
    `color` differs); 24px target covers ⅓ of a 76px tile corner and on phone the panel is inside a
    bottom Sheet. `arm():44-53` changes the ACTIVE TOOL with no `announce` prop at all.
23. `HistoryPanel:113-145` rows: accessible name is the bare label — nothing says clicking undoes to
    that point; no hover, `tool-select` glyph, no busy disable.
24. `keyboard.ts:32` + `MapEditor:152` `dialogUp` omits `mobileDock` (which `overlayUp:193` includes)
    and every Popover (SnapMenu, LayerRow opacity, `LayersPanel:206`).
25. `MapEditor:167-170` quick-map auto-open keys on `selection.length`, so selecting a SECOND token
    never re-opens the sheet — on Android that sheet is the only place token properties live.
26. `MapEditor:966-1026` `QuickToolStrip` is `role="status" aria-live` WRAPPED AROUND the interactive
    Fog SegmentedControl ⇒ every press re-announces a 20-word paragraph. Android-only.
27. Silent no-ops in `EditorCanvas`: single brush tap (`:471`), sub-0.005 room drag (`:480`), erase
    hitting nothing (`:407`), scatter rolling zero (`:439`); `:722-729` measurement never announced.
28. `mapVocab.ts:54` Snow paints with `--color-text-tertiary` (a TEXT token) landing near
    `--layer-base` (Stone). `mapVocab.test.ts` compares swatch STRINGS so it cannot catch this.
    `:81-94` 12 stamps → 5 icons (`tool-stamp` ×6). Raw z-index/hard-coded colour: `ToolRail:127`,
    `EditorCanvas:806,909,933,957`, `MapBuilder` `'#ffd6aa'` (dupe of `useMapEditor:93`).
29. `tools.ts:88` vs `:96` — "Select & move" and "Marquee" share `tool-select`; the Select flyout
    shows two identical rows. `LayersPanel:112-115` `EmptyState` inside `role="list"` with no listitem.

## e2e coupling (re-grepped @ 33651613)
- `map-editor.spec.ts`: axe critical/serious gate `:755-777`; toolbar name "Map tools" `:206`; groups
  "Structure"/"Lighting" `:223-227`; **`:449-450` asserts flyout + options group visible TOGETHER**;
  `role=group "<Tool label> options"` via `expectActiveTool:176`; `getByLabel('Size value')`
  `:248,476,479,730`; `getByRole('application')` `:153,208,317,372,410,697,741`; "Panels" `:170`;
  layer rename/vis/lock/delete `:504-560`; `{name:'Export',exact:true}` `:574` + "Export for other
  VTTs (.dd2vtt)" `:577`; "Reroll seed" `:843`; asset tile `{name:'Crate',exact:true}` `:869`;
  `getByLabel('Generation seed')` `:836`; "Accept"/"Done" `:284,:292`; h1 COUNT only `:204`.
- `responsive.spec.ts:808-858` compact editor; `:831` toolbar "Map tools"; `:834` "Panels".
- `android-quick-map.spec.ts:75-76` "Quick map actions" present / "Map tools" ABSENT; `:111,:273`
  "Panels"; `:259,:261` Undo/Redo; `:317` Accept; `:352` "Project to players"; `:373` export.
- `atlas.spec.ts:26,49,60` "Project to players"; `:44` accepts alert OR status.
- **ZERO spec refs** for: "Terrain style", "Show grid", "Snapping options", "Delete selection",
  "Scatter object", "Door type", "Add layer", "Filter layers", the tag chips, "Copy seed", "Again",
  "Save link", "Save name & description", "Derive walls…", Favorite/Unfavorite, "Choose…".

## Constraints when proposing fixes here
- Ids via `editor.nextId()` → `runtime.newId()` (PLAT-006).
- The zoom cluster + `[`/`]`/`+`/`-`/`0` keymap is a required a11y affordance (UX-CANVAS) — never remove.
- `LayerRow` spreads `{...rest}` AFTER its own `onKeyDown`; passing `onKeyDown` as a prop CLOBBERS the
  Alt+Arrow reorder. Put handlers on the LayersPanel wrapper (`:135-145` does this).
- `T` (`app/screen-kit.tsx`) has NO spacing tokens; one-off px paddings are the convention here.
- `main.tsx:17-22` globally toasts unhandled rejections — a bare `await dispatch` is GENERIC, not
  silent. Only file a missing-catch where the UI ALSO lies.
