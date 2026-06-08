# UX Requirements — Sync, Offline & Reliability

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read `00-overview-and-principles.md` first — it defines the shared principles, the parameter rubric, the requirement-ID scheme, the platform profiles, and the design tokens this document builds on.
>
> **Status:** Draft v1
> **Functional requirement coverage:** `SYNC-001..017`
> **Owner surface(s):** Global sync status indicator (top bar / status strip), Sync Status panel (`/settings/sync`), per-entity sync badges, conflict resolution surface, offline banner, cloud storage classification panel, cloud auth flow, queued-changes view

---

## 1. Scope

- **Covers:** All surfaces and affordances related to sync state, offline operation, conflict resolution, retry/error recovery, cloud storage classification and consent, trust signals, first-time authorization, and the perceived performance of sync operations. This includes: the global sync status indicator in the persistent top bar; per-entity sync badges on canvas widgets, notes, characters, and map tiles; the full-page Sync Status panel; the conflict resolution surface for live-sync field divergence; the offline state banner and queued-changes view; the cloud storage classification and consent panel (directly complementing the existing `CloudStorageClassificationPanel.svelte` component); and the encryption prerequisite gate for cloud sync enablement.

- **Does NOT cover:** The import conflict-preview surface that surfaces formatting-loss and structure mismatches on first-import from Obsidian or Google Docs — that is owned by `09-content-authoring-and-sources.md` (cross-link below). Live collaboration presence indicators (cursor dots, who is editing) are owned by `11-collaboration-permissions.md`. Audio-state sync is covered in `13-audio-atmosphere.md`. The visual token definitions (color, typography, motion easing) are owned by `01-visual-design-system.md` and consumed here.

- **Related functional requirements:** `../requirements/09-sync.md`
  - `SYNC-001` — Local-first invariant: full vault/session workflows with zero network for cached content
  - `SYNC-002` — Every durable mutation recorded as an entity-scoped, idempotent sync operation
  - `SYNC-003` — Source adapter model: local vault, Obsidian, Google Docs, future sources
  - `SYNC-004` — Obsidian adapter: preserve YAML, frontmatter, wikilinks, aliases, tags
  - `SYNC-005` — Google Docs adapter: Drive file ids, change tokens, revision metadata, formatting-loss diagnostics
  - `SYNC-006` — Conflict detection, persistence, display, and resolution as durable records
  - `SYNC-007` — Cloud-only storage: vault identity, operation logs, snapshots, session state, assets (when cloud sync enabled)
  - `SYNC-008` — Device-local only: auth tokens, OS credentials, raw paths, indexes, diagnostics, temp UI state
  - `SYNC-009` — Large binary assets: content-addressed records, not embedded payloads
  - `SYNC-010` — Sync status inspection: pending ops, conflicts, source health, retry
  - `SYNC-011` — Sync replay validation: dependencies, schema, authority, visibility, permissions
  - `SYNC-012` — Obsidian and Google Docs adapter round-trip fidelity tests
  - `SYNC-013` — Conflict resolution is a DM-authorized command with audit history
  - `SYNC-014` — Sync status: version history, snapshot lineage, recovery checkpoints (player-safe)
  - `SYNC-015` — Source adapters declare capability metadata; fail closed on unsupported schemas
  - `SYNC-016` — Google Docs adapter: auth expiry, rename, delete, offline-queue, conflict states
  - `SYNC-017` — Cloud sync payload encryption, key custody, rotation, recovery model

- **Related UX docs:**
  - `01-visual-design-system.md` — design tokens (semantic color, icon set, motion system, toast component, badge anatomy) consumed by every sync affordance in this document
  - `03-accessibility.md` — global a11y baseline; live-region policy for status updates
  - `09-content-authoring-and-sources.md` — import conflict-preview surface for Obsidian/Google Docs first-import (distinct from live-sync conflicts covered here)
  - `11-collaboration-permissions.md` — DM/player visibility boundary; ensures conflict surfaces never leak hidden content to non-DM actors

---

## 2. UX goals for this surface

Sync, offline, and reliability surfaces share one overriding mandate: **zero-surprise persistence**. A DM who has spent six hours preparing a session must never lose that work. A player who edits their character sheet on a train must find those edits waiting when they reconnect. The interface must communicate system state truthfully, calmly, and without demanding attention when nothing is wrong — and must act immediately, clearly, and without panic when something is.

| Parameter | Goal for this surface |
|---|---|
| Visual appeal | Sync state indicators are calm, small, and subordinate to content — a quiet signal of trustworthiness. The conflict resolution surface is structured and information-dense without feeling clinical or alarming. Status uses semantic color tokens only (never decorative color for sync state). The overall aesthetic communicates "this system has your data." |
| Information scent | Each sync state communicates its meaning from its icon alone, confirmed by a tooltip or label. The global indicator tells you at a glance whether everything is fine, something is pending, or action is needed — without requiring the user to open anything. Per-entity badges narrow the scope instantly. |
| Navigability | From the global sync indicator, the full Sync Status panel is one click/tap away. From any conflict badge, the conflict resolution surface is one click/tap away. No sync management task requires more than two steps from any surface. |
| Intuition / learnability | "Your changes are saved" is the implicit ground state — displayed only when the user needs reassurance (after an edit, after reconnect). Offline state is announced once, clearly, and then recedes. The conflict resolution surface makes the safe choice obvious (not buried). First-time auth flows explain what is authorized and why before asking. |
| Accessibility | All sync status changes announced via `aria-live="polite"` live regions; error/conflict states use `aria-live="assertive"`. Conflict resolution surface is fully keyboard-operable with explicit focus management. All status icons have text labels or tooltips with `aria-describedby`. Touch targets ≥44×44 CSS px on Tablet and Mobile. |
| Adaptability (platform profiles) | Desktop: persistent sync indicator in the top bar; full Sync Status panel in settings; conflict surface in a modal dialog with side-by-side layout. Tablet: indicator in top bar; conflict surface in a full-screen sheet. Mobile: indicator in top bar (icon-only, no label); conflict surface in a focused single-column sheet; queued-changes view as a bottom drawer. |
| Effective emphasis (visual hierarchy) | In the normal (synced) state, the sync indicator is the least visually prominent element in the top bar. In error/conflict states, it escalates — color, icon weight, and optionally a banner — but never dominates so aggressively that it prevents the user from working. One primary call-to-action per conflict. |
| Feedback & responsiveness | All local writes acknowledge within 100 ms (optimistic UI; the change is visible immediately). The sync indicator transitions to "syncing" state within 100 ms of initiating an upload. Conflict badges appear without requiring a refresh. |
| Error prevention & recovery | The conflict resolution surface enforces "never lose data" — both sides are always preserved and displayable before a resolution is committed. Auth expiry is caught before a write is lost, not after. Retry actions are explicit, labeled, and never automatic without user awareness. |
| Consistency | The same sync-state icon set is used in the global indicator, per-entity badges, and the Sync Status panel. The same offline banner copy appears identically across all surfaces. Conflict affordances use the same component patterns as other destructive/confirmatory actions (defined in `01-visual-design-system.md`). |

---

## 3. Researched best practices

**3.1 Local-first software and the "ownership" signal**

The Ink & Switch "Local-first software" essay (2019) defines the core tension: cloud applications trade user ownership and availability for convenience, but local-first apps must actively communicate that they are safe, durable, and synchronized [1]. The essay introduces the "five storage tiers" mental model and argues that users' primary fear with local-first software is not losing their data — it is *not knowing* whether their data is safe. The implication for DND Tools: the sync indicator's primary job is to communicate that the user's data is durable on this device right now, and the cloud component is an *additive* layer on top of that guarantee. Never frame sync status as "data is only safe once uploaded."

*Implication: "Saved locally" must be communicated as a success state, not a degraded one. Cloud sync is additive and its absence must not be framed as data loss risk.*

**3.2 Linear's sync engine and optimistic UI**

Linear is the most widely cited exemplar of fast, trustworthy sync UX in developer-productivity tools. Their engineering blog describes the architecture: every operation is committed locally before the network round-trip, and the UI reflects the committed local state immediately [2]. The sync status indicator in Linear's top bar uses a three-state model — synced (no indicator), syncing (subtle spinning icon), error (red dot + tooltip) — and aggressively de-emphasizes the syncing state so that it never creates anxiety. Linear also uses a "last synced N minutes ago" timestamp in the status tooltip that reinforces trust by making recency explicit.

*Implication: Optimistic UI is mandatory; no write may block on network confirmation. The syncing state indicator must be visually subordinate — animated but never alarming. A "last synced" timestamp in the status tooltip is required.*

**3.3 Figma's offline and reconnect patterns**

Figma displays an offline banner ("You're offline. Changes will sync when you reconnect.") anchored to the top of the document editor when the WebSocket drops [3]. Crucially, the banner does not block editing — the user can continue working unimpeded. When connectivity returns, the banner transitions to "Reconnected. Syncing changes…" and disappears automatically within 3 seconds. Figma also uses a "version history" panel that acts as a trust signal: users can see a timestamped record of every saved version, which implicitly communicates that their work is not ephemeral.

*Implication: The offline banner must be non-blocking and self-dismissing on reconnect. Version history / snapshot lineage is a trust signal, not just a power-user feature.*

**3.4 Notion's offline mode and pending indicators**

Notion uses a "Syncing…" spinner in the top-left corner next to the page title when changes are being pushed [4]. The spinner is unobtrusive — gray, small, positioned outside the primary writing area. When offline, Notion displays a persistent "Offline mode" indicator in the same position. Notion's failure mode has been widely reported: it occasionally displays stale data without warning the user that they are working with a cached snapshot, particularly in shared documents. This is the primary anti-pattern to avoid: letting users believe they are seeing live data when they are not.

*Implication: When showing cached/potentially stale content, the interface must say so — a small "last updated N minutes ago" label on the entity, not just the global indicator.*

**3.5 Google Docs offline and version history**

Google Docs' offline mode (via Service Worker and Chrome extension) displays a persistent cloud-with-slash icon in the top bar when offline [5]. The "Version history" panel (`File > Version history > See version history`) shows named snapshots with actor and timestamp, providing strong trust signals for shared documents. Google Docs' conflict model is last-write-wins with no user-facing conflict surface — the prior version is accessible only through version history, not surfaced proactively. This is the second major anti-pattern: silently discarding a concurrent edit without the user's knowledge.

*Implication: Last-write-wins with silent discard is unacceptable for DND Tools. Every conflict must be surfaced and resolved explicitly by an authorized user (SYNC-006/013).*

**3.6 Obsidian Sync — minimal, trust-building status indicators**

Obsidian Sync shows a cloud icon in the bottom status bar with three states: idle (cloud outline, no animation), syncing (cloud with animated upload arrow), and error (cloud with exclamation mark + red tint) [6]. Clicking the icon opens the Sync log — a chronological list of every operation with entity name, direction (push/pull), and timestamp. Obsidian explicitly documents what is and is not synced on a per-file-type basis in their Selective Sync settings, addressing user anxiety about what leaves the device.

*Implication: A sync operation log (chronological, per-entity) is a required trust surface. The cloud storage classification panel (SYNC-007/008) directly maps to Obsidian's Selective Sync concept.*

**3.7 Apple iCloud sync status — ambient trust**

Apple displays iCloud sync status in macOS Finder with a per-file badge: a cloud-with-progress-bar for downloading, a clock for pending upload, and a checkmark for locally available [7]. The iCloud status bar widget shows "iCloud Drive — Up to Date" or "iCloud Drive — Waiting to Upload X items." The key UX principle is that status is ambient and scannable at the file level, not just the account level — giving users high-confidence answers to "is this specific file on all my devices?" without navigating to a settings panel.

*Implication: Per-entity sync badges (not just a global indicator) are required so users can answer "is this specific character / note / map synced?" instantly.*

**3.8 Dropbox and Things — queued operations on mobile**

Dropbox's mobile app shows a "Waiting to upload" badge on files that are queued due to offline or bandwidth constraints [8]. Things for iOS (a task manager) shows a "Sync Queue" accessible from the app's cloud icon; it lists every pending operation with entity type, operation type, and timestamp. Things' design choice — making the queue inspectable — dramatically reduces user anxiety on unreliable connections because users know exactly what is pending.

*Implication: A queued-changes view is required, accessible from the global sync indicator and formatted as an ordered list of pending operations with entity type, operation, and recency.*

**3.9 Conflict resolution UX — merge editors and diff surfaces**

Git's three-way merge UX (as surfaced by tools like VS Code's merge editor, introduced in v1.69) provides the canonical model for multi-source conflict resolution: three panes (incoming / current / result), inline choice controls, and a result preview that updates live as choices are made [9]. GitHub's PR review interface provides inline comment threading and "Resolve conversation" affordances that batch-close groups of conflicts [10]. The key research finding from NN/g's studies on comparison UIs is that side-by-side layouts are faster to resolve than inline diffs when the content is short-to-medium text (< 500 words) — which describes the majority of DND Tools entity field values [11].

*Implication: The conflict resolution surface must use side-by-side layout for field-level values with labeled source attribution. Batch resolution (resolve all fields by rule) should be offered as a secondary affordance. The result preview must update live.*

**3.10 Material Design offline states**

Material Design 3's "Error" and "Offline" component guidelines specify three response patterns: inline error (field-level), snackbar (transient, auto-dismissing for recoverable states), and persistent banner (for ongoing conditions like offline that require sustained user awareness) [12]. The guidelines explicitly recommend against modal dialogs for ongoing states — a modal that blocks the UI while the user is offline is the worst possible pattern for a live-play tool.

*Implication: Offline state must use a non-blocking persistent banner, never a modal. Field-level sync errors use inline error patterns. Transient recoverable states (e.g., a temporary network hiccup that self-resolved) use a snackbar. Conflicts that require resolution use a badge + panel, not a blocking modal.*

**3.11 Actual Budget — trust through transparency**

Actual Budget (a local-first personal finance app) communicates sync state through a persistent "Sync status" widget that shows the last-synced timestamp, the number of pending changes, and a manual "Sync now" button [13]. Unlike most cloud apps, Actual Budget also shows an explicit "Changes are only on this device" state when the user has made changes that have not yet been pushed — a direct, honest acknowledgment that distinguishes between "saved locally" and "saved to the cloud." This transparency builds trust without fear.

*Implication: The distinction between "saved to this device" and "synced to cloud" must be explicit and honest in the status indicator, not collapsed into a single "saved" state.*

**3.12 MDN Service Worker and offline patterns**

MDN's Service Worker documentation and the Progressive Web App offline patterns describe the "cache-first with network fallback" strategy as the standard for offline-capable web apps [14]. The key UX obligation is displaying freshness indicators when serving cached content: a resource served from cache with a stale timestamp must label itself as such, so the user can decide whether to wait for a network update.

*Implication: When content is served from local cache (offline), freshness indicators ("Last updated N minutes/hours ago") are required on entities whose staleness is significant — characters being edited concurrently, maps being annotated live.*

---

## 4. Reference implementations (exemplars)

| Product | What they do well (specific) | Principle / why it works | Borrow / Avoid | Link |
|---|---|---|---|---|
| **Linear** | Three-state sync indicator (invisible / subtle spinner / red dot); optimistic local commit; "last synced" tooltip; no blocking write confirmations | Optimistic UI + ambient status reduces perceived latency to zero; error state escalates clearly without blocking | Borrow: three-state indicator model, "last synced" tooltip, optimistic commit. Avoid: Linear's conflict model is implicit (last-write-wins for collaborative editing) | https://linear.app/blog/how-we-built-offline-support-for-linear |
| **Obsidian Sync** | Per-file sync status bar; inspectable sync log; Selective Sync settings page naming exactly what leaves the device | Transparency about what syncs + a chronological log eliminates "did it save?" anxiety; the classification page maps directly to SYNC-007/008 | Borrow: sync log view, cloud/device classification panel concept, bottom-bar status icon pattern. Avoid: Obsidian's log is text-heavy and requires scrolling — ours must filter by entity and source | https://help.obsidian.md/Obsidian+Sync/Sync+details |
| **VS Code Merge Editor** | Three-pane merge (incoming / current / result) with inline accept/reject per conflict chunk; live result preview; "Accept All Incoming / Accept All Current" batch affordances | Side-by-side with labeled sources is the fastest resolution layout for short text; batch affordances dramatically reduce resolution time for multi-field conflicts | Borrow: three-pane layout, labeled sources, batch resolution buttons. Avoid: VS Code's merge editor is for code diffs — ours must present structured entity field values, not raw text diffs | https://code.visualstudio.com/docs/sourcecontrol/overview#_3-way-merge-editor |
| **Figma** | Non-blocking "You're offline" banner; "Reconnected. Syncing…" auto-dismiss; version history panel as trust anchor | Non-blocking offline state + self-dismissing reconnect message are the two most calming patterns for unreliable network | Borrow: offline banner pattern and copy tone, auto-dismiss on reconnect. Avoid: Figma has no per-object sync status — our per-entity badges fill this gap | https://help.figma.com/hc/en-us/articles/360040328553 |
| **Things for iOS** | Inspectable Sync Queue listing every pending operation; cloud icon badge with count; never blocks the UI while syncing | Making the queue explicit and inspectable is the highest-impact trust action for offline-heavy workflows | Borrow: queued-changes view as an ordered, inspectable list. Avoid: Things' sync is binary (synced/pending) — ours must also represent conflict and error states | https://culturedcode.com/things/support/articles/2803574/ |
| **Actual Budget** | Explicit "Changes are only on this device" state; manual "Sync now" button; last-synced timestamp visible at rest | Honest distinction between local-save and cloud-sync builds deep trust for local-first data; manual sync control gives power users confidence | Borrow: explicit local-vs-cloud state messaging, "Sync now" manual trigger. Avoid: Actual Budget's sync UI is buried in settings — ours must be one tap from anywhere | https://actualbudget.org/docs/sync/ |

**North-star narratives**

1. **From Linear:** The sync indicator must never make the user anxious. In the healthy case, it is nearly invisible — a small, calm icon that says "everything is fine" without demanding attention. The moment something needs user action, it escalates predictably — the same icon grows a red dot and a tooltip explaining exactly what happened and what to do. The DM should feel: "this system has my session prep; I don't have to think about it."

2. **From VS Code Merge Editor:** When a conflict must be resolved, the surface must feel like a tool, not a warning. The two sides are presented side-by-side, clearly labeled with who made each change and when, and the result is a live preview that the user actively builds. Resolving a conflict should feel like answering a question ("which version is right?"), not defusing a bomb. The never-lose-data guarantee is made structural: neither side disappears until the user commits a resolution.

3. **From Obsidian Sync + Actual Budget combined:** The cloud storage classification panel is not a settings curiosity — it is the product's most important data-safety communication surface. It must answer, in plain language, three questions: "What is stored where?", "What leaves this device?", and "What encryption protects it?" These answers must be visible before cloud sync is enabled, not buried after. This directly informs the design of the `CloudStorageClassificationPanel` component and the encryption prerequisite gate (SYNC-017).

---

## 5. UX/UI requirements

### UX-SYNC-001 — Global sync status indicator: five-state ambient icon

- **Requirement:** A sync status icon must be persistently visible in the global top bar on all platform profiles, displaying one of five states: Synced, Syncing, Pending (offline queue), Offline, or Error/Conflict. Clicking or tapping the icon opens the Sync Status panel.
- **Rationale:** Linear and Obsidian Sync demonstrate that an ambient, always-visible status indicator is the minimum viable trust signal for local-first apps [2][6]. Users should never have to navigate to settings to discover whether the system is healthy.
- **Spec:**
  - **Icon set** (from the design token icon set in `01-visual-design-system.md`):

    | State | Icon | Color token | Animation |
    |---|---|---|---|
    | Synced | Cloud with checkmark (`cloud-check`) | `--color-icon-subtle` (muted, recedes) | None |
    | Syncing | Cloud with upload arrow (`cloud-upload`) | `--color-icon-default` | Looping fade pulse, 1.2 s period |
    | Pending (offline queue) | Cloud with clock (`cloud-clock`) | `--color-icon-default` | None |
    | Offline | Cloud with slash (`cloud-off`) | `--color-icon-warning` | None |
    | Error / Conflict | Cloud with exclamation (`cloud-alert`) | `--color-icon-error` | None |

  - Icon size: 20×20 CSS px on Desktop; 22×22 CSS px on Tablet/Mobile.
  - Touch target: ≥44×44 CSS px hit area (icon is centered within a transparent button).
  - Tooltip (pointer hover, 400 ms delay): one-line status summary + "Last synced N minutes ago" + "Click to view sync status" — all on pointer devices.
  - Badge: when in Error/Conflict state, a small red dot (8 CSS px diameter) overlays the top-right corner of the icon, with a numeric count if multiple conflicts exist (max "9+").
  - Position: right side of the top bar, leftward of the account avatar. Must not be occluded by any sidebar or drawer overlay.
- **States:**
  - **Synced:** Visible, muted, no animation. Tooltip shows "Up to date · Last synced X ago."
  - **Syncing:** Visible, default weight, pulsing animation. Tooltip shows "Syncing N changes…"
  - **Pending (offline queue):** Visible, default weight, static. Tooltip shows "N changes queued for sync when reconnected."
  - **Offline:** Visible, warning color. Tooltip shows "Offline — changes saved locally."
  - **Error / Conflict:** Visible, error color, badge count. Tooltip shows "N items need attention. Click to resolve."
- **Platform profiles:**
  - Desktop: icon + optional "Synced" text label in comfortable density mode; icon-only in compact. Keyboard shortcut `G S` (Go Sync) opens the Sync Status panel from any focused element.
  - Tablet: icon-only; tap opens Sync Status panel as a full-screen sheet.
  - Mobile: icon-only in the top bar; tap opens the Sync Status panel as a bottom sheet.
- **Input:** pointer (click) · touch (tap) · keyboard (`G S` chord; `Enter` on focused indicator button)
- **Accessibility:** `role="button"` with `aria-label="Sync status: [state name]"` updated on state change; `aria-describedby` pointing to the tooltip text. State changes (except Synced→Syncing during background activity) announced via `aria-live="polite"` region. Error/Conflict state change announced via `aria-live="assertive"`. The badge count is included in the `aria-label` ("Sync status: 3 conflicts need attention").
- **Acceptance criteria:**
  - Given the device has no network, when any surface is open, then the indicator shows the Offline state icon with warning color within 2 seconds of connectivity loss.
  - Given local changes are queued while offline, when connectivity returns and sync begins, then the indicator transitions Pending → Syncing → Synced without user action.
  - Given a conflict exists on any entity, when the user has not opened the Sync Status panel, then the indicator shows Error/Conflict state with a badge count ≥ 1.
  - Given the indicator is in any state, when the user presses `G S` on Desktop, then the Sync Status panel opens within 300 ms.
  - Given a screen reader user is present, when the state transitions from Synced to Offline, then the live region announces "Sync status: Offline. Changes saved locally." within one tick.
- **Priority:** Must-have

---

### UX-SYNC-002 — Per-entity sync badges

- **Requirement:** Every entity card (note, character, map, canvas widget) that is capable of syncing must display a per-entity sync badge reflecting its individual sync state, visible without hovering.
- **Rationale:** Apple iCloud's per-file badges and Obsidian Sync's per-note indicators demonstrate that entity-level status answers the user's actual question — "is *this specific thing* safe?" — better than a global indicator alone [6][7]. During live play, the DM needs to know whether the character sheet they are looking at is the latest revision.
- **Spec:**
  - Badge position: bottom-right corner of entity cards in list/grid views; inline after entity title in compact list views.
  - Badge size: 16×16 CSS px icon; ≥24×24 CSS px touch target area on Tablet/Mobile.
  - Badge icon set mirrors the global indicator but at 16 CSS px:

    | State | Icon | Color token |
    |---|---|---|
    | Synced | checkmark or omitted (default rest) | `--color-icon-subtle` |
    | Syncing | pulse dot | `--color-icon-default` |
    | Pending | clock | `--color-icon-default` |
    | Conflict | exclamation in circle | `--color-icon-error` |
    | Asset missing | image-broken | `--color-icon-warning` |

  - Synced state: badge may be omitted entirely for clean visual default state; reinstated for 3 s after a save/sync completes (brief "checkmark flash" to confirm persistence).
  - Tapping/clicking a Conflict badge navigates directly to the conflict resolution surface for that entity (not to the full Sync Status panel).
  - "Last synced N minutes ago" label displayed inline under the entity title in the entity detail view (always visible, not tooltip-only).
- **States:** See icon set table above; a sixth state, "Local only" (cloud with lock icon, `--color-icon-subtle`), is shown on entities that are explicitly excluded from cloud sync by classification (SYNC-007/008).
- **Platform profiles:**
  - Desktop: badges visible on entity cards in the sidebar and content lists; visible inline in the entity detail header.
  - Tablet: same; badges slightly larger (18 CSS px) for touch legibility.
  - Mobile: badges shown only in detail view header and conflict state in list view (to reduce density clutter); Synced/Syncing suppressed in list view.
- **Input:** pointer (hover for tooltip) · touch (tap to open conflict or status panel) · keyboard (focus badge, `Enter` to open; `aria-describedby` tooltip via focus)
- **Accessibility:** `role="img"` with `aria-label="[Entity name]: sync status — [state]"`. Conflict badge: `role="button"` with `aria-label="[Entity name] has a sync conflict. Press Enter to resolve."` Focus ring visible. Conflict state is also conveyed by a non-color indicator (exclamation shape), not color alone.
- **Acceptance criteria:**
  - Given a character entity has an unresolved conflict, when the user views the character list, then a conflict badge (exclamation icon, error color) is visible on that character's card.
  - Given a map asset is missing from this device (SYNC-009), when the map card is rendered, then an "asset missing" badge is visible on the card.
  - Given an entity has synced successfully, when the entity card is rendered at rest (> 3 s after sync), then no badge (or a muted checkmark) is shown, not a prominent colored indicator.
  - Given a keyboard user focuses a conflict badge, when they press `Enter`, then the conflict resolution panel opens with focus placed on the first decision affordance.
- **Priority:** Must-have

---

### UX-SYNC-003 — Offline state: non-blocking persistent banner

- **Requirement:** When the device loses network connectivity, a non-blocking, persistent banner must appear, confirming that local work continues and changes are queued. The banner must dismiss automatically when connectivity returns and sync completes.
- **Rationale:** Material Design 3 specifies persistent banners for ongoing conditions that affect workflow [12]. Figma's non-blocking offline banner is the canonical implementation — it does not interrupt editing, it does not alarm, and it disappears when no longer relevant [3]. Blocking the UI (modal or spinner) while offline is the most destructive anti-pattern for a live-play tool where connectivity may be intermittent throughout a session.
- **Spec:**
  - **Banner position:** Below the global top bar, spanning full width. Height: 36 CSS px (single-line text + icon). Z-index: below dialogs and tooltips, above canvas content.
  - **Banner copy (exact):**
    - Offline: `"You're offline — changes are saved to this device and will sync when you reconnect."` (icon: `cloud-off`, color token: `--color-banner-warning-bg`)
    - Reconnecting: `"Reconnecting…"` (icon: `cloud-upload` with pulse, color token: `--color-banner-info-bg`) — appears for max 3 s
    - Synced after reconnect: `"Back online. Changes synced."` (icon: `cloud-check`, color token: `--color-banner-success-bg`) — auto-dismisses after 3 s
  - **Dismiss:** User can dismiss the Offline banner manually via a close (`×`) button; it reappears if connectivity remains lost after 60 s. Reconnecting and Synced-after-reconnect banners auto-dismiss; no manual close shown.
  - **Never blocks editing.** Canvas, note editor, character sheet, and all input fields remain fully interactive while the banner is visible.
  - **Source-specific degradation copy:** When a specific source (e.g., Google Docs) is unavailable but the local vault is operational, a more targeted variant is used: `"Google Docs sync unavailable — your local changes are safe. Sync will resume when reauthorized."` This uses the same banner slot but a distinct warning color.
- **States:** Offline / Reconnecting / Synced-after-reconnect / Source-degraded (individual source unavailable)
- **Platform profiles:**
  - Desktop: full-width banner below top bar; single-line text + icon; close button at right.
  - Tablet: same layout; font size and touch target sizes conform to Tablet density.
  - Mobile: full-width banner; abbreviated copy: `"Offline — changes saved locally."` with a "More" link expanding to the full message.
- **Input:** pointer (close button) · touch (close button ≥44×44 CSS px) · keyboard (Tab to close button, `Enter` to dismiss)
- **Accessibility:** `role="alert"` for Offline transition; `role="status"` for Reconnecting and Synced states. `aria-live="assertive"` on the region for Offline state change; `aria-live="polite"` for Reconnecting and post-sync dismiss. The banner text is the live-region content. The close button: `aria-label="Dismiss offline notice"`.
- **Acceptance criteria:**
  - Given the device loses connectivity, when any user is editing a note or character, then the offline banner appears within 2 seconds and the editing surface remains fully interactive.
  - Given the offline banner is visible, when the user dismisses it manually, then it is removed from the DOM and editing continues without interruption.
  - Given connectivity returns and sync completes, when the app re-establishes cloud connection, then the banner transitions Offline → Reconnecting → "Back online. Changes synced." and auto-dismisses within 3 seconds.
  - Given a screen reader user is present, when the device goes offline, then the `aria-live="assertive"` region announces the offline banner text within one render tick.
- **Priority:** Must-have

---

### UX-SYNC-004 — Queued-changes view

- **Requirement:** The user must be able to inspect all locally queued (pending outbound) sync operations in an ordered list, accessible from the global sync indicator in two taps/clicks or fewer.
- **Rationale:** Things for iOS demonstrates that making the sync queue inspectable is the highest-impact trust action for users on unreliable connections [8]. SYNC-010 requires this inspection surface functionally; this requirement specifies its UX.
- **Spec:**
  - Accessible from: the Sync Status panel (§ UX-SYNC-005) as a tab or section. Also accessible via a "View queued changes" link in the Pending (offline queue) tooltip on the global indicator.
  - **List format per queued operation row:**
    - Entity icon (character, note, map, etc.) + entity name (truncated to 32 chars with ellipsis)
    - Operation type in plain language: `"HP updated"`, `"Note edited"`, `"Map layer added"`, `"Character created"`, etc. (not raw operation codes)
    - Source label: `"Local vault"`, `"Obsidian"`, `"Google Docs"` as applicable
    - Recency: `"X seconds ago"` / `"X minutes ago"` / `"X:XX PM"` for same-day, `"Mon DD"` for older
  - Rows sorted: most-recent first.
  - Maximum display: 50 rows; "Load earlier" affordance for older.
  - Empty state: `"No pending changes — everything is synced."` with the cloud-check icon.
  - No destructive actions in this view (cannot delete queued operations from the UI — they process automatically). Read-only.
- **States:** populated (list with rows) / empty (synced) / loading (skeleton list while fetching from local store)
- **Platform profiles:**
  - Desktop: rendered as a scrollable list within the Sync Status panel; no maximum height (scrolls within panel).
  - Tablet: same; list renders within the full-screen sheet.
  - Mobile: rendered as a bottom drawer, triggered from the global indicator; max height 60vh, scrollable.
- **Input:** pointer (scroll) · touch (scroll, swipe to dismiss drawer on Mobile) · keyboard (Tab through rows; `Escape` closes panel)
- **Accessibility:** `role="list"` on the container; each row is `role="listitem"`. The container has `aria-label="Queued sync operations, [N] pending"`. Empty state region: `role="status"`.
- **Acceptance criteria:**
  - Given five local edits have been made offline, when the user opens the queued-changes view, then all five operations are listed in reverse-chronological order with entity name, plain-language operation type, and recency.
  - Given all operations have synced, when the user opens the queued-changes view, then the empty state is displayed.
  - Given a Mobile user taps the global sync indicator in Pending state, when the indicator is tapped, then the queued-changes bottom drawer opens within 300 ms.
- **Priority:** Must-have

---

### UX-SYNC-005 — Sync Status panel

- **Requirement:** A dedicated Sync Status panel must present a complete, inspectable view of all sync sources, their health, pending operations, conflict records, and retry affordances — accessible from the global indicator in one action.
- **Rationale:** SYNC-010 requires this inspection capability; SYNC-014 extends it to include snapshot lineage for authorized DMs. Obsidian Sync's operation log is the closest analogue in consumer software [6].
- **Spec:**
  - **Sections within the panel:**

    **1. Sources** — One row per configured source (Local Vault, Obsidian, Google Docs, future). Each row shows:
    - Source icon + name
    - Health chip: `Synced` (green) / `Syncing` (pulse) / `Pending` (clock) / `Auth required` (yellow) / `Error` (red) / `Unavailable` (gray)
    - Last-synced timestamp (relative)
    - Actions: `"Sync now"` (if applicable) / `"Reauthorize"` (if auth required) / `"View log"` (opens per-source operation log)

    **2. Conflicts** — Visible only if unresolved conflicts exist. Header: `"[N] conflict(s) need resolution"`. Each row:
    - Entity icon + name
    - Field count: `"3 fields in conflict"`
    - `"Resolve"` button (links to conflict resolution surface for that entity)
    - DM-only: only the DM role sees this section; Player and Observer see `"No conflicts"` or an omitted section to avoid leaking the existence of hidden-content conflicts (SYNC-006 / SYNC-013 player-safe rule).

    **3. Queued changes** — Collapsed by default; expand control shows count. Same content as § UX-SYNC-004.

    **4. Snapshot lineage** (DM only, Should-have, SYNC-014) — Collapsible section. Lists the 10 most recent compacted snapshots with timestamp, operation range, and a `"Restore from this point"` affordance (which opens a confirmation dialog).

  - Panel is a side panel on Desktop (slides in from the right, width 360 CSS px), a full-screen sheet on Tablet, and a bottom sheet on Mobile (max height 80vh).
  - `"Sync now"` manual trigger: fires the sync adapter cycle for all sources; button enters a loading state (spinner, disabled) until the cycle completes or errors.
- **States:** Healthy (all sources synced) / Degraded (at least one source error or pending) / Conflicts present / Auth required (one or more sources need reauthorization)
- **Platform profiles:**
  - Desktop: slide-in side panel, 360 CSS px wide, pushes content (does not overlay). Keyboard: `G S` opens; `Escape` closes.
  - Tablet: full-screen sheet; swipe-down to dismiss.
  - Mobile: bottom sheet, 80vh max; swipe-down to dismiss.
- **Input:** pointer (clicks, scroll) · touch (tap, swipe to dismiss) · keyboard (Tab/Shift-Tab through interactive elements; `Escape` closes; `Enter` on "Sync now" / "Reauthorize" / "Resolve" triggers action)
- **Accessibility:** Panel element: `role="dialog"` with `aria-label="Sync status"` and `aria-modal="true"` on Mobile/Tablet sheet variants. Focus trapped within the panel while open; restored to the triggering element on close. Source health chips: `role="status"` with `aria-label="[Source]: [state]"`. Conflict rows: `role="alert"` (assertive) if a new conflict appears while the panel is open.
- **Acceptance criteria:**
  - Given the DM opens the Sync Status panel with an unresolved conflict on a character, when the panel renders, then the Conflicts section is visible with that character listed and a "Resolve" button.
  - Given a Player opens the Sync Status panel, when the panel renders, then the Conflicts section is absent or shows "No conflicts" even if DM-only content conflicts exist.
  - Given Google Docs auth has expired, when the Sources section renders, then the Google Docs row shows `"Auth required"` state and a `"Reauthorize"` button.
  - Given the DM clicks `"Sync now"`, when the sync cycle is triggered, then the button enters loading state and returns to its default state within 10 seconds (success or error).
- **Priority:** Must-have

---

### UX-SYNC-006 — Conflict resolution surface

- **Requirement:** When a live-sync conflict exists on an entity, the DM must be able to review both divergent values side-by-side, select a resolution per field, preview the resulting entity state, and commit — without ever destroying either version before commitment.
- **Rationale:** SYNC-006 and SYNC-013 define the functional conflict model; this requirement defines its UX. VS Code's three-pane merge editor is the north-star layout for conflict resolution [9]. The never-lose-data guarantee is a structural design constraint: both versions must remain accessible until the DM commits. Because conflict resolution is DM-authorized only (SYNC-013), the surface must enforce the visibility boundary: it must never display hidden content that would be visible to a Player or Observer.
- **Spec:**
  - **Trigger:** "Resolve" button from the conflict badge, entity detail header, or Sync Status panel.
  - **Layout — field-level conflict surface (ASCII sketch, Desktop):**

    ```
    ┌─────────────────────────────────────────────────────────────────────────┐
    │  Resolving conflict: Theron Brightmantle (Character)           [✕ Close] │
    │  2 of 5 fields in conflict · Last editor: You (3 min ago) vs. Kai       │
    ├─────────────────────────────┬───────────────────────────────────────────┤
    │  YOUR VERSION               │  INCOMING VERSION (Kai · 2 min ago)       │
    ├─────────────────────────────┼───────────────────────────────────────────┤
    │  HP: 24                     │  HP: 18                                   │
    │  [← Keep yours]  [Keep theirs →]         [Merge…]                       │
    ├─────────────────────────────┼───────────────────────────────────────────┤
    │  Condition: None            │  Condition: Poisoned                      │
    │  [← Keep yours]  [Keep theirs →]                                        │
    ├─────────────────────────────┴───────────────────────────────────────────┤
    │  RESULT PREVIEW (live)                                                  │
    │  HP: [24 / 18 / unresolved…]   Condition: [None / Poisoned / unresolved]│
    ├─────────────────────────────────────────────────────────────────────────┤
    │  [Accept All Mine]  [Accept All Theirs]          [Commit Resolution ▶]  │
    └─────────────────────────────────────────────────────────────────────────┘
    ```

  - **Column labels:** "Your version" and "Incoming version (Actor · N min ago)" — actor name from the sync operation metadata (SYNC-002). Never "local" / "remote" (too technical for a DM at the table).
  - **Per-field choices:** Three inline buttons: `← Keep yours`, `Keep theirs →`, and `Merge…` (for text fields where manual merge is appropriate; opens a text editor pre-populated with both versions).
  - **Result preview:** Updates live as choices are made. Unresolved fields shown as `[unresolved]` in warning color.
  - **Batch affordances:** `"Accept All Mine"` and `"Accept All Theirs"` resolve all fields in one action; the result preview updates to confirm before commit.
  - **Commit:** `"Commit Resolution"` is disabled (grayed) until all fields are resolved. On commit, a confirmation toast: `"Conflict resolved. Theron Brightmantle updated."` (SYNC-013 requires the resolution to create a new revision with audit history).
  - **DM-only guard:** The surface must not render hidden fields — fields that are marked DM-only in the entity visibility model must be omitted from the player-visible entity path. Since conflict resolution is DM-authorized only, this surface is never shown to Players/Observers, but the rendering pipeline must still apply visibility filters in case of future role-expansion edge cases.
  - **Non-blocking:** The conflict resolution surface does not block access to the rest of the app. It opens as a panel (Desktop) or sheet (Tablet/Mobile); the user can dismiss and return without losing their resolution progress (progress is autosaved as draft choices in local state).
  - **Google Docs / formatting-loss conflicts:** When the conflict originates from a Google Docs adapter formatting-loss event (SYNC-016), an additional "Formatting-loss detail" collapsible section shows which Docs formatting was lost in translation (cross-link to the import preview surface in `09-content-authoring-and-sources.md`).
- **States:** Loading (skeleton while fetching conflict record) / Active (fields displayed, choices pending) / Partially resolved (some fields chosen, commit disabled) / Fully resolved (all fields chosen, commit enabled) / Committing (loading state on commit button) / Complete (toast + panel closes)
- **Platform profiles:**
  - Desktop: Side panel (560 CSS px wide) or modal dialog (860 CSS px wide) depending on field count. Two-column layout as shown. Full keyboard navigation.
  - Tablet: Full-screen sheet. Two-column layout if width allows (>700 CSS px); single-column stacked (your version above, incoming below) at narrower widths.
  - Mobile: Full-screen sheet, single-column stacked layout. "Accept All Mine" / "Accept All Theirs" are the primary affordances; per-field resolution accessible via expand.
- **Input:** pointer (click) · touch (tap) · keyboard (Tab/Shift-Tab between fields and buttons; `Enter` on choice buttons; `Escape` dismisses without committing — progress saved as draft)
- **Accessibility:** `role="dialog"` with `aria-label="Resolve conflict: [Entity name]"` and `aria-modal="true"`. Each conflicted field group: `role="group"` with `aria-labelledby` pointing to the field name. Choice buttons: clear `aria-label="Keep your version of HP"` / `"Keep Kai's version of HP"`. Result preview: `role="region"` with `aria-label="Resolution preview"` and `aria-live="polite"`. Commit button: `aria-disabled="true"` until all fields resolved. "Unresolved" state in preview includes text, not color only.
- **Acceptance criteria:**
  - Given a conflict exists on a character with two conflicted fields, when the DM opens the conflict resolution surface, then both fields are displayed side-by-side with labeled source attribution.
  - Given the DM has resolved one of two fields, when the Commit button is inspected, then it is disabled and the result preview shows one resolved value and one `[unresolved]` marker.
  - Given the DM clicks "Accept All Mine", when the action completes, then all fields show the "Your version" value in the result preview and the Commit button becomes enabled.
  - Given the DM commits a resolution, when the operation completes, then the entity's conflict badge is cleared, a success toast appears, and the panel closes.
  - Given a Player role navigates to a URL that would open a conflict surface, when the route resolves, then access is denied with a `"Permission required"` message and no conflict data is rendered.
- **Priority:** Must-have

---

### UX-SYNC-007 — Retry and error recovery with actionable messaging

- **Requirement:** When a sync operation fails with a recoverable error (network timeout, auth expiry, source unavailable), the user must see an actionable inline message naming the source, the reason, and the exact action to take — never a generic "Something went wrong" message.
- **Rationale:** NN/g error message research establishes that error messages must include: what happened, why, and exactly what to do next [11]. Generic error copy combined with an unexplained retry button is the most common failure mode observed in sync UIs.
- **Spec:**
  - **Error message anatomy:**
    - Source name: `"Google Docs"` / `"Obsidian"` / `"Cloud sync"`
    - Reason (plain language): `"Authorization expired"` / `"Network timeout"` / `"File not found on Drive"` / `"Unsupported format"`
    - Action (one specific verb): `"Reauthorize"` (button) / `"Retry now"` (button) / `"View details"` (link) / `"Dismiss"` (text link)
  - **Error display locations:**
    - Source-level errors: in the Sources section of the Sync Status panel (§ UX-SYNC-005), inline on the source row.
    - Entity-level errors: as inline error text below the entity title in the entity detail view, with the same actionable anatomy.
    - Transient errors (< 5 s self-resolved): snackbar toast in the bottom-center of the screen, auto-dismissing in 5 s with a `"View details"` action.
  - **Retry behavior:** "Retry now" initiates an immediate sync cycle for the affected source. The button shows a loading spinner for the duration. If the retry fails, the error message persists with a "Retry again" affordance and a "Last attempted: X seconds ago" timestamp.
  - **Exponential back-off:** The system performs automatic retries (SYNC protocol layer); the UI surface tracks the retry interval and shows `"Retrying in N seconds…"` as a subtitle on the error row when auto-retry is pending. The user can trigger an immediate retry without waiting.
  - **Auth expiry path:** `"Reauthorize"` opens the auth flow inline (within a modal, not a page navigation) so the user does not lose their working context. After successful auth, the error clears and the queued operations are dispatched automatically.
- **States:** Error (visible, action required) / Retrying (loading, action pending) / Resolved (error clears, briefly shows success checkmark then vanishes)
- **Platform profiles:**
  - Desktop: inline errors in Sync Status panel; snackbar at screen bottom-center.
  - Tablet/Mobile: same; snackbar anchored above the bottom navigation bar to avoid occluding it.
- **Input:** pointer (click) · touch (tap) · keyboard (`Tab` to action button, `Enter` to trigger)
- **Accessibility:** Inline errors: `role="alert"` with `aria-live="assertive"`. Snackbar toasts: `role="status"` with `aria-live="polite"` (transient, non-critical). Action buttons have descriptive `aria-label` including the source name ("Reauthorize Google Docs").
- **Acceptance criteria:**
  - Given Google Docs auth expires during a sync cycle, when the error is surfaced, then the Sources section shows `"Google Docs — Authorization expired"` with a `"Reauthorize"` button, not a generic error message.
  - Given the user clicks `"Retry now"`, when the retry is in progress, then the button shows a loading spinner and is disabled until the retry completes or fails.
  - Given a transient network timeout self-resolves within 5 seconds, when the error occurs, then only a snackbar toast appears (not a persistent error in the Sync Status panel).
- **Priority:** Must-have

---

### UX-SYNC-008 — Optimistic UI: local-first write acknowledgment

- **Requirement:** Every user-initiated write (editing a character field, saving a note, moving a widget) must be acknowledged by the UI within 100 ms via immediate local state update, without blocking on network confirmation.
- **Rationale:** Linear's sync architecture proves that optimistic local commit is the correct model for local-first software [2]. Any visible delay between user action and UI acknowledgment, even 200–300 ms, creates doubt about whether the action registered — which at the table causes the DM to repeat actions and introduces errors.
- **Spec:**
  - **Optimistic commit pattern:** The UI reflects the new state immediately after user action. The sync indicator transitions to `Syncing` within 100 ms. If the sync cycle confirms the write, the indicator returns to `Synced` with no user-visible transition. If the sync cycle rejects the write (e.g., schema validation failure on the processing core), the UI rolls back the optimistic change and displays an inline error — the rollback must be clearly communicated (the field reverts with a brief visual shake animation, 150 ms, and an inline error label).
  - **No blocking spinners on writes.** A write operation must never produce a full-page or full-panel spinner. Loading state on the write button itself (if applicable) is permitted for ≤500 ms before an optimistic update is shown.
  - **Conflict creation must not block the write.** If a write creates a conflict condition (concurrent edit detected by the sync engine), the write is accepted locally and a conflict badge appears on the entity. The user is not interrupted mid-session to resolve conflicts.
  - **Rollback communication:** Field reverts: the field value animates back to its prior value (150 ms ease-in-out) and a red exclamation badge appears inline. `aria-live="assertive"` announces: `"[Field name] could not be saved. [Reason]. [Action]."` (`prefers-reduced-motion`: skip animation, show badge immediately.)
- **States:** No UI state for the healthy case (optimistic success is invisible). Error (rollback + badge).
- **Platform profiles:** Identical behavior across all profiles (same processing core command). Animation suppressed under `prefers-reduced-motion` on all profiles.
- **Input:** No additional input — optimistic behavior is automatic on any write action.
- **Accessibility:** Rollback error announced via `aria-live="assertive"`. Rollback animation is suppressible via `prefers-reduced-motion`. The error badge has `role="alert"` and a text label, not color alone.
- **Acceptance criteria:**
  - Given a user edits a character's HP field, when the edit is committed (blur or Enter), then the new value is displayed within 100 ms without a spinner or loading state.
  - Given the sync engine rejects a write due to validation failure, when the rejection arrives, then the field reverts to its prior value and an inline error with a reason and action appears within 500 ms.
  - Given `prefers-reduced-motion` is enabled, when a write rollback occurs, then the rollback is instant (no animation) and the error badge appears immediately.
- **Priority:** Must-have

---

### UX-SYNC-009 — Asset-missing degraded state

- **Requirement:** When a binary asset (map image, handout, audio file) referenced by an entity is not present on the device (SYNC-009), the UI must display a clear, non-blocking degraded state for the affected widget or field, without preventing access to other content.
- **Rationale:** SYNC-009 requires the UX to represent the asset-missing state. Ignoring absent assets silently (rendering broken images) is the worst possible outcome under this constraint.
- **Spec:**
  - **Degraded state rendering:**
    - Map widget with missing image: render the widget chrome and layer controls, replace the image canvas with a patterned placeholder (16×16 CSS px hatched fill, `--color-surface-muted`). Overlay text: `"Map image unavailable on this device"`. Action: `"Download asset"` button (if online) or `"Will sync when reconnected"` label (if offline).
    - Handout with missing image: render the handout card frame, image slot shows the same hatched placeholder with `"Image not yet downloaded"` copy.
    - Audio file missing: play button is disabled with tooltip `"Audio file not available on this device"`.
  - Content outside the missing asset (entity metadata, notes, stats, layer definitions) remains fully accessible and editable.
  - "Download asset" button initiates an on-demand asset fetch; shows progress (linear progress bar inside the widget, determinate where content-length is known). On completion, the placeholder is replaced with the asset (crossfade 200 ms).
- **States:** Missing (placeholder) / Downloading (progress bar) / Available (normal render)
- **Platform profiles:** Identical pattern across profiles; placeholder fills the available widget bounds. Download progress bar is shown at the bottom of the widget on all profiles.
- **Input:** pointer (click "Download asset") · touch (tap) · keyboard (Tab to button, `Enter`)
- **Accessibility:** Placeholder region: `role="img"` with `aria-label="[Asset type] unavailable: [Asset name]"`. Download button: `aria-label="Download [Asset name]"`. Progress bar: `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.
- **Acceptance criteria:**
  - Given a map widget references an image asset not on this device, when the widget renders, then the hatched placeholder and explanatory text are shown, and all other map controls remain functional.
  - Given the user clicks "Download asset" while online, when the download completes, then the placeholder is replaced with the map image without requiring a page reload.
- **Priority:** Must-have

---

### UX-SYNC-010 — Cloud storage classification and consent panel

- **Requirement:** Before cloud sync is enabled for a vault, the user must be shown a clear, plain-language panel disclosing what categories of data are cloud-syncable (when enabled) and what stays device-local always — and must confirm understanding before enabling cloud sync.
- **Rationale:** SYNC-007 and SYNC-008 define the classification; SYNC-017 defines the encryption prerequisite gate. This requirement specifies the UX for the disclosure and consent surfaces. Obsidian Sync's Selective Sync settings and Actual Budget's data transparency patterns are the exemplars [6][13]. The existing `CloudStorageClassificationPanel.svelte` implements this surface; this requirement is its UX specification.
- **Spec:**
  - **Panel sections (mapping to `CloudStorageClassificationPanel.svelte`):**

    **1. Cloud sync enablement gate (SYNC-017)**
    - Header: `"Cloud sync"` with current state chip: `"Disabled"` (default) or `"Enabled"`.
    - Gate summary text: plain-language explanation of the encryption prerequisites and their status. Each prerequisite listed as a checklist row with met/unmet indicator (checkmark / dash, not color alone).
    - Enable button: `"Enable cloud sync"` — disabled and grayed until all prerequisites are met. When prerequisites are unmet, a tooltip on the button reads: `"Meet the requirements above before enabling cloud sync."` No other path to enable.

    **2. Cloud-syncable categories (SYNC-007) — only eligible when cloud sync is enabled**
    - Section header: `"What syncs to the cloud (only when cloud sync is enabled)"`.
    - Each category listed with its plain-language description. Example rows: `"Vault identity"` / `"Notes and content"` / `"Character data"` / `"Operation history"` / `"Conflict records"` / `"Assets (maps, images, audio)"` / `"Session state"`.
    - A small info badge (`ℹ`) on each category links to a help tooltip explaining why it syncs.

    **3. Device-local categories (SYNC-008) — never leaves the device**
    - Section header: `"What stays on this device only"`.
    - Categories listed with the same pattern. Example rows: `"Authorization tokens"` / `"OS credential records"` / `"Absolute file paths"` / `"Temporary UI state"` / `"Local diagnostics"`.
    - A lock icon badge on each row reinforces the device-local status visually.

    **4. Consent confirmation (first-time enable only)**
    - Shown as a modal confirmation dialog triggered by clicking `"Enable cloud sync"` once all prerequisites are met.
    - Modal header: `"Enable cloud sync for [Vault name]?"`
    - Body (two sentences max): `"Your vault data will sync to the cloud using the encryption model configured above. Auth tokens and device credentials never leave this device."`
    - Two actions: `"Enable cloud sync"` (primary, destructive-weight styling) and `"Cancel"` (secondary).
    - After confirmation, the panel state updates to `"Enabled"` and the gate summary reflects the active state.

  - **Fail-closed default:** Classification fails closed — any unrecognized data category is device-local by default (SYNC-015). This must be stated in the panel: `"Anything not listed above defaults to staying on this device."` (positioned after the device-local section).
- **States:** Default (cloud sync disabled, prerequisites unmet) / Prerequisites met (enable button active) / Enabled (cloud sync active, classification read-only) / Error (sync enable failed — inline error on the gate section)
- **Platform profiles:**
  - Desktop: rendered in the Settings → Sync page as a full-width content section.
  - Tablet: same layout within the settings sheet.
  - Mobile: same content, single-column stacked; collapsible sections for the category lists.
- **Input:** pointer (click, expand, toggle) · touch (tap, collapse/expand) · keyboard (Tab/Shift-Tab; `Enter` on Enable button; `Escape` on consent modal)
- **Accessibility:** Prerequisite list: `role="list"` with `role="listitem"` per prerequisite; met/unmet conveyed by text label and icon shape, not color alone. Enable button: `aria-disabled="true"` until prerequisites met. Consent modal: `role="alertdialog"` with `aria-modal="true"` and `aria-describedby` pointing to the body text. Category lists: `role="list"`.
- **Acceptance criteria:**
  - Given cloud sync prerequisites are not met, when the user views the classification panel, then the Enable button is disabled and each unmet prerequisite is listed with an unmet indicator.
  - Given all prerequisites are met, when the user clicks "Enable cloud sync", then a confirmation modal appears naming the vault before enabling.
  - Given the user confirms enablement, when enablement succeeds, then the gate summary updates to "Enabled" and the cloud-syncable categories are marked as now-active.
  - Given a screen reader user tabs to the Enable button while prerequisites are unmet, when focus lands on the button, then `aria-disabled="true"` is announced and the associated tooltip text is readable via `aria-describedby`.
- **Priority:** Must-have

---

### UX-SYNC-011 — Trust signals: last-synced timestamp and "your data is safe" reassurance

- **Requirement:** The interface must provide passive, always-available trust signals so the user never has to wonder whether their work is durable.
- **Rationale:** The Ink & Switch local-first essay identifies "will I lose my data?" as the primary anxiety of local-first software users [1]. Actual Budget and Linear both address this with explicit last-synced timestamps and honest local-save confirmation [2][13].
- **Spec:**
  - **Last-synced timestamp:** Shown in the global sync indicator tooltip at all times: `"Last synced 3 minutes ago"` (relative time, updates every 30 s without page refresh). In the entity detail view header: `"Saved · Last synced 3 min ago"` (or `"Saved locally · Not yet synced"` if cloud sync is disabled or offline). Relative time format: `"X seconds ago"` (< 60 s) / `"X minutes ago"` (< 60 min) / `"X hours ago"` (< 24 h) / `"Mon DD, H:MM AM/PM"` (older).
  - **"Saved" micro-confirmation:** When an entity save completes (local write), a brief `"Saved"` micro-label appears next to the entity title for 1.5 s before fading (not a toast — inline, adjacent to the title). This is the direct response to the user's action (within 100 ms per UX-SYNC-008). Under `prefers-reduced-motion`, the label appears and disappears without fade animation.
  - **"Your changes are safe" empty-state reassurance:** In the queued-changes view empty state (§ UX-SYNC-004), the copy explicitly reads: `"No pending changes — your work is saved and synced."` Not `"Nothing to do"` or `"Queue empty"`.
  - **First run / offline onboarding nudge:** On first launch or after the first offline session, a one-time contextual tooltip attached to the sync indicator reads: `"Your data lives on this device first. Cloud sync is extra protection."` Dismisses on click; never shown again after first dismiss.
- **States:** Trust signal is always visible (at-rest: last-synced timestamp in tooltip; post-save: micro-label).
- **Platform profiles:** All profiles display the last-synced timestamp in the indicator tooltip. Micro-label shown adjacent to entity title on all profiles. Tooltip requires pointer (Desktop); on Mobile the last-synced timestamp is shown inline in the entity detail header (not tooltip-only).
- **Input:** No active input required — trust signals are ambient.
- **Accessibility:** Micro-label: `aria-live="polite"` announces `"Saved"` when it appears. The one-time onboarding tooltip: `role="tooltip"` with a close button (`aria-label="Dismiss tip"`). Last-synced timestamp in entity header: plain text, no ARIA decoration needed.
- **Acceptance criteria:**
  - Given the user saves a note, when the save completes, then a `"Saved"` micro-label appears adjacent to the note title within 100 ms and fades after 1.5 s.
  - Given the global sync indicator is in `Synced` state, when the user hovers (Desktop) or reads the entity header (Mobile), then a `"Last synced N minutes ago"` timestamp is visible.
  - Given `prefers-reduced-motion` is active, when the "Saved" micro-label appears, then it is displayed without fade animation.
- **Priority:** Should-have

---

### UX-SYNC-012 — First-time authorization flows

- **Requirement:** When a source requires first-time authorization (Google Docs OAuth, Obsidian directory access, future cloud identity), the auth flow must be presented inline as a focused sheet/modal — not a full page navigation — and must explain what is being authorized before asking for permission.
- **Rationale:** SYNC-003, SYNC-005, and SYNC-016 define the functional auth requirement. Authorizing an external service during a live session (e.g., the DM connecting Google Docs for the first time while at the table) must not disrupt the session state.
- **Spec:**
  - **Auth sheet anatomy:**
    - Header: `"Connect [Source name]"` with source icon.
    - Body: two-sentence plain-language explanation: what access is being requested and why. Example: `"DND Tools will read and write documents in your Google Drive to sync campaign notes. Only files you explicitly link are accessed — your full Drive is not scanned."` This text is static and displayed before any OAuth redirect.
    - Permissions summary list: bullet list of OAuth scopes in plain English (not raw scope strings). Example: `"Read and write linked documents"` / `"See document revision history"`. Never a raw scope like `https://www.googleapis.com/auth/drive.file`.
    - Action: `"Connect [Source name]"` (primary) and `"Cancel"` (secondary).
    - On `"Connect"`: opens OAuth flow in a system browser popup or embedded WebView, depending on platform. The sheet remains visible in the background with a `"Waiting for authorization…"` state.
    - On OAuth success: sheet transitions to a `"Connected"` success state with a `"Done"` button; source appears in the Sync Status panel Sources section.
    - On OAuth failure or user cancel: sheet shows `"Connection cancelled. Try again or dismiss."` with `"Retry"` and `"Dismiss"` buttons.
  - **Offline guard:** If the device is offline when authorization is attempted, the sheet immediately shows: `"Authorization requires a network connection. Connect to the internet and try again."` No OAuth redirect is attempted.
  - **Re-authorization (auth expiry):** Same sheet, header `"Reconnect [Source name]"`, body: `"Your [Source] connection has expired. Reconnect to resume syncing. Your queued local changes are safe."` This framing (queued changes are safe) is deliberate trust-building.
- **States:** Pre-auth (explain + action) / Waiting (OAuth in progress) / Connected (success) / Failed / Offline-blocked
- **Platform profiles:**
  - Desktop: centered modal dialog, 480 CSS px wide.
  - Tablet: full-screen sheet.
  - Mobile: full-screen sheet.
- **Input:** pointer (click) · touch (tap) · keyboard (Tab/Shift-Tab; `Enter` on primary button; `Escape` cancels and closes)
- **Accessibility:** `role="dialog"` with `aria-modal="true"` and `aria-labelledby` the header. Focus moves to the first interactive element on open; restored to the trigger on close. Permissions list: `role="list"`.
- **Acceptance criteria:**
  - Given the user initiates Google Docs authorization, when the auth sheet opens, then the plain-language explanation and permissions list are visible before the Connect button is enabled.
  - Given the device is offline, when the user attempts authorization, then the offline-blocked state is shown with no OAuth redirect.
  - Given OAuth completes successfully, when the sheet transitions, then the `"Connected"` state is shown with a Done button and the source appears in the Sync Status panel.
- **Priority:** Must-have

---

### UX-SYNC-013 — Perceived performance: no blocking spinners on sync

- **Requirement:** No sync operation, including initial vault load, source adapter cycle, conflict badge refresh, or cloud snapshot fetch, may render a full-page or full-panel blocking spinner that prevents user interaction.
- **Rationale:** This is a direct corollary of UX-SYNC-008 (optimistic UI) and the "The table is the context" north-star principle in `00-overview-and-principles.md`. A DM interrupted by a loading spinner mid-session cannot recover gracefully. This requirement makes the anti-pattern explicit and testable.
- **Spec:**
  - **Skeleton screens:** On initial load of the Sync Status panel or queued-changes view, render a skeleton layout (placeholder rows matching the eventual content structure) for a maximum of 300 ms before populating with real data or an empty state.
  - **Inline progress:** All long-running sync operations (large asset download, initial vault bootstrap from cloud, snapshot restore) show progress as inline progress bars within the affected widget or section — not full-screen overlays.
  - **"Sync in background"** messaging: If a long sync operation (e.g., initial Google Docs full-sync on first connect) is initiated, a toast announces: `"Syncing [N] items from Google Docs in the background. You can keep working."` A persistent but unobtrusive progress chip in the Sync Status panel tracks the background operation without blocking any surface.
  - **Vault bootstrap:** On first-run or device-transfer vault load from cloud, the app shows the canvas home immediately (using whatever local data exists or an empty state), and a progress bar within the Sync Status panel tracks the background bootstrap. No splash screen spinner that blocks the UI.
- **States:** No blocking state exists by design.
- **Platform profiles:** Identical requirement across all profiles.
- **Input:** No input required — this is a design constraint on all sync flows.
- **Accessibility:** Skeleton screens use `aria-busy="true"` on the container; live regions announce when data loads ("Sync status loaded"). Background progress chip: `role="progressbar"`.
- **Acceptance criteria:**
  - Given the user opens the Sync Status panel, when data is loading, then a skeleton layout (not a spinner) is shown and the rest of the app remains interactive.
  - Given a large asset download is in progress, when the user navigates to a different surface, then the download continues in the background and the UI does not block.
  - Given a full Google Docs initial sync is triggered, when the sync begins, then a background progress toast appears and the user can open and edit notes immediately.
- **Priority:** Must-have

---

## 6. Component & state specifications

### 6.1 Sync status icon set — complete state matrix

| State | Icon name | Color token | Badge | Animation | `aria-label` pattern |
|---|---|---|---|---|---|
| Synced | `cloud-check` | `--color-icon-subtle` | None | None | `"Sync status: Up to date"` |
| Syncing | `cloud-upload` | `--color-icon-default` | None | Fade pulse 1.2 s | `"Sync status: Syncing"` |
| Pending | `cloud-clock` | `--color-icon-default` | None | None | `"Sync status: N changes pending"` |
| Offline | `cloud-off` | `--color-icon-warning` | None | None | `"Sync status: Offline"` |
| Error | `cloud-alert` | `--color-icon-error` | Red dot (8 CSS px) | None | `"Sync status: Error — action required"` |
| Conflict | `cloud-alert` | `--color-icon-error` | Red dot + count | None | `"Sync status: N conflicts need resolution"` |

### 6.2 Per-entity sync badge matrix

| State | Icon (16 CSS px) | Color token | Behavior on tap |
|---|---|---|---|
| Synced | Checkmark (or omitted) | `--color-icon-subtle` | Opens entity detail |
| Syncing | Pulse dot | `--color-icon-default` | Opens Sync Status panel |
| Pending | Clock | `--color-icon-default` | Opens queued-changes view |
| Conflict | Exclamation-circle | `--color-icon-error` | Opens conflict resolution surface |
| Asset missing | Image-broken | `--color-icon-warning` | Opens asset detail / trigger download |
| Local only | Cloud-lock | `--color-icon-subtle` | Opens cloud classification panel |

### 6.3 Offline banner — copy matrix

| Situation | Banner copy | Color token | Auto-dismiss? |
|---|---|---|---|
| Device offline | `"You're offline — changes are saved to this device and will sync when you reconnect."` | `--color-banner-warning-bg` | No (manual close; reappears after 60 s if still offline) |
| Reconnecting | `"Reconnecting…"` | `--color-banner-info-bg` | Yes, 3 s |
| Synced after reconnect | `"Back online. Changes synced."` | `--color-banner-success-bg` | Yes, 3 s |
| Source-specific degraded | `"[Source] sync unavailable — your local changes are safe."` | `--color-banner-warning-bg` | No (manual close) |
| Auth required | `"[Source] authorization expired — reconnect to resume sync."` with `"Reauthorize"` inline button | `--color-banner-error-bg` | No (manual close) |

### 6.4 Conflict resolution surface — component anatomy

| Region | Component | Notes |
|---|---|---|
| Header | Dialog header + entity name + conflict count | `role="dialog"` with `aria-labelledby` |
| Source columns | Two-column layout (Your version / Incoming) | `role="group"` per field row |
| Per-field choice bar | Three inline buttons: Keep Mine / Keep Theirs / Merge… | `aria-pressed` on selected |
| Result preview | Live-updating preview region | `aria-live="polite"` |
| Batch actions | "Accept All Mine" / "Accept All Theirs" | Full-width buttons above Commit |
| Commit | "Commit Resolution" — disabled until all resolved | `aria-disabled="true"` until ready |

### 6.5 Sync Status panel — tab / section structure

| Section | Visibility | Notes |
|---|---|---|
| Sources | All roles | Source health rows with health chip, last-synced, actions |
| Conflicts | DM only | Hidden or "No conflicts" for Player/Observer |
| Queued changes | All roles | Collapsed by default; count in header |
| Snapshot lineage | DM only (Should-have) | Collapsed, latest 10 snapshots |

---

## 7. Layout & responsive behavior

### 7.1 Desktop (≥ 1024 CSS px)

- Global sync indicator: right side of the top bar, always visible. Icon-only in compact density; icon + "Synced" / error label in comfortable density.
- Sync Status panel: slide-in from the right, 360 CSS px wide, pushes canvas content (does not overlay). Keyboard shortcut `G S` opens/closes.
- Conflict resolution surface: modal dialog, 860 CSS px wide, centered, with two-column field layout. Backdrop scrim (50% opacity `--color-overlay`) does not block the ability to close via `Escape`.
- Offline banner: full-width below top bar, 36 CSS px height, never overlaps canvas.
- Cloud classification panel: full-width content section in Settings → Sync page.

### 7.2 Tablet (600–1024 CSS px)

- Global sync indicator: same position, icon-only regardless of density.
- Sync Status panel: full-screen sheet, slides up from bottom. Swipe-down to dismiss.
- Conflict resolution surface: full-screen sheet. Two-column layout if width ≥ 700 CSS px; stacked (your version above, incoming below) at narrower widths.
- Offline banner: full-width, same height. Touch target for close button ≥ 44×44 CSS px.
- Cloud classification panel: full-width within settings sheet, collapsible sections.

### 7.3 Mobile (< 600 CSS px)

- Global sync indicator: icon-only in top bar (rightmost position, before account avatar). Same five states; tap opens bottom sheet.
- Sync Status panel: bottom sheet, 80vh max height, scrollable, swipe-down to dismiss.
- Conflict resolution surface: full-screen sheet, single-column stacked layout. Batch affordances ("Accept All Mine" / "Accept All Theirs") are the primary CTAs; per-field resolution accessible via expand toggle per field.
- Offline banner: full-width; abbreviated copy on Mobile: `"Offline — changes saved locally."` with a `"More"` link expanding the full message inline.
- Queued-changes view: bottom drawer, triggered from Pending state indicator tap; max height 60vh, scrollable.
- Cloud classification panel: single-column within settings; each section collapsible, collapsed by default.

**Same command, same result across profiles:** All sync operations (Sync now, Resolve conflict, Reauthorize, Download asset) are available on all three profiles via touch, pointer, or keyboard. Mobile uses larger targets and simpler layouts but invokes identical processing-core commands.

---

## 8. Motion & feedback

| Motion event | Duration | Easing | `prefers-reduced-motion` fallback |
|---|---|---|---|
| Global indicator state transition (icon swap) | 150 ms | `ease-in-out` | Instant swap, no animation |
| Syncing pulse animation | 1200 ms period, looping | `ease-in-out` | Static icon, no pulse |
| Offline banner slide in | 200 ms | `ease-out` | Banner appears instantly |
| Offline banner slide out (auto-dismiss) | 150 ms | `ease-in` | Banner disappears instantly |
| Conflict resolution panel open (Desktop: slide in) | 250 ms | `ease-out` | Panel appears instantly |
| Conflict resolution panel close | 200 ms | `ease-in` | Panel disappears instantly |
| Result preview update (live) | 80 ms | `ease-out` | Instant value replacement |
| "Saved" micro-label fade-in | 80 ms | `ease-out` | Instant appearance |
| "Saved" micro-label fade-out | 300 ms | `ease-in`, delay 1.2 s | Instant disappearance after 1.5 s |
| Write rollback animation (field value revert) | 150 ms | `ease-in-out` | Instant revert |
| Asset placeholder → image crossfade | 200 ms | `ease-in-out` | Instant replacement |
| Sync Status panel skeleton → content | max 300 ms | `ease-out` | Instant replacement |

All animations conform to the motion system defined in `01-visual-design-system.md`. The `prefers-reduced-motion: reduce` query suppresses or replaces every animation above. Motion must never be the sole carrier of information.

---

## 9. Accessibility requirements (surface-specific)

Beyond the global baseline in `03-accessibility.md`:

**9.1 Live-region strategy for sync state changes**

Sync state changes require careful live-region management to avoid either flooding or silence:

- `aria-live="assertive"` for: device going Offline, Error state appearance, Conflict state appearance (new conflict surfaced), write rollback.
- `aria-live="polite"` for: Syncing → Synced transition, Pending count updates, "Saved" micro-label, background progress updates, banner auto-dismiss, per-entity badge state changes.
- One live region per zone (global indicator region, banner region, entity detail region) — not one region per component, which would create announcement storms during bulk sync.
- The global indicator's live region announces the state label and count, not the full tooltip copy. Example: `"Sync status: Offline"` not `"You are offline. Changes are saved to this device and will sync when you reconnect."` (the latter belongs to the banner, which has its own live region).

**9.2 Conflict resolution keyboard model**

- On open: focus moves to the dialog's `h2` heading (conflict count + entity name).
- Tab order: header → first conflicted field group → choice buttons for that field → next field group → … → batch affordances → Commit button → Close button.
- `Escape`: closes without committing. Draft choices are preserved (local state) and the dialog is reopened with those choices intact if the user reopens it.
- `Enter` on a choice button: selects that choice; focus advances to the next field group's first choice button.
- When Commit becomes enabled: focus is not automatically moved to it (unexpected focus jumps are disorienting). The user must Tab to it.
- Announced on commit: `"Conflict resolved. [Entity name] updated."` via polite live region.

**9.3 Sync indicator keyboard access**

- The global sync indicator button is in the Tab order of the top bar.
- `G S` chord (§ UX-SYNC-001) requires that neither key press be captured by a focused input field. Implementation: chord only fires when no text input has focus.
- On Mobile (no hardware keyboard expected): indicator is tap-only; no keyboard shortcut required.

**9.4 Color-independence requirement**

Every sync state must be distinguishable without color:

- State is conveyed by icon shape (cloud-check / cloud-upload / cloud-clock / cloud-off / cloud-alert) in addition to color.
- Conflict badge: shape (circle with exclamation) distinguishes from the numeric count dot.
- Offline banner: `"Offline"` word label always present in the banner text; not color-alone.
- Per-entity conflict badge: exclamation shape + `aria-label` text.
- Prerequisite met/unmet in the classification panel: checkmark vs. dash shape in addition to color.

**9.5 Target sizes**

| Component | Desktop | Tablet | Mobile |
|---|---|---|---|
| Global sync indicator button | 32×32 CSS px (pointer; smaller target acceptable for pointer) | 44×44 CSS px | 44×44 CSS px |
| Per-entity sync badge (interactive) | 24×24 CSS px | 28×28 CSS px | 32×32 CSS px |
| Conflict choice buttons | standard button height (≥32 CSS px) | ≥44 CSS px | ≥44 CSS px |
| Banner close button | 24×24 CSS px | 44×44 CSS px | 44×44 CSS px |

---

## 10. Anti-patterns & explicit limitations

The following patterns are forbidden. Each has a researched reason and is a hard limit, not a suggestion. These must not appear in a review, regardless of how they look in isolation.

**10.1 Blocking spinners on sync operations**

A full-page or full-panel spinner that blocks interaction while a sync operation proceeds is prohibited on all surfaces. Reason: The primary use context is live play at the table. A DM blocked by a spinner mid-session cannot manage initiative, respond to player questions, or recover gracefully. Linear's research shows that optimistic local commit eliminates the need for blocking sync confirmations [2]. Implementation: all sync is optimistic and background; UI reflects local state immediately (§ UX-SYNC-008, UX-SYNC-013).

**10.2 Silent data loss or last-write-wins without disclosure**

Silently discarding a concurrent edit without surfacing a conflict record to the DM is prohibited. Reason: Google Docs' last-write-wins model, while simple, has been demonstrated to cause data loss in collaborative editing workflows — the prior version is accessible only through version history, not proactively [5]. SYNC-006 and SYNC-013 require that every conflict be a durable record. The UX must never bury that record in a log — it must badge the entity and surface the resolution path (§ UX-SYNC-006).

**10.3 Modal dialogs for ongoing states (offline, auth expiry)**

Using a modal dialog that blocks the UI to communicate an ongoing condition such as device offline or auth expiry is prohibited. Reason: Material Design 3 explicitly recommends persistent banners (not modals) for ongoing conditions [12]. A modal that blocks editing while the user is offline is the most harmful possible design for a live-play tool where connectivity may be poor throughout a session. Implementation: § UX-SYNC-003 (offline banner), § UX-SYNC-007 (error inline in Sync Status panel).

**10.4 Ambiguous sync state or "saved" without specificity**

Collapsing "saved to device" and "synced to cloud" into a single undifferentiated "Saved" state is prohibited. Reason: Actual Budget's explicit distinction between local-save and cloud-sync trust is the correct model [13]. If the user's cloud sync is disabled or offline, showing them "Saved" as if the data is in the cloud misleads them about data durability. Implementation: the micro-label copy must distinguish (`"Saved"` for local commit, `"Saved · Synced"` after cloud confirmation; the entity header shows `"Saved locally · Not yet synced"` when cloud sync is off or offline).

**10.5 Leaking hidden content in conflict or diff views**

Displaying DM-hidden content in a conflict resolution view that could be visible to a Player or Observer is prohibited. This is a safety violation, not a UX preference. Reason: SYNC-006 and SYNC-013 specify player-safe rules for conflict surfaces — the conflict surface is DM-authorized only, and hidden fields must never render in a player-accessible path even if the entity itself is visible [1]. Implementation: § UX-SYNC-006 (DM-only guard), § UX-SYNC-005 (Conflicts section hidden from Player/Observer in the Sync Status panel).

**10.6 Nagging consent or repeated authorization prompts**

Showing the cloud sync consent dialog, authorization prompt, or "Enable cloud sync" nudge more than once per user decision context is prohibited. Reason: Repeated prompts train users to dismiss without reading — the dark pattern outcome is that users accept permissions they do not understand, which is the failure mode the consent panel is designed to prevent [1][6]. Implementation: § UX-SYNC-010 (consent shown once at enable-time; § UX-SYNC-011 first-run tooltip dismissed permanently on first close). Auth prompts appear only when credentials have actually expired (SYNC-016), never preemptively.

**10.7 Fear-inducing conflict language**

Language in the conflict resolution surface that uses words like "corrupted", "lost", "destroyed", "danger", or "irrecoverable" is prohibited. Reason: NN/g error message research shows that alarming language causes users to make hasty decisions to resolve anxiety, not careful decisions to resolve accuracy [11]. The conflict resolution surface must frame the situation as a question to answer, not a crisis to escape. Implementation: copy spec in § UX-SYNC-006 ("Resolving conflict: [Entity name]" — clinical, calm, task-framed).

**10.8 Auto-resolving conflicts without user action**

Automatically choosing one side of a conflict (e.g., defaulting to the most-recent write) and applying the resolution without presenting the conflict to the DM is prohibited. Reason: This is the CRDT last-write-wins anti-pattern — it silently discards data that may be correct. SYNC-006 requires that conflicts be durable records; SYNC-013 requires DM-authorized resolution. The UX must make the resolution path obvious (badge → resolve surface → commit) without ever skipping the user's decision.

**10.9 Sync status visible only in settings**

Burying the sync status indicator behind a settings page navigation (requiring 3+ clicks to find) is prohibited. Reason: Obsidian Sync's bottom-bar indicator and Linear's top-bar indicator demonstrate that sync status must be ambient — available at a glance without navigation. A status indicator only findable in settings provides no trust value during live play. Implementation: § UX-SYNC-001 (persistent global indicator on all profiles).

**10.10 Using color as the sole sync state signal**

Conveying sync state purely through color (e.g., green = synced, red = error) without a distinct icon shape or text label is prohibited. Reason: WCAG 2.2 SC 1.4.1 (Use of Color) prohibits using color as the only visual means of conveying information [WCAG 1.4.1]. Approximately 8% of males have color vision deficiency — for a product used at a gaming table under varying light conditions, shape-based icon distinction is both an accessibility requirement and a practical necessity. Implementation: §§ 6.1, 6.2, 9.4.

---

## 11. Success metrics

| Metric | Target | Measurement method |
|---|---|---|
| Sync state recognition | ≥90% of users correctly identify the current sync state from the global indicator alone (no tooltip) in a 5-second viewing task | Unmoderated usability test, icon-only prototype |
| Time to locate queued changes | ≤10 seconds from any surface, without instruction | Task-based usability test |
| Conflict resolution completion | ≥80% of DMs complete a two-field conflict resolution without error on first attempt | Usability test with conflict resolution prototype |
| Time to resolve a two-field conflict | ≤60 seconds from conflict badge to committed resolution | Timed usability task |
| Offline banner dismissal rate | ≥95% of users correctly continue editing during an offline session without stopping to wait | Observation in table-conditions usability test |
| "Did I lose my data?" anxiety reduction | Post-session survey score ≥4.0/5.0 on "I was confident my work was saved during the session" | Post-session survey (DM cohort) |
| Consent panel comprehension | ≥85% of users correctly identify one cloud-syncable and one device-local category without help | First-click test on classification panel |
| Write acknowledgment latency | 100% of local writes acknowledged (UI update) within 100 ms | Performance test, Playwright + performance mark instrumentation |
| No-blocking-spinner violation | 0 blocking spinners observed during a simulated 30-minute session with intermittent connectivity | QA checklist + Playwright offline simulation |
| Screen reader announcement accuracy | 100% of sync state transitions (Offline, Error, Conflict) announced correctly in NVDA/VoiceOver test | Manual a11y audit with screen reader |

---

## 12. Open questions & risks

**12.1 Conflict surface for Player-owned fields**

SYNC-013 notes that a character owner (Player) can see a conflicted field represented as conflicted and record a proposed value as a normal edit, not a resolution command. The UX of this player-visible "conflicted field" state is not fully specified here — it needs a design decision: does the player see both values (Your edit / Incoming) with a "Propose this value" affordance? Or do they see only their version with a "Conflict pending DM resolution" label? This distinction affects the conflict surface design and the player-visible character sheet (§ `07-characters.md`). **Recommend:** align with character sheet UX spec before finalizing.

**12.2 Conflict surface for Google Docs formatting-loss conflicts**

The cross-link to `09-content-authoring-and-sources.md` for formatting-loss detail is specified in § UX-SYNC-006, but that document (09) does not yet exist in the ux-requirements directory. The import conflict-preview surface design must be completed in sync (no pun intended) with this document to ensure the cross-surface link is coherent. **Risk:** if the 09 surface is designed after this document, the linked section may not match.

**12.3 Encryption prerequisite gate — implementation timing**

Per ADR-014, the live cloud transport and real cryptography are deferred. The `CloudStorageClassificationPanel.svelte` component currently shows cloud sync as default-off with prerequisites unmet. The UX-SYNC-010 specification assumes the gate will eventually move to "met" state. The intermediate state (prerequisites permanently unmet during v2.0) must not make the panel feel broken or confusing to users. **Recommend:** add explicit copy to the gate section: `"Cloud sync is not yet available in this version. Your local data is safe and fully functional."` — a time-limited override copy path that the panel can display when prerequisites will never be met in the current release.

**12.4 Snapshot restore UX**

§ UX-SYNC-005 names a "Restore from this point" affordance in the snapshot lineage section. The full UX of this restoration flow (what confirmation dialog? what rollback scope? per-entity or full vault?) is not specified here. This is a high-risk surface (destructive, irreversible without another snapshot) and requires its own detailed spec before implementation. **Flag:** out of scope for this document; recommend a separate UX note or addendum.

**12.5 Asset download prioritization on Mobile**

§ UX-SYNC-009 specifies on-demand asset download. On Mobile where bandwidth and data plans are a concern, users may want control over when assets download (Wi-Fi only, on-demand only, auto-download). A Wi-Fi-only download preference and per-asset download confirmation for large assets (> 10 MB) would improve the Mobile experience. This preference is not specified here — it is a Could-have that belongs in a future iteration of this document or the Settings surface.

---

## Sources

[1] "Local-first software: You own your data, in spite of the cloud" — Ink & Switch — https://www.inkandswitch.com/local-first/

[2] "Scaling the Linear Sync Engine" — Linear Engineering Blog — https://linear.app/blog/scaling-the-linear-sync-engine

[3] "Work offline in Figma" — Figma Help Center — https://help.figma.com/hc/en-us/articles/360040328553-Work-offline-in-Figma

[4] "Syncing" — Notion Help Center — https://www.notion.so/help/syncing

[5] "Work on Google Docs, Sheets, & Slides offline" — Google Workspace Help — https://support.google.com/docs/answer/6388102

[6] "Obsidian Sync — Sync details" — Obsidian Help — https://help.obsidian.md/Obsidian+Sync/Sync+details

[7] "iCloud status icons in Finder on Mac" — Apple Support — https://support.apple.com/guide/mac-help/icloud-status-icons-in-finder-mchla6bbae1a/mac

[8] "Sync and upload files with the Dropbox desktop app" — Dropbox Help — https://help.dropbox.com/sync/sync-and-upload

[9] "3-way merge editor" — Visual Studio Code Documentation — https://code.visualstudio.com/docs/sourcecontrol/overview#_3-way-merge-editor

[10] "Resolving a merge conflict on GitHub" — GitHub Docs — https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/addressing-merge-conflicts/resolving-a-merge-conflict-on-github

[11] "Error Message Guidelines" — Nielsen Norman Group — https://www.nngroup.com/articles/error-message-guidelines/

[12] "Banners — Material Design 3" — Material Design — https://m3.material.io/components/banners/overview

[13] "Actual Budget — Sync documentation" — Actual Budget Docs — https://actualbudget.org/docs/sync/

[14] "Making PWAs work offline with Service workers" — MDN Web Docs — https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/js13kGames/Offline_Service_workers
