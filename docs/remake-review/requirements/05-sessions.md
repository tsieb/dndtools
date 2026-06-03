## SES - Session Tools

Capability tree:

- Session lifecycle: `SES-001`, `SES-010`, `SES-011`
- Combat: `SES-002`, `SES-006`
- Dice and tables: `SES-003`, `SES-008`
- Handouts and tools: `SES-004`, `SES-005`, `SES-007`
- Prep, recap, and calendar continuity: `SES-009`, `SES-012`

### SES-001
**Statement:** The DM shall be able to start, pause, resume, end, archive, and recover a Session with active scene, combat state, dice history, timers, party location, workflow state, and handout log persisted as application-level Session State.
**Source:** Glossary "Session"; Feature Inventory I16.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given no active session, when the DM starts one, then Session State enters `active` and records the active Scene.
- Given the app restarts during an active session, when the vault opens, then session state is restored or an explicit recovery prompt appears.
- Given the DM moves a session to `paused`, `ending`, or `recap`, when remote participants reconnect, then their available commands match the workflow state and no stale active-session commands are accepted.

### SES-002
**Statement:** The DM shall be able to run combat with initiative order, rounds, turns, HP, conditions, concentration, death saves, stat-block previews, and encounter log creation.
**Source:** Feature Inventory I4 and I16.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given combatants are added, when the DM advances turns, then initiative order and round state persist.
- Given a player has `combat-participant` for a character, when they update that character's HP, then shared combat state updates.
- Given two combatants tie initiative, when combat starts, then tie-break behavior is deterministic and recorded in combat state.
- Given a hidden combatant has a stat-block preview, when a player or observer views combat, then hidden stat data and identity are omitted or replaced by a DM-approved placeholder.
- Given combat ends, when encounter log creation runs, then turns, rounds, visible rolls, HP/status changes, and DM notes are persisted according to visibility.

### SES-003
**Statement:** A participant shall be able to roll dice expressions, macros, inline rolls, and rollable tables through shared dice commands with deterministic parsing and session roll history.
**Source:** Feature Inventory I4 dice; MCP dice tools.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a valid expression `2d20kh1+5`, when rolled, then the parser records dice, kept values, modifier, total, actor, and timestamp.
- Given an invalid expression, when submitted, then no roll is recorded and a validation message is returned.
- Given a roll is marked private or DM-only, when player roll history is queried, then the hidden expression, values, total, and reason are omitted.
- Given a roll is shared with selected players or a Player Group, when history syncs, then only those participants receive the roll record.

### SES-004
**Statement:** The DM shall be able to deliver handouts as Scene widgets to selected players or groups with delivery history, visibility enforcement, and optional reveal behavior.
**Source:** Glossary "Handout"; Vision Collaboration.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a handout is `shared` to Player A, when the DM delivers it, then Player A receives a handout widget and Player B does not.
- Given a handout contains a hidden section, when delivered, then the player's payload excludes that section.

### SES-005
**Statement:** A participant with a timer or tool widget `operator` grant shall be able to start, pause, resume, reset, advance, roll, draw, or operate the tool without configuring it.
**Source:** Architecture Contract 3 Timer/Tool capability sets; Vision Command Center.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player has `operator` on a timer widget, when they pause it, then session timer state changes.
- Given the same player attempts to change timer configuration, when they submit the command, then it is rejected.

### SES-006
**Statement:** The DM shall be able to build encounters with combatant selection, challenge guidance, terrain notes, legendary/lair actions, loot, and generated session log links.
**Source:** Feature Inventory I4 encounter builder.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given selected monsters and party level, when the DM builds an encounter, then challenge guidance and combatants are saved with the encounter object.
- Given the encounter is started, when combat begins, then combatants and terrain notes flow into session combat state.

### SES-007
**Statement:** The DM shall be able to create, pin, and use quick-reference panels for visible notes, stat blocks, rules snippets, open threads, and session context.
**Source:** Feature Inventory I4 quick reference; I16 prep workflow.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a note is pinned to quick reference, when the DM changes routes, then the quick reference remains available.
- Given a pinned note is deleted, when quick reference opens, then it shows a missing reference state without crashing.

### SES-008
**Statement:** The DM shall be able to use random tables and contextual generators as session assets, with generated results attributed and optionally appended to session notes.
**Source:** Feature Inventory I4 random generation.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a rollable table, when the DM draws a result, then the roll and selected row are recorded in session history.
- Given the DM appends a generated result to a note, when the write is accepted, then note history records the actor and source.

### SES-009
**Statement:** The DM shall be able to run pre-session prep and post-session recap workflows that gather unresolved threads, recent changes, handout outcomes, combat summaries, and continuity prompts.
**Source:** Feature Inventory I16 prep/recap; MCP recap bundle.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given an upcoming session, when the DM opens prep, then relevant open threads and session assets are gathered from local indexes.
- Given a session ends, when recap runs, then a recap draft can be created without requiring AI services.

### SES-010
**Statement:** Session tools shall expose pending, success, failure, retry, and undo states through a standard async action model for all user-visible durable commands.
**Source:** UX Guidelines Reliability; Defects async mutation timing bugs.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a note append from a session tool fails, when the command returns, then the UI clears pending state and shows retry guidance.
- Given a map/session command supports undo, when undo is invoked, then the command model applies a recorded inverse or restores the committed before state.

### SES-011
**Statement:** Session workflow states shall be defined as `idle`, `prep`, `active`, `paused`, `ending`, `recap`, and `archived`, with explicit allowed transitions and command availability for each state.
**Source:** Glossary "Session"; Command Center requirements; audit remediation.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given the session is `idle`, when a player submits an active-combat command from stale UI, then the command is rejected with a non-leaking invalid-state result.
- Given the session is `recap`, when the DM creates recap notes, then archived combat, dice, handout, and calendar references are read-only inputs unless a separate edit command is accepted.

### SES-012
**Statement:** The DM shall be able to maintain campaign calendar and custom-time state, link dates to notes, sessions, maps, events, and handouts, and include calendar context in prep and recap workflows.
**Source:** Feature Inventory I3 custom world calendar; MCP calendar tools; audit remediation.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a campaign uses a custom calendar, when the DM records a session date, then the date is stored in campaign calendar terms and can also be rendered in a stable canonical format.
- Given prep or recap gathers continuity prompts, when calendar events and moon/reference panels are relevant, then visible source links are included without requiring AI.
