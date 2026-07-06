#!/usr/bin/env bash
# End-to-end verification of the signaling stack against real deployed infra.
# Reads coordinates from SSM, mints a Cognito ID token for a suppressed test user
# via the IAM-gated admin auth flow, then runs infra/verify-signaling.mjs.
#
# Usage: infra/verify-signaling.sh [stage]
set -euo pipefail

STAGE="${1:-dev}"
PROJECT="${PROJECT:-dndtools}"
# Default hard to the dndtools profile; override with DNDTOOLS_PROFILE, NOT the
# ambient AWS_PROFILE (which may point at an unrelated SSO session).
PROFILE="${DNDTOOLS_PROFILE:-dndtools}"
REGION="${DNDTOOLS_REGION:-ca-central-1}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ssm() { aws ssm get-parameter --name "/$PROJECT/$STAGE/$1" --query 'Parameter.Value' --output text --profile "$PROFILE" --region "$REGION"; }

WS_URL="$(ssm signaling/ws-url)"
POOL_ID="$(ssm identity/user-pool-id)"
CLIENT_ID="$(ssm identity/app-client-id)"

TEST_USER="signaling-verify@example.com"
TEST_PASS="Verify-Signaling-2026"

echo "ws=$WS_URL pool=$POOL_ID"

# Ensure the test user exists with a permanent password (idempotent).
aws cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" --username "$TEST_USER" \
  --message-action SUPPRESS \
  --user-attributes Name=email,Value="$TEST_USER" Name=email_verified,Value=true \
  --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1 || true
aws cognito-idp admin-set-user-password \
  --user-pool-id "$POOL_ID" --username "$TEST_USER" \
  --password "$TEST_PASS" --permanent \
  --profile "$PROFILE" --region "$REGION" >/dev/null

# Mint an ID token via the admin flow.
TOKEN="$(aws cognito-idp admin-initiate-auth \
  --user-pool-id "$POOL_ID" --client-id "$CLIENT_ID" \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="$TEST_USER",PASSWORD="$TEST_PASS" \
  --query 'AuthenticationResult.IdToken' --output text \
  --profile "$PROFILE" --region "$REGION")"

[ -n "$TOKEN" ] && [ "$TOKEN" != "None" ] || { echo "failed to mint token"; exit 1; }
echo "minted ID token (len ${#TOKEN})"
echo ""

WS_URL="$WS_URL" TOKEN="$TOKEN" node "$HERE/verify-signaling.mjs"
