#!/usr/bin/env bash
# Verify E2EE cloud sync end-to-end against the deployed sync-api. Mints a Cognito
# token (admin flow), drives the encrypted push/pull/snapshot/restore + fail-closed
# checks (verify-sync.mjs), then INDEPENDENTLY confirms the raw S3 objects the server
# stored are ciphertext (the plaintext secret never appears at rest).
# Usage: infra/verify-sync.sh [stage]
set -euo pipefail

STAGE="${1:-dev}"
# Production deliberately disables ADMIN_USER_PASSWORD_AUTH. Keep this privileged
# synthetic-user flow dev-only; production uses the non-mutating promotion probes.
if [ "$STAGE" != dev ]; then
  echo "deep sync verification is dev-only (production disables admin password auth)" >&2
  exit 1
fi
PROJECT="${DNDTOOLS_PROJECT:-dndtools}"
PROFILE="${DNDTOOLS_PROFILE:-dndtools}"
REGION="${DNDTOOLS_REGION:-ca-central-1}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ssm() { aws ssm get-parameter --name "/$PROJECT/$STAGE/$1" --query 'Parameter.Value' --output text --profile "$PROFILE" --region "$REGION"; }

SYNC_URL="$(ssm sync/api-url)"
POOL_ID="$(ssm identity/user-pool-id)"
CLIENT_ID="$(ssm identity/app-client-id)"
APP_TABLE="$(ssm app-api/table-name)"
SYNC_TABLE="$(ssm sync/ops-table-name)"
RUN_ID="$(date +%s)-$(openssl rand -hex 4)"
TEST_USER="dndtools-verify-${RUN_ID}@example.invalid"
TEST_PASS="Verify1!$(openssl rand -hex 24)"
# The service intentionally exposes one bounded account vault; verification must use
# that canonical id rather than manufacturing extra quota partitions.
VAULT_ID="primary"
ACCOUNT_ID=""
VAULT_PURGED=0

# Always remove the Cognito identity. The vault is purged below while the token is
# still valid; this trap remains the last-resort identity cleanup on every exit path.
# shellcheck disable=SC2329 # invoked indirectly by the EXIT trap
cleanup() {
  if [ -n "$ACCOUNT_ID" ] && [ "$VAULT_PURGED" = 1 ]; then
    aws dynamodb delete-item --table-name "$SYNC_TABLE" \
      --key "{\"vaultId\":{\"S\":\"$ACCOUNT_ID#$VAULT_ID\"},\"sk\":{\"S\":\"usage#quota\"}}" \
      --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1 || true
  fi
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

echo "sync=$SYNC_URL"
echo ""
RC=0
SYNC_URL="$SYNC_URL" TOKEN="$TOKEN" VAULT_ID="$VAULT_ID" \
  pnpm --dir "$HERE/.." exec tsx "$HERE/verify-sync.mjs" || RC=$?

# --- Independent at-rest check: the S3 objects the server wrote must be ciphertext. ----
BUCKET="$(aws cloudformation describe-stacks --stack-name "$PROJECT-$STAGE-sync-api" \
  --query "Stacks[0].Outputs[?OutputKey=='CiphertextBucket'].OutputValue" --output text --profile "$PROFILE" --region "$REGION")"
echo ""
echo "  bucket=$BUCKET — scanning stored objects for the plaintext secret…"
TMP="$(mktemp -d)"
if ! aws s3 cp "s3://$BUCKET/$ACCOUNT_ID/$VAULT_ID/" "$TMP/" --recursive \
  --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1; then
  echo "  ✗ could not read back the verification ciphertext from S3"
  RC=1
elif grep -rql "phylactery-beneath-the-chapel" "$TMP" 2>/dev/null; then
  echo "  ✗ a stored S3 object contains the plaintext secret (E2EE FAILED)"
  RC=1
else
  echo "  ✓ no stored S3 object contains the plaintext secret (ciphertext at rest confirmed)"
fi
rm -rf "$TMP"

# Physically purge the exact test vault, including S3 object versions, before the
# ephemeral Cognito identity is removed. DELETE is bounded, so page until complete.
if ! SYNC_URL="$SYNC_URL" TOKEN="$TOKEN" VAULT_ID="$VAULT_ID" node --input-type=module <<'NODE'
const base = process.env.SYNC_URL.replace(/\/$/, '');
for (let page = 0; page < 100; page += 1) {
  const response = await fetch(`${base}/vaults/${encodeURIComponent(process.env.VAULT_ID)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${process.env.TOKEN}` },
  });
  if (!response.ok) throw new Error(`test-vault cleanup failed with ${response.status}`);
  const result = await response.json();
  if (result.hasMore === false) process.exit(0);
  if (result.hasMore !== true || !Number.isSafeInteger(result.deleted) || result.deleted < 1) {
    throw new Error('test-vault cleanup returned an invalid progress response');
  }
}
throw new Error('test-vault cleanup exceeded 100 bounded pages');
NODE
then
  echo "  ✗ failed to purge the verification vault" >&2
  RC=1
else
  echo "  ✓ verification vault physically purged"
  VAULT_PURGED=1
fi

exit $RC
