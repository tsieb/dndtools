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

## Verification
