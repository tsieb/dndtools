---
name: dev-deploy-state
description: Live-audited deploy state of the six dev stacks as of 2026-07-09, incl. undeployed security hardening and prod status
metadata:
  type: project
---

Live audit 2026-07-09 (profile dndtools, ca-central-1, acct 703621193648). Stack `LastUpdatedTime` (UTC) vs last infra commit:

- **foundation** — UPDATE_COMPLETE, updated 2026-07-09 07:05:09Z. CURRENT: deployed `GitHubBranch=main`, OIDC trust verified on `main` (see [[oidc-trust-subject]]).
- **identity** — UPDATE_COMPLETE, updated 2026-07-06 22:34:36Z. **STALE**: last infra commit is the hardening pass `9fd2a73` (2026-07-07 09:26:52Z), never deployed.
- **turn** — CREATE_COMPLETE, updated 2026-07-06 22:09:52Z (never updated since create). **STALE**: hardening `9fd2a73` undeployed.
- **signaling** — CREATE_COMPLETE, updated 2026-07-06 22:32:50Z (never updated). **STALE**: hardening `9fd2a73` undeployed (template AND its cloud-fns Lambda bundle).
- **sync-api** — UPDATE_COMPLETE, updated 2026-07-07 00:35:02Z. Template dir current, BUT its Lambda bundles `@dndtools/cloud-fns`, which the hardening `9fd2a73` also touched — that bundle was never redeployed, so sync-api runs pre-hardening Lambda code.
- **web-hosting** — CREATE_COMPLETE, created 2026-07-07 04:54:42Z. Current (not part of the hardening pass).

**Net: the 2026-07-07 security-hardening pass (commit `9fd2a73`) is NOT deployed to dev.** It touched infra/identity, infra/turn, infra/signaling, and packages/cloud-fns; all live dev stacks still run pre-hardening infra/Lambda code. This confirms the auto-memory warning "hardened infra templates still NOT redeployed."

**prod: entirely undeployed.** No `dndtools-prod-*` stacks exist and `/dndtools/prod` SSM namespace is empty.

Redeploy order when hardening ships: turn → signaling → sync-api → identity (identity has no downstream SSM dep so order-flexible). Verify with infra/verify-turn.sh, verify-signaling.sh, verify-sync.sh.

**Why:** answers the recurring "is hardening live yet?" question with timestamps instead of guessing.
**How to apply:** treat as a snapshot — re-check `LastUpdatedTime` before asserting; a redeploy of any of identity/turn/signaling/sync-api after 2026-07-07 09:26Z clears the stale flag.
