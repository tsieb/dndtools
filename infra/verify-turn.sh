#!/usr/bin/env bash
# Verify real TURN relay allocation end-to-end (see verify-turn.mjs). Mints a
# Cognito token via the admin flow, then drives two relay-only WebRTC peers.
# Usage: infra/verify-turn.sh [stage]
set -euo pipefail

STAGE="${1:-dev}"
# Production deliberately disables ADMIN_USER_PASSWORD_AUTH. Keep this privileged
# synthetic-user flow dev-only; production uses the non-mutating promotion probes.
if [ "$STAGE" != dev ]; then
  echo "deep TURN verification is dev-only (production disables admin password auth)" >&2
  exit 1
fi
PROJECT="${DNDTOOLS_PROJECT:-dndtools}"
PROFILE="${DNDTOOLS_PROFILE:-dndtools}"
REGION="${DNDTOOLS_REGION:-ca-central-1}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ssm() { aws ssm get-parameter --name "/$PROJECT/$STAGE/$1" --query 'Parameter.Value' --output text --profile "$PROFILE" --region "$REGION"; }

WS_URL="$(ssm signaling/ws-url)"
POOL_ID="$(ssm identity/user-pool-id)"
CLIENT_ID="$(ssm identity/app-client-id)"
APP_TABLE="$(ssm app-api/table-name)"
RUN_ID="$(date +%s)-$(openssl rand -hex 4)"
TEST_USER="dndtools-verify-${RUN_ID}@example.invalid"
TEST_PASS="Verify1!$(openssl rand -hex 24)"
ACCOUNT_ID=""

# Ephemeral test user: delete it on exit so no known-credentials account lingers.
cleanup() {
  if [ -n "$ACCOUNT_ID" ]; then
    aws dynamodb delete-item --table-name "$APP_TABLE" \
      --key "{\"pk\":{\"S\":\"account#$ACCOUNT_ID\"},\"sk\":{\"S\":\"entitlement\"}}" \
      --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1 || true
  fi
  aws cognito-idp admin-delete-user --user-pool-id "$POOL_ID" --username "$TEST_USER" \
    --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1 || true
}
trap cleanup EXIT

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
ACCOUNT_ID="$(TOKEN="$TOKEN" node --input-type=module -e \
  'const p=process.env.TOKEN?.split(".")[1]; const s=p && JSON.parse(Buffer.from(p,"base64url")).sub; if(!s) process.exit(1); process.stdout.write(s)')"
aws dynamodb put-item --table-name "$APP_TABLE" \
  --item "{\"pk\":{\"S\":\"account#$ACCOUNT_ID\"},\"sk\":{\"S\":\"entitlement\"},\"plan\":{\"S\":\"lantern\"},\"simulated\":{\"BOOL\":true}}" \
  --profile "$PROFILE" --region "$REGION" >/dev/null

echo "ws=$WS_URL"
echo ""
WS_URL="$WS_URL" TOKEN="$TOKEN" node "$HERE/verify-turn.mjs"
