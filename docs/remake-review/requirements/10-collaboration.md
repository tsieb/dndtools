## COLLAB - Collaboration and Player Sessions

Capability tree:

- Join, reconnect, and identity: `COLLAB-001`, `COLLAB-002`, `COLLAB-013`
- Live session state and presence: `COLLAB-003`, `COLLAB-004`
- Player views and observer access: `COLLAB-005`, `COLLAB-011`
- Combat and handouts: `COLLAB-006`, `COLLAB-007`, `COLLAB-012`
- Authority, filtering, and cache privacy: `COLLAB-008`, `COLLAB-009`, `COLLAB-010`, `COLLAB-014`

### COLLAB-001
**Statement:** The DM shall be able to start a collaborative session and issue invitations or local pairing codes that authenticate participants as DM, Player, or Observer.
**Source:** Architecture Contract 3 Session Join Model; NIST session/authentication guidance.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player uses a valid invitation, when they join, then their role, participant id, grants, visible scenes, and sync cursor are returned.
- Given an expired or revoked invitation is used, when join is attempted, then no session state is disclosed.
- Given a local paired session has already authenticated participants, when remote network is unavailable, then local paired join continues according to platform capability.

### COLLAB-002
**Statement:** A participant shall be able to reconnect to an active session and receive only catch-up operations allowed by their current role, visibility, grants, and sync cursor.
**Source:** Architecture Contract 3 Session Join Model; Architecture Contract 2 replication filtering.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player reconnects after grant revocation, when catch-up sync starts, then revoked grant capabilities are not restored from cache.
- Given hidden content changed while disconnected, when catch-up sync runs, then hidden operations are not sent to the player stream.
- Given a mobile participant reconnects after sleep, when catch-up sync runs, then operations are delivered in dependency order and commands are revalidated against current grants before UI controls re-enable.

### COLLAB-003
**Statement:** Participants shall be able to share real-time or near-real-time session state for active scenes, combat, dice, timers, handouts, and visible map updates.
**Source:** Vision Collaboration; Architecture Contract 2 local-first/degraded sync.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a connected player has a projected combat Scene, when the DM advances initiative, then the player's visible combat widget updates near-real-time.
- Given network latency delays delivery, when updates are pending, then UI state indicates stale or reconnecting status.
- Given an accepted session operation is delivered out of order, when dependencies are missing, then the client defers applying it until dependencies arrive or reports stale state.
- Given the product latency budget is configured, when near-real-time session updates are measured, then p95 delivery and stale-state thresholds are reported against that budget.

### COLLAB-004
**Statement:** The system shall provide ephemeral presence for online status, cursors, selections, and device availability without requiring presence to persist or merge for offline correctness.
**Source:** Architecture Contract 1 `PresenceState`; Yjs awareness model.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given two participants are online, when one moves a visible cursor, then presence updates can appear to authorized viewers.
- Given all participants go offline and reconnect later, when session state restores, then durable state is intact but old presence is not replayed as authoritative history.

### COLLAB-005
**Statement:** The DM shall be able to control different Player View assignments for different players during the same session.
**Source:** Glossary "Player View"; Architecture Contract 4 Player View Rules.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given Player A and Player B are connected, when the DM projects different Scene subsets, then each player receives only their assigned subset.
- Given a player attempts to add a widget to their Player View without `co-editor`, when submitted, then the command is rejected.

### COLLAB-006
**Statement:** Participants shall be able to view shared combat state according to role and grants, including current turn, visible combatants, HP/status summaries, and permitted interaction controls.
**Source:** Vision Collaboration; Character capability sets.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player can see their character in combat, when combat state updates, then visible turn and status data refresh.
- Given a hidden enemy is in initiative, when a player views combat, then the hidden combatant is omitted or represented only by DM-approved placeholder.
- Given cached session combat is available offline, when remote delivery is unavailable, then the participant can view cached visible state marked stale and cannot submit commands requiring live authority.

### COLLAB-007
**Statement:** The DM shall be able to deliver handouts, images, notes, map fragments, ciphers, and rumors to selected players with delivery acknowledgement and revocation state.
**Source:** Vision Collaboration handout delivery; Glossary "Handout".
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player is online, when a handout is delivered, then the DM sees delivered/opened status when supported.
- Given the DM revokes a handout, when the player next syncs, then the handout widget is removed unless persistent access was explicitly granted.
- Given delivery and revocation operations are both queued while the player is offline, when the player reconnects, then replay order and final visibility determine whether the handout is delivered, removed, or retained by persistent grant.

### COLLAB-008
**Statement:** The system shall resolve authoritative session commands so valid DM commands supersede non-DM commands where session policy grants DM authority.
**Source:** Architecture Contract 2 session merge strategy; Architecture Contract 3 DM Authority.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player and DM concurrently adjust a shared session timer, when policy declares DM authority, then the valid DM command determines final state or creates an auditable conflict per policy.
- Given a player's command is outside grants, when replayed remotely, then it is rejected rather than conflicted.

### COLLAB-009
**Statement:** The system shall filter player and observer replication streams before data leaves the sync service or host device, so hidden content is not delivered and merely hidden in the UI.
**Source:** Architecture Contract 2 Sync Security; Defect player visibility leaks.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player stream is generated, when a DM-only note operation exists, then the operation is absent from that stream.
- Given a player gains visibility later, when catch-up sync runs, then only newly authorized content is delivered.

### COLLAB-010
**Statement:** The system shall purge or seal participant device caches when a player leaves a session unless the DM has granted persistent access to the cached content.
**Source:** Architecture Contract 2 Sync Security and Privacy.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player leaves a session, when their device receives the leave/revoke operation, then session-only cached content is removed or made unreadable.
- Given the DM granted persistent access to a handout, when the session ends, then that handout remains available according to the grant.
- Given a player is offline when removed, when cached session content has an expiry or sealed key policy, then it becomes unreadable according to local policy before or at next reconnect.
- Given cache purge fails on a participant device, when the DM inspects session privacy status, then the participant is marked as purge-unconfirmed without exposing device secrets.

### COLLAB-011
**Statement:** Observers shall be able to join shared sessions as read-only participants with access only to explicitly shared Scenes, maps, and placeholders, and no character data or write-capable controls.
**Source:** Vision Role Model; Architecture Contract 3 Base Roles.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given an observer joins a session, when join succeeds, then their visible scene list excludes character sheets, private player views, and DM-only content.
- Given an observer invokes any write-capable command, when the command is validated, then it is rejected before mutation.

### COLLAB-012
**Statement:** The DM shall be able to create Player Groups for projection and handout delivery targets, with group membership changes affecting delivery only and not granting visibility or write permissions by themselves.
**Source:** Glossary "Player Group"; Handout requirements.
**Priority:** Should-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a handout is delivered to a Player Group, when membership is evaluated, then only current group members receive the delivery operation.
- Given a player is added to a Player Group after a prior handout delivery, when no persistent access grant exists, then the prior handout is not automatically delivered.
- Given the DM edits Player Groups offline, when remote delivery resumes, then group membership changes are applied before later queued deliveries that depend on them.

### COLLAB-013
**Statement:** Mobile and reconnect catch-up shall preserve operation ordering, handout delivery/revocation semantics, cache invalidation, and stale-control disabling across sleep, backgrounding, and intermittent connectivity.
**Source:** Mobile reconnect audit; Sync operation dependency model; Handout requirements.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a mobile device wakes after missing Scene projection, handout delivery, grant revocation, and combat updates, when catch-up completes, then dependencies are applied in order and visible controls match current authority.
- Given a revoked handout remains in local cache during offline mode, when the device receives revocation or sealed-cache expiry applies, then the handout becomes unreadable before any stale UI can open it.
- Given catch-up fails mid-stream, when the participant UI renders, then it shows stale/reconnecting state and disables durable commands that require current grants.

### COLLAB-014
**Statement:** Participant cache sealing and revocation shall use an explicit session-cache policy covering TTL, key invalidation, persistent-grant exceptions, and offline revocation behavior.
**Source:** Architecture Contract 2 Sync Security and Privacy; Security key-custody requirements.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player leaves a session without persistent grants, when their session-only cache policy is evaluated, then cached session content is purged or made unreadable by sealed-key invalidation within the configured TTL.
- Given the player is offline when revoked, when local sealed-cache expiry is reached, then session-only content becomes unreadable before reconnect even if the revoke operation has not been delivered.
- Given persistent access exists for a handout or note, when session cache purge runs, then only the persistently granted content remains readable and all session-only content is removed or sealed.
- Given cache purge or key invalidation cannot be confirmed, when the DM opens privacy status, then the participant is marked purge-unconfirmed without exposing device secrets.
