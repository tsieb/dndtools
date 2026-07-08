# Performance Engineering

This document defines the committed runtime budgets plus the baseline-capture workflow used to track regressions over time.

## 1. Hard Budgets

Canonical budget registry:

- `src/lib/types/diagnostics.ts` (`PERFORMANCE_BUDGETS`)

Budgeted operations:

- `cold_start` <= `3000ms`
- `vault_open` <= `2000ms`
- `note_open` <= `200ms`
- `search_response` <= `150ms`
- `note_save` <= `100ms`
- `graph_rebuild_incremental` <= `50ms`
- `mcp_bundle_call` <= `800ms`

Initial client bundle goal:

- initial-route JavaScript <= `100KB` gzipped

## 2. Baseline Artifacts

Committed baselines live in `tests/perf/`:

- `bundle-baseline.json`
- `build-baseline.json`
- `test-baseline.json`
- `performance-baseline.json`

Use `pnpm metrics:capture -- --profile baseline --writeBaseline` to refresh the
merge-blocking baseline set intentionally. Add `--includeExtendedTests` when you also
want to time the non-gating browser and extended desktop suites.

## 3. Tooling

- capture: `pnpm metrics:capture`
  This captures the suites enforced by the `main` quality gate by default. Use
  `pnpm metrics:capture -- --includeExtendedTests` for a broader audit snapshot.
- compare: `pnpm metrics:compare`
- legacy perf-only compare alias: `pnpm perf:compare`
- scheduled benchmark workflow: `.github/workflows/performance-regression.yml`

The compare step is merge-blocking on `main` PRs when:

- a timing baseline regresses materially
- initial-route gzip exceeds the bundle budget
- a runtime metric exceeds its regression threshold

## 4. Build Pipeline Expectations

The desktop build now runs renderer and MCP builds in parallel before Electron bundling.

Expected healthy ordering:

- `build` should be the slowest renderer-facing stage
- `mcp:build` should stay materially below renderer build time
- `desktop:build` should remain well below the sum of `build + mcp:build` because of parallelism
- `desktop:package` / `desktop:package:dir` are expected to be the slowest overall stages

Authoritative current timings should be read from `tests/perf/build-baseline.json`.

## 5. Runtime Telemetry

Runtime telemetry sources:

- renderer operations report through diagnostics IPC
- Electron main reports vault-open telemetry
- desktop benchmark runs emit machine-readable snapshots to `tmp/metrics/` or `tmp/performance/`

## 6. Mitigation Playbook

When a metric regresses:

1. Capture fresh metrics with `pnpm metrics:capture -- --profile ci --outputDir tmp/metrics/latest`.
2. Compare against committed baselines with `pnpm metrics:compare`.
3. Identify whether the regression is in bundle size, build duration, suite duration, or runtime telemetry.
4. Apply targeted fixes and re-run the affected category before updating baselines.
