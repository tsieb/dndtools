# v2 Architecture Contracts

This document defines the binding architecture contracts for DND Tools 0.2.0. Feature
requirements in `10-requirements.md` must be compatible with these contracts. When a v1 source
document conflicts with the v2 vision brief or `08-glossary.md`, the v2 document wins.

These contracts intentionally do not choose a final vendor, database, or CRDT library. They define
the boundaries and invariants that any implementation must satisfy.

---

## Source Basis and Research Notes

Internal source basis:

- `00-vision-brief.md`
- `08-glossary.md`
- `02-tech-stack.md`
- `03-architecture.md`
- `04-data-model.md`
- `05-feature-inventory.md`
- ADR-007, Cloud Backend Architecture
- ADR-010, Offline Sync Queue and Conflict Resolution

External research basis:

- Local-first architecture: https://martin.kleppmann.com/papers/local-first.pdf
- Automerge concepts and glossary: https://automerge.org/docs/reference/concepts/ and
  https://automerge.org/docs/reference/glossary/
- Yjs shared data and awareness model: https://docs.yjs.dev/ and
  https://docs.yjs.dev/api/about-awareness
- Electric Postgres Sync shape model: https://electric-sql.com/primitives/postgres-sync
- Obsidian properties and internal links: https://obsidian.md/help/properties and
  https://obsidian.md/help/links
- Google Drive changes and revisions: https://developers.google.com/workspace/drive/api/guides/manage-changes
  and https://developers.google.com/workspace/drive/api/guides/manage-revisions

Architectural conclusions from research:

- Local storage is the primary copy. Cloud services assist sync, backup, and collaboration; they
  do not become the source of truth for core use.
- Collaboration state must be divided into durable state and ephemeral presence. Presence can be
  network-only; campaign state cannot.
- Durable collaborative state should be represented as entity-scoped documents or operation logs
  with deterministic merge semantics. The implementation may use a CRDT library, but the product
  contract is source-agnostic.
- Source adapters must expose change cursors/revisions rather than one-off import snapshots.
  Google Drive and Obsidian both require incremental reconciliation against external state.
- The earlier "DM override value" interpretation is retired. The DM has administrative edit
  authority, but v2 does not define a separate field-value layer that supersedes player-authored
  character data.

---

## Contract 1: Processing / Display Decoupling

### Boundary Definition

The v2 application is split into three strict layers:

| Layer | Owns | Must not own |
| --- | --- | --- |
| Processing Core | Business rules, command validation, permission evaluation, visibility filtering, entity reducers, sync orchestration, graph indexing, search indexing, map model operations, dice/random algorithms, session state transitions, widget data bindings. | DOM, Svelte components, browser layout, Electron APIs, Capacitor APIs, filesystem APIs, platform chrome, touch/keyboard presentation decisions. |
| Platform Services | Filesystem, IndexedDB, cloud transport, auth token storage, OS dialogs, file watchers, native share/import, MCP sidecar lifecycle, update services. | Feature business rules, role decisions, visibility decisions, canvas layout semantics, widget-specific domain logic. |
| GUI Layer | Rendering state snapshots, collecting user input, choosing platform-specific layouts, dispatching commands, announcing status/accessibility feedback. | Direct mutation of persistent state, permission checks as a source of truth, visibility filtering as a source of truth, sync conflict resolution policy, graph/search algorithms. |

Binding rules:

1. All durable state mutations enter the Processing Core as commands.
2. The GUI Layer may read only query results, view models, and command metadata exposed by the
   Processing Core.
3. The GUI Layer may dispatch commands but may not directly write notes, objects, scenes,
   widgets, maps, permissions, grants, or session state.
4. Platform Services may provide storage and transport primitives only through typed interfaces.
   They may not interpret gameplay permissions or visibility policy.
5. Visibility and permission checks are performed before a query result or subscription update is
   exposed to a non-DM GUI.
6. Any feature that cannot run without a GUI is not part of the Processing Core.

### Processing Core Surface

The Processing Core exposes four public surfaces.

#### State Shape

The core state is partitioned into bounded state documents:

| State document | Contents |
| --- | --- |
| `VaultState` | Notes, note metadata, object-backed notes, object records, schemas, settings, sync-source registrations. |
| `SceneState` | Scene definitions, scene templates, widget instance layout, widget instance configuration, scene sharing targets. |
| `SessionState` | Idle/active state, active scene, player view assignments, combat state, dice history, timers, audio playback state, handout delivery log. |
| `MapState` | Map entities, layers, POIs, routes, fog operations, nested-map relationships, active viewport defaults. |
| `PermissionState` | Roles, authenticated participants, grant records, capability-set schema, visibility metadata. |
| `SyncState` | Local operation log, source cursors, pending outbound operations, inbound revisions, conflicts, last sync status. |
| `PresenceState` | Ephemeral user presence, cursor/selection hints, device availability, online/offline participant status. |

Only the first six are durable. `PresenceState` is ephemeral and must never be required for
offline correctness.

#### Event Types

The core emits typed events after command reduction:

| Event category | Examples | Durability |
| --- | --- | --- |
| `entity.changed` | note updated, character HP changed, map POI moved, widget config changed. | Durable |
| `scene.changed` | widget added, widget moved, player view assignment changed. | Durable |
| `session.changed` | session started, combat round advanced, handout delivered, audio state changed. | Durable |
| `permission.changed` | grant added, grant revoked, capability schema version changed, visibility changed. | Durable |
| `sync.changed` | source connected, operation queued, operation acknowledged, conflict created/resolved. | Durable metadata |
| `presence.changed` | participant online, cursor moved, selection changed. | Ephemeral |
| `diagnostic.raised` | validation failure, sync-source warning, degraded platform capability. | Durable only when explicitly persisted as a diagnostic record |

Events are notifications of accepted state changes. They are not an alternate mutation API.

#### Command API

Commands are the only mutation interface:

```ts
type CoreCommand = {
	id: string;
	type: string;
	actorId: string;
	actorRole: 'dm' | 'player' | 'observer';
	target: {
		entityType: string;
		entityId: string;
		path?: string;
	};
	payload: unknown;
	idempotencyKey?: string;
	expectedRevision?: string;
	issuedAt: string;
};
```

Binding rules:

1. Every command has a command schema, permission policy, validation function, deterministic
   reducer, and event mapping.
2. Commands that write state must be idempotent or carry an idempotency key.
3. Commands that write an existing entity must carry an expected revision or a mergeable operation
   base.
4. Commands fail closed when the actor lacks visibility or write permission.
5. Command handlers return structured results: `accepted`, `rejected`, `conflict`, or `deferred`.
6. GUI controls dispatch domain commands (`MoveWidget`, `RevealMapLayer`, `SetCharacterHp`), not
   storage commands (`SaveJson`, `WriteFile`).

### GUI Knowledge Limits

The GUI Layer is allowed to know:

- Renderable view-model shape.
- Available command descriptors for visible controls.
- Platform profile.
- Input modality.
- Local display preferences.
- Temporary UI state that does not affect authoritative application state.

The GUI Layer is not allowed to know:

- Raw vault filesystem paths unless the view is explicitly an admin/storage settings surface.
- Hidden fields or redacted content for players/observers.
- Permission implementation details beyond command availability and denial messages.
- Sync-source credentials.
- Internal reducer ordering or merge mechanics.

### Platform Profile Selection

Platform profiles are selected at runtime from a capability descriptor, not raw viewport checks in
feature components:

```ts
type PlatformProfile = {
	id: 'desktop' | 'tablet' | 'mobile' | 'web';
	input: Array<'keyboard' | 'mouse' | 'touch' | 'pen'>;
	storage: 'filesystem' | 'indexeddb' | 'cloud-cache' | 'capacitor-filesystem';
	canRunMcpSidecar: boolean;
	canUseNativeFilePicker: boolean;
	canUseMultiWindow: boolean;
	viewportClass: 'compact' | 'medium' | 'expanded';
};
```

Binding rules:

1. The shell owns profile detection and passes the selected profile to GUI packages.
2. Feature components may branch on profile capabilities, not on `window.innerWidth`.
3. The same command must produce the same core result on every profile.
4. Profile-specific differences are limited to layout, control density, input affordance, and
   supported platform services.
5. Desktop, tablet, mobile, and web profiles may have distinct GUI implementations for the same
   feature if they share the same commands and view models.

### Slimmer Device Definition

"Simplified for slimmer devices" means feature-equivalent but density-reduced, not functionally
forked.

Slim profiles must:

- Show one primary work surface at a time.
- Replace persistent side panels with sheets, drawers, tabs, or step flows.
- Keep scene/widget operations available through command menus or focused toolbars.
- Preserve all Must-have commands unless the requirement explicitly marks the feature
  desktop-only.
- Use coarse touch targets and avoid hover-only affordances.
- Defer nonessential previews, dense inspector panels, and multi-pane comparisons behind explicit
  expansion.

Slim profiles may not:

- Skip permission checks.
- Show hidden player content.
- Create alternate data models.
- Require network access for features that are local-first in desktop mode.

---

## Contract 2: Cloud Sync & Offline Model

### Local-First Invariant

DND Tools is local-first:

1. A user can open the app, read the local vault, search indexed local content, view maps, edit
   notes, edit objects, manage scenes, use widgets, roll dice, run combat, manage handouts, and
   continue an already-local session with zero network.
2. Local writes are accepted into the local durable store before any cloud acknowledgement.
3. Cloud sync, external sync sources, and collaboration enhance reach and sharing; they do not gate
   core vault ownership.
4. Network loss moves sync/collaboration into queued or degraded states. It does not block local
   command execution unless the command explicitly targets a remote-only source that has no local
   cached representation.
5. Every Must-have feature requirement must state its offline behavior.

Offline exceptions:

- First-time Google Docs authorization requires network.
- First-time cloud account login requires network.
- A device cannot access content that has never been synced or cached to that device.
- Ephemeral presence and live remote participant status are unavailable offline.

### Sync Unit

The smallest sync unit is a durable operation, not a full vault, route, screen, or UI action.

```ts
type SyncOperation = {
	id: string;
	vaultId: string;
	sourceId: string;
	actorId: string;
	entityType: string;
	entityId: string;
	opType: string;
	path?: string;
	value?: unknown;
	beforeRevision?: string;
	afterRevision?: string;
	dependencies: string[];
	issuedAt: string;
};
```

Binding rules:

1. Operations are entity-scoped and ordered by explicit dependencies, not wall-clock time alone.
2. Operations must be replayable and idempotent.
3. Operations carry enough information to validate permissions at replay time.
4. Operations are the unit queued while offline, sent to cloud sync, and received from remote
   collaborators.
5. Snapshots may be used for compaction, bootstrap, import/export, backup, and conflict UI, but
   snapshots are not the normal sync unit.
6. Large binary assets are synced by content-addressed asset records plus metadata operations, not
   by embedding binary payloads in the operation log.

Entity-level merge strategy:

| Entity/state type | Merge strategy |
| --- | --- |
| Scene layout and widget configuration | Operation-based merge with conflict detection for same widget instance and same layout field. |
| Session live state | Operation-based merge; DM commands supersede non-DM commands where policy defines authority. |
| Notes markdown body | Section/block-aware text merge when possible; otherwise three-way conflict using ancestor/local/remote snapshots. |
| Note/object frontmatter | Field-level merge for independent fields; conflict record for same scalar path. |
| Character data | Field-level operations; same-path concurrent edits use the normal entity conflict model. |
| Map layers, POIs, fog, routes | Operation-based merge by layer/POI/route/fog operation id. |
| Permission grants and visibility | Last accepted authoritative DM command by revision; non-DM writes rejected. |
| Settings | Field-level local preference merge where device-local; vault settings use normal entity operations. |
| Presence | Ephemeral broadcast, no durable merge. |

### Conflict Model

A conflict exists when two accepted operations or source revisions cannot be deterministically
merged without changing user intent.

Binding rules:

1. Independent operations on different entity paths merge automatically.
2. Concurrent edits to the same scalar path create a conflict unless that path has a declared merge
   function.
3. Concurrent text edits merge automatically only through a declared text/block merge strategy.
4. Permission and visibility conflicts resolve in favor of the latest valid DM-authored operation
   by entity revision. Invalid or unauthorized remote operations are rejected, not conflicted.
5. A conflict blocks publishing the conflicted entity revision to other viewers until resolved, but
   does not block unrelated entities.
6. Conflict records are durable, auditable, and visible to the DM.
7. Manual conflict resolution is itself a command that records selected source values and creates a
   new revision.

Conflict record structure:

```ts
type ConflictRecord = {
	id: string;
	vaultId: string;
	entityType: string;
	entityId: string;
	path?: string;
	reason:
		| 'same-scalar-path'
		| 'delete-vs-update'
		| 'schema-mismatch'
		| 'source-revision-diverged'
		| 'permission-policy-changed'
		| 'unsupported-external-change';
	ancestorRevision?: string;
	localRevision: string;
	remoteRevision: string;
	localValue: unknown;
	remoteValue: unknown;
	detectedAt: string;
	resolvedAt: string | null;
	resolutionOperationId: string | null;
};
```

### Sync Source Contract

Every sync source implements the same adapter contract:

```ts
interface SyncSourceAdapter {
	sourceId: string;
	kind: 'local-vault' | 'obsidian-vault' | 'google-docs' | string;
	capabilities(): SyncSourceCapabilities;
	connect(input: SyncSourceConnectionInput): Promise<SyncSourceConnection>;
	getCursor(vaultId: string): Promise<SyncCursor | null>;
	pullChanges(cursor: SyncCursor | null): AsyncIterable<ExternalChangeBatch>;
	pushOperations(operations: SyncOperation[]): Promise<PushResult>;
	readEntity(entityRef: EntityRef): Promise<SourceEntitySnapshot>;
	writeEntity(snapshot: SourceEntitySnapshot, expectedRevision?: string): Promise<WriteResult>;
	mapToCanonical(change: ExternalChange): Promise<CanonicalChange[]>;
	mapFromCanonical(operation: SyncOperation): Promise<ExternalMutation[]>;
	disconnect(): Promise<void>;
}
```

Capabilities:

```ts
type SyncSourceCapabilities = {
	canRead: boolean;
	canWrite: boolean;
	canWatchChanges: boolean;
	canPushOperations: boolean;
	canPreserveFrontmatter: boolean;
	canPreserveWikilinks: boolean;
	canExposeRevisionHistory: boolean;
	supportsBinaryAssets: boolean;
	offlineAvailability: 'full' | 'cached' | 'none';
	conflictGranularity: 'operation' | 'field' | 'document' | 'snapshot';
};
```

Source-specific binding rules:

| Source | Contract rules |
| --- | --- |
| Local vault | Must be fully offline-capable. Markdown files and object-backed notes remain human-readable. `.vault` metadata is rebuildable where possible. |
| Obsidian vault | Must preserve Obsidian YAML properties, `tags`, `aliases`, wikilinks, markdown links, headings, and user-authored frontmatter. DND Tools metadata must be namespaced under `dndtools` to avoid polluting common properties. |
| Google Docs | Must track Drive file ids, change cursors, export/import format, revision ids where available, and unsupported formatting loss. It must surface document-level conflicts when a Google Docs revision cannot map cleanly to canonical note operations. |
| Future source | Must implement the adapter without changing Processing Core command or reducer contracts. |

### Cloud Storage Model

Cloud storage contains:

- Vault identity and sync metadata.
- Durable operation log.
- Compacted entity snapshots.
- Scene definitions and widget configuration.
- Session state intended for collaboration.
- Permission grants, visibility metadata, capability-set schema versions.
- Asset blobs and content-addressed metadata when cloud sync is enabled.
- Conflict records and sync audit metadata.

Device-local only:

- Auth refresh tokens and platform keychain records.
- Unsynced local diagnostics bundle contents unless the user exports or submits them.
- Local cache indexes that can be rebuilt.
- Platform profile preferences that are explicitly device-specific.
- Presence state.
- Temporary UI state.
- Local MCP process state.
- Imported files before the user chooses to add them to the vault.

Cloud storage must not contain:

- Raw vault filesystem absolute paths.
- Unredacted local diagnostics unless explicitly exported by the user.
- MCP agent secrets.
- Hidden player content in a player-readable replication stream.

### Sync Security and Privacy Rules

1. Cloud sync is opt-in per vault.
2. Remote collaboration requires authenticated participants.
3. Player replication streams are filtered by visibility and grants before data leaves the sync
   service or host device.
4. Device-local caches must be purged when a player leaves a session unless the DM has granted
   persistent access.
5. Sync payloads are versioned. Unsupported future versions fail closed with an upgrade-required
   diagnostic rather than partial parsing.

---

## Contract 3: Role, Visibility & Permission Grant Model

The permission model has two independent axes: Visibility and Permission Grants.

Visibility answers: can this participant see this content at all?

Permission Grants answer: can this specific participant write to or interact with this visible
content?

Both axes are evaluated in the data/storage layer before any UI render. UI guards are useful for
ergonomics but are never authoritative.

### Base Roles

| Role | Base permission floor |
| --- | --- |
| DM | Full read/write access to the vault, all scenes, all content, all characters, all maps, all widgets, all permissions, all session state, and all player views. |
| Player | Read access to their own character and content made visible to them; write access only through ownership and explicit grants. |
| Observer | Read-only access to shared scenes and maps; no character data; no writes. |

Binding rules:

1. Every authenticated participant has exactly one base role in a session.
2. Base role is the floor. Grants may add permissions for Players, but cannot reduce DM authority.
3. Observers cannot receive write grants.
4. Anonymous access is not a role. If public viewing is ever added, it must be a separate
   architecture contract.

### Axis 1: Visibility

Visibility states:

| State | Meaning |
| --- | --- |
| `dm-only` | Visible only to the DM. Invisible to all players and observers regardless of write grants. |
| `player-visible` | Visible to all players in the session unless a narrower requirement explicitly scopes the surface. This is the v2 replacement for v1 `public`. |
| `shared` | Visible only to participants with an explicit viewer-capable grant or an explicit player-view assignment. |

Binding rules:

1. Visibility is evaluated before entity data is returned to a non-DM query, subscription, sync
   stream, MCP response, or widget binding.
2. Visibility applies to notes, objects, map layers, POIs, widgets, scenes, handouts, character
   fields, note sections, and structured object fields.
3. Visibility can be authored at three granularities:
   - Entity: default visibility for the whole note/object/map/scene/widget.
   - Section: visibility for a named markdown section or structured content section.
   - Field: visibility for a structured field such as `character.data.dmNotes`,
     `map.layers[*].annotations`, or `handout.cipher`.
4. More specific visibility overrides less specific visibility. Field beats section; section beats
   entity.
5. If no visibility metadata exists, the default is `dm-only`.
6. Visibility metadata is stored with the entity or with a namespaced sidecar metadata record that
   is applied before reads. It is not stored only in UI state.
7. Visibility changes are DM-only commands.

Visibility evaluation order:

1. Identify actor role and participant id.
2. Load entity visibility metadata.
3. Apply entity, section, and field visibility.
4. Apply player-view assignment for scene/widget delivery.
5. Redact or omit non-visible fields before returning data.
6. Emit an audit event for denied access attempts where the request crosses a trust boundary.

### Axis 2: Permission Grants

A Permission Grant assigns one named Capability Set to one player on one entity.

```ts
type PermissionGrant = {
	id: string;
	entityId: string;
	entityType: 'character' | 'note-section' | 'note' | 'widget' | 'scene' | 'timer-widget' | string;
	playerId: string;
	capabilitySet: string;
	createdBy: string;
	createdAt: string;
	expiresAt: string | null;
};
```

Binding rules:

1. Grants are additive over base role.
2. Grants are authored only by the DM.
3. Grants are evaluated at the data/storage layer before command execution.
4. A grant never bypasses visibility. A write grant on non-visible content is a consistency error
   that must be surfaced to the DM.
5. Capability sets are defined per entity type in the system schema, not freely authored per
   entity instance.
6. The DM grant UI presents named capability sets, not raw field checkboxes.
7. A player's total permission surface is computable as:
   `base_role_permissions ∪ all active grants for this player`.

### Minimum Capability Sets

#### Character

| Capability set | Allowed operations |
| --- | --- |
| `owner` | Read visible character data; write all player-authored character fields; manage level-up/advancement fields; update combat/resource fields; edit backstory/personality/history. |
| `combat-participant` | Write HP, temporary HP, conditions, death saves, spell slots, class resources, concentration, and session combat notes. |
| `backstory-editor` | Write backstory, personality, relationships, goals, bonds, flaws, history, and player notes. |
| `viewer` | Read visible character fields only. No writes. |

Inheritance:

- `owner` implies `combat-participant`, `backstory-editor`, and `viewer`.
- `combat-participant` implies `viewer`.
- `backstory-editor` implies `viewer`.

#### Note / Section

| Capability set | Allowed operations |
| --- | --- |
| `section-editor` | Edit an explicitly named section. |
| `contributor` | Append new content/comments without changing existing content. |
| `viewer` | Read visible note or section content. |

Inheritance:

- `section-editor` implies `contributor` and `viewer` for the same section.
- `contributor` implies `viewer`.

#### Widget

| Capability set | Allowed operations |
| --- | --- |
| `manager` | Configure widget, move/resize widget where scene grants allow it, bind/unbind data, interact with widget. |
| `operator` | Use widget runtime actions such as roll, start/stop, advance, mark complete, or adjust permitted values. Cannot configure or rebind. |
| `viewer` | See widget and its visible data. |

Inheritance:

- `manager` implies `operator` and `viewer`.
- `operator` implies `viewer`.

#### Scene

| Capability set | Allowed operations |
| --- | --- |
| `co-editor` | Add, move, resize, remove, and configure widgets on the granted scene, subject to widget/entity permissions. |
| `viewer` | View the scene and visible widgets. |

Inheritance:

- `co-editor` implies `viewer`.

#### Timer / Tool Widget

| Capability set | Allowed operations |
| --- | --- |
| `operator` | Start, pause, resume, reset, roll, draw, advance, or otherwise operate the tool's runtime action surface. |
| `viewer` | See the tool state. |

Inheritance:

- `operator` implies `viewer`.

### DM Authority

The DM bypasses capability-set restrictions for all entity types. This is not implemented as a
grant record; it is inherent to the DM base role.

Binding rules:

1. The DM can read, write, reveal, hide, grant, revoke, and resolve conflicts for all
   entities.
2. DM actions are still schema-validated and audited.
3. DM authority does not allow bypassing transport security, file containment, or runtime input
   validation.

### Session Join Model

```ts
type SessionJoinResult = {
	sessionId: string;
	participantId: string;
	role: 'dm' | 'player' | 'observer';
	playerId?: string;
	grants: PermissionGrant[];
	visibleSceneIds: string[];
	activePlayerViewId: string | null;
	capabilitySchemaVersion: string;
	syncCursor: string | null;
};
```

Binding rules:

1. The DM starts a session and creates or approves participant invitations.
2. Players and observers authenticate through a session invitation, account identity, or local
   pairing mechanism.
3. On join, the participant receives role, grant, visible-scene, and sync-cursor data filtered for
   that participant.
4. Grant changes during a session invalidate affected participant capability caches immediately.
5. A reconnecting participant must re-evaluate role, visibility, and grants before receiving
   catch-up operations.

### Consistency Requirements

The following states are invalid and must be reported:

- A player has a write grant on content that is `dm-only`.
- A grant references a capability set not defined for the entity type.
- A grant references a deleted or unavailable entity.
- A character has more than one `owner` grant.
- An observer has any write-capable grant.
- A player-view scene contains a widget whose bound entity is not visible to that player.

---

## Contract 4: Widget / Canvas Interface

Product-facing term: Scene.

Architectural descriptor: Canvas.

A Scene is the persisted spatial workspace. The Canvas is the rendering/layout surface used to
display a Scene.

### Widget Definition

A widget is a self-contained scene child that can render visuals, manage local interaction state,
run declared automation, bind to app data, and dispatch commands through the Processing Core.
Widgets are the scene composition primitive: maps, notes, images, text blocks, character sheets,
timers, dice tools, audio controls, layout helpers, handouts, and custom user tools are all widgets
in scene context.

Widget power is intentionally broad. A widget may be a simple rendered card, a complex interactive
tool, a visual canvas, a mini workflow, or a user-authored automation surface. The boundary is not
"widgets are passive views"; the boundary is "widgets do not own durable mutation semantics." A
widget can do anything the host exposes through data bindings, events, local state, and commands,
but durable application state changes still pass through Processing Core commands.

Every widget type must define:

```ts
type WidgetDefinition = {
	type: string;
	version: string;
	displayName: string;
	author: 'system' | 'user' | 'workspace' | string;
	supportedProfiles: PlatformProfile['id'][];
	defaultSize: { width: number; height: number };
	minSize: { width: number; height: number };
	resizePolicy: 'fixed' | 'axis-locked' | 'free';
	renderModule: WidgetRenderModuleRef;
	requiredBindings: WidgetBindingDefinition[];
	optionalBindings: WidgetBindingDefinition[];
	configurationSchema: unknown;
	runtimeStateSchema?: unknown;
	localStateSchema?: unknown;
	automationSchema?: unknown;
	capabilitySets: Array<'manager' | 'operator' | 'viewer' | string>;
	commands: WidgetCommandDescriptor[];
	events: WidgetEventDescriptor[];
	hostPermissions: WidgetHostPermission[];
};
```

Binding rules:

1. A widget may render data returned by declared bindings, data it derives locally from those
   bindings, and local/generated display state.
2. A widget may define arbitrary visuals within the widget host's rendering contract.
3. A widget may define local behavior, custom interaction flows, and automation logic.
4. A widget may mutate durable state only by dispatching declared commands.
5. A widget may persist only declared widget configuration, declared scene-local state, or
   declared session-local state. It must not hide authoritative entity state in private storage.
6. A widget definition is versioned. Breaking binding/config/state changes require migration
   logic.
7. A widget cannot read another widget's internal state directly. Cross-widget behavior goes
   through scene state, shared entity state, events, or commands.
8. A widget cannot make scene layout decisions except by emitting a requested command that the
   scene reducer accepts or rejects.
9. System widgets and user-authored widgets use the same host contract. System widgets may have
   privileged host permissions only when those permissions are declared and test-covered.

### Custom Widget Code and Automation

User-authored widgets are first-class. Users may write code to define widget visuals, behavior,
configuration, local state, and automation. The architecture must support powerful custom tools
without letting widget code become an unreviewed second application runtime.

Custom widget code is owned by the widget package. Durable application behavior is owned by the
Processing Core command system.

Binding rules:

1. Custom widget code runs in a constrained widget host, not in the unrestricted app shell.
2. Custom widget code receives a host API, not direct access to storage adapters, IPC, cloud
   clients, auth tokens, platform bridges, or raw vault files.
3. Custom widget code can subscribe to declared event streams exposed by the host.
4. Custom widget code can run automations that transform visible/bound data into command requests.
5. Automation output is a command request. The Processing Core validates actor, visibility,
   permission, schema, revision, and sync constraints before accepting it.
6. Custom widgets can compose existing commands to replicate most built-in scene tools, provided
   the actor has the required permissions and the command surface exposes the needed capability.
7. Custom widgets may keep local interaction state for rich UI behavior. Any state that must sync,
   survive across devices, or affect other participants must be declared as scene-local,
   session-local, or entity-owned state.
8. Custom widgets must declare host permissions such as network access, asset access, clipboard
   access, storage quota, or external-link launching. Undeclared permissions are unavailable.
9. Custom widget failures are isolated to the widget instance where possible and must not corrupt
   scene state, entity state, sync queues, or the command processor.
10. Custom widget packages are versioned and portable with the vault or scene template when the
    user chooses to include them.

Automation examples that must fit this contract:

- A morale tracker widget listens for combatant HP changes and requests a condition command when
  a threshold is crossed.
- A puzzle widget renders custom visuals, tracks local drag/drop interaction, and dispatches a
  handout reveal command when solved.
- A travel tool widget reads a map route binding, calculates travel time, and dispatches a session
  note append command.
- A custom character resource widget reads a character binding and dispatches resource-spend or
  rest-reset commands.

### Widget Host Responsibilities

The widget host is the runtime boundary between widget code and the application.

The host must provide:

- Render mounting and teardown.
- Actor-scoped data binding resolution.
- Command dispatch.
- Event subscription.
- Widget-local state storage.
- Declared scene/session state storage.
- Configuration validation.
- Error isolation.
- Capability and host-permission enforcement.
- Accessibility hooks for focus, labels, keyboard commands, and live announcements.

The host must not provide:

- Raw filesystem access.
- Raw IPC access.
- Raw cloud credentials.
- Unfiltered vault reads.
- Direct mutation APIs for notes, objects, scenes, maps, permissions, or session state.
- Hidden player data in player contexts.

### Widget Data Contract

Widgets bind to app data through selectors and event subscriptions. Bindings can target entities,
scene state, session state, map state, search/query results, command availability, or other
host-exposed read models.

```ts
type WidgetBinding = {
	id: string;
	widgetInstanceId: string;
	source: {
		entityType: string;
		entityId: string;
		selector: string;
	};
	mode: 'read' | 'operate' | 'manage' | 'observe';
	requiredCapability: string;
};
```

Binding rules:

1. The Processing Core resolves bindings per actor and returns redacted view data.
2. Binding resolution checks visibility first, then permission.
3. Widgets receive actor-scoped effective values after visibility and permission filtering.
4. Widget commands identify the binding or declared target they operate on; they do not smuggle raw
   entity paths from custom code.
5. Missing, hidden, deleted, or conflicted bindings produce explicit widget states:
   `unbound`, `hidden`, `missing`, `conflicted`, or `degraded`.
6. Widgets must render a non-leaking placeholder for hidden data rather than failing open.
7. Query-style bindings must declare result limits, sort order, and refresh triggers.
8. Event subscriptions must declare event categories and debounce/backpressure policy where
   high-frequency events are possible.

### Widget Lifecycle

Widget lifecycle:

1. `create`: a widget instance is added to a scene with type, initial layout, and initial
   configuration.
2. `bind`: required bindings are selected or inferred.
3. `configure`: widget-specific settings are validated and saved.
4. `display`: widget renders from resolved view data.
5. `operate`: actor dispatches runtime commands allowed by role/grants.
6. `automate`: widget-local automation reacts to events or user actions by requesting commands.
7. `rebind`: actor with `manager` rights changes data source.
8. `upgrade`: widget definition version changes and migration logic updates configuration/state.
9. `destroy`: widget instance is removed from the scene; bound entities are not deleted.

Binding rules:

1. Destroying a widget removes the widget instance and widget-local configuration only.
2. Destroying a widget never deletes the bound note, character, map, handout, timer history, or
   object unless a separate explicit entity-delete command is issued.
3. Widgets with runtime state must declare whether that state is scene-local, session-local, or
   entity-owned.
4. Widget lifecycle commands are sync operations.
5. Widget package install, upgrade, and removal are explicit administrative actions.
6. A failed widget upgrade must leave the previous widget definition or a recoverable disabled
   widget instance in place.

### Canvas / Scene State

A Scene persists:

- Scene id, name, description, tags, ownership metadata.
- Scene template metadata when applicable.
- Widget instance list.
- Widget layout: position, size, z-order, grouping, dock/pin state.
- Widget configuration.
- Widget bindings.
- Declared widget-local state that is intentionally persisted with the scene.
- Scene background/visual settings.
- Player-view assignments and sharing metadata.
- Scene-level visibility metadata.

A Scene does not persist:

- Canonical note/object/character/map data owned by entities.
- Canonical timer/combat/audio/session state unless the specific state is declared scene-local.
- Undeclared custom widget state.
- Platform-specific panel open/closed state unless explicitly saved as a user preference.
- Presence/cursor state.
- Hidden content copies in player-specific scene snapshots.

The canvas owns layout. Widgets own presentation, local behavior, local automation definitions, and
command affordances. The Processing Core owns durable mutation semantics. Entities and session
documents own canonical data.

### Widget State Ownership

| State example | Owner |
| --- | --- |
| Widget x/y/w/h/z | Scene |
| Widget collapsed/pinned state shared by all viewers | Scene |
| Widget source code/package | Widget package registry or vault-bundled widget package |
| Widget configuration | Scene widget instance |
| Widget local transient interaction state | Widget instance in GUI memory |
| Widget persisted local state | Scene, only if declared in widget schema |
| Widget automation definition | Widget package plus scene widget configuration |
| Widget automation execution result | Command result owned by the Processing Core |
| Local inspector tab currently open | GUI local state |
| Character HP | Character entity or session overlay, according to character model |
| Combat initiative order | Session state |
| Timer running/paused/current time | Session state for session timers; entity state for reusable timers |
| Audio track currently playing | Session state |
| Map layer opacity/visibility | Map entity |
| Map viewport default | Map entity or widget configuration, depending on whether it is canonical or presentation-specific |
| Fog reveal operations | Map entity |

### Embed, Link, and Project Rules

| Relationship | Meaning | State ownership |
| --- | --- | --- |
| Link | Navigable reference to an entity. It does not render entity content inline. | Source content owns the reference only. |
| Embed | Inline rendering of entity data at a note call site or as a scene widget. | Source content/scene owns placement; target entity owns data. |
| Project | DM pushes a scene, widget, handout, map region, or display state to one or more player views during a session. | Session/player-view assignment owns delivery; target entity owns data. |

Binding rules:

1. Use a link when the user should navigate to the entity.
2. Use an embed when the user should see entity data inline in the current note or scene.
3. Use projection when the DM controls what appears on player devices.
4. Embedding does not clone target data.
5. Projection does not grant write permission unless a Permission Grant also exists.
6. Projected content still obeys visibility filtering.
7. A scene widget is an embed in scene context.
8. A note object card is an embed in note-body context.

### Player View Rules

1. Player View is a participant-filtered scene configuration controlled by the DM.
2. A player cannot add, remove, or rearrange widgets on their Player View unless the DM grants a
   scene `co-editor` capability.
3. Player View data is generated from the same Scene and Widget contracts as DM scenes, with
   actor-specific redaction.
4. The DM may project different scenes or widget subsets to different players.
5. The player device must never receive hidden widget-bound entity fields merely because a widget
   exists on a scene.

### Widget / Canvas Accessibility and Platform Rules

1. Every widget command must have a keyboard-accessible and touch-accessible path on supported
   profiles.
2. Canvas layout must support keyboard movement/resizing alternatives for any pointer operation.
3. Widget focus order follows scene z-order and explicit grouping metadata, not DOM accident.
4. Slim profiles may render widgets as stacked panels or focused full-screen views, but the widget
   instance identity and command contract remain the same.
5. Widgets must expose accessible names derived from widget type and bound entity name.

---

## Cross-Contract Non-Negotiables

1. The Processing Core is the only owner of durable mutation semantics.
2. The data/storage layer enforces visibility and permissions before UI render and before sync
   replication to non-DM actors.
3. Local-first behavior is a product invariant, not a platform option.
4. Sync is operation-based with snapshots used for bootstrap, compaction, backup, and conflict UI.
5. The canvas owns layout; widgets own rendering, local behavior, automation definitions, and
   command affordances; entities and session documents own canonical data.
6. MCP is optional. Disabling MCP cannot disable core app behavior.
7. AI is supplementary. Algorithmic graph/search/suggestion systems remain deterministic core
   features.
8. Platform-specific GUIs may differ, but commands and core results must remain identical.
9. Capability sets are schema-defined named options, not per-instance raw field lists.
10. Visibility and permission are independent axes; conflicts between them are consistency errors
    to surface, not silent behavior to tolerate.
