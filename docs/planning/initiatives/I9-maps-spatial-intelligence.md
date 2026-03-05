# Initiative 9 — Maps & Spatial Intelligence

## Status: In progress

**Outcome:** DND Tools has first-class, interactive map support. DMs manage world
maps, dungeon maps, and city maps with linked notes. Combat happens on a grid with
tokens. Players see only the revealed portions of maps. Every map is a live,
interactive layer of the knowledge graph.

**Why this matters:** TTRPG play is fundamentally spatial. A map is often the first
artifact created for a campaign and the last one consulted at the table. Without
maps, the app cannot be the definitive TTRPG tool. Maps also unlock a new dimension
of the object graph — locations are not just text, they are anchored in space.

---

## Epic 9.1 — Map Asset Manager & Viewer

**Goal:** DMs can import any image as a map, organize maps in a library, and view
them with pan/zoom controls that work as well on a tablet at the table as on a
desktop during prep.

**Stories:**

- **S9.1.1 — Map import and metadata**
  Add a `/maps` route and a map library. Maps are imported as image files (PNG,
  JPEG, WebP, SVG up to 50MB). Import stores the image in `.vault/assets/maps/`
  and creates a `map` object in `.vault/objects.json` with fields: name, file path,
  scale (units per grid square, optional), area (linked location note), and tags.
  The map library shows thumbnails in a responsive grid with filter by tag and area.

- **S9.1.2 — Tiled pan/zoom viewer with smooth performance**
  Implement the map viewer using HTML Canvas or WebGL with tiled rendering so large
  maps (8k+ resolution) remain performant on modest hardware. Pan with drag, zoom
  with scroll wheel or pinch gesture. Zoom levels: fit-to-screen, 100%, 200%.
  Keyboard: arrow keys to pan, `+/-` to zoom, `0` to reset. The viewer component
  is reusable as a session board tile with configurable initial zoom and position.

- **S9.1.3 — Grid overlay configuration**
  Add a grid overlay system supporting square and hex grids. The DM aligns the grid
  to the map by dragging control points for the top-left corner and setting cell
  size. Grid settings are stored in the map object. The grid can be shown/hidden at
  runtime without losing alignment. Scale label shows real-world distance if scale
  is defined (e.g., "1 square = 5 ft").

- **S9.1.4 — Map object relationship in knowledge graph**
  Each `map` object is a first-class node in the vault graph. Map notes link to
  location notes. Location notes link back to maps. The MCP `get_link_graph` response
  includes map objects and their location edges. `get_session_prep_bundle` includes
  the active map if a location is pinned in the session context panel.

---

## Epic 9.2 — Points of Interest & Note Linking

**Goal:** Every meaningful location on a map is a pin linked to a vault note or
object. Clicking a pin opens the linked content. Creating a note from a pin anchors
it spatially. Maps become a navigation surface for the knowledge graph.

**Stories:**

- **S9.2.1 — POI pin placement and management**
  In map edit mode, click anywhere to place a POI pin. Pins have: label, category
  (city, dungeon, landmark, structure, secret, encounter), optional linked note ID,
  and optional linked object ID. Pins are stored in the map object's `pois` array
  with `{x, y}` as fractions of map dimensions (resolution-independent). Pins can
  be dragged, deleted, and grouped by category with distinct icons.

- **S9.2.2 — POI hover preview and navigation**
  Hovering a POI pin shows a popover with the pin label and the first three lines of
  the linked note (or key fields from the linked object). Click navigates to the note
  in a split-pane view without leaving the map. `Ctrl+click` opens in a modal overlay.
  Pins without linked content show a "create note" affordance that pre-fills the note
  title with the pin label and links back to the map.

- **S9.2.3 — Reverse link: note → map pin**
  Every note linked from a POI shows a "Located on map" badge in the reading header
  with the map name and a click-to-navigate link. Location notes with a `mapId` and
  `mapPosition` frontmatter field render a minimap thumbnail showing their position.
  MCP `get_backlinks` for a location note includes its map pins as a special
  `map_placement` link type with coordinates.

- **S9.2.4 — Layer system for map annotations**
  Maps support multiple named annotation layers (e.g., "DM Notes", "History",
  "Quest Markers"). Each layer has a visibility toggle and a color theme. The DM
  can show/hide layers independently. In player-facing mode, only layers marked
  `player_visible` are shown. Layers are stored as arrays in the map object.

---

## Epic 9.3 — Combat Grid & Token Management

**Goal:** Initiative-order combat can be run directly on the map with token placement,
movement ranges, and AoE templates overlaid on the grid. The combat tracker (I4.2)
and the map viewer are synchronized.

**Stories:**

- **S9.3.1 — Token placement linked to combatants**
  In combat mode on a gridded map, each combatant in the initiative tracker has a
  corresponding token on the map. Tokens are auto-created when combat begins if the
  map is linked to the encounter location. Token appearance: initials avatar (fallback)
  or linked image from the character/stat block object. Token position is stored in
  the combat session state, not the vault.

- **S9.3.2 — Movement and range indicators**
  Clicking a token shows its movement range as a highlighted grid overlay (speed ÷
  5 = squares). Clicking a target square shows the path (shortest path avoiding
  other tokens). Movement costs for difficult terrain are applied if the DM has
  painted terrain overlays. Range display also shows spell/attack range for the
  selected combatant's equipped weapon or prepared spell.

- **S9.3.3 — Area of effect template overlays**
  A template toolbar in combat mode offers: sphere (radius in squares), cone (60°),
  line (width × length), and cube. Templates are placed by clicking the origin point
  and dragging. Templates highlight affected grid squares. Multiple templates can
  coexist. Templates are dismissed when combat ends or manually. AoE templates
  respect the current grid cell size for accurate coverage.

- **S9.3.4 — Condition and status token indicators**
  Conditions applied in the initiative tracker (Epic 4.2.2) appear as small overlaid
  icons on the corresponding map token (skull for dead, snowflake for frozen, etc.).
  HP bar appears below each token: full green → orange → red → 0. Clicking a token
  on the map selects it in the initiative tracker and vice versa — the two views
  stay synchronized.

- **S9.3.5 — Combat map session persistence**
  The active combat map state (token positions, AoE templates, terrain overlays,
  fog state) is saved in the session board's state and restored if the app is closed
  mid-combat. Combat history log records each movement and status change. Post-combat,
  the state is archived with the encounter log note (Epic 4.9.4).

---

## Epic 9.4 — Player Fog of War & Map Reveal

**Goal:** DMs control exactly what players see on maps during a connected session.
Unexplored areas are hidden by a fog layer. Revealing is intuitive, animated, and
persistent so late-joining players see the same revealed state.

**Stories:**

- **S9.4.1 — Fog of war layer with DM paint tools**
  In DM mode, a fog layer covers the entire map by default (black or smoky grey, DM
  configurable). DM uses paint tools to reveal areas: circular brush, rectangle, and
  polygon lasso. Reveal painting is additive. An "undo reveal" brush can re-fog
  areas. The fog state is stored per map in the session board state as a compact
  polygon set (not a raster image).

- **S9.4.2 — Player view shows only revealed areas**
  In the player-facing map view (connected session or shared link), the fog layer
  is rendered client-side using the DM's polygon set. Unrevealed areas show a grey
  fog texture. The reveal boundary has a soft edge (5px feathered). Players cannot
  pan or zoom outside the revealed area unless the DM grants "free explore" mode.
  The player map view is the same component as the DM view with fog enforcement
  applied at the rendering layer, not the data layer.

- **S9.4.3 — Animated reveal for live sessions**
  When the DM reveals an area during a connected session, the reveal propagates to
  all player devices with a fade-in animation (0.8s ease-out). Sound effect support:
  if the atmosphere engine (I11) is active, reveal triggers an optional "reveal" audio
  cue. The reveal animation respects `prefers-reduced-motion`. Reveal events are
  appended to the session event log.

- **S9.4.4 — Map reveal state persistence and late-join recovery**
  Fog state is stored in DynamoDB as part of session state (cloud sessions) or the
  P2P session manifest (local sessions). Players who join mid-session receive the
  current fog state immediately. Fog state is also saved to the vault at session end
  so it is available for continued future sessions on the same map.

---

## Epic 9.5 — World Atlas & Region Hierarchy

**Goal:** Maps are organized in a navigable hierarchy: world → continent → region →
city → building floor. Navigating between scales follows the POI link graph. The DM
always knows where in the world the party is, and that context flows into the
AI bundle tools.

**Stories:**

- **S9.5.1 — Map parent/child hierarchy and navigation**
  Each map can have a parent map and a "location on parent" position (a single POI
  pin). This creates a drillable hierarchy. From a world map, clicking the "Draven
  Peaks" region POI opens the regional map. A breadcrumb in the map viewer shows the
  current path: World → Draven Peaks → Khorrund. The `Escape` key navigates up one
  level. Hierarchy depth is unlimited.

- **S9.5.2 — Active party location tracking**
  The DM sets the party's current map and position (a pin or free-form point) from
  the session context panel or by right-clicking the map: "Mark party here". The
  active location is stored in `.vault/session-state.json` and broadcasts to all
  connected players showing a party token on the map. MCP `get_session_prep_bundle`
  includes the active map, current location, and parent map as context.

- **S9.5.3 — Travel route drawing and distance calculation**
  In map edit mode, the DM can draw travel routes: click-to-place waypoints, curved
  or straight segments, labeled with route name (e.g., "North Road"). Route length
  is computed in grid squares × scale. If scale is defined, show distance in feet/
  miles/km. Travel routes are stored in a `routes` layer on the map. The `estimate_
travel_time` MCP tool accepts a map ID and route name and returns travel time at
  standard D&D 5e paces (normal/fast/slow).

- **S9.5.4 — Geographic context in note metadata**
  Notes can declare their geographic position via frontmatter: `mapId` and `mapPoi`.
  When a note is opened that has map context, the reading header shows a "Located on
  map" badge. The sidebar's folder tree can be toggled to a map-hierarchy view that
  organizes notes by their geographic region. MCP `search_notes` accepts a `mapId`
  parameter to filter results to notes geographically contained within that map.

---

---
