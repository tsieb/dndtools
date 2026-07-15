# Memory Index

- [Dev Deploy State](dev_deploy_state.md) — CORRECTED 2026-07-14: CI auto-deploy keeps all 7 dev stacks current with main; the "pre-hardening infra still live" claim is RETIRED. prod undeployed.
- [Prod Readiness Gaps](prod-readiness-gaps.md) — no `production` GitHub environment exists (it auto-creates UNPROTECTED); no AWS_PROD_DEPLOY_ROLE_ARN; prod foundation must be bootstrapped locally, not by CI.
- [OIDC Trust Subject](oidc-trust-subject.md) — dev CI deploy role live-trusts refs/heads/main (verified 2026-07-09); prod role is designed to trust `environment:production` instead.
- [Drift signal: read CI run logs, not timestamps](heuristic_commit_after_deploy.md) — `gh run view --json jobs` names which stacks deployed; needs no AWS creds. Do this before any `aws` call.
