# Testing Strategy

This repository uses a tiered testing model: fast smoke validation for epic branches and full-quality validation for initiative-to-master integration.

## 1. Tooling

- Unit/integration runner: Vitest (`pnpm test`)
- Browser E2E runner: Playwright (`pnpm test:e2e`)
- Desktop E2E runner: Playwright + Electron (`pnpm desktop:test:*`)
- Structured local runners: `pnpm audit:quick`, `pnpm audit:full`

## 2. CI Tiers

### 2.1 Smoke Gate

`pnpm test:smoke` is the only required quality gate for PRs targeting `initiative/*`.

Contents:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:critical`

`pnpm test:critical` is the curated regression slice for:

- storage contracts
- session-state normalization
- navigation state behavior
- runtime-boundary lint rules

### 2.2 Full Quality Gate

PRs targeting `master` must pass:

- format check
- lint
- typecheck
- full Vitest suite
- docs validation
- desktop critical E2E
- desktop accessibility E2E
- metrics capture + baseline comparison

## 3. Current Test Inventory

### 3.1 Unit / Integration

Representative high-value suites:

- storage and staged adapters: `mcp/storage.test.ts`, `mcp/staged-storage.test.ts`, `src/lib/platform/storage/*.test.ts`
- navigation and session state: `src/lib/state/navigation.svelte.test.ts`, `src/lib/types/session-state.test.ts`
- domain logic: `src/lib/domain/*.test.ts`
- renderer and boundary rules: `tests/unit/lint-boundary-rules.test.ts`
- Electron safety: `electron/ipc-security.test.ts`

### 3.2 Desktop E2E

- `pnpm desktop:test:critical` - critical workflows and route coverage
- `pnpm desktop:test:a11y` - accessibility regression checks
- `pnpm desktop:test:perf` - budgeted benchmark suite
- `pnpm desktop:test:memory` - scheduled memory profile suite

### 3.3 Browser E2E

- `pnpm test:e2e` - browser-focused exploratory workflow coverage

## 4. Mandatory Rules

- Every bug fix includes a regression test.
- New domain behavior includes at least one unit or integration test.
- User-critical UI changes include E2E coverage.
- Storage or MCP write-path changes include integrity/state-transition tests.
- Metrics or CI changes update the relevant docs and baseline artifacts.

## 5. Metrics Baselines

Committed performance artifacts live under `tests/perf/`:

- `bundle-baseline.json`
- `build-baseline.json`
- `test-baseline.json` - merge-blocking suite timings by default; add `--includeExtendedTests`
  during capture to include browser E2E and desktop perf/memory suites
- `performance-baseline.json`

Key commands:

- `pnpm metrics:capture -- --profile baseline --writeBaseline`
- `pnpm metrics:compare -- --baselineDir tests/perf --currentDir tmp/metrics/latest`

## 6. Commands

- `pnpm test`
- `pnpm test:critical`
- `pnpm test:smoke`
- `pnpm test:e2e`
- `pnpm desktop:test:critical`
- `pnpm desktop:test:a11y`
- `pnpm desktop:test:perf`
- `pnpm desktop:test:memory`
- `pnpm audit:quick`
- `pnpm audit:full`
- `pnpm metrics:capture`
- `pnpm metrics:compare`
