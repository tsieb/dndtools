# ADR-001: Electron Filesystem Ownership

- Status: Retired (v1 runtime)
- Date: 2026-03-01 (retired 2026-09-11)
- Deciders: Engineering

## Decision, as it was

In the v1 document editor, campaign data lived in user-owned filesystem vaults. Filesystem
ownership stayed in trusted runtimes: the Electron main process served renderer storage through
explicit IPC handlers, the MCP sidecar owned tool storage against the same vault boundary, and the
renderer only used the preload bridge and a `StorageAdapter` contract.

## Why it is retired

v1 was removed (ADR-016). The React app persists the vault in Dexie/IndexedDB inside the renderer
(ADR-014's storage model, ADR-019, ADR-035), and no runtime reads or writes a filesystem vault. The
spirit survives in ADR-003 (the preload bridge stays minimal and validated) and in the platform
boundary (`apps/gm-react/src/platform/`). The original text is in git history.
