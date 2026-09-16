# RC-KNW-2.2 run journal

## Plan

Complete the note-list scent line within `screens/knowledge` ownership, then clear the disclosure
the independent review reproduced. Run the named acceptance spec plus the knowledge suite and the
app unit config; commit on the task branch. No push, promotion, delegation or dispatcher state.

## Revision 2 — the reported disclosure

Review rejected revision 1: a real imported/shared note at 320px showed `[!Secret]` hashtags on the
PLAYER list card, while the same note's detail view correctly hid the secret prose.

Root cause, confirmed by reading the projection rather than inferring it. `projectItem`
(`packages/core/src/queries/content-query.ts`) actor-filters the BODY —
`bodyForActor` runs `stripSecretCallouts` for every non-DM — but copies `fields` verbatim:
`fields: { ...item.fields }`. `buildImportedItem`
(`packages/core/src/state/content-import.ts:309`) sets `fields['tags']` from the AUTHORED markdown,
so an imported note's tag field still carries hashtags that only ever appeared inside a secret
callout. Revision 1's card read that field, so it printed them.

Fix: the card derives its facets the way the CORE derives its own search facets, which are already
actor-safe by construction.

- Tags: `parseMarkdownNote(note.body).tags`, lowercased/deduped/capped at 2 — the definition of
  `itemTags` in `queries/search-query.ts:109`. The projected body is the only tag source; `fields`
  is never read for tags. Side benefit: a tag printed on a card is now always one the tag FILTER
  can match, which was not true of a `fields`-only tag.
- Folder: `fields['dndtools.folder']` only — the definition of `itemFolder`
  (`queries/search-query.ts:102`). Dropped revision 1's `sourcePath` fallback: it is the DM's
  archive layout, it is not what the folder filter matches, and a full path is exactly what
  overflows a 292px card.

Cost accepted and recorded in the source comment: an imported note's FRONT-MATTER tags no longer
appear on the card, because import moves them out of the body into `fields`. That is the same blind
spot the tag filter already has, so the card and the filter now agree.

## Out of scope, flagged not fixed

The underlying hazard is in the core, outside this story's owned paths: `projectItem` projects
`fields` to every actor with no filtering at all, so ANY surface that renders `ContentItemView.fields`
can repeat this leak, and `fieldVisibility` is carried on the item but not applied here. Worth its
own story against `packages/core/src/queries/content-query.ts`.

## Validation

- `pnpm test:app` — 124 files, 1308 passed, 0 failed (1302 baseline + the 6 tests added here).
- `authoring-layout.spec.ts --workers=1` — 14/14 on desktop-chromium AND mobile-chromium, the named
  acceptance at 320px.
- Knowledge suite (`knowledge`, `knowledge-filters`, `knowledge-templates`, `player-private-notes`,
  `wiki`) — 75 passed, 1 pre-existing failure.
- App typecheck exit 0; targeted ESLint exit 0; Prettier clean over the owned directory.

### The pre-existing failure, measured rather than waved off

`knowledge-filters.spec.ts:101` is the known `setSaveName('')` race: `SavedSearches.tsx:93` blanks
the name field after the save resolves, and that commit can land after the test's second
`fill('Table handouts')`, leaving `filters-save` `disabled` (`SavedSearches.tsx:139`) when the test
clicks it. Neither file is touched by this branch.

It fails DETERMINISTICALLY on mobile-chromium at the base commit `ba6b3d91`, so that half is plainly
not mine. Desktop-chromium is the half worth reporting honestly: it is a coin flip on both sides.
Measured by re-running the single test in a throwaway worktree at `ba6b3d91` against this branch:

|                 | desktop-chromium failures |
| --------------- | ------------------------- |
| base `ba6b3d91` | 3 of 8                    |
| this branch     | 5 of 8                    |

The gap is within noise for a load-sensitive race on this machine, and I could not move it: I
memoized the card's facet derivation so the note list no longer re-parses every note's markdown on
each filter-panel keystroke, and the rate did not change (3 of 5 before, 3 of 5 after). The memo is
kept anyway — it is correct on its own terms — but I am not claiming it as a fix, and I am not
claiming the desktop flake is provably unrelated. It is pre-existing, it reproduces without this
branch, and the underlying race is in a file this story does not own.

### Mutation check

Reverting only the tag source to revision 1's `fields['tags']` merge fails 3 of the 6 new tests,
including `renders no secret tag on a player card`. The new tests drive the REAL import
(`planContentImport`/`applyContentImport`) and the REAL projection (`getContentItemsForActor`), and
assert the hazard is still live in the raw field — so they fail if either side of that pipeline
changes shape rather than only if this component does.
