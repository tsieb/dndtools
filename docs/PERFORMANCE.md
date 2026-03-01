# Performance Engineering

This document defines the operational performance program delivered for Epic 2.5.

## 1. Hard Budgets

Canonical budget registry:

- `src/lib/types/diagnostics.ts` (`PERFORMANCE_BUDGETS`)

Budgeted operations:

- `cold_start` (`<= 3000ms`)
- `vault_open` (`<= 2000ms`)
- `note_open` (`<= 200ms`)
- `search_response` (`<= 150ms`)
- `note_save` (`<= 100ms`)
- `graph_rebuild_incremental` (`<= 50ms`)
- `mcp_bundle_call` (`<= 800ms`)

Regression threshold policy:

- CI fails if benchmark result exceeds baseline by more than 20%.
- CI also fails if any operation exceeds its regression threshold (`target * 1.2`).

## 2. Telemetry and System Health

Runtime telemetry sources:

- Renderer operations report through `recordDiagnosticsPerformance` IPC.
- Electron main process reports vault-open telemetry directly.
- MCP bundle calls persist telemetry to `.vault/mcp-performance.json`, ingested by main diagnostics.

System Health performance view (`Settings -> System Health -> Performance`) includes:

- Per-operation summary with sample count and P50/P95/P99.
- Budget-aware highlighting when percentile samples exceed target.
- Slowest recent operation timeline grouped by operation type.

## 3. Benchmark Suite

Benchmark test:

- `tests/e2e-desktop/performance.spec.ts` (`@perf`)

Dataset coverage:

- `notes_1000` fixture vault
- `notes_5000` fixture vault

Benchmark artifact:

- Current run output: `tmp/performance/latest-performance-results.json`
- Committed baseline: `tests/perf/performance-baseline.json`
- Baseline updates are intentional, reviewer-visible changes and must be explicitly approved in PR review.

Comparison script:

- `scripts/compare-performance-baseline.ts`

Workflow:

- `.github/workflows/performance-regression.yml`

## 4. Memory Profiling Program

Nightly memory profile:

- Test: `tests/e2e-desktop/memory.spec.ts` (`@memory`)
- Workflow: `.github/workflows/memory-profile.yml`
- Budget: heap growth `< 20MB` after fixed interaction script:
  - open 50 notes
  - run 20 searches
  - save 10 notes

Local memory investigation:

- `pnpm memory:profile`
- Script: `scripts/memory-profile.ts`

## 5. Mitigation Playbook

When an operation regresses:

1. Inspect System Health performance timeline and identify offending operation + source.
2. Compare current benchmark artifact against baseline to isolate dataset-specific degradation.
3. Apply targeted mitigation:
   - `cold_start` / `vault_open`: reduce synchronous bootstrap work, defer non-critical initialization.
   - `note_open`: minimize route-level rendering and heavy derived computations.
   - `search_response`: trim query-time work and reduce result shaping overhead.
   - `note_save`: avoid extra write-path serialization and non-essential post-save sync.
   - `graph_rebuild_incremental`: keep updates scoped to changed note edges only.
   - `mcp_bundle_call`: reduce repeated scans by reusing derived vault intelligence.
4. Re-run `pnpm test:e2e:desktop:perf` and `pnpm perf:compare` before merge.
