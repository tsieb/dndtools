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

## Revision 2 — reviewer's nested-document rejection

Independent review rejected revision 1: a corrupted `systems-state` still made the vault
unopenable and produced no quarantine record.

Reproduced first, before changing anything. A `systems-state` document whose containers are
intact but whose nested package is malformed (`packages.homebrew.attributes` a string, not an
array) threw `TypeError: pkg.attributes.map is not a function` from `cloneSystemPackage` via
`hydrateSystemsState`, at `coreStore.ts:729` inside `loadCoreState` — well past the quarantine
pass, which only ran `trustedPersistedDocument` (top-level container validation).

Root cause, and why it was not specific to `systems`: quarantine probed a DIFFERENT, weaker
validation than the load actually performs. Most durable slices are finished by a core hydrator
that walks nested records, and three of them throw on nested garbage —
`hydrateSystemsState` (verified), `ensureEncounterState` (`entries` absent →
`Cannot read properties of undefined (reading 'map')`), `ensureAudioState` (`asset.waveform is
not iterable`). Container checks can never see any of them.

Fix: `probePersistedDocument` runs the SAME hydration the load path runs for each document —
`trustedPersistedDocument` plus that slice's core hydrator (systems/content/encounters/audio/mcp/
widgets, and the session's combat/audio/calendar/scene-card hydrators). Quarantine now decides on
what the load would actually see. Hydrators are pure and `documents.get` returns a private
deserialized copy, so probing cannot disturb a payload about to be quarantined. The systems probe
needs the widget document for its legacy `activeSystemPackageId` carrier, so that record is read
once before the loop. Future-schema documents still rethrow and block, unchanged.

## Validation (revision 2)

- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/platform/storage`:
  **58 passed** (was 53). New: three table-driven nested-corruption cases (systems/encounters/
  audio) asserting the vault opens, the exact original is preserved and the source key is gone;
  a whole-vault case corrupting all twelve durable documents at once; and one asserting a
  quarantined `systems` slice still hydrates to its safe built-in default.
- Mutation check on the new coverage — reverted the probe call to the old
  `trustedPersistedDocument(record, id)` and re-ran: **4 of the new unit tests failed** and the
  browser spec failed at `waitReady` (`__rt.loaded` never true, i.e. the reviewer's exact
  symptom: vault never opens). Restored the fix; both green again.
- `DNDTOOLS_E2E_PORT=5641 playwright test tests/e2e/storage-integrity.spec.ts`: **2 passed**
  (desktop + mobile Chromium). The fixture now corrupts `content-state` (not an object) AND
  `systems-state` (nested), and both are listed and survive a reload.
- `pnpm --filter @dndtools/core test`: 4782 passed. Full app vitest: **1344 passed** (was 1339).
- `pnpm -r typecheck`: passed. ESLint on changed files: clean. Prettier: already formatted.
- `pnpm -r build`: passed, including `check-prod-bundle`.
- Full Playwright suite (`DNDTOOLS_E2E_PORT=5641`, all 84 specs × desktop/mobile): launched at
  commit time and still running when this commit was made — NOT claimed as passing here. The
  change only alters the quarantine probe, which is reached exclusively when a document fails
  hydration; a healthy vault differs only by running the (pure) hydrators once more at open.
  Result appended below once known. Known pre-existing red on this repo:
  `knowledge-filters.spec.ts:101` on mobile-chromium, unrelated to this task.

Central operator retains responsibility for the gates and independent review. No push or
promotion.
