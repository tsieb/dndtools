# ADR-003: IPC Surface Strategy

- Status: Accepted
- Date: 2026-03-01
- Deciders: Engineering
- Consulted: Security
- Supersedes: N/A

## Context

Electron IPC is the primary boundary between untrusted renderer code and trusted host capabilities. A broad or dynamic IPC API increases injection risk and weakens operational auditing. We need a stable, explicit contract model that is easy to test and reason about.

## Decision

IPC uses explicit, named channels with runtime schema validation:

- Each operation is registered as a dedicated handler in the main process.
- Handler inputs are validated at runtime before business logic executes.
- Preload exposes only named bridge methods (no generic invoke escape hatch).
- Renderer integrations call typed bridge methods instead of raw IPC channels.

## Consequences

### Positive

- Least-privilege IPC posture and better attack-surface clarity.
- Stronger runtime safety versus TypeScript-only assumptions.
- Easier targeted testing of payload limits, enum whitelists, and path constraints.

### Negative

- More boilerplate when adding new capabilities.
- Contract drift risk if schemas, preload methods, and renderer wrappers are not updated together.
- Refactors touching IPC require multi-file coordination.

## Rejected Alternatives

| Alternative                                   | Why Rejected                                                   |
| --------------------------------------------- | -------------------------------------------------------------- |
| Generic method-dispatch IPC channel           | Harder to secure and audit; broad dynamic surface area.        |
| TypeScript-only payload validation            | Does not protect against malformed runtime payloads.           |
| Exposing raw `ipcRenderer` access to renderer | Breaks explicit trust boundary and least-privilege guarantees. |

## Migration Impact

- Any new IPC operation must include schema definition, handler registration, preload bridge method, and renderer wrapper typing.
- Regression tests must cover invalid payload behavior and rejection semantics for new channels.
- Security docs must be updated when trust-boundary behavior changes.

## Rollback Plan

- Trigger: production incident attributable to channel migration errors.
- Rollback action: revert offending channel changes to last known-good explicit contract version.
- Data safety: avoid temporary reintroduction of dynamic dispatch unless absolutely required for outage mitigation.
- Risk: emergency fallback to dynamic dispatch materially weakens security posture and must be short-lived.

## Verification and Evidence

- `electron/main.ts`
- `electron/ipc-schemas.ts`
- `electron/preload.ts`
- `src/lib/platform/desktop/bridge.ts`
- `electron/ipc-security.test.ts`
- `docs/SECURITY.md`
