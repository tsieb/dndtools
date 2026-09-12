# RC-ENG-6.2 run journal

## Scope and decisions

Storage pressure, open-time document quarantine, migration dry-run and rollback proof.
No delegation, dispatcher state changes, push or promotion. Headroom tools were unavailable;
validation output was retained in `/tmp/rc-eng-62-*.log` and read directly.

- Settings → Vault warns at 80% origin quota on mount/focus/30-second refresh, with free-space
  guidance and pruning of rebuildable embedding blobs. Campaign media is retained.
- Open-time validation atomically moves damaged durable documents into unique quarantine records
  before default hydration. Original payloads survive reopen and backup restore and can be exported
  individually from Vault. Quota failure leaves the source intact. Future schemas, corrupt operation
  history and corrupt migration journals remain blocking errors.
- Migration execution supports a detached dry run, write-ahead snapshots, atomic commit and rollback
  on a thrown migrator/write. Nested snapshot data is cloned; present unreadable versions block the
  planner. Dry runs do not write and block when a pending rollback needs recovery.
- Required supporting changes outside the main ownership list: English i18n keys (the repository's
  untranslated-JSX lint requires these), corrupted-fixture browser acceptance test, and this journal.

## Validation

- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/platform/storage`:
  **53 passed**, including pressure threshold/API failure, cache pruning/media retention, quarantine
  persistence/export payload, failed quarantine write, future schemas, dry-run immutability,
  migrator throw, migration write failure and exact snapshot/absence restoration.
- `pnpm --filter @dndtools/core exec vitest run tests/migration.test.ts src/migration/recovery.test.ts`:
  **19 passed**, including nested snapshot isolation and unreadable-version planning.
- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/storage-integrity.spec.ts --workers=1 --retries=0`:
  **2 passed**, desktop and mobile Chromium. Each opens a corrupted fixture, lists the quarantined
  content document, sees the 80% banner, downloads its exact original and reopens successfully.
- App and core typechecks: passed. ESLint on changed TypeScript/TSX: passed. Boundary lint: passed.
- Prettier applied to changed files; `git diff --check`: passed.
- Initial failures resolved: old fatal-corruption expectation updated to quarantine semantics;
  restore test uses the actual cloud snapshot shape; new UI strings use i18n keys.

Central operator retains responsibility for full gates and independent review. No full-suite,
production build, push or promotion is claimed.
