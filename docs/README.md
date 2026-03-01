# DND Tools Documentation

This docs set is the authoritative engineering reference for this repository.

## Scope

DND Tools is an Electron-first local markdown vault application with an integrated MCP sidecar.

Primary runtime mode:

- Desktop runtime: Electron main + renderer + filesystem storage + MCP sidecar.

## Source of Truth

Read in this order:

1. `docs/ARCHITECTURE.md`
2. `docs/adr/README.md`
3. `docs/PROJECT_STRUCTURE.md`
4. `docs/DATA_MODEL.md`
5. `docs/DEVELOPMENT.md`
6. `docs/GIT_WORKFLOW.md`
7. `docs/TESTING.md`
8. `docs/UX_GUIDELINES.md`
9. `docs/AGENTIC_NOTES_WORKFLOW.md`
10. `docs/MCP_INSPECTOR_WORKFLOW.md`
11. `docs/ROADMAP.md`
12. `docs/TODO.md`

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
- MCP resources expose canonical versioned URIs under `dndtools://v1/*` with legacy aliases.
- Vault-intelligence tools provide campaign health, coverage gaps, stale-note APIs, and task bundles.

## Global Known Gaps (High Priority)

- Filesystem writes now use atomic temp-write + fsync + rename with startup write-journal recovery in `mcp/safe-write.ts` and `mcp/storage.ts`.
- IPC now uses explicit channel handlers with payload validation in `electron/main.ts` and `electron/ipc-schemas.ts`.
- CI now includes Node LTS quality gates, docs drift checks, desktop E2E, desktop build matrix, and release automation under `.github/workflows/*.yml`.
- `TODO(APP):` Improve portable export format beyond JSON-only bundle.
  Reason: current export remains JSON-first and less interoperable with external markdown tooling.
  Target: `src/lib/domain/export.ts`, export UX in `src/routes/settings/+page.svelte`.
  Risk: cross-tool portability friction and lower long-term vault interoperability.
