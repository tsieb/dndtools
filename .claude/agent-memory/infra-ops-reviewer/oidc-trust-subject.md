---
name: oidc-trust-subject
description: Live OIDC trust subject of the dev CI deploy role — confirmed on refs/heads/main 2026-07-09
metadata:
  type: project
---

The live `dndtools-dev-ci-deploy` IAM role (repo var `AWS_DEPLOY_ROLE_ARN` = `arn:aws:iam::703621193648:role/dndtools-dev-ci-deploy`, confirmed present via `gh variable list`) trusts exactly:

`token.actions.githubusercontent.com:sub` (StringLike) = **`repo:tsieb/dndtools:ref:refs/heads/main`**
`...:aud` (StringEquals) = `sts.amazonaws.com`

Verified live 2026-07-09 via `aws iam get-role --role-name dndtools-dev-ci-deploy`. Deployed foundation param `GitHubBranch=main`. So the master→main rename is fully reconciled on the CI side; `infra/README.md`'s claim is correct.

**Stale artifact:** `.github/workflows/deploy.yml` lines 14-16 still carry a NOTE saying foundation must be redeployed with GitHubBranch=main "until then this deploy will fail the OIDC assume-role on main." That NOTE is obsolete (foundation was redeployed 2026-07-09) and should be deleted. (Read-only reviewer — flag it, don't edit.)

**Why:** invariant 4 requires checking the *deployed* trust policy, not the template; this is the observed value.
**How to apply:** if `deploy.yml` `on.push.branches` ever changes, re-read this role's live trust and confirm it still names the same branch before calling CI safe.
