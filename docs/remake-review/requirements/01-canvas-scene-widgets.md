## CANVAS - Scene Management and Widget System

Capability tree:

- Scene state: `CANVAS-001`, `CANVAS-003`, `CANVAS-004`, `CANVAS-013`, `CANVAS-018`
- Widget lifecycle: `CANVAS-002`, `CANVAS-008`, `CANVAS-010`, `CANVAS-011`, `CANVAS-014`, `CANVAS-017`
- Player view and projection: `CANVAS-005`, `CANVAS-006`, `CANVAS-007`, `CANVAS-015`
- Widget data safety: `CANVAS-009`, `CANVAS-010`
- Layout accessibility: `CANVAS-012`, `CANVAS-016`

### CANVAS-001
**Statement:** The DM shall be able to create a named Scene containing zero or more widgets from any supported platform profile, with the Scene persisted as a durable `SceneState` document.
**Source:** Vision "The Canvas"; Glossary "Scene"; Architecture Contract 4.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a local vault with no network, when the DM creates a Scene with a name, description, tags, background setting, ownership metadata, scene-level visibility, and player-view metadata, then the complete Scene state is saved locally and appears in Scene selection after restart.
- Given an authenticated player session, when a DM-only Scene is created, then the player receives no Scene data until the DM explicitly projects or shares it.
- Given scene metadata is missing required schema fields, when the create command is submitted, then no partial `SceneState` document is committed.

### CANVAS-002
**Statement:** The DM shall be able to add a widget to a Scene by selecting a widget type and initial placement, with widget creation accepted only through a Processing Core command.
**Source:** Architecture Contract 1 Command API; Architecture Contract 4 Widget Lifecycle.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given an editable Scene, when the DM adds a map widget, then `SceneState` records a widget instance, layout, configuration, and binding placeholder.
- Given a custom widget attempts to write its own widget instance directly to storage, when the write bypasses the command API, then the operation is rejected.

### CANVAS-003
**Statement:** The DM shall be able to move, resize, layer, group, dock, and pin widgets on a Scene, with layout stored on the Scene and not on the bound entity.
**Source:** Architecture Contract 4 "Canvas / Scene State"; Defects `CODEX-PR10-BOARD-REORDER-PAN`, `AUDIT-21.6-OVERSIZED-FILES`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a character widget bound to a character entity, when the DM resizes the widget, then only the Scene widget layout changes and the character entity revision is unchanged.
- Given two users edit different widget positions on the same Scene, when sync reconciles the operations, then both independent layout changes are preserved or a field-specific conflict is recorded.
- Given a grouped widget set is moved, when the command is accepted, then the group transform, individual widget positions, z-order, and focus traversal metadata remain consistent.
- Given a slim profile opens the same Scene, when the user docks or pins a widget through focused controls, then the Scene layout state changes through the same command as desktop.

### CANVAS-004
**Statement:** The DM shall be able to save any Scene as a template and instantiate that template later without cloning canonical note, map, character, or handout entity data.
**Source:** Vision "Canvases can be saved as templates"; Architecture Contract 4 Embed Rules.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a Scene with widgets bound to existing entities, when the DM saves and instantiates a template, then the new Scene contains new widget instances and bindings to the original entities.
- Given a template contains a deleted binding target, when it is instantiated, then affected widgets render an explicit `missing` state without leaking cached content.

### CANVAS-005
**Statement:** The DM shall be able to project a Scene, widget subset, handout, map region, or display state to one or more Player Views during an active session, with projection stored in session/player-view assignment state.
**Source:** Glossary "Player View"; Architecture Contract 4 Project Rules.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a connected player, when the DM projects a handout widget to that player, then the player's Player View receives the widget only after visibility filtering.
- Given the network is unavailable, when the DM attempts a live remote projection, then the projection queues for the next reconnect and the DM sees degraded delivery status.
- Given a projected widget is revoked, when the player view assignment updates, then the player stream removes the widget without deleting the target entity or granting write permission.
- Given a projected widget has one visible binding and one hidden binding, when the player payload is generated, then the visible binding is delivered and the hidden binding resolves to `hidden` before leaving the host.

### CANVAS-006
**Statement:** A player shall be able to view the Scene configuration assigned by the DM with hidden fields redacted before the player device receives data.
**Source:** Vision "canvases are the unit of player view"; Defects `CODEX-PR5-DM-NOTES-LEAK`, `CODEX-PR17-POI-VISIBILITY-LEAK`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a widget bound to a character with a `dm-only` field, when the player opens the assigned Scene, then the field is omitted from the query result and cannot be inspected in UI state.
- Given a player has no Scene assignment, when they connect to a session, then they receive no default DM Scene layout.
- Given assigned Scene content is not cached on a player device, when the player opens it offline, then the app reports unavailable content without substituting stale hidden data.

### CANVAS-007
**Statement:** A participant with a Scene `co-editor` grant shall be able to add, move, resize, remove, and configure widgets on the granted Scene subject to widget and entity permissions.
**Source:** Architecture Contract 3 Scene capability sets; Vision Permission Grants.
**Priority:** Should-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a player has a `co-editor` grant on a shared Scene and `viewer` rights on a map, when they add a map widget, then the command is accepted and visible to authorized participants.
- Given the same player lacks `manager` rights on an existing widget, when they attempt to rebind it, then the command is rejected with a permission result.
- Given remote collaborators are unavailable, when an authorized co-editor changes local Scene layout, then the operation is queued and later sync either preserves independent layout edits or records a field-specific conflict.

### CANVAS-008
**Statement:** A widget author shall be able to define a versioned widget package with declared bindings, configuration schema, runtime state schema, commands, events, capability sets, and host permissions.
**Source:** Architecture Contract 4 Widget Definition; Vision "custom widgets".
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a widget package missing a configuration schema, when it is installed, then installation fails with a schema diagnostic.
- Given a widget package declares network access but the host permission is denied, when the widget runs, then the network API is unavailable and the widget enters a degraded state.
- Given a widget package is imported from a vault backup, when portability validation runs, then package id, version, schemas, assets, and requested host permissions are checked before the widget can be enabled.

### CANVAS-009
**Statement:** A widget shall be able to read app data only through actor-scoped bindings resolved by the Processing Core, with missing, hidden, deleted, and conflicted bindings represented as explicit widget states.
**Source:** Architecture Contract 4 Widget Data Contract.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a widget binding targets hidden data in a player context, when the widget renders, then it receives `hidden` state instead of the hidden value.
- Given a widget binding targets an entity with an unresolved conflict, when the widget renders, then it receives `conflicted` state and does not silently choose one version.

### CANVAS-010
**Statement:** A widget shall be able to dispatch declared commands for durable changes, and the Processing Core shall validate actor, visibility, permission, schema, revision, and sync constraints before accepting them.
**Source:** Architecture Contract 1 Command API; Architecture Contract 4 Custom Widget Code.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a timer widget with an `operator` command, when an authorized player starts the timer, then the command is accepted and session timer state changes.
- Given a custom widget submits a command for a hidden entity path, when the core validates it, then the command is rejected before mutation.

### CANVAS-011
**Statement:** A widget manager shall be able to upgrade a widget definition version with migration logic or leave the previous version recoverably disabled when migration fails.
**Source:** Architecture Contract 4 Widget Lifecycle.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a widget package update includes migration logic, when the manager upgrades it, then existing widget configuration is migrated and a new version is recorded.
- Given migration fails validation, when the upgrade completes, then the previous widget state is preserved or the instance is disabled with a recoverable diagnostic.

### CANVAS-012
**Statement:** A keyboard or touch user shall be able to perform every Must-have Scene and widget layout operation without relying on drag-only or hover-only controls.
**Source:** Architecture Contract 4 Widget Accessibility; WCAG 2.2 pointer/drag guidance; Defect `RESEARCH-A11Y-GESTURE-ALTERNATIVES`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given keyboard-only input, when the user selects a widget, then they can move and resize it through focusable controls or command menus.
- Given a touch device, when the user opens widget actions, then all commands remain reachable without hover.

### CANVAS-013
**Statement:** The DM shall be able to author Scene-level visibility, sharing targets, tags, ownership metadata, and visual settings independently from widget layout and bound entity data.
**Source:** Architecture Contract 4 Canvas / Scene State; Glossary "Scene"; audit remediation.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a Scene has `shared` visibility and a player-view assignment, when the player opens the assigned Scene, then the Scene shell is visible but every widget binding is still actor-filtered.
- Given the DM changes Scene tags or background settings, when the command is accepted, then no widget binding or canonical entity revision changes.

### CANVAS-014
**Statement:** A widget manager shall be able to destroy a widget instance without deleting or mutating its bound note, character, map, handout, timer history, or object.
**Source:** Architecture Contract 4 Widget Lifecycle.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a map widget is removed from a Scene, when the destroy command is accepted, then the widget instance and declared widget-local state are removed and the map entity remains unchanged.
- Given a custom widget attempts to delete its bound entity as part of widget destroy, when validation runs, then the entity deletion is rejected unless a separate explicit entity-delete command is authorized.

### CANVAS-015
**Statement:** Projection shall never grant write permission, ownership, or persistent visibility beyond the delivered Player View assignment unless a separate Permission Grant or visibility command exists.
**Source:** Architecture Contract 4 Project Rules; Architecture Contract 3 Permission Grants.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player receives a projected timer widget without an `operator` grant, when they attempt to operate it, then the command is rejected even though the widget is visible.
- Given the DM ends a projection, when catch-up sync runs, then the player no longer receives the projected widget unless another active grant or assignment permits it.

### CANVAS-016
**Statement:** Scene focus order shall follow z-order, grouping, dock/pin state, and explicit widget focus metadata rather than DOM insertion order.
**Source:** Architecture Contract 4 Widget / Canvas Accessibility; Accessibility requirements.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a Scene contains grouped and layered widgets, when keyboard traversal starts, then focus follows the declared Scene focus order.
- Given a widget is pinned or docked, when the layout changes, then focus order updates predictably and no widget control becomes unreachable.

### CANVAS-017
**Statement:** A widget manager shall be able to install, review, enable, disable, remove, and export Widget Packages with trust state, host-permission approval, migration status, and portability diagnostics.
**Source:** Glossary "Widget Package"; Architecture Contract 4 Widget Lifecycle; Security widget host.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a Widget Package requests filesystem, clipboard, network, or source-adapter access, when trust review opens, then each host permission is shown and denied by default.
- Given a package is disabled, when a Scene containing its widget opens, then the widget instance renders a recoverable disabled state and no package code executes.
- Given a package is removed, when existing Scenes reference it, then widget instances remain as disabled placeholders until explicitly destroyed or migrated.
- Given a package export runs, when validated, then schemas, migrations, assets, version, trust metadata, and portability warnings are included without secrets or device-local paths.

### CANVAS-018
**Statement:** Scene sections shall be defined as layout regions within a Scene, not independent durable containers, unless a future architecture decision creates a separate Scene container type.
**Source:** Glossary "Scene"; Architecture Contract 4 Canvas / Scene State; audit remediation.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a Scene contains sections, when the Scene is saved, then sections persist as layout metadata on `SceneState` and do not create separate widget ownership boundaries.
- Given a section is projected to a Player View, when payload generation runs, then section membership narrows widget delivery but every binding is still actor-filtered.
- Given a future proposal treats sections as independent containers, when architecture review runs, then it requires an explicit contract update before implementation.
