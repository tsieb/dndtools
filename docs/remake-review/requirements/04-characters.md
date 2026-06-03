## CHAR - Character Suite

Capability tree:

- Character creation and drafts: `CHAR-001`, `CHAR-002`, `CHAR-013`
- Ownership and permission grants: `CHAR-003`, `CHAR-010`
- Collaboration and DM edits: `CHAR-004`, `CHAR-005`, `CHAR-014`
- Widget data exposure: `CHAR-006`
- Combat, resources, and advancement: `CHAR-007`, `CHAR-008`, `CHAR-009`
- Party and player records: `CHAR-011`, `CHAR-012`, `CHAR-015`, `CHAR-016`

### CHAR-001
**Statement:** The DM shall be able to quick-create an NPC, monster, or sidekick character with simplified stat fields, combat fields, visibility defaults, and widget-bindable data.
**Source:** Vision "DM quick-create"; Feature Inventory I10.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given the DM creates an NPC with name, AC, HP, and attacks, when saved, then a character object exists with widget bindings for combat state.
- Given visibility is omitted, when the NPC is created, then DM-only fields are not included in player character queries.

### CHAR-002
**Statement:** A player with a character draft ownership assignment shall be able to create a PC through a guided structured flow with rules, options, validation, and resumable progress.
**Source:** Vision "Player structured creation"; Architecture Contract 3 Character capability sets.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a player owns a character draft, when they complete required creation steps, then validation passes and the character becomes usable in session widgets.
- Given the player closes the app mid-flow, when they reopen the character, then completed steps and unresolved validation issues are restored.
- Given the draft has not been finalized, when another player requests it without a grant, then no draft fields are returned.
- Given the draft is created, when inspected by id, then it is a pre-finalization character entity with draft state rather than an unrelated permission-grant entity.

### CHAR-003
**Statement:** The DM shall be able to assign exactly one `owner` capability set to a player for a character while retaining full DM administrative rights.
**Source:** Vision "Ownership"; Architecture Contract 3 consistency requirements.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a character has no owner, when the DM grants `owner` to a player, then the player receives owner-inherited permissions.
- Given a character already has an owner, when the DM grants `owner` to a second player, then the command is rejected unless ownership transfer semantics are explicitly invoked.

### CHAR-004
**Statement:** The DM and a character owner shall be able to collaborate on a character at the same time, with accepted operations merged by field or surfaced as conflicts for same-path edits.
**Source:** Vision "Collaborative mode"; Architecture Contract 2 Conflict Model.
**Priority:** Should-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given the DM edits a DM-only note field while the owner edits backstory, when sync reconciles, then both changes persist.
- Given both edit the same scalar field concurrently, when sync reconciles, then a conflict record is created for DM resolution.

### CHAR-005
**Statement:** The DM shall be able to edit any character field through validated commands, with DM edits visibly attributed in history without creating a separate hidden override value layer.
**Source:** Architecture Contract 3 DM Authority; Architecture Contract research conclusion retiring separate override layer.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given the DM changes a player's character HP, when the command is accepted, then the character revision records DM actor attribution.
- Given a player reads their character, when a DM-only field was edited by the DM, then hidden content remains omitted.
- Given the DM changes a player-visible field on an owned character, when the owner views current character state, then the field is visually flagged as DM-authored without creating a parallel override value.

### CHAR-006
**Statement:** A widget shall be able to bind to a character's structured data exposure API for HP, resources, conditions, spell slots, abilities, skills, equipment, and visible notes.
**Source:** Vision "Data exposure API"; Architecture Contract 4 Widget Data Contract.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a combat widget binds to character HP, when HP changes through a command, then the widget receives updated actor-scoped HP state.
- Given a widget binds to a hidden character field in a player context, when binding resolves, then the hidden field is omitted.

### CHAR-007
**Statement:** A character owner or combat participant shall be able to update combat resources such as HP, temporary HP, conditions, death saves, spell slots, class resources, and concentration during a session.
**Source:** Architecture Contract 3 `owner` and `combat-participant`; Feature Inventory I10.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player has `combat-participant` on a sidekick, when they update HP, then the command is accepted and shared combat widgets refresh.
- Given the same player attempts to change the sidekick's name, when they submit the command, then it is rejected.

### CHAR-008
**Statement:** A character owner shall be able to manage spells, prepared spells, slots, class resources, rest recovery, and expenditure history as structured character state.
**Source:** Feature Inventory I10 spell/resource tracking.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a spellcaster has available slots, when the owner casts a spell, then the appropriate slot/resource state changes and history records the command.
- Given a rest command applies recovery rules, when accepted, then resources reset according to character data and rule configuration.

### CHAR-009
**Statement:** A character owner shall be able to complete level-up or advancement flows using XP or milestone modes with validation before the character revision is finalized.
**Source:** Feature Inventory I10 advancement.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a character is eligible for level-up, when the owner selects class options, then invalid or incomplete choices block finalization.
- Given the DM reviews a level-up, when they approve or edit it, then the resulting revision is attributed and synced.
- Given advancement is in progress offline with cached rules, when the app restarts, then the pending advancement draft and validation state are restored.

### CHAR-010
**Statement:** A player with `backstory-editor` or `owner` shall be able to edit character backstory, personality, relationships, goals, bonds, flaws, history, and player notes without gaining access to DM-only fields.
**Source:** Architecture Contract 3 Character capability sets.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player has `backstory-editor`, when they edit a relationship section, then the command is accepted.
- Given the same player requests `dmNotes`, when the character query resolves, then `dmNotes` is absent.

### CHAR-011
**Statement:** The DM and players shall be able to view a party overview with visible HP/status/resource summaries, marching order, and party inventory according to visibility and grants.
**Source:** Feature Inventory I10 party coordination; Vision Collaboration.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given three visible PCs, when the party overview opens, then visible combat summaries and marching order are shown.
- Given one character is not visible to a participant, when the party overview loads, then that character is omitted.

### CHAR-012
**Statement:** A player shall be able to keep a character journal, bookmarks, NPC impressions, personal quests, and session highlights scoped to their character permissions.
**Source:** Feature Inventory I10 player session journal.
**Priority:** Nice-to-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player owns a character, when they add a private journal entry, then the entry is visible to the player and DM according to the permission model.
- Given a player without ownership attempts to edit the journal, when they submit content, then the command is rejected.
- Given a journal entry is `shared` only through the owning character's `owner` grant, when other players, observers, search, graph, widgets, or MCP responses are generated, then the entry content and revealing metadata are absent.

### CHAR-013
**Statement:** The DM shall be able to create, assign, transfer, or revoke a character draft ownership assignment before the character is finalized, with exactly one draft owner at a time.
**Source:** Vision "Ownership"; Architecture Contract 3 Character capability sets; audit remediation.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given the DM creates a PC draft for Player A, when Player A opens character creation, then the draft behaves as an owned draft even before the finalized character entity exists.
- Given the DM transfers the draft to Player B, when Player A next syncs, then Player A can no longer edit the draft and Player B can resume it.

### CHAR-014
**Statement:** Collaborative character views shall distinguish current DM-authored player-visible edits, player-authored edits, and unresolved conflicts without exposing DM-only fields.
**Source:** Vision "Collaborative mode"; Architecture Contract 3 DM Authority.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a DM edits a visible character field during collaboration, when the owner views that field, then the current value shows DM attribution and history access.
- Given a DM edits a `dm-only` field, when the owner views the same character, then no label, placeholder, or history entry reveals the hidden field's existence unless policy explicitly exposes it.

### CHAR-015
**Statement:** Observer character access shall be denied by default, including party overviews, combat detail panels, search results, widgets, and MCP responses, unless a specific visible non-character projection is delivered.
**Source:** Vision Role Model; Architecture Contract 3 Base Roles.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given an observer views shared combat, when character data is requested, then no character sheet, private resource, or owner journal data is returned.
- Given a DM projects a visible stat-block summary to observers, when it renders, then only the explicitly projected summary fields are delivered.

### CHAR-016
**Statement:** Character journal visibility shall be explicit per entry using canonical visibility states and ownership grants, with DM access, owner access, other-player filtering, and cross-surface invalidation enforced by the data layer.
**Source:** Feature Inventory I10 player session journal; Architecture Contract 3 Visibility; audit remediation.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player creates a journal entry, when no visibility is selected, then the entry defaults to `shared` for the owning character's `owner` grant and remains DM-auditable.
- Given the DM changes journal visibility, when sync streams update, then affected player caches, search results, graph edges, and widgets are invalidated before new content is delivered.
- Given a journal entry is `shared` with Player A through a viewer-capable grant, when Player A and Player B query journals, then only Player A receives the entry.
- Given a journal entry is visible only to the owner, when another player, observer, widget, search, graph, or MCP surface requests it, then no title, snippet, id, count, or relationship edge is returned.
