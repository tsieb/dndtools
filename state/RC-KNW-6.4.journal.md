# RC-KNW-6.4 implementation journal

2026-10-05. Task branch `dispatch/dndtools/b91ddf6e9abc632bd6f8`, base `b04c529e`, clean tree at
start. No Headroom tools used; raw logs under `/tmp/knw64-*.log`. No agents, no dispatcher state.

## What was built

- Composer (`Composer.tsx`): a "Start from" chip row — Blank first (default), then the built-in
  presets and the DM's own templates from `listContentTemplates`. A template chip opens only its
  REQUIRED variables inline (optional ones take their declared defaults), first field focused,
  Enter submits; creation goes through `content.create-from-template` via the new shared
  `useCreateFromTemplate` hook in `Templates.tsx` (the Templates panel uses the same hook). A
  created note opens in edit mode like a blank one (RC-KNW-6.3 `createdId` path).
- Ctrl/⌘+N: registry entry `knowledge.newNote` (scope `global`, new optional `route` field), fired
  by `useNewNoteShortcut` in `Composer.tsx`; same `state.create` intent as the palette's New note.
  Printed in the `?` overlay and Settings › Accessibility with the global set; excluded from the
  desktop native menu (route-bound entries would be dead elsewhere). Off while typing / under modals.
- Saved searches as chips above the grid (`SavedSearchChips` + `useSavedSearchNoteIds` in
  `SavedSearches.tsx`), shown whether or not the panel is open; a chip toggles the grid to that
  search's live note hits for this actor; heading count follows; empty result says so.
- Notes "Search" toggle → "Filter" with the `filter` icon. Palette row "Refine “{query}” in Notes"
  (Notes group, not remembered) opens `/knowledge` with the query, case kept, in the filter panel
  (existing `state.search` intent). Graph box: "Filter the graph…", panel title "Filter", the
  hand-off button "Refine in Notes", both with the `filter` icon.
- EN + ES catalogs updated; `qps-ploc.ts` regenerated (manifest companion).

## Outside the claim (flagged for the operator)

- `apps/gm-react/src/screens/knowledge/index.tsx` (RC-KNW-6.3's file): the acceptance criteria
  need it — the Filter toggle and the grid live there. Mount-only edits: `filter` icon, chip row +
  grid narrowing, Composer `onCreated`, one `useNewNoteShortcut(canAuthor)` call.
- `apps/gm-react/src/ds/components/core/icon-registry.ts` + `Icon.tsx`: the story names the
  `filter` icon, which did not exist; added `filter: 'Filter'` (Lucide) to the allowlist.
  `docs/reference/ICON_VOCABULARY.md` (companion) lists it.
- `scripts/perf/capture.ts`: one selector, `textbox` named "Search the graph" → "Filter the graph".
  The graph box's accessible name follows its new visible placeholder, and the perf capture's
  graph-search scenario would otherwise time out waiting for a box that no longer has that name.

## Decisions

- Palette row: label "Refine in Notes" with a hint, in its own trailing "Refine" group, offered
  only when the search found something. First draft put the query in the label inside the Notes
  group: it became the first (Enter) row and, since every word of a DS palette row is its
  accessible name, `getByRole('option', { name: X })` after typing X matched it too (two
  command-palette e2e failures, both profiles). Negative control: dropping the hits guard makes the
  new spec's "no Refine row for a no-match query" assertion fail (Expected 0, Received 1).
- Ctrl/⌘+N is a page key; Chrome (non-app mode) reserves it for a new window, so on the plain
  web it works in Playwright, the Electron desktop app and an installed PWA, not a Chrome tab.
- "Three actions" = New note → Session recap chip → Create, with the two required fields typed
  in between (the friction review counts clicks, not keystrokes); Enter in a field also submits.

## Verification

All raw output under `/tmp/knw64-*.log`; final state is commit HEAD of this branch.

- New `tests/e2e/knowledge-start-from.spec.ts`: 12 passed, desktop-chromium + mobile-chromium
  (session recap in three actions with axe on the open composer, Blank create, saved-search chip
  filters the grid with axe, palette handoff keeps "Sunken Crypt" and no row for a no-match query,
  `?` overlay row + Ctrl+N incl. typing guard and from an open note, Graph "Filter the graph…").
- Related e2e after the last code change: knowledge*, graph*, shortcuts, help-menu, screens,
  a11y-axe-gate — 267 passed (`/tmp/knw64-e2e8.log`); command-palette + palette-polish +
  knowledge-start-from 62 passed (`/tmp/knw64-e2e7.log`). Selector-only edits:
  `getByLabel('Search the graph')` → `'Filter the graph'` in graph, graph-polish,
  knowledge-filters and visual graph-polish specs.
- `pnpm test:app`: 167 files, 2,021 tests passed (registry test gains the Ctrl/⌘+N case).
- `pnpm typecheck` (gm-react), `pnpm lint` (full chain), `pnpm format:check:changed -- --base
b04c529e`, `pnpm gates`: all exit 0.
- Visual (pinned container): full `--update-snapshots=none` per tier found only the expected
  movers — golden-routes `/knowledge` (Filter toggle), graph-polish (Filter box, Refine in Notes)
  and palette-help `shortcuts--*` (new row). Re-baselined with `--update-snapshots=changed`,
  recompressed losslessly with zopfli (decoded pixels asserted identical), re-verified:
  knowledge|graph 39 passed, palette-help 15 passed. Budget 32,015.2 / 34,816 KiB, below base
  (32,348.3 KiB). Full per-tier runs: desktop/rail/phone each 161 passed + the 5 re-baselined.
- `loop/rc` had one new commit (RC-CAN-8.5) touching only the EN/ES/pseudo catalogs; no PNG
  overlap. Not rebased (operator integrates).

No push, promotion, agents or dispatcher state edits.

## Claim-fence retry (2026-10-05, base 7dc67b3f)

Gate feedback refused four paths outside the claim. Resolution:

- Reverted to base: `ds/components/core/Icon.tsx`, `ds/components/core/icon-registry.ts`,
  `scripts/perf/capture.ts` (and the companion `ICON_VOCABULARY.md` line, now moot). The `filter`
  glyph is not in the acceptance criteria, so the Notes Filter toggle, the Graph box/button and the
  palette row keep the existing `search` glyph. The Graph box keeps its accessible name "Search the
  graph" (the perf capture's selector) and its placeholder reads "Filter the graph…"; the e2e/visual
  selector edits for the old rename were reverted with it.
- KEPT, flagged for the operator: `apps/gm-react/src/screens/knowledge/index.tsx`. "A saved search
  chip filters the grid" needs it: the grid and its count render there and no owned component is
  mounted on /knowledge while every disclosure is closed. It is also the only always-mounted host
  for the Ctrl/⌘+N handler and for opening a template-created note. Trimmed to mount points (the
  chip-empty message moved into the owned `SavedSearchChips`; the icon line reverted).

HANDOFF (needs a wider claim, not acceptance-critical): add `filter: 'Filter'` to the DS icon
registry + Icon allowlist and switch the three `search` glyphs above; renaming the Graph box's
accessible name to "Filter the graph" also needs the one-line `scripts/perf/capture.ts` selector.

Verification on the final tree (logs `/tmp/knw64r-*.log`):

- e2e knowledge*, graph*, command-palette, palette-polish, shortcuts: 226 passed on both profiles
  (includes `knowledge-start-from.spec.ts`, 12 tests).
- `pnpm test:app` 168 files / 2,029 tests; gm-react typecheck; `pnpm lint`;
  `format:check:changed --base 7dc67b3f`; `pnpm gates`: all exit 0.
- Visual (pinned container): golden-routes `/knowledge` (9) and graph-polish (15) re-baselined for
  the restored glyph, zopfli-recompressed, re-verified; full per-tier runs desktop / rail / phone
  171 passed each. Budget 32,863.6 / 34,816 KiB (base 33,187.4 KiB).
- Paths changed vs base outside `__screenshots__`: the seven owned files, `knowledge/index.tsx`,
  catalogs (en/es/qps-ploc), `registry.test.ts`, the new e2e spec, and this journal.
