# Security — P2P Remote-Player Sessions (Epic 7.3)

This document is the threat model for the **LAN / serverless peer-to-peer remote-player** feature in
`apps/gm-react` (Epic 7.3 story S7.3.4). It covers only the LAN P2P transport. The **cloud** storage
security model is separate (see ADR-015/ADR-017 and `packages/core/src/security/vault-crypto.ts`): cloud
backup is end-to-end encrypted with client-held keys, stays **off by default** behind the fail-closed
SYNC-017 gate (`packages/core/src/sync/cloud-sync-gate.ts`), and is **not** affected by this LAN feature.
Internet remote play (Cognito accounts + a TURN-relayed WebRTC path) is also separate from this LAN model.

## What the feature does

A DM (the **host**) shares a live session with **players** over the local network. The host device holds
the single authoritative campaign state (`SceneRuntime`). Each player joins as a **non-authoritative view**
and receives a player-safe snapshot of the table; players send back only _intents_ (dice rolls, edits to
their own character). Transport is a **WebRTC data channel per player**, LAN-only, with **no STUN/TURN and
no signaling server** — nothing is ever sent to a cloud or third party.

## Trust boundaries

| Boundary                | Trusted?            | Notes                                                                               |
| ----------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| DM host device          | Yes (root of trust) | Holds authoritative state; the only writer to durable storage.                      |
| The local network       | **No**              | Assumed hostile: other hosts may sniff mDNS and attempt to connect.                 |
| A joined player         | Partially           | Authenticated to a specific participant identity; may act only as that actor.       |
| A player's device cache | **No**              | Never authoritative (`con/source-of-truth.ts`); holds only player-safe view-models. |

## Guarantees and how they are enforced

1. **Hidden content never leaves the host.** DM→player replication sends _filtered view-models_ built
   through the actor-filtered query layer (`buildPlayerData` → `*ForActor` queries, which run the core
   visibility engine). A player's snapshot is player-safe **by construction** — dm-only/unshared content is
   never serialized to it, so there is nothing to "hide in the UI." (Reinforces Contract 2 "filter before
   send".)

2. **A player cannot impersonate another actor.** Commands carry no trusted `actorId` on the wire. The host
   **stamps** the authenticated participant id (bound at invite time from the registered roster) onto every
   relayed command before dispatch, and the Core re-enforces that actor's real authority (owner/grant). A
   spoofed or elevated id is impossible; a request to edit content the actor does not own is rejected by the
   Core, not the transport.

3. **The player device is never authoritative.** Players hold only replicated view-models and a private,
   device-local journal that is never synced (S7.4.3). Disconnecting a player cannot corrupt the table; the
   host remains the sole source of truth.

4. **Confidentiality + integrity on the wire.** Every data-channel message is **AES-GCM** sealed with a
   256-bit per-invitation **session key** (WebCrypto). The key is delivered inside the invitation payload
   (connection code / QR / mDNS handshake) — holding the code is the credential. WebRTC's own DTLS provides
   a second encryption layer; the application-layer key exists so the DM can **revoke**.

5. **Revocation.** Each invitation has its own key. The DM revokes a player by dropping that peer's link;
   its key can no longer talk to the host. (A `rekey` message exists for rotating a live peer's key.) There
   is no shared group key to leak.

6. **No presence in durable state.** Presence (online status, raise-hand/ready) is ephemeral and travels as
   its own message kind; it never enters the operation log (guarded in core by
   `collab/presence.ts#assertNoPresenceInOperationLog`).

## Residual risks / non-goals

- **LAN adversary with the code.** Anyone who obtains an invitation code can join as that participant until
  revoked. Codes are single-participant and revocable; treat them like a table password. Rotating/short
  expiry of codes is a future enhancement.
- **mDNS visibility.** Advertising a table over `_dndtools._tcp.local` reveals that a table exists on the
  LAN (a session name + host address). It does **not** reveal campaign content. Discovery can be disabled by
  using the manual code flow.
- **Denial of service on the LAN.** A hostile peer on the network could spam connection attempts. The host
  only admits answers for outstanding invitations; unmatched/garbled frames are dropped (AES-GCM auth
  failure). Rate-limiting is a future enhancement.
- **Not end-to-end verified identity.** Player identity is "whoever holds the invitation for participant X,"
  not a cryptographic user identity. This matches the local-table trust model (people in the same room).

## Verification

- Automated: `apps/gm-react/scripts/verify-p2p.mjs` (AES-GCM round-trip + wrong-key rejection; connection-
  code encode/decode) and the player-safety leak assertions.
- Manual (LAN): two instances on one network — host, join by code, then by mDNS; confirm live projection,
  the dice/character back-channel, presence, reconnect, and revoke-by-drop; confirm **zero external network**
  by disconnecting from the internet and verifying LAN play still works.
