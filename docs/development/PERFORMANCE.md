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
and grades drift only when the run's CPU matches the baseline's. `tests/perf/baseline.json` was
recorded on a 16-core desktop and is for local runs only. On 2026-09-09 two CI runs of one unchanged
commit swung `scene-first-render` between 1125 ms and 1621 ms at n=3, so CI measures differently
(RC-ENG-1.3, `tests/perf/README.md`): each run checks the pinned reference commit in
`tests/perf/baseline.ci.json` out beside the candidate and measures both interleaved, batch by batch,
median of seven. Never loosen a budget to make a run pass.

### 2.1 CI policy: which verdict is binding (RC-ENG-1.4)

`.github/workflows/perf.yml` runs in one of two modes. Each paired run still writes its own
`report-N.md` and `verdict-N.json`, but those are evidence, not the verdict. The job's one binding
verdict comes from `compare.ts --policy`. It goes to the job summary and `policy.json` in the
`perf-run` artifact. Setup, pipeline tests and artifact upload can also fail independently of the performance verdict.

| Mode           | Runs on                                                                       | Paired runs | Binding verdict, once enforcing                                                    | Advisory only                 |
| -------------- | ----------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- | ----------------------------- |
| `scheduled`    | nightly on `main`; `workflow_dispatch` (the default mode)                     | 5           | drift past tolerance (20%, 1.5-frame floor) in any run, or runs disagreeing        | absolute target breaches      |
| `pull-request` | pull requests; pushes to `main` and `loop/rc`; `workflow_dispatch` on request | 2           | a budget breaching its absolute target in **both** repeats, or measured in neither | drift; a breach in one repeat |

**Enforcing** means `baseline.ci.json` has a `recorded` block for the pinned `referenceCommit` and
for this runner class (same `runnerLabel`, OS and core count; the CPU model may differ because the
paired runs cancel machine speed). Until then, and whenever the pinned reference changes, both modes
report and pass: the summary shows what _would_ fail. A lost run fails closed once enforcing, since
a breach cannot be confirmed and agreement cannot be checked without it.

**Recording the baseline.** A scheduled run whose five runs agree writes a proposed
`baseline.ci.json` into the artifact: the reference's per-run values, their median, the runner class
and the run id. The workflow never commits it. To record or re-record one, dispatch the workflow
(`gh workflow run perf.yml --ref main`), check the five runs agree and the numbers look sane, then
copy the artifact's `baseline.ci.json` over `tests/perf/baseline.ci.json` in the delivery PR. Moving
`referenceCommit` puts the policy back into advisory mode until a new recording lands.

**Five scheduled runs on one commit agree.** This is the RC-1 bar (`RC_ROADMAP.md` §2.2). Five
nights on an unchanged `main`, or five dispatches of one SHA, each produce a `policy.json`. Download
them into one directory per run and compare:

```bash
for id in <run-id> ...; do gh run download "$id" -n perf-run -D "tmp/agree/$id"; done
pnpm exec tsx scripts/perf/compare.ts --agreement tmp/agree
```

It fails unless there are at least five, all `scheduled`, each internally stable, on one candidate
and one reference, with the same enforcement, pass/fail and per-budget verdict.

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
