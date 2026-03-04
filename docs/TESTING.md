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
- Route matrix:
  - `docs/E2E_COVERAGE_MATRIX.md`
- Browser-focused exploratory suite:
  - `tests/e2e/navigation.spec.ts`
  - `tests/e2e/note-crud.spec.ts`
  - `tests/e2e/search.spec.ts`

### 3.3 Performance Regression

- Weekly desktop benchmark suite:
  - `tests/e2e-desktop/performance.spec.ts` (`@perf`)
- Baseline and comparison:
  - `tests/perf/performance-baseline.json`
  - `scripts/compare-performance-baseline.ts`
- Enforced budgets live in:
  - `docs/ARCHITECTURE.md` (Section 8.1)
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
- Changes touching covered routes must preserve `docs/E2E_COVERAGE_MATRIX.md` expectations.

## 5. High-Value Next Expansions

- Add staged workflow tests for approve/reject-all conflict scenarios.
- Add accessibility checks (focus order, keyboard-only flow, labels) in Playwright.

## 6. Commands

- `pnpm test`
- `pnpm test -- --coverage`
- `pnpm test:watch`
- `pnpm test:e2e`
- `pnpm test:e2e:desktop:critical`
- `pnpm test:e2e:desktop:perf` (set `PERF_BENCHMARK=1`)
- `pnpm test:e2e:desktop:memory` (set `MEMORY_PROFILE=1`)
- `pnpm perf:compare -- --current <path-to-results-json>`
- `pnpm memory:profile`
- `pnpm check`
