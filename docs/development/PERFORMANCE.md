# Performance

## 1. Budgets

`packages/core/src/perf/budget-registry.ts` (`performanceBudgets`, validated by
`validateBudgetRegistry`) is the one registry. Each budget names the workflow it governs, an owning
domain, a user-facing risk, and a measurement method (`latency-ms-p95`, `throughput-fps-p95`, or
one-shot `duration-ms`). All eleven are still `provisional` with a `reviewDate`; RC-ENG-3.1 promotes
them to `baseline` once CI measurements settle.

| Budget                  | Target    | Budget                 | Target    |
| ----------------------- | --------- | ---------------------- | --------- |
| `smoke-ci`              | ≤ 3 min   | `map-pan-zoom-desktop` | ≥ 50 fps  |
| `app-startup`           | ≤ 2000 ms | `map-pan-zoom-slim`    | ≥ 30 fps  |
| `vault-open`            | ≤ 3000 ms | `search`               | ≤ 250 ms  |
| `scene-first-render`    | ≤ 1500 ms | `graph-indexing`       | ≤ 500 ms  |
| `widget-update`         | ≤ 100 ms  | `sync-reconciliation`  | ≤ 2000 ms |
| `live-session-delivery` | ≤ 500 ms  |                        |           |

Grading lives in `packages/core/src/perf/measurement.ts`; the initial-route bundle budget in
`perf/bundle-budget.ts` (`pnpm check:bundle-budget`). `validateBudgetRegistry` fails closed on a
budget with no owner, no risk, or a lapsed review date (`packages/core/tests/perf-budget-registry.test.ts`).

## 2. Measurement

```bash
pnpm perf:capture                                  # tests/perf/current.json; starts a dev server if needed
pnpm perf:compare                                  # grade against targets and tests/perf/baseline.json
pnpm perf:capture -- --only search,graph-indexing --notes 50
pnpm perf:capture && pnpm perf:baseline            # re-record the baseline deliberately
```

`scripts/perf/capture.ts` drives the real app in Chromium, one scenario per budget, through the
dev-only `window.__rt` seam and ordinary commands, bracketing each with `performance.mark` /
`measure` from the harness. Nothing is modelled; every sample is observed. A scenario that cannot run
records zero samples and a reason, which `compare.ts` grades as a failure, so a silently skipped
scenario can never read green. Smaller fixtures and the dev-server cost are stated in the report.

A ceiling is graded at its percentile; a floor at the complement (p95 ≥ 50 fps means 95% of frames
at or above); a `duration-ms` budget grades the worst run. `compare.ts` fails on a breached target,
on drift past 20% against the baseline in the bad direction (ADR-009), or on an unmeasured budget,
and grades drift only when the run's CPU matches the baseline's. The checked-in baseline was
recorded on a 16-core desktop, so CI runs currently grade targets only; on 2026-09-09 two runs of
one unchanged commit swung `scene-first-render` between 1125 ms and 1621 ms at n=3. RC-ENG-1.3 owns
a CI-hardware baseline and a larger sample; never loosen a budget to make a run pass.
`.github/workflows/perf.yml` is path-filtered and uploads the run file and a report.

## 3. The map bake layer

The map renderer is SVG (ADR-014/024) so hit-testing and the accessibility tree come free, but the
densest world generator emits ~18,000 vertices, most of them inert biome, territory, and water
fills. `apps/gm-react/src/app/map/canvas/BakeLayer.tsx` paints exactly the `fill`, `room`,
`polygon`, and `water` kinds onto a canvas-2d layer mounted under the interactive SVG when a map
exceeds 120 features or 4,000 vertices; everything a person can point at stays on the SVG and the
canvas is `aria-hidden`. Below the threshold `planBake` returns the input array itself. The ops
transcribe `FeatureShape.tsx` (same tints, opacities, strokes, tokens), so a baked map differs only
in frame rate. `BakeLayer.test.ts` runs the generator at its densest and grades it with
`measureMapPanZoom`: unbaked breaches `map-pan-zoom-slim`, baked passes both.

## 4. When a budget matters to a change

If a change touches a budgeted workflow, add or update the measurement in `perf/measurement.ts` and
the scenario in `scripts/perf/capture.ts` rather than scattering ad hoc timings, and run
`perf:capture` before and after.
