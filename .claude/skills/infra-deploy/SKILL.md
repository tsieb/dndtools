---
name: infra-deploy
description: Procedural checklist for deploying the dndtools AWS SAM stacks under infra/ — the strict 6-stack order, the dndtools profile and ca-central-1 region, the CloudFormation parameter-default trap on stack updates, and the post-deploy verification scripts. Use when asked to deploy, redeploy, or promote a cloud stack, when a deploy failed (SSM ParameterNotFound, OIDC assume-role denial), or when checking what still needs deploying. For a full drift audit or a review of template changes, use the infra-ops-reviewer agent instead.
---

# Deploying an infra stack

Read `infra/README.md` first — it is the contract, and it carries the current deploy state. This skill is the procedure; the README is the source of truth.

## Before you touch anything

- **Account:** `dndtools` = `703621193648`, region **`ca-central-1`**. The one exception is CloudFront's ACM certificate, which must live in `us-east-1`.
- **Profile:** always `--profile dndtools`. The ambient `AWS_PROFILE` on this machine may point at a dead SSO session — never rely on it. Scripts read `DNDTOOLS_PROFILE`, not `AWS_PROFILE`. On `ExpiredToken` or an SSO error, use the `aws-auth` skill; the user must complete a browser login.
- **Deploys are a user decision.** Confirm before running a deploy the user did not explicitly ask for. `prod` always requires explicit confirmation (its `samconfig.toml` sets `confirm_changeset = true`).

## Deploy order is strict

`foundation` → `identity` → `turn` → `signaling` → `sync-api` → `web-hosting`

Two stacks read other stacks' SSM parameters through `{{resolve:ssm}}`, which resolves **at deploy time**. Deploying either before its upstream exists fails with SSM `ParameterNotFound`:

| Stack | Reads at deploy time | Therefore requires first |
|---|---|---|
| `signaling` | `identity/user-pool-id`, `identity/app-client-id`, `turn/secret-arn`, `turn/uri` | `identity` **and** `turn` |
| `sync-api` | `identity/user-pool-id`, `identity/app-client-id` | `identity` |

Everything else is decoupled through SSM under `/dndtools/<stage>/…` rather than `ImportValue`, so any single stack can be *updated* in isolation once its upstream parameters already exist. Beware the tempting shortcut "`identity` has no dependents, so its order is flexible" — it has two.

Stacks are named `dndtools-<stage>-<stack>`. Only `turn` costs money while idle (coturn on a `t4g.nano` + Elastic IP, roughly 3–8 USD/month); coturn is **arm64** — a container or AMI change must keep that target.

## The command

```bash
# from repo root — validates (blocking), lints (advisory), builds, deploys
infra/deploy.sh <stack> <stage>        # stage defaults to dev
```

`deploy.sh` builds the `@dndtools/cloud-fns` Lambda bundle first for `signaling` and `sync-api` (their Lambdas import `@dndtools/core`). The `sam validate --lint` step is **advisory** — the bundled cfn-lint spec lags AWS, so findings there are worth reading but do not block.

Manual equivalent, if you need to inspect the changeset:

```bash
cd infra/<stack>
sam validate --lint
sam build
sam deploy --config-env <dev|prod>
```

## The trap that has bitten this repo

**A CloudFormation *update* keeps a parameter's previous value when it is omitted from `parameter_overrides`.** The template's `Default:` only applies on the initial *create*.

So: changing a template default and redeploying does **not** change a live stack. Every parameter whose value matters must be written explicitly into that stack's `samconfig.toml` under `parameter_overrides`, per config-env. This is exactly how the `foundation` stack's OIDC deploy role stayed pinned to `refs/heads/master` after the default branch was renamed — the trust condition is built from `GitHubBranch`, which is now set explicitly (`GitHubBranch=main`) in both the `dev` and `prod` blocks.

Corollary: `dev` and `prod` `parameter_overrides` drift independently. Check both. `prod foundation` has not been deployed at all — its first deploy will pick up whatever is in the file.

## Verify after deploying

| Stack | Verification |
|---|---|
| `turn` | `infra/verify-turn.sh [stage]` |
| `signaling` | `infra/verify-signaling.sh [stage]` |
| `sync-api` | `infra/verify-sync.sh [stage]` |

`verify-signaling.sh` mints a Cognito test user with a repo-visible password, so it **refuses `prod`** unless `ALLOW_PROD=1`. Do not override that casually.

Cloud sync stays **fail-closed** regardless of what you deploy, until the SYNC-017 gate in `packages/core/src/sync/cloud-sync-gate.ts` opens. Remote play (signaling + TURN) does not depend on that gate.

## When a deploy fails

- `ParameterNotFound` on an SSM path → an upstream stack in the order was never deployed to this stage. Deploy it first.
- `Not authorized to perform sts:AssumeRoleWithWebIdentity` in CI → the deployed `foundation` role's trust condition (`repo:tsieb/dndtools:ref:refs/heads/<branch>`) does not name the branch `.github/workflows/deploy.yml` pushes from. Fix `GitHubBranch` in `infra/foundation/samconfig.toml`, redeploy `foundation`, then confirm with `aws iam get-role`.
- CI deploy silently skipping → the repo variable `AWS_DEPLOY_ROLE_ARN` is unset, so `deploy.yml`'s preflight job emits a notice and the deploy jobs go neutral by design. Check `gh variable list`.
- `No changes to deploy` → expected for a path-filtered CI redeploy of an unchanged template; `deploy.sh` passes `--no-fail-on-empty-changeset`.

## Reporting

After a deploy, say which stack and stage, which parameters changed, the resulting stack status, and whether the verification script was run and passed. If you deployed one stack of several that changed, name the ones still pending.
