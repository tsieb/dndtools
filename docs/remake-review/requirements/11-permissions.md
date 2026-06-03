## PERM - Role, Visibility, and Permission Grants

Capability tree:

- Base roles and observer limits: `PERM-001`, `PERM-011`
- Visibility: `PERM-002`, `PERM-003`, `PERM-012`
- Grants and capability sets: `PERM-004`, `PERM-005`, `PERM-006`, `PERM-008`, `PERM-013`
- Consistency, cache invalidation, and audit: `PERM-007`, `PERM-009`, `PERM-010`, `PERM-014`

### PERM-001
**Statement:** The system shall assign every authenticated session participant exactly one base role of DM, Player, or Observer and compute their base permission floor from that role.
**Source:** Architecture Contract 3 Base Roles.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a participant joins a session, when join succeeds, then the participant has exactly one base role.
- Given an unauthenticated participant requests session data, when evaluated, then no anonymous role is inferred and access is denied.

### PERM-002
**Statement:** The DM shall be able to set content visibility to `dm-only`, `player-visible`, or `shared`, with `shared` meaning delivery only through Player View assignment, handout delivery, or viewer-capable grant, and with visibility evaluated before any non-DM query, subscription, sync stream, MCP response, or widget binding.
**Source:** Architecture Contract 3 Visibility.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a note is `dm-only`, when a player query requests it by id, then the data layer returns no content.
- Given a widget binding targets `shared` content without a viewer-capable grant or assignment, when resolved, then the binding returns hidden/unavailable state.
- Given content is `player-visible`, when any authenticated player queries it, then it is visible unless a more specific section, field, role, or revocation rule narrows access.
- Given content is `shared` with Player A through a handout delivery, when Player B queries it without a separate assignment or grant, then Player B receives hidden/unavailable state.

### PERM-003
**Statement:** The DM shall be able to author visibility at entity, section, and field granularity, with more specific metadata overriding less specific metadata.
**Source:** Architecture Contract 3 Visibility authoring.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given an entity is `player-visible` and one field is `dm-only`, when a player reads it, then the entity is visible but the field is omitted.
- Given section and field metadata conflict, when evaluated, then field visibility takes precedence.

### PERM-004
**Statement:** The DM shall be able to grant one named capability set to one player on one entity through a grant record containing entity id, entity type, player id, capability set, author, timestamps, and optional expiry.
**Source:** Architecture Contract 3 PermissionGrant.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given the DM grants `section-editor` on a note section, when the player edits that section, then the command is accepted.
- Given the grant expires, when the player attempts another edit, then the command is rejected.
- Given the DM revokes the grant, when the player submits a cached edit command, then the command is rejected and the player's capability cache is invalidated.

### PERM-005
**Statement:** Capability sets shall be defined per entity type in the system schema, not freely authored per entity instance or configured as raw field lists.
**Source:** Vision Permission Grants; Architecture Contract 3 Sustainability constraints.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given the DM opens grant UI for a character, when assigning permissions, then named sets such as `owner`, `combat-participant`, `backstory-editor`, and `viewer` are shown.
- Given a custom raw field checklist grant is submitted, when validated, then the command is rejected.

### PERM-006
**Statement:** The system shall apply capability-set inheritance rules when computing a player's effective permission surface.
**Source:** Architecture Contract 3 Minimum Capability Sets.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player has `owner` on a character, when effective permissions are computed, then `combat-participant`, `backstory-editor`, and `viewer` permissions are included.
- Given a player has `viewer` only, when they attempt a write, then no inherited write permissions are present.

### PERM-007
**Statement:** The system shall surface consistency errors for invalid permission states, including write grants on non-visible content, unknown capability sets, deleted entities, multiple character owners, observer write grants, and hidden widget bindings in player views.
**Source:** Architecture Contract 3 Consistency Requirements.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a player has a write grant on a `dm-only` note, when consistency checks run, then the DM sees an error.
- Given a player-view Scene contains a widget bound to hidden data, when validated, then the invalid player-view assignment is reported.

### PERM-008
**Statement:** The DM's grant UI shall present named capability sets with explanations and effective permission preview, not raw field checkboxes or hidden policy details.
**Source:** Vision "Why capability sets"; Architecture Contract 3 sustainability constraints.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given the DM selects `combat-participant`, when preview opens, then writable combat fields and excluded non-combat fields are summarized.
- Given a capability set is unavailable for an entity type, when granting, then it is not offered.

### PERM-009
**Statement:** The system shall invalidate affected participant capability caches immediately when grants, visibility, roles, ownership, or capability schema versions change.
**Source:** Architecture Contract 3 Session Join Model.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a DM revokes a player's widget operator grant, when the revocation is accepted, then the player's next command using that grant is rejected.
- Given the player is offline during revocation, when reconnecting, then role and grants are re-evaluated before catch-up operations are delivered.

### PERM-010
**Statement:** The system shall audit denied access attempts that cross a trust boundary without exposing hidden content in the denial message.
**Source:** Architecture Contract 3 Visibility evaluation order; Security model.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player requests a hidden note by id, when denied, then an audit event records actor, target reference, and reason category.
- Given the denial is displayed to the player, when shown, then it does not reveal the hidden note title or content unless already visible.

### PERM-011
**Statement:** Observer permission computation shall always produce a read-only surface with no character data and no write-capable grants, even if stale or invalid grant records exist.
**Source:** Vision Role Model; Architecture Contract 3 Base Roles.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given an observer has a stale write-capable grant record, when effective permissions are computed, then the write grant is ignored and a consistency error is surfaced to the DM.
- Given an observer requests character data by id, when the query resolves, then no character fields are returned.

### PERM-012
**Statement:** The DM shall be able to revoke or change visibility at entity, section, and field granularity, with affected subscriptions, sync streams, cached data, and widget bindings invalidated according to policy.
**Source:** Architecture Contract 3 Visibility; Sync Security and Privacy Rules.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a note section changes from `player-visible` to `dm-only`, when a player next queries or syncs, then the section is absent and affected cached bindings are invalidated.
- Given a visibility revocation occurs while a player is offline, when reconnecting, then visibility is re-evaluated before catch-up operations are delivered.

### PERM-013
**Statement:** The DM shall be able to transfer character ownership and other singular capability assignments through explicit transfer commands that revoke the previous singular grant atomically.
**Source:** Vision Ownership; Architecture Contract 3 Consistency Requirements.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given Character A is owned by Player A, when the DM transfers ownership to Player B, then Player A's `owner` grant is revoked and Player B's `owner` grant is created in one accepted command.
- Given the transfer would leave two owners, when validation runs, then the command is rejected.

### PERM-014
**Statement:** Permission, visibility, and role audits shall produce actionable DM diagnostics without exposing hidden entity titles, field values, or player-only shared content to unauthorized actors.
**Source:** Architecture Contract 3 Consistency Requirements; Security requirements.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given consistency checks find a write grant on hidden content, when the DM opens diagnostics, then the affected entity reference, grant, and remediation action are visible to the DM.
- Given the same diagnostic is visible to a player through command denial, when displayed, then it contains only a generic unavailable or unauthorized reason.
