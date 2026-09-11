#!/usr/bin/env bash
# Verify Stripe billing (ADR-027) end-to-end against the deployed DEV app-api, in Stripe TEST
# mode (no real money moves). Mints a Cognito test user, then drives verify-billing.mjs:
# entitlement read → hosted Checkout + portal session URLs → webhook signature gate → a REAL
# test-mode subscription created through the Stripe API (pm_card_visa) whose webhook must land
# as the Lantern plan → cancellation must land as the free plan → account deletion must delete
# the Stripe customer. Cleans up the Cognito user and every row it created on every exit path.
# Usage: infra/verify-billing.sh [dev]
set -euo pipefail

STAGE="${1:-dev}"
# Production disables ADMIN_USER_PASSWORD_AUTH and runs Stripe LIVE mode; this script must never
# create a live subscription. Prod is smoke-tested from the runbook with a real card + refund.
if [ "$STAGE" != dev ]; then
  echo "billing verification is dev-only (test mode); see docs/runbooks/stripe-billing.md for prod" >&2
  exit 1
fi
PROJECT="${DNDTOOLS_PROJECT:-dndtools}"
PROFILE="${DNDTOOLS_PROFILE:-dndtools}"
REGION="${DNDTOOLS_REGION:-ca-central-1}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ssm() { aws ssm get-parameter --name "/$PROJECT/$STAGE/$1" --query 'Parameter.Value' --output text --profile "$PROFILE" --region "$REGION"; }
ssm_secret() { aws ssm get-parameter --name "/$PROJECT/$STAGE/$1" --with-decryption --query 'Parameter.Value' --output text --profile "$PROFILE" --region "$REGION"; }

APP_API_URL="$(ssm app-api/url)"
POOL_ID="$(ssm identity/user-pool-id)"
CLIENT_ID="$(ssm identity/app-client-id)"
APP_TABLE="$(ssm app-api/table-name)"
SYNC_TABLE="$(ssm sync/ops-table-name)"
STRIPE_SECRET_KEY="$(ssm_secret billing/stripe-secret-key 2>/dev/null || true)"
BILLING_CONFIG="$(ssm billing/config 2>/dev/null || true)"
if [ -z "$STRIPE_SECRET_KEY" ] || [ -z "$BILLING_CONFIG" ]; then
  echo "billing is not configured for $STAGE — run: STRIPE_SECRET_KEY=sk_test_… pnpm billing:bootstrap -- --stage dev" >&2
  exit 1
fi
case "$STRIPE_SECRET_KEY" in
  *_test_*) ;;
  *) echo "refusing: the $STAGE Stripe key is not a TEST key" >&2; exit 1 ;;
esac

RUN_ID="$(date +%s)-$(openssl rand -hex 4)"
TEST_USER="dndtools-verify-billing-${RUN_ID}@example.invalid"
TEST_PASS="Verify1!$(openssl rand -hex 24)"
ACCOUNT_ID=""

# shellcheck disable=SC2329 # invoked indirectly by the EXIT trap
cleanup() {
  if [ -n "$ACCOUNT_ID" ]; then
    for sk in entitlement profile; do
      aws dynamodb delete-item --table-name "$APP_TABLE" \
        --key "{\"pk\":{\"S\":\"account#$ACCOUNT_ID\"},\"sk\":{\"S\":\"$sk\"}}" \
        --profile "$PROFILE" --region "$REGION" >/dev/null 2>&1 || true
    done
    aws dynamodb delete-item --table-name "$SYNC_TABLE" \
      --key "{\"vaultId\":{\"S\":\"$ACCOUNT_ID#primary\"},\"sk\":{\"S\":\"usage#quota\"}}" \
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

# Account deletion requires the sync service's purge proof. This synthetic user never had a vault,
# so record the zero-usage "deleted" proof the way a completed purge would, and let the script's
# final step prove that deleting the account deletes the Stripe customer too.
aws dynamodb put-item --table-name "$SYNC_TABLE" \
  --item "{\"vaultId\":{\"S\":\"$ACCOUNT_ID#primary\"},\"sk\":{\"S\":\"usage#quota\"},\"state\":{\"S\":\"deleted\"},\"storedBytes\":{\"N\":\"0\"},\"operationCount\":{\"N\":\"0\"}}" \
  --profile "$PROFILE" --region "$REGION" >/dev/null

echo "app-api=$APP_API_URL  user=$TEST_USER"
echo ""
APP_API_URL="$APP_API_URL" TOKEN="$TOKEN" TEST_EMAIL="$TEST_USER" ACCOUNT_ID="$ACCOUNT_ID" \
  STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" BILLING_CONFIG="$BILLING_CONFIG" \
  node "$HERE/../packages/cloud-fns/scripts/verify-billing.mjs"
