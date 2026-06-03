# v2 Glossary

Canonical vocabulary for DND Tools 0.2.0. Every term used in requirements, architecture
contracts, and design documents must be defined here or traceable to a term defined here.
When a term here conflicts with a term in a v1 source document (`01`–`07`), this glossary
takes precedence.

---

## Core Spatial Concepts

### Scene

**Definition:** The primary spatial workspace and UI primitive — a named, saveable layout of
widgets that the DM configures and that players view as their live interface.
**Scope:** Application-wide. Every user interaction happens within or in relation to a scene.
**Related:** Widget, Command Center, Player View, Session.
**v1 equivalent:** New in v2. The closest v1 analog is Session Board, but scenes are
generalized: they are not session-only, hold any widget type, and are the primary application
surface rather than a secondary dashboard.

**Notes:**

- "Canvas" is used as a generic architectural descriptor when discussing the widget layout
  surface; "Scene" is the product-facing name chosen for this concept.
- Scenes can be saved as templates and recalled instantly.
- The DM controls which scene configuration is displayed on each player's screen.
- A single user may have many scenes; the DM switches between them as needed.

---

### Widget

**Definition:** A self-contained, configurable tool or visual component that can be placed,
resized, and linked on a scene, can define its own visuals and local behavior, and can read or
change shared state only through declared data bindings and processing-core commands.
**Scope:** Scene context only. Widgets exist exclusively as children of scenes.
**Related:** Scene, Embed, Command Center, Capability Set.
**v1 equivalent:** Session Board tile (v1 tiles were typed components with a fixed grid;
widgets generalize and extend that concept to any scene, any layout).

**Notes:**

- Widget lifecycle: create → configure → display → destroy.
- The widget data contract specifies how a widget reads entity state (character HP, map data,
  timer state), receives events, runs local automation, and dispatches write commands — it may
  not bypass the processing core for durable state mutation.
- Widgets may be built in or user-authored. User-authored widgets are expected to be powerful
  custom tools, but their access to vault data, scene state, platform APIs, and durable writes is
  mediated by the widget host and command system.
- In scene context, every visible scene element is represented as a widget or a widget-owned
  sub-element.
- Every widget type defines the capability sets available for it (`manager`, `operator`,
  `viewer`).

---

### Command Center

**Definition:** The application home screen — a special scene preconfigured for active
session management, containing the DM tools panel, active map embed, player view controller,
and quick-access widget library.
**Scope:** DM context. The Command Center is the DM's home scene, not a separate application
section.
**Related:** Scene, Session, Player View, Widget.
**v1 equivalent:** Notes list landing page (replaced) + Session Board from I4/I16 (closest
functional analog, subsumed and generalized).

**Notes:**

- The Command Center is the DM's configured home scene and can be rearranged like any other
  scene — it is not a fixed layout.
- The Command Center is active across all session workflow states; it is the DM's working
  surface at all times.

---

### Player View

**Definition:** The scene configuration the DM has designated as the live display for a
specific player — dynamically controlled and modified by the DM in real time.
**Scope:** Session context primarily; the DM may configure player views outside of active
sessions.
**Related:** Scene, Visibility, Session, DM.
**v1 equivalent:** Player Route / Player Mode in v1 (`/player` route and player-mode
visibility guards). In v2 player views are scene-level configurations, not a separate route.

**Notes:**

- Player View is always DM-controlled. A player cannot modify their own view configuration.
- The DM can push or revoke widgets on a player's view dynamically during a session.
- Player View enforces Visibility rules at render time: only `player-visible` or explicitly
  shared content is shown.

---

### Player Group

**Definition:** A named DM-managed set of session participants used only as a delivery target for
projection, handouts, roll visibility, or Player View assignment; group membership does not grant
visibility or write permission by itself.
**Scope:** Session delivery and collaboration workflows.
**Related:** Player View, Permission Grant, Handout, Visibility.
**v1 equivalent:** New in v2.

**Notes:**

- A Player Group is evaluated at delivery time.
- Adding a player to a group does not retroactively deliver prior content unless a separate
  persistent visibility grant or delivery command exists.

---

### Navigation Section

**Definition:** A canonical top-level route area owned by a product domain, such as Command Center,
Knowledge, Atlas, Session, Campaign, Characters, Audio, MCP, and Settings.
**Scope:** Navigation and platform shell.
**Related:** Route alias, Command Palette, Information Architecture.
**v1 equivalent:** Section-rooted IA.

---

## Roles

### DM (Dungeon Master)

**Definition:** The role with full vault access, authorship control over all content and
entity fields, exclusive authority over session state and player views, and the sole ability
to assign capability grants to players.
**Scope:** Application-wide.
**Related:** Player, Observer, Permission Grant, Visibility.
**v1 equivalent:** DM (concept unchanged; in v2 the permission model around the DM role is
more explicit).

**Notes:**

- The DM's permissions are never restricted by capability grants or visibility rules. The DM
  always has read and write access to all content.
- The DM retains administrative edit rights on any entity regardless of which player owns it.

---

### Player

**Definition:** A role with read access to their own character and DM-exposed content, and
write access to whatever capability sets the DM has explicitly granted them on specific
entities.
**Scope:** Session context primarily; character ownership persists between sessions.
**Related:** DM, Observer, Capability Set, Ownership, Player View.
**v1 equivalent:** Player (v1 had a basic player mode; v2 adds explicit grants, a
player-controlled canvas, and a formal permission model).

**Notes:**

- Players have no vault access by default. Their content surface is defined entirely by DM
  visibility settings and explicit grants.
- A player's total permission surface = base Player role permissions ∪ all active grants
  assigned to that player.

---

### Observer

**Definition:** A read-only role with access to shared scenes and maps but no character data
and no write permissions of any kind.
**Scope:** Session context.
**Related:** Player, Player View.
**v1 equivalent:** New in v2 (v1 had no defined observer role).

---

## Session

### Session

**Definition:** An active game instance defined by application-level state that persists
across navigation — including active scene, combat state, dice history, and party location —
shared among a DM and one or more players and observers.
**Scope:** Application-wide. Session workflow uses the states `idle`, `prep`, `active`,
`paused`, `ending`, `recap`, and `archived`.
**Related:** Command Center, Session State, Session Workflow State, Combat, Player View.
**v1 equivalent:** Session Mode / Session State from I16 (v1 had a session state machine; v2
extends it to include multi-user participation and scene-level player views).

**Notes:**

- A session begins when the DM transitions from `idle` into `prep` or `active`.
- Session state is application-level, not route-level — session tools remain available across
  navigation.
- In multi-user contexts, a session is the live collaboration unit: the DM and players share
  a session, each with their own scene configuration.

---

### Session Workflow State

**Definition:** The application-level session lifecycle value controlling allowed commands,
participant availability, and session tool behavior.
**Scope:** Sessions, Command Center, collaboration, sync replay, and navigation.
**Related:** Session, Session State, Combat, Handout, Calendar / Custom Time.
**v1 equivalent:** Active session plus session-board lifecycle flags.

**Valid states:** `idle`, `prep`, `active`, `paused`, `ending`, `recap`, and `archived`.

---

### Session State

**Definition:** The persisted runtime data that captures the live state of an active session —
active scene, combat data, dice roll history, pinned rollable tables, and party location.
**Scope:** Session context. Session state remains durable across the workflow states until it is
archived or explicitly recovered.
**Related:** Session, Session Workflow State, Combat.
**v1 equivalent:** `SessionState` / `.vault/session-state.json` (concept and persistence model
carried forward from v1).

---

## Content

### Vault

**Definition:** The root content store for a DND Tools installation — a named, versioned
collection of notes, objects, settings, and metadata constituting a campaign's data.
**Scope:** Application-wide. All content belongs to exactly one vault.
**Related:** Note, Vault Object, Sync Source, Wikilink, Graph Engine.
**v1 equivalent:** Vault (concept carried forward; in v2 a vault may be backed by local
filesystem, Obsidian directory, or cloud storage while preserving its identity across backing
stores).

---

### Note

**Definition:** The primary content unit — a markdown file with YAML frontmatter representing
a piece of campaign content (scene descriptions, lore, session logs, handouts, etc.).
**Scope:** Vault-wide. Notes are the canonical content form; all structured objects are
note-backed.
**Related:** Vault, Vault Object, Wikilink, Embed, Sync Source.
**v1 equivalent:** Note (concept unchanged; in v2 notes may originate from any Sync Source,
not only the local vault).

---

### Vault Object (Object)

**Definition:** A structured, typed entity stored as a note-backed record with schema-validated
typed frontmatter and a data contract that widgets can bind to.
**Scope:** Vault-wide. Objects are the substrate for characters, stat blocks, maps, handouts,
NPCs, locations, factions, quests, items, encounters, and timeline events.
**Related:** Note, Embed, Widget, Capability Set.
**v1 equivalent:** Vault Object (concept carried forward; in v2 the object data contract is
extended to support widget binding and capability set enforcement).

**Subtypes:** `character`, `stat_block`, `npc`, `location`, `faction`, `quest`, `item`,
`handout`, `encounter`, `timeline_event`, `map`, `image`.

---

### Authorized Editor

**Definition:** A DM or participant whose effective permissions allow the requested content edit
after visibility and capability-set checks.
**Scope:** Content, object, and link-repair workflows.
**Related:** Permission Grant, Capability Set, Visibility.
**v1 equivalent:** Editor access guarded by route/UI state; formalized in v2.

---

### Calendar / Custom Time

**Definition:** A campaign-specific time model with named calendars, eras, date formatting,
clocks, moon/reference panels, and links from session and content events.
**Scope:** Session, content, graph, search, and MCP domains.
**Related:** Timeline event, Session recap, MCP bundle.
**v1 equivalent:** In-world calendar and custom time system.

---

### Wikilink

**Definition:** An `[[Note Title]]` cross-reference in markdown, resolved to a note ID at
parse time, forming the primary edges of the content graph.
**Scope:** Note content.
**Related:** Note, Graph Engine.
**v1 equivalent:** Wikilink (concept unchanged; in v2 the graph engine traverses wikilinks
across all sync sources, not only the local vault).

---

### POI (Point of Interest)

**Definition:** A spatial annotation placed at a normalized (x, y) position on a map, with a
label, category, and optional link to a vault note or object.
**Scope:** Map context only.
**Related:** Map (object subtype), Layer, Note, Nested Map.
**v1 equivalent:** POI (concept carried forward from I9; in v2 POIs are a first-class part of
the map layer system and carry their own player visibility setting independent of map-level
visibility).

---

### Embed

**Definition:** The inline rendering of entity data at a call site — either a Vault Object
rendered as a card or block inside a note body, or entity data rendered as a widget on a
scene.
**Scope:** Note-body context and scene context.
**Related:** Widget, Wikilink, Vault Object.
**v1 equivalent:** Object Embed (v1 had object embeds in note bodies; v2 extends the concept
to include scene-level widget embedding).

**Distinguish from Link:** A link is a reference that navigates to an entity when followed;
an embed renders entity data inline at the call site without requiring navigation.

---

### Handout

**Definition:** A structured content object (letter, map fragment, image, cipher, rumor, or
document) that the DM explicitly delivers to one or more player scenes during a session, with
optional reveal animation and visual styling.
**Scope:** Session context. Handouts are authored before or during a session and delivered as
an explicit DM action.
**Related:** Session, Player View, Vault Object.
**v1 equivalent:** Handout object type from I4.8 (concept carried forward; in v2 handout
delivery is a scene-level action that places a handout widget on the target player's scene).

---

### Graph Engine

**Definition:** The component that indexes all content relationships — wikilinks, object
relationships, note-to-POI links — across all sync sources and produces the queryable link
graph, backlink index, and relationship graph used by navigation, search, and MCP tools.
**Scope:** Application-wide. The graph engine is source-agnostic: it operates uniformly over
local vault, Obsidian vault, and Google Docs content.
**Related:** Vault, Wikilink, Sync Source.
**v1 equivalent:** Vault Graph / Link Graph from I3.6 (v1 graph was local-vault-only; v2
extends traversal to all sync sources).

---

### Sync Source

**Definition:** An external content system that feeds the vault's content graph — one of:
local filesystem vault (default, always offline-capable), Obsidian vault directory
(read/write with Obsidian frontmatter conventions), or Google Docs (bi-directional pull into
the content graph as first-class notes).
**Scope:** Vault configuration. Each vault has a primary sync source; additional sources may
be layered on top.
**Related:** Vault, Graph Engine, Local-First.
**v1 equivalent:** New in v2 (v1 was local-filesystem-only; the sync source concept
generalizes the content origin to support multiple systems).

**Notes:**

- All sync sources implement the same interface contract so a third source type can be added
  without architectural changes.
- Only the local filesystem vault is guaranteed fully offline-capable.

---

## Maps

### Map

**Definition:** A note-backed spatial object with projection metadata, one or more named layers,
optional POIs, routes, fog, nested maps, and a `MapState` record for operational state.
**Scope:** Map and atlas domains.
**Related:** Layer, POI, Nested Map, MapState, Scene widget.
**v1 equivalent:** Map object and map viewer.

---

### Layer (map context)

**Definition:** A named, independently-togglable plane within a map with its own visibility
state, opacity, and player-visibility flag.
**Scope:** Map context only.
**Related:** Map (object subtype), Fog of War, POI, Nested Map.
**v1 equivalent:** Map Annotation Layer from I9 (v1 had annotation layers; v2 promotes layers
to a first-class concern with typed categories and queryable metadata).

**Layer categories:** heightmap, political, climate, roads/transport, waterways, watersheds,
fog of war, POIs, DM-only annotations, player-visible overlay. Layers are taggable and
queryable.

---

### Nested Map

**Definition:** A full map entity embedded within a parent map at a configurable scale,
linked to a POI or region on the parent, and supporting smooth scroll-zoom transitions
between geographic levels of detail.
**Scope:** Map context only.
**Related:** Map (object subtype), Layer, POI.
**v1 equivalent:** Parent/child map hierarchy from I9.5 (v2 adds smooth scroll-zoom
transitions and makes nesting a first-class navigation pattern rather than a metadata
relationship).

**Notes:**

- Each nested map is a full map entity with its own independent layer set.
- Nesting supports arbitrary depth: world → region → city → building.
- The child map is not a cropped region of the parent — it is an independent map object.

---

### Fog of War

**Definition:** A map layer type representing unexplored or DM-hidden areas, painted and
progressively revealed by the DM, with player view enforcement applied at the data layer.
**Scope:** Map context only.
**Related:** Layer, Player View, Visibility.
**v1 equivalent:** Map Fog from I9.4 (concept carried forward; in v2 fog is a typed layer
within the first-class layer system rather than a special-case state).

---

### Combat

**Definition:** A session state mode for turn-based encounter management, including combatants,
initiative, rounds, turns, visible status, permitted participant controls, and encounter logging.
**Scope:** Session, character, and map-combat domains.
**Related:** Session State, Character, combat-participant.
**v1 equivalent:** Combat tracker.

---

## Permission Model

### Role

**Definition:** The base permission floor assigned to every user — one of DM, Player, or
Observer — defining the minimum operations that user can perform without any additional
grants.
**Scope:** Application-wide.
**Related:** Permission Grant, Capability Set, DM, Player, Observer.
**v1 equivalent:** Role concept was implicit in v1 (DM vs. player mode toggle); in v2 roles
are explicit, named, and the additive foundation of the grant model.

---

### Visibility

**Definition:** Access metadata evaluated before any non-DM query, subscription, replication
stream, MCP response, search result, graph edge, widget binding, or UI render.
**Scope:** Permissions, content, maps, scenes, widgets, search, graph, collaboration, and MCP.
**Related:** Permission Grant, Player View, Handout, Capability Set, DM.
**v1 equivalent:** `visibility` field (`dm_only` / `shared` / `public`) on notes and objects
(concept carried forward; v2 renames `public` to `player-visible`, adds per-section and
per-field visibility for structured entities, and requires data-layer enforcement).

**Three states:**

- `dm-only` — invisible to all players and observers regardless of grants
- `player-visible` — visible to all players unless narrowed by a more specific rule
- `shared` — visible only through Player View assignment, handout delivery, or a viewer-capable
  grant

**Distinguish from Permission Grant:** Visibility answers "can this player see this content
at all?" Permission grants answer "can this specific player write to or interact with this
content?" These are independent axes: a player can have a write grant on content that is
`dm-only` (an edge case that requirements must flag as a consistency check).

---

### Permission Grant

**Definition:** A record the DM creates to assign a named capability set to a specific player
on a specific entity instance, extending that player's access beyond their base role.
**Scope:** Per-entity, per-player. Grants are authored by the DM and enforced at the
data/storage layer.
**Related:** Capability Set, Role, Visibility, Ownership.
**v1 equivalent:** New in v2 (v1 had no explicit grant record structure).

**Structure:** `{ entityId, entityType, playerId, capabilitySet }`

**Grant inheritance:** some capability sets imply others (e.g., `owner` on a character implies
`combat-participant`). Inheritance rules are defined per entity type in the system schema.

---

### Capability Set

**Definition:** A named group of allowed write operations scoped to a specific entity type,
defined in the system schema — the atomic unit of permission that a DM assigns via a grant.
**Scope:** Entity-type level. Capability sets are defined per entity type in the system schema
and cannot be freely composed per instance.
**Related:** Permission Grant, Ownership, Role.
**v1 equivalent:** New in v2.

**Why sets, not field lists:** Granting individual fields creates an unmanageable configuration
surface. Sets group related operations into meaningful units matching real workflows.

**Examples:**

- Character: `owner`, `combat-participant`, `backstory-editor`, `viewer`
- Note / section: `section-editor`, `contributor`, `viewer`
- Widget: `manager`, `operator`, `viewer`
- Scene: `co-editor`, `viewer`

---

### Widget Package

**Definition:** A versioned, vault-local or workspace-local bundle that declares a widget
definition, schemas, commands, events, bindings, migrations, portability metadata, trust review
state, and requested host permissions.
**Scope:** Canvas, widgets, security, platform, and constraints.
**Related:** Scene, Widget, Capability Set, Host Permission.
**v1 equivalent:** Internal/custom widgets formalized for v2.

**Notes:**

- Widget packages are not a public plugin marketplace API.
- System and user-authored widget packages use the same host contract, but privileged host
  permissions must be declared and test-covered.

---

### Host Permission

**Definition:** A declared widget-host capability such as network access, clipboard access, asset
access, external-link launching, storage quota, or source-adapter access that must be approved
before widget code can use it.
**Scope:** Widget package review and widget host security.
**Related:** Widget Package, Widget, Processing Core, Platform Profile.
**v1 equivalent:** New in v2.

---

### Ownership

**Definition:** The `owner` capability set assigned to the player who "plays" a specific
character, granting full write access to all character fields and establishing that player as
the primary author of the character.
**Scope:** Character entity type only.
**Related:** Capability Set, Permission Grant, DM.
**v1 equivalent:** New in v2 (v1 had a player character concept but no explicit ownership
model or ownership-as-capability-set framing).

**Notes:**

- A character has exactly one owner at a time.
- Additional grants (`combat-participant`, etc.) can coexist with ownership on the same
  character.
- The DM retains full administrative edit rights on all characters regardless of ownership
  assignment.

---

### Override (retired)

**Definition:** A retired planning term formerly used for DM-authored values that superseded
player-authored values; v2 does not include a parallel field-override value model.
**Scope:** Retired. Use DM administrative edit rights, Visibility, and Permission Grant instead.
**Related:** DM, Ownership, Capability Set, Visibility.
**v1 equivalent:** `dmNotes` remains a character field concept where needed, not a generalized
override mechanism.

---

## Platform & Architecture

### Processing Core

**Definition:** The platform-independent layer containing all business logic, data processing,
state management, graph operations, and command handling — completely independent of any GUI
framework or platform-specific API.
**Scope:** Architecture-wide. The processing core must produce identical behavior on desktop,
mobile, and web.
**Related:** GUI Layer, Platform Profile.
**v1 equivalent:** Domain modules and Svelte stores in v1 (the separation was partial — some
logic leaked into Svelte components; v2 makes the boundary an architectural contract).

---

### GUI Layer

**Definition:** The platform-specific display skin that renders state from the processing core
and dispatches user commands back to it — permitted to know only the state shape and command
API, nothing about internal processing logic.
**Scope:** Platform-specific. Each platform profile has a distinct GUI layer.
**Related:** Processing Core, Platform Profile.
**v1 equivalent:** SvelteKit renderer in v1 (in v1 the renderer contained both UI and domain
logic; v2 enforces a hard boundary between these concerns).

---

### Platform Profile

**Definition:** A named GUI layer configuration tailored to a specific device category
(desktop, tablet, mobile), defining its layout, chrome, and interaction patterns while
sharing the same processing core.
**Scope:** Build/runtime configuration.
**Related:** GUI Layer, Processing Core.
**v1 equivalent:** Layout tiers from I14 (compact/medium/expanded; v2 makes the per-platform
boundary an architectural contract, not just a responsive design convention).

---

### Local-First

**Definition:** The architectural invariant that the application works fully and correctly with
no network access, and that cloud sync is additive — it enhances but never gates core
functionality.
**Scope:** Architecture-wide. Every must-have feature requirement must specify its offline
behavior.
**Related:** Sync Source, Conflict, Vault.
**v1 equivalent:** Offline-first from I6.3 (concept carried forward and elevated to a
non-negotiable architectural contract in v2).

---

### Source Adapter Capability

**Definition:** Declared metadata for a sync source adapter, including readable/writable domains,
schema version range, formatting fidelity, auth requirements, rename/delete support, offline queue
support, asset support, and fail-closed unsupported-version behavior.
**Scope:** Sync, content, graph, search, security, and diagnostics.
**Related:** Sync Source, Conflict, Cloud Storage Model.
**v1 equivalent:** Source-specific sync behavior encoded in adapter code.

---

### Search Engine

**Definition:** The Processing Core subsystem that builds and queries visibility-filtered local
indexes for full-text, title, object, map, POI, session, and command discovery.
**Scope:** Search and graph domains.
**Related:** Graph Engine, Sync Source, Quick Switcher.
**v1 equivalent:** Search index/domain modules.

---

### Performance Budget Artifact

**Definition:** A release-reviewed table or structured file that names each measured workflow,
dataset, platform profile, device class, provisional or measured threshold, owner, and review date.
**Scope:** Performance, platform, CI, and diagnostics.
**Related:** Quality gate, smoke CI, responsiveness budget.
**v1 equivalent:** Metrics capture plus manually documented budgets.

---

### Staged Write

**Definition:** An MCP write operation that creates a pending change record with before/after
snapshots and a diff preview, held for explicit DM approval before being committed to the
vault.
**Scope:** MCP tool layer. The default mode for all MCP note mutations.
**Related:** MCP, Agent.
**v1 equivalent:** Staged Write / MCP Staged Change from I5.3 (concept and mechanics carried
forward unchanged).

---

### MCP (Model Context Protocol)

**Definition:** The protocol and server through which AI agents interact with vault data — a
capable but fully optional tool layer that can be disabled without loss of any core
application functionality.
**Scope:** AI integration layer only. MCP is not part of the application's core data path.
**Related:** Agent, Staged Write.
**v1 equivalent:** MCP Sidecar (v1 positioned MCP as more central to the architecture; v2
repositions it as optional and supplementary).

---

### MCP Policy Mode

**Definition:** A per-agent policy value. `disabled` denies tool use; `strict_review` stages all
writes for explicit human approval; `balanced` allows reads and low-risk staged batches while
requiring approval for durable writes; `trusted_direct` allows configured writes to commit directly
after Processing Core validation and audit.
**Scope:** MCP tools, AI agents, audit, security, and navigation.
**Related:** MCP agent identity, Staged Write, audit event.
**v1 equivalent:** MCP staged/direct behavior made explicit.

---

### Agent

**Definition:** A client that interacts with the application through a defined interface.

Three distinct types:

- **MCP agent:** a client that connects to the MCP server and calls vault tools (e.g., Claude,
  another LLM, or an automation script using the MCP protocol)
- **AI agent:** a language model (cloud-hosted or local) used for creative assistance —
  narrative suggestions, named entity extraction, text generation
- **Local agent:** an AI model running on the user's device (e.g., via Ollama), functioning
  as an AI agent without network dependency

**Scope:** AI integration context. Always disambiguate by type when the distinction matters.
**Related:** MCP, Staged Write.
**v1 equivalent:** MCP Sidecar / Local AI from I5.5 (v1 conflated these types; v2 requires
explicit disambiguation).

---

### Conflict

**Definition:** A state where two users or two sync sources have produced incompatible edits to
the same content unit that cannot be automatically merged, requiring an explicit resolution
action before the conflicting content can be committed.
**Scope:** Sync and multi-user collaboration context.
**Related:** Sync Source, Local-First.
**v1 equivalent:** Sync Conflict (partially defined in v1 sync types; v2 makes conflict
resolution strategy a required architecture decision before any sync code is written).

---

## Retired v1 Terms

### Session Board

**Status:** Retired in v2.
**v1 definition:** A named, persisted dashboard of typed note tiles used during a live game
session.
**v2 replacement:** The Session Board concept is subsumed by Scenes and Widgets. The Command
Center scene replaces the Session Board as the DM's primary session-time surface. Individual
tile types become Widget types on scenes. Any v1 reference to "Session Board" should be
understood as "Scene" in v2 planning documents.
