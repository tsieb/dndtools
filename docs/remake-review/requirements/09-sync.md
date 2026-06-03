## SYNC - Cloud Sync, Source Adapters, and Offline Model

Capability tree:

- Local-first operation model: `SYNC-001`, `SYNC-002`, `SYNC-011`
- Source adapters: `SYNC-003`, `SYNC-004`, `SYNC-005`, `SYNC-012`, `SYNC-015`, `SYNC-016`
- Conflict lifecycle: `SYNC-006`, `SYNC-013`
- Cloud/device-local storage: `SYNC-007`, `SYNC-008`, `SYNC-017`
- Asset sync and status: `SYNC-009`, `SYNC-010`, `SYNC-014`

### SYNC-001
**Statement:** A user shall be able to open, read, search, edit, and run core vault/session workflows with zero network for any content already present on the device.
**Source:** Architecture Contract 2 Local-First Invariant; Local-first research.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given the device has a cached vault and no network, when the user opens the app, then local notes, maps, scenes, characters, dice, and combat remain usable.
- Given content has never synced to the device, when offline, then the app reports unavailable content rather than blocking the whole vault.
- Given remote collaborators are unreachable, when local work continues, then collaboration status is marked unavailable and queued operations remain local until sync resumes.

### SYNC-002
**Statement:** The system shall record every durable mutation as an entity-scoped, idempotent sync operation with actor, target, path, dependencies, revisions, and issue time.
**Source:** Architecture Contract 2 Sync Unit.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a character HP change is accepted, when the operation log is inspected, then it includes actor id, entity id, path, before/after revisions, and idempotency data.
- Given the same operation is replayed, when idempotency is checked, then no duplicate mutation is applied.
- Given an operation depends on an earlier operation, when replay order is computed, then dependencies are applied before dependent operations or the dependent operation is deferred.
- Given a remote operation no longer passes replay-time visibility or permission checks, when replay is attempted, then it is rejected rather than conflicted.

### SYNC-003
**Statement:** The system shall support sync source adapters for local vault, Obsidian vault, Google Docs, and future sources without changing Processing Core command or reducer contracts.
**Source:** Architecture Contract 2 Sync Source Contract.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a new source adapter implements the required interface, when registered, then the Processing Core can pull and push canonical operations through it.
- Given an adapter lacks write capability, when a write is attempted, then the command returns unsupported/degraded status without changing the core contract.
- Given a remote source requires first-time authorization, when the app is offline and no token exists, then the source reports auth-unavailable while local cached vault workflows continue.

### SYNC-004
**Statement:** The Obsidian sync adapter shall preserve YAML properties, tags, aliases, internal links, markdown links, headings, and user-authored frontmatter while namespacing DND Tools metadata.
**Source:** Architecture Contract 2 Obsidian rules; Obsidian properties/internal links.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given an Obsidian note with aliases and tags, when imported and exported, then those properties remain intact.
- Given DND Tools adds metadata, when written, then metadata is under the configured `dndtools` namespace and does not overwrite common properties.
- Given an Obsidian local directory is not accessible on the current mobile profile, when sync status opens, then the source reports unavailable capability while cached content remains readable.

### SYNC-005
**Statement:** The Google Docs sync adapter shall track Drive file ids, change page tokens, revision metadata where available, export/import transforms, and unsupported formatting loss.
**Source:** Architecture Contract 2 Google Docs rules; Google Drive changes/revisions APIs.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given Google Drive returns a new change page token, when changes are pulled, then the adapter stores the new cursor for future incremental sync.
- Given a Docs revision cannot map cleanly to markdown, when pulled, then a document-level conflict or formatting-loss diagnostic is recorded.
- Given a local note edit maps to Google Docs, when push succeeds, then the Drive file id, revision metadata, and sync cursor are updated without losing unsupported-format diagnostics.
- Given Google Docs has not been authorized on this device, when offline, then cached Docs content remains readable but first-time auth and push are reported unavailable.

### SYNC-006
**Statement:** The system shall detect, persist, display, and resolve conflicts as durable records without blocking unrelated entities.
**Source:** Architecture Contract 2 Conflict Model; Automerge conflict concepts.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given two users edit the same scalar field concurrently, when sync reconciles, then a conflict record captures ancestor, local, remote, reason, and revisions.
- Given an unrelated note has no conflict, when another entity is conflicted, then the unrelated note can still sync and render.
- Given an entity has an unresolved conflict, when publishing to non-DM viewers would expose an ambiguous revision, then that conflicted revision is blocked or represented as `conflicted` until resolved.
- Given the DM resolves a conflict, when the resolution command is accepted, then a new revision records selected values, resolver, source revisions, and audit history.

### SYNC-007
**Statement:** The system shall store cloud-enabled vault identity, durable operation logs, compacted snapshots, collaboration session state, permission metadata, assets, and conflict records in cloud storage only when cloud sync is enabled for the vault.
**Source:** Architecture Contract 2 Cloud Storage Model.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given cloud sync is disabled, when local writes occur, then no cloud storage writes are attempted.
- Given cloud sync is enabled, when operations are compacted, then snapshots and operation history retain enough data for sync and recovery.

### SYNC-008
**Statement:** The system shall keep auth refresh tokens, OS credential records, raw absolute paths, rebuildable indexes, presence, local diagnostics, and temporary UI state device-local unless explicitly exported by the user.
**Source:** Architecture Contract 2 Device-local only; Security cloud threat profile.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a cloud sync payload is generated, when inspected, then it contains no raw absolute filesystem paths or auth refresh tokens.
- Given a user exports diagnostics, when export is requested, then the user receives an explicit action and generated bundle rather than automatic cloud upload.

### SYNC-009
**Statement:** The system shall sync large binary assets using content-addressed asset records plus metadata operations rather than embedding binary payloads in the operation log.
**Source:** Architecture Contract 2 Sync Unit binary asset rule.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a large map image is added, when sync operations are generated, then the operation references asset metadata and content hash rather than embedding the image bytes.
- Given the asset blob is unavailable on a device, when the map opens, then the UI shows an asset-missing/degraded state.

### SYNC-010
**Statement:** The user shall be able to inspect sync status, pending outbound operations, inbound revisions, conflicts, source health, and retry actions without needing raw storage knowledge.
**Source:** Feature Inventory I6 sync status; UX Reliability.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given operations are queued offline, when sync status opens, then pending operations and affected sources are visible.
- Given a source auth failure occurs, when status is displayed, then the user sees reauthorization guidance and local work remains available.

### SYNC-011
**Statement:** Sync replay shall validate operation dependencies, schema version, actor authority, visibility, permission, and target existence before applying remote or queued local operations.
**Source:** Architecture Contract 2 Sync Unit; Architecture Contract 3 Permission Grants.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a delete operation arrives before a dependent update, when replay validates dependencies, then the dependent update is rejected or deferred with a structured reason.
- Given an operation targets a renamed or deleted entity, when replay runs, then it resolves through recorded identity metadata or creates a durable conflict/diagnostic rather than writing to the wrong entity.

### SYNC-012
**Statement:** Obsidian and Google Docs adapters shall prove both pull and push behavior for representative notes, properties, links, headings, revisions, and unsupported formatting.
**Source:** Vision Primary Content Sources; Architecture Contract 2 Sync Source Contract.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given an Obsidian-backed note is edited in DND Tools, when the adapter pushes changes, then Obsidian frontmatter, aliases, tags, headings, and wikilinks remain valid.
- Given a Google Docs-backed note is edited in DND Tools, when push/pull round-trip completes, then supported content is preserved and unsupported formatting loss is reported.
- Given a Google Docs-backed note is edited while offline, when network and auth return, then the queued edit is pushed idempotently or a conflict record is created with formatting-loss details.

### SYNC-013
**Statement:** Conflict resolution shall be a DM-authorized administrative command with explicit selected values, source revisions, optional notes, audit history, and a resulting non-conflicted revision.
**Source:** Architecture Contract 2 Conflict Model.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a conflict exists on a character field, when a non-DM attempts to resolve it, then the resolution command is rejected and the conflict remains available for DM resolution.
- Given the DM resolves a conflict while offline, when sync resumes, then the resolution operation is replayed idempotently and the conflict record is marked resolved.
- Given a character owner has a conflict on a player-authored field, when they view the character, then the conflicted field is represented as conflicted and any proposed value change is recorded as a normal edit rather than a conflict-resolution command.

### SYNC-014
**Statement:** Sync status shall expose source version history, compacted snapshot lineage, and recovery checkpoints needed to diagnose lost updates without exposing hidden content to unauthorized actors.
**Source:** Google Drive revisions; Architecture Contract 2 Cloud Storage Model.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given an entity has compacted operation history, when diagnostics open, then snapshot lineage and retained operation range are visible to an authorized DM.
- Given a player opens sync status, when hidden source revisions exist, then the player sees only non-leaking freshness or unavailable status.

### SYNC-015
**Statement:** Every source adapter shall declare Source Adapter Capability metadata and fail closed for unsupported schema versions, source versions, auth modes, entity types, or lossy transforms.
**Source:** Glossary "Source Adapter Capability"; Architecture Contract 2 Sync Source Contract; Security fail-closed parsing.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given an adapter registers, when inspected, then it declares readable/writable domains, schema version range, auth requirements, rename/delete support, offline queue behavior, formatting fidelity, and platform profile support.
- Given a source payload uses an unsupported schema or source version, when parsed, then the adapter rejects it with an upgrade-required diagnostic before mutation.
- Given an adapter cannot preserve a structure, when push is requested, then the write is blocked or staged with explicit lossy-transform approval.

### SYNC-016
**Statement:** The Google Docs adapter shall handle authorization, rename, deletion, offline queued edits, unsupported formatting, and conflict cases as explicit sync states.
**Source:** Google Drive changes/revisions APIs; Architecture Contract 2 Google Docs rules; audit remediation.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given Google auth expires, when sync runs, then local work remains available and the source reports reauthorization-required without dropping queued operations.
- Given a Google Docs document is renamed or deleted remotely, when changes are pulled, then the local entity records rename/delete intent or a conflict according to adapter policy.
- Given a local offline edit conflicts with a remote formatting change, when sync resumes, then the conflict record includes local markdown, remote revision metadata, unsupported-format diagnostics, and safe resolution actions.
- Given a delete operation and queued edit race, when replay orders operations, then the adapter either applies dependencies deterministically or records a durable conflict without resurrecting deleted content silently.

### SYNC-017
**Statement:** Cloud sync payloads and stored cloud artifacts shall follow the release-approved encryption, key custody, rotation, and recovery model for the vault before cloud sync can be enabled.
**Source:** Vision Cloud Sync; Architecture Contract 2 Cloud Storage Model; Security requirements.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given cloud sync is enabled for a vault, when sync payloads are generated, then encryption at rest, encryption in transit, key owner, and recovery mode match the approved cloud security decision record.
- Given a participant or device key is revoked, when future sync payloads are generated, then the revoked key can no longer decrypt newly authorized cloud artifacts.
- Given key recovery is unavailable or intentionally unsupported, when a user attempts recovery, then the app reports the approved recovery limitation without weakening encryption or exposing other vaults.
