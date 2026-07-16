# Security

This is the security home for DND Tools. It summarizes the threat model and links to the detailed
audits and decision records. There is one threat model, described here — do not duplicate it elsewhere.

## Posture

DND Tools is **local-first**. With no account and no opt-in, the app is fully local-only: campaign
state lives in the renderer's Dexie/IndexedDB database on browser, Electron, and Android, with no cloud
storage, no third-party telemetry, and no automatic remote synchronization. Every networked
capability — LAN remote play, internet remote play, cloud backup, and hosted AI — is **opt-in** and
additive. Builds without the complete trusted production cloud coordinates remain local-only; partial
configuration fails closed.

The processing core (`packages/core`) is the single source of authoritative state, and it is
framework-free (no DOM/Node/network access). Actor-scoped queries in the core strip DM-only/hidden
content **before** it reaches a view or is replicated to a player.

## Threat surfaces

| Surface                                 | Trust model                                                                                                                                                                         | Where it's covered                                                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local device / IndexedDB                | Trusted (the user's own machine); not authoritative until written through a command                                                                                                 | `apps/gm-react/src/platform/storage/coreStore.ts`                                                                                                                     |
| Android native boundary                 | App sandbox and Keystore are trusted; external intents, shared destinations, network origins, and device backup are not                                                             | [ADR-006](../adr/006-multi-platform-approach-electron-capacitor.md), [Android alpha runbook](../runbooks/android-alpha.md)                                            |
| LAN / serverless remote play (WebRTC)   | LAN assumed hostile; players are non-authoritative and receive only player-safe view-models                                                                                         | [P2P threat model](../SECURITY.md), `apps/gm-react/src/net/`                                                                                                          |
| Internet remote play (signaling + TURN) | Relay is untrusted; sees only opaque, already-encrypted offer/answer codes and short-lived HMAC TURN credentials                                                                    | [P2P threat model](../SECURITY.md), `packages/cloud-fns`, `infra/signaling`, `infra/turn`                                                                             |
| Cloud backup                            | End-to-end encrypted with **client-held** keys; the server holds no key and never decrypts; tenant-isolated by Cognito `sub`; restore is explicit and does not merge device changes | [ADR-015](../adr/015-v2-cloud-security-model-and-key-custody.md), [ADR-017](../adr/017-concrete-cloud-e2ee-crypto.md), [cloud audit](cloud-security-audit-2026-07.md) |

## Key controls

- **Actor-safety.** DM→player replication sends filtered view-models built from the core's
  actor-filtered query layer; hidden content never leaves the host. Enforced by the core, not the UI.
- **E2EE cloud backup.** AES-256-GCM per key epoch, sealed on-device before upload
  (`packages/core/src/security/vault-crypto.ts`). V2 envelopes authenticate the Cognito account,
  vault, artifact kind, and revision as additional data; the server independently enforces the same
  context, so an otherwise valid ciphertext cannot be transplanted. The sync-api stores ciphertext
  plus a strictly bounded metadata set, proven on every write. Off by default and **fail-closed** behind the
  `SYNC-017` gate (`packages/core/src/sync/cloud-sync-gate.ts`); offered only on devices with an OS
  credential store to durably hold the client key.
- **Recovery limits.** The current product has no recovery-key export or automatic key transfer.
  Restore therefore requires a device that already holds the account-and-vault key. Users should keep
  a separate local vault backup, which includes its validated media bytes; cloud backup does not
  include device-local media bytes.
- **Credential custody.** Cognito auth/refresh tokens live in Electron `safeStorage` or in
  AES-GCM-encrypted Android preferences whose non-exportable key is held by Android Keystore. They are
  session-only on the web and never enter IndexedDB/localStorage, the vault, operation log, or logs
  (`apps/gm-react/src/cloud/tokenStore.ts`, `secureStore.ts`). Android secure preferences are excluded
  from backup/device transfer, and uninstall removes both key and ciphertext.
- **Android network boundary.** Android denies cleartext traffic and mixed WebView content, keeps
  Safe Browsing enabled, admits hosted AI only over HTTPS, and opens trusted external HTTPS links
  outside the embedded WebView. Local Ollama/HTTP endpoints remain desktop-only.
- **Android export boundary.** Native export writes only to a bounded app-cache file, grants a
  recipient temporary read access through `FileProvider`, and cleans stale files. Users choose the
  final share/save destination.
- **Signing custody.** The permanent `dndtools-alpha` key is held outside git and supplied to Actions
  through encrypted repository secrets. Its identity is required for Android in-place upgrades; see
  the [Android alpha runbook](../runbooks/android-alpha.md).
- **Untrusted relay.** The WebRTC signaling relay and coturn TURN never see plaintext session content.

## Detailed documents

- **LAN P2P remote-play threat model:** [`../SECURITY.md`](../SECURITY.md)
- **Cloud security audit (2026-07):** [`cloud-security-audit-2026-07.md`](cloud-security-audit-2026-07.md)
- **Cloud security model + key custody:** [ADR-015](../adr/015-v2-cloud-security-model-and-key-custody.md)
- **Concrete cloud E2EE crypto:** [ADR-017](../adr/017-concrete-cloud-e2ee-crypto.md)
- **Android build, signing, backup, and recovery:**
  [`../runbooks/android-alpha.md`](../runbooks/android-alpha.md)

## Open operational items

The current templates include exact-origin web CSP, log retention, DynamoDB PITR, immutable coturn
image pinning, request/concurrency/storage budgets, alarms, dashboards, and bounded account purge.
They still require an authorized deployment and live smoke verification before those controls can be
claimed for production. Production-grade internet play also needs TURN TLS, tested rotation, and
multi-host failover; open self-signup remains a deliberate beta posture that must be monitored for abuse.

## Reporting

This is a personal, local-first application. Security concerns should be filed as GitHub issues in the
project repository.
