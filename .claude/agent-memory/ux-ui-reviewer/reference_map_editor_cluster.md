---
name: map-editor-cluster
description: Structure and recurring defect patterns of the gm-react map/atlas cluster (Atlas → MapBuilder wrapper → app/map/MapEditor + ToolRail/QuickMapRail/ToolOptionsBar/dock/canvas/generate), with FIXED vs STILL-OPEN triage as of 45adf828 (run #13)
metadata:
  type: reference
---

## Surface map (re-verified 2026-07-30 @ 45adf828, run #13)
- `screens/Atlas.tsx` is the map library; "Open in map editor" mounts `MapBuilder` (thin MAP-021
  back-compat wrapper) which renders `app/map/MapEditor.tsx` (1121 ln). `MapBuilder.tsx` (1691) still
  owns the shared renderer (`FeatureShape:222`, `MapCanvas:399`, `CATEGORY_VAR`).
- **Renderer blast radius:** `FeatureShape` has exactly TWO call sites — `MapBuilder.tsx:740` and
  `EditorCanvas.tsx:812`. No separate player-projection renderer.
- Editor split: `useMapEditor.ts` (426) · `tools.ts` (330) · `ToolRail` (192) · **`QuickMapRail` (125,
  Android-only)** · `quickMap.ts` (70) · `ToolOptionsBar` (490) · `StatusBar` (61) ·
  `dock/{Inspector(776),Layers(439),Assets(265),History(162)}Panel` · `canvas/EditorCanvas` (1049) ·
  `generate/{GeneratePanel(525),ParamControls(326)}` · `keyboard.ts` (214).
  Leaf panels never read `isPhone`; MapEditor owns all `isPhone`/`quickMapMode` branching.
- Two gesture owners on one canvas: EditorCanvas's overlay owns `DRAWING_TOOLS` (`EditorCanvas:32-52`);
  `MapCanvas` owns select/pan/poi/token/fog (`canvasTool` `:581-592`). A tool in NEITHER set is inert.
- **THREE phone-ish layouts.** `quickMapMode` (Android) `MapEditor:767-848`; `isPhone && !quickMapMode`
  `:849-896`; desktop grid `:897-942`.

## FIXED — do NOT re-report (verified @ 45adf828)
- ToolRail flyout covering the ToolOptionsBar; zoom cluster under the Minimap header; Water River/Lake
  no-op; `FeatureShape` honouring `terrain:*`; fog brush-size control; pinch-zoom no longer Android-gated;
  stale export notice + Popover-over-notice (MapEditor copy ONLY — see open #15); `role="application"`
  raw-tool-id name; `--layer-terrain` declared (`colors.css:267/304/416`); undo/redo `catch`;
  `MapNoticeTone` + `NOTICE_ICON`; hover on `LayersPanel.MenuItem` + `MapEditor.HeaderMenuItem`;
  EditorCanvas document-capture Enter/Escape `isTypingTarget` guard; AssetsPanel `autoFocus` gone +
  Recents/Favorites lifted to MapEditor + `arm()` always arms Stamp; GeneratePanel Enter-discards-seed;
  `MapEditor.projectToPlayers` try/catch + a REAL `projecting` latch (`:105,:285`); the phone "Panels"
  button is a real toggle (`:888`); `MapBuilder.commit()` catch; `MapBuilder:687` `touchAction:'none'`;
  keymap `suspended` for palette/help/import/export; all three single-flight sliders; `<Tabs idBase>` +
  `tabPanelProps`; NumberControl draft-on-blur; route-tool inertness; Minimap real `<button>`.

## Verified NON-defects (do NOT spend effort re-hunting)
- `Button.jsx:26,:74` — `onClick={soft ? undefined : onClick}`: `aria-disabled` really DOES swallow the
  click. ProjectionControl's soft-disable works. `aria-disabled` is the correct fix everywhere.
- **Playwright 1.61's `toBeDisabled()` honours `aria-disabled`** — so converting a hard `disabled` to the
  soft form does NOT break `onboarding-consent.spec.ts:66`.
- `ToolRail`'s `overflowY:'auto'` + `overflowX:'visible'` coercion does NOT clip the flyout: the flyout is
  a SIBLING of the scrolling group strip, not a child.
- `Icon.jsx` resolves `tool-crosshair`, `skip`, `display`, `flag`, `dice`, `Hand`, `tool-magnet`,
  `tool-scatter`, `tool-route`, `tool-measure`, `tool-fill`, `tool-room`, `tool-generate`.
- `LayersPanel` `role="list"` with a generic wrapper div above `LayerRow`'s `listitem` passes the axe
  critical/serious gate (`map-editor.spec.ts:755-777`) *when layers exist* — see open #35 for the EMPTY case.
- `responsive.spec.ts:808-858` DOES cover the `isPhone && !quickMapMode` editor at 375×667, but only
  asserts h1 COUNT (`:204`), horizontal overflow, and header `clippedControls`. It is blind to elements
  that SHRINK and to vertical crowding.

## TOP OF QUEUE @ 45adf828 (run #13 — NEW unless marked)
1. **HIGH `EditorCanvas.tsx:711-719`** `handleUpdatePoiVis` flips the DM-only↔player-visible boundary via
   bare `void editor.run` — no accepted-check, no announce. Player-safety control with no confirmation.
2. **HIGH `InspectorPanel.tsx:509,:537,:626`** commit-on-blur label/notes patches. `run()` returning false
   leaves the local `useState` holding text that was never saved; the reset effect (`:488-493`,`:610`)
   only re-syncs when the DURABLE value changes — which it didn't. Field lies indefinitely.
3. **HIGH (carried) `MapEditor.tsx:722-730`** notice banner CONDITIONALLY mounted while carrying
   `role="status"` for success/info ⇒ `projectToPlayers` success (`:304`) + the Android info blurb
   (`:697`) land silently. Repo's own fix shape: `ds/.../Toast.jsx:136-141`. `atlas.spec.ts:44` accepts either.
4. **HIGH (carried) `useMapEditor.ts:285`** `run()` drops silently; `EditorCanvas.addFeatures:334-344` is
   `void` while 12 sites announce success (`:365,380,394,413,441,474,482,501,515,519,530,560`). Correct
   shape already inlined at `EditorCanvas:631,656,685`. Same class: `LayersPanel:64,:321`, `InspectorPanel:195`.
5. **MED-HIGH `keyboard.ts:149-176`** `nudge()` — the DOCUMENTED WCAG 2.5.7 drag alternative — is `void run`
   with no announce and no accepted check. Held auto-repeat drops all but one. Pure silence for AT.
6. **MED-HIGH (carried) `ToolRail.tsx:96-129`** flyout renders UNCONDITIONALLY (`openGroup` always set,
   `:22,:24`) at `absolute left:56 top:54 zIndex:8` — `left:56` is INSIDE the canvas column (grid
   `56px|minmax(0,1fr)|348px`, `MapEditor:903`) and z8 > draw overlay z4 > HUD z6. Permanent opaque
   190×66-170px panel eating the map's top-left + its pointer events. No collapse affordance.
7. **MED-HIGH (carried) `ToolRail.tsx:29-45`** `role="toolbar"`, ~14 native tab stops, ZERO onKeyDown.
   **NEW: `QuickMapRail.tsx:24-26` has the identical gap** (9 tab stops). Copy `ds/core/Tabs.jsx:28,35-45,
   77-90`; do NOT reuse `screen-kit.radioGroupKeyDown` (selection-follows-focus would ARM a tool).
8. **MED-HIGH NEW — hard-disable-on-own-click drops focus to `<body>`:** `MapEditor:637,:645` Undo/Redo ·
   `QuickMapRail:78-79` · `HistoryPanel:34,:46` · `GeneratePanel:469` Accept (self-disables on success,
   reason unreachable). MapEditor's Tab trap (`:217-220`) recovers only on the NEXT Tab, at the top.
9. **MED-HIGH NEW `ParamControls.tsx:24,:37-52`** the "live"/"re-run" badge describes a distinction the
   code does not make — `GeneratePanel:127-140` re-runs on EVERY change regardless of `spec.applies`. Its
   only explanation is a `title` (keyboard- and touch-unreachable). Same class as the fixed "Drag also works."
10. **MED NEW `InspectorPanel.tsx:148-166`** the Inspector's `exportUvtt` is a DIVERGENT TWIN of
    `MapEditor:236-267`: it never calls `setNotice(null)` on success, so the stale-warning bug that was
    fixed in the header is still live here; it also announces a different string for the same action.
11. **MED NEW `keyboard.ts:32` + `MapEditor.tsx:152`** `dialogUp` omits `mobileDock` (which `overlayUp:193`
    DOES include) and EVERY Popover (SnapMenu `ToolOptionsBar:148`, LayerRow opacity, `LayersPanel:202`).
    `d` arms Door behind an open row menu; on a phone `b` arms the brush behind the full-screen Sheet;
    Escape fires the Sheet's dismiss AND `keyboard.ts:101-113`'s escalation in one keystroke.
12. **MED NEW `MapEditor.tsx:167-170`** quick-map auto-open keys on `selection.length`, so selecting a
    SECOND token (length still 1) never re-opens the sheet — and on Android the sheet is the only place
    token properties live.
13. **MED NEW `GeneratePanel`** ships two labels per action: `:361-369` "Reroll" vs `:475-477` "Again"
    (both `reroll()`, both `dice`); `:244-246` "Done" vs `:478-480` "Cancel" (both `onExit`). After Accept,
    "Cancel" cancels nothing. Also `:456-459` "Fix the highlighted setting" — nothing is ever highlighted,
    and `:425-441` the error block still has no `role="alert"`.
14. **MED NEW `AssetsPanel.tsx:229-255`** the WCAG-mandated 24px favourite now covers ~⅓ of a 76px arm tile
    in the top-right corner; on a phone the panel is inside a bottom Sheet, so a thumb favourites instead
    of arming. Still open too: `arm():45-53` has NO announce prop at all; favourite state is colour-only.
15. **MED NEW `MapBuilder.tsx:345 case 'text'`** renders labels into a `preserveAspectRatio="none"` SVG
    (`:722-723`,`:742`) ⇒ glyphs are non-uniformly STRETCHED on any non-square canvas. Also `fill={color}`
    not `paint`. UNVERIFIED visually — screenshot it.
16. **MED-LOW NEW `EditorCanvas.tsx:920-925`** generate-mode overlay is `pointerEvents:'none'` AND carries
    `onPointerMove={…onCursor…}` — dead handler. Pairs with `StatusBar:41-43` being permanently `x — · y —`.
17. **MED-LOW NEW — four silent no-ops in `EditorCanvas`:** single brush tap (`:471` `pts.length<2`),
    sub-0.005 room drag (`:480`), erase that hits nothing (`:407`), scatter rolling zero (`:439`).
    `:722-729` measurement readout is never announced (Measure is visual-only for AT).
18. **MED-LOW NEW `LayersPanel.tsx:112-115`** `EmptyState` renders INSIDE `role="list"` with no `listitem`
    wrapper; the axe gate only runs with layers present. UNVERIFIED whether axe flags `aria-required-children`.
19. **LOW-MED NEW — generator perf:** `GeneratePanel:127-140` runs a full generator SYNCHRONOUSLY per
    keystroke/slider step and `ParamControls:91-100` commits per step (unlike `CommitSlider:42-82` and
    `NumberControl:41-47`, which both draft). `:145-151` + `:186` run it twice more.
20. **LOW NEW `tools.ts:88` vs `:96`** — "Select & move" and "Marquee" share `tool-select`, so the Select
    flyout shows two identical rows.

## STILL OPEN — carried, re-verified unchanged
- **21.** `ToolOptionsBar:258-261` Room paints with `terrainStyle` (`EditorCanvas:481`) but shows only
  SnapMenu · `:475-490` `TERRAIN_STYLES[].swatch` never RENDERED (8 plain labels) · `:331` prints `crate`.
- **22.** `InspectorPanel:726-742` `deleteAll` — no confirm (LayersPanel's single delete DOES confirm at
  `:297-330`); `:770-772` is the only write without `disabled={busy}`; `:740` clears + announces "0".
- **23.** `LayersPanel:27,:123,:126` `dragIndex` drives NO styling, no drop indicator, no `onDragEnd` reset
  while `:290-293` advertises dragging · `:92-110` tag chips have no `aria-pressed` and share one `filter`
  string with the free-text `Input:85-91`.
- **24.** `tools.ts:131/:99/:179/:171` four lying hints (Fill floods ONE cell `EditorCanvas:520-530`;
  Marquee has no Alt path `:548-561`; Water's choice is the SegmentedControl; Door lists 3 of 4 kinds).
  `useMapEditor.ts:52` "remembered per tool" — `ToolOptions` is one FLAT object.
- **25.** `MapBuilder:295-307 case 'prop'` — one accent circle for all 12 STAMP_ASSETS + 5 SCATTER_SETS +
  8 core families; ignores `style`/`props.asset`/`props.rotation`. ⚠️ editor scatter ids are PLURAL
  (`EditorCanvas:418` + `useMapEditor.ts:97 'trees'`), core emits SINGULAR — move both together.
  `MapBuilder:329-343 case 'door'` — `portcullis` is pixel-identical to `door`.
- **26.** `mapVocab.ts:81-94` 12 stamps → 5 icons (`tool-stamp` ×6). `map-editor.spec.ts:868` names tiles
  by text, so glyph changes are spec-safe.
- **27.** `MapEditor:966-1026` `QuickToolStrip` is `role="status" aria-live` WRAPPED AROUND the
  interactive Fog SegmentedControl (`:1009`) ⇒ every press re-announces the 20-word paragraph. Android-only.
- **28.** `InspectorPanel:412-424` "Show grid" raw 16px checkbox (WCAG 2.5.8) vs `SnapMenu`'s DS `Switch` ·
  `:559-572` "Save link" zero feedback · `:753-768` bulk vis offers 2 of 3 levels.
- **29.** `HistoryPanel:113-145` rows: no hover, no aria-label saying they undo/redo, `tool-select` glyph,
  no busy disable. `GeneratePanel:374-376` "Copy seed" swallows the rejection AND gives no success signal;
  `:116` `seedRef` written, never read.
- **30.** `EditorCanvas:1029-1046` path hint (~330px @11.5px, `left:14 bottom:16`) overlaps the Minimap
  (`:996-1009`, `right:16 bottom:16`, 160px) at 375px — same z6, hint later in DOM. Minimap renders on
  phone at all, eating 160×~138 of a ~375×460 well.
- **31.** Phone header `<h1>` squeeze (`MapEditor:562-574`): at 375px, back ~28 + VisChip + Search 34 +
  undo/redo 58 + Export ~48 + Project ~36 + 6×gap4 ≈ 290-320 of 363 ⇒ map name gets ~45-70px. Fix =
  `flexWrap:'wrap'` on the header + `flex:'1 1 100%'` on the nav when isPhone.
- **32.** ZERO pointer feedback (`grep -rn ':hover' src --include=*.css` → NOTHING). Bare: `ToolRail:61-90,
  148-186` · `QuickMapRail:43-71,97-123` · `AssetsPanel:91-113,197-228,229-255` · `HistoryPanel:32-49,
  113-145` · `MapEditor:598-630` Search · `ToolOptionsBar stepBtn:107-120`/`SnapMenu:126-147`/`:333-350` ·
  `GeneratePanel:256-273,282-308,319-338` · `ParamControls:208-221,297-318`. Pattern: `ds/map/LayerRow.jsx:96-106`.
- **33.** Raw z-index + hard-coded colour: `ToolRail:127` (8), `EditorCanvas:806,909,933,957`;
  `MapBuilder` light fallback `'#ffd6aa'` (dupe of `useMapEditor:93`); **`mapVocab.ts:54` uses
  `--color-text-tertiary` (a TEXT token) as the Snow map paint, landing near `--layer-base` (Stone) —
  `mapVocab.test.ts` compares swatch STRINGS so it cannot catch that.**

## e2e coverage (re-grepped @ 45adf828)
- `map-editor.spec.ts` (axe critical/serious gate `:755-777`). Pins: toolbar name "Map tools" `:206`;
  groups "Structure"/"Lighting" `:223-227`; `role=group name="<Tool label> options"` via `expectActiveTool`
  `:176`; `getByLabel('Size value')` `:248,476,479,730`; `getByRole('application')`
  `:153,208,317,372,410,697,741`; "Panels" `:170`; layer rename/vis/lock/delete `:504-560`;
  `{name:'Export', exact:true}` `:574` + "Export for other VTTs (.dd2vtt)" `:577`; h1 COUNT only `:204`.
- `responsive.spec.ts:808-858` compact editor; `:204` h1 count; header `clippedControls` only.
- `android-quick-map.spec.ts:75` `toolbar name="Quick map actions"`; `:76` asserts "Map tools" ABSENT;
  `:111,:273` "Panels"; `:259,:261` "Undo"/"Redo"; `:317` "Accept"; `:352` "Project to players";
  `:373` "Export for other VTTs (.dd2vtt)"; `:161,:410` `getByRole('application')`.
- `atlas.spec.ts:26,49,60` "Project to players"; `:44` accepts alert OR status.
- **ZERO spec references** for: "Water type"(name), "Terrain style", "Fog shape"/"Fog mode", "Show grid",
  "Snapping options", "Grid cells across", "Token size", "Move up"/"Move down", Favorite/Unfavorite,
  "Brush size", "Save link", "Copy seed", "Reroll"/"Again", "Delete selection", the tag-filter chips,
  "Derive walls / doors / lights", "Add layer", "Filter layers", "Search assets".

## Constraints when proposing fixes here
- Ids come from `runtime.newId()` via `editor.nextId()` (`useMapEditor:271-280`) — PLAT-006.
- The zoom cluster + `[`/`]`/`+`/`-`/`0` keymap is a required a11y affordance (UX-CANVAS) — never remove.
- `LayerRow` spreads `{...rest}` AFTER its own `onKeyDown`, so passing `onKeyDown` as a prop CLOBBERS
  Alt+Arrow reorder. Put handlers on the LayersPanel wrapper (`LayersPanel:135-142` does this).
- `T` (`src/app/screen-kit.tsx`) has NO spacing tokens; one-off px paddings are the convention here.
