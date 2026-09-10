# Shared-runner performance

`Performance` pins Ubuntu 24.04 and runs `scripts/perf/ci.sh`. The committed
`baseline.ci.json` pins a **code reference**, not workstation timing numbers.
The job checks that SHA out into a second worktree and installs its frozen
dependencies. The candidate's `capture.ts` then starts a dev server for each
revision and measures them **interleaved**: for every scenario, a reference batch
and a candidate batch run back to back, seven times, alternating which goes
first. Each of the five runs writes its reference capture, the CI baseline derived
from it, the candidate capture, a comparison report and a verdict file.
`stability.txt` records the five-run agreement check. All of it is uploaded in
`perf-run`. No remote branch or baseline file is automatically updated.

Why interleaved: measuring the reference once up front and the candidates
afterwards lets anything that changes the machine's speed mid-job (a noisy
neighbour, thermal or credit throttling) read as drift. A local run on 2026-09-10
did exactly that. Another checkout's e2e suite started partway through the
reference capture, and the first candidate then read +34% on `app-startup` and
+36% on `vault-open` against identical app code. Every one of its seven
`app-startup` batches was slower than every reference batch, so no outlier
rejection could have saved it. Pairing batches in time moves both revisions
together.

Each side runs every scenario seven independent times. The comparator grades
each batch using the core metric (max duration, p95 latency, p5 FPS), then takes
the median of those seven statistics. This rejects minority noisy batches while
preserving slow-frame/latency tails within a batch. Raw samples and batch grouping
are retained; any empty or invalid batch fails measurement, on both sides of the
pair. Report `n` counts batches, not individual frames. The legacy workstation
baseline remains usable for old captures; refresh it before comparing new
aggregation locally.

CI gates regression against the measured CI baseline with 20% tolerance. Absolute
reference-device targets remain visible diagnostics. Missing/incompatible baseline,
missing budgets, fewer than seven batches, or missing provenance fail closed.
Five consecutive paired runs of the unchanged candidate must agree on **every CI
gate verdict**, with numeric drift for all budgets. Agreement alone does not make
a regression pass: each comparison must also pass. This is five runs on one runner
allocation, not evidence of five separate GitHub runner allocations.

To refresh the reference, review the raw evidence and change `referenceCommit` in
`baseline.ci.json` to the accepted full commit SHA. Never set it dynamically to
candidate HEAD: that would baseline away the regression under review. The
candidate's capture harness always drives both revisions, so a protocol change
applies to both sides.

Local validation: `pnpm exec vitest run tests/unit/perf-pipeline.test.ts
 tests/unit/perf-baseline.test.ts` (on one line). For runner reproduction, use
`CI=true RUNNER_TEMP=/path/to/scratch bash scripts/perf/ci.sh` from a full checkout
with Node, pnpm, and Playwright Chromium installed. Allow up to 300 minutes.
The reference and candidate dev servers listen on `PERF_REFERENCE_PORT` (5373) and
`PERF_PORT` (5273). A paired capture refuses to reuse a server already on either
port, so on a shared host pick ports no other checkout is using. `taskset -c 0-3`
approximates the 4-vCPU hosted runner.
Actual five-run CI evidence must come from the workflow artifact; fixture
unit tests do not establish shared-runner timing stability.
