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

Always run `pnpm format` before staging many files Ã¢â‚¬â€ Prettier is enforced in CI and pre-commit.

When a story is complete, open a PR and enable auto-merge:

gh pr create --title "<type>(<scope>): <summary> [Epic X.Y / SX.X.X]" --base master
gh pr merge --auto --squash

**You may merge your own PRs when CI passes** Ã¢â‚¬â€ no human approval required.

Full branch strategy, commit sizing, PR process, and recovery:
Ã¢â€ â€™ `docs/development/GIT_WORKFLOW.md`

## Common Task Notes

### New MCP Tool

1. Add tool file under correct `mcp/tools/<domain>/` folder.
2. Register in `mcp/tools/index.ts`.
3. Add tests for success, validation failure, and edge cases.
4. Update `docs/reference/AGENTIC_NOTES_WORKFLOW.md` if tool contract changes.

### Storage Contract Changes

1. Update `src/lib/types/storage.ts`.
2. Update both adapters:

- `src/lib/platform/storage/indexeddb-adapter.ts`
- `mcp/storage.ts`

3. Update Electron adapter bridge if needed.
4. Add migration/tests.
5. Update `docs/architecture/DATA_MODEL.md` and `docs/architecture/ARCHITECTURE.md`.

### UI Workflow Changes

1. Keep route components thin.
2. Place business logic in `src/lib/services/*` or stores.
3. Add/adjust e2e tests for critical paths.
4. Update docs if user behavior changed.

## Key Architecture Decisions

- Storage abstraction layer (`StorageAdapter` interface) Ã¢â‚¬â€ never access IndexedDB directly from components.
- Markdown pipeline in `src/lib/markdown/` Ã¢â‚¬â€ all parsing goes through unified, never manual.
- Offline-first: treat network as enhancement, not requirement.
- State managed via Svelte 5 runes classes in `src/lib/state/*.svelte.ts`.
- MCP server (`mcp/`) for AI agent vault access:
  - Uses `FileSystemAdapter` (reads/writes markdown files on disk)
  - 43+ tools across `vault/`, `notes/`, `objects/`, `boards/`, `search/`, `dice/`, `random/` domains (canonical list: `mcp/tools/index.ts`)
  - Tool contract framework (`mcp/tools/shared/contracts.ts`) Ã¢â‚¬â€ permissions, idempotency, retry
  - Schema migrations (`mcp/migrations.ts`) Ã¢â‚¬â€ versioned, with checkpoint/rollback
  - Staged storage (`mcp/staged-storage.ts`) Ã¢â‚¬â€ MCP writes staged for human review by default
  - Vault intelligence (`mcp/tools/vault/vault-intelligence.ts`) Ã¢â‚¬â€ analytics engine for agent planning

## Documentation Map

- `CLAUDE.md` Ã¢â‚¬â€ agentic development guide (root, authoritative)
- `docs/README.md` Ã¢â‚¬â€ documentation hub and guided reading index
- `docs/GLOSSARY.md` Ã¢â‚¬â€ domain terminology definitions
- `docs/CONTRIBUTING.md` Ã¢â‚¬â€ onboarding and first-run guide

Architecture: `docs/architecture/` Ã¢â‚¬â€ ARCHITECTURE.md, DATA_MODEL.md, TECH_STACK.md, SECURITY.md

Development: `docs/development/` Ã¢â‚¬â€ DEVELOPMENT.md, GIT_WORKFLOW.md, TESTING.md, PERFORMANCE.md, ACCESSIBILITY.md, UX_GUIDELINES.md, OWNERSHIP.md

Planning: `docs/planning/` Ã¢â‚¬â€ ROADMAP.md, PLANNING_TIERS.md, `initiatives/README.md` (initiative map + vision), `initiatives/I1-*.md`Ã¢â‚¬Â¦`I12-*.md` (per-initiative epic/story details)

Operations: `docs/operations/` Ã¢â‚¬â€ SCHEMA_MIGRATIONS.md, MCP_INSPECTOR_WORKFLOW.md, RELEASE.md, MOBILE.md

Reference: `docs/reference/` Ã¢â‚¬â€ AGENTIC_NOTES_WORKFLOW.md (MCP tool contracts), RANDOM_TABLES.md, PROJECT_STRUCTURE.md

Architecture Decisions: `docs/adr/README.md` Ã¢â‚¬â€ ADR index (ADR-001 through ADR-010)

## Development Phases

- Phase 0: Scaffolding (SvelteKit + tooling setup) Ã¢â‚¬â€ complete
- Phase 1: Core note system (MVP Ã¢â‚¬â€ CRUD, markdown, editor, nav, MCP server) Ã¢â‚¬â€ complete
- Phase 2: Linking & knowledge graph (wikilinks, backlinks, tags) Ã¢â‚¬â€ complete
- Phase 3: Search & discovery (full-text, quick switcher, graph view) Ã¢â‚¬â€ complete
- Phase 4: Polish & advanced features (import/export, templates, a11y audit) Ã¢â‚¬â€ in progress
- Phase 5: Cloud & sharing Ã¢â‚¬â€ future
- Phase 6: D&D-specific tools Ã¢â‚¬â€ maps, player features, campaign mgmt Ã¢â‚¬â€ future

## Completed Epics

- **Epic 1.3** Ã¢â‚¬â€ Integrity Verification & Self-Repair (commit `115d933`):
  - `NoteIntegrityIssueStatus` extended with `'orphan_entry'`
  - `vaultHealthState` singleton in `src/lib/state/vaultHealth.svelte.ts`
  - TopBar health badge (triangle warning icon, severity-coloured)
  - `pnpm vault:verify` CLI (`mcp/cli/vault-verify.ts`)
  - Settings Vault tab: severity-grouped report, Rebuild Index, Clear Changelog, on-close cadence, snapshot sizes
  - IPC: `dndtools:storage:rebuild-index`, `dndtools:storage:clear-changelog`
  - Pre-migration safety snapshot in run-migrations IPC handler
  - `electron/ipc-schemas.ts` + `ipc-security.test.ts` (IPC security foundation)

- **Epic 1.5** Ã¢â‚¬â€ Diagnostic Telemetry & Health Dashboard (commit `d3375cf`):
  - In progress on branch `story/1.5-diagnostic-telemetry-health`
- **Epic 13.1** — IA Audit, North-Star Definition & Route Architecture:
  - Added IA source of truth in docs/architecture/INFORMATION_ARCHITECTURE.md
  - Added redundancy elimination log in docs/architecture/NAVIGATION_REDUNDANCY_LOG.md
  - Added three-layer navigation contract in docs/architecture/NAVIGATION_CONTRACT.md
  - Added nav-layer lint gate (scripts/nav-layer-lint.ts) and integrated it into pnpm lint
  - Added canonical route hierarchy roots and section paths:
    - /knowledge/\*
    - /atlas/\*
    - /session/\*
    - /campaign/\*
    - /settings/\*
  - Added breadcrumb metadata loaders in canonical route +page.ts files and wired breadcrumb rendering to route metadata
  - Added client-side canonicalization redirects for legacy route paths in src/routes/+layout.svelte
- **Epic 13.2** — Global Navigation Layer Reconstruction:
  - Added PrimaryNav shell component in src/lib/ui/layout/PrimaryNav.svelte
  - Added section icon system in src/lib/ui/layout/PrimaryNavIcon.svelte
  - Added iconography specification in docs/architecture/NAVIGATION_ICONOGRAPHY.md
  - Reduced TopBar scope and documented ownership in docs/architecture/TOPBAR_CHARTER.md
  - Added centralized activeSection / activeRoute state in src/lib/state/navigation.svelte.ts
  - Moved DM/Player persona controls to sidebar footer switcher and added persistent player-mode shell indicators
- **Epic 13.3** — Local Navigation: Section Panels and Contextual Browse:
  - Replaced monolithic sidebar content with section-scoped local navigation panels:
    - KnowledgeLocalNavPanel
    - AtlasLocalNavPanel
    - SessionLocalNavPanel
    - CampaignLocalNavPanel
    - SettingsLocalNavPanel
  - Added collapsible local panel sections with persisted localStorage state in src/lib/state/local-navigation-panels.svelte.ts
  - Added reusable local-nav primitives:
    - src/lib/ui/layout/local-nav/CollapsibleLocalNavSection.svelte
    - src/lib/ui/layout/local-nav/LocalNavTree.svelte
  - Implemented Knowledge local-nav tabs (Browse/Recent/Saved), ARIA tree semantics, saved search collection pills, and cross-type recent item rendering
  - Extended navigation state with cross-type recent item tracking (note/entity/map) and route-level recording for atlas map visits
  - Implemented Session local-nav status panel with active board summary, initiative snapshot, start/resume controls, and quick dice access
  - Added direct Save action in search bar for saved search workflow
  - Added tests:
    - src/lib/state/local-navigation-panels.svelte.test.ts
    - updated src/lib/state/navigation.svelte.test.ts
    - updated tests/e2e/navigation.spec.ts
- **Epic 13.4** — Contextual Navigation: Breadcrumbs, Backlinks, Deep Links:
  - Added semantic breadcrumb component in `src/lib/ui/navigation/Breadcrumb.svelte`:
    - Proper breadcrumb markup (`nav > ol > li`) with `aria-current="page"` on current item
    - Narrow-viewport truncation with middle-crumb disclosure (`...`) for full-path reveal
  - Updated `LocationBar` to consume the breadcrumb component and enrich route metadata with
    contextual hierarchy:
    - Folder hierarchy + note title for note detail routes
    - Atlas map hierarchy for selected map routes
    - Active session board name for session board routes
  - Redesigned note backlinks UI in `src/lib/ui/viewer/BacklinksPanel.svelte`:
    - New "Referenced by (N)" contextual panel treatment
    - Source note title + folder path breadcrumb + excerpt snippet per backlink occurrence
    - Desktop side-panel friendly with narrow-screen collapsible behavior
  - Added cross-section contextual links panel in `src/lib/ui/viewer/CrossSectionLinksPanel.svelte`:
    - "View entity" links into Campaign section for entity-like notes
    - "View on Atlas" links for map-linked entities/notes
    - Session-context quick link when note is active on current session board
  - Updated session board note surfaces to expose explicit "View in Knowledge" links.
  - Hardened navigation history behavior in `src/lib/state/navigation.svelte.ts`:
    - Back/forward only enables for same-section history
    - Back is disabled on section root routes
    - Added explicit `navigationState.reset()` for vault switch/repair history reset
  - Hooked vault switch and vault repair flows to clear navigation history state in
    `src/lib/ui/settings/VaultSettingsTab.svelte`.
  - Added browser history label normalization in `src/routes/+layout.svelte` so history entries
    keep human-readable labels used by TopBar tooltips.
  - Added/updated tests:
    - `src/lib/state/navigation.svelte.test.ts`
    - `tests/e2e/navigation.spec.ts`
- **Epic 13.5** — Command Palette and Search as Primary Navigation:
  - Replaced Quick Switcher with a prefix-driven command palette in `src/lib/ui/search/QuickSwitcher.svelte`:
    - Default mode (no prefix) navigates notes via title/content search
    - `>` mode executes commands (create note, session switch, settings vault, theme toggle, roll 1d20, etc.)
    - `#` mode filters note navigation by tag
    - `/` mode navigates primary section routes
  - Added command-palette scope controls with explicit scope labeling (`All notes`, `Current folder`, `NPCs only`) and keyboard-complete behavior (Arrow wrap, Enter activation, Escape close + focus return, Tab/Shift+Tab scope traversal).
  - Added shared scope contract helpers in:
    - `src/lib/domain/search-scope.ts`
    - `src/lib/domain/search-scope.test.ts`
  - Extended search page (`src/routes/search/+page.svelte`) with URL-backed scope controls:
    - Scope label + inline selector (`all` / `folder` / `type`)
    - Scope persisted in query string (`scope`, `scopeValue`) for shareable/bookmarkable search URLs
    - Scope-aware query execution and semantic fallback filtering
  - Upgraded search result rendering for hierarchy context:
    - Title match highlighting
    - Folder breadcrumb path
    - Type icon token + primary tags (up to 3) + last-modified date
    - Section-grouped results with per-group collapse when scope is `all`
  - Updated keyboard/help copy from “Quick switcher” to “Command palette”:
    - `src/lib/ui/settings/GeneralSettingsTab.svelte`
    - `src/lib/domain/welcome-note.ts`
  - Added and updated end-to-end coverage:
    - `tests/e2e/search.spec.ts`
    - `tests/e2e/navigation.spec.ts`
    - `tests/e2e-desktop/accessibility.spec.ts`
    - `tests/e2e-desktop/interactive-controls.spec.ts`
- **Epic 14.1** — Layout Token Architecture and Breakpoint Contract:
  - Added canonical layout tier state in `src/lib/state/layout.svelte.ts`:
    - Contract breakpoints: compact `<640`, medium `640–1099`, expanded `>=1100`
    - `ResizeObserver` viewport tracking with 100ms debounce
    - SSR-safe default tier (`expanded`)
  - Rewired shell/layout consumers to tier-based state (removed legacy `ui.checkMobile` / width breakpoint logic):
    - `src/routes/+layout.svelte`
    - `src/lib/ui/layout/AppShell.svelte`
    - `src/lib/ui/layout/Sidebar.svelte`
    - `src/lib/ui/layout/PrimaryNav.svelte`
    - local-nav panels + compact editor/notification behavior
  - Added structural layout tokens in `src/app.css` and removed `--width-sidebar`:
    - rail/panel/detail widths
    - top bar and bottom nav heights
    - tier breakpoint tokens
  - Added architecture contract doc: `docs/architecture/LAYOUT_TIERS.md`
  - Added tests:
    - `src/lib/state/layout.svelte.test.ts`
    - `tests/e2e/navigation.spec.ts` (tier breakpoint shell behavior)
- **Epic 14.2** — Compact Layout (Mobile Shell):
  - Reworked compact shell behavior in `src/lib/ui/layout/AppShell.svelte`:
    - Added persistent `Browse` pill above bottom navigation.
    - Added compact local-nav bottom sheet with drag handle, 70vh presentation, focus trap, and dismiss via backdrop, Escape, swipe-down, and mobile back gesture.
    - Added compact left-edge swipe-right gesture to open the local-nav sheet.
    - Suppressed navigation chrome for compact note editor routes to provide focused full-screen editing.
  - Simplified compact topbar in `src/lib/ui/layout/TopBar.svelte`:
    - Compact mode now shows title context, command palette icon, and overflow menu.
    - Overflow menu hosts theme selection, settings shortcut, and DM/Player mode switch.
    - Compact note editor mode now exposes a topbar back/done affordance.
  - Updated compact primary nav behavior:
    - Added keyboard-open ARIA hiding in `src/lib/ui/layout/PrimaryNav.svelte`.
    - Updated compact active-state styling in `src/app.css` for accent-forward active labels.
  - Added compact note-list gesture alternatives in `src/lib/ui/common/NoteCard.svelte` and `src/routes/notes/+page.svelte`:
    - Swipe-left quick actions (pin/delete) for note cards.
    - Long-press + explicit quick-action menu fallback to satisfy non-gesture alternatives.
    - Delete confirmation flow and pin/unpin feedback for quick actions.
  - Added/updated tests:
    - `tests/e2e/mobile-ui.spec.ts`
    - `tests/e2e/helpers.ts`
- **Epic 14.3** — Expanded Layout (Desktop Shell):
  - Added expanded desktop shell state in `src/lib/state/desktop-shell.svelte.ts`:
    - local panel collapsed state persisted in `localStorage`
    - per-section local panel widths (`200px`-`320px`) persisted in `localStorage`
    - per-section local panel scroll memory across navigation
    - detail panel open state + zen mode state management
  - Reworked expanded shell layout in `src/lib/ui/layout/AppShell.svelte`:
    - permanent icon rail + persistent local panel behavior
    - right contextual detail panel surface with route-aware availability
    - draggable + keyboard-accessible local panel resize handle (`ArrowLeft`/`ArrowRight`)
    - zen mode chrome collapse with breadcrumb + explicit exit control
  - Added contextual detail panel component `src/lib/ui/layout/DetailPanel.svelte`:
    - note context (cross-section links + backlinks + object metadata summary)
    - map context legend summary for selected atlas map
    - session quick-reference summary for active board
  - Updated shell controls and shortcuts:
    - `Ctrl+B` now collapses/expands expanded local panel (persisted)
    - `Ctrl+Shift+R` toggles contextual detail panel when available
    - `F11` and editor toolbar `Zen` button toggle zen mode
    - TopBar charter updated to include detail panel toggle ownership
  - Added/updated tests:
    - `src/lib/state/desktop-shell.svelte.test.ts`
    - `src/lib/domain/detail-panel-context.test.ts`
    - `tests/e2e/navigation.spec.ts` (expanded shell collapse/detail/resize/zen behaviors)

## What Not To Do

- do not bypass storage abstraction
- do not add direct Node usage to renderer
- do not introduce broad IPC without validation
- do not claim docs are up to date without verifying files
- do not merge large behavior changes without test updates
- do not commit story-level work directly to `master` Ã¢â‚¬â€ use a story branch
- do not force-push `master` under any circumstances
- do not use `--no-verify` to bypass git hooks

## Current Known Gaps to Respect

- CI workflows exist (`.github/workflows/ci.yml`, `.github/workflows/e2e.yml`) but are not yet comprehensive: coverage threshold enforcement and cross-platform matrix testing are not yet added.
- MCP tool-level test coverage is incomplete Ã¢â‚¬â€ many tools rely only on `all-tools.test.ts` contract tests; dedicated per-tool unit/integration tests are sparse.
- Epic 1.4 (IPC Hardening) is substantially complete: explicit named channels, Zod schema validation, `SECURITY.md` threat model, and IPC security regression tests are all in place. One residual gap: `dndtools:storage:clear-changelog` handler does not use `parseIpcArg()` validation.
- Atomic filesystem writes are implemented in `mcp/safe-write.ts` and `mcp/storage.ts`; write-journal recovery runs at startup. This is substantially complete.
