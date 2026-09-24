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

## Independent-review confidentiality correction (2026-09-20)

The previous snapshot-in-item-value design was unsafe: catch-up checks current entity visibility,
so revealing a note also released its earlier private snapshots. The earlier query-only privacy
checks did not exercise the serialized replication boundary. This section supersedes the earlier
claim that the five snapshot payload additions needed no implementation changes.

Minimal authorized command changes replace those same five snapshot additions (create, update,
visibility, remove, restore) with one shared append helper. Each appends a private `content-history`
operation followed by the original metadata-only `content-item` mutation. Both are persisted in the
existing atomic command commit, and both IDs are returned. The mutation stays last for existing
consumers. History targets intentionally have no player visibility metadata or grants; the existing
namespaced replication resolver therefore fails closed for them, even when the content item is
revealed. No snapshot bytes enter the player-deliverable operations. DM replication remains complete.
No command authority, conflict handling, note revision arithmetic, or UI restore behavior changed.

The operation-log module names this separate entity type; the query folds only that namespace.
The private operations use existing durable log persistence, so no storage schema or platform edits
are needed. Player history remains an actor-filtered host query (including callout redaction), not a
raw history replication stream. Metadata-only legacy records still cannot reconstruct old prose.
The rejected, unshipped candidate's inline-snapshot format is not a supported history input.

The existing history acceptance test file adds a serialized-stream regression covering both
`filterReplicationStream` and `filterCatchUpStream`: private edit, replacement with public prose,
reveal, secret-callout update, soft deletion and restoration. It checks actual serialized delivery
while confirming DM history retains the canary and player history excludes it. This test companion
and this required journal are the only edits outside the implementation Owns paths.

Fresh verification (original uncompressed output in `/tmp/rc-knw-privacy-*.log`):

- Initial targeted run exposed three last-operation-order assumptions; recording history before the
  mutation resolved them. Final targeted history/notes/replication run: 3 files, 30 tests passed.
- Full core suite: 282 files, 4,908 tests passed.
- Full app suite: 144 files, 1,584 tests passed.
- Desktop and mobile history restore e2e: 2 passed, including advancing revision and reload persistence.
- Workspace typecheck: core, cloud-fns and gm-react passed. Core typecheck repeated after a helper
  argument-order cleanup that reduced command-file diff noise; targeted tests repeated too.
- Changed TypeScript ESLint and Prettier checks passed.
- `pnpm gates`: 6 quality gates and docs reachability passed; existing file-size warnings only.

No Headroom tools were exposed. No additional agents, dispatcher state changes, push or promotion.
The central operator's exact-commit gates and independent review remain pending.

## Allowance-limit resume (2026-09-23)

The prior session stopped on the provider allowance limit after the operator rebased the four task
commits onto `cf80fc6e` (2026-09-22). No code changed in this resume; it re-verifies the rebased
tree. `git merge-tree --write-tree loop/rc HEAD` (loop/rc `9296a7a9`) is conflict-free.

Fresh verification on HEAD `d78ad4d0` (Headroom `run_command` artifacts retained; e2e output in
`/tmp/rc-knw-5-2-e2e-0923.log`):

- content-history + content-notes: 2 files, 20 tests passed (replay determinism, player confidentiality).
- All `tests/collab*` + `tests/content-*` core suites: 30 files, 389 tests passed (replication filters).
- `pnpm typecheck`: exit 0 across core, cloud-fns and gm-react.
- Playwright `knowledge.spec.ts --grep 'history restores'`, desktop-chromium and mobile-chromium:
  2 passed (edit twice, restore the first, revision advances, reload persists).
- ESLint and Prettier on every changed TS/TSX file plus this journal: exit 0; `git diff --check` clean.

No agents, push, promotion or dispatcher state changes. Operator gates and review remain pending.

## App-tests gate fix (2026-09-23)

Gate run `3ef12851` (HEAD `741d3edd`) failed `tests/unit/ai-eval.test.ts` (RC-AI-5.1): its inline
snapshot expected `cardId: "id-0003"` / `characterId: "id-0005"` and received `id-0004` / `id-0006`.
This was caused by this branch, not a flake: the private `content-history` operation called `env.ids()`
(and `env.clock()`) a second time per content command, shifting every later deterministic ID.

Fix, confined to the owned `commands/content.ts` helper: the history operation now reuses the item
mutation's `issuedAt` and takes the derived id `<mutation id>:history`, so each content command
consumes exactly one id and one clock read, as on `loop/rc`. The history op is still appended before
the mutation, keeps no grants or visibility metadata, and is committed atomically. The unrelated
snapshot was not re-baselined. `SyncOperation.id` is a plain string with no format validation.

Verification (logs `/tmp/rc-knw-5-2-{app,core,e2e}-0923b.log`):

- `pnpm test:app`: 146 files, 1,641 tests passed (ai-eval included).
- `pnpm test:critical` (full core): 282 files, 4,908 tests passed.
- Core typecheck exit 0; ESLint + Prettier on `content.ts` exit 0.
- History restore e2e, desktop-chromium and mobile-chromium: 2 passed.
