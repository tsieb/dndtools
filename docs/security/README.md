# Security

The one threat model for Lamplight. Do not duplicate it elsewhere; link here.

## 1. Posture

Lamplight is local-first. With no account and no opt-in, campaign state lives in the renderer's
Dexie/IndexedDB database on browser, Electron, and Android, with no cloud storage, no telemetry,
and no remote synchronization. Every networked capability (LAN remote play, internet remote play,
cloud backup, hosted AI, billing, analytics) is opt-in and additive; a build without complete
trusted cloud coordinates stays local-only and partial configuration fails closed.

The processing core (`packages/core`) is the single source of authoritative state and is
framework-free. Actor-scoped queries strip DM-only and hidden content before it reaches a view or is
replicated to a player. Every durable write is a validated command.

## 2. Threat surfaces

| Surface                                 | Trust model                                                                                                                                                                                | Where it is covered                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Local device / IndexedDB                | Trusted (the user's machine); not authoritative until written through a command                                                                                                            | `apps/gm-react/src/platform/storage/coreStore.ts`                                                                                        |
| Player-private store                    | A per-character database that no sync, backup, replication, or MCP path can name; the only exit is one explicit share command                                                              | [ADR-035](../adr/035-player-private-device-local-store.md), `platform/storage/privateStore.ts`                                           |
| Android native boundary                 | App sandbox and Keystore trusted; intents, share destinations, network origins, and device backup are not                                                                                  | [ADR-006](../adr/006-multi-platform-approach-electron-capacitor.md), [`../runbooks/android-alpha.md`](../runbooks/android-alpha.md)      |
| LAN remote play (WebRTC)                | LAN assumed hostile; players non-authoritative and receive only player-safe view-models                                                                                                    | §3 below, `apps/gm-react/src/net/`                                                                                                       |
| Internet remote play (signaling + TURN) | Relay untrusted; sees only ECDH-wrapped offers and short-lived HMAC TURN credentials; admission needs an out-of-band join PIN                                                              | §3 below, `packages/cloud-fns`, `infra/signaling`, `infra/turn`                                                                          |
| Cloud backup (Private mode)             | End-to-end encrypted with client-held per-epoch keys; the server stores ciphertext plus six metadata classes; tenant-isolated by Cognito `sub`                                             | [ADR-015](../adr/015-v2-cloud-security-model-and-key-custody.md), [ADR-017](../adr/017-concrete-cloud-e2ee-crypto.md)                    |
| Cloud-Enhanced mode                     | Consented server-readable content under KMS. Phase 1 ships the consent only; the record is `approved: false` and every server-readable path stays gated until the phase-2 review signs off | [ADR-026](../adr/026-opt-in-vault-privacy-modes.md), [`vault-privacy-modes-threat-model.md`](vault-privacy-modes-threat-model.md)        |
| Custom widgets                          | Third-party script runs in an opaque-origin iframe or a worker; the core decides every permission and outbound request; trust is granted per permission by a DM review                     | [ADR-031](../adr/031-custom-widget-runtime-host.md), [`../architecture/WIDGETS.md`](../architecture/WIDGETS.md)                          |
| AI providers                            | BYO key held device-local, never in the vault or op log; every model write is a staged proposal a DM approves                                                                              | [ADR-021](../adr/021-client-side-ai-provider-transport.md), [ADR-025](../adr/025-agentic-multi-step-assistant-runs.md)                   |
| Billing (Stripe)                        | Card data never touches our code (hosted Checkout and portal, SAQ-A). The webhook is the only paid-entitlement writer: signature-verified, mode-checked, re-reads Stripe before writing    | [ADR-027](../adr/027-stripe-web-billing-and-entitlement-write-path.md), [`../runbooks/stripe-billing.md`](../runbooks/stripe-billing.md) |
| Product analytics                       | Opt-in, closed vocabulary, no identifiers, nothing stored server-side                                                                                                                      | [ADR-036](../adr/036-opt-in-product-analytics.md), [`../development/PRODUCT_ANALYTICS.md`](../development/PRODUCT_ANALYTICS.md)          |

## 3. Remote play threat model

A DM host holds the single authoritative `SceneRuntime`. Each player joins as a non-authoritative
view over a WebRTC data channel and sends back only intents (dice rolls, edits to its own character).
LAN play uses no STUN, TURN, or signaling server; manual codes work everywhere and mDNS discovery is
Electron-only. Internet play reuses the transport over the signaling relay and coturn.

Guarantees and how they are enforced:

1. **Hidden content never leaves the host.** Replication sends view-models built by `buildPlayerData`
   from the actor-filtered `*ForActor` queries, so a snapshot is player-safe by construction.
2. **A player cannot impersonate another actor.** Commands carry no trusted `actorId`; the host
   stamps the authenticated participant id and the core re-checks that actor's authority.
3. **The player device is never authoritative.** It holds replicated view-models and its private
   journal; disconnecting cannot corrupt the table.
4. **Confidentiality and integrity on the wire.** Every message is AES-GCM sealed with a 256-bit
   per-invitation session key delivered inside the invitation; DTLS is a second layer. The DM revokes
   a player by dropping the peer; a `rekey` message rotates a live key.
5. **Online admission needs the PIN.** The cloud bridge wraps offers with ECDH (P-256) → HKDF-SHA256
   salted by a per-session PIN → AES-256-GCM (`net/cloudCrypto.ts`). The relay never sees the PIN
   or the session key, `browse` returns only the caller's own rooms, and a joiner without the PIN
   cannot open the sealed offer.
6. **Presence never enters durable state** (`collab/presence.ts#assertNoPresenceInOperationLog`).

Residual risks: anyone holding an invitation code or join code can join until revoked (treat it like
a table password); mDNS reveals that a table exists, not its content; a hostile LAN peer can spam
connection attempts (unmatched frames fail AES-GCM auth and are dropped); player identity is
"whoever holds the invitation", matching the same-room trust model.

Verification: `apps/gm-react/scripts/verify-p2p.mjs` (AES-GCM round-trip, wrong-key rejection,
code encode/decode) and the leak assertions in the cloud suite; manual two-instance LAN check with
the internet disconnected.

## 4. Key controls

- **E2EE backup.** AES-256-GCM per key epoch, sealed on-device (`packages/core/src/security/vault-crypto.ts`).
  V2 envelopes authenticate account, vault, artifact kind, and revision as additional data and the
  sync-api recomputes that context from the verified JWT, so ciphertext cannot be transplanted.
  `assertServerSeesOnlyAllowedMetadata` proves the bounded metadata set before upload. Off by default
  and fail-closed behind the `SYNC-017` gate (`packages/core/src/sync/cloud-sync-gate.ts`); offered
  only on devices with an OS credential store. Cross-device sync compares op-logs and blocks a push on
  divergence rather than merging silently ([ADR-037](../adr/037-cross-device-merge-by-op-log-comparison.md)).
- **Recovery.** A Private-mode keyring can be exported as a passphrase-sealed file (PBKDF2-SHA-256,
  600k iterations, then AES-256-GCM) and imported on another device; import merges epochs
  conservatively. Cloud backup carries no device-local media bytes, so a local vault export remains
  the complete portable backup.
- **Credential custody.** Cognito tokens and AI keys live in Electron `safeStorage` or Android
  Keystore-encrypted preferences, session-only on the web, and never in IndexedDB, localStorage, the
  vault, the op log, or logs (`apps/gm-react/src/cloud/tokenStore.ts`, `secureStore.ts`).
- **Android boundaries.** Cleartext and mixed content denied, Safe Browsing on, hosted AI over HTTPS
  only, external links opened outside the WebView, exports through a bounded cache file and
  `FileProvider`, Keystore preferences excluded from backup.
- **Signing custody.** The permanent `dndtools-alpha` Android key lives outside git and reaches
  Actions through encrypted secrets; losing it prevents in-place upgrades.
- **Regression gates.** `packages/core/src/security/regression-gates.ts` declares the security
  invariants the test suite proves; `pnpm security:secrets` scans tracked files for credentials.

## 5. Audit history

A three-auditor review of the cloud stacks, Lambdas, and client on 2026-07-06 found and fixed five
critical or high findings (an escalatable CI deploy role, a coturn secret written to a log, an open
TURN relay, an unauthorized `offer` relay, and a session key relayed in cleartext) plus a set of
medium findings; a follow-up on 2026-07-07 added the join PIN and scoped `browse`. The dated report
was retired from the tree on 2026-09-11 and remains in git history at
`docs/security/cloud-security-audit-2026-07.md`. RC-ENG-5.1 (whole-app security review) is the next
scheduled pass.

## 6. Open by design

- Production-grade internet play still needs TURN over TLS in production, tested secret rotation,
  and multi-host failover ([ADR-039](../adr/039-turn-tls-and-secret-rotation.md), `infra/turn/README.md`).
- Open self-signup is a monitored beta posture; add a `PreSignUp` allow-list or Cognito threat
  protection if abuse appears.
- Cloud-Enhanced remains `approved: false` until the phase-2 checklist is signed.

## 7. Reporting

This is a personal, local-first application. File security concerns as GitHub issues in the
project repository.
