# Cloud Product and Paid-Tier Roadmap

Adopted 2026-07-22. The product thesis for the paid tiers ([ADR-020](../adr/020-app-api-backend-and-simulated-entitlements.md),
[ADR-027](../adr/027-stripe-web-billing-and-entitlement-write-path.md)) and the standing decisions the
CLD workstream in [`RC_ROADMAP.md`](RC_ROADMAP.md) §14 executes.

## Thesis

The app is strong as a local-first tool and thin as a cloud product, because the E2EE-only
invariant blocked every server-side premium feature. [ADR-026](../adr/026-opt-in-vault-privacy-modes.md)
reframes E2EE as the **Private** mode of an explicit per-vault choice; the **Cloud-Enhanced** mode
unlocks the features that justify a subscription.

| Capability                                        | Private (E2EE) | Cloud-Enhanced |
| ------------------------------------------------- | :------------: | :------------: |
| Encrypted backup and cross-device merge sync      |       ✅       |       ✅       |
| Internet remote play (relay, ECDH, ephemeral)     |       ✅       |       ✅       |
| Marketplace, public wiki, co-DM seats             |       ✅       |       ✅       |
| Push notifications and scheduling (metadata only) |       ✅       |       ✅       |
| Managed AI / RAG over the whole campaign          |       ❌       |       ✅       |
| Server-side semantic and full-text search         |       ❌       |       ✅       |
| Keyless browser access                            |       ❌       |       ✅       |
| Server asset thumbnails, transcoding, CDN         |       ❌       |       ✅       |
| Server-assisted merge and async player views      |       ❌       |       ✅       |

## Standing decisions

1. Vault mode is a forced, undefaulted onboarding choice; legacy or absent means Private. Shipped.
2. Managed inference is cheapest-capable and multi-vendor, routed by a config-driven registry, never
   hardcoded to one vendor.
3. Billing is Stripe on the web; mobile informs only, per Play policy. Account-scoped entitlements
   make a web purchase live on every device. Shipped and verified on dev; prod waits on the account.
4. Idle cost stays near the coturn floor: scale-to-zero everywhere, no always-on services, no vector
   database until revenue justifies one (brute-force cosine over embeddings first).
5. AWS stays the backbone. Google is adopted where it wins: Gemini as a BYO provider (shipped) and
   the future Copilot engine, FCM for push, Calendar and Docs client-side, Play Billing only if
   Android ever monetizes directly.

## Tiers (illustrative)

- **Hearth (free):** local-first tool, BYO-key AI, LAN play, E2EE backup.
- **Lantern ($7):** cloud backup, internet remote play, one co-DM, scheduling and push.
- **Beacon ($15):** Lantern plus Cloud-Enhanced features (Copilot, search, keyless browser, asset
  CDN), three co-DMs, wiki custom domain.

## Blocked on external action

| Item                                     | Blocked on                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Public sign-up                           | Replying to the SES production-access case (`../runbooks/ses-production-access.md`)   |
| Stripe billing in prod                   | Opening the Stripe account, the tax-handling decision, filling the legal placeholders |
| Campaign Copilot, search, keyless access | The Cloud-Enhanced phase-2 review (`../security/vault-privacy-modes-threat-model.md`) |
| FCM push                                 | A Firebase project and a server-key custody decision                                  |
| TURN production HA                       | DNS and the TLS cutover in `infra/turn/README.md`                                     |

The RAG de-risk measurement that validated the Copilot architecture is
[`../development/COPILOT_RAG_DERISK.md`](../development/COPILOT_RAG_DERISK.md).
