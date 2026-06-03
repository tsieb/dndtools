## CMD - Command Center

Capability tree:

- Home scene: `CMD-001`, `CMD-002`, `CMD-007`
- Active session control: `CMD-003`, `CMD-006`
- Player view control: `CMD-004`
- Widget library and actions: `CMD-005`, `CMD-008`

### CMD-001
**Statement:** The DM shall be able to use the Command Center as the application home Scene, replacing the notes list as the default landing surface.
**Source:** Vision "Application Home: Command Center"; Glossary "Command Center".
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given the DM opens the app after vault selection, when the home route loads, then the Command Center Scene is displayed.
- Given no Command Center has been configured, when the app starts, then a default Command Center Scene is created from a system template.

### CMD-002
**Statement:** The DM shall be able to arrange initiative, dice, timers, audio, quick reference, and prep tools as widgets in the Command Center without fixed layout constraints.
**Source:** Vision Command Center bullets; Feature Inventory I4 and I16.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given the default Command Center, when the DM rearranges dice and combat widgets, then the layout persists across restart.
- Given a mobile profile, when the same Command Center opens, then tools are available through focused panels without changing the underlying Scene state.

### CMD-003
**Statement:** The DM shall be able to embed the active map or map region in the Command Center and change the active map during a session with player-safe projection controls.
**Source:** Vision Command Center "Active map embed"; Maps section.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given two maps in the vault, when the DM changes the active map widget binding, then the Command Center displays the new map and session state records the active map.
- Given the map contains DM-only layers, when the DM projects it to players, then projected views receive only visible layers.

### CMD-004
**Statement:** The DM shall be able to inspect and change each participant's Player View assignment from a Command Center controller.
**Source:** Vision Command Center "Player view controller"; Architecture Contract 4 Player View Rules.
**Priority:** Must-have
**Compatibility:** Offline: degrade | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given three connected players, when the DM assigns different Scene views to two players, then each receives only their assigned view.
- Given a player disconnects, when the DM changes their assignment, then the assignment is saved and delivered on reconnect.

### CMD-005
**Statement:** The DM shall be able to search, preview, and add available widget types from a quick-access widget library in the Command Center.
**Source:** Vision Command Center "quick-access widget library"; Glossary "Widget".
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given installed system widgets, when the DM opens the widget library and filters by "dice", then matching widgets appear with names and required bindings.
- Given a widget is unsupported on the current platform profile, when listed, then it is marked unavailable with the reason and cannot be added.

### CMD-006
**Statement:** The DM shall be able to switch between idle, prep, active, paused, ending, recap, and archived session workflows from the Command Center while preserving application-level Session State.
**Source:** Feature Inventory I16; Glossary "Session State".
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a session is active, when the DM navigates away and returns to the Command Center, then combat, dice history, timers, and active Scene remain intact.
- Given the DM ends a session, when recap starts, then session state is archived or reset according to the end-session workflow.
- Given the DM pauses a session, when remote participants reconnect, then they receive a paused/degraded status and no new live session commands execute until resume.
- Given prep or recap is open without an active live session, when session-owned widgets render, then they show draft or archived state rather than mutating active Session State.

### CMD-007
**Statement:** The DM shall be able to save Command Center configurations as named presets and restore a preset without overwriting unrelated Scenes.
**Source:** Vision "configured home canvas"; Feature Inventory I20 board templates.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given multiple Command Center presets, when the DM applies one, then only the Command Center Scene layout and widget configuration change.
- Given a preset references a deleted widget type, when restored, then the system reports the missing widget and restores all valid widgets.

### CMD-008
**Statement:** The DM shall be able to invoke Command Center actions through the global command palette with the same Processing Core commands used by visible controls.
**Source:** UX Guidelines command palette; Architecture Contract 1 GUI knowledge limits.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: dm-only
**Acceptance criteria:**
- Given the command palette is open, when the DM runs "Start session", then the same session-start command is dispatched as the visible button.
- Given a command is unavailable due to missing permissions or invalid state, when searched, then it is hidden or shown disabled with a non-leaking reason.
