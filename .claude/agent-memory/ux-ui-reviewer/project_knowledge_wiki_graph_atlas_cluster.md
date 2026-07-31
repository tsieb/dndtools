---
name: knowledge-wiki-graph-atlas-cluster
description: FIXED-vs-OPEN split + spec-coupling map for screens/{Knowledge,WikiReader,Graph,Atlas}.tsx, re-audited 2026-07-30 at commit 016b696c (run #12)
metadata:
  type: project
---

## Surface map (true at 016b696c)
- `screens/Knowledge.tsx` (1131 ln) — list + `NoteViewer` + inline `Composer`/`ImportPanel`.
  Own `mdToNodes`/`boldify`/`parseWikilink`; **duplicated** in WikiReader — fixes land twice.
- `screens/WikiReader.tsx` (629 ln) — PUBLIC account-less `#/wiki?id=`, chrome-less,
  `<div data-theme="parchment">` per phase. Cloud-gated; e2e only reaches missing/invalid;
  password + ready phases are covered by `src/screens/WikiReader.test.tsx` (jsdom).
- `screens/Graph.tsx` (710 ln) — read-only relationship graph + faceted search.
- `screens/Atlas.tsx` (1113 ln) — map library shell around `MapCanvas`/`MapBuilder`.

## ⚠️ THE BIG ONE (run #12) — an "Overwrite existing" import is unconfirmed DATA DESTRUCTION
`Knowledge.tsx:52-56` offers `overwrite` in a plain `Select` (:811) next to a plain `Import`
(:834). `core/src/state/content-import.ts:384` writes `items[step.itemId] = buildImportedItem(...)`
in place, and `buildImportedItem` (:295-330) replaces `body` (:319), **resets `visibility` to the
file's value — failing closed to `dm-only` (:324)** and **blanks `sharedWith` (:325)**. So one
mis-picked policy silently un-shares every player-visible note it touches AND discards every edit
the DM made since the last import. There is NO inverse command (`content.restore-item` only clears
a soft-delete tombstone), no preview, no confirm, and the damage is only reported AFTER the fact
("…, N overwritten." :957). Same file gives a single note delete an Undo toast (:440) and gives a
single visibility reveal a confirm Dialog (:643). `knowledge.spec.ts:358-386` uses the DEFAULT
`skip` policy, so an overwrite-ONLY confirm keeps the suite green.

## FIXED — do NOT re-report
Knowledge: try/catch/**finally** on `save`/`applyVisibility`/`remove`/`createNote`/`runImport` ·
Cancel clears `err` (:539) · EmptyState "New note" collapses siblings (:1066) · `runImport` resets
`importFailed` (:940) · error above body + `role=alert` (:562) · `key={open.id}` (:891) · Composer
Enter busy guard (:701) · Delete `variant="danger"` (:549) · Textarea aria-label (:800) · row
`flexWrap` (:810) · `role=status` + tone + warning icon (:821-833) · wikilink `<button>`s (:141) ·
`<ul>` grouping (:184) · push-confirm Dialog (:643).
Atlas: `run()` clears/reports/catches/finally (:212-234) · notice `{tone,text}` alert+assertive
(:531-568) · map-chip click clears notice (:468) · `l.locked` rendered (:873) · POI-row
`aria-pressed` (:962) · `deletePoi` deselects only on accept (:361) · POI "Focus on map" really
pans+zooms (:631-636) · `ghostBtn` 24px floor (:61) · chevron gap (:821) · chip `aria-current`
(:457) · layer `Switch disabled={busy}` (:894) · unavailable overlay `pointerEvents:'none'` (:737).
**`MapCanvas` read-only `touchAction` is FIXED** — `atlas.spec.ts:134-138` now pins
`touch-action: pan-y` on `[data-testid="map-canvas-well"]`. The phone-scroll-dead-zone finding is
CLOSED; do not re-file it.
Graph: search-input Escape (:421-426) · `role=status` count (:225) · `aria-pressed` on nodes (:350),
facets (:447), rows (:476) · Escape hoisted to the GRID (:263) · 10px node-label floor (:381) ·
Search panel above Selected (:400 vs :528) · no `outline:none` on the raw input (:434).
WikiReader: sticky/`maxHeight` phone-gated (:559-564) · page-switch focus+scroll (:304-311) ·
`failedAttempts`-keyed alert (:432-445) · invalid `role=alert` (:388) + **Retry (:397-407)** ·
`<main id="wiki-content" tabIndex=-1>` (:602) + skip link (:479) · password Enter busy guard (:349).
DS-layer, now fixed and no longer a consumer problem here: `Icon.jsx:324` maps `dm-only` to
`VenetianMask`, distinct from `visibility-players`' `Eye`, so every compact `VisibilityChip` in
Knowledge (:1107) and Atlas (:887/:998) is grayscale-safe.

## STILL OPEN (ranked, 016bои686c → 016b696c)
1. **Overwrite import** — see THE BIG ONE.
2. `Knowledge.tsx:406-423` a successful "Push to players" has **ZERO announcement** (only failure
   sets `err`) AND drops focus to `<body>`: the Dialog restores focus to its opener while
   `note.visibility` is still `dm-only`, then the async accept unmounts BOTH entry points (:490,
   :586) under focus. `knowledge.spec.ts:239` CONTRACTS the unmount, so the fix is
   `Toaster.success` + an explicit focus move (the Seg at :585 is always mounted).
3. `Knowledge.tsx:614/:629 → :898` note-to-note nav keeps `#main-content`'s scroll offset and drops
   focus. On phone the grid is `1fr` (:469) so you must scroll past the whole article to reach a
   backlink — then land at that offset in the next note. `WikiReader.tsx:304-311` is the in-repo
   fix. NOTE: the shell has **no scroll restoration at all** (`grep scrollTo app/` = only
   WikiReader), so this is a shell-wide latent issue that Knowledge merely makes visible.
4. `Knowledge.tsx:534/:465` Cancel + BackBar discard an edited note with no dirty check.
   ⚠️ `knowledge.spec.ts:206` clicks `'Cancel'` exact while the title field IS dirty (filled to '')
   — a naive confirm BREAKS that test. HIGH risk; scope the prompt or update the spec.
5. `Atlas.tsx:491` `<StatusDot status="live" pulse />` with **no `label`** is the sole cue that a map
   is delivered to players — against StatusDot's own docstring (`ds/.../StatusDot.jsx:3-6`: "Always
   pair with an adjacent text label"). Under `forced-colors` `--color-status-success` → `CanvasText`
   (`colors.css:389`), so the dot is indistinguishable from decoration. WCAG 1.4.1.
6. `Graph.tsx:216-221` "Player view" hard-`disabled` with no reason. `Seg` (`screen-kit.tsx:206-217`)
   still has NO `title`/description in its option type. **Cheapest fix needs no DS change**: render a
   sibling `<span>` next to the Seg when `playerId === dmId`. If you do extend Seg, use `title=`,
   NEVER `aria-label=` — graph.spec.ts:86/97/178 match the radio by NAME.
7. `Graph.tsx:284` phone `aspectRatio:'16/11'` ⇒ ~251px canvas; `d = 34+degree*7` capped 70 (:341)
   clips the top/bottom nodes against `overflow:hidden`. ⚠️ `graph.spec.ts:200-238` pins the
   `viewBox="0 0 100 70"` + `left:x%`/`top:(y/70)*100%` mapping — change `aspectRatio` and the
   diameter, NEVER `positioned()`.
8. `Knowledge.tsx:1052-1076` the zero-notes EmptyState is DM authoring copy ("Nothing written down /
   Notes … live here. Backlinks connect them automatically.") shown to a PLAYER with nothing shared.
   Atlas branches correctly at :503-507 and :1016-1027. `knowledge.spec.ts:438` asserts the string
   as DM, so branching the non-author case only is safe.
9. `Knowledge.tsx:761` ImportPanel `text` survives a successful import ⇒ a second Import re-runs it.
10. `Knowledge.tsx:1003-1015` toggling "Import vault" CLOSED doesn't clear `importMsg`/`importFailed`
    (the panel's own Close at :1042 does) ⇒ stale result on reopen.
11. `Atlas.tsx:637` POIPopover "Edit" → `openBuilder('select')`, which `setSelPoiId(null)` first
    (:245) — the editor opens with nothing selected. `MapBuilder` has no `initialSelection` prop.
12. `Atlas.tsx:169-171` a `?poi=` deep link naming a POI the actor can't see silently highlights
    nothing (the `map` branch at :167 does `fail(...)`; the poi-only branch says nothing).
13. **NO global `button:hover`** — `src/styles/{index,tokens/*}.css` contain 11 "hover" hits and ALL
    are token DECLARATIONS (`--color-interactive-hover` etc.); there is no `:hover` selector rule.
    Zero-feedback inline controls: Atlas map chips (:453), Graph nodes (:343) / facets (:443) /
    search rows (:473), WikiReader page nav (:570). `Knowledge`'s `RelRow` (:267) is the in-repo
    `useState` hover precedent; `--color-interactive-hover` is the token to use.
14. `Atlas.tsx:648` `maxWidth:'calc(100% - 190px)'` + `whiteSpace:'nowrap'` (:663) ⇒ ~153px of map
    title on a 393px phone. Measured: the desktop zoom cluster is only ~148px wide, and on phone the
    reserve is pure waste.
15. `Atlas.tsx:1052-1055` "Draw areas in the map editor" renders for players; "Open in map editor"
    (:509) is NOT `isDm`-gated, so they get a read-only viewer and cannot draw.
    ⚠️ `responsive.spec.ts:815`, `android-quick-map.spec.ts:44`, `map-editor.spec.ts:148` all pin
    the string `'Open in map editor'` — gate the copy, don't rename the button.
16. `Knowledge.tsx:810-846` the import result still renders INSIDE the flexWrap button row — a long
    rejection reflows Import/Close out from under the pointer.
17. `Graph.tsx:368` `opacity: dim ? 0.4 : 1` on node BUTTONS that keep their visible titles and stay
    focusable/clickable ⇒ likely WCAG 1.4.3 failure for a de-emphasized-but-live control. axe reports
    ancestor-opacity contrast as *incomplete*, so the gate cannot catch it. ~0.6 keeps the affordance.
18. `Graph.tsx:225-229` the `role="status"` count line re-announces on EVERY keystroke in the search
    box (~16 announcements for "Campaign Primer"). Debounce the announced text.
19. `Atlas.tsx:879-888` / `:990-999` nest a `VisibilityChip` (which sets its own compact
    `title={l.label}`, `VisibilityChip.jsx:27`) inside a `<button title="Visibility: … — click to
    toggle …">`. The inner title wins on hover, so the toggle's own affordance hint is unreachable.
    Fix: wrap the chip in `<span style={{pointerEvents:'none', display:'inline-flex'}}>`.
20. `WikiReader.tsx:297/:573` `openSlug` is local state, never in the URL — no per-page deep link;
    reload/Back drops to page 1. Also on phone the nav is `static` with no cap, so an N-page wiki
    puts N buttons ahead of every article and the only skip is a focus-only fixed link (:479).
21. `Atlas.tsx:612` `height={560}` still has no `isPhone` branch (77% of the phone main pane).
    Much lower severity now that `touchAction` is `pan-y` — it is density, not a scroll trap.
22. `/wiki` is in `responsive.spec.ts:650` (375×520 overflow/clipping) and `a11y-axe-gate.spec.ts:210`,
    but the **forced-colors / 200%-text / reduced-motion loop (`responsive.spec.ts:677-720`) walks
    `ROUTES` only** (:5-19), which excludes `/wiki`, `/play`, `/join`. Those three need their own
    a11y-mode loop (they have no `#main-content` and `/wiki`,`/play` have no `<h1>` in every phase).

## Verified NON-defects (do not chase)
- ⚠️ **CORRECTION to run #11 item 17.** `Graph.tsx:449` facet chips measure ~23.8px tall, but they
  **PASS** WCAG 2.5.8 via the *Spacing* exception: chip width ≥38px and `gap:6` put adjacent centers
  ≥29px apart, so 24px-diameter circles never intersect. axe's `target-size` (in AXE_TAGS) agrees —
  `/graph` passes the gate. Do not file this again.
- Motion is handled GLOBALLY: `styles/index.css:255-265` zeroes `animation-duration` under
  `[data-motion='reduced'|'none']`, and `tokens/spacing.css:143-153` zeroes every `--duration-*`.
  StatusDot's `dndPulse` and Graph's `transition` are covered. Never file a per-component
  prefers-reduced-motion finding here.
- Token layer is CLEAN here. `--color-status-{error,warning}-{text,subtle}` defined per theme;
  `--color-status-*-border` is a `:root, [data-theme]` alias so nested `data-theme` subtrees
  (WikiReader, Community) resolve it.
- `Icon.jsx:324` `dm-only` → `VenetianMask` (was `Eye`) — the compact-chip colour-alone class is
  CLOSED. `VisibilityChip` also normalizes raw core values (`player-visible`/`shared` → `players`).
- `DS Button` wraps its LABEL (`whiteSpace:'normal'; overflowWrap:'anywhere'`).
- `Card interactive` + `onClick` auto-adds `role=button`/`tabIndex=0`/Enter+Space.
- `Seg` IS a real radiogroup w/ roving tabIndex + arrows + `flexWrap` (its only gap is #6).
- `IconButton size="sm"` = 1.75rem = 28px — above the 24px floor. Atlas's zoom cluster is fine.
- Graph's `openNode` labels match nav.ts (`/campaign`="Story", `/atlas`="Maps").
- Atlas's error notice uses `--color-status-warning-*` (not error) — deliberate parity with
  `app/map/MapEditor.tsx`.
- `platform/filePick.ts` never throws on cancel; `pickFiles`'s `if (!archive) return` is dead code
  (`pickedFilesToArchiveText` always emits a header). Not worth a finding.
- `main.tsx:17-22` globally toasts unhandled rejections, so a bare `void dispatch` is GENERIC, not
  silent. Only file a missing catch where the UI ALSO lies.

## Spec-coupling map (change these strings → break these files)
- `tests/e2e/atlas.spec.ts` — :26 `'Project to players'`; :32/:44 `[role="alert"]`/`[role="status"]`
  in `#main-content`; :39 switch name `/^Show .+ on the map$/`; :52 `'Dismiss notice'`; :65
  `/Ruined Keep/`; :69 `aria-current='true'`; :88 `/Western Reaches/`; :93/:94 exact
  `'Highlight Harbor Town on the map'` / `"Highlight Smugglers' Cache on the map"` + `aria-pressed`;
  :126 `/· locked/`; :137 `[data-testid="map-canvas-well"]` must keep `touch-action: pan-y`.
- `tests/e2e/knowledge.spec.ts` — :86 `'New note'`; :87 placeholder `'New note title…'`; :88
  `'Create'`; :128/:170/:200/:254 `'Edit'` exact; :132 placeholder `'Note title'`; :134 `'Save note'`;
  :177 `'A note needs a title.'` via a SINGLE `getByRole('alert')` **in edit mode** (a second
  concurrent alert = strict-mode violation); :206 `'Cancel'` exact **while dirty**; :227/:293 radio
  `'Players'`; :228 dialog `/Show .* to players/`; :230/:239/:282 `'Push to players'` (:239 asserts
  count 0 AFTER the push — the unmount is contracted); :255 `'Delete'` exact; :258/:263
  `getByRole('status')` filtered on 'deleted'/'restored'; :262 `'Undo'`; :287 `'Keep DM only'`;
  :318/:329 wikilink buttons; :345-353 `ul`/`li`; :358 `'Import vault'`; :371 `'Import'` exact;
  :374 exact `'Imported 2 new.'`; :379 `'Close'` exact; :438 `'Nothing written down'`; :442/:448
  `aria-expanded` on `'Import vault'`; :445 `'New note'`**.last()**; :453 `'Sources'`.
- `tests/e2e/graph.spec.ts` — :30 count string `/Showing \d+ of \d+ visible nodes?/`; :39
  `getByLabel('Search the graph')`; :43/:72 `getByText('Selected')` (COUNT assertions only, never
  visibility → scrolling is safe); :46 `'Open note'`; **:78 ±8px no-reflow on the SEARCH ROW
  (`.last()`)**; :86/:97/:178 radio `'Player view'`/`'DM view'`; :112/:117 `aria-pressed` on the
  canvas node (`.first()`); :122 Escape from the node; :175 facet `'Note'` exact; :182-187 asserts
  NO `/^delete/i`, `/^edit/i`, `'Push to players'`, `/new note|new quest|new faction/i` buttons
  exist anywhere on /graph; :200-238 edge geometry pins `viewBox="0 0 100 70"` + `left:x%` /
  `top:(y/70)*100%` — DON'T touch `positioned()`, change `aspectRatio`.
- `tests/e2e/wiki.spec.ts` — :64 `getByRole('main')` comes from `Notice`'s `role="main"`
  (WikiReader.tsx:259) — do not remove; :65 `'No wiki link'`; :76 `'Wiki unavailable'`; :84
  `getByRole('alert')`.
- `src/screens/WikiReader.test.tsx` — pins `input[type="password"]`, a button matching
  `/Open wiki|Checking/`, `'That password is not right'`, `'Still not right after 2 attempts'`, and
  that the second alert is a NEW node.
- `responsive.spec.ts:815` + `android-quick-map.spec.ts:44` + `map-editor.spec.ts:148` pin
  `'Open in map editor'` (Atlas.tsx:516). `android-quick-map.spec.ts:353` pins the exact
  `Projected “{name}” to 3 players.`
- Gates: `responsive.spec.ts:5-19` ROUTES + `a11y-axe-gate.spec.ts:23-39` cover `/atlas`,
  `/knowledge`, `/graph`. Playwright profiles are `desktop-chromium` and `mobile-chromium` =
  **Pixel 5 (393×851)**. `known-violations.json` is `{"violations": []}`, so ANY new
  serious/critical axe hit fails the gate outright. AXE_TAGS includes `wcag22aa` ⇒ `target-size`
  IS enforced.
- `responsive.spec.ts`'s `clippedControls` measures against the VIEWPORT on the X axis only, so
  ancestor-`overflow:hidden` clipping (Graph canvas) and vertical scroll traps are BOTH invisible.
</content>
</invoke>
