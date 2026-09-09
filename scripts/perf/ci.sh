#!/usr/bin/env bash
# Paired reference/candidate measurements avoid comparing different physical runner hosts.
set -euo pipefail
repo_root=$(pwd)
output="$repo_root/tmp/perf"
reference_dir="${RUNNER_TEMP:?}/perf-reference"
mkdir -p "$output"
reference_sha=$(node -p "require('./tests/perf/baseline.ci.json').referenceCommit")
tolerance=$(node -p "require('./tests/perf/baseline.ci.json').tolerance")
export PERF_RUNNER_LABEL
PERF_RUNNER_LABEL=$(node -p "require('./tests/perf/baseline.ci.json').runnerLabel")
[[ "$reference_sha" =~ ^[0-9a-f]{40}$ ]]
git worktree add --detach "$reference_dir" "$reference_sha"
trap 'git worktree remove --force "$reference_dir"' EXIT
# The same measurement implementation must drive both revisions.
cp scripts/perf/capture.ts "$reference_dir/scripts/perf/capture.ts"
(
  cd "$reference_dir"
  ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile
  pnpm perf:capture -- --out "$output/reference.json"
)
pnpm perf:baseline -- --ci --run "$output/reference.json" --baseline "$output/baseline.ci.json" --tolerance "$tolerance"
failed=0
for run in 1 2 3 4 5; do
  pnpm perf:capture -- --out "$output/current-$run.json"
  # Complete all five even if a budget breaches, retaining evidence of disagreement.
  pnpm perf:compare -- --ci --run "$output/current-$run.json" --baseline "$output/baseline.ci.json" \
    --tolerance "$tolerance" --markdown "$output/report-$run.md" --json "$output/verdict-$run.json" || failed=1
done
pnpm exec tsx scripts/perf/stability.ts "$output" || failed=1
exit "$failed"
