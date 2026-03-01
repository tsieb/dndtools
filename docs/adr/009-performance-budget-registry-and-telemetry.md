# ADR-009: Performance Budget Registry and Telemetry Contract

- Status: Accepted
- Date: 2026-03-01
- Deciders: Engineering
- Consulted: Product, QA
- Supersedes: N/A

## Context

Performance budgets existed as partial documentation and ad-hoc benchmark assertions, but there was no single typed registry that enforced operation names, target thresholds, and regression gates across renderer, Electron main, MCP, and CI.

Epic 2.5 requires:

- hard budgets for all user-observable operations
- runtime telemetry (`performance.mark` / `performance.measure`) at call sites
- System Health aggregation (P50/P95/P99)
- CI baseline comparison with explicit regression thresholds

Without a stable contract, budgets drift and benchmark coverage becomes inconsistent.

## Decision

Adopt a single budget registry and telemetry schema in `src/lib/types/diagnostics.ts`:

- Define canonical `PerformanceOperation` identifiers.
- Define `PERFORMANCE_BUDGETS` with target and regression-threshold milliseconds.
- Define shared telemetry payloads and summaries used by renderer, main, and System Health UI.

Treat budget changes as architecture changes:

- Any budget change must include an ADR update in the same PR.
- CI compares benchmark results against baseline metrics and fails on regressions above 20%.

## Consequences

### Positive

- One source of truth for budget names, limits, and telemetry shapes.
- Stronger traceability from runtime measurements to CI gates.
- System Health can show consistent percentiles and budget health across subsystems.

### Negative

- Adds maintenance overhead when operation names or measurement strategies change.
- Requires discipline to keep telemetry instrumentation aligned with registry definitions.

## Rejected Alternatives

| Alternative                               | Why Rejected                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| Keep budgets only in docs                 | No type safety; runtime and CI can silently diverge from documentation.       |
| Keep separate budget constants per module | High drift risk; difficult cross-cutting reporting and comparison.            |
| Fail CI only against static hard budgets  | Misses environment variance and trend regressions across benchmark histories. |

## Migration Impact

- Runtime diagnostics contracts expand to include performance telemetry summaries and timeline samples.
- System Health UI must render the new performance summary/timeline sections.
- CI performance workflow must emit current benchmark JSON and compare against baseline JSON.

## Rollback Plan

- Trigger: telemetry or benchmark pipeline causes unacceptable instability.
- Rollback steps:
  - Disable CI baseline comparison step.
  - Keep only hard-budget assertions in benchmark tests.
  - Retain registry type definitions to avoid breaking callers.
- Data considerations: no persistent data migration required; telemetry is ephemeral.

## Verification and Evidence

- `src/lib/types/diagnostics.ts`
- `electron/diagnostics.ts`
- `src/routes/settings/+page.svelte`
- `tests/e2e-desktop/performance.spec.ts`
- `.github/workflows/performance-regression.yml`
- `scripts/compare-performance-baseline.ts`
