# CLAUDE.md - Agent Development Guide

This file documents repository-specific guidance for AI-assisted development.

## Project Snapshot

DND Tools is an Electron-first local markdown vault application with:

- SvelteKit renderer UI
- filesystem storage in desktop mode
- IndexedDB fallback in browser mode
- MCP sidecar for agent access
- staged MCP write review as default safety mode

## Runtime Model

1. Electron main (`electron/main.ts`)

- owns vault selection and filesystem adapter lifecycle
- hosts IPC surface and sidecar management

2. Renderer (`src/`)

- uses `StorageAdapter` abstraction
- bootstraps via `src/lib/runtime/bootstrap.ts`

3. MCP (`mcp/`)

- stdio server from `mcp/index.ts`
- tools/resources registered from domain modules

## Important Boundaries

- Renderer must not access Node APIs directly.
- Data access in renderer must go through storage adapter.
- MCP and Electron main are trusted runtime boundaries.
- Do not bypass markdown pipeline for rendered note content.

## Tech Stack (Current)

- SvelteKit 2, Svelte 5, TypeScript 5 strict
- Tailwind CSS 4 + custom CSS tokens in `src/app.css`
- CodeMirror 6 (lazy-loaded)
- unified/remark/rehype markdown pipeline with custom wikilink plugin
- MiniSearch for full-text local search
- Dexie for IndexedDB fallback
- Electron 37 desktop shell
- MCP SDK for tool/resource server
- Vitest (unit/integration) + Playwright (E2E) for testing
- pnpm as package manager

## Repository Structure

Key roots:

- `src/` renderer
- `electron/` desktop shell
- `mcp/` sidecar server
- `docs/` engineering and product docs
- `tests/` e2e + fixtures

## Coding Standards

- strict typing, avoid `any`
- single-purpose modules
- explicit runtime boundary separation
- update tests and docs with behavior changes

## Required Commands Before Handoff

- `pnpm check`
- `pnpm test:e2e` for UI behavior changes
- `pnpm desktop:build` for desktop/runtime integration changes
- `pnpm mcp:build` for MCP entrypoint/tool/resource changes

## Git Workflow

For all story-level work, create a branch before starting:

git checkout master && git checkout -b story/<epic-id>-<story-id>-<slug>

Commit format: `<type>(<scope>): <imperative summary>`
Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
Scopes: `mcp`, `renderer`, `electron`, `storage`, `ui`, `ci`

Pre-commit hooks run `pnpm lint && pnpm format:check` automatically.
Pre-push hooks run `pnpm check` automatically. Never bypass with `--no-verify`.

Always run `pnpm format` before staging many files — Prettier is enforced in CI and pre-commit.

When a story is complete, open a PR and enable auto-merge:

gh pr create --title "<type>(<scope>): <summary> [Epic X.Y / SX.X.X]" --base master
gh pr merge --auto --squash

**You may merge your own PRs when CI passes** — no human approval required.

Full branch strategy, commit sizing, PR process, and recovery:
→ `docs/GIT_WORKFLOW.md`

## Common Task Notes

### New MCP Tool

1. Add tool file under correct `mcp/tools/<domain>/` folder.
2. Register in `mcp/tools/index.ts`.
3. Add tests for success, validation failure, and edge cases.
4. Update `docs/AGENTIC_NOTES_WORKFLOW.md` if tool contract changes.

### Storage Contract Changes

1. Update `src/lib/types/storage.ts`.
2. Update both adapters:

- `src/lib/storage/indexeddb-adapter.ts`
- `mcp/storage.ts`

3. Update Electron adapter bridge if needed.
4. Add migration/tests.
5. Update `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`.

### UI Workflow Changes

1. Keep route components thin.
2. Place business logic in `src/lib/services/*` or stores.
3. Add/adjust e2e tests for critical paths.
4. Update docs if user behavior changed.

## Key Architecture Decisions

- Storage abstraction layer (`StorageAdapter` interface) — never access IndexedDB directly from components.
- Markdown pipeline in `src/lib/markdown/` — all parsing goes through unified, never manual.
- Offline-first: treat network as enhancement, not requirement.
- State managed via Svelte 5 runes classes in `src/lib/state/*.svelte.ts`.
- MCP server (`mcp/`) for AI agent vault access:
  - Uses `FileSystemAdapter` (reads/writes markdown files on disk)
  - 30+ tools across `vault/`, `notes/`, `objects/`, `boards/`, `search/` domains
  - Tool contract framework (`mcp/tools/shared/contracts.ts`) — permissions, idempotency, retry
  - Schema migrations (`mcp/migrations.ts`) — versioned, with checkpoint/rollback
  - Staged storage (`mcp/staged-storage.ts`) — MCP writes staged for human review by default
  - Vault intelligence (`mcp/tools/vault/vault-intelligence.ts`) — analytics engine for agent planning

## Documentation Map

- `CLAUDE.md` — agentic development guide (root, authoritative)
- `docs/MASTER_PLAN.md` — comprehensive initiative/epic/story roadmap
- `docs/GIT_WORKFLOW.md` — branch strategy, commit format, PR process, recovery
- `docs/PLANNING_TIERS.md` — five-tier planning hierarchy
- `docs/SCHEMA_MIGRATIONS.md` — versioning policy, migration engine, rollback
- `docs/MCP_INSPECTOR_WORKFLOW.md` — testing MCP tools interactively
- `docs/ARCHITECTURE.md` — system design & component map
- `docs/DEVELOPMENT.md` — dev standards, workflow, tooling
- `docs/DATA_MODEL.md` — data structures & storage
- `docs/AGENTIC_NOTES_WORKFLOW.md` — MCP tool contracts for agent note workflows

## Development Phases

- Phase 0: Scaffolding (SvelteKit + tooling setup) — complete
- Phase 1: Core note system (MVP — CRUD, markdown, editor, nav, MCP server) — complete
- Phase 2: Linking & knowledge graph (wikilinks, backlinks, tags) — complete
- Phase 3: Search & discovery (full-text, quick switcher, graph view) — complete
- Phase 4: Polish & advanced features (import/export, templates, a11y audit) — in progress
- Phase 5: Cloud & sharing — future
- Phase 6: D&D-specific tools — maps, player features, campaign mgmt — future

## Completed Epics

- **Epic 1.3** — Integrity Verification & Self-Repair (commit `115d933`):
  - `NoteIntegrityIssueStatus` extended with `'orphan_entry'`
  - `vaultHealthState` singleton in `src/lib/state/vaultHealth.svelte.ts`
  - TopBar health badge (triangle warning icon, severity-coloured)
  - `pnpm vault:verify` CLI (`mcp/cli/vault-verify.ts`)
  - Settings Vault tab: severity-grouped report, Rebuild Index, Clear Changelog, on-close cadence, snapshot sizes
  - IPC: `dndtools:storage:rebuild-index`, `dndtools:storage:clear-changelog`
  - Pre-migration safety snapshot in run-migrations IPC handler
  - `electron/ipc-schemas.ts` + `ipc-security.test.ts` (IPC security foundation)

- **Epic 1.5** — Diagnostic Telemetry & Health Dashboard (commit `d3375cf`):
  - In progress on branch `story/1.5-diagnostic-telemetry-health`

## What Not To Do

- do not bypass storage abstraction
- do not add direct Node usage to renderer
- do not introduce broad IPC without validation
- do not claim docs are up to date without verifying files
- do not merge large behavior changes without test updates
- do not commit story-level work directly to `master` — use a story branch
- do not force-push `master` under any circumstances
- do not use `--no-verify` to bypass git hooks

## Current Known Gaps to Respect

- CI workflows exist (`.github/workflows/ci.yml`, `.github/workflows/e2e.yml`) but are not yet comprehensive: desktop build validation, coverage threshold enforcement, and cross-platform matrix testing are not yet added.
- MCP tool-level test coverage is incomplete — many tools rely only on `all-tools.test.ts` contract tests; dedicated per-tool unit/integration tests are sparse.
- IPC storage dispatch is broader than ideal and should be tightened (tracked as Epic 1.4 in `docs/MASTER_PLAN.md`).
- Atomic filesystem writes are implemented in `mcp/safe-write.ts` and `mcp/storage.ts`; write-journal recovery runs at startup. This is substantially complete.
