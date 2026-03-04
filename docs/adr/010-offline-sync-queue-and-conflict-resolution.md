# ADR-010: Offline Sync Queue and Conflict Resolution in Renderer

- Status: Accepted
- Date: 2026-03-04
- Deciders: Engineering
- Consulted: Product, Design, Security, QA
- Supersedes: N/A

## Context

Epic 6.3 requires offline-first behavior with:

- persistent sync status indicators
- deferred write replay when reconnecting
- conflict-safe resolution using ancestor/local/remote note snapshots

The application currently has a strong `StorageAdapter` boundary, but no queue/replay model
or sync conflict UI for renderer writes.

## Decision

Implement an offline sync subsystem in the renderer layer with these constraints:

- Wrap storage writes through `SyncAwareStorageAdapter` so local writes always succeed first.
- Persist sync queue + conflict records in vault-backed settings (`syncEngineState`), not browser-local storage.
- Detect connectivity via `navigator.onLine` plus periodic ping probes.
- Replay queue opportunistically when online; keep replay non-blocking for UI flows.
- Detect note conflicts using three-way snapshots (`ancestorNote`, `localNote`, `remoteNote`).
- Provide settings-configurable default strategy (`syncConflictStrategy`):
  - `manual`
  - `use_latest`
- Provide manual resolution UI with explicit local/remote/latest/manual-merge actions.

## Consequences

### Positive

- Offline edits are durable and replayable across restarts.
- Sync behavior is visible to users (`online/offline/syncing/error` indicator).
- Conflict handling is explicit and auditable rather than silent overwrite.
- Existing architecture boundary is preserved: storage remains behind `StorageAdapter`.

### Negative

- App settings now include operational sync state, increasing settings payload size.
- Sync logic in renderer adds state-management complexity and test burden.
- Simulated remote mirror state (until cloud backend rollout) is an interim design.

## Rejected Alternatives

| Alternative                                 | Why Rejected                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| Queue only in `localStorage`                | Fails vault portability and persistence expectations across platform boundaries. |
| Run sync queue exclusively in Electron main | Breaks cross-platform parity (Capacitor/browser) and duplicates adapter logic.   |
| Rely only on `navigator.onLine`             | Too optimistic; false positives occur without active connectivity checks.        |

## Migration Impact

Required updates:

- App settings contract extended:
  - `syncConflictStrategy`
  - `syncEngineState`
- IPC key whitelist and per-setting schema validation updated in `electron/ipc-schemas.ts`.
- Storage normalization paths updated in:
  - `mcp/storage.ts`
  - `src/lib/platform/storage/capacitor-adapter.ts`
- New renderer modules:
  - `src/lib/state/sync.svelte.ts`
  - `src/lib/platform/storage/sync-adapter.ts`
  - `src/lib/domain/sync.ts`

Validation updates:

- Added unit coverage for sync domain and sync storage wrapper behavior.
- Existing lint/typecheck/test/build gates remain required and were run.

Backward compatibility:

- Missing sync keys in existing vault settings resolve to safe defaults.

## Rollback Plan

Trigger conditions:

- Sync queue causes write latency regressions or data divergence in production telemetry.

Rollback steps:

1. Remove `SyncAwareStorageAdapter` wrapping from storage initialization.
2. Disable `syncState` initialization and UI surfaces.
3. Keep settings keys tolerated for backward compatibility (ignore at runtime).

Data recovery considerations:

- Existing local notes remain authoritative in storage.
- Sync queue/conflicts in settings can be ignored or manually cleared.

Known rollback risks:

- Users with unresolved conflicts may lose in-app resolution tooling until feature is re-enabled.

## Verification and Evidence

- Key implementation files:
  - `src/lib/state/sync.svelte.ts`
  - `src/lib/platform/storage/sync-adapter.ts`
  - `src/lib/ui/settings/SyncSettingsPanel.svelte`
  - `src/lib/ui/layout/TopBar.svelte`
- Key tests:
  - `src/lib/domain/sync.test.ts`
  - `src/lib/platform/storage/sync-adapter.test.ts`
  - `electron/ipc-security.test.ts`
