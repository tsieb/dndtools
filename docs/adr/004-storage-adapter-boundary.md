# ADR-004: StorageAdapter Abstraction Boundary

- Status: Accepted
- Date: 2026-03-01
- Deciders: Engineering
- Consulted: Product
- Supersedes: N/A

## Context

Renderer features need a stable persistence API that is independent of runtime-specific storage details. Without a single abstraction boundary, route components and feature code can couple directly to desktop bridge internals, making portability and testing harder.

## Decision

All renderer persistence operations go through a single `StorageAdapter` contract:

- The canonical interface is defined in shared types.
- Runtime bootstrap resolves the concrete adapter at startup.
- Desktop implementation is `ElectronStorageAdapter`, which delegates to the preload bridge.
- UI components and state layers consume storage behavior through the abstraction, not runtime-specific APIs.

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

- `src/lib/types/storage.ts`
- `src/lib/platform/storage/index.ts`
- `src/lib/platform/storage/electron-adapter.ts`
- `src/lib/runtime/bootstrap.ts`
- `src/lib/state/notes.svelte.ts`
