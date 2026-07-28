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
| 1     | `foundation`  | Budget alarm, GitHub OIDC deploy role, SSM namespace                                                      | none           |
| 2     | `identity`    | Cognito user pool + app client (gates everything)                                                         | none           |
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
export DNDTOOLS_COGNITO_EMAIL_FROM='DND Tools <account@example.com>'
infra/deploy.sh identity prod
```

All commands target the `dndtools` profile / `ca-central-1` via each stack's
`samconfig.toml`.

After each foundation deployment, confirm the SNS subscription email before relying on service alarm
delivery. Weekly drift detection and the production promotion workflow treat out-of-band stack changes
as failures.

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
