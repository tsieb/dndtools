# Information Architecture

This document is the source of truth for DND Tools information architecture.

## 1. Primary Sections

The application has five primary sections and no additional global-level sections.

1. `Knowledge`
2. `Atlas`
3. `Session`
4. `Campaign`
5. `Settings`

## 2. Content Model

### 2.1 Content Types

| Content type    | Description                                                                                | Primary owner section |
| --------------- | ------------------------------------------------------------------------------------------ | --------------------- |
| `note`          | Markdown knowledge entry and canonical authored document                                   | `Knowledge`           |
| `folder`        | Knowledge hierarchy for note organization                                                  | `Knowledge`           |
| `template`      | Reusable note/session scaffolding                                                          | `Knowledge`           |
| `map`           | Spatial map assets and map hierarchy                                                       | `Atlas`               |
| `session_board` | Live DM board with interactive tiles                                                       | `Session`             |
| `encounter`     | Encounter planning and run-state model                                                     | `Session`             |
| `table`         | Roll/reference table content rendered in markdown and tools                                | `Session`             |
| `handout`       | Player-facing generated artifacts used during session                                      | `Session`             |
| `object_entity` | Structured world entities (npc, location, faction, quest, item, character, timeline event) | `Campaign`            |

### 2.2 Tools

| Tool              | Description                                    | Primary owner section                                                  |
| ----------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `combat_tracker`  | In-session initiative and combat state         | `Session`                                                              |
| `dice_tray`       | Dice rolling utility for session flow          | `Session`                                                              |
| `timeline`        | Campaign chronology and narrative progression  | `Campaign`                                                             |
| `graph`           | Link graph exploration of note relationships   | `Knowledge`                                                            |
| `search`          | Cross-vault query and scoped discovery         | `Knowledge`                                                            |
| `command_palette` | Keyboard-first navigation and action execution | Global utility (entrypoint in shell, content scoped to active section) |

## 3. Section Boundaries And Rationale

### `Knowledge`

`Knowledge` owns authored markdown and taxonomy for notes. It is the default writing and retrieval surface.

Boundary decisions:

- Folder hierarchy belongs here because it is a note-organization primitive.
- Templates belong here because they seed authored knowledge artifacts.
- Search and graph belong here because their primary index target is notes and links.

### `Atlas`

`Atlas` owns spatial representations and map browsing.

Boundary decisions:

- Maps are isolated from generic note browsing to reduce navigation ambiguity between textual and spatial exploration.
- Map-linked notes are contextual links from atlas objects into knowledge content, not atlas-local primary content.

### `Session`

`Session` owns live run-time tools required at the table.

Boundary decisions:

- Session board, combat tracker, encounter builder, dice tray, handouts, and roll tables are session-time interaction surfaces.
- These are task-time utilities, not long-term lore storage.

### `Campaign`

`Campaign` owns world model objects and longitudinal planning.

Boundary decisions:

- Entities, quests, factions, timeline events, and object relationships are campaign-structure concerns.
- Timeline is campaign-level continuity and must not be classified as a session utility.

### `Settings`

`Settings` owns configuration and system administration.

Boundary decisions:

- Diagnostics, vault health, sync, MCP policies, and preferences are utility concerns and stay isolated from task navigation.
- Settings is global utility, not content navigation.

## 4. URL Topology (North-Star)

The canonical section-rooted route hierarchy is:

- `/knowledge/*`
- `/atlas/*`
- `/session/*`
- `/campaign/*`
- `/settings/*`

Legacy non-section routes are migration aliases and must redirect to the canonical section route.

## 5. Non-Negotiable IA Rules

1. Every new page must declare a single owner section from the five primary sections.
2. A feature cannot appear in two sections as first-class navigation destinations.
3. Cross-section links must be contextual links, not duplicate global destinations.
4. Navigation work in later epics must reference this document before implementation.
