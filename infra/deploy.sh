#!/usr/bin/env bash
# Deploy one dndtools infra stack for one stage.
# Usage: infra/deploy.sh <stack> [stage]
#   <stack>  foundation | identity | signaling | turn | sync-api | app-api | web-hosting
#            | edge-cert | edge-waf (both us-east-1 — see below)
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

case "$STAGE" in
  dev)
    PROFILE="${DNDTOOLS_DEV_PROFILE:-${DNDTOOLS_PROFILE:-dndtools}}"
    ;;
  prod)
    # Prod lives in its OWN account (649320110863), dev in 703621193648. This default used to be
    # `dndtools` — the dev profile — which meant every prod deploy silently built prod-named stacks
    # in the dev account. That is how dndtools-prod-* stacks ended up there. The failure mode is
    # nasty because most stacks deploy perfectly happily into the wrong account; only `turn` catches
    # it, by way of a VPC id that does not exist there.
    PROFILE="${DNDTOOLS_PROD_PROFILE:-${DNDTOOLS_PROFILE:-dndtools-prod}}"
    ;;
esac
REGION="${DNDTOOLS_REGION:-ca-central-1}"

# edge-cert and edge-waf are the stacks that are NOT regional to this project, both because
# CloudFront's control plane lives in us-east-1: a certificate CloudFront can attach must be issued
# there, and a CLOUDFRONT-scope WAF web ACL can only be created there. Pin the region here rather
# than relying on the caller to remember. The failure modes differ and are both unpleasant:
# edge-cert in ca-central-1 succeeds and then produces a certificate CloudFront silently refuses,
# while edge-waf in ca-central-1 fails outright at create time.
#
# edge-cert is stage-independent (one shared certificate, prod account only) so both stages are the
# same deploy; edge-waf is per-stage AND per-account, because a distribution can only attach a web
# ACL from its own account.
if [ "$STACK" = "edge-cert" ] || [ "$STACK" = "edge-waf" ]; then
  REGION="us-east-1"
fi

sam_quote_override_value() {
  local value="${1//\'/\'\"\'\"\'}"
  printf "'%s'" "$value"
}

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
sam validate --template "$STACK_DIR/template.yaml" --region "$REGION" --profile "$PROFILE"

echo "==> $STACK / $STAGE : lint (advisory — bundled cfn-lint spec can lag AWS)"
sam validate --lint --template "$STACK_DIR/template.yaml" --region "$REGION" --profile "$PROFILE" || \
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
# Holds BARE `Key=Value` pairs. The `--parameter-overrides` flag is attached once, at the
# bottom, only if this array is non-empty.
#
# It used to hold the flag inline, which hid a silent bug: `signaling` never set the flag
# (its branch only ever appended), so `sam deploy` was invoked with a stray positional
# `ReserveLambdaConcurrency=false`. sam accepts and DISCARDS unknown positional arguments
# rather than erroring, so signaling silently never received the override. It was harmless
# only because the value passed happened to equal the template default.
PARAM_OVERRIDES=()
SYNC_OPS_TABLE_NAME=""

# Log retention differs by stage: short in dev (cheap, and dev logs have no audit value),
# long in prod. This used to be hardcoded to 30 for every stage, which silently overrode the
# 14/90 split each samconfig.toml declares — the samconfig values were dead config.
case "$STAGE" in
  dev)  LOG_RETENTION_DAYS=14 ;;
  prod) LOG_RETENTION_DAYS=90 ;;
esac

# Alarms and the stage dashboard are billed past a per-ORGANISATION free allowance (10 alarms,
# 3 dashboards), so dev runs without them by default and prod carries the full set. Override
# for a dev debugging session with DNDTOOLS_CREATE_ALARMS=true. See infra/README.md
# "Observability and what it costs".
case "$STAGE" in
  dev)  CREATE_ALARMS="${DNDTOOLS_CREATE_ALARMS:-false}" ;;
  prod) CREATE_ALARMS="${DNDTOOLS_CREATE_ALARMS:-true}" ;;
esac
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
        --region "$REGION" \
        --profile "$PROFILE" 2>/dev/null || true)
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
    --region "$REGION" \
    --profile "$PROFILE" 2>/dev/null || true)
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
    PARAM_OVERRIDES=(
      "ProjectName=dndtools"
      "Stage=$STAGE"
      "DomainPrefix=$DOMAIN_PREFIX"
      "CallbackUrls=$CALLBACK_URLS"
      "LogoutUrls=$CALLBACK_URLS"
      "CreateAlarms=$CREATE_ALARMS"
    )
    if [ "$STAGE" = "prod" ]; then
      COGNITO_EMAIL_FROM_OVERRIDE="$(sam_quote_override_value "$DNDTOOLS_COGNITO_EMAIL_FROM")"
      PARAM_OVERRIDES+=(
        "CognitoEmailSourceArn=$DNDTOOLS_COGNITO_EMAIL_SOURCE_ARN"
        "CognitoEmailFrom=$COGNITO_EMAIL_FROM_OVERRIDE"
      )
    fi
    ;;
  sync-api|app-api)
    # Hosting needs the deployed API ids for CSP, while the APIs need the final CloudFront origin
    # for CORS. Initial stage creation uses invalid.example, creates hosting, then calls this explicit
    # second pass with the real origin to close that dependency cycle safely.
    PARAM_OVERRIDES=(
      "ProjectName=dndtools"
      "Stage=$STAGE"
      "WebOrigin=${WEB_ORIGIN:-https://invalid.example}"
      "LogRetentionDays=$LOG_RETENTION_DAYS"
      "CreateAlarms=$CREATE_ALARMS"
    )
    if [ "$STACK" = "app-api" ] && [ -n "$SYNC_OPS_TABLE_NAME" ]; then
      PARAM_OVERRIDES+=("SyncOpsTableName=$SYNC_OPS_TABLE_NAME")
    fi
    # Invite email stays disabled (fail-closed) until a verified sender is configured. The
    # value cannot live in samconfig: these CLI --parameter-overrides REPLACE the samconfig
    # list wholesale, so anything set there is silently dropped on every deploy. It is read
    # from SSM rather than taken only from the environment for the same reason WEB_ORIGIN is
    # — otherwise the next deploy that forgets the variable quietly turns invite email back
    # off. Set it once per stage:
    #   aws ssm put-parameter --name /dndtools/<stage>/app-api/invite-sender \
    #     --type String --value 'invites@lamplight.click' --overwrite ...
    # The address/domain must already be verified in SES for this account+region. Use a BARE
    # address, never a "Name <addr>" display form: the Lambda's send policy is conditioned on
    # ses:FromAddress, which matches the address alone, so a display form denies every send.
    if [ "$STACK" = "app-api" ]; then
      INVITE_SENDER="${DNDTOOLS_INVITE_SENDER:-}"
      if [ -z "$INVITE_SENDER" ]; then
        INVITE_SENDER=$(aws ssm get-parameter \
          --name "/dndtools/$STAGE/app-api/invite-sender" \
          --query 'Parameter.Value' \
          --output text \
          --region "$REGION" \
          --profile "$PROFILE" 2>/dev/null || true)
      fi
      if [ -n "$INVITE_SENDER" ]; then
        PARAM_OVERRIDES+=("InviteSender=$(sam_quote_override_value "$INVITE_SENDER")")
      else
        echo "    invite email is not configured for $STAGE; invites still mint links and report emailStatus=not-configured"
      fi
    fi
    ;;
esac

# Per-function concurrency reservations are off by default: the account's Lambda quota still sits
# at the 10-concurrency new-account floor (increase to 1000 requested 2026-07-23), and any
# reservation below that floor is rejected. Once the quota lands, flip the guardrails on with
# DNDTOOLS_RESERVE_CONCURRENCY=true (locally or as a CI env var).
# signaling takes no stack-specific CLI overrides above, so this is where its list is built.
# It must be COMPLETE, not just the pairs that vary: `--parameter-overrides` REPLACES the
# samconfig list wholesale, and while a CloudFormation *update* keeps a previous value for an
# omitted parameter, a *create* falls back to the template default — which would silently give
# a brand-new prod stack `Stage=dev`.
case "$STACK" in
  signaling)
    PARAM_OVERRIDES+=(
      "ProjectName=dndtools"
      "Stage=$STAGE"
      "LogRetentionDays=$LOG_RETENTION_DAYS"
      "CreateAlarms=$CREATE_ALARMS"
    )
    ;;
esac

# NOTE ON COMPLETENESS: only stacks whose parameters must be COMPUTED at deploy time (the web
# origin, the sync table name, the invite sender, the concurrency env switch) are overridden
# from here, and each such list is complete. Stacks whose per-stage config is static — `turn`
# (VpcId/SubnetId), `foundation`, `edge-cert`, `edge-waf` — deliberately take NO overrides
# here, so their samconfig.toml stays the single source of truth. Adding a lone pair for one of
# them would replace its whole samconfig list and drop, say, the VPC ids. Hosting
# copies its complete samconfig list below before replacing the dynamic ACL parameter.

case "$STACK" in
  signaling|sync-api|app-api)
    PARAM_OVERRIDES+=("ReserveLambdaConcurrency=${DNDTOOLS_RESERVE_CONCURRENCY:-false}")
    ;;
esac
# Read the cross-region ACL output on every protected-stack deploy. Failure is blocking in
# prod; never silently clear an association after a credential error or missing prerequisite.
if [ "$STACK" = "app-api" ] || [ "$STACK" = "web-hosting" ]; then
  EDGE_ACL_ARN=""
  if [ "$STAGE" = "prod" ]; then
    EDGE_ACL_ARN=$(aws cloudformation describe-stacks \
      --stack-name "dndtools-$STAGE-edge-waf" --region us-east-1 --profile "$PROFILE" \
      --query "Stacks[0].Outputs[?OutputKey=='WebAclArn'].OutputValue | [0]" --output text)
    [[ "$EDGE_ACL_ARN" =~ ^arn:aws:wafv2:us-east-1:[0-9]{12}:global/webacl/ ]] || {
      echo "Deploy edge-waf $STAGE first: no usable WebAclArn output" >&2; exit 1;
    }
  fi
  if [ "$STACK" = "web-hosting" ]; then
    # Preserve the COMPLETE configured list, including domain/certificate and blank values.
    # NUL delimiters retain values containing spaces without evaluating configuration as shell.
    EDGE_CONFIG_FILE=$(mktemp)
    python3 - "$STACK_DIR/samconfig.toml" "$STAGE" > "$EDGE_CONFIG_FILE" <<'CONFIG'
import shlex, sys, tomllib
with open(sys.argv[1], 'rb') as config:
    values = tomllib.load(config)[sys.argv[2]]['deploy']['parameters']['parameter_overrides']
for pair in shlex.split(values):
    if not pair.startswith('WebAclArn='):
        sys.stdout.buffer.write(pair.encode() + b'\0')
CONFIG
    mapfile -d '' -t PARAM_OVERRIDES < "$EDGE_CONFIG_FILE"
    rm -f "$EDGE_CONFIG_FILE"
    for i in "${!PARAM_OVERRIDES[@]}"; do
      pair="${PARAM_OVERRIDES[$i]}"
      PARAM_OVERRIDES[i]="${pair%%=*}=$(sam_quote_override_value "${pair#*=}")"
    done
  fi
  PARAM_OVERRIDES+=("WebAclArn=$(sam_quote_override_value "$EDGE_ACL_ARN")")
fi
if [ ${#PARAM_OVERRIDES[@]} -gt 0 ]; then
  DEPLOY_FLAGS+=(--parameter-overrides "${PARAM_OVERRIDES[@]}")
fi

( cd "$STACK_DIR" && sam deploy --config-env "$STAGE" --profile "$PROFILE" --region "$REGION" "${DEPLOY_FLAGS[@]}" )

echo "==> $STACK / $STAGE : done"
