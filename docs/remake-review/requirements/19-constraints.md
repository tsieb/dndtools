## CON - Hard Constraints

Capability tree:

- Security and source-of-truth constraints: `CON-001`, `CON-002`, `CON-005`
- Scope constraints: `CON-003`, `CON-006`
- Permission sustainability constraints: `CON-004`

### CON-001
**Statement:** The system must never rely on GUI hiding as the authoritative enforcement mechanism for visibility, permissions, sync filtering, or security decisions.
**Source:** Architecture Cross-Contract; Defects `CODEX-PR5-DM-NOTES-LEAK`, `CODEX-PR17-POI-VISIBILITY-LEAK`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player query is made for hidden data, when data leaves the storage/query layer, then hidden data is already absent.
- Given a UI component accidentally renders every field it receives, when player data is supplied, then no DM-only field is present to leak.

### CON-002
**Statement:** The system must never make MCP, AI, cloud sync, or network access required for core local vault ownership, editing, search, maps, characters, Scenes, dice, combat, or session continuity.
**Source:** Vision Architecture Priorities; Architecture Contract 2 Local-First Invariant.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given all network and MCP integrations are disabled, when the user opens a cached vault, then core local workflows remain usable.
- Given AI services fail, when deterministic features run, then they continue without AI.
- Given multi-user delivery is unavailable, when a local vault workflow runs, then the local source of truth remains usable and remote delivery is reported as unavailable rather than required.

### CON-003
**Statement:** The system must never introduce community marketplace, public campaign directory, plugin ecosystem, third-party compendium integration, i18n, or public wiki features into the v2 core requirements without an explicit scope revision.
**Source:** Vision Explicitly Out of Scope; Defect `AUDIT-21.4-EXTENSIBILITY`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: not applicable | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a proposed requirement adds marketplace or public directory behavior, when scope review runs, then it is rejected or moved to future scope.
- Given extension seams are implemented, when reviewed, then they support internal system/user widgets only and do not imply public plugin APIs.
- Given a user-authored widget package is created, when reviewed against scope, then it remains vault-local or workspace-local and does not imply a public marketplace, SDK compatibility guarantee, or third-party distribution channel.

### CON-004
**Statement:** The system must never allow per-instance raw field-list grants to replace schema-defined capability sets for player permissions.
**Source:** Vision Capability Sets; Architecture Contract 3 Sustainability constraints.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a grant command contains a raw field list, when validated, then it is rejected.
- Given the DM needs a new permission grouping, when supported, then it is added as a named schema-defined capability set for that entity type.

### CON-005
**Statement:** The system must never treat cloud storage, external sources, generated snapshots, player-device caches, or widget-local state as the sole source of truth for core vault content.
**Source:** Architecture Contract 2 Cloud Storage Model; Architecture Contract 4 Widget State Ownership.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given cloud storage is unavailable, when local authoritative content exists, then the vault remains usable and can queue operations.
- Given a widget persists local state, when inspected, then canonical entity data still resides in the owning entity/session/map state document.

### CON-006
**Statement:** The system must never add a new top-level platform, source, AI provider, public extension surface, or cloud backend assumption without an explicit architecture-contract and requirements revision.
**Source:** REVIEW-PLAN conflict handling; Architecture Cross-Contract.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: not applicable | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a proposal introduces a new cloud backend or AI provider assumption, when scope review runs, then the proposal is blocked until contracts and requirements are updated.
- Given a proposal expands user-authored widgets into a public plugin ecosystem, when reviewed, then it is rejected or moved to future scope through explicit revision.
