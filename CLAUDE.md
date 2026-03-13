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

Use the tiered branch model documented in `docs/development/GIT_WORKFLOW.md`:

git checkout master && git pull && git checkout -b initiative/<id>-<slug>
git checkout initiative/<id>-<slug> && git pull && git checkout -b story/<epic-id>-<slug>

Commit format: `<type>(<scope>): <imperative summary>`
Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
Scopes: `mcp`, `renderer`, `electron`, `storage`, `ui`, `ci`

Pre-commit hooks run `pnpm lint && pnpm format:check` automatically.
Pre-push hooks run `pnpm check` automatically. Never bypass with `--no-verify`.

Always run `pnpm format` before staging many files Ã¢â‚¬â€ Prettier is enforced in CI and pre-commit.

When a story is complete, open a PR and enable auto-merge:

gh pr create --title "<type>(<scope>): <summary> [Epic X.Y]" --base initiative/<id>-<slug>
gh pr merge --auto --squash

When an initiative branch is ready, open the integration PR against `master`.

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

## Initiative Status

- **I1 — Platform Foundation & Trust**: Complete. Atomic writes, schema migrations, vault integrity verification, IPC hardening, and diagnostic telemetry all shipped (Epics 1.1–1.5).
- **I2 — Engineering Excellence**: Mostly Complete. CI/CD pipeline, test pyramid, and ADRs shipped (Epics 2.1–2.3). Later additions (Epics 2.4–2.6: developer tooling audit, performance engineering budgets, CI/CD audit backlog) are incomplete and partially outdated.
- **I3 — Core Knowledge Architecture**: Complete. Link graph, object system, advanced search, templates, import/export, graph intelligence, and world calendar all shipped (Epics 3.1–3.7).
- **I4 — Session-Time Command Center**: Complete. Session boards, combat tracker, quick reference, dice engine, timeline, player mode, random generation, handouts, and encounter builder all shipped (Epics 4.1–4.9).
- **I5 — AI Creative Partnership**: Complete. MCP semantic bundling, vault intelligence, staged change oversight, content generation workflows, and local AI integration all shipped (Epics 5.1–5.5).
- **I6 — Multi-Platform Distribution**: Complete. Desktop shell, Android build, offline sync, accessibility compliance, and PWA/browser support all shipped (Epics 6.1–6.5). Cloud sync components deferred to I7.
- **I7 — Collaborative Infrastructure**: Deferred. All cloud features (AWS backend, real-time sync, P2P, player sessions, async sharing, multi-device sync) deferred until cloud development environment is available.
- **I8 — Extensibility & Ecosystem**: Not Started. Plugin architecture, campaign system modules, custom objects, compendium integration, design system extensions, developer API, and i18n are planned for future work.
- **I9 — Maps & Spatial Intelligence**: Complete. Map library UX, viewer mode architecture, POI workflows, editing ergonomics (undo/redo, fog, routes, layers), and canvas accessibility/mobile all shipped (Epics 19.1–19.5 via I19 UX pass; core map infra from I9 epics).
- **I10 — Player Character Suite**: Not Started. D&D 5e character management, spell/resource tracking, advancement, party coordination, and player journal planned for future work.
- **I11 — Atmosphere, Audio & Immersive Scene Management**: Not Started. Ambient audio engine, scene cards, presets, and automation triggers planned for future work.
- **I12 — Community & Content Ecosystem**: Deferred. Campaign modules, community directory, creator tooling, and public wiki all require cloud infrastructure (I7). Deferred until cloud environment is available.
- **I13 — Information Architecture & Navigation System**: Complete. IA audit, global nav reconstruction, local nav panels, contextual navigation (breadcrumbs/backlinks/deep links), and command palette all shipped (Epics 13.1–13.5).
- **I14 — Adaptive Cross-Platform Shell**: Complete. Layout token architecture, compact/medium/expanded layout tiers, Electron desktop refinements (titlebar, context menus, app menu, filesystem watch), and tablet shell all shipped (Epics 14.1–14.5).
- **I15 — Design System & Visual Language**: Complete. Design token architecture, Lucide icon system, core component library, TTRPG visual language (4 theme presets, stat blocks, dice drama), and density/readability controls all shipped (Epics 15.1–15.5).
- **I16 — Session-Time UX Reimagined**: Complete. Session mode state machine, dice integration, combat persistence, session board mission control redesign, and prep/recap workflow all shipped (Epics 16.1–16.5).
- **I17 — Learnability, Progressive Disclosure & Help Systems**: Complete. Empty states, progressive disclosure, contextual help (HelpTip, spotlights, shortcut overlay), and first-run onboarding (setup wizard, What's New) all shipped (Epics 17.1–17.4).
- **I18 — Accessibility & Inclusive Design**: Complete. Semantic HTML/landmarks, focus management, sensory/motion accessibility, pointer accessibility, and automated accessibility testing pipeline all shipped (Epics 18.1–18.5).
- **I19 — Map Tool UX**: Complete. Map library UX, mode state machine, POI creation/preview/linking, editing tool ergonomics (undo, fog, routes, layers), and canvas accessibility/mobile experience all shipped (Epics 19.1–19.5).
- **I20 — Board Tool UX**: Complete. Tile visual identity, board interaction model, tile creation flow, board empty states/progressive disclosure, and note tile virtualization all shipped (Epics 20.1–20.5).
- **I21 — Codebase Realignment & Quality Audit**: In Progress. Phase A complete (CI restructuring, build script audit, metrics baseline — Epics 21.1–21.3). Phase B partially complete: Epic 21.4 (project organization & goal alignment audit) shipped — compliance matrix, route/IA audit, file structure audit, feature tier audit, exit criteria verification for I1–I20, and known gaps reconciliation documented in `docs/audits/21.4-project-organization-goal-alignment.md` with prioritized remediation backlog. Remaining: Epics 21.5–21.8 (module boundary audit, standards compliance, file decomposition, bundle optimization).

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

### Infrastructure & Testing

- CI tiering is in place via `.github/workflows/ci-smoke.yml` and `.github/workflows/ci.yml`, but cross-platform merge-blocking quality gates are still limited to the dedicated desktop build matrix and release workflows.
- MCP tool-level test coverage is incomplete — many tools rely only on `all-tools.test.ts` contract tests; dedicated per-tool unit/integration tests are sparse.
- Epic 1.4 (IPC Hardening) is substantially complete: explicit named channels, Zod schema validation, `SECURITY.md` threat model, and IPC security regression tests are all in place. One residual gap: `dndtools:storage:clear-changelog` handler does not use `parseIpcArg()` validation.

### Route & Organization

- 10 legacy non-section routes (`/combat/`, `/graph/`, `/notes/`, `/search/`, `/maps/`, `/timeline/`, `/session-board/`, `/encounter/new`, `/notes/[id]`, `/notes/[id]/edit`) exist as full duplicate implementations instead of the `goto()` redirects required by the IA contract in `docs/architecture/INFORMATION_ARCHITECTURE.md`. These double the maintenance surface and risk behavior drift.
- `docs/reference/PROJECT_STRUCTURE.md` does not document `src/lib/ui/` subdirectories, `scripts/`, or MCP tool sub-domains (`dice/`, `random/`).

### Codex Automated Review — Unresolved Issues (22 findings across 13 PRs)

**P1 — High Priority (9 issues):**

- `Button.svelte:42` — Accent button variants hard-code `text-white`; should use `text-accent-foreground` for dark-mode contrast (PR #3, Epic 15.1).
- `PlayerCharacterSheet.svelte:163` — `dmNotes` renders unconditionally, exposing DM content in player mode (PR #5, Epic 15.4).
- `+layout.svelte:426` — `afterNavigate` unconditionally calls `focusRouteLandmark()` with `scrollIntoView`, breaking hash/anchor deep-link navigation (PR #7, Epic 18.2).
- `DesktopTitlebar.svelte:56` — `.touch-target` makes buttons 44x44px but titlebar is fixed at 24px, causing hitbox overflow (PR #9, Epic 18.4).
- `a11y-fixture.ts:24` — Multiple Playwright workers write to one shared report path; later writes overwrite earlier scans (PR #12, Epic 18.5).
- `atlas/maps/+page.svelte:130` — Legacy map URL redirect drops query params (`poi`, `x`, `y`), breaking deep links (PR #13, Epic 19.1).
- `maps/+page.svelte:2508` — Fog undo captures `after` before async mutation completes, making before/after identical (PR #16, Epic 19.4).
- `maps/+page.svelte:3832` — Compact long-press sheet doesn't stop `pointerdown` propagation; taps close sheet before actions execute (PR #17, Epic 19.5).
- `maps/+page.svelte:3692` — POI list view renders inventory regardless of player mode, exposing hidden POI data (PR #17, Epic 19.5).

**P2 — Medium Priority (13 issues):**

- `DesktopTitlebar.svelte:70` — Maximize control always shows `square` icon even when window is maximized (PR #4, Epic 15.2).
- `combat/+page.svelte:151` — Shortcut migration dropped Escape/Enter/digit handling in HP quick-adjust dialog (PR #7, Epic 18.2).
- `+layout.svelte:295` — `no-preference` reduced-motion setting cannot override OS-level `@media (prefers-reduced-motion: reduce)` rules (PR #8, Epic 18.3).
- `session-board/+page.svelte:1411` — Move up/down controls trigger `startPan` which clears tile selection (PR #10, Epic 18.4).
- `axe-policy.ts:90` — Violation fingerprints include nanoid note IDs, causing false churn across runs (PR #12, Epic 18.5).
- `atlas/maps/+page.svelte:351` — Arrow keys update `focusedCardIndex` but don't move DOM focus (PR #13, Epic 19.1).
- `maps/+page.svelte:720` — Entering `grid_align` mode doesn't force grid visibility when display is off (PR #14, Epic 19.2).
- `maps/+page.svelte:743` — `confirmModeTransition` with `force: true` bypasses `modeBlockedReason` checks (PR #14, Epic 19.2).
- `MapCanvasViewer.svelte:1494` — `onmouseleave` immediately closes POI popover; users can't reach popover action buttons (PR #15, Epic 19.3).
- `maps/+page.svelte:1370` — `createNote` failure leaves `savingNoteFromPoi` stuck at `true` (needs `try/finally`) (PR #15, Epic 19.3).
- `MapCanvasViewer.svelte:1820` — Waypoint delete only stops `click`, not `pointerdown`; causes accidental waypoint placement (PR #16, Epic 19.4).
