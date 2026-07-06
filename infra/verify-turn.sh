#!/usr/bin/env bash
# Verify real TURN relay allocation end-to-end (see verify-turn.mjs). Mints a
# Cognito token via the admin flow, then drives two relay-only WebRTC peers.
# Usage: infra/verify-turn.sh [stage]
set -euo pipefail

STAGE="${1:-dev}"
PROJECT="${DNDTOOLS_PROJECT:-dndtools}"
PROFILE="${DNDTOOLS_PROFILE:-dndtools}"
REGION="${DNDTOOLS_REGION:-ca-central-1}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ssm() { aws ssm get-parameter --name "/$PROJECT/$STAGE/$1" --query 'Parameter.Value' --output text --profile "$PROFILE" --region "$REGION"; }

WS_URL="$(ssm signaling/ws-url)"
POOL_ID="$(ssm identity/user-pool-id)"
CLIENT_ID="$(ssm identity/app-client-id)"
TEST_USER="signaling-verify@example.com"
TEST_PASS="Verify-Signaling-2026"

aws cognito-idp admin-create-user --user-pool-id "$POOL_ID" --username "$TEST_USER" \
  --message-action SUPPRESS \
  --user-attributes Name=email,Value="$TEST_USER" Name=email_verified,Value=true \
  --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1 || true
aws cognito-idp admin-set-user-password --user-pool-id "$POOL_ID" --username "$TEST_USER" \
  --password "$TEST_PASS" --permanent --profile "$PROFILE" --region "$REGION" >/dev/null

TOKEN="$(aws cognito-idp admin-initiate-auth --user-pool-id "$POOL_ID" --client-id "$CLIENT_ID" \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="$TEST_USER",PASSWORD="$TEST_PASS" \
  --query 'AuthenticationResult.IdToken' --output text --profile "$PROFILE" --region "$REGION")"
[ -n "$TOKEN" ] && [ "$TOKEN" != "None" ] || { echo "failed to mint token"; exit 1; }

echo "ws=$WS_URL"
echo ""
WS_URL="$WS_URL" TOKEN="$TOKEN" node "$HERE/verify-turn.mjs"
