---
name: prod-readiness-gaps
description: Live-verified out-of-band prerequisites still missing before a prod stage can be stood up (GitHub environment, prod role var, SNS confirm)
metadata:
  type: project
---

Verified 2026-07-14 via `gh` (no AWS creds needed — these are all GitHub-side or human-side).

**`gh api repos/tsieb/dndtools/environments` returns `{"total_count":0,"environments":[]}`.**
There is **no `production` GitHub environment**. This matters more than it looks:

- `promote-production.yml`'s `promote` job declares `environment: name: production`. GitHub **auto-creates a
  referenced environment on first run with ZERO protection rules**. So the environment will spring into
  existence *unprotected* — no required reviewers, no wait timer.
- The prod `foundation` OIDC trust subject is `repo:tsieb/dndtools:environment:production` (not a branch
  subject). An auto-created, unprotected environment still satisfies that subject. **The environment IS the
  entire approval boundary for prod.** If it is not configured with required reviewers *before* the prod
  role exists, prod deploys are effectively unguarded.
- Today the workflow still fails closed for a different reason: `vars.AWS_PROD_DEPLOY_ROLE_ARN` does not
  exist, and the `Require production OIDC role configuration` step does `test -n "$ROLE_ARN"`. That is luck,
  not design — it disappears the moment the var is set.

**`gh variable list`** → only `AWS_DEPLOY_ROLE_ARN` = `arn:aws:iam::703621193648:role/dndtools-dev-ci-deploy`
(set 2026-07-08). No `AWS_PROD_DEPLOY_ROLE_ARN`.
**`gh secret list`** → empty.

Ordering constraint for the prod bootstrap (chicken-and-egg): the prod OIDC role is created *by* the prod
`foundation` stack, but `promote-production.yml` needs that role's ARN to assume anything. So prod foundation
**must be bootstrapped once with the local admin `dndtools` profile**, never by CI. `infra/README.md` says
this; it is correct.

`foundation`'s `CreateGitHubOidcProvider=false` for prod is right: IAM allows only one OIDC provider per
provider URL per account, and dev owns it.

**Why:** these are the steps a `git push` cannot perform, so they get forgotten and then a prod promotion
half-lands.
**How to apply:** re-check `gh api .../environments` and `gh variable list` before ever calling prod
promotion "safe". Related: [[dev-deploy-state]], [[oidc-trust-subject]].
