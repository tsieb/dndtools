# SYNC-asset-sync-and-status — Completion Evidence

Epic: `SYNC-asset-sync-and-status` — SYNC: Asset sync and status
Requirement IDs: SYNC-009, SYNC-010, SYNC-014
Architecture contract: Contract 2 (Cloud Sync & Offline Model)

This is the first SYNC epic. It establishes a clean, cohesive, extensible sync-STATUS model derived
over the local operation-log substrate. Per ADR-014 the live REMOTE transport is deferred, so the
model is the seam a future transport plugs into: derivation takes acknowledged op ids and inbound
revisions as inputs and is unchanged when a transport supplies them. All new logic is pure
Processing-Core policy; the GUI renders computed models and never touches raw storage.

## Demo

Surface: the PLAT-owned Settings route (`/settings/`), alongside the existing diagnostics and
participant-status panels, plus the Atlas map authoring panel (`/atlas/`).

- SYNC-009 (asset sync by content address):
  - Open `/atlas/` as the DM, import a native PNG. The import previews a content-addressed asset id
    (`fnv1a64-…`) and commits. The new "Asset availability" section reports the map's assets as
    `available` (the device has resolved the blob). The durable op references the asset by hash; no
    bytes are embedded.
- SYNC-010 (sync status inspection):
  - On `/settings/` the "Sync status" panel shows health, source health (with reauthorization
    remediation on an error source), pending changes on this device, conflicts, and recovery actions
    — all without raw storage knowledge. Switch "View as" to a player: the player inspects the same
    status surface (player-safe).
- SYNC-014 (lineage / checkpoints, non-leak):
  - As the DM, the "Version history & lineage" block shows structural source version history and
    snapshot/recovery checkpoint metadata (no compacted snapshots yet on a fresh prototype, so the
    recovery-checkpoint note shows). Switch to a player or observer: the DM lineage disappears and is
    replaced by a non-leaking freshness summary that exposes no revisions, snapshots, paths, or
    content.

Requirement IDs exercised by the demo: SYNC-009, SYNC-010, SYNC-014.

## Traceability

### SYNC-009 — content-addressed asset sync + asset-missing/degraded state

- Code:
  - `apps/v2/packages/core/src/sync/asset-sync.ts` — `operationCarriesBinaryPayload`,
    `findBinaryPayloadsInOperations`, `assertNoBinaryInOperationLog` (assertion-grade guard proving no
    op-log entry embeds binary), and `deriveAssetAvailability` (pure content-addressed availability
    model). Reuses MAP-002 (`apps/v2/packages/core/src/state/map-assets.ts`) for hash-as-id dedupe.
  - `apps/v2/packages/core/src/index.ts` — public exports.
  - `apps/v2/app/src/lib/gui/MapAuthoringPanel.svelte` — renders the asset-availability state from the
    computed model (AC2).
- Tests:
  - `apps/v2/packages/core/tests/sync-asset-sync.test.ts` — dedupe by hash; no binary in the op-log
    (typed array / ArrayBuffer / Blob-like / oversized value all flagged fail-closed); the real
    `map.import-asset` durable op references the hash and never the bytes; second identical import
    dedupes; availability available/degraded/unavailable.
  - `apps/v2/app/tests/e2e/map-entity-and-assets.spec.ts` — `SYNC-009: an imported asset reports a
    content-addressed availability state` (both projects).

### SYNC-010 — sync status inspection

- Code:
  - `apps/v2/packages/core/src/queries/sync-status.ts` — `getSyncStatus` derives pending outbound
    (grouped by source, affected-entity counts), inbound revisions, conflicts (from conflict-shaped
    ops — structural only, no values), source health (reuses PLAT `toSyncSourceStatusView` /
    `deriveHealthLevel` from `apps/v2/packages/core/src/diagnostics/health.ts`), and retry actions
    (reuses the PLAT-018 lifecycle `canRetry` from
    `apps/v2/packages/core/src/lifecycle/command-lifecycle.ts`). Fail-closed: unknown actor denied.
  - `apps/v2/app/src/lib/gui/SyncStatusPanel.svelte` and `apps/v2/app/src/routes/settings/+page.svelte`.
- Tests:
  - `apps/v2/packages/core/tests/sync-status.test.ts` — unknown-actor denial; queued-offline pending
    outbound + affected sources (AC1); acknowledged ops drop out; inbound revisions; structural
    conflict derivation + resolution (with a hard assertion that conflicting values do not leak); auth
    failure surfaces source health + reauthorization guidance with local work available (AC2); retry
    reuses the PLAT-018 lifecycle; player-safe inspection.
  - `apps/v2/app/tests/e2e/sync-status-and-lineage.spec.ts` — DM and player sync-status inspection
    (both projects).

### SYNC-014 — lineage / checkpoints, actor-filtered non-leak

- Code:
  - `apps/v2/packages/core/src/queries/sync-lineage.ts` — `getDmSyncLineage` (structural per-entity
    version history from the op-log revision chain + compacted snapshot lineage / recovery checkpoints
    reusing the PLAT-migration write-ahead journal from
    `apps/v2/packages/core/src/migration/write-ahead.ts`), `getSyncFreshness` (non-leaking
    player/observer summary), `actorCanViewSyncLineage` (DM-only gate), and
    `syncLineageIsStructuralOnly` (non-leak assertion seam reusing the redaction guard
    `containsSensitiveData` from `apps/v2/packages/core/src/diagnostics/redaction.ts`). Fail-closed:
    unknown actor denied; non-DM routed to the freshness summary.
  - `apps/v2/app/src/lib/gui/SyncStatusPanel.svelte` — actor-filtered lineage vs freshness rendering.
- Tests:
  - `apps/v2/packages/core/tests/sync-lineage.test.ts` — DM-only authority gate; unknown-actor
    denial; per-entity version history (retained operation range + revisions) (AC1); snapshot lineage
    + recovery checkpoints (AC1); hard non-leak assertions that snapshot CONTENT never appears in the
    DM view and that a tampered value field is rejected; player/observer routed to a non-leaking
    freshness summary with no revision/snapshot/content detail (AC2).
  - `apps/v2/app/tests/e2e/sync-status-and-lineage.spec.ts` — DM structural lineage; player/observer
    non-leaking freshness with explicit assertions of absence (both projects).

## Tests run

- `pnpm lint` (full: `eslint .` + `lint:navigation` + `lint:tokens` + `audit:repo`): PASS.
  - Navigation lint passed (132 Svelte files). Token compliance passed (132 Svelte files). Repo
    boundary + CI guardrail unit tests: 5 passed.
- `pnpm docs:validate`: PASS (run at handoff).
- `pnpm v2:typecheck`: PASS (0 errors; core `tsc` + app `svelte-check` 746 files, 0 errors/warnings).
- `pnpm v2:lint` (boundary): PASS (`v2 boundary lint passed`).
- `pnpm v2:gates`: PASS (`7 gate(s) owned, budgeted, and wired`).
- Core unit suite (`@dndtools/v2-core` vitest): 96 files, 1337 tests PASS (includes the 3 new
  suites: 12 + 9 + 7 = 28 new tests).
- App unit suite (`@dndtools/v2-app` vitest): 12 files, 55 tests PASS.
- Full Playwright on BOTH projects (`desktop-chromium` AND `mobile-chromium`): 390 passed, 18
  intentional project-scoped skips, 0 failed. (One earlier run hit the known webServer-startup flake
  on an unrelated `content-visibility-and-embeds` test plus a since-fixed assertion in the new SYNC
  spec; the re-run was fully green.)
- `pnpm v2:workpack:validate`: PASS before completion (and re-run after `complete`).

## Quality review

- Correctness: every mapped acceptance criterion is implemented and covered (SYNC-009 AC1/AC2,
  SYNC-010 AC1/AC2, SYNC-014 AC1/AC2), with fail-closed negative cases.
- Architecture: pure Processing-Core derivation (status, asset metadata, lineage are deterministic
  functions); durable writes remain via the op-log/lifecycle; the GUI renders computed models and
  never reads raw storage. No new v2 packages; no v1 runtime imports. Boundary lint green. Reuses
  MAP-002 assets, the op-log, PLAT diagnostics health/source-status, the PLAT-migration snapshot
  lineage, the redaction guard, and the PLAT-018 lifecycle rather than inventing parallel machinery.
- Tests: unit tests are primary evidence (no binary in op-log + dedupe by hash; status derivation;
  lineage actor-filtered non-leak with hard assertions). E2e covers both profiles.
- Accessibility: panels use semantic headings, `aria-label`ed sections, and list semantics consistent
  with the existing diagnostics/participant surfaces.
- Performance: derivations are linear scans over the op-log with small constant work per op; no new
  timers, async, or background systems.
- Security / permissions / privacy: conflict views carry only structural facts (no conflicting
  values); the DM lineage is structural by construction and proven non-leaking; players/observers get
  a generic freshness summary that cannot reveal whether hidden source revisions exist. The lineage
  authority gate is DM-only and fails closed; the redaction guard is asserted over the DM view.
- Persistence / sync/offline: no schema changes; the op-log substrate and migration journal are read,
  not mutated. Queued-offline operations are visible; source auth failure keeps local work available.
- UX: empty/error states handled (no pending changes, no conflicts, no snapshots messages; error
  source remediation). Mounted on the existing Settings/Atlas surfaces — no new top-level navigation
  section (which would have required a scaffolded route and risked the navigation registry contract).
- Maintainability: three cohesive, typed modules with no speculative abstraction; the deferred
  transport is modeled as optional inputs.
- Docs: this completion file; module-level doc comments cite the requirement IDs and contract.

## Known gaps / deferred items

- Live REMOTE transport is deferred per ADR-014. Inbound revisions and acknowledged-op ids are
  modeled as optional derivation inputs; with no transport in the prototype they are empty, so
  everything in the local op-log reads as pending outbound. This is the intended seam.
- The asset-missing/degraded GUI path always reports `available` on the single-device prototype
  (the device holds every imported blob). The missing/degraded derivation is fully implemented and
  proven by core unit tests; it activates once a transport delivers metadata records ahead of blobs.
- No dedicated `/sync` navigation section was added; the status surface lives on the canonical
  Settings route to avoid changing the navigation registry contract this epic does not own.

## Git evidence

- Branch: `epic/SYNC-asset-sync-and-status` (created from the prior epic HEAD
  `45f7288fa567ccd2c8acd9234b4e3730ce47bf17`, NOT master).
- Stop conditions: none hit.
- Epic implementation commit: `4065831` (`feat(v2): complete SYNC-asset-sync-and-status epic`).
- Final `git status --short`: clean (no untracked, unstaged, or stale generated planning diffs) after
  this docs commit.

Workpack status: `complete` (set via `pnpm v2:workpack:complete -- --epic SYNC-asset-sync-and-status`).
