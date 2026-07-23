#!/usr/bin/env bash
# Deploy one dndtools infra stack for one stage.
# Usage: infra/deploy.sh <stack> [stage]
#   <stack>  foundation | identity | signaling | turn | sync-api | app-api | web-hosting
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
case "$STAGE" in
  dev|prod) ;;
  *) echo "unknown stage: $STAGE (expected dev or prod)" >&2; exit 1 ;;
esac

if [ "${CI:-false}" = "true" ] && [ "$STACK" = "foundation" ]; then
  echo "foundation is bootstrap-admin only; the OIDC deploy role cannot mutate itself or its boundary" >&2
  exit 1
fi

# Stacks whose Lambdas import @dndtools/core need the cloud-fns bundle built first.
case "$STACK" in
  signaling|sync-api|app-api)
    echo "==> building @dndtools/cloud-fns (Lambda bundles)"
    ( cd "$HERE/.." && pnpm --filter @dndtools/cloud-fns build )
    ;;
esac

echo "==> $STACK / $STAGE : validate (service-side, blocking)"
sam validate --template "$STACK_DIR/template.yaml" --region "${DNDTOOLS_REGION:-ca-central-1}" --profile "${DNDTOOLS_PROFILE:-dndtools}"

echo "==> $STACK / $STAGE : lint (advisory — bundled cfn-lint spec can lag AWS)"
sam validate --lint --template "$STACK_DIR/template.yaml" --region "${DNDTOOLS_REGION:-ca-central-1}" --profile "${DNDTOOLS_PROFILE:-dndtools}" || \
  echo "    (lint reported findings; review above — not blocking deploy)"

echo "==> $STACK / $STAGE : build"
sam build --template "$STACK_DIR/template.yaml" --base-dir "$STACK_DIR" \
  --build-dir "$STACK_DIR/.aws-sam/build"

echo "==> $STACK / $STAGE : deploy"
# --no-fail-on-empty-changeset: a path-filtered CI redeploy of an unchanged template
# is a no-op, not an error (sam otherwise exits non-zero on "no changes").
DEPLOY_FLAGS=(--no-fail-on-empty-changeset)
if [ "${CI:-false}" = "true" ]; then
  # The protected GitHub environment is the production approval boundary. Avoid an impossible
  # interactive SAM prompt on a headless runner; local prod deploys keep confirm_changeset=true.
  DEPLOY_FLAGS+=(--no-confirm-changeset)
fi
DEPLOY_OVERRIDES=()
SYNC_OPS_TABLE_NAME=""
WEB_ORIGIN="${DNDTOOLS_WEB_ORIGIN:-}"

# Once hosting exists, keep every later API/identity update on the deployed origin even when the
# caller did not explicitly request the second-pass refresh. Without this lookup, supplying one CLI
# parameter override could silently put CORS or Cognito callbacks back on the template placeholder.
case "$STACK" in
  identity|sync-api|app-api)
    if [ -z "$WEB_ORIGIN" ]; then
      WEB_ORIGIN=$(aws ssm get-parameter \
        --name "/dndtools/$STAGE/web/url" \
        --query 'Parameter.Value' \
        --output text \
        --region "${DNDTOOLS_REGION:-ca-central-1}" \
        --profile "${DNDTOOLS_PROFILE:-dndtools}" 2>/dev/null || true)
    fi
    if [ -n "$WEB_ORIGIN" ] && ! [[ "$WEB_ORIGIN" =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]]; then
      echo "invalid web origin (expected one HTTPS origin without a path or trailing slash)" >&2
      exit 1
    fi
    ;;
esac

if [ "$STACK" = "app-api" ]; then
  # The sync table keeps its CloudFormation-generated physical name so an existing encrypted backup
  # is never replaced merely to make cross-stack lookup deterministic. sync-api publishes that name
  # after it exists; app-api's first new-stage pass intentionally stays unconfigured/fail-closed.
  SYNC_OPS_TABLE_NAME=$(aws ssm get-parameter \
    --name "/dndtools/$STAGE/sync/ops-table-name" \
    --query 'Parameter.Value' \
    --output text \
    --region "${DNDTOOLS_REGION:-ca-central-1}" \
    --profile "${DNDTOOLS_PROFILE:-dndtools}" 2>/dev/null || true)
  if [ -n "$SYNC_OPS_TABLE_NAME" ] && ! [[ "$SYNC_OPS_TABLE_NAME" =~ ^[A-Za-z0-9_.-]{3,255}$ ]]; then
    echo "invalid sync operations table name in SSM" >&2
    exit 1
  fi
  if [ -z "$SYNC_OPS_TABLE_NAME" ]; then
    echo "    sync purge-proof table is not published yet; account deletion remains fail-closed until app-api is refreshed after sync-api"
  fi
fi

case "$STACK" in
  identity)
    DOMAIN_PREFIX="${DNDTOOLS_COGNITO_DOMAIN_PREFIX:-dndtools-$STAGE-auth}"
    if [ "$STAGE" = "dev" ]; then
      CALLBACK_URLS='http://localhost:5273/,http://localhost:4273/,dndtools://auth'
    else
      CALLBACK_URLS='dndtools://auth'
      : "${DNDTOOLS_COGNITO_EMAIL_SOURCE_ARN:?production identity requires DNDTOOLS_COGNITO_EMAIL_SOURCE_ARN}"
      : "${DNDTOOLS_COGNITO_EMAIL_FROM:?production identity requires DNDTOOLS_COGNITO_EMAIL_FROM}"
    fi
    if [ -n "$WEB_ORIGIN" ]; then
      CALLBACK_URLS="$CALLBACK_URLS,$WEB_ORIGIN/"
    fi
    DEPLOY_OVERRIDES=(
      --parameter-overrides
      "ProjectName=dndtools"
      "Stage=$STAGE"
      "DomainPrefix=$DOMAIN_PREFIX"
      "CallbackUrls=$CALLBACK_URLS"
      "LogoutUrls=$CALLBACK_URLS"
    )
    if [ "$STAGE" = "prod" ]; then
      DEPLOY_OVERRIDES+=(
        "CognitoEmailSourceArn=$DNDTOOLS_COGNITO_EMAIL_SOURCE_ARN"
        "CognitoEmailFrom=$DNDTOOLS_COGNITO_EMAIL_FROM"
      )
    fi
    ;;
  sync-api|app-api)
    # Hosting needs the deployed API ids for CSP, while the APIs need the final CloudFront origin
    # for CORS. Initial stage creation uses invalid.example, creates hosting, then calls this explicit
    # second pass with the real origin to close that dependency cycle safely.
    DEPLOY_OVERRIDES=(
      --parameter-overrides
      "ProjectName=dndtools"
      "Stage=$STAGE"
      "WebOrigin=${WEB_ORIGIN:-https://invalid.example}"
      "LogRetentionDays=30"
    )
    if [ "$STACK" = "app-api" ] && [ -n "$SYNC_OPS_TABLE_NAME" ]; then
      DEPLOY_OVERRIDES+=("SyncOpsTableName=$SYNC_OPS_TABLE_NAME")
    fi
    ;;
esac

# Per-function concurrency reservations are off by default: the account's Lambda quota still sits
# at the 10-concurrency new-account floor (increase to 1000 requested 2026-07-23), and any
# reservation below that floor is rejected. Once the quota lands, flip the guardrails on with
# DNDTOOLS_RESERVE_CONCURRENCY=true (locally or as a CI env var).
case "$STACK" in
  signaling|sync-api|app-api)
    DEPLOY_OVERRIDES+=("ReserveLambdaConcurrency=${DNDTOOLS_RESERVE_CONCURRENCY:-false}")
    ;;
esac
( cd "$STACK_DIR" && sam deploy --config-env "$STAGE" "${DEPLOY_FLAGS[@]}" "${DEPLOY_OVERRIDES[@]}" )

echo "==> $STACK / $STAGE : done"
