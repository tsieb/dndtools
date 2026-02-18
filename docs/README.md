# DND Tools Documentation

This docs set is the authoritative engineering reference for this repository.

## Scope

DND Tools is an Electron-first local markdown vault application with an integrated MCP sidecar.

Primary runtime mode:
- Desktop runtime: Electron main + renderer + filesystem storage + MCP sidecar.

## Source of Truth

Read in this order:
1. `docs/ARCHITECTURE.md`
2. `docs/PROJECT_STRUCTURE.md`
3. `docs/DATA_MODEL.md`
4. `docs/DEVELOPMENT.md`
5. `docs/TESTING.md`
6. `docs/UX_GUIDELINES.md`
7. `docs/AGENTIC_NOTES_WORKFLOW.md`
8. `docs/ROADMAP.md`
9. `docs/TODO.md`

## Documentation Quality Rules (Mandatory)

- Every behavior claim in docs must map to a real file path in the repo.
- Planned work must be marked as `TODO(APP)` and include reason, risk, and target files.
- Do not present aspirational behavior as if already implemented.
- When contracts change (types, IPC, tools, storage format), update docs in the same change set.
- Use exact tool names, script names, and type names.

## Current Product Baseline (Verified)

- Notes are markdown files in a vault folder when running desktop mode.
- MCP runs as a sidecar process and defaults to staged write mode (pending approvals).
- Renderer uses `StorageAdapter` backed by `desktop-filesystem` via Electron bridge.
- Import/export in UI is currently markdown file import + JSON bundle export.

## Global Known Gaps (High Priority)

- `TODO(APP):` Harden filesystem writes with atomic temp-write + rename strategy.
- `TODO(APP):` Replace generic IPC storage method dispatch with a narrower typed IPC surface.
- `TODO(APP):` Add comprehensive MCP tool tests (most tools currently untested).
- `TODO(APP):` Add CI workflows that enforce lint/typecheck/test/build gates.
- `TODO(APP):` Improve portable export format beyond JSON-only bundle.
