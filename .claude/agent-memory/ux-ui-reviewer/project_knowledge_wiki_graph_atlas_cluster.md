---
name: knowledge-wiki-graph-atlas-cluster
description: FIXED-vs-OPEN split + spec-coupling map for screens/{Knowledge,WikiReader,Graph,Atlas}.tsx, re-audited 2026-07-30 at commit 9aeebdde (run #11)
metadata:
  type: project
---

## Surface map (true at 9aeebdde)
- `screens/Knowledge.tsx` (1131 ln) — list + `NoteViewer` + inline `Composer`/`ImportPanel`.
  Own `mdToNodes`/`boldify`/`parseWikilink`; **duplicated** in WikiReader — fixes land twice.
- `screens/WikiReader.tsx` (614 ln) — PUBLIC account-less `#/wiki?id=`, chrome-less,
  `<div data-theme="parchment">` per phase. Cloud-gated; e2e only reaches missing/invalid.
- `screens/Graph.tsx` (710 ln) — read-only relationship graph + faceted search.
- `screens/Atlas.tsx` (1110 ln) — map library shell around `MapCanvas`/`MapBuilder`.

## ⚠️ THE BIG ONE (run #11, NEW) — `MapCanvas` is a phone scroll dead zone
`app/MapBuilder.tsx:687` sets `touchAction: 'none'` **unconditionally**, but
`onWellPointerDown` (:554-556) returns immediately when `!editable`. Atlas mounts it read-only
(`Atlas.tsx:607`, no `editable`, no `onPan`) at a hard `height={560}` (:613, no `isPhone` branch).
So on phone a 560px block owns no gesture AND blocks page scroll. At the 375×520 size
`responsive.spec.ts:588/644` uses, the canvas is TALLER than the viewport ⇒ total trap.
**Minimal fix + in-repo precedent:** `SceneBoardCanvas.tsx:480` already writes
`touchAction: policy === 'bounded' ? 'pan-y' : 'none'`. Mirror it: `editable ? 'none' : 'pan-y'`.
No gate sees this — `clippedControls`/`expectNoHorizontalOverflow` only measure the X axis and
viewport-relative rects.

## FIXED — do NOT re-report
Knowledge: `save`/`applyVisibility`/`remove`/`createNote`/`runImport` all have try/catch/**finally**
(:379-393, :409-422, :428-460, :904-931, :942-971) — the frozen-`busy` dead-panel class is CLOSED ·
Cancel clears `err` (:539) · EmptyState "New note" collapses the other two disclosures (:1066) ·
`runImport` resets `importFailed` (:940) · error placement above body + `role=alert` (:562) ·
`key={open.id}` (:891) · Composer Enter busy guard (:701) · Delete `variant="danger"` (:549) ·
Textarea aria-label (:800) · row `flexWrap` (:810) · `role=status` + tone + warning icon (:821-833) ·
wikilinks are real `<button>`s (:141) · `<ul>` grouping (:184) · push-confirm Dialog (:643).
Atlas: `run()` clears/reports/catches/finally (:212-234) · notice `{tone,text}` alert+assertive
(:531-568) · map-chip click clears `notice` (:468) · `l.locked` rendered as " · locked" (:870) ·
POI-row `aria-pressed` (:959) · `deletePoi` deselects only on accept (:361) · POI "Focus on map"
really pans+zooms (:632-637) · `ghostBtn` 24px floor (:61) · chevron gap (:818) · map chip
`aria-current` (:457) · layer `Switch disabled={busy}` (:891).
Graph: search-input Escape (:421-426) · `role=status` count (:225) · `aria-pressed` on nodes (:350),
facets (:447), search rows (:476) · Escape hoisted to the GRID (:263) · 10px node-label floor (:381) ·
Search panel above Selected (:400 vs :528) · no `outline:none` on the raw input (:434).
WikiReader: sticky/`maxHeight`/`overflowY` now **phone-gated** (:544-549) · page-switch focus+scroll
(:301-308) · `failedAttempts`-keyed alert (:417-430) · invalid `role=alert` (:388) · real
`<main id="wiki-content" tabIndex=-1>` (:587) + skip link (:464) · password Enter busy guard (:348).
**Gate coverage:** `/wiki` IS now tested — `responsive.spec.ts:649` (375×520 loop with /play,/join)
and `a11y-axe-gate.spec.ts:210`. The old "absent from responsive" note is DEAD. Only the **ready
phase** is still untested (both hit missing/invalid; cloud is blanked on the e2e server).

## STILL OPEN (ranked, 9aeebdde)
1. Phone scroll dead zone — see above.
2. **`Knowledge.tsx:811-816` + `:834` — "Overwrite existing" import is irreversible, unconfirmed,
   unpreviewed.** `state/content-import.ts:386` replaces items in place; there is NO inverse command
   (`content.restore-item` only undoes a soft delete). You learn the damage from the AFTER message
   ("…, M overwritten."). Internal inconsistency clinches it: single-note Delete gets an Undo toast
   (:440) and a visibility reveal gets a confirm Dialog (:643) — bulk vault overwrite gets neither.
3. `Graph.tsx:220` "Player view" `disabled` with no reason. **`Seg` (`app/screen-kit.tsx:147`) has
   NO title/description in its option type** — a fix needs an API extension. graph.spec.ts:86/97/136
   pin the accessible NAME, so add `title=`, never `aria-label=`.
4. `Graph.tsx:528` Selected panel ~700px down on phone (251px canvas + ~400px Search). Fix = scroll
   into view **only for canvas-node clicks** (:351); the search-row path (:477) must stay put or
   graph.spec.ts:78 (±8px no-reflow on `.last()`) fails.
5. `Knowledge.tsx:417` visibility rejections set `err`, rendered at :562 above the body. On phone the
   grid is `1fr` (:469) so the Sharing rail's "Push to players" (:587) reports its failure above the
   whole article. Route it through `Toaster.error` like `createNote` (:922).
6. `WikiReader.tsx:380-396` invalid phase is a dead end — `fetchWiki` is right there; no Retry.
7. **Focus drops to `<body>` after a successful "Push to players".** Dialog restores to its opener
   (`Dialog.jsx:147`) while `note.visibility` is still `dm-only`, then the async accept unmounts BOTH
   push entry points (:490, :586) under focus. Same class: Edit (:483) / Save (:528) unmount on toggle.
8. `Atlas.tsx:649` `maxWidth:'calc(100% - 190px)'` + `whiteSpace:'nowrap'` (:664) ⇒ ~171px of map
   title on a 393px phone; the 190px reserve is the DESKTOP zoom cluster.
9. `Graph.tsx:284` phone `aspectRatio:'16/11'` ⇒ 251px canvas; `d = 34+degree*7` capped 70 (:341)
   clips top/bottom nodes against `overflow:hidden`, and the ellipse perimeter (~735px) can't seat
   >~12 nodes without overlap.
10. `Knowledge.tsx:619/:635 → :898` note-to-note nav keeps scroll + drops focus (the un-fixed twin of
    WikiReader :301-308).
11. `Knowledge.tsx:761` ImportPanel `text` survives a successful import ⇒ a second Import re-runs it.
12. `Knowledge.tsx:1008` toggling "Import vault" CLOSED doesn't clear `importMsg`/`importFailed`
    (the panel's own Close at :1042 does) ⇒ stale result on reopen.
13. `Knowledge.tsx:534/:465` Cancel + BackBar discard an edited note with no dirty check.
14. `Atlas.tsx:726` unavailable overlay is `inset:0` with no `pointerEvents:'none'`, painting over the
    zoom cluster (:689). LOW reachability (`selectedId` comes from the actor-filtered list).
15. `Atlas.tsx:638` POIPopover "Edit" → `openBuilder('select')`, which `setSelPoiId(null)` first
    (:245) — the editor opens with nothing selected. `MapBuilder` has no `initialSelection` prop.
16. `Atlas.tsx:165` a `?poi=` deep link naming a POI the actor can't see silently highlights nothing.
17. `Graph.tsx:449` facet chips ≈23.8px (4px pad + 11.5px font + border) — under WCAG 2.5.8.
18. **NO global `button:hover` anywhere** (`src/styles/index.css` has 0 occurrences of "hover").
    Inline-styled controls with zero feedback: Atlas map chips (:470), Graph nodes (:354) / facets
    (:449) / search rows (:478), WikiReader page nav (:560). `Knowledge`'s `RelRow` (:267) is the
    in-file precedent for the `useState` hover pattern.
19. `WikiReader.tsx:294/:558` `openSlug` is local state, never in the URL — no per-page deep link;
    reload/Back drops to page 1.
20. `WikiReader.tsx:405` password field not autofocused (the screen's only control); `invalid` is set
    but there is no `aria-describedby` to the alert at :421.
21. `Atlas.tsx:1051` "Draw areas in the map editor" renders for players too; "Open in map editor"
    (:509) is NOT `isDm`-gated, so they get the viewer and cannot draw.
22. `Knowledge.tsx:821` import result still renders INSIDE the flexWrap button row — a long rejection
    reflows Import/Close out from under the pointer.

## Verified NON-defects (do not chase)
- Token layer is CLEAN here. `--color-status-{error,warning}-{text,subtle}` defined per theme;
  `--color-status-*-border` is a `:root, [data-theme]` alias (`styles/tokens/colors.css:349-355`)
  written so nested `data-theme` subtrees (WikiReader, Community) resolve it.
- `DS Button` wraps its LABEL (`whiteSpace:'normal'; overflowWrap:'anywhere'`) — don't file
  phone-overflow findings on Button rows without measuring.
- `Card interactive` + `onClick` auto-adds `role=button`/`tabIndex=0`/Enter+Space.
- `Seg` IS a real radiogroup w/ roving tabIndex + arrows + `flexWrap` (its only gap is #3 above).
- Graph's `openNode` labels match nav.ts (`/campaign`="Story", `/atlas`="Maps"). Not a terminology bug.
- Atlas layer swatches use `--layer-*`; parchment re-cuts them dark. Fine on both raised tones.
- `run()`'s stale-closure `busy` guard still lets `projectToPlayers`' two sequential dispatches through.
- Atlas's error notice uses `--color-status-warning-*` (not error) — deliberate parity with
  `app/map/MapEditor.tsx`. Don't file it as a token mismatch.

## Spec-coupling map (change these strings → break these files)
- `tests/e2e/atlas.spec.ts` — :26 `'Project to players'`; :32/:44 `[role="alert"]`/`[role="status"]`
  in `#main-content`; :39 switch name `/^Show .+ on the map$/`; :52 `'Dismiss notice'`.
  **No spec touches the POI-list "Highlight … on the map" button.**
- `tests/e2e/knowledge.spec.ts` — :86 `'New note'`; :87 placeholder `'New note title…'`; :88 `'Create'`;
  :170/:231 `'Edit'` exact; :173 `'Save note'`; :177 `'A note needs a title.'` via a SINGLE
  `getByRole('alert')` **in edit mode** (a second concurrent alert = strict-mode violation, so gate
  any new alert on `!editing`); :204/:270 radio `'Players'`; :205 dialog `/Show .* to players/`;
  :207/:216/:259 `'Push to players'`; :232 `'Delete'`; :235/:240 `getByRole('status')`; :239 `'Undo'`;
  :264 `'Keep DM only'`; :295/:306 wikilinks; :322-330 `ul`/`li`; :335 `'Import vault'`; :348
  `'Import'`; :351 exact `'Imported 2 new.'`; :356 `'Close'`. **NEW (run #11)**: a Cancel-clears-err
  test now DOES click NoteViewer's `'Cancel'` exact, and an EmptyState test asserts
  `aria-expanded='false'` on `'Import vault'` after clicking `'New note'`**.last()**.
- `tests/e2e/graph.spec.ts` — :30 count string; :39 `getByLabel('Search the graph')`; :43/:72
  `getByText('Selected')` (COUNT assertions only, never visibility → scrolling is safe); :46
  `'Open note'`; **:78 ±8px no-reflow on the SEARCH ROW (`.last()`)**; :86/:97/:136 radio
  `'Player view'`/`'DM view'`; :112/:117 `aria-pressed` on the canvas node (`.first()`); :122 Escape
  from the node; :133 facet `'Note'` exact; :167-195 edge geometry pins `viewBox="0 0 100 70"` +
  `left:x%`/`top:(y/70)*100%` (so DON'T touch `positioned()`'s cx/cy/rx/ry — change `aspectRatio`).
- `tests/e2e/wiki.spec.ts` — :64 `getByRole('main')` comes from `Notice`'s `role="main"`
  (WikiReader.tsx:256) — do not remove; :65 `'No wiki link'`; :76 `'Wiki unavailable'`; :84
  `getByRole('alert')`.
- `responsive.spec.ts:815` + `android-quick-map.spec.ts:44` + `map-editor.spec.ts:148` pin
  `'Open in map editor'` (Atlas.tsx:516). `android-quick-map.spec.ts:353` pins the exact
  `Projected “{name}” to 3 players.`
- Gates: `responsive.spec.ts:4-19` + `a11y-axe-gate.spec.ts:22-36` cover `/atlas`, `/knowledge`,
  `/graph`; `/wiki` is covered separately (responsive :649 at 375×520, axe :210). Playwright profiles
  are `desktop-chromium` and `mobile-chromium` = **Pixel 5 (393×851)**.
  `known-violations.json` is `{"violations": []}` — an empty register, so ANY new serious/critical
  axe hit fails the gate outright.
- `responsive.spec.ts`'s `clippedControls` measures against the VIEWPORT on the X axis only, so
  ancestor-`overflow:hidden` clipping (Graph canvas) and vertical scroll traps are BOTH invisible.
