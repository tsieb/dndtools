# Testing Strategy

This strategy optimizes for defect prevention, not just test count.

## 1. Tooling

- Unit/integration runner: Vitest (`pnpm test`)
- E2E runner: Playwright (`pnpm test:e2e`)
- Vitest config: `vite.config.ts`
- Playwright config: `playwright.config.ts`

## 2. Effective Quality Metrics

### 2.1 Coverage Gates (Safety Net, Not Goal)

Configured thresholds for `src/lib/**`:

- statements >= 80
- branches >= 75
- functions >= 80
- lines >= 80

Note: coverage runs require `@vitest/coverage-v8` to be installed.

### 2.2 Risk-Based Regression Metrics (Primary)

- Critical invariant coverage:
  - staged MCP notes remain virtual until approval
  - staged snapshots derive links/search from pending state
  - MCP note updates enforce merge/replace frontmatter semantics
  - search excludes deleted content and respects index mutations
  - related suggestions produce deterministic order and ignore invalid/deleted candidates
- Contract-level assertions:
  - MCP tool handlers return valid success/error payloads for edge inputs
  - tool behaviors are validated against storage side effects, not only response shape
- Regression policy:
  - every production bug gets a failing test first at the lowest effective layer
  - test must lock the exact bug mechanism (not a broad surrogate assertion)

### 2.3 Suite Health Metrics

- flaky rate target: 0% for unit/integration suite
- slow-test budget: investigate tests consistently > 2s
- deterministic output for rank/sort behavior (stable tie-breakers required)

## 3. Current Test Inventory

### 3.1 Unit/Integration

- Storage and staged adapters:
  - `mcp/storage.test.ts`
  - `mcp/staged-storage.test.ts`
  - `mcp/safe-write.test.ts`
  - `mcp/recovery.test.ts`
  - `src/lib/platform/storage/sync-adapter.test.ts`
  - staged MCP oversight tests now cover policy auto-approval, structural-review gating, and live-edit conflict blocking.
- MCP tool contracts:
  - `mcp/tools/all-tools.test.ts` (all-tool contract, permission, strict-input, retry safety)
  - `mcp/resources/contracts.test.ts` (resource request/response contract validation)
  - `mcp/resources/resource-catalog.test.ts` (resource URI discoverability metadata)
  - `mcp/tools/notes/update-note.test.ts` (behavior contract)
  - `mcp/tools/vault/get-vault-summary.test.ts` (vault intelligence summary contract)
  - `mcp/tools/vault/vault-health-check.test.ts` (broken-link edge cases)
  - `mcp/tools/vault/vault-intelligence.test.ts` (health-score and gap calculations)
- Markdown and parsing:
  - `src/lib/markdown/frontmatter.test.ts`
  - `src/lib/markdown/pipeline.test.ts`
  - `src/lib/markdown/plugins/rehype-callouts.test.ts`
- Services:
  - `src/lib/domain/export.test.ts`
  - `src/lib/domain/link-extractor.test.ts`
  - `src/lib/domain/object-relationships.test.ts`
  - `src/lib/domain/object-validation.test.ts`
  - `src/lib/domain/object-templates.test.ts`
  - `src/lib/domain/mcp-change-preview.test.ts`
  - `src/lib/domain/template-automation.test.ts`
  - `src/lib/domain/templates.test.ts`
  - `src/lib/domain/search.test.ts`
  - `src/lib/domain/related-note-suggestions.test.ts`
  - `src/lib/domain/sync.test.ts`
- Utils:
  - `src/lib/utils/date.test.ts`
  - `src/lib/utils/debounce.test.ts`
  - `src/lib/utils/slug.test.ts`

### 3.2 E2E

- Desktop smoke and critical routes:
  - `tests/e2e-desktop/desktop-smoke.spec.ts`
  - `tests/e2e-desktop/critical-workflows.spec.ts`
- Browser-focused exploratory suite:
  - `tests/e2e/navigation.spec.ts`
  - `tests/e2e/note-crud.spec.ts`
  - `tests/e2e/search.spec.ts`

Desktop E2E prerequisite:

- run `pnpm desktop:build` before `pnpm test:e2e:desktop:*` commands in a clean workspace (or after removing `electron/dist` or `mcp/dist`).

#### Desktop Route Coverage Matrix

Runner: Playwright (`playwright.desktop.config.ts`). Merge-blocking policy: desktop critical E2E enforced in CI (`.github/workflows/ci.yml` job: `desktop-e2e-critical`) and PR workflow (`.github/workflows/e2e.yml`).

| Route               | Covered workflows                                                               | Test evidence                                                                                               |
| ------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/`                 | Vault opens, setup wizard appears for empty vaults, and onboarding can continue | `desktop-smoke.spec.ts`, `critical-workflows.spec.ts` ("vault opens and setup wizard is actionable")        |
| `/notes`            | Notes listing and note-entry navigation                                         | `critical-workflows.spec.ts` ("note CRUD workflow", "wikilink navigation and search workflows")             |
| `/notes/[id]`       | Note viewer rendering and wikilink navigation                                   | `critical-workflows.spec.ts` ("wikilink navigation and search workflows")                                   |
| `/notes/[id]/edit`  | Note create/update flow, object creation/embed flow                             | `critical-workflows.spec.ts` ("note CRUD workflow", "object creation workflow")                             |
| `/search`           | Search query execution and result rendering                                     | `critical-workflows.spec.ts` ("wikilink navigation and search workflows")                                   |
| `/graph`            | Link graph filtering, isolation toggle, node selection, and note drill-in       | `critical-workflows.spec.ts` ("graph route filters linked notes and opens selected nodes")                  |
| `/timeline`         | Chronological world/session timeline rendering with arc and participant filters | `critical-workflows.spec.ts` ("timeline route shows world events and linked session logs with filters")     |
| `/maps`             | Map library filtering and map detail control loading                            | `critical-workflows.spec.ts` ("maps route filters map library and loads map detail controls")               |
| `/combat`           | Combat board selection and no-tile recovery controls                            | `critical-workflows.spec.ts` ("combat tracker route exposes board selection and no-tile recovery controls") |
| `/settings?tab=mcp` | MCP pending-change review and approval lifecycle                                | `critical-workflows.spec.ts` ("MCP pending review approves staged changes from settings")                   |
| `/session-board`    | Session board creation and note-tile management                                 | `critical-workflows.spec.ts` ("session board management creates board and attaches notes")                  |
| `/encounter/new`    | Encounter builder canonical route availability in desktop shell                 | `critical-workflows.spec.ts` ("encounter builder canonical route resolves in desktop shell")                |
| `/player`           | Player-safe note visibility filtering, search, and exit workflow                | `critical-workflows.spec.ts` ("player view shows only shared/public notes and supports exit flow")          |

### 3.3 Performance Regression

- Weekly desktop benchmark suite:
  - `tests/e2e-desktop/performance.spec.ts` (`@perf`)
- Baseline and comparison:
  - `tests/perf/performance-baseline.json`
  - `scripts/compare-performance-baseline.ts`
- Enforced budgets live in:
  - `docs/development/PERFORMANCE.md` (Section 1)
- Scheduled workflow:
  - `.github/workflows/performance-regression.yml`

### 3.4 Memory Profiling

- Nightly desktop memory profile:
  - `tests/e2e-desktop/memory.spec.ts` (`@memory`)
- Local profiling entrypoint:
  - `scripts/memory-profile.ts`
- Scheduled workflow:
  - `.github/workflows/memory-profile.yml`

## 4. Mandatory Test Rules

- Every bug fix includes a regression test.
- New domain behavior includes at least one unit/integration test.
- User-critical UI flow changes include e2e coverage.
- Storage or MCP write-path changes include integrity/state-transition tests.
- Ranking/suggestion logic must include deterministic ordering tests.
- Changes touching covered routes must preserve the desktop route coverage matrix in Section 3.2 above.

## 5. High-Value Next Expansions

- Add staged workflow tests for approve/reject-all conflict scenarios.
- Add accessibility checks (focus order, keyboard-only flow, labels) in Playwright.

## 6. Commands

- `pnpm test`
- `pnpm test -- --coverage`
- `pnpm test:watch`
- `pnpm test:e2e`
- `pnpm desktop:build` (required before desktop E2E in clean workspaces)
- `pnpm test:e2e:desktop:critical`
- `pnpm test:e2e:desktop:perf` (set `PERF_BENCHMARK=1`)
- `pnpm test:e2e:desktop:memory` (set `MEMORY_PROFILE=1`)
- `pnpm perf:compare -- --current <path-to-results-json>`
- `pnpm memory:profile`
- `pnpm check`
