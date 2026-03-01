# ADR-001: Electron Filesystem Ownership

- Status: Accepted
- Date: 2026-03-01
- Deciders: Engineering
- Consulted: Security, UX
- Supersedes: N/A

## Context

DND Tools is local-first and stores campaign data in user-owned filesystem vaults. The renderer runs untrusted UI code and must not be able to perform direct host filesystem I/O. The architecture already separates trusted and untrusted processes, but this decision needs explicit governance because storage integrity and security depend on it.

## Decision

Filesystem ownership remains in trusted runtimes:

- Electron main process owns renderer-initiated storage operations through explicit IPC handlers.
- MCP sidecar owns MCP tool storage operations against the same vault boundary.
- Renderer code only uses the preload bridge and `StorageAdapter` contract; it never reads or writes the filesystem directly.

## Consequences

### Positive

- Strong security boundary between UI and host filesystem.
- Centralized path validation and safe-write logic in trusted code.
- Consistent operational behavior for diagnostics, migrations, and integrity checks.

### Negative

- Additional IPC hop for renderer storage operations.
- Feature work that touches persistence must wire multiple layers (types, bridge, handler, storage).
- Desktop-only assumptions must stay explicit until additional platform adapters are implemented.

## Rejected Alternatives

| Alternative                                   | Why Rejected                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| Renderer direct filesystem APIs               | Violates trust boundary and increases blast radius of renderer compromise. |
| Generic "invoke any channel" bridge           | Weakens least-privilege IPC and makes capability auditing harder.          |
| Route/component-level storage implementations | Creates inconsistent behavior and bypasses central integrity controls.     |

## Migration Impact

- New persisted capabilities must be implemented in trusted storage code and surfaced through explicit bridge contracts.
- Any platform expansion must preserve this ownership model by implementing a platform-specific adapter layer rather than bypassing the boundary.
- Security and integrity tests must continue to validate containment and payload constraints at trusted boundaries.

## Rollback Plan

- Trigger: severe production issue caused by ownership boundary changes (for example, systemic storage failures).
- Rollback action: revert the introducing change set and restore last known-good handler and adapter wiring.
- Data safety: keep safe-write and journal protections enabled during rollback to avoid partial-write risk.
- Risk: rolling back boundary code can temporarily reduce capability coverage but should not weaken least-privilege assumptions.

## Verification and Evidence

- `electron/main.ts`
- `electron/preload.ts`
- `mcp/storage.ts`
- `src/lib/platform/storage/electron-adapter.ts`
- `src/lib/types/storage.ts`
- `electron/ipc-security.test.ts`
