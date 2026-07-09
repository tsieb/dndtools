---
name: heuristic-commit-after-deploy
description: This repo deploys-then-commits, so infra commit timestamps lag the real stack update by a few minutes — don't false-flag drift
metadata:
  type: feedback
---

The repo-side drift heuristic ("commit newer than LastUpdatedTime ⇒ undeployed") produces FALSE POSITIVES here because the operator's workflow is **deploy first, then commit the template**. Observed gaps where the stack was in fact current:

- foundation: stack updated 2026-07-09 07:05:09Z, commit `6fac7e8` at 07:07:01Z (+2 min) — but live trust policy proved it deployed.
- web-hosting: created 04:54:42Z, commit `e4940a7` at 04:59:53Z (+5 min) — current.
- sync-api: updated 00:35:02Z, commit `2814dc7` at 00:40:52Z (+6 min) — template current.

**Why:** a few-minutes commit-after-update gap is normal deploy-then-commit lag, NOT drift. Genuine undeployment here looks like HOURS/DAYS of gap (the hardening commit `9fd2a73` sits ~11h after the identity/turn/signaling stack updates — that one IS real drift, see [[dev-deploy-state]]).
**How to apply:** when the commit-vs-update gap is only minutes, corroborate with a live signal (deployed params, trust policy, or template compare) before calling a stack stale. Reserve the "undeployed" verdict for gaps large enough to exclude deploy-then-commit ordering.
