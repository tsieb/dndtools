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

## Stacks (deploy order)

| Order | Stack | Purpose | Always-on cost |
| ----- | ----- | ------- | -------------- |
| 1 | `foundation`  | Budget alarm, GitHub OIDC deploy role, SSM namespace | none |
| 2 | `identity`    | Cognito user pool + app client (gates everything) | none |
| 3 | `turn`        | coturn on EC2 `t4g.nano` + Elastic IP + cred Lambda | ~$3–8/mo |
| 3 | `signaling`   | API GW WebSocket + Lambdas + DynamoDB (rooms/conns, TTL) | none |
| 4 | `sync-api`    | API GW HTTP + Lambdas + DynamoDB (op index) + S3 (ciphertext) | none |
| 5 | `web-hosting` | S3 (private) + CloudFront (OAC) + CSP header | none |

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
