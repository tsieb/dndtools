---
name: map-editor-cluster
description: Structure and recurring defect patterns of the gm-react map/atlas cluster (Atlas → MapBuilder wrapper → app/map/MapEditor + ToolRail/QuickMapRail/ToolOptionsBar/dock/canvas/generate), FIXED vs STILL-OPEN triage as of 7f84aeb7 (run #22)
metadata:
  type: reference
---

## Surface map (re-verified 2026-07-31 @ 7f84aeb7, run #22)
- `screens/Atlas.tsx` (1164) → "Open in map editor" mounts `MapBuilder` (MAP-021 back-compat wrapper,
  1691 ln) which renders `app/map/MapEditor.tsx` (1139). `MapBuilder` still owns the shared renderer
  (`FeatureShape:222`, `MapCanvas:399`, `CATEGORY_VAR`).
- **`FeatureShape` has exactly TWO call sites** — `MapBuilder.tsx:740` and `EditorCanvas.tsx:835`.
  Both parent SVGs are `viewBox="0 0 100 100"` + **`preserveAspectRatio="none"`** ⇒ every non-stroke
  primitive is anisotropically scaled.
- Editor split: `useMapEditor.ts` (426) · `tools.ts` (330) · `ToolRail` (211) · `QuickMapRail` (125,
  Android-only) · `ToolOptionsBar` (504) · `StatusBar` (61) ·
  `dock/{Inspector(~790),Layers(~500),Assets(265),History(162)}Panel` · `canvas/EditorCanvas` (~1085) ·
  `generate/{GeneratePanel(525),ParamControls(326)}` · `keyboard.ts` (222) + `keyboard-delete.test.ts`.
- THREE phone-ish layouts: `quickMapMode` (Android); `isPhone && !quickMapMode`; desktop grid
  (`gridTemplateColumns:'56px minmax(0,1fr) 348px'`).
- `useMapEditor.ts:283-286` **`run` is SINGLE-FLIGHT** (`busyRef` → returns `false` immediately while
  another command is in flight). It returns false for BOTH "busy" and "core refused" — so `accepted`
  checks are correct but cannot distinguish the two, and any key-repeat/rapid loop silently drops.

## FIXED — do NOT re-report (verified @ 7f84aeb7)
Everything in the run-#21 fixed list, PLUS newly closed at b8ead6c2/98e0211f/7f84aeb7:
- **`ToolRail` flyout can now COLLAPSE** — `collapsed` state (`:28`), toggle at `:77-88`, `aria-expanded`
  + `aria-controls` + a real `flyoutId`. Spec-covered at `map-editor.spec.ts:468-495`.
- **`LayersPanel` drag/drop is fixed** — private `LAYER_DND_TYPE` marker (`:16`) rejects foreign drags,
  `onDragEnd` resets, and `dropIndex` drives a real `outline: 2px solid var(--color-accent)` indicator.
- `LayersPanel` `addLayer` (`:71-75`) and delete-layer (`:368-383`) now `.then(accepted => …)` — the
  unconditional announcements AND the confirm-closes-on-refusal bug are both CLOSED.
- `keyboard.ts:214-218` `deleteSelection` no longer clears the selection when `deleted === 0`, and
  says "Nothing was deleted — the selection may be on a locked layer."
- `EditorCanvas:288` Space-pan `e.preventDefault()` + `:299-303` `window.blur` release. CLOSED.
- `ToolOptionsBar:262-268` Room now renders `TerrainSelect` + `SnapMenu`.
- `tools.ts` lying hints for Select-nudge/Marquee-Alt/Fill-flood/Door-cycle are all REWRITTEN. CLOSED.
- `InspectorPanel:194-198` derive-walls announcement now checks `accepted`.
- `MapEditor:680-684` export Popover has an `aria-label`.
- `Atlas:157-167` + `:212-229` now pass `deliveredMapIds: delivered` to BOTH `listMapsForActor` and
  `queryMapLayers` — the projected-map blanking is CLOSED.
- `Atlas:780` unavailable overlay has `pointerEvents:'none'`. CLOSED.
- `mapVocab.ts:137-152` new `bulkResultMessage()` helper (pluralizes, and appends
  "— the rest were refused." when `done < attempted`). Reuse it; do not hand-roll `${n} objects`.

## Verified NON-defects (stop re-hunting)
- `Button.jsx` `aria-disabled` really swallows clicks; Playwright `toBeDisabled()` honours it.
- ToolRail's `overflowY:auto/overflowX:visible` does NOT clip the flyout (sibling, not child).
- `AssetsPanel:249-250` favourite is 24×24 and `ToolOptionsBar` stepBtn is 26×26 — 2.5.8 PASSES.
- `responsive.spec.ts:810-858` asserts phone well **width ≥ 374 only, never HEIGHT**; it blesses the
  rail as "intentionally horizontally-scrollable" and scopes `clippedControls` to `… > header`.

## STILL OPEN @ 7f84aeb7 — ranked (run #22)
1. **`keyboard.ts:218` partial-refusal still clears the WHOLE selection** and announces a bare
   `Deleted N objects.` with no hint the rest survived. Its sibling `InspectorPanel:754` was upgraded
   to `bulkResultMessage` in the SAME commit and now says "the rest were refused" — but it too calls
   `clearSelection()` on `deleted > 0`, so the message names a retry the code just made impossible.
   Fix both: clear only the ids that actually went; route keyboard.ts through `bulkResultMessage`.
2. `ToolRail:99-101` `background: isActiveGroup ? T.accSub : isOpen ? T.alt : 'transparent'` —
   `isActiveGroup` SHADOWS `isOpen`, so the new collapse has **zero visual state change on the one
   button most likely to be pressed**. The "— hide tools" cue is `title=` only (never shown on touch).
3. `ToolRail:39-41` `role="toolbar"`, ~14 native tab stops, ZERO `onKeyDown`; `QuickMapRail:24-26`
   identical. Copy `ds/core/Tabs.jsx:28,35-45,77-90`; do NOT reuse `screen-kit.radioGroupKeyDown`
   (selection-follows-focus would ARM a drawing tool).
4. `keyboard.ts:148-176` `nudge()` — `void editor.run`, no `accepted` check, no announce, only
   `selection[0]`, and `:123` gates on `selection.length === 1`. Because `run` is single-flight, a
   HELD arrow key drops most repeats silently. This is the documented WCAG 2.5.7 drag alternative.
5. `InspectorPanel:498-503` (POI `patch`) and the Token equivalent are bare `void run`; the resync
   effect (`:490-496`) keys on the DURABLE value, which did not change ⇒ a commit-on-blur field keeps
   text that was never saved. Hits Label / Notes / Category / Visibility / Entity id / "Save link"
   (`:564-575`, which dispatches with zero feedback of any kind).
6. `MapEditor:153` `dialogUp = paletteOpen||helpOpen||importOpen||exportOpen` omits `mobileDock` (which
   `overlayUp:194` includes) and every Popover. `keyboard.ts:34` only guards INPUT/TEXTAREA/SELECT, so
   with the SnapMenu / layer-row menu / dock Sheet open, letter keys still arm tools behind it.
7. `InspectorPanel:736-757` `deleteAll` bulk-deletes with NO confirm while `LayersPanel:340-383`
   confirms a single layer. `:775-790` bulk visibility offers 2 of 3 levels (no "Shared") though every
   `Select` in the same panel offers 3. `:414-427` "Show grid" is a raw 16px `<input type=checkbox>`
   (WCAG 2.5.8) while SnapMenu two panels away uses the DS `Switch`.
8. `MapBuilder:295-306 case 'prop'` — one accent circle for all 12 `STAMP_ASSETS`; ignores
   `feature.style`, `props.asset`, `props.rotation`. `:328-341 case 'door'` handles secret/archway/open
   only ⇒ **`portcullis` is pixel-identical to `door`**. `mapVocab:81-93` maps 12 stamps → 5 icons.
   (Editor SCATTER_SETS ids are PLURAL `prop:trees`; core is SINGULAR `prop:tree`.)
9. `LayersPanel:104-118` tag chips: no `aria-pressed`/`aria-label`, and `on` is
   `filter.trim().toLowerCase() === tag.toLowerCase()` — they share ONE `filter` string with the
   free-text `Input:96-100`, so typing "wall" lights the "wall" chip and clicking a chip wipes text.
10. **Phone vertical crush** (`MapEditor` `isPhone && !quickMapMode` branch). ToolOptionsBar
    (`flexWrap`, `minHeight:46`) sits ABOVE the canvas; below it the horizontal ToolRail renders TWO
    stacked scrollers (~82px). At 667px the well is ~370px and the Minimap + path hint (both z6)
    overlap inside it. Room's new `TerrainSelect` (minWidth 150) adds another wrap row.
11. `Atlas:655` `height={560}` has no `isPhone` branch (327px-wide well → extreme letterboxing);
    `:691` map-title overlay `maxWidth:'calc(100% - 190px)'` ⇒ ~115px of text on a phone;
    `:1103-1105` tells a PLAYER to "Draw areas in the map editor" they cannot open (the Panel body is
    ungated; only the buttons at `:1107` are `isDm &&`). Map chips have no hover.
12. `ToolOptionsBar:334` prints the raw stamp id (`crate`) beside a "Choose…" button;
    `TERRAIN_STYLES[].swatch` is data that is NEVER RENDERED (`TerrainSelect:489-500` is 8 plain
    `<Select>` labels). `:261-267` Wall still shows only SnapMenu.
13. `GeneratePanel:126-151` runs the generator TWICE per keystroke synchronously; `:361/:475` two names
    for `reroll()`; `:244/:478` two for `onExit`; `:425-441` error block has no `role="alert"`; `:456`
    "Fix the highlighted setting" — nothing is highlighted; `:373-377` "Copy seed" swallows rejection.
14. `AssetsPanel:45-53` `arm()` force-switches the ACTIVE TOOL to Stamp with no `announce` prop at all.
    `:229-254` favourite state is COLOUR-ONLY (`Icon name="flag"` both states) ⇒ 1.4.1.
    `:259-261` "No matches." is a bare `<span>` grid item with no `role="status"`.
15. ZERO pointer feedback across the cluster (no global `button:hover`): `ToolRail:69-107,166-204` ·
    `QuickMapRail` · `AssetsPanel` · `HistoryPanel:113-145` · `ToolOptionsBar` stepBtn/SnapMenu/`:348` ·
    `GeneratePanel:256-338` · `ParamControls`. Pattern to copy: `ds/map/LayerRow.jsx:96-106`.
16. `EditorCanvas:943-948` generate overlay is `pointerEvents:'none'` WITH an `onPointerMove` — dead.
17. `MapEditor` `QuickToolStrip` is `role="status" aria-live` WRAPPED AROUND an interactive
    `SegmentedControl` ⇒ every press re-announces a ~25-word paragraph. Android-only.
18. `preserveAspectRatio="none"` stretches `case 'text'` glyphs and prop/marker circles into ellipses
    on any non-square well; the brush cursor ring (`EditorCanvas:908-924`) is an ellipse too.
19. `EditorCanvas:716-742` `handleMovePoi`/`handleMoveToken`/`handleUpdatePoiVis` are bare `void run` —
    a rejected drag snaps back with zero explanation.
20. `mapVocab:54` Snow paints with `--color-text-tertiary` (a TEXT token) landing near `--layer-base`
    (Stone). `mapVocab.test.ts` compares swatch STRINGS so it cannot catch near-identical colours.
21. `tools.ts:88` vs `:96` — "Select & move" and "Marquee" share `tool-select`.
    Raw z-index/hard-coded colour: `ToolRail:145`, `EditorCanvas:829,932,945,956,979`.
22. `HistoryPanel:113-145` rows: accessible name is the bare label; nothing says clicking undoes TO
    that point; no hover, `tool-select` glyph, no busy disable.
23. `selectInRect` (`EditorCanvas:571-584`) only ever selects pois+tokens ⇒ **Marquee can never select
    a wall/room/terrain feature.** `tools.ts:99` was rewritten to admit this, so it is now honest copy
    over a real capability gap rather than a lie — treat as a feature gap, not a UI defect.

## DELIBERATELY NOT FIXED — never re-report
- `StatusBar:41-43` blank cursor readout for non-drawing tools (the only fix re-renders on mousemove).

## e2e coupling (re-grepped @ 7f84aeb7)
- `map-editor.spec.ts`: axe gate; toolbar name "Map tools" `:206`; groups "Structure"/"Lighting"
  `:223-227`; `:449-455` flyout must start BELOW the options bar; **`:468-495` the collapse toggle +
  `aria-expanded` true/false/true + `flyout.toHaveCount(0)`**; `:510` "Room options"; `:521`
  "Terrain brush options" → `getByLabel('Terrain style')`; `role=group "<Tool label> options"` via
  `expectActiveTool:174-176`; `getByRole('application')`; "Panels" `:170`; `{name:'Export',exact:true}`;
  asset tile `{name:'Crate',exact:true}`; h1 COUNT only `:204`.
- `keyboard-delete.test.ts` (76 ln) now unit-pins `deleteSelection` — it is EXPORTED for this.
  Any change to its selection-clearing or announce strings must update that test.
- `responsive.spec.ts:810-858` phone editor: `:827` well width ≥374 (NO height), `:830` toolbar
  "Map tools" + `aria-orientation=horizontal`, `:833` "Panels", `:848` Export.
- `atlas.spec.ts:26,49,60` "Project to players"; `:44` accepts alert OR status; `:134-138` pins
  `touch-action: pan-y` on `[data-testid="map-canvas-well"]`.
- **ZERO spec refs** (⇒ SPEC-SAFE to change): "Show grid", "Snapping options", "Delete selection",
  "Scatter object", "Door type", "Add layer", "Filter layers", the tag chips, "Copy seed", "Again",
  "Save link", Favorite/Unfavorite, "Choose…", `nudge`, the Atlas fog-panel copy.

## Constraints when proposing fixes here
- Ids via `editor.nextId()` → `runtime.newId()` (PLAT-006).
- The zoom cluster + `[`/`]`/`+`/`-`/`0` keymap is a required a11y affordance (UX-CANVAS) — never remove.
- `LayerRow` spreads `{...rest}` AFTER its own `onKeyDown`; passing `onKeyDown` as a prop CLOBBERS the
  Alt+Arrow reorder. Put handlers on the LayersPanel wrapper.
- `T` (`app/screen-kit.tsx`) has NO spacing tokens; one-off px paddings are the convention here.
- `main.tsx:17-22` globally toasts unhandled rejections — a bare `await dispatch` is GENERIC, not
  silent. Only file a missing-catch where the UI ALSO lies.
