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
- CodeMirror 6
- unified/remark/rehype markdown pipeline
- MiniSearch for full-text local search
- Dexie for IndexedDB fallback
- Electron 37 desktop shell
- MCP SDK for tool/resource server

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

## What Not To Do

- do not bypass storage abstraction
- do not add direct Node usage to renderer
- do not introduce broad IPC without validation
- do not claim docs are up to date without verifying files
- do not merge large behavior changes without test updates

## Current Known Gaps to Respect

- CI workflows are not yet enforced.
- MCP tool-level test coverage is incomplete.
- filesystem write atomicity hardening is not complete.
- IPC storage dispatch is broader than ideal and should be tightened.
