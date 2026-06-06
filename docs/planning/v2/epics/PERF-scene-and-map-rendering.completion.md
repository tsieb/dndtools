# PERF-scene-and-map-rendering — Completion Evidence

Epic: `PERF-scene-and-map-rendering` — PERF: Scene and map rendering
Requirement IDs: PERF-002, PERF-003
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 4 (Scene and Widget
Contract)

Workpack status: `complete`

This epic delivers Scene and map rendering performance as PURE Processing-Core policy that COMPOSES the
PERF infrastructure the prior PERF epics already built — it does NOT invent a parallel grader or a
parallel set of budgets:

- It MEASURES Scene first-render, widget-update, and map pan/zoom against the budgets the PERF-001
  registry ALREADY owns (`apps/v2/packages/core/src/perf/budget-registry.ts` —
  `scene-first-render`, `widget-update`, `map-pan-zoom-desktop`, `map-pan-zoom-slim`), through the
  existing PERF-007 `measureBudget` API (`apps/v2/packages/core/src/perf/measurement.ts`). There is
  exactly one measurement API in the codebase; every Scene/map render grade flows through it and
  inherits its fail-closed semantics (unknown-budget → `error`; no-samples → `unknown`;
  exactly-at-threshold → pass). This mirrors how `perf/bundle-budget.ts` composes the same registry +
  grader for PERF-005.
- It adds a PURE, DETERMINISTIC RENDER-COST MODEL the measurement consumes: a Scene first-render
  estimate from widget complexity (where offscreen/collapsed widgets pay only bookkeeping —
  virtualization) and a map frame-rate estimate from a map's visible complexity scaled by device class.
  The model's map-complexity input shape mirrors the actor-filtered `MapView`
  (`apps/v2/packages/core/src/queries/map-query.ts`) the renderer already consumes, so only VISIBLE
  layers/POIs/fog/routes/tokens count — the same non-leak the query enforces also bounds a player's
  render cost.

All new logic is deterministic over plain data — no DOM/Canvas/WebGL/`requestAnimationFrame`/clock/
entropy/network. Every complexity input, sample, region, and flag is an EXPLICIT input. The module
lives in `@dndtools/v2-core`, imports no Svelte/DOM/platform/v1-runtime code (only type-only imports
from `perf/budget-registry` and `perf/measurement`), and boundary lint stays green.

Per ADR-014, LIVE raf/GPU timing capture is DEFERRED: this owns the DECLARED budgets + the
DETERMINISTIC render-cost model (complexity/samples as explicit inputs) + the breach reporting. The
canvas runtime's real frame timings, the WebGL/Canvas compositor's region-invalidation support flag,
and the real widget-update latencies feed real numbers in later — exactly as `measureBudget` already
takes sample timings as explicit inputs. This is stated as a known/deferred gap below.

## Demo (programmatic)

The capability is exercised through the Processing Core's public surface (`@dndtools/v2-core`). A
reviewer can see the behavior by running the targeted test file, or in a REPL:

```ts
import {
  estimateSceneRenderCost,
  measureSceneFirstRender,
  evaluateSubscriptionBackpressure,
  measureMapPanZoom,
  analyzeFogRegionUpdate,
} from '@dndtools/v2-core';

// PERF-002 AC1 — virtualization: a 50-widget Scene with 45 offscreen renders far cheaper than
// all-visible, and stays under the 1.5s scene-first-render budget.
const widgets = Array.from({ length: 50 }, (_v, i) =>
  i < 5
    ? { offscreen: false, collapsed: false, activeBindings: 2, weight: 3 }
    : { offscreen: true, collapsed: false, activeBindings: 2, weight: 3 },
);
measureSceneFirstRender(widgets).measurement.result; // 'pass'

// PERF-002 AC2 — a 120/s cursor stream with NO backpressure policy is an unbounded render-starvation
// breach; declaring a debounce window bounds it.
evaluateSubscriptionBackpressure({ sourceEventsPerSecond: 120, policy: 'none' }).problem; // 'unbounded-no-policy'
evaluateSubscriptionBackpressure({ sourceEventsPerSecond: 120, policy: 'debounce', windowMs: 50 }).bounded; // true

// PERF-003 AC1 — the SAME map is graded against the desktop 50fps floor vs the slim 30fps floor; the
// slim floor is enforced distinctly (a different budget id + target).
measureMapPanZoom({ visibleLayers: 4, visiblePois: 100, visibleFogRegions: 2, visibleRoutes: 2, visibleTokens: 4 }, 'desktop').measurement.budget?.id; // 'map-pan-zoom-desktop'

// PERF-003 AC2 — a committed fog op invalidates only the layers whose content overlaps its region;
// a renderer that cannot invalidate by region falls back to a full repaint.
analyzeFogRegionUpdate({ x: 0.05, y: 0.05, w: 0.1, h: 0.1 }, layers, { supportsRegionInvalidation: true }).affectedLayerIds;
```

## Requirement coverage / traceability

### PERF-002 — Scene rendering: virtualization, incremental widget updates, bounded subscriptions, backpressure

Story PERF-002-S01.

- AC1: "offscreen or collapsed widgets do not force full rendering work."
  - Code: `estimateSceneRenderCost` / `measureSceneFirstRender` in
    `apps/v2/packages/core/src/perf/scene-map-render.ts`. A widget with `offscreen` or `collapsed`
    pays only `perVirtualizedWidgetMs` (bookkeeping), never its full mount + binding cost.
    `measureSceneFirstRender` grades the estimate against the registry-owned `scene-first-render`
    (`< 1.5s`) budget via `measureBudget`. `measureWidgetUpdate` grades observed widget-update latency
    against `widget-update` (`< 100ms p95`).
  - Tests: `apps/v2/packages/core/tests/perf-scene-map-render.test.ts` —
    "an offscreen widget pays only bookkeeping", "a collapsed widget is virtualized exactly like an
    offscreen one", "a 50-widget Scene with most widgets offscreen renders far cheaper than
    all-visible", "a heavy Scene that virtualizes most widgets is brought back under budget",
    "a HEAVY Scene whose estimate exceeds 1.5s is a BREACH", "EXACTLY at the 1.5s ceiling PASSES".
- AC2: "declared debounce/backpressure policy prevents render starvation."
  - Code: `evaluateSubscriptionBackpressure` in `scene-map-render.ts`. A high-frequency source with
    `policy: 'none'` is `unbounded-no-policy` (breach); a bounded policy without a positive window is
    `missing-window`; a window so small the effective rate still exceeds the starvation bound is
    `effective-rate-too-high`. Fail closed.
  - Tests: "a high-frequency source with NO policy is UNBOUNDED", "a LOW-frequency source with no
    policy is fine", "a debounce policy with a real window bounds a high-frequency source", "throttle
    and sample bound the rate the same way", "a bounded policy WITHOUT a positive window is not
    actually bounded", "a policy whose window is so small the effective rate still starves is a
    breach", "respects a custom starvation bound".

### PERF-003 — Map rendering: explicit budgets for pan/zoom/compositing/fog/POI/nested transitions on desktop and slim

Story PERF-003-S02.

- AC1: "measured frame budget remains within the defined target" (multiple layers + POIs, pan/zoom).
  - Code: `estimateMapFrameRate` / `measureMapPanZoom` / `mapPanZoomBudgetIdForDeviceClass` in
    `scene-map-render.ts`. The per-element costs (layers, POIs, fog, routes, tokens, nested
    transition) are scaled by a device-class multiplier, so the SAME map yields a lower frame rate on
    slim than desktop. `measureMapPanZoom` grades the estimated fps against the device-class budget —
    the `map-pan-zoom-desktop` 50fps floor for desktop, the `map-pan-zoom-slim` 30fps floor for slim —
    so the slim floor is enforced DISTINCTLY.
  - Tests: "the reference map PASSES the desktop 50fps floor", "graded against the SLIM 30fps floor on
    slim (distinct budget id)", "a HEAVY map under the slim floor is a BREACH on slim", "a map that
    BREACHES on slim can still PASS on desktop (the device-class distinction is real)", "EXACTLY at
    the floor PASSES", "a nested-map transition costs extra".
- AC2: "only affected render regions update where the renderer supports it" (fog operation).
  - Code: `analyzeFogRegionUpdate` in `scene-map-render.ts`. With region invalidation supported, only
    the layers whose painted content overlaps the fog op's region repaint (incremental). Without
    support — or for an invalid fog region — it falls back to a FULL repaint (fail closed, never a
    silent stale frame).
  - Tests: "only the layers whose content OVERLAPS the fog region repaint", "a fog op overlapping
    multiple layers repaints exactly those layers", "a renderer WITHOUT region invalidation falls back
    to a FULL repaint", "an INVALID fog region conservatively repaints all layers", "a fog op
    overlapping NO layer repaints nothing".

### Determinism + composition

- Determinism tests for every model/analyzer ("is deterministic — identical … yields an identical
  …"), proving identical complexity/samples produce identical pass/breach/estimate results.
- Composition tests ("uses the canonical PERF registry, never a parallel grader") prove the four
  budget ids are registry-owned, owned by Canvas / Maps respectively, and that grading against a
  registry that does not own the id is an `error` (fail closed), never a silent pass.

## Tests run / quality gates

- `pnpm --filter @dndtools/v2-core test` — PASS (176 files, 2630 tests). Includes the new
  `apps/v2/packages/core/tests/perf-scene-map-render.test.ts` (41 tests).
- `pnpm --filter @dndtools/v2-app test` — PASS (13 files, 65 tests).
- `pnpm v2:typecheck` — PASS (core `tsc --noEmit` clean; app `svelte-check` 0 errors / 0 warnings,
  876 files).
- `pnpm v2:lint` (boundary) — PASS ("v2 boundary lint passed").
- `pnpm lint` (full eslint + nav + tokens + repo audit) — PASS.
- `pnpm docs:validate` — PASS ("docs validation passed").
- `pnpm v2:workpack:validate` — PASS ("v2 workpack validation passed").
- `pnpm v2:gates` — PASS ("quality-gate check passed: 7 gate(s) owned, budgeted, and wired").
- Playwright e2e — SKIPPED, justified: this change is genuinely pure-core. The only non-generated
  files touched are `apps/v2/packages/core/src/perf/scene-map-render.ts` (new),
  `apps/v2/packages/core/src/index.ts` (added exports), and the new core test. No route, layout,
  Svelte component, canvas-runtime, or any visible-flow file was touched, so the rendered desktop /
  mobile e2e flows are unaffected.

## Changed files (full repo-relative paths)

New:

- `apps/v2/packages/core/src/perf/scene-map-render.ts`
- `apps/v2/packages/core/tests/perf-scene-map-render.test.ts`
- `docs/planning/v2/epics/PERF-scene-and-map-rendering.completion.md`

Modified:

- `apps/v2/packages/core/src/index.ts` (export the new render model + measurement surface)
- `docs/planning/v2/epics/PERF-scene-and-map-rendering.yaml` (generated — status)
- `docs/planning/v2/status.yaml` (generated — metrics)
- `docs/planning/v2/workpack-state.yaml` (epic status active → complete)

## Known gaps / deferred items

- LIVE raf/GPU timing capture is DEFERRED per ADR-014. This epic owns the declared budgets + the
  deterministic render-cost model (complexity/samples as explicit inputs) + the breach reporting. The
  canvas runtime's real frame timings, the compositor's actual region-invalidation support flag, and
  real widget-update latencies feed real numbers into the SAME `measureBudget` later. No live profiler
  is wired into a route in this epic.
- The render-cost models (`DEFAULT_SCENE_RENDER_COST_MODEL`, `DEFAULT_MAP_RENDER_COST_MODEL`) are
  provisional per-unit estimates, not measured baselines — consistent with the registry budgets all
  being `provisional` per ADR-014. They are explicit, tunable inputs so a measured baseline replaces
  them without an API change.
- No GUI surface is added in this epic (pure Processing-Core policy). Wiring the live canvas runtime to
  feed real samples into these measurements is a separate integration step.

## Git evidence

- Branch: `epic/PERF-scene-and-map-rendering` (created from the prior epic tip HEAD `90f0665`).
- Commits on this branch:
  - `8ccf539` — `feat(v2): complete PERF-scene-and-map-rendering epic` (code + tests + completion
    evidence).
  - `1c25453` — `docs(v2): mark PERF-scene-and-map-rendering complete` (regenerated planning files).
  - A follow-up `docs(v2): record commit SHA …` commit records these SHAs in this evidence file.

Final `git status --short` (after the completion commits) is empty (clean slate):

```
```
