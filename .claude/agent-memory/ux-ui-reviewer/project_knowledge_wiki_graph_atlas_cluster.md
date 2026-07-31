---
name: knowledge-wiki-graph-atlas-cluster
description: FIXED-vs-OPEN split + spec-coupling map for screens/{Knowledge,WikiReader,Graph,Atlas}.tsx, re-audited 2026-07-31 at commit 21e4f86e (run #13)
metadata:
  type: project
---

## Surface map (true at 21e4f86e)
- `screens/Knowledge.tsx` (1194 ln) — list + `NoteViewer` + inline `Composer`/`ImportPanel`.
  Own `mdToNodes`/`boldify`/`parseWikilink`; **duplicated** in WikiReader — fixes land twice.
- `screens/WikiReader.tsx` (629 ln) — PUBLIC account-less `#/wiki?id=`, chrome-less,
  `<div data-theme="parchment">` per phase. Cloud-gated; e2e only reaches missing/invalid;
  password + ready phases are covered by `src/screens/WikiReader.test.tsx` (jsdom).
- `screens/Graph.tsx` (718 ln) — read-only relationship graph + faceted search.
- `screens/Atlas.tsx` (1123 ln) — map library shell around `MapCanvas`/`MapBuilder`.

## ⚠️ THE BIG ONE (run #13) — the Atlas live-projection dot is DEAD on the DM surface
`Atlas.tsx:140-143` computes `delivered = deliveredMapIdsForActor(session, actorId)` with
`actorId = runtime.defaultActorId`. `map-query.ts:170-181` reads
`session.activeMapProjections[actorId]`, and `session-control.ts:819-826` **rejects any
DM-authority target** and keys projections by PLAYER id only. So for the DM — the only actor
with the chip row's authoring controls — `delivered` is permanently empty: the `StatusDot`
at `:491-501` never renders and run #13's brand-new `<span style={srOnly}>Live to players</span>`
is dead code. After "Project to players" the DM's only feedback is the dismissible notice; no
persistent on-screen cue says which map is live. Under "view as player" (`defaultActorId`
returns the previewed actor, `SceneRuntime.ts:251-253`) the dot DOES appear — and the sr-only
text reads "Live to players" to the player themself. Fix: when `isDm`, derive from ALL
projections (`new Set(Object.values(session.activeMapProjections).map(p => p.mapId))`) and
branch the word. **NO e2e touches the dot or the string** (atlas.spec.ts unchanged since
016b696c) — SAFE.

## FIXED — do NOT re-report
Knowledge: try/catch/**finally** on `save`/`applyVisibility`/`remove`/`createNote`/`runImport` ·
Cancel clears `err` · EmptyState "New note" collapses siblings · `runImport` resets
`importFailed` · error above body + `role=alert` · `key={open.id}` · Composer Enter busy guard ·
Delete `variant="danger"` · Textarea aria-label · row `flexWrap` · `role=status` + tone + warning
icon · wikilink `<button>`s · `<ul>` grouping · push-confirm Dialog ·
**overwrite-import confirm Dialog (:877-902, spec'd at knowledge.spec.ts:390-435)** ·
**`applyVisibility` success `Toaster.success` (:423-428)** ·
**non-author EmptyState branch (:1114-1119)**.
Atlas: `run()` clears/reports/catches/finally · notice `{tone,text}` alert+assertive · map-chip
click clears notice · `l.locked` rendered · POI-row `aria-pressed` · `deletePoi` deselects only on
accept · POI "Focus on map" pans+zooms · `ghostBtn` 24px floor · chevron gap · chip `aria-current` ·
layer `Switch disabled={busy}` · unavailable overlay `pointerEvents:'none'` · `MapCanvas`
read-only `touchAction: pan-y` (pinned by `atlas.spec.ts:134-138`) ·
**StatusDot sr-only companion text (:497-501) — but see THE BIG ONE + item 2 below.**
Graph: search-input Escape · `role=status` count · `aria-pressed` on nodes/facets/rows · Escape on
the GRID · 10px node-label floor · Search panel above Selected · no `outline:none` on the input ·
**"Player view" disabled-reason hint (:226-230, pinned by graph.spec.ts:258/:284)**.
WikiReader: sticky/`maxHeight` phone-gated · page-switch focus+scroll · `failedAttempts`-keyed
alert · invalid `role=alert` + Retry · `<main id="wiki-content" tabIndex=-1>` + skip link ·
password Enter busy guard.
DS layer: `Icon.jsx:324` `dm-only` → `VenetianMask`, so every compact `VisibilityChip` here is
grayscale-safe.

## STILL OPEN (ranked, 21e4f86e)
1. **Atlas live-dot dead for the DM** — see THE BIG ONE. `Atlas.tsx:140-143` / `:491-501`.
2. `Atlas.tsx:497-501` the sr-only fix does NOT close the forced-colors half its own comment
   claims. `srOnly` (`screen-kit.tsx:91-102`) is `clip-path: inset(50%)` — invisible. A SIGHTED
   forced-colors/grayscale user still gets no live cue once `--color-status-success` flattens to
   `CanvasText` (`colors.css:389`). Fix: visible word, or pass StatusDot's own `label` prop
   (`StatusDot.jsx:7,49-66` supports it). No spec. SAFE.
3. `Graph.tsx:596-644` Connections rows drop keyboard focus to `<body>`. Keys are
   `${otherId}-${i}` over `selEdges`, which is recomputed from the NEW selection the click sets —
   so the pressed button unmounts. Same jump-out-from-under-the-pointer hazard the file documents
   at `:402-406` for search rows, but here it also breaks the keyboard path. Fix: `tabIndex={-1}`
   ref on the Selected title (`:559`), focused inside the row's `onClick` (NOT an effect — that
   would steal focus from canvas/search selections). No spec touches these rows. SAFE.
4. `Atlas.tsx:853-855` non-DM layer rows render `<Icon name="drag-handle" />` where the DM gets
   the reorder chevrons. Nothing here is draggable (the DM reorders with BUTTONS; there is no drag
   impl in the file), so a player sees the universal reorder affordance and gets no response.
   Fix: inert spacer or the category glyph. No spec references `drag-handle`. SAFE.
5. `Knowledge.tsx:407-434` the toast half of the push fix landed; the FOCUS half did not. Dialog
   restores focus to its opener, and BOTH openers (`:501-509`, `:602-613`) are conditional on
   `visibility !== 'player-visible'` — the accepted dispatch unmounts them under focus.
   Fix: focus the always-mounted `Seg` at `:596`. `knowledge.spec.ts:239` contracts the unmount but
   asserts nothing about focus. SAFE.
6. `Atlas.tsx:1055-1057` header says `{fog.length} changes` while `:1090` lists only
   `fog.slice(-4)` — "12 changes" over 4 rows, no "showing latest 4", no way to the rest. SAFE.
7. `Graph.tsx:591-593` "No links from or to this node yet." while a facet/query is active is
   FALSE. `viz.edges` is filtered and `degree` is post-filter too
   (`graph-visualization-query.ts:260-272`), so both numbers agree — but the COPY asserts the links
   don't exist. Branch on `facet !== 'all' || query.trim()`. No spec pins the string. SAFE.
8. `Graph.tsx:226-230` the new hint is a dead-end `<span>`; `/settings?tab=players` IS a working
   deep link (`Settings.tsx:4870` reads `?tab`). Wrap in a ghost Button keeping the EXACT wording
   (`graph.spec.ts:284` uses `getByText`, which still matches a button). Also unassociated with the
   disabled radio — `Seg` (`screen-kit.tsx:206-217`) has no `describedBy`, so the visible sibling
   is the pragmatic answer. ⚠️ `SceneRuntime.ts:62-67` seeds 3 `role:'player'` demo actors into
   every vault, so `playerId === dmId` is unreachable outside the test that strips the roster —
   this whole branch is near-dead in the real app.
9. `Knowledge.tsx:884` the overwrite confirm names the safe path in prose ('Choose "Skip
   collisions"') but the footer is Cancel / Overwrite only. ⚠️ `knowledge.spec.ts:412` clicks
   `'Cancel', exact` INSIDE the dialog — do NOT rename it; ADD a third "Skip collisions instead"
   button. Also its two buttons lack `disabled={busy}` (the reveal dialog's have it, `:671`/`:680`).
10. `Knowledge.tsx:782` ImportPanel `text` survives a successful import ⇒ a second Import re-runs
    it. **Now higher stakes**: after an Overwrite the archive is still in the box with Import still
    enabled, and the confirm is the only barrier. Spec-safe to clear on success — neither overwrite
    test asserts the textarea AFTER a successful import (only after Cancel, `:415`).
11. `WikiReader.tsx:473+` never sets `document.title` (`grep document.title apps/gm-react/src` = 0
    hits app-wide). This is the one surface where the tab/bookmark/share-sheet title is the ONLY
    chrome. One-liner `useEffect` in the ready phase. No spec. SAFE.
12. `Knowledge.tsx:614/:629 → :898` note-to-note nav keeps `#main-content`'s scroll offset and
    drops focus. `WikiReader.tsx:304-311` is the in-repo fix. Shell-wide latent
    (`grep scrollTo app/` = only WikiReader).
13. `Knowledge.tsx:534/:465` Cancel + BackBar discard an edited note with no dirty check.
    ⚠️ `knowledge.spec.ts:206` clicks `'Cancel'` exact while the title field IS dirty — a naive
    confirm BREAKS it. HIGH risk.
14. `Graph.tsx:284` phone `aspectRatio:'16/11'` ⇒ ~251px canvas; `d = 34+degree*7` capped 70
    (`:349`) clips top/bottom nodes against `overflow:hidden`. ⚠️ `graph.spec.ts:200-238` pins the
    `viewBox="0 0 100 70"` + `left:x%`/`top:(y/70)*100%` mapping — change `aspectRatio` and the
    diameter, NEVER `positioned()`.
15. `Knowledge.tsx:1003-1015` toggling "Import vault" CLOSED doesn't clear `importMsg`/
    `importFailed` (the panel's own Close does) ⇒ stale result on reopen.
16. `Atlas.tsx:647` POIPopover "Edit" → `openBuilder('select')`, which `setSelPoiId(null)` first
    (`:245`) — the editor opens with nothing selected. `MapBuilder` has no `initialSelection`.
17. `Atlas.tsx:169-171` a `?poi=` deep link naming an invisible POI silently highlights nothing
    (the `map` branch at `:167` does `fail(...)`; the poi-only branch says nothing).
18. **NO global `button:hover`** — `src/styles/{index,tokens/*}.css` "hover" hits are all token
    DECLARATIONS; there is no `:hover` selector rule. Zero-feedback inline controls: Atlas map chips
    (`:453`), Graph nodes (`:351`) / facets (`:451`) / search rows (`:481`) / connection rows
    (`:602`), WikiReader page nav (`:570`). `Knowledge`'s `RelRow` (`:267`) is the in-repo
    `useState` precedent; `--color-interactive-hover` is the token.
19. `Atlas.tsx:658` `maxWidth:'calc(100% - 190px)'` + `whiteSpace:'nowrap'` (`:673`) ⇒ ~153px of
    map title on a 393px phone; the desktop zoom cluster it reserves for is only ~148px wide.
20. `Atlas.tsx:1062-1064` "Draw areas in the map editor" renders for players; "Open in map editor"
    (`:519-527`) is NOT `isDm`-gated, so they get a read-only viewer and cannot draw.
    ⚠️ `responsive.spec.ts:815`, `android-quick-map.spec.ts:44`, `map-editor.spec.ts:148` pin the
    string `'Open in map editor'` — gate the copy, don't rename the button.
21. `Knowledge.tsx:837-876` the import result still renders INSIDE the flexWrap button row — a long
    rejection reflows Import/Close out from under the pointer.
22. `Graph.tsx:376` `opacity: dim ? 0.4 : 1` on node BUTTONS that keep visible titles and stay
    focusable ⇒ likely WCAG 1.4.3 failure. axe reports ancestor-opacity contrast as *incomplete*,
    so the gate can't catch it. ~0.6 keeps the affordance.
23. `Graph.tsx:233-237` the `role="status"` count re-announces on EVERY keystroke (~16 for
    "Campaign Primer"). Debounce the announced text.
24. `Atlas.tsx:886-898` / `:1000-1009` nest a `VisibilityChip` (own compact `title`,
    `VisibilityChip.jsx:27`) inside a `<button title="Visibility: … — click to toggle …">`. The
    inner title wins on hover. Fix: wrap in `<span style={{pointerEvents:'none'}}>`.
25. `WikiReader.tsx:297/:573` `openSlug` is local state, never in the URL — no per-page deep link;
    reload/Back drops to page 1. Phone nav is `static` with no cap, so an N-page wiki puts N buttons
    ahead of every article (only escape is the focus-only fixed skip link at `:479`).
26. `Atlas.tsx:622` `height={560}` still has no `isPhone` branch (77% of the phone main pane).
    Density, not a scroll trap, now that `touchAction` is `pan-y`.
27. `Atlas.tsx:1066-1086` Reveal/Conceal `disabled={!selectedId}` is DEAD — the block is inside
    `{isDm && mapView && …}` and `mapView` non-null implies `selectedId` (`:180-189`). Nit.
28. `/wiki` is in `responsive.spec.ts:650` + `a11y-axe-gate.spec.ts:210`, but the forced-colors /
    200%-text / reduced-motion loop (`responsive.spec.ts:677-720`) walks `ROUTES` only (`:5-19`),
    which excludes `/wiki`, `/play`, `/join`.

## Verified NON-defects (do not chase)
- ⚠️ `Graph.tsx:457` facet chips measure ~23.8px tall but **PASS** WCAG 2.5.8 via the *Spacing*
  exception (width ≥38px, `gap:6` ⇒ centers ≥29px apart). axe's `target-size` agrees. Do not re-file.
- ⚠️ `Graph`'s "Connections (N)" vs the node's own degree badge do NOT contradict —
  `graph-visualization-query.ts:81-82,260-272` computes degree WITHIN the filtered result. Only the
  COPY at `:591-593` is wrong (item 7).
- Motion is handled GLOBALLY (`styles/index.css:255-265` + `tokens/spacing.css:143-153`). Never file
  a per-component prefers-reduced-motion finding here.
- Token layer is CLEAN here. `--color-status-*-border` is a `:root, [data-theme]` alias, so the
  nested `data-theme="parchment"` subtrees (WikiReader `:355/:371/:383/:415/:474`, Community) resolve it.
- `DS Button` wraps its LABEL; `Card interactive` auto-adds `role=button`/`tabIndex`/Enter+Space;
  `Seg` IS a real radiogroup w/ roving tabIndex + arrows + `flexWrap`; `IconButton size="sm"` = 28px.
- Atlas's error notice uses `--color-status-warning-*` (not error) — deliberate parity with
  `app/map/MapEditor.tsx`.
- `Atlas.projectToPlayers` (`:415-417`) targets `role === 'player'` only, excluding observers —
  but `Session.tsx:520-527` does exactly the same. Product decision, not a screen defect.
- `platform/filePick.ts` never throws on cancel; `pickFiles`'s `if (!archive) return` is dead code.
- `main.tsx:17-22` globally toasts unhandled rejections, so a bare `void dispatch` is GENERIC, not
  silent. Only file a missing catch where the UI ALSO lies.
- `Dialog` DOES portal + `role=dialog`/`aria-modal` + `isolateModalSiblings`
  (`Dialog.jsx:4,78,201-202`), so nesting one inside `ImportPanel`'s Card is fine.

## Spec-coupling map (change these strings → break these files)
- `tests/e2e/atlas.spec.ts` (UNCHANGED since 016b696c) — :26 `'Project to players'`; :32/:44
  `[role="alert"]`/`[role="status"]` in `#main-content`; :39 switch name `/^Show .+ on the map$/`;
  :52 `'Dismiss notice'`; :65 `/Ruined Keep/`; :69 `aria-current='true'`; :88 `/Western Reaches/`;
  :93/:94 exact `'Highlight Harbor Town on the map'` / `"Highlight Smugglers' Cache on the map"` +
  `aria-pressed`; :126 `/· locked/`; :137 `[data-testid="map-canvas-well"]` must keep
  `touch-action: pan-y`. **Nothing pins the live dot / "Live to players" / `drag-handle`.**
- `tests/e2e/knowledge.spec.ts` — :86 `'New note'`; :87 placeholder `'New note title…'`; :88
  `'Create'`; :128/:170/:200/:254 `'Edit'` exact; :132 placeholder `'Note title'`; :134 `'Save note'`;
  :177 `'A note needs a title.'` via a SINGLE `getByRole('alert')` in edit mode; :206 `'Cancel'`
  exact **while dirty**; :227/:293 radio `'Players'`; :228 dialog `/Show .* to players/`;
  :230/:239/:282 `'Push to players'` (:239 asserts count 0 AFTER — unmount is contracted); :255
  `'Delete'` exact; :258/:263 `getByRole('status')` on 'deleted'/'restored'; :262 `'Undo'`; :287
  `'Keep DM only'`; :318/:329 wikilink buttons; :345-353 `ul`/`li`; :358 `'Import vault'`; :371
  `'Import'` exact; :374 exact `'Imported 2 new.'`; :379 `'Close'` exact;
  **:390-435 the overwrite confirm — dialog name `/Overwrite existing notes/`, `'Cancel'` exact
  INSIDE it, `'Overwrite'` exact, textarea VALUE preserved after Cancel (:415), `'Imported 1 new.'`;
  :426-435 asserts the `skip` path raises NO dialog**; :438 `'Nothing written down'` (as DM);
  :442/:448 `aria-expanded` on `'Import vault'`; :445 `'New note'`**.last()**; :453 `'Sources'`.
- `tests/e2e/graph.spec.ts` — :30 count string `/Showing \d+ of \d+ visible nodes?/`; :39
  `getByLabel('Search the graph')`; :43/:72 `getByText('Selected')` (COUNT only, never visibility);
  :46 `'Open note'`; **:78 ±8px no-reflow on the SEARCH ROW (`.last()`)**; :86/:97/:178 radio
  `'Player view'`/`'DM view'`; :112/:117 `aria-pressed` on the canvas node (`.first()`); :122 Escape;
  :175 facet `'Note'` exact; :182-187 asserts NO delete/edit/push/new-* buttons exist on /graph;
  :200-238 edge geometry pins `viewBox="0 0 100 70"` + `left:x%`/`top:(y/70)*100%`;
  **:258/:284 pin the exact hint `/Add a player in Settings to preview the player viewpoint\./`
  via `getByText` (a Button wrapper still matches)**.
- `tests/e2e/wiki.spec.ts` — :64 `getByRole('main')` comes from `Notice`'s `role="main"`
  (WikiReader.tsx:259) — do not remove; :65 `'No wiki link'`; :76 `'Wiki unavailable'`; :84
  `getByRole('alert')`.
- `src/screens/WikiReader.test.tsx` — pins `input[type="password"]`, a button matching
  `/Open wiki|Checking/`, `'That password is not right'`, `'Still not right after 2 attempts'`, and
  that the second alert is a NEW node.
- `responsive.spec.ts:815` + `android-quick-map.spec.ts:44` + `map-editor.spec.ts:148` pin
  `'Open in map editor'` (Atlas.tsx:526). `android-quick-map.spec.ts:353` pins the exact
  `Projected “{name}” to 3 players.`
- Gates: `responsive.spec.ts:5-19` ROUTES + `a11y-axe-gate.spec.ts:23-39` cover `/atlas`,
  `/knowledge`, `/graph`. Profiles are `desktop-chromium` and `mobile-chromium` = **Pixel 5
  (393×851)**. `known-violations.json` is `{"violations": []}` ⇒ ANY new serious/critical axe hit
  fails the gate. AXE_TAGS includes `wcag22aa` ⇒ `target-size` IS enforced.
- `responsive.spec.ts`'s `clippedControls` measures against the VIEWPORT on the X axis only, so
  ancestor-`overflow:hidden` clipping (Graph canvas) and vertical scroll traps are BOTH invisible.
