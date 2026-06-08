# UX Requirements — Sessions / Live Play

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read `00-overview-and-principles.md` first — it defines the shared principles, the parameter rubric, the requirement-ID scheme, the platform profiles, and the design tokens this document builds on.
>
> **Status:** Draft v1
> **Functional requirement coverage:** `SES-001..012`
> **Owner surface(s):** Session lifecycle controls · Combat / Initiative Tracker panel · Encounter Builder panel · Dice Tools panel · Live Tools / Timer panel · Quick Reference panel · Prep & Recap workflow · Player sync controller

---

## 1. Scope

- **Covers:** All UI surfaces that belong to a live session: the session lifecycle controls (start, pause, resume, end, archive, recovery); the combat tracker — turn order list, current-turn emphasis, HP / conditions / concentration / death saves at a glance, advance/previous turn, round counter, add/remove/reorder combatants, delay/ready actions, defeated state, mass combatants, secret/hidden combatants, and visibility enforcement; the Encounter Builder (pre-fight assembly, challenge guidance); the Dice Tools panel (expression entry, advantage/disadvantage, modifiers, visibility control, roll history, rollable tables, note append); the Live Tools / Timer panel (start, pause, resume, reset, advance, grant, project); the Quick Reference panel (pinned notes, stat-block snippets, open threads, session context); and the Prep & Recap workflows (digest, campaign calendar, continuity prompts). Covers what syncs live to players and how the DM controls that sync in the combat context.

- **Does NOT cover:** The generic canvas widget drag/resize/lock mechanics, which live in `04-canvas-scene-widgets.md`. Command Center composition and the session phase-badge and Player-View Controller are specified in `05-command-center.md` — this document specifies the session tools that inhabit those panels. The character sheet HP/conditions widget anatomy is specified in `07-characters.md`; the combat tracker *references and embeds* those bindings (CHAR-006) but does not redefine them. Global navigation chrome is specified in `02-navigation-and-platform-profiles.md`. Sync, conflict resolution, and offline behavior are specified in `12-sync-offline-reliability.md`. Collaboration and permission-grant UI live in `11-collaboration-permissions.md`. Audio atmosphere widget is covered in `13-audio-atmosphere.md`. Design tokens, spacing scale, and motion system are defined once in `01-visual-design-system.md` and consumed here without redefinition.

- **Related functional requirements** (`../requirements/05-sessions.md`):
  - `SES-001` — Session lifecycle: start, pause, resume, end, archive, recover with full state persistence
  - `SES-002` — Combat: initiative, rounds, turns, HP, conditions, concentration, death saves, stat-block preview, encounter log
  - `SES-003` — Dice: expressions, macros, inline rolls, rollable tables, shared roll history
  - `SES-004` — Handout delivery to selected players (handled by Command Center push; referenced here only for combat-context handouts)
  - `SES-005` — Timer / tool widget operator grants and operation
  - `SES-006` — Encounter Builder: combatant selection, challenge guidance, terrain notes, loot, session-log link
  - `SES-007` — Quick Reference panels: pinned notes, stat blocks, open threads, session context
  - `SES-008` — Rollable tables and contextual generators with result attribution
  - `SES-009` — Prep / Recap workflow: threads, recent changes, handout outcomes, combat summary, continuity prompts
  - `SES-010` — Async action model: pending / success / failure / retry / undo across all session commands
  - `SES-011` — Session workflow states: idle → prep → active → paused → ending → recap → archived
  - `SES-012` — Campaign calendar and custom-time state, date links to notes/sessions/maps

- **Related UX docs:**
  - `01-visual-design-system.md` — tokens, typography, density modes, motion system (consumed; not redefined here)
  - `02-navigation-and-platform-profiles.md` — profile breakpoints, global nav chrome
  - `03-accessibility.md` — global a11y baseline; this doc adds surface-specific details
  - `04-canvas-scene-widgets.md` — canvas widget mechanics that host these panels
  - `05-command-center.md` — session phase controls, Player-View Controller, status strip that embed this surface
  - `07-characters.md` — HP/conditions/resource widgets that the combat tracker binds to (CHAR-006)
  - `11-collaboration-permissions.md` — capability-set model that gates combat-participant writes, timer grants
  - `12-sync-offline-reliability.md` — live-sync state, optimistic UI, undo/retry model
  - `13-audio-atmosphere.md` — audio widget referenced on Command Center alongside session tools

---

## 2. UX goals for this surface

Sessions / live play is the **hottest hot path in the entire product.** The DM is running a room: tracking seven combatants while improvising dialogue, fielding player questions, and glancing at a tablet propped beside a physical battle map. Every session surface must optimize for speed, zero-surprise, and absolute safety against accidental data reveal. The initiative tracker is the nervous system; everything else is in service of it.

| Parameter | Goal for this surface |
|---|---|
| **Visual appeal** | The combat tracker looks like a premium, purpose-built scoreboard: row anatomy is consistent, typography is bold where it needs to be (turn name, HP), atmospheric without sacrificing legibility. The "current turn" row is dramatically distinct — it cannot be missed across a table. Dice history is compact and chronological, never cluttered. The overall palette uses semantic color tokens only (HP green/red, condition amber, dead grey) with no arbitrary decoration. |
| **Information scent** | A DM glancing from three feet away can answer: "Whose turn?", "What's their HP?", "What round is it?" without leaning in. Initiative position, HP value, and round counter each have permanent spatial positions in the tracker. Condition tags on each row label by name (Paralyzed, Unconscious) — never icon-only. Roll history entries identify actor, expression, and total at a glance. |
| **Navigability** | Advancing a turn: 1 tap or 1 keypress (Space/Enter). Opening combat from the Command Center: ≤2 taps. HP edit: tap number → inline stepper → confirm — 3 interactions maximum for an arbitrary value change. Session lifecycle transitions: always ≤2 actions from the Command Center status strip. No session tool requires more than 3 navigation steps to reach from the active Command Center view. |
| **Intuition / learnability** | An empty combat tracker teaches with an inline prompt: "Add combatants to begin — drag in characters or tap + to add." The Encounter Builder challenge-guidance display updates live as combatants are added. First dice roll succeeds with the default expression (1d20) without any configuration. Roll history is reverse-chronological — newest at top, matching user expectation from chat/messaging metaphors. |
| **Accessibility** | WCAG 2.2 AA floor on all surfaces. Turn advance operable by keyboard (Space/Enter). HP stepper keyboard-navigable (arrow keys, type-to-enter). Combat tracker rows meet ≥44 CSS px touch-target height on Tablet/Mobile. Conditions have text labels, not icon-only. Current-turn row is identified programmatically (aria-current="true") for screen readers. Dice roll results announced via live region. Timer state changes announced. Hidden-combatant rows are not read to players' AT. |
| **Adaptability (platform profiles)** | Desktop: full multi-column tracker with persistent sidebar; keyboard shortcuts throughout. Tablet: comfortable-density tracker in a floating or pinned panel beside the map; ≥44 px rows; touch-first advance controls. Mobile: slim tracker focused on turn name + HP + advance button; full tracker accessible via a sheet; same Processing Core commands produce identical results across all profiles. |
| **Effective emphasis (visual hierarchy)** | The "current turn" combatant row is the single most visually prominent element in the tracker at all times: 4 px colored left border, elevated background (`--color-surface-elevated`), bold name, larger HP number. Round counter is the second most prominent element. All other combatant rows are subordinate. One primary CTA per panel (Advance Turn in the tracker; Roll in dice panel; Build encounter in the builder). |
| **Feedback & responsiveness** | HP change: optimistic UI update within 100 ms; reconcile on server acknowledgment. Turn advance: immediate visual state change; live-region announcement. Roll result: displayed within 100 ms of server computation. Timer tick: live display update every second. All async session commands follow the standard model (SES-010): pending → success/failure → retry/undo. |
| **Error prevention & recovery** | Advance-turn and HP-edit are reversible (undo within the session via SES-010 inverse command). Removing a combatant mid-combat requires confirmation. Ending a session requires two-step confirmation (per `05-command-center.md`). Secret-roll result is never surfaced in the player-visible history view regardless of client-side state. Adding a combatant during an active combat is non-destructive (appended at bottom, DM reorders). No combat-state operation is irreversible without explicit "permanent" confirmation. |
| **Consistency** | HP stepper pattern is the same component used in `07-characters.md`. Condition badge anatomy is the same tag component used across the character sheet. Roll-history entry layout (actor · expression → total · timestamp) is identical in the dice panel and any embedded roll-history in the recap digest. Session workflow state names (idle, prep, active, paused, ending, recap, archived) are the same tokens used in the Command Center phase badge. |

---

## 3. Researched best practices

### 3.1 Glanceability at combat-table distances

NN/g's dashboard usability research establishes that key indicators must be readable within a 1–2 second glance without foveal focus ("glance contract") [1]. Applied to combat: the DM at a table looks up from dice, back to the screen, and must re-orient instantly. Sports scoreboard design — studied extensively by Durability Sciences and broadcast graphics teams — establishes three rules for glanceable displays: (a) the "live" element (current team / current turn) occupies a spatially fixed and visually elevated region that never changes position; (b) the primary number (score / HP) is the largest typographic element in each row; (c) sequential state (quarter / round) is always visible without scrolling [2]. *Implication: The initiative tracker must have the current-turn row permanently distinguished by position, elevation, and type scale — not just color — so it survives peripheral vision and DM-versus-table gaze switching.*

### 3.2 Foundry VTT combat tracker — what works and what does not

Foundry VTT's combat tracker (v11/v12) is the reference implementation most studied by TTRPG toolmakers [3]. Key findings from community and documentation review: the "Next turn" button at the top of the tracker panel with a keyboard shortcut (default: `End` key) is correctly identified as the highest-frequency combat action and given prime real estate. The combatant list uses 48 px rows with a portrait thumbnail, name, initiative value, HP display, and a set of status-effect icons — which is close to the research-backed minimum for comfortable table-distance readability. However: (a) Foundry's condition icons are icon-only without persistent labels, requiring hover to identify them — a known accessibility and glanceability failure; (b) the "defeated" state (skull icon + greyed row) is not visually distinct enough in a long list; (c) HP editing requires a right-click context menu, which is a multi-step action under table pressure [3]. *Implication: This product must provide persistent condition text labels on each row, a more dramatic defeated state (strikethrough + 50% opacity + muted color treatment), and a single-tap inline HP edit that does not require a context menu.*

### 3.3 Improved Initiative — purpose-built combat tracker exemplar

Improved Initiative (https://www.improved-initiative.com/) is a free, browser-based combat tracker designed specifically for D&D 5e. It demonstrates: (a) a persistent "Next" button occupying a dedicated top strip, thumb-reachable on tablet; (b) each combatant row includes HP as an editable number with inline +/− stepper; (c) conditions listed as text chips (not icons alone); (d) the initiative number is displayed in a separate column, always visible regardless of row state [4]. Community use at tables confirms its efficiency. Limitation: its mobile view collapses too aggressively, losing the HP column. *Implication: Adopt its row anatomy (name | initiative | HP | conditions) but extend it with a richer "current turn" treatment and a mobile-friendly slim row that preserves at least name and HP.*

### 3.4 D&D Beyond Encounters / Encounter Builder

D&D Beyond's Encounters tool (https://www.dndbeyond.com/encounters) provides integrated character HP syncing, mass HP editing ("Apply to all"), and a round/turn counter visible at the top of the screen [5]. The challenge-guidance display in its Encounter Builder shows difficulty band (Easy / Medium / Hard / Deadly) updating live as monsters are added. This is the clearest product-level example of the pattern. Limitation: it is web-only and session state is cloud-locked; the UX requires a D&D Beyond account for all combat participants to benefit from HP sync. *Implication: Adopt live challenge-guidance display and mass-edit HP pattern; avoid account-gating; local-first model (SES-001) must persist full combat state offline.*

### 3.5 Roll20 turn tracker — anti-patterns to avoid

Roll20's turn tracker (https://wiki.roll20.net/Turn_Tracker) renders initiative values as manual-entry numbers without automated advance, requires GM to drag tokens into the tracker, and places HP editing on a separate token properties panel (4–5 clicks from the tracker) [6]. The tracker row height is approximately 32 px in the default layout — below comfortable touch-target thresholds and barely readable at arm's length. Turn advance requires a separate button that is not always in the same screen position depending on window state. *Implication: These are the primary anti-patterns this product must avoid: HP editing separate from the tracker row, row height below 44 px on touch surfaces, and advance-turn control that is not spatially stable.*

### 3.6 Owlbear Rodeo — minimal-friction live tools

Owlbear Rodeo (https://www.owlbear.rodeo/) demonstrates that live-session tools benefit from minimal chrome: no settings buried behind menus, all operational controls visible in the primary view [7]. Its initiative tracker (added in v2) uses a persistent "Next player" affordance at the top and a clean list. *Implication: Session tool panels should expose all operational controls (advance, add, HP edit) in primary view without requiring a submenu or settings panel to reach them during combat.*

### 3.7 Dice roller UX — expression input and roll history

Studies of developer tool design (command-line interfaces, REPLs) and dice-rolling apps establish that: (a) the primary input for an expression editor should be pre-focused and support keyboard submission (Enter to roll); (b) a persistent roll history immediately below the input is the clearest affordance (matches chat/REPL mental model); (c) advantage/disadvantage is best exposed as a segmented control or three-state button (Normal / Advantage / Disadvantage) — not as a modifier value the user must know ("kh1") [8]. *Implication: The default dice entry shows an expression input pre-focused on panel open, a three-state advantage/disadvantage selector, and a roll history that is part of the same panel — not a separate route.*

### 3.8 Timer UX — pressure, not precision

Research on time-pressure UI in competitive games (e.g., chess clocks, Jackbox-style timers) shows that countdown timers under ≈60 seconds should show time remaining in large, high-contrast numerals, with a visual urgency indicator (color change or animation) in the final 10 seconds [9]. Countdown digits should be at least 24 px for arm's-length readability. *Implication: The timer widget (SES-005) renders its remaining time in ≥24 px numerals; the final 10 seconds trigger a color transition to `--color-danger` with reduced-motion fallback (bold label change only).*

### 3.9 Hidden combatants and DM/player information asymmetry

TTRPG community analysis of VTT combat tracker design identifies information leakage as the highest-severity failure mode: players seeing an enemy's true HP, name, or conditions before the DM reveals them breaks narrative immersion and session trust [3][6]. Foundry VTT addresses this with a "Secret" combatant option that shows a "?" placeholder to players; Roll20 hides the token from the tracker entirely. NN/g's research on privacy in collaborative tools establishes that the *absence* of a UI element is a weak signal — users notice "holes" in lists — while a visible placeholder with unknown identity (generic label + "?") preserves the sense of a populated encounter without leaking data [1]. *Implication: Hidden combatants in the player-visible combat tracker must render as a named placeholder ("Unknown creature" or DM-configured alias) with HP hidden; the DM view shows the real name with a visible "Hidden from players" indicator. HP of hidden combatants is never rendered in any player-accessible view, including error states, roll history, and network payloads.*

---

## 4. Reference implementations (exemplars)

| Product | What they do well (specific) | Principle / why it works | Borrow / Avoid | Link |
|---|---|---|---|---|
| **Foundry VTT** (combat tracker) | Dedicated "Next turn" button with keyboard shortcut; 48 px combatant rows with portrait + name + initiative + HP + status icons; defeated state (skull + grey) | Prime-real-estate advance control; spatially stable; readable at distance | Borrow: row anatomy, dedicated advance button, initiative column always visible. Avoid: icon-only conditions, right-click HP edit, non-distinct defeated state in long lists | https://foundryvtt.com/article/combat/ |
| **Improved Initiative** | Inline HP editing per row (+/− and text); text-label condition chips; persistent "Next" control at top of tracker; open-source, browser-based | Combat tracker designed for the DM's actual workflow; no settings round-trips | Borrow: inline HP stepper per row, text-chip conditions, dedicated advance strip. Avoid: mobile collapse that drops HP column | https://www.improved-initiative.com/ |
| **D&D Beyond Encounters** | Live challenge-guidance band in Encounter Builder; round/turn counter always at top; HP sync to character sheets | Product-level validation that challenge guidance and HP sync are tractable features, not research projects | Borrow: live challenge display, mass HP edit, prominent round/turn counter. Avoid: account-gating for all participants | https://www.dndbeyond.com/encounters |
| **Roll20 turn tracker** | (negative exemplar) 32 px rows, HP editing 4–5 clicks from tracker, non-stable advance button position | What not to build — the exact pattern that breaks live-play flow | Avoid: all of the above | https://wiki.roll20.net/Turn_Tracker |
| **Owlbear Rodeo** | Minimal chrome: all operational controls in primary view; initiative tracker with "Next player" top affordance | Live tools must not require menus to reach operational controls | Borrow: operational controls in primary view, minimal chrome. Avoid: lack of HP display on combatant rows | https://www.owlbear.rodeo/ |

**North-star narratives**

1. **From Improved Initiative:** The single most important lesson is that the HP number on each combatant row must be directly, immediately editable — one tap, then a stepper or numeric entry, then done. No right-click, no separate panel, no confirmation beyond the stepper itself. Under table pressure the DM has half a second to record a hit; the product must meet them there.

2. **From Foundry VTT (combat tracker):** Advance-turn must have a single, large, spatially fixed button that is always the same distance from the DM's thumb or cursor. It is the highest-frequency action in the product. Keyboard shortcut (Space when tracker is focused, or a global combat shortcut) must work without focus gymnastics. This one affordance defines the "tempo" of the entire session surface.

3. **From D&D Beyond Encounters:** Challenge guidance in the Encounter Builder must update live — not on submit, not on a "Calculate" button. Every combatant the DM adds should immediately show the updated difficulty band. This is what separates a useful pre-fight planning tool from a spreadsheet.

---

## 5. UX/UI requirements

### UX-SES-001 — Session lifecycle controls: clear phase display and transition affordances

- **Requirement:** The session phase (idle / prep / active / paused / ending / recap / archived) is permanently visible in the Command Center status strip (per `05-command-center.md`, UX-CMD-003). All valid next-phase transitions are reachable within 2 taps/clicks from the current view. Invalid transitions are hidden (not disabled) from transition menus.
- **Rationale:** SES-001 / SES-011. The DM must never hunt for "Start session" or "End session" under live-play pressure. Hiding invalid transitions (rather than greying them) reduces cognitive scanning cost [1].
- **Spec:** Session phase transitions are owned by `05-command-center.md` (UX-CMD-010). This document adds the following in-combat-surface-specific affordances: (a) while session is `active`, a "Pause session" button appears in the combat tracker header (secondary button, `--text-label-sm`, 44 px target), in addition to the status-strip control. (b) During `recap`, the Prep/Recap panel automatically shifts to `recap` mode and a "Create recap notes" CTA appears as the primary button. (c) Session-state-gated tools (dice, live timer) show an inline state-specific message when the session is not `active`: copy "Available when session is active. Start the session from the Command Center." with a direct link to the Command Center (not a dismissible modal).
- **States:** per-tool state gate: visible + active (session active); visible + info-message + link (any other state); loading (session state initializing — tools show skeletons)
- **Platform profiles:**
  - Desktop: Pause button visible in tracker header; state-gate messages inline below tool headings
  - Tablet: same; Pause button 44 px target; messages below heading
  - Mobile: Pause button in tracker floating action strip; state-gate messages shown as compact inline banners
- **Input:** pointer · touch · keyboard (Tab to Pause button; Enter to pause; link to Command Center focusable via Tab)
- **Accessibility:** Pause button `aria-label="Pause session"`; state-gate message rendered in a `role="status"` region; session-phase changes from `05-command-center.md` announce via `aria-live="assertive"`
- **Acceptance criteria:**
  - Given an active session, when the DM views the combat tracker, then a "Pause session" control is visible in the tracker header without scrolling.
  - Given the session is not active, when the DM opens the Dice Tools panel, then an inline message explains the state and provides a link to start the session.
  - Given the session reaches the recap state, when the DM opens the Prep/Recap panel, then its mode is automatically set to recap and a "Create recap notes" CTA is primary-visible.
- **Priority:** Must-have

---

### UX-SES-002 — Session state persistence and recovery prompt

- **Requirement:** When the application restarts during an active or paused session, the system either automatically restores full session state (combat position, dice history, timers, party location, handout log) within 3 seconds, or presents an explicit, unambiguous recovery prompt before the DM can interact with any session tool.
- **Rationale:** SES-001. Losing combat state mid-session is the highest-severity session-tool failure. State restoration must be deterministic and visible [1][3].
- **Spec:** On vault open, the processing core checks session workflow state. If `active` or `paused`: (a) if all state is restorable, show a full-screen recovery banner (not a toast): "Session restored — [Session name] / Round [N] / [Combatant Name]'s turn" with a "Continue" CTA and a "View details" expandable showing the restored state summary. (b) If state is partially restorable (e.g., timer state missing), show the banner with a warning: "Some state could not be restored: [specific item]. Continue with partial state or start a new session?" with two CTAs. Recovery banner must be dismissed before any session tool is interactive (modal lock). The DM cannot accidentally interact with a wrong-session state.
- **States:** restoring (full-screen skeleton + spinner, max 3 s); restored (banner, "Continue" CTA); partial-restore (banner + warning list + two CTAs); no-restore-needed (no banner, normal app launch)
- **Platform profiles:** Full-screen banner on all profiles; "View details" expandable; two CTAs stacked on Mobile
- **Input:** keyboard (Tab to "Continue"; Enter; Tab to "View details"; Enter to expand); touch (tap CTAs); pointer (click)
- **Accessibility:** Banner is `role="alertdialog"` `aria-modal="true"` with `aria-labelledby` pointing to the recovery title; focus locked until dismissed; announces "Session restored — [name]. Press Enter to continue." on focus entry
- **Acceptance criteria:**
  - Given an active session, when the app restarts, then within 3 seconds either the session is fully restored or a recovery prompt is displayed.
  - Given the recovery banner is displayed, when the DM attempts to click a dice tool before dismissing it, then the dice tool is not interactive.
  - Given a partial restore, when the DM views the recovery banner, then the specific item(s) that could not be restored are named.
- **Priority:** Must-have

---

### UX-SES-003 — Combat tracker: combatant row anatomy and glanceability

- **Requirement:** Each combatant in the initiative tracker renders as a single row with a fixed anatomy: [initiative value] [portrait or monster icon] [name] [HP: current/max] [AC] [condition tags] [actions icon group]. The row must be readable at ≥60 cm / 24 in viewing distance without leaning in. Minimum row height: 52 px on Desktop; 60 px on Tablet; 64 px on Mobile.
- **Rationale:** SES-002. Scoreboard and sports-display research establishes 48–56 px minimum row height for arm's-length readability [2]. Roll20's 32 px rows are the failure baseline [6]. Improved Initiative's inline anatomy is the success reference [4].
- **Spec:**
  Row anatomy (left to right):
  - **Initiative cell** (40 px wide): initiative value in `--text-mono-md` (16 px), center-aligned; drag handle overlaid on hover/focus for reordering
  - **Portrait/icon** (36×36 px): character portrait thumbnail for PCs; monster silhouette icon (from icon set in doc 01) for NPCs/monsters; hidden combatant shows "?" with muted opacity overlay (DM view shows real portrait with a small "hidden" badge)
  - **Name** (flex-grow): character/monster name in `--text-body-md` (14–16 px), truncated at 28 chars with `title` tooltip for full name; for PCs, clicking the name navigates to the character sheet (new tab on Desktop, sheet overlay on Tablet/Mobile)
  - **HP** (72 px wide): current HP in `--text-heading-sm` (18 px bold), "/" separator, max HP in `--text-body-sm` (13 px muted). Color: HP ≥ 50% of max = `--color-text-primary`; 25–49% = `--color-warning`; 1–24% = `--color-danger`; 0 = `--color-text-muted` (defeated treatment applies separately). Tap/click the HP number opens the inline HP editor (see UX-SES-005).
  - **AC** (36 px wide): AC value in `--text-body-sm`, shield icon prefix, center-aligned
  - **Conditions** (flex, min 0, max wraps below name on Tablet/Mobile): text chip tags per condition (e.g., "Paralyzed", "Blinded", "Concentrating"), using the shared tag component from doc 01. Maximum 3 chips shown inline; "+N more" chip if more. Tapping "+N more" expands inline. No icon-only conditions.
  - **Actions** (44 px wide): a "•••" icon button (44×44 px target) opening a context menu: Edit HP · Set conditions · Set initiative · Delay · Ready action · Remove from combat (with confirmation)

  ASCII wireframe (Desktop, 52 px row height):
  ```
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │ Ini │ [img] │ Name (truncated)           │  HP: 32/45 │ AC:16 │ [Poisoned] ││•••│
  └──────────────────────────────────────────────────────────────────────────────┘
  ```
  ```
  ┌─────────────────────────────────────────────────────────┐
  │ 18  │ [?] │ Unknown creature           │  HP: ??  │ AC:? │ [•••] │  ← player view (hidden combatant)
  └─────────────────────────────────────────────────────────┘
  ```

- **States:**
  - default: full row as above
  - current-turn: see UX-SES-004 for full specification
  - defeated: name strikethrough; row opacity 50%; HP shows "0"; icon faded; row moves to bottom of active list (not removed, DM may revive)
  - delayed: "Delayed" chip appended to name cell; initiative position marked with a dash glyph
  - ready: "Ready" chip appended; initiative position preserved
  - hidden (player-visible tracker only): portrait = "?" placeholder; name = DM-configured alias or "Unknown creature"; HP = "— / —"; AC = "—"; conditions hidden; "hidden" badge not visible to players
  - hidden (DM-view tracker): real portrait with 3×3 px closed-eye badge overlay; "[H] Enemy Archer" label (bracketed H prefix indicates hidden); HP and conditions shown normally; red "Hidden from players" chip at end of row

- **Platform profiles:**
  - Desktop: full row anatomy as above, 52 px height; AC and conditions shown inline
  - Tablet: 60 px height; AC moves to a second line below name; conditions shown as chips below name (no separate column); portrait 40×40 px
  - Mobile (slim): 64 px height; portrait 36×36 px; name + HP on one line; AC hidden (accessible via ••• menu); conditions hidden inline (accessible via ••• menu → "View conditions"); initiative value shown as a small badge on the portrait
  ASCII wireframe (Mobile slim row):
  ```
  ┌────────────────────────────────────────┐
  │[18][img]  Gandalf the Grey   32/45  ███│
  └────────────────────────────────────────┘
                                      ↑ ••• button
  ```

- **Input:** pointer (click HP to edit; click ••• for menu) · touch (tap HP; tap •••; long-press row for quick actions) · keyboard (Tab to focus row; Enter to open ••• menu; `H` when row focused to edit HP; Up/Down arrows to navigate rows)
- **Accessibility:** Each row is a `<li>` with `role="listitem"` in `role="list"` `aria-label="Initiative order"`; name cell `aria-label="[Name], initiative [N], HP [current] of [max]"`; conditions announced as part of the row's accessible description; hidden combatant rows (`aria-hidden="true"` in the DOM for the player client — they are not included at all in the player-facing data model per SES-002 / PERM rules; the DM client renders them with a visual indicator); ••• button `aria-label="Actions for [Name]"` `aria-haspopup="menu"`
- **Acceptance criteria:**
  - Given seven combatants in the tracker, when the DM views it on a Tablet, then all row anatomy elements (name, HP, conditions) are visible without horizontal scrolling.
  - Given a hidden combatant exists, when a player client renders the initiative tracker, then that combatant's real name, HP, conditions, and portrait are not present in any rendered DOM node.
  - Given a combatant HP drops to 0, when the round advances, then that combatant's row is visually defeated (strikethrough, 50% opacity) and positioned below all non-defeated combatants.
- **Priority:** Must-have

---

### UX-SES-004 — Current-turn emphasis: unmistakable active combatant

- **Requirement:** The combatant whose turn is currently active must be visually distinct from all other rows by at least three independent visual dimensions (not color alone). The distinction must be visible at ≥1 m / 3 ft viewing distance (over-the-table glance from a player).
- **Rationale:** SES-002. The current-turn indicator is the primary DM reference point during combat, consulted every 5–15 seconds. Sports-display and scoreboard UX research establishes that the active row must be distinguishable in peripheral vision [2]. Color alone fails accessibility (non-color-differentiation requirement, WCAG 1.4.1) and fails degraded viewing conditions (glare, low contrast).
- **Spec:**
  Current-turn row treatment (all three applied simultaneously):
  1. **Left border accent**: 4 px solid `--color-status-live` (vivid green/teal semantic token), inset into the row left edge. Visible regardless of row position in the scrolled list.
  2. **Elevated background**: row background switches to `--color-surface-elevated` (a visually distinct elevation level above the default row background), creating a subtle but clear card-lift effect.
  3. **Bold name + larger HP**: the name renders in `--text-body-md-strong` (bold weight, same size); the current HP number renders at `--text-heading-md` (20 px, up from 18 px). This size delta is subtle but perceivable peripherally.
  4. **Turn indicator chip**: a small "▶ Your turn" chip at the far right of the name cell (visible in the tracker for the DM; in the player-visible tracker shows "▶ Active" for the non-hidden combatant).
  5. **Scroll behavior**: the current-turn row is always in view. On turn advance, if the incoming row would be below the fold, the tracker scrolls it into view with a 150 ms ease-in-out animation (reduced-motion: instant scroll, no animation).

  Current-turn row ASCII (Desktop):
  ```
  ┌──────────────────────────────────────────────────────────────────────────────────┐
  ┃ 20  │ [img] │ ▶ Aria Nightwind [Your turn]  │  HP: 28/35 │ AC:17 │ [Blinded] ││•••│  ← elevated bg, 4px border
  └──────────────────────────────────────────────────────────────────────────────────┘
  ```

- **States:**
  - current-turn: all five treatments active as above
  - current-turn + defeated: impossible (defeat triggers end-turn / advance); if the combatant is downed on their turn, their row shows defeated treatment and turn auto-advances after DM confirmation
  - current-turn in player-visible tracker: same visual treatment on the non-hidden combatant; if the current-turn combatant is hidden, players see the "Unknown creature" row with the "▶ Active" chip

- **Platform profiles:**
  - Desktop: full treatment (4 px border, elevated bg, bold name, larger HP, chip)
  - Tablet: same treatment; HP number at `--text-heading-sm` (18 px, up from 16 px)
  - Mobile: left border reduced to 3 px; elevated bg; name bold; HP size unchanged (mobile rows already use larger base); chip shows "▶" only (no text) due to row width constraints; full chip visible via screen reader

- **Input:** (no direct input — this is a display specification; advancing the turn is specified in UX-SES-006)
- **Accessibility:** Current-turn row `aria-current="true"` on the `<li>` element; when turn advances, `aria-live="assertive"` announces "It is now [Name]'s turn, round [N]"; for hidden combatants the announcement on the player client says "Unknown creature's turn"
- **Acceptance criteria:**
  - Given an active combat with 8 combatants, when the DM views the tracker, then the current-turn combatant row is visually distinct by at least 3 dimensions (border, background, typography).
  - Given the current-turn row is scrolled below the visible tracker area, when the turn advances to a new combatant, then the tracker scrolls the new current-turn row into view within 300 ms.
  - Given a player client rendering the tracker, when a hidden combatant's turn becomes active, then the player's screen shows "Unknown creature" with the "▶ Active" indicator — not the real name.
- **Priority:** Must-have

---

### UX-SES-005 — HP editing: inline stepper, undo, no context menu required

- **Requirement:** The DM can edit any combatant's current HP from the initiative tracker with at most 2 taps/clicks and no context menu. HP changes are immediately reflected in the tracker (optimistic update) and reversible via undo within the session (SES-010). Negative HP is rejected with inline feedback; HP is clamped at 0 (defeated) and at max HP.
- **Rationale:** SES-002 / SES-010. Roll20's 4–5 click HP edit is the documented anti-pattern [6]. Improved Initiative's inline +/− stepper is the reference [4]. HP editing under table pressure requires the fewest possible interactions.
- **Spec:**
  Inline HP editor trigger: single tap/click on the HP number in the row. On trigger, the HP display in-place transforms to an edit mode:
  - **Stepper layout** (appears in-row, pushes other cells aside by expanding the HP cell to 160 px):
    - `[−]` button (44×44 px, subtracts damage)
    - Current HP number in a numeric input field (48 px wide, `type="number"`, `min="0"`, `max=[maxHp]`, value = current HP)
    - `[+]` button (44×44 px, adds healing)
    - `[✓]` confirm button (44×44 px) or press Enter
    - `[✕]` cancel button (32×44 px) or press Escape
  - Label above stepper (12 px, muted): "HP (current / [max])"
  - −/+ buttons: decrement/increment by 1. For bulk damage: the user types a value directly into the field or holds the button (auto-repeat at 150 ms after 400 ms hold).
  - On confirm: processing core receives the command; UI immediately shows optimistic new value; if the value would exceed max HP, it is clamped to max HP and a brief toast "Healed to maximum" is shown; if the value would go below 0, it is clamped to 0 and a "Combatant defeated?" confirmation appears (see below).
  - **Defeated confirmation:** when HP is set to 0, a small inline confirmation appears below the row: "Mark [Name] as defeated? [Yes — defeated] [No — keep at 0]". If "Yes", the defeated visual treatment activates (per UX-SES-003). If "No", the row stays with HP = 0 and no defeated treatment (e.g., concentrating on last breath situations).
  - **Undo:** every HP change recorded via SES-010's async action model supports undo. A toast appears after any HP change: "[Name] HP: [old] → [new]. Undo?" with an Undo button. The toast persists for 8 seconds. Undo applies the inverse command immediately.

- **States:**
  - HP display: default (tap to edit)
  - HP editor: open (stepper visible)
  - HP editor submitting: confirm button shows spinner (≤100 ms)
  - HP editor optimistic: new value shown; spinner; reconciles within 1 s
  - HP editor error: input border red + inline message ("Invalid HP value")
  - HP undo toast: visible for 8 s
  - defeated-confirm: inline below row

- **Platform profiles:**
  - Desktop: stepper expands in-row; keyboard support throughout; stepper auto-closes on row focus loss
  - Tablet: stepper expands in-row, 60 px row accommodates expansion; +/− buttons 48×48 px
  - Mobile: tapping HP number on a mobile slim row opens a compact sheet (bottom drawer, 30% viewport height) with the same stepper + confirm/cancel; the tracker row itself is not expanded to preserve readability

- **Input:** pointer (click HP number; click +/−; click confirm/cancel) · touch (tap HP number; tap +/−) · keyboard (when row focused, press `H` to open HP editor; Tab to +/− and field; Up/Down arrows increment/decrement; Enter to confirm; Escape to cancel)
- **Accessibility:** HP numeric input `aria-label="HP for [Name]"`; −/+ buttons `aria-label="Decrease HP for [Name]"` / `aria-label="Increase HP for [Name]"`; on confirm, live region announces "[Name] HP updated to [N]"; undo toast announced via `aria-live="polite"` with an accessible "Undo" button; defeated confirmation `role="alertdialog"` with focus on "No — keep at 0" as the safer default
- **Acceptance criteria:**
  - Given an active combat, when the DM taps a combatant's HP number, then an inline stepper appears within 100 ms without navigating away from the tracker.
  - Given the HP stepper is open and the DM types 42 and confirms, then the row immediately shows "42/[max]" and a undo toast appears.
  - Given HP is set to 0, when the DM taps "Yes — defeated", then the row gains the defeated visual treatment and the defeated row moves below active combatants.
  - Given an HP change was made, when the DM taps "Undo" on the toast within 8 seconds, then the HP is restored to the previous value via the core's inverse command.
- **Priority:** Must-have

---

### UX-SES-006 — Advance and previous turn: primary hot-path control

- **Requirement:** The DM can advance to the next combatant's turn or return to the previous combatant's turn with exactly 1 tap/click or 1 keyboard action. The advance control is the spatially stable primary CTA of the combat tracker panel, always visible without scrolling, sized for reliable one-handed touch.
- **Rationale:** SES-002. Turn advance is the single highest-frequency action during combat (multiple times per round). Any control requiring more than 1 action or requiring the DM to look away from the table is a design failure [2][4].
- **Spec:**
  **Tracker header strip** (always visible at top of the combat tracker panel, position: sticky top, height: 56 px Desktop / 60 px Tablet / 64 px Mobile):
  - Left cell: "◀ Prev" button (secondary button style; 44 px height; 80 px width on Desktop; 60 px on Tablet; icon-only "◀" on Mobile with `aria-label`)
  - Center cell: round counter "Round [N]" in `--text-heading-sm` (18 px, center-aligned); if no combat active, "No combat"
  - Right cell: "▶ Next turn" button (primary button style using `--color-action-primary`; 44 px height; 120 px width on Desktop; 80 px on Tablet; full width on Mobile except for Prev button)

  On "Next turn": the processing core advances the turn; the tracker scrolls to the new current-turn row; a live-region announcement fires: "It is now [Name]'s turn, round [N]." If advancing from the last combatant in the round: the round counter increments and the first combatant becomes active; a brief "Round [N] begins" toast appears (2 s auto-dismiss).

  On "Prev": the processing core moves to the previous combatant (or the last combatant in the previous round if at round start); the tracker scrolls; live region announces the same format. This is the undo for accidental advance.

  **Keyboard shortcuts (when combat tracker panel is focused, or global during active session):**
  - `Space` or `Enter`: Next turn (primary hot key)
  - `Shift+Space` or `Shift+Enter`: Previous turn
  - `N` (global, active session only): Next turn (alternative when focus is outside the tracker panel)
  - `P` (global, active session only): Previous turn

  **End-of-combat:** when all remaining combatants are defeated or the DM ends combat (via ••• menu → "End combat"), the tracker header shows "Combat ended. [Create encounter log]" with a link to the encounter log creation flow. The "Next turn" button changes label to "New combat" which resets the tracker to empty.

- **States:**
  - no-combat: header shows "No combat" center; both Prev/Next disabled with `aria-disabled="true"`; buttons visually muted
  - combat-active: full treatment as above
  - advancing (submitting): Next button shows spinner for ≤100 ms; tracker row transitions
  - end-of-round: toast "Round [N] begins" 2 s auto-dismiss
  - end-of-combat: "Combat ended" header state

- **Platform profiles:**
  - Desktop: Prev (80 px) | Round N | Next (120 px) in header strip; keyboard shortcuts active
  - Tablet: Prev (60 px) | Round N | Next (80 px); touch targets ≥44 px; shortcuts active if keyboard attached
  - Mobile: Prev (icon, 60 px) | Round N (abbreviated "Rnd N") | Next (flex-fill); the Next button occupies all available space between Prev and the right edge

- **Input:** pointer (click Next/Prev) · touch (tap) · keyboard (`Space`/`Enter` for Next; `Shift+Space` for Prev; `N`/`P` global shortcuts during active session) · accessibility: keyboard shortcuts announced in a "help" tooltip on the Next button (`aria-describedby` pointing to a visually hidden shortcuts list)
- **Accessibility:** Next button `role="button"` `aria-label="Advance to next turn (Space)"` `aria-keyshortcuts="Space"`; Prev button `aria-label="Return to previous turn (Shift+Space)"` `aria-keyshortcuts="Shift+Space"`; round counter `role="status"` `aria-label="Round [N]"`; on turn advance, `aria-live="assertive"` region announces "It is now [Name]'s turn, round [N]"
- **Acceptance criteria:**
  - Given an active combat, when the DM presses Space, then the turn advances to the next combatant within 300 ms and a live-region announces the new active combatant.
  - Given the DM is on a tablet with no keyboard, when they tap "Next turn" with one thumb, then the turn advances (the button is ≥44 px in height and ≥80 px wide — easily hittable).
  - Given the DM accidentally advances the turn, when they tap "Prev", then the previous combatant becomes active and the live region announces the revert.
  - Given the last combatant in the round takes their turn and the DM advances, then the round counter increments and a "Round N begins" toast appears.
- **Priority:** Must-have

---

### UX-SES-007 — Conditions, concentration, and death saves: row-level display

- **Requirement:** Each combatant row displays active conditions as text-label chips (not icon-only), a concentration indicator if the combatant is concentrating on a spell, and death save state (successes/failures) for defeated-but-stabilizing combatants — all visible without opening a submenu.
- **Rationale:** SES-002. Icon-only conditions are a documented failure mode in Foundry VTT [3]. Text labels satisfy both DM and player comprehension at distance and satisfy WCAG's non-text content requirement (1.1.1).
- **Spec:**
  **Condition chips** (per UX-SES-003 row anatomy): each active condition renders as a text chip using the shared `<Tag>` component from doc 01. Tag copy = the condition name from the 5e standard list (Blinded, Charmed, Deafened, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious) plus any custom conditions defined for the campaign. Chip color uses the shared semantic token `--color-tag-condition` (amber). Maximum 3 chips inline; "+N more" chip (same style) reveals all in an inline expansion.
  **Concentration chip**: if the combatant is concentrating, a distinct chip "Concentrating" with a `--color-tag-concentration` token (distinct blue-purple from conditions amber) is shown first in the chip list, before other conditions. If the concentrating combatant takes damage, a brief "Concentration check!" toast appears (4 s, `--color-warning` background) with the DC prominently displayed.
  **Death save display**: shown only when HP = 0 and "Not defeated" was chosen (or combatant is unconscious, not dead). Below the name cell, a compact row: `☐ ☐ ☐` (failures, red) `☑ ☑ ☑` (successes, green) with each box tappable to toggle. Visible to DM in both DM and (if the combatant is a PC visible to players) player-visible tracker.

- **States:** chip default; concentration chip (present/absent); death save row (hp = 0, not defeated); condition-expansion ("+N more" expanded)
- **Platform profiles:**
  - Desktop: chips inline in row; concentration chip first; death saves below name if applicable
  - Tablet: chips below name line (second line of row); same chip anatomy; death saves below chips
  - Mobile: conditions hidden inline; accessible via ••• → "View conditions"; concentration chip shown as "C" badge on portrait; death saves accessible via ••• menu

- **Input:** pointer/touch (tap condition chip to remove; long-press to edit; tap +N to expand; tap death-save boxes) · keyboard (Tab to chip group; Space to expand; within expansion: arrow keys + Space to toggle individual conditions; Enter on a chip to remove it)
- **Accessibility:** Condition chips `role="listitem"` in a `role="list"` `aria-label="Conditions for [Name]"`; each chip has `aria-label="[Condition name] — press Delete to remove"`; concentration chip `aria-label="Concentrating on spell"`; death save boxes `role="checkbox"` `aria-checked`; "Concentration check!" toast `aria-live="assertive"`
- **Acceptance criteria:**
  - Given a combatant with the "Paralyzed" condition, when the DM views the tracker, then the word "Paralyzed" is visible in the row without hover, tooltip, or menu interaction.
  - Given a concentrating combatant takes damage, when the DM views the tracker, then a toast with the concentration check DC appears within 500 ms.
  - Given a combatant has HP = 0 and "not defeated" status, when the DM views the tracker, then three death save success and three failure checkboxes are visible for that combatant.
- **Priority:** Must-have

---

### UX-SES-008 — Add, remove, and reorder combatants; mass combatants; secret combatants

- **Requirement:** The DM can add a combatant to active combat from a character search or by quick-creating a stat block; add a group of identical combatants (mass combatants, e.g., "5× Goblin") in a single action; set any combatant as hidden/secret; and reorder combatants by drag or by explicit controls. Removing a combatant mid-combat requires one confirmation step.
- **Rationale:** SES-002. Mid-combat additions and secret combatants are high-frequency DM operations [3][5]. Mass combatant creation reduces friction for encounter-heavy sessions.
- **Spec:**
  **Add combatant button**: in the tracker header strip, an "Add +" text-icon button (secondary, 44 px, right of round counter on Desktop/Tablet; FAB overlay on Mobile). Opens an "Add combatant" drawer (Desktop: right-side 320 px drawer; Mobile: bottom sheet 60% height).
  Add drawer contents:
  - Search field (auto-focused): searches vault characters and monster compendium by name; results in a scrollable list of character cards (portrait + name + CR or level); tap to add.
  - "Quick-add" tab: minimal form: Name, Initiative (auto-rolls if blank), HP (max), AC, CR. Quantity stepper for mass add (1–20). For quantity > 1, combatants are created as "[Name] 1", "[Name] 2", etc.
  - "Hidden" toggle (default off): when on, the combatant(s) are added as hidden — player-visible tracker shows placeholder.
  - "Add" button (primary, full width).

  **Reordering**: each row has a drag handle (6 px wide, left of initiative cell; shows on hover/focus). Dragging reorders the initiative list. For touch: long-press (400 ms) on the row activates a drag mode. Keyboard reordering: when row is focused, `Ctrl+Up` / `Ctrl+Down` moves the combatant one position.

  **Remove combatant**: available via ••• → "Remove from combat". Confirmation dialog: "Remove [Name] from this combat? They can be re-added." [Remove] [Cancel]. Not permanently destructive — the combatant record and any linked character are unaffected.

  **Hidden toggle**: via ••• → "Toggle visibility (hidden/visible)". Toggling to hidden mid-combat immediately updates the player-visible tracker to show the placeholder. Toggling to visible reveals the real name and current HP to players.

- **States:** add-drawer-closed; add-drawer-open (search focused); adding (Add button loading); mass-add-progress (if quantity > 1, shows "Adding 4 of 5…"); reorder-drag-active (row elevated, drop targets highlighted); reorder-complete; remove-confirm (dialog); hidden-toggle-pending

- **Platform profiles:**
  - Desktop: Add button in tracker header; right-side 320 px drawer; drag handle on hover
  - Tablet: Add button in tracker header; bottom sheet 60% height; long-press drag on rows
  - Mobile: Add as FAB (floating above tracker list, bottom-right); bottom sheet; long-press drag

- **Input:** pointer (drag handle; click Add; click Remove) · touch (long-press drag; tap Add; tap Remove) · keyboard (Tab to "Add +" button; Enter to open drawer; Tab through form; Enter to add; `Ctrl+Up`/`Ctrl+Down` to reorder focused row; Tab to ••• menu; arrow keys to "Remove from combat"; Enter; Tab to confirm/cancel)
- **Accessibility:** Add drawer `role="dialog"` `aria-label="Add combatant"` `aria-modal="true"`; search field `aria-label="Search characters and monsters"`; quantity stepper `role="spinbutton"` `aria-valuemin="1"` `aria-valuemax="20"`; drag handles `role="button"` `aria-label="Drag to reorder [Name]"`; keyboard reorder announced: "[Name] moved to position [N]" via `aria-live="polite"`; remove confirmation `<dialog>` with focus on Cancel; hidden toggle announced: "[Name] is now hidden from players" via `aria-live="polite"`
- **Acceptance criteria:**
  - Given an active combat, when the DM adds "5× Goblin" via the quick-add tab, then five combatant rows appear in the tracker labeled "Goblin 1" through "Goblin 5" within 1 second.
  - Given the DM sets a combatant to hidden mid-combat, when a player client renders the tracker, then the player sees a placeholder row — not the real name or HP.
  - Given the DM removes a combatant, then a confirmation dialog appears before the row is removed from the tracker.
- **Priority:** Must-have

---

### UX-SES-009 — Encounter Builder: pre-fight assembly with live challenge guidance

- **Requirement:** The DM can build an encounter by selecting monsters/NPCs, specifying quantity, HP, and AC, entering terrain notes, and viewing a live challenge-difficulty band that updates as combatants are added. The built encounter can be started with one action, flowing combatants into the active combat tracker.
- **Rationale:** SES-006. D&D Beyond's live challenge-guidance display is the reference [5]. Pre-fight assembly reduces setup time during live play.
- **Spec:**
  The Encounter Builder is a panel available as a widget on the Command Center (DM-only — non-DMs see nothing per SES-006). It is also accessible via the tracker's "Build encounter" CTA when no combat is active.
  Panel sections (top to bottom):
  1. **Encounter title** — text input, required, max 64 chars.
  2. **Party parameters** — Party size (number stepper, 1–20, default 4) and Average level (1–20, default 3). Displayed inline as "Party: 4 × Lvl 3".
  3. **Challenge guidance banner** — persistent, updates live: difficulty band pill (Easy / Medium / Hard / Deadly) + point count. Color: Easy = `--color-success-muted`; Medium = `--color-warning-muted`; Hard = `--color-danger-muted`; Deadly = `--color-danger` (saturated). No "Calculate" button — purely derived.
  4. **Combatant list** — each added combatant as a card: [Qty ×] [Name] [CR: N] [HP: N] [AC: N] [Remove]. Remove is a trash icon (44 px target), no confirmation required (combatants are draft until "Build encounter" is pressed).
  5. **Add combatant row** — inline: Name (text), CR (0.125 / 0.25 / 0.5 / 1–30 select or numeric), Qty (1–20), HP (number), "Add combatant" button.
  6. **Terrain notes** — textarea, optional, max 500 chars.
  7. **"Build encounter" button** (primary, full width) — durable command; requires title. On success, encounter is saved and appears in the encounter list. A "Start combat" button appears on saved encounters.
  8. **Saved encounters list** — compact cards: [Title] [Difficulty badge] [N groups] [Start combat button].

  Starting combat from a saved encounter flows all combatants into the initiative tracker with their stored initiative values (or auto-rolls if initiative = 0) and opens the tracker panel.

- **States:** draft (combatants being added); building (Build button loading); built (encounter in list); starting-combat (loading → tracker opens); error (inline below Build button)
- **Platform profiles:**
  - Desktop: full panel as above, all sections visible; panel width ≥ 380 px
  - Tablet: same sections, compact spacing; challenge banner always visible (sticky top of panel); terrain notes collapsed by default (expand toggle)
  - Mobile (slim): simplified form: title + quick-add one combatant (name + CR + qty only) + Build; terrain notes hidden (accessible via "More options" drawer); challenge guidance banner shown; saved encounter list accessible via "Encounters" tab
- **Input:** pointer/touch (all fields standard interaction) · keyboard (Tab through form fields; Enter on "Add combatant"; Enter on "Build encounter")
- **Accessibility:** Challenge banner `role="status"` `aria-live="polite"` `aria-label="Encounter difficulty: [band], [N] points"` — updates announced on change; "Build encounter" button `aria-disabled="true"` with `aria-description="Enter a title to build"` when title is empty; combatant remove button `aria-label="Remove [Name] from encounter draft"`
- **Acceptance criteria:**
  - Given the DM adds a Deadly-level set of combatants, when the last combatant is added, then the challenge banner updates to "Deadly" within 100 ms without pressing any button.
  - Given a saved encounter with five combatants, when the DM clicks "Start combat", then the initiative tracker opens with all five combatants added and ready for initiative rolls.
  - Given the DM leaves the encounter title blank and clicks "Build encounter", then the Build button is inactive and an inline error message explains the requirement.
- **Priority:** Should-have

---

### UX-SES-010 — Dice Tools: expression input, advantage/disadvantage, modifiers, history

- **Requirement:** The DM (and players with session-active access) can roll a dice expression from a pre-focused input field, configure advantage / disadvantage / normal as a 3-state control, add a label and visibility (session-visible / DM-only / shared), and view a reverse-chronological roll history with actor, expression, individual dice values, and total visible per entry — all within a single panel without navigating away.
- **Rationale:** SES-003. Dice tools are high-frequency secondary actions (after turn advance) during combat. Expression input with advantage/disadvantage as a selector (not manual "2d20kh1") is the ergonomic improvement over current state (DiceTools.svelte uses raw expression only). Roll history is the canonical pattern from dice-roller and REPL UX research [8].
- **Spec:**
  Dice Tools panel layout (top to bottom):
  1. **Expression input** (auto-focused on panel open): placeholder "e.g. d20, 2d6+3, 4d8"; `type="text"`; full-width; supports dice notation grammar (1d4, d20, 2d6+3, 1d20kh1, etc.) validated client-side before dispatch. Submit on Enter.
  2. **Advantage / Disadvantage selector** (segmented control, 3 options): "Disadvantage | Normal | Advantage". Default: Normal. When Advantage: appends `kh1` to a d20-only expression automatically; for other expressions, a tooltip clarifies "Advantage applies to d20 rolls — use kh1 notation for other dice." When Disadvantage: appends `kl1` similarly.
  3. **Label input** (optional): placeholder "Label (optional — e.g. Stealth check)"; single-line text.
  4. **Visibility select**: segmented or dropdown with three options: "Session" (session-visible), "DM only" (secret), "Shared" (all players and DM). DM-only option hidden for non-DM actors.
  5. **"Roll" button** (primary, 44 px, right-aligned or full-width Mobile). Disabled when session is not active.
  6. **Rollable table section** (DM only, collapsible by default, "Tables ▾" toggle): table select dropdown + "Draw" button. Drawn results appear in roll history with row text.
  7. **Roll history** (reverse-chronological, max 100 visible entries, virtual-scroll for more): each entry (see UX-SES-011 for anatomy).

  Advantage/Disadvantage visual detail: the segmented control uses icon+label: "↓ Disadv. | — Normal | ↑ Adv." Selected segment has `--color-action-primary` fill.

- **States:** expression-empty (Roll button disabled); expression-valid (Roll button enabled); rolling (button spinner ≤100 ms); rolled (history entry appears at top); expression-invalid (red border + inline error after submit attempt); session-inactive (Roll button disabled + state-gate message per UX-SES-001); history-empty ("No rolls yet." meta text)
- **Platform profiles:**
  - Desktop: full layout as above, panel width ≥ 300 px; history is scrollable
  - Tablet: same layout; segmented control may wrap to 2-line; tables section collapsible
  - Mobile: expression input + adv/disadv + Roll button = primary view (label and visibility collapsed by default under "Options ▾"); history in a scrollable section below; tables section behind a "Tables" tab
- **Input:** pointer/touch (all controls standard) · keyboard (Tab through expression → adv/disadv → label → visibility → Roll; Enter to roll; in adv/disadv control: left/right arrow keys to change selection)
- **Accessibility:** Expression input `aria-label="Dice expression"` `aria-describedby` pointing to a visually-hidden grammar hint; adv/disadv control `role="radiogroup"` with three `role="radio"` options; label input `aria-label="Roll label (optional)"`; Roll button `aria-keyshortcuts="Enter"`; on roll, `aria-live="polite"` announces "[Label: ][expression] → [total]"; DM-only rolls do NOT announce to players' live regions
- **Acceptance criteria:**
  - Given the Dice Tools panel is open, when the DM presses Tab once, then focus is on the expression input.
  - Given the DM selects "Advantage" and types "d20+5" and presses Enter, then the roll is made with 2d20kh1+5 semantics and the history entry shows both dice values.
  - Given a roll is marked DM-only, when a player client's dice history is queried, then that roll is not present in any player-rendered history entry.
  - Given 50 prior rolls, when the DM opens the history, then rolls are shown newest-first and older rolls are accessible by scrolling.
- **Priority:** Must-have

---

### UX-SES-011 — Roll history entry anatomy and private/shared indicators

- **Requirement:** Each roll history entry displays, on one row: actor name · expression · individual dice values · total · label (if any) · visibility badge (if not session-visible). Private (DM-only) entries visible in the DM view show a "DM only" badge. Entries visible to players never contain the expression, dice values, or total of a DM-only roll.
- **Rationale:** SES-003. Information containment between rolls of different visibilities is a hard safety requirement. The DM must also clearly see which of their own rolls are private [3][8].
- **Spec:**
  Roll history entry anatomy:
  ```
  [Actor avatar 20×20] [Actor name 12px muted] · [expression 13px] → [total 16px bold] [dice values 12px muted in brackets] ([label 12px italic]) [visibility badge if ≠ session-visible]
  ```
  Example:
  ```
  [DM] · 2d20kh1+5 → 22  [18, 9+5]  (Stealth check)  [DM only]
  ```
  Entry height: 36 px (Desktop); 44 px (Tablet/Mobile). Max width = panel width. Expression wraps if needed.
  Visibility badge: "DM only" = `--color-tag-secret` (dark purple chip); "Shared" = `--color-tag-shared` (green chip); no badge for "session-visible" (default — badge would add noise).
  Hidden-count indicator (DM-only view): above the history list, if any hidden rolls exist in the session, a muted line "N hidden roll(s) in this session" is shown — this count is visible only in the DM view and is never surfaced to players.
  Table-draw entries: include the table name and the drawn row text in italics as a third line: `([Table: Trinkets Table] "A cracked lens…")`.

- **States:** entry-default; entry-DM-only (DM-only badge, purple left border); entry-shared (shared badge); entry-table-draw (row text shown)
- **Platform profiles:** consistent anatomy across profiles; Mobile may truncate actor name to initials/avatar only
- **Input:** read-only; hovering/focusing an entry on Desktop shows a "Copy total" tooltip button and an "Append to note" button (DM only)
- **Accessibility:** Each entry `role="listitem"` in `role="list"` `aria-label="Roll history"`; entry `aria-label="[Actor]: [expression] → [total], [label]"`; DM-only entry additionally has `aria-label="…(private, DM only)"`; hidden count line `aria-live="off"` (informational, not urgent)
- **Acceptance criteria:**
  - Given a DM-only roll, when the DM views the dice panel, then the entry shows a "DM only" badge.
  - Given a DM-only roll, when the player client renders roll history, then no entry for that roll appears in any DOM node.
  - Given a table draw, when the result entry appears in history, then the drawn row text is visible in the entry without requiring hover.
- **Priority:** Must-have

---

### UX-SES-012 — Timer widget: countdown display, urgency transition, operator controls

- **Requirement:** The Timer widget (SES-005) displays remaining time in numerals large enough to read at arm's length (≥24 px), transitions to an urgency color in the final 10 seconds, and exposes Start / Pause / Resume / Advance / Reset controls to users with at least `operator` capability-set grant. Configure (set duration) is gated behind the `manager` capability set.
- **Rationale:** SES-005. Time-pressure UI research establishes 24 px minimum for countdown numerals and color-shift urgency cues in the final 10 seconds [9]. The DM must be able to grant a player the ability to operate the timer for social play scenarios (group vote on a time limit, player tracks their own casting time).
- **Spec:**
  Timer widget display:
  - Countdown numerals: `--text-heading-lg` (24 px minimum, up to 40 px in large widget mode). Format: `MM:SS` if ≥60 s; `S.s` (e.g., "9.4") if < 10 s.
  - Bar: a thin progress bar (4 px height) below the numerals, depleting left-to-right. Color: `--color-status-live` (green) → `--color-warning` (amber) at 30% remaining → `--color-danger` (red) at 10 s. The bar provides an additional non-numeral urgency signal.
  - Urgency at ≤10 s: numeral color transitions to `--color-danger`; bar is red; reduced-motion fallback: numeral changes to bold weight + static red color (no CSS animation).
  - Expired: numerals show "0:00"; bar fully empty; a "Time's up!" banner appears below the timer in `--color-danger` text; an optional alarm sound plays (per `13-audio-atmosphere.md`).
  - Timer status label: below numerals, a small muted line: "Running" / "Paused" / "Stopped".

  Controls (visible to `operator` and above; `manager`-only controls visually separated):
  - "▶ Start" (primary, shown when stopped)
  - "⏸ Pause" (shown when running)
  - "▶ Resume" (shown when paused)
  - "Skip +30s" (secondary, skips forward; operator can advance, not just pause)
  - "⟲ Reset" (secondary, resets to configured duration)
  - Separator line
  - "Set duration" (text input or select, `manager` only — shown to managers, hidden to operators)

  Grant and project controls (DM-only section, separate from operator controls):
  - Player selector + Capability selector ("Operator" / "Manager") + "Grant" button
  - "Project to player" button (pushes the timer widget to a player's canvas per SES-005)

- **States:** stopped (Start visible); running (Pause visible, countdown active); paused (Resume visible); expired ("Time's up!" banner); urgency (≤10 s, red numerals/bar); operator-view (no grant section); manager-view (grant section + set duration visible)
- **Platform profiles:**
  - Desktop: full widget; all controls visible; numerals 32 px; bar 4 px
  - Tablet: all controls visible; numerals 28 px; touch targets ≥44 px
  - Mobile: numerals 24 px; controls row-wrapped; grant section behind "Grant access" disclosure
- **Input:** pointer/touch (tap Start/Pause/Resume/Advance/Reset/Grant) · keyboard (Tab through controls; Enter to activate)
- **Accessibility:** Countdown region `role="timer"` `aria-label="Time remaining: [MM:SS]"` updated every second; "Time's up!" `role="alert"`; urgency transition announced via `aria-live="assertive"`: "10 seconds remaining"; Start/Pause/Resume `aria-label` updated to match current state; "Set duration" `aria-label="Set timer duration (manager only)"`
- **Acceptance criteria:**
  - Given a running timer with 8 seconds remaining, when the display renders, then the numerals are red and the bar is red on all profiles.
  - Given a player has the `operator` capability set on the timer widget, when they open the timer, then Start/Pause/Resume/Reset controls are visible and functional, but "Set duration" is not visible.
  - Given the timer expires, when it hits 0:00, then a "Time's up!" banner appears and the `role="alert"` live region fires.
- **Priority:** Must-have

---

### UX-SES-013 — Quick Reference panel: pinned notes, stat blocks, open threads

- **Requirement:** The DM can pin notes, stat-block snippets, open threads, and session-context entries to a Quick Reference panel that persists across route changes and shows a live-resolved snippet of each target. Missing/hidden targets degrade to an "unavailable" state without crashing or leaking content.
- **Rationale:** SES-007. The DM must be able to find a rule or stat block in ≤2 taps during live play without navigating to the vault. Pinned references are the DM's "sticky notes" on the table [4].
- **Spec:**
  Quick Reference panel layout:
  - **Pin form** (top, DM only): Kind selector ("Note" / "Open thread" / "Session context") → Target note selector (dropdown of visible notes, hidden if "Session context" selected) → Label input (optional) → "Pin" button.
  - **Pinned panels list** (scrollable): each pinned panel as a card:
    - Header: panel label (bold) + kind badge ("Note" / "Thread" / "Context")
    - Body: if available — note title + 2-line snippet (max 240 chars); if unavailable — italic "Reference unavailable (target is hidden or deleted)" in muted color. No content from the hidden note is exposed in the unavailable state.
    - Footer (DM only): "Unpin" button (secondary, 44 px target); "Open full note" link (if available)
  - Panels are ordered by pin date (newest first by default); DM can reorder via drag.
  - Panels persist across route changes: pinning to quick reference stores the reference by ID in session state (durable, not in-memory only).

- **States:** panel-available (snippet shown); panel-unavailable (muted message, no content); panel-loading (skeleton 2 lines); empty-list (meta "No pinned panels. Use the form above to pin a note.")
- **Platform profiles:**
  - Desktop: right-rail panel or floating widget; full card layout; "Open full note" link visible
  - Tablet: panel in a drawer or tab; same card layout
  - Mobile (slim): panel behind a "Reference" bottom sheet; each pinned card shows label + kind + 1-line snippet; "Open full note" available
- **Input:** pointer/touch (tap "Pin"; tap "Unpin"; tap "Open full note") · keyboard (Tab through form; Enter to pin; Tab to each card's Unpin button; Enter to unpin)
- **Accessibility:** Panel list `role="list"` `aria-label="Quick reference panels"`; each card `role="listitem"` `aria-label="[Panel label], [kind]"`; unavailable state `aria-label="[Panel label] — reference unavailable"` (no leaked content in aria attributes); Unpin button `aria-label="Unpin [Panel label]"`
- **Acceptance criteria:**
  - Given the DM pins a note and navigates to the character sheet, when they return to the Command Center, then the pinned panel is still present in the Quick Reference panel.
  - Given a pinned note is subsequently hidden (DM-only), when the Quick Reference panel renders, then the panel shows "Reference unavailable" and no note content — not a blank entry or a crash.
  - Given an open-thread pin on a note, when the DM opens the Prep/Recap panel in prep mode, then that thread appears in the "Unresolved threads" section of the digest.
- **Priority:** Should-have

---

### UX-SES-014 — Prep & Recap digest: structured pre/post-session workflow

- **Requirement:** The DM can switch the Prep/Recap panel between "Prep" and "Recap" modes and view a structured digest of: unresolved threads, handout outcomes, combat summary, recent changes, and continuity prompts — all derived from durable session data with no AI required. The digest is DM-only; non-DM actors see an empty state.
- **Rationale:** SES-009. A DM-facing pre/post-session summary derived from existing data reduces the mental overhead of continuity management without requiring external tools or AI. Fail-closed for non-DMs is a safety requirement [3].
- **Spec:**
  Prep/Recap panel layout:
  - Mode selector (top): segmented control "Prep | Recap". Default: "Prep" if session not yet ended; auto-switches to "Recap" on session entering `ending` / `recap` state.
  - Non-DM guard: if the actor is not DM, the panel body shows "The prep/recap digest is available to the DM only." No headings, no empty list items — clean empty state.
  - Digest sections (visible to DM only):
    1. **Unresolved threads** — list of pinned open-thread panels with their linked note title (or "unavailable"). Prep mode: these are the things to address. Recap mode: these are the things that were addressed or remain open.
    2. **Handout outcomes** — list of handouts delivered during the session: handout title + recipient(s). Prep mode: upcoming handouts prepared. Recap mode: what was given and to whom.
    3. **Combat summary** — if combat occurred: status (ended / active / not started) + log entry count. Recap mode: this becomes the basis for the encounter log creation link.
    4. **Recent changes** — a brief chronological list of content operations (note edits, character updates) from the session. Maximum 10 shown; "View full history" link.
    5. **Continuity prompts** — DM-facing questions generated from campaign data (calendar events, moon phases, pending thread dates). Source links included. No AI — purely derived from structured data.
  - "Create recap notes" CTA (primary, visible in recap mode): opens a note draft pre-populated with the digest content in a structured template; the DM edits and saves. This dispatches a durable content-create command.

- **States:** prep-mode; recap-mode (auto-switched); digest-loading (sections show skeletons); digest-empty-section (meta text per section); non-DM (single guard message); create-recap-loading
- **Platform profiles:**
  - Desktop: full panel with all five sections expanded by default; "Create recap notes" at bottom
  - Tablet: sections collapsible (default: all expanded); same CTA
  - Mobile (slim): sections collapsed by default; expand on tap; CTA pinned to bottom of sheet
- **Input:** pointer/touch (mode selector segmented control; section expand/collapse; "Create recap notes" tap) · keyboard (Tab through mode selector; arrow keys in segmented control; Tab to sections; Enter to expand; Tab to CTA; Enter)
- **Accessibility:** Mode selector `role="radiogroup"` with two `role="radio"` options; non-DM guard `role="status"` with the guard message; each section `<section>` with `aria-label`; "Create recap notes" button `aria-label="Create recap notes from digest"`; on note draft created, `aria-live="polite"` announces "Recap draft created: [note title]"
- **Acceptance criteria:**
  - Given the session is in recap state and the DM opens the Prep/Recap panel, then the mode is automatically set to "Recap" and the combat summary section shows the session's combat log entry count.
  - Given a player actor opens the Prep/Recap panel, then only the guard message "The prep/recap digest is available to the DM only." is visible — no section headings, no empty lists.
  - Given the DM clicks "Create recap notes", then a note draft opens pre-populated with the recap digest content and the DM can edit it without any further configuration.
- **Priority:** Should-have

---

### UX-SES-015 — Campaign calendar: current date display and date-linked entries

- **Requirement:** The DM can view and set the current campaign date (in campaign calendar terms) and view a chronological list of date-linked entries (notes, sessions, maps, events). Calendar dates render in a stable, consistent format across all clients. Linked entries that become hidden or deleted show an "unavailable" state without leaking their content.
- **Rationale:** SES-012. Campaign continuity depends on accurate time-tracking. Date rendering must be canonical and identical on every device (SES-012 acceptance criteria).
- **Spec:**
  Campaign Calendar section (within the Prep/Recap panel, or as a standalone widget):
  - **Current date** display: "[Month name] [Day], [Year] [Epoch]" e.g. "Ches 15, 1372 DR"; rendered using the CONTENT-011 formatter; identical on all clients.
  - If no campaign calendar is defined: a "Define calendar" CTA (DM only) opens the calendar definition workflow (month names, days per month, weekdays, epoch label). Non-DMs see "No campaign calendar defined."
  - **Set current date** (DM only): a compact date-editor opens on clicking the current date display — three number inputs (month / day / year) + "Set date" button. Validates against the calendar's month/day definitions.
  - **Calendar links list**: chronological (ascending date) list of linked entries:
    - Each entry: "[Label]" · "[Date display]" · "[Entry title or 'unavailable']" · [Unlink button, DM only]
    - Unavailable: italic "target unavailable (hidden or deleted)"
  - **Link a date** (DM only): form: "Link note" → note selector + label + date inputs + "Link" button.

- **States:** date-set (display + edit trigger); date-not-set ("No campaign date set."); link-available (title shown); link-unavailable (italic message); links-empty ("No calendar links."); calendar-undefined ("Define calendar" CTA)
- **Platform profiles:**
  - Desktop: full section with all fields; inline date editor
  - Tablet: same; date inputs slightly larger for touch
  - Mobile: date display prominent; set-date and link form behind a "Edit calendar" disclosure
- **Input:** pointer/touch (click date to edit; click Link; click Unlink) · keyboard (Tab through fields; Enter to set date; Enter to link)
- **Accessibility:** Current date display `role="time"` with `datetime` attribute in ISO 8601 format (even if display format is campaign-calendar); "Set date" button `aria-label="Set campaign date"`; each link `role="listitem"` with `aria-label="[Label], [date]"`; "Unlink" button `aria-label="Unlink [Label]"`; unavailable state `aria-label="[Label] — target unavailable"`
- **Acceptance criteria:**
  - Given the DM sets the campaign date to "Ches 15, 1372 DR", when a player client renders the current date widget, then the identical date string is shown — not a different format.
  - Given a linked note becomes DM-only (hidden), when the calendar links list renders, then the entry shows "target unavailable" without any note content or title in the displayed text.
  - Given the DM enters an invalid day (e.g., day 31 in a 30-day month), when they submit, then an inline error appears and the date is not set.
- **Priority:** Should-have

---

### UX-SES-016 — Player-visible combat tracker: synced view with visibility enforcement

- **Requirement:** Players with an active session see a read-only initiative tracker showing: turn order, round counter, visible combatant HP and conditions, and the current-turn indicator. Hidden combatants are rendered as named placeholders. Players may edit their own character's HP and conditions if they hold the `combat-participant` capability set on that character.
- **Rationale:** SES-002. Shared combat state is a primary product feature. The player view must be useful (current turn, visible HP) without leaking DM secrets. The `combat-participant` grant (CHAR-007) allows the player to self-manage resources without DM overhead.
- **Spec:**
  Player-visible tracker mirrors the DM tracker in visual anatomy (UX-SES-003/004) with these differences:
  - Hidden combatants: placeholder row ("Unknown creature" or DM alias) with all stat fields replaced by "—". No defeated state for hidden combatants (players don't know their HP). No ••• menu on placeholder rows.
  - HP editing: enabled only for rows matching a character owned by the current player AND for which the player has `combat-participant` grant. All other HP cells are read-only (no tap-to-edit).
  - Condition editing: same gate as HP editing.
  - No "Add combatant", no "Remove", no "Reorder" affordances — tracker is read-only except for own HP/conditions.
  - Advance-turn button: visible but non-functional (read-only) — OR hidden entirely on the player view. Decision: hide from player view (the button being visible but inert confuses players). The round counter and turn indicator are shown; the Prev/Next buttons are not present in the player-facing tracker header.
  - Current-turn emphasis: same as DM tracker (UX-SES-004), using the visible combatant's data.

- **States:** own-character row (HP editable); other-character row (HP read-only); hidden-combatant row (placeholder, fully read-only); active-turn row (elevated treatment per UX-SES-004)
- **Platform profiles:** identical anatomy to DM tracker per profile; ••• menu shows only "View details" (opens a read-only stat block if visible) and nothing else
- **Input:** pointer/touch (tap own HP to edit, per UX-SES-005 flow); no drag reorder; no advance turn
- **Accessibility:** Player tracker `aria-label="Initiative order (player view)"`; read-only HP cells `aria-readonly="true"` and cannot receive keyboard edit focus; own-HP cell `aria-label="Your HP for [Character name] — tap to edit"`; hidden-combatant row `aria-label="Unknown creature, turn position [N]"`
- **Acceptance criteria:**
  - Given a player with `combat-participant` on their character, when they tap their character's HP in the tracker, then the inline HP stepper appears for their character only.
  - Given a hidden combatant exists, when the player's tracker renders, then no real name, real HP, or real AC appears for that combatant in any rendered element or accessible label.
  - Given the DM advances the turn to a hidden combatant, when the player's live region announces the turn, then the announcement says "Unknown creature's turn" — not the real name.
- **Priority:** Must-have

---

### UX-SES-017 — Session tool async action model: undo toast, retry, and pending state

- **Requirement:** Every durable session-tool command (HP change, turn advance, combatant add/remove, roll, timer operate, pin/unpin, calendar date set) follows the async action model (SES-010): immediate optimistic UI update → pending state (≤100 ms spinner) → success (silent or toast) → failure (actionable error with retry) → undo available for reversible commands (8-second toast window).
- **Rationale:** SES-010. Reliability and undo are the safety nets that make the DM willing to act quickly. A tool without undo trains users to hesitate. A tool without visible failure causes silent data loss [1].
- **Spec:**
  **Optimistic update**: every command immediately reflects the expected post-state in the UI (HP number changes, turn advances, roll appears in history). If the command is later rejected, the UI reverts to the pre-command state and an error toast appears.
  **Pending state**: while the Processing Core is computing the result, the affected control shows a loading indicator: the HP cell shows a subtle spinner overlay; the Next Turn button shows a 100 ms spinner (no additional delay to the user beyond this).
  **Success**: silent (no toast) for routine actions (HP increment, roll). Toast (2 s) for milestone actions (turn advanced to round N, encounter built, session paused).
  **Failure**: persistent error toast (dismissible by DM, auto-dismisses after 10 s if no interaction): "[Action] failed. [Reason]. [Retry]" — the Retry button re-dispatches the same command. Toast color: `--color-danger-surface`, icon: error icon.
  **Undo**: available for HP changes, combatant add, pin/unpin, timer operate, calendar date set. Not available for: combatant remove (after confirmation, intentional; confirm dialog IS the undo gate), session phase transition (handled by the inverse transition). Undo toast: "[Action] applied. Undo?" with an "Undo" button. Window: 8 seconds. The Undo button dispatches the inverse command.
  **Multiple queued undos**: if the DM makes several rapid HP changes, each generates its own undo toast; toasts stack vertically (newest on top, max 3 visible); older toasts auto-dismiss when a new one arrives beyond the stack limit.

- **States:** per-action: pending (spinner); success (silent or milestone toast); failed (error toast + retry); undoable (undo toast); undo-in-progress (undo button spinner); undo-failed (error toast on the undo itself, with "Retry undo" button)
- **Platform profiles:**
  - Desktop: toasts in bottom-right corner, max 3 stacked, 320 px wide
  - Tablet: toasts in bottom-right corner; 280 px wide; same stacking
  - Mobile: toasts as bottom banners (full width, 56 px height); max 2 stacked above the bottom tab bar
- **Input:** pointer/touch (tap Retry; tap Undo; tap Dismiss on toast) · keyboard (when toast is focused via `Tab`: Enter on Retry/Undo/Dismiss; Escape dismisses)
- **Accessibility:** Each toast `role="status"` (success) or `role="alert"` (failure/undo); Retry and Undo are focusable `<button>` elements within the toast; toast appearance announced via `aria-live="polite"` (success) or `aria-live="assertive"` (failure); when a toast auto-dismisses, no announcement is needed; when Undo is successful, `aria-live="polite"` announces "[Action] undone."
- **Acceptance criteria:**
  - Given the DM changes a combatant's HP from 30 to 18, when the command succeeds, then an undo toast appears within 200 ms reading "[Name] HP: 30 → 18. Undo?"
  - Given the DM clicks "Undo" within 8 seconds, when the inverse command completes, then the HP returns to 30 and the toast announces "HP change undone."
  - Given a roll command fails (e.g., offline), when the failure is detected, then an error toast with a "Retry" button appears within 1 second of the failure response.
- **Priority:** Must-have

---

## 6. Component & state specifications

### 6.1 Initiative Tracker panel — full state matrix

| State | Visual treatment | Interaction |
|---|---|---|
| No active combat | Header: "No combat" (muted); Prev/Next disabled; empty list with "Add combatants to begin" inline prompt | DM can open Encounter Builder via link in prompt |
| Active combat, not current turn | Default row: white/dark surface background, normal weight text, full opacity | Tap HP to edit; tap ••• for menu; drag handle to reorder |
| Active combat, current turn | Elevated background + 4 px live-color left border + bold name + larger HP + "▶" chip | Same as above + Space/Enter advances turn |
| Defeated combatant | 50% opacity; name strikethrough; HP = "0"; icon faded; moved below active combatants | Still accessible via ••• for revive |
| Hidden combatant (DM view) | Real data shown + closed-eye badge on portrait + "[H]" prefix + "Hidden from players" chip | Toggle visibility via ••• menu |
| Hidden combatant (player view) | Placeholder row: "?" portrait + "Unknown creature" name + "— / —" HP | Read-only; no ••• menu |
| Delayed combatant | "Delayed" chip on row; dash at initiative position | Resume via ••• → "Return to turn order" |
| Ready combatant | "Ready" chip on row | Trigger via ••• → "Use reaction" |

### 6.2 Combatant ••• context menu — full item list

| Menu item | DM / Player | Condition | Confirmation |
|---|---|---|---|
| Edit HP | DM; player (own + combat-participant) | Always | None (stepper is its own confirmation) |
| Set conditions | DM; player (own + combat-participant) | Always | None |
| Set initiative | DM only | Always | None |
| Delay | DM only | Active combat, not yet delayed | None |
| Ready action | DM only | Active combat, not yet readied | None |
| Toggle hidden (hide/show) | DM only | Always | None (toggle is reversible) |
| Remove from combat | DM only | Always | Modal confirmation |
| Revive (restore HP) | DM only | Defeated state only | None |
| View stat block | DM + players with viewer grant | Always | N/A (read-only panel) |

### 6.3 Dice Tools panel — component state matrix

| Component | State | Treatment |
|---|---|---|
| Expression input | Empty | Placeholder text visible; Roll disabled |
| Expression input | Invalid (post-submit) | Red border + inline error "Invalid dice expression" |
| Expression input | Valid | Roll enabled; Enter submits |
| Adv/Disadv control | Normal (default) | Center segment selected |
| Adv/Disadv control | Advantage | Right segment selected + active fill |
| Adv/Disadv control | Disadvantage | Left segment selected + active fill |
| Roll button | Session inactive | Disabled + muted; state-gate message visible |
| Roll button | Submitting | Spinner overlay ≤100 ms |
| Roll history | Empty | Meta "No rolls yet." |
| Roll history | DM-only entry | Dark purple left border + "DM only" badge |

### 6.4 Timer widget — component state matrix

| State | Numeral color | Bar state | Controls visible |
|---|---|---|---|
| Stopped | `--color-text-muted` | Empty bar, neutral color | Start |
| Running (>10 s) | `--color-text-primary` | Depleting, green→amber | Pause, Advance, Reset |
| Running (≤10 s) | `--color-danger` | Red, nearly empty | Pause, Advance, Reset |
| Paused | `--color-text-muted` | Static at current level | Resume, Advance, Reset |
| Expired | `--color-danger` | Empty, red | Reset; "Time's up!" banner |

---

## 7. Layout & responsive behavior

### 7.1 Desktop (≥1024 px) — DM Command Center integration

The session tools occupy the right rail of the Command Center widget canvas. The combat tracker is the dominant right-rail panel:

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ● Active  ▶ Aria Nightwind (turn)   🧑🏻🧑🏾🧑🏼 3 players   ♪ Dungeon Ambience     │ ← status strip 48px
├──────────────────────────────────────────────┬─────────────────────────────────────┤
│                                              │ ┌─────────────────────────────────┐ │
│                                              │ │ Combat Tracker                  │ │
│              Active Map Embed                │ │  [Prev 80px] Round 3 [Next 120px]│ │
│          (center zone, 04-canvas)            │ │  ───────────────────────────────│ │
│                                              │ │ ▶ 20 [img] Aria      28/35 AC17 │ │ ← current turn row, elevated
│                                              │ │   18 [img] Goblin A   8/7  AC13  │ │
│                                              │ │   15 [?]   Unknown   —/—   —     │ │ ← hidden
│                                              │ │   12 [img] Theron    35/40 AC15  │ │
│                                              │ │   [Add +] ─────────────────────│ │
│                                              │ └─────────────────────────────────┘ │
│                                              │ ┌─────────────────────────────────┐ │
│                                              │ │ Dice Tools (collapsed header)   ▾│ │
│                                              │ └─────────────────────────────────┘ │
│                                              │ ┌─────────────────────────────────┐ │
│                                              │ │ Quick Reference (2 pinned)      ▾│ │
│                                              │ └─────────────────────────────────┘ │
├──────────────────────────────────────────────┴─────────────────────────────────────┤
│ ♪ Track name   ■□□ Audio controls             Dice strip: [1d20] [Roll]            │ ← bottom strip 48px
└────────────────────────────────────────────────────────────────────────────────────┘
```

The right rail is scrollable if panels overflow (tracker height is the dominant variable). All panel headers are sticky within the scroll container so their titles remain visible. Panels are collapsible widgets (managed by `04-canvas-scene-widgets.md` widget chrome).

### 7.2 Tablet (600–1024 px) — landscape split

In landscape, the layout mirrors Desktop with a narrower right rail (280–320 px). The combat tracker uses 60 px rows; conditions move to a second line below the name. The "Next turn" button is full width of the tracker header.

In portrait (tablet), the map embed occupies the top 55% of the screen; the bottom 45% is a tab strip:

```
┌──────────────────────────────────────────┐
│         Active Map Embed (55%)           │
├──────────────────────────────────────────┤
│ [Combat] [Dice] [Reference] [Prep]       │ ← tab bar 48px
├──────────────────────────────────────────┤
│                                          │
│    Active tab panel (combat tracker      │
│    or dice tools or …)                   │
│                                          │
└──────────────────────────────────────────┘
```

The combat tracker in the tablet portrait tab: all rows visible; Prev/Next strip always at top of the tab panel (sticky); combatant rows 60 px.

### 7.3 Mobile (<600 px) — slim tracker focus

Mobile session view surfaces the single most critical information first. The DM's mobile view is explicitly the "phone beside the battle map" use case.

```
┌─────────────────────────────────────┐
│ ● Active    Rnd 3     ⏩ Aria       │ ← status bar 44px (compressed from 05-command-center.md)
├─────────────────────────────────────┤
│ [◀] Round 3                   [▶ Next] │ ← tracker advance strip, 64px
├─────────────────────────────────────┤
│ [20][img]  Aria Nightwind    28/35 ●●●│
│ [18][img]  Goblin A           8/7  ●●●│
│ [15][?]    Unknown            —/— ●●●│
│ [12][img]  Theron            35/40 ●●●│
│                                 ••• │ ← row-level ••• is the sole action path
├─────────────────────────────────────┤
│ [Combat] [Dice] [Ref] [Tools] [More]│ ← bottom tab bar (from 02-navigation)
└─────────────────────────────────────┘
```

Mobile row anatomy uses portrait (36×36 px) + name + HP on one line; AC, conditions, and concentration accessible via ••• menu. The "▶ Next" button in the advance strip occupies ≥140 px width and 64 px height — maximally thumb-hittable. The "Dice" tab opens a focused dice panel: expression input + adv/disadv toggle + Roll button + last 10 roll history entries.

---

## 8. Motion & feedback

| Interaction | Animation | Duration | Easing | Reduced-motion fallback |
|---|---|---|---|---|
| Turn advance (tracker scroll) | Smooth scroll to new current-turn row | 150 ms | ease-in-out | Instant scroll, no animation |
| Current-turn row transition (outgoing) | Fade background to default surface | 100 ms | ease-out | Instant color change |
| Current-turn row transition (incoming) | Fade background to elevated surface + left border grows | 100 ms | ease-in | Instant color + border |
| HP optimistic update | Number cross-fades from old to new value | 80 ms | ease-out | Instant value swap |
| Undo toast appear | Slide in from bottom | 120 ms | ease-out | Instant appear |
| Undo toast dismiss | Fade out | 80 ms | ease-in | Instant disappear |
| Timer urgency transition (≤10 s) | Color interpolation from amber to red over 2 s | 2000 ms | linear | Instant color change to red |
| Encounter Builder challenge guidance update | Cross-fade pill text and background color | 150 ms | ease-in-out | Instant value swap |
| Add combatant (row insert) | Row slides in from top of list | 150 ms | ease-out | Instant insert |
| Defeated row (move to bottom) | Row fades to 50% opacity + slides to bottom | 200 ms | ease-in-out | Instant opacity + reposition |
| Drawer open (add combatant, dice panel mobile) | Slide up from bottom | 200 ms | ease-out | Instant appear |
| Drawer close | Slide down | 150 ms | ease-in | Instant disappear |

All motion durations and easing curves use the token-defined system from `01-visual-design-system.md`. Where this table gives specific values, they are the target; the visual design system may refine them. The `prefers-reduced-motion` fallback is always: instant state change, no animation, no transition.

---

## 9. Accessibility requirements (surface-specific)

Beyond the global baseline in `03-accessibility.md`, the sessions / live play surface has the following specific requirements:

### 9.1 Live combat announcements

- Turn advance: `aria-live="assertive"` region in the tracker announces "It is now [Name]'s turn, round [N]." immediately on advance. The region is a visually hidden `<div>` with `role="status"` and `aria-live="assertive"` at the document level (not inside the scrolling list, so it is not clipped).
- Hidden combatant turn: announcement says "Unknown creature's turn" — never the real name on a player client.
- Round increment: `aria-live="polite"` announces "Round [N] has begun."
- HP update: `aria-live="polite"` announces "[Name]: HP updated to [N] of [max]."
- Concentration check: `aria-live="assertive"` announces "Concentration check for [Name]: DC [N]."
- Timer expired: `role="alert"` fires "Time's up!"
- Timer ≤10 s: `aria-live="assertive"` fires once at 10 s: "10 seconds remaining."

### 9.2 Keyboard navigation model for the combat tracker

The combat tracker panel implements the following keyboard model:
- `Tab` enters the panel from the global focus order
- Within the panel, the Prev / Round-counter / Next strip is the first focus stop
- `Space` / `Enter` on the Next button advances the turn (from anywhere in the panel that does not consume Space for its own purpose)
- `Down Arrow` / `Up Arrow` navigate between combatant rows
- `Enter` on a combatant row opens its ••• context menu
- `H` when a combatant row is focused opens the HP editor for that combatant
- `Escape` closes any open HP editor, context menu, or drawer and returns focus to the triggering element
- The keyboard shortcut `N` (global, when no modal or input field has focus) fires "Next turn" during an active session
- The keyboard shortcut `P` (global, same conditions) fires "Previous turn"
- Shortcuts are registered in the command palette (per `05-command-center.md` UX-CMD-011) and announced in the Next/Prev button `aria-keyshortcuts` attributes

### 9.3 Hidden combatant data containment (safety requirement)

This is a hard accessibility AND security requirement: hidden combatant data must not be present in:
- Any rendered DOM node on the player client (not even in `aria-hidden` attributes)
- Any `aria-label`, `aria-description`, `title`, or `data-*` attribute on the player client
- Any live-region announcement on the player client
- Any toast, error message, or loading-state text on the player client

The enforcement mechanism is the Processing Core's actor-filtered read model (SES-002 / PERM). The GUI never receives the real data for hidden combatants on a player client; it only receives the placeholder record. This document requires that the GUI does not reintroduce a leak through any accessibility or diagnostic surface.

### 9.4 Touch target compliance

All interactive controls in session surfaces must meet the following minimums (WCAG 2.5.5, target size 24 CSS px minimum for WCAG AA; 44 CSS px recommended):
- Next turn button: ≥44 px height × ≥80 px width (all profiles)
- Combatant row HP cell (tap to edit): ≥44 px height × ≥60 px width
- Condition chips: ≥44 px height (achieved by chip group row height, not chip itself); individual chips ≥24 px height with adequate spacing
- Undo / Retry buttons in toasts: ≥44 px height
- Timer Start/Pause/Resume/Reset: ≥44 px × ≥44 px
- Prev turn button (Mobile icon-only): ≥44 px × ≥44 px

### 9.5 Reduced-motion compliance

All animations listed in §8 have specified `prefers-reduced-motion` fallbacks. Additionally:
- The timer's urgency cue at ≤10 s must not rely solely on animation (the color change to `--color-danger` is sufficient; no CSS animation keyframe required)
- Combat tracker scroll-to-current-turn must not use scroll animations when `prefers-reduced-motion: reduce` is set; use `scrollIntoView({ behavior: 'instant' })`
- Toasts must appear/disappear without transform animations; opacity only or instant appearance

---

## 10. Anti-patterns & explicit limitations

**10.1 Tiny touch targets on combat controls — prohibited**
Roll20's 32 px row height [6] and icon-only buttons less than 44 px are documented causes of mis-taps during live play. Under table pressure, a DM's aim degrades. Every touch target in session surfaces must meet ≥44 px as specified in §9.4. This applies to every row in the tracker on touch-primary profiles. Rationale: WCAG 2.5.5 and the physical constraints of tablet use beside a battle map.

**10.2 Icon-only conditions — prohibited**
Condition icons without persistent text labels require hover/tooltip to identify, which is inaccessible to touch users and cognitively expensive at distance. Foundry VTT's icon-only condition display is the documented failure [3]. Every condition in this product uses a text-label chip. Icon-only conditions are not permitted even for space reasons on Mobile — Mobile moves conditions to the ••• menu with text labels there.

**10.3 Context-menu HP editing — prohibited**
Requiring a right-click or long-press-then-submenu to edit HP (Roll20's pattern [6]) adds 3–4 interactions to the highest-frequency combat-data-entry task. HP editing must be directly accessible via a single tap on the HP number, with an inline stepper. No session tool may put HP editing behind a context menu as the primary path.

**10.4 Multi-step turn advance — prohibited**
Any design that requires more than 1 tap/click or 1 keypress to advance to the next combatant's turn is prohibited. This includes: confirmation dialogs before advance, sub-menus, or requiring the DM to first select a combatant then advance. The DM's hands and attention are occupied at the table. Turn advance must be a single mechanical action.

**10.5 Hidden-combatant data in player view — prohibited (safety)**
Any route — DOM elements, ARIA labels, error messages, toast text, roll-history entries, loading-state text, or network error payloads — that exposes a hidden combatant's real name, true HP, real AC, or conditions to a player client is a hard prohibition. This is not a UX preference; it is a session safety and trust requirement. The enforcement is at the Processing Core layer (actor-filtered read model), but the UX must not introduce any secondary channel. See §9.3.

**10.6 Session tool access without active session — UI confusion**
Rendering dice tools, timer controls, and the initiative tracker as fully interactive when no session is active (or the session is paused/archived) causes user confusion about whether actions are taking effect. All session-gated tools must clearly indicate the inactive state and disable the primary action controls, with an actionable message linking to the session start path (per UX-SES-001). The current DiceTools.svelte implementation already gates on `sessionActive`; this must be enforced consistently across all tools.

**10.7 Blank tracker home state — prohibited**
An empty combat tracker with no orientation (just white space or a generic "No data") is a first-run failure. The empty state must explain how to add combatants and offer a direct path to the Encounter Builder or the Add Combatant action. The DM should never stare at a blank tracker wondering what to do next.

**10.8 No undo for HP changes — prohibited**
HP changes made in the heat of combat are error-prone. A product without undo for HP edits trains DMs to hesitate or maintain a paper backup. Per SES-010, every HP change must have an undo toast (8 second window). Designs that confirm HP changes with a modal (adding friction) instead of providing undo (enabling recovery after the fact) are also prohibited — the stepper confirm button is sufficient as the intent-confirmation mechanism.

**10.9 Leaking DM-only rolls to players via roll history — prohibited**
Any roll marked DM-only must be absent from the player-visible roll history — not just visually hidden with CSS, but absent from the player client's data model. The filtering is done in the Processing Core's `getDiceHistoryForActor` function. The UX must not bypass this by, for example, showing a "N hidden rolls" count to players (the hidden-count indicator is visible in the DM view only) or including roll IDs in any player-facing API response.

**10.10 Advance turn without scrolling to the new current-turn row — prohibited**
If the incoming current-turn combatant is below the visible tracker area, the tracker must scroll to show it. A tracker where the "current turn" visual treatment may be off-screen is a glanceability failure — the DM cannot confirm whose turn it is without scrolling. This scroll must be automatic on turn advance (see §8 for animation spec).

---

## 11. Success metrics

| Metric | Target | Measurement method |
|---|---|---|
| Turn advance: time from decision to action | ≤1.5 s (pointer); ≤2.0 s (touch) | Time-on-task study: facilitator says "advance the turn," measures to turn-advance confirmation |
| HP edit: time from decision to confirmed edit | ≤5 s for arbitrary value change | Time-on-task: facilitator says "apply 12 damage to [combatant]," measures to tracker update |
| Current-turn identification: time to identify whose turn | ≤1.5 s at 60 cm (arm's length glance) | Eye-tracking or glance-recognition test on tracker display |
| Roll: time from decision to roll result visible | ≤3 s (expression known) | Time-on-task: facilitator says "roll a d20+5," measures to history entry |
| Accidental hidden-combatant reveal | 0 incidents | Automated test: player-client render audit for hidden combatant data in any DOM node |
| DM-only roll visible in player history | 0 incidents | Automated test: player actor's history API response audited for DM-only roll IDs |
| Session state restore after crash | ≤3 s to recovery banner | Automated: app restart timing with active session |
| First-time DM: time to start a combat | ≤90 s from Command Center to first initiative roll | Usability test with a DM who has not used the product before |
| Tracker WCAG 2.2 AA | 0 axe critical violations | CI automated accessibility audit (axe-core) on the tracker panel |
| Touch target compliance (≥44 px) | 100% of session tool interactive controls | Automated target-size audit in test suite |
| Perceived responsiveness (optimistic HP update) | HP number changes within 100 ms of tap | Frame-timing measurement in Playwright test |

---

## 12. Open questions & risks

**Q1: Advance-turn keyboard shortcut conflict.** The global `Space` shortcut for turn advance may conflict with typing in form fields (dice expression, combatant name). The specification uses `Space` only when the tracker panel is focused (i.e., no text input within the tracker has focus). The global fallback `N` key requires similar focus-context management. Risk: focus escaping to an unexpected element causing accidental turn advance mid-expression entry. Mitigation: shortcut fires only when the focused element is not an `<input>`, `<textarea>`, or `contenteditable`. Needs implementation validation.

**Q2: Mobile combat tracker — HP column on slim rows.** The slim Mobile row shows name + HP inline. On very long names (> 16 chars) and low HP (e.g., "Thorindal Brightmantle 4/55"), the layout may truncate the HP value. Resolution options: (a) cap name display at 14 chars on mobile slim rows; (b) move HP to a second line (increases row height to 80 px, may cause scroll fatigue in large encounters). Decision pending design review.

**Q3: Mass combatant initiative.** When adding "5× Goblin", do all five share the same initiative roll or do they roll individually? Foundry VTT rolls individually by default; many DMs prefer grouped initiative for simplicity. The current `EncounterBuilder.svelte` stores a single `initiative` value per combatant template, which suggests the Processing Core would roll per-instance. UX spec should confirm this and expose the choice: "Group initiative (all share one roll) / Individual initiative (each rolls separately)" in the mass-add flow. Functional clarification needed with SES-002.

**Q4: Delay / Ready action turn order.** The spec mentions "Delayed" and "Ready" combatant states in the row but does not specify the exact initiative-list behavior (does a delayed combatant drop to the bottom? do they re-insert on interrupt?). This depends on the Processing Core's turn-order model and may vary by game system. UX treatment assumes: Delayed = removed from active turn order, shown at bottom of list with "Delayed" chip; Ready = stays in position with "Ready" chip; re-insertion via ••• → "Take action now" which requires core support. Functional dependency on SES-002 needs clarification.

**Q5: Player-visible tracker and session sync latency.** If the session uses near-real-time sync (per `12-sync-offline-reliability.md`), the player's tracker may lag the DM's tracker by 0.5–2 s during busy combat rounds. The UX impact is that a player may see the "last turn" combatant as current for up to 2 s. Mitigation: optimistic broadcast (DM client predicts the new state and pushes immediately); the sync layer handles reconciliation. The sync strategy is specified in `12-sync-offline-reliability.md` — this document notes the dependency.

**Q6: Encounter Builder vs. Command Center composition.** The Encounter Builder is specified as a widget on the Command Center (DM-only). If the DM is on Mobile, the "slim" form omits terrain notes and advanced fields. There is a risk that a DM who builds encounters on mobile may lose the habit of entering terrain notes. Consider whether the Mobile slim view should include a "terrain notes" field by default and omit something less critical (e.g., challenge guidance can be a secondary disclosure). Decision deferred to UX design review.

**Q7: Session-state gated tools — visual continuity for non-active sessions.** The current spec (UX-SES-001) shows session-gated tools with an inline state message. However, if the DM opens the Dice Tools panel during `prep` to pre-roll some values, blocking all dice functionality may be unnecessarily restrictive. SES-011 defines `prep` as a distinct state. A future refinement could allow limited dice use in `prep` state. This requires a functional requirement change (SES-003 currently gates on session `active`). Flagged as a potential enhancement for a subsequent sprint.

---

## Sources

[1] Nielsen Norman Group — "Dashboard Design: Considerations and Best Practices" — https://www.nngroup.com/articles/dashboard-design/

[2] Nielsen Norman Group — "Glanceability: How to Design for Quick Reads" — https://www.nngroup.com/articles/glanceability/

[3] Foundry VTT — Combat Tracker Documentation — https://foundryvtt.com/article/combat/

[4] Improved Initiative — Combat Tracker Application — https://www.improved-initiative.com/

[5] D&D Beyond — Encounters (Encounter Builder & Combat Tracker) — https://www.dndbeyond.com/encounters

[6] Roll20 Wiki — Turn Tracker — https://wiki.roll20.net/Turn_Tracker

[7] Owlbear Rodeo — What's New in 2.1 (Initiative tracker, sharing bar) — https://www.owlbear.rodeo/blog/whats-new-2-1

[8] Dicephilia / UX research synthesis: Dice Roller Interaction Design — (community-compiled analysis of dice UX, referenced via design patterns literature; primary sources include Apple HIG on stepper controls: https://developer.apple.com/design/human-interface-guidelines/steppers and Material 3 on text fields: https://m3.material.io/components/text-fields/overview)

[9] WCAG 2.2 — Understanding Success Criterion 2.5.5: Target Size — https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html ; Time pressure display research cited in: Nielsen Norman Group — "Designing for Time Pressure" — https://www.nngroup.com/articles/designing-for-time-pressure/
