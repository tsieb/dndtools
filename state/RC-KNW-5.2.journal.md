# RC-KNW-5.2 run journal

## Implementation

The existing content operation values omit title/body, so old revisions cannot be reconstructed.
Necessary companion edits in commands/content.ts capture new revision snapshots; index.ts exports
the actor-filtered query and the locale catalogs label the History UI. Legacy entries are omitted.
History checks current access and historical visibility, strips secret callouts through the existing
content projection, and computes deltas only between visible snapshots. Restore uses the editor save
callback with the current baseRevision; it does not restore visibility or rewind the counter.

## Validation

- Targeted content-history and content-notes: 19 tests passed.
- Full core suite: 274 files, 4,784 tests passed.
- Full app suite: 126 files, 1,327 tests passed.
- Playwright knowledge history restore: desktop-chromium and mobile-chromium, 2 passed.
  Both edit twice through the UI, restore the first edit, assert revision +1 and reload persistence.
- pnpm typecheck: exit 0 across core, cloud-fns and gm-react.
- Changed-file ESLint and Prettier: exit 0; git diff --check clean.
- pnpm gates: 6 gates passed (file-size warnings only).
- pnpm lint:boundary: passed.

Tests additionally cover reversed and duplicated serialized operation replay, stale-base restore
conflicts, DM-only revisions before reveal and after hiding, secret-callout removal, unknown actors,
shared membership, tombstones, legacy metadata-only logs, the 50-revision cap and 30-day cutoff.
The line delta reports the replaced span after trimming common prefix/suffix lines; it is not a
minimal edit script. Visibility and other metadata are deliberately not restored with note prose.

No Headroom tools were available. Commands used native tooling and retained test output in local
/tmp/rc-knw-\*.log files. No agents, push, promotion, or dispatcher state changes.

## Ownership-fence retry (2026-09-20)

The operator's 2026-09-18 brief explicitly adds `packages/core/src/commands/content.ts`
to Owns. The prior implementation commit `e6acd569` remains on this task branch unchanged;
the reported rejection was the ownership fence, not a failed behavior test. No dispatcher state
was edited to resolve it. This retry documents the now-authorized edits and reruns acceptance tests.

The command file has exactly five one-line payload additions, preserving all prior payload keys:

- Create records the initial text and visibility, which the old kind/visibility payload cannot recover.
- Update records the resulting text and revision for each accepted edit, including history restores.
- Set visibility records the resulting visibility and membership alongside the text, so historical
  access is evaluated at that revision rather than inferred from the current sharing setting.
- Remove records the tombstone revision so replay excludes deleted snapshots.
- Restore records the live revision after undelete, retaining its actual sharing settings.

No command authorization, validation, conflict handling, revision increments, or event delivery
was changed. The previous companion export, translations and acceptance tests remain unchanged.

Fresh validation:

- `pnpm --filter @dndtools/core exec vitest run tests/content-history.test.ts tests/content-notes.test.ts`:
  2 files, 19 tests passed, including replay determinism and player confidentiality.
- Playwright `knowledge.spec.ts --grep 'history restores'`, desktop-chromium and mobile-chromium:
  2 tests passed. Each edits twice, restores the first edit, checks revision advancement and reloads.
- No implementation changes were needed for the supplied fence feedback. The broader validation
  results above belong to the original attempt; only the acceptance checks were rerun in this retry.

## Integration rebase retry (2026-09-20)

Rebased both task commits onto the operator-specified integration commit
`2d9f566d194d10e597c8001015b7e8be31811d59`. Resolved the two reported conflicts:

- `NoteViewer.tsx`: retained integration's `useSingleColumn` import and layout decision for both
  phones and rail detail panes, plus the history query state and RestoreNoteRevision import.
  Integration's prose-width preference handling remains intact.
- `packages/core/src/index.ts`: retained the entire integration screen export block and appended
  the two history exports. Neither feature's exports were dropped.

No dispatcher control state, unrelated implementation, or remote branch was changed.

Fresh validation on the reconciled tree:

- Targeted content-history/content-notes: 2 files, 19 tests passed.
- History restore Playwright test: desktop-chromium and mobile-chromium, 2 passed.
- `pnpm typecheck`: exit 0 across core, cloud-fns and gm-react.
- ESLint and Prettier on both conflict-resolved files: exit 0.
- `git diff --check`: clean; the specified integration commit is an ancestor of HEAD.
- `git range-diff 4d551c9c..119c4150 2d9f566d..HEAD` confirms that the implementation
  changes only in the two intended conflict contexts; the ownership-journal commit is unchanged.

Rebased implementation commit: `4bd6dce7`; rebased ownership-journal commit: `8cef22cb`.
