# dndtools cloud infrastructure (AWS SAM)

Small, independently-deployable CloudFormation/SAM stacks that add opt-in cloud
capabilities to the local-first app. Everything is pay-per-use / scale-to-zero
**except** one `t4g.nano` running coturn (the only always-on cost, ~$3–8/mo).

## Account & identity

- Shared development account **`dndtools` = `703621193648`** in org `o-fvdpu0124z`.
- Production must live in a separate AWS member account with its own GitHub OIDC
  provider, deploy role, SNS topic, SES identities, budget, and audit trail.
- Local deploys default to the `dndtools` AWS profile. Override by stage with
  `DNDTOOLS_DEV_PROFILE` / `DNDTOOLS_PROD_PROFILE` (or `DNDTOOLS_PROFILE`) when
  dev and prod live in different accounts. Region: **`ca-central-1`**
  (CloudFront's ACM cert is the sole exception — it lives in `us-east-1`).
- CI deploys use the keyless **GitHub OIDC** role created by the `foundation` stack
  (no long-lived AWS keys).

> **Branch rename (master → main): foundation redeployed 2026-07-09.** The `foundation`
> stack's `GitHubBranch` parameter builds the OIDC trust condition
> `repo:tsieb/dndtools:ref:refs/heads/<branch>`. The **dev** role now trusts
> `refs/heads/main` (verified). `GitHubBranch=main` is set explicitly in each stack's
> `samconfig.toml` — a CloudFormation _update_ keeps a parameter's previous value when it
> is omitted from `parameter_overrides` (the template `Default` only applies on initial
> _create_), so relying on the default alone would have left the role on `master`.
> The separate prod account should create its own OIDC provider and API Gateway
> account logging role. Bootstrap it once with `infra/bootstrap-prod-foundation.sh`,
> then set `AWS_PROD_DEPLOY_ROLE_ARN` on the protected GitHub `production`
> environment. The prod role trusts that environment's OIDC subject, not a branch
> subject.

The already-created dev Cognito pool retains Cognito's immutable, case-sensitive username setting;
the client canonicalizes email addresses before every auth call so users still get consistent login
behavior. The new production pool is created case-insensitive. Changing the legacy pool itself would
require a deliberate user migration or pool replacement, not an in-place stack update.

## Stacks (deploy order)

| Order | Stack         | Purpose                                                                                                   | Always-on cost |
| ----- | ------------- | --------------------------------------------------------------------------------------------------------- | -------------- |
| 0     | `edge-cert`   | **us-east-1** ACM cert for the custom domain (apex + wildcard). Shared by all stages; deploy once          | none           |
| 1     | `foundation`  | Budget alarm, GitHub OIDC deploy role, SSM namespace, alerts topic + its KMS key                          | ~$1/mo         |
| 2     | `identity`    | Cognito user pool + app client (gates everything) + the SES configuration set all mail is sent through    | none           |
| 3     | `turn`        | coturn on EC2 `t4g.nano` + Elastic IP + cred Lambda                                                       | ~$3–8/mo       |
| 4     | `app-api`     | API GW HTTP + Lambda + DynamoDB (accounts/entitlements/invites/listings, TTL) + S3 (marketplace payloads) | none           |
| 5     | `signaling`   | API GW WebSocket + Lambdas + DynamoDB (rooms/conns, TTL)                                                  | none           |
| 6     | `sync-api`    | API GW HTTP + Lambdas + DynamoDB (op index) + S3 (ciphertext)                                             | none           |
| 7     | `web-hosting` | S3 (private) + CloudFront (OAC) + CSP header                                                              | none           |

> `app-api` publishes the authoritative entitlement table name in SSM; both `signaling` and
> `sync-api` resolve it at deploy time. Deploy **`app-api` before both dependent stacks**.
> `signaling` also resolves `turn`'s `/turn/secret-arn` and `/turn/uri`, so **`turn` must be
> deployed before `signaling`**. Violating either dependency fails with `ParameterNotFound`.

Account deletion has one deliberate reverse lookup without creating a deployment cycle: `sync-api`
publishes its CloudFormation-generated operations-table name at `/dndtools/<stage>/sync/ops-table-name`,
then `app-api` is deployed a second time with GetItem-only access to that exact table. The deploy
workflows perform this refresh automatically. During a brand-new stage's short first pass, account
deletion fails closed because purge proof cannot yet be verified; normal account and entitlement
routes remain available. Keeping the generated table name avoids replacing or orphaning existing
encrypted backups solely to establish cross-stack wiring.

The sync purge marker has no TTL while deletion is incomplete. Once DynamoDB rows and every S3
object version are gone, sync records a strongly consistent zero-usage proof and schedules it for
retirement after 45 days. App-api verifies that proof, removes account/public content, schedules its
own account tombstone for the same retention, then revokes and deletes Cognito last. The retention is
longer than the one-hour ID-token lifetime and 35-day PITR window without keeping account identifiers
indefinitely.

The TURN host publishes a one-minute `${ProjectName}/TURN` application heartbeat only when the
container is running and both UDP/TCP listeners are present. Missing or unhealthy heartbeats alert
through the stage operations topic; Docker logs are size-rotated so a busy relay cannot fill the root
volume. EC2 status checks remain a separate host-level alarm.

The current relay is deliberately a single-instance beta service on `turn:` port 3478. WebRTC payloads
remain end-to-end encrypted, and credentials are short lived, but production-grade restrictive-network
coverage still requires a DNS name/certificate for `turns:`, tested secret rotation, and a multi-host
failover design. Treat those as launch prerequisites before promising high-availability internet play.

The hosted CSP needs the exact deployed API ids, while the APIs and Cognito callback lists need the
final CloudFront origin. A new stage is therefore created in two safe passes: APIs initially use the
non-routable `https://invalid.example` default and Cognito initially permits the desktop callback,
`web-hosting` publishes its URL, then identity, sync-api, and app-api are immediately refreshed with
that origin. Later deploys read the current origin from SSM automatically so an isolated API update
cannot regress CORS or invite links to the placeholder.

## Which account am I deploying to?

**dev → `703621193648` (`dndtools`), prod → `649320110863` (`dndtools-prod`).** Each stack's
`samconfig.toml` names the right profile per config-env, and `infra/deploy.sh` defaults
`DNDTOOLS_PROD_PROFILE` to `dndtools-prod`.

That default used to be `dndtools`, and the failure mode is worth remembering because it is almost
silent: **most stacks deploy perfectly happily into the wrong account**, producing a full set of
`dndtools-prod-*` stacks in dev that look correct in isolation. Only `turn` catches it, because its
`VpcId` names a VPC that exists in the prod account and not in dev. So:

> `parameter value vpc-… does not exist` on a prod deploy almost always means the **profile** is
> wrong, not the VPC id.

Dev and prod each use their own account's default VPC and `ca-central-1a` subnet. The ids differ
between stages on purpose; they are not interchangeable.

## Custom domain

**Prod only.** `lamplight.click` is registered through Route53 Domains in the **dev** account
(auto-renew on, WHOIS privacy on — the registrar stays where it was bought), but its authoritative
hosted zone is **`Z07658511EFS4B5KGNYUX` in the prod account**, and the registrar's nameservers point
there. DNS, certificate and records therefore all live in the account that serves the traffic.

| Hostname              | Serves                                                        |
| --------------------- | ------------------------------------------------------------- |
| `lamplight.click`     | prod SPA (canonical)                                           |
| `www.lamplight.click` | prod SPA, 301 → apex via a CloudFront viewer-request function   |

**Dev has no custom domain** and stays on its `*.cloudfront.net` URL. That is a deliberate choice,
not an omission: a CloudFront distribution can only attach a certificate issued in its *own* account,
so a dev hostname under this domain would need either a second delegated zone plus a second
certificate, or cross-account IAM so the dev stack could write into the prod zone. Neither is worth
it for a dev stage. Dev's domain parameters are explicitly empty rather than absent.

Nothing hardcodes the hostnames. `web-hosting` takes `PrimaryHostName`, `SecondaryHostName`,
`WebCertificateArn` and `HostedZoneId`; leave them blank and the stack serves on `*.cloudfront.net`.
**Moving to a different domain is a parameter change, not a template change** — register it,
redeploy `edge-cert` with the new `DomainName` + `HostedZoneId` (this replaces the certificate and
revalidates), then update the four parameters in `web-hosting/samconfig.toml` and redeploy prod.

Two things must be set explicitly rather than left to defaults:

- **The certificate is copied, not resolved.** `edge-cert` lives in us-east-1 because CloudFront will
  only attach a certificate from that region, and SSM parameters cannot be read across regions — so
  its `CertificateArn` output is pasted into `web-hosting/samconfig.toml`. Re-copy it whenever the
  certificate is replaced. It must be a certificate in the **same account** as the distribution.
- **Every domain parameter is repeated in `parameter_overrides`, empty ones included.** A
  CloudFormation _update_ keeps a parameter's previous value when it is omitted (the template
  `Default` applies only on _create_), so an omitted `PrimaryHostName` keeps the old hostname rather
  than clearing it.

After `web-hosting` deploys, `/dndtools/<stage>/web/url` publishes the **custom** origin rather than
the CloudFront one. The existing second pass then matters more than before: `identity` rebuilds its
Cognito callback/logout URLs from it and `sync-api` / `app-api` rebuild their CORS allowlist from it.
Skipping that refresh leaves the APIs trusting the wrong origin, so the app loads on the custom
domain and then fails every authenticated call.

### Production email (Cognito)

`identity prod` refuses to deploy without a verified SES sender — the template asserts it, so the
50/day Cognito default cannot silently become the production path. The sender is the domain itself:
`lamplight.click` is verified as an SES domain identity in the **prod** account's `ca-central-1` with
Easy DKIM (three `_domainkey` CNAMEs in the prod hosted zone, published out of band and therefore not
owned by any stack).

> ⚠️ The prod account is still in the **SES sandbox** (`ProductionAccessEnabled: false`), so Cognito
> can only deliver to individually verified addresses. Signup and password-recovery mail to real
> users needs a production-access request raised against account `649320110863`.

```bash
export DNDTOOLS_COGNITO_EMAIL_SOURCE_ARN='arn:aws:ses:ca-central-1:649320110863:identity/lamplight.click'
export DNDTOOLS_COGNITO_EMAIL_FROM='Lamplight <accounts@lamplight.click>'
infra/deploy.sh identity prod
```

The protected GitHub `production` environment reads the same two values from its own variables
(`COGNITO_EMAIL_SOURCE_ARN`, `COGNITO_EMAIL_FROM`); keep them in step with the above.

Stacks are decoupled via **SSM Parameter Store** under `/dndtools/<stage>/…`
(each stack writes its outputs; downstream stacks and the client build read them),
not tight cross-stack `ImportValue` coupling — so any one can be updated in isolation.

## Deploying

Each stack directory has its own `samconfig.toml` with `dev` / `prod` config-envs.

```bash
# from repo root
infra/deploy.sh <stack> <stage>      # e.g. infra/deploy.sh foundation dev
# or manually, from a stack dir:
cd infra/foundation
sam validate --lint
sam build
sam deploy --config-env dev
```

Production identity deployment deliberately has no committed sender identity. Set both variables to
an SES identity already verified in the dedicated prod account's `ca-central-1`; the protected
production workflow reads the same values from GitHub environment variables named
`COGNITO_EMAIL_SOURCE_ARN` and `COGNITO_EMAIL_FROM`.

```bash
export DNDTOOLS_COGNITO_EMAIL_SOURCE_ARN='arn:aws:ses:ca-central-1:ACCOUNT:identity/example.com'
export DNDTOOLS_COGNITO_EMAIL_FROM='Lamplight <account@example.com>'
infra/deploy.sh identity prod
```

All commands target the `dndtools` profile / `ca-central-1` via each stack's
`samconfig.toml`.

After each foundation deployment, confirm the SNS subscription email before relying on service alarm
delivery. Weekly drift detection and the production promotion workflow treat out-of-band stack changes
as failures.

Confirming the subscription is necessary but **not** sufficient — the alerts topic must also be
encrypted with the stack's own `AlertsKey`, never the AWS-managed `alias/aws/sns`. The managed key
cannot grant `cloudwatch.amazonaws.com` access, so alarms still transition to ALARM while every
notification fails with "CloudWatch Alarms does not have authorization to access the SNS topic
encryption key" — and nothing in the alarm's own state reveals it. To verify a stage end-to-end,
force a transition and confirm the action actually succeeded:

```bash
aws cloudwatch set-alarm-state --alarm-name <alarm> --state-value ALARM \
  --state-reason "delivery test" --profile <profile> --region ca-central-1
aws cloudwatch describe-alarm-history --alarm-name <alarm> --history-item-type Action \
  --max-records 1 --profile <profile> --region ca-central-1 \
  --query 'AlarmHistoryItems[].HistoryData' --output text   # expect actionState "Succeeded"
aws cloudwatch set-alarm-state --alarm-name <alarm> --state-value OK --state-reason restore ...
```

## Cloud backup security

Cloud backup is opt-in and available only in the desktop app when an OS-backed credential store can
hold the account-and-vault-scoped client key. Campaign state and operation tails are encrypted before
upload; v2 AES-GCM envelopes authenticate the account, vault, artifact kind, and revision, and the
service independently recomputes that context from the verified JWT and route. It stores only bounded
ciphertext plus approved metadata. DynamoDB points to exact immutable S3 object versions, preventing
concurrent or stale devices from silently swapping backup ciphertext. Unbound v1 ciphertext must be
refreshed from its originating local vault and is never restored. Recovery-key export is not available
yet, so users should keep a local vault backup; losing every authorized device also loses access to the
cloud copy. Remote play uses separate ephemeral session keys.

## Stateful resource lifecycle

CloudFormation retains the app-api table and module/wiki bucket, the sync operation table and
ciphertext bucket, and the Cognito user pool on both stack deletion and resource replacement. These
resources contain accounts or customer content; an infrastructure refactor must not also become a
data-erasure event. Application account deletion remains authoritative and physically purges that
account's rows, object versions, and Cognito identity before reporting success.

Retention attributes are static CloudFormation metadata, so they apply to both `dev` and `prod`.
After a replacement or stack deletion, a retained resource is no longer managed by its former stack
and can continue to incur charges. Record its physical ID, confirm recovery/migration or the approved
decommission procedure, and delete it explicitly only after the content owner and retention
requirements have been satisfied. Do not treat a successful stack deletion as proof that retained
customer data was erased.

The signaling connection, room, and attempt tables are intentionally not retained: they contain only
short-lived TTL session/rate-limit state. The web-hosting bucket is also reconstructable from a signed
release artifact and is not a customer-data backup. A tooling guardrail inventories every DynamoDB
table and S3 bucket so a new resource cannot silently bypass this durable-versus-rebuildable decision.

These policies protect only CloudFormation lifecycle operations. They do not stop a principal with
direct DynamoDB, S3, or Cognito delete permissions; production environment approvals, least-privilege
deployment credentials, recovery testing, and backups remain separate controls.
