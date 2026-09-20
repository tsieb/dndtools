# Performance

## 1. Measured budgets

`PERFORMANCE_BUDGETS` in `packages/core/src/perf/budget-registry.ts` is the authoritative
registry. All eleven entries have `baseline` maturity with `measuredAt: '2026-09-06'`, matching
[the RC-ENG-1.1 recorded artifact](../../tests/perf/baseline.json). Promotion records existing
measurements; it does not change the targets or assert full reference-dataset coverage.

The capture ran on Linux x64, AMD Ryzen 7 5700X (16 logical CPUs), 32,005 MiB RAM, outside CI.
Browser scenarios used Chromium against the Vite development server. These are historical
observations, not measurements of the current commit or production builds.

| Budget                  | Target        | Observed   | Samples | Measured fixture / scope                                              |
| ----------------------- | ------------- | ---------- | ------- | --------------------------------------------------------------------- |
| `smoke-ci`              | ≤ 180000 ms   | 26913 ms   | 1       | Local runner, warm pnpm store; `pnpm test:smoke`                      |
| `app-startup`           | ≤ 2000 ms     | 1006.1 ms  | 3       | Fresh browser context, warm dev-server module cache                   |
| `vault-open`            | ≤ 3000 ms     | 676.7 ms   | 3       | 200 notes + demo content; target: 1,000 notes / 100 objects / 20 maps |
| `scene-first-render`    | ≤ 1500 ms     | 1068.3 ms  | 3       | Demo home scene, 7 widgets; target: 50 widgets / 10 active bindings   |
| `widget-update`         | p95 ≤ 100 ms  | 16.8 ms    | 25      | Accepted move command through repaint on demo home scene              |
| `map-pan-zoom-desktop`  | ≥ 50 fps      | 59.524 fps | 196     | 4 layers / 100 POIs, desktop viewport                                 |
| `map-pan-zoom-slim`     | ≥ 30 fps      | 59.88 fps  | 197     | 4 layers / 100 POIs, slim viewport on the same desktop host           |
| `search`                | p95 ≤ 250 ms  | 13 ms      | 20      | 200 notes + demo content; target: 10,000 indexed records              |
| `graph-indexing`        | ≤ 500 ms      | 248.4 ms   | 5       | One changed note in a 200-note vault; target: 10,000 records          |
| `sync-reconciliation`   | p95 ≤ 2000 ms | 710.7 ms   | 5       | 241 queued operations; target: 1,000                                  |
| `live-session-delivery` | p95 ≤ 500 ms  | 16.8 ms    | 15      | Local player-safe projection through paint; excludes network delivery |

Every recorded value meets its target. The slim map run uses a 390×844 touch-enabled viewport;
the desktop viewport is 1280×800. This does not establish physical mobile-device performance.
Other browser scenarios use the desktop profile. Small samples, reduced fixtures, local session
projection, and workstation hardware limit what these baselines demonstrate. Full-size datasets,
physical mobile devices, network delivery, and a stable CI-hardware baseline need separate evidence;
RC-ENG-1.3 owns the CI baseline and larger sample work.

Each registry entry retains its accountable owner, user-facing risk, target dataset and device
class, and measurement method. `validateBudgetRegistry` checks those fields and baseline dates.
The schema still supports future provisional budgets with review dates; none of the current entries
uses that maturity. Grading lives in `packages/core/src/perf/measurement.ts`; the separate
initial-route bundle budget lives in `perf/bundle-budget.ts` (`pnpm check:bundle-budget`).

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
recorded on a desktop with 16 logical CPUs, so CI runs currently grade targets only; on 2026-09-09 two runs of
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

## 4. The commit path and the boot path (ADR-040)

Two costs decide most of the budgets above, and both were remediated on 2026-09-11.

**A durable commit writes what changed.** `apps/gm-react/src/platform/storage/coreStore.ts`
remembers, per slice, the object reference last committed to IndexedDB and skips a slice whose
reference is unchanged (reducers are immutable). The map is filled only by a committed transaction and
emptied by every other writer of the documents table (load, restore, reset, migration recovery, the
test seams); a new writer must call `forgetPersistedSlices()`. The PLAT-007 boundary request is
`{ next, appended }`: the appended operations are validated entry by entry, the rest of the log by
shape, and the previous state never crosses. `coreStore.test.ts` pins the write set per commit. The
first-run demo seed runs ~42 commands through the reducer and commits once
(`SceneRuntime.seedDemoInOneCommit`). A command re-renders subscribers once: the pending-phase emit
is gone.

**The boot path loads what a boot uses.** The sign-in dialog, the Cognito SDK, the onboarding
overlay, the command palette, the host dialog, the AI key store and `CHANGELOG.md` load on first use;
the map generators are the `@dndtools/core/map-generators` entry, supplied to the reducer through
`CoreEnvironment.mapGenerators` by `SceneRuntime` on the first `map.generate`, and Vite keeps them
in their own chunk. Two traps when extending this: the Vite `manualChunks` rule in `vite.config.ts`
folds every core module into `processing-core`, so a core module can only defer if that rule routes
it elsewhere; and the dev server the perf pipeline measures has no tree-shaking, so anything the
`@dndtools/core` barrel re-exports is fetched on every cold boot whether or not the app uses it.
Removing an export from the barrel is what makes a core module leave the dev-mode boot.

## 5. Measuring a change honestly on a busy machine

The 2026-09-11 numbers were taken while the dispatcher fleet held the load average between 8 and 14,
which inflates every absolute figure. Compare A/B, interleaved, on the same machine and never against
a baseline recorded when it was idle:

```bash
git worktree add /tmp/main-wt main                     # symlink node_modules per entry, NOT wholesale:
                                                       # apps/gm-react/node_modules/@dndtools/core must
                                                       # point at the worktree's own packages/core
# start a dev server per tree on its own port, then alternate main/branch runs at 1x and 4x CPU
# throttle (CDP Emulation.setCPUThrottlingRate); a cold browser context per sample.
```

| Cold boot to a painted `/#/board` (dev server) | `main`       | `perf/remediation-2026-09` |
| ---------------------------------------------- | ------------ | -------------------------- |
| 1× CPU, two interleaved rounds                 | 1876–2066 ms | 1696–1776 ms               |
| 4× CPU (slow-runner reproduction)              | 4873–4967 ms | 2668–3566 ms               |
| `scene.move-widget` dispatch, median / p95     | 17 / 24 ms   | 9 / 14 ms                  |
| Eager production JS (unminified)               | 2172 KiB     | 1863 KiB                   |

On GitHub's `ubuntu-latest` runners (the Performance workflow, targets only, `main` figures are the
six 2026-09-10/11 runs, the branch figure is PR #68 run 34664744164):

| Budget               | `main` on CI      | PR #68 on CI | Target  |
| -------------------- | ----------------- | ------------ | ------- |
| `scene-first-render` | 1514–1725 ms ✗    | 1132 ms      | 1500 ms |
| `app-startup`        | 1177–1390 ms      | 963 ms       | 2000 ms |
| `vault-open`         | 726–942 ms        | 684 ms       | 3000 ms |
| `widget-update` p95  | 33–42 ms          | 24 ms        | 100 ms  |
| `graph-indexing`     | (not in extracts) | 158 ms       | 500 ms  |

Per-command cost at 4× throttle before the change, from a CDP CPU profile of the boot: ~420 ms in
Dexie, ~270 ms serializing states at the boundary, ~240 ms in zod, across the 43 seed commits. After
it, the largest own-time function per command is the boundary's `JSON.stringify` of the next state
(~1 ms at 1× on a 200-note vault; it scales with vault size, and the 5 MiB payload ceiling now
measures one state rather than two).

## 6. When a budget matters to a change

If a change touches a budgeted workflow, add or update the measurement in `perf/measurement.ts` and
the scenario in `scripts/perf/capture.ts` rather than scattering ad hoc timings, and run
`perf:capture` before and after.
