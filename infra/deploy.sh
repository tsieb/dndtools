#!/usr/bin/env bash
# Deploy one dndtools infra stack for one stage.
# Usage: infra/deploy.sh <stack> [stage]
#   <stack>  foundation | identity | signaling | turn | sync-api | web-hosting
#   [stage]  dev (default) | prod
#
# Thin wrapper around `sam build && sam deploy --config-env <stage>` run from the
# stack directory. Each stack's samconfig.toml carries the profile/region/params.
set -euo pipefail

STACK="${1:?usage: infra/deploy.sh <stack> [stage]}"
STAGE="${2:-dev}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$HERE/$STACK"

[ -d "$STACK_DIR" ] || { echo "unknown stack: $STACK (no dir $STACK_DIR)" >&2; exit 1; }
[ -f "$STACK_DIR/template.yaml" ] || { echo "no template.yaml in $STACK_DIR" >&2; exit 1; }

echo "==> $STACK / $STAGE : validate"
sam validate --lint --template "$STACK_DIR/template.yaml"

echo "==> $STACK / $STAGE : build"
sam build --template "$STACK_DIR/template.yaml" --base-dir "$STACK_DIR" \
  --build-dir "$STACK_DIR/.aws-sam/build"

echo "==> $STACK / $STAGE : deploy"
( cd "$STACK_DIR" && sam deploy --config-env "$STAGE" )

echo "==> $STACK / $STAGE : done"
