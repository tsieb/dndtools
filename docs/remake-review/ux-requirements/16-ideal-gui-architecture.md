# UX Requirements - Ideal GUI Architecture

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read
> `00-overview-and-principles.md` first. This document synthesizes the package into an ideal
> whole-product interface architecture: major routes, shell regions, overlays, component ownership,
> cross-surface behavior, and the recommended next planning decisions.
>
> **Status:** Draft v1
> **Functional requirement coverage:** cross-cutting; consumes all `UX-*` surface documents
> **Owner surface(s):** Application shell, route architecture, cross-surface composition, and
> interface sequencing.

---

## 1. Purpose

The UX package specifies each surface in depth. This document describes how those surfaces should
fit together as one optimized GUI.

The core interface should feel like a **canvas-first command platform for tabletop RPG play**. The
DM should land in a live, configurable Command Center, not a document list. Notes, maps,
characters, audio, combat, AI, permissions, and sync should all feel like tools that compose into
the table context. Full pages exist for durable workspaces and deep, resumable work. Overlays,
sheets, menus, and popovers exist for short-lived actions that should preserve the user's current
context.

This is intentionally high-level. It should guide route scaffolding, component ownership, IA review,
and development sequencing without prescribing implementation internals.

---

## 2. Product Shape

### 2.1 North-star mental model

The product has three nested concepts:

1. **The shell**: persistent navigation, route context, command palette, help, sync/offline state,
   presence, staged AI/MCP changes, and platform profile adaptation.
2. **The workspace**: the Command Center and saved Scenes. These are spatial canvases where widgets
   compose live-play tools, content, maps, and player-facing views.
3. **The libraries**: durable section pages for Knowledge, Atlas, Characters, Session, Campaign, and
   Settings. These are where users browse, author, configure, and manage the objects that can appear
   on Scenes.

The ideal interface should make the workspace feel primary and the libraries feel immediately
reachable, but not competing.

### 2.2 Primary emphasis

The UI should optimize for a DM under table pressure:

- See current session state immediately.
- Advance combat and adjust HP without navigating away.
- Reveal or project player-visible content safely.
- Find notes, maps, characters, and rules context in one or two actions.
- Understand save/sync/offline state without asking "did that work?"
- Keep hidden DM information out of player-visible UI, ARIA, search, graph, deep-link errors, and
  previews.

Prep and authoring flows can be richer and slower, but live-play controls must be stable, fast,
glanceable, and highly recoverable.

---

## 3. Shell Architecture

### 3.1 The shell as the permanent frame

The shell should contain only cross-route affordances:

- **Primary navigation**: stable global destinations.
- **Top bar**: route title context, back/forward, local panel toggles, command palette trigger,
  sync/offline badge, MCP pending changes badge, presence summary where appropriate, and help.
- **Local navigation region**: section-specific browse/filter/tree/tabs for the active route.
- **Contextual region**: breadcrumbs, backlinks, related links, inspector panels, Scene Outline,
  Map Summary, and object-specific context.
- **Overlay layer**: command palette, dialogs, sheets, drawers, popovers, menus, toasts, and
  banners.

The top bar must not host content-local actions such as New Note, Dice Tray, manual vault refresh,
or create menus. Those belong in section-local navigation, widgets, or command palette actions.

### 3.2 Three navigation layers

All navigation should be classified as one of three layers:

| Layer | Purpose | Examples |
|---|---|---|
| Global | Move between primary application areas | Command Center, Session, Characters, Atlas, Campaign, Knowledge, Settings |
| Local | Browse and filter within the active section | Knowledge folder tree, Atlas map list/layer scope, Session tools list, Character roster filters |
| Contextual | Navigate from the current object to related objects or structure | Breadcrumbs, backlinks, related entities, Scene Outline, Map Summary, map hierarchy trail |

This preserves the existing navigation contract and prevents repeated "global" destinations like
Search, Graph, Dice, Audio, and MCP from cluttering primary navigation.

### 3.3 Platform profiles

The same IA and commands should exist across profiles. Only presentation changes.

| Profile | Shell shape | Local navigation | Contextual navigation | Overlay pattern |
|---|---|---|---|---|
| Desktop / expanded | Persistent global nav plus top bar | Persistent left panel, collapsible/resizable | Optional right panel or inline adjacent region | Floating dialogs, popovers, drawers where bounded |
| Tablet / medium | Rail or tab bar plus top bar | Temporary rail-anchored overlay or split in landscape | Slide-over or collapsible panel | Bottom sheets for heavier flows |
| Mobile / compact | Bottom tab bar plus compact top bar | Browse sheet, no persistent local panel | Full-screen or bottom sheet | Full-screen sheets for complex work, action sheets for small choices |

The compact profile should not attempt to show the full desktop dashboard. It should present a
single focused pane with slim variants for combat, character vitals, search, graph/backlinks, and
map summary, backed by the same processing-core commands.

### 3.4 Command palette and search

The command palette is a shell-level utility, not a section. It should provide:

- Navigation results.
- Actions scoped to the active route and actor.
- Quick switcher behavior for title-first opening.
- Global search entry for visible content.
- Shortcut hints where keyboard modality is active.
- Mobile command menu parity through a top bar or bottom sheet trigger.

Search has two surfaces:

- **Global search overlay**: search-as-you-type across actor-visible content from anywhere.
- **Knowledge-local search/graph pages**: deeper exploration, saved searches, filters, and graph
  health.

Search result counts, hidden targets, timing, error messages, and previews must be actor-filtered.

---

## 4. Recommended Route Architecture

### 4.1 IA reconciliation before scaffolding

> **Decision (ACCEPTED, UX-ARCH).** The seven-destination reconciliation below is accepted. Audio,
> MCP, and the Scenes authoring surface are non-global capabilities. The machine-readable contract is
> `../../planning/v2/ux/navigation-registry.yaml` and the decision record is
> `../../planning/v2/ux/architecture-decisions.md`; UX-NAV-002 in
> `02-navigation-and-platform-profiles.md` has been updated to match.

There is a document-level tension to resolve before large route work:

- The UX navigation document proposes nine Navigation Sections: Command Center, Session,
  Characters, Atlas, Campaign, Knowledge, Audio, MCP, Settings.
- The current architecture contract limits global navigation to five to seven destinations, and
  the current IA document names five primary sections: Knowledge, Atlas, Session, Campaign, and
  Settings.

**Recommended optimized reconciliation:** use seven global destinations:

1. Command Center
2. Session
3. Characters
4. Atlas
5. Campaign
6. Knowledge
7. Settings

Audio and MCP/AI should remain first-class capabilities, but not first-class global navigation
sections:

- **Audio** lives as a Command Center widget, Session tool, scene/map association panel, track
  library drawer, and Settings/local asset-management surface.
- **MCP/AI** lives as inline editor assistance, staged-change review, provenance details, and
  Settings configuration.

This keeps global nav within the architecture contract, reduces first-run overload, and still gives
Audio and MCP durable homes. If product decides that Audio and MCP must stay global sections, update
the architecture contract, IA doc, iconography spec, and navigation lint before implementation.

### 4.2 Primary route map

Route names are conceptual. The exact SvelteKit file paths can differ, but each route should map to
one durable user workspace with a stable title, one `h1`, route announcement, focus restoration, and
deep-link behavior.

| Route | Surface type | Primary purpose | Major components |
|---|---|---|---|
| `/` | Page | Command Center home | Scene host, session status strip, player-view controller, active map widget, combat/dice/timer/audio/reference widgets, widget library drawer |
| `/session` | Page | Active and upcoming session management | Session lifecycle, combat tracker, encounter builder, dice tools, roll history, timers, prep/recap, calendar, quick reference |
| `/session/:sessionId` | Page | Durable session workspace | Same as Session root with concrete active/archive state |
| `/session/:sessionId/combat` | Focused page or pane | Focused combat tracker when the dashboard is not enough | Initiative tracker, current-turn controls, HP stepper, conditions, hidden combatants, player-visible tracker preview |
| `/characters` | Page | Party and character roster | Roster, party overview, quick-create panel, draft ownership management |
| `/characters/:characterId` | Page | Character sheet | Persistent vitals bar, tabbed sheet sections, inline edit, combat resources, journal, data-exposure bindings |
| `/characters/new` | Page | Resumable character creation | Step rail, one-decision-per-step wizard, rules preview, draft autosave |
| `/atlas` | Page | Map library and spatial browsing | Map list, recent maps, create/import/generate entry points, saved map filters |
| `/atlas/maps/:mapId` | Page | Full map viewer/editor | Map viewport, layer panel, minimap, POIs, routes, fog, annotations, combat overlay, map summary |
| `/atlas/maps/:mapId/edit` | Mode page or route state | Map authoring workspace | Drawing/painting palette, generation panel, import rollback, layer editing, pre-projection consistency |
| `/scenes/:sceneId` | Page | Saved Scene workspace outside home | Generic canvas host, widget toolbar, widget inspector, Scene Outline, templates, undo/redo |
| `/campaign` | Page | Long-running campaign structure | Arcs, quests, factions, timeline, campaign objects, open threads |
| `/campaign/:objectType/:objectId` | Page | Structured campaign entity | Entity detail, relationships, backlinks, visibility controls, embeds, related session/map links |
| `/knowledge` | Page | Notes and authored knowledge | Folder/source navigation, note list, editor/viewer, templates, snippets, saved searches |
| `/knowledge/notes/:noteId` | Page | Note reading and editing | Editor, preview, source badge, save chip, visibility chip, backlinks, frontmatter/object form |
| `/knowledge/graph` | Page | Graph exploration and link health | Graph canvas, filter sidebar, legend, accessible node list, graph health, link repair |
| `/settings` | Page | Global configuration | Preferences, theme/density, vault/storage, sync, sources, AI/MCP, permissions diagnostics, accessibility, diagnostics |
| `/settings/sync` | Page | Sync and offline reliability | Sync status panel, queued changes, conflicts, cloud consent, authorization, asset-missing state |
| `/settings/ai` | Page | AI/MCP configuration | Global AI toggle, tool configuration, policy modes, agent attachments, local capability detection |
| `/join/:inviteId` | Standalone flow | Player invite/join path | Authentication or identity step, role-safe session landing, player first-value flow |

### 4.3 Routes that should not become global nav items

These routes or views are important, but should be reached through local navigation, command
palette, contextual links, or status badges:

- Graph and saved searches: Knowledge-local.
- Search: shell overlay plus Knowledge-local deeper view.
- Dice tray: Session-local tool and Command Center widget.
- Audio: Command Center widget, Session-local tool, scene/map association, Settings asset/config.
- AI/MCP: editor inline, staged review panel, Settings config.
- Sync status: top bar badge opens quick status; full details live in Settings.
- Player screen/projection: Command Center and Session collaboration controls.
- Timeline/calendar: Campaign and Session local surfaces, not a separate global destination.
- Scene list: local to Command Center/Session/Campaign depending future IA; individual Scenes are
  deep-linkable pages.

---

## 5. Page vs Overlay Contract

### 5.1 Use a page when

Create or retain a route when the user is entering a durable workspace:

- The state should survive reload, deep-link, back/forward, or handoff to another device.
- The task has more than one major region or a long-running context.
- The route is a primary object view: note, character, map, scene, session, campaign entity.
- The user may stay there for minutes.
- Browser history should represent arrival and departure.

Examples:

- Command Center.
- Full map viewer/editor.
- Character sheet and character creation draft.
- Note editor/viewer.
- Scene workspace.
- Active session and focused combat tracker.
- Campaign object detail.
- Settings, Sync Status, AI/MCP configuration.

### 5.2 Use a panel, drawer, or sheet when

Use an adjacent or sliding surface when the user needs substantial controls but should keep their
current object visible:

- Widget library.
- Scene Outline.
- Map Summary.
- Layer panel on narrower map profiles.
- Participant roster.
- Player-view controller on narrower profiles.
- Track library.
- Quick Reference.
- Properties/frontmatter/object metadata.
- Conflict resolution for the current entity.
- Mobile local navigation browse sheets.

Desktop should prefer side panels and drawers. Mobile should prefer bottom or full-screen sheets.

### 5.3 Use a modal dialog when

Use a modal only for bounded, interruptive decisions that require completion, cancellation, or
explicit review before returning:

- Destructive confirmation.
- Handout push confirmation.
- Visibility restriction confirmation.
- Import/export final preview and commit.
- Level-up/advancement review.
- Permission grant review.
- First-run wizard, if the app cannot safely continue without minimal setup.

Modals must trap focus, return focus to the trigger, close with Escape where safe, and never leak
DM-only content through labels or hidden text.

### 5.4 Use a popover or menu when

Use lightweight overlays for localized choices:

- Condition typeahead.
- Slash-command insert menu.
- Wikilink autocomplete.
- Source/provenance details.
- Visibility chip details.
- Row action menu.
- Filter chip menu.
- Small date picker.
- Tooltip for icon-only rail states.

Popovers must not become hidden full workflows. If the user needs to review or edit multiple fields,
promote the interaction to a panel or route.

### 5.5 Use toasts and banners when

Use toasts for short action feedback:

- Saved.
- Queued.
- Roll sent.
- Handout pushed.
- Widget added.
- Undo available.

Use banners for persistent state:

- Offline.
- Sync degraded.
- Preview as player.
- Level-up pending DM confirmation.
- Conflict requires resolution.
- AI disabled or unavailable.

Errors and warnings must not rely only on auto-dismissing toasts. They need a durable route, panel,
banner, or inline state with retry/recovery when user action is required.

---

## 6. Major Component Map

### 6.1 Global shell components

These are available in the app shell, subject to role and profile:

- **Primary nav**: seven recommended global destinations, actor-filtered.
- **Top bar**: route title, back/forward, local/contextual panel toggles, command palette trigger,
  sync badge, MCP pending badge, help trigger, compact overflow.
- **Command palette**: navigation, commands, quick switcher, search entry, shortcut hints.
- **Help system**: persistent "?" trigger, keyboard shortcuts modal, contextual help panel,
  What's New panel.
- **Status and trust indicators**: sync/offline, staged changes, save state, cloud consent, local
  capability degradation.
- **Presence strip**: visible during collaborative/session contexts, expandable to roster.

The shell is not where content creation and section-specific controls live.

### 6.2 Command Center

The Command Center is the application home and the DM's live dashboard. It should be a populated
Scene, never a blank canvas.

Primary components:

- Scene/canvas host.
- Session status strip.
- Player-View Controller.
- Active map embed with DM/player projection controls.
- Combat tracker widget.
- Dice tools widget.
- Timer widget.
- Audio Controls widget.
- Quick Reference widget.
- Party/character vitals widget.
- Handout push flow.
- Widget library quick-access drawer.
- Layout presets and recovery.

Player and observer versions should be role-differentiated, not merely hidden versions of the DM
dashboard. Players should see only their character, shared canvas/map, handouts, player-safe combat
state, and device-local controls.

### 6.3 Scene and widget system

Scenes are the reusable spatial primitive. They appear as:

- Command Center home.
- Saved Scene route.
- Player-view canvas.
- Embedded scene/map regions where supported.

Shared components:

- Canvas viewport: pan, zoom, zoom-to-fit, minimap.
- Widget library and insert flow.
- Widget chrome: title, icon, visibility badge, binding indicator, lock, handles.
- Selection toolbar and context menu.
- Grid, snap, guides, z-order, grouping.
- Binding management panel.
- Scene Outline for keyboard and screen-reader access.
- Undo/redo separated from widget content undo.
- Template save/apply flow.
- DM view/player view affordance and preview.

The canvas must not be mode-heavy. Moving, resizing, selecting, and panning should feel direct, with
keyboard, menu, and numeric alternatives for every drag or gesture.

### 6.4 Atlas and maps

Atlas owns spatial map surfaces.

Primary page components:

- Map library and create/import/generate entry points.
- Full map viewer/editor.
- Layer panel with layer rows, visibility, opacity, tags, and type badges.
- Minimap and map hierarchy breadcrumbs.
- POIs, routes, measurement, deep links.
- Fog-of-war controls.
- DM-only annotations and player-visible overlays as separate concepts.
- Combat overlay.
- Map Summary panel for accessible non-visual access.
- Pre-projection consistency report.
- Map widget embed controls for Scenes.

Map authoring tools should avoid blocking modal tool dialogs. The map remains visible; tool palettes,
panels, and inspectors do the work.

### 6.5 Characters

Characters are a primary suite, not buried campaign objects.

Primary page components:

- Roster and party overview.
- DM quick-create panel.
- Player character creation wizard.
- Character sheet with persistent vitals bar.
- Combat tab default on mobile.
- HP delta stepper.
- Death saves, conditions, concentration.
- Spell slots and class-resource pips.
- Inline edit mode.
- Level-up/advancement modal or drawer.
- Collaborative editing attribution.
- Character journal.
- Data exposure/binding path browser for widgets.
- Draft ownership management for DMs.

Character pages should make HP, AC, conditions, and ownership state more visually prominent than
long-form backstory or equipment details during live play.

### 6.6 Session

Session owns active table operation.

Primary components:

- Session lifecycle controls.
- Recovery prompt.
- Initiative tracker.
- Current-turn emphasis.
- Advance/previous turn controls.
- HP editing and undo.
- Conditions, concentration, death saves.
- Add/remove/reorder combatants, including hidden and mass combatants.
- Encounter builder.
- Dice expression input and roll history.
- Roll visibility and private/shared indicators.
- Timer widget.
- Quick Reference.
- Prep and Recap digest.
- Campaign calendar continuity.
- Player-visible combat tracker.
- Async action pending/retry/undo model.

The Command Center should host the common Session tools as widgets. The Session route should provide
focused, durable views when the DM needs more space or historical/session-management context.

### 6.7 Knowledge and content authoring

Knowledge owns authored notes, source-specific content, templates, snippets, graph, and search depth.

Primary components:

- Note list, folder/source local navigation, recent/pinned items.
- Note editor and viewer.
- Markdown toolbar with overflow.
- Slash-command insert menu.
- Autosave status chip.
- Split preview with synced scroll.
- Wikilink autocomplete and unresolved-link states.
- Focus writing mode.
- Frontmatter and structured Vault Object form.
- Wikilink rename/disambiguation/backlinks.
- Template and snippet libraries.
- Source-of-truth badge.
- Pre-write source constraint panel.
- Import/export wizards with preview and validation reports.
- Visibility authoring.
- Embed authoring.
- Calendar-date picker.

The writing area should dominate visually. Source, save, visibility, and provenance states must stay
visible but calm.

### 6.8 Campaign

Campaign owns long-running narrative structure and world model objects.

Primary components:

- Campaign overview.
- Arcs, quests, factions, locations, NPCs, items, timeline events, and relationships.
- Timeline and calendar continuity.
- Entity detail pages.
- Related links into Knowledge, Atlas, Session, and Characters.
- Contextual graph/backlinks for object relationships.
- Visibility controls and permission summaries on entities.

The Campaign section should avoid duplicating Knowledge. Notes remain authored documents; campaign
entities are structured world model objects that can link to notes and appear as widgets.

### 6.9 Graph and discovery

Graph and discovery are navigation aids, not decorative visuals.

Primary components:

- Graph canvas with readable level-of-detail behavior.
- Interactive legend.
- Filter sidebar.
- Local graph mode.
- Clustering above large visible node counts.
- Accessible node list.
- Graph health indicators.
- Mobile slim backlinks surface.
- Link-repair picker.
- Global search overlay.
- Search result rows with title, context, type, source, and why-it-matched.
- Filter chips and saved searches.
- Recent/suggested pre-query state.
- Index freshness indicators.

The graph should only ship when it remains readable and useful. A hairball graph is worse than no
graph.

### 6.10 Collaboration and permissions

Collaboration and permissions are cross-cutting. They appear in the shell, Command Center, Session,
content toolbars, canvas inspectors, and Settings.

Primary components:

- Presence strip.
- Participant roster panel.
- Join/invite/leave flows.
- Handout delivery panel with Sent/Open states and revocation.
- Shared combat visibility overlay.
- Session connection degradation banner.
- Player-view controller.
- Player groups.
- Reconnect/catch-up feedback.
- Inline visibility three-state control.
- Capability-set grant dialog.
- Active grants and revocation.
- Player-facing "Your permissions" panel.
- DM permission diagnostics.
- Preview as player/observer mode.
- Ambient visibility badges on content.
- Cache purge and privacy status.

Visibility and permission must remain separate in the UI. Visibility controls answer "can players
see it?" Permission grants answer "can this person interact with it?"

### 6.11 Sync and offline reliability

Sync state is global, but details live in Settings or an entity-local conflict surface.

Primary components:

- Global sync status indicator in the top bar.
- Per-entity sync badges on notes, widgets, maps, characters, and assets.
- Offline persistent banner.
- Queued changes view.
- Sync Status page/panel.
- Conflict resolution surface.
- Retry and recovery states.
- Optimistic local-first write acknowledgement.
- Asset-missing degraded state.
- Cloud storage consent and classification.
- Trust signals such as last-synced timestamp.
- First-time authorization flow.

The app should never block core local work on sync. Sync issues must be explicit, recoverable, and
non-alarming unless data loss is possible.

### 6.12 Audio and atmosphere

Audio should be a live-play capability surfaced where the DM already is.

Primary components:

- Audio Controls widget in Command Center.
- Now-playing card.
- Transport controls.
- Channel mixer: ambience, music, SFX.
- Scene-linked and map-linked audio presets.
- Soundboard pad grid.
- Crossfade and scene transition controls.
- Track library and playlist drawer.
- "What players hear" indicator.
- Autoplay policy handling.
- Asset management and missing-asset states.
- Automation tied to session events.
- Player device-local consent, mute, and volume controls.
- Mobile background playback declaration and degradation.

Audio state belongs in the session context. Audio configuration and asset management can be reached
from the widget, Session local nav, or Settings, but should not compete as a global section.

### 6.13 AI and MCP

AI/MCP should feel optional, bounded, and reviewable.

Primary components:

- Global AI enable/disable toggle.
- Inline AI writing suggestion panel.
- Named-entity extraction chips.
- Tool configuration panel in Settings.
- AI agent attachment flow.
- Provenance badge and details popover.
- Staged-write review panel.
- Streaming output and stop control.
- Policy mode labels.
- Actor and visibility boundary enforcement.
- Local capability detection and fallback.

AI should never auto-apply durable edits. Write tools default to staged review. If AI is disabled,
the app remains fully functional and the UI degrades cleanly.

### 6.14 Onboarding and learnability

Onboarding should teach through real surfaces, not pre-value tours.

Primary components:

- Minimal, skippable, resumable first-run wizard.
- Vault naming, content source, starter preset, role declaration, invite players.
- Distinct DM and Player first-value paths.
- Empty states for Command Center, Canvas, Maps, Characters, Knowledge, Graph, and Sessions.
- Contextual coach marks triggered by behavior, capped per session.
- Persistent help entry.
- Keyboard shortcut cheat sheet.
- Contextual help panel and help center.
- Feature-tier control for progressive disclosure.
- Demo/sample content offer.
- What's New panel.

The first real screen should be useful immediately. New DMs should land on a populated Command
Center or clear starter choice. Players should bypass DM setup entirely.

---

## 7. Cross-surface Interaction Rules

### 7.1 Actor filtering and leak prevention

Every route, widget, menu, search result, graph node, command palette action, ARIA label, live
region, error state, skeleton, and deep-link fallback must be produced from actor-filtered data.

Player-safe denial should say that the destination is unavailable, not that a hidden object exists.
Hidden content should be absent from the DOM for players, not merely disabled or visually hidden.

### 7.2 Command parity

Every Must-have action should be reachable through:

- The natural surface control.
- Command palette or command menu.
- Keyboard where a hardware keyboard exists.
- Touch-friendly sheet/menu alternative on tablet and mobile.

The command should be the same processing-core command regardless of entry point.

### 7.3 Feedback, undo, and recovery

All interactive actions need immediate acknowledgement within the UX target:

- Optimistic local change where safe.
- Pending state for async work.
- Success state or toast.
- Undo when reversible.
- Retry when failed.
- Durable panel/banner when the problem needs user attention.

Destructive, revealing, write-back, import/export, permission, and AI staged-write actions need
review before commit.

### 7.4 Accessibility as baseline

The architecture must reserve explicit access paths:

- Scene Outline for canvas objects.
- Map Summary for spatial maps.
- Node list for graph.
- Landmark and heading structure per route.
- Focus trapping/restoration for all dialogs and sheets.
- Reduced-motion state applied everywhere.
- Touch target minimums by profile.
- Non-color state encoding for visibility, status, graph nodes, fog, sync, and combat.

### 7.5 Progressive disclosure

Default surfaces should be simple and useful:

- Primary nav stays stable.
- Advanced tools live in local panels, drawers, More sheets, command palette, or feature-tier
  settings.
- Empty states teach the first action.
- Demo content is available but clearly labeled and removable.
- Returning users and mature vaults can reveal denser controls.

---

## 8. Visual Theme and Emphasis

### 8.1 Overall theme

The visual direction should be premium, warm, dark-first, and genre-appropriate:

- Tavern/dark warm should be the default mood when system preference allows.
- Parchment/light and high-contrast variants must be equally functional.
- Inter-style readable UI typography should carry almost all work.
- Display serif styling should be reserved for large headings and atmospheric accents.
- Lucide-style icons should be consistent.
- Semantic tokens own color, spacing, motion, radius, elevation, and density.
- Chrome should recede behind content and live-play state.

The product should not look like a generic admin dashboard, but it also should not use heavy
texture, novelty fonts, or decorative theming that harms legibility.

### 8.2 Emphasis hierarchy

Each region gets one primary focus:

- Command Center: active session/player-view state.
- Session/combat: current turn, HP, next action.
- Character sheet: HP/AC/conditions and ownership state.
- Map: map content, active tool, layer/visibility state.
- Knowledge editor: writing area and save/source/visibility status.
- Graph/search: selected result/node and active scope.
- Settings: current configuration category and current risk/status.

Color should communicate state and severity, not decorate every component. Use scale, weight,
spacing, border, position, and persistent placement for hierarchy.

---

## 9. Tooling and Architectural Constraints

The GUI plan should fit the v2 stack and repo practices:

- SvelteKit/Svelte 5 app owns rendering, route surfaces, accessibility announcements, platform
  profile behavior, and command dispatch wiring.
- The v2 Processing Core owns commands, reducers, permissions, actor-filtered queries, operation
  shape, and deterministic domain behavior.
- UI surfaces should dispatch commands and render query results, not mutate durable state directly.
- Tailwind 4 and CSS custom properties are the styling delivery mechanism; components consume
  semantic tokens.
- Lucide is the icon vocabulary.
- CodeMirror powers heavy markdown editing and should remain lazy-loaded around editor routes.
- Search and graph should use deterministic local indexes and workers/lazy loading as needed; AI
  must not silently override deterministic ranking.
- Dexie/IndexedDB is the browser-first local persistence path for v2 app prototypes.
- Electron, Capacitor, and PWA shells may differ in storage and platform capabilities, but not in
  command outcomes.
- Playwright and axe should validate primary routes, compact/expanded profiles, accessibility, and
  no-leak player views.
- Navigation and token linting are part of the design contract, not just code style.

---

## 10. Development Sequencing Guidance

### 10.1 Resolve before broad route work

> **Status (UX-ARCH).** All six items below are now resolved or deferred-with-constraint in
> `../../planning/v2/ux/architecture-decisions.md`: (1) seven-section global nav — accepted;
> (2) Scene name — accepted; (3) canvas renderer — deferred (interim DOM baseline per ADR-014);
> (4) player-view preview — deferred (interim actor-filtered re-render constraint); (5) layout-preset
> storage — accepted proportional; (6) interim sync/collab states — deferred per ADR-014 with
> explicit "not enabled in this build" affordances.

1. **Global nav reconciliation**: decide whether the ideal global nav is seven destinations or the
   UX-NAV nine-section registry. Update all affected docs and lint contracts before scaffolding.
2. **Scene naming**: choose the product label for the canvas primitive or accept "Scene" for v2.
3. **Canvas rendering strategy**: DOM-positioned, WebGL/canvas-backed, or staged hybrid. This affects
   maps, widgets, performance, Scene Outline, and player-view preview.
4. **Player-view preview mechanism**: second live render context vs snapshot/thumbnail approach.
5. **Layout preset storage**: proportional vs absolute coordinates for cross-profile layouts.
6. **Sync/collaboration interim states**: define what deferred cloud/live transport features show in
   the first build so surfaces do not look broken.

### 10.2 First interface slice

Build the shell and Command Center skeleton first:

- Primary nav, top bar, command palette trigger, help trigger, sync/offline placeholder, and role
  state.
- Command Center route as home.
- Scene host with populated starter layout.
- Widget chrome and widget library drawer.
- Scene Outline placeholder.
- Empty state/demo content path.
- Accessibility landmarks and focus behavior.

This proves the paradigm before deeper feature pages compete for attention.

### 10.3 Second slice

Add durable section roots with honest empty states:

- Session root with lifecycle and combat placeholder.
- Characters root with roster and quick-create.
- Atlas root with map list and create/import/generate entry points.
- Knowledge root with note list/editor shell.
- Campaign root with object/timeline framing.
- Settings root with preferences, sync, and AI/MCP categories.

The goal is not feature depth yet. The goal is a stable IA and predictable shell.

### 10.4 Third slice

Deepen live-play and safety-critical flows:

- Combat tracker hot path.
- Player-view controller and preview.
- Visibility controls and permission grant dialog.
- Map projection consistency.
- Handout push/revoke.
- Sync/offline badges and conflict shape.
- Player-safe route/search/ARIA test coverage.

These flows define trust. They should ship before broad authoring power.

### 10.5 Fourth slice

Deepen authoring and discovery:

- Note editor, templates, snippets, source badges, import/export preview.
- Full character sheet and creation wizard.
- Map editor, layers, fog, POIs, nested map wayfinding.
- Graph, saved searches, link repair.
- AI inline suggestions and staged-write review.
- Audio library, soundboard, scene-linked presets.

Each should integrate into Command Center and Scenes through widgets as soon as the route surface is
usable.

---

## 11. Open Decisions and Risks

| Decision / risk | Why it matters | Recommended handling |
|---|---|---|
| Global nav count conflict | UX-NAV says nine sections; architecture says five to seven | Resolve explicitly before route work; recommended seven-section nav with Audio/MCP as capabilities |
| Scene name | Every doc and route may inherit the term | Pick before final IA copy, or treat "Scene" as accepted for v2 |
| Player-view preview | Trust depends on accurate preview | Spike early and decide before Command Center final layout |
| Canvas rendering engine | Affects maps, widgets, performance, accessibility, and mobile | Decide after a focused prototype, not after section pages are built |
| Mobile command access | No hardware shortcut on touch-only devices | Reserve visible command/menu entry in compact top/bottom chrome |
| DM/player leakage | Highest safety risk | Build actor-filtered test fixtures and axe/player-view checks early |
| Feature overload | V2 surface area is large | Use seven global destinations, progressive disclosure, and role-specific empty states |
| AI trust | AI can damage confidence if it feels autonomous | Keep AI optional, staged, provenance-tagged, and secondary |
| Sync anxiety | Users need confidence local work is safe | Keep local-first action feedback immediate; show sync as status, not blocker |
| Audio/mobile platform limits | Autoplay/background policies can look like bugs | Show explicit player/device state and fallback affordances |

---

## 12. Ideal First Impression

A new DM opens DND Tools and sees a warm, calm Command Center with useful starter widgets already
placed: current session, quick reference, party, map, dice, audio, and player-view controls. The
sidebar/bottom nav makes the major areas obvious. The top bar shows command palette, help, sync
state, and route context without crowding the table.

The DM can start a session, add a character, open a map, create a note, push a handout, and preview
what players see without leaving the mental model of "I am running the table." When they need depth,
the section pages are one action away. When they need speed, the command palette is one action away.
When they use a smaller device, the same capabilities become focused panes and sheets rather than a
shrunk desktop dashboard.

That is the GUI architecture the rest of v2 should work toward.
