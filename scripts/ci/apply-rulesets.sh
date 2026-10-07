#!/usr/bin/env bash
# Create or update the branch rulesets documented in docs/development/GIT_WORKFLOW.md §3.
# Idempotent: a ruleset with the same name is updated in place. Needs `gh` with admin rights.
#
#   scripts/ci/apply-rulesets.sh [owner/repo]
set -euo pipefail

REPO=${1:-${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}}
CHECK=${CI_GATE_CHECK_NAME:-ci-gate}

apply() {
  local name=$1 body=$2 previous=${3:-}
  local id
  id=$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$name\" or .name == \"$previous\") | .id" 2>/dev/null | head -1 || true)
  if [[ -n "$id" ]]; then
    gh api --method PUT "repos/$REPO/rulesets/$id" --input - <<<"$body" >/dev/null
    echo "updated ruleset '$name' ($id)"
  else
    gh api --method POST "repos/$REPO/rulesets" --input - <<<"$body" >/dev/null
    echo "created ruleset '$name'"
  fi
}

# main: every pushed commit must already carry a passing ci-gate (status checks belong to the
# commit, so the dispatcher's fast-forward from loop/rc satisfies it). Admins bypass only via PR.
# No linear-history rule: a change merged to main directly is merged back into loop/rc by the
# dispatcher, and that merge commit later fast-forwards onto main.
apply 'main: green, no force push' "$(cat <<JSON
{
  "name": "main: green, no force push",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/main"], "exclude": [] } },
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [ { "context": "$CHECK" } ]
      } }
  ]
}
JSON
)" 'main: green, linear, no force push'

# loop/rc: the dispatcher's fast-forward-only integration branch. No status check here: the
# commits it pushes have never been on GitHub, and CI runs on the push. Merge commits are
# allowed: the dispatcher's merge-back of main is one.
apply 'loop/rc: no force push' "$(cat <<JSON
{
  "name": "loop/rc: no force push",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/loop/rc"], "exclude": [] } },
  "bypass_actors": [],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" }
  ]
}
JSON
)" 'loop/rc: linear, no force push'
