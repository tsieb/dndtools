# Architecture

This document defines the implemented architecture and required constraints for DND Tools.

## 1. Runtime Topology

### 1.1 Electron Main Process

Implemented in:
- `electron/main.ts`
- `electron/preload.ts`
- `electron/mcp-sidecar.ts`

Responsibilities:
- Own BrowserWindow lifecycle and frameless desktop shell behavior.
- Select and initialize vault directory.
- Host filesystem storage (`FileSystemAdapter`) in the trusted process.
- Expose a constrained bridge to renderer via preload.
- Spawn/restart/stop MCP sidecar and expose status.
- Serve built renderer assets in production with a local static server.

### 1.2 Renderer Process

Implemented in:
- `src/routes/+layout.svelte`
- `src/lib/runtime/bootstrap.ts`
- `src/lib/storage/index.ts`

Responsibilities:
- UI, interaction flows, search, markdown rendering, editor workflows.
- Runtime bootstrap orchestration.
- Backend-agnostic state management via `StorageAdapter`.
- Desktop integrations only through `window.dndtoolsDesktop` bridge.

### 1.3 MCP Server Process

Implemented in:
- `mcp/index.ts`
- `mcp/tools/**`
- `mcp/resources/**`
- `mcp/storage.ts`
- `mcp/staged-storage.ts`

Responsibilities:
- Provide structured tool/resource access over stdio MCP.
- Read/write vault content and derived indexes.
- In staged mode, create pending changes instead of direct writes.

## 2. Runtime Data Path

Desktop mode (only supported runtime):

Data path:
- Renderer -> preload bridge -> Electron IPC -> `FileSystemAdapter`.

MCP path:
- Electron main -> sidecar `node mcp/dist/index.cjs <vaultDir>`.

## 3. Storage Boundary (Strict)

Authoritative contract:
- `src/lib/types/storage.ts`

Rules:
- UI components must never access storage details directly.
- All persistence must go through `StorageAdapter` methods.
- Any new persisted concept must be added to the filesystem storage implementation and documented.

## 4. Bootstrap Flow (Implemented)

Executed by `bootstrapApplication()` in `src/lib/runtime/bootstrap.ts`:
1. `initStorage()` initializes desktop filesystem storage.
2. Load UI settings from storage.
3. Load all notes.
4. If vault is empty, create welcome note.
5. Build search index, link graph, MCP changes, and session boards in parallel.

Required behavior:
- bootstrap must be idempotent and guarded by a single in-flight promise.
- failures must surface a user-visible error state.

## 5. MCP Write Modes

Configured in `mcp/index.ts`:
- default staged mode: `StagedMcpAdapter`
- direct mode: `--direct` or `DNDTOOLS_MCP_STAGED=0`

Staged mode behavior:
- tool writes create pending change records in `.vault/mcp-changelog.json`.
- user approves/rejects changes in Settings MCP tab.

## 6. Module Layout Requirements

### 6.1 MCP Tool Organization

- One tool per file under domain folders:
  - `mcp/tools/notes/*`
  - `mcp/tools/search/*`
  - `mcp/tools/vault/*`
  - `mcp/tools/boards/*`
  - `mcp/tools/objects/*`

### 6.2 Shared Helpers

- Reusable MCP helpers go in `mcp/tools/shared/*`.
- Shared renderer domain logic goes in `src/lib/services/*`.

### 6.3 Renderer Boundaries

- Routes orchestrate; services and stores own behavior.
- Runtime bootstrap logic must stay in `src/lib/runtime/*`.

## 7. Security Model (Current + Required)

Current protections:
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- renderer cannot import Node APIs

Required protections:
- validate every IPC payload
- keep preload API surface minimal and typed
- avoid broad "method + args" dispatch patterns

`TODO(APP):` Replace generic storage IPC dispatcher (`dndtools:storage`) with explicit IPC channels per operation.
Risk: broad invocation surface increases attack and misuse risk.
Target files:
- `electron/main.ts`
- `electron/preload.ts`
- `src/lib/storage/electron-adapter.ts`

## 8. Performance Architecture Requirements

- Startup must parallelize independent work (already done in bootstrap).
- Heavy editor code must remain lazy-loaded (`CodeMirrorEditor` route usage).
- Search index updates should be incremental where possible.
- Link graph recompute should avoid full rebuild for single-note edits where feasible.

`TODO(APP):` Introduce incremental link graph updates with per-note invalidation.
Target files:
- `src/lib/stores/links.svelte.ts`
- `src/lib/services/link-extractor.ts`
- `mcp/storage.ts`

## 9. Reliability and Integrity Gaps

`TODO(APP):` Atomic writes for note/index/settings/session board/object metadata files.
Current issue: direct `writeFile` can leave partial files on crash/power loss.
Target files:
- `mcp/storage.ts`

`TODO(APP):` Metadata integrity verification and repair flow for `.vault/index.json`.
Current issue: index rebuild only if empty; stale/corrupt states are not fully diagnosed.
Target files:
- `mcp/storage.ts`
- `docs/TODO.md` (tracking)

## 10. Architecture Decision Requirements

For any major architecture change, add/update ADR content in docs before merge:
- decision context
- chosen option
- rejected options
- migration impact
- rollback plan

`TODO(APP):` Add ADR directory and baseline ADRs for:
- Electron filesystem ownership
- staged MCP write model
