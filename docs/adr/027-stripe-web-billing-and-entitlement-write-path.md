# ADR-027: Stripe Web Billing And The Authoritative Entitlement Write Path

- Status: Accepted (2026-09-10 — dev verification in Stripe test mode passed 24/24, see Verification)
- Date: 2026-07-23
- Deciders: Engineering
- Consulted: Product, Design, Security, QA
- Supersedes: N/A
- Amends: ADR-020 (replaces the simulated-checkout entitlement write path with a
  Stripe-webhook-authoritative one when billing activates; the entitlement READ contract and plan
  gate logic are unchanged)

## Context

ADR-020 shipped real per-account entitlements with **simulated** checkout: the client may POST a
plan change, the row is stamped `simulated: true`, and no money moves. That was the right scope for
a personal-scale product, and ADR-020 explicitly deferred real billing to "a payment processor
integration and an ADR revisiting the entitlement write path."

The cloud-tier roadmap (docs/development/CLOUD_TIER_ROADMAP.md) now defines paid tiers worth paying
for (Lantern/Beacon: cloud backup, internet play, co-DM seats, and — after ADR-026 phase 2 —
Cloud-Enhanced features). Monetizing them needs a processor decision that honors the roadmap's
standing decisions: **scale-to-zero cost discipline** (no always-on billing service; idle floor
stays at the coturn ~$5/mo) and **mobile informs-only** (Google Play policy prohibits steering
in-app purchases to an external processor from the app while still allowing account-based
entitlements purchased elsewhere to light up on device).

A decision is needed now so the entitlement write path can be reshaped once, not per-feature. This
ADR is written **before a Stripe account exists**; it is the contract the integration must meet,
recorded as Proposed until the account existed; Accepted 2026-09-10 on the dev test-mode evidence below.

## Decision

Adopt **Stripe as the sole payment processor, on the web app only**, with the **Stripe webhook
Lambda replacing the client as the authoritative entitlement writer**:

1. **Checkout** — the web app (`apps/gm-react`, `/upgrade`) starts a Stripe Checkout session via a
   new scale-to-zero `billing` Lambda behind the existing app-api HTTP API
   (`packages/cloud-fns/src/app-api/`); Checkout runs on Stripe-hosted pages so no card data ever
   touches DND Tools code (SAQ-A scope).
2. **Entitlement write path** — a Stripe **webhook endpoint Lambda** (signature-verified with the
   endpoint secret, idempotent on `event.id`) becomes the ONLY writer of paid plan rows in the
   ADR-020 entitlement table, keyed by Cognito `sub` (carried through Checkout `client_reference_id`
   and mirrored in the Stripe customer metadata). Rows written by the webhook carry
   `simulated: false` and the Stripe subscription id. The existing client POST route stays for the
   free plan and for dev-stage simulated checkout only; on prod it refuses paid plans.
3. **Lifecycle** — subscription renewal/cancellation/dunning flow through the same webhook
   (`customer.subscription.updated/deleted`); the Stripe **customer portal** (also Stripe-hosted)
   handles self-service cancel/card updates, so the app ships no billing management UI beyond a
   portal link.
4. **Mobile informs-only** — Android surfaces plan status read-only (the ADR-020 entitlement GET
   already makes a web purchase live on mobile via the shared Cognito account) and links nowhere;
   no external-purchase steering, no Play Billing until/unless Android monetizes directly (which
   would be its own ADR per Play policy at that time).
5. **Cost discipline** — Stripe has no fixed fee; the two Lambdas + webhook are pay-per-request;
   idle cost delta is $0.

## Consequences

### Positive

- Card data never reaches DND Tools infrastructure (Stripe-hosted Checkout + portal) — minimal PCI
  scope (SAQ-A) for a solo operator.
- The entitlement write path becomes server-authoritative: a client can no longer grant itself a
  paid plan on prod, closing the (deliberate, labeled) ADR-020 simulation hole before money exists.
- Webhook idempotency + signature verification make entitlement grants replay- and forgery-resistant.
- $0 idle cost preserves the roadmap's ~$5/mo floor; billing scales to zero with everything else.
- Account-scoped entitlements mean one purchase works on web, desktop, and Android with no
  per-platform billing code.

### Negative

- Stripe fees (~2.9% + 30¢) and Stripe account/compliance obligations (business identity, tax
  handling) — the operator must be willing to run a real merchant account.
- Webhooks introduce eventual consistency: a completed Checkout may take seconds to reflect in the
  entitlement row; the client must poll/refresh after returning from Checkout.
- Two entitlement writers exist transitionally (webhook for paid, legacy POST for free/dev
  simulated); the prod refusal rule must be tested or a client could still self-grant on prod.
- External-processor policy on Google Play is policy-volatile; "informs-only" needs re-review at
  every Play policy update.

## Rejected Alternatives

| Alternative                                 | Why Rejected                                                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep simulated checkout (status quo)        | Cannot monetize; the roadmap's paid tiers require real payment.                                                                               |
| Play Billing as primary processor           | 15–30% fee, Android-only, and couples entitlements to one store; web is the primary surface. Reconsidered only if Android monetizes directly. |
| Lemon Squeezy / Paddle (merchant of record) | Attractive tax-wise but higher fees and weaker subscription/webhook maturity; revisit if tax burden proves real.                              |
| Self-hosted billing service (always-on)     | Violates the scale-to-zero cost rule for zero benefit at this scale.                                                                          |
| In-app card form + Stripe Elements          | Pulls card data handling toward app code and raises PCI scope for no UX win over hosted Checkout.                                             |

## Migration Impact

- **Code/data contracts:** entitlement rows gain `stripeSubscriptionId` and `simulated: false`
  variants; the ADR-020 GET contract is unchanged (clients keep working unmodified). New
  `billing` routes (`POST /billing/checkout-session`, `POST /billing/webhook`, `GET /billing/portal-link`)
  in app-api; webhook secret + API key in SSM SecureString under `/dndtools/<stage>/billing/*`.
- **Rollout sequencing:** (1) Stripe account + products/prices for Lantern/Beacon; (2) deploy
  webhook + checkout routes to dev with Stripe test mode; (3) e2e against Stripe test clocks
  (renewal/cancel/dunning); (4) prod deploy behind the ADR-026-style stage gate; (5) flip
  `/upgrade` from simulated to real Checkout on prod only.
- **Validation/test changes:** handler tests for signature verification, idempotent replay, plan
  mapping, prod refusal of client paid-plan POSTs; live runbook extension of
  `infra/verify-app-api.mjs` using Stripe test mode.
- **Back-compat:** existing simulated rows remain valid history on dev; prod launches with no paid
  rows.

## Rollback Plan

- **Trigger:** processor failure, unacceptable dispute/fraud volume, or the operator winding down
  paid tiers.
- **Steps:** disable the Checkout route (feature flag in SSM), cancel active subscriptions from the
  Stripe dashboard (Stripe handles proration/refunds), let the webhook write the resulting
  cancellations, then optionally re-enable simulated checkout on dev. The entitlement table needs no
  schema rollback — paid rows simply stop being written.
- **Data recovery:** Stripe is the billing system of record; entitlement rows are reconstructable
  from the Stripe subscription list at any time.
- **Known risk:** users mid-billing-period keep entitlements until their subscription lapses; that
  is the intended behavior, not a leak.

## Verification and Evidence

**Implementation status 2026-09-10: code complete, deployed to dev, and verified end-to-end against
the real Stripe account in test mode — `pnpm billing:verify` 24/24 (Checkout + portal URLs, forged
webhooks rejected, a real `pm_card_visa` subscription granted Lantern via the webhook, cancelling
revoked it, `DELETE /account` deleted the Stripe customer). Prod stays fail-closed until the prod
bootstrap runs with a live key (operator; see the runbook's go-live checklist).**

- Server: `packages/cloud-fns/src/billing/{runtime,entitlements,webhook}.ts` + the
  `/billing/*` routes in `packages/cloud-fns/src/app-api/handler.ts`. Contract tests in
  `packages/cloud-fns/src/billing/billing.test.ts` (43: config fail-closed, plan derivation per
  Stripe status, the two ordering rules, webhook driven with REAL Stripe signatures — forged /
  tampered / wrong-mode / duplicate / unlinked / unmapped-price / base64 body) and in
  `packages/cloud-fns/src/app-api/handler.test.ts` (billing block: 503 when unconfigured, customer
  binding + Checkout session shape, 409 while subscribed, portal gating, preview cannot overwrite a
  Stripe row, account deletion deletes the Stripe customer first and fails closed without billing).
- Infra: `infra/app-api/template.yaml` — `BillingWebhookFn` (own role: app table + billing SSM
  only), routes, prod `BillingWebhookErrorsAlarm`; secrets are SSM SecureStrings read at runtime,
  not template parameters (deviation from the migration note above, so the operator can turn
  billing on/off/rotate keys without a deploy).
- Client: `apps/gm-react/src/cloud/billing.ts` (web-only rule, stripe.com-only navigation guard,
  Checkout return handling; tests), `screens/Upgrade.tsx` (Checkout dialog, confirming banner,
  informs-only state), `screens/settings/Subscription.tsx` (lifecycle + Manage billing).
- Operator tooling: `pnpm billing:bootstrap` (idempotent Stripe catalogue/portal/webhook + SSM),
  `pnpm billing:verify` (dev, Stripe test mode: real subscription → webhook → plan; cancel → free;
  delete account → customer deleted). Runbook: `docs/runbooks/stripe-billing.md`.
- Live check 2026-09-10 (dev, no Stripe parameters): entitlement read reports `billing: null`;
  Checkout, portal and webhook routes answer 503; no row is written.

## Blocked On

- Stripe account creation + activation (operator action; cannot be automated) — then
  `pnpm billing:bootstrap` per stage and `pnpm billing:verify` for the evidence above.
- A public privacy policy + terms page (Stripe activation and the customer portal ask for them).
- ADR-026 phase-2 approval only for Beacon's Cloud-Enhanced features — Lantern is sellable without it.
