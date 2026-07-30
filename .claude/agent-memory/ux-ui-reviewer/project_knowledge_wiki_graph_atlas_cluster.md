---
name: knowledge-wiki-graph-atlas-cluster
description: FIXED-vs-OPEN split + spec-coupling map for screens/{Knowledge,WikiReader,Graph,Atlas}.tsx, re-audited 2026-07-30 at commit a9142f7f (run #10)
metadata:
  type: project
---

## Surface map (true at a9142f7f)
- `screens/Knowledge.tsx` (1072 ln) — list + `NoteViewer` + inline `Composer`/`ImportPanel`.
  Own `mdToNodes`/`boldify`/`parseWikilink`; **duplicated** in WikiReader — fixes land twice.
- `screens/WikiReader.tsx` (610 ln) — PUBLIC account-less `#/wiki?id=`, chrome-less,
  `<div data-theme="parchment">` per phase. Cloud-gated; e2e only hits missing/invalid.
- `screens/Graph.tsx` (700 ln) — read-only relationship graph + faceted search.
- `screens/Atlas.tsx` (1093 ln) — map library shell around `MapCanvas`/`MapBuilder`.

## FIXED — do NOT re-report
Atlas: `ghostBtn` 24px floor (:61-71) · POI "Focus on map" pans+zooms (:624-629) · `run()` clears
notice on accept (:222), **surfaces rejections via `fail()` (:225)**, has try/catch (:227) AND a
`finally { setBusy(false) }` (:231) · notice is `{tone,text}` w/ alert+assertive+warning skin (:529)
· New-map `aria-expanded` (:515) · `zoom(fit)` resets pan (:239) · map chips `aria-current` (:454) ·
layer `Switch disabled={busy}` (:879).
Knowledge: `save()` clears `err` first (:369) · `role="alert"` both sites (:504,:532) · `createNote`
rejection → `Toaster.error`, composer stays open (:888-893) · ImportPanel Textarea aria-label (:770),
row flexWrap (:780), role=status + failure tone + warning icon (:791-803) · wikilinks are real
`<button>`s (:141-158) · `<ul>` grouping (:184-188) · push-to-players Dialog (:613-640) ·
`key={open.id}` (:864) · Delete is `variant="danger"` (:519, comment still says "ghost") · Composer
Enter has a `busy` guard (:671).
Graph: `role="status"` count (:225) · `aria-pressed` facets (:437) + nodes (:350) + search rows (:466)
· toggle-off everywhere · **Escape handler hoisted to the GRID (:263), not the canvas** · 10px node
label floor (:381) · Search panel above Selected (:400 vs :518).
WikiReader: `failedAttempts` keyed alert (:417-430) · `invalid` role=alert (:388) · real
`<main id="wiki-content" tabIndex=-1>` (:583) + skip link (:464-488) · page-switch focus+scrollTo
(:301-308) · password Enter `busy` guard (:348) · **sticky nav `maxHeight`+`overflowY` (:544-545)**.

## STILL OPEN (ranked, a9142f7f)
1. **NO `try/finally` around `setBusy` in Knowledge — 5 sites**: `save()` :374/:382,
   `applyVisibility()` :399/:407, `remove()` :413/:422, `createNote()` :873/:881, `runImport()`
   :897/:907. `SceneRuntime.dispatchNow` **rethrows** on persist failure (`SceneRuntime.ts:480`),
   so a throw leaves `busy=true` forever ⇒ Save/Cancel/Delete all `disabled={busy}` ⇒ dead panel
   holding the DM's typed draft. Atlas's `run()` is the in-repo reference implementation.
2. **`Graph.tsx:414-429` search input has NO `onKeyDown`** — yet Graph.tsx:261-262 AND
   graph.spec.ts:133-136 both assert in prose that Escape there clears the query. Dead by omission.
3. **`Knowledge.tsx:512` Cancel does not `setErr(null)`** — the edit-mode validation error survives
   into view mode's `role="alert"` (:532) above the note body.
4. **`Knowledge.tsx:408` visibility rejections set `err`, which renders at :532 above the note body.**
   On phone the Sharing rail is BELOW the body, so the rail's "Push to players" (:557) reports its
   failure off-screen. Route it through `Toaster.error` like `createNote` (:892).
5. `Atlas.tsx:939-966` POI row toggle is the LAST colour-only selection in the cluster (no
   `aria-pressed`). Map chips got `aria-current`, Graph got `aria-pressed`.
6. **`WikiReader.tsx:544-545` maxHeight/overflowY are NOT phone-gated** (:528/:530 are) → on Pixel 5
   the stacked nav becomes a ~viewport-tall inner scroller above the article. Regression of the
   run-#9 fix.
7. `Graph.tsx:518` Selected panel sits ~700px down on phone (canvas 251 + Search ~400) → tapping a
   canvas node has no visible effect but dimming. Fix = scroll-into-view **only for canvas-node
   clicks** (:351); the search-row path (:467) must stay put or graph.spec.ts:78 fails.
8. `Atlas.tsx:455-461` map-chip click does not clear `notice` → the deep-link failure (:167) outlives
   the map switch. `run()` only clears on an accepted dispatch.
9. `Atlas.tsx:794-887` `l.locked` IS in `MapLayerQueryEntry` (`core/src/queries/map-layer-query.ts:40,113`)
   and still never rendered — the DM only learns a layer is locked by being refused.
10. `WikiReader.tsx:294,554` `openSlug` is local state, never in the URL → a public wiki has no
    per-page deep link, and reload/Back drops the reader to page 1.
11. `Knowledge.tsx:1011` EmptyState "New note" doesn't collapse Import/Sources (header button at
    :969 does) → two disclosures open at once.
12. `Knowledge.tsx:898` `runImport` clears `importMsg` but not `importFailed`.
13. `Atlas.tsx:357` `deletePoi` clears selection + closes the popover BEFORE dispatching.
14. `Graph.tsx:284` phone `aspectRatio:'16/11'` ⇒ 251px canvas; nodes at `d = 34+degree*7` capped 70
    clip at the ellipse's top/bottom for degree ≥ 5.
15. `Knowledge.tsx:731` ImportPanel `text` not cleared after a successful import.
16. Carried, low: note-to-note nav keeps scroll + drops focus (Knowledge :343,:589,:605 — the
    un-fixed twin of WikiReader :301-308) · import result renders inside the flexWrap button row
    (:791) · disclosure toggles don't clear `importMsg` (:938-976) · discard-with-no-dirty-check
    (:512,:446) · Atlas `height={560}` unbranched (:605) + ~171px map-title cap (:641) · Atlas
    `inset:0` unavailable overlay lacks `pointerEvents:'none'` (:717) · Graph facet chips ≈23.8px
    (:439) · Graph "Player view" disabled with no explanation (:220) · no hover on Atlas map chips
    (:450) / Graph nodes+facets+rows / WikiReader nav (:551).

## Verified NON-defects (do not chase)
- **Token layer is CLEAN for this cluster.** `--color-status-{error,warning}-{text,subtle,foreground}`
  are all defined in 5 places (per theme + forced-colors); `--color-status-*-border` is a
  `:root, [data-theme]` alias (`styles/tokens/colors.css:349-355`) written EXACTLY so nested
  `data-theme` subtrees (WikiReader, Community) resolve it correctly. Token dir is
  `src/styles/tokens/`.
- `DS Button` has `whiteSpace:'normal'; overflowWrap:'anywhere'; maxWidth:'100%'`, so a tight
  button row wraps its LABELS rather than overflowing `.app-main`. Don't file phone-overflow
  findings on Button rows without measuring.
- `Card interactive` + `onClick` auto-adds `role=button`, `tabIndex=0`, Enter/Space (Card.jsx:12-25).
- `Seg` (`app/screen-kit.tsx:147+`) is a real radiogroup w/ roving tabIndex + arrows + `flexWrap`.
- Graph's `openNode` labels match nav.ts: `/campaign` IS labelled "Story", `/atlas` "Maps",
  `/knowledge` "Notes". Not a terminology bug.
- Atlas layer swatches use `--layer-*`, which parchment re-cuts dark (`colors.css:301-321`) — fine
  on both `--color-surface-raised` tones.
- `run()`'s stale-closure `busy` guard lets `projectToPlayers`' two sequential dispatches through.

## Spec-coupling map (change these strings → break these files)
- `tests/e2e/atlas.spec.ts` — :26 `'Project to players'`; :32/:44 `[role="alert"]`/`[role="status"]`
  in `#main-content`; :39 switch name `/^Show .+ on the map$/`; :52 `'Dismiss notice'`.
  **No spec touches the POI-list "Highlight … on the map" button** → aria-pressed there is free.
- `tests/e2e/knowledge.spec.ts` — :86 `'New note'`; :87 placeholder `'New note title…'`; :88 `'Create'`;
  :170/:231 `'Edit'` exact; :173 `'Save note'`; :177 `'A note needs a title.'` via a SINGLE
  `getByRole('alert')` **in edit mode** (a second concurrent alert = strict-mode violation, so gate
  any new alert on `!editing`); :204/:270 radio `'Players'`; :205 dialog `/Show .* to players/`;
  :207/:216/:259 `'Push to players'`; :232 `'Delete'`; :235/:240 `getByRole('status')`; :239 `'Undo'`;
  :264 `'Keep DM only'`; :295/:306 wikilinks; :322-330 `ul`/`li`; :335 `'Import vault'`; :348
  `'Import'`; :351 exact `'Imported 2 new.'`; :356 `'Close'`. **NO spec clicks NoteViewer's Cancel.**
- `tests/e2e/graph.spec.ts` — :30 count string; :39 `getByLabel('Search the graph')`; :43/:72
  `getByText('Selected')` (COUNT assertions only, never visibility → scrolling is safe); :46
  `'Open note'`; **:78 ±8px no-reflow on the SEARCH ROW (`.last()`)**; :86/:97/:136 radio
  `'Player view'`/`'DM view'` (explain the disabled state with `title=`, never `aria-label=`);
  :112/:117 `aria-pressed` on the canvas node (`.first()`); :122 Escape from the node; :133 facet
  `'Note'` exact; :167-195 edge geometry pins `viewBox="0 0 100 70"` + `left:x%`/`top:(y/70)*100%`
  (so DON'T change `positioned()`'s cx/cy/rx/ry — change `aspectRatio` instead).
- `tests/e2e/wiki.spec.ts` — :64 `getByRole('main')` comes from `Notice`'s `role="main"`
  (WikiReader.tsx:256) — do not remove; :65 `'No wiki link'`; :76 `'Wiki unavailable'`; :84
  `getByRole('alert')`. The whole **ready phase is untested**.
- `responsive.spec.ts:815` + `android-quick-map.spec.ts:44` + `map-editor.spec.ts:148` pin
  `'Open in map editor'` (Atlas.tsx:504). `android-quick-map.spec.ts:353` pins the exact
  `Projected “{name}” to 3 players.`
- Gates: `responsive.spec.ts:4-19` + `a11y-axe-gate.spec.ts:22-36` cover `/atlas`, `/knowledge`,
  `/graph`. **`#/wiki` is in NEITHER** — every WikiReader finding is spec-free. Playwright profiles
  are `desktop-chromium` and `mobile-chromium` = **Pixel 5 (393×851)**, not 375.
- `responsive.spec.ts`'s `clippedControls` measures against the VIEWPORT, so clipping by an
  ancestor's `overflow:hidden` (e.g. the Graph canvas) is invisible to that gate.
