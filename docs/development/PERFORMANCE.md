# Performance Engineering

> This document was sharply reduced during the React pivot (ADR-018): the v1 Electron/vault/MCP
> diagnostics IPC no longer exists. The capture/compare pipeline was rebuilt for the React app by
> RC-ENG-1.1 and is described in section 2 below. Budgets themselves live, as before, in a single
> core registry.

## 1. Budget Registry

Canonical, owned source of truth:

- `packages/core/src/perf/budget-registry.ts` (`performanceBudgets`, validated by `validateBudgetRegistry`)

Each budget names the user workflow it governs, the owning domain, a user-facing risk, and a
measurement method (`latency-ms-p95`, `throughput-fps-p95`, or one-shot `duration-ms`). The registry
is pure (no DOM/Node/clock/entropy) so it is deterministic and unit-testable.

Current budgets (all `provisional` — provisional targets, no measured baseline yet):

| Budget id               | Target               |
| ----------------------- | -------------------- |
| `smoke-ci`              | <= 3 min (duration)  |
| `app-startup`           | <= 2000 ms           |
| `vault-open`            | <= 3000 ms           |
| `scene-first-render`    | <= 1500 ms           |
| `widget-update`         | <= 100 ms (p95)      |
| `map-pan-zoom-desktop`  | >= 50 fps (p95)      |
| `map-pan-zoom-slim`     | >= 30 fps (p95)      |
| `search`                | <= 250 ms (p95)      |
| `graph-indexing`        | <= 500 ms (duration) |
| `sync-reconciliation`   | <= 2000 ms (p95)     |
| `live-session-delivery` | <= 500 ms (p95)      |

The measurement half that grades observed samples against these budgets is
`packages/core/src/perf/measurement.ts`. The initial-route JavaScript bundle budget lives in
`packages/core/src/perf/bundle-budget.ts`.

## 2. Measurement Pipeline (RC-ENG-1.1)

Budgets are only worth having if something measures them. Two scripts do:

| Script                    | Job                                                                          |
| ------------------------- | ---------------------------------------------------------------------------- |
| `scripts/perf/capture.ts` | Drives the real app in Chromium and records raw samples. Grades nothing.     |
| `scripts/perf/compare.ts` | Grades those samples against the registry targets AND the recorded baseline. |

```bash
# Capture every budget into tests/perf/current.json (starts a dev server if one is not running)
pnpm perf:capture

# Grade the run against the targets and tests/perf/baseline.json
pnpm perf:compare

# Narrow a capture while iterating
pnpm perf:capture -- --only search,graph-indexing --notes 50
```

`capture.ts` runs one scenario per budget id. Ten of them drive the app through the DEV-only
`window.__rt` SceneRuntime seam and the ordinary durable commands — the same idioms the e2e suite
uses — bracketing each scenario with `performance.mark` / `performance.measure` **from the harness**,
so the app carries no measurement scaffolding for CI's benefit. The eleventh, `smoke-ci`, times
`pnpm test:smoke`, because that is literally what that budget owns.

Three properties matter more than the numbers:

- **Nothing is modelled.** Every sample is an observed duration or frame rate from a real run. The
  cost models in `perf/search-graph-sync.ts` and `perf/scene-map-render.ts` estimate; this measures.
- **A scenario that cannot run records zero samples and a reason.** `measureBudget` grades an empty
  sample set as `unknown`, and `compare.ts` treats `unknown` as a failure — a scenario that quietly
  stops running can never read as green.
- **A smaller fixture is stated, never hidden.** Seeding 10,000 records through the durable command
  path would outlast the CI job, so some scenarios run on a smaller vault. The run file records the
  fixture actually used and the report prints it beside the verdict.
- **The dev-server cost is stated too.** The `window.__rt` seam the core-level scenarios drive exists
  only in a DEV build, so every scenario runs against the Vite dev server, which transforms modules
  on demand. First-navigation timings are therefore higher than the shipped app's. `app-startup` sits
  closest to its target because of this — around 1000 ms on a workstation, but a slow cold run has
  been observed at 2100 ms, and a `duration-ms` budget grades the worst run, so it is the budget most
  likely to breach first. RC-ENG-3.2 (recover the runtime cost) and RC-ENG-3.1 (re-derive the target
  from measured values) own the fix; either may instead move the startup scenario onto a production
  preview build.

### Baseline and regression

`tests/perf/baseline.json` holds one graded value per budget plus the hardware it was measured on.
`compare.ts` fails when a budget breaches its target, when a budget drifts more than the tolerance
(default 20%, ADR-009) in the bad direction against that baseline, or when a budget was not measured
at all. A budget with no baseline entry yet is reported but does not block.

Re-record a baseline deliberately, never to silence a regression in the PR that caused it:

```bash
pnpm perf:capture && pnpm perf:baseline   # rewrites tests/perf/baseline.json from the fresh run
```

A baseline only means something against like hardware, so `compare.ts` grades drift ONLY when the
run's CPU matches the baseline's. Otherwise it grades the targets, reports the observed values, and
says plainly that drift was not compared — a workstation baseline would otherwise read as a 100%
regression on every CI run and teach everyone to ignore the gate. `--compare-across-hardware`
overrides this for a deliberate comparison.

The checked-in baseline was recorded on a developer workstation (its `host` block says which), so
the first CI runs grade targets only. Record a CI baseline once by running the workflow manually and
committing the run it uploads as the new baseline; RC-ENG-3.1 then promotes the budgets themselves
from `provisional` to `baseline`.

CI (`.github/workflows/perf.yml`) is path-filtered to changes that can plausibly move a budget and
runs capture + compare on the shared runner pool, uploading the run file and a Markdown report.

### What the numbers mean

- A **ceiling** (`lower-is-better`) is graded at its declared percentile: `p95 <= 100ms` means 95% of
  samples are at or under the ceiling.
- A **floor** (`higher-is-better`) is graded at the _complement_: `p95 >= 50fps` means 95% of frames
  are at or above the floor, which is the nearest-rank p5. Grading a frame-rate floor at the p95
  would grade the best frames of a stuttering pan and report jank as a pass.
- A `duration-ms` budget grades the **worst** run, so one slow startup breaches.

## 3. Enforcement

`validateBudgetRegistry` fails closed when a budget is missing an owner, a user-facing risk, or (for
a provisional budget) a valid, un-lapsed `reviewDate`. It is exercised by the core unit test
`packages/core/tests/perf-budget-registry.test.ts`, which runs under `pnpm test:critical`
(and therefore `pnpm test` / `pnpm check`).

Because every budget is still `provisional`, each carries a `reviewDate`. RC-ENG-3.1 promotes them
to `baseline` once the measured values in `tests/perf/baseline.json` have settled on CI hardware.

## 4. When A Budget Matters To A Change

1. If a change touches a budgeted workflow (startup, scene render, widget update, map pan/zoom,
   search, graph indexing, sync/live-session delivery), confirm the relevant budget in the registry.
2. Add or update the measurement in `packages/core/src/perf/measurement.ts` (and its companion perf
   modules) rather than scattering ad-hoc timings, and the scenario that feeds it in
   `scripts/perf/capture.ts`.
3. Do not weaken a target to make a change pass; adjust the registry only through the owned review it
   documents.

## 5. Map Render: The Bake Layer (RC-MAP-3.3)

The map renderer is SVG (ADR-014: the core's map model is already geometric). That is the right
default — every feature is a real node, so hit-testing, focus and the screen-reader inventory come
for free — but it does not survive a generated world. `world.continent` at its densest knobs emits
324 features carrying 17,917 vertices, and roughly 15,000 of those vertices belong to biome
polygons, kingdom territories, lakes and rivers: inert paper with no popover, no drag handle and no
entry in the accessible inventory.

`apps/gm-react/src/app/map/canvas/BakeLayer.tsx` moves exactly those four feature kinds (`fill`,
`room`, `polygon`, `water`) onto a canvas-2d layer painted once and mounted UNDER the interactive
SVG. Everything a person can point at or a screen reader must reach — POIs, tokens, props, doors,
lights, text, roads, walls, routes and the whole fog stack — stays on the SVG. Nothing about
hit-testing moves: the feature SVG is already `pointerEvents: 'none'` and the real hit targets are
the marker divs in `MapMarkers.tsx`, so the canvas is `aria-hidden` decoration by construction.

Three things about the threshold are deliberate:

- **It fires on feature count OR vertex count** (120 / 4000). A world map is a few hundred features
  carrying tens of thousands of vertices; a stamped dungeon floor is the opposite. A count threshold
  high enough to leave a hand-painted map alone would never fire on the dense world it exists for.
- **Below it, the renderer takes the byte-identical old path.** `planBake` returns the input array
  itself, not a copy, so a small map does not even pay a new array identity.
- **The ops are a faithful transcription of `FeatureShape.tsx`** — same tints, opacities and stroke
  widths, colours resolved from the same semantic tokens at paint time. A baked map and an unbaked
  one differ only in frame rate; otherwise the threshold would be a visible mode switch.

The perf sample is `apps/gm-react/src/app/map/canvas/BakeLayer.test.ts`: it runs the real generator
at its densest parameters, projects the result into `MapRenderComplexity` (one drawn SVG feature =
one `visiblePois` unit, the model's per-drawn-element cost; the bake canvas is charged as one
element so baking is never free) and grades it with the core's own `measureMapPanZoom`. Unbaked, the
world breaches `map-pan-zoom-slim`; baked, it passes both device-class budgets.
