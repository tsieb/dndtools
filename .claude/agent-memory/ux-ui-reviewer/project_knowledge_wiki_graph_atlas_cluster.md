---
name: knowledge-wiki-graph-atlas-cluster
description: FIXED-vs-OPEN split + spec-coupling map for screens/{Knowledge,WikiReader,Graph,Atlas}.tsx, re-audited 2026-07-30 at commit 329bcc58 (run #8)
metadata:
  type: project
---

## Surface map (true at 329bcc58)
- `screens/Knowledge.tsx` (1068 ln) — list + `NoteViewer` + inline `Composer`/`ImportPanel`.
  Own `mdToNodes`/`boldify`/`parseWikilink`; **duplicated** in WikiReader — fixes land twice.
- `screens/WikiReader.tsx` (604 ln) — PUBLIC account-less `#/wiki?id=`, chrome-less,
  `<div data-theme="parchment">` per phase. Cloud-gated; e2e only hits missing/invalid.
- `screens/Graph.tsx` (697 ln) — read-only relationship graph + faceted search.
- `screens/Atlas.tsx` (1085 ln) — map library shell around `MapCanvas`/`MapBuilder`.

## FIXED — do NOT re-report
Atlas: `ghostBtn` minWidth/minHeight 24 (:61-71) · POI "Focus on map" really pans+zooms (:619-624)
and `center` reaches MapCanvas (:599) · `run()` clears notice on accept (:222) **and now has
try/catch → fail()** (:224-227) · notice is a `{tone,text}` object with alert/assertive +
warning skin + warning glyph on error (:518-555) · New-map `aria-expanded` (:510) ·
`zoom(fit)` also resets pan (:236).
Knowledge: `save()` clears `err` first (:369) · `role="alert"` both error sites (:504,:530) ·
`createNote` rejection now surfaces via `Toaster.error` and keeps the composer open (:884-889) ·
ImportPanel Textarea aria-label (:766), row flexWrap (:776), role=status + failure tone + warning
icon (:787-799) · wikilinks are real `<button>`s (:141-158) · `<ul>` grouping (:184-188) ·
push-to-players Dialog confirm (:611-638) · `key={open.id}` on NoteViewer (:860).
Graph: `role="status"` count (:225) · `aria-pressed` on facets (:434) and nodes (:347) · toggle
`setSel(cur===id?null:id)` (:348,:464) · Escape clears (:269-274) · focus ring on search input ·
10px node-label floor (:378) · **Search panel is now ABOVE Selected** (:397 vs :515).
WikiReader: entire prior group — `failedAttempts` counter + keyed re-mounted alert (:415-428),
`invalid` `role="alert"` (:386), ready-phase real `<main id="wiki-content" tabIndex=-1>` (:577) +
skip link (:462-486), page-switch focus-to-heading + scrollTo (:301-308).

## STILL OPEN (ranked, 329bcc58)
1. **`Atlas.tsx:287,300,312,320,329,341` — 6 `void run(...)` sites never read `result.status`.**
   `run` (:212-231) surfaces THROWS only; a *rejection* dies silently. Concretely reachable:
   `packages/core/src/commands/map-layer.ts:73` rejects a locked layer with "Layer … is locked …
   Unlock it first." Compounding: `MapLayerQueryEntry.locked` IS returned
   (`core/src/queries/map-layer-query.ts:41`) and Atlas's layer row (:830-877) never renders it.
   Fix: `else fail(result.rejection.message)` inside `run`.
2. **`Knowledge.tsx:666-668` Composer Enter has no `busy` guard** (Create button at :674 does) →
   key-repeat fires N `content.create-item`.
3. **`WikiReader.tsx:532-541`** page `<nav position:sticky top:22>` has no `maxHeight`/`overflowY`
   → on a long wiki the bottom entries are permanently unreachable on desktop.
4. **`Atlas.tsx:447-479` map-switcher chips have no `aria-pressed`/`aria-current`** — selection is
   border+background+colour only (WCAG 1.4.1/4.1.2). Graph's chips already got this.
5. **`Knowledge.tsx:343,587,603` `onOpen` → `navigate()` with no scroll reset and no focus move.**
   Scroll container is `AppShell.tsx:1112` `#main-content` and NOTHING in the app resets it on
   route change (grep: zero `scrollTo`/`ScrollRestoration` outside Board/WikiReader). This is the
   un-fixed twin of the WikiReader fix at `WikiReader.tsx:301-308`.
6. **`Graph.tsx:269-274` Escape handler is on the CANVAS div only** — selecting from the search
   list (:464) then pressing Escape does nothing. Hoist to the grid at :257.
7. **`Knowledge.tsx:517` Delete is `variant="ghost"`, identical to Cancel at :512.** `Button` has a
   real `danger` variant (`ds/components/core/Button.jsx:66`).
8. **`Knowledge.tsx:787-799` import result renders INSIDE the flexWrap button row** → a long
   rejection wraps and shoves Import/Close to the next line, out from under the pointer.
9. **`Graph.tsx:220` "Player view" is `disabled` with zero explanation**; `Seg`
   (`app/screen-kit.tsx:147-240`) supports no `title`/hint at all.
10. **`Atlas.tsx:869-873` `Switch` is the only layer-row control missing `disabled={busy}`**
    (chevrons :810/:820, chip :863 all have it) → mid-flight click swallowed by `run`'s guard.
11. **`Atlas.tsx:712-726` unavailable overlay is `inset:0`, no `pointerEvents:'none'`, and sits
    AFTER the zoom cluster (:676) in DOM** → covers Zoom in/out/Fit + the title. (Reachability is
    narrow: needs listMapsForActor ⊃ getMapViewForActor, e.g. an undelivered `shared` map.)
12. `WikiReader.tsx:407-409` + `:345-348` — password Enter has no `busy` guard; `fetchWiki` has no
    in-flight guard.
13. `Atlas.tsx:1024-1027` fog explainer ("Draw areas in the map editor") renders for NON-DM actors;
    only the buttons at :1028 are `isDm`-gated.
14. **No hover state** on Atlas map chips (:447), Graph facet chips (:430), Graph search rows
    (:460), Graph nodes (:340), WikiReader nav (:545). `RelRow` (Knowledge:274) and `Card
    interactive` already establish the repo pattern.
15. `Knowledge.tsx:512` Cancel / `:446` BackBar discard an edited draft with no dirty check.
16. `Knowledge.tsx:939-969` — Sources/Import vault/New note disclosure toggles do NOT clear
    `importMsg`/`importFailed`; only "Close" (:986-990) does. Reopening replays a stale result.
17. `Graph.tsx:436-444` facet chips ≈23.8px (4+4 padding + ~13.8 line + 2 border) — a hair under
    WCAG 2.5.8.
18. `Atlas.tsx:600` `height={560}` unconditional (no `isPhone`); `:636`
    `maxWidth:'calc(100% - 190px)'` + nowrap caps the map title to ~171px at 393px.

## Verified NON-defects (do not chase)
- Nested-theme aliasing in the wiki subtree is CLEAN; every token WikiReader uses
  (`--color-accent-foreground` :53, `--color-surface-sunken` :32, `--color-status-warning-*`
  :61-64) is redeclared under `[data-theme='parchment']` (`styles/tokens/colors.css:115-178`).
  Token dir is `src/styles/tokens/`, NOT `src/tokens/`.
- `--app-viewport-height` IS globally defined (`styles/index.css:23,110`).
- `WikiReader.tsx:538` sticky on phone is harmless (single-column grid + `alignItems:'start'` ⇒
  zero sticky range). The *desktop* overflow (item 3) is the real bug.
- `MapCanvas` wraps `{children}` in `display:contents` with click/pointer stopPropagation
  (`app/MapBuilder.tsx:1076-1082`) — HUD children do not fall through to the map.
- `App.tsx` gates on `runtime.loaded`, so Atlas's Skeletons are unreachable; Knowledge/Graph having
  no loading state is NOT a false-empty-state bug.
- Atlas POI delete has the Toaster-Undo pattern (:350-386); Knowledge delete likewise (:411-442) —
  no confirm dialog needed, that's the sanctioned pattern.

## Spec-coupling map (change these strings → break these files)
- `tests/e2e/atlas.spec.ts` — :26 `'Project to players'`; :32/:44 `[role="alert"]` / `[role=
  "status"]` scoped to `#main-content`; :39 `switch` name `/^Show .+ on the map$/`; :52
  `'Dismiss notice'`. Adding `else fail()` to `run` is SAFE (the spec's layer toggle is *accepted*).
- `tests/e2e/knowledge.spec.ts` — :86 `'New note'`; :87 placeholder `'New note title…'`; :88
  `'Create'` exact (composer is driven by the BUTTON, never Enter → a busy guard on Enter is SAFE);
  :170/:231 `'Edit'` exact; :173 `'Save note'`; :177 `'A note needs a title.'`; :204/:270 `radio`
  `'Players'`; :205 `dialog` `/Show .* to players/`; :207/:216/:259 `'Push to players'`; :232
  `'Delete'` exact (a `danger` variant swap is SAFE); :235/:240 `getByRole('status')`; :239
  `'Undo'`; :264 `'Keep DM only'`; :295/:306 wikilink buttons by exact title; :322-330 `ul`/`li`
  structure; :335 `'Import vault'`; :348 `'Import'` exact; :351 **exact** `'Imported 2 new.'`; :356
  `'Close'` exact. **NO spec clicks NoteViewer's `'Cancel'`** → a dirty-check dialog is SAFE.
- `tests/e2e/graph.spec.ts` — :30 `/Showing \d+ of \d+ visible nodes?/`; :39 `getByLabel('Search
  the graph')`; :43/:72 `getByText('Selected')`; :46 `'Open note'`; :78 the ±8px no-reflow assert;
  :86/:97/:136 `radio` `'Player view'`/`'DM view'` (explain the disabled state with `title=`, NEVER
  `aria-label=`, or the accname changes); :112/:117 `aria-pressed` on the node; :122 `Escape` from
  the node (hoisting the handler upward keeps this passing); :133 facet chip `'Note'` exact;
  :167-195 the edge-geometry assert pins `viewBox="0 0 100 70"` + `left:x%`/`top:(y/70)*100%`.
- `tests/e2e/wiki.spec.ts` — :64 `getByRole('main')` comes from `Notice`'s `role="main"`
  (WikiReader.tsx:256) — **do not remove it**; :65 `'No wiki link'`; :76 `'Wiki unavailable'`;
  :84 `getByRole('alert')` on the invalid message. The whole **ready phase is untested**.
- `tests/e2e/responsive.spec.ts:815` + `android-quick-map.spec.ts:44` + `map-editor.spec.ts:148`
  pin `'Open in map editor'` (Atlas.tsx:504). `authoring-layout.spec.ts` pins one `<h1>` under
  `/atlas`. `android-quick-map.spec.ts:353` pins the **exact** `Projected “{name}” to 3 players.`
- Gates: `responsive.spec.ts:4-19` and `a11y-axe-gate.spec.ts:22-36` cover `/atlas`, `/knowledge`,
  `/graph`. **`#/wiki` is in NEITHER** — every WikiReader finding is spec-free / risk-free.
