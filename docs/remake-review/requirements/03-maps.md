## MAP - Map Creation, Layers, Nesting, and POIs

Capability tree:

- Map entity and assets: `MAP-001`, `MAP-002`, `MAP-020`
- Map editing and generation: `MAP-003`, `MAP-004`
- Layers and visibility: `MAP-005`, `MAP-006`, `MAP-007`, `MAP-016`
- Nesting and spatial transitions: `MAP-008`, `MAP-009`, `MAP-017`
- POIs, routes, fog, and combat overlays: `MAP-010`, `MAP-011`, `MAP-012`, `MAP-013`, `MAP-014`, `MAP-018`, `MAP-019`
- Interaction safety: `MAP-015`

### MAP-001
**Statement:** The DM shall be able to create a map entity with name, scale, projection metadata, default visibility, and initial layer set.
**Source:** Vision "Maps"; Glossary "Map", "Layer"; Feature Inventory I9.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given the DM creates a map with no network, when the command is accepted, then a note-backed map object and `MapState` record are persisted.
- Given default visibility is omitted, when the map is created, then it defaults to `dm-only`.

### MAP-002
**Statement:** The DM shall be able to import image files and SVG as map assets with asset metadata and content-addressed storage, while external scene formats require a declared adapter before use.
**Source:** Vision "Creation"; Architecture Contract 2 binary asset rule; Feature Inventory I9.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given an image file is imported, when import completes, then the map asset has dimensions, checksum, source metadata, and a map entity link.
- Given an imported file exceeds configured size limits, when import starts, then it is rejected with an actionable diagnostic before storage mutation.
- Given a declared external scene-format adapter imports a file, when required dimensions, grid, background image, walls, lights, notes, or other adapter-declared elements cannot be mapped, then the import preview lists supported mappings and unsupported elements before any write.
- Given another external map format is selected, when no adapter is declared, then import fails with an unsupported-format diagnostic and no partial map entity is created.

### MAP-003
**Statement:** The DM shall be able to draw or paint map content using map editing commands that capture before and after state after commit for undo and sync.
**Source:** Vision "Custom map builder"; Defect `CODEX-PR16-FOG-UNDO-ASYNC`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given the DM paints terrain, when the command commits, then undo restores the previous map state exactly.
- Given an async save fails, when the command returns, then pending state clears and no identical before/after undo snapshot is recorded.
- Given a player is viewing a projected map, when the DM commits a paint operation on a DM-only layer, then the player receives no layer payload or visual update for that operation.

### MAP-004
**Statement:** The DM shall be able to generate terrain, settlements, and dungeons procedurally from explicit parameters and save the result as editable map layers.
**Source:** Vision "Procedural generation systems"; Feature Inventory random generation.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given generation parameters and a seed, when the DM generates a dungeon, then the same seed and parameters reproduce the same editable layer set.
- Given generation fails validation, when the command returns, then no partial map layers are persisted.

### MAP-005
**Statement:** The DM shall be able to create, rename, reorder, duplicate, lock, and delete named map layers with type, opacity, visibility, tags, and query metadata.
**Source:** Vision "Layer system"; Glossary "Layer"; Feature Inventory I9.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a map with three layers, when the DM reorders Layer C above Layer A, then layer order persists and render order changes accordingly.
- Given a locked layer, when a non-DM or unauthorized command tries to edit it, then the operation is rejected.

### MAP-006
**Statement:** The DM shall be able to toggle a layer's player visibility independently from its DM visibility and opacity without affecting other layers.
**Source:** Vision layer visibility; Architecture Contract 3 Visibility; Defect `CODEX-PR17-POI-VISIBILITY-LEAK`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a map with Layer A, B, and C, when the DM makes Layer B `player-visible`, then player map queries include Layer B and leave A/C unchanged.
- Given Layer B remains `dm-only`, when a player opens a projected map widget, then Layer B data is absent from the response.
- Given Layer B is included in Player A's Player View assignment only, when Player A and Player B query the same map, then only Player A receives Layer B.
- Given an observer views the map, when shared or character-linked layers exist, then only observer-visible layers are returned and no write controls are available.

### MAP-007
**Statement:** The DM shall be able to tag and query map layers by type and metadata, such as POI layers for a region, without reading hidden layer data into player contexts.
**Source:** Vision layer tags/query; Architecture Contract 3 visibility before queries.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given layers tagged `region:northern-coast`, when the DM filters by that tag, then matching layers are returned.
- Given a player runs the same visible-layer query, when hidden layers match the tag, then hidden matches are omitted rather than redacted in the UI.

### MAP-008
**Statement:** The DM shall be able to embed one map inside another at configured position, scale, rotation, and transition behavior while preserving each map's independent layers and permissions.
**Source:** Vision "Nesting"; Glossary "Nested Map".
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a city map nested inside a region map, when the DM opens the region map, then the nested map appears at its configured spatial transform.
- Given the city map has DM-only layers, when a player zooms into the nested map, then those layers remain unavailable.

### MAP-009
**Statement:** A participant viewing a nested map shall be able to smoothly scroll or zoom between parent and child maps within the limits of their visible map data.
**Source:** Vision "Smooth scroll-zoom transitions"; Feature Inventory I9.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a visible nested map relationship, when the user zooms past the configured threshold, then the viewport transitions to the child map.
- Given the child map is not visible to the participant, when the threshold is reached, then the transition is blocked without revealing the child map name or content unless separately visible.

### MAP-010
**Statement:** The DM shall be able to create, move, categorize, and link POIs to notes or objects, with POI coordinates stored in normalized map space.
**Source:** Glossary "POI"; Feature Inventory I9.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a map, when the DM creates a POI linked to a location note, then the POI stores normalized coordinates, label, category, and target entity id.
- Given the map image is resized or rendered at a different zoom, when the POI displays, then it remains anchored to the same map location.

### MAP-011
**Statement:** The DM shall be able to assign visibility to POIs independently of map and layer visibility so DM-only annotations do not leak through list, search, or widget views.
**Source:** Glossary "POI"; Defect `CODEX-PR17-POI-VISIBILITY-LEAK`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player-visible map contains a DM-only POI, when the player opens the POI list, then the POI is absent.
- Given a DM changes the POI to `player-visible`, when player map data refreshes, then the POI appears without requiring map reload.
- Given a hidden POI matches a search query, graph relationship, widget binding, or linked-note backlink, when a player requests those surfaces, then the POI id, label, snippet, and coordinates are absent.
- Given a player-visible POI is placed on a hidden layer, when map validation runs, then the DM sees a consistency error before projection.

### MAP-012
**Statement:** The DM shall be able to author fog-of-war reveal and conceal operations as durable map commands that sync to player map views.
**Source:** Feature Inventory I9; Architecture Contract 2 map merge strategy.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a combat map with fog, when the DM reveals an area, then the reveal operation is persisted and projected players see the revealed area.
- Given the DM is offline from remote players, when a reveal is made, then the operation queues and the DM sees undelivered sync status.

### MAP-013
**Statement:** The DM shall be able to draw routes, measure distance, calculate travel time, and link route waypoints to notes or POIs.
**Source:** Feature Inventory I9 route drawing/travel time.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a map scale, when the DM draws a route with waypoints, then total distance and estimated travel time are computed deterministically.
- Given a waypoint delete control is used, when pointerdown occurs on the control, then no accidental waypoint placement occurs underneath it.

### MAP-014
**Statement:** The DM shall be able to configure grid, token, range, area-of-effect, and combat overlay settings through explicit map mode commands with declared prerequisite visual state.
**Source:** Feature Inventory I9; Defects `CODEX-PR14-GRID-VISIBILITY`, `CODEX-PR14-FORCE-BYPASS`.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given grid alignment mode requires visible grid, when the DM enters the mode, then grid visibility is enabled or the mode transition is blocked with a reason.
- Given a mode is blocked by invalid state, when an internal command tries a forced transition, then validation still prevents the transition.

### MAP-015
**Statement:** A map user shall be able to interact with POI popovers, sheets, overlays, and canvas controls without pointer, hover, or focus handlers dismissing the active control prematurely.
**Source:** Defects `CODEX-PR17-LONG-PRESS-SHEET`, `CODEX-PR15-POI-POPOVER-HOVER`, `CODEX-PR16-WAYPOINT-DELETE`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a POI popover with action buttons, when the pointer moves from the POI marker into the popover, then the popover remains open.
- Given a compact long-press sheet is open, when the user taps an action inside it, then the sheet action executes instead of closing from underlying map handlers.

### MAP-016
**Statement:** The DM shall be able to validate map-layer visibility consistency across map, layer, POI, route, fog, token, and nested-map data before projecting a map to players or observers.
**Source:** Architecture Contract 3 Visibility; Defects `CODEX-PR17-POI-VISIBILITY-LEAK`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a visible route references a hidden POI, when projection validation runs, then projection is blocked until the route is hidden, the POI is revealed, or the route reference is removed.
- Given a hidden token appears on a player-visible combat overlay, when the map is projected, then the token data is omitted from player payloads and the projection is blocked if omission would make the visible overlay misleading.
- Given a hidden token is safely omitted from a DM-only overlay, when validation runs, then the DM receives a non-blocking warning and projection of unrelated visible data may continue.

### MAP-017
**Statement:** Nested map relationships shall prevent cycles, preserve coordinate transforms across the configured supported depth, and surface broken child-map links without leaking hidden child names or content.
**Source:** Glossary "Nested Map"; Architecture Contract 2 map merge strategy.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a map is already an ancestor of a candidate child, when the DM attempts to nest the ancestor under the child, then the command is rejected as a cycle.
- Given a user transitions world to region to city to building, when every child is visible, then coordinates and scale transforms resolve deterministically at each level.
- Given a child map is deleted or hidden from the participant, when the parent renders, then the nested area shows a missing or unavailable state without revealing hidden metadata.

### MAP-018
**Statement:** Map search, graph, widget, MCP, and deep-link surfaces shall use the same actor-filtered map query model as the map renderer.
**Source:** Architecture Contract 1 Processing Core; Architecture Contract 3 Visibility.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a hidden layer contains a matching POI and route, when a player uses search, graph, MCP, or a widget query, then none of those hidden map artifacts are returned.
- Given a deep link targets a hidden map artifact, when opened by a player or observer, then the app shows a generic unavailable state and preserves no hidden query parameters in visible UI.

### MAP-019
**Statement:** The DM shall be able to manage combat token lifecycle, movement, range measurement, area-of-effect templates, and actor-filtered token projection as durable map/session commands.
**Source:** Feature Inventory I9 combat overlays; Session combat requirements; Architecture Contract 3 Visibility.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given the DM adds a token linked to a combatant, when the command is accepted, then token id, linked actor, map position, size, visibility, and session/map ownership are recorded.
- Given a token moves, when movement is committed, then distance is computed from map scale and the movement operation appears in session history where visible.
- Given the DM places a range or area-of-effect overlay, when projected to players, then hidden origin tokens, hidden targets, and hidden layer metadata are omitted from player payloads.
- Given a player controls a visible character token, when they attempt to move a token outside their grant, then the command is rejected before mutation.

### MAP-020
**Statement:** Map import shall provide a preview, adapter capability summary, unsupported-element diagnostics, and rollback behavior before committing external map assets or generated `MapState`.
**Source:** Glossary "Source Adapter Capability"; map import audit remediation.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given an import file contains layers, walls, notes, grid data, and image assets, when preview runs, then each element is classified as importable, lossy, unsupported, or blocked.
- Given the DM cancels an import from preview, when storage is inspected, then no map entity, asset record, or partial layer remains.
- Given import fails after staging assets, when rollback runs, then temporary assets are removed or marked orphaned for safe cleanup without affecting existing maps.
