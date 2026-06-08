# UX Requirements — Collaboration & Permissions

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read `00-overview-and-principles.md`
> first — it defines the shared principles, the parameter rubric, the requirement-ID scheme, the
> platform profiles, and the design tokens this document builds on.
>
> **Status:** Draft v1
> **Functional requirement coverage:** `COLLAB-001..014` · `PERM-001..014`
> **Owner surface(s):** Presence strip / participant roster · Session join / invite / leave flows ·
> Player View controller (DM) · Handout delivery panel · Shared combat state overlay ·
> Connection-state feedback banner · Capability-set grant dialog (`GrantManager`) ·
> Permission summary panel (`PermissionSummary`) · Participant status panel
> (`ParticipantStatusPanel`) · DM visibility controls (3-state toggle, inline) ·
> "Preview as player / observer" mode · Permission consistency diagnostics (DM-only)

---

## 1. Scope

- **Covers:** All UI surfaces that concern who is in the session and what they can see or do.
  Two logical halves share this document because they are tightly coupled in practice: (a)
  **Collaboration** — presence indicators, session join/invite/leave, real-time Player View
  assignment, handout push/revoke flows, shared combat state, and connection-state feedback;
  (b) **Permissions** — the DM's grant UI (capability-set picker, effective-permission preview,
  active grant list, ownership transfer, revocation), the player's permission summary, DM
  visibility controls (the three-state `dm-only / player-visible / shared` toggle on any entity,
  section, or field), and the "Preview as player / observer" affordance.

- **Does NOT cover:**
  - Character-sheet override-flag badges (how DM edits appear on a sheet) — `07-characters.md`.
  - Content-editor inline visibility markers (the editor toggle for a section or field) —
    `09-content-authoring-and-sources.md`.
  - Live sync status banner / offline indicator — `12-sync-offline-reliability.md`.
  - Combat tracker initiative strip — `08-sessions-live-play.md`.
  - Canvas widget visibility and canvas-level player-view projection (the scene itself) —
    `04-canvas-scene-widgets.md`.
  - Global navigation chrome — `02-navigation-and-platform-profiles.md`.

- **Related functional requirements:**
  - `COLLAB-001` — DM starts session; issues invitations or local pairing codes; role assigned.
  - `COLLAB-002` — Reconnect with catch-up limited to current role/grants/visibility cursor.
  - `COLLAB-003` — Near-real-time session state (combat, dice, timers, handouts, map updates).
  - `COLLAB-004` — Ephemeral presence (online status, cursors, selections, device availability).
  - `COLLAB-005` — DM controls different Player View assignments per player in same session.
  - `COLLAB-006` — Shared combat state filtered by role and grants.
  - `COLLAB-007` — Handout delivery (images/notes/ciphers) to players; ack + revocation state.
  - `COLLAB-008` — DM command authority resolves concurrent conflicts per session policy.
  - `COLLAB-009` — Replication streams filtered server-side; hidden content never reaches client.
  - `COLLAB-010` — Cache purged/sealed on player leave unless persistent access granted.
  - `COLLAB-011` — Observers: read-only, shared scenes only, no character data, no write controls.
  - `COLLAB-012` — Player Groups for projection/handout targeting; group membership ≠ permission.
  - `COLLAB-013` — Mobile/reconnect catch-up preserves operation order, revocation semantics.
  - `COLLAB-014` — Session-cache policy: TTL, key invalidation, persistent-grant exceptions.
  - `PERM-001` — Every participant has exactly one base role (DM / Player / Observer).
  - `PERM-002` — DM sets `dm-only / player-visible / shared`; enforced before any non-DM query.
  - `PERM-003` — Visibility at entity → section → field granularity; more specific overrides less.
  - `PERM-004` — Grant record: entity, player, capability set, author, timestamps, optional expiry.
  - `PERM-005` — Capability sets defined per entity type in schema; no raw field checkboxes.
  - `PERM-006` — Capability-set inheritance: `owner` includes `combat-participant` etc.
  - `PERM-007` — Consistency errors surfaced to DM: write grant on hidden content, bad bindings.
  - `PERM-008` — Grant UI shows named sets with explanations and effective-permission preview.
  - `PERM-009` — Capability caches invalidated immediately on grant/visibility/role change.
  - `PERM-010` — Denied access audited; denial message never leaks hidden entity titles/content.
  - `PERM-011` — Observer always read-only; stale write grants ignored; error surfaced to DM.
  - `PERM-012` — DM revokes/changes visibility at entity/section/field; subscriptions invalidated.
  - `PERM-013` — Character ownership transfer is atomic (revoke old, create new in one command).
  - `PERM-014` — Permission audits actionable for DM; opaque to players (no hidden title leak).

- **Related UX docs:**
  - `01-visual-design-system.md` — tokens, color, motion system (consumed; not redefined here).
  - `02-navigation-and-platform-profiles.md` — profile breakpoints; where panels attach.
  - `03-accessibility.md` — global a11y baseline; this doc adds surface-specific live-region and
    focus-management requirements.
  - `04-canvas-scene-widgets.md` — canvas-level Player View projection.
  - `07-characters.md` — character sheet; capability-set assignment referenced from there.
  - `08-sessions-live-play.md` — combat tracker; combat state visibility referenced from there.
  - `09-content-authoring-and-sources.md` — content editor inline visibility markers.
  - `12-sync-offline-reliability.md` — connection/sync state indicator (referenced, not duplicated).

---

## 2. UX goals for this surface

Collaboration and permissions is the surface most likely to cause irreversible harm if it misfires:
a DM accidentally leaks a major plot secret to a player, a player finds themselves locked out of
their own character with no explanation, or a participant sees a spinner with no signal during a
live session. The design must be **safe by default** and **legible under pressure**: presence must
be glanceable without distracting from play; permission grants must be non-bureaucratic yet
impossible to misjudge; visibility controls must make the three states unmistakable and distinguish
themselves clearly from permission grants.

| Parameter | Goal for this surface |
|---|---|
| **Visual appeal** | Presence avatars, session roster, and visibility controls must feel premium and purposeful — not like an IT admin panel. Use the genre-appropriate palette from `01-visual-design-system.md`; presence colors are role-coded (DM amber, player blue, observer muted), not arbitrary. |
| **Information scent** | Role label, connection state, and online/offline status are readable at a glance on every participant avatar. Visibility state badges (hidden/player-visible/shared) carry both an icon and a text label — never color alone. "Manage access" is the canonical label for the grant dialog — borrowed from Figma/Drive pattern vocabulary players already know. |
| **Navigability** | Presence strip → full participant roster in one click. Participant → grant dialog in ≤2 steps. DM visibility control reachable inline on any entity (right-click / context menu / toolbar) — never a separate settings screen. "Preview as player" reachable from the same visibility toolbar; exit is always one Escape or button press. |
| **Intuition / learnability** | A DM who has never used the product must be able to correctly push a handout, verify delivery, and revoke it in under 60 seconds without reading documentation. The permission grant dialog leads with "Who?" then "What?" then previews the effect — same cognitive order as the mental model. Visibility control labels read as complete sentences: "Hidden from players", "Players can see this", "Shared with specific players". |
| **Accessibility** | WCAG 2.2 AA throughout. Presence list is a live region — arrivals and departures announced to screen readers. Visibility state changes announced via `aria-live="polite"`. Grant dialog fully keyboard-navigable; focus trapped in dialog; focus returns to trigger on close. Color never the sole indicator — every state has an icon and label. ≥44 CSS px touch targets on all interactive presence and permission elements. |
| **Adaptability (platform profiles)** | Desktop: persistent presence strip in top bar, full grant dialog in a floating panel. Tablet: presence strip collapses to avatar row; grant dialog opens as a bottom sheet. Mobile: presence accessible via session menu icon; grant and visibility controls available as bottom sheets with touch-friendly pickers. Same commands and results on all profiles. |
| **Effective emphasis (visual hierarchy)** | Presence strip is secondary chrome — it must not compete with content. Handout delivery confirmation is a distinct toast/sheet that demands brief attention. Visibility state controls on content are contextual, not persistent — they appear inline on hover/focus or via context menu, not cluttering every item at rest. The "Preview as player" banner is the single most prominent UI element while active. |
| **Feedback & responsiveness** | Grant dispatch acknowledges in ≤100 ms optimistically; revocation takes effect on next participant command. Handout delivery shows per-player "Sent → Opened" state. Presence arrival/departure animates in ≤200 ms (respects `prefers-reduced-motion`). Connection state feedback visible within 1 s of degradation. |
| **Error prevention & recovery** | Grant requires preview confirmation before submit. Revocation is one-step but reversible by re-granting. Visibility change to `dm-only` on content that has an active player grant shows a consistency warning before apply. "Preview as player" is read-only with an unmistakable banner — no accidental DM action possible in preview mode. |
| **Consistency** | Visibility three-state toggle uses identical iconography and label text everywhere it appears (content editor, character sheet toolbar, grant dialog context, canvas widget inspector). Presence avatar treatment is identical in the strip, the participant roster, the grant dialog player picker, and the handout recipient list. |

---

## 3. Researched best practices

### 3.1 Multiplayer presence and awareness

Figma's multiplayer presence model [1] is the industry reference for collaborative spatial
tools: named colored avatars clustered in a toolbar, each clickable to "follow" that user's
viewport. The avatar count collapses to "+N" beyond a threshold (typically 4–5) to avoid toolbar
sprawl. Each avatar carries a role-readable tooltip on hover. **Implication:** the presence strip
shows ≤5 avatars at full size, then "+N others"; clicking any avatar opens the participant roster;
the DM avatar is visually distinguished (amber ring) from player avatars (blue ring) and observers
(grey ring).

Miro's presence indicators [2] extend the Figma model with "idle" dimming (avatar fades when
a collaborator has been inactive for ~3 minutes) and a visible cursor label tied to each active
user in the shared canvas space. In a D&D context, live cursors showing a player's focus area are
appropriate only on shared maps — not on the DM's private canvas layers. **Implication:** cursor
presence is opt-in per-canvas and shown only to participants who share that canvas; DM-only canvas
layers never show player cursors.

Google Docs's collaborator chip model [3] shows presence in a top-right cluster, but shifts to an
activity panel (collapsed by default) when a document exceeds ~10 participants. **Implication:**
the participant roster panel uses a collapsible design so it never occludes content at table scale
(typically 5–7 participants in a D&D session).

### 3.2 Sharing dialogs and role pickers

Figma's share dialog [4] and Google Drive's "Manage access" dialog [5] are the canonical reference
implementations for role assignment: a search/picker for the target person, a role dropdown beside
their name, and a contextual explanation of what the role does. Both lead with the person, then
the role — matching the mental model of "I want to let *this person* do *this thing*." Neither
exposes the internal permission table. **Implication:** the grant dialog follows this exact order:
(1) player picker, (2) entity type + entity picker, (3) capability set (named, with one-line
description), (4) effective permission preview (expanded inline below the picker), (5) optional
expiry, (6) Grant / Transfer button.

Notion's guest permission model [6] limits role choices to a fixed vocabulary ("full access",
"can edit", "can comment", "can view") and shows a badge beside each content item indicating its
sharing status. This prevents the "permission matrix" anti-pattern while still giving granular
control. **Implication:** capability sets like `owner`, `combat-participant`, `backstory-editor`,
`viewer` follow exactly this named-set pattern — the grant UI never offers a field-level checkbox
list (see PERM-005).

Linear's member roles page [7] offers a "role preview" link beside each role name, expanding an
inline summary of what the role can and cannot do. **Implication:** the effective-permission
preview in the grant dialog (`GrantManager`) renders the `previewGrantEffect()` output inline
below the selected capability set — allowed operations bulleted, excluded capabilities greyed — so
the DM never has to guess what they're granting.

### 3.3 Visibility controls and "view as" modes

GitHub's repository visibility controls [8] use a clear 3-state model (Public / Internal /
Private) with explanatory copy per state, a prominent current-state badge, and a confirmation
dialog before changing to a more restrictive state. The states are ordered by increasing
restriction. **Implication:** the DM visibility toggle uses three states ordered from most to least
player-accessible: `shared → player-visible → dm-only`; changing to `dm-only` prompts a
one-line confirmation if active player grants exist on that content.

Google Workspace's "View as" role-switcher [9] appends a persistent yellow banner reading "You
are viewing this as [role]" with a single exit button. All editing controls are disabled in this
mode. This pattern succeeds because the banner is inescapable and semantically distinct from all
other chrome. **Implication:** "Preview as player / observer" enters a dedicated read-only mode
with a persistent amber banner across the full viewport top edge; all write controls are suppressed
(not just hidden); exit is a single prominent button in the banner.

NN/g's "Permissions UX" article [10] identifies three cardinal sins of permission UIs: (a) exposing
raw access-control lists to non-technical users ("users think in tasks, not in permissions"), (b)
making permission state invisible ("if users can't see who has access, they can't manage it"), and
(c) conflating visibility with write access ("users confuse 'can see' with 'can edit'"). **Implication:**
(a) only named capability sets appear in the grant UI, never field lists; (b) every content item
shows its current visibility state inline as a badge; (c) visibility and permission are visually
distinct concepts with different icons, different label vocabulary, and explicit UI separation.

### 3.4 Handout delivery and confirmation semantics

Slack's "send to channel / DM" model with read receipts [11] demonstrates that delivery confirmation
creates accountability and reduces uncertainty. In a D&D context, the DM needs to know that a
handout has been received, not just dispatched. **Implication:** handout delivery tracking shows
per-player state: `Pending → Delivered → Opened`; and surfaces a `Revoke` action inline beside
each recipient, consistent with COLLAB-007's delivery acknowledgement and revocation semantics.

### 3.5 Connection state and reconnect feedback

Chrome's "You are offline" banner and the Slack offline ribbon [12] both use a persistent,
non-blocking banner at the top of the viewport — not a modal — so the user can continue reading
content while aware of degraded state. **Implication:** connection degradation is shown via the
sync-state banner defined in `12-sync-offline-reliability.md`; this document adds only the session-
specific layer: which participants show as "offline/reconnecting" in the presence strip when their
connection drops.

---

## 4. Reference implementations (exemplars)

| Product | What they do well (specific) | Principle / why it works | Borrow / Avoid | Link |
|---|---|---|---|---|
| **Figma** | Presence avatars cluster in top bar; clicking follows viewport; avatars carry role label on hover; "+N" collapse at threshold | Spatial awareness without occlusion; consistent color-coding by user identity; zero learning curve for collaborators | Borrow: avatar cluster pattern, "+N" collapse, click-to-follow, role-labeled tooltip | https://help.figma.com/hc/en-us/articles/360039830834 |
| **Google Drive "Manage access"** | Share dialog leads with person → role; role picker has description; current-state badge on item; "Viewer / Commenter / Editor" vocabulary; link-sharing row separated from individual grants | Person-first mental model; named role vocabulary; badge shows sharing status at rest without requiring dialog open | Borrow: dialog anatomy, person-first order, named role vocab, item badge; Avoid: "link sharing" analogy (DM explicitly controls who joins, not a URL) | https://support.google.com/drive/answer/2494822 |
| **GitHub repository visibility** | 3-state visibility toggle with explanatory paragraph per state; current state bold-highlighted; confirmation dialog before restrictive change | Ordered states by accessibility; explanation removes guesswork; confirmation guards against accidental restriction | Borrow: 3-state toggle, ordered from accessible→restricted, confirmation on restrictive change; Avoid: using code-repository vocabulary ("public repo" ≠ "shared content") | https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility |
| **Google Workspace "View as"** | Persistent amber banner "Viewing as [role]"; all write controls disabled (not hidden); single exit button; URL changes to signal mode | Mode is inescapable and unambiguous; no accidental write action possible; exit is always visible | Borrow: amber full-width banner, disabled (not hidden) writes, single exit, mode signal in URL; Avoid: hiding controls (hidden controls cause "where did X go?" confusion) | https://support.google.com/a/answer/4430112 |
| **Notion guest permissions** | Fixed vocabulary (full access / can edit / can comment / can view); badge per page; "Who has access" list inline; guest vs. workspace member distinction clear | Named sets prevent matrix overload; badge gives ambient awareness; separation of identity type reduces mis-granting | Borrow: named-set vocabulary, ambient badge, inline access list; Avoid: "comment" as a capability (D&D has no commenting model) | https://www.notion.com/help/sharing-and-permissions |
| **Slack read receipts / DMs** | "Delivered" / "Seen" status on messages; per-recipient status in group DMs; revoke message option | Delivery confirmation reduces uncertainty and provides DM audit trail | Borrow: per-recipient Delivered → Opened state; Avoid: making read receipts mandatory (player may close app mid-handout; "Delivered" ≠ "Read") | https://slack.com/help/articles/360053109974 |

**North-star narratives:**

**Figma's presence:** The single most important thing to borrow is the *avatar-as-ambient-indicator*
pattern: the presence strip is always visible but never demands attention. Clicking an avatar reveals
context (role, device, connection state) rather than burying that context in a separate menu. In a
D&D session, the DM needs peripheral awareness of who is connected without being interrupted; Figma
has solved this at the interaction model level, not just visually.

**Google Drive's share dialog:** The grammar of the grant dialog — person, then entity, then role,
then preview — is so well-established that it reduces the DM's cognitive load to a practiced habit
rather than a novel decision. The lesson is not aesthetic; it is architectural: the dialog's *order
of questions* is its UX. This document mandates that order explicitly and forbids departing from it.

**GitHub's 3-state visibility toggle:** The key insight is that the three states must be *ordered
and explained*, not just labeled. A DM choosing between `dm-only`, `player-visible`, and `shared`
should never have to reason from first principles about what each means — the UI makes the
accessibility ordering obvious and the confirmation dialog catches mistakes before they leak content.

---

## 5. UX/UI requirements

---

### UX-COLLAB-001 — Presence strip: persistent, glanceable participant roster

- **Requirement:** A persistent presence strip must display all connected participants with role-coded
  avatars, online/offline state, and a participant count badge. The strip must be visible at all times
  on Desktop and Tablet; accessible via a session icon on Mobile.
- **Rationale:** Figma's presence model [1] demonstrates that ambient awareness requires persistent
  visual placement, not a menu. COLLAB-004 requires ephemeral presence for online status and device
  availability.
- **Spec:**
  - Strip location: top bar, trailing edge (right side), between the top-bar actions and the sync
    badge from `12-sync-offline-reliability.md`.
  - Show up to 5 avatars at full size (32×32 CSS px on Desktop, 28×28 on Tablet); beyond 5, collapse
    to `+N others` chip using the standard chip component from `01-visual-design-system.md`.
  - Avatar ring color: DM → `--color-role-dm` (amber); Player → `--color-role-player` (blue);
    Observer → `--color-role-observer` (muted grey). All three are defined in the Visual Design System.
  - Offline/disconnected participant: avatar desaturated (40% opacity) + disconnected icon (plug
    with X, 12×12 CSS px overlay, bottom-right of avatar). Icon carries `aria-label="[name] disconnected"`.
  - Idle participant (inactive >3 min): avatar at 65% opacity, no additional badge (dimming only).
  - Avatar tooltip (hover/focus): participant display name, role, connection state ("Online",
    "Reconnecting", "Offline"), device type icon (desktop/tablet/mobile). Tooltip max width: 200 CSS px.
  - Clicking an avatar: opens the participant roster panel (see UX-COLLAB-003) focused on that
    participant's entry.
  - `+N others` chip: clicking opens the full participant roster.
  - DM's own avatar shown first (leftmost), then players alphabetically, then observers.
- **States:**
  - *default:* avatars displayed as described; ring color by role.
  - *hover/focus-visible:* tooltip appears; avatar scales to 110% (150 ms ease-out).
  - *active/clicked:* participant roster panel opens.
  - *disconnected participant:* desaturated + disconnected icon overlay.
  - *all offline (local-only session):* strip shows only DM avatar; sync badge from doc 12 takes
    over the degraded-state communication.
  - *empty (solo mode, no participants):* strip hidden entirely — no phantom chrome.
- **Platform profiles:**
  - Desktop: strip always visible in top bar; full 32 px avatars; tooltip on hover.
  - Tablet: strip always visible; 28 px avatars; tooltip on long-press (500 ms threshold).
  - Mobile: strip replaced by a single session icon (person-group icon, 24×24 CSS px) in the top
    bar; tapping opens the participant roster as a bottom sheet. The icon shows the online participant
    count as a badge (e.g. "3").
- **Input:** pointer (click avatar) · touch (tap avatar; long-press for tooltip) · keyboard
  (`Tab` through avatars; `Enter`/`Space` opens roster; `Escape` closes tooltip).
- **Accessibility:** presence strip is `role="list"` with `aria-label="Session participants"`;
  each avatar is `role="listitem"` with `aria-label="[name], [role], [connection state]"`;
  `aria-live="polite"` region announces participant arrival ("Maya joined as Player") and departure
  ("Ryo disconnected") — messages appended to a visually hidden live-region container.
- **Acceptance criteria:**
  - Given 6 participants are connected, when the strip renders, then 5 avatars are visible and "+1
    others" chip is shown.
  - Given a participant disconnects, when the strip updates, then their avatar desaturates and
    the screen reader announces "[name] disconnected".
  - Given the user is on Mobile, when they tap the session icon, then the participant roster opens
    as a bottom sheet.
  - Given no participants are in the session, when the strip renders, then it is not visible.
- **Priority:** Must-have

---

### UX-COLLAB-002 — Participant roster panel: full session view

- **Requirement:** A participant roster panel must display all session participants with role, connection
  state, Player View assignment (DM-side), and quick-action links (View as, Manage Access, Remove).
  The panel is secondary, opened on demand — not default-open.
- **Rationale:** COLLAB-005 (per-player view control) and COLLAB-011 (observer limits) require the DM
  to manage per-participant state; PERM-001 (base role) and PERM-008 (grant UI) are the downstream
  controls linked from this panel.
- **Spec:**
  - Panel trigger: click/tap the presence strip or the `+N others` chip (Mobile: session icon → bottom
    sheet).
  - Desktop: floating panel, 320 CSS px wide, anchored top-right below the strip; dismisses on
    click-outside or Escape.
  - Tablet: floating panel, 300 CSS px wide, same anchor; dismisses on tap-outside.
  - Mobile: bottom sheet, full viewport width, max-height 70 vh, draggable handle at top.
  - Each participant row (min-height 56 CSS px, touch target ≥44×44 CSS px) contains:
    - Avatar (28×28 CSS px) with role ring and connection badge.
    - Display name (body/medium weight) + role chip ("DM", "Player", "Observer") using role token
      colors from the Visual Design System.
    - Connection state text (12 sp, muted) — "Online", "Reconnecting", "Offline".
    - Player View assignment selector (DM-only, Player rows only): shows assigned Scene name or
      "None"; tap/click opens a Scene picker popover (max 240 CSS px wide, lists available Scenes).
    - Action overflow (three-dot / kebab icon, 44×44 touch target): "Manage Access" → opens grant
      dialog; "Preview as this role" → enters preview mode; "Remove from session" → destructive
      confirm (see UX-COLLAB-010).
  - Observer rows omit Player View selector; "Manage Access" is absent (observers cannot receive
    write grants per PERM-011).
  - Sort order: DM first, then players alphabetically, then observers.
  - Empty state (DM only, no players): "No players have joined yet. Share an invite to add players."
    with an inline "Copy invite link" button.
- **States:**
  - *default:* list of participants.
  - *loading:* skeleton rows (3 rows, same height) while session state loads.
  - *participant reconnecting:* row shows reconnecting spinner beside the connection label.
  - *participant removed:* row fades out (200 ms opacity to 0) then is removed from list.
- **Platform profiles:**
  - Desktop: floating panel as described; keyboard-navigable row list.
  - Tablet: same as Desktop but dismisses on tap-outside; Scene picker opens as a popover anchored
    to the assignment selector.
  - Mobile: bottom sheet; Scene picker for Player View opens as a new stacked bottom sheet.
- **Input:** pointer · touch · keyboard (`Tab` through rows; `Enter`/`Space` on action overflow;
  `Escape` closes panel; arrow keys navigate participant list).
- **Accessibility:** panel is `role="dialog"` with `aria-label="Session participants"`;
  focus trapped within panel when open; focus returns to trigger element on close;
  each row is `role="listitem"`; action overflow has `aria-label="More actions for [name]"`.
- **Acceptance criteria:**
  - Given the DM clicks "+2 others" in the presence strip, when the roster panel opens, then all
    participants are listed with role, connection state, and (for players) a Player View selector.
  - Given an observer row is shown, when the DM opens the action overflow, then "Manage Access" is
    absent.
  - Given the DM selects a Scene in the Player View selector for Player A, when confirmed, then
    COLLAB-005 is satisfied and Player A's view updates.
- **Priority:** Must-have

---

### UX-COLLAB-003 — Session join / invite / leave flows

- **Requirement:** The DM must be able to generate and revoke invitations or local pairing codes
  from a session-start or session-settings flow. Players and observers must be able to join via
  invitation with visible role assignment before confirming. All participants must be able to leave
  with a confirmation that explains cache-purge behavior.
- **Rationale:** COLLAB-001 (start session, issue invitations, role assignment), COLLAB-010 (cache
  purge on leave), COLLAB-011 (observer limits).
- **Spec:**
  - **DM: Start session / invite flow**
    - Entry point: Command Center's "Start session" button (primary CTA) or the session menu in the
      top bar ("Session settings → Invite players").
    - Start session dialog (modal, max width 480 CSS px):
      ```
      ┌─────────────────────────────────────────┐
      │  Start a session                      ✕ │
      │─────────────────────────────────────────│
      │  Session name  [____________]            │
      │                                         │
      │  Invite players                         │
      │  ┌──────────────────────────────────┐   │
      │  │  Link  [••••••••••••••••]  Copy  │   │
      │  │  Role  [Player ▾]               │   │
      │  │  Expires  [24 hours ▾]          │   │
      │  └──────────────────────────────────┘   │
      │  + Generate observer link               │
      │                                         │
      │  [ Start session ]                      │
      └─────────────────────────────────────────┘
      ```
    - Invitation link is pre-generated and displayed masked (obfuscated, not plain text); "Copy"
      copies to clipboard; a "Regenerate" action revokes the current link and issues a new one.
    - Role picker: "Player" (default) or "Observer"; DM cannot invite a second DM via this flow.
    - Expiry picker: "1 hour / 6 hours / 24 hours (default) / Custom".
    - Local pairing code: an alternative "Show pairing code" link below the link row opens a 6-digit
      code display (large, monospace, 32 sp) suitable for local LAN play. Code refreshes every 10 min.
  - **Player/Observer: Join flow**
    - Pre-join screen shows: session name, DM display name, assigned role, session participant count.
    - Role display is read-only — the invitation determines the role; the joiner cannot change it.
    - "Join" button: primary CTA. "Cancel": secondary. No authentication required beyond the invitation.
    - Post-join: presence strip populates; Player View loads the DM-assigned Scene (or a waiting screen
      "Waiting for DM to set your view" if none assigned yet).
  - **Leave flow (any participant)**
    - "Leave session" in session menu → confirmation dialog:
      - Title: "Leave this session?"
      - Body (Player): "Your session access and locally cached content will be cleared. Handouts
        the DM granted you permanently will remain."
      - Body (Observer): "Your read-only session access and any cached content will be cleared."
      - Primary: "Leave session" (destructive color token); Secondary: "Stay".
    - On confirm: session state torn down; cache-purge procedure initiated per COLLAB-010.
    - If cache purge cannot be confirmed (offline device): session status shown as "purge-unconfirmed"
      in DM's roster panel (not exposed to other players). See PERM-014.
- **States:**
  - *invitation revoked:* joining with revoked link shows "This invitation has expired or been revoked"
    — no session state disclosed.
  - *join pending:* join button shows a spinner; session name and role remain visible.
  - *leave in progress:* participant row in DM roster shows "Leaving…" state until cache purge
    confirmed or timeout.
- **Platform profiles:**
  - Desktop: modal dialogs as described.
  - Tablet: same modal; pairing code flow works identically.
  - Mobile: dialogs open as bottom sheets; pairing code displayed full-width in the sheet body.
- **Input:** pointer · touch · keyboard (dialog traps focus; `Enter` confirms; `Escape` cancels).
- **Accessibility:** dialogs are `role="dialog"` with `aria-modal="true"` and appropriate `aria-label`;
  destructive confirm button has `aria-describedby` pointing to the consequence copy; focus returns
  to the triggering element on cancel.
- **Acceptance criteria:**
  - Given a player uses a valid invitation, when they join, then their role, assigned view, and
    grants are applied and their avatar appears in the presence strip.
  - Given an expired invitation is used, when join is attempted, then no session state is disclosed
    in the error message.
  - Given a player confirms "Leave session", when the leave completes, then their row is removed
    from the roster and the DM sees cache-purge status.
- **Priority:** Must-have

---

### UX-COLLAB-004 — Handout delivery panel: push, track, revoke

- **Requirement:** The DM must be able to push a handout (image, note, map fragment, cipher, rumor)
  to selected players or Player Groups, see per-player delivery and open status, and revoke delivery —
  all from a single panel without navigating away from the current session surface.
- **Rationale:** COLLAB-007 (handout delivery, delivery acknowledgement, revocation state);
  COLLAB-012 (Player Groups as delivery targets).
- **Spec:**
  - Entry point: right-click any content item → "Push as handout…"; or the "Handouts" panel in the
    Command Center widget library.
  - Handout delivery dialog (Desktop: panel, 360 CSS px wide, positioned adjacent to the trigger;
    Mobile: bottom sheet):
    ```
    ┌──────────────────────────────────────────────┐
    │  Push handout                              ✕ │
    │──────────────────────────────────────────────│
    │  Content                                     │
    │  [Region Briefing — note]            Change  │
    │                                              │
    │  Recipients                                  │
    │  ○ All players                               │
    │  ○ Specific players                          │
    │  ○ Player Group  [Party A ▾]                 │
    │                                              │
    │  Persistence                                 │
    │  □ Grant persistent access after session     │
    │                                              │
    │  [ Push handout ]                            │
    └──────────────────────────────────────────────┘
    ```
  - After push, the dialog transitions to a delivery tracking view (same panel, no navigation):
    - Per-player row: avatar + name + delivery state chip.
    - Delivery state chips:
      - `Pending` (muted, clock icon) — dispatched, not yet delivered.
      - `Delivered` (muted green, check icon) — reached player device.
      - `Opened` (green, open-envelope icon) — player has viewed.
    - Each row has an inline "Revoke" action (text link, 44 CSS px touch target). Revoking shows
      a brief confirmation tooltip ("Revoke for [name]? This removes the handout from their view.")
      with "Revoke" (destructive) and "Cancel" buttons.
  - Persistent access checkbox: when checked, granting "persistent access" is communicated in plain
    language: "This player keeps access to this content after the session ends." Unchecked by default.
    Links to PERM-002/COLLAB-010 semantics in a "What is persistent access?" inline tooltip.
  - Player Group selector: lists defined groups (COLLAB-012); shows member count beside each group
    name. Selecting a group and then opening "Specific players" shows which players are in the group
    (read-only preview).
  - Revoking when player is offline: revoke command queued; their row shows "Revoke pending" state
    until the player reconnects and confirms. See COLLAB-013.
- **States:**
  - *empty content:* "Select content to push" prompt with a content picker.
  - *no players in session:* dialog blocked; "No players connected to receive a handout."
  - *all recipients offline:* push queued; rows show "Queued (offline)" state.
  - *delivery failed (network error):* row shows error chip with "Retry" link.
- **Platform profiles:**
  - Desktop: panel anchored to trigger, persistent alongside session; delivery tracking stays open
    until dismissed.
  - Tablet: same as Desktop; panel opens as a side sheet (from right edge).
  - Mobile: bottom sheet; delivery tracking view scrolls within the sheet.
- **Input:** pointer · touch · keyboard (panel focus-trapped; `Tab` through controls; `Enter`
  pushes; `Escape` closes; revoke confirmation via `Enter`/`Escape`).
- **Accessibility:** delivery state chips include screen-reader text ("[name]: handout delivered");
  `aria-live="polite"` on the tracking view announces state changes ("Zara opened the handout");
  revoke confirmation tooltip has `role="dialog"` and traps focus.
- **Acceptance criteria:**
  - Given the DM pushes a handout to Player A, when Player A's device receives it, then the DM's
    tracking view shows "Delivered" for Player A.
  - Given the DM revokes the handout for Player A who is online, when revoke is confirmed, then
    Player A's canvas removes the handout widget.
  - Given the "Grant persistent access" checkbox is unchecked and the session ends, when the player
    reconnects later, then the handout is no longer accessible.
  - Given delivery and revocation are both queued while the player is offline, when the player
    reconnects, then replay order determines final visibility per COLLAB-013.
- **Priority:** Must-have

---

### UX-COLLAB-005 — Shared combat state: filtered visibility overlay

- **Requirement:** During active combat, all connected participants must see a combat-state overlay
  filtered to their role and grants: the DM sees all combatants; players see their character and
  DM-approved combatants; hidden combatants are omitted or shown as a DM-configurable placeholder.
- **Rationale:** COLLAB-006 (shared combat state, role-filtered, HP/status summaries, permitted
  interaction controls); COLLAB-003 (near-real-time updates); principle 8 (never leak hidden content).
- **Spec:**
  - The combat state overlay is a widget on the shared canvas. Its content differs per viewer role
    — the data layer sends only permitted data, not a full roster that the UI hides.
  - DM view: all combatants, full HP, conditions, hidden-combatant badge ("Hidden from players").
  - Player view: own character row (full data including HP if `owner` or `combat-participant`);
    other visible combatants (name, HP bar, conditions — detail level per DM setting); hidden
    combatants absent entirely or represented by "???" placeholder (DM-configured label string,
    max 20 chars, default "Unknown creature").
  - Observer view: same as player view minus own character row; all writes disabled.
  - "DM-approved combatant" == combatant whose combat-state visibility is `player-visible` or
    `shared` AND who is not marked `dm-only` in this combat context.
  - Interaction controls per row: HP stepper and condition toggle enabled only if the participant
    has `combat-participant` or `owner` on that character. Otherwise controls are `disabled` (visible
    but non-interactive) — not hidden — to make the permission model legible.
  - Current turn indicator: highlighted row, animated pulse (150 ms ease-in-out; reduced-motion:
    border-highlight only). Announced via `aria-live="assertive"`: "[Character name]'s turn."
  - HP changes from DM during a player's combat-participant edit: DM's value prevails (COLLAB-008);
    player's row shows a brief "Updated by DM" attribution chip (2 s timeout, muted style).
- **States:**
  - *combat not started:* widget shows "Combat has not started" placeholder; DM sees a "Start
    combat" button.
  - *loading/stale:* skeleton rows; "Session updates are delayed" banner (from doc 12) if p95
    delivery exceeds the latency budget.
  - *combat ended:* widget shows "Combat ended"; persists for 10 s then collapses.
- **Platform profiles:**
  - Desktop: combat widget embedded in canvas; full row display.
  - Tablet: same as Desktop; touch-friendly HP stepper (44 CSS px min-target).
  - Mobile: combat widget opens as a bottom sheet ("Combat" tab in the session bottom bar); slim
    view shows current turn name, own HP, and a one-tap HP edit button. Full combatant list
    accessible via "All combatants" expand within the sheet.
- **Input:** pointer · touch · keyboard (`Tab` to HP stepper; `↑`/`↓` adjust HP; `Enter`
  commits; `Space` toggles conditions).
- **Accessibility:** initiative list is `role="list"`; each combatant row is `role="listitem"` with
  `aria-label="[name], HP [n], [condition list]"`; disabled controls have `aria-disabled="true"`;
  current-turn announcement via `aria-live="assertive"`.
- **Acceptance criteria:**
  - Given Player A has `combat-participant` on their character, when combat state updates, then
    their character's HP stepper is enabled and updates in ≤200 ms.
  - Given a hidden enemy is in initiative, when Player A views combat, then the hidden combatant is
    absent from Player A's data stream (not merely hidden in UI).
  - Given a player has no grant on an NPC, when they view the NPC row, then HP stepper is visible
    but `aria-disabled="true"` and non-interactive.
- **Priority:** Must-have

---

### UX-COLLAB-006 — Connection state feedback: session-specific degradation

- **Requirement:** When a participant's connection degrades (disconnecting, reconnecting, stale sync),
  the UI must communicate session-specific state: which participants are affected, whether commands
  are locked, and what the participant should do. This is layered on top of the global sync indicator
  from `12-sync-offline-reliability.md`.
- **Rationale:** COLLAB-002 (reconnect catch-up), COLLAB-003 (stale-state reporting), COLLAB-013
  (mobile catch-up), PERM-009 (cache invalidation before reconnect commands).
- **Spec:**
  - Session-layer degradation banner (not the global offline banner from doc 12): shown only when the
    participant is in an active session AND their session connection is degraded.
  - Banner: fixed to the bottom of the viewport (above the bottom tab bar on Mobile), full width,
    compact (36 CSS px height), using `--color-status-warning` background token.
  - Copy:
    - Reconnecting: "Reconnecting to session… Commands are paused."
    - Stale: "Session updates are delayed. Commands may be queued."
    - Reconnected: "Back online." → auto-dismisses after 3 s.
  - While reconnecting: all write commands (HP edits, handout pushes, grant changes) show a queued
    indicator (not blocked — queued) and commit when reconnection completes, in order (COLLAB-013).
  - Grant/visibility commands are blocked (not queued) while reconnecting — they require live server
    authority. Blocked controls show `aria-disabled="true"` and a tooltip: "Reconnecting. Permission
    changes require a live connection."
  - Participant roster: affected participant's row shows "Reconnecting…" state with an animated
    spinner beside their connection label. DM sees the reconnect state for all participants.
- **States:**
  - *nominal:* no session banner visible.
  - *reconnecting:* warning banner visible; write commands queued; grant commands blocked.
  - *stale (>2 s lag):* caution banner visible; commands allowed but marked "pending".
  - *reconnected:* success banner visible for 3 s; command queue drains in order.
  - *failed reconnect (>30 s):* banner escalates: "Unable to reconnect. Your changes are saved
    locally." with a "Try again" link.
- **Platform profiles:**
  - Desktop: banner at bottom of viewport.
  - Tablet: same.
  - Mobile: banner above the bottom tab bar; 36 CSS px height.
- **Input:** "Try again" link is keyboard- and touch-focusable (44×44 CSS px target).
- **Accessibility:** banner has `role="status"` and `aria-live="polite"` when showing reconnecting
  state; escalates to `aria-live="assertive"` on failed reconnect.
- **Acceptance criteria:**
  - Given the participant's session connection drops, when degradation is detected, then the session
    banner appears within 1 s with "Reconnecting to session…" copy.
  - Given the participant reconnects, when catch-up completes, then the "Back online" banner shows
    for 3 s then dismisses, and queued commands are applied in order.
  - Given reconnection fails after 30 s, when the escalated banner appears, then grant/visibility
    commands remain blocked and the "Try again" link is keyboard-accessible.
- **Priority:** Must-have

---

### UX-COLLAB-007 — Player View controller: per-player canvas assignment

- **Requirement:** The DM must be able to assign, change, and remove a Player View (Scene) for each
  connected player from both the participant roster and the Command Center's Player View controller
  widget, in ≤2 interactions from the current surface.
- **Rationale:** COLLAB-005 (different Player View per player), COLLAB-012 (Player Groups).
- **Spec:**
  - **Inline assignment (participant roster):** Player View selector per player row (see
    UX-COLLAB-002). Dropdown lists available Scenes; "None" removes the assignment.
  - **Command Center widget ("Player View controller"):** shows all connected players in a compact
    list; drag-and-drop Scene assignment (drag a Scene card from the widget library onto a player
    row) with a discrete alternative: each player row has an "Assign scene" button (text, 44 CSS px
    target) that opens a Scene picker popover.
  - Assigning a Scene to a Player Group: Player View controller shows Groups in a separate section
    below individual players; same interaction pattern.
  - Changing assignment mid-session: player's canvas transitions with a 200 ms cross-fade to the
    new Scene. Player receives a toast: "Your view has been updated by the DM."
  - Removing all assignment: player sees a "Waiting for DM" placeholder canvas with the session
    name and their participant display name. No content is visible.
  - If a Scene assigned to a player contains a widget bound to `dm-only` content, the data layer
    returns an "unavailable" placeholder — the widget renders a "Content unavailable" state, not
    an error (PERM-007; COLLAB-009 prevents the data from reaching the player stream).
- **States:**
  - *no assignment:* player row shows "No view assigned"; player sees "Waiting for DM" canvas.
  - *assigned:* row shows Scene name; player sees that Scene.
  - *assignment in progress:* row shows spinner; player's canvas shows transition.
  - *scene unavailable (deleted):* row shows "Scene unavailable" in error color; DM prompted to
    reassign.
- **Platform profiles:**
  - Desktop: drag-and-drop + discrete button in Command Center widget; dropdown in roster.
  - Tablet: discrete button only (no drag-and-drop on touch-primary); Scene picker as popover.
  - Mobile: DM accesses Player View controller via the session bottom sheet; Scene picker stacked
    as a new sheet.
- **Input:** pointer (drag-and-drop + click) · touch (tap to assign; no drag-and-drop) · keyboard
  (`Tab` to "Assign scene"; `Enter` opens picker; arrow keys navigate Scene list; `Enter` confirms).
- **Accessibility:** Scene picker is `role="listbox"`; each Scene is `role="option"`; selection
  confirmed via `aria-live="polite"` ("Scene assigned to [player name]").
- **Acceptance criteria:**
  - Given Player A is connected, when the DM assigns Scene B via the roster, then Player A's
    canvas updates to Scene B within 500 ms.
  - Given a Scene is deleted while assigned to Player A, when the system detects the deletion,
    then the DM sees "Scene unavailable" in the Player View row and Player A sees the "Waiting
    for DM" placeholder.
  - Given a drag-and-drop Scene assignment, when performed on Tablet, then a discrete "Assign
    scene" button alternative achieves the same result.
- **Priority:** Must-have

---

### UX-COLLAB-008 — Player Group management: delivery and projection targets

- **Requirement:** The DM must be able to create, name, and edit Player Groups — sets of players used
  as delivery and projection targets — with clear visual communication that group membership does not
  itself grant visibility or write permissions.
- **Rationale:** COLLAB-012 (Player Groups: delivery targets only; membership ≠ permission);
  principle of information scent (PERM-002 and group membership must not be conflated by the DM).
- **Spec:**
  - Entry point: session settings → "Player Groups" section; also accessible from the handout
    delivery panel's recipient picker.
  - Group list view: card list, each card showing group name, member count, last-used-for label
    ("Used for handouts", "Used for projection"), and edit/delete actions.
  - Create/edit dialog (modal, 400 CSS px):
    - Group name field (required, max 50 chars).
    - Member picker: checkboxes for connected players; observer checkboxes are absent (COLLAB-011).
    - Warning banner at dialog top (not dismissible): "Group membership does not grant players
      permission to see or interact with content. Use 'Manage Access' on the content to grant access."
    - Confirm: "Save group".
  - Delete group: confirmation dialog; "Deleting this group does not affect permissions already
    granted. Handouts already sent are not revoked." Copy must be accurate and non-alarming.
  - Group membership change mid-session: changes affect only future delivery operations; prior
    handouts delivered to former group members are unaffected unless revoked (COLLAB-012).
- **States:**
  - *no groups:* empty state: "No groups yet. Create a group to broadcast handouts or scenes to
    multiple players at once."
  - *group with zero members:* shown with "(empty)" badge; edit to add members.
- **Platform profiles:**
  - Desktop: modal dialogs as described.
  - Tablet: same.
  - Mobile: dialogs as bottom sheets; member picker scrollable within the sheet.
- **Input:** pointer · touch · keyboard (dialog focus-trapped; `Tab` through fields; `Enter`
  saves; `Escape` cancels).
- **Accessibility:** member checkboxes have visible, persistent labels; warning banner has
  `role="note"` and is announced when the dialog opens via an initial focus on the banner text.
- **Acceptance criteria:**
  - Given the DM creates Group A with Players 1 and 2, when a handout is pushed to Group A, then
    only Players 1 and 2 receive the delivery operation.
  - Given Player 3 is added to Group A after a prior handout, when no persistent access grant
    exists, then the prior handout is not delivered to Player 3.
  - Given the DM opens the create-group dialog, when the dialog renders, then the warning banner
    about membership-not-permission is visible before any other interactive element.
- **Priority:** Should-have

---

### UX-COLLAB-009 — Reconnect and mobile catch-up feedback

- **Requirement:** When a participant reconnects after a sleep, background, or network interruption,
  the UI must communicate catch-up progress, preserve operation order, and disable controls that
  require live authority until catch-up completes and grants are re-evaluated.
- **Rationale:** COLLAB-002 (reconnect catch-up, role/grant re-evaluation), COLLAB-013 (mobile
  operation ordering, revocation semantics), PERM-009 (cache invalidation before commands).
- **Spec:**
  - On reconnect initiation: session banner changes to "Catching up…" with a progress indicator
    (indeterminate bar, below the banner text). Controls requiring live authority are `aria-disabled`.
  - Catch-up phase: player sees skeleton placeholders over canvas content while operations are
    applied in dependency order. Canvas content replaces skeletons as each section's state resolves.
  - Catch-up complete: banner dismisses; controls re-enable; a brief toast "You're up to date" if
    catch-up took >2 s.
  - Grant revocation discovered during catch-up: control that required the revoked grant is
    disabled after catch-up; a notification appears: "Your access to [entity type] has changed. Some
    controls are no longer available." — no hidden entity title disclosed (PERM-010).
  - Handout revocation discovered during catch-up: handout widget removed from canvas during
    skeleton phase — not after, to prevent a flash of revealed content.
  - Stale UI prevention: if catch-up fails mid-stream (COLLAB-013), canvas shows "Session data
    may be outdated" banner; all durable commands (HP edits, grant changes) remain disabled until
    catch-up succeeds or the participant re-joins.
- **States:** See UX-COLLAB-006 states; this requirement adds the "Catching up…" sub-state.
- **Platform profiles:** Identical behavior across profiles; skeleton placeholder density scales to
  the platform (Desktop: multi-column; Mobile: single-column).
- **Input:** during catch-up, all write inputs are `aria-disabled`; read-only navigation remains
  fully keyboard-accessible.
- **Accessibility:** catch-up progress announced via `aria-live="polite"` ("Catching up…", "You're
  up to date"); revocation notification via `aria-live="polite"` with the safe generic message.
- **Acceptance criteria:**
  - Given a mobile device wakes after missing a grant revocation, when catch-up completes, then the
    revoked control is disabled and a safe generic notification appears.
  - Given catch-up fails mid-stream, when the participant UI renders, then durable commands are
    disabled and a "Session data may be outdated" banner is shown.
  - Given a handout was revoked while the player was offline, when catch-up applies the revocation,
    then the handout widget is removed during the skeleton phase, not after reveal.
- **Priority:** Must-have

---

### UX-PERM-001 — DM visibility control: 3-state inline toggle

- **Requirement:** Every content entity (note, character field, section, canvas widget, map layer)
  must expose an inline 3-state visibility toggle accessible to the DM in ≤2 interactions from
  the content's current view, using a design that makes the three states unmistakable, ordered
  by accessibility (most exposed → most restricted), and impossible to confuse with permission grants.
- **Rationale:** PERM-002 (3-state visibility: `dm-only / player-visible / shared`), PERM-003
  (entity → section → field granularity, more specific overrides less), principle 8 (must never
  leak), NN/g finding [10] (conflating visibility with write access is a cardinal sin).
- **Spec:**
  - **Three states — names, icons, and copy:**

    | State | Internal name | Icon | Short label | Explanatory copy (tooltip) |
    |---|---|---|---|---|
    | Most accessible | `shared` | person-group + arrow-right | "Shared with specific players" | "Players who have been individually granted access or received a handout can see this." |
    | Partially accessible | `player-visible` | eye-open | "Players can see this" | "All players in the session can see this. No individual grant required." |
    | Restricted | `dm-only` | eye-slash | "Hidden from players" | "Only the DM can see this. Players will not know it exists." |

  - State ordering in the toggle UI: `player-visible` (center/default for new content) → `shared`
    (left) → `dm-only` (right). The toggle is a 3-segment button group, not a dropdown, so all three
    states are visible simultaneously.
  - Current state is indicated by: (a) filled background on the active segment; (b) the icon; (c)
    the short label. Never color alone.
  - **Inline placement:** the toggle appears in the entity's toolbar (for notes/characters) or
    widget inspector (for canvas widgets); it is contextual — visible on hover/focus of the entity
    header, or persistently visible when the entity is in "edit" mode. At rest, only the current-
    state icon is shown (16×16 CSS px); the full 3-segment toggle expands on hover/focus.
  - **Change to `dm-only` with active grants:** if the entity has player grants, changing to
    `dm-only` triggers an inline warning (not a blocking modal):
    ```
    ┌────────────────────────────────────────────────────┐
    │  ⚠ This content has active player access grants.   │
    │  Hiding it will create a permission conflict.       │
    │  [ Hide anyway and flag conflict ]  [ Cancel ]      │
    └────────────────────────────────────────────────────┘
    ```
    "Hide anyway and flag conflict" proceeds and adds a consistency error to the DM's diagnostics
    panel (PERM-007). The player's grant is not automatically revoked — the DM must resolve that
    separately.
  - **Section and field granularity:** when the DM is in content-edit mode, each named section and
    each field shows its own visibility toggle at ≤16 CSS px icon size, collapsed by default. Expanded
    on click, using the same 3-segment button pattern at a smaller scale (22×22 CSS px per segment).
    Field-level visibility overrides section-level which overrides entity-level (PERM-003). The
    current effective visibility for a section/field is shown in grey text below the section heading
    when the override differs from the entity default.
  - **Visual vocabulary separation from permissions:** visibility toggle uses the eye-family icons;
    permission grant controls use a key icon (see UX-PERM-002 through UX-PERM-004). These icon
    families are reserved and used consistently throughout the application.
- **States:**
  - *default (DM, entity at rest):* current-state icon only; 16×16 CSS px; mouse-target 32×32 CSS px.
  - *hover/focus:* full 3-segment toggle expands (200 ms); all three segments labeled.
  - *active/changing:* optimistic update immediately; server confirmation within 200 ms; on rejection
    reverts with an inline error toast.
  - *player/observer view:* toggle not visible (not rendered, not aria-hidden); never shown to non-DM.
  - *consistency conflict:* warning inline (see above); conflict badge on the DM diagnostics panel.
- **Platform profiles:**
  - Desktop: hover-expand toggle as described.
  - Tablet: toggle visible persistently when entity is in edit mode (no hover); tap segment to change.
  - Mobile: visibility controls accessed via a "Visibility" row in the entity's action sheet (bottom
    sheet); 3 radio buttons with full explanatory copy; ≥44 CSS px row height.
- **Input:** pointer · touch · keyboard (`Tab` to toggle group; `←`/`→` arrows cycle states;
  `Enter`/`Space` confirms; conflict warning: `Tab` to action buttons, `Enter`/`Escape`).
- **Accessibility:** toggle group is `role="group"` with `aria-label="Content visibility"`;
  each segment is `role="radio"` (3-state radio pattern); selected segment has `aria-checked="true"`;
  state change announced via `aria-live="polite"`: "Visibility set to: Players can see this";
  icon has `aria-hidden="true"`; text label is the accessible name.
- **Acceptance criteria:**
  - Given the DM hovers over a note's header, when the toggle expands, then all three visibility
    states are visible with icon and label.
  - Given the DM changes a player-visible note to `dm-only` while a player has an active grant on
    it, when the change is initiated, then the conflict warning appears before the command is
    dispatched.
  - Given a player views the note's surface, when they inspect the entity, then no visibility
    toggle is rendered.
  - Given the DM sets a section to `dm-only` on a `player-visible` entity, when a player queries
    the entity, then the entity is visible but the section is absent from their data.
- **Priority:** Must-have

---

### UX-PERM-002 — Capability-set grant dialog: person → entity → set → preview → grant

- **Requirement:** The DM capability grant flow must follow the canonical dialog anatomy (person →
  entity → named capability set → effective permission preview → optional expiry → confirm), must
  never show raw field checkboxes, and must make the effective permission preview readable and
  accurate before the grant is submitted.
- **Rationale:** PERM-004 (grant record), PERM-005 (named sets, no raw fields), PERM-008 (named sets
  with explanations and effective-permission preview), NN/g [10] (person-first mental model).
  Corresponds to `GrantManager.svelte`.
- **Spec:**
  - Entry point: participant roster → action overflow → "Manage Access"; or the entity's kebab menu
    → "Manage Access"; or the DM diagnostics panel's remediation link.
  - Dialog anatomy (modal, Desktop: max 520 CSS px wide; Mobile: bottom sheet, full width):
    ```
    ┌───────────────────────────────────────────────────────┐
    │  Manage access                                      ✕ │
    │───────────────────────────────────────────────────────│
    │  Player                                               │
    │  [ Maya (Player) ▾ ]                                  │
    │                                                       │
    │  Entity type         Entity                           │
    │  [ Character ▾ ]    [ Thorin Oakenshield ▾ ]          │
    │                                                       │
    │  Access level                                         │
    │  ┌─────────────────────────────────────────────────┐  │
    │  │ ○ Owner                                         │  │
    │  │   Full control. Writable: all fields.           │  │
    │  │ ● Combat Participant                            │  │
    │  │   HP, conditions, spell slots, death saves.     │  │
    │  │   Excludes: name, stats, backstory, appearance. │  │
    │  │ ○ Backstory Editor                              │  │
    │  │   Backstory, notes, relationships, history.     │  │
    │  │ ○ Viewer                                        │  │
    │  │   Read-only. No writes.                         │  │
    │  └─────────────────────────────────────────────────┘  │
    │                                                       │
    │  Effective permission preview              ▾ Show     │
    │  ┌─────────────────────────────────────────────────┐  │
    │  │ Combat Participant includes:                     │  │
    │  │   ✓ Edit HP and temporary HP                    │  │
    │  │   ✓ Toggle conditions                           │  │
    │  │   ✓ Update spell slots                          │  │
    │  │   ✓ Record death saves                          │  │
    │  │   — Name, stats, backstory, appearance (read)   │  │
    │  └─────────────────────────────────────────────────┘  │
    │                                                       │
    │  Expires (optional)  [ No expiry ▾ ]                  │
    │                                                       │
    │  [ Grant access ]      [ Transfer ownership ]         │
    └───────────────────────────────────────────────────────┘
    ```
  - Entity picker: searches by name; shows entity type icon beside each result. If the DM opened
    "Manage Access" from a specific entity's context menu, that entity is pre-populated (readonly
    in this field).
  - Capability set list: radio buttons with the set name (bold), a one-line description (muted),
    and a collapsible "Details" row that shows the effective-permission preview (from
    `previewGrantEffect()`). Details are expanded by default when a set is selected.
  - "Transfer ownership" button appears only for entity types with a singular-ownership capability
    (e.g., character `owner`); clicking transfers ownership atomically per PERM-013, showing a
    confirmation: "This will revoke [current owner]'s owner access and grant it to [new owner].
    This cannot be undone without another transfer."
  - Expiry picker: "No expiry / 1 hour / 6 hours / 24 hours / Custom datetime".
  - After grant: dialog stays open showing "Active grants" list (see UX-PERM-003); success toast
    "Access granted for [player name] — [capability set] on [entity name]."
  - Error states: inline, below the field that caused the error; never a blocking modal. Examples:
    "This entity type does not support Combat Participant." (if schema mismatch); "Another player
    already holds Owner access." (for singular-ownership conflict).
- **States:**
  - *no players:* player picker shows "No players in session" and dialog blocks the Grant button.
  - *capability set unavailable for type:* set shown with strikethrough and tooltip explaining why;
    not selectable.
  - *singular ownership conflict:* Owner set selectable but Grant button replaced by "Transfer
    ownership" only, with explanatory copy.
  - *grant in progress:* Grant button shows spinner; form disabled.
  - *grant rejected:* inline error; form remains open for correction.
- **Platform profiles:**
  - Desktop: modal with columns as shown.
  - Tablet: same; entity picker and capability list stack single-column.
  - Mobile: bottom sheet; sections stacked; capability set picker uses full-width radio cards (min
    56 CSS px height each).
- **Input:** pointer · touch · keyboard (dialog focus-trapped; `Tab` through fields; `↑`/`↓`
  navigate radio list; `Enter` grants; `Escape` closes without granting).
- **Accessibility:** dialog `role="dialog"` `aria-modal="true"` `aria-label="Manage access"`;
  capability set list is `role="radiogroup"` with `aria-label="Access level"`; each radio is
  `role="radio"` with `aria-checked`; preview panel is `aria-live="polite"` (updates when selection
  changes); on open, focus goes to the Player picker.
- **Acceptance criteria:**
  - Given the DM selects "Combat Participant" for a character, when the preview renders, then
    writable combat fields and excluded non-combat fields are listed accurately.
  - Given the DM submits a grant for "Owner" when another player already holds it, when validation
    runs, then an inline conflict error is shown and the grant is not submitted.
  - Given a capability set is invalid for the selected entity type, when the DM selects it, then
    it is shown with strikethrough and the Grant button is disabled.
  - Given the DM opens "Manage Access" from a character's context menu, when the dialog opens,
    then that character is pre-populated in the Entity field.
- **Priority:** Must-have

---

### UX-PERM-003 — Active grant list and revocation

- **Requirement:** The grant dialog must display all active grants for the current entity (or for the
  current player if opened from the roster), with revoke actions, expiry indicators, and capability
  set labels. Revocation must be immediate and confirmation must be lightweight.
- **Rationale:** PERM-004 (grant revocation), PERM-009 (cache invalidated immediately on revocation),
  PERM-012 (visibility change invalidates subscriptions).
- **Spec:**
  - Active grants section within the grant dialog (or as a standalone "Access" tab on the entity's
    inspector panel for Desktop):
    - List of grant records, newest first.
    - Each row (min-height 52 CSS px, touch target ≥44 CSS px):
      - Capability set name (bold) + entity name/type (muted, truncated at 32 chars with tooltip).
      - Player name with avatar (20×20 CSS px) and role chip.
      - Expiry: "Expires [date]" in muted style; "Expires in 2 hours" in warning color if within 2 h;
        "No expiry" if null.
      - "Revoke" button (text, danger color, 44 CSS px touch target).
    - Empty state: "No access grants have been issued for this entity."
  - Revoke confirmation: inline tooltip (not a modal): "Revoke [capability set] for [player name]?"
    with "Revoke" (danger) and "Cancel". Tooltip positioned adjacent to the Revoke button; dismissed
    by `Escape` or "Cancel".
  - After revocation: row animates out (150 ms opacity to 0); player's capability cache is
    invalidated immediately (PERM-009); if the player is currently performing an action gated on
    the revoked grant, their next command is rejected by the data layer with the safe generic
    denial message (PERM-010).
  - Ownership transfer from this list: the `owner` row shows "Transfer" instead of "Revoke", linking
    to the transfer flow in UX-PERM-002.
- **States:**
  - *grant expiring soon (<2 h):* row shows warning chip "Expiring soon"; Revoke button replaced
    by "Renew / Revoke" split button.
  - *grant expired:* row shown in muted style with "Expired" chip; Revoke action changes to "Remove"
    (cleanup only, no network authority needed).
  - *revoke in progress:* row shows spinner; Revoke button disabled.
  - *revoke rejected (network):* inline error chip on the row "Revocation failed — try again."
- **Platform profiles:**
  - Desktop: list within the grant dialog panel.
  - Tablet: same.
  - Mobile: grant list as a separate "Grants" tab within the bottom sheet.
- **Input:** pointer · touch · keyboard (`Tab` to "Revoke"; `Enter` to show confirmation tooltip;
  `Tab` to "Revoke" confirm; `Enter` confirms; `Escape` cancels).
- **Accessibility:** grant list is `role="list"`; each row is `role="listitem"` with
  `aria-label="[capability set] for [player name] on [entity name]"`; confirmation tooltip has
  `role="dialog"` and traps focus; revocation announced via `aria-live="polite"`.
- **Acceptance criteria:**
  - Given an active grant is listed, when the DM taps "Revoke", then an inline confirmation appears
    (no modal) before the revoke command is dispatched.
  - Given revocation succeeds, when the animation completes, then the row is removed and a
    `aria-live` announcement is made.
  - Given a grant expires within 2 hours, when the list renders, then the row shows a "Expiring
    soon" warning chip.
- **Priority:** Must-have

---

### UX-PERM-004 — Permission summary: player-facing "Your permissions" panel

- **Requirement:** Every participant (player, observer) must be able to view a plain-language summary
  of their base role, editing capability, and character data access — without any DM-sensitive
  information disclosed. The DM sees an additional consistency-check panel.
- **Rationale:** PERM-001 (base role), PERM-008 (effective permission preview), PERM-011 (observer
  always read-only), PERM-014 (DM diagnostics opaque to players). Corresponds to
  `PermissionSummary.svelte`.
- **Spec:**
  - Entry point: session menu → "My permissions"; or the participant roster's "View permissions"
    link on one's own row.
  - Player-facing summary (role="complementary" region or dialog, max 400 CSS px):
    - Base role row: label "Role" + value "DM / Player / Observer" in the role token color.
    - Editing row: label "Editing" + value "Can write" or "Read-only" with a one-line explanation.
    - Character data row: label "Character data" + value "Available" or "None" with explanation.
    - Normalized role notice (if applicable): "Your role was adjusted to [role] ([reason])." in
      muted style — safe, non-alarming, non-leaking (PERM-011).
  - Observer: all rows show read-only states; no character data row is shown at all (not "None",
    absent) to avoid implying that character data exists but is withheld.
  - DM: sees their own summary (which is trivially "full access") plus the Consistency panel (see
    UX-PERM-005).
  - Entry from the session menu: opens as a popover on Desktop; bottom sheet on Mobile.
- **States:**
  - *loaded:* summary rows visible.
  - *loading:* skeleton rows (3 rows, matching height).
  - *role normalized:* normalized-role notice visible above the rows.
- **Platform profiles:**
  - Desktop: popover (320 CSS px); keyboard-dismissible.
  - Tablet: popover (300 CSS px); tap-outside dismisses.
  - Mobile: bottom sheet, full width, auto-height.
- **Input:** pointer · touch · keyboard (`Escape` closes; `Tab` through rows; no interactive rows
  for the player-facing summary — read-only display).
- **Accessibility:** panel is `role="region"` with `aria-label="Your permissions"`;
  dl/dt/dd semantic structure for each row; normalized role notice has `role="status"`.
- **Acceptance criteria:**
  - Given a player opens "My permissions", when the panel renders, then their role, editing
    capability, and character data access are shown in plain language with no DM-internal details.
  - Given an observer opens "My permissions", when the panel renders, then no character data row
    is present.
  - Given a player's role was normalized, when the panel renders, then the normalized-role notice
    appears with a safe reason string.
- **Priority:** Must-have

---

### UX-PERM-005 — DM permission consistency diagnostics panel

- **Requirement:** The DM must be able to view a structured list of permission consistency errors and
  warnings — write grants on hidden content, observer write grants, player-view widgets bound to
  hidden data, multiple character owners, and deleted-entity grants — with a remediation action link
  per problem and no hidden entity titles or field values disclosed in the player-facing equivalent.
- **Rationale:** PERM-007 (consistency errors surfaced to DM), PERM-014 (DM diagnostics actionable,
  opaque to players). Corresponds to the DM section in `PermissionSummary.svelte`.
- **Spec:**
  - Location: DM-only section within the session settings panel, or accessible from the presence
    strip's session menu → "Permission health".
  - Diagnostics panel (Desktop: section within the session settings panel, full width; Mobile:
    bottom sheet tab):
    - Header: "Permission health" with a count badge: "2 problems" in error color if problems exist;
      "All clear" in success color with a check icon if none.
    - Problem list: each item (min-height 60 CSS px):
      - Problem type as a bold label: "Write grant on hidden content" / "Observer write grant" /
        "Player view widget bound to hidden data" / "Multiple character owners" /
        "Grant on deleted entity" / "Unknown capability set".
      - Severity chip: "Error" (red) or "Warning" (amber).
      - Affected participant: display name and role chip.
      - Entity reference: entity type and ID (not the title — prevents hidden-title leak if content
        is `dm-only`). Exception: if the entity is already `player-visible`, the title may be shown.
      - Remediation link: "Fix this" → opens the relevant dialog (grant dialog pre-populated, or
        visibility toggle on the affected entity).
    - Empty state: "No permission problems detected. Your setup looks good."
  - Auto-refresh: diagnostics re-run after any grant, visibility, or role change (debounced 500 ms).
  - Player-facing denial: when a player's command is denied due to a consistency problem, they see
    only "This action is not available" — the diagnostic detail is DM-only (PERM-010, PERM-014).
- **States:**
  - *loading:* spinner or skeleton rows.
  - *clean:* "All clear" header; empty problem list; green header badge.
  - *problems present:* count badge in error color; problem list.
  - *problem fixing in progress:* problem row shows spinner while the remediation action dispatches.
  - *problem resolved:* row animates out (150 ms); count badge decrements.
- **Platform profiles:**
  - Desktop: section in session settings panel, always visible when open.
  - Tablet: same.
  - Mobile: "Permission health" tab in session settings bottom sheet.
- **Input:** pointer · touch · keyboard (`Tab` to "Fix this" links; `Enter` opens remediation flow;
  problem list is read-only otherwise).
- **Accessibility:** problem list is `role="list"`; each item `role="listitem"` with
  `aria-label="[problem type], severity [Error/Warning], for [participant name]"`;
  count badge has `aria-label="2 permission problems"`;
  after auto-refresh, changes announced via `aria-live="polite"` ("Permission health updated").
- **Acceptance criteria:**
  - Given a player has a write grant on a `dm-only` note, when the DM opens "Permission health",
    then the problem is listed with a "Fix this" link that opens the grant dialog for that grant.
  - Given the DM resolves all problems, when the panel updates, then the "All clear" state is shown.
  - Given a player's command is denied by a consistency check, when the denial message is shown to
    the player, then it contains no hidden entity title or permission detail.
- **Priority:** Must-have

---

### UX-PERM-006 — "Preview as player / observer" mode

- **Requirement:** The DM must be able to enter a read-only "Preview as player" or "Preview as
  observer" mode that renders the DM's own UI from the perspective of a specified role, with a
  persistent unmistakable mode banner and all write controls suppressed (disabled, not hidden),
  exiting cleanly via a single interaction.
- **Rationale:** NN/g [10] identifies absence of "view as" as a cardinal error in permission UIs;
  principle 8 (must never leak); PERM-002 (DM needs to verify player-visible state without
  accidentally revealing content).
- **Spec:**
  - Entry point: participant roster → action overflow → "Preview as this role"; or the session
    menu → "Preview as…" → role picker ("Player" / "Observer").
  - On entering preview mode:
    - A persistent amber banner renders at the top of the full viewport (z-index above all content,
      below modal dialogs), height 48 CSS px:
      ```
      ┌──────────────────────────────────────────────────────────────────┐
      │  Previewing as: Player  ——  You cannot make changes in this mode │
      │                                                    [ Exit preview ]│
      └──────────────────────────────────────────────────────────────────┘
      ```
      - Left: "Previewing as: [Role]" in bold; "You cannot make changes in this mode" in muted.
      - Right: "Exit preview" button (primary button, white background on amber banner). Always
        visible — not scrolled off-screen.
    - URL gains `?preview=player` (or `?preview=observer`) parameter — so the DM can share a
      "what will the player see" URL for review (link opens in preview mode, not the full DM view).
    - All write controls (HP steppers, visibility toggles, grant buttons, session actions,
      canvas widget configuration) are `disabled` with `aria-disabled="true"` and `pointer-events:none`.
      They remain visible so the DM can recognize the layout; they do not vanish.
    - Content filters to the previewed role's permitted data: `dm-only` content absent; `shared`
      content absent unless a grant exists for the previewed role (DM chooses which player to
      emulate in "Preview as player" — defaults to a generic "Player" without any grants if no
      specific player is chosen).
    - DM-only UI chrome (diagnostics panel, visibility toggles, grant buttons) hidden in preview
      mode (not disabled — they must not exist in the player's surface model; `display:none`).
  - Preview as specific player: an optional player picker in the preview launcher lets the DM
    choose a connected player whose exact grants are emulated. Shows "Previewing as: Maya (Player)"
    in the banner.
  - Exiting preview: "Exit preview" button, or keyboard shortcut `Shift+Escape`. Returns to the
    DM's own view, restoring all controls. URL parameter removed.
- **States:**
  - *not in preview:* no banner; all controls visible per DM role.
  - *preview (generic player):* banner visible; DM-only content filtered; writes disabled.
  - *preview (specific player):* banner shows player name; player's exact grants emulated.
  - *preview (observer):* banner shows "Observer"; no character data; no write controls.
- **Platform profiles:**
  - Desktop: banner at viewport top; does not push content down (overlaps, 48 CSS px padding added
    to the document body to compensate).
  - Tablet: same.
  - Mobile: banner at viewport top, 44 CSS px; "Exit preview" is a compact button ("Exit").
- **Input:** pointer · touch · keyboard ("Exit preview": `Tab` reaches it; `Enter`/`Space`
  activates; `Shift+Escape` exits from anywhere in preview mode).
- **Accessibility:** banner is `role="status"` with `aria-live="assertive"` announced on entry
  ("Entering preview mode as Player — all editing is disabled"); `Shift+Escape` shortcut documented
  in the `aria-keyshortcuts` attribute on the banner; disabled controls have `aria-disabled="true"`.
- **Acceptance criteria:**
  - Given the DM enters "Preview as player" (no specific player), when the mode activates, then
    the amber banner is visible, all write controls are disabled, and `dm-only` content is absent.
  - Given the DM is in preview mode and presses `Shift+Escape`, when the shortcut is processed,
    then the DM's full view is restored within 200 ms.
  - Given the DM enters "Preview as [specific player]", when preview renders, then content
    reflects that player's exact grants (e.g., sections grantable to them are visible).
  - Given the DM opens a modal dialog in preview mode, when the modal renders, then write actions
    within the modal are also disabled.
- **Priority:** Must-have

---

### UX-PERM-007 — Visibility state ambient badge on content items

- **Requirement:** Every content item (note card, character entry, widget tile, canvas section) must
  display its current visibility state as an ambient badge — visible without opening the item —
  using both icon and label text, never color alone. DM-only items must be clearly marked to prevent
  accidental player exposure.
- **Rationale:** NN/g [10] (permission state invisible → unmanageable); PERM-002 (visibility
  evaluated before non-DM query); principle 6 (effective emphasis — the right thing stands out).
- **Spec:**
  - Badge anatomy: icon (12×12 CSS px) + short label text (10 sp, muted) in a compact chip
    (height 20 CSS px, padding 4 CSS px horizontal).
  - Badge states:
    - `dm-only`: eye-slash icon + "DM only" — uses `--color-role-dm-muted` (amber/muted) background;
      text `--color-on-surface-muted`.
    - `player-visible`: eye-open icon + "Players" — uses `--color-surface-variant` background.
    - `shared`: person-group icon + "Shared" — uses `--color-surface-variant` background.
  - Badge placement: trailing edge of the item's header row (right side of title, before the action
    overflow icon).
  - The badge is visible at all times on DM surfaces (not hover-only) for `dm-only` items —
    this is the most critical state and must not require interaction to discover.
  - `player-visible` and `shared` badges visible at all times for DM; on hover/focus for other
    states (to reduce visual noise for the common case where most content is player-visible).
  - Players and observers: no visibility badge rendered — they have no need to see it and it must
    not imply hidden content exists.
  - When content has section or field overrides that differ from the entity-level visibility: a
    "Mixed" variant shows the base icon + "Mixed" label with a tooltip "Some sections or fields
    have different visibility. Click to review."
- **States:**
  - *dm-only:* amber chip, always visible on DM surface.
  - *player-visible:* grey chip, DM surface.
  - *shared:* grey chip, DM surface.
  - *mixed:* grey chip with layered-eye icon, DM surface; tooltip on hover/focus.
  - *loading:* skeleton chip (same width, grey).
- **Platform profiles:**
  - Desktop: badges always visible on DM surfaces as described.
  - Tablet: same.
  - Mobile: badges visible on the DM's content list; tap the badge to open the 3-state toggle
    bottom sheet.
- **Input:** badge is not interactive on Desktop/Tablet (the 3-state toggle handles changes);
  on Mobile, tapping the badge opens the visibility action sheet.
- **Accessibility:** badge is `role="img"` with `aria-label="Visibility: [state label]"`;
  icon has `aria-hidden="true"`.
- **Acceptance criteria:**
  - Given a `dm-only` note is displayed in the DM's content list, when the list renders, then the
    amber "DM only" badge is visible without hovering.
  - Given a content item has section-level visibility overrides, when the DM views the item in the
    list, then a "Mixed" badge appears.
  - Given a player views the same content list, when the list renders, then no visibility badges
    are present.
- **Priority:** Must-have

---

### UX-PERM-008 — Cache purge and session privacy status (DM view)

- **Requirement:** The DM must be able to see per-participant cache-purge status after a player leaves
  or is removed, and must be notified of any "purge-unconfirmed" participants without being shown
  device-level secrets.
- **Rationale:** COLLAB-010 (cache purge/seal on leave), COLLAB-014 (session-cache policy: TTL, key
  invalidation), PERM-014 (DM diagnostics actionable, no device secrets exposed).
- **Spec:**
  - Privacy status section in the permission health / diagnostics panel:
    - Header: "Session privacy" with a status indicator.
    - Per-departed-participant row (shown for 24 h after departure, then archived):
      - Display name (anonymizable if participant data was sealed).
      - Status chip: "Purged" (green) / "Purge unconfirmed" (amber) / "Purge failed" (red).
      - For "Purge unconfirmed": advisory copy "We could not confirm cache was cleared on this
        device. Content with session-only access may still be readable until the device reconnects
        or the TTL expires." No device secrets (keys, paths, identifiers) disclosed.
      - For "Purge failed": "Cache could not be cleared. Session-only content may remain readable.
        Consider revoking persistent grants if any were issued." + "Review grants" link.
    - Auto-clears purged rows after 24 h.
    - Empty state (all departed participants confirmed purged): "All departed participants have
      been confirmed. No outstanding cache risks."
- **States:** Purged / Purge unconfirmed / Purge failed — as described.
- **Platform profiles:** Desktop: section within the permission health panel. Mobile: tab within
  the session settings sheet.
- **Input:** "Review grants" link is keyboard-accessible; rows are read-only.
- **Accessibility:** status chips have `role="status"` text labels; `aria-live="polite"` announces
  when a participant's status changes.
- **Acceptance criteria:**
  - Given a player leaves the session and cache purge cannot be confirmed, when the DM opens
    "Session privacy", then a "Purge unconfirmed" row appears with advisory copy and no device
    secrets.
  - Given cache purge succeeds for all participants, when the panel renders, then the empty-state
    copy is shown.
- **Priority:** Must-have

---

## 6. Component & state specifications

### 6.1 Presence avatar

| Property | Value |
|---|---|
| Size (Desktop) | 32×32 CSS px; border-radius 50% (circle) |
| Size (Tablet) | 28×28 CSS px |
| Size (strip, Mobile) | replaced by session icon |
| Role ring width | 2 CSS px; color by role token |
| Offline overlay | disconnected icon 12×12 CSS px, bottom-right; `aria-label="[name] disconnected"` |
| Idle opacity | 65% after 3 min inactivity |
| Hover/focus: tooltip | shows display name, role, connection state; max 200 CSS px |
| Tooltip delay | 400 ms hover; immediate on focus |
| Touch long-press | 500 ms threshold to show tooltip |
| Click/tap | opens participant roster panel |
| "+N others" chip | height 24 CSS px; border-radius 12 CSS px; text "12 sp bold"; uses `--color-surface-variant` |

### 6.2 Visibility 3-state toggle

| State | Icon | Label | Background token |
|---|---|---|---|
| `shared` | person-group + arrow-right | "Shared with specific players" | `--color-surface-selected` when active |
| `player-visible` | eye-open | "Players can see this" | `--color-surface-selected` when active |
| `dm-only` | eye-slash | "Hidden from players" | `--color-surface-selected` when active |

| Behavior | Detail |
|---|---|
| At-rest (entity header) | Current-state icon only, 16×16 CSS px; mouse target 32×32 CSS px |
| Expanded (hover/focus/edit mode) | Full 3-segment group; each segment 80 CSS px × 32 CSS px |
| Transition duration | 200 ms ease-out |
| Conflict warning | Inline, below toggle, 1 dismiss |
| Player/observer | Not rendered (`display:none`) |

### 6.3 Capability-set radio card (in grant dialog)

| Property | Value |
|---|---|
| Min-height | 56 CSS px (Desktop/Tablet); 64 CSS px (Mobile) |
| Touch target | ≥44×44 CSS px |
| Structure | Radio input + label (bold, 14 sp) + description (muted, 12 sp) + collapsible preview |
| Selected state | 2 CSS px border in `--color-primary`; `--color-surface-variant` background |
| Unavailable state | Strikethrough label; muted opacity 50%; `aria-disabled="true"` |
| Preview section | `previewGrantEffect()` output: allowed list (✓ bullets) + excluded list (— bullets) |

### 6.4 Handout delivery state chip

| State | Icon | Label | Color token |
|---|---|---|---|
| Pending | clock | "Pending" | `--color-surface-variant` |
| Delivered | check | "Delivered" | `--color-status-success-muted` |
| Opened | open-envelope | "Opened" | `--color-status-success` |
| Queued (offline) | cloud-offline | "Queued" | `--color-surface-variant` |
| Error | exclamation | "Failed" | `--color-status-error` |

### 6.5 Session-degradation banner

| State | Copy | Background token | `aria-live` |
|---|---|---|---|
| Reconnecting | "Reconnecting to session… Commands are paused." | `--color-status-warning` | `polite` |
| Stale | "Session updates are delayed. Commands may be queued." | `--color-status-warning` | `polite` |
| Reconnected | "Back online." (auto-dismisses 3 s) | `--color-status-success` | `polite` |
| Failed (>30 s) | "Unable to reconnect. Your changes are saved locally." + "Try again" | `--color-status-error` | `assertive` |

Height: 36 CSS px; full viewport width; `position: fixed; bottom: 0` (above bottom tab bar on Mobile).

### 6.6 Preview-mode banner

| Property | Value |
|---|---|
| Height | 48 CSS px (Desktop/Tablet); 44 CSS px (Mobile) |
| Position | `position: fixed; top: 0; width: 100%; z-index: var(--z-index-modal-overlay)` |
| Background | `--color-role-dm` (amber) |
| Left content | "Previewing as: [Role]" (bold) + " — You cannot make changes in this mode" (muted) |
| Right content | "Exit preview" button (white bg, primary color text) |
| Body offset | `padding-top: 48px` added to document body while banner is active |
| Exit shortcut | `Shift+Escape` from anywhere |
| `aria-live` | `assertive` on entry announcement |

---

## 7. Layout & responsive behavior

### 7.1 Desktop (≥1024 CSS px)

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Logo / nav]    [Breadcrumb]    [Sync badge]  [Presence strip] [⋯] │  ← top bar
│                                                                     │
│  ┌─────────────────┐  ┌──────────────────────────────────────────┐  │
│  │   Sidebar nav   │  │   Main content / Canvas                  │  │
│  │                 │  │                                           │  │
│  │                 │  │  [Content items with visibility badges]   │  │
│  │                 │  │                                           │  │
│  │                 │  │  [Combat widget if session active]        │  │
│  │                 │  │                                           │  │
│  └─────────────────┘  └──────────────────────────────────────────┘  │
│                                                                     │
│  [Session degradation banner — fixed, bottom]                       │
└─────────────────────────────────────────────────────────────────────┘
```

- Presence strip: trailing edge of top bar; up to 5 avatars before "+N" collapse.
- Participant roster panel: floating, 320 CSS px wide, anchored below the strip.
- Grant dialog: centered modal, max 520 CSS px wide, with backdrop.
- Preview-mode banner: fixed top, full width, 48 CSS px height.
- Visibility badges: always visible on DM surfaces; on content item header rows.
- Diagnostics panel: within session settings panel (collapsible section).

### 7.2 Tablet (600–1024 CSS px)

- Presence strip: same location; avatars 28 CSS px.
- Participant roster panel: same as Desktop; dismisses on tap-outside.
- Grant dialog: same modal; capability set list stacks single-column.
- Player View controller: Scene picker opens as a popover anchored to the row.
- Handout delivery: side sheet from right edge.
- Visibility toggle: visible when entity in edit mode (no hover behavior).
- Preview banner: 48 CSS px; "Exit preview" button compact label.

### 7.3 Mobile (<600 CSS px)

- Presence strip: session icon (person-group, 24 CSS px) in top bar trailing edge; count badge.
  Tap → participant roster as bottom sheet (70 vh max).
- Participant roster: bottom sheet, full width; Player View selector per player row; Scene picker
  stacked as a new bottom sheet.
- Grant dialog: bottom sheet, full width; sections stacked; capability cards 64 CSS px height.
- Handout delivery: bottom sheet; delivery tracking scrollable within.
- Visibility controls: accessed via entity action sheet ("Visibility" row); 3 radio options.
- Combat widget: "Combat" tab in session bottom bar; slim view with full combatant list on expand.
- Session degradation banner: fixed bottom, above bottom tab bar.
- Permission health: tab within session settings bottom sheet.
- Preview banner: 44 CSS px; "Exit" compact label.

**Cross-profile rules:**
- Same command (`permission.grant-capability-set`, `content.set-visibility`, etc.) and same result
  on all profiles — only the surface presentation changes.
- All drag-and-drop interactions (Player View controller Scene assignment) have discrete tap/click
  alternatives on all profiles.
- No horizontal scroll on any profile.

---

## 8. Motion & feedback

| Interaction | Animation | Duration | Easing | Reduced-motion fallback |
|---|---|---|---|---|
| Presence avatar arrival | Scale from 0.6 → 1.0 + opacity 0 → 1 | 200 ms | ease-out | Instant appear; `aria-live` only |
| Presence avatar departure | Opacity 1 → 0 + shift adjacent avatars | 200 ms | ease-in | Instant disappear |
| Avatar idle dimming | Opacity 1 → 0.65 | 800 ms | ease-in-out | Instant opacity change |
| Roster panel open | Translate Y −8 CSS px → 0 + opacity 0 → 1 | 150 ms | ease-out | Instant appear |
| Handout delivery chip state change | Cross-fade (opacity 0 → 1 on new state) | 200 ms | ease-in-out | Instant swap |
| Grant row removal (revoke) | Opacity 1 → 0 | 150 ms | ease-in | Instant removal |
| Visibility toggle expand | Width auto → full; opacity 0 → 1 on labels | 200 ms | ease-out | Instant expand |
| Session banner appear | Translate Y 100% → 0 | 200 ms | ease-out | Instant appear |
| Preview mode banner | Opacity 0 → 1 | 150 ms | ease-out | Instant appear |
| Combat current-turn pulse | Outline opacity 0.3 → 1 → 0.3 loop | 1500 ms | ease-in-out | Border-highlight only (no loop) |
| Catch-up skeleton fade | Skeleton → content: opacity 0 → 1 per section | 300 ms staggered | ease-in | Instant swap |

All durations respect `prefers-reduced-motion: reduce`: motion-based transitions are replaced with
instant swaps or opacity-only changes (no translate, scale, or keyframe loops).

---

## 9. Accessibility requirements (surface-specific)

Beyond `03-accessibility.md`:

**9.1 Live regions for presence and session state**

The presence strip maintains a visually-hidden `aria-live="polite"` container that announces:
- Participant arrival: "[Name] joined as [Role]."
- Participant departure: "[Name] left the session."
- Participant reconnecting: "[Name] is reconnecting."
- Catch-up complete: "You're up to date."
- Preview mode entry: "Entering preview mode as [Role]. All editing is disabled." (`aria-live="assertive"`)
- Preview mode exit: "Exiting preview mode. Editing is restored." (`aria-live="polite"`)

Rate-limiting: if >3 join/leave events occur within 5 s (e.g., party joins simultaneously), they
are batched: "3 players joined the session." This prevents announcement flooding (WCAG 2.2 §4.1.3).

**9.2 Focus management in dialogs**

All dialogs (grant dialog, participant roster panel, handout delivery panel, join/leave flows,
preview launcher) follow the ARIA Authoring Practices Guide dialog focus pattern [13]:
- On open: focus goes to the first interactive element (Player picker in grant dialog; confirmation
  button in leave dialog).
- Focus trapped within the dialog while open.
- On close: focus returns to the element that triggered the dialog (the "Manage Access" button,
  roster action overflow, etc.).
- `Escape` closes without saving (except destructive confirms where `Escape` means "cancel").

**9.3 Keyboard navigation in the grant dialog**

The capability-set radio list supports `↑`/`↓` arrow navigation between radio options (standard
radio group keyboard model). The effective-permission preview collapses/expands with `Enter`/`Space`
on the "Details" button. The Grant button is reachable by `Tab` from any field in the form.

**9.4 Color-independent state communication**

Every permission and visibility state uses at minimum: (a) an icon, (b) a text label, (c) optionally
a color token. No state is communicated by color alone. This is verified by a grayscale rendering
check during design QA. Specific icon-label pairings for visibility states are defined in § 6.2.
Specific state chip icon-label pairings for delivery state are defined in § 6.4.

**9.5 Session degradation banner WCAG mapping**

The session degradation banner maps to WCAG 2.2 SC 4.1.3 (Status Messages) — it is a live region
that communicates session state changes without requiring focus. The `role="status"` (polite) and
`role="alert"` (assertive for failures) semantic roles are used per the SC requirements.

**9.6 Preview mode write suppression**

All write controls in preview mode must be `aria-disabled="true"` and `pointer-events: none`. They
must not be `display: none` or `visibility: hidden` — this would change the layout and confuse
screen-reader users about what controls exist on the player's surface. The distinction is:
DM-only chrome (diagnostics, visibility toggles that only DM sees) uses `display: none` because
it genuinely does not exist on the player's surface; shared controls (HP stepper) use
`aria-disabled` because they exist on the player's surface but may not be writable.

**9.7 Touch target compliance**

All interactive elements in these surfaces meet ≥44×44 CSS px targets (WCAG 2.2 §2.5.8):
- Presence avatars: minimum target area 44×44 CSS px even when visually 28 CSS px (use
  `padding` or a transparent clickable region to expand the target).
- Visibility toggle segments: 80 CSS px × 32 CSS px each when expanded; at-rest icon target
  padded to 32×32 CSS px minimum.
- Grant dialog revoke button: 44 CSS px height minimum; touch target extends full row width.
- Session banner "Try again": 44 CSS px height.

---

## 10. Anti-patterns & explicit limitations

### AP-01 — Raw permission matrix (field-level checkboxes)

**Do not implement.** A UI that exposes individual writable fields as a checkbox list for the DM
to configure per player creates an unmanageable and error-prone configuration surface. NN/g [10]
documents that users cannot reason about permission systems they cannot summarize in plain language;
a field matrix cannot be summarized. PERM-005 explicitly requires named capability sets defined per
entity type in the schema. The implementation in `GrantManager.svelte` correctly uses
`listGrantableCapabilitySets()` and `previewGrantEffect()` from the processing core — the UX must
expose only that model, nothing lower.

### AP-02 — Hiding content from the DM's own UI to simulate player view

**Do not implement.** If the DM's UI hides `dm-only` content as a shortcut to showing "what the
player sees," the DM loses awareness of hidden content and cannot manage it. The DM must always see
all content on their own surfaces, with visibility state badges indicating what is hidden from
players. "Preview as player" is the correct and explicitly specified affordance for simulating
a player's perspective — and it must be clearly mode-gated.

### AP-03 — Ambiguous icon-only visibility states

**Do not implement.** Using a single icon (e.g., a padlock) to represent all three visibility
states, or using color alone (e.g., red/yellow/green dots), fails the grayscale test and is
unintelligible to screen-reader users. Every visibility state must carry both a distinct icon and
a text label. See § 6.2 for the mandated icon-label mapping. The research basis is WCAG 2.2
§1.4.1 (Use of Color) and NN/g's finding [10] that ambiguous icons increase configuration errors.

### AP-04 — Conflating visibility and permission in the same control

**Do not implement.** A single toggle that means both "can this player see it?" and "can this
player write to it?" collapses two orthogonal axes of the data model into one, making the system
impossible to reason about correctly. Visibility (DM-controlled, applies to all players equally)
and permission grants (player-specific, additive) use separate controls with separate icon
vocabularies (eye-family for visibility; key-family for permissions). This is NN/g's identified
cardinal sin #3 [10].

### AP-05 — Presence indicators that distract during play

**Do not implement.** Live cursors for all collaborators visible at all times — appropriate in a
design tool like Figma — would be deeply distracting at a D&D table where the shared map is
primary focus content. Cursor presence must be opt-in per canvas, disabled by default, and never
shown for DM-only canvas layers. The Miro pattern [2] of cursor labels is borrowed only for maps
in collaborative edit mode, not for general canvas presence.

### AP-06 — Informative denial messages that leak hidden content

**Do not implement.** A denial message like "You cannot access 'The Lich's Phylactery'" reveals
the existence of hidden content to the player, violating principle 8 (must never leak) and
PERM-010. All denial messages shown to non-DM participants must use generic copy ("This action
is not available" or "This content is not available to you"). The DM sees the detailed audit log;
the player sees nothing specific. See `PermissionSummary.svelte` for the implemented pattern.

### AP-07 — Write controls in "Preview as player" mode

**Do not implement.** If write controls are merely styled differently (grayed out visually) but
still dispatch commands, or if the mode is dismissible by accident, the DM risks making changes
they intended only to preview. Write controls must be `aria-disabled` and `pointer-events: none`
in preview mode. The mode must be inescapable (persistent banner) and exitable only by explicit
action (button or `Shift+Escape`). The Google Workspace "View as" pattern [9] is the exemplar.

### AP-08 — Handout "push and forget" with no revocation UI

**Do not implement.** Delivering a handout without tracking per-player state or providing a
revocation action means the DM cannot correct mistakes (e.g., pushed wrong content, spoiled a
plot twist). The handout delivery panel must show per-player Pending/Delivered/Opened state and
inline revoke for each recipient (UX-COLLAB-004), satisfying COLLAB-007.

### AP-09 — Player Group membership implying content visibility

**Do not implement, and do not allow the UI to imply.** Adding a player to a group must not give
them access to group-addressed past handouts or visibility into group-visible content. Group
membership is a *delivery target*, not a *permission grant*. The create/edit group dialog must
display a non-dismissible warning banner making this explicit (UX-COLLAB-008). This is consistent
with COLLAB-012's acceptance criteria.

### AP-10 — "Purge confirmed" shown before purge is verified

**Do not implement.** Marking a departed participant's cache as "Purged" before the data layer
confirms purge completion is a false assurance that could leave session-only content readable.
Purge status must only show "Purged" when the data layer returns a confirmed purge event.
"Purge unconfirmed" must be a durable state until confirmation arrives or TTL expires (COLLAB-014).

---

## 11. Success metrics

| Metric | Target | Measurement method |
|---|---|---|
| Handout push task (DM: push handout, verify delivery, revoke) | ≤60 s first-run without documentation | Unmoderated usability study, 5 DM participants; task success = all 3 steps completed correctly |
| Grant task (DM: grant Combat Participant to player on character) | ≤90 s first-run; ≤20 s after 2 repetitions | Same usability study |
| Visibility change to `dm-only` (including conflict warning path) | ≤30 s including conflict resolution | Usability study |
| "Preview as player" discovery (DM finds and enters mode) | Found by ≥80% of DMs in a tree-test within 3 clicks | Tree-test; no training |
| Presence state glanceability (role + connection state from avatar) | Correct identification in ≤2 s without tooltip | 5-second test; target ≥85% accuracy |
| Permission boundary misjudgment (DM accidentally exposes content) | 0 incidents in structured play-testing | 3 full-session playtests with mixed role participants; observer verifies player data stream |
| Hidden content leak (player receives `dm-only` data) | 0 via data-layer audit | Automated: inspect player replication stream during session; confirm `dm-only` operations absent |
| WCAG 2.2 AA violations (all collaboration/permission surfaces) | 0 axe critical findings | Automated axe-core scan on every surface; run in CI |
| Keyboard-only task completion (grant, revoke, leave, preview) | 100% of defined tasks completable keyboard-only | Manual QA: task list performed with mouse disconnected |
| `prefers-reduced-motion` compliance | No translate/scale/loop animations triggered | Automated motion audit with `prefers-reduced-motion: reduce` media query active |

---

## 12. Open questions & risks

**OQ-01 — Cursor presence scope:** The spec makes cursor presence opt-in per canvas, off by default.
The interaction model for a DM enabling cursor presence for a specific shared map has not been
designed. This should be resolved in `06-maps.md` and referenced here before implementation.

**OQ-02 — "Preview as specific player" with no connected players:** If the DM wants to preview as
a specific player's grant set but no players are connected, should the system allow previewing
with a "hypothetical player" that has no grants (generic player) or block the specific-player preview?
The current spec defaults to generic player — this should be confirmed with the product owner.

**OQ-03 — Expiry picker UX for grants:** The "Custom datetime" expiry option requires a datetime
picker on Mobile, which is a known UX challenge (native date pickers are inconsistent across
platforms). A simplified set of radio options ("No expiry / 1 h / 6 h / 24 h") with a separate
"Custom" expansion may be preferable to a datetime-local input on all profiles.

**OQ-04 — Handout persistence grant UI complexity:** The "Grant persistent access" checkbox on the
handout delivery panel ties handout delivery to PERM-002/COLLAB-010's persistent-access model.
The relationship between a handout-delivery persistent grant and a formal `permission.grant-
capability-set` command needs clarification — are they the same record? If not, the DM has two
separate grant surfaces to manage for persistent handout access, which may be confusing.

**OQ-05 — Cache-purge UX for offline participants:** COLLAB-014 requires that offline participants
whose cache cannot be confirmed purged are marked "purge-unconfirmed." The current spec surfaces
this in the DM diagnostics panel. The risk is DM alarm ("is this a security problem?") without
enough context to understand the TTL-based mitigation. Advisory copy should be reviewed by a
plain-language specialist before finalizing.

**OQ-06 — Observer presence in the strip:** Observers are included in the participant roster
(COLLAB-011) but their presence in the strip adds chrome for an arguably less important role. Should
observer avatars be collapsed to the "+N others" group by default, or shown only in the roster panel?
This is a density/clarity tradeoff that should be validated in usability testing.

**OQ-07 — Dependency on `12-sync-offline-reliability.md`:** The session degradation banner
(UX-COLLAB-006) is described as layered on top of the global sync indicator from doc 12. If doc 12
is not yet authored, there is a risk that the two banners conflict in position, visual treatment,
or messaging. This dependency must be resolved before implementation begins.

**OQ-08 — Character ownership transfer consent:** PERM-013 requires atomic ownership transfer.
The UX spec (UX-PERM-002) adds a confirmation dialog naming both the old and new owner. Whether
the *receiving* player should be notified (a toast: "You now own [character name]") and whether
the *former* owner should be notified is not specified. Notification design should be confirmed.

---

## Sources

[1] Figma — Multiplayer and real-time collaboration — https://help.figma.com/hc/en-us/articles/360039830834-Figma-Multiplayer

[2] Miro — Presence and live collaboration — https://help.miro.com/hc/en-us/articles/360017730654-Online-and-offline-indicators

[3] Google Docs — Collaborator presence and activity feed — https://support.google.com/docs/answer/6282765

[4] Figma — Sharing files and projects — https://help.figma.com/hc/en-us/articles/360040521453-Share-files-and-prototypes

[5] Google Drive — Manage access to files and folders — https://support.google.com/drive/answer/2494822

[6] Notion — Sharing and permissions — https://www.notion.com/help/sharing-and-permissions

[7] Linear — Member roles and permissions — https://linear.app/docs/roles-and-permissions

[8] GitHub — Setting repository visibility — https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility

[9] Google Workspace Admin — View as another user — https://support.google.com/a/answer/4430112

[10] Nielsen Norman Group — Permissions UX: Users Misunderstand Access Controls — https://www.nngroup.com/articles/permission-systems/

[11] Slack — Read receipts and message status — https://slack.com/help/articles/360053109974-Read-receipts-in-Slack

[12] Slack — Offline and connection status — https://slack.com/help/articles/360001549946-Manage-your-connection-and-offline-status

[13] WAI-ARIA Authoring Practices Guide — Dialog (Modal) Pattern — https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
