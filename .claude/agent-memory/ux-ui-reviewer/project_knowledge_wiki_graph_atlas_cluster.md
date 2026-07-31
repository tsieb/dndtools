---
name: knowledge-wiki-graph-atlas-cluster
description: FIXED-vs-OPEN split + spec-coupling map for screens/{Knowledge,WikiReader,Graph,Atlas}.tsx, re-audited 2026-07-31 at commit 98e0211f (run #22)
metadata:
  type: project
---

## Surface map (true at 98e0211f)
- `screens/Knowledge.tsx` (1201 ln) — list + `NoteViewer` + inline `Composer`/`ImportPanel`.
  Own `mdToNodes`/`boldify`/`parseWikilink`; **duplicated** in WikiReader — fixes land twice.
- `screens/WikiReader.tsx` (643 ln) — PUBLIC account-less `#/wiki?id=`, chrome-less,
  `<div data-theme="parchment">` per phase. Cloud-gated; e2e only reaches missing/invalid;
  password + ready phases are covered by `src/screens/WikiReader.test.tsx` (jsdom).
- `screens/Graph.tsx` (723 ln) — read-only relationship graph + faceted search.
- `screens/Atlas.tsx` (1148 ln) — map library shell around `MapCanvas`/`MapBuilder`.

## ⚠️ THE BIG ONE (run #22) — Atlas feeds `deliveredMapIds` to ONE of its two reads
`Atlas.tsx:195-203` passes `{ deliveredMapIds: delivered }` into `getMapViewForActor`;
`Atlas.tsx:206-214` calls `queryMapLayers(...)` with NO options object at all
(`map-layer-query.ts:136-139` ⇒ `isDelivered()` returns false for every map). For a **non-DM**
actor — a real player device, or the DM under "view as player" — a `shared`-visibility map or
layer that is visible ONLY because it was delivered by `session.project-active-map` therefore:
- resolves `kind:'available'` in the view (name, POIs, fog, tokens render), but
- is filtered out of `layers` ⇒ the Layers panel shows the EmptyState "No layers are visible to
  you", AND `MapBuilder.tsx:516-520 contentLayers` (which derives from this exact prop) drops
  every painted feature ⇒ the canvas renders a blank grid with POIs floating on it.
`levelVisibleToActor` short-circuits on `hasDmAuthority`, so the DM's own view is unaffected —
this is invisible to anyone testing as DM. Fix is one argument:
`queryMapLayers(maps, permissions, actorId, { mapId: selectedId }, { deliveredMapIds: delivered })`.
No spec covers a shared+delivered map. SAFE.

## FIXED at e702bb6f / 98e0211f — do NOT re-report
- **Atlas live-dot dead for the DM** (run #13's BIG ONE) — `:147-158` now unions
  `activeMapProjections` + `playerViewAssignments` when `isDm`, and `:516` branches the sr-only
  word ("Live to players" vs "On your screen"). Verified the union does NOT leak into the DM's
  own render (`map-query.ts:157` returns true for DM authority before `delivered` is read).
- **Atlas non-DM `drag-handle`** → inert `aria-hidden` 14px spacer (`:870-877`).
- **Atlas fog count vs `slice(-4)`** → header appends `· latest 4 shown` (`:1080-1082`).
- **Graph "No links … yet" under an active filter** → branches on `facet !== 'all' || query.trim()`
  (`:590-597`).
- **Knowledge ImportPanel buffer surviving a successful import** → `useEffect` clears `text` on
  `message && !failed` (`:794-796`). ⚠️ but this INTRODUCED a focus regression, see open item 4.
- **WikiReader `document.title`** → set in the ready phase with unmount restore (`:344-352`).

## Older FIXED set (still true) — do NOT re-report
Knowledge: try/catch/**finally** on save/applyVisibility/remove/createNote/runImport · Cancel clears
`err` · EmptyState "New note" collapses siblings · error above body + `role=alert` · `key={open.id}` ·
Composer Enter busy guard · Delete `variant="danger"` · Textarea aria-label · row `flexWrap` ·
`role=status` + tone + warning icon · wikilink `<button>`s · `<ul>` grouping · push-confirm Dialog ·
overwrite-import confirm Dialog (:884-909) · `applyVisibility` success toast (:423-428) ·
non-author EmptyState (:1121-1126).
Atlas: `run()` clears/reports/catches/finally · notice `{tone,text}` alert+assertive · chip click
clears notice · `l.locked` rendered · POI-row `aria-pressed` · `deletePoi` deselects only on accept ·
POI "Focus on map" pans+zooms · `ghostBtn` 24px floor · chip `aria-current` · layer `Switch
disabled={busy}` · unavailable overlay `pointerEvents:'none'` · read-only `touchAction: pan-y`.
Graph: search-input Escape · `role=status` count · `aria-pressed` everywhere · Escape on the GRID ·
10px node-label floor · Search panel above Selected · no `outline:none` · "Player view" hint.
WikiReader: sticky/`maxHeight` phone-gated · page-switch focus+scroll · `failedAttempts`-keyed alert ·
invalid `role=alert` + Retry · `<main id="wiki-content" tabIndex=-1>` + skip link · password Enter guard.

## STILL OPEN (ranked, 98e0211f)
1. **`queryMapLayers` missing `deliveredMapIds`** — THE BIG ONE above. `Atlas.tsx:206-214`.
2. **NEW CLASS: hard-`disabled` controls that blur themselves.** `run()` (`Atlas.tsx:227-229`)
   flips `busy` synchronously inside the click handler; React commits before the dispatch's
   microtask, so EVERY `disabled={busy}` control drops focus to `<body>` on its own click.
   Sites: `:853`/`:863` reorder chevrons (worst — a layer moved to index 0 ALSO leaves Move-up
   permanently disabled), `:795` Project to players, `:825` Add layer, `:915`/`:1026` visibility
   toggles, `:1036` Delete POI, `:926` Switch. DS `Button.jsx:25-26,87` already ships the SOFT
   flavour (`aria-disabled` keeps the tab stop, drops onClick) — that is the fix.
3. **Knowledge edit/view toggle drops focus.** The Edit IconButton (`:492-511`) is gated on
   `!editing`, Cancel (`:545-555`) and a successful Save (`:388`) unmount themselves; the title
   `Input` (`:516-521`) has no `autoFocus`. Nothing announces that an editor opened/closed.
4. **Knowledge Import focus regression (introduced by the run #21 fix).** Clearing `text` on
   success makes the focused `Import` button (`:868-879`, `disabled={busy || !text.trim()}`)
   go hard-disabled ⇒ focus to `<body>` on the app's most destructive screen.
5. `Graph.tsx:191-198` + `:582-587` — an `object` node's button reads "Open in Story" but
   `navigate('/campaign')` carries no target and **`Campaign.tsx` has zero `useParams`/
   `useSearchParams`** (verified by grep), so the user lands on the Story index with nothing
   selected. Note kind→`/knowledge/:id` and map/poi→`/atlas?map=&poi=` DO deep-link.
6. `Atlas.tsx:622-644` with zero maps — `MapCanvas` still renders a 560px well with a LIVE zoom
   cluster (`:715-750`) over `view=null`; Zoom/Fit move the % readout and nothing else. On phone
   that blank box is the whole viewport and the only CTA ("New map", `:546`) is above it.
7. `Atlas.tsx:497-501` sr-only fix does NOT close the forced-colors half. `srOnly`
   (`screen-kit.tsx:91-102`) is `clip-path: inset(50%)`. A SIGHTED forced-colors/grayscale user
   still gets no live cue once `--color-status-success` flattens (`colors.css:389`). StatusDot
   supports a `label` prop (`StatusDot.jsx:7,49-66`).
8. `Graph.tsx:601-608` Connections rows drop keyboard focus to `<body>` — keys are
   `${otherId}-${i}` over `selEdges`, recomputed from the NEW selection, so the pressed button
   unmounts. Fix: `tabIndex={-1}` ref on the Selected title (`:559`), focused in the row onClick.
9. `Knowledge.tsx:596-601` the visibility `Seg` has NO `disabled={busy}` while every sibling does
   (`:607`, `:671`, `:680`) ⇒ overlapping `content.set-item-visibility` writes race.
10. `Knowledge.tsx:131-140` an unresolvable wikilink is a non-focusable `<span>` whose only
    explanation is a `title=` — unreachable by keyboard/touch/AT, and `T.ter` + `T.bdS` dotted is
    the lowest-contrast text in the body.
11. `WikiReader.tsx:434-459` password `Input invalid=` is never tied to the `role="alert"` reason
    via `aria-describedby`. DS `Field` (`ds/components/forms/Field.jsx:75-85`) already does this.
12. `Atlas.tsx:780-800` "Project to players" (no confirm, no undo, lands on every player screen)
    is `variant="ghost"` beside a `variant="primary"` "Fog of war" — hierarchy inverts consequence.
13. `WikiReader.tsx:344-352` `document.title` is ready-phase ONLY, so `missing`/`invalid`/
    `password` — the states a bad-link recipient actually hits — still ship the generic app title.
14. `Knowledge.tsx:407-434` the FOCUS half of the push fix never landed: Dialog restores focus to
    its opener and BOTH openers (`:501-509`, `:602-613`) are conditional on
    `visibility !== 'player-visible'`. Focus the always-mounted `Seg` at `:596`.
15. `Knowledge.tsx:891` the overwrite confirm names the safe path in prose ('Choose "Skip
    collisions"') but the footer is Cancel / Overwrite only. ⚠️ `knowledge.spec.ts:412` clicks
    `'Cancel', exact` INSIDE the dialog — ADD a third button, do NOT rename. Its two buttons also
    lack `disabled={busy}` (the reveal dialog's have it, `:671`/`:680`).
16. `Knowledge.tsx:614/:629 → :898` note-to-note nav keeps `#main-content`'s scroll offset and
    drops focus. `WikiReader.tsx:304-311` is the in-repo fix.
17. `Knowledge.tsx:534/:465` Cancel + BackBar discard an edited note with no dirty check.
    ⚠️ `knowledge.spec.ts:206` clicks `'Cancel'` exact while the title field IS dirty — HIGH risk.
18. `Graph.tsx:292` phone `aspectRatio:'16/11'` ⇒ ~251px canvas; `d = 34+degree*7` capped 70
    (`:349`) clips top/bottom nodes against `overflow:hidden`. ⚠️ `graph.spec.ts:200-238` pins the
    `viewBox="0 0 100 70"` + `left:x%`/`top:(y/70)*100%` mapping — NEVER change `positioned()`.
19. `Knowledge.tsx:1053-1078` toggling "Import vault" CLOSED via the header button does not clear
    `importMsg`/`importFailed` (the panel's own Close at `:1105-1109` does) ⇒ stale result on reopen.
20. `Atlas.tsx:664` POIPopover "Edit" → `openBuilder('select')`, which `setSelPoiId(null)` first
    (`:260`) — the editor opens with nothing selected. `MapBuilder` has no `initialSelection`.
21. `Atlas.tsx:184-186` a `?poi=` deep link naming an invisible POI silently highlights nothing.
22. **NO global `button:hover`** — zero-feedback inline controls: Atlas map chips (`:468`), Graph
    nodes (`:351`) / facets (`:451`) / search rows (`:481`) / connection rows (`:607`), WikiReader
    page nav (`:584`). `Knowledge`'s `RelRow` (`:270-307`) is the in-repo `useState` precedent.
23. `Atlas.tsx:675` `maxWidth:'calc(100% - 190px)'` + `whiteSpace:'nowrap'` ⇒ ~150px of map title
    on a 393px phone; the desktop zoom cluster it reserves for is only ~148px wide.
24. `Atlas.tsx:1087-1090` "Draw areas in the map editor" renders for players; "Open in map editor"
    (`:536-544`) is NOT `isDm`-gated. ⚠️ `responsive.spec.ts:815`, `android-quick-map.spec.ts:44`,
    `map-editor.spec.ts:148` pin the STRING — gate the copy, don't rename the button.
25. `Knowledge.tsx:844-883` the import result renders INSIDE the flexWrap button row — a long
    rejection reflows Import/Close out from under the pointer.
26. `Graph.tsx:376` `opacity: dim ? 0.4 : 1` on node BUTTONS that keep visible titles and stay
    focusable ⇒ likely WCAG 1.4.3 failure. axe reports ancestor-opacity as *incomplete*.
27. `Graph.tsx:233-237` the `role="status"` count re-announces on EVERY keystroke.
28. `Atlas.tsx:911-920` / `:1022-1031` nest a `VisibilityChip` (own compact `title`) inside a
    `<button title="Visibility: …">`. The inner title wins on hover. Wrap in
    `<span style={{pointerEvents:'none'}}>`.
29. `WikiReader.tsx:297/:587` `openSlug` is local state, never in the URL — no per-page deep link;
    reload/Back drops to page 1. Phone nav is `static` with no cap.
30. `Atlas.tsx:639` `height={560}` still has no `isPhone` branch (77% of the phone main pane).
31. `Atlas.tsx:1091-1112` Reveal/Conceal `disabled={!selectedId}` is DEAD — the block is inside
    `{isDm && mapView && …}` and `mapView` non-null implies `selectedId`. Nit.
32. `/wiki` is in `responsive.spec.ts:650` + `a11y-axe-gate.spec.ts:210`, but the forced-colors /
    200%-text / reduced-motion loop (`responsive.spec.ts:677-720`) walks `ROUTES` only (`:5-19`),
    which excludes `/wiki`, `/play`, `/join`.

## Verified NON-defects (do not chase)
- ⚠️ `Graph.tsx:451` facet chips measure ~23.8px tall but **PASS** WCAG 2.5.8 via the *Spacing*
  exception (width ≥38px, `gap:6` ⇒ centers ≥29px apart). axe's `target-size` agrees.
- ⚠️ `Graph`'s "Connections (N)" vs the node's degree badge do NOT contradict — degree is computed
  WITHIN the filtered result (`graph-visualization-query.ts:81-82,260-272`).
- ⚠️ The `delivered` union added for the DM live-dot does NOT change the DM's own map render:
  `map-query.ts:157` returns true on `hasDmAuthority` before `delivered` is consulted.
- ⚠️ `screen-kit.tsx:212-247` `Seg` IS a correct radiogroup — roving tabIndex, Arrow/Home/End,
  skips disabled options, `flexWrap`. Don't file a Seg keyboard finding.
- ⚠️ `AppShell.tsx:858` supplies the page `<h1>`; screens legitimately start at `<h2>`.
- ⚠️ `ImportPanel`'s clear-on-success effect is NOT a double-clear/loop hazard — `runImport` nulls
  `importMsg` first, so the deps genuinely transition. The only problem is the focus loss (item 4).
- Motion is handled GLOBALLY (`styles/index.css:255-265` + `tokens/spacing.css:143-153`).
- Token layer is CLEAN here. `--color-status-*-border` is a `:root, [data-theme]` alias, so the
  nested `data-theme="parchment"` subtrees resolve it.
- `DS Button` wraps its LABEL; `Card interactive` auto-adds `role=button`/`tabIndex`/Enter+Space.
- Atlas's error notice uses `--color-status-warning-*` (not error) — deliberate parity with
  `app/map/MapEditor.tsx`.
- `Atlas.projectToPlayers` (`:428-460`) targets `role === 'player'` only, excluding observers —
  `Session.tsx:520-527` does the same. Product decision.
- `platform/filePick.ts` never throws on cancel; `pickFiles`'s `if (!archive) return` is dead code.
- `main.tsx:17-22` globally toasts unhandled rejections — a bare `void dispatch` is GENERIC, not
  silent. Only file a missing catch where the UI ALSO lies.
- `Dialog` DOES portal + `role=dialog`/`aria-modal` + `isolateModalSiblings`.

## Spec-coupling map (change these strings → break these files)
- `tests/e2e/atlas.spec.ts` (UNCHANGED since 016b696c) — :26 `'Project to players'`; :32/:44
  `[role="alert"]`/`[role="status"]` in `#main-content`; :39 switch name `/^Show .+ on the map$/`;
  :52 `'Dismiss notice'`; :65 `/Ruined Keep/`; :69 `aria-current='true'`; :88 `/Western Reaches/`;
  :93/:94 exact `'Highlight Harbor Town on the map'` / `"Highlight Smugglers' Cache on the map"` +
  `aria-pressed`; :126 `/· locked/`; :137 `[data-testid="map-canvas-well"]` must keep
  `touch-action: pan-y`. **Nothing pins the live dot / "Live to players" / the layer spacer.**
- `tests/e2e/knowledge.spec.ts` — :86 `'New note'`; :87 placeholder `'New note title…'`; :88
  `'Create'`; :128/:170/:200/:254 `'Edit'` exact; :132 placeholder `'Note title'`; :134 `'Save note'`;
  :177 `'A note needs a title.'` via a SINGLE `getByRole('alert')` in edit mode; :206 `'Cancel'`
  exact **while dirty**; :227/:293 radio `'Players'`; :228 dialog `/Show .* to players/`;
  :230/:239/:282 `'Push to players'` (:239 asserts count 0 AFTER — unmount is contracted); :255
  `'Delete'` exact; :258/:263 `getByRole('status')` on 'deleted'/'restored'; :262 `'Undo'`; :287
  `'Keep DM only'`; :318/:329 wikilink buttons; :345-353 `ul`/`li`; :358 `'Import vault'`; :371
  `'Import'` exact; :374 exact `'Imported 2 new.'`; :379 `'Close'` exact;
  :390-435 the overwrite confirm — dialog name `/Overwrite existing notes/`, `'Cancel'` exact
  INSIDE it, `'Overwrite'` exact, textarea VALUE preserved after **Cancel** (:415 — the run #21
  clear-on-success effect does NOT touch this path), `'Imported 1 new.'`; :426-435 asserts the
  `skip` path raises NO dialog; :438 `'Nothing written down'` (as DM); :442/:448 `aria-expanded`
  on `'Import vault'`; :445 `'New note'`**.last()**; :453 `'Sources'`.
- `tests/e2e/graph.spec.ts` — :30 count string `/Showing \d+ of \d+ visible nodes?/`; :39
  `getByLabel('Search the graph')`; :43/:72 `getByText('Selected')` (COUNT only); :46 `'Open note'`;
  :78 ±8px no-reflow on the SEARCH ROW (`.last()`); :86/:97/:178 radio `'Player view'`/`'DM view'`;
  :112/:117 `aria-pressed` on the canvas node (`.first()`); :122 Escape; :175 facet `'Note'` exact;
  :182-187 asserts NO delete/edit/push/new-* buttons exist on /graph; :200-238 edge geometry pins
  `viewBox="0 0 100 70"` + `left:x%`/`top:(y/70)*100%`; :258/:284 pin the exact hint
  `/Add a player in Settings to preview the player viewpoint\./` via `getByText`.
  **Nothing pins the "No links…" string, so the run #21 branch was safe and further edits are too.**
- `tests/e2e/wiki.spec.ts` — :64 `getByRole('main')` comes from `Notice`'s `role="main"`
  (WikiReader.tsx:259) — do not remove; :65 `'No wiki link'`; :76 `'Wiki unavailable'`; :84
  `getByRole('alert')`.
- `src/screens/WikiReader.test.tsx` — pins `input[type="password"]`, a button matching
  `/Open wiki|Checking/`, `'That password is not right'`, `'Still not right after 2 attempts'`, and
  that the second alert is a NEW node.
- `responsive.spec.ts:815` + `android-quick-map.spec.ts:44` + `map-editor.spec.ts:148` pin
  `'Open in map editor'` (Atlas.tsx:543). `android-quick-map.spec.ts:353` pins the exact
  `Projected “{name}” to 3 players.`
- Gates: `responsive.spec.ts:5-19` ROUTES + `a11y-axe-gate.spec.ts:23-39` cover `/atlas`,
  `/knowledge`, `/graph`. Profiles are `desktop-chromium` and `mobile-chromium` = **Pixel 5
  (393×851)**. `known-violations.json` is `{"violations": []}` ⇒ ANY new serious/critical axe hit
  fails the gate. AXE_TAGS includes `wcag22aa` ⇒ `target-size` IS enforced.
- `responsive.spec.ts`'s `clippedControls` measures against the VIEWPORT on the X axis only, so
  ancestor-`overflow:hidden` clipping (Graph canvas) and vertical scroll traps are BOTH invisible.
