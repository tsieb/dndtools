# Initiative 21 — Codebase Realignment & Quality Audit

## Status: IN PROGRESS

**Outcome:** The entire application is structurally sound, performant within budget,
free of data exposure regressions, and maintainable at scale. No source file exceeds
500 lines. CI/CD enforces a tiered branch model with fast smoke gates on epic merges
and full quality gates on initiative-to-master merges. Every audit finding is paired
with a regression test. All project goals, standards, and metrics established by
initiatives I1–I20 are verified met. The audit framework and metric baselines persist
as repeatable infrastructure for future maintenance cycles.

**Why now:** Twenty initiatives of feature development have introduced gradual
structural decay. Route components have grown to thousands of lines. Bundle sizes and
test durations have increased without recent optimization work. CI/CD runs the full
test suite on every epic PR, slowing iteration without proportionally catching
regressions. Data exposure bugs and UX inconsistencies have crept in through uncaught
regression paths. The codebase needs a systematic, top-to-bottom audit before further
feature work compounds these problems.

**Repeatable framework:** This initiative establishes audit checklists, metric
baselines, and CI infrastructure that persist beyond this cycle. Future maintenance
passes can re-run the same audit structure against updated baselines to catch new
drift.

---

## Phase A — Infrastructure & Tooling Foundation

These epics establish the CI/CD model, developer tooling, and metric baselines that
all subsequent audit and fix work depends on. They must complete first.

---

## Epic 21.1 — CI/CD Pipeline Restructuring

**Goal:** Replace the flat branch-to-master model with a tiered initiative branch
strategy where epic PRs run smoke tests only and initiative-to-master PRs run the full
quality gate.

**Stories:**

- **S21.1.1 — Define and document the tiered branch model**
  Document the new branching strategy in `docs/development/GIT_WORKFLOW.md`:
  initiative branches (`initiative/<id>-<slug>`) are long-lived and branch from
  `master`. Epic branches (`story/<epic-id>-<slug>`) branch from their parent
  initiative branch and merge back via PR. Initiative branches merge to `master` via PR
  when all epics are complete. Include diagrams showing the branch topology, merge
  direction, and test tier at each boundary.

- **S21.1.2 — Create the smoke test suite**
  Define a `pnpm test:smoke` script that runs a fast subset of the quality gate:
  TypeScript type-check, critical unit tests (storage, session state, navigation),
  lint, and format-check. Target under 60 seconds total. Tag or configure the critical
  test subset explicitly so it is maintainable. Add a `pnpm test:smoke` entry to
  `package.json` and document the smoke test contract in `docs/development/TESTING.md`.

- **S21.1.3 — Restructure GitHub Actions for tiered gates**
  Refactor `.github/workflows/ci.yml` to detect target branch context. PRs targeting
  an `initiative/*` branch run only the smoke suite. PRs targeting `master` run the
  full quality matrix (lint, format, typecheck, unit tests, desktop E2E critical, desktop
  E2E accessibility, docs validation). Add a `ci-smoke.yml` workflow or conditional job
  logic as appropriate. Ensure the concurrency group strategy still cancels superseded
  runs within each tier.

- **S21.1.4 — Configure branch protection rules**
  Document the required branch protection configuration for both `master` and
  `initiative/*` branches. `master` requires the full quality gate status checks.
  Initiative branches require only the smoke status check. Include setup instructions
  for GitHub branch protection rules in `docs/development/GIT_WORKFLOW.md`.

- **S21.1.5 — Update PR templates and merge strategy**
  Create or update `.github/PULL_REQUEST_TEMPLATE.md` with sections appropriate to the
  tier: epic PRs get a lightweight checklist (smoke passes, story acceptance met),
  initiative PRs get a comprehensive checklist (full gate green, performance budgets
  met, no known regressions, docs updated). Update `CLAUDE.md` git workflow section to
  reflect the new model.

- **S21.1.6 — Validate the pipeline end-to-end**
  Create the `initiative/I21-realignment` branch from `master`. Create a test epic
  branch, push a trivial change, verify the smoke workflow triggers. Merge the epic PR,
  then verify the initiative-to-master PR triggers the full quality gate. Document any
  edge cases or gotchas discovered.

---

## Epic 21.2 — Build Scripts & Developer Tooling Audit

**Goal:** Every `pnpm` script has a clear purpose, is documented, runs efficiently,
and the script surface is optimized for both human developers and agentic workflows.

**Stories:**

- **S21.2.1 — Script inventory and redundancy audit**
  Catalog every script in `package.json`. Identify redundant, unused, or confusingly
  named scripts. Produce a cleanup plan: scripts to remove, rename, consolidate, or
  document. Pay special attention to the multiple `test:e2e:*` variants and
  `desktop:*` variants for clarity.

- **S21.2.2 — Consolidate and rename scripts**
  Execute the cleanup plan from S21.2.1. Remove dead scripts. Rename confusing scripts
  to follow a consistent `<domain>:<action>` convention. Ensure no existing CI
  workflow, hook, or documentation reference breaks.

- **S21.2.3 — Add composite agent workflow commands**
  Add high-level composite scripts optimized for agentic use: `pnpm audit:full` (runs
  all quality checks in sequence with structured output), `pnpm audit:quick` (smoke
  equivalent for local development), `pnpm metrics:capture` (captures all metric
  baselines to a standard output location). Each command should produce machine-parsable
  output suitable for agent consumption.

- **S21.2.4 — Optimize build pipeline sequencing**
  Profile the full `pnpm desktop:build` pipeline. Identify sequential steps that could
  run in parallel (e.g., SvelteKit build and MCP build are independent). Restructure
  build scripts to exploit parallelism where safe. Document expected build times in
  `docs/development/PERFORMANCE.md`.

- **S21.2.5 — Document all scripts**
  Add a `scripts` section to `docs/development/DEVELOPMENT.md` (or a dedicated
  `docs/development/SCRIPTS.md`) that lists every script with its purpose, expected
  runtime, and when to use it. Group by domain (dev, test, build, lint, metrics).

---

## Epic 21.3 — Metrics Baseline & Observability Infrastructure

**Goal:** Capture authoritative baselines for bundle size, build duration, test
duration, and runtime performance so all subsequent audit work can measure improvement
against a known starting point.

**Stories:**

- **S21.3.1 — Bundle size baseline**
  Run a production build and capture granular bundle analysis: total JS/CSS sizes
  (gzipped and uncompressed), per-route chunk sizes, largest dependencies by weight.
  Record results in `tests/perf/bundle-baseline.json` with a dated snapshot. Compare
  against the < 100KB gzipped initial JS target from project goals.

- **S21.3.2 — Build duration baseline**
  Time each build pipeline stage (`pnpm build`, `pnpm mcp:build`, `pnpm desktop:build`,
  full packaging) across 3 runs and record P50 durations in
  `tests/perf/build-baseline.json`. Identify the slowest stages.

- **S21.3.3 — Test duration baseline**
  Time each test suite (`pnpm test`, `pnpm test:e2e`, each `test:e2e:desktop:*`
  variant, `pnpm test:smoke`) across 3 runs and record P50 durations in
  `tests/perf/test-baseline.json`. Identify the slowest individual test files.

- **S21.3.4 — Runtime performance baseline**
  Run the existing performance test suite (`tests/e2e-desktop/performance.spec.ts`) and
  capture results against the 7 canonical performance budgets. Record current P50/P95
  values in `tests/perf/performance-baseline.json`. Flag any operations already
  exceeding regression thresholds.

- **S21.3.5 — Metric comparison tooling**
  Create or update `scripts/compare-baselines.ts` to compare current metrics against
  any baseline snapshot. Output a structured diff showing improvements, regressions,
  and budget compliance. Wire into `pnpm metrics:compare`. Ensure the tool can be run
  in CI to gate initiative-to-master merges on metric regression.

- **S21.3.6 — Metric reporting in CI**
  Add a CI job or step that runs `pnpm metrics:capture` on initiative-to-master PRs
  and posts a formatted metric comparison as a PR comment. Include bundle size delta,
  test duration delta, and performance budget compliance status.

---

## Phase B — High-Level Architecture Audit

These epics audit the application from the top down: project goals, architecture
decisions, module organization, and structural boundaries. Findings here inform the
scope and priority of subsequent phases.

---

## Epic 21.4 — Project Organization & Goal Alignment Audit

**Goal:** Verify the application's current state meets every standard, goal, and
contract established by completed initiatives I1–I20, and produce a prioritized
remediation backlog for any gaps.

**Stories:**

- **S21.4.1 — Project goal compliance matrix**
  Review every guiding principle in the initiatives README against current
  implementation. For each principle (data safety, speed targets, local-first,
  AI partnership, platform agnosticism, extensibility, engineering-as-product,
  observability, privacy/security, graceful degradation, two-user model), assess
  current compliance and document gaps.

- **S21.4.2 — Route structure vs IA contract audit**
  Compare every route in `src/routes/` against the Information Architecture contract in
  `docs/architecture/INFORMATION_ARCHITECTURE.md`. Verify canonical routes exist, legacy
  redirects still work, and no orphan routes have accumulated. Add a test for any
  missing route coverage.

- **S21.4.3 — File organization and module structure audit**
  Review the directory structure against `docs/reference/PROJECT_STRUCTURE.md`. Verify
  files are in their canonical locations, no modules have drifted to incorrect
  directories, and the structure supports the established domain boundaries. Update
  PROJECT_STRUCTURE.md for any legitimate changes.

- **S21.4.4 — Feature tier compliance audit**
  Verify the progressive disclosure system (`docs/reference/FEATURE_TIERS.md`) against
  current UI. Confirm Core features are always visible, Intermediate features unlock at
  correct maturity thresholds, and Advanced features require explicit opt-in. Test each
  tier boundary with a fresh vault.

- **S21.4.5 — Exit criteria verification for completed initiatives**
  Review the exit criteria and acceptance outcomes documented in each completed
  initiative (I1–I20). For each, verify the stated outcome still holds in the current
  codebase. Produce a gap list for any regressions. Each gap becomes a remediation
  story in subsequent epics.

- **S21.4.6 — Known gaps reconciliation**
  Review the "Current Known Gaps to Respect" section in `CLAUDE.md`. Verify each gap is
  still accurate. Close any gaps that have been resolved. Add any newly discovered gaps.
  Ensure no gap has silently worsened.

---

## Epic 21.5 — Module Boundary & Dependency Audit

**Goal:** Every import in the codebase respects the established runtime boundaries
(renderer/main/MCP), and no circular or inappropriate cross-domain dependencies exist.

**Stories:**

- **S21.5.1 — Renderer → storage boundary enforcement**
  Scan all files in `src/` for any direct IndexedDB, Dexie, filesystem, or Node API
  usage outside of `src/lib/platform/`. Verify all data access goes through the
  `StorageAdapter` interface. Add a lint rule or test to prevent future violations.

- **S21.5.2 — Electron → renderer isolation verification**
  Verify `electron/main.ts` and `electron/preload.ts` do not expose privileged APIs
  beyond the documented bridge surface. Verify no renderer code imports from
  `electron/`. Verify context isolation and sandbox are enabled. Add a test asserting
  the preload API surface matches the documented contract.

- **S21.5.3 — MCP → filesystem boundary verification**
  Verify all MCP tool handlers access vault data exclusively through
  `FileSystemAdapter` in `mcp/storage.ts`. No tool should perform direct `fs` reads or
  writes outside the storage abstraction. Add a grep-based lint check.

- **S21.5.4 — Circular dependency detection**
  Run a circular dependency analysis across `src/`, `electron/`, and `mcp/`. Document
  and resolve any cycles found. Add the repo-owned import-cycle checker to the lint
  pipeline to prevent future circular imports.

- **S21.5.5 — Dependency inventory and health check**
  Audit `package.json` dependencies. Identify unused dependencies (via `depcheck` or
  manual review), outdated dependencies with known vulnerabilities, and dependencies
  that could be replaced with lighter alternatives. Produce a cleanup plan.

- **S21.5.6 — Type export boundary verification**
  Verify that `src/lib/types/` exports only type-level contracts, not implementation
  details. Verify MCP and Electron type imports from the renderer are type-only. Check
  for any `import type` violations that leak runtime code across boundaries.

---

## Epic 21.6 — Architecture Decision & Standards Compliance Review

**Goal:** All 10 ADRs are current, no undocumented architectural decisions exist, and
the codebase conforms to every documented standard.

**Stories:**

- **S21.6.1 — ADR accuracy audit**
  Review each ADR (ADR-001 through ADR-010) against current implementation. For each
  ADR, verify the decision is still followed, the context is still accurate, and the
  alternatives rejected are still inappropriate. Flag any ADRs that need amendment.

- **S21.6.2 — Undocumented decision identification**
  Identify architectural decisions made during I13–I20 that lack formal ADRs: the UX
  refactor cluster's mode-state-machine pattern, the layout tier system, the theme
  preset architecture, the progressive disclosure framework, the tile type metadata
  system. Draft ADRs for any decisions significant enough to warrant one.

- **S21.6.3 — Coding standards compliance scan**
  Audit a representative sample of files (at least 30) against the coding standards in
  `CLAUDE.md`: strict typing (no `any`), single-purpose modules, explicit runtime
  boundary separation, test coverage for behavior changes. Produce a violations report
  and fix the most critical violations.

- **S21.6.4 — Design token compliance audit**
  Run `pnpm lint:tokens` and verify zero violations. Manually audit 10 representative
  component files for semantic token usage, checking that no raw color values, arbitrary
  font sizes, or structural `dark:` prefixes remain. Fix any violations found.

- **S21.6.5 — Navigation contract compliance audit**
  Run `pnpm lint:navigation` and verify zero violations. Review the three-layer
  navigation contract (`docs/architecture/NAVIGATION_CONTRACT.md`) against the current
  implementation. Verify global, local, and contextual navigation layers are correctly
  separated and labeled.

---

## Phase C — File Decomposition

These epics systematically break down every file exceeding the 500-line target. The
codebase currently has 58 files over 500 lines totaling ~58,000 lines — over half the
total codebase. Each decomposition must preserve all existing behavior and be paired
with a verification test confirming no regression.

---

## Epic 21.7 — Route Component Decomposition

**Goal:** Every `.svelte` route file is under 500 lines with extracted logic in
co-located modules, composable child components, or domain helpers.

**Stories:**

- **S21.7.1 — Maps page decomposition (5,353 lines)**
  Extract the maps route into composable pieces: mode state machine and transition
  logic into a dedicated `maps-mode.svelte.ts` state module, per-mode tool panels into
  child components (`MapPoiToolPanel.svelte`, `MapFogToolPanel.svelte`,
  `MapRouteToolPanel.svelte`, `MapGridToolPanel.svelte`, `MapLayerToolPanel.svelte`,
  `MapCombatToolPanel.svelte`), canvas event delegation into a bridge module, and
  keyboard handler registration into the maps-mode module. Target: route file ≤ 400
  lines, each extracted module ≤ 500 lines. Run desktop E2E critical + map-specific
  tests after extraction.

- **S21.7.2 — Session board page decomposition (2,638 lines)**
  Extract tile renderers into per-type child components (`NoteTileRenderer.svelte`,
  `CombatTileRenderer.svelte`, `TimerTileRenderer.svelte`, etc.), tile action menu into
  `TileActionMenu.svelte`, edit mode toolbar into `BoardEditToolbar.svelte`, and
  mission control integration into the existing `SessionMissionControl` import path.
  Target: route file ≤ 450 lines. Run session board E2E tests after extraction.

- **S21.7.3 — Map canvas viewer decomposition (2,271 lines)**
  Extract canvas rendering layers (POI overlay, fog layer, route layer, grid layer)
  into per-layer rendering functions or child components. Extract pointer/touch input
  handlers into a `canvas-input-handler.ts` module. Extract the bridge callback
  surface into a typed interface. Target: viewer file ≤ 500 lines.

- **S21.7.4 — Vault settings tab decomposition (1,680 lines)**
  Extract migration readiness screen into `MigrationReadinessScreen.svelte` (if not
  already extracted), repair flow into `VaultRepairFlow.svelte`, backup/restore UI into
  `VaultBackupRestore.svelte`, and vault selection into `VaultSelector.svelte`. Target:
  tab file ≤ 400 lines.

- **S21.7.5 — Combat tracker tile decomposition (1,589 lines)**
  Extract HP adjustment controls into `CombatHpControls.svelte`, condition management
  into `CombatConditionPanel.svelte`, stat block reference into
  `CombatStatReference.svelte`, and initiative list rendering into
  `CombatInitiativeList.svelte`. Target: tile file ≤ 400 lines.

- **S21.7.6 — Search page decomposition (1,420 lines)**
  Extract scope controls into `SearchScopeSelector.svelte`, result rendering into
  `SearchResultList.svelte` (with per-result-type sub-components), and facet/filter
  logic into a `search-page-state.svelte.ts` module. Target: route file ≤ 400 lines.

- **S21.7.7 — Root layout decomposition (1,282 lines)**
  Extract keyboard shortcut handling into a `layout-keyboard.ts` module, sync/status
  notification logic into `layout-notifications.ts`, route transition and focus
  management into `layout-navigation.ts`, and session persistence hooks into
  `layout-session-hooks.ts`. Target: layout file ≤ 450 lines.

- **S21.7.8 — Combat page decomposition (1,048 lines)**
  Extract initiative order list into `CombatInitiativeOrder.svelte`, detail panel
  content into `CombatDetailPanel.svelte`, and action handler logic into a
  `combat-page-actions.ts` module. Target: route file ≤ 400 lines.

- **S21.7.9 — Object structured editor decomposition (1,063 lines)**
  Extract per-field-type renderers into a `field-renderers/` directory, validation
  display into `ObjectValidationSummary.svelte`, and linked note picker into
  `LinkedNotePicker.svelte`. Target: editor file ≤ 400 lines.

- **S21.7.10 — Remaining oversized route/UI components**
  Decompose any remaining `.svelte` files over 500 lines: `SessionMissionControl`
  (870), `ObjectEmbedMenu` (860), `QuickSwitcher` (847), `McpSettingsTab` (763),
  `AppShell` (669), `EncounterBuilderTile` (622). Apply the same pattern: extract
  child components, co-located state modules, and event handler modules. Target: all
  files ≤ 500 lines.

---

## Epic 21.8 — Domain Logic Decomposition

**Goal:** Every TypeScript domain logic file is under 500 lines with clear
single-responsibility modules.

**Stories:**

- **S21.8.1 — MCP storage decomposition (3,185 lines)**
  Split `mcp/storage.ts` into domain-scoped modules: `mcp/storage/note-operations.ts`
  (CRUD, content read/write), `mcp/storage/index-operations.ts` (index rebuild,
  incremental update), `mcp/storage/object-operations.ts` (object CRUD, type handling),
  `mcp/storage/board-operations.ts` (session board persistence),
  `mcp/storage/settings-operations.ts` (vault settings, feature settings),
  `mcp/storage/core.ts` (vault init, path resolution, atomic write primitives). Re-export
  the unified `FileSystemAdapter` interface from `mcp/storage/index.ts`. Target: each
  module ≤ 450 lines. Run full MCP test suite after extraction.

- **S21.8.2 — Combat tracker domain decomposition (1,199 lines)**
  Split `src/lib/domain/combat-tracker.ts` into: `combat-initiative.ts` (sorting,
  ordering), `combat-hp.ts` (damage, heal, temp HP, undo snapshots),
  `combat-conditions.ts` (condition CRUD, duration tracking, expiry),
  `combat-turns.ts` (turn advancement, round management). Re-export from
  `combat-tracker/index.ts`. Target: each module ≤ 400 lines.

- **S21.8.3 — Random tables domain decomposition (994 lines)**
  Split into: `random-tables/parser.ts` (table parsing from markdown),
  `random-tables/roller.ts` (roll evaluation, weighted selection),
  `random-tables/context.ts` (vault context injection, variable substitution).
  Target: each module ≤ 400 lines.

- **S21.8.4 — Templates domain decomposition (921 lines)**
  Split into: `templates/loader.ts` (template discovery, file reading),
  `templates/variables.ts` (variable resolution, substitution engine),
  `templates/creation.ts` (note creation workflow, frontmatter injection).
  Target: each module ≤ 400 lines.

- **S21.8.5 — Objects domain decomposition (877 lines)**
  Split into: `objects/type-handlers.ts` (per-type validation, normalization),
  `objects/relationships.ts` (object linking, reference tracking),
  `objects/rendering.ts` (display helpers, stat block formatting).
  Target: each module ≤ 400 lines.

- **S21.8.6 — Encounter builder decomposition (839 lines)**
  Split into: `encounter-builder/cr-math.ts` (CR calculations, XP budgets),
  `encounter-builder/composition.ts` (combatant selection, group building),
  `encounter-builder/difficulty.ts` (difficulty assessment, party scaling).
  Target: each module ≤ 350 lines.

- **S21.8.7 — Search domain decomposition (826 lines)**
  Split into: `search/index-manager.ts` (MiniSearch lifecycle, incremental update),
  `search/query-executor.ts` (query parsing, execution, filtering),
  `search/result-ranking.ts` (scoring, boost logic, deduplication).
  Target: each module ≤ 350 lines.

- **S21.8.8 — Remaining oversized domain files**
  Decompose any remaining `.ts` domain files over 500 lines: `session-board.ts` (796),
  `session-boards.svelte.ts` (778), `rehype-object-embeds.ts` (722),
  `object-validation.ts` (647), `staged-storage.ts` (642). Apply the same
  single-responsibility extraction pattern. Target: all files ≤ 500 lines.

---

## Epic 21.9 — Infrastructure & Backend Decomposition

**Goal:** Every Electron, MCP infrastructure, and build-tooling file is under 500
lines with clear domain separation.

**Stories:**

- **S21.9.1 — Electron main decomposition (2,226 lines)**
  Split `electron/main.ts` into: `electron/window-lifecycle.ts` (BrowserWindow
  creation, focus, close), `electron/ipc-handlers.ts` (all IPC handler registrations),
  `electron/vault-watcher.ts` (chokidar file watching, sync emission),
  `electron/sidecar-manager.ts` (MCP sidecar spawn, restart, cleanup),
  `electron/app-menu.ts` (application menu template, accelerators),
  `electron/auto-updater.ts` (update check, download, install flow),
  `electron/main.ts` (orchestration: app ready, single-instance, protocol handling).
  Target: each module ≤ 400 lines. Run desktop E2E smoke after extraction.

- **S21.9.2 — IPC schemas decomposition (1,025 lines)**
  Split `electron/ipc-schemas.ts` into per-domain schema files:
  `ipc-schemas/storage.ts`, `ipc-schemas/desktop.ts`, `ipc-schemas/settings.ts`,
  `ipc-schemas/diagnostics.ts`. Re-export from `ipc-schemas/index.ts`. Update all
  import sites. Target: each module ≤ 350 lines. Run IPC security tests.

- **S21.9.3 — Import/export service decomposition (963 lines)**
  Split `electron/import-export-service.ts` into: `import-export/obsidian-import.ts`,
  `import-export/zip-export.ts`, `import-export/conflict-detection.ts`,
  `import-export/progress-reporting.ts`. Target: each module ≤ 350 lines.

- **S21.9.4 — MCP contracts decomposition (1,187 lines)**
  Split `mcp/tools/shared/contracts.ts` into: `contracts/registration.ts` (tool
  registration framework), `contracts/permissions.ts` (permission checking, staged
  review), `contracts/idempotency.ts` (idempotency key management),
  `contracts/retry.ts` (retry logic, backoff), `contracts/errors.ts` (error taxonomy,
  structured error responses). Target: each module ≤ 350 lines.

- **S21.9.5 — Desktop bridge decomposition (718 lines)**
  Split `src/lib/platform/desktop/bridge.ts` into: `bridge/storage-bridge.ts`,
  `bridge/settings-bridge.ts`, `bridge/desktop-bridge.ts`, `bridge/event-bridge.ts`.
  Target: each module ≤ 300 lines.

- **S21.9.6 — Storage adapter decomposition (885 + 807 lines)**
  Review `indexeddb-adapter.ts` (885 lines) and `capacitor-adapter.ts` (807 lines) for
  shared patterns that can be extracted into a `storage/shared-adapter-logic.ts` base
  module. Extract settings handling, board operations, and object operations into
  focused helper modules. Target: each adapter ≤ 500 lines.

---

## Epic 21.10 — Test File Decomposition

**Goal:** Every test file is under 500 lines with clear test grouping and fast
individual execution.

**Stories:**

- **S21.10.1 — MCP storage test decomposition (1,125 lines)**
  Split `mcp/storage.test.ts` into per-domain test files matching the storage
  decomposition: `note-operations.test.ts`, `index-operations.test.ts`,
  `object-operations.test.ts`, `board-operations.test.ts`. Share test fixtures via
  a `storage/__fixtures__/` directory.

- **S21.10.2 — Desktop E2E test decomposition**
  Split `critical-workflows.spec.ts` (906 lines), `interactive-controls.spec.ts` (752
  lines), and `accessibility.spec.ts` by workflow domain. Create focused spec files:
  `note-workflows.spec.ts`, `session-workflows.spec.ts`, `map-workflows.spec.ts`,
  `combat-workflows.spec.ts`, `drag-resize.spec.ts`, `tooltip-a11y.spec.ts`, etc.
  Target: each spec file ≤ 500 lines.

- **S21.10.3 — IPC security test decomposition (872 lines)**
  Split `electron/ipc-security.test.ts` into per-domain security test files matching
  the IPC schema decomposition. Share security test helpers via a shared fixture.

- **S21.10.4 — MCP all-tools test review (704 lines)**
  Review `mcp/tools/all-tools.test.ts` contract tests. Determine which tests should
  remain as contract-level smoke tests and which should move to per-tool dedicated test
  files. Split accordingly. Target: contract file ≤ 400 lines.

---

## Phase D — Performance Recovery

These epics address the performance regressions that have accumulated: bundle bloat,
slow runtime operations, and long test execution times. Each fix uses the baselines
captured in Epic 21.3 as the measurement reference.

---

## Epic 21.11 — Bundle & Build Performance Recovery

**Goal:** Production bundle sizes meet or beat the < 100KB gzipped initial JS target,
and build pipeline runs at least 20% faster than the Phase A baseline.

**Stories:**

- **S21.11.1 — Bundle composition analysis**
  Run `vite-bundle-visualizer` or equivalent on the production build. Identify the top
  10 largest chunks by gzipped size. Map each chunk to its source modules. Identify
  modules that should be lazy-loaded but are in the critical path.

- **S21.11.2 — Tree-shaking verification**
  Audit imports for barrel-file re-exports and side-effect imports that prevent tree
  shaking. Check `@lucide/svelte` imports (tree-shakeable?), `unified`/`remark`/`rehype`
  pipeline imports, `dexie` imports, `codemirror` imports. Fix any imports that pull in
  unnecessary code.

- **S21.11.3 — Code splitting boundary audit**
  Verify lazy-loading boundaries: CodeMirror editor, graph visualization, map canvas,
  encounter builder, import/export flows. Add dynamic imports for any heavy modules
  currently in the critical bundle. Verify SvelteKit route-based code splitting is
  working correctly.

- **S21.11.4 — Dependency weight reduction**
  For each of the heaviest dependencies identified in S21.11.1, evaluate: can it be
  replaced with a lighter alternative? Can it be loaded lazily? Can a subset be imported
  instead of the full package? Execute the highest-impact reductions.

- **S21.11.5 — Asset optimization**
  Audit static assets (images, fonts, SVGs, dice face icons) for size. Compress images,
  subset fonts to used glyphs, optimize SVG markup. Verify PWA caching strategies are
  appropriate for asset types.

- **S21.11.6 — Build pipeline parallelization**
  Implement the parallel build opportunities identified in S21.2.4. Verify SvelteKit
  build and MCP build run concurrently. Measure the new build duration against the
  Phase A baseline. Target: ≥ 20% improvement.

- **S21.11.7 — Production build verification**
  Run a full production build and compare all bundle metrics against the Phase A
  baseline. Verify the < 100KB gzipped initial JS target is met. Update the baseline
  snapshot. Add a CI check that fails if the initial JS bundle exceeds the target.

---

## Epic 21.12 — Runtime Performance Recovery

**Goal:** All 7 canonical performance budgets are met, with P95 values within
regression thresholds.

**Stories:**

- **S21.12.1 — Cold start profiling and optimization**
  Profile the renderer bootstrap sequence with Chrome DevTools Performance panel.
  Identify the longest tasks on the critical path. Optimize: defer non-critical
  initialization, reduce synchronous import chains, parallelize independent setup steps.
  Target: cold start ≤ 3000ms P95.

- **S21.12.2 — Note rendering performance**
  Profile the markdown pipeline for rendering a complex note (10KB+ with wikilinks,
  embeds, tables, callouts, images). Identify slow remark/rehype plugins. Optimize or
  memoize expensive transforms. Target: note open ≤ 200ms P95.

- **S21.12.3 — Search performance at scale**
  Profile MiniSearch query execution with a 5,000-note fixture vault. Identify if index
  size, tokenization, or result ranking is the bottleneck. Optimize the slowest path.
  Target: search response ≤ 150ms P95.

- **S21.12.4 — Graph rendering performance**
  Profile the knowledge graph for a vault with 1,000+ links. Identify if D3 force
  simulation, SVG rendering, or data preparation is the bottleneck. Apply targeted
  optimization (canvas rendering, viewport culling, incremental layout).
  Target: graph rebuild ≤ 50ms P95.

- **S21.12.5 — Map canvas performance**
  Profile the map canvas viewer with a complex map (50+ POIs, fog, routes, multiple
  layers). Identify rendering bottlenecks. Optimize canvas draw calls, reduce
  unnecessary repaints, implement viewport culling for off-screen elements.

- **S21.12.6 — Memory usage optimization**
  Run the memory profiling suite. Identify the top memory consumers and any growth
  patterns suggesting leaks. Focus on: event listener accumulation across route
  transitions, reactive store subscription cleanup, large object retention in closures.
  Target: heap growth < 20MB over the standard interaction script.

- **S21.12.7 — IPC round-trip optimization**
  Profile Electron IPC latency for the most frequent operations (note read, note save,
  settings update). Identify serialization overhead or unnecessary round trips. Batch
  operations where possible. Target: note save ≤ 100ms P95.

- **S21.12.8 — Performance regression test update**
  Update `tests/e2e-desktop/performance.spec.ts` with any new performance-critical
  paths identified during this epic. Update the baseline file with post-optimization
  values. Verify all 7 budgets pass in CI.

---

## Epic 21.13 — Test Suite Performance Optimization

**Goal:** The full test suite (unit + integration) runs in under 30 seconds locally,
the smoke suite runs in under 60 seconds, and desktop E2E critical runs in under 3
minutes.

**Stories:**

- **S21.13.1 — Slow unit test identification and optimization**
  Profile unit test execution. Identify tests taking > 500ms. Common causes: excessive
  fixture setup, real timers instead of fake timers, unnecessary async waits, large
  test data. Fix the top 10 slowest tests.

- **S21.13.2 — Test parallelization configuration**
  Review Vitest parallel execution configuration. Ensure tests across files run in
  parallel. Identify any tests with shared global state that force sequential execution
  and refactor them to be isolated.

- **S21.13.3 — E2E test wait optimization**
  Review desktop E2E tests for excessive `waitForTimeout` calls or unnecessary
  `waitForSelector` chains. Replace timing-based waits with event-based waits where
  possible. Reduce test setup overhead by sharing app state across related tests within
  a describe block.

- **S21.13.4 — Test fixture optimization**
  Review test fixture setup/teardown. Identify fixtures that recreate expensive state
  unnecessarily. Implement fixture caching or shared setup where safe. Ensure fixture
  cleanup is fast and complete.

- **S21.13.5 — CI pipeline timing optimization**
  Profile each CI job duration. Identify the longest jobs and their bottleneck steps.
  Optimize: cache more aggressively (node_modules, Playwright browsers, build output),
  skip unnecessary setup steps, parallelize independent jobs.

---

## Phase E — Domain Deep Audits

These epics perform implementation-level audits of every domain area. Each audit
reviews code quality, correctness, error handling, edge cases, and test coverage.
Every finding is paired with a fix and a regression test.

---

## Epic 21.14 — Storage & Data Layer Deep Audit

**Goal:** Every storage adapter implements the `StorageAdapter` contract identically,
all data paths are tested for edge cases, and no data corruption or loss scenarios
exist.

**Stories:**

- **S21.14.1 — StorageAdapter contract compliance test**
  Create a shared test suite that runs against every `StorageAdapter` implementation
  (IndexedDB, Capacitor, Electron filesystem via MCP). Each test verifies identical
  behavior for: note CRUD, object CRUD, board CRUD, settings read/write, search index
  operations, concurrent access patterns. Flag any behavioral divergence.

- **S21.14.2 — Atomic write safety verification**
  Review `mcp/safe-write.ts` and all write paths through storage adapters. Verify the
  temp-file + fsync + rename pattern is used consistently. Test simulated crash
  scenarios (process kill mid-write) for each file category. Verify write-journal
  recovery works at startup.

- **S21.14.3 — Migration path integrity testing**
  For each schema version in `mcp/migrations.ts`, verify: upgrade path works from every
  prior version, dry-run produces accurate preview, checkpoint is created before
  migration, rollback restores prior state completely. Add fixture vaults for any
  missing version transitions.

- **S21.14.4 — IndexedDB adapter edge case audit**
  Review `indexeddb-adapter.ts` for: transaction scope correctness, quota exceeded
  handling, concurrent tab access, browser storage eviction behavior, large note
  handling (> 1MB), special characters in note titles/paths. Add tests for each edge
  case.

- **S21.14.5 — Vault state consistency verification**
  Create a test that performs a series of mixed operations (create, update, delete,
  rename notes and objects) and verifies that `index.json`, the search index, the link
  graph, the changelog, and the filesystem all remain consistent. Run this test with
  concurrent operations to detect race conditions.

- **S21.14.6 — Data exposure regression audit**
  Systematically verify that DM-private content is never exposed in player mode: check
  search results, graph view, backlinks, session board tiles, combat tracker, detail
  panel, breadcrumbs, and the command palette. Add player-mode E2E tests for each
  surface. This directly addresses the user-reported data exposure regression.

---

## Epic 21.15 — MCP Server & Tool Deep Audit

**Goal:** Every MCP tool validates inputs completely, handles errors gracefully,
returns correct responses, and has dedicated test coverage beyond contract-level smoke
tests.

**Stories:**

- **S21.15.1 — Tool registration completeness audit**
  Compare the tool list in `mcp/tools/index.ts` against all tool files in
  `mcp/tools/*/`. Verify every tool file is registered. Verify tool schemas match their
  implementation signatures. Verify tool descriptions are accurate and complete.

- **S21.15.2 — Input validation audit (vault tools)**
  Review every tool in `mcp/tools/vault/` for input validation: required fields,
  type checking, path traversal prevention, size limits, encoding handling. Add
  validation tests for each tool using invalid, boundary, and adversarial inputs.

- **S21.15.3 — Input validation audit (notes tools)**
  Same as S21.15.2 for `mcp/tools/notes/`. Focus on: frontmatter injection, markdown
  content validation, wikilink syntax handling, filename sanitization.

- **S21.15.4 — Input validation audit (objects, boards, search tools)**
  Same as S21.15.2 for `mcp/tools/objects/`, `mcp/tools/boards/`, and
  `mcp/tools/search/`. Focus on: object type validation, board tile schema validation,
  search query injection.

- **S21.15.5 — Staged review workflow end-to-end audit**
  Trace the complete staged write lifecycle: tool writes to staged storage → change
  appears in MCP settings tab → user previews diff → user approves/rejects → change
  applies or rolls back. Verify no stale state, no partial applies, no lost changes.
  Add E2E test coverage.

- **S21.15.6 — Error handling and edge case audit**
  Review all tool handlers for error paths: what happens when the vault is locked, when
  a note doesn't exist, when the disk is full, when the index is corrupted, when
  concurrent writes conflict. Verify each error returns a structured MCP error response
  with appropriate codes.

- **S21.15.7 — MCP bundle call performance audit**
  Profile the vault intelligence bundle calls
  (`get_session_prep_bundle`, `get_continuity_check_bundle`, `get_recap_generation_bundle`).
  Verify each completes within the 800ms budget. Identify and optimize any slow
  aggregation queries. Update performance tests.

- **S21.15.8 — Tool test coverage completion**
  For every tool that currently relies only on `all-tools.test.ts` contract tests, add
  a dedicated test file with: success case, validation failure case, not-found case,
  concurrent access case. Target: 100% of write-capable tools have dedicated tests.

---

## Epic 21.16 — Renderer Core Deep Audit

**Goal:** Every renderer state store, the markdown pipeline, the navigation system,
and the bootstrap sequence are correct, performant, and leak-free.

**Stories:**

- **S21.16.1 — State store audit**
  Review every `.svelte.ts` state file in `src/lib/state/`. For each store verify:
  rune usage is correct (no stale closures), cleanup happens on destroy, no memory
  leaks from subscriptions, initialization is idempotent, and concurrent access is
  safe. Add tests for any stores lacking coverage.

- **S21.16.2 — Markdown pipeline correctness audit**
  Review every plugin in `src/lib/markdown/plugins/`. For each plugin verify: correct
  AST transformation, no XSS injection possible, correct handling of edge-case markdown
  (nested structures, malformed input, very large documents). Run the pipeline against
  a comprehensive test corpus including adversarial inputs.

- **S21.16.3 — Navigation and routing audit**
  Trace every navigation path: primary nav, local nav, breadcrumbs, command palette,
  wikilinks, cross-section links, back/forward, deep links. Verify: correct route
  resolution, correct breadcrumb rendering, correct focus management, correct history
  state. Add E2E coverage for any untested paths.

- **S21.16.4 — Bootstrap sequence audit**
  Profile and trace the renderer bootstrap sequence in `src/lib/runtime/bootstrap.ts`.
  Verify: initialization order respects dependencies, parallel steps are truly
  independent, error in any step is handled gracefully, slow network/storage doesn't
  block the UI, second bootstrap call is idempotent.

- **S21.16.5 — Event listener and subscription leak audit**
  Instrument the application to track event listener registration and removal across
  route transitions. Navigate through every route 3 times and verify listener count
  returns to baseline. Focus on: window-level listeners, resize observers,
  intersection observers, MutationObservers, store subscriptions.

- **S21.16.6 — Reactive update cascade audit**
  Identify chains of reactive updates where changing one state value triggers a cascade
  of intermediate updates before reaching the final state. Each cascade is a
  performance risk and potential source of UI flicker. Refactor the top 5 worst
  cascades to use derived state or batched updates.

---

## Epic 21.17 — UI Component & Design System Deep Audit

**Goal:** Every shared UI component has a consistent API, renders correctly in all
themes and layout tiers, and meets accessibility requirements.

**Stories:**

- **S21.17.1 — Component API consistency audit**
  Review props, events, and slots for every component in `src/lib/ui/common/`. Verify
  consistent naming conventions (e.g., `variant` vs `type` vs `kind`), consistent
  event naming, consistent slot naming. Fix inconsistencies.

- **S21.17.2 — Theme rendering audit**
  Visually audit every shared component in all 5 theme modes (Parchment, Tavern,
  Scholar, Dungeon, High Contrast). Verify: text is legible, borders are visible,
  focus rings are distinguishable, interactive states (hover, active, disabled) are
  visually distinct. Fix any rendering issues.

- **S21.17.3 — Layout tier responsiveness audit**
  Test every shared component at compact (< 640px), medium (640–1099px), and expanded
  (≥ 1100px) widths. Verify: no overflow, no clipping, touch targets ≥ 44px in
  compact, text remains readable, interactive elements remain operable.

- **S21.17.4 — Form component validation audit**
  Review every form component (`Input`, `Textarea`, `Select`, `Checkbox`, `Toggle`,
  `TagInput`). Verify: error state rendering, required field indication, label
  association (`for`/`id` pairing), disabled state behavior, keyboard operability.

- **S21.17.5 — Overlay and dialog audit**
  Review `Dialog`, `Modal`, `Sheet`, `Popover`, `Tooltip`. Verify: focus trap
  containment, Escape dismissal, outside-click dismissal (where appropriate), z-index
  stacking order, scroll lock on body, focus return to trigger on close. Test with
  nested overlays.

- **S21.17.6 — Toast and notification audit**
  Review the `Toast` system. Verify: correct ARIA roles (alert vs status), auto-dismiss
  timing, manual dismiss, stacking behavior, screen reader announcement, no lost
  toasts during route transitions.

- **S21.17.7 — Icon system audit**
  Verify every icon registered in `ICON_MAP` is actually used. Remove unused icons.
  Verify all interactive icons have appropriate accessible labels. Verify icon sizing
  consistency across contexts.

---

## Epic 21.18 — Session System Deep Audit

**Goal:** The session lifecycle (idle → active → end), combat tracker, dice system,
mission control, and prep/recap workflows are correct, persistent, and robust.

**Stories:**

- **S21.18.1 — Session state machine audit**
  Trace every state transition in the session lifecycle: idle → board selection →
  active session → scene changes → combat activation → session end → recap capture.
  Verify each transition persists correctly, the UI updates correctly, and no invalid
  states are reachable. Add state transition tests.

- **S21.18.2 — Session board persistence audit**
  Verify board state persists correctly across: page reload, route navigation, session
  start/stop, vault switch. Verify tile state (size, position, depth, content) survives
  all persistence paths. Verify scene switching preserves per-scene tile layouts.

- **S21.18.3 — Combat tracker correctness audit**
  Verify: initiative sorting handles ties deterministically, HP math is correct for all
  edge cases (0 HP, negative damage, temp HP interactions, overkill), condition
  duration decrement happens exactly once per round boundary, undo restores exact prior
  state. Add edge-case tests for each.

- **S21.18.4 — Dice system correctness audit**
  Verify: all dice expressions parse correctly (NdM, NdM+K, NdMkH/kL, advantage/
  disadvantage), roll history persists in session state, inline roll buttons trigger
  correctly from rendered markdown, session dice bar reflects active state. Test with
  adversarial expressions.

- **S21.18.5 — Rollable tables audit**
  Verify: table discovery finds all valid markdown tables, parser handles edge cases
  (empty rows, merged cells, special characters), roller produces statistically correct
  distribution, pinned tables persist across sessions. Add distribution tests.

- **S21.18.6 — Mission control and handout delivery audit**
  Verify: scene timeline reflects correct state, handout delivery creates correct
  history entries, player preview shows exactly what players see, quick actions trigger
  correct effects. Test with concurrent session operations.

- **S21.18.7 — Prep and recap workflow audit**
  Verify: prep bundle hydration shows correct data from MCP, session log note creation
  writes valid markdown, continuity follow-up actions create correct notes, end-session
  dialog captures all fields. Test the full end-to-end flow.

---

## Epic 21.19 — Maps & Atlas Deep Audit

**Goal:** The map viewer mode state machine, canvas rendering, POI system, fog
painting, route editing, and layer management are correct and performant.

**Stories:**

- **S21.19.1 — Mode state machine audit**
  Verify every mode transition in `MapViewerMode`: view ↔ poi_edit ↔ fog_paint ↔
  route_edit ↔ grid_align ↔ combat ↔ layer_manage. Verify: transition confirmation
  dialog fires for in-progress work, Escape exits to view, keyboard shortcuts trigger
  correct transitions, no invalid mode combinations exist. Add state transition tests.

- **S21.19.2 — POI lifecycle audit**
  Trace POI through its full lifecycle: placement (click/touch, grid snap) → display
  (pin, popover, detail panel) → edit (label, category, layer, note link) → move →
  delete → undo. Verify each step for correctness and persistence.

- **S21.19.3 — Fog painting audit**
  Verify each fog brush type (circle, rectangle, polygon, lasso) renders correctly,
  draft previews match final result, undo restores exact prior fog state, "clear all
  fog" confirmation prevents accidental data loss, fog state persists correctly.

- **S21.19.4 — Route editing audit**
  Verify: waypoint placement, drag-to-move, per-waypoint delete, route finalization,
  distance calculation, route selection, undo/redo. Test with routes that cross layer
  boundaries and routes with many waypoints (50+).

- **S21.19.5 — Layer management audit**
  Verify: layer CRUD, visibility toggle, player visibility toggle, ordering
  (move up/down), inline rename, duplicate, delete with POI reassignment. Test with
  many layers (10+) and cross-layer POI operations.

- **S21.19.6 — Touch and accessibility audit**
  Verify: pinch zoom bounds, pan inertia, tap-to-stop, double-tap zoom, long-press
  context menu, keyboard POI navigation (arrows, Home/End, Enter, Delete), screen
  reader announcements, list view toggle.

- **S21.19.7 — Map library and thumbnail audit**
  Verify: gallery renders thumbnails correctly, metadata chips (POI/layer counts) are
  accurate, filter produces correct results, empty state renders correctly, keyboard
  navigation works in the card grid.

---

## Epic 21.20 — Electron Shell Deep Audit

**Goal:** Every IPC handler, window lifecycle event, sidecar operation, and platform
integration is correct, validated, and tested.

**Stories:**

- **S21.20.1 — IPC handler audit**
  Review every IPC handler registered in `electron/main.ts` (post-decomposition). For
  each handler verify: Zod schema validation via `parseIpcArg()` (fix the known
  `clear-changelog` gap), error response for invalid input, correct return type,
  no unhandled promise rejections. Add security tests for any uncovered handlers.

- **S21.20.2 — Window lifecycle audit**
  Verify: window creation respects saved bounds, focus handling on multi-window,
  close cleanup (watcher stop, sidecar kill, state save), minimize/restore state,
  fullscreen/zen mode transitions. Test on macOS behavior model (close ≠ quit).

- **S21.20.3 — Sidecar management audit**
  Verify: MCP sidecar starts on vault open, restarts on crash, stops on vault close,
  handles port conflicts, logs errors, and timeout on unresponsive start. Test with:
  sidecar crash simulation, rapid vault switch, sidecar already running from prior
  instance.

- **S21.20.4 — File watcher audit**
  Verify: chokidar detects all markdown file changes, batching window prevents
  excessive updates, file create/delete/rename are handled correctly, watcher ignores
  `.vault/` internal files, watcher stops cleanly on vault close.

- **S21.20.5 — Auto-update flow audit**
  Verify: update check on app start, download progress reporting, install-on-quit
  behavior, rollback on corrupted download, user notification for available updates.
  Test with mock update server.

- **S21.20.6 — Protocol and file association audit**
  Verify: `dndtools://` protocol opens correct vault/note, `.md` file association opens
  in correct vault context, second-instance forwards arguments correctly,
  single-instance lock works. Test on Windows platform.

- **S21.20.7 — Native menu and context menu audit**
  Verify: application menu accelerators trigger correct renderer commands, context
  menus appear for folder tree and note cards, menu actions execute correctly, keyboard
  equivalents are documented in the shortcuts overlay.

---

## Phase F — Cross-Cutting Concerns

These epics audit concerns that span all domains: security, accessibility, and UX
consistency. They build on the domain audits to catch issues that only appear at
integration boundaries.

---

## Epic 21.21 — Security Audit & Hardening

**Goal:** Every input boundary validates, every output boundary sanitizes, no known
vulnerabilities exist in dependencies, and the security threat model is current.

**Stories:**

- **S21.21.1 — IPC validation completeness**
  Verify every IPC channel in `electron/ipc-schemas.ts` has a corresponding
  `parseIpcArg()` call in its handler. Fix the known `clear-changelog` gap. Add a test
  that enumerates all registered channels and asserts each has validation. This test
  prevents future handlers from skipping validation.

- **S21.21.2 — Markdown sanitization audit**
  Review the rehype sanitization schema in the markdown pipeline. Test with OWASP XSS
  cheat sheet payloads embedded in note content: script injection, event handler
  injection, CSS injection, data URI injection. Verify all payloads are sanitized.
  Add a dedicated XSS regression test suite.

- **S21.21.3 — User input validation audit**
  Review every user input path: note title, folder name, search query, tag input,
  settings values, combat combatant names, POI labels, board tile content. Verify each
  is validated at the input boundary and sanitized before rendering. Focus on script
  injection and path traversal vectors.

- **S21.21.4 — Dependency vulnerability scan**
  Run `pnpm audit` and review results. Address all critical and high severity
  findings. For moderate findings, assess exploitability in context and document
  decisions. Update dependencies where possible. Pin any dependencies with known
  unfixed vulnerabilities and document the risk.

- **S21.21.5 — Content Security Policy audit**
  Review the CSP configuration in the Electron BrowserWindow webPreferences and any
  meta tags. Verify: no `unsafe-eval`, no `unsafe-inline` (unless required by
  framework with documentation), script-src restricted to self, no remote resource
  loading. Test by injecting a remote script reference and verifying it blocks.

- **S21.21.6 — File path traversal audit**
  Review every code path that constructs a filesystem path from user input (note paths,
  vault selection, import paths, template paths). Verify each uses path canonicalization
  and rejects traversal attempts (`../`, absolute paths outside vault root). Add
  traversal regression tests.

- **S21.21.7 — Threat model update**
  Review `docs/architecture/SECURITY.md` against the current attack surface. Update
  the threat model for any new surfaces added by I13–I20 (command palette, protocol
  handlers, file associations, native context menus, MCP bundle calls). Document
  mitigations for each new threat.

---

## Epic 21.22 — Accessibility Compliance Audit

**Goal:** Every UI surface meets WCAG 2.1 AA, all known axe violations are resolved,
and the accessibility QA checklist passes on all target screen readers.

**Stories:**

- **S21.22.1 — Axe known violations resolution**
  Review `tests/accessibility/known-violations.json`. For each known violation that has
  not yet been resolved, implement the fix. For each violation with an expired
  target-resolution date, escalate priority. Target: zero known violations remaining.

- **S21.22.2 — Keyboard navigation completeness test**
  Perform a complete keyboard-only walkthrough of every user flow: note CRUD, search,
  graph navigation, session board management, combat tracking, map viewing, settings
  configuration, command palette. Document any flows that cannot be completed without a
  pointer. Fix each one and add an E2E keyboard test.

- **S21.22.3 — Screen reader QA execution**
  Execute the full screen reader QA checklist from `docs/development/ACCESSIBILITY_QA.md`
  on NVDA + Chrome (Windows). Document findings as issues. Fix critical/serious
  findings. Update the QA checklist with any new test scenarios discovered.

- **S21.22.4 — Focus management comprehensive test**
  Test focus behavior for: dialog open/close, route transitions, overlay dismissal,
  dropdown close, tab switches, error state rendering. Verify: focus moves to the
  expected element, focus is never lost (trapped in invisible element), focus rings are
  always visible when using keyboard. Fix and add tests for each failure.

- **S21.22.5 — ARIA attribute audit**
  Review every component for ARIA correctness: roles match semantics, labels are
  descriptive, live regions fire for dynamic content, required attributes are present
  (e.g., `aria-expanded` on expandable controls, `aria-selected` on selectable items),
  no redundant ARIA on native semantic elements.

- **S21.22.6 — Color contrast comprehensive test**
  Run `src/lib/domain/contrast-audit.test.ts` and verify all token pairs pass across
  all 5 theme modes. Manually spot-check 20 representative surfaces in each theme for
  any contrast issues missed by token-level testing (e.g., transparency, gradients,
  images behind text).

- **S21.22.7 — Reduced motion comprehensive test**
  Enable `reduce-motion` preference and navigate every route. Verify: no CSS animations
  play, no JS-driven animations play, transitions are instant or very fast, canvas
  interactions (map pan, zoom) remain functional without inertia. Fix any violations.

---

## Epic 21.23 — UX Consistency & Data Exposure Audit

**Goal:** Interaction patterns are consistent across all surfaces, all error/empty/
loading states are handled, and no DM-private data leaks to player-visible surfaces.

**Stories:**

- **S21.23.1 — Data exposure systematic audit**
  With DM/Player mode switching, systematically verify every surface that renders note
  or entity content: note list, search results, graph nodes/edges, session board tiles,
  combat tracker combatant details, map POI labels/popovers, detail panel,
  breadcrumbs, command palette results, backlinks, cross-section links, timeline
  entries. Create a matrix of surface × data type × player visibility. Fix any
  exposure. Add E2E player-mode tests.

- **S21.23.2 — Empty state coverage audit**
  Navigate to every route and list view with an empty data set. Verify each renders
  the `EmptyState` component with appropriate headline, body, and action. Fix any
  surfaces showing blank/broken UI. Verify empty states meet accessibility requirements
  (`role="status"`).

- **S21.23.3 — Loading state coverage audit**
  Throttle network/storage to simulate slow operations. Navigate to every route.
  Verify each shows a loading indicator during data fetch. Verify no layout shift when
  content loads. Fix any surfaces that show stale data or blank content during loading.

- **S21.23.4 — Error state coverage audit**
  Simulate failures for: storage read, storage write, note not found, invalid markdown,
  MCP tool failure, network timeout. Verify each error shows a user-friendly message
  with recovery action. Verify no unhandled exceptions reach the user. Fix and add
  error boundary tests.

- **S21.23.5 — Interaction pattern consistency audit**
  Create a checklist of interaction patterns: how do menus open/close? How are
  confirmations presented? How do inline edits save (explicit save button vs auto-save)?
  How do deletions confirm? How do selections behave? Audit every surface against these
  patterns. Fix inconsistencies.

- **S21.23.6 — Toast and feedback audit**
  Verify every user-initiated action that changes state produces feedback: save
  confirmation, delete confirmation, copy confirmation, mode change, setting change.
  Verify toast content is descriptive and action-appropriate. Fix missing feedback.

- **S21.23.7 — Progressive disclosure audit**
  Test the vault maturity system with vaults at different stages: empty, 5 notes, 20
  notes, 50 notes, 100+ notes. Verify feature unlocks happen at documented thresholds.
  Verify no features are visible before their threshold. Verify opt-in features require
  explicit activation. Fix any disclosure timing issues.

---

## Phase G — Validation & Stabilization

These epics verify that all preceding work has achieved the initiative outcome. They
run the full metric suite against baselines, ensure test coverage is complete, verify
documentation accuracy, and produce a release-readiness assessment.

---

## Epic 21.24 — Test Coverage Completion

**Goal:** Every domain module has unit tests, every critical user flow has E2E
coverage, every bug fix from this initiative has a regression test, and coverage
thresholds are met.

**Stories:**

- **S21.24.1 — Unit test gap analysis**
  Run coverage analysis (`pnpm test -- --coverage`). Identify modules in `src/lib/**`
  below 80% statement coverage. Prioritize: domain logic, state stores, markdown
  plugins, and utility functions. Produce a coverage gap report with file paths and
  current coverage percentages.

- **S21.24.2 — Domain logic coverage completion**
  For each domain module identified in S21.24.1, add unit tests to reach ≥ 80%
  statement coverage. Focus on: edge cases, error paths, and boundary conditions.
  Ensure tests are deterministic and fast.

- **S21.24.3 — State store coverage completion**
  For each `.svelte.ts` state file with insufficient coverage, add tests for:
  initialization, state transitions, persistence, cleanup, and concurrent access
  patterns.

- **S21.24.4 — E2E critical path gap analysis**
  Review the desktop E2E coverage matrix in `docs/development/TESTING.md`. Identify any
  user-critical flows not covered by `critical-workflows.spec.ts` or domain-specific
  specs. Add coverage for: onboarding flow, vault switch, import/export, all settings
  tabs, feature tier transitions.

- **S21.24.5 — MCP tool dedicated test completion**
  Verify every tool in `mcp/tools/` has a dedicated test file (beyond contract tests).
  For any tool still lacking dedicated coverage, add tests for: success case, validation
  failure, not-found case, and permission enforcement. Target: 100% write-capable tool
  coverage.

- **S21.24.6 — Regression test verification**
  Audit every code change made during this initiative. Verify each fix has a
  corresponding test that would fail if the fix were reverted. Add any missing
  regression tests.

---

## Epic 21.25 — Documentation Realignment

**Goal:** Every documentation file accurately reflects the current implementation,
and no documented contract contradicts the code.

**Stories:**

- **S21.25.1 — Architecture documentation audit**
  Review and update: `ARCHITECTURE.md`, `DATA_MODEL.md`, `TECH_STACK.md`,
  `SECURITY.md`, `DESIGN_TOKENS.md`, `LAYOUT_TIERS.md`, `NAVIGATION_CONTRACT.md`,
  `INFORMATION_ARCHITECTURE.md`. For each file, diff the documented contracts against
  the current code. Fix all inaccuracies.

- **S21.25.2 — Development documentation audit**
  Review and update: `DEVELOPMENT.md`, `GIT_WORKFLOW.md` (especially the new tiered
  branch model), `TESTING.md`, `PERFORMANCE.md`, `ACCESSIBILITY.md`,
  `ACCESSIBILITY_QA.md`, `UX_GUIDELINES.md`, `OWNERSHIP.md`. Verify setup instructions
  still work from a clean clone.

- **S21.25.3 — Reference documentation audit**
  Review and update: `AGENTIC_NOTES_WORKFLOW.md` (MCP tool contracts),
  `PROJECT_STRUCTURE.md`, `ICON_VOCABULARY.md`, `FEATURE_TIERS.md`,
  `RANDOM_TABLES.md`. Verify each reference matches the current implementation.

- **S21.25.4 — ADR completeness audit**
  Review ADR-001 through ADR-010. Amend any that no longer accurately describe the
  current decision. Draft and submit ADRs for any significant undocumented decisions
  identified during Epic 21.6.

- **S21.25.5 — CLAUDE.md accuracy audit**
  Review every section of `CLAUDE.md` against the current codebase. Update the
  completed epics list, tech stack versions, command references, known gaps section,
  and documentation map. Verify all referenced file paths still exist.

- **S21.25.6 — Changelog and glossary update**
  Update `CHANGELOG.md` with a summary of this initiative's changes. Review and update
  `docs/GLOSSARY.md` for any new domain terms introduced or existing terms whose
  definitions have drifted.

---

## Epic 21.26 — Final Validation & Release Readiness

**Goal:** All metrics meet or beat baselines, all quality gates pass, and the
codebase is ready for the next phase of feature development.

**Stories:**

- **S21.26.1 — Full metric comparison**
  Run `pnpm metrics:capture` and `pnpm metrics:compare` against the Phase A baselines
  from Epic 21.3. Produce a report showing: bundle size delta, build time delta, test
  duration delta, runtime performance delta. Verify improvements across all categories.

- **S21.26.2 — Performance budget compliance**
  Run the full performance test suite. Verify all 7 canonical budgets are met at P95.
  Verify no operation exceeds its regression threshold. Update the performance baseline
  with post-initiative values.

- **S21.26.3 — Bundle size compliance**
  Verify the initial JS bundle is under 100KB gzipped. Verify no individual route
  chunk exceeds a reasonable threshold (e.g., 200KB gzipped). Update the bundle
  baseline.

- **S21.26.4 — File size compliance**
  Run a file size audit: no `.ts` or `.svelte` source file exceeds 500 lines. Generate
  a report listing all source files with their line counts. Add a CI lint check that
  fails if any source file exceeds 500 lines.

- **S21.26.5 — Full test suite green**
  Run the complete test suite: `pnpm check`, `pnpm test:e2e`, all desktop E2E suites
  (critical, accessibility, performance, memory). Verify zero failures, zero flakes
  across 3 consecutive runs. Investigate and fix any intermittent failures.

- **S21.26.6 — CI pipeline full validation**
  Merge the initiative branch to a test branch and verify: the full CI pipeline runs,
  all quality gates pass, metric comparison posts correctly, accessibility report
  generates, and the pipeline completes within a reasonable time.

- **S21.26.7 — Initiative retrospective document**
  Write a retrospective in `docs/planning/retrospectives/I21-retrospective.md`
  documenting: what the audit found (categorized), what was fixed, what metrics
  improved, what processes were established, and recommendations for the next
  maintenance cycle. This document makes the initiative repeatable.

---

## Dependency Map

```
Phase A (Foundation)
  21.1 CI/CD ─────────────────────┐
  21.2 Scripts ──────────────────┤
  21.3 Metrics ──────────────────┘
           │
Phase B (Architecture Audit)      │
  21.4 Goals & Organization ──────┤
  21.5 Boundaries & Dependencies ─┤
  21.6 ADRs & Standards ─────────┘
           │
Phase C (Decomposition)           │
  21.7 Route Components ──────────┤
  21.8 Domain Logic ──────────────┤ (can run in parallel)
  21.9 Infrastructure ────────────┤
  21.10 Test Files ───────────────┘
           │
Phase D (Performance)             │
  21.11 Bundle & Build ───────────┤
  21.12 Runtime ──────────────────┤ (can run in parallel)
  21.13 Test Suite ───────────────┘
           │
Phase E (Domain Deep Audits)      │
  21.14 Storage ──────────────────┤
  21.15 MCP Server ───────────────┤
  21.16 Renderer Core ────────────┤ (can run in parallel)
  21.17 UI Components ────────────┤
  21.18 Session System ───────────┤
  21.19 Maps & Atlas ─────────────┤
  21.20 Electron Shell ───────────┘
           │
Phase F (Cross-Cutting)           │
  21.21 Security ─────────────────┤
  21.22 Accessibility ────────────┤ (can run in parallel)
  21.23 UX Consistency ───────────┘
           │
Phase G (Validation)              │
  21.24 Test Coverage ────────────┤
  21.25 Documentation ────────────┤ (can run in parallel)
  21.26 Final Validation ─────────┘ (depends on 21.24 + 21.25)
```

## Execution Notes

- **Phases are sequential.** Phase B depends on Phase A infrastructure. Phase C
  depends on Phase B findings. Phase D uses Phase A baselines. Phase E requires Phase C
  decomposition. Phase F spans domains from Phase E. Phase G validates everything.

- **Epics within a phase can often run in parallel.** The dependency map above shows
  which epics within each phase are independent.

- **Every fix gets a test.** No code change during this initiative should be committed
  without an accompanying test that would fail if the fix were reverted.

- **Branch model applies to this initiative.** Create `initiative/I21-realignment`
  from `master` after Epic 21.1 establishes the branch model. Each subsequent epic
  branches from the initiative branch and merges back via PR with smoke tests.

- **Metric snapshots at phase boundaries.** Capture metric snapshots after each phase
  completes to track incremental improvement and catch any regressions introduced by
  the audit work itself.
