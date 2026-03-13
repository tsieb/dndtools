# Initiative 13 — Information Architecture & Navigation System Overhaul

## Status: COMPLETED

**Outcome:** Every user — from first-timer to veteran DM — can find what they need in
under two seconds, understands where they are in the application at a glance, and never
mistakes a navigation control for a content control. The application has exactly one way
to do each navigation action, and every redundancy has been eliminated.

**Why this comes first among UX initiatives:** Navigation is the skeleton of the
application. Every other UX improvement — adaptive layouts, design systems, session
tools — is built on top of the navigation structure. Refactoring the IA after adding
visual polish wastes effort and produces dissonance. The research is clear: fixing the
wrong taxonomy with better visual design does not improve findability; fixing the taxonomy
does.

**Root-cause diagnosis of current state:**

The current sidebar is a monolithic scroll container that simultaneously handles global
navigation (where am I in the app?), local browsing (what note am I looking at?), live
session widgets (threads, calendar, session context), and action shortcuts (New Note,
From Template, Dice Tray). These are four distinct concerns mixed without hierarchy. The
TopBar compounds this: it contains fifteen or more distinct controls in a 52px bar,
including system status indicators, mode toggles, duplicate actions (dice, settings),
navigation controls, and window chrome — all without clear grouping or priority. The
result is an interface that demands the user learn a unique spatial layout rather than
applying any transferable mental model.

The three-layer navigation model — global (stable primary sections), local (within a
section), contextual (object to object) — is the standard architectural solution for
applications of this complexity and is endorsed by all major platform design systems. It
does not exist in the current implementation.

---

## Epic 13.1 — IA Audit, North-Star Definition & Route Architecture

**Goal:** Establish the authoritative information architecture: a documented north-star
that every navigation decision references, with a validated primary taxonomy, a clean
URL structure, and clearly classified content types.

**Stories:**

- **S13.1.1 — Content taxonomy and primary section definition**
  Document the complete content model in `docs/architecture/INFORMATION_ARCHITECTURE.md`:
  every content type (note, folder, object/entity, map, session board, encounter, table,
  handout, template) and every tool (combat tracker, dice tray, timeline, graph, search,
  command palette). Derive the minimum viable set of primary sections from user primary
  tasks: `Knowledge` (notes, worldbuilding, lore), `Atlas` (maps, spatial), `Session`
  (live session, dice, combat, boards), `Campaign` (entities, quests, timeline),
  `Settings` (configuration). Limit to five. Document rationale for each boundary
  decision. This document is the single source of truth that all navigation epics
  reference.

- **S13.1.2 — Navigation redundancy inventory and elimination plan**
  Audit every entry point in the current application: sidebar nav links, sidebar action
  buttons, topbar buttons, sidebar widget links (Open Threads "Open timeline view"),
  sidebar footer links, and in-page navigation anchors. Produce a table: entry point,
  what it does, classification (global / local / contextual / action / utility), and
  the verdict (keep as-is / move / consolidate / remove). Dice Tray appears in three
  locations; Settings appears in two — every such redundancy must have a single resolved
  location. Output: an elimination decision log committed with the IA document.

- **S13.1.3 — Three-layer navigation contract specification**
  Write the navigation contract as a testable specification in
  `docs/architecture/NAVIGATION_CONTRACT.md`. Define: what qualifies as global nav
  (stable across all routes, always visible, 5–7 maximum destinations), local nav
  (within-section structure, visible only in the relevant section, can filter/browse
  content), and contextual nav (object-to-object links, breadcrumbs, related content,
  visible inline in content areas). Every new navigation element added to the codebase
  must be classified in one of these three layers before implementation. Add a CI lint
  check that flags nav-like elements (role="navigation", `<nav>`) without an
  `aria-label` specifying which layer they belong to.

- **S13.1.4 — URL structure redesign and breadcrumb metadata**
  Redesign the route hierarchy to reflect the IA. Proposed structure:
  `/knowledge/*` (notes, search, graph), `/atlas/*` (maps), `/session/*` (boards,
  combat, encounter), `/campaign/*` (timeline, entities), `/settings/*`. Redirect old
  routes. Add breadcrumb metadata to SvelteKit route `+page.ts` files: each route
  exports a `breadcrumb` array that the layout uses to render the path. Ensure browser
  back/forward integrates correctly with all route transitions — every user navigation
  action pushes to the history stack exactly once.

---

## Epic 13.2 — Global Navigation Layer Reconstruction

**Goal:** The five primary sections are always accessible, clearly identified, and
visually separated from local and contextual navigation. The current route is
unambiguous. There are no duplicate global navigation entry points.

**Stories:**

- **S13.2.1 — Primary section icons and identity**
  Design a distinct icon and label for each of the five primary sections. Icons must be
  recognizable at 20px (rail collapsed) and 28px (rail expanded). Icon choices must be
  specific enough that no two sections could be confused (no two section icons from the
  same semantic category). Commission or source TTRPG-appropriate icons for domain
  concepts (session, atlas/maps, campaign) from the chosen icon library
  (see I15-design-system). Write the iconography specification document.

- **S13.2.2 — Global navigation component**
  Build a `PrimaryNav` component that renders the five section links. On desktop
  (Expanded layout): renders as a vertical rail (icon + label, 200px wide, or icon-only
  60px when collapsed). On mobile (Compact layout): renders as a bottom navigation bar.
  On tablet (Medium layout): renders as a vertical icon rail without labels (60px).
  Active section is indicated by a filled accent background on the icon, not just a
  color change. Inactive sections use muted icon + label. The component has no other
  content — no action buttons, no widgets, no status.

- **S13.2.3 — TopBar scope reduction and responsibility charter**
  Reduce TopBar to exactly: (1) sidebar toggle for local nav panel, (2) back/forward
  navigation, (3) breadcrumb or page title, (4) command palette trigger, (5) a compact
  utility cluster (health badge, MCP changes badge). All other current TopBar content
  is removed: the DM/Player mode toggle moves to the sidebar footer, the duplicate
  settings icon is removed, the duplicate dice button is removed, the refresh button is
  removed (vault refreshes automatically on filesystem change). The utility cluster is
  right-aligned and contains at most four icon-size elements. Document the TopBar
  responsibility charter: what belongs here and why, and what is explicitly excluded.

- **S13.2.4 — Active route and section state system**
  Implement a centralised `activeSection` and `activeRoute` reactive state. Every
  navigation surface (primary nav, local nav panels, breadcrumbs) derives its active
  display from this state. Active section indicator on the primary nav is the filled
  accent icon — it uses a CSS custom property so it can be animated without JavaScript.
  The active note in the local nav panel shows an accent-left-border indicator. No
  navigation surface uses color as the only active indicator — icon fill + border
  change together.

- **S13.2.5 — DM/Player persona switch**
  Redesign the DM/Player mode toggle from a button in the TopBar to a persona switcher
  in the sidebar footer. The switcher shows two pill options: "DM" and "Player", with
  the active one filled and the inactive one outlined. When Player mode is active, a
  persistent visual signal appears throughout the UI: a green accent bar at the top of
  the primary nav rail, and the sidebar shows a "Player Mode Active" banner in place of
  the DM-only content. Removing the toggle from the TopBar eliminates the confusion
  between "Player View" (a route) and "Player Mode" (a filter state) — the route is
  renamed to "Player Screen" to make the distinction explicit.

---

## Epic 13.3 — Local Navigation: Section Panels and Contextual Browse

**Goal:** Within each primary section, the local navigation panel shows only content
relevant to that section, organised in collapsible named panels that the user can
arrange. The sidebar no longer shows all content simultaneously.

**Stories:**

- **S13.3.1 — Section panel architecture**
  Replace the current monolithic sidebar scroll container with a section panel
  architecture. Each primary section defines its own local navigation panel content:
  `Knowledge` shows [Folder Tree | Map Hierarchy toggle], [Pinned], [Tags]; `Atlas`
  shows [Map Hierarchy]; `Session` shows [Active Board, Initiative Status]; `Campaign`
  shows [Entities, Open Threads, Timeline events]; `Settings` has no local nav panel.
  Each panel is defined as a Svelte component exported from the section's UI module.
  The sidebar host renders the active section's panel.

- **S13.3.2 — Collapsible panel sections with persistence**
  Within the local nav panel, named sections (e.g. "Pinned Notes", "Tags", "Open
  Threads") are independently collapsible with a caret/chevron toggle. The collapse
  state of each section is persisted in `localStorage` under a namespaced key per
  section. On first open of a section, the default collapsed/expanded state follows a
  prescribed default: Folder Tree expanded, Tags collapsed, Collections collapsed. This
  prevents overwhelming new users while giving experts control.

- **S13.3.3 — Knowledge section local navigation**
  The Knowledge section panel has three sub-modes accessible via icon tabs at the top
  of the panel (not a 2x2 grid): Browse (folder tree, the default), Recent (recently
  visited + recently updated), Saved (pinned notes + saved searches). The icon tabs
  are `role="tablist"` with `role="tab"` and `aria-selected`. The folder tree
  implements the WAI-ARIA tree view pattern: `role="tree"`, `role="treeitem"`,
  `aria-expanded` on folders with children, keyboard navigation with arrow keys. Folder
  nodes without notes are shown at reduced opacity. The folder/map hierarchy toggle
  moves inside the Browse tab — it is a local control, not a section-level mode.

- **S13.3.4 — Contextual Quick Access: Pinned and Recent**
  "Pinned" notes and entities are surfaced in the local nav panel of whichever section
  owns them (pinned notes in Knowledge, pinned entities in Campaign). "Recent" shows
  the last 10 visited items across all types, with a type icon to distinguish note vs
  entity vs map. Removing these from the sidebar header (where three action buttons
  currently crowd them) makes room for a proper panel structure.

- **S13.3.5 — Collections and saved searches in Knowledge panel**
  Move Collections/Saved Searches from their current buried sidebar section into the
  Knowledge panel's Saved tab. Saved searches are displayed as filter pills (not a flat
  text list) showing the search scope and query. Smart collections (auto-generated) are
  distinguished from user-saved searches by an icon prefix. The "Save search to
  collections" UX flow is redesigned: after any search, a "Save" icon appears in the
  search bar to save the current query directly.

- **S13.3.6 — Session section local navigation**
  The Session panel shows: active session board quick summary (scene name, board tile
  count), initiative tracker status (round number, active combatant if in combat), and
  quick dice access (d4–d100 icon buttons, always visible). During active session, this
  panel is the DM's at-a-glance status. When no session is active, the panel shows the
  "Start Session" call to action and the most recent session board for quick resume.

---

## Epic 13.4 — Contextual Navigation: Breadcrumbs, Backlinks, Deep Links

**Goal:** Users always know where they are, can navigate up the hierarchy with one click,
and can follow meaningful connections between content without losing their place.

**Stories:**

- **S13.4.1 — Breadcrumb component and system**
  Build a `Breadcrumb` component using proper HTML: `<nav aria-label="Breadcrumb">` +
  `<ol>` + `<li>` + `<a>` elements, with `aria-current="page"` on the current item.
  The component reads from the route's exported breadcrumb metadata (S13.1.4). Every
  content page (note detail, map view, entity page, session board) shows a breadcrumb
  below the TopBar. The breadcrumb includes the primary section, any intermediary
  grouping (folder, map), and the current item. Breadcrumbs are truncated intelligently
  on narrow viewports: the middle items collapse into a `...` with a dropdown to reveal
  the full path.

- **S13.4.2 — Note backlinks as contextual navigation**
  The existing backlinks feature shows a list of note IDs. Redesign as a Contextual
  Navigation panel: "Referenced by (N)" with a structured list showing note title, its
  folder path as a breadcrumb, and a short excerpt of the surrounding context where the
  wikilink appears. This panel appears in the right-side detail panel on desktop or as
  a collapsible section below the note content on narrow viewports. Backlinks are not
  buried under metadata — they are primary contextual navigation.

- **S13.4.3 — Related content cross-section links**
  Notes, entities, maps, and timeline events must expose their cross-section
  relationships as contextual navigation:
  - A note tagged as an NPC shows a "View entity" link to the Campaign section.
  - An entity linked to a map location shows a "View on Atlas" link.
  - A session board references its source notes with "View in Knowledge" links.
    These cross-links are surfaced in the right detail panel and in object metadata, not
    buried in the raw markdown.

- **S13.4.4 — Back/forward history state preservation**
  The current back/forward navigation uses `window.history` but the history label
  shown in the tooltip is computed inconsistently. Redesign: every SvelteKit navigation
  call passes a `state.label` that is the human-readable title of the destination (note
  title, section name, etc.). The TopBar back button tooltip shows "Back to [label]".
  Forward is symmetric. Navigation history is cleared when the vault changes (vault
  switch or vault repair). The back button is never enabled on the section root pages —
  it only enables when the user has navigated within a section.

---

## Epic 13.5 — Command Palette and Search as Primary Navigation

**Goal:** The command palette is the fastest path to any note, any action, and any
section of the application for keyboard-proficient users. Search is scoped, labelled,
and returns results with enough context to distinguish similar notes.

**Stories:**

- **S13.5.1 — Command palette replacing the search overlay**
  Replace the current "Quick search (Ctrl+P)" overlay with a full command palette.
  The palette has two modes, toggled by the input prefix:
  - Default (no prefix): Navigate to notes — type to search note titles and content.
  - `>` prefix: Execute commands — "Create note", "Switch to Session mode", "Open
    settings → Vault", "Toggle dark mode", "Roll 1d20", etc.
  - `#` prefix: Filter by tag.
  - `/` prefix: Navigate to a section or route.
    Results are grouped by type (Notes, Commands, Sections). Keyboard navigation with
    arrow keys, Enter to activate, Escape to close. The palette is `role="combobox"` with
    a `role="listbox"` for results.

- **S13.5.2 — Search scope communication and control**
  Whenever the command palette or the search page is active, the current scope is
  displayed prominently: "Searching all notes" vs "Searching in /locations" vs
  "Searching NPCs only". Scope can be changed inline with a scope selector (dropdown
  or pill set). The scope is preserved when navigating back to search. Scope changes are
  reflected in the URL query string so they can be shared or bookmarked.

- **S13.5.3 — Search results with hierarchy context**
  Each search result shows: note title (with query match highlighted), folder path
  breadcrumb, note type icon, primary tags (up to 3), and last-modified date. Two notes
  with similar titles are distinguishable at a glance. Results are grouped by section if
  scope is "all" and multiple sections return results. Group headers collapse
  individually.

- **S13.5.4 — Command palette keyboard completeness**
  All keyboard interactions in the command palette must be tested: Up/Down arrow moves
  selection (wrapping at ends), Enter activates the selected result, Escape closes and
  returns focus to the trigger element, Tab cycles through scope selectors without
  closing, Shift+Tab reverses Tab cycle. The palette is the primary entry point for
  keyboard users who know what they want — it must be flawless.
