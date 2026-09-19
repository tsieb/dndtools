#!/usr/bin/env bash
# Paired, interleaved measurement: the pinned reference and the candidate are measured batch by
# batch on the same runner in the same minutes, so a runner that changes speed mid-job moves both.
set -euo pipefail
repo_root=$(pwd)
output="$repo_root/tmp/perf"
reference_dir="${RUNNER_TEMP:?}/perf-reference"
# Separate ports: a capture reuses any server already listening, so the reference revision's dev
# server must never be mistaken for the candidate's (or another checkout's on a shared host).
candidate_port="${PERF_PORT:-5273}"
reference_port="${PERF_REFERENCE_PORT:-5373}"
mkdir -p "$output"
reference_sha=$(node -p "require('./tests/perf/baseline.ci.json').referenceCommit")
tolerance=$(node -p "require('./tests/perf/baseline.ci.json').tolerance")
export PERF_RUNNER_LABEL
PERF_RUNNER_LABEL=$(node -p "require('./tests/perf/baseline.ci.json').runnerLabel")
[[ "$reference_sha" =~ ^[0-9a-f]{40}$ ]]
git worktree add --detach "$reference_dir" "$reference_sha"
trap 'git worktree remove --force "$reference_dir"' EXIT
# The reference supplies only its app, dependencies and smoke target; the candidate's capture
# harness drives both revisions, so a protocol change always applies to both sides.
(cd "$reference_dir" && ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile)
# PERF_RUNS: five for the scheduled agreement check (the default), two interleaved repeats on a pull
# request (RC-ENG-1.4). The workflow's policy step, not this exit status, decides the job.
runs="${PERF_RUNS:-5}"
[[ "$runs" =~ ^[1-9]$ ]]
failed=0
for run in $(seq 1 "$runs"); do
  # Complete all five even if one fails, retaining evidence of disagreement. A missing run or
  # baseline file fails the later steps closed; stability.ts then rejects the set.
  pnpm perf:capture -- --out "$output/current-$run.json" --port "$candidate_port" \
    --reference-root "$reference_dir" --reference-port "$reference_port" \
    --reference-out "$output/reference-$run.json" || failed=1
  pnpm perf:baseline -- --ci --run "$output/reference-$run.json" \
    --baseline "$output/baseline-$run.json" --tolerance "$tolerance" || failed=1
  pnpm perf:compare -- --ci --run "$output/current-$run.json" --baseline "$output/baseline-$run.json" \
    --tolerance "$tolerance" --markdown "$output/report-$run.md" --json "$output/verdict-$run.json" || failed=1
done
if [[ "$runs" == 5 ]]; then
  pnpm exec tsx scripts/perf/stability.ts "$output" || failed=1
fi
exit "$failed"
