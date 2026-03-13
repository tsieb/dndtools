# Contributing Guide

Start here if you're new to the DND Tools codebase.

---

## 1. Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- Git
- (Desktop work) Electron dependencies: see [Electron docs](https://www.electronjs.org/docs/latest/development/build-instructions-gn)
- (Android work) Android Studio + SDK Platform 34

## 2. First-Run Setup

```bash
git clone <repo-url>
cd dndtools
pnpm install
pnpm dev          # Start SvelteKit dev server (browser mode)
pnpm desktop:run  # Start Electron desktop app
```

## 3. What to Read First

### By role:

**All contributors:**

- This file (you're here)
- `docs/GLOSSARY.md` — domain terminology
- `docs/development/DEVELOPMENT.md` — standards and boundaries
- `docs/development/GIT_WORKFLOW.md` — branch/commit/PR conventions

**Working on the renderer (UI):**

- `docs/architecture/ARCHITECTURE.md` — runtime topology
- `docs/development/UX_GUIDELINES.md` — UX requirements
- `docs/development/ACCESSIBILITY.md` — a11y requirements

**Working on MCP tools:**

- `docs/reference/AGENTIC_NOTES_WORKFLOW.md` — tool contract
- `docs/operations/MCP_INSPECTOR_WORKFLOW.md` — how to test tools interactively
- `mcp/tools/shared/contracts.ts` — permission/idempotency framework

**Working on storage or data model:**

- `docs/architecture/DATA_MODEL.md` — data structures
- `docs/operations/SCHEMA_MIGRATIONS.md` — migration policy
- `src/lib/types/storage.ts` — StorageAdapter interface

**Planning work (new epics/stories):**

- `docs/planning/PLANNING_TIERS.md` — hierarchy definitions
- `docs/planning/initiatives/README.md` — initiative map and vision
- `docs/planning/ROADMAP.md` — milestone overview

**Release and DevOps:**

- `docs/operations/RELEASE.md` — signing and release pipeline
- `docs/operations/MOBILE.md` — Android build workflow
- `.github/workflows/` — CI configuration

## 4. Development Workflow

All feature work follows the initiative/epic branch model:

```bash
git checkout master
git pull
git checkout -b initiative/<id>-<slug>
git checkout -b story/<epic-id>-<slug>
```

Pre-commit hook runs automatically: `pnpm lint && pnpm format:check`
Pre-push hook runs automatically: `pnpm check` (lint + typecheck + unit tests)

**Never use `--no-verify`.** Fix the underlying lint/type error.

## 5. Key Boundaries (Mandatory)

- Renderer (`src/`) must not import Node.js APIs directly.
- All persistence in renderer must go through `StorageAdapter` — never access IndexedDB directly.
- All markdown rendering must go through the unified pipeline (`src/lib/markdown/`).
- MCP and Electron main are trusted boundaries; renderer is sandboxed.

Boundary violations are lint-enforced and will fail CI.

## 6. Definition of Done (Story)

Before opening a PR:

- [ ] `pnpm check` passes (lint + typecheck + unit tests)
- [ ] New behavior has at least one unit/integration test
- [ ] User-critical UI changes have E2E coverage
- [ ] Relevant docs updated (DATA_MODEL, ARCHITECTURE, AGENTIC_NOTES_WORKFLOW, etc.)
- [ ] Performance budgets not regressed (see `docs/development/PERFORMANCE.md`)
- [ ] Accessibility requirements met (see `docs/development/ACCESSIBILITY.md`)

## 7. Common Tasks

### Add a new MCP tool

1. Create tool file under the correct domain folder in `mcp/tools/` (e.g., `mcp/tools/notes/`).
2. Register in `mcp/tools/index.ts`.
3. Add tests for success, validation failure, and edge cases.
4. Update Section 4 of `docs/reference/AGENTIC_NOTES_WORKFLOW.md`.

### Change the storage contract

1. Update `src/lib/types/storage.ts`.
2. Update all three adapters: `FileSystemAdapter`, `CapacitorStorageAdapter`, `IndexedDbStorageAdapter`.
3. Update Electron IPC bridge if a new channel is needed.
4. Add a schema migration if vault data shape changes.
5. Update `docs/architecture/DATA_MODEL.md` and `docs/architecture/ARCHITECTURE.md`.

### Add a UI feature

1. Keep route components thin — business logic goes in service files under `src/lib/domain/` or state stores.
2. Add/adjust E2E tests for critical paths.
3. Run `pnpm desktop:test:critical` to confirm no regressions.
4. Update `docs/development/UX_GUIDELINES.md` if new UX patterns are introduced.

## 8. Getting Help

- Engineering docs: `docs/` (this directory)
- Architecture decisions: `docs/adr/`
- Issue tracker: GitHub Issues
- PR workflow: `docs/development/GIT_WORKFLOW.md`
