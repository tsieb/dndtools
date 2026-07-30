---
name: knowledge-wiki-graph-atlas-cluster
description: FIXED-vs-OPEN split + spec-coupling map for screens/{Knowledge,WikiReader,Graph,Atlas}.tsx, re-audited 2026-07-30 at commit 0a07165d
metadata:
  type: project
---

## Surface map (true at 0a07165d)
- `screens/Knowledge.tsx` (1063 ln) — notes list + `NoteViewer` detail/edit + inline `Composer`/
  `ImportPanel`. Own `mdToNodes`/`boldify`/`parseWikilink`; **duplicated** in WikiReader — fixes
  must land twice.
- `screens/WikiReader.tsx` (533 ln) — PUBLIC account-less reader `#/wiki?id=`, chrome-less, mounts
  `<div data-theme="parchment">` in every phase. Cloud-gated; e2e only ever exercises the
  missing/invalid fail-closed notices.
- `screens/Graph.tsx` (679 ln) — read-only relationship graph + faceted search.
- `screens/Atlas.tsx` (1061 ln) — map library shell around `MapCanvas`/`MapBuilder`.

## FIXED — do NOT re-report
Atlas: `ghostBtn` now `minWidth/minHeight: 24` (:61-71) · POI popover "Focus on map" really pans+
zooms (:595-600) and `center` is passed to `MapCanvas` (:575) · New-map `aria-expanded` (:493) ·
notice has `role="status"` (:505).
Knowledge: `save()` clears `err` FIRST (:369) · `role="alert"` on both error sites (:504, :531) ·
ImportPanel `Textarea` `aria-label` (:766), row `flexWrap` (:776), `role="status"` + failure tone +
warning icon (:787-799) · wikilinks are real `<button>`s (:141-158) · `<ul>` grouping (:185) ·
push-to-players `Dialog` confirm (:611-638).
Graph: `role="status"` on the count (:225) · `aria-pressed` on facets (:531) · focus ring restored
on the search input (:516-519) · 10px node-label floor (:365).
DS: `Input`/`Textarea` wire `aria-invalid` (`ds/components/forms/Input.jsx:30,34,39`, pinned by
`forms/form-a11y.test.tsx:39-52`, whose comment literally cites "a wrong wiki password").

## STILL OPEN (ranked, 2026-07-30)
1. **`Atlas.tsx:206-214` `run()` never clears `notice`** — the un-fixed twin of
   `app/map/useMapEditor.ts:279-280` (`if accepted → setNotice(null)`). Every write path except
   `projectToPlayers` leaves a prior rejection on screen after a later success. Compounding:
   `Atlas.tsx:501-532` paints ALL outcomes — "Link copied", "Projected to N", AND every rejection —
   with `Icon name="info"` + `T.info` + `T.alt`. Fixed sibling tone is `MapEditor.tsx:676-694`
   (`role="alert"` + warning-subtle/border/text + `Icon name="warning"`). Atlas's banner is MIXED
   (success + failure) so it needs a tone flag, not a blanket warning.
2. **`Atlas.tsx:206-214` `run()` has no `try/catch`** — `useMapEditor.ts:298-300` catches and
   surfaces. Every `void run(...)` call site (:270, :283, :295, :303, :312, :326) turns a thrown
   dispatch into an unhandled rejection with zero UI.
3. **`Knowledge.tsx:868-885` `createNote` discards the rejection.** `setComposing(false)` at :878 is
   unconditional and there is no `else`. Rejected create = composer closes, typed title gone, no
   message. `Toaster` is already imported (:20).
4. **`Graph.tsx` selection can never be cleared.** `setSel` only ever receives an id (:335, :449,
   :560); no `setSel(null)` anywhere. Non-incident nodes stay at opacity 0.4 (:352) and edges at
   0.22 (:319) forever. `Atlas.tsx:911` does the correct toggle.
5. **`Graph.tsx:380-492` `Selected` panel is the FIRST rail child, above `Search` (:494).** Clicking
   a result (:560) inserts ~250px above the list; the row jumps out from under the pointer. On phone
   the rail stacks below the canvas so the list is pushed off-screen.
6. **`WikiReader.tsx:304-311`** — the `invalid` (:355-365) and `missing` (:343-353) notices have NO
   live region (only `loading` :331-335 does), and `submitPassword` (:322-325) never resets
   `state.wrong`, so a 2nd wrong password produces ZERO DOM change. Error text :386-390 has no
   `role` and no `aria-describedby` link to the input.
7. **`WikiReader.tsx:416` / `:482` page switch** — no scroll-to-top, no focus move, no
   announcement. Clicking a wikilink at the bottom of a long page swaps the `<article>` under a
   scroll position that is now meaningless.
8. **`Knowledge.tsx:512` Cancel / `:446` BackBar discard an edited draft with no dirty check.**
9. **`WikiReader.tsx` `ready` phase (:418-532) has no landmark** — `Notice` carries `role="main"`
   (:253) but the actual reader does not, and there is no skip link past the page `<nav>` (:466).
10. `Knowledge.tsx:942-954` — toggling ImportPanel shut via the Sources / Import vault / New note
    disclosure buttons does NOT clear `importMsg`/`importFailed`; only "Close" (:981-985) does.
    Reopening replays a stale result.
11. `Graph.tsx:527-545` facet chips ≈23.8px tall (4px padding + ~13.8px line + 2px border) — a hair
    under WCAG 2.5.8; verify in a browser before acting.
12. `Atlas.tsx:576` `height={560}` unconditional (no `isPhone`); `:612`
    `maxWidth:'calc(100% - 190px)'` + nowrap caps the map title to ~171px at 393px.

## Verified NON-defects (checked at 0a07165d — do not chase)
- **Nested-theme aliasing in the wiki subtree is CLEAN.** `tokens/colors.css` `[data-theme=
  'parchment']` (:148) redeclares all 46 `--color-*` the base `:root` (:24) declares; the
  status-border aliases correctly use `:root, [data-theme]` (:347-348) and the forced-colors block
  likewise (:363-364). The only plain-`:root`-only aliases are the legacy bridge (:325-334:
  `--bg --fg --accent --muted --card --border --danger --surface-subtle`) plus `--color-route-player`
  and `--map-fog-opacity-{dm,player}`. `grep -rn "var(--bg)|var(--fg)|var(--card)|…"` over
  `apps/gm-react/src` returns **zero** consumers. Nothing the wiki renders resolves the wrong theme.
- **`WikiReader.tsx:472-473` `position: sticky` on phone is harmless** (retracts the prior pass's
  item 6). In the single-column phone grid with `alignItems:'start'` (:462) the nav's containing
  block IS its own grid row, so the sticky range is zero. Only desktop actually sticks.
- `ds/components/core/Card.jsx:44,47-48` — `interactive` already gives `cursor:pointer` +
  `onMouseEnter/Leave` border/shadow hover, plus role=button/tabIndex/Enter+Space (:12-25).
  Knowledge's note-card grid (:1020) is fine.
- `App.tsx` gates on `runtime.loaded`, so Atlas's hydration `Skeleton`s (:468-471, :858, :978) are
  unreachable — and Knowledge/Graph having no loading state is NOT a false-empty-state bug.
- Atlas layer/POI row controls are real `<button>`s with `aria-label`s; POI delete has the
  Toaster-Undo pattern (:340-368).

## Spec-coupling map (change these strings → break these files)
- `tests/e2e/knowledge.spec.ts` — :175 `getByRole('alert')`; :186 `'A note needs a title.'`;
  :204-207 reveal `dialog` + `'Push to players'`; :235/:240 `getByRole('status')` toasts;
  :295-308 wikilink buttons by exact title; :335-357 Import flow incl. **exact** `'Imported 2 new.'`
  and the `'Close'` button. No spec clicks NoteViewer's `'Cancel'` → a dirty-check dialog is safe.
- `tests/e2e/graph.spec.ts` — :30 `/Showing \d+ of \d+ visible nodes?/`; :39 `getByLabel('Search
  the graph')`; :43/:89 `getByText('Selected')`; :46 `'Open note'`; :68/:79 `radio` `'Player view'`/
  `'DM view'`; :90 facet chip `'Note'` exact. Reordering Selected below Search does NOT break these.
- `tests/e2e/wiki.spec.ts` — :64 `getByRole('main')` comes from `Notice`'s `role="main"`
  (WikiReader.tsx:253) — **do not remove it**; :65 `'No wiki link'`; :76 `'Wiki unavailable'`.
  Adding a real `<main>` to the ready phase is safe (not covered).
- `tests/e2e/android-quick-map.spec.ts:353` — page-scoped **exact** `Projected “{name}” to 3
  players.`; keep that literal when touching notice code.
- `tests/e2e/map-editor.spec.ts:30-32,185-190` + `authoring-layout.spec.ts:49,53-63` — depend on the
  `'Open in map editor'` label (Atlas.tsx:487) and on exactly one `<h1>` under `/atlas`.
- `tests/e2e/responsive.spec.ts:9` and `a11y-axe-gate.spec.ts:27,29,32` cover `/atlas`, `/knowledge`,
  `/graph`. **`#/wiki` is in NEITHER gate** — WikiReader a11y regressions are caught by nothing.
