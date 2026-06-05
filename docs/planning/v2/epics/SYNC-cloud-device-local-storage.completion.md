# SYNC-cloud-device-local-storage — Completion Evidence

Epic: `SYNC-cloud-device-local-storage` — SYNC: Cloud/device-local storage
Requirement IDs: SYNC-007, SYNC-008, SYNC-017
Architecture contracts: Contract 2 (Cloud Sync & Offline Model); Contract 3 (Role, Visibility &
Permission Grant Model)

This is a CLASSIFICATION + GATE policy epic. Per ADR-014 the live cloud transport and the real
encryption/key-custody/rotation/recovery implementation are DEFERRED. This epic delivers the typed,
fail-closed data-classification registry (what may sync to the cloud vs. what stays device-local),
the fail-closed encryption-prerequisite enablement gate (cloud sync is default-off and blocked until
the release-approved security model is satisfied), and an inspection surface — the seam a future
transport + crypto ADR plug into without changing call sites. All new logic is pure Processing-Core
policy (deterministic functions); the GUI renders the computed models and never touches raw storage
or flips any flag.

## Demo

Surface: the PLAT-owned Settings route (`/settings/`), in the new "Cloud & device-local storage"
panel, beneath the existing Sync status panel.

- SYNC-017 (encryption-prerequisite enablement gate — default off, fail-closed):
  - On `/settings/` the "Cloud sync" block shows status `disabled` and "can enable: no". The
    "Encryption & key prerequisites" list shows all five prerequisites (encryption at rest,
    encryption in transit, key custody, key rotation, key recovery) as `unmet` — the real crypto
    model is deferred (ADR-014), so the gate blocks enablement. This is the security crux: cloud sync
    cannot be turned on until the release-approved model is satisfied.
- SYNC-007 (cloud-syncable only when cloud sync is enabled):
  - The "Cloud-syncable" section lists exactly the Contract 2 cloud-storage categories
    (cloud-enabled vault identity, durable operation log, compacted snapshots, collaboration session
    state, permission metadata, assets, conflict records). These are eligible for cloud only when
    cloud sync is enabled for the vault (which it is not, by default).
- SYNC-008 (device-local unless explicitly exported):
  - The "Device-local" section lists auth refresh tokens, OS credential records, raw absolute paths,
    rebuildable indexes, presence, local diagnostics, temporary UI state, device platform
    preferences, local MCP process state, and imported-file staging. None of these appear in the
    cloud-syncable list. Switch "View as" to a player: the player inspects the same classification
    without raw storage knowledge.

Requirement IDs exercised by the demo: SYNC-007, SYNC-008, SYNC-017.

## Traceability

### SYNC-007 — cloud storage only when cloud sync is enabled

- Code:
  - `apps/v2/packages/core/src/sync/storage-classification.ts` — the typed classification registry
    (`STORAGE_CLASSIFICATION_REGISTRY`, `classifyStorageCategory`, `declaredClassification`,
    `eligibleCloudCategories`, `isCloudEligible`, `partitionStorageRecords`). Fails closed: when cloud
    sync is DISABLED, `classifyStorageCategory` returns `device-local` for EVERY category and
    `eligibleCloudCategories(false)` is empty — no record is cloud-eligible (AC1). The cloud-syncable
    categories mirror Contract 2's "Cloud storage contains" list.
  - `apps/v2/packages/core/src/index.ts` — public exports.
  - `apps/v2/app/src/lib/gui/CloudStorageClassificationPanel.svelte` — renders the cloud-syncable
    category list from the computed registry.
- Tests:
  - `apps/v2/packages/core/tests/sync-storage-classification.test.ts` — cloud-disabled ⇒ nothing
    eligible (every category device-local; eligible set empty; partition yields no cloud records);
    the cloud-storage categories classify cloud-syncable; the eligible set equals the declared
    cloud-syncable set when enabled. (AC2's "retain enough data for sync and recovery" is satisfied by
    the existing SYNC-asset-sync-and-status lineage/snapshot model — `queries/sync-lineage.ts` — which
    this epic does not change; see Deferred items.)
  - `apps/v2/app/tests/e2e/cloud-device-local-storage.spec.ts` — the cloud-syncable categories render
    on the inspection surface (both projects).

### SYNC-008 — device-local unless explicitly exported

- Code:
  - `apps/v2/packages/core/src/sync/storage-classification.ts` — the device-local categories
    (`DEVICE_LOCAL_CATEGORIES`) plus the cloud-payload leak guard (`findCloudPayloadLeaks`,
    `assertCloudPayloadIsClean`, `CloudPayloadRecord`). The guard reuses the diagnostics redaction
    guard (`apps/v2/packages/core/src/diagnostics/redaction.ts` — `containsSensitiveData`) to prove a
    generated cloud payload carries no raw absolute filesystem paths and no auth-token-shaped secrets
    (AC1). A device-local record appearing in a cloud payload is rejected fail-closed.
  - `apps/v2/app/src/lib/gui/CloudStorageClassificationPanel.svelte` — renders the device-local
    category list.
- Tests:
  - `apps/v2/packages/core/tests/sync-storage-classification.test.ts` — device-local-is-NEVER-cloud
    (every device-local category stays device-local for both enablement states; auth tokens and raw
    paths never cloud-eligible); the cloud-payload leak guard flags a device-local record in a cloud
    payload, a leaked absolute path, and an auth-token-shaped secret, and accepts a clean structural
    payload (AC1).
  - `apps/v2/app/tests/e2e/cloud-device-local-storage.spec.ts` — the device-local categories render
    and never appear in the cloud-syncable list (both projects). (AC2's explicit-export path is
    served by the existing PLAT-009 support-bundle export action on the same Settings route —
    `apps/v2/app/src/lib/gui/DiagnosticsPanel.svelte` + `exportSupportBundle` — which is an explicit
    user action that generates a redacted bundle rather than auto-uploading; this epic does not change
    it; see Deferred items.)

### SYNC-017 — release-approved encryption/key model before cloud sync can be enabled

- Code:
  - `apps/v2/packages/core/src/sync/cloud-sync-gate.ts` — the declared, typed prerequisite checklist
    (`CLOUD_SYNC_PREREQUISITE_IDS`, `CloudSyncSecurityModel`, `evaluateCloudSyncPrerequisites`) and
    the fail-closed enablement gate (`evaluateCloudSyncGate`, `canEnableCloudSync`,
    `isCloudSyncEnabled`). `UNMET_CLOUD_SYNC_SECURITY_MODEL` is the deferred-crypto default (every flag
    fail-closed, recovery `undeclared`), so `canEnable` is false and cloud sync is disabled by
    default. A stored/forced `currentlyEnabled: true` cannot bypass unmet prerequisites. A declared
    "unsupported-by-design" recovery satisfies the recovery prerequisite (AC3) without weakening
    encryption.
  - `apps/v2/packages/core/src/index.ts` — public exports.
  - `apps/v2/app/src/lib/gui/CloudStorageClassificationPanel.svelte` — renders the gate status and the
    unmet prerequisites.
- Tests:
  - `apps/v2/packages/core/tests/sync-cloud-sync-gate.test.ts` — default-off + fail-closed (no input ⇒
    disabled and cannot enable); the deferred-crypto model leaves all prerequisites unmet; the gate
    blocks enable while ANY single prerequisite is unmet; a forced enabled flag cannot bypass; the
    gate opens only when the full model is satisfied, but is still off until explicitly opted in;
    AC3 recovery declaration (intentionally-unsupported satisfies; undeclared does not).
  - `apps/v2/app/tests/e2e/cloud-device-local-storage.spec.ts` — the gate renders disabled/can-enable
    no with all five prerequisites shown unmet (both projects).

## Tests Run

- `pnpm lint` (FULL: `eslint . && lint:navigation && lint:tokens && audit:repo`) — PASS (navigation
  132 files, tokens 132 files, repo-boundary audit 5 tests).
- `pnpm docs:validate` — PASS (includes the v2 workpack validator).
- `pnpm v2:typecheck` — PASS (0 errors; core `tsc --noEmit`, app `svelte-check` 0 errors/0 warnings).
- `pnpm v2:lint` (boundary) — PASS (`v2 boundary lint passed`).
- `pnpm v2:gates` — PASS (7 gates owned, budgeted, wired).
- Core unit suite (`pnpm --filter @dndtools/v2-core test`) — PASS (98 files, 1367 tests), including
  the two new files `apps/v2/packages/core/tests/sync-storage-classification.test.ts` and
  `apps/v2/packages/core/tests/sync-cloud-sync-gate.test.ts` (28 tests).
- App unit suite (`pnpm --filter @dndtools/v2-app test`) — PASS (12 files, 55 tests).
- `pnpm --filter @dndtools/v2-app exec playwright test` — FULL Playwright on BOTH projects
  (desktop-chromium AND mobile-chromium) — PASS (398 passed, 18 intentional project-scoped skips, 0
  failed), including the new `apps/v2/app/tests/e2e/cloud-device-local-storage.spec.ts` (8 across both
  projects).
- `pnpm v2:workpack:validate` — PASS before and after `complete`.

## Quality Review

- Correctness: every mapped acceptance criterion is implemented or has its evidence located on an
  existing reused seam (see Deferred items). The three hard fail-closed invariants are proven by
  assertion-grade tests: device-local-is-never-cloud, unknown-category ⇒ device-local, cloud-disabled
  ⇒ nothing eligible; plus default-off + gate-blocks-when-unmet for SYNC-017.
- Architecture: pure Processing-Core policy (`apps/v2/packages/core/src/sync/storage-classification.ts`
  and `apps/v2/packages/core/src/sync/cloud-sync-gate.ts` import no DOM/Node/Svelte/crypto). The GUI
  panel dispatches/render-only and reads no raw storage. Boundary lint green; no v1 runtime imports.
  Reuses `diagnostics/redaction.ts` for the device-local secret/path proof rather than re-deriving it.
- Tests: classification correctness + device-local-never-cloud + unknown ⇒ device-local + cloud-
  disabled ⇒ nothing-eligible + cloud-payload leak guard; enablement-gate default-off + blocks-when-
  unmet + AC3 recovery. E2e covers the inspection surface across both profiles and both DM/player.
- Accessibility: the panel uses the shared section/heading/list pattern with `aria-label`s, matching
  the sibling SyncStatusPanel/DiagnosticsPanel; route-accessibility e2e remains green.
- Performance: the registry and gate are O(n) over a small fixed category/prerequisite set; no new
  storage or network work; no Playwright budget regressions.
- Security: the security crux of the epic. Cloud sync is fail-closed default-off; the gate cannot be
  bypassed by a forced flag; device-local categories (auth tokens, OS credentials, raw paths) can
  never be classified cloud-syncable; the cloud-payload guard rejects raw paths/tokens via the same
  redaction guard that scrubs support bundles.
- Permissions: the classification + gate are role-independent policy; the inspection surface is
  reachable by every role on the existing Settings route, and exposes only declared category names
  and gate status — no hidden entity content. Actor-filtered surfaces (diagnostics, sync lineage) are
  unchanged.
- Persistence / sync/offline: no durable schema change. Local-first invariant preserved — disabling
  cloud sync (the default) never gates local work; classification only governs eligibility for a
  future cloud write.
- UX: the panel renders empty/default states cleanly (gate disabled, all prerequisites unmet) and is
  presentation-equivalent across desktop and mobile profiles.
- Maintainability: two small, cohesive, fully-typed modules with restrained surface area; no
  speculative abstractions; no unrelated refactors.
- Docs: this completion file; workpack regenerated through the documented commands.

## Changed Files

- `apps/v2/packages/core/src/sync/storage-classification.ts` (new) — SYNC-007/008 classification
  registry + cloud-payload leak guard.
- `apps/v2/packages/core/src/sync/cloud-sync-gate.ts` (new) — SYNC-017 prerequisite checklist +
  enablement gate.
- `apps/v2/packages/core/src/index.ts` — public exports for the two new modules.
- `apps/v2/packages/core/tests/sync-storage-classification.test.ts` (new) — classification unit tests.
- `apps/v2/packages/core/tests/sync-cloud-sync-gate.test.ts` (new) — enablement-gate unit tests.
- `apps/v2/app/src/lib/gui/CloudStorageClassificationPanel.svelte` (new) — the inspection surface.
- `apps/v2/app/src/routes/settings/+page.svelte` — mount the new panel on the Settings route.
- `apps/v2/app/tests/e2e/cloud-device-local-storage.spec.ts` (new) — e2e on both projects.
- `docs/planning/v2/workpack-state.yaml`, `docs/planning/v2/status.yaml`,
  `docs/planning/v2/epics/SYNC-cloud-device-local-storage.yaml` — regenerated via the workpack
  commands (active → complete).
- `docs/planning/v2/epics/SYNC-cloud-device-local-storage.completion.md` (new) — this file.

## Requirement Coverage

- SYNC-007 — covered (cloud-syncable categories + cloud-disabled ⇒ nothing eligible).
- SYNC-008 — covered (device-local categories + cloud-payload leak guard, no raw paths/tokens).
- SYNC-017 — covered (default-off, fail-closed encryption-prerequisite enablement gate).

## Known Gaps / Deferred Items (per ADR-014)

- Live cloud transport is deferred: no bytes are moved. The classification registry + partition +
  payload guard are the seam a future transport calls before any cloud write. SYNC-007 AC2's
  "snapshots and operation history retain enough data for sync and recovery" is already served by the
  prior epic's lineage/snapshot model (`apps/v2/packages/core/src/queries/sync-lineage.ts` +
  `apps/v2/packages/core/src/sync/asset-sync.ts`) and is not re-implemented here.
- Real encryption / key custody / rotation / recovery implementation is deferred: the prerequisites
  are declared-unmet by default and the gate blocks enablement. This is the intended posture; a
  future crypto ADR supplies a satisfied `CloudSyncSecurityModel` and the same gate opens with no
  call-site change.
- SYNC-008 AC2's explicit diagnostics-export path is served by the existing PLAT-009 support-bundle
  export (an explicit user action producing a redacted bundle, not an auto-upload) and is not
  duplicated here.

## Status Command

Workpack status: `complete` (set via `pnpm v2:workpack:complete -- --epic SYNC-cloud-device-local-storage`).

## Git Evidence

- Branch: `epic/SYNC-cloud-device-local-storage` (created from `93eb411`, the HEAD of
  `epic/SYNC-asset-sync-and-status`; NOT from master).
- Commit: see the commit recorded in the second docs commit below.
- Stop conditions: none hit.

### Final `git status --short`

```
(clean — recorded after the final commit; see handoff)
```
