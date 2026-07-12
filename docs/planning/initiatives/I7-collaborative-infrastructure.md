# Initiative 7 — Collaborative Infrastructure

## Status: DELIVERED (2026-07-11)

<!-- The cloud (Cognito + E2EE sync + signaling/TURN) and LAN P2P remote-play transports shipped in
the cloud-backend + completion passes; the e2e-readiness pass closed the last deferred piece, the
Co-DM elevated role (ADR-022): hasDmAuthority vs isCampaignOwnerRole split, owner-only seat-gated
permission.assign-role, elevated P2P view-model, PlayerView elevated tier. Evidence: FEATURE-GAPS.md
§0★★★★; core co-dm-role.test.ts; e2e co-dm.spec.ts. -->


**Outcome:** Groups of DMs and players can share a live session from any device. The
DM controls what content is visible, and that content appears in real time for players.
This works over the internet via AWS or over LAN via direct P2P — with no required
server for the local case.

---

## Epic 7.1 — AWS Backend Foundation

**Goal:** A secure, scalable AWS backend enables vault sync, user identity, and the
real-time session channel for remote groups.

**Stories:**

- **S7.1.1 — AWS architecture and infrastructure-as-code**
  Define the AWS infrastructure in CDK or Terraform: Cognito user pool (email + OAuth),
  S3 bucket per user for vault storage (server-side KMS encryption), DynamoDB for vault
  metadata and session state, API Gateway + Lambda for REST endpoints, and API Gateway
  WebSocket for the real-time channel. Infrastructure is committed to `infra/` in the
  repo.

- **S7.1.2 — Authentication flow (sign-up, sign-in, MFA)**
  Implement in-app auth using Cognito: email/password sign-up with email verification,
  sign-in with JWT token management, optional TOTP MFA, and token refresh. Auth state is
  managed in a dedicated auth store, not mixed with vault state. All tokens are stored in
  secure platform storage (Keychain/Credential Store), never localStorage.

- **S7.1.3 — Vault-to-cloud sync with conflict resolution**
  On cloud account connection, vault files sync to the user's S3 bucket with: incremental
  delta sync (only changed files), versioned S3 objects for rollback, and client-side
  encryption before upload using a user-controlled key. Sync status is visible in Settings.

- **S7.1.4 — End-to-end encryption for cloud vault content**
  Derive a per-vault encryption key from the user's password + server-stored salt
  (PBKDF2). Encrypt all vault content before S3 upload. The server never sees
  plaintext vault content. Key rotation is supported with re-encryption workflow.

---

## Epic 7.2 — Real-Time Session Sync

**Goal:** Multiple participants can share a live session view. The DM controls what is
revealed, and players see it in real time.

**Stories:**

- **S7.2.1 — Session channel over WebSocket**
  Implement a session channel using API Gateway WebSocket API. Session lifecycle:
  DM creates session (gets session code), players join with code, DM is session owner
  with elevated permissions. Session state (active board, revealed notes) is stored in
  DynamoDB and pushed to all connected clients on mutation.

- **S7.2.2 — Collaborative session board (DM-controlled)**
  The DM's active session board is mirrored to all connected players in real time. DMs
  can mark individual tiles as "player visible" or "hidden". Players see the board with
  only their permitted tiles. Tile reveal is animated for players (fade in, not flash).

- **S7.2.3 — Live entity reveal workflow**
  DM right-clicks any note or object and selects "Reveal to players". The content
  appears on connected players' devices with a subtle reveal animation. Reveal state
  is persisted in session state so newly joining players see already-revealed content.

- **S7.2.4 — Presence awareness and reconnect handling**
  Show connected player avatars (initials/icon) in the DM's session panel with
  online/away/disconnected status. Clients auto-reconnect with exponential backoff.
  Session state is cached locally so players can continue reading revealed content
  while offline.

---

## Epic 7.3 — P2P Direct Connection (LAN / Serverless)

**Goal:** Local groups can run a full collaborative session entirely without internet
access or AWS account, using direct device-to-device communication.

**Stories:**

- **S7.3.1 — WebRTC P2P session channel**
  Implement a P2P session channel using WebRTC data channels. One device acts as host
  (DM); others join. Data channel carries the same session state protocol as the
  WebSocket channel so the session logic is shared. A STUN server (public) handles
  NAT traversal for LAN scenarios.

- **S7.3.2 — Local network discovery via mDNS**
  On LAN, advertise the session via mDNS (`_dndtools._tcp.local`) so other devices on
  the same network can discover and join without a session code. Show a "devices on
  your network" list in the session join UI. mDNS discovery is Electron-only on
  desktop; mobile uses QR code.

- **S7.3.3 — QR code session invitation**
  The DM's session panel generates a QR code containing the session connection
  parameters (host hint, session ID, auth token). Players scan with the mobile app and
  join instantly. QR codes work for both P2P (encode local address) and cloud sessions
  (encode session code).

- **S7.3.4 — P2P security model (session keys, trust)**
  Each session generates a short-lived symmetric key exchanged via the QR code or
  session code. All P2P data channel messages are encrypted with this key. The DM can
  revoke player access by rotating the session key. Document the threat model in
  `docs/SECURITY.md`.

---

## Epic 7.4 — Player Client Experience

**Goal:** Players have a first-class, purpose-built experience that shows them the right
content at the right time and keeps them engaged between the DM's reveals.

**Stories:**

- **S7.4.1 — Player-optimized UI mode**
  When joining as a player, the app enters player mode: simplified navigation, character
  sheet as the home screen, session board showing only shared tiles, and a "DM is
  typing..." indicator when the DM is updating a shared note. Player mode is also
  available without a connection (for reading pre-shared content).

- **S7.4.2 — Player character sheet synchronization**
  Players edit their own character sheets locally. The DM can view (but not edit)
  player character sheets. When connected, character sheet updates sync in real time.
  HP changes from combat are broadcast to all connected players for the party HP
  overview panel.

- **S7.4.3 — Player private journal**
  Each player has a private notes section that is never shared with the DM or other
  players. Private notes are stored locally only (no sync to DM's vault). The journal
  uses the same markdown editor as the main app.

- **S7.4.4 — Party overview shared panel**
  A shared party panel (visible to all connected participants) shows: party member
  names, current HP bars, conditions, and current location. The DM controls location;
  players control their own HP. This panel is embeddable as a session board tile.

---

## Epic 7.5 — Async Content Sharing & Campaign Wiki

**Goal:** DMs can share specific vault content with players between sessions via a
read-only link — no account required for readers. The shared content is a live,
always-current view of the permitted vault notes.

**Stories:**

- **S7.5.1 — Shareable read-only vault links**
  DMs can right-click any note, folder, or saved search and select "Share link".
  The backend generates a signed read-only token scoped to the selected content.
  The link renders a clean, distraction-free reading view of the shared content at
  a stable URL (`app.dndtools.io/share/{token}`). Links have configurable expiry:
  permanent, 30 days, or session-scoped. Revocation invalidates all existing tokens
  for that content scope.

- **S7.5.2 — Public campaign wiki subdomain**
  DMs can publish their entire vault (or a tagged subset) as a public wiki at a
  configurable subdomain: `{username}.dndtools.app/{campaign-slug}`. The wiki
  renders only notes with `visibility: public`. Navigation follows wikilinks.
  Search is available. Updates sync from the vault automatically on next cloud sync.
  The wiki is static HTML generated server-side for SEO and performance.

- **S7.5.3 — Between-session player inbox**
  Each connected player has a persistent inbox showing: newly revealed notes (since
  last session), delivered handouts, and the DM's shared announcements. Items are
  ordered by reveal time. Players can mark items read. The inbox is accessible without
  a live session connection — it reads from the cloud vault state.

- **S7.5.4 — Session recap publishing workflow**
  After a session, the DM can run a one-click recap workflow: AI (or algorithmic)
  summary is generated, reviewed, and published to the campaign wiki as a session
  log entry. Players receive an inbox notification. The recap note is automatically
  tagged `session-log` and linked to the session's timeline event. Published recaps
  can be commented on by players (comments stored in cloud, not vault).

---

## Epic 7.6 — Multi-Device Sync UX & Conflict Resolution

**Goal:** When a DM uses multiple devices (laptop at home, tablet at the table,
phone for quick lookups), vault state stays consistent, conflicts are surfaced
clearly, and the sync experience never gets in the way of playing.

**Stories:**

- **S7.6.1 — Per-note sync status indicators**
  Every note in the vault has a sync status badge: synced (cloud icon), local-only
  (lock icon), pending upload (clock icon), conflict (warning icon). Status is
  computed from the cloud sync manifest and updated in real time. The sidebar note
  list shows status badges. Bulk status summary is visible in Settings → Sync.

- **S7.6.2 — Three-way conflict resolution UI**
  When a note is modified on two devices between syncs, present a structured conflict
  resolution screen: unified three-way diff (local, remote, last-common-ancestor)
  with line-level highlighting. Actions: accept local, accept remote, merge manually
  in split editor, or defer for later. Deferred conflicts remain flagged in the
  sidebar. Conflict resolution creates a new history entry preserving both versions.

- **S7.6.3 — Sync bandwidth optimization**
  Implement delta-sync: only upload/download the changed bytes of a note, not the
  full file. For large vaults, compute a Merkle tree of note hashes and sync only
  the changed subtrees. Track sync bandwidth used per session in Settings → Sync →
  Usage. Add a "sync budget" option for metered connections (max MB per day).

- **S7.6.4 — Vault version history browser**
  Each note in the cloud vault has a version history going back configurable retention
  (default: 90 days). Add a history browser in the note header: timeline of edits
  with device, timestamp, and change size. Any version can be previewed or restored.
  Bulk version purge is available in Settings → Sync → Storage Management.

---

---
