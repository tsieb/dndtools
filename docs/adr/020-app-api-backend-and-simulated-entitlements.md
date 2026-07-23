# ADR-020: App-API Backend for Marketplace, Invites, Account, and Simulated Entitlements

- Status: Accepted (amended by [ADR-026](./026-opt-in-vault-privacy-modes.md); amended by [ADR-027](./027-stripe-web-billing-and-entitlement-write-path.md), Proposed)
- Date: 2026-07-09
- Deciders: Engineering
- Consulted: Product, Design, Security, QA
- Supersedes: N/A
- Amended by: ADR-026 (2026-07-23) — widens the class of features a paid plan may gate to include
  Cloud-Enhanced vault-mode capabilities (managed AI/RAG, server search, keyless browser access), which
  this ADR's E2EE-era framing could not offer. The simulated-checkout carve-out and the entitlement
  contract (`simulated: true`) are unchanged; real billing still requires its own ADR.
- Amended by: ADR-027 (2026-07-23, Proposed) — will replace the simulated-checkout entitlement
  write path with a Stripe-webhook-authoritative one when real billing activates; the entitlement
  read contract and plan-gate logic are unchanged.

## Context

The completion pass (2026-07) removed the last mock surfaces from `apps/gm-react`. Four of them
cannot be honest without a server: module marketplace publish/discover, campaign invite links that
work before the invitee has ever opened the app, account management (profile, signed-in devices,
export, delete), and plan entitlements. The product owner decided (decision A of the pass) to build
real AWS backends for all four — with one deliberate carve-out: **billing is real server-side
entitlements per Cognito account, but checkout is simulated** — no payment processor is integrated,
and nothing in the product may ever imply money changed hands.

Constraints forcing the shape:

- The existing cloud stacks (`infra/foundation` … `infra/web-hosting`, ADR-015/ADR-017) already
  provide Cognito identity, SSM coupling, and the HttpApi + JWT-authorizer pattern
  (`infra/sync-api`, `packages/cloud-fns/src/sync/handler.ts`). A new backend must reuse that
  pattern, deploy in the same strict order, and add no fixed cost (scale-to-zero only).
- ADR-015's security model must hold: the server never sees plaintext **vault** content. Marketplace
  payloads are content the owner explicitly publishes to strangers — public by intent, so plaintext
  server storage is consistent with, not an exception to, ADR-015. Account export returns metadata
  and ciphertext pointers only.
- Local-first is non-negotiable (Contract 1): every one of these features must fail closed into an
  honest, labeled local state when the backend is unconfigured or the user is signed out.

## Decision

Add one new stack, `infra/app-api` (deploy order 7, after `sync-api`, before `web-hosting`), and one
new Lambda handler, `packages/cloud-fns/src/app-api/handler.ts`, serving four route families behind
the shared Cognito JWT authorizer:

- **Entitlements** — `GET/POST /account/entitlements`. One plan row per Cognito `sub` in the
  single-table `AppTable`; the response is the server-owned feature matrix and is **always marked
  `simulated: true`**. Plan changes are a labeled simulated checkout (`apps/gm-react/src/screens/Upgrade.tsx`);
  the client context (`apps/gm-react/src/cloud/entitlements.ts`) falls back to a bundled offline
  matrix and **never fails open to paid features**.
- **Marketplace** — `POST/GET /marketplace/modules`, `GET/DELETE /marketplace/modules/{moduleId}`.
  Listings in DynamoDB, package payloads in `ModulesBucket` (S3), owner = Cognito sub (never echoed;
  the API returns an `owned` boolean). Installing runs the existing fail-closed
  `widget.package.install` review flow in core — the server adds no trust.
- **Invites** — `POST/GET /invites`, `DELETE /invites/{inviteId}`, plus the **only public route**
  `GET /invites/resolve/{token}` (invitees have no account yet). Server-minted tokens with a 14-day
  DynamoDB TTL; redeemed at the chrome-less `#/join?token=…` screen (`apps/gm-react/src/screens/Join.tsx`),
  which sits outside the DM shell like `/play`. No email is sent (SES deferred).
- **Account** — profile GET/PUT (Cognito attributes), device list/revoke and global sign-out
  (Cognito device tracking + `AdminUserGlobalSignOut`), `POST /account/export` (backend rows +
  ciphertext pointers only), `DELETE /account` (purge rows, delete the Cognito identity).

The client seam is a single typed fetch wrapper, `apps/gm-react/src/cloud/appApi.ts`, gated by
`isAccountApiConfigured` (`cloud/config.ts`: requires Cognito config **and** `VITE_APP_API_URL` from
SSM `/dndtools/<stage>/app-api/url`). Unconfigured or signed-out builds render labeled local states.

## Consequences

### Positive

- Marketplace, invites, account management, and plans stop being theater — every button does what
  it says or says why it can't.
- One stack, one table, one bucket, one Lambda: scale-to-zero, no new fixed monthly cost, and the
  sync-api pattern (JWT authorizer, SSM outputs, esbuild bundling) is reused rather than re-invented.
- The `simulated: true` flag is part of the API contract, not just UI copy — no future client can
  accidentally present simulated plans as paid billing.
- Tenant isolation is enforced server-side (own-content delete only; owner subs never leave the
  server).

### Negative

- A second API surface to harden and redeploy alongside sync-api; drift between deployed stacks and
  templates now has one more stack to audit.
- Plaintext published packages mean a compromised bucket leaks _published_ content (accepted:
  published content is public by intent; vault content never reaches this stack).
- Simulated checkout is intentionally unmonetizable; converting to real billing later means a
  payment processor integration and an ADR revisiting the entitlement write path.
- Cognito device tracking (enabled in the identity stack for device lists) adds a marginal amount of
  PII (device names, last-seen) that account deletion must — and does — purge.

## Rejected Alternatives

| Alternative                                  | Why Rejected                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Keep mock marketplace/invites/account UI     | The pass's whole point: silent no-ops read as broken and erode trust in the surfaces that ARE real.                                                                                  |
| Fold routes into the existing sync-api stack | Sync-api is the E2EE vault path (ADR-015/017); mixing public marketplace payloads into it blurs the "server sees no vault plaintext" audit boundary.                                 |
| Real payment processor (Stripe et al.)       | Out of scope by product decision; compliance/liability burden unjustified for a personal-scale product. Entitlements are real so the gate logic is real; only checkout is simulated. |
| SES-emailed invites                          | Email deliverability + template maintenance for no gain over a copyable/QR join link; deferred deliberately.                                                                         |
| Per-feature Lambdas (one per route family)   | Four cold-start surfaces and four IAM roles for one low-traffic app; a single handler with route dispatch is simpler to audit.                                                       |

## Migration Impact

- New: `infra/app-api/template.yaml` + `samconfig.toml`; `infra/deploy.sh` gains the stack (order 7;
  `web-hosting` moves to 8 in the README table); `.github/workflows/deploy.yml` gains an `app_api`
  path filter + deploy step; identity stack gains `DeviceConfiguration` (device tracking) and the
  app-api Lambda role gains the scoped `cognito-idp:Admin*` actions.
- Client: `VITE_APP_API_URL` and `isAccountApiConfigured` (both fail-closed); `EntitlementsProvider`
  wraps the app; Settings Account/Players, Upgrade, Community Discover/Publish, and `/join` consume
  the client.
- No core (`@dndtools/core`) contract changes: install/review, visibility, and export flows are the
  existing commands.
- Rollout: deploy identity (device tracking) before app-api; app-api before the web app build that
  carries `VITE_APP_API_URL`.

## Rollback Plan

- Trigger: security finding in the app-api surface, runaway cost, or a data-integrity bug in
  entitlements/invites.
- Steps: remove `VITE_APP_API_URL` from SSM and redeploy the web app (every consumer fail-closes to
  its labeled local state — the UI needs no code rollback); then `sam delete` the app-api stack.
  Identity-stack device tracking can stay (harmless without the API).
- Data recovery: `AppTable` uses on-demand billing with point-in-time recovery off (personal scale);
  listings/invites are user-regenerable. Account rows are purged on delete by design — there is
  nothing to recover after a user-initiated deletion, and that is the contract.
- Known risk: invites minted before rollback dead-end at `/join` with the honest "could not be
  checked" state; published modules disappear from Discover until redeployed.

## Verification and Evidence

- Stack: `infra/app-api/template.yaml` (HttpApi + CognitoJwt authorizer, AppTable single-table
  layout, ModulesBucket, scoped IAM); `infra/README.md` stack table row 7.
- Handler + tests: `packages/cloud-fns/src/app-api/handler.ts`,
  `packages/cloud-fns/src/app-api/handler.test.ts` (auth gate, simulated flag, tenant isolation,
  invite TTL/revoke — `pnpm test:cloud`).
- Client + tests: `apps/gm-react/src/cloud/appApi.ts`, `cloud/appApi.test.ts`,
  `cloud/entitlements.ts`, `cloud/config.ts` (`isAccountApiConfigured` fail-closed test).
- Live verification runbook: `infra/verify-app-api.mjs` (auth gate, entitlements round-trip,
  publish→browse→fetch→delete cycle, public invite resolve, revoked-invite 404/410, foreign-delete
  refusal) — run with `APP_API_URL` + `TOKEN` against dev after deploy.
- UI consumers: `apps/gm-react/src/screens/{Settings,Upgrade,Community,Join}.tsx`.
