# Runbook: Stripe billing (ADR-027)

**Status (2026-09-10): code complete, deployed to dev, verified end to end in test mode, and
fail-closed. Prod is blocked on one thing only: a Stripe account, which a human has to open.** Until
a stage's SSM billing parameters exist, every money route answers 503, the entitlement read reports
`billing: null`, and the app shows its labelled no-payment preview (dev) or "not available" (prod).

| Piece                             | Where                                                           |
| --------------------------------- | --------------------------------------------------------------- |
| Hosted Checkout and portal routes | `packages/cloud-fns/src/app-api/handler.ts` (`/billing/*`)      |
| Webhook Lambda (only paid writer) | `packages/cloud-fns/src/billing/webhook.ts`, `infra/app-api`    |
| Runtime config and secrets loader | `packages/cloud-fns/src/billing/runtime.ts` (SSM, cached 5 min) |
| Entitlement write rules           | `packages/cloud-fns/src/billing/entitlements.ts`                |
| Web client (web build only)       | `apps/gm-react/src/cloud/billing.ts`, `screens/Upgrade.tsx`     |
| One-shot Stripe + SSM setup       | `pnpm billing:bootstrap -- --stage <dev\|prod>`                 |
| Dev end-to-end proof              | `pnpm billing:verify` (`infra/verify-billing.sh`)               |

Cost: Stripe has no monthly fee and test mode is free; live charges 2.9% + 30¢ per successful card
payment (Canadian account). AWS adds $0 idle: one pay-per-request Lambda, one log group, three SSM
parameters, and in prod one alarm.

## 1. Open the Stripe account (human, ~15 minutes)

1. Register at `https://dashboard.stripe.com/register`; the account starts in test mode.
2. **Activate** (business type, legal name and address, website `https://lamplight.click`, product
   description, bank account, statement descriptor `LAMPLIGHT`).
3. Settings → Customer emails: turn on successful-payment and refund receipts. Settings →
   Subscriptions: keep Smart Retries on and cancel after the final failed retry.
4. **Decide tax handling before going live.** The account defaults to Stripe **Managed Payments**
   (Stripe is the merchant of record and remits tax for a higher fee); it refuses any Checkout line
   whose product has no tax code, which is why the bootstrap sets `txcd_10103001` on both products.
   Alternatives: turn it off and enable Stripe Tax (you remit; the code would need
   `automatic_tax: { enabled: true }` in `createCheckoutSession`), or handle tax yourself. Test mode
   works with any of these.
5. Developers → API keys: copy the secret key. It is used once, by the bootstrap, from your shell.
   Never write it into the repo; `pnpm security:secrets` blocks live keys and webhook secrets.

Launch prerequisite: the privacy policy and terms pages exist at `/#/legal/privacy` and
`/#/legal/terms`, but their bracketed placeholders in
`apps/gm-react/src/screens/legal/legalContent.ts` (entity, contact, address, effective date,
governing law, retention) must be filled before prod; a test enforces the exact placeholder set.

## 2. Bootstrap a stage (idempotent)

```sh
STRIPE_SECRET_KEY=sk_test_… pnpm billing:bootstrap -- --stage dev --dry-run
STRIPE_SECRET_KEY=sk_test_… pnpm billing:bootstrap -- --stage dev
STRIPE_SECRET_KEY=sk_live_… pnpm billing:bootstrap -- --stage prod \
  --privacy-url https://lamplight.click/#/legal/privacy --terms-url https://lamplight.click/#/legal/terms
```

The script creates only what is missing (two products, four prices by `lookup_key`, a portal
configuration, a webhook endpoint for `<app-api-url>/billing/webhook`) and writes three SSM
parameters under `/dndtools/<stage>/billing/`: `stripe-secret-key` (SecureString),
`stripe-webhook-secret` (SecureString), and `config` (`{version, livemode, prices, portalConfigurationId}`).
The Lambdas re-read them within five minutes; no redeploy. A key whose mode disagrees with the stage
is refused by the script and by the runtime loader. Prices are immutable in Stripe; edit the
catalogue in the script and run with `--rotate-prices`.

## 3. Verify

`pnpm billing:verify` (dev, test mode, ~2 minutes) mints a throwaway Cognito user and proves:
billing configured → Checkout URL on `checkout.stripe.com` → portal URL on `billing.stripe.com` →
forged webhooks rejected → a real test subscription lands as Lantern via the webhook → cancelling
lands as Hearth → `DELETE /account` deletes the Stripe customer. Then click through once in the dev
web app with card `4242 4242 4242 4242`: the return to `/#/upgrade?checkout=success` confirms
within seconds and Settings › Subscription shows the renewal date and Manage billing.

Prod smoke test, once: subscribe yourself with a real card, confirm, cancel from the portal or
refund from the Dashboard (Stripe keeps its fee on refunds).

## 4. Go live

1. Promote a tag that includes this work through `promote-production.yml`; the routes are inert
   without parameters, so order relative to the bootstrap does not matter.
2. Run the prod bootstrap with the live key and the legal URLs.
3. In the Dashboard (live) → Developers → Webhooks, confirm the endpoint is enabled and returns 200.
4. Run the prod smoke test.

## 5. Operating it

- **Alarm `dndtools-prod-app-api-BillingWebhookErrorsAlarm`** (prod only) fires when the webhook
  fails to apply an event; Stripe retries for up to three days, so a fix inside that window heals
  itself. Expected causes: a subscription created by hand without `metadata.cognito_sub`, or a
  granting subscription on a price missing from `config` (re-run the bootstrap).
- A 400 on the Dashboard's webhook deliveries means the SSM webhook secret no longer matches;
  re-run the bootstrap, which recreates the endpoint and writes the new secret.
- Refunds, disputes, invoices, and tax live in the Dashboard; entitlements follow the subscription.
- Rotate the API key by rolling it in the Dashboard and re-running the bootstrap.
- Turn billing off by deleting the three SSM parameters; every route fails closed within five
  minutes. Existing paid rows stay until you cancel their subscriptions (re-enable the webhook first
  or set rows to `hearth` by hand).

## 6. How the entitlement is protected

The client can never grant itself a paid plan: `POST /account/entitlements` refuses paid plans on
prod and refuses to touch a row bound to an active subscription. Only the webhook writes paid rows;
it verifies the signature over the raw body, refuses events whose `livemode` disagrees with the
stage, and re-reads the subscription from Stripe rather than trusting the payload. An older Stripe
read never overwrites a newer one (`billingSyncedAt`), and an ended subscription downgrades only the
account it is bound to. `DELETE /account` deletes the Stripe customer first and fails closed if
billing is unreachable. The web client navigates only to `https://*.stripe.com`; Android and desktop
inform ("Subscribe at lamplight.click") and link nowhere.

Related: [ADR-027](../adr/027-stripe-web-billing-and-entitlement-write-path.md), `infra/README.md`
§ Stripe billing parameters.
