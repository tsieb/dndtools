# Runbook — Stripe billing (ADR-027)

**Status (2026-09-10): code complete and deployed to dev, fail-closed. Blocked on one thing only:
a Stripe account, which a human has to open.** Until the stage's SSM billing parameters exist,
every money route answers 503, the entitlement read reports `billing: null`, and the app shows its
labeled "no-payment preview" (dev) / "not available" (prod) state. Nothing can charge anyone.

What is built:

| Piece                             | Where                                                           |
| --------------------------------- | --------------------------------------------------------------- |
| Hosted Checkout + portal routes   | `packages/cloud-fns/src/app-api/handler.ts` (`/billing/*`)      |
| Webhook Lambda (only paid writer) | `packages/cloud-fns/src/billing/webhook.ts`, `infra/app-api`    |
| Runtime config + secrets loader   | `packages/cloud-fns/src/billing/runtime.ts` (SSM, cached 5 min) |
| Entitlement write rules           | `packages/cloud-fns/src/billing/entitlements.ts`                |
| Web client (web build only)       | `apps/gm-react/src/cloud/billing.ts`, `screens/Upgrade.tsx`     |
| One-shot Stripe + SSM setup       | `pnpm billing:bootstrap -- --stage <dev\|prod>`                 |
| Dev end-to-end proof (test mode)  | `pnpm billing:verify` (`infra/verify-billing.sh`)               |

## Cost

- Stripe: no monthly fee. Test mode is free. Live: 2.9% + 30¢ per successful card charge
  (Canadian account; international/currency-conversion surcharges apply to non-CAD cards).
- AWS: $0 idle. One more Lambda (pay-per-request), one log group, three SSM Standard parameters
  (free), and in prod one more CloudWatch alarm ($0.10/month).
- Setting all of this up costs nothing. The first real cost is the first real subscription.

## 1. Open the Stripe account (human, ~15 minutes)

1. <https://dashboard.stripe.com/register> — sign up with the operator address. The account
   starts in **test mode** immediately; live mode unlocks after activation.
2. **Activate** (Dashboard → "Activate payments"): business type (sole proprietor is fine),
   legal name/address, a website, product description ("Subscriptions to a tabletop-RPG campaign
   manager's cloud features"), bank account for payouts, and a **statement descriptor** (use
   `LAMPLIGHT`). Stripe asks for a website that describes the product and has contact details;
   `https://lamplight.click` qualifies once the site is public.
3. Settings → **Customer emails**: turn on "Successful payments" and "Refunds" receipts.
4. Settings → **Subscriptions and emails**: keep Smart Retries on; set "cancel the subscription"
   after the final failed retry (the webhook maps `canceled`/`unpaid` to the free plan either way).
5. **Decide on tax handling before going live — this is a business decision, not a code one.**
   The account came with Stripe **Managed Payments** enabled by default (Settings → Managed
   payments). With it on, Stripe is the merchant of record: it calculates, collects and remits
   sales tax/VAT/GST and handles disputes, for a higher per-transaction fee. It also REFUSES any
   Checkout line item whose product has no tax code — which is why the bootstrap sets
   `txcd_10103001` ("SaaS — personal use") on both products (found the hard way on 2026-09-10:
   the first dev Checkout returned 500 until the tax code existed). The alternatives are
   (a) turn Managed Payments off and enable **Stripe Tax** (you remain the merchant; tax is
   calculated and reported, you remit; the code would need `automatic_tax: { enabled: true }` in
   `createCheckoutSession`), or (b) turn both off and handle tax yourself. Dev/test mode works with
   any of these; pick one before the prod bootstrap.
6. Developers → **API keys**: copy the **secret key** (`sk_test_…` now; `sk_live_…` after
   activation). It is used once, by the bootstrap script, from your shell. Never paste it into a
   file in this repo — `pnpm security:secrets` blocks live keys and webhook secrets.

**Launch prerequisite:** the public **privacy policy** and **terms** pages exist at
`/#/legal/privacy` and `/#/legal/terms` (chrome-less, no account needed), but their bracketed
placeholders — legal entity, contact email, mailing address, effective date, governing law, and the
post-cancellation cloud retention period — live in `apps/gm-react/src/screens/legal/legalContent.ts`
and MUST be filled before prod (a test enforces the exact placeholder set, so update it too). Stripe's
account activation and the customer-portal configuration both ask for these URLs.

## 2. Bootstrap a stage (idempotent)

```sh
# dev — test mode, no real money
STRIPE_SECRET_KEY=sk_test_… pnpm billing:bootstrap -- --stage dev --dry-run   # shows the plan
STRIPE_SECRET_KEY=sk_test_… pnpm billing:bootstrap -- --stage dev

# prod — live mode; needs the SSO session behind the dndtools-prod profile (see the aws-auth skill)
STRIPE_SECRET_KEY=sk_live_… pnpm billing:bootstrap -- --stage prod \
  --privacy-url https://lamplight.click/#/legal/privacy --terms-url https://lamplight.click/#/legal/terms
```

The script creates only what is missing: two products, four prices (found by `lookup_key`), a
customer-portal configuration, a webhook endpoint for `<app-api-url>/billing/webhook`, and then
writes three SSM parameters under `/dndtools/<stage>/billing/`:

| Parameter               | Type         | Holds                                                                                    |
| ----------------------- | ------------ | ---------------------------------------------------------------------------------------- |
| `stripe-secret-key`     | SecureString | the API key                                                                              |
| `stripe-webhook-secret` | SecureString | the endpoint's signing secret (`whsec_…`, shown once by Stripe)                          |
| `config`                | String       | `{version:1, livemode, prices:{lantern:{month,year},beacon:{…}}, portalConfigurationId}` |

The Lambdas re-read these within five minutes; no redeploy. A key/mode mismatch (a test key on
prod, a live key on dev) is refused by the script AND by the runtime loader.

Changing a price: prices are immutable in Stripe. Edit the catalogue in the script, run with
`--rotate-prices`, and the lookup keys move to the new prices; existing subscribers keep their old
price until they change plans.

## 3. Verify

**Dev (test mode, fully automated):**

```sh
pnpm billing:verify        # = infra/verify-billing.sh dev
```

It mints a throw-away Cognito user and proves: billing reported as configured → Checkout URL on
`checkout.stripe.com` → portal URL on `billing.stripe.com` → forged webhooks rejected → a real
test-mode subscription (`pm_card_visa`) created through the Stripe API lands as **Lantern** via the
webhook → cancelling it lands as **Hearth** → `DELETE /account` deletes the Stripe customer. It
cleans up after itself on every exit path. Expect ~2 minutes; most of it is waiting on webhooks.

Then click through it once in the dev web app (`dev.lamplight.click` or a local build against dev):
Plans & cloud → Subscribe to Lantern → Stripe test card `4242 4242 4242 4242`, any future date,
any CVC → you return to `/#/upgrade?checkout=success`, the banner says "Confirming…", and within a
few seconds the toast says you are on Lantern. Settings → Subscription shows "Renews on …" and
**Manage billing** opens the portal, where cancel/switch/card/invoices all work.

**Prod (live mode) smoke test, once:** subscribe yourself with a real card, confirm the plan lands,
then cancel from the portal — or refund the invoice from the Dashboard. Cost: one month of Lantern
minus Stripe's fee if you refund (Stripe keeps the 30¢ + 2.9% on refunds).

## 4. Go live (prod)

1. `promote-production.yml` at a tag that includes this work (the app-api stack gains the webhook
   Lambda and routes; the web app gains the Checkout flow). Order does not matter relative to the
   bootstrap: without SSM parameters the new routes are inert.
2. Run the prod bootstrap (step 2) with the **live** key and the legal-page URLs.
3. In the Stripe Dashboard (live mode) → Developers → Webhooks: the endpoint the script created
   should show "Enabled" and, after the smoke test, a 200 for each delivered event.
4. Prod smoke test (step 3).
5. Flip ADR-027 to **Accepted** with the verify output attached.

## 5. Operating it

- **Alarm: `dndtools-prod-app-api-BillingWebhookErrorsAlarm`** (prod only). Fires when the
  webhook Lambda fails to apply an event. Stripe retries for up to 3 days with backoff, so a fix
  deployed inside that window heals itself. Causes seen by design:
  - a subscription not linked to any account (created by hand in the Dashboard without
    `metadata.cognito_sub`) — add the metadata, or cancel it;
  - a GRANTING subscription on a price not in `…/billing/config` (a price created in the
    Dashboard instead of by the bootstrap) — re-run the bootstrap or add the price to the config.
- **Stripe Dashboard → Developers → Webhooks → the endpoint** lists every delivery with our
  response. A 400 there means a signature problem: the SSM `stripe-webhook-secret` no longer
  matches the endpoint (someone rolled it). Re-run the bootstrap; it recreates the endpoint and
  writes the new secret.
- **Refunds, disputes, invoices, tax:** all in the Dashboard. Nothing in our data needs editing —
  the entitlement follows the subscription's status via the webhook.
- **Rotating the API key:** roll it in the Dashboard, re-run the bootstrap with the new key. The
  Lambdas pick it up within five minutes; the old key can then be deleted.
- **Turning billing off** (rollback per ADR-027): delete the three SSM parameters. Every route
  fails closed within five minutes; existing entitlement rows are untouched (paid users keep
  their plan until you cancel their subscriptions in the Dashboard, which the webhook — now
  disabled — will not apply, so also set their rows to `hearth` by hand or re-enable the webhook
  first and cancel afterwards).

## 6. How the entitlement is protected (for reviewers)

- The client can never grant itself a paid plan: `POST /account/entitlements` refuses paid plans on
  prod (pre-existing) and refuses to touch a row bound to an active Stripe subscription.
- Only the webhook Lambda writes paid rows. It verifies the Stripe signature over the raw body,
  refuses events whose `livemode` disagrees with the stage, and then **re-reads the subscription
  from Stripe** rather than trusting the event payload — so replays, reordering, and forged bodies
  all converge on Stripe's current truth.
- Two write rules (`billing/entitlements.ts`): an older Stripe read never overwrites a newer one
  (`billingSyncedAt` guard), and an ended subscription only downgrades the account if it is the one
  the account is bound to.
- `DELETE /account` deletes the Stripe customer first (cancelling its subscriptions) and fails
  closed if billing is unreachable, so a deleted account can never keep being charged.
- The web client only ever navigates to `https://*.stripe.com` URLs and only offers Checkout on the
  plain web build; Android and desktop inform ("Subscribe at lamplight.click") and link nowhere.

## Related

- ADR-027 `docs/adr/027-stripe-web-billing-and-entitlement-write-path.md` (Proposed → Accepted at go-live).
- `docs/planning/RC_ROADMAP.md` § RC-CLD-2.1.
- `infra/README.md` § Stripe billing parameters.
