# UX Requirements — Command Center / DM Dashboard

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read `00-overview-and-principles.md` first — it defines the shared principles, the parameter rubric, the requirement-ID scheme, the platform profiles, and the design tokens this document builds on.
>
> **Status:** Draft v1
> **Functional requirement coverage:** `CMD-001..008`
> **Owner surface(s):** `/` (home route), Command Center Scene, Player-View Controller panel, widget library drawer

---

## 1. Scope

- **Covers:** The Command Center Scene that serves as the application home for the DM role. Includes the default layout and first-run/empty state, the glanceable status bar that surfaces initiative position, connected players, and audio state, the Player-View Controller (per-player and per-group assignment, preview, and handout push), the widget library quick-launch drawer, named layout presets, the "return home" affordance from any surface, and layout recovery after crashes or sync conflicts. Also covers how the same surface degrades to Tablet and Mobile profiles.
- **Does NOT cover:** The generic canvas drag-resize-lock mechanics owned by `04-canvas-scene-widgets.md`; combat tracker internals (`08-sessions-live-play.md`); the permission data model (`11-collaboration-permissions.md`); audio playback controls beyond their widget surface (`13-audio-atmosphere.md`); or the visual token definitions (`01-visual-design-system.md`).
- **Related functional requirements:** `../requirements/02-command-center.md`
  - `CMD-001` — Command Center is the DM home Scene; default template on first run
  - `CMD-002` — DM can arrange initiative, dice, timers, audio, reference widgets freely
  - `CMD-003` — Active map embed with player-safe projection controls
  - `CMD-004` — Per-participant Player View assignment from the Command Center
  - `CMD-005` — Widget library search, preview, and add
  - `CMD-006` — Session workflow transitions (idle → prep → active → paused → ending → recap → archived)
  - `CMD-007` — Named layout presets, save and restore
  - `CMD-008` — Command palette parity for all visible controls
- **Related UX docs:**
  - `01-visual-design-system.md` — tokens, density modes, motion system
  - `02-navigation-and-platform-profiles.md` — global nav, "return home" pattern
  - `03-accessibility.md` — global a11y baseline
  - `04-canvas-scene-widgets.md` — canvas drag/resize/lock mechanics consumed here
  - `08-sessions-live-play.md` — combat tracker widget referenced as an embedded panel
  - `11-collaboration-permissions.md` — visibility vs. permission distinction enforced by player-view controller
  - `13-audio-atmosphere.md` — audio widget that surfaces in the default layout

---

## 2. UX goals for this surface

The Command Center is a **live operations console**, not a dashboard. The DM is at a table, often standing or leaning, managing conversation, rules, improvisation, and technical controls simultaneously. Every design decision must be evaluated against this context: a fully occupied human who needs information instantly and controls in one or two physical actions.

| Parameter | Goal for this surface |
|---|---|
| Visual appeal | Feels like a premium, purposeful control room — atmospheric enough to reinforce the fantasy genre, never decorative at the expense of readability. Status indicators use the semantic color tokens (not arbitrary hues). Density and layout project competence and calm, not anxiety. |
| Information scent | Initiative order, who is connected, what players currently see, and what is playing are all deducible from the default layout without opening any panel. Labels use DM mental-model language ("Active players", "Current turn", "Players see:"), not internal taxonomy. |
| Navigability | The Command Center is always reachable in one action (global Home button / `G H` shortcut) from any surface. No destination within it requires more than two taps from the Command Center itself. |
| Intuition / learnability | A first-run DM with zero configuration sees a useful, populated default layout — not a blank canvas or a setup wizard. Empty-state widgets teach by example with placeholder data and labeled affordances. |
| Accessibility | All status regions are live regions or polled at an interval the DM can suppress. All panels are keyboard-operable. Touch targets meet ≥44×44 CSS px on Tablet and Mobile. The Player-View Controller never exposes hidden content through focus, tooltip, or error text. |
| Adaptability (platform profiles) | Desktop: full multi-panel layout, persistent sidebar, keyboard shortcuts throughout. Tablet: landscape split-view, portrait stacked panels, touch-first targets. Mobile: single-panel focus mode with a bottom drawer for secondary panels; the same Processing Core commands execute identically. |
| Effective emphasis (visual hierarchy) | One primary action per region: the top-status strip for session state, the center zone for the active map, the right rail for initiative + player controls, and the bottom strip for audio. No two regions compete for first attention. |
| Feedback & responsiveness | Acknowledgment of player-view push within 100 ms (optimistic UI + confirmation toast). Session state transitions (pause, end, resume) show a modal confirmation and then a brief status banner. Layout save emits a silent toast. |
| Error prevention & recovery | "Push to players" requires explicit confirmation showing exactly what will be visible. Hidden content is never previewed in a player-facing surface. Layout presets can be restored after accidental overwrite via undo (30 s window). |
| Consistency | All widget chrome, panel headers, and icon affordances follow the shared component anatomy from `01-visual-design-system.md`. The Command Center does not invent new interaction patterns — it assembles existing ones. |

---

## 3. Researched best practices

**3.1 Control rooms and mission-critical UIs — the "glance contract"**

Industrial and broadcast control-room research (referenced in NASA's Human Integration Design Handbook and the ISS software human factors standards) establishes a "glance contract": operators who cannot afford to focus must extract key state within 1–2 seconds from their peripheral position [1]. Stream Deck's scene-switching interface and OBS Studio's preview/program split both apply this principle to consumer software — the operator confirms live state by looking at dedicated, spatially stable indicators, not by reading menus [2]. *Implication: The Command Center must dedicate a fixed-height, always-visible status strip to session state (turn, timer, connected count, audio) that never scrolls or collapses.*

**3.2 Dashboard glanceability — NN/g research**

Nielsen Norman Group's dashboard usability research identifies the three most common failures as: (a) requiring interaction to see current state, (b) inconsistent visual hierarchy that makes reading order ambiguous, and (c) defaulting to empty states that offer no orientation [3]. Grafana's observable dashboards succeed because they render real data immediately on load, support high information density through consistent small multiples, and reserve color for semantic alerts only [4]. *Implication: The default Command Center must ship pre-populated with system-default widgets, not a blank canvas. Color must encode state (active/paused/error), not decoration.*

**3.3 VTT player-view control — how existing tools solve it**

Foundry VTT's scene navigation exposes a sidebar showing every active scene; the GM clicks "Activate" to push a scene to all players at once, with a clear split between GM view and what players receive [5]. Roll20 uses a "Players" popout in the map layer that shows each player's token position, but the player-view state (which map they see) is buried in the settings panel, costing the GM 3–4 clicks during live play [6]. Owlbear Rodeo addresses this with a persistent "Sharing" bar that shows each player's current view and a one-click "Show everyone my view" affordance [7]. Alchemy RPG's "Director" mode shows a live thumbnail of each player's current viewport, which is the clearest preview affordance observed [8]. *Implication: Player-view control must be in the primary region, not a settings panel. Each player must show their assigned view name and a preview affordance. Changing the assignment requires ≤2 taps.*

**3.4 Operations console layout — Stream Deck and broadcast paradigms**

Stream Deck's desktop app organizes a 15-button grid into "profiles" per application context, switchable in one click [9]. Streamers report discovering that they use fewer than 8 buttons per scene but want all of them visible simultaneously to avoid cognitive load from searching. *Implication: The Command Center widget grid must favor spatial stability — the same widget is always in the same place — over automatic density compression. Layout presets are the unit of context switch, not dynamic reordering.*

**3.5 Kanka and Notion as "DM home" reference points**

Kanka's campaign dashboard shows recent activity, pinned entities, and quick-create shortcuts as a composable home [10]. Notion's home page ("Home") in 2024 introduced a recent-items and pinned-pages layout [11]. Both suffer from the same failure: the "home" is a meta-navigation surface, not an operational one. During live play, a DM has no use for "recently edited notes" — they need turn order, HP bars, and player-view state. *Implication: The Command Center must be an operations console first; content navigation is accessible from within it (via the global sidebar) but must not occupy prime visual real estate on the default layout.*

**3.6 Handout delivery UX — preventing accidental reveal**

The risk of accidentally pushing DM-only content to players is identified in multiple VTT incident reports and community threads (Foundry, Roll20 subreddits). OBS Studio's preview/program split is the canonical solution: two displays, one that is "safe" (private) and one that is "live" (public), with an explicit transition action [2]. *Implication: The Player-View Controller must provide a PREVIEW affordance (DM-only) and a PUSH action with a confirmation dialog that names the content and the recipients explicitly.*

---

## 4. Reference implementations (exemplars)

| Product | What they do well (specific) | Principle / why it works | Borrow / Avoid | Link |
|---|---|---|---|---|
| **Foundry VTT** | Scene sidebar: one-click "Activate" pushes a scene to all players simultaneously; the GM view and player view are visually distinct in the navigation panel | Explicit push action with clear source/target semantics; no ambiguity about live state | Borrow: "Activate" one-click scene push, scene name visible at all times. Avoid: buried token/player config in right-click menus | https://foundryvtt.com/article/scenes/ |
| **OBS Studio** | Preview/Program split: two video feeds side-by-side, an explicit "Transition" button, scene composition on the left, live output on the right | Two-display model eliminates accidental reveal; the transition is an intentional gate | Borrow: preview vs. live split for player-view controller. Avoid: complexity of multi-source compositing (overkill for a VTT) | https://obsproject.com/wiki/OBS-Studio-Overview |
| **Grafana** | Dashboards render real data immediately, use small-multiple panel layout, reserve color for alert-level semantic only, support density control per panel | High information density without cognitive overload; color = state, not decoration | Borrow: status panel density, semantic color discipline, dashboard-as-primary-surface. Avoid: chart-heavy metaphor (a TTRPG is text + tokens, not time-series) | https://grafana.com/docs/grafana/latest/dashboards/ |
| **Owlbear Rodeo** | Persistent sharing bar showing each player's current view; one-click "Share my view to everyone" | Minimum-click player-view control in permanent UI real estate | Borrow: per-player view status always visible. Avoid: lack of named presets / persistent layout | https://www.owlbear.rodeo/blog/whats-new-2-1 |
| **Alchemy RPG** | Director mode: live thumbnail of each player's current viewport | Highest-fidelity preview affordance among VTTs surveyed | Borrow: live player-view thumbnails as preview in the Player-View Controller | https://alchemyrpg.com/blog/director-mode |
| **Stream Deck (desktop app)** | Profile system: named button-grid configurations per application; one-click profile switch | Context switch = layout swap, not widget hunt | Borrow: named layout presets (CMD-007 analogue). Avoid: fixed grid that cannot resize widgets | https://www.elgato.com/en/downloads |

**North-star narratives**

1. **From OBS Studio:** The Command Center must treat "what the DM sees" and "what players see" as two fundamentally different displays. The Player-View Controller is the transition control: explicit, confirmatory, never ambiguous. A DM should never be able to accidentally reveal content — the design makes the push action deliberate.

2. **From Grafana:** Information density is a virtue, not a compromise. The default layout should pack the maximum useful state into the first screen without requiring scroll or interaction to reach any hot-path data. Color encodes alert-level state only; positional layout and size encode importance.

3. **From Foundry VTT:** The single most valuable lesson is the "Activate" affordance: one clearly labeled button that means "this is now what everyone sees." The Command Center should have an equivalent for every major context switch — map swap, scene push, audio change — with the same spatial predictability every session.

---

## 5. UX/UI requirements

### UX-CMD-001 — Persistent home affordance reachable in one action

- **Requirement:** From any surface in the application, the DM can navigate to the Command Center in a single action: one click, one tap, or one keyboard shortcut.
- **Rationale:** During live play the DM must recover their console instantly after navigating to a character sheet, map editor, or note. Three-click navigation depth is too slow under table pressure [3].
- **Spec:** A Home button (house icon from the icon set in `01-visual-design-system.md`) occupies the top position in the global nav rail on Desktop and Tablet. On Mobile, it is the leftmost item in the bottom tab bar. Keyboard shortcut: `G H` (Go Home) globally, in addition to any platform-native back-stack navigation. The button label is "Home" (visible on Desktop sidebar, tooltip on collapsed rail). Active state: the Home button is highlighted when the Command Center is the current route.
- **States:** default (idle, accessible), active (current route, highlighted), loading (Home route is initializing — skeleton layout visible within 200 ms)
- **Platform profiles:**
  - Desktop: persistent sidebar rail item, always visible; `G H` fires from any focused element
  - Tablet: collapsible rail; Home is pin-0 (always shown even when rail is collapsed to icon-only mode); `G H` works when hardware keyboard is attached
  - Mobile: bottom tab bar, leftmost tab, labeled "Home"; no keyboard shortcut expected
- **Input:** pointer (click) · touch (tap) · keyboard (`G H` chord, then `Enter` to confirm if a dialog is open)
- **Accessibility:** `role="link"` or `role="tab"` matching the nav surface; `aria-label="Command Center (Home)"`; `aria-current="page"` when active; focus-visible ring; announces "Navigated to Command Center" via `aria-live="polite"` region on route change
- **Acceptance criteria:**
  - Given the DM is viewing a character sheet, when they press `G` then `H`, then the Command Center is displayed within 500 ms.
  - Given the DM is on Mobile with no hardware keyboard, when they tap the Home tab, then the Command Center is displayed.
  - Given the Command Center is already active, when the DM presses `G H`, then focus is returned to the Command Center without a route change (no-op navigation).
- **Priority:** Must-have

---

### UX-CMD-002 — Default populated layout on first run (no blank-canvas home)

- **Requirement:** On first application load (or any time no Command Center preset exists), the system instantiates a default layout with pre-placed, pre-configured system widgets. The DM sees a useful operations console immediately, not an empty canvas with a "get started" prompt.
- **Rationale:** Blank-canvas home states are the primary onboarding failure mode identified in NN/g dashboard research [3]. First-run DMs need orientation, not a setup task before value. Foundry VTT's default scene and Roll20's campaign home both demonstrate that a sensible default dramatically reduces first-session setup friction.
- **Spec:** The system default layout (see §7 for ASCII wireframe) places the following widgets in fixed default zones: (1) Session Status strip — top, full width, always visible; (2) Initiative Tracker panel — right rail, top section; (3) Active Map embed — center, largest zone; (4) Player-View Controller panel — right rail, below initiative; (5) Audio Controls widget — bottom strip; (6) Dice Quick-Roll strip — bottom strip, right of audio. Placeholder/demo data is shown in each widget with a subtle "configure" affordance. A first-run tooltip sequence (dismissible) labels each zone by its purpose. No widget requires configuration before it is useful — dice roll without binding; initiative shows "No active combat" with a "Start combat" affordance.
- **States:** first-run (demo data, tip overlays visible); configured (DM's own data); empty-session (widgets visible but reporting "No active session")
- **Platform profiles:**
  - Desktop: full six-zone layout as described; all widgets simultaneously visible
  - Tablet landscape: same six zones, slightly compressed; initiative and player-view share a tabbed right panel
  - Tablet portrait: center map occupies top 60%; bottom sheet houses initiative + player-view as tabs
  - Mobile: single-pane focus; bottom drawer reveals secondary panels; map is the default focus pane
- **Input:** pointer · touch · keyboard (Tab to focus each widget zone; Enter/Space to interact)
- **Accessibility:** Each widget zone has `role="region"` with a descriptive `aria-label`; first-run tips are announced once via `aria-live="assertive"` then dismissed; repeated launch does not re-announce
- **Acceptance criteria:**
  - Given a fresh vault with no saved Command Center, when the DM opens the app, then the default six-zone layout is displayed with at least five of the six system widgets pre-placed.
  - Given the default layout is displayed, when the DM does not configure anything and clicks the Dice widget, then at least one die roll executes successfully.
  - Given a first-run layout, when the DM dismisses the first-run tips, then tips do not reappear on the next launch.
- **Priority:** Must-have

---

### UX-CMD-003 — Glanceable session status strip

- **Requirement:** A fixed-height strip at the top of the Command Center surface permanently displays: current session phase (idle / prep / active / paused / ending), active combat turn indicator (character name + initiative number, or "No combat"), connected player count, and currently playing audio track or "Silent". The strip is readable without interaction at normal viewing distance (≥60 cm / 24 in).
- **Rationale:** The "glance contract" [1] requires key state to be visible without foveal focus. Operations console research shows that persistent, stable status regions reduce cognitive load and error rate during high-pressure tasks. Grafana-style dashboards succeed because state never hides behind a click [4].
- **Spec:** Strip height: 48 px (Desktop), 52 px (Tablet/Mobile). Background uses `--color-surface-elevated` token. Four indicator cells, left to right: (a) Session Phase badge — pill shape, semantic color (active = `--color-status-live`, paused = `--color-status-paused`, idle = `--color-neutral-muted`), label in `--text-label-sm`; (b) Current Turn — character name truncated at 20 chars + portrait thumbnail 28×28 px + turn timer if active; (c) Players — avatar stack (up to 5 shown, "+N" overflow), each avatar 28×28 px with a green/grey online indicator dot; (d) Audio — speaker icon + track name truncated at 16 chars, or muted indicator. Dividers: 1 px `--color-border-subtle` between cells. No interaction required; cells are informational. Clicking a cell opens the relevant panel (turn → combat tracker; players → player-view controller; audio → audio widget).
- **States:** session-active (all four cells populated); session-idle (Phase = "Idle", Turn = "No combat", Players = "0 connected", Audio = "Silent"); session-paused (Phase badge pulses at 1 Hz using CSS animation, reduced-motion: static pulse badge instead); error (red border on affected cell + error icon)
- **Platform profiles:**
  - Desktop: four cells displayed simultaneously, full labels
  - Tablet: four cells, abbreviated labels ("Active" → "●", player count as number only)
  - Mobile: strip collapses to two cells (Session Phase + turn name); remaining cells accessible via tap-to-expand
- **Input:** pointer/touch (tap cell to open related panel); keyboard (`Tab` to focus strip; `Enter` on a cell opens related panel); no shortcut required for passive reading
- **Accessibility:** Strip `role="status"` container with `aria-label="Session status"`; each cell is a `<button>` if interactive or a `<p>` with `aria-label` if read-only; combat turn changes trigger `aria-live="polite"` announcement: "It is now [Name]'s turn"; player join/leave announces "[Name] connected/disconnected"
- **Acceptance criteria:**
  - Given an active session with combat, when the DM is at the Command Center, then the current combatant's name is visible in the status strip without any click or scroll.
  - Given audio is playing, when the DM reads the status strip, then the track name is visible without opening a panel.
  - Given a session pause, when the DM views the status strip on a reduced-motion device, then the Phase badge shows "Paused" as a static label without animation.
- **Priority:** Must-have

---

### UX-CMD-004 — Player-View Controller panel

- **Requirement:** A dedicated panel in the Command Center shows every connected participant's name, avatar, role (Player/Observer), and their currently assigned Scene or "none". The DM can change any participant's assignment in ≤2 taps/clicks. The panel is always visible in the default layout (not behind a settings route).
- **Rationale:** Roll20 requires 3–4 clicks to change a player's view, which is too slow during live play [6]. Owlbear Rodeo's persistent sharing bar demonstrates that one-click reassignment is achievable [7]. Per principle 2 ("The table is the context"), player-view control is a hot-path action.
- **Spec:** Panel minimum width: 240 px (Desktop), full-width card on Mobile. Each participant row: 44 px height, avatar 32×32 px, name (truncated at 18 chars), role badge, and a Scene selector dropdown showing the name of the currently assigned Scene. The dropdown lists available Scenes (max 8 shown, scroll for more) ordered: active Session Scenes first, then all others. A "Preview" button (eye icon, 44×44 px tap target) opens a DM-only live preview of that player's current view (see UX-CMD-005). A "Push handout" button (share icon, 44×44 px) opens the handout push workflow (see UX-CMD-006). Disconnected players shown with grey avatar + "Offline" label; assignment still editable (applied on reconnect per CMD-004 acceptance criteria).
- **States:** participant-row default; participant-row hover (Desktop: row highlight, preview + push buttons appear); participant-row selected (row active, assignment dropdown open); participant-offline (greyed, "Offline" chip); participant-no-assignment (Scene selector shows "Unassigned" in italic)
- **Platform profiles:**
  - Desktop: right rail panel, always visible; minimum 240 px, maximum 320 px; resizable (canvas mechanic from doc 04)
  - Tablet: right panel tab (shares space with initiative tracker via tab switcher); landscape shows split; portrait shows tab
  - Mobile: accessible via a "Players" bottom drawer; same participant rows with ≥44 px targets; push and preview as icon buttons
- **Input:** pointer (click to open Scene dropdown; click preview/push buttons) · touch (tap) · keyboard (Tab to focus rows; Space/Enter to open Scene dropdown; arrow keys to select Scene; Escape to close)
- **Accessibility:** Panel `role="region"` `aria-label="Player View Controller"`; each participant row is a `<li>` within a `<ul>`; Scene dropdown is a standard `<select>` or a custom listbox implementing the ARIA Listbox pattern; preview/push buttons have `aria-label="Preview [Name]'s view"` / `aria-label="Push handout to [Name]"`; visibility boundary: the preview panel renders the player's assigned view in a DM-only `<dialog>`, never leaking hidden-layer content (validated per `11-collaboration-permissions.md` rules)
- **Acceptance criteria:**
  - Given three connected players, when the DM opens the Command Center, then all three players are listed in the Player-View Controller panel without opening any drawer or settings.
  - Given a player row, when the DM clicks the Scene dropdown and selects a different Scene, then the change is applied within 500 ms and the player's view updates (or queues for reconnect if offline).
  - Given the preview button for a player, when the DM clicks it, then a DM-only preview modal opens showing that player's current view with no DM-only hidden content visible.
- **Priority:** Must-have

---

### UX-CMD-005 — Player-view preview modal (DM-only)

- **Requirement:** The DM can open a full-screen (or large-viewport) preview that renders exactly what a specified player currently sees, with a clear "DM view — players cannot see this preview" label. The preview updates live if the player's assigned view changes. Hidden/DM-only content must never appear in the preview.
- **Rationale:** Alchemy RPG's Director mode is the highest-fidelity reference: live thumbnails of each player's viewport eliminate guesswork about what players see [8]. OBS Studio's "Preview" vs. "Program" split is the interaction model: the preview is explicitly DM-only [2]. Accidental content reveal is the highest-severity usability failure in this domain (Principle 8, "Safe by default").
- **Spec:** Preview opens as a modal dialog (`<dialog>` element) at 80% viewport width, 80% viewport height. Header bar (48 px): "Preview: [Player Name]'s view — NOT visible to player" in `--text-label-md`, left-aligned; previous/next player arrows (if multiple players); close button top-right. Preview area renders the assigned Scene canvas in a read-only, non-interactive iframe/canvas snapshot. Refresh rate: live (WebSocket push) when online; static snapshot when offline (timestamp shown). A yellow banner "Offline — showing last known state as of [timestamp]" appears when offline. The preview iframe/canvas explicitly strips all DM-only layer data before rendering per the same rules as the player client; this is enforced server-side (see `11-collaboration-permissions.md`).
- **States:** loading (skeleton at modal open, ≤300 ms before first frame); live (active connection); offline-snapshot (yellow banner, timestamp); player-unassigned (modal shows "No scene assigned — player sees the waiting screen")
- **Platform profiles:**
  - Desktop: 80% viewport modal, previous/next navigation between players
  - Tablet: full-screen modal (100% viewport); swipe left/right to navigate players
  - Mobile: full-screen modal; same content; swipe navigation
- **Input:** pointer (close button, previous/next arrows) · touch (swipe left/right, tap close) · keyboard (Escape to close; Left/Right arrows to navigate players; Tab within header)
- **Accessibility:** `<dialog>` with `aria-modal="true"` and `aria-labelledby` pointing to header; focus locked inside modal; Escape closes; the preview canvas is `aria-hidden="true"` (it is a visual representation); header announces "Preview of [Player Name]'s view. This is not visible to the player." on open via `aria-live="assertive"`; close button `aria-label="Close preview"`
- **Acceptance criteria:**
  - Given a player assigned to a Scene containing a hidden map layer, when the DM opens that player's preview, then the hidden layer is not visible in the preview.
  - Given the DM opens the preview modal, when they press Escape, then the modal closes and focus returns to the preview button that opened it.
  - Given the player has no assigned Scene, when the preview opens, then the modal displays "No scene assigned" rather than a blank frame.
- **Priority:** Must-have

---

### UX-CMD-006 — Push handout / content to player canvases

- **Requirement:** The DM can select one or more images, notes, or reference blocks from the vault and push them to one, several, or all player canvases in ≤3 actions, with a confirmation dialog that names the content and the recipients before delivery.
- **Rationale:** Handout delivery is a high-frequency, high-consequence action during play. Accidental reveals of the wrong content or to the wrong player are a documented pain point across Foundry and Roll20 communities. The confirmation step is required by Principle 8 ("Safe by default") and must show exactly what is being sent [3].
- **Spec:** The "Push handout" action is available from: (a) the push icon in any participant row of the Player-View Controller; (b) the right-click/long-press context menu on any image, note, or block in the vault browser; (c) the command palette (`CMD-008`). Workflow: Step 1 — content selector (if not pre-selected): a drawer showing recent images and a search field; Step 2 — recipient selector: checkboxes for each connected player, plus "All players" toggle; Step 3 — confirmation dialog (see copy below). On confirm, the content widget appears on the selected players' canvases at their default widget position (top-left of their viewport) and a toast appears in the DM's console: "Handout delivered to [N] players." Confirmation dialog copy: title "Push handout to players", body "[Content name] ([type]) will appear on [Recipient list]'s canvas. They will see it immediately." Primary CTA: "Push now" (filled button, `--color-action-primary`). Secondary: "Cancel". No destructive styling — push is reversible (the DM can remove the widget from player canvases via the Player-View Controller).
- **States:** step-1-selecting (drawer open); step-2-recipients (checkboxes); step-3-confirm (dialog, push button active); pushing (loading state on button, 100 ms max before spinner); success (toast: "Handout delivered to N players"); error (toast: "Delivery failed — try again", retry action)
- **Platform profiles:**
  - Desktop: multi-step flow in a right-side drawer (640 px wide); confirmation as inline dialog
  - Tablet: full-width bottom sheet for steps 1–2; confirmation dialog centered
  - Mobile: each step is a full-screen modal; confirmation is final screen before send
- **Input:** pointer · touch · keyboard (Tab through steps; Space to toggle checkboxes; Enter to advance; Escape cancels at any step)
- **Accessibility:** Each step is a logical `<section>` within the drawer/sheet; the confirmation dialog is a `<dialog>` with `aria-modal="true"`; the "Push now" button receives focus automatically on dialog open; success toast announces "Handout delivered to [N] players" via `aria-live="polite"`; error toast announces via `aria-live="assertive"` with retry button
- **Acceptance criteria:**
  - Given an image in the vault, when the DM right-clicks it and selects "Push to players", then the recipient selector opens within 200 ms.
  - Given the confirmation dialog is open showing two players, when the DM clicks "Push now", then the handout appears on both players' canvases and the DM sees a success toast within 1 second.
  - Given the DM cancels at the confirmation step, then no content is delivered to any player canvas.
  - Given a hidden note (DM-only), when the DM opens the content selector, then the hidden note is not listed among pushable content options.
- **Priority:** Must-have

---

### UX-CMD-007 — Active map embed with DM / player-projection controls

- **Requirement:** The center zone of the Command Center hosts an embedded, live map widget. The DM can change the active map binding without leaving the Command Center, and can control which map layers are projected to players from within the same widget surface.
- **Rationale:** Map management is the highest-frequency DM action during live play after initiative tracking. Requiring navigation to a separate map editor to change what players see adds 3–5 steps per encounter transition — unacceptable under the ≤2-action hot-path requirement. Foundry VTT's one-click "Activate scene" is the reference [5].
- **Spec:** The map embed widget occupies the center zone (see §7 wireframe). Widget chrome: a thin 4 px colored left border indicating projection state (projecting = `--color-status-live`, not projecting = `--color-neutral-muted`). Header bar (36 px): map name (truncated, tap to open full name), "Change map" button (text button, right-aligned), "Project to players" toggle (pill toggle, 44 px target). Below header: the map canvas rendered at widget size (full functionality per `06-maps.md`). A layer-visibility mini-panel slides in from the right edge of the widget on click of a layers icon (stacked layers icon, 24×24 px), showing layer names with on/off toggles. Toggling a layer immediately updates the projection state without requiring a separate "apply" step. "Change map" button opens a modal map-picker showing a grid of map thumbnails (all maps in the vault), searchable; selecting a map swaps the embed and updates session state.
- **States:** projecting (left border live-color; toggle on); not-projecting (border neutral; toggle off); changing-map (modal open); loading (map render skeleton); error (red border, "Map unavailable" label with retry)
- **Platform profiles:**
  - Desktop: center zone, full-height between status strip and bottom strip; maximum available width
  - Tablet: center zone (landscape); collapses to top 60% of screen (portrait), with bottom sheet for initiative + players
  - Mobile: map embed is the primary focus pane; DM accesses map controls via a floating action button (FAB) revealing a compact layer-toggle and project toggle; "Change map" available in bottom drawer
- **Input:** pointer/touch (tap header controls, layer toggles, project toggle) · keyboard (`Tab` to reach map embed widget; within widget: `Tab` through controls; `Space` to toggle projection; `Enter` on "Change map"; layer panel opened via `L` when widget is focused)
- **Accessibility:** Project toggle `role="switch"` `aria-checked` reflecting state; layer toggles `role="checkbox"`; map change modal `<dialog>` with `aria-labelledby`; projection state change announces "Map projected to players" or "Map projection stopped" via `aria-live="polite"`
- **Acceptance criteria:**
  - Given the Command Center is visible, when the DM clicks "Project to players", then the map layers are streamed to player canvases within 2 seconds and the toggle shows "Projecting".
  - Given the map contains a DM-only annotation layer, when the DM projects the map, then the DM-only layer is excluded from the player-facing projection.
  - Given the DM uses "Change map" and selects a different map, then the center embed updates and the session's active-map record changes without navigating away from the Command Center.
- **Priority:** Must-have

---

### UX-CMD-008 — Named layout presets (save, apply, recover)

- **Requirement:** The DM can save the current Command Center layout as a named preset and restore any saved preset. Restoring a preset changes only the Command Center Scene's widget arrangement and bindings, not other Scenes. A last-known-good layout is auto-saved and recoverable after a crash or failed sync.
- **Rationale:** Stream Deck's profile system shows that context-switch by layout swap is more reliable than dynamic reordering under pressure [9]. CMD-007 functional requirement requires this. Named presets let the DM switch between "Combat" and "Exploration" or "Town" configurations in one action.
- **Spec:** A "Layouts" button in the Command Center header bar (top-right, label "Layouts" + stack-of-pages icon, 44 px target). Clicking opens a dropdown menu listing saved presets (name + last-saved timestamp) with actions: "Apply", "Rename", "Delete". A "Save current layout" item at the top of the dropdown. Preset name: text field, max 32 chars, validated (non-empty, unique). On "Apply", if the current layout has unsaved changes, a prompt: "Save current layout before switching? [Save] [Discard] [Cancel]". Auto-save: every layout change is also saved to a rolling last-known-good slot (not user-named). "Recover layout" action available in the Layouts menu under a separator: "Restore last auto-save ([timestamp])". On recovery, the current layout is replaced and a toast confirms: "Layout restored from [timestamp]". Undo is available for 30 seconds (toast with "Undo restore" action).
- **States:** menu-closed (Layouts button default); menu-open (dropdown visible); applying-preset (brief loading state, ≤300 ms); save-dialog (name entry field open); rename-dialog; delete-confirm (modal: "Delete layout [name]? This cannot be undone."); recovery-available (subtle badge on Layouts button if auto-save is newer than last manual save)
- **Platform profiles:**
  - Desktop: Layouts button in top-right of Command Center header; dropdown menu
  - Tablet: same position; dropdown becomes a full-width bottom sheet on portrait
  - Mobile: Layouts accessible from the three-dot "More" menu in the mobile header; same preset list
- **Input:** pointer/touch (click/tap Layouts button, select preset) · keyboard (`Alt+L` opens Layouts menu; arrow keys navigate; Enter applies; Escape closes; Tab within save dialog)
- **Accessibility:** Layouts dropdown is a `role="menu"` with `role="menuitem"` children; save/rename dialogs are `<dialog>` with `aria-modal="true"`; delete confirmation `<dialog>` with primary focus on "Cancel" (safer default); recovery toast announces "Layout restored from [timestamp]" via `aria-live="polite"` with an "Undo" `<button>`
- **Acceptance criteria:**
  - Given the DM has arranged a custom layout and clicks "Save current layout", then the preset appears in the Layouts menu with the chosen name.
  - Given two saved presets exist, when the DM applies one, then the widget arrangement changes and other Scenes are unaffected.
  - Given the app crashes and the DM reopens, when they open the Layouts menu, then "Restore last auto-save" is available with a timestamp not older than the last layout change.
  - Given a preset references a deleted widget type, when it is applied, then the system applies all valid widgets and shows a warning: "Widget [name] is no longer available and was skipped."
- **Priority:** Should-have

---

### UX-CMD-009 — Widget library quick-access drawer

- **Requirement:** The DM can open a searchable widget library from the Command Center, preview a widget's capabilities, and add it to the current layout in ≤3 actions.
- **Rationale:** CMD-005 functional requirement. Quick-access to the widget library reduces context-switch cost compared to navigating to a settings screen. The progressive disclosure principle (Principle 4) says the library is one layer down from the canvas, not buried in a settings route.
- **Spec:** A "Add widget" button (plus icon, 44 px target) is fixed in the bottom-right of the Command Center canvas (Desktop: bottom-right corner of the canvas area; Tablet/Mobile: FAB above bottom tab bar). Clicking opens a drawer (Desktop: right drawer, 320 px wide; Mobile/Tablet: bottom sheet, 70% viewport height). Drawer contents: a search field (auto-focused on open) + scrollable grid of widget cards (2 columns on Mobile, 3 on Tablet/Desktop). Each card: 96×96 px thumbnail (generated from widget metadata), widget name in `--text-label-sm`, a brief description (1 line, max 48 chars). Unsupported widgets on the current profile are shown greyed with a tooltip: "Not available on [Profile]." Tapping a card shows a 200-px wide expanded preview panel (Desktop: inline to the right of the grid; Mobile: replaces the grid with a back button). The expanded view shows widget name, full description (max 4 lines), a larger preview, and an "Add to canvas" button. Clicking "Add to canvas" closes the drawer and places the widget at the center of the visible canvas area.
- **States:** drawer-closed; drawer-open (search focused); search-active (results filtered); card-default; card-hover (Desktop: elevation shadow); card-selected (expanded view visible); card-unavailable (greyed, tooltip); adding (button loading state, ≤200 ms); success (widget appears on canvas, focus jumps to it)
- **Platform profiles:**
  - Desktop: right drawer; 3-column grid; expanded preview inline
  - Tablet: bottom sheet; 2-column grid; expanded preview as a second sheet layer
  - Mobile: bottom sheet (70% height); 2-column grid; expanded preview replaces grid (back button to return)
- **Input:** pointer/touch · keyboard (Escape closes drawer; Tab navigates grid; Enter opens expanded view; Tab to "Add to canvas"; Enter adds)
- **Accessibility:** Drawer `role="dialog"` `aria-label="Widget library"` `aria-modal="true"`; search field `aria-label="Search widgets"`; grid `role="list"` of `role="listitem"` cards; unavailable cards `aria-disabled="true"` with `aria-description` of the reason; "Add to canvas" announces "Widget [name] added to canvas" via `aria-live="polite"` on success
- **Acceptance criteria:**
  - Given the widget library drawer is open, when the DM types "dice" in the search field, then only widgets matching "dice" in name or description are shown.
  - Given a widget is unsupported on the current profile, when listed, then it is visually distinct and cannot be added (clicking it shows the unavailability reason, not an error).
  - Given the DM clicks "Add to canvas", then the widget appears on the canvas and the drawer closes within 300 ms.
- **Priority:** Must-have

---

### UX-CMD-010 — Session phase transition controls

- **Requirement:** The DM can transition the session through its lifecycle phases (idle → prep → active → paused → ending → recap → archived) from the Command Center. The current phase is always visible (see UX-CMD-003). Transitions that affect players show a confirmation. Irreversible transitions (end session, archive) require a two-step confirmation.
- **Rationale:** CMD-006 functional requirement. Session phase is a live-operations concern: the DM needs to pause, resume, and end sessions quickly. Accidental session-end is a high-severity error (cannot be undone without re-importing state); two-step confirmation is required by Principle 8 [3].
- **Spec:** The Session Phase badge in the status strip (UX-CMD-003) is clickable on Desktop/Tablet (tap on Mobile). Clicking opens a compact popover (Desktop: 240 px wide dropdown; Mobile: bottom sheet) listing valid next-phase transitions as labeled action buttons. Button labels and confirmation requirements:
  - "Start session" (idle → active): confirmation dialog: "Start session? Connected players will see the active scene." [Start] [Cancel]
  - "Pause session" (active → paused): no confirmation, immediate; toast: "Session paused. Players see the paused screen."
  - "Resume session" (paused → active): no confirmation, immediate; toast: "Session resumed."
  - "End session" (active → ending): two-step: dialog 1 "End this session?" [Proceed to recap] [Cancel]; dialog 2 opens the recap summary screen
  - "Archive session" (recap → archived): dialog: "Archive this session? It will be read-only." [Archive] [Cancel]
  Invalid transitions (e.g., archive before end) are hidden from the popover.
- **States:** popover-closed; popover-open (valid transitions listed); confirming (dialog open); transitioning (button loading, 100 ms max); transitioned (phase badge updates, toast shown)
- **Platform profiles:**
  - Desktop/Tablet: popover from badge click
  - Mobile: bottom sheet from badge tap
- **Input:** pointer/touch · keyboard (Enter on Phase badge opens popover; Tab to buttons; Enter to confirm; Escape cancels)
- **Accessibility:** Phase badge is a `<button>`; popover is `role="menu"` with `role="menuitem"` children; confirmation dialog `<dialog>` with `aria-modal="true"`; primary focus on safer action (Cancel) in two-step confirmations; phase change announces via `aria-live="assertive"`: "Session [phase]. Players have been notified."
- **Acceptance criteria:**
  - Given an active session, when the DM clicks the Phase badge and selects "Pause session", then the session pauses within 500 ms and the badge shows "Paused" without a confirmation dialog.
  - Given the DM selects "End session", then two confirmation dialogs are required before the session ends.
  - Given the session is paused, when remote participants check their client, then they see a paused/waiting state and no live game commands execute.
- **Priority:** Must-have

---

### UX-CMD-011 — Command palette parity for all Command Center actions

- **Requirement:** Every action available through the Command Center's visible controls is also accessible via the global command palette using the same Processing Core command, producing identical results.
- **Rationale:** CMD-008 functional requirement. Principle 3 ("Information scent over memory") and the keyboard-power-user model require that no action is palette-exclusive or UI-exclusive. Command palette parity also enables automation and scripting paths without UI dependency.
- **Spec:** Command palette activation: `Cmd/Ctrl+K` globally. Command Center actions registered in the palette:
  - "Start session" / "Pause session" / "Resume session" / "End session" / "Archive session"
  - "Push to players: [content name]" (contextual when content is selected)
  - "Change active map"
  - "Project map to players" / "Stop map projection"
  - "Add widget: [widget name]"
  - "Apply layout preset: [preset name]"
  - "Save current layout as…"
  - "Preview [player name]'s view"
  Commands that are unavailable due to state (e.g., "Resume session" when no session is active) are shown disabled with a non-leaking reason ("No active session to resume"). Commands gated by DM role are hidden for non-DM users — not shown as disabled, hidden entirely (preventing permission inference).
- **States:** palette-closed; palette-open (command list, filtered by query); command-unavailable (shown disabled, greyed, with reason); command-hidden (DM-only commands not shown to non-DM users)
- **Platform profiles:**
  - Desktop: `Cmd/Ctrl+K` shortcut, full command palette overlay
  - Tablet: `Cmd/Ctrl+K` with hardware keyboard; touch: palette accessible from "…" menu → "Command palette"
  - Mobile: accessible from the three-dot "More" menu; no keyboard shortcut expected without hardware keyboard
- **Input:** keyboard (`Cmd/Ctrl+K` to open; type to filter; arrow keys to navigate; Enter to execute; Escape to close) · pointer/touch (tap from More menu)
- **Accessibility:** Palette is a `role="combobox"` with `role="listbox"` results; `aria-activedescendant` tracks highlighted command; `aria-disabled="true"` on unavailable commands with `aria-description` of reason; DM-only commands entirely absent from the DOM for non-DM sessions (no hidden or aria-hidden — present-in-DOM-but-hidden leaks structure)
- **Acceptance criteria:**
  - Given the command palette is open and the DM types "Push", then "Push to players" commands appear.
  - Given the DM executes "Pause session" from the palette, then the session pauses identically to clicking the Phase badge popover.
  - Given a Player (non-DM) user opens the command palette, then DM-only commands (e.g., "End session") are not present in results or disabled states.
- **Priority:** Should-have

---

### UX-CMD-012 — Role-differentiated Command Center views

- **Requirement:** Players and Observers who navigate to the "/" (home) route see a role-appropriate controlled view — their own player canvas or an observer canvas — and have no access to DM controls, DM-only panels, or any indication of DM-only content structure.
- **Rationale:** Principle 8 ("Safe by default") and CMD-001/CMD-004 functional requirements. The DM dashboard must not be accessible to non-DM roles even as a read-only view. The player home is their player-view canvas, which is a different surface entirely. Hidden content must never leak through navigation structure, error messages, or loading states.
- **Spec:** On the home route:
  - DM role: Command Center Scene with full DM dashboard (this document's full spec).
  - Player role: Player's assigned Scene canvas (their player-view) with a compact personal toolbar: character quick-access, dice, chat. No initiative panel, no player-view controller, no audio controls (read-only audio status is acceptable if DM has shared it).
  - Observer role: Observer canvas (read-only Scene assigned by DM) with no interactive controls. A subtle "Observer mode" label in the status strip.
  The routing layer must enforce role checking server-side — client-side role gates are not sufficient (see `11-collaboration-permissions.md`). If a Player navigates directly to a DM-only route, they receive a 403 response and are redirected to their player home with a toast: "That page is only available to the Dungeon Master."
- **States:** dm-home (full dashboard); player-home (player canvas); observer-home (read-only canvas); unauthorized-redirect (toast + redirect)
- **Platform profiles:** applies equally across all profiles; the player slim view is further simplified on Mobile
- **Input:** all standard inputs; the unauthorized-redirect toast has a "Go to my home" button
- **Accessibility:** No DM-only content present in the DOM for non-DM sessions; observer canvas is `aria-readonly="true"` at the region level; redirect toast announces "Redirected to your home page" via `aria-live="assertive"`
- **Acceptance criteria:**
  - Given a Player user navigates to the "/" route, then they see their player canvas, not the DM dashboard.
  - Given a Player user navigates directly to a DM-only panel URL, then they receive a redirect with a toast and no DM-only content is rendered in the page.
  - Given an Observer user at the home route, then all interactive controls are absent and an "Observer mode" label is visible.
- **Priority:** Must-have

---

## 6. Component & state specifications

### 6.1 Session Status Strip

| Element | Anatomy | States | Keyboard |
|---|---|---|---|
| Phase badge | Pill, `--text-label-sm`, semantic fill | active (live-green), paused (amber pulse / static), idle (neutral), ending (warning-orange), archived (muted) | `Tab` to focus; `Enter` opens phase popover |
| Current Turn cell | Portrait 28×28 px + name text + optional timer | populated, "No combat" (italic muted), loading (shimmer) | `Tab`; `Enter` opens combat tracker (doc 08) |
| Players cell | Avatar stack (28×28 px, max 5) + count chip | all-online, some-offline (grey avatars), none (empty state "No players") | `Tab`; `Enter` opens Player-View Controller |
| Audio cell | Speaker icon + track name / muted indicator | playing, muted, error (red icon) | `Tab`; `Enter` opens audio widget (doc 13) |

Strip height: 48 px (Desktop), 52 px (Tablet/Mobile). No vertical scroll. `role="status"` on the container.

### 6.2 Player-View Controller Panel

| Element | Anatomy | States | Keyboard |
|---|---|---|---|
| Panel header | "Players" label + connected-count chip | populated, empty ("No players connected") | `Tab` reaches header |
| Participant row | Avatar 32×32 + name + role badge + Scene selector dropdown | online (green dot), offline (grey dot + "Offline"), no-assignment ("Unassigned" italic) | `Tab` to row; `Space`/`Enter` opens Scene dropdown; arrow keys to select |
| Preview button | Eye icon, 44×44 px | default, hover (Desktop: tooltip "Preview [Name]'s view"), loading, focus-visible | `Tab`; `Enter` opens preview modal |
| Push button | Share icon, 44×44 px | default, hover (tooltip "Push handout to [Name]"), loading | `Tab`; `Enter` opens push workflow |
| "All players" quick-assign | "Assign all to: [dropdown]" — compact row below participant list | available (scenes list), no-players (row hidden) | `Tab`; operates as a standard `<select>` |

Panel min-height: 200 px. Scrollable participant list when > 6 participants.

### 6.3 Handout Push Confirmation Dialog

| Element | Anatomy | Copy | Keyboard |
|---|---|---|---|
| Title | `--text-heading-sm` | "Push handout to players" | — |
| Content summary | Thumbnail (48×48 px) + name + type label | "[Content name] ([type])" | — |
| Recipient list | Comma-separated names or "All players ([N])" | "[Name], [Name]…" | — |
| Body | `--text-body-sm`, muted | "This will appear immediately on their canvas." | — |
| "Push now" CTA | Filled button, `--color-action-primary` | "Push now" | `Enter` on open (after tabbing to button) |
| Cancel | Ghost button | "Cancel" | `Escape` anywhere in dialog |

Focus on open: "Push now" button. Escape cancels. Backdrop click cancels.

### 6.4 Layout Preset Dropdown Menu

| Element | Anatomy | States | Keyboard |
|---|---|---|---|
| "Layouts" button | Text button + stack-of-pages icon, 44 px target | default, active (menu open), badge (auto-save newer than manual save) | `Alt+L`; `Enter` |
| Preset menu item | Name + timestamp + [Apply] [Rename] [Delete] inline actions | default, hover (row highlight + actions visible), deleting (confirm sub-menu) | arrow keys; `Enter` to apply; sub-menu for rename/delete |
| "Save current layout" item | Top of menu, bold | always-available | first item in menu; `Enter` to save |
| "Restore auto-save" item | Below separator | available (auto-save exists), unavailable (hidden) | `Tab` to separator; `Enter` to trigger |

### 6.5 Widget Library Card

| Element | Size | States | Keyboard |
|---|---|---|---|
| Card container | 96×96 px (compact), 3/2-column grid | default, hover (elevation +1, border highlight), selected (border `--color-action-primary`), unavailable (0.4 opacity, no hover) | `Tab` to card; `Enter` to expand |
| Card thumbnail | 64×64 px, centered | rendered, placeholder (shimmer) | — |
| Card label | `--text-label-sm`, 1 line, ellipsis | default | — |
| Expanded view | Replaces or flanks grid | loading (skeleton), loaded | `Tab` through expanded controls |
| "Add to canvas" button | Filled, full-width in expanded view | active, loading (spinner), success | `Enter`; announces on success |

---

## 7. Layout & responsive behavior

### 7.1 Desktop (≥1024 px)

All six zones are simultaneously visible. The layout is spatially stable — each zone occupies its designated area and does not shift when data changes. Zone proportions are user-adjustable (drag handle between zones, same mechanic as `04-canvas-scene-widgets.md` panel resizing).

```
┌─────────────────────────────────────────────────────────────────────┐
│  GLOBAL NAV RAIL (56 px)  │  COMMAND CENTER                         │
│  [Home] ← active          │                                         │
│  [Maps]                   │ ┌──── SESSION STATUS STRIP ────────────┐ │
│  [Characters]             │ │ ● Active │ Grom (3) [▷ 0:23] │ 👥 3 │ 🔊 Dungeon │
│  [Notes]                  │ └──────────────────────────────────────┘ │
│  [Audio]                  │                                         │
│  [Settings]               │ ┌──── ACTIVE MAP ──────┐ ┌─ PLAYERS ──┐ │
│                           │ │                      │ │ Aria     ↗ │ │
│                           │ │   [map canvas]       │ │ Scene A  👁 │ │
│                           │ │                      │ │ Bob      ↗ │ │
│                           │ │  [Project] [Layers]  │ │ Scene A  👁 │ │
│                           │ │  [Change map]        │ │ Cass ○   ↗ │ │
│                           │ └──────────────────────┘ │ Offline  👁 │ │
│                           │                          │            │ │
│                           │                          ├────────────┤ │
│                           │                          │ INITIATIVE │ │
│                           │                          │ 1. Grom ★  │ │
│                           │                          │ 2. Orc     │ │
│                           │                          │ 3. Aria    │ │
│                           │                          │ [Next turn]│ │
│                           │                          └────────────┘ │
│                           │                                         │
│                           │ ┌──── AUDIO ──────────────┐ ┌── DICE ─┐ │
│                           │ │ ♪ Dungeon Ambience [▐▐] │ │ [d20]  │ │
│                           │ └─────────────────────────┘ └────────┘ │
└─────────────────────────────────────────────────────────────────────┘

+ [Add widget] FAB  (bottom-right corner)    [Layouts ▾] (top-right header)
```

Zone proportions (approximate, user-adjustable):
- Left nav rail: 56 px (icon-only) or 200 px (expanded)
- Right rail (Players + Initiative): 260–320 px
- Center (Map): remaining width
- Status strip: 48 px (top, full width minus nav rail)
- Bottom strip (Audio + Dice): 56 px (full width minus nav rail)

### 7.2 Tablet landscape (768–1024 px)

Right rail collapses to a tabbed panel (Players | Initiative tabs). Map occupies remaining center. Status strip unchanged. Bottom strip unchanged. Touch targets ≥44 px throughout.

```
┌──────────────────────────────────────────────────────────┐
│ ≡  │  SESSION STATUS STRIP (full width)                  │
├────┴─────────────────────────────────────────────────────┤
│         ACTIVE MAP              │ [Players][Initiative]  │
│                                 │ ─ selected tab below ─ │
│     [map canvas]                │ Aria    Scene A   👁 ↗  │
│                                 │ Bob     Scene A   👁 ↗  │
│  [Project toggle] [Layers]      │ Cass ○  Offline   👁 ↗  │
│  [Change map]                   │                        │
├─────────────────────────────────┴────────────────────────┤
│  ♪ Dungeon Ambience  [▐▐]  [→→]         [d4][d6][d20]   │
└──────────────────────────────────────────────────────────┘
+ [Add widget] FAB   [Layouts ▾] in ≡ menu
```

### 7.3 Tablet portrait (600–767 px or landscape-portrait-flipped)

```
┌───────────────────────────────────┐
│ ≡  SESSION STATUS STRIP           │
├───────────────────────────────────┤
│                                   │
│         ACTIVE MAP                │
│       [map canvas]                │
│  [Project] [Layers] [Change]      │
│                                   │
├───────────────────────────────────┤
│  [Players tab]  [Initiative tab]  │
│  ── selected tab content ──       │
│  Aria   Scene A    [👁] [↗]       │
│  Bob    Scene A    [👁] [↗]       │
├───────────────────────────────────┤
│ ♪ Ambience [▐▐]    [d4][d6][d20] │
└───────────────────────────────────┘
+ FAB (add widget)   [Layouts] from ≡
```

### 7.4 Mobile (<600 px)

Single-pane focus model. The map canvas is the primary pane. Secondary panels (Players, Initiative, Audio) are accessible via a persistent bottom drawer handle. The status strip is compressed to two cells (Phase + Turn). A FAB cluster provides quick-access to the three most critical actions.

```
┌───────────────────────┐
│ ≡  ● Active  Grom (3) │  ← Status strip (compressed)
├───────────────────────┤
│                       │
│                       │
│    ACTIVE MAP         │
│    [map canvas]       │
│                       │
│                       │
│     [Project FAB]     │  ← floating action button cluster:
│     [Players FAB]     │    Project toggle / Players / Add widget
│     [Add widget FAB]  │
├───────────────────────┤
│  ▲  Players · Audio   │  ← Drag handle; pull up to expand
└───────────────────────┘
(Bottom drawer, expanded:)
┌───────────────────────┐
│ Players   Initiative  │  ← Tab bar
│ Aria  Scene A  [👁][↗]│
│ Bob   Scene A  [👁][↗]│
│ ────────────────────  │
│ ♪ Ambience [▐▐] [→→] │
└───────────────────────┘
```

All commands available on Mobile: push handout (from FAB → Players drawer → push icon); change map (from ≡ → Change map); layout presets (from ≡ → Layouts); session phase transition (from status strip → tap Phase badge); widget library (from Add widget FAB).

Same Processing Core command is dispatched regardless of which surface triggered it (CMD-008).

---

## 8. Motion & feedback

| Interaction | Animation | Duration | Easing | Reduced-motion fallback |
|---|---|---|---|---|
| Home route enter | Fade-in + 4 px upward translate of content zones | 200 ms | `ease-out` | Instant appear, no translate |
| Panel slide-in (drawer/sheet) | Slide from edge | 220 ms | `cubic-bezier(0.4, 0, 0.2, 1)` (Material standard) | Instant appear |
| Session phase badge change | Cross-fade between badge states | 150 ms | `ease-in-out` | Instant swap |
| "Paused" badge pulse | Opacity 1→0.5→1 at 1 Hz | Continuous | `ease-in-out` | Static badge, no pulse |
| Turn advance in status strip | Slide-up exit + slide-up enter for combatant name | 180 ms | `ease-out` | Cross-fade only |
| Widget added to canvas | Scale 0.8→1.0 + fade-in at widget position | 200 ms | `spring(1, 80, 10)` or CSS `ease-out` | Instant appear |
| Handout push toast | Slide-in from bottom-right | 180 ms | `ease-out` | Instant appear |
| Preview modal open | Fade-in + scale 0.95→1.0 | 180 ms | `ease-out` | Instant appear |
| Layout preset apply | Cross-fade of canvas zones | 250 ms | `ease-in-out` | Instant swap |
| Map projection state change | Left border color cross-fade | 200 ms | `ease-in-out` | Instant swap |

All durations are CSS custom properties (`--duration-fast: 150ms`, `--duration-standard: 220ms`, etc.) owned by `01-visual-design-system.md`. The `prefers-reduced-motion: reduce` media query eliminates all transforms and substitutes opacity-only cross-fades at 100 ms, or removes animation entirely where opacity is also distracting (pulse).

---

## 9. Accessibility requirements (surface-specific)

Beyond the global baseline in `03-accessibility.md`:

**9.1 Live regions for session state** — The status strip cell for Current Turn must update via an `aria-live="polite"` region on every turn advance: "It is now [Character Name]'s turn." Players joining or leaving must announce via the Players cell live region: "[Name] joined the session" / "[Name] left the session." Session phase changes announce via `aria-live="assertive"` because they affect all controls (WCAG 2.2 SC 4.1.3). Audio track changes announce via `aria-live="polite"`: "Now playing: [track name]."

**9.2 Player-View Controller — visibility boundary enforcement** — The preview modal must never include DM-only content in its ARIA tree, even as `aria-hidden="true"` nodes. The DOM must not contain hidden-layer data for non-DM roles at any point during the preview render. This is a hard constraint; a screen reader must not be able to navigate to hidden content in the preview (WCAG 2.2 SC 1.3.1, SC 4.1.2). Implementation note: the preview must be rendered from a player-perspective snapshot, not a DM view with layers hidden via CSS.

**9.3 Modal and drawer focus management** — All modals and drawers (preview, push confirmation, widget library, layout presets, phase popover) must trap focus while open and restore focus to the triggering element on close (WCAG 2.2 SC 2.1.2 No Keyboard Trap, SC 3.2.2). The Escape key closes all of them without side effects. Backdrop clicks close drawers and non-critical modals; they do not close destructive-action dialogs (to prevent accidental dismissal).

**9.4 Touch targets** — All interactive controls in the Command Center must meet ≥44×44 CSS px on Tablet and Mobile (WCAG 2.2 SC 2.5.5 Target Size). The player row push/preview icon buttons are specified at 44×44 px. On Desktop, minimum target is 24×24 px with ≥8 px gaps (WCAG 2.2 SC 2.5.8 Target Size Minimum, AA level).

**9.5 Color independence** — Session phase and map projection states are communicated by both color and text/icon (phase badge label + color; map left border color + toggle label). No state is communicated by color alone (WCAG 2.2 SC 1.4.1).

**9.6 Keyboard shortcuts documentation** — All keyboard shortcuts used in the Command Center (listed in §5 requirements) must be documented in the in-app keyboard shortcut reference, accessible from the `?` button or `Shift+?` globally. Shortcuts must not conflict with browser or OS defaults (WCAG 2.2 SC 2.1.4 Character Key Shortcuts).

**9.7 Reduced-motion session state** — The "Paused" phase badge pulse (1 Hz opacity animation) is replaced with a static "Paused" text label and a static pause icon when `prefers-reduced-motion: reduce` is active. This is specified in §8 and enforced via CSS.

---

## 10. Anti-patterns & explicit limitations

### 10.1 Blank canvas as home

**Do not** present an empty canvas with a "Get started" or "Add your first widget" prompt as the first experience. NN/g dashboard research [3] identifies blank-state homes as the single largest contributor to low time-to-first-value. A DM with zero setup time — 10 minutes before a session — cannot afford to configure their console. The system default template (UX-CMD-002) is non-negotiable. If the default template cannot be rendered, it is a bug, not a feature flag.

### 10.2 Burying the Player-View Controller

**Do not** place the Player-View Controller in a settings panel, a dropdown, or a secondary navigation route. Roll20's experience demonstrates the cost: finding the player-view control takes 3–4 navigation steps under stress [6]. The Player-View Controller must be a primary panel in the Command Center layout, visible without any menu traversal. On Mobile, it is one drawer-open away (one action) — still acceptable — but not behind a settings route.

### 10.3 Accidental reveal of hidden content

**Do not** render DM-only content (hidden layers, DM notes, invisible tokens) anywhere in the preview modal, in player-view thumbnails, in search results shown to non-DM users, or in error messages or loading states. The preview modal must be generated from a player-perspective snapshot. CSS `visibility: hidden` or `display: none` applied to DM-only nodes in a shared DOM is not sufficient — the data must not be in the player-facing response. Research: multiple documented Foundry and Roll20 incidents where DM-only map annotations were briefly visible during layer-toggle animations, or leaked through browser inspector access.

### 10.4 Dashboards that require setup before first value

**Do not** gate any primary Command Center widget behind a configuration step that the DM must complete before it renders. Dice must roll without binding. Initiative must show "No combat" with a "Start combat" CTA, not a blank panel with "Configure to get started." Audio must show "Silent" with a browse affordance. The setup path is progressive (Principle 4): the default state is useful, the configured state is better.

### 10.5 Non-confirmatory handout push

**Do not** allow a single tap/click to push content to players without a confirmation dialog naming the content and the recipients. The confirmation is a hard requirement (Principle 8, UX-CMD-006). Systems that skip confirmation (some Roll20 macros, basic handout buttons in older VTTs) create high-embarrassment, mid-session incidents when the wrong image is pushed. The confirmation dialog is not optional for UX comfort; it is a safety gate.

### 10.6 Dynamically reordering controls during play

**Do not** reorder, reposition, or collapse Command Center widgets based on activity or recency during an active session. Spatial stability is critical for glanceability [1] — a DM who has memorized "initiative is top-right" cannot afford to find it has moved because they haven't clicked it in 10 minutes. Layout changes must be explicit user actions (drag, preset apply), never automatic. The sole exception: on Mobile, a focused panel replaces the primary pane, but its drawer position is stable.

### 10.7 DM dashboard visible to players or observers

**Do not** render any part of the DM dashboard surface for Player or Observer roles, even as read-only. Showing the initiative tracker or player-view controller to players as a "view-only" surface leaks DM operational information (who is being targeted, what scenes are configured). The role split at the home route (UX-CMD-012) is hard: different component tree for each role, enforced server-side.

### 10.8 Color as the sole indicator of session state

**Do not** use color alone to encode session phase, map projection state, or player online/offline status. WCAG 2.2 SC 1.4.1 and the 8% of the population with color-vision deficiency require text + shape + icon redundancy. The phase badge uses text label + color + icon. The map projection border uses the toggle label + border. Player online status uses dot position/fill + "Offline" text label.

---

## 11. Success metrics

| Metric | Target | Measurement method |
|---|---|---|
| Time to advance initiative | ≤3 seconds from the end of a turn | Usability test: task timing from "previous player's action ends" to "next player's name shown" |
| Time to push a handout to all players | ≤15 seconds including confirmation | Usability test: time from "DM decides to push" to "players receive widget" |
| Time to change active map and project to players | ≤20 seconds | Usability test: time from "DM selects map" to "players see new map" |
| Time to find Player-View Controller from Command Center home | ≤5 seconds | Eye-tracking or think-aloud: first fixation on panel |
| First-run task success (no instructions) | ≥80% of new DMs complete "roll a d20" and "push a handout" in the first session | Usability test with first-run participants |
| Glanceability of current turn | ≥90% of participants correctly report the active combatant without interaction at 1 m viewing distance | Usability test: peripheral-view condition |
| Accidental hidden-content reveal incidents | 0 | QA: automated test asserting DM-only layer data is absent from all player-perspective API responses and preview snapshots |
| Command Center load time (default layout) | ≤1 second to first meaningful paint (skeleton layout); ≤3 seconds to interactive | Lighthouse / performance test against P75 device |
| Layout preset apply time | ≤300 ms from selection to canvas re-render | Performance test: automated timing |
| Accessibility (axe audit) | 0 critical violations; 0 serious violations in the Command Center route | CI axe-core automated test |
| WCAG 2.2 AA compliance | 100% of SC applicable to this surface | Manual + automated audit |

---

## 12. Open questions & risks

**12.1 Preview modal render architecture** — The player-view preview (UX-CMD-005) requires rendering a player-perspective Scene snapshot, which implies either a second canvas render context (expensive) or a server-side screenshot service. This is a significant implementation complexity. The UX requirement is clear (live preview, no DM-only content), but the technical strategy must be confirmed before implementation. Risk: live preview may degrade to a polling-based snapshot (e.g., every 5 seconds) rather than true real-time, which is acceptable but should be disclosed in the UI ("Last updated [timestamp]").

**12.2 Mobile "slim" surface completeness** — CMD-002 marks Mobile as "slim." This document specifies the Mobile layout in detail, but the exact capability parity (which widgets are available, which are unavailable, how unavailability is surfaced) depends on the full widget catalog from `04-canvas-scene-widgets.md`, which may not be finalized yet. Risk: some widgets may be flagged unavailable on Mobile in ways that break the default layout. The fallback behavior (widget shows "unavailable on mobile" card vs. hidden entirely) must be decided.

**12.3 Layout preset conflict with canvas mechanics** — CMD-007 (layout presets) interacts with the generic canvas drag/resize mechanics in `04-canvas-scene-widgets.md`. It is unclear whether a preset stores absolute pixel positions (fragile across window sizes) or proportional positions. The proportional approach is recommended but must be confirmed with the canvas doc owner. Risk: presets designed on a 1440 px display may produce overlapping or undersized widgets on a 1024 px display.

**12.4 Handout push reversibility** — UX-CMD-006 describes the push as reversible (DM can remove the widget from player canvases via the Player-View Controller). The exact mechanism — does the widget disappear from the player's canvas, or does the player control its removal? — must be resolved with `11-collaboration-permissions.md`. If players can dismiss handout widgets themselves, the "reversibility" for the DM changes meaning.

**12.5 Multi-DM or co-DM scenario** — The current spec assumes a single DM role per session. If a future requirement allows co-DM (two users with DM capability), the Player-View Controller and session phase controls must define merge semantics (who can push to players? both? last-write-wins?). This is out of scope for v2 but the architecture should not preclude it.

**12.6 Session phase "recap" surface** — CMD-006 includes a "recap" phase after session end. This document does not specify the recap surface (it is likely a different route from the Command Center). The handoff from "End session → recap" must be owned by a sibling document or added to this one. Currently unassigned.

---

## Sources

[1] NASA Human Integration Design Handbook (HIDH), Chapter 10: Displays — NASA — https://human-factors.arc.nasa.gov/hidh/

[2] OBS Studio Overview — OBS Project Wiki — https://obsproject.com/wiki/OBS-Studio-Overview

[3] Dashboard Design Best Practices — Nielsen Norman Group — https://www.nngroup.com/articles/dashboard-design/

[4] Grafana Dashboards Documentation — Grafana Labs — https://grafana.com/docs/grafana/latest/dashboards/

[5] Foundry VTT Scene Documentation — Foundry Gaming LLC — https://foundryvtt.com/article/scenes/

[6] Roll20 Player Management Help — Roll20 — https://help.roll20.net/hc/en-us/articles/360037256714-Managing-Players

[7] Owlbear Rodeo 2.1 Release Notes (Sharing bar feature) — Owlbear Rodeo — https://www.owlbear.rodeo/blog/whats-new-2-1

[8] Alchemy RPG Director Mode — Alchemy RPG Blog — https://alchemyrpg.com/blog/director-mode

[9] Elgato Stream Deck Software — Elgato — https://www.elgato.com/en/downloads

[10] Kanka Campaign Dashboard — Kanka.io — https://kanka.io/en-US/docs/1.0/campaign-dashboard

[11] Notion Home (2024 redesign) — Notion — https://www.notion.so/help/home
