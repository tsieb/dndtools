# ADR-004: StorageAdapter Abstraction Boundary

- Status: Accepted (amended by ADR-035)
- Date: 2026-03-01
- Deciders: Engineering
- Consulted: Product
- Supersedes: N/A
- Amended by: [ADR-035](./035-player-private-device-local-store.md) — the adapter boundary now covers a
  second, per-character database (`dndtools-private-<characterId>`) that is deliberately outside the
  sync, backup and MCP surfaces.

## Context

Renderer features need a stable persistence API that is independent of runtime-specific storage details. Without a single abstraction boundary, route components and feature code can couple directly to desktop bridge internals, making portability and testing harder.

## Decision

All renderer persistence operations go through a single `StorageAdapter` contract:

- The canonical contract is the type-only `StoragePort` declared in `@dndtools/core`.
- The React app implements it once in `apps/gm-react/src/platform/storage/coreStore.ts` (Dexie/IndexedDB) and the platform-service boundary validates every request.
- UI components and state layers consume storage through `SceneRuntime`, never through runtime-specific APIs.

## Consequences

### Positive

- Clear dependency direction from UI/state to a stable domain contract.
- Platform expansion can add adapters without rewriting feature logic.
- Easier testing via adapter substitution and mocks.

### Negative

- Additional adapter wiring for new capabilities.
- Interface growth requires disciplined review to avoid becoming a "god interface."
- Runtime-specific capabilities still need explicit modeling in typed bridge contracts.

## Rejected Alternatives

| Alternative                                          | Why Rejected                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| Direct bridge calls from route components            | Couples UI to runtime implementation and weakens boundary discipline. |
| Feature-specific storage clients per domain          | Duplicates contracts and increases drift across modules.              |
| Hidden global storage singleton with untyped methods | Reduces testability and type safety.                                  |

## Migration Impact

- New persisted concepts must be added to the shared adapter interface and implemented by concrete adapters.
- Runtime bootstrap and dependency wiring must remain adapter-based.
- Platform work (desktop/mobile/web) should add implementations behind the same contract instead of forking domain logic.

## Rollback Plan

- Trigger: adapter-level regression blocks critical note/session flows.
- Rollback action: revert the adapter contract change and restore previous interface-compatible implementation.
- Data safety: preserve storage-side safe-write and migration protections while rolling back renderer integration.
- Risk: partial rollbacks can cause compile-time breaks if adapter and caller changes are not reverted together.

## Verification and Evidence

- `packages/core/src/platform/service-boundary.ts`, `packages/core/src/schemas/platform-service.ts`
- `apps/gm-react/src/platform/storage/coreStore.ts`, `assetStore.ts`, `privateStore.ts`
- `apps/gm-react/src/runtime/SceneRuntime.ts`; `scripts/boundary-lint.ts`
- `docs/architecture/DATA_MODEL.md`
