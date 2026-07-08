# Security

This is the security home for DND Tools. It summarizes the threat model and links to the detailed
audits and decision records. There is one threat model, described here — do not duplicate it elsewhere.

## Posture

DND Tools is **local-first**. With no account and no opt-in, the app is fully local-only: campaign
state lives in the browser's IndexedDB (or the Electron shell's local storage), with no cloud storage,
no third-party telemetry, and no remote sync. Every networked capability — LAN remote play, internet
remote play, and cloud sync — is **opt-in** and additive.

The processing core (`packages/core`) is the single source of authoritative state, and it is
framework-free (no DOM/Node/network access). Actor-scoped queries in the core strip DM-only/hidden
content **before** it reaches a view or is replicated to a player.

## Threat surfaces

| Surface | Trust model | Where it's covered |
| --- | --- | --- |
| Local device / IndexedDB | Trusted (the user's own machine); not authoritative until written through a command | `apps/gm-react/src/platform/storage/coreStore.ts` |
| LAN / serverless remote play (WebRTC) | LAN assumed hostile; players are non-authoritative and receive only player-safe view-models | [P2P threat model](../SECURITY.md), `apps/gm-react/src/net/` |
| Internet remote play (signaling + TURN) | Relay is untrusted; sees only opaque, already-encrypted offer/answer codes and short-lived HMAC TURN credentials | [P2P threat model](../SECURITY.md), `packages/cloud-fns`, `infra/signaling`, `infra/turn` |
| Cloud sync/backup | End-to-end encrypted with **client-held** keys; the server holds no key and never decrypts; tenant-isolated by Cognito `sub` | [ADR-015](../adr/015-v2-cloud-security-model-and-key-custody.md), [ADR-017](../adr/017-concrete-cloud-e2ee-crypto.md), [cloud audit](cloud-security-audit-2026-07.md) |

## Key controls

- **Actor-safety.** DM→player replication sends filtered view-models built from the core's
  actor-filtered query layer; hidden content never leaves the host. Enforced by the core, not the UI.
- **E2EE cloud sync.** AES-256-GCM per key epoch, sealed on-device before upload
  (`packages/core/src/security/vault-crypto.ts`). The sync-api stores ciphertext plus a strictly
  bounded metadata set, proven on every write. Off by default and **fail-closed** behind the
  `SYNC-017` gate (`packages/core/src/sync/cloud-sync-gate.ts`); offered only on devices with an OS
  credential store to durably hold the client key.
- **Credential custody.** Cognito auth/refresh tokens live in the OS credential store on desktop and
  are memory-only on the web — never in IndexedDB/localStorage or logs
  (`apps/gm-react/src/cloud/tokenStore.ts`, `secureStore.ts`).
- **Untrusted relay.** The WebRTC signaling relay and coturn TURN never see plaintext session content.

## Detailed documents

- **LAN P2P remote-play threat model:** [`../SECURITY.md`](../SECURITY.md)
- **Cloud security audit (2026-07):** [`cloud-security-audit-2026-07.md`](cloud-security-audit-2026-07.md)
- **Cloud security model + key custody:** [ADR-015](../adr/015-v2-cloud-security-model-and-key-custody.md)
- **Concrete cloud E2EE crypto:** [ADR-017](../adr/017-concrete-cloud-e2ee-crypto.md)

## Open items

Tracked in the [cloud audit](cloud-security-audit-2026-07.md): the hardened SAM stacks must be
redeployed (`sam deploy` of `foundation`, `turn`, `signaling`, `identity`) for the infra fixes to take
effect, plus CloudFront CSP parity and server-side abuse budgets on the sync-api.

## Reporting

This is a personal, local-first application. Security concerns should be filed as GitHub issues in the
project repository.
