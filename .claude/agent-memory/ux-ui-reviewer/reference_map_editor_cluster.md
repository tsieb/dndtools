---
name: map-editor-cluster
description: Structure and recurring defect patterns of the gm-react map/atlas cluster (Atlas → MapBuilder wrapper → app/map/MapEditor + ToolRail/ToolOptionsBar/dock/canvas), with FIXED vs STILL-OPEN triage as of 8138156b
metadata:
  type: reference
---

## Surface map (re-verified 2026-07-30 @ 8138156b)
- `screens/Atlas.tsx` (1051 ln) is the map library; "Open in map editor" mounts `MapBuilder`, which
  since MAP-021 is a thin back-compat wrapper (`app/MapBuilder.tsx:1652`) rendering
  `app/map/MapEditor.tsx` (1057 ln). `MapBuilder.tsx` (1675 ln) still owns the shared renderer
  (`MapCanvas:395`, `FeatureShape:221`, `VIS_CHIP`, `dsToVis/visToDs`).
- **Exact renderer blast radius (grepped 2026-07-30):** `FeatureShape` has exactly TWO call sites —
  `MapBuilder.tsx:740` (inside `MapCanvas`) and `EditorCanvas.tsx:786`. `MapCanvas` has exactly TWO
  mount sites — `Atlas.tsx:563` and `EditorCanvas.tsx:732` (memoised at `EditorCanvas.tsx:27`).
  There is NO separate player-projection renderer; projection is a durable command
  (`session.project-active-map`), the player sees the same two paths. So any FeatureShape change
  hits Atlas preview + editor canvas and nothing else.
- Editor split: `useMapEditor.ts` (402) · `tools.ts` (330) · `ToolRail` (187) · `ToolOptionsBar` (476)
  · `dock/{Inspector(721),Layers(429),Assets(239),History(162)}Panel` · `canvas/EditorCanvas` ·
  `generate/*` · `keyboard.ts` (206). Leaf panels never read `isPhone`; MapEditor owns all
  `isPhone`/`quickMapMode` branching. Correct layering, not a gap.
- Two gesture owners on one canvas: EditorCanvas's overlay owns its `DRAWING_TOOLS` set; `MapCanvas`
  owns select/pan/poi/token/fog. A tool in NEITHER set is silently inert.

## FIXED since the 2026-07-29 pass — do not re-report
- `MapEditor.tsx:675-693` notice banner: now `role="alert"` + `--color-status-warning-*` tokens +
  `warning` icon. The "unannounced, mis-toned editor error channel" item is CLOSED.
- `MapEditor.tsx:432-444` `<Tabs idBase="map-dock">` + `tabPanelProps('map-dock', editor.dock)`. CLOSED.
- `LayersPanel.tsx:130-142` active-layer is keyboard-reachable: Enter/Space handled on the WRAPPER
  div (not passed as a LayerRow prop, which `{...rest}` would clobber). CLOSED.
- `ToolOptionsBar.NumberControl` / `generate/ParamControls` draft-then-commit-on-blur. CLOSED.
- Label vs Stamp `ToolOptions` key collision. CLOSED. Route-tool inertness. CLOSED.
- `ds/components/map/Minimap.jsx` real `<button>` + arrow pan. CLOSED.

## STILL OPEN — re-verified with CURRENT line numbers 2026-07-30 @ 8138156b
1. **Per-drag-step `run()` sliders.** `useMapEditor.ts:272` is verbatim
   `if (busyRef.current) return false;` — single-flight CONFIRMED, silent (no throw, no queue).
   Three `<Slider>`s dispatch straight from `onChange` (fires per drag step, like `input`):
   - `dock/InspectorPanel.tsx:328-344` grid "Cells across" → `void run({type:'map.configure-overlay'})`
   - `dock/InspectorPanel.tsx:576-585` token "Size" → `patch({size:v})`, `patch` is run-backed at :557
   - `dock/LayersPanel.tsx:185-191` `onOpacityChange` → `void run({type:'map.set-layer-opacity'})`
   Fix shape: local state on `onChange`, dispatch on `onPointerUp`/`onKeyUp`/`onBlur`.
   `generate/ParamControls` is NOT affected (local state until Generate).
2. **`FeatureShape` `prop` case ignores `feature.style`** — `MapBuilder.tsx:290-302` draws every prop
   as one accent circle (`r = max(0.5, 0.9*scale)`), so all 14+ AssetsPanel object types are
   indistinguishable. Contrast `case 'water':260-284`, which DOES branch on `feature.style`.
3. **Fog brush size is hidden but keymapped.** `ToolOptionsBar.tsx:375-406` `case 'fog'` renders
   Mode/Shape/Feather only. `brushSize` is surfaced ONLY under the brush/erase cases
   (`ToolOptionsBar.tsx:234-239, 249-254`). Yet `fogShape:'stroke'` ("Brush") drives
   `fogBrushRadius={options.brushSize/1000}` (`EditorCanvas.tsx:742`) and `[`/`]` mutate it
   (`keyboard.ts:80-88`).
4. **Atlas's notice channel is the un-fixed twin of the fixed editor banner.**
   `Atlas.tsx:494-524` renders `role="status" aria-live="polite"`, `background:T.alt`, `info` icon —
   but it carries command REJECTIONS at `:257`, `:399`, `:413` alongside successes. AND it is the
   STALE-STATE class: `Atlas.tsx:199-207` `run()` never clears `notice`, and `createMap:250-258`
   sets `mapId` on accept without clearing — a prior failure banner survives the next success.
   (Editor's `useMapEditor.run` DOES `setNotice(null)` on accept, `useMapEditor.ts:285`.)
   Secondary stale-state: the export success paths `MapEditor.tsx:231-241` and
   `InspectorPanel.tsx:100-106` call `announce()` but never `editor.setNotice(null)`.
5. **Atlas layer-reorder chevrons are 16px and vertically adjacent.** `ghostBtn` at `Atlas.tsx:58-64`
   is `padding:2` + a 12px icon ≈ 16px. Stacked in a `flexDirection:'column'` span at
   `Atlas.tsx:770-792` — "Move up" `:772-781` sits directly on "Move down" `:782-791`, and a mis-tap
   dispatches the OPPOSITE durable `map.reorder-layer`. Same `ghostBtn` also at `:518` (dismiss),
   `:831`, `:903`, `:934`, `:944`.
6. **Zero hover feedback in the inline-styled map chrome — claim re-verified.**
   `grep -rn ':hover' src --include=*.css` returns **NOTHING**; the only global interactive rule is
   the `:focus-visible` ring at `styles/tokens/base.css:35-36`. `src/styles/` has just 7 css files
   (index, scene-display, tokens/{base,fonts,spacing,typography,colors}). DS components fake hover in
   JS (`ds/components/core/Button.jsx:104`, `ds/components/map/LayerRow.jsx:98-101`). Raw inline-styled
   `<button>`s with NO hover: `ToolRail.tsx:57-89` group buttons + the flyout set, `AssetsPanel.tsx:180-211`
   tiles and `:212-229` fav, `MapEditor.tsx:556-571` Search, all `Atlas.tsx` `ghostBtn` sites.
7. **`AssetsPanel` dead drag affordance.** Copy "Drag also works." at `AssetsPanel.tsx:139`;
   `draggable` + `onDragStart` at `:176-177`. `grep -rn 'onDrop' src/app/map src/app/MapBuilder.tsx
   src/screens/Atlas.tsx` returns ONLY `LayersPanel.tsx:125` (row reorder). Neither EditorCanvas nor
   MapCanvas has `onDrop`/`onDragOver`. Cheap fix: delete the sentence + the draggable/onDragStart
   pair — click-to-arm (`:184`) is already the WCAG 2.5.7 path.
8. **`AssetsPanel.tsx:212-229` favourite toggle**: `padding:2` + 12px icon ≈ 16px AND
   `position:'absolute', top:2, right:2` INSIDE the `position:'relative'` wrapper at `:174-179`, so
   it overlays the arm button's top-right corner. WCAG 2.5.8 + accidental-activation.
   Same class: `MapEditor.tsx:694-706` notice Dismiss (`padding:2` + 14px icon ≈ 18px).
9. **`ToolRail.tsx:29-93`** `role="toolbar"` + `aria-orientation`, every button natively tabbable,
   and `grep -n 'onKeyDown|tabIndex' ToolRail.tsx` returns ZERO — no roving tabindex, no arrow keys.
   Not axe-detectable, so the map-editor axe gate (`map-editor.spec.ts:651`) passes it.
10. **`ds/components/map/LayerRow.jsx:220-226`** per-row opacity `Popover` still has NO `zIndex` in
    its inline `style` (`{position:'absolute', right:0, top:'calc(100% + 6px)', transform:'none'}`).
    `Popover` (`ds/components/core/Popover.jsx`) only applies `var(--z-overlay)` in its `anchor`
    branch, so any inline-positioned Popover must supply its own. Sibling menus DO
    (MapEditor export menu 30, LayersPanel row menu 20, ToolOptionsBar SnapMenu). Symptom: the
    opacity flyout on a non-last row paints under the next row's `position:relative` wrapper.
    Fix: add `zIndex: 20`.

## Theming gap (unchanged, verified 2026-07-29, not re-checked 07-30)
`--layer-*`/`--map-*` tokens (`styles/tokens/colors.css:258-282`) sit in an UNCONDITIONED `:root` —
no `[data-theme='parchment']` (144-191), no `[data-theme='high-contrast']` (196-243), no
`@media (forced-colors: active)` remap (306-352). Verified break:
`ds/components/map/LayerTypeBadge.jsx:42-43` uses a light OKLCH `--layer-*` as badge TEXT on a
16%-mix background; under parchment `--color-surface` becomes `#fdf8f0` → light-on-near-white,
WCAG 1.4.3 failure on every layer badge. Same mechanism on `POIMarker.jsx`/`POIPopover.jsx` category
dots and `LayerRow.jsx:90`'s `--layer-dm` border. Only hard-coded hex left in the cluster itself is
`useMapEditor.ts:90 lightColor:'#ffd6aa'` (a default light *value*, arguably fine).

## e2e coverage (re-grepped 2026-07-30)
- `map-editor.spec.ts` (11 tests, axe critical/serious gate at `:651`). Touches: toolbar name
  "Map tools" `:193`; layer rename/visibility/lock/**Alt+Arrow reorder**/delete `:386-456`;
  Export `:470-473`; `getByLabel('Size value')` (ToolOptionsBar NumberControl) `:235`, `:626`.
- `android-quick-map.spec.ts:76` asserts the "Map tools" toolbar is ABSENT in quickMapMode.
- `responsive.spec.ts:820-845` compact map editor: no-horizontal-overflow, header clipping,
  `aria-orientation='horizontal'` on the rail `:830`, Panels sheet bounds.
- `canvas.spec.ts` is /board + /scene ONLY — it does NOT touch this cluster. Do not cite it.
- **NO spec references**: Atlas "Move X up/down" chevrons (only `scene-cards.spec.ts:377-410` uses
  that label shape, different surface), "Grid cells across", "Token size", layer opacity,
  Favorite/Unfavorite, "Dismiss". So findings 1/4/5/8 are near-zero regression risk.
- `quickMapMode` is Android-only (`platform/capabilities.ts:120`), so the `isPhone && !quickMapMode`
  branch (full header + horizontal ToolRail) has NO e2e coverage.

## Constraints when proposing fixes here
- Ids for maps/routes/layers/features come from `runtime.newId()` via `editor.nextId()`
  (`useMapEditor.ts:258-267`) — PLAT-006. `map.create-layer`'s `id` is OPTIONAL in core, so Atlas
  omitting it is NOT a bug.
- The canvas zoom cluster + `[`/`]`/`+`/`-`/`0` keymap is a required a11y affordance (UX-CANVAS) —
  never propose removing it.
- `LayerRow` spreads `{...rest}` AFTER its own `onKeyDown` (`LayerRow.jsx:102`), so passing
  `onKeyDown` as a prop CLOBBERS Alt+Arrow reorder. Put handlers on the LayersPanel wrapper.
