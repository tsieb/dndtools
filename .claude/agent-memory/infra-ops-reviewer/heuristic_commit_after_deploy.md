---
name: heuristic-commit-after-deploy
description: Use GitHub Actions run logs (not commit-vs-LastUpdatedTime, and not AWS creds) as the cheapest and most reliable drift signal for this repo
metadata:
  type: feedback
---

**The best drift signal in this repo needs no AWS credentials at all: read `deploy.yml`'s own run logs.**

```bash
gh run list --workflow=deploy.yml --limit 10
gh run view <run-id> --json jobs \
  --jq '.jobs[] | select(.name=="deploy infra") | .steps[] | "\(.conclusion)\t\(.name)"'
```

The per-step conclusions literally say `success` / `skipped` for **`Deploy foundation`, `Deploy identity`,
`Deploy turn`, `Deploy app-api`, `Deploy signaling`, `Deploy sync-api`, `Deploy web-hosting`**. That tells
you exactly which stack was deployed, at which commit, and whether it succeeded — which is *more* than
`LastUpdatedTime` gives you, and it works when the SSO session is expired (it usually is).

Do this FIRST, before `aws cloudformation describe-stacks`. Only fall back to AWS reads for things CI cannot
tell you: resource-level drift (out-of-band console edits), live IAM trust policies, SSM parameter values,
and service quotas.

### The older timestamp heuristic and its trap (still true, still secondary)
"commit newer than `LastUpdatedTime` ⇒ undeployed" produces FALSE POSITIVES here, because the human workflow
was **deploy first, then commit the template**. Observed gaps where the stack was in fact current: foundation
+2 min, web-hosting +5 min, sync-api +6 min. Reserve the "undeployed" verdict for HOURS/DAYS of gap.

**Why:** since 2026-07-09 the human almost never deploys by hand — pushing to `main` does it (path-filtered).
So "what did the repo deploy" is a GitHub question, not an AWS one. Relying on stack timestamps alone is how
the retired "pre-hardening infra is still live" claim survived ~5 days after it stopped being true.
**How to apply:** always corroborate a "stack is current/stale" verdict with the run-log check above before
saying it out loud. See [[dev-deploy-state]].
