#!/usr/bin/env bash
# Verify E2EE cloud sync end-to-end against the deployed sync-api. Mints a Cognito
# token (admin flow), drives the encrypted push/pull/snapshot/restore + fail-closed
# checks (verify-sync.mjs), then INDEPENDENTLY confirms the raw S3 objects the server
# stored are ciphertext (the plaintext secret never appears at rest).
# Usage: infra/verify-sync.sh [stage]
set -euo pipefail

STAGE="${1:-dev}"
PROJECT="${DNDTOOLS_PROJECT:-dndtools}"
PROFILE="${DNDTOOLS_PROFILE:-dndtools}"
REGION="${DNDTOOLS_REGION:-ca-central-1}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ssm() { aws ssm get-parameter --name "/$PROJECT/$STAGE/$1" --query 'Parameter.Value' --output text --profile "$PROFILE" --region "$REGION"; }

SYNC_URL="$(ssm sync/api-url)"
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

echo "sync=$SYNC_URL"
echo ""
SYNC_URL="$SYNC_URL" TOKEN="$TOKEN" pnpm --dir "$HERE/.." exec tsx "$HERE/verify-sync.mjs"
RC=$?

# --- Independent at-rest check: the S3 objects the server wrote must be ciphertext. ----
BUCKET="$(aws cloudformation describe-stacks --stack-name "$PROJECT-$STAGE-sync-api" \
  --query "Stacks[0].Outputs[?OutputKey=='CiphertextBucket'].OutputValue" --output text --profile "$PROFILE" --region "$REGION")"
echo ""
echo "  bucket=$BUCKET — scanning stored objects for the plaintext secret…"
TMP="$(mktemp -d)"
aws s3 cp "s3://$BUCKET/" "$TMP/" --recursive --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1 || true
if grep -rql "phylactery-beneath-the-chapel" "$TMP" 2>/dev/null; then
  echo "  ✗ a stored S3 object contains the plaintext secret (E2EE FAILED)"
  RC=1
else
  echo "  ✓ no stored S3 object contains the plaintext secret (ciphertext at rest confirmed)"
fi
rm -rf "$TMP"

exit $RC
