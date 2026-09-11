# Cloud infrastructure (AWS SAM)

Small, independently deployable SAM stacks that add opt-in cloud capabilities to the local-first
app. Everything is pay-per-use except the prod `t4g.nano` running coturn and the prod alerts KMS
key; dev has no always-on compute. Steady state is roughly $12/month across both accounts.

## Accounts, profiles, region

| Stage | Account        | Profile         | Notes                                                           |
| ----- | -------------- | --------------- | --------------------------------------------------------------- |
| dev   | `703621193648` | `dndtools`      | org `o-fvdpu0124z`; CI deploys on every push to `main` via OIDC |
| prod  | `649320110863` | `dndtools-prod` | own OIDC provider, deploy role, SNS topic, SES identity, budget |

Region is `ca-central-1` for everything except the CloudFront certificate (`edge-cert`, `us-east-1`).
Each stack's `samconfig.toml` names the profile per config-env; `infra/deploy.sh` reads
`DNDTOOLS_DEV_PROFILE` / `DNDTOOLS_PROD_PROFILE` (never `AWS_PROFILE`). Most stacks deploy happily
into the wrong account; only `turn` catches it because its `VpcId` exists in one account. So
`parameter value vpc-… does not exist` on a prod deploy almost always means the profile is wrong.

The dev CI role trusts `repo:tsieb/dndtools:ref:refs/heads/main`; the prod role trusts the
`production` GitHub environment. Bootstrap prod once with `infra/bootstrap-prod-foundation.sh`, then
set `AWS_PROD_DEPLOY_ROLE_ARN` on that environment. The dev Cognito pool keeps Cognito's immutable
case-sensitive usernames (the client canonicalizes emails); the prod pool is case-insensitive.

## Stacks, in deploy order

| #   | Stack         | Purpose                                                                                                                            | Always-on cost        |
| --- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 0   | `edge-cert`   | us-east-1 ACM certificate for the custom domain; deploy once                                                                       | none                  |
| 1   | `foundation`  | Budget and cost-anomaly alerts, OIDC deploy role, SSM namespace, alerts topic (+ KMS key in prod), the stage dashboard             | ~$1/mo (prod)         |
| 2   | `identity`    | Cognito user pool and client; the SES configuration set every mail goes through                                                    | none                  |
| 3   | `turn`        | coturn on EC2 `t4g.nano` + Elastic IP + credential Lambda                                                                          | ~$7.70/mo (prod only) |
| 4   | `app-api`     | HTTP API + Lambda + DynamoDB (accounts, entitlements, invites, listings) + S3 (modules) + telemetry Lambda + Stripe webhook Lambda | none                  |
| 5   | `signaling`   | WebSocket API + Lambdas + DynamoDB (rooms, connections, TTL)                                                                       | none                  |
| 6   | `sync-api`    | HTTP API + Lambdas + DynamoDB (op index) + S3 (ciphertext) + the Cloud-Enhanced KMS key                                            | none                  |
| 7   | `web-hosting` | Private S3 + CloudFront (OAC) + CSP header                                                                                         | none                  |

Stacks couple through SSM under `/dndtools/<stage>/…`, never `ImportValue`, so any one can be
updated alone once its inputs exist. Two deploy-time couplings enforce the order: `signaling`
resolves `turn/secret-arn` and `turn/uri`, and both `signaling` and `sync-api` resolve the
entitlement table name `app-api` publishes; deploying early fails with `ParameterNotFound`.
`sync-api` publishes its operations-table name and `app-api` is then deployed a second time with
GetItem access to it (the workflows do this), so account deletion can verify the purge proof. A new
stage takes two passes: APIs first use the `https://invalid.example` origin, `web-hosting` publishes
its URL, then `identity`, `sync-api`, and `app-api` are refreshed with it; later deploys read the
current origin from SSM.

```bash
infra/deploy.sh <stack> <stage>     # validate (blocking), lint (advisory), build, deploy
```

**CloudFormation keeps a parameter's previous value when it is omitted from `parameter_overrides`
on an update**; the template `Default` applies only on create. Every parameter that matters is set
explicitly per config-env, empty ones included. This is how the OIDC role once stayed pinned to
`master` after the branch rename.

## Custom domain (prod only)

`lamplight.click` is registered in the dev account (auto-renew, WHOIS privacy) with its hosted zone
`Z07658511EFS4B5KGNYUX` in prod, where the certificate and records live. `lamplight.click` serves the
SPA; `www` redirects to the apex. Dev stays on `*.cloudfront.net` on purpose: a distribution can
only attach a certificate from its own account. Nothing hardcodes hostnames; `web-hosting` takes
`PrimaryHostName`, `SecondaryHostName`, `WebCertificateArn`, `HostedZoneId`, and the certificate ARN
is copied from `edge-cert`'s output (SSM cannot be read across regions). After `web-hosting`
deploys, the origin refresh pass matters: skipping it leaves Cognito callbacks and CORS trusting the
old origin.

Prod `identity` refuses to deploy without a verified SES sender. Set
`DNDTOOLS_COGNITO_EMAIL_SOURCE_ARN='arn:aws:ses:ca-central-1:649320110863:identity/lamplight.click'`
and `DNDTOOLS_COGNITO_EMAIL_FROM='Lamplight <accounts@lamplight.click>'` (the `production`
environment holds the same two values). The prod account is still in the SES sandbox; see
`docs/runbooks/ses-production-access.md`.

## Observability and cost

CloudWatch's free allowance is per organisation and consumed as resource-months: 3 dashboards, 10
alarms, 5 GB of logs. Eight empty dashboards and twenty-four alarms across two accounts turned a
$12 bill into $40 in August 2026 ([ADR-033](../docs/adr/033-stage-scoped-observability-and-cost-guardrails.md)).
Now:

|                                    | dev                          | prod                                                                                                  |
| ---------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| Dashboard (`CreateStageDashboard`) | off                          | one `dndtools-<stage>-overview`, owned by `foundation`, every widget a `SEARCH()` on the stage prefix |
| Alarms (`CreateAlarms`)            | off                          | on                                                                                                    |
| Alerts-topic encryption            | none                         | customer-managed KMS key                                                                              |
| Log retention                      | 14 days                      | 90 days                                                                                               |
| TURN relay                         | torn down; rebuild on demand | always on                                                                                             |
| Monthly budget ceiling             | $12                          | $20                                                                                                   |

Both stages alert to one confirmed address. A `SEARCH` widget is empty both when idle and when
broken; alarms carry the signal. Never encrypt the topic with `alias/aws/sns`: its policy cannot
grant CloudWatch access, alarms transition while every notification fails, and nothing in the alarm
state reveals it.

An unconfirmed SNS email subscription is deleted by AWS after three days while CloudFormation still
reports `CREATE_COMPLETE`, so after every `foundation` deploy check the topic, not the stack:

```bash
aws sns list-subscriptions-by-topic --topic-arn <arn> --profile <profile> --region ca-central-1
aws cloudwatch set-alarm-state --alarm-name <alarm> --state-value ALARM --state-reason test ...
aws cloudwatch describe-alarm-history --alarm-name <alarm> --history-item-type Action --max-records 1 \
  --query 'AlarmHistoryItems[].HistoryData' --output text     # expect actionState "Succeeded"
```

Turn dev observability on for a debugging session with `DNDTOOLS_CREATE_ALARMS=true infra/deploy.sh
app-api dev` or `CreateStageDashboard=true` in `foundation/samconfig.toml`, and put it back after.

Rebuilding the dev TURN relay: `infra/deploy.sh turn dev` then `infra/deploy.sh signaling dev`. The
rebuilt relay mints a new secret and Elastic IP that `signaling` bakes in at deploy time, and a
`signaling` deploy fails with `ParameterNotFound` while `turn` is absent.

Alert response: Sev 1 (API 5xx, sign-in outage, TURN down) is checked by request id and release SHA
in Logs Insights and rolled back by promoting the prior tag after ten minutes of customer impact;
Sev 2 (Lambda errors or throttles, `BillingWebhookErrorsAlarm`, backup or sync failure, CloudFront
availability) by route and deployment event; Sev 3 (auth failures, cost anomaly, deploy failure) by
aggregate counts. Logs are JSON with correlation id, stage, release SHA, operation, error code, and
latency, and never vault content, prompts, credentials, tokens, emails, or raw IPs. Quarterly:
restore a synthetic backup, rehearse promoting a previous tag, review OIDC trust and drift, inspect
cost by tag, validate log redaction.

## Stage configuration

Coordinates come only from SSM at `/dndtools/<stage>/...`; credentials and rotation material stay in
Secrets Manager or protected GitHub environment variables. Feature flags are server-controlled JSON
at `/dndtools/<stage>/config/feature-flags`, each with an owner and expiry, default off in prod; the
web bundle only displays the approved capability snapshot and never treats a build-time value as
authority. `pnpm cloud:stage-config:validate` checks `config/stages/*.json` against
`config/stage-config.schema.json`. `infra/deploy.sh` passes CLI `--parameter-overrides` for
`app-api`, which replace the samconfig list wholesale, so values such as `InviteSender` come from SSM
(`/dndtools/<stage>/app-api/invite-sender`, a bare address) rather than samconfig.

## Stripe billing parameters (ADR-027)

Billing is switched on per stage by three SSM parameters under `/dndtools/<stage>/billing/`
(`stripe-secret-key`, `stripe-webhook-secret`, `config`), read by the app-api Lambdas at runtime and
cached five minutes; nothing about Stripe is in a template. No parameters means every money route
answers 503. They are written by `pnpm billing:bootstrap -- --stage <stage>`, never by hand
(`docs/runbooks/stripe-billing.md`). The stack adds `POST /billing/checkout-session` and
`/billing/portal-session` (JWT) on `AppFn`, `POST /billing/webhook` (Stripe-signed) on its own
`BillingWebhookFn` with a minimal role, and in prod `BillingWebhookErrorsAlarm`. Dev is verified end
to end with `infra/verify-billing.sh dev`.

## Cloud backup security

Backup is opt-in and offered only where an OS credential store can hold the client key. V2 AES-GCM
envelopes authenticate account, vault, artifact kind, and revision, and the service recomputes that
context from the verified JWT and route. DynamoDB points at exact immutable S3 object versions.
Unbound v1 ciphertext is never restored. Full model: `docs/security/README.md`.

## Stateful resources

CloudFormation retains the app-api table and module bucket, the sync operation table and ciphertext
bucket, and the Cognito user pool on deletion and replacement; a refactor must not become a data
erasure. Application account deletion stays authoritative and purges rows, object versions, and the
Cognito identity (sync records a strongly consistent zero-usage proof retired after 45 days; app-api
verifies it before deleting Cognito last). A retained resource is no longer stack-managed and keeps
billing until deleted deliberately after the owner and retention requirements are satisfied. The
signaling tables (TTL session state) and the web-hosting bucket (rebuildable from a release) are
intentionally not retained; a tooling guardrail inventories every table and bucket so a new one
cannot skip the decision. These policies protect only CloudFormation operations, not a principal
with direct delete permissions.

## Post-deploy verification

`infra/verify-{signaling,turn,sync,app-api,billing}` exercise the live stacks
(`pnpm validate:live` runs them for dev; `verify-signaling` refuses prod without `ALLOW_PROD=1`).
Weekly drift detection (`cloud-drift.yml`) and the promotion workflow treat out-of-band changes as
failures. TURN TLS, secret rotation, and manual failover: `infra/turn/README.md`.
