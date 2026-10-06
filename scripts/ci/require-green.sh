#!/usr/bin/env bash
# Succeeds only when the aggregate CI check (`ci-gate`) already passed on the exact commit.
#
#   scripts/ci/require-green.sh <sha> [--repo owner/name]
#
# Status checks belong to a commit, not a branch, so a candidate that went green on `loop/rc`
# is green when the same SHA is fast-forwarded to `main`, tagged, promoted or released. Every
# workflow that ships a commit asks this question instead of re-running the whole gate.
# Needs `gh` with a token that can read checks (GITHUB_TOKEN is enough).
set -euo pipefail

SHA=${1:?usage: require-green.sh <sha> [--repo owner/name]}
REPO=${GITHUB_REPOSITORY:-}
if [[ "${2:-}" == --repo ]]; then REPO=${3:?--repo needs owner/name}; fi
test -n "$REPO" || { echo 'require-green: set GITHUB_REPOSITORY or pass --repo' >&2; exit 2; }
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "require-green: not a full commit SHA: $SHA" >&2; exit 2; }

CHECK=${CI_GATE_CHECK_NAME:-ci-gate}
RESULT=$(gh api "repos/$REPO/commits/$SHA/check-runs?check_name=$CHECK&per_page=100" \
  --jq '[.check_runs[] | select(.status == "completed")] | sort_by(.completed_at) | last | .conclusion // "none"')
if [[ "$RESULT" == success ]]; then
  echo "require-green: $CHECK passed on $SHA"
  exit 0
fi
echo "require-green: $CHECK on $SHA is '$RESULT' (need success). Run the CI workflow on this commit first." >&2
exit 1
