# Memory Index

- [Dev Deploy State](dev_deploy_state.md) — 2026-07-09 live audit: hardening pass 9fd2a73 NOT deployed to identity/turn/signaling/cloud-fns; foundation current on main; prod entirely undeployed.
- [OIDC Trust Subject](oidc-trust-subject.md) — dev CI deploy role live-trusts refs/heads/main (verified 2026-07-09); deploy.yml lines 14-16 NOTE is now stale.
- [Heuristic: commit-after-deploy](heuristic_commit_after_deploy.md) — repo deploys-then-commits, so minutes-scale commit>update gaps are NOT drift; only hours/days gaps are.
