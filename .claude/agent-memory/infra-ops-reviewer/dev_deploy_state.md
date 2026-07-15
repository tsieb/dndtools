---
name: dev-deploy-state
description: Deploy state of the 7 dev stacks — CI auto-deploy has kept them current with main since 2026-07-09; the old "pre-hardening infra still live" claim is now FALSE
metadata:
  type: project
---

## Correction (2026-07-14): the "hardening not redeployed" claim is DEAD. Stop repeating it.

The `feat/cloud-backend` auto-memory warning — *"hardened infra templates still NOT redeployed; live dev
stacks run original pre-hardening infra"* — and my own 2026-07-09 snapshot (below) are **both stale**. They
were true on 2026-07-09. They stopped being true the moment CI auto-deploy went live.

**`deploy.yml` is the real deploy mechanism now, not a human running `infra/deploy.sh`.** It has run and
**succeeded on every push to `main` since 2026-07-09**. Evidence (`gh run list --workflow=deploy.yml`, and
`gh run view <id> --json jobs` for the step-level detail):

| run | date (UTC) | commit | result |
|---|---|---|---|
| 29181386322 | 2026-07-12 05:35 | `ea8356f` (= HEAD) | success — infra *skipped*, web republished |
| 29180438555 | 2026-07-12 04:56 | merge full-e2e-readiness | success — **deployed signaling + sync-api + app-api** |
| 29124506329 | 2026-07-10 21:22 | merge completion-pass | success |
| 29000651756 | 2026-07-09 07:08 | foundation OIDC pin | success |

The hardening commit `9fd2a73` is an ancestor of HEAD, so each of those deploys shipped it.
**Net: the 7 dev stacks (foundation, identity, turn, app-api, signaling, sync-api, web-hosting) are current
with committed `main` (`ea8356f`).** The only gap is the large **uncommitted** working-tree change set
(observability/alarms/PITR/prod-OIDC isolation/CSP tightening/nodejs24/pinned coturn digest) — that is not
drift, it is simply unshipped work.

**prod: still entirely undeployed**, and as of 2026-07-14 still *un-standupable* — see [[prod-readiness-gaps]].

**Note there are 7 stacks, not 6.** `app-api` was added 2026-07-09 (`dc0f05e`) and now sits at position 3 in
the order (foundation → identity → app-api → turn → signaling → sync-api → web-hosting), because signaling
and sync-api resolve its `/app-api/table-name` from SSM.

**Why:** this repo's drift question is now answered by GitHub Actions run logs, not by a human's deploy log.
**How to apply:** before ever calling a stack stale, run the run-log check in
[[heuristic-commit-after-deploy]]. Do not carry forward the "pre-hardening" claim; it is retired.

---
### Superseded snapshot (2026-07-09) — kept only to explain why the old claim existed
identity/turn/signaling were then genuinely behind `9fd2a73`; foundation had just been redeployed for the
`main` rename. CI has since redeployed all of them.
