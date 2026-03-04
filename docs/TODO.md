# DND Tools TODO

Status legend:

- `[ ]` not started
- `[-]` in progress
- `[x]` complete

Priority legend:

- `P0` critical for trust/reliability
- `P1` high impact for core UX
- `P2` meaningful improvement
- `P3` nice-to-have/strategic expansion

## North Star

Build the best local-first, markdown-native D&D knowledge workspace with:

- Zero data loss.
- Fast, low-friction session-time workflows.
- Powerful but safe AI/MCP automation.
- Delightful UX for both power users and non-technical players/DMs.

## Arc 1: Product Foundation and User Trust

### Project 1.1: Data Integrity and Recovery (P0)

- [x] Add startup integrity scan for vault metadata/index (`.vault/index.json`) and show actionable repair flow in UI.
- [x] Add atomic write strategy for markdown notes and index updates (temp file + rename).
- [x] Add note-level checksums/version markers in frontmatter to detect silent corruption.
- [x] Add crash-safe journal for pending writes and replay on restart.
- [x] Add automated backup cadence settings (hourly/daily/manual), local retention policy, and restore UI.
- [x] Add one-click “Create Safety Snapshot” before high-risk operations (bulk import, migration, mass delete).
- [x] Add explicit restore UX for accidental deletes beyond current trash flow.
- [x] Add data-loss regression tests across renderer, Electron, and MCP boundaries.

### Project 1.2: Migration and Schema Evolution (P0)

- [x] Define schema versioning policy for notes, objects, and `.vault` metadata.
- [x] Implement migration engine with dry-run mode and rollback checkpoint.
- [x] Add migration report output (changed files, failures, warnings).
- [x] Add integration tests for each schema bump against realistic fixture vaults.
- [x] Add “vault upgrade required” guardrail in desktop bootstrap.

### Project 1.3: Reliability Telemetry and Diagnostics (P1)

- [x] Add structured error taxonomy (storage, parsing, IPC, MCP sidecar, UI runtime).
- [x] Add local diagnostics bundle export (logs, runtime status, environment, anonymized metrics).
- [x] Add MCP sidecar lifecycle telemetry (start/stop/restart/crash reason).
- [x] Add “last successful sync/index/build” timestamps for critical subsystems.
- [x] Add in-app “System Health” page in Settings.

## Arc 2: Session-Time UX Excellence

### Project 2.1: Navigation and Information Scent (P1)

- [x] Add sticky breadcrumbs and contextual location hints for deep folders/linked flows.
- [x] Add richer sidebar modes: folder tree, recent, favorites, pinned campaign entities.
- [x] Add keyboard-first command palette expansion (actions + navigation + settings).
- [x] Add “recently visited” stack with back/forward history clarity.
- [x] Add quick jump to related notes (same tags, backlinks, same object references).

### Project 2.2: Search and Discovery (P1)

- [x] Add advanced search operators (`tag:`, `folder:`, `type:`, `updated:`, quoted phrases).
- [x] Add saved searches and smart collections.
- [x] Add faceted result filtering panel with counts and clear active-filter chips.
- [x] Add fuzzy ranking improvements and typo tolerance tuning.
- [x] Add inline preview snippets for matched sections with jump-to-anchor.
- [x] Add “search while typing” performance budget monitoring.

### Project 2.3: Reading and Editing Flow (P1)

- [x] Add split-pane mode (editor + preview) with synchronized scroll.
- [x] Add better editor insert menus (callouts, tables, templates, embeds, dice blocks).
- [x] Add unresolved-link workflow improvements (batch create, disambiguation, quick rename).
- [x] Add richer note metadata editing UI (frontmatter fields as structured controls).
- [x] Add customizable editor defaults per vault (line wrap, vim, font size, toolbar density).
- [x] Add session-mode “focus reading” layout with minimal chrome.

### Project 2.4: First-Run and Onboarding (P2)

- [x] Add guided first-run checklist (create first note, link, tag, search, open settings).
- [x] Add contextual “why this matters” tips for core concepts (wikilinks, backlinks, object embeds).
- [x] Add sample D&D vault templates (campaign starter, one-shot, player journal).
- [x] Add “import from Obsidian” first-run shortcut with safe preview.
- [x] Add progressive onboarding dismissal + revisit controls.

## Arc 3: Knowledge Model and Domain Depth

### Project 3.1: Objects and Structured Content System (P1)

- [x] Expand object schema coverage (NPC, location, faction, quest, item, encounter, timeline event).
- [x] Add object relationship graph (parent/child, ally/enemy, appears-in-session).
- [x] Add structured editor forms + markdown sync for object-backed notes.
- [x] Add object validation and linting (missing required fields, broken references).
- [x] Add object templates with campaign-system variants (5e baseline first).
- [x] Add object change history and revert.

### Project 3.2: Linking and Graph Intelligence (P1)

- [x] Add incremental link graph updates from storage events (avoid full rebuild).
- [x] Add graph quality tools: orphan detection, dead links, high-centrality note insights.
- [x] Add backlink context snippets in UI and MCP responses.
- [x] Add alias-aware and disambiguated link resolution.
- [x] Add optional visual graph exploration view with filters.

### Project 3.3: Templates, Automation, and Reuse (P2)

- [x] Add global + folder-scoped note templates.
- [x] Add template variables (date, campaign name, session number, character names).
- [x] Add “create from template” via command palette and toolbar.
- [x] Add reusable content blocks/snippets library.
- [x] Add one-click session recap generator scaffold (non-AI baseline).

## Arc 4: MCP and AI Collaboration Platform

### Project 4.1: MCP Tool Reliability and Contracts (P0)

- [x] Add strict request/response schemas for all MCP tools/resources.
- [x] Add comprehensive unit tests for every MCP tool module (notes/search/vault/objects/boards).
- [x] Add tool-level permission model (read-only, write-staged, write-direct).
- [x] Add deterministic tool error payload format with actionable remediation hints.
- [x] Add tool idempotency guidelines and tests for safe retries.

### Project 4.2: Staged Changes and Human Oversight (P1)

- [x] Expand pending-change preview to include semantic summaries (rename, content delta, link impacts).
- [x] Add conflict detection for MCP edits vs live UI edits.
- [x] Add per-agent policy presets (auto-approve read-only, require review for structural edits).
- [x] Add batch approval filters and diff search within pending changes.
- [x] Add audit trail for MCP-applied changes (who/what/when/why).

### Project 4.3: Agent-Facing Ergonomics (P2)

- [x] Add richer vault summary APIs (campaign health, coverage gaps, stale notes).
- [x] Add task-focused MCP bundles (session prep, recap generation, continuity checks).
- [x] Add stable URI strategy for resources and discoverability metadata.
- [x] Add guidance docs/examples for agent prompts and safe operating patterns.
- [x] Add MCP inspector workflow docs tied to this repo’s architecture.

## Arc 5: Performance and Scale

### Project 5.1: Startup and Runtime Performance (P1)

- [x] Define hard budgets for cold start, route transition, search response, save latency.
- [x] Add telemetry for indexing time, search latency, and render cost per route.
- [x] Move heavy indexing/parsing work off main UI thread where possible.
- [ ] Add lazy loading boundaries for expensive components/routes.
- [ ] Add cache invalidation strategy for link graph/search index/object summaries.

### Project 5.2: Large Vault Handling (P1)

- [ ] Add progressive loading for note lists and folders.
- [ ] Add virtualized lists for large result sets.
- [ ] Add background indexing with progress + cancellation UX.
- [ ] Add adaptive debounce and batching strategies under heavy edit churn.
- [x] Add benchmark dataset and automated performance regression suite.

### Project 5.3: Memory and Resource Management (P2)

- [x] Add memory profiling for renderer and sidecar under long sessions.
- [ ] Add periodic cleanup of stale caches and detached graph/index artifacts.
- [ ] Add safeguards for oversized notes/assets (warnings, soft limits, chunking options).

## Arc 6: Accessibility, Inclusivity, and Cross-Device Experience

### Project 6.1: Accessibility Compliance Program (P0)

- [ ] Run full WCAG 2.1 AA audit and document gaps by route/component.
- [ ] Add automated accessibility tests (axe/Playwright) in CI for critical routes.
- [ ] Ensure full keyboard reachability for all major workflows.
- [ ] Improve focus management and route-change announcements.
- [ ] Add screen reader QA pass (NVDA + VoiceOver) and fix log.

### Project 6.2: Mobile and Tablet Optimization (P1)

- [ ] Finish mobile-first navigation polish (drawer, bottom actions, gesture predictability).
- [ ] Improve editor behavior with virtual keyboard (toolbar docking, cursor visibility).
- [ ] Add touch target audit and enforcement for all controls.
- [ ] Add offline-first UX indicators tuned for mobile usage contexts.
- [ ] Add responsive QA matrix and per-breakpoint acceptance criteria.

### Project 6.3: Internationalization and Localization Readiness (P3)

- [ ] Externalize user-facing strings for translation readiness.
- [ ] Add locale-aware date/time formatting abstraction.
- [ ] Add RTL layout compatibility pass for core UI primitives.

## Arc 7: Desktop Runtime and Distribution Hardening

### Project 7.1: Packaging and Runtime Independence (P0)

- [x] Bundle MCP runtime inside desktop release artifacts consistently.
- [x] Remove external Node binary dependency for sidecar in packaged app.
- [x] Add startup validations for missing/corrupt bundled runtime assets.
- [x] Add signed builds and installer hardening for target OSes.

### Project 7.2: Electron Security and IPC Hardening (P0)

- [ ] Audit and minimize preload IPC surface area.
- [ ] Add strict input validation on all IPC handlers.
- [ ] Add threat model doc for local vault + MCP attack surfaces.
- [ ] Add secure defaults for file dialogs, path handling, and external link opens.
- [ ] Add security regression tests for IPC contract boundaries.

### Project 7.3: Vault Lifecycle UX (P1)

- [x] Improve vault switching UX with explicit progress, rollback, and failure handling.
- [x] Add recent vault list with health indicators.
- [x] Add vault permission checks and clear remediation instructions.
- [x] Add startup vault selector when last vault is unavailable.

## Arc 8: Import/Export and Interoperability

### Project 8.1: Robust Import Pipelines (P1)

- [x] Add pre-import analyzer (duplicates, invalid frontmatter, link conflicts, file encoding issues).
- [x] Add interactive import mapping (folders, tags, frontmatter keys, overwrite policies).
- [x] Add resumable import flow for large vaults.
- [x] Add detailed import report with warnings and skipped items.
- [x] Add targeted import compatibility packs (Obsidian first-class, generic markdown fallback).

### Project 8.2: Export Quality and Portability (P1)

- [x] Add export profiles (raw markdown, portable bundle, archive with assets).
- [x] Add export validation pass (broken embeds, unresolved links, missing metadata).
- [x] Add deterministic export mode for version-control friendly outputs.
- [ ] Add “export changed since date” incremental package option.
- [x] Add restore-from-export verification workflow and tests.

### Project 8.3: External Tool Integrations (P3)

- [ ] Add optional plugin hooks for external compendiums/resources.
- [ ] Add documented extension points for custom importers/exporters.
- [ ] Add schema docs for third-party tooling ecosystem.

## Arc 9: Quality Engineering and Operational Excellence

### Project 9.1: Test Coverage Expansion (P0)

- [ ] Reach target coverage thresholds documented in `docs/TESTING.md` across critical modules.
- [ ] Add missing MCP domain tests (vault/search/objects/boards edge cases).
- [ ] Add integration tests for storage corruption/recovery scenarios.
- [ ] Add end-to-end tests for trash, restore, vault switch, and MCP pending changes workflow.
- [ ] Add flaky test detection and quarantine policy.

### Project 9.2: CI/CD and Release Confidence (P1)

- [x] Add CI matrix across major OS targets for desktop build validation.
- [x] Add artifact smoke tests for packaged app startup and vault open path.
- [x] Add automated changelog generation tied to conventional release categories.
- [-] Add release checklist automation (tests, build, docs sync, migration notes).

### Project 9.3: Developer Experience and Maintainability (P2)

- [ ] Add architecture decision records (ADRs) for major runtime/storage/MCP choices.
- [ ] Add stricter lint rules for boundary violations (renderer vs node/electron).
- [ ] Add code ownership map for core modules.
- [ ] Add “refactor budget” process to prevent architecture drift.
- [ ] Add local scripts for fixture vault generation and reproducible debugging.

## Arc 10: Product Strategy and User Feedback Loop

### Project 10.1: Feedback and UX Research (P1)

- [ ] Add in-app feedback capture (friction reports, feature requests, bug reports).
- [ ] Run structured user interviews for DMs and players with task-based scenarios.
- [ ] Track top session-time pain points and resolution status.
- [ ] Create UX benchmark tasks with quarterly scorecard.

### Project 10.2: Documentation and Learning Surface (P2)

- [ ] Create complete user docs (getting started, linking, templates, objects, MCP safety).
- [ ] Add quick-reference cheatsheets for keyboard shortcuts and session workflows.
- [ ] Add troubleshooting guides for vault issues, MCP runtime, and import failures.
- [ ] Add “what’s new” release notes inside app.

### Project 10.3: Strategic Expansion (P3)

- [ ] Define criteria for when cloud sync is reintroduced (post-stability gates).
- [ ] Explore collaboration model options (async share vs real-time co-edit).
- [ ] Define plugin architecture constraints before opening extension APIs.
- [ ] Evaluate campaign-system modularity beyond D&D baseline.

## Cross-Cutting Backlog Themes

### Security and Privacy

- [ ] Add privacy posture doc (what is stored, where, and why).
- [ ] Add optional at-rest encryption strategy exploration for vault metadata.
- [ ] Add secure redaction in diagnostics export.

### Design System Maturity

- [ ] Consolidate design tokens, spacing scale, and semantic color roles.
- [ ] Add component usage docs with accessibility annotations.
- [ ] Standardize empty/loading/error/success state patterns.

### Content Safety and Guardrails (MCP/AI)

- [ ] Add validation layers preventing unsafe destructive bulk operations.
- [ ] Add rollback suggestions on high-risk MCP actions.
- [ ] Add explainability metadata for AI-proposed edits.

## Suggested Execution Order (Pragmatic Sequencing)

1. P0 trust/stability: Arc 1, 4.1, 6.1, 7.1, 7.2, 9.1.
2. Core UX and performance: Arc 2, 5.1, 5.2, 7.3.
3. Knowledge depth and interoperability: Arc 3, Arc 8.
4. Operational maturity and feedback loops: Arc 9.2, 10.1, 10.2.
5. Strategic bets: P3 items after measurable stability and UX targets are met.

## Definition of Done for Any TODO Item

- [ ] Scope documented (problem, user value, constraints).
- [ ] Design/UX states defined (default/loading/error/empty/success).
- [ ] Tests added or updated at appropriate levels.
- [ ] Docs updated in `docs/` when behavior or architecture changes.
- [ ] Telemetry/logging added for critical flows.
- [ ] Accessibility and keyboard path validated.
- [ ] Performance impact measured against budgets.

# Master TODO

## P0: Trust, Safety, and Correctness

### 1. Atomic Filesystem Writes

- [ ] `TODO(APP)` Implement temp-file + fsync + rename write path for markdown and `.vault/*.json` files.
      Risk: quality and behavior drift if deferred.
      Context:
- Current implementation uses direct `writeFile` in `mcp/storage.ts`.
- Crash/power interruption can produce partial or corrupted files.
  Targets:
- `mcp/storage.ts`
- new helper module under `mcp/` for safe write primitives

### 2. Metadata Integrity and Repair

- [ ] `TODO(APP)` Add startup integrity scan for `.vault/index.json`, `session-boards.json`, `objects.json`, `mcp-changelog.json`.
      Risk: quality and behavior drift if deferred.
      Context:
- Current rebuild behavior is mostly "if empty then rebuild" and not full integrity validation.
  Targets:
- `mcp/storage.ts`
- settings UI diagnostic surface in `src/routes/settings/+page.svelte`

### 3. IPC Surface Hardening

- [ ] `TODO(APP)` Replace `dndtools:storage` dynamic method dispatch with explicit IPC handlers per operation.
      Risk: quality and behavior drift if deferred.
      Context:
- Current string-based dispatch increases attack surface and weakens compile-time guarantees.
  Targets:
- `electron/main.ts`
- `electron/preload.ts`
- `src/lib/platform/storage/electron-adapter.ts`

### 4. MCP Tool Test Coverage

- [x] `TODO(APP)` Add direct tests for every tool under `mcp/tools/**`.
      Risk: quality and behavior drift if deferred.
      Context:
- MCP tools now have contract and per-module coverage (`mcp/tools/all-tools.test.ts` plus domain tests).
  Targets:
- `mcp/tools/**/*.test.ts`

### 5. CI Quality Gates

- [x] `TODO(APP)` Add GitHub Actions workflows enforcing lint/typecheck/test/build/e2e.
      Risk: quality and behavior drift if deferred.
      Context:
- Quality matrix, desktop E2E, desktop build matrix, docs validation, commitlint, and release workflows are configured.
  Targets:
- `.github/workflows/ci.yml`
- `.github/workflows/e2e.yml`

## P1: Product Reliability and UX Quality

### 6. Staged MCP Workflow Regression Suite

- [ ] `TODO(APP)` Add tests for approve/reject/approve-all/reject-all + race conditions.
      Reason: backlog item tracked for planned implementation.
      Risk: quality and behavior drift if deferred.
      Targets:
- `mcp/staged-storage.test.ts`
- `src/lib/state/mcp-changes.svelte.ts` tests

### 7. Incremental Link Graph Updates

- [x] `TODO(APP)` Avoid full graph rebuild when a single note changes.
      Risk: quality and behavior drift if deferred.
      Context:
- Current patterns frequently rebuild from full note set.
  Targets:
- `src/lib/state/links.svelte.ts`
- `src/lib/domain/link-extractor.ts`

### 8. Import Validation and Conflict Preview

- [x] `TODO(APP)` Add pre-import validation report (duplicates, invalid frontmatter, path collisions).
      Reason: backlog item tracked for planned implementation.
      Risk: quality and behavior drift if deferred.
      Targets:
- `src/lib/domain/export.ts`
- `src/routes/settings/+page.svelte`

### 9. Export Portability Improvements

- [x] `TODO(APP)` Add markdown directory zip export profile in addition to JSON bundle.
      Risk: quality and behavior drift if deferred.
      Context:
- Portable and deterministic markdown zip profiles are now available in Settings import/export.
  Targets:
- `src/lib/domain/export.ts`

### 10. Accessibility Automation

- [ ] `TODO(APP)` Integrate accessibility checks into Playwright for key routes.
      Reason: backlog item tracked for planned implementation.
      Risk: quality and behavior drift if deferred.
      Targets:
- `tests/e2e/*`
- Playwright test utilities

## P2: Architecture and Governance

### 11. ADR Process

- [x] `TODO(APP)` Add architecture decision record template and baseline ADRs.
      Reason: backlog item tracked for planned implementation.
      Risk: quality and behavior drift if deferred.
      Targets:
- `docs/adr/000-template.md`
- `docs/adr/README.md`
- `docs/adr/001-electron-filesystem-ownership.md`
- `docs/adr/002-staged-mcp-write-model.md`
- `docs/adr/003-ipc-surface-strategy.md`
- `docs/adr/004-storage-adapter-boundary.md`
- `docs/adr/005-unified-markdown-pipeline.md`
- `docs/adr/006-multi-platform-approach-electron-capacitor.md`
- `docs/adr/007-cloud-backend-architecture-aws.md`
- `docs/adr/008-mcp-semantic-bundling-strategy.md`

### 12. Performance Budgets

- [x] `TODO(APP)` Define and track budgets for startup, search latency, and save latency.
      Reason: backlog item tracked for planned implementation.
      Risk: quality and behavior drift if deferred.
      Targets:
- `docs/ARCHITECTURE.md`
- instrumentation in renderer services/stores

### 13. Sidecar Runtime Independence

- [ ] `TODO(APP)` Remove dependency on external `node` binary in packaged desktop builds.
      Reason: backlog item tracked for planned implementation.
      Risk: quality and behavior drift if deferred.
      Targets:
- `electron/mcp-sidecar.ts`
- build/release pipeline

## Documentation Hygiene Tasks

- [ ] `TODO(APP)` keep docs synchronized whenever types/scripts/tool names change.
      Reason: backlog item tracked for planned implementation.
      Target: see the surrounding section and referenced files in this block.
      Risk: quality and behavior drift if deferred.
- [x] `TODO(APP)` add docs validation check in CI (at minimum, link/path checks + spellcheck optional).
      Reason: backlog item tracked for planned implementation.
      Target: see the surrounding section and referenced files in this block.
      Risk: quality and behavior drift if deferred.
