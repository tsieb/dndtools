# Shared-runner performance

`Performance` pins Ubuntu 24.04 and runs `scripts/perf/ci.sh`. The committed
`baseline.ci.json` pins a **code reference**, not workstation timing numbers.
The job checks out that SHA, copies the candidate measurement harness into it,
and records a fresh CI baseline on the same physical runner. Both revisions
install their own frozen dependencies. Actual baseline values, reference raw
samples, five candidate captures, comparison reports and `stability.txt` are
uploaded in `perf-run`. No remote branch or baseline file is automatically updated.

Each capture runs every scenario seven independent times. The comparator grades
each batch using the core metric (max duration, p95 latency, p5 FPS), then takes
the median of those seven statistics. This rejects minority noisy batches while
preserving slow-frame/latency tails within a batch. Raw samples and batch grouping
are retained; any empty or invalid batch fails measurement. Report `n` counts
batches, not individual frames. The legacy workstation baseline remains usable
for old captures; refresh it before comparing new aggregation locally.

CI gates regression against the measured CI baseline with 20% tolerance. Absolute
reference-device targets remain visible diagnostics. Missing/incompatible baseline,
missing budgets, fewer than seven batches, or missing provenance fail closed.
Five sequential captures of the unchanged candidate must agree on **every CI gate
verdict**, with numeric drift for all budgets. Agreement alone does not make a
regression pass: each comparison must also pass. This is five captures on one
runner allocation, not evidence of five separate GitHub runner allocations.

To refresh the reference, review the raw evidence and change `referenceCommit` in
`baseline.ci.json` to the accepted full commit SHA. Never set it dynamically to
candidate HEAD: that would baseline away the regression under review. Changes to
the capture protocol must drive both reference and candidate consistently.

Local validation: `pnpm exec vitest run tests/unit/perf-pipeline.test.ts
 tests/unit/perf-baseline.test.ts` (on one line). For runner reproduction, use
`CI=true RUNNER_TEMP=/path/to/scratch bash scripts/perf/ci.sh` from a full checkout
with Node, pnpm, and Playwright Chromium installed. Allow up to 180 minutes.
Actual five-capture CI evidence must come from the workflow artifact; fixture
unit tests do not establish shared-runner timing stability.
