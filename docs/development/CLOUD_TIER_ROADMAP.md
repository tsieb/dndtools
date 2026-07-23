# Cloud Product / Paid-Tier Roadmap

Adopted 2026-07-22 (strategy review); recorded in-repo 2026-07-23 alongside ADR-026, which executes
P0 #1 and P0 #3. This is the prioritized plan for making the paid tiers (ADR-020) worth paying for.

## Thesis

The app is excellent as a local-first tool but thin as a cloud product, because the E2EE-by-default
invariant (ADR-015/017, SEC-009) blocked every server-side premium feature. ADR-026 reframes E2EE as
the **Private** mode of an explicit per-vault choice; the **Cloud-Enhanced** mode (server-readable
under KMS) unlocks the class of features that justify a subscription.

### Feature ↔ mode compatibility matrix

| Capability                                         | Private (E2EE) | Cloud-Enhanced |
| -------------------------------------------------- | :------------: | :------------: |
| Encrypted backup / restore (existing)              |       ✅       |       ✅       |
| Internet remote play (P2P/relay, ECDH, ephemeral)  |       ✅       |       ✅       |
| Module marketplace & public wiki (public content)  |       ✅       |       ✅       |
| Co-DM seats                                        |       ✅       |       ✅       |
| Cross-device sync (ciphertext)                     |       ✅       |       ✅       |
| Push notifications (metadata only)                 |       ✅       |       ✅       |
| Session scheduling / reminders (metadata only)     |       ✅       |       ✅       |
| Managed AI / RAG over the whole campaign           |       ❌       |       ✅       |
| Server-side semantic + full-text search            |       ❌       |       ✅       |
| Browser access to a campaign without the vault key |       ❌       |       ✅       |
| Server-side asset thumbnails / transcoding / CDN   |       ❌       |       ✅       |
| Server-assisted merge / async live player views    |       ❌       |       ✅       |

The ❌ rows are exactly the subscription-worthy offerings — the whole thesis.

## Standing decisions (2026-07-22, product owner)

1. **Vault mode is a forced, undefaulted onboarding choice** (Private E2EE vs Cloud-Enhanced), plus
   forced sample-vs-fresh and, for Private, a typed no-cloud-recovery acknowledgment. Legacy/absent
   = Private. (ADR-026 — shipped.)
2. **Managed inference = cheapest-capable, multi-vendor.** A config-driven cost-routing registry
   (Gemini Flash / Bedrock Haiku / GPT-mini price + capability tiers) lives in data, never
   hardcoded to one vendor.
3. **Billing = Stripe on web** (passes the idle-cost gate: no fixed fee, scale-to-zero webhook
   Lambda); **mobile informs-only** per Play policy (account-scoped entitlements make a web purchase
   live on mobile). Requires its own ADR revisiting ADR-020's entitlement write path.
4. **Cost discipline:** idle cost stays near the ~$5/mo coturn floor. Scale-to-zero everywhere;
   defer any always-on service (managed vector DB has an idle serving floor — brute-force cosine
   over embeddings in DynamoDB/S3 until revenue justifies an index).

## GCP verdict: targeted hybrid, not a backend swap

AWS backbone stays. Adopt where Google wins: **Gemini** (BYO provider — shipped as a Settings
preset; later the managed Copilot's primary engine), **FCM** push (app has zero push infra, ships
Android), **Google Calendar/Sheets** (client-side, additive), **Play Billing** (mandatory if Android
monetizes). Reject Firebase/Firestore/Cloud Run/GCS as replacements for the hardened AWS stacks.

## Prioritized roadmap

### P0 — Enabling foundations

1. ✅ **ADR-026 + threat model: opt-in vault privacy modes** (2026-07-23). Phase 1 shipped: forced
   consent, mode-aware gates, Cloud-Enhanced record fail-closed (`approved: false`) pending the
   phase-2 security review.
2. ⬜ **Prod stage rollout.** `prod` foundation is unbootstrapped (`infra/README.md`); manual
   foundation bootstrap + SES verification + prod OIDC subject. No paid product ships on `dev`.
   _Requires operator AWS access — cannot be done from the repo alone._
3. ✅ **Recovery-key export for E2EE backup** (2026-07-23, ADR-026): passphrase-sealed keyring
   export/import in Settings; Private-mode recovery declaration flips to `supported`.

### P1 — Flagship paid capabilities

4. ⬜ **Campaign Copilot** — managed AI/RAG over the whole vault (Cloud-Enhanced only). The single
   highest-value paid offering. De-risk first: prototype RAG on one real campaign, measure answer
   quality + token cost (Gemini context caching changes the economics — measure it).
5. ⬜ **Server-side semantic + full-text search** (Cloud-Enhanced; shares the embeddings pipeline).
6. ⬜ **Keyless browser access** (Cloud-Enhanced) — unanchors the web app from the desktop keychain.
7. ⬜ **Push notifications via FCM** (both modes; needs a Firebase project + client wiring).

### P2 — Integrations that deepen the product

8. ⬜ Session scheduling + reminders (Google Calendar + FCM; metadata-only, works with Private).
9. ⬜ Live player companion / async play (server-brokered views; Cloud-Enhanced or key-shared).
10. ⬜ Cloud media/asset CDN + thumbnails/transcoding (Cloud-Enhanced).
11. ⬜ Marketplace monetization (Stripe Connect revenue share).
12. ⬜ Public wiki upgrades: custom domains, themes, player handbook.

### P3 — Production hardening the paid tiers assume

13. ⬜ TURN production HA (`turns:`/TLS, secret rotation, failover).
14. ⬜ Custom domain + ACM cert (`us-east-1`) for web-hosting + wiki.
15. ⬜ Privacy-respecting product analytics to drive tier/pricing decisions.

## Tier re-shape (illustrative)

- **Hearth (free):** local-first tool + BYO-key AI + LAN play; E2EE backup stays available as the
  privacy anchor.
- **Lantern ($7):** cloud backup, internet remote play (needs #13), 1 co-DM, scheduling + push.
- **Beacon ($15):** Lantern + Cloud-Enhanced features — Copilot (#4), search (#5), keyless browser
  (#6), asset CDN (#10), 3 co-DM, wiki custom domain.
- **Private (E2EE) mode:** available on every tier; forced explicit choice at onboarding.

## Blocked-on-external checklist

| Item                   | Blocked on                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| P0 #2 prod bootstrap   | Operator AWS session (foundation bootstrap + SES + OIDC subject)                          |
| Stripe billing         | Stripe account + business/compliance decision + billing ADR                               |
| FCM push (#7)          | Firebase project + server key custody decision                                            |
| Play Billing           | Only if Android monetizes; policy review at build time                                    |
| Cloud-Enhanced phase 2 | Security review sign-off of `docs/security/vault-privacy-modes-threat-model.md` checklist |
