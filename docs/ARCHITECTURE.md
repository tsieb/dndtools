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
- Manage desktop auto-update state and staged rollout gating.
- Serve built renderer assets in production with a local static server.

### 1.2 Renderer Process

Implemented in:

- `src/routes/+layout.svelte`
- `src/lib/runtime/bootstrap.ts`
- `src/lib/platform/storage/index.ts`

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
- Publish stable resource URIs and discoverability metadata for agent clients.

## 2. Runtime Data Path

Desktop mode (only supported runtime):

Data path:

- Renderer -> preload bridge -> Electron IPC -> `FileSystemAdapter`.

MCP path:

- Electron main -> sidecar using bundled Electron Node runtime (`process.execPath` with
  `ELECTRON_RUN_AS_NODE=1`) -> `mcp/dist/index.cjs <vaultDir>`.
- Development fallback: system `node` runtime when bundled runtime validation fails.

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
- pending previews include semantic impact (rename/move/tags/frontmatter), content delta, and link impact counts.
- pending entries are conflict-checked against live notes before approval to prevent overwriting newer UI edits.
- policy presets are evaluated per agent (`strict_review`, `balanced`, `trusted`) to decide review vs auto-approval for safe edits.
- user approves/rejects changes in Settings MCP tab with filter/search driven batch actions.
- resolved records keep an audit trail (who/what/when/why) and are surfaced in MCP audit history.

Tool contract enforcement:

- `registerTools()` wraps registrations with strict request parsing, response schema validation, and deterministic error envelopes.
- each tool is classified as `read-only`, `write-staged`, or `write-direct`.
- `write-direct` tools are blocked in staged mode.
- non-idempotent tools accept optional `idempotencyKey` for safe retries.

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
- Shared renderer domain logic goes in `src/lib/domain/*`.
- Object graph/lint/template helpers are implemented in:
  - `src/lib/domain/object-relationships.ts`
  - `src/lib/domain/object-validation.ts`
  - `src/lib/domain/object-templates.ts`
- Resource URI strategy constants live in `mcp/resources/uri-strategy.ts`.

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
Reason: backlog item tracked for planned implementation.
Risk: broad invocation surface increases attack and misuse risk.
Target files:

- `electron/main.ts`
- `electron/preload.ts`
- `src/lib/platform/storage/electron-adapter.ts`

## 7.1 MCP Resource URI Strategy

Canonical stable URIs:

- `dndtools://v1/notes/{id}`
- `dndtools://v1/vault/structure`
- `dndtools://v1/vault/tags`
- `dndtools://v1/resources/catalog`

Compatibility:

- legacy aliases remain registered (`note://{id}`, `vault://structure`, `vault://tags`).
- discoverability metadata is available through `dndtools://v1/resources/catalog`.

## 8. Performance Architecture Requirements

- Startup must parallelize independent work (already done in bootstrap).
- Heavy editor code must remain lazy-loaded (`CodeMirrorEditor` route usage).
- Search index updates should be incremental where possible.
- Link graph updates are incremental for note mutations and vault reloads; full rebuild is reserved for explicit recovery paths.
- Heavy renderer computations run through `src/lib/runtime/worker-bridge.ts` (search index build, full graph rebuild, note batch parse) so large vaults do not block the main thread.

### 8.1 Hard Budgets (Epic 2.5)

The following user-visible latencies are treated as hard budgets:

| Operation                                                    | Target budget | Regression failure threshold |
| ------------------------------------------------------------ | ------------- | ---------------------------- |
| Cold start (desktop app launch to shell ready)               | `<= 3000ms`   | `> 3600ms`                   |
| Vault open (5k notes, select/open -> loaded shell)           | `<= 2000ms`   | `> 2400ms`                   |
| Note open (notes list -> note viewer ready)                  | `<= 200ms`    | `> 240ms`                    |
| Search response (query input -> result visible)              | `<= 150ms`    | `> 180ms`                    |
| Save latency (explicit save action -> success confirmation)  | `<= 100ms`    | `> 120ms`                    |
| Graph rebuild (incremental, single-note mutation)            | `<= 50ms`     | `> 60ms`                     |
| MCP semantic bundle call (`session/recap/continuity` bundle) | `<= 800ms`    | `> 960ms`                    |

Regression threshold policy:

- Weekly benchmark failures are triggered at `> 20%` above target budget.
- Benchmarks run in `.github/workflows/performance-regression.yml`.
- Benchmarks are implemented in `tests/e2e-desktop/performance.spec.ts` and tagged `@perf`.
- Canonical registry and operation identifiers live in `src/lib/types/diagnostics.ts` (`PERFORMANCE_BUDGETS`).
- Any budget change must include a dedicated ADR update before merge.

## 9. Reliability and Integrity Gaps

`TODO(APP):` Atomic writes for note/index/settings/session board/object metadata files.
Risk: quality and behavior drift if deferred.
Current issue: direct `writeFile` can leave partial files on crash/power loss.
Target files:

- `mcp/storage.ts`

Implemented for object workflow depth:

- object change history snapshots + revert in `mcp/storage.ts` backed by `.vault/object-history.json`.
- structured object editor in `src/lib/ui/editor/ObjectStructuredEditor.svelte` with markdown sync via storage object saves.
- object validation/lint and relationship graph APIs exposed through storage/Electron bridge.

`TODO(APP):` Metadata integrity verification and repair flow for `.vault/index.json`.
Risk: quality and behavior drift if deferred.
Current issue: index rebuild only if empty; stale/corrupt states are not fully diagnosed.
Target files:

- `mcp/storage.ts`
- `docs/TODO.md` (tracking)

Implemented reliability telemetry baseline:

- Structured error taxonomy in renderer/main diagnostics (`src/lib/domain/error-taxonomy.ts`).
- MCP sidecar lifecycle telemetry (start/stop/restart/crash + reason) in `electron/mcp-sidecar.ts`.
- Subsystem success timestamps for bootstrap/sync/index/link graph.
- Local diagnostics bundle export via desktop bridge and Settings System Health tab.

## 10. Architecture Decision Requirements

For any major architecture change, add/update ADR content in docs before merge:

- decision context
- chosen option
- rejected options
- migration impact
- rollback plan

Required process:

1. Start from `docs/adr/000-template.md`.
2. Add or update a numbered ADR in `docs/adr/`.
3. Update the ADR index in `docs/adr/README.md` with one-line summary and status.
4. Update affected implementation docs in the same change set.

Baseline decision coverage is documented in:

- `docs/adr/001-electron-filesystem-ownership.md`
- `docs/adr/002-staged-mcp-write-model.md`
- `docs/adr/003-ipc-surface-strategy.md`
- `docs/adr/004-storage-adapter-boundary.md`
- `docs/adr/005-unified-markdown-pipeline.md`
- `docs/adr/006-multi-platform-approach-electron-capacitor.md`
- `docs/adr/007-cloud-backend-architecture-aws.md`
- `docs/adr/008-mcp-semantic-bundling-strategy.md`
