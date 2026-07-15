---
name: audit-prod-hardening-2026-07-14
description: Audit of the UNCOMMITTED production-hardening change set on main — ledger under-claims, one real co-dm regression, I21 the only open initiative
metadata:
  type: project
---

# Audit — 2026-07-14 (main @ ea8356f + ~5.9k-line uncommitted hardening set)

**Tree was NOT quiescent.** A sibling agent was writing files during the audit (new
`*.test.ts` at 00:54–01:04; a prettier pass reformatting `cloud/config.ts`). One `pnpm typecheck`
failure was a concurrent-write flake (passed 3× after). **Always check `stat` mtimes before trusting
a red gate in this repo.**

## Shape of the uncommitted set (don't be fooled by the diffstat)
`git diff HEAD --stat` = 20,526 insertions, but **most of it is a Prettier reformat**. True semantic
diff ≈ 5,900 lines. To get it: prettier-normalize BOTH sides (`git show HEAD:$f | npx prettier
--stdin-filepath $f` vs `npx prettier $f`) and diff. Concentrated in cloud-fns handlers, net/,
electron/, Settings, entitlements — **zero new product features**; it is abuse-limits + egress
hardening + prod pipeline.

What it actually delivers (NONE of it is in any ledger): server-side rate limits/size caps/quotas/429s
in sync+app-api handlers · SEC-005 join throttle now enforced server-side in signaling (was
core-policy-only) · Electron packaged network-policy + exact-origin egress allowlist + CSP builder ·
strict `validApiUrl`/`validUserPoolId` cloud-config validation (`cloud/config.ts`) +
`validate-cloud-env.mjs` · prod stage (`IsProd`), API throttling, CW alarms/dashboards in infra ·
new workflows: promote-production, cloud-drift, supply-chain, dependabot · new scripts:
`security:secrets`, `cloud:drift`, `cloud:env:validate`, `release:verify`, `test:coverage:core`.

## REAL REGRESSION (fix before commit)
`Settings.tsx:1523` — the zero-Co-DM-seats branch was reworded from an honest fail-closed statement
to **upsell copy** ("Try the Lantern or Beacon preview at no charge…"). The string
`Your plan has no Co-DM seats` no longer exists in src. `tests/e2e/co-dm.spec.ts:227` asserts it →
**fails for real** (12.2s run, `locator resolved to 0 elements`). Seat MECHANISM is still fail-closed
(option `Co-DM (no seats)`, core `permission.assign-role` rejects) — only the honest statement is gone.
Contradicts FEATURE-GAPS §0★★★★'s "every unavailable capability states why in-UI".

## e2e is currently UNRUNNABLE here
`pnpm e2e` → 129 failed / 45 passed, but ~127 are `ERR_CONNECTION_REFUSED at localhost:5273` — the
managed vite server died mid-run (likely the concurrent agent). Only 2 tests failed with real
durations; 1 was the co-dm regression above, the other (`equipment.spec.ts:236`) was also
connection-refused. **Re-run on a quiesced tree before believing any e2e verdict.**

## Verified green this session
core 3306/3306 (211 files) · app 152 · cloud 211 · tooling 53 · typecheck ✓(×3) · `lint:boundary` ✓ ·
`gates` ✓ (6 owned) · `security:secrets` ✓ · gate tests 44/44.

## Gate state
SYNC-017 / SEC-009 / SEC-012 unchanged from [[gate-sync017-map]] — **OPEN** (canEnable=true under
`DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL`; runtime still device-gated on OS keychain ⇒ false on web).
Runtime call site still `cloud/cloudSync.ts:getCloudSyncStatus`. **SEC-005 is the one that moved**:
server-side enforcement exists ONLY in the uncommitted tree — HEAD and the **deployed dev stacks are
still un-throttled**.

## Ledger drift (all UNDER-claim — docs are stale-behind, not lying-ahead)
- FEATURE-GAPS.md is **silent on the Windows desktop release** (already on main: 542c25d, ea8356f)
  **and on the entire hardening pass**. Header still says `Branch: feat/full-e2e-readiness` (merged).
  "Gates (this pass)" numbers stale: app 147→152, cloud 169→211, tooling 41→53, 20 specs→21.
- `scripts/validate/feature-audit.ts` `extractHonestStubs` greps for `**Honest stubs remaining…:**`.
  §0★★★★ has no such heading → tool prints "None declared" while §0★★★★ prose DOES declare 3 limits
  (payment processor, signed builds, community discovery/curation). Tool **under-reports**. (The
  missing-ledger false-negative from the 2026-07-10 audit IS fixed — `gapsMissing` now warns.)
- Its 11 "not-wired" code markers are FALSE POSITIVES: all are honest `isAccountApiConfigured` /
  `isGoogleDocsConfigured` fail-closed copy ("not available in this edition" + "Local-only build"
  badge). Features light up when VITE_* env is present. Not removals — I checked every site.
- DEBT-2026-002 says "~128 `any` sites"; actual eslint count is **71**.

## Initiatives: 21 total, only I21 open
I1–I20 all COMPLETED/DELIVERED and consistent with code. **I21 (Codebase Realignment) is the single
IN PROGRESS one and is honestly open** — S21.1.1 GIT_WORKFLOW tiered model MET; S21.1.2 `test:smoke`
PARTIAL (it is just `lint:boundary && typecheck` — the contract wanted critical unit tests + lint +
format-check); S21.1.3 UNMET (ci.yml has no `initiative/*` tiering); the "no source file >500 lines"
goal is far off (**65 violators**, worst `packages/core/src/index.ts` 4902, `Settings.tsx` 3492).
The uncommitted work is advancing I21's Epic 21.21 (security hardening).

## Debts that should be REGISTERED but aren't
No ADR covers the hardening pass (prod stage + promotion pipeline + Electron egress allowlist +
strict cloud-config validation) — the repo's own bar requires one for runtime-boundary/security
changes. Electron CSP keeps a broad `connect-src https:` for runtime-selected AI providers (mitigated
by the main-process exact-origin allowlist) — residual worth an entry. DEBT-001's `Targets` list is
stale: new platform-primitive sites in `cloud/*`, `ai/providerConfig.ts`, `runtime/environment.ts` are
NOT in the 11-path `platform-access-exceptions.json`, and `lint:boundary` passes because its scan
scope doesn't reach them (gate blind spot).
