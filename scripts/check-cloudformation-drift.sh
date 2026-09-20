#!/usr/bin/env bash
# Detect out-of-band changes to deployed dndtools CloudFormation stacks.
set -euo pipefail

STAGE="${1:-dev}"
PROFILE="${DNDTOOLS_PROFILE:-dndtools}"
REGION="${DNDTOOLS_REGION:-ca-central-1}"
STACKS=(foundation identity turn signaling sync-api app-api edge-waf web-hosting)
DRIFTED=()

for component in "${STACKS[@]}"; do
  stack="dndtools-${STAGE}-${component}"
  # Every stack but edge-waf is regional to this project. edge-waf holds the CloudFront-scope WAF
  # web ACL, which AWS only allows in us-east-1, so drift-checking it in $REGION would silently
  # report "stack not deployed" forever — the failure this per-stack override exists to prevent.
  # (edge-cert is likewise us-east-1 but carries no stage in its name and is not checked here.)
  stack_region="$REGION"
  if [ "$component" = "edge-waf" ]; then
    stack_region="us-east-1"
  fi
  if [ "$component" = "foundation" ]; then
    echo "::notice title=Foundation drift skipped::$stack contains global Budget/Cost Explorer resources that do not report deterministic CloudFormation drift; review it through bootstrap-admin changes instead"
    continue
  fi
  if ! aws cloudformation describe-stacks --stack-name "$stack" --profile "$PROFILE" --region "$stack_region" >/dev/null 2>&1; then
    echo "::notice title=Stack not deployed::$stack does not exist; skipping drift detection"
    continue
  fi

  detection_id="$(aws cloudformation detect-stack-drift \
    --stack-name "$stack" \
    --query StackDriftDetectionId \
    --output text \
    --profile "$PROFILE" \
    --region "$stack_region")"

  detection_status=DETECTION_IN_PROGRESS
  stack_status=UNKNOWN
  for _ in $(seq 1 60); do
    read -r detection_status stack_status < <(aws cloudformation describe-stack-drift-detection-status \
      --stack-drift-detection-id "$detection_id" \
      --query '[DetectionStatus,StackDriftStatus]' \
      --output text \
      --profile "$PROFILE" \
      --region "$stack_region")
    if [ "$detection_status" != DETECTION_IN_PROGRESS ]; then break; fi
    sleep 5
  done

  if [ "$detection_status" != DETECTION_COMPLETE ]; then
    echo "::error title=Drift detection failed::$stack finished with $detection_status"
    DRIFTED+=("$stack:$detection_status")
  elif [ "$stack_status" = DRIFTED ]; then
    echo "::error title=CloudFormation drift::$stack has out-of-band changes"
    DRIFTED+=("$stack:DRIFTED")
  else
    echo "$stack: $stack_status"
  fi
done

if [ "${#DRIFTED[@]}" -gt 0 ]; then
  echo "CloudFormation drift check failed: ${DRIFTED[*]}" >&2
  exit 1
fi

echo "CloudFormation drift check passed for stage $STAGE"
