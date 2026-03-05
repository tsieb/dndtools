# Initiative 16 — Session-Time UX Reimagined

## Status: PLANNED

**Outcome:** Running a live session with DND Tools is fast, tactile, and never breaks
immersion. The DM can roll dice, track initiative, reference a stat block, and deliver
a handout without navigating away from the active scene. The interface shifts posture
when a session is active — information prevalence changes to surface what matters right
now, not what matters during prep. The functional foundation of I4 (Session-Time
Command Center) is reimagined through the lens of the research principles: information
prevalence, progressive disclosure, session-scoped mental models, and cross-platform
input support.

**Depends on:** I4 (completed — combat tracker, session board, encounter builder, and
dice tray exist functionally), I13 (navigation model), I14 (adaptive shell), I15
(design system components)

**Why this is distinct from I4:** I4 delivered the functional capability — the combat
tracker works, the session board exists, dice rolls work, the encounter builder exists.
What I4 did not do is integrate these tools into a coherent session-time experience.
They are currently scattered as independent navigation items at the same level as
worldbuilding tools. During a live session, the DM faces a flat list of navigation
options with no concept of "I'm in session mode now — show me what I need." The
information prevalence is wrong for live play: dice is buried in the sidebar, the combat
tracker resets when you navigate away, the session board has no sense of "active scene,"
and the connection between the session board and the rest of the vault is navigational,
not contextual.

**Root-cause diagnosis:**

Dice Tray is accessible from three inconsistent locations (sidebar header button, sidebar
nav link, TopBar button). The combat tracker state is local to the `/combat` route and
resets on navigation. The session board is an independent route at `/session-board` with
no persistent connection to the current combat state or initiative order. There is no
concept of a "session" as an application-level state — the app has no notion of whether
the DM is currently running a game or preparing. Every session tool is independently
accessed, independently forgotten, and independently closed. The DM must mentally
orchestrate what the application does not.

---

## Epic 16.1 — Session Mode as Application-Level State

**Goal:** The application knows whether a session is active. When active, the layout
and information prevalence shift to serve live-play needs. Entering and exiting session
mode are intentional, confirmed transitions.

**Stories:**

- **S16.1.1 — Session mode state machine**
  Implement `src/lib/state/session-mode.svelte.ts` as the authoritative session state.
  States: `idle` (no session active, prep/worldbuilding mode) and `active` (session
  running). In `active` state, the store holds: `sessionBoardId` (the active board),
  `startedAt` (timestamp), `sceneId` (current scene within the board), and
  `combatActive` (boolean). State persists to `.vault/session-state.json` via the
  storage adapter so that accidental app restarts during a session resume correctly.
  The session state store is imported by the layout, the navigation components, and
  the dice/combat services.

- **S16.1.2 — Start Session and End Session flows**
  "Start Session" is a prominent call-to-action in the Session section when `idle`. On
  trigger, a Dialog asks: "Continue [last session board name]?" or "Start new session"
  with a session name input. After confirmation, the state transitions to `active`, the
  layout shifts (see S16.1.3), and the active session board opens. "End Session" is
  accessible from the Session section header and from the global nav (an "End Session"
  button in the Session nav item when active). On trigger, a confirmation Dialog prompts:
  "End this session? You'll be asked to capture key developments." After confirmation,
  a session summary prompt appears (see I17 for the empty-state / prompt UX), then
  state returns to `idle`.

- **S16.1.3 — Session-active layout shift**
  When session mode is `active`, the primary section navigation highlights the Session
  section as "active" with a distinct pulse indicator (subtle animated ring on the icon,
  respecting prefers-reduced-motion). The Session section's local panel content changes
  to session-time view: active combat status (if in combat), current scene name, elapsed
  session time, quick dice buttons. On Expanded layout, the right detail panel
  auto-opens with the session quick-reference content when transitioning to active mode.
  On Compact layout, a persistent session status bar (16px tall, accent background) runs
  above the bottom navigation bar showing the session elapsed time.

- **S16.1.4 — Session persistence across navigation**
  All session-time state — initiative order, HP values, active scene, session timer —
  persists across route navigation and app restarts. Navigating to `/knowledge/notes`
  to look up a lore note during a session does not reset combat. Returning to the Session
  section restores the exact combat state. Persistence is implemented by writing session
  state to the storage adapter on every meaningful state change (turn advance, HP
  change, scene switch), not only on session end.

---

## Epic 16.2 — Dice: Always-Accessible, Session-Integrated

**Goal:** Dice is never more than one action away during a session. Roll history is
persistent and session-scoped. Dice rolls can be embedded in notes and triggered inline
during live reading.

**Stories:**

- **S16.2.1 — Persistent dice bar in session mode**
  When session mode is `active`, a persistent dice bar appears in the Session local
  panel and, on Expanded layout, as a compact strip in the right detail panel. The bar
  shows: d4, d6, d8, d10, d12, d20, d100 as icon buttons (each displaying the die
  face with the number, using a custom die SVG set from the TTRPG icon vocabulary).
  Clicking a die rolls it with a visible result. A "Custom" button opens the full
  expression input from the current Dice Tray. The dice bar is always visible during
  session — it does not require navigation to the Dice Tray overlay.

- **S16.2.2 — Session roll history panel**
  The right detail panel in session mode shows a scrollable roll history for the
  current session: each entry shows the expression, result (with individual dice
  values expanded on hover/tap), timestamp, and an optional label (set by clicking the
  entry to rename it: "Stealth check", "Dragon attack"). Results persist for the session
  duration and are cleared when the session ends. A natural 20 and natural 1 are visually
  flagged in the history. The roll log can be exported as part of the session summary.

- **S16.2.3 — Inline dice buttons in note viewer**
  Extend the markdown rendering pipeline to detect `[[roll:EXPRESSION]]` syntax in
  notes, rendering it as a clickable button showing the expression (e.g. "1d20+5").
  Clicking the button rolls the expression and shows the result inline in a result chip
  that replaces the button temporarily, then fades back to the button. This requires
  changes to the unified/remark/rehype pipeline in `src/lib/markdown/`: add a custom
  remark plugin that transforms `[[roll:...]]` nodes into a custom HTML element, and
  a client-side component (`RollButton.svelte`) that hydrates the element. The roll
  result is also added to the session roll history if a session is active.

- **S16.2.4 — Random tables as first-class session assets**
  Add a Tables tab in the Session section (visible in both idle and active mode). The
  Tables view lists all markdown tables in the vault that have been tagged as rollable
  (via frontmatter `rollable: true` or the table heading matching a known category:
  Encounters, Loot, Names, Weather, Events). Each table entry shows: table name, source
  note link, row count, and a prominent "Roll" button. Clicking Roll picks a random row
  (uniform distribution or weighted if weights are specified), displays the result with
  animation, and logs it to session history. Tables can be pinned to the session quick
  panel.

- **S16.2.5 — Dice tray consolidation**
  Remove the Dice Tray from the sidebar header action buttons and from the sidebar nav
  link in the Knowledge section. The Dice Tray overlay (Ctrl+D shortcut) is retained
  as the advanced expression-rolling surface, but its entry points are now: the keyboard
  shortcut, the "Custom" button in the session dice bar, and the Dice icon in the
  Session section nav (when not in active session). There is exactly one conceptual
  location for dice — the Session section — with one keyboard shortcut for quick access
  from anywhere.

---

## Epic 16.3 — Combat Tracker: Persistent, Fast, and Touch-Ready

**Goal:** Combat state persists for the entire session regardless of navigation. The
tracker is usable with one hand on a tablet, is keyboard-driven on desktop, and connects
directly to stat blocks for reference without leaving the combat view.

**Stories:**

- **S16.3.1 — Combat state persistence and session integration**
  Move combat tracker state from route-local to the session state store. Combat is a
  sub-state of the active session: `session.combatActive` (boolean),
  `session.combatants` (array of combatant objects), `session.currentRound`,
  `session.activeCombatantIndex`. State is written to the storage adapter on every turn
  change. Navigating away from the combat route and returning restores the exact state.
  The Session local nav panel shows the active combatant name and round number when
  combat is active, regardless of the current route.

- **S16.3.2 — Combat tracker UX redesign**
  Redesign the combat route as a full-height panel layout: initiative order list on the
  left (or top on narrow viewports), combatant detail on the right (HP controls,
  conditions, linked stat block). Each combatant row shows: (1) turn indicator (active
  combatant highlighted with accent border), (2) initiative value, (3) combatant name
  with type indicator (PC icon, NPC icon, creature icon), (4) current HP as a fraction
  with a compact health bar, (5) condition badges. The "Next Turn" button is large,
  prominently placed, and keyboard-shortcuttable (`n` when combat tracker is focused).

- **S16.3.3 — One-handed HP adjustment on touch**
  HP +/- controls use large tap targets (minimum 44px). A quick-adjust popover appears
  on tap-hold of a combatant's HP display, showing: Damage, Heal, and Temp HP inputs
  with a numeric pad. Large combatant rows accommodate touch without precision required.
  All HP changes are undoable — a circular undo button appears for 5 seconds after
  any HP change. Keyboard: selected combatant HP adjustable with `d` (damage input)
  and `h` (heal input) shortcuts.

- **S16.3.4 — Stat block quick-reference from combat tracker**
  Each combatant linked to a vault stat block object shows a reference icon. Tapping it
  opens the stat block in the right detail panel (Expanded layout) or in a bottom sheet
  (Compact/Medium layout) without navigating away from combat. The stat block renders
  the full I15 stat block visual component. Actions and special abilities can be
  collapsed individually to focus on what's needed mid-combat.

- **S16.3.5 — Conditions and duration tracking**
  Conditions (Blinded, Charmed, Frightened, Grappled, Incapacitated, Invisible,
  Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious) are stored
  per combatant as a set. Duration in rounds can be set per condition. At the start of
  each round, conditions with duration > 0 decrement; conditions that reach 0 show an
  expiry notification. Conditions are displayed as small badge icons on the combatant
  row, with a legend popover on hover/tap.

---

## Epic 16.4 — Session Board: Mission Control Redesign

**Goal:** The session board is the DM's mission control surface — the first thing opened
at the start of a session and the last thing closed at the end. It shows the active
scene, relevant entities, open threads, and quick-reference notes in a layout that
makes the shape of the current session immediately clear.

**Stories:**

- **S16.4.1 — Session board layout redesign**
  Redesign the session board from a uniform card grid into a zoned layout with
  intentional hierarchy:
  - **Active Scene Zone** (top, 40%): the current scene description (pulled from a linked
    note or inline text), a scene image if available, and the scene's key NPCs/locations
    as entity chips.
  - **Reference Zone** (middle left, 30%): pinned notes displayed as compact reference
    cards with live content preview (first 3–5 lines, rendered markdown).
  - **Status Zone** (middle right, 30%): open quests/threads relevant to this session,
    world clock / session timer, environmental notes (weather, time of day).
  - **Quick-action footer**: handout delivery button, scene transition button, end
    session button.
    This layout is the default; power users can still customise tile positions.

- **S16.4.2 — Scene management within sessions**
  Add a first-class Scene concept. A session has scenes (e.g., "The Tavern Confrontation",
  "Chasing Goras through the Market", "Final Boss Chamber"). Scenes can be pre-written
  during prep or created on the fly. Switching scenes updates the Active Scene Zone and
  can auto-pin the scene's relevant notes. A scene timeline strip below the Active Scene
  Zone shows all scenes in order, with the current scene highlighted. Scene history is
  navigable for mid-session reference.

- **S16.4.3 — Handout delivery as a first-class action**
  "Deliver handout to players" is accessible directly from the session board with a
  single button. The handout picker shows: handout notes (tagged `handout` or `player-
facing`), images from the vault, map regions. After selection, a "Player Preview"
  dialog shows exactly what the player will see. Confirming pushes the handout to the
  Player Screen view (the existing `/player` route). The handout appears with an
  animation in Player Screen mode. Handout delivery history for the session is recorded
  in the session board.

- **S16.4.4 — Session board prep mode vs session mode**
  The session board behaves differently depending on session mode state. In `idle` mode,
  the board is editable: add/remove tiles, write scene descriptions, link notes, add
  expected NPCs. In `active` mode, the board is a live control surface: scenes advance
  on click, entity chips link to notes for quick reference. The visual treatment shifts:
  idle mode shows editing affordances (drag handles, add tile buttons); active mode
  shows larger, bolder text optimised for reading at a distance, and removes editing
  clutter.

---

## Epic 16.5 — Session Prep and Recap Workflow

**Goal:** The transition from prep to session is smooth and context-preserving. The
transition from session to recap is prompted, quick, and produces useful output for
future sessions.

**Stories:**

- **S16.5.1 — Pre-session prep view**
  In the Session section while in `idle` mode, show a "Session Prep" view below the
  session board selector. This view uses the existing MCP `get_session_prep_bundle`
  data and presents it visually:
  - **Open threads** (quests and NPCs expected in the next session) as clickable cards.
  - **Notes to review** (recently modified notes linked to open threads) as a reading
    list.
  - **Last session summary** (one-paragraph auto-generated recap from the previous
    session's roll log and events, generated via MCP bundle).
  - **Handouts to deliver** (vault notes tagged `handout` not yet delivered).
    The prep view reduces the DM's pre-session cognitive load by surfacing what the app
    already knows about the impending session.

- **S16.5.2 — End-of-session capture prompt**
  When "End Session" is confirmed, a structured capture Dialog appears before returning
  to `idle` mode. The Dialog presents: "What happened this session?" (free text, auto-
  populated with the session roll log summary if available), "What changed?" (tag-based
  entry: NPCs encountered, locations visited, quests advanced), "What to follow up?"
  (open items for next session). Submitting this creates a Session Log note in the vault
  (`/sessions/session-{date}.md`) with the captured information, timestamps, and a link
  to the session board. This note feeds future recap generation.

- **S16.5.3 — Session continuity check integration**
  After the session capture, run the MCP `get_continuity_check_bundle` tool and present
  a continuity summary: "3 NPCs appeared this session without vault notes — create them
  now?" with quick-create buttons for each. "2 locations visited are not on any map —
  add them?" This closes the loop between live session improvisation and vault
  completeness, directly from the session end flow rather than discovered weeks later.
