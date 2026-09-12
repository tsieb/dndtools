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
