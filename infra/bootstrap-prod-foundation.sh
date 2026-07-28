#!/usr/bin/env bash
# Bootstrap the production foundation stack in a dedicated AWS account.
# Usage:
#   DNDTOOLS_PROD_PROFILE=<aws profile for prod admin role> infra/bootstrap-prod-foundation.sh
# Optional:
#   DNDTOOLS_REGION=ca-central-1
#   DNDTOOLS_NOTIFICATION_EMAIL=trentonsieb@gmail.com
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${DNDTOOLS_PROD_PROFILE:-${DNDTOOLS_PROFILE:-}}"
REGION="${DNDTOOLS_REGION:-ca-central-1}"
NOTIFICATION_EMAIL="${DNDTOOLS_NOTIFICATION_EMAIL:-trentonsieb@gmail.com}"
DEPLOY_FLAGS=()

: "${PROFILE:?set DNDTOOLS_PROD_PROFILE (or DNDTOOLS_PROFILE) to an admin-capable AWS profile for the dedicated prod account}"

AWS_PAGER="" AWS_PROFILE="$PROFILE" aws sts get-caller-identity --output json >/dev/null

if [ "${CI:-false}" = "true" ] || [ "${DNDTOOLS_AUTO_APPROVE_CHANGESET:-false}" = "true" ]; then
  DEPLOY_FLAGS+=(--no-confirm-changeset)
else
  DEPLOY_FLAGS+=(--confirm-changeset)
fi

echo "==> foundation / prod : validate"
sam validate --template "$HERE/foundation/template.yaml" --region "$REGION" --profile "$PROFILE"

echo "==> foundation / prod : build"
sam build \
  --template "$HERE/foundation/template.yaml" \
  --base-dir "$HERE/foundation" \
  --build-dir "$HERE/foundation/.aws-sam/build"

echo "==> foundation / prod : deploy"
(
  cd "$HERE/foundation"
  sam deploy \
    --config-env prod \
    --profile "$PROFILE" \
    --region "$REGION" \
    --capabilities CAPABILITY_NAMED_IAM \
    --resolve-s3 \
    "${DEPLOY_FLAGS[@]}" \
    --parameter-overrides \
      "ProjectName=dndtools" \
      "Stage=prod" \
      "NotificationEmail=$NOTIFICATION_EMAIL" \
      "MonthlyBudgetUsd=40" \
      "GitHubOrg=tsieb" \
      "GitHubRepo=dndtools" \
      "GitHubBranch=main" \
      "GitHubEnvironment=production" \
      "CreateGitHubOidcProvider=true" \
      "CreateApiGatewayAccountRole=true"
)

echo
echo "Production foundation bootstrap complete. Next:"
echo "  1. Confirm the SNS subscription email sent to $NOTIFICATION_EMAIL."
echo "  2. Verify the SES sender identity in the prod account."
echo "  3. Point GitHub production environment AWS_PROD_DEPLOY_ROLE_ARN at the new prod account role."
