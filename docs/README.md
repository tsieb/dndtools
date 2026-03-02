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
6. `docs/OWNERSHIP.md`
7. `docs/GIT_WORKFLOW.md`
8. `docs/TESTING.md`
9. `docs/PERFORMANCE.md`
10. `docs/UX_GUIDELINES.md`
11. `docs/AGENTIC_NOTES_WORKFLOW.md`
12. `docs/MCP_INSPECTOR_WORKFLOW.md`
13. `docs/ROADMAP.md`
14. `docs/TODO.md`
15. `DEBT.md`

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
- Import/export includes Obsidian analyzer + conflict-aware import jobs with resumable checkpoints.
- Export supports portable markdown zip and deterministic git-friendly markdown zip with validation.
- MCP resources expose canonical versioned URIs under `dndtools://v1/*` with legacy aliases.
- Vault-intelligence tools provide campaign health, coverage gaps, stale-note APIs, and task bundles.

## Global Known Gaps (High Priority)

- Filesystem writes now use atomic temp-write + fsync + rename with startup write-journal recovery in `mcp/safe-write.ts` and `mcp/storage.ts`.
- IPC now uses explicit channel handlers with payload validation in `electron/main.ts` and `electron/ipc-schemas.ts`.
- CI now includes Node LTS quality gates, docs drift checks, desktop E2E, desktop build matrix, and release automation under `.github/workflows/*.yml`.
