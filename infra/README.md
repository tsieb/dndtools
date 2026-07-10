# dndtools cloud infrastructure (AWS SAM)

Small, independently-deployable CloudFormation/SAM stacks that add opt-in cloud
capabilities to the local-first app. Everything is pay-per-use / scale-to-zero
**except** one `t4g.nano` running coturn (the only always-on cost, ~$3–8/mo).

## Account & identity

- Dedicated member account **`dndtools` = `703621193648`** in org `o-fvdpu0124z`.
- Deploys run through the local AWS profile **`dndtools`**, which role-chains from
  the `siebland-mgmt` SSO session into the member account's
  `OrganizationAccountAccessRole`. Region: **`ca-central-1`**
  (CloudFront's ACM cert is the sole exception — it lives in `us-east-1`).
- CI deploys use the keyless **GitHub OIDC** role created by the `foundation` stack
  (no long-lived AWS keys).

> **Branch rename (master → main): foundation redeployed 2026-07-09.** The `foundation`
> stack's `GitHubBranch` parameter builds the OIDC trust condition
> `repo:tsieb/dndtools:ref:refs/heads/<branch>`. The **dev** role now trusts
> `refs/heads/main` (verified). `GitHubBranch=main` is set explicitly in each stack's
> `samconfig.toml` — a CloudFormation *update* keeps a parameter's previous value when it
> is omitted from `parameter_overrides` (the template `Default` only applies on initial
> *create*), so relying on the default alone would have left the role on `master`.
> **`prod` foundation has not been deployed yet**; its first deploy will pick up `main`.

## Stacks (deploy order)

| Order | Stack | Purpose | Always-on cost |
| ----- | ----- | ------- | -------------- |
| 1 | `foundation`  | Budget alarm, GitHub OIDC deploy role, SSM namespace | none |
| 2 | `identity`    | Cognito user pool + app client (gates everything) | none |
| 3 | `turn`        | coturn on EC2 `t4g.nano` + Elastic IP + cred Lambda | ~$3–8/mo |
| 4 | `signaling`   | API GW WebSocket + Lambdas + DynamoDB (rooms/conns, TTL) | none |
| 5 | `sync-api`    | API GW HTTP + Lambdas + DynamoDB (op index) + S3 (ciphertext) | none |
| 6 | `app-api`     | API GW HTTP + Lambda + DynamoDB (accounts/entitlements/invites/listings, TTL) + S3 (marketplace payloads) | none |
| 7 | `web-hosting` | S3 (private) + CloudFront (OAC) + CSP header | none |

> `signaling` resolves `turn`'s `/turn/secret-arn` and `/turn/uri` via `{{resolve:ssm}}`
> at deploy time, so **`turn` must be deployed before `signaling`** — deploying signaling
> first fails with an SSM `ParameterNotFound`.

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

All commands target the `dndtools` profile / `ca-central-1` via each stack's
`samconfig.toml`.

## Sync is fail-closed until crypto lands

Cloud **sync/backup** stays disabled until the SYNC-017 gate
(`packages/core/src/sync/cloud-sync-gate.ts`) opens — which requires the concrete
E2EE implementation and ADR-015 moving to Accepted. Remote **play** (signaling +
TURN) does not depend on that and ships first. See the plan for staging.
