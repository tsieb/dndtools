# DND Tools 0.2.0 — Vision Brief

*Formalized from design notes. This is the canonical statement of intent for the remake.*

---

## Paradigm Shift

Version 0.1 was a **document-editor application that had session tools bolted on.**
Version 0.2 is a **canvas-first command platform for tabletop RPG play** where content, tools,
and AI all compose into a single spatial workspace.

The document editor still exists. It is no longer the home.

---

## The Canvas (Working Name: "Scene")

> A better name is still needed. Candidates: Scene, Stage, Workspace, Board, Stage, Playfield.
> The name must communicate "spatial, composable, live" — not "document" or "board" (too generic).

The canvas is the primary UI primitive. Everything else — notes, stats, maps, dice, characters,
timers, audio controls — exists as a **widget** that can be placed, resized, linked, and shown or
hidden on a canvas. Canvases are the DM's working surface and the player's view.

Key canvas properties:
- Sections can contain notes, stats blocks, embeds, maps, character data, or custom widgets
- Widgets have a defined data contract so they can read/write shared state
- Canvases can be saved as templates and recalled instantly
- Canvases are the unit of "player view" — the DM decides what is on a player's canvas

---

## Application Home: Command Center

The **Command Center** is the application home screen. It replaces the old notes-list landing page.
It is a special canvas configured for active session management:
- DM tools panel (initiative, dice, timers, audio, reference)
- Active map embed
- Player view controller (what each player sees)
- Quick-access widget library

The DM has a deeply flexible arrangement of tools. The Command Center is not a fixed layout — it
is the DM's configured home canvas.

---

## Role Model

Three base roles define the permission floor — the minimum a user can do:

| Role | Default permissions |
|---|---|
| **DM** | Full access to vault, all content, all characters, all canvases. Can override any field on any entity. Controls session state and player views. |
| **Player** | Read access to their own character and DM-exposed content only. No vault access by default. |
| **Observer** | Read-only view of shared canvases and maps. No character data. |

Roles are the floor, not the ceiling. **Permission grants** extend specific players beyond their
role's defaults for specific entities, sections, or capabilities.

### Permission Grants (Capability Sets)

The DM can assign named **capability sets** to specific players on specific entities. A capability
set is a predefined group of allowed operations scoped to a part of an entity.

**Why capability sets, not raw field lists:** Granting individual fields would create an
unmanageable configuration surface. Capability sets group related operations into meaningful units
that match real workflows ("this player manages combat for this NPC").

**How it works:**
- Each entity type (Character, Note, Canvas widget, Timer, etc.) defines the capability sets
  available for it
- The DM assigns a capability set to a player on a specific entity instance
- The data layer enforces it — the player cannot write outside their granted capability set
  regardless of UI

**Character capability sets (example):**

| Capability set | Writable fields |
|---|---|
| `owner` | All fields. Full control. Assigned to the player who plays this character. |
| `combat-participant` | HP, conditions, spell slots, action resources, death saves. Not name, stats, backstory, appearance. |
| `backstory-editor` | Backstory sections, notes, relationships, history. Not stats, name, or combat fields. |
| `viewer` | No writes. Explicit read grant beyond default visibility. |

**Widget / canvas capability sets (example):**

| Capability set | Effect |
|---|---|
| `manager` | Player can configure, move, and interact with the widget fully |
| `operator` | Player can interact with the widget (start/stop a timer, roll a table) but not configure it |
| `viewer` | Player can see the widget; it is on their canvas |

**Note / content section capability sets (example):**

| Capability set | Effect |
|---|---|
| `section-editor` | Player can edit a specific named section of a note |
| `contributor` | Player can append to the note but not edit existing content |
| `viewer` | Read access to this note (beyond DM-pushed visibility) |

### Ownership

- **Character ownership** is a first-class concept: the player who "owns" a character has the
  `owner` capability set on it by default
- A single character can have one owner and multiple additional grants (e.g., DM grants another
  player `combat-participant` on an NPC sidekick)
- The DM always retains override rights on any entity regardless of grants

### Visibility vs. Permission

These are distinct:
- **Visibility** — whether content appears in a player's view at all (DM-controlled, affects all
  players the same way)
- **Permission grant** — whether a specific player can write to or interact with specific content
  (player-specific, additive on top of role)

DM visibility controls are a cross-cutting concern — any piece of content can be marked hidden,
player-visible, or exposed. This must be enforced at the data layer, not just the UI.

---

## Primary Content Sources

Content originates from three sources, not just local markdown:

1. **Local vault** — same as v1, markdown files on disk (default)
2. **Obsidian vault sync** — read and write to an existing Obsidian vault directory; respect
   Obsidian frontmatter and wikilink conventions
3. **Google Docs sync** — pull documents from Drive into the content graph as first-class notes;
   bi-directional sync for campaign notes

The graph engine must be capable of traversing all three sources uniformly.

---

## Architecture Priorities (Non-Negotiable)

These must be baked into the initial architecture, not retrofitted:

### 1. Cloud Sync & Multi-User
- Cloud storage is a key feature, not an afterthought
- Local-first by default: app works fully offline; sync is additive
- Multi-user collaboration is a prime feature: concurrent session participation, real-time or
  near-real-time state sharing between DM and players
- Conflict resolution strategy must be designed before any sync code is written

### 2. Decoupled Processing / Display
- Business logic, data processing, and state management must be completely independent of
  the GUI layer
- The same processing core must work identically on desktop, mobile, and web
- GUI is a skin: desktop gets its layout, mobile gets its layout, tablet gets its layout — all
  driven by the same state and logic
- This is not "responsive design" — it is distinct GUI experiences per platform profile

### 3. Performance as a First-Class Constraint
- Performance budgets defined before features, not after
- Canvas rendering, map layer compositing, and graph traversal each have explicit targets
- Algorithmic approaches (not AI) should be the primary engine for suggestions, graph
  intelligence, relationship scoring, and content recommendations
- AI supplements algorithms; algorithms are not replaced by AI

---

## Maps (Primary Feature)

Maps are promoted to a primary feature alongside canvas and characters.

**Creation:**
- Custom map builder with drawing/painting tools
- Procedural generation systems (terrain, settlements, dungeons)
- Import: image files, SVG, external formats

**Layer system (first-class concern):**
- Named layers with independent visibility and opacity
- Layer types: heightmap, political, climate, roads/transport, waterways, watersheds, fog of war,
  POIs, DM-only annotations, player-visible overlay
- Layers are taggable and queryable (e.g., "show all POI layers for region: northern coast")

**Nesting:**
- Maps embed inside other maps at configurable scale
- Smooth scroll-zoom transitions between nested maps (world → region → city → building)
- Each nested map is its own full map with its own layers

**Canvas integration:**
- Any map or map region is embeddable as a widget on any canvas

---

## Character & PC Suite

Character management is promoted to a full-featured suite:

- **DM quick-create:** simplified stat blocks and NPC sheets
- **Player structured creation:** guided character creation with rules, options, level-up flow
- **Collaborative mode:** DM and player can work on a character together; DM overrides are
  visually distinct and flagged
- **Data exposure API:** every character has a structured interface that widgets (HP tracker,
  spell slots, conditions, etc.) can bind to
- **Embed system:** character data panels are embeddable on any canvas as widgets

---

## MCP & AI

MCP is a capable tool layer, not the architecture backbone:

- Baseline tools ship by default (vault read, note search, character query, dice)
- MCP can be **completely disabled** with no loss of core functionality
- AI agents (web or local) are attachable via a simple interface — not bespoke integrations
- AI's role is explicitly defined as: creative text assistance, narrative suggestions, named
  entity extraction. It does not own graph intelligence or relationship scoring — algorithms do.
- Formatting and output structure from AI is streamlined and consistent

---

## Audio & Atmosphere

Important but design-incomplete. Key requirements:

- Scene-linked audio: each canvas or map can have associated ambient audio
- Playback controls available as a widget on Command Center canvas
- Audio state (what's playing) is part of session state — syncs to collaborators
- Specific design needs further thought before requirements are finalized

---

## Collaboration (Prime Features)

- Real-time or near-real-time session participation (DM + players)
- Player canvas is a live view controlled by DM
- Shared combat state (initiative order, HP) visible to all participants
- Handout delivery: DM pushes images/notes to player canvases
- Permission model: per-content, per-role visibility flags

---

## Explicitly Out of Scope

- Community content marketplace
- Plugin/extension ecosystem
- Third-party compendium integration
- i18n / localization
- Public wiki or shared campaign directory

---

## CI/CD Philosophy

v1 CI became over-engineered relative to actual quality impact. v2 targets:

- Small number of high-value gates (lint, type check, unit, smoke)
- Fast feedback loop (< 3 min for smoke path)
- No gate that is not actively blocking real defects
- Quality measured by user-relevant outcomes, not metric counts
- Sustainable: every gate must have an owner and a clear reason for existing

---

## Summary of Change vs. v1

| Dimension | v1 | v2 |
|---|---|---|
| Primary paradigm | Document editor | Canvas workspace |
| App home | Notes list | Command Center |
| Content sources | Local vault only | Local + Obsidian + Google Docs |
| Multi-user | Deferred | Core architecture |
| Cloud sync | Deferred | Core architecture |
| Maps | Advanced secondary | Primary feature |
| Characters | Session tool | Full suite |
| MCP | Architecture backbone | Optional capable tool |
| AI | Deeply integrated | Supplementary, streamlined |
| Platform model | Desktop-primary | Decoupled processing, per-platform GUI |
| Graph engine | Internal only | Obsidian + local vault traversal |
| Algorithms | Sparse | Emphasized, AI supplements not replaces |
| Community/plugins | Planned | Removed from scope |
| CI/CD | Complex, thorough | Lean, high-value gates only |
