# UX Requirements — Navigation & Platform Profiles

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read `00-overview-and-principles.md`
> first — it defines the shared principles, the parameter rubric, the requirement-ID scheme, the
> platform profiles, and the design tokens this document builds on.
>
> **Status:** Draft v1
> **Functional requirement coverage:** `NAV-001..010`, `PLAT-001..018`
> **Owner surface(s):** Global navigation shell (sidebar/rail/tab-bar), route landmarks, breadcrumbs,
> backlinks panel, pinned/recent strip, command palette, keyboard/input-modality layer, actor-filtered
> nav API, back/forward semantics, deep-link resolution, hash-anchor focus, scroll restoration.

---

## 1. Scope

- **Covers:** Every navigation surface that is shared across all sections — the global nav shell per
  platform profile, the three-tier nav hierarchy (global / local / contextual), the command palette
  as a navigation surface, keyboard navigation model and input-modality handling, breadcrumbs,
  backlinks-as-navigation, pinned/recent items, back/forward and browser history semantics,
  deep-link resolution, hash-to-heading focus, scroll restoration, route landmarks, single `h1` per
  route, live route announcement, and actor-filtered navigation (hiding DM-only sections from players
  without leaking). The Navigation Section registry (Command Center, Knowledge, Atlas, Session,
  Campaign, Characters, Audio, MCP, Settings) is authoritatively defined here.
- **Does NOT cover:** The visual design token definitions (owned by `01-visual-design-system.md`);
  the canvas/Scene widget placement system (owned by `04-canvas-scene-widgets.md`); the Command
  Center surface itself beyond how it anchors as home in the nav shell (owned by
  `05-command-center.md`); full search-result UX within the command palette (cross-link:
  `10-graph-search-discovery.md`); per-section local navigation contracts beyond their definition
  here (each section's UX doc owns its local nav); onboarding flows beyond empty-state nav cues
  (owned by `15-onboarding-learnability.md`); permission grant UI (owned by
  `11-collaboration-permissions.md`).
- **Related functional requirements:**
  - `NAV-001` — Command Center as home; canonical Navigation Section routing; actor-filtered primary nav.
  - `NAV-002` — Legacy route aliases; search-parameter + hash preservation on redirect.
  - `NAV-003` — Three-tier nav, backlinks, breadcrumbs, pinned/recent, command palette; coherent route state.
  - `NAV-004` — Back/forward, hash-anchor focus, scroll position, route-landmark focus on plain transitions.
  - `NAV-005` — Deep links that restore entity, viewport, tab, or section; player-safe unavailable state.
  - `NAV-006` — IA review and route-audit gate before scaffolding.
  - `NAV-007` — Stable page titles, single `h1`, semantic landmarks, live route announcements.
  - `NAV-008` — Command palette / command menu; actor-filtered commands; mobile parity.
  - `NAV-009` — Navigation Section registry: owner, route root, actor availability, aliases, local nav contract.
  - `NAV-010` — Actor-filtered command availability API shared by nav surfaces, widgets, and controls.
  - `PLAT-001` — Profile selection from capability descriptors (not raw viewport width).
  - `PLAT-002` — Desktop shell: titlebar controls, OS dialogs, protocol handling.
  - `PLAT-003` — Mobile: density-reduced access to all Must-have commands via sheets/drawers/tabs.
  - `PLAT-013` — First-run Command Center setup; fixture-driven acceptance tests.
  - `PLAT-017` — Non-leaking participant status; player-safe connection/sync state.
- **Related UX docs:**
  - `01-visual-design-system.md` — tokens (color, spacing, radius, elevation, motion, density modes) consumed here.
  - `03-accessibility.md` — global a11y contract; surface-specific additions are in §9 of this doc.
  - `04-canvas-scene-widgets.md` — canvas keyboard model at the widget level.
  - `05-command-center.md` — Command Center surface content; this doc owns its nav-shell anchor.
  - `10-graph-search-discovery.md` — search result UX within the command palette.
  - `11-collaboration-permissions.md` — permission grant UI and actor role management.
  - `15-onboarding-learnability.md` — onboarding flows, first-run tooltips, empty states.

---

## 2. UX goals for this surface

The navigation shell is the skeleton of the product. It must be invisible when it is working — users
think about their destination, not the mechanism. Under live-play pressure, a DM needs to reach any
primary tool in under two taps or keystrokes. A player must never discover DM content through a
navigation error or leaked section title. Across Desktop, Tablet, and Mobile, the same nine sections
must feel like one coherent product with a different control surface, not three different apps.

| Parameter | Goal for this surface |
|---|---|
| **Visual appeal** | The nav shell must feel premium and genre-appropriate — dark, atmospheric chrome that recedes behind content. Sidebar/rail follows the token set from `01-visual-design-system.md`; no orphaned one-off styles. The active section indicator is a single, unambiguous accent; not a rainbow. |
| **Information scent** | Every nav item has an icon + label at all times on Desktop (no icon-only rail without tooltips). Labels use player mental-model vocabulary (e.g., "Atlas" not "Maps", "Session" not "Combat Tracker"). Tree-test findability target: ≥ 80% on the five most common live-play tasks. |
| **Navigability** | ≤ 2 taps/clicks from any primary route to any other primary route. ≤ 3 steps to any secondary destination within a section. Back/forward preserves history; deep links restore full state; the command palette reaches every route and action in ≤ 2 keystrokes from anywhere. |
| **Intuition / learnability** | No hidden-until-hover primary nav on Desktop. Label + icon pairs self-describe. Empty states within each section provide a navigational call-to-action. The command palette's first open shows contextual suggestions, not a blank field. |
| **Accessibility** | Full keyboard operation of all nav layers; all nav landmarks declared; single `h1` per route; live route announcement on every transition; ≥ 4.5:1 contrast on all nav labels; ≥ 44 × 44 CSS px touch targets on Tablet and Mobile. |
| **Adaptability (platform profiles)** | Desktop: persistent sidebar. Tablet: collapsible rail (landscape) or bottom tab bar (portrait). Mobile: bottom tab bar + sheets. Same section set, same route, same commands across all three. |
| **Effective emphasis (visual hierarchy)** | Exactly one active-section indicator is visible at any moment. The global nav surface uses a single accent color for the active item; secondary items are muted. No competing highlighted items. |
| **Feedback & responsiveness** | Navigation transitions acknowledge within 100 ms (skeleton or instant). The active item updates before the page content loads. Route-change announcement fires when content is ready. |
| **Error prevention & recovery** | Deep links to unauthorized content show a non-leaking "unavailable" state, never a raw permission error. Legacy aliases redirect automatically — no dead links. |
| **Consistency** | All nav components are built from the shared component set in `01-visual-design-system.md`. Same keyboard shortcut (e.g., `Cmd/Ctrl+K`) triggers the command palette everywhere. Section order is identical across profiles. |

---

## 3. Researched best practices

### 3.1 Global navigation persistence and the "information scent" principle

Nielsen Norman Group research on information scent and navigation menus establishes that users form
expectations about what is behind a link from its label and surrounding context [1]. When labels use
internal taxonomy rather than user mental models, click-through rates drop and task completion time
rises. The implication: every Navigation Section label in DND Tools must map to a DM/player concept
("Atlas" = the world of maps; "Session" = live play), not a technical category.

NN/g also documents the hamburger menu problem on large screens: hiding primary navigation behind a
toggle on desktop-width surfaces reduces discoverability by 27% in controlled studies [2]. The
implication: DND Tools must never use hamburger-only primary nav on Desktop (see §10 Anti-patterns).

### 3.2 Sidebar and rail patterns

Apple's Human Interface Guidelines for macOS sidebars and iOS NavigationSplitView specify that
persistent, labeled sidebars on large screens provide immediate context and eliminate "I forgot which
section I'm in" disorientation [3]. Material 3 confirms: the navigation rail (icon + label, always
visible) is the correct component for medium-width surfaces (600–1240px) and the navigation bar
(bottom, 3–5 destinations) for compact surfaces under 600px [4]. Microsoft Fluent NavigationView
adds the collapsible-rail pattern (expanded ↔ icon-only with tooltips) and documents that icon-only
rails must always provide a tooltip on hover/focus, never assume icon self-evidence [5].

The implication: DND Tools Desktop uses a persistent labeled sidebar; Tablet portrait uses a bottom
tab bar; Tablet landscape uses a collapsible rail; Mobile uses a bottom tab bar. Icon-only states
must always surface a tooltip.

### 3.3 Command palette as primary navigation

Raycast, Linear, and VS Code demonstrate that a command palette accessible via `Cmd+K` (or
`Ctrl+K`) effectively replaces menu-bar navigation for power users [6]. Linear's research shows
users reach any destination in ≤ 2 keystrokes via the palette, reducing pointer travel. VS Code's
command palette adds fuzzy-search, recency weighting, and keyboard shortcut hints inline. The
implication: DND Tools' command palette is a first-class navigation surface, not an add-on; it must
surface navigation destinations alongside actions and support fuzzy matching with recency weighting.

### 3.4 Back/forward semantics and scroll restoration

The WHATWG History API and browser navigation specification require that `popstate` events restore
not only the URL but also the user's scroll position and focused element [7]. Hash-anchor navigation
(`#heading-id`) must focus the target element without firing the full route-transition focus
sequence, per NAV-004 and the WAI-ARIA APG single-page application navigation pattern [8]. The
implication: DND Tools must intercept `popstate` to restore scroll position and focus, and must
distinguish hash-only navigations from full route transitions in its focus-management logic.

### 3.5 Breadcrumbs as secondary wayfinding

NN/g's breadcrumb research shows breadcrumbs improve task completion in deep hierarchies and do not
confuse users who do not need them [9]. They should be location-style (current location in
hierarchy), not attribute-style (tag breadcrumbs), for content navigation. The implication: DND
Tools uses location breadcrumbs inside sections (e.g., Campaign › Arcs › The Sunken City) and
omits them at section-root level where the global nav already conveys location.

### 3.6 Actor-filtered navigation and the visibility/permission distinction

OWASP guidance on object-level authorization specifies that hidden resources must not be revealed
through timing differences, error messages, or UI element presence (even disabled) [10]. The
implication: DM-only sections must be absent from the navigation DOM for player sessions — not
merely visually hidden — so that screen readers, keyboard navigation, and devtools do not expose
them.

### 3.7 Touch and input modality handling

WCAG 2.2 Success Criterion 2.5.7 (Dragging Movements) and 2.5.8 (Target Size Minimum, 24 × 24 CSS
px, with 44 × 44 recommended) apply to all touch targets [11]. Apple HIG recommends 44 × 44 pt
minimum for interactive touch targets [3]. Material 3 recommends 48 × 48 dp for navigation targets
[4]. Users switching between touch and keyboard on the same device (2-in-1 laptops, iPads with
Magic Keyboard) must not lose keyboard focus indicators when they touch the screen; the app must
track the last active modality and show focus rings only for keyboard/sequential navigation
(`:focus-visible`). The implication: DND Tools must implement a `data-input-modality` attribute on
`<html>` (or equivalent CSS class toggle) that enables pointer-events input detection and switches
focus-ring visibility accordingly.

---

## 4. Reference implementations (exemplars)

| Product | What they do well (specific) | Principle / why it works | Borrow / Avoid | Link |
|---|---|---|---|---|
| **Linear** | Left sidebar with icon + label always visible; `Cmd+K` palette with fuzzy search, recency, and shortcut hints; collapses to icon-rail on narrow viewport without losing context | Information scent + command palette as primary nav; sidebar never hides on desktop-class screens | Borrow: sidebar collapse behavior, palette shortcut hints, recency weighting | https://linear.app |
| **VS Code** | `Ctrl+Shift+P` command palette with `>` prefix for actions vs. bare text for file search; activity bar (icon-only with tooltips) + resizable sidebar; breadcrumbs bar per editor tab | Three-tier nav (activity bar / sidebar / editor) maps cleanly to global / local / contextual | Borrow: three-tier model, prefix-disambiguated palette, always-visible activity bar tooltips; Avoid: icon-only without tooltips | https://code.visualstudio.com |
| **Figma** | Left panel shows pages (global IA) + layers (local context); right panel shows properties (contextual); `Cmd+/` quick actions; no hamburger menu anywhere | Canvas-centric product with persistent navigation at all viewport sizes | Borrow: persistent panels on canvas-centric product; contextual panel on right; Avoid: hiding global nav when canvas is active | https://figma.com |
| **Raycast** | Command palette as the entire shell; keyword aliases, recency, extensions, fallback web search; result types clearly labeled with icons and keyboard hints | Palette-first UX for power users; proves that search-driven nav is learnable and fast | Borrow: result-type labeling, keyword aliases, keyboard-shortcut hints in results | https://raycast.com |
| **Arc** | Sidebar with pinned + recent tabs, command bar (`Cmd+T`), spaces as top-level nav; gesture and keyboard parity | Pinned/recent pattern gives both structured and fluid access paths simultaneously | Borrow: pinned + recent pattern for top-of-sidebar items; Avoid: Arc's hidden URL bar (confusing for less technical users) | https://arc.net |
| **Notion** | Left sidebar: workspace, pinned pages, recent, search (`Cmd+K`); breadcrumb in page header; backlinks panel | Breadcrumb + backlinks + sidebar = three independent but harmonious wayfinding paths | Borrow: backlinks panel alongside breadcrumbs; Avoid: Notion's sidebar-nesting depth that requires horizontal scroll | https://notion.so |
| **Slack** | Bottom tab bar on mobile (5 items); left sidebar on desktop; keyboard shortcut `Cmd+K` for jump-to; same channels reachable on both | One IA, two surfaces — exactly the pattern DND Tools requires | Borrow: identical section set across profiles, bottom tab bar on mobile | https://slack.com |
| **Height** | Three-column layout: global nav (left) / local nav (center) / detail (right); collapses gracefully to two and one columns on narrower screens | Progressive disclosure of navigation columns matches available space | Borrow: column-collapse progressive disclosure; width breakpoints for column visibility | https://height.app |

**North-star narratives:**

**Linear (command palette + sidebar):** The single most important lesson from Linear is that a
persistent labeled sidebar and a first-class keyboard command palette are *complementary*, not
alternatives. Linear never forces a choice: the sidebar gives glanceable context while the palette
provides speed for users who know where they are going. DND Tools must adopt this dual-path model
explicitly — the sidebar is never hidden to "encourage palette use."

**VS Code (three-tier nav model):** VS Code proves that global / local / contextual is a
learnable, scalable information architecture for complex tools. The activity bar (global) never
moves; the sidebar (local) changes content based on the active activity; the editor area (contextual)
shows in-document navigation (breadcrumbs, outline). This maps almost exactly to DND Tools' three
nav tiers and should be the mental model used during implementation review.

**Raycast (palette-first, result-type labeling):** Raycast demonstrates that a command palette is
not a search box — it is a typed command surface where result categories (Navigation, Actions,
Settings, Extensions) are clearly labeled and keyboard-navigable without mouse intervention. DND
Tools must label command palette results by type (Navigate, Act, Create, Settings) so users know
exactly what pressing `Enter` will do.

---

## 5. UX/UI requirements

### UX-NAV-001 — Command Center is the application home

- **Requirement:** The application shall route every cold-start and post-login navigation to the
  Command Center (`/`) as the home surface. The global nav must make this home status unambiguous
  (e.g., a "home" icon + "Command Center" label as the first pinned item, always above the section
  list).
- **Rationale:** Vision brief §"Application Home: Command Center"; NAV-001; principle 1
  (Canvas-first). Avoids the v1 anti-pattern of landing in a notes list. [3][4]
- **Spec:**
  - Route: `/` (exact). All other routes that previously served as home must be aliased to `/`.
  - Global nav item: icon = `home` (filled when active, outlined otherwise), label = "Command
    Center". Position: top of global nav, above the section separator.
  - The active indicator (left accent bar, 3 px wide, `--color-accent-primary` token) appears on
    the Command Center item when `location.pathname === "/"`.
  - On Desktop: the item is always visible in the sidebar; it is never collapsed into a "More" menu.
  - On Tablet / Mobile: the Command Center tab occupies position 1 (leftmost) in the tab bar.
- **States:**
  - Default: icon outlined, label in `--color-text-secondary`, no accent bar.
  - Hover/focus-visible: background `--color-surface-hover`, icon in `--color-text-primary`.
  - Active (current route): left accent bar visible, icon filled, label in `--color-text-primary`,
    weight 600.
  - Loading (navigating to): skeleton pulse on the Command Center canvas area; nav item immediately
    switches to active state.
- **Platform profiles:**
  - Desktop (≥ 1024px): persistent sidebar item, always labeled.
  - Tablet (600–1024px): tab bar item (portrait) or rail item (landscape), always labeled.
  - Mobile (< 600px): bottom tab bar, icon + short label ("Home"), always visible.
- **Input:** pointer: click; touch: tap; keyboard: `Alt+Shift+H` (global shortcut, all profiles);
  command palette: type "Command Center" or "home" → Enter.
- **Accessibility:** `role="link"` with `aria-current="page"` when active; `aria-label="Command
  Center – home"` on the icon-only state; live-region announces "Command Center" on route
  completion.
- **Acceptance criteria:**
  - Given the app launches with a configured vault, when routing completes, then `location.pathname`
    is `/` and the Command Center canvas renders.
  - Given the user is on any other route, when they click/tap/keyboard-activate the Command Center
    nav item, then the route transitions to `/` and the active indicator moves to the Command Center
    item within 100 ms.
  - Given a player or observer launches the app, when routing completes, then the Command Center
    item is present and no DM-only section items are in the DOM.
- **Priority:** Must-have

---

### UX-NAV-002 — Navigation Section registry and canonical ordering

- **Requirement:** The approved Navigation Sections shall be presented in this fixed canonical order
  in the global nav, with no reordering by the user (sections may be hidden by actor role but the
  order among visible sections is invariant):

  1. Command Center (home, always first)
  2. Session
  3. Characters
  4. Atlas
  5. Campaign
  6. Knowledge
  7. Audio
  8. MCP
  9. Settings (always last, separated by a divider)

- **Rationale:** NAV-001, NAV-009. Fixed order maximizes muscle memory across sessions and reduces
  cognitive load during live play [1][2]. "Session" is placed second because live-play tasks are the
  hottest path.
- **Spec:**
  - Sections 1–8 are in the primary section group. Settings is in a secondary group below a
    `<hr role="separator">`.
  - Each section item: 40 px height on Desktop, 44 px on Tablet/Mobile; 16 px horizontal padding;
    icon (20 × 20 px) + label; 8 px gap between icon and label.
  - Section icons from the icon set defined in `01-visual-design-system.md`. Icon names (normative):
    `home`, `session-bolt`, `characters-person`, `atlas-map`, `campaign-scroll`, `knowledge-book`,
    `audio-wave`, `mcp-cpu`, `settings-gear`.
  - The Settings item has `margin-top: auto` (pushed to bottom of sidebar) on Desktop; on Mobile/
    Tablet tab bar, Settings occupies the rightmost/last position.
  - DM-only sections (Session DM controls, MCP, full Campaign management): filtered by actor role
    per UX-NAV-013.
- **States:** Same as UX-NAV-001 for individual items. The separator line is `--color-border-subtle`,
  1 px.
- **Platform profiles:**
  - Desktop: all 9 items visible in sidebar (Session through MCP in primary group; Settings pinned
    to bottom). Labels always shown unless sidebar is in icon-rail mode (see UX-NAV-005).
  - Tablet landscape: navigation rail shows all items; labels below icons; Settings pinned bottom.
  - Tablet portrait / Mobile: bottom tab bar shows 5 items maximum. Items shown: Command Center,
    Session, Characters, Atlas, and a "More" overflow (which reveals the remaining sections via a
    bottom sheet). Settings is accessible via the "More" sheet or a dedicated tab slot.
- **Input:** pointer: click; touch: tap; keyboard: `Alt+1` through `Alt+9` for sections in order
  (Desktop + Tablet with keyboard; Mobile with external keyboard). Command palette: type section name.
- **Accessibility:** `<nav aria-label="Primary navigation">`; each item `role="link"` with
  `aria-current="page"` for active; separator `role="separator"`; skip-to-content link before the
  nav (see UX-NAV-009).
- **Acceptance criteria:**
  - Given any platform profile, when the global nav renders, then Navigation Sections appear in
    canonical order with no gaps or reordering.
  - Given a player session, when the nav DOM is inspected, then DM-only section elements are absent
    (not merely hidden with `display:none`).
  - Given a keyboard user presses `Alt+2`, when the shortcut fires, then the app navigates to
    Session and announces "Session" via the live region.
- **Priority:** Must-have

---

### UX-NAV-003 — Three-tier navigation hierarchy

- **Requirement:** Navigation shall be organized into three tiers: (1) Global nav — section-level
  routing, persistent; (2) Local nav — within-section sub-routes and panels, context-dependent; (3)
  Contextual nav — in-entity breadcrumbs, backlinks, related items, visible when a specific entity
  is open. Each tier has a distinct visual zone and keyboard scope.
- **Rationale:** NAV-003; VS Code three-tier model (§4). Separates concerns, reduces overloading
  any one nav surface [6]. NN/g research on information scent shows layered nav reduces cognitive
  load when each layer has a clear scope [1].
- **Spec:**
  - **Tier 1 (Global):** Persistent sidebar (Desktop) or tab bar (Tablet/Mobile). Width: 220 px
    expanded, 56 px collapsed (icon-rail). Always visible on Desktop; persistent on Tablet/Mobile.
    Background: `--color-surface-nav` token.
  - **Tier 2 (Local):** Section-specific sub-navigation rendered in a secondary panel to the right
    of Tier 1 (Desktop) or as a horizontal scroll strip / segmented control at the top of the
    section content area (Tablet/Mobile). Width (Desktop): 200 px, same background as Tier 1 or
    `--color-surface-nav-secondary`. On Mobile: collapses to a top-of-content segmented control or
    a "Section" dropdown/sheet trigger — never a nested sidebar.
  - **Tier 3 (Contextual):** Breadcrumb bar (32 px height) pinned to the top of the content area,
    below any local nav strip; backlinks panel (collapsible, trailing edge of content area on
    Desktop, sheet on Mobile); related-items chips in the entity header.
  - The three tiers must not overlap visually or in keyboard tab order: Tab moves Tier 1 → Tier 2 →
    Tier 3 → main content area. `Escape` from Tier 2 or Tier 3 returns focus to the triggering
    element or Tier 1.
- **States:** Each tier independently shows loading skeletons, empty states, and error states
  without affecting sibling tiers.
- **Platform profiles:**
  - Desktop (≥ 1024px): All three tiers simultaneously visible in a three-column layout (Tier 1
    sidebar | Tier 2 local panel | content area with Tier 3 in header).
  - Tablet landscape (≥ 600px): Tier 1 as rail + Tier 2 as top strip + content area. No Tier 2
    panel; local nav uses a horizontal segmented control.
  - Tablet portrait / Mobile (< 600px): Tier 1 as bottom tab bar; Tier 2 as a top-of-screen
    segmented control or sheet; Tier 3 breadcrumb as a single-line truncated crumb with a tap-to-
    expand sheet.
- **Input:** pointer: click tier items; touch: tap; keyboard: `F6` or `Ctrl+F6` cycles focus
  through tiers (landmark navigation); `Tab` / `Shift+Tab` within a tier; `Alt+←` / `Alt+→` for
  local nav tabs.
- **Accessibility:** Each tier is a `<nav>` with a unique `aria-label` (`"Primary navigation"`,
  `"Section navigation"`, `"Page navigation"`). Tier landmark regions map to `role="navigation"`.
  Keyboard focus does not cycle across tier boundaries without explicit landmark-jump keystrokes.
- **Acceptance criteria:**
  - Given the user is viewing an entity on Desktop, when all three tiers are rendered, then no two
    tiers overlap and each has a distinct `aria-label`.
  - Given the user is on Mobile with a note open, when they tap the breadcrumb, then a sheet expands
    showing the full location path with tappable crumbs.
  - Given a keyboard user presses `F6`, when on Tier 1, then focus moves to Tier 2; pressing `F6`
    again moves to Tier 3; pressing `F6` again moves to the main content area.
- **Priority:** Must-have

---

### UX-NAV-004 — Persistent sidebar on Desktop; icon-rail collapse mode

- **Requirement:** On Desktop (≥ 1024px), the global nav shall render as a persistent, labeled
  sidebar. The sidebar shall support an optional icon-rail collapse mode (icon-only, 56 px wide)
  that the user can toggle but that is never the *default* state on first launch.
- **Rationale:** NN/g hamburger-menu research [2]; Apple HIG sidebars [3]; Material 3 navigation
  rail [4]; Linear (§4). A persistent labeled sidebar maximizes information scent and eliminates
  the cost of re-expanding a collapsed nav to identify the active section.
- **Spec:**
  - Default width: 220 px (expanded). Min content width (section label + icon): 160 px. Max: 280 px
    (user-resizable via drag handle).
  - Collapse toggle: a chevron icon (`‹`) at the bottom of the sidebar, 32 × 32 px touch target,
    keyboard shortcut `Ctrl+\` (mirrors VS Code convention). On collapse, sidebar animates to 56 px
    in 150 ms `ease-out`. Labels fade out, icons remain centered.
  - Collapsed (icon-rail) state: each nav item shows icon only, 20 × 20 px centered in 40 × 40 px
    target area; a tooltip (role=`"tooltip"`, delay 300 ms) shows the section label on hover/focus.
    Tooltip position: trailing edge (right side) of icon.
  - The sidebar width is persisted in user preferences (localStorage / profile setting). On first
    launch, always expanded.
  - A resize drag handle (4 px wide, `cursor: ew-resize`) between sidebar and content area allows
    continuous width adjustment. Min: 56 px (icon-rail). Max: 320 px. Snaps to 220 px on double-
    click.
- **States:**
  - Expanded: labels + icons, active accent bar.
  - Collapsed (icon-rail): icons only, no labels, tooltips on hover/focus.
  - Dragging: drag handle highlighted `--color-accent-primary`, cursor `ew-resize`.
  - Transition: `transition: width 150ms ease-out`. `prefers-reduced-motion`: instant, no animation.
- **Platform profiles:**
  - Desktop (≥ 1024px): this requirement applies.
  - Tablet / Mobile: not applicable (uses rail or tab bar per UX-NAV-005 / UX-NAV-006).
- **Input:** pointer: click collapse toggle or drag handle; keyboard: `Ctrl+\` to toggle; `Tab`
  cycles through sidebar items; `Enter`/`Space` activates; resize via keyboard not required (pointer
  operation only) — the icon-rail state is sufficient for keyboard users.
- **Accessibility:** Collapse toggle: `aria-label="Collapse navigation"` / `"Expand navigation"`;
  `aria-expanded` on the sidebar element. Tooltips in icon-rail mode: `role="tooltip"`,
  `aria-describedby` from the nav item. Focus ring visible in both expanded and collapsed states.
  Screen readers receive the label from the nav item `aria-label` regardless of visual state.
- **Acceptance criteria:**
  - Given Desktop, when the user clicks the collapse toggle, then the sidebar animates to 56 px and
    section labels are hidden but tooltips appear on focus.
  - Given icon-rail mode, when the user focuses a nav item via keyboard, then the tooltip appears
    within 300 ms with the section label.
  - Given the user refreshes the page, when the app loads, then the sidebar width is restored to the
    last saved state.
  - Given `prefers-reduced-motion: reduce`, when the sidebar is toggled, then width changes instantly
    without animation.
- **Priority:** Must-have

---

### UX-NAV-005 — Tablet navigation: rail (landscape) and tab bar (portrait)

- **Requirement:** On Tablet (600–1024px), the global nav shall adapt to viewport orientation: a
  collapsible icon+label rail on landscape and a bottom tab bar on portrait. Both surfaces expose
  the same Navigation Sections in the same order and never require a hamburger menu.
- **Rationale:** Material 3 navigation rail for medium screens [4]; Apple HIG NavigationSplitView
  adaptive behavior [3]; principle 5 (One IA, many surfaces).
- **Spec:**
  - **Landscape rail (≥ 600px width, landscape):** Width 72 px; icon (24 × 24 px) + label below
    icon (11 px, `--font-size-xs`); item height 56 px; selected: filled icon + `--color-accent-
    primary` label; unselected: outlined icon + `--color-text-tertiary` label.
  - **Portrait tab bar (< 600px height or explicit portrait orientation):** Bottom-pinned, 56 px
    height; 5 tabs maximum (Command Center, Session, Characters, Atlas, More). "More" opens a bottom
    sheet listing remaining sections (Campaign, Knowledge, Audio, MCP) plus Settings. Each tab: icon
    24 × 24 px centered, label 10 px below icon, 44 px minimum touch target width.
  - The rail and tab bar use the same section icon set and ordering as Desktop (UX-NAV-002).
  - Active indicator: rail — filled icon + label color change (no left accent bar). Tab bar — small
    filled dot below the icon or filled icon variant.
  - Tab bar "More" sheet: full-screen-height bottom sheet with `role="dialog"`, `aria-label="More
    sections"`. Sections listed as `<button>` rows with icon + label + disclosure chevron (if the
    section has sub-sections). Close via swipe-down, tap-outside, or `Escape`.
- **States:** Same as global nav items. "More" button has `aria-haspopup="dialog"` and
  `aria-expanded` reflecting sheet state.
- **Platform profiles:** This requirement applies to Tablet only. Desktop uses sidebar (UX-NAV-004).
  Mobile uses its own bottom tab bar (UX-NAV-006).
- **Input:** pointer/touch: tap; keyboard (external keyboard on iPad): `Alt+1` – `Alt+9` global
  shortcuts; `Tab` / `Shift+Tab` to cycle nav items; `Enter`/`Space` to activate.
- **Accessibility:** Tab bar: `<nav role="navigation" aria-label="Primary navigation">` wrapping a
  `role="tablist"` with each tab as `role="tab"` + `aria-selected`. "More" sheet: focus trapped
  inside sheet; `Escape` closes. 44 × 44 px minimum touch targets on all items.
- **Acceptance criteria:**
  - Given Tablet in landscape, when rendered, then a vertical rail of icon+label items is present
    and no hamburger menu exists.
  - Given Tablet in portrait, when rendered, then a bottom tab bar with ≤ 5 items is present and the
    "More" button reveals remaining sections in a sheet.
  - Given a keyboard user on Tablet (external keyboard), when they press `Alt+3`, then the app
    navigates to Characters.
- **Priority:** Must-have

---

### UX-NAV-006 — Mobile navigation: bottom tab bar and section sheets

- **Requirement:** On Mobile (< 600px), the global nav shall be a bottom-pinned tab bar with ≤ 5
  primary destinations and a "More" overflow sheet. Section content shall render in focused single-
  pane views, with secondary panes (filters, details, local nav) revealed via bottom sheets or
  slide-in drawers.
- **Rationale:** Material 3 Navigation Bar [4]; Apple HIG Tab Bar [3]; NAV-003 (mobile: slim);
  PLAT-003 (density-reduced access to all Must-have commands). Bottom tab bars have been
  empirically superior to top navigation bars on phones because the reach zone for thumbs is at the
  bottom [3][4].
- **Spec:**
  - Tab bar height: 56 px (+safe-area-inset-bottom for devices with home indicator). Always above
    device safe area.
  - Tabs: Command Center, Session, Characters, Atlas, More. "More" opens a bottom sheet.
  - Tab item: 44 × 44 px minimum touch target, icon 24 × 24 px, label 11 px, `--font-size-xs`.
  - Active tab: filled icon, label in `--color-accent-primary`.
  - "More" sheet: 75% viewport height, drag handle at top; lists remaining sections (Campaign,
    Knowledge, Audio, MCP, Settings) as full-width `<button>` rows (56 px height, 44 px touch
    target, icon + label + chevron).
  - Content panes: single primary pane (100vw, minus tab bar height). No persistent secondary
    columns. Details, filters, and local sub-navigation reveal as bottom sheets (≥ 44 px handle,
    accessible drag-to-close) or slide-in drawers from the right.
  - The bottom tab bar is never hidden while the user is within primary navigation flow. It may be
    hidden during full-screen media (maps, canvas) if the user explicitly enters a focus mode, with
    a visible affordance to exit focus mode (floating button, `44 × 44 px` minimum).
- **States:** Standard tab active/inactive. "More" button `aria-haspopup="dialog"`,
  `aria-expanded`. Focus mode: tab bar hidden, floating exit button `aria-label="Exit focus mode"`.
- **Platform profiles:** Mobile (< 600px) only. Tablet uses UX-NAV-005.
- **Input:** touch: tap; swipe-up on bottom sheet to expand; swipe-down to close sheet. Keyboard
  (external): `Alt+1` – `Alt+9`; `Tab` cycles tabs; `Escape` closes open sheets.
- **Accessibility:** `<nav aria-label="Primary navigation">` with `role="tablist"`; each tab
  `role="tab"`, `aria-selected`; "More" sheet: `role="dialog"`, focus trap, `aria-label`. All touch
  targets ≥ 44 × 44 CSS px.
- **Acceptance criteria:**
  - Given Mobile profile, when the app renders, then a bottom tab bar with exactly 5 items (or fewer
    if the actor role hides sections) is visible.
  - Given the user taps "More", when the sheet opens, then remaining sections are listed, focus moves
    to the sheet, and `Escape` closes it.
  - Given a full-screen map is active, when the user enters focus mode, then the tab bar is hidden
    and a floating "Exit focus mode" button (≥ 44 × 44 px) is present.
- **Priority:** Must-have

---

### UX-NAV-007 — Breadcrumbs: location-style, second-level and deeper only

- **Requirement:** Within-section navigation deeper than the section root shall display a
  location-style breadcrumb trail in the Tier 3 contextual zone, showing the path from the section
  root to the current entity. The breadcrumb shall not appear at the section root.
- **Rationale:** NAV-003; NN/g breadcrumb research (location breadcrumbs outperform attribute
  breadcrumbs for content navigation) [9]; WAI-ARIA APG breadcrumb pattern [8].
- **Spec:**
  - Position: Tier 3 contextual zone, 32 px height, pinned to top of content area below any local
    nav strip.
  - Format: `Section › Parent › Current` using `›` (U+203A) as separator. Current item is
    non-interactive (plain text, `--color-text-primary`, weight 600). Parent items are
    `<a>` links, `--color-text-secondary`, underline on hover/focus.
  - Maximum displayed crumbs: 4. If path is deeper, collapse middle crumbs into a `…` button that
    expands an inline list on click/tap/Enter. Collapsed form: `Section › … › Parent › Current`.
  - On Mobile: single-line truncated to show only the immediate parent + current (e.g.,
    `‹ Parent`). Tapping the truncated crumb opens a sheet with the full path.
  - Font: `--font-size-sm` (14 px), `--font-weight-normal` for parents, 600 for current. Separator
    `--color-text-tertiary`.
  - Background: inherits content area background (no additional panel).
- **States:**
  - Default: static text + links.
  - Parent link hover/focus: underline visible, color `--color-text-primary`.
  - Collapsed (`…`) button hover/focus: background `--color-surface-hover`.
  - Loading (navigating to parent): link briefly disabled (pointer-events none) with spinner on
    parent item.
- **Platform profiles:**
  - Desktop / Tablet landscape: full breadcrumb trail (up to 4 crumbs visible).
  - Mobile / Tablet portrait: single-line "‹ Parent" with tap-to-expand sheet.
- **Input:** pointer: click parent links; touch: tap; keyboard: `Tab` to each crumb, `Enter` to
  navigate; `…` button `Enter`/`Space` to expand.
- **Accessibility:** `<nav aria-label="Breadcrumb">` wrapping `<ol>` with `<li>` per crumb;
  current item `aria-current="page"`; `…` button `aria-label="Show full path"`,
  `aria-expanded`. Expanded list removes `aria-hidden` on expansion.
- **Acceptance criteria:**
  - Given the user is at a section root, when the breadcrumb renders, then it is absent.
  - Given the user is three levels deep in Knowledge, when the breadcrumb renders, then it shows
    `Knowledge › <parent> › <current>` with `aria-current="page"` on the current item.
  - Given Mobile profile and a five-level-deep path, when the breadcrumb renders, then it shows
    only `‹ <immediate parent>` and tapping it opens a sheet with the full path.
- **Priority:** Must-have

---

### UX-NAV-008 — Backlinks as navigation

- **Requirement:** Any entity that has inbound links from other entities (notes, characters, map
  locations, campaign arcs) shall display a backlinks panel that allows direct navigation to any
  linking entity. Backlinks are a navigation surface, not just metadata.
- **Rationale:** NAV-003; Notion backlinks panel (§4); graph-first content model (cross-link
  `10-graph-search-discovery.md`). Backlinks make the knowledge graph navigable without requiring
  the user to maintain manual indexes [9].
- **Spec:**
  - Position (Desktop): collapsible panel on the trailing edge of the content area (right side),
    240 px wide, collapsible via a chevron toggle. Initially collapsed if no backlinks exist;
    initially expanded (but dismissible) if ≥ 1 backlink exists.
  - Position (Tablet/Mobile): backlinks accessible via a "Backlinks (N)" button in the entity
    toolbar that opens a bottom sheet. The count `N` is always visible on the button, even when the
    sheet is closed.
  - Each backlink entry: entity icon (16 × 16 px) + entity title (truncated at 32ch with ellipsis)
    + excerpt (one line, `--font-size-xs`, `--color-text-tertiary`). Clicking/tapping navigates to
    that entity, updating route and history.
  - Backlinks are filtered by actor visibility: a player sees only backlinks from entities they have
    access to. DM-only entities never appear in a player's backlinks panel (not even as a count).
  - Maximum displayed: 20 backlinks; a "Show all (N)" button reveals a full-screen list view for
    larger sets.
  - Backlink count badge on the panel toggle reflects only the authorized set.
- **States:**
  - Empty (0 backlinks): panel toggle shows "Backlinks (0)", panel content shows "No backlinks yet"
    with a cue to link from other notes.
  - Loading: skeleton rows.
  - Error: "Could not load backlinks" with a retry button.
- **Platform profiles:**
  - Desktop: trailing panel, 240 px, collapsible.
  - Tablet/Mobile: bottom sheet triggered by toolbar button.
- **Input:** pointer: click panel toggle or backlink row; touch: tap; keyboard: `Alt+B` opens/
  closes the backlinks panel (Desktop); inside the panel, `Tab` / `Arrow` keys navigate rows,
  `Enter` navigates to the entity, `Escape` closes the panel.
- **Accessibility:** Panel toggle: `aria-expanded`, `aria-controls="backlinks-panel"`. Panel:
  `role="complementary"`, `aria-label="Backlinks"`. Each row: `role="link"` or `<a>`. Sheet on
  Mobile: `role="dialog"`, focus trap, `Escape` closes.
- **Acceptance criteria:**
  - Given a note has 3 backlinks, when the Desktop backlinks panel renders, then 3 rows are shown
    with entity title and excerpt, and each row navigates correctly on activation.
  - Given a player session, when backlinks render, then only backlinks from player-accessible
    entities are shown, with the count matching the visible set.
  - Given `Alt+B` is pressed on Desktop, when the panel is collapsed, then it expands and focus
    moves to the first backlink row.
- **Priority:** Should-have

---

### UX-NAV-009 — Skip-to-content and landmark structure

- **Requirement:** Every page shall include a skip-to-main-content link as the first focusable
  element, and shall structure the shell with correct HTML landmark regions: `<header>` (top bar, if
  present), `<nav aria-label="Primary navigation">`, `<main>` (content area), and any section-
  specific `<aside>` or `<nav>` for local/contextual navigation.
- **Rationale:** NAV-007; WAI-ARIA APG landmark guidance [8]; WCAG 2.2 §2.4.1 (Bypass Blocks),
  §1.3.6 (Identify Purpose). Keyboard users must be able to skip repeated navigation on every page
  transition.
- **Spec:**
  - Skip link: `<a href="#main-content" class="skip-link">Skip to main content</a>` as the first
    child of `<body>`. Visually hidden until focused (clip/transform technique); on focus, renders
    at top-left, 44 × 44 px minimum, `--color-surface-overlay` background, `--color-text-primary`
    text, `--color-accent-primary` border, `z-index: var(--z-skip-link)`.
  - `<main id="main-content">` wraps the route content area.
  - Sidebar: `<nav aria-label="Primary navigation">`.
  - Local nav: `<nav aria-label="Section navigation">` (distinct label).
  - Contextual nav (breadcrumb, backlinks): `<nav aria-label="Breadcrumb">`,
    `<aside aria-label="Backlinks">`.
  - Top bar (Desktop/Tablet): `<header>` containing the search/command palette trigger and global
    controls (user avatar, connection status, notification bell).
  - No landmark may be used more than once with the same `aria-label` on a given page.
- **States:** Skip link: hidden (visually, not from AT) by default; visible on `:focus`.
- **Platform profiles:** Same landmark structure on all profiles. On Mobile, `<header>` may be
  absent if all header controls move to the tab bar / status bar area; in that case, the tab bar
  itself is the `<nav>`.
- **Input:** keyboard: `Tab` as first keypress brings skip link into view; `Enter` activates it,
  moving focus to `#main-content`.
- **Accessibility:** This requirement is itself an accessibility requirement. Landmarks must be
  tested with `axe-core` (0 landmark violations) and with VoiceOver/NVDA navigation.
- **Acceptance criteria:**
  - Given any route, when the page renders and the user presses `Tab` once, then the skip link is
    visible and focusable.
  - Given the user activates the skip link, when focus moves, then `document.activeElement` is
    `#main-content` or the first focusable child within it.
  - Given `axe-core` runs on any route, when landmark audit completes, then 0 landmark violations
    are reported.
- **Priority:** Must-have

---

### UX-NAV-010 — Single `h1` and stable page title per route

- **Requirement:** Every route shall render exactly one `<h1>` that names the current surface or
  entity, and shall set `document.title` to a string that uniquely identifies the current context
  in the format `<Entity or Section> — DND Tools`.
- **Rationale:** NAV-007; WCAG 2.2 §2.4.2 (Page Titled), §1.3.1 (Info and Relationships). Multiple
  `h1` elements on a page break the heading outline used by screen reader users [8].
- **Spec:**
  - `<h1>`: the canonical name of the current entity or section. Examples: "Command Center",
    "The Sunken City (Note)", "Session: Winter Campaign". Visual style from
    `01-visual-design-system.md` heading scale (H1 token).
  - `document.title` format: `"<Entity or Section> — DND Tools"`. On section roots: `"Session —
    DND Tools"`. On entity pages: `"<Entity Name> — DND Tools"`. On errors: `"Error — DND Tools"`.
  - The `<h1>` must render in the `<main>` content area, not in the sidebar or header. The sidebar
    active item label visually names the section but is not the page `h1`.
  - On route transitions, `document.title` updates before the live region announces the route change.
  - On loading states (skeleton visible): `<h1>` is present as a skeleton placeholder with
    `aria-hidden="true"` until real content loads; `document.title` remains the target title.
- **States:** Loading: `<h1>` skeleton; Error: `<h1>Error</h1>` with error detail in body.
- **Platform profiles:** Same on all profiles.
- **Input:** N/A (this is a structural requirement).
- **Accessibility:** axe-core rule `page-has-heading-one` must pass; `document.title` must be
  non-empty and unique per route.
- **Acceptance criteria:**
  - Given any primary route, when the page renders, then exactly one `<h1>` element exists in the
    DOM and `document.title` matches the `<Entity or Section> — DND Tools` format.
  - Given the user navigates from Session to Knowledge, when the route transition completes, then
    `document.title` updates to `"Knowledge — DND Tools"` before the live region fires.
- **Priority:** Must-have

---

### UX-NAV-011 — Live route announcement

- **Requirement:** Every client-side route transition shall trigger a live-region announcement that
  names the new route, allowing screen reader users to perceive navigation changes that do not cause
  a full page reload.
- **Rationale:** NAV-007; WAI-ARIA APG single-page application navigation pattern [8]; WCAG 2.2
  §4.1.3 (Status Messages). Without live-region announcements, screen reader users on SPAs receive
  no feedback that navigation has occurred.
- **Spec:**
  - Implementation: a visually hidden `<div role="status" aria-live="polite" aria-atomic="true"
    id="route-announcer">` in the shell, outside `<main>`, persists for the lifetime of the app.
  - On each route transition completion (after content is rendered and `<h1>` is populated):
    programmatically set the announcer's `textContent` to the new `document.title` string (e.g.,
    "Session — DND Tools"). Clear the string after 500 ms to allow re-announcement of the same
    route if navigated to twice.
  - On hash-anchor navigation (e.g., `#section-heading`): do NOT trigger the route announcer.
    Instead, focus is moved to the target element (UX-NAV-012); screen readers will read the focused
    element naturally.
  - On loading states where content is not yet available: announce "Loading <Section name>…" when
    the route transition initiates; announce the final title when content is ready.
- **States:** Announcer is always in DOM; its `textContent` cycles between empty and the current
  route string.
- **Platform profiles:** Same on all profiles.
- **Input:** N/A (this is an AT communication mechanism).
- **Accessibility:** `aria-live="polite"` (not `assertive`) to avoid interrupting in-progress
  screen reader speech. `aria-atomic="true"` ensures the full string is read, not diffs.
- **Acceptance criteria:**
  - Given a screen reader is active and the user navigates from Command Center to Atlas, when the
    route transition completes, then the screen reader announces "Atlas — DND Tools".
  - Given a hash-anchor navigation fires, when the anchor target is focused, then the route announcer
    does not fire (no duplicate announcement).
  - Given a route transition begins and content is not yet loaded, when the announcer fires, then it
    says "Loading Atlas…" followed by "Atlas — DND Tools" when content is ready.
- **Priority:** Must-have

---

### UX-NAV-012 — Hash-anchor focus and scroll restoration

- **Requirement:** Navigation to a URL with a hash fragment (`#<id>`) shall focus the matching
  heading or landmark and scroll it into view, without invoking the full route-transition focus
  sequence (which would move focus to `<main>`). Browser back/forward shall restore scroll position
  to the state at the time of navigation away.
- **Rationale:** NAV-004; WAI-ARIA APG §"Navigating within a page" [8]; defect
  `CODEX-PR7-HASH-FOCUS`. Without this distinction, users following heading links within long
  articles lose their reading position, and screen readers receive incorrect focus placement.
- **Spec:**
  - Hash navigation handling: when the router detects a hash-only navigation (same pathname,
    different hash), locate the element with `id` matching the hash. If found: `element.focus({
    preventScroll: false })` and `element.scrollIntoView({ behavior: 'smooth', block: 'start' })`.
    If not found: log a warning, do not move focus, do not fire the route announcer.
  - For plain route transitions (different pathname): focus moves to `<main id="main-content">` via
    `main.focus()` (tabindex="-1" on `<main>` for programmatic focus only); scroll position resets
    to 0.
  - Scroll restoration: use `history.scrollRestoration = 'manual'` and store scroll position in the
    history state object on `beforeunload`/`pagehide` and on `pushState`/`replaceState`. On
    `popstate`, restore the recorded scroll position after content is rendered.
  - `prefers-reduced-motion: reduce`: replace `behavior: 'smooth'` with `behavior: 'auto'`
    (instant).
  - Headings that are hash targets must have an explicit `id` attribute matching the URL-safe slug
    of their text. Heading `id` generation must be deterministic (same input = same slug).
- **States:** During scroll restoration: content area renders at top, then jumps to saved position
  (< 100 ms). With `prefers-reduced-motion`: instant, no observable scroll animation.
- **Platform profiles:** Same behavior on all profiles. On Mobile, `scrollIntoView` behavior may be
  overridden by the browser's scroll container — use the outermost scrollable container explicitly.
- **Input:** Any (this is a side effect of navigation, not a direct user control).
- **Accessibility:** Focused headings must have `tabindex="-1"` (not in tab order by default, but
  focusable programmatically). `outline` must be visible on programmatic focus (`:focus` style, not
  `:focus-visible` only).
- **Acceptance criteria:**
  - Given a URL with `#section-heading`, when navigated to, then the heading with that `id` is
    focused and scrolled into view without the route announcer firing.
  - Given the user navigates forward to an article, scrolls down, then presses the browser back
    button, when the previous route renders, then scroll position is restored to the saved position.
  - Given `prefers-reduced-motion: reduce` is active, when hash navigation occurs, then the scroll
    is instant (no smooth animation).
- **Priority:** Must-have

---

### UX-NAV-013 — Actor-filtered navigation (DM-only section hiding)

- **Requirement:** Navigation sections, navigation items, breadcrumbs, backlinks, and command
  palette entries that are DM-only shall be completely absent from the DOM for player and observer
  sessions — not merely visually hidden or disabled — so that no navigation path, screen reader,
  or devtools inspection reveals their existence.
- **Rationale:** NAV-001, NAV-009, NAV-010; OWASP object-level authorization guidance [10]; safety
  principle 8 (Safe by default). This is a hard security requirement, not a UX preference.
  Visually-hidden elements remain in the accessibility tree and can be discovered by screen readers
  and keyboard exploration.
- **Spec:**
  - The server/processing core provides actor-filtered navigation data (route list, section list,
    command list) for the authenticated session. The GUI shell renders only what it receives.
  - DM-only sections include: DM-specific Campaign management views, full MCP configuration (players
    may see a limited MCP status surface if granted), full system diagnostics. The registry (UX-NAV-
    002) marks each section's actor availability.
  - Player-visible subset of each section may be a "slim" surface (e.g., Session for players shows
    initiative order and shared map but not DM control panels). These slim surfaces have distinct
    route paths or capability flags; the DM route must not be accessible by guessing URL.
  - If a player navigates to a DM-only route directly (by typing or following a stale link), the
    app returns a generic "Page not found" or "Not available" screen without naming the resource or
    confirming its existence.
  - "Not available" state for players: `<h1>Not available</h1>` + copy "This page isn't available
    in your current session." No additional detail. `document.title = "Not available — DND Tools"`.
  - Backlinks panel (UX-NAV-008) filters by the same actor-visibility API.
  - Command palette (UX-NAV-014) uses the same filtered command list.
- **States:** Player session: DM-only nav items simply do not exist. DM session: all items present.
- **Platform profiles:** Same filtering behavior on all profiles.
- **Input:** N/A (filtering is invisible to the user when correctly implemented).
- **Accessibility:** Because DM-only items are absent from the DOM, no `aria-hidden` is needed and
  no screen-reader leakage can occur.
- **Acceptance criteria:**
  - Given a player session, when the nav DOM is inspected, then no element with a DM-only section
    name, route, or label is present (not even with `display:none` or `aria-hidden`).
  - Given a player navigates to a DM-only route URL directly, when the route resolves, then a
    generic "Not available" page renders with no detail about the resource.
  - Given a player uses the command palette, when searching for DM-only commands, then no matching
    results appear.
- **Priority:** Must-have

---

### UX-NAV-014 — Command palette: global keyboard surface and mobile command menu

- **Requirement:** A command palette shall be available on all platform profiles, triggered by
  `Cmd+K` (macOS) / `Ctrl+K` (Windows/Linux/Android) and a persistent search/palette trigger icon
  in the top bar. On Mobile, where a full palette UI is impractical in portrait, a command menu
  sheet shall expose the same processing-core commands with identical filtering.
- **Rationale:** NAV-008; NAV-010; Raycast, Linear, VS Code exemplars (§4). The command palette is
  the universal fallback navigation surface: any destination or action reachable by any other method
  must also be reachable here [6].
- **Spec:**
  - **Trigger:** `Cmd+K` / `Ctrl+K` opens the palette from any context (including while a modal or
    drawer is open; palette overlays the modal). A search icon button in the top bar (or the tab
    bar on Mobile) also opens the palette. Button: 32 × 32 px (Desktop), 44 × 44 px (Tablet/
    Mobile), `aria-label="Open command palette"`, keyboard shortcut hint in tooltip: `Ctrl+K`.
  - **Palette UI (Desktop + Tablet landscape):** Modal overlay, centered, 640 px wide, max 480 px
    height with internal scroll. Background: `--color-surface-overlay` with 8 px radius and
    `--shadow-xl`. Backdrop: `rgba(0,0,0,0.4)`. Animation: scale from 0.95 → 1.0 + fade in, 120 ms
    `ease-out`. `prefers-reduced-motion`: fade only.
  - **Input field:** Full-width text input, autofocused on open, 48 px height, `font-size: 16 px`
    (prevents iOS auto-zoom), placeholder "Search or type a command…", clearable via `Escape` (first
    press clears text; second press closes palette).
  - **Result list:** Below input, scrollable, max 8 rows visible (more with scroll). Each row: 48 px
    height; icon (20 × 20 px) + label + result-type badge (Navigate / Act / Create / Settings) +
    optional keyboard shortcut hint (trailing edge, muted). Rows are keyboard-navigable with
    `ArrowDown`/`ArrowUp`; `Enter` activates the focused row; `Tab` moves focus to the result list
    if input is focused.
  - **Result types and grouping:** Results are grouped by type with a section header (12 px,
    `--color-text-tertiary`, uppercase, `letter-spacing: 0.05em`). Order of groups: Recent (last 5
    destinations), Navigate (sections, entities), Act (contextual actions), Create, Settings. Empty
    input shows Recent + contextual suggestions. Non-empty input shows fuzzy-matched results across
    all types, ranked by relevance + recency.
  - **Actor filtering:** Results respect actor visibility (same API as UX-NAV-013). DM-only items
    are absent from player command palette results.
  - **Mobile command menu sheet:** Bottom sheet (85% viewport height), triggered by `Ctrl+K` or
    the palette button. Contains the same input field + result list, scrollable. Sheet behavior per
    UX-NAV-006 sheet pattern.
  - **Disabled results:** A result that exists but is unavailable due to current state (e.g., "End
    Session" when no session is active) is shown with `aria-disabled="true"`, muted label, and a
    tooltip on hover/focus explaining the reason. It does not respond to `Enter` or click.
  - Cross-link: search result ranking and graph-based suggestions within the palette are specified
    in `10-graph-search-discovery.md`.
- **States:**
  - Closed: no DOM presence (removed from DOM, not `display:none`).
  - Opening: animation plays; input receives focus.
  - Empty query: Recent + contextual suggestions visible.
  - Non-empty query: fuzzy results, highlighted match characters (`<mark>` element,
    `--color-highlight` background).
  - No results: "No results for "<query>"" in center of list area; "Try a different term or explore
    sections with Alt+1–9."
  - Loading results (async): skeleton rows in result list, input remains interactive.
- **Platform profiles:**
  - Desktop / Tablet landscape: centered modal overlay as specified.
  - Mobile / Tablet portrait: bottom sheet.
- **Input:**
  - Open: `Cmd+K` / `Ctrl+K` (all profiles); palette button click/tap.
  - Close: `Escape` (clears text first, then closes); click/tap backdrop; swipe-down (Mobile sheet).
  - Navigate results: `ArrowDown` / `ArrowUp`; `Tab` (forward only within list).
  - Activate: `Enter` on focused row; click/tap row.
  - Clear query: `Ctrl+A` then `Backspace`; or `Escape` (first press).
- **Accessibility:** `role="dialog"`, `aria-label="Command palette"`, `aria-modal="true"`. Input:
  `role="combobox"`, `aria-expanded`, `aria-autocomplete="list"`, `aria-controls` pointing to the
  result list. Result list: `role="listbox"`; each row `role="option"`, `aria-selected` on focused
  row. Focus trapped within the palette. `Escape` closes and returns focus to the previously focused
  element. Screen reader receives result count update via `aria-live="polite"` on the result list
  count region.
- **Acceptance criteria:**
  - Given any route on Desktop, when the user presses `Ctrl+K`, then the command palette opens,
    input is focused, and recent destinations are shown within 100 ms.
  - Given a player session, when the palette opens and the user searches for a DM-only action, then
    no results are returned.
  - Given the palette is open and the user presses `Escape`, when text is present, then text is
    cleared first; pressing `Escape` again closes the palette and returns focus to the previously
    focused element.
  - Given Mobile profile, when the user taps the palette button, then a bottom sheet opens with an
    identical input + result list.
  - Given a disabled result is in the list, when the user presses `Enter` on it, then the action is
    not executed and a tooltip/announcement describes the reason.
- **Priority:** Must-have

---

### UX-NAV-015 — Pinned and recent items strip

- **Requirement:** The global nav shall display a pinned/recent items strip that gives direct access
  to user-pinned entities and recently visited entities, without requiring navigation through a
  section. This strip is distinct from the Navigation Section list.
- **Rationale:** NAV-003; Arc browser pinned/recent pattern (§4); NN/g on reducing navigation steps.
  For live play, a DM needs instant access to a handful of fixed items (the active session, the
  party tracker, the world map) without hunting through the section hierarchy.
- **Spec:**
  - Position: between the Command Center item and the section list in the sidebar (Desktop/Tablet
    rail); on Mobile, accessible via a horizontal scroll strip at the top of the "More" sheet or via
    a dedicated "Recents" entry in the "More" sheet.
  - Pinned items: up to 8 items, user-configurable (drag to reorder on Desktop/Tablet; long-press
    to reorder on Mobile). Each item: 32 px height, 16 px horizontal padding, entity icon (16 px)
    + truncated label (max 24ch). A pin icon on hover (Desktop) or long-press (Mobile) offers
    unpin. Pinned items persist across sessions (stored in user profile).
  - Recent items: last 10 visited entities, automatically populated. Shown below pinned items with
    a "Recent" section label (`12 px`, `--color-text-tertiary`). Recents are session-local by
    default (cleared on vault change). A "Clear recents" option is available via a `…` menu on the
    section label.
  - Separator between pinned and recent: `<hr role="separator">`, 1 px, `--color-border-subtle`.
  - On Desktop (collapsed icon-rail mode): pinned items show entity icon only; tooltip shows title.
  - Actor filtering: pinned/recent items respect actor visibility (players see only their accessible
    entities in pinned/recent, even if a DM-pinned item is stored in the same profile).
- **States:**
  - Default: pinned + recent lists rendered.
  - Empty pinned: "Pin items for quick access" placeholder with a link to the command palette.
  - Empty recent: "No recent items" placeholder.
  - Dragging (Desktop): item lifts with `box-shadow`, other items shift to show drop position.
    `prefers-reduced-motion`: no lift animation; visual placeholder only.
- **Platform profiles:**
  - Desktop: inline in sidebar, always visible when sidebar is expanded.
  - Tablet rail: icon-only in collapsed rail; expanded rail shows truncated labels.
  - Mobile: "Recents" row in "More" sheet, or horizontal scroll strip; pinned management via a
    dedicated settings screen.
- **Input:**
  - pointer: click to navigate; hover for pin icon (Desktop).
  - touch: tap to navigate; long-press (500 ms) for pin/unpin context menu (Mobile/Tablet).
  - keyboard: `Tab` / `Arrow` to navigate items in the strip; `Enter` / `Space` to navigate to
    entity; no drag-to-reorder keyboard equivalent — use "Manage pinned" settings screen.
  - drag-to-reorder: pointer drag (Desktop/Tablet); no gesture-only (WCAG 2.2 §2.5.7) — keyboard
    alternative is "Move up" / "Move down" in the settings screen.
- **Accessibility:** Pinned list: `role="list"` or `role="listbox"`; each item `role="listitem"` or
  `role="option"`; pin/unpin button `aria-label="Unpin <entity title>"`. Recent list: same
  structure. Section labels: `role="heading"` at appropriate level, or `role="group"` with
  `aria-labelledby`.
- **Acceptance criteria:**
  - Given the user has pinned 3 items, when the sidebar renders, then those 3 items appear below
    the Command Center item and above the section list.
  - Given the user visits 5 entities, when the sidebar renders, then up to 5 recent items appear
    below the pinned list.
  - Given a player session, when the pinned/recent strip renders, then only player-accessible
    entities are shown.
- **Priority:** Should-have

---

### UX-NAV-016 — Deep-link resolution and player-safe unavailable state

- **Requirement:** Deep links to specific entities (maps, notes, characters, scenes, sessions) shall
  restore the exact state (selected entity, viewport position, active tab, active section) when the
  link target is authorized. When the target is unauthorized for the current actor, the app shall
  display a non-leaking "Not available" state.
- **Rationale:** NAV-005; safety principle 8; OWASP object-level authorization [10]. Deep links are
  a primary sharing mechanism between DM and players; they must work precisely or players will lose
  trust in the system.
- **Spec:**
  - Deep-link anatomy: `/<section>/<entity-id>[?tab=<tab>&x=<x>&y=<y>&zoom=<z>][#<heading>]`.
    All parameters are preserved on redirect (NAV-002 alias behavior).
  - On resolution (authorized): render the entity view, apply viewport/tab/section state from query
    params, then focus per UX-NAV-012 (hash) or UX-NAV-011 (plain route).
  - On resolution (unauthorized / not found): render the generic "Not available" page (UX-NAV-013
    spec). The response code is 200 (not 404 or 403 — status codes leak existence). The
    `document.title` is "Not available — DND Tools". No error detail, no entity name, no section
    name in the copy.
  - On resolution (offline, entity not cached): render "Content unavailable offline" with an action
    button "Retry when online". Preserve the route URL so the user can refresh when connectivity
    returns.
  - Legacy alias redirect: automatic, transparent, query-param and hash preserved (NAV-002).
    Redirect happens before any content renders.
  - Deep links shared from the DM to players (e.g., via handout delivery) are pre-validated by the
    processing core: only links to player-visible entities are shareable by default.
- **States:**
  - Loading: skeleton matching the expected entity layout.
  - Authorized, loaded: entity rendered with full state.
  - Unauthorized: "Not available" page.
  - Offline, not cached: "Content unavailable offline" page with retry.
  - Legacy alias: transparent redirect (no user-visible state).
- **Platform profiles:** Same behavior on all profiles. Mobile shows the "Not available" and
  "Content unavailable offline" states as full-screen single-pane content (no sidebar context
  needed).
- **Input:** N/A (deep-link resolution is triggered by URL navigation).
- **Accessibility:** "Not available" and "Content unavailable offline" pages have a single `<h1>`,
  `document.title`, and a descriptive `<p>` with a clear action (e.g., "Return to Command Center"
  link). No confusing error codes or technical detail.
- **Acceptance criteria:**
  - Given a deep link targeting a map with `?x=100&y=200&zoom=1.5`, when resolved by an authorized
    user, then the map view opens at the specified viewport coordinates and zoom level.
  - Given a deep link targeting a DM-only note, when resolved by a player, then a "Not available"
    page renders with no reference to the note's title or existence.
  - Given a legacy alias URL, when navigated to, then the app redirects to the canonical URL with
    all query params and hash intact, transparently.
- **Priority:** Must-have

---

### UX-NAV-017 — Back/forward navigation and browser history contract

- **Requirement:** The application's routing layer shall preserve standard browser back/forward
  semantics so that `history.back()` and `history.forward()` (and their keyboard equivalents and
  browser UI buttons) always produce the expected navigation result, never looping or dropping
  history entries.
- **Rationale:** NAV-004; web platform navigation contract. Breaking browser back is one of the most
  disorienting and frustrating navigation failures documented by NN/g usability research [1]. SPAs
  routinely break back/forward by using `replaceState` where `pushState` is correct, or by pushing
  multiple entries per perceived navigation.
- **Spec:**
  - Rule: every user-initiated navigation to a new route pushes exactly one `history` entry via
    `pushState`. Programmatic updates that do not represent a new "page" (e.g., updating a search
    query while the user types, scroll position save) use `replaceState`.
  - Rule: in-page interactions that do not change the primary entity being viewed (e.g., opening a
    side panel, changing a tab within a panel) use `replaceState` or no history change.
  - Rule: redirects from aliases to canonical URLs use `replaceState` so back does not return to
    the alias.
  - Rule: the history stack must never grow unboundedly from a single user action (e.g., each
    keystroke in a search field must not push a new history entry).
  - Back button behavior on Desktop: in addition to browser back, the app may (Should-have) provide
    an in-app `←` back button in the top bar or entity header for users on platforms without visible
    browser controls (e.g., Electron, PWA in standalone mode). This button wraps `history.back()`.
  - Forward button: symmetric. When `history.forward()` would leave the app (e.g., there is no
    forward entry), it is silently inert (browser default).
  - Keyboard: `Alt+←` / `Alt+→` (Windows/Linux) and `Cmd+[` / `Cmd+]` (macOS) are standard
    browser back/forward shortcuts — the app must not intercept or override these unless
    intentionally using them for a different action (which is forbidden).
- **States:** N/A (history management is invisible to users when correct).
- **Platform profiles:** Same behavior on all profiles. PWA (standalone mode) and Electron must
  implement the in-app back button as a Should-have.
- **Input:** Browser back/forward buttons; `Alt+←` / `Alt+→` (Windows/Linux); `Cmd+[` / `Cmd+]`
  (macOS); in-app `←` button (PWA/Electron).
- **Accessibility:** The in-app back button: `aria-label="Go back"`, `role="button"` or `<button>`.
  Keyboard shortcut does not conflict with screen reader shortcuts.
- **Acceptance criteria:**
  - Given the user navigates Section A → Entity X → Section B, when they press browser back twice,
    then they are at Section A (not Entity X again, not a blank page).
  - Given the router performs an alias redirect, when the user presses back from the canonical page,
    then they return to the page before the alias link (the alias does not appear in history).
  - Given a user types in a search field that updates the URL query string, when they press back,
    then they return to the pre-search state, not step through each query string change.
- **Priority:** Must-have

---

### UX-NAV-018 — Input modality detection and focus-ring policy

- **Requirement:** The application shall detect the active input modality (pointer, touch, keyboard,
  pen) and show focus rings only during keyboard/sequential navigation, hiding them during pointer
  and touch interaction without removing them from the accessibility tree.
- **Rationale:** WAI-ARIA APG focus management [8]; WCAG 2.2 §2.4.11 (Focus Appearance — AA);
  Apple HIG and Material 3 modality guidance [3][4]. Showing focus rings during mouse use is
  aesthetically disruptive and reduces visual clarity; hiding them during keyboard use is a WCAG
  failure. The CSS `:focus-visible` pseudo-class combined with a modality-tracking attribute
  achieves both goals.
- **Spec:**
  - Global `<html>` element carries a `data-input-modality` attribute: `"keyboard"`, `"pointer"`, or
    `"touch"`. Updated on the following events:
    - `mousedown`/`pointerdown` (non-touch): set `"pointer"`.
    - `touchstart`: set `"touch"`.
    - `keydown` where `key` is Tab, Arrow keys, Enter, Space, or Escape: set `"keyboard"`.
  - Focus ring CSS: use `:focus-visible` pseudo-class for all interactive elements. Do not suppress
    focus outline in global CSS (`outline: none` / `outline: 0` are forbidden without a visible
    replacement). Focus ring spec: 2 px solid `--color-focus-ring`, 2 px offset (from
    `01-visual-design-system.md` focus token).
  - On modality switch (e.g., user taps touchscreen on a device that also has a keyboard), the
    `data-input-modality` attribute updates immediately and CSS transitions adjust focus ring
    visibility for subsequently focused elements.
  - Touch targets: all interactive nav elements meet ≥ 44 × 44 CSS px on Tablet and Mobile
    regardless of modality.
  - The `data-input-modality` attribute is also used by components to adjust hover-state presentation
    (e.g., hover tooltips are suppressed when `data-input-modality="touch"`).
- **States:** N/A (the attribute is always present and updates continuously).
- **Platform profiles:** Same mechanism on all profiles. On Desktop (pointer-primary), `"pointer"`
  is the default. On Mobile (touch-primary), `"touch"` is the default.
- **Input:** All modalities — this requirement describes the modality layer itself.
- **Accessibility:** WCAG 2.2 §2.4.11 Focus Appearance: focus ring must have 3:1 contrast against
  adjacent colors, ≥ 2 px perimeter. Focus rings must not be suppressed by modality — `:focus-
  visible` is used (browsers suppress focus rings for pointer automatically for elements that
  implement it natively; for custom components, `:focus-visible` must be implemented explicitly).
- **Acceptance criteria:**
  - Given the user navigates with Tab key, when a nav item receives focus, then a visible focus ring
    (2 px, `--color-focus-ring`) appears around it.
  - Given the user clicks a nav item with a mouse, when focus moves to that item, then no focus ring
    is visible (only the active/selected state indicator).
  - Given a touch user on Mobile taps a tab bar item, when it is activated, then no focus ring
    appears, and the touch target area is ≥ 44 × 44 CSS px.
  - Given `data-input-modality` is `"touch"`, when a hover tooltip would normally appear on pointer
    modality, then the tooltip does not appear.
- **Priority:** Must-have

---

### UX-NAV-019 — Keyboard navigation model: global shortcuts registry

- **Requirement:** The application shall maintain a global keyboard shortcut registry that is
  consistent across all routes, surfaced via the command palette's shortcut hints and a dedicated
  keyboard shortcuts help panel. No two registered shortcuts shall conflict.
- **Rationale:** NAV-008; VS Code keyboard model (§4); principle 3 (Information scent over memory).
  Keyboard shortcuts are only useful if they are discoverable and consistent; a hidden shortcuts
  system is equivalent to no shortcuts system.
- **Spec:**
  - **Global shortcuts (active from any route, not intercepted by focused inputs):**

    | Action | macOS | Windows/Linux | Notes |
    |---|---|---|---|
    | Open command palette | `Cmd+K` | `Ctrl+K` | Primary palette trigger |
    | Navigate to Command Center | `Alt+Shift+H` | `Alt+Shift+H` | |
    | Navigate to Session | `Alt+2` | `Alt+2` | Section order |
    | Navigate to Characters | `Alt+3` | `Alt+3` | |
    | Navigate to Atlas | `Alt+4` | `Alt+4` | |
    | Navigate to Campaign | `Alt+5` | `Alt+5` | |
    | Navigate to Knowledge | `Alt+6` | `Alt+6` | |
    | Navigate to Audio | `Alt+7` | `Alt+7` | |
    | Navigate to MCP | `Alt+8` | `Alt+8` | |
    | Navigate to Settings | `Alt+9` | `Alt+9` | |
    | Toggle sidebar expand/collapse | `Ctrl+\` | `Ctrl+\` | Desktop only |
    | Toggle backlinks panel | `Alt+B` | `Alt+B` | Desktop only |
    | Go back | `Cmd+[` | `Alt+←` | Browser/OS native |
    | Go forward | `Cmd+]` | `Alt+→` | Browser/OS native |
    | Cycle landmark focus | `F6` | `F6` | Next landmark; `Shift+F6` = previous |

  - Shortcut hints appear in: command palette result rows (trailing muted text), tooltip on nav
    items (Desktop hover), keyboard shortcuts help panel.
  - Help panel: triggered by `?` when no text input is focused, or via command palette "Keyboard
    shortcuts". Shows a searchable list of all registered shortcuts grouped by domain. `role=
    "dialog"`, `aria-label="Keyboard shortcuts"`, closable via `Escape`.
  - No shortcut may use the browser's reserved shortcuts (`Ctrl+W`, `Ctrl+T`, `Ctrl+N`, etc.) or
    common OS shortcuts (`Cmd+Q`, `Alt+F4`, etc.).
  - Shortcut registration is part of the actor-filtered command API (UX-NAV-013): DM-only shortcuts
    are not registered for player sessions.
- **States:** Help panel: open / closed. Shortcut hints in palette: always visible on keyboard-
  active rows.
- **Platform profiles:**
  - Desktop / Tablet with external keyboard: full shortcut set.
  - Mobile / Tablet touch-only: `Cmd+K` / `Ctrl+K` still works with an external keyboard; all other
    shortcuts apply when external keyboard is connected. The help panel is accessible via the command
    palette on all profiles.
- **Input:** keyboard (this requirement governs keyboard input).
- **Accessibility:** Shortcut hints in the palette are `aria-label`-decorated or wrapped in a
  `<kbd>` element; screen readers read them as part of the result item description.
- **Acceptance criteria:**
  - Given no text input is focused, when the user presses `Alt+4`, then the app navigates to Atlas.
  - Given the command palette is open with a result row focused, when the result has a keyboard
    shortcut, then the shortcut hint is visible in the row.
  - Given the user presses `?`, when no text input is focused, then the keyboard shortcuts help
    panel opens with a searchable list of all shortcuts.
  - Given a player session, when the shortcut registry is inspected, then DM-only shortcuts are
    absent.
- **Priority:** Must-have

---

### UX-NAV-020 — Legacy route alias management and redirect transparency

- **Requirement:** All legacy route aliases shall redirect to their canonical routes automatically,
  preserving query parameters and hash fragments, using `replaceState` (not `pushState`). No
  duplicate full route implementation shall exist for a legacy alias.
- **Rationale:** NAV-002; defects `CLAUDE-ROUTE-LEGACY-DUPES` and `CODEX-PR13-MAP-REDIRECT-PARAMS`.
  Duplicate route implementations create maintenance burden and risk parameter-loss bugs. Transparent
  redirects preserve user-facing bookmarks and shared links without polluting history.
- **Spec:**
  - A route alias table (source of truth: a config file, not inline router code) maps each legacy
    path pattern to its canonical path pattern.
  - The redirect middleware runs before any route component renders: reads the incoming URL, checks
    the alias table, replaces the URL if matched, and continues routing to the canonical component.
  - Query parameters: all query params from the alias URL are forwarded to the canonical URL. If the
    canonical route does not recognize a param, it is silently dropped (not 404'd).
  - Hash fragments: preserved exactly.
  - The route audit gate (NAV-006) rejects any new alias that is implemented as a full component
    rather than a redirect stub.
  - User-facing experience: the URL bar silently updates to the canonical URL; no loading indicator
    fires for the redirect; the canonical page loads as if the canonical URL was entered directly.
- **States:** Redirect is transparent — no user-visible state change beyond the URL updating.
- **Platform profiles:** Same on all profiles.
- **Input:** N/A (redirect is triggered by URL navigation).
- **Accessibility:** Transparent redirect is preferable to any redirect confirmation that would
  create an extra navigation announcement.
- **Acceptance criteria:**
  - Given a legacy URL `/<old-section>/map?poi=abc&x=1&y=2#region-north`, when navigated to, then
    the canonical map URL receives `?poi=abc&x=1&y=2` and the `#region-north` hash, and the user
    sees the canonical URL in the address bar without a visible redirect step.
  - Given the route audit gate runs, when any alias is implemented as a full component rather than a
    redirect stub, then the gate fails.
- **Priority:** Must-have

---

## 6. Component & state specifications

### 6.1 Global sidebar (Desktop)

| Property | Value |
|---|---|
| Element | `<nav aria-label="Primary navigation">` |
| Width expanded | 220 px (default), 160–320 px (user-resizable) |
| Width collapsed | 56 px (icon-rail) |
| Background | `--color-surface-nav` |
| Padding | 8 px top, 0 bottom |
| Section item height | 40 px |
| Section item padding | 0 16 px |
| Icon size | 20 × 20 px |
| Icon/label gap | 8 px |
| Active indicator | 3 px left border, `--color-accent-primary` |
| Active label weight | 600 |
| Divider (before Settings) | `<hr>`, 1 px, `--color-border-subtle`, 8 px margin |
| Collapse toggle | 32 × 32 px, bottom of sidebar, `aria-label="Collapse navigation"` |
| Drag handle | 4 px, right edge, `cursor: ew-resize` |
| Collapse animation | 150 ms `ease-out`; `prefers-reduced-motion`: instant |

**State matrix for a sidebar item:**

| State | Background | Icon | Label | Indicator |
|---|---|---|---|---|
| Default | transparent | outlined, `--color-icon-secondary` | `--color-text-secondary` | none |
| Hover | `--color-surface-hover` | outlined, `--color-icon-primary` | `--color-text-primary` | none |
| Focus-visible | `--color-surface-hover` + 2 px focus ring | outlined, `--color-icon-primary` | `--color-text-primary` | none |
| Active (current route) | transparent | filled, `--color-accent-primary` | `--color-text-primary`, weight 600 | 3 px left, `--color-accent-primary` |
| Disabled | transparent | `--color-icon-disabled` | `--color-text-disabled` | none |

### 6.2 Bottom tab bar (Mobile / Tablet portrait)

| Property | Value |
|---|---|
| Element | `<nav aria-label="Primary navigation">` wrapping `role="tablist"` |
| Height | 56 px + `env(safe-area-inset-bottom)` |
| Background | `--color-surface-nav` |
| Border top | 1 px `--color-border-subtle` |
| Tab count | 5 (4 sections + "More") |
| Tab min width | 20% of bar width |
| Icon size | 24 × 24 px |
| Label size | 10 px, `--font-size-xxs` |
| Touch target | ≥ 44 × 44 CSS px per tab |
| Active indicator | filled icon + `--color-accent-primary` label |
| "More" button | `aria-haspopup="dialog"` `aria-expanded` |

### 6.3 Navigation rail (Tablet landscape)

| Property | Value |
|---|---|
| Width | 72 px |
| Background | `--color-surface-nav` |
| Item height | 56 px |
| Icon size | 24 × 24 px |
| Label size | 11 px, `--font-size-xs`, below icon |
| Active: filled icon | `--color-accent-primary` label |
| Unselected | outlined icon, `--color-text-tertiary` label |
| Touch target | ≥ 44 × 44 CSS px per item |

### 6.4 Command palette

| Property | Value |
|---|---|
| Width (Desktop/Tablet landscape) | 640 px |
| Max height | 480 px |
| Border radius | 8 px |
| Background | `--color-surface-overlay` |
| Shadow | `--shadow-xl` |
| Backdrop | `rgba(0,0,0,0.4)` |
| Input height | 48 px |
| Input font size | 16 px (prevents iOS zoom) |
| Result row height | 48 px |
| Result icon size | 20 × 20 px |
| Max visible rows | 8 (scroll for more) |
| Open animation | scale 0.95→1.0 + fade, 120 ms `ease-out` |
| `prefers-reduced-motion` | fade only |
| `role` | `"dialog"` |
| `aria-modal` | `"true"` |

**Result row state matrix:**

| State | Background | Label | Icon | Type badge |
|---|---|---|---|---|
| Default | transparent | `--color-text-primary` | `--color-icon-secondary` | `--color-text-tertiary` |
| Hover | `--color-surface-hover` | `--color-text-primary` | `--color-icon-primary` | `--color-text-secondary` |
| Focused (keyboard) | `--color-surface-active` + focus ring | `--color-text-primary` | `--color-icon-primary` | `--color-text-secondary` |
| Disabled | transparent | `--color-text-disabled` | `--color-icon-disabled` | `--color-text-disabled` |
| Match highlight | `<mark>` with `--color-highlight` bg on matched chars | — | — | — |

### 6.5 Breadcrumb bar

| Property | Value |
|---|---|
| Height | 32 px |
| Font size | 14 px (`--font-size-sm`) |
| Current item | weight 600, `--color-text-primary`, non-interactive |
| Parent links | `--color-text-secondary`, underline on hover/focus |
| Separator | `›` (U+203A), `--color-text-tertiary`, 4 px margin each side |
| Max visible crumbs | 4; excess collapsed to `…` |
| `<nav>` aria-label | `"Breadcrumb"` |

### 6.6 Backlinks panel (Desktop)

| Property | Value |
|---|---|
| Width | 240 px |
| Position | trailing edge of content area |
| Toggle | chevron button, `aria-expanded`, keyboard: `Alt+B` |
| Entry height | 48 px (icon + title + excerpt) |
| Max displayed | 20; "Show all (N)" for more |
| Empty state | "No backlinks yet" with link cue |
| `role` | `"complementary"` |
| `aria-label` | `"Backlinks"` |

---

## 7. Layout & responsive behavior

### 7.1 Desktop (≥ 1024px): three-column shell

```
┌─────────────────────────────────────────────────────────────────┐
│ [Desktop top bar: search/palette trigger, status, user avatar]  │
├─────────┬──────────────┬──────────────────────────────────────┬─┤
│         │              │                                      │ │
│ Global  │  Local nav   │   Content area                       │B│
│ sidebar │  (Tier 2)    │   ┌────────────────────────────────┐ │a│
│ (T1)    │  200px       │   │ Breadcrumb (Tier 3, 32px)      │ │c│
│ 220px   │              │   ├────────────────────────────────┤ │k│
│         │              │   │                                │ │l│
│ [Home]  │  [Sub-nav    │   │  Route content / entity        │ │i│
│ [Sess.] │   items]     │   │  <main id="main-content">      │ │n│
│ [Chars] │              │   │  <h1>…</h1>                    │ │k│
│ [Atlas] │              │   │                                │ │s│
│ [Camp.] │              │   │                                │ │ │
│ [Know.] │              │   │                                │ │2│
│ [Audio] │              │   │                                │ │4│
│ [MCP]   │              │   │                                │ │0│
│         │              │   └────────────────────────────────┘ │p│
│ ─────── │              │                                      │x│
│ Pinned  │              │                                      │ │
│ Recent  │              │                                      │ │
│ ─────── │              │                                      │ │
│[Settings│              │                                      │ │
│ ↕ collapse toggle]     │                                      │ │
└─────────┴──────────────┴──────────────────────────────────────┴─┘
```

- Sidebar: 220 px (expandable) or 56 px (icon-rail). Resizable via drag handle.
- Local nav panel: 200 px. Optional — sections without sub-navigation omit it and the content area
  takes its space.
- Content area: remaining width. Contains Tier 3 breadcrumb (32 px height) + `<main>`.
- Backlinks panel: 240 px, trailing edge, collapsible. Appears only when an entity has backlinks
  and the user has not collapsed it.
- Top bar: 48 px height, persistent. Contains: section title (echoing current section for
  glanceability), search/palette trigger (right of title), connection status indicator, notification
  bell, user avatar/menu.

### 7.2 Tablet landscape (600–1024px, landscape orientation)

```
┌──────────────────────────────────────────────────────┐
│ [Top bar: palette trigger, status, user]             │
├──────┬─────────────────────────────────────────────┐ │
│      │ [Local nav: segmented control strip, 40px]  │ │
│ Rail │ ──────────────────────────────────────────  │ │
│ 72px │ [Breadcrumb, 32px]                          │ │
│      │ ──────────────────────────────────────────  │ │
│ [T1] │ Content area <main>                         │ │
│      │ <h1>…</h1>                                  │ │
│      │                                             │ │
│      │                                             │ │
└──────┴─────────────────────────────────────────────┘
```

- Rail: 72 px, icon + label below, always visible.
- Local nav: horizontal segmented control strip at top of content area (40 px height). Scrollable
  horizontally if tabs exceed width.
- No backlinks panel (accessible via a button in entity toolbar that opens a sheet).

### 7.3 Tablet portrait / Mobile (< 600px height or < 600px width)

```
┌────────────────────────────────────┐
│ [Optional top bar: title + palette │
│  trigger (right) + status (right)] │
├────────────────────────────────────┤
│ [Local nav segmented control, 40px]│
├────────────────────────────────────┤
│ [Breadcrumb, 32px — single crumb]  │
├────────────────────────────────────┤
│                                    │
│ Content area <main>                │
│ <h1>…</h1>                         │
│                                    │
│                                    │
│                                    │
│                                    │
│                                    │
│                                    │
├────────────────────────────────────┤
│ [Bottom tab bar, 56px + safe-area] │
└────────────────────────────────────┘
```

- Bottom tab bar: 5 items max; "More" opens bottom sheet.
- Top bar (optional on Mobile): may be omitted for routes where the `<h1>` in the content area
  provides sufficient context; palette trigger always reachable from tab bar "More" or via `Ctrl+K`.
- Single-pane content: full width, full height between top bar and tab bar.
- Secondary panes (filters, details, local nav): bottom sheets or right slide-in drawers.

### 7.4 Same command, same result — cross-profile parity table

| Capability | Desktop surface | Tablet surface | Mobile surface |
|---|---|---|---|
| Navigate to a section | Sidebar item click or `Alt+N` | Rail item tap or `Alt+N` | Tab bar tap or "More" sheet |
| Open command palette | `Ctrl+K` or top-bar icon | `Ctrl+K` or top-bar icon | `Ctrl+K` or tab-bar icon or "More" |
| Navigate to entity via backlinks | Backlinks panel row | Toolbar button → sheet | Toolbar button → sheet |
| Navigate to entity via breadcrumb | Breadcrumb links | Breadcrumb links | Single-crumb tap → full-path sheet |
| Access pinned items | Sidebar pinned strip | Rail tooltip list | "More" sheet → Recents entry |
| Toggle sidebar / nav | `Ctrl+\` | Orientation auto-switches | Not applicable (tab bar is fixed) |
| View keyboard shortcuts | `?` or command palette | `?` with external keyboard | Command palette → "Keyboard shortcuts" |

---

## 8. Motion & feedback

All durations and easing curves are defined relative to the motion system in
`01-visual-design-system.md`. `prefers-reduced-motion: reduce` fallbacks are mandatory for every
animation.

| Element | Property animated | Duration | Easing | `prefers-reduced-motion` fallback |
|---|---|---|---|---|
| Sidebar expand/collapse | `width`, label `opacity` | 150 ms | `ease-out` | Instant (0 ms) |
| Command palette open | `opacity` + `scale` (0.95 → 1.0) | 120 ms | `ease-out` | `opacity` only, 80 ms |
| Command palette close | `opacity` + `scale` (1.0 → 0.95) | 80 ms | `ease-in` | `opacity` only, 50 ms |
| Section nav item active indicator | `opacity` (0 → 1) | 100 ms | `ease` | Instant |
| Bottom sheet open (Mobile) | `translateY` (100% → 0%) | 200 ms | `cubic-bezier(0.32,0.72,0,1)` (spring-like) | Instant |
| Bottom sheet close | `translateY` (0% → 100%) | 150 ms | `ease-in` | Instant |
| Pinned item drag | `box-shadow` lift + sibling reflow | continuous | `ease-out` per frame | No lift, placeholder only |
| Hash-anchor scroll | `scroll-behavior: smooth` | browser-native | browser-native | `scroll-behavior: auto` |
| Route transition (content area) | Skeleton fade-in: `opacity` 0 → 1 | 150 ms | `ease` | Instant render |
| Breadcrumb collapse expand (`…`) | `max-height` | 120 ms | `ease-out` | Instant |
| Tooltip (sidebar icon-rail) | `opacity` 0 → 1, delay 300 ms | 100 ms | `ease` | Instant, 0 ms delay |

**Dead-click prevention:** Every interactive nav element must provide an acknowledgment within
100 ms of activation (active state CSS update, immediate route change, or loading skeleton). No
nav interaction may be silent.

---

## 9. Accessibility requirements (surface-specific)

Beyond the global contract in `03-accessibility.md`:

### 9.1 Landmark navigation completeness

Every page must expose the following landmark roles, auditable by `axe-core` and tested with
VoiceOver (macOS/iOS), NVDA (Windows), and TalkBack (Android):

- `<header>` — top bar (when present).
- `<nav aria-label="Primary navigation">` — global sidebar / tab bar.
- `<nav aria-label="Section navigation">` — local Tier 2 nav (when present).
- `<nav aria-label="Breadcrumb">` — breadcrumb (when present, depth ≥ 2).
- `<main id="main-content">` — primary content area.
- `<aside aria-label="Backlinks">` — backlinks panel (when present).

No landmark label may be duplicated on the same page. `axe-core` rule `landmark-unique` must pass.

### 9.2 Command palette keyboard contract

The command palette implements the ARIA combobox pattern [8]:
- Input: `role="combobox"`, `aria-expanded`, `aria-autocomplete="list"`, `aria-controls="palette-
  listbox"`.
- Result list: `id="palette-listbox"`, `role="listbox"`.
- Each result: `role="option"`, `aria-selected="true"` only for the currently focused item (single-
  select). `aria-disabled="true"` for disabled results.
- `aria-activedescendant` on the input points to the focused option's `id`.
- Screen reader result count: `<div aria-live="polite" aria-atomic="true">` updated with "N results"
  when the result list changes.

### 9.3 Focus management on route transitions

| Transition type | Focus target | Announcement |
|---|---|---|
| Plain route transition | `<main id="main-content">` (tabindex="-1") | Live region: new `document.title` |
| Hash-anchor navigation | Target element (tabindex="-1" if not natively focusable) | None (screen reader reads focused element) |
| Modal/sheet open | First focusable element inside modal/sheet | `aria-label` of the modal read by AT |
| Modal/sheet close | Element that triggered the modal/sheet | None (AT reads naturally focused element) |
| Redirect (alias) | Same as plain route transition after redirect completes | Live region: canonical route title |

### 9.4 Touch target sizes

All interactive nav elements must meet the following on Tablet and Mobile:

| Element | Minimum size | Measurement method |
|---|---|---|
| Tab bar tab | 44 × 44 CSS px | Inclusive of padding, not just icon |
| Navigation rail item | 44 × 44 CSS px | Inclusive of padding |
| Breadcrumb parent link | 24 × 44 CSS px (width flexible) | Minimum height 44 px |
| Backlink row | 44 px height × full width | Full-width touch target |
| Command palette result row | 44 px height × full width | Full-width touch target |
| "More" button (tab bar) | 44 × 44 CSS px | |
| Collapse toggle (sidebar) | 32 × 32 CSS px (Desktop only, pointer-primary) | Pointer: 32 px sufficient per Fitts |

### 9.5 Color contrast for navigation elements

All nav labels and icons must meet WCAG 2.2 AA contrast:

| Element state | Minimum contrast | Token pair |
|---|---|---|
| Active nav item label | 4.5:1 against `--color-surface-nav` | `--color-text-primary` / `--color-surface-nav` |
| Inactive nav item label | 4.5:1 | `--color-text-secondary` / `--color-surface-nav` |
| Active indicator bar | 3:1 (non-text, UI component) | `--color-accent-primary` / `--color-surface-nav` |
| Breadcrumb parent link | 4.5:1 | `--color-text-secondary` / content bg |
| Breadcrumb current | 4.5:1 | `--color-text-primary` / content bg |
| Command palette input | 4.5:1 | `--color-text-primary` / `--color-surface-overlay` |
| Palette result label | 4.5:1 | `--color-text-primary` / `--color-surface-overlay` |
| Palette type badge | 3:1 (informational, non-text boundary acceptable) | `--color-text-tertiary` / `--color-surface-overlay` |
| Focus ring | 3:1 against adjacent colors | `--color-focus-ring` / adjacent background |

---

## 10. Anti-patterns & explicit limitations

**This section is a hard do-not-do list. Each entry carries the researched reason.**

### AP-1: No hamburger-only primary navigation on Desktop or Tablet landscape

**Pattern:** Hiding the primary nav behind a hamburger icon on screens ≥ 600px wide.
**Reason:** NN/g usability research documents a 27% reduction in navigation discoverability when
primary nav is behind a hamburger on desktop-class screens [2]. The icon itself has weak information
scent (it does not communicate *what* is inside). Users on large screens have enough space for a
persistent nav and expect to see it. Linear, VS Code, Figma, Notion, and Slack never use a
hamburger on desktop — and they are the category leaders.
**Rule:** The global nav on Desktop (≥ 1024px) and Tablet landscape (≥ 600px) must be a persistent
sidebar or rail, not a hamburger-toggle overlay.

### AP-2: No icon-only sidebar without tooltips

**Pattern:** Collapsing the sidebar to icons with no label and no tooltip.
**Reason:** Icons are not universally understood, especially for abstract concepts ("Atlas", "MCP").
Microsoft Fluent NavigationView documentation explicitly requires tooltips on icon-only NavigationView
items [5]. Without tooltips, the icon-rail is a memory test, not a navigation aid — violating
principle 3 (Information scent over memory).
**Rule:** Icon-rail mode (sidebar collapsed) must display a tooltip with the section label on hover
and on keyboard focus, always, with no exceptions.

### AP-3: No gesture-only navigation

**Pattern:** Requiring a swipe gesture to access navigation (e.g., swipe-right to open sidebar,
no alternative).
**Reason:** WCAG 2.2 §2.5.7 (Dragging Movements) requires that all functionality operable by
dragging/swiping be achievable by a single pointer action or keyboard. Motor-impaired users, users
with tremor, and users with non-touch pointer devices cannot reliably perform swipe gestures.
**Rule:** Every gesture that opens or dismisses a nav surface (sheet, drawer, rail) must have a
discrete tap/click/keyboard alternative. Swipe-to-dismiss sheets must also have a close button
(≥ 44 × 44 px) and `Escape` key support.

### AP-4: No DM-only items hidden with CSS only (display:none / aria-hidden)

**Pattern:** Rendering DM-only navigation items in the DOM and hiding them from players with
`display:none`, `visibility:hidden`, or `aria-hidden="true"`.
**Reason:** `display:none` elements are visible in devtools, source, and can be revealed by user
CSS. `aria-hidden` hides from the accessibility tree but not from DOM inspection. OWASP guidance
requires that access control happens at the data/API layer, not the presentation layer [10]. A
determined player could modify CSS to reveal DM section labels, confirming the existence of hidden
content.
**Rule:** DM-only navigation items must be absent from the DOM for player sessions. The server/
processing core delivers a player-filtered navigation manifest; the client renders only what it
receives.

### AP-5: No breaking of browser back/forward

**Pattern:** Using `replaceState` for navigations that the user perceives as "going somewhere new",
or using `pushState` for in-page state changes (search filters, open panels) that should not be
back-navigable.
**Reason:** Breaking back/forward is one of NN/g's most-reported usability violations in SPA
applications [1]. Users rely on back as a universal "undo navigation" affordance; breaking it
destroys trust in the application's navigability.
**Rule:** Every user-initiated navigation to a new primary entity or route uses `pushState` (exactly
once per navigation). In-page state changes (panel open, filter applied) use `replaceState` or no
history change. Alias redirects use `replaceState`. The test: pressing back three times after
navigating to three entities must return the user to where they were before those three navigations,
not to a partially-loaded intermediate state.

### AP-6: No re-architecting the IA per platform profile

**Pattern:** Designing a different section structure, different section names, or different
hierarchy for Mobile vs. Desktop ("Mobile has a simplified IA").
**Reason:** Principle 5 (One IA, many surfaces). Users who switch between Desktop and Mobile (DMs
who prep on laptop and check on phone) must recognize the same concepts in the same order. A
different IA per profile creates two separate mental models, doubling the learning burden and causing
confusion when switching.
**Rule:** The nine Navigation Sections, their names, and their canonical order are identical across
all profiles. Only the *presentation surface* changes (sidebar ↔ tab bar).

### AP-7: No redundant "More" nesting on Desktop

**Pattern:** Adding a "More" overflow to the Desktop sidebar when there are more than N sections.
**Reason:** DND Tools has exactly 9 Navigation Sections — a number that fits comfortably in a 220 px
sidebar at 40 px per item (360 px total, well within a reasonable viewport height). A "More" pattern
on Desktop hides destinations and reduces information scent. It is appropriate only on the Mobile
tab bar (max 5 tabs) and Tablet portrait where space is genuinely constrained.
**Rule:** The Desktop sidebar must show all 9 Navigation Sections (8 primary + Settings) without a
"More" overflow. If the viewport is shorter than the sidebar content, the sidebar scrolls
internally; it does not collapse items.

### AP-8: No full-page redirect loops from alias resolution

**Pattern:** An alias route redirects to the canonical route, which then redirects again (e.g.,
due to authentication or another alias), creating a redirect chain visible to the user.
**Reason:** Redirect chains cause visible loading delays and may confuse users (the URL bar flashes
multiple URLs). They also break scroll restoration (the history API state is from the wrong entry).
**Rule:** Alias resolution must be atomic: one redirect, one `replaceState`, no chaining. If
authentication or profile loading is needed before rendering, that must happen as a loading state on
the canonical route, not as an additional redirect.

### AP-9: No auto-expansion of collapsed nav on hover (flyout menus on sidebar)

**Pattern:** When the sidebar is in icon-rail mode, hovering an item expands a flyout submenu
showing the full section and sub-items without the user explicitly expanding the sidebar.
**Reason:** Flyout menus on sidebars are notoriously difficult to target with a mouse (Fitts's Law:
the diagonal mouse path required to enter a flyout sub-menu is error-prone), create "accidental
expansion" problems, and are nearly impossible to use with a touch device. Microsoft's own Fluent
NavigationView documentation advises against flyout subnav for this reason [5]. VS Code abandoned
sidebar flyouts in favor of a clear expand/collapse toggle.
**Rule:** The icon-rail sidebar shows tooltips (section label only) on hover, never sub-menus.
To access local sub-navigation, the user must first expand the sidebar or navigate to the section
(which renders the local nav in Tier 2).

### AP-10: No separate keyboard-shortcuts-only documentation page as the sole discoverability path

**Pattern:** Documenting all keyboard shortcuts only in a help page linked from the footer, with no
in-product hints.
**Reason:** NN/g research on learnability shows that affordances discovered in-context have 3× higher
retention than those discovered through separate documentation [1]. Shortcuts that are not surfaced
inline (in tooltips, in command palette result rows, in the palette's shortcut help panel) are
effectively hidden from users who do not already know they exist.
**Rule:** Every keyboard shortcut must be discoverable in at least two in-product locations: (1) in
the command palette result row for the corresponding action, and (2) in the interactive shortcuts
help panel accessible via `?`. An external documentation page may supplement but must not be the
sole discovery path.

---

## 11. Success metrics

| Metric | Target | Measurement method |
|---|---|---|
| Tree-test findability — five core live-play tasks | ≥ 80% first-click success | Tree-test study with target users (DMs and players) |
| Time to navigate to any primary section | ≤ 2 s (pointer), ≤ 1.5 s (keyboard + `Alt+N`) | Usability test timing |
| Steps to any primary destination | ≤ 2 clicks/taps from any route | Route audit + usability test |
| Steps to any secondary destination | ≤ 3 clicks/taps | Route audit |
| Command palette open → result activated | ≤ 4 keystrokes (Ctrl+K + 2 chars + Enter) | Keystroke analysis |
| Navigation acknowledgment (active state update) | ≤ 100 ms from interaction | Performance timing API |
| Route transition (skeleton visible) | ≤ 200 ms | Performance timing API |
| `axe-core` landmark violations | 0 | Automated CI |
| `axe-core` contrast violations in nav | 0 | Automated CI |
| Keyboard-only navigation task completion | 100% of Must-have nav tasks completable | Manual QA with keyboard only |
| Screen reader route announcement correctness | 100% of route transitions announced | VoiceOver + NVDA manual test |
| Player DM-content leak test | 0 DM items in player nav DOM | Automated player-session DOM audit |
| Back/forward correctness | 100% (back N times = undo N navigations) | Automated routing test |
| Pinned-items persistence across sessions | 100% (items restored after reload) | Automated E2E test |
| Perceived performance (user rating) | ≥ 4.2 / 5.0 on "navigation feels fast" | Post-session survey |

---

## 12. Open questions & risks

### OQ-1: Navigation Section name finalization
The vision brief uses "Scene" as a working name for the canvas (with alternatives noted). The
Navigation Sections listed here ("Atlas", "Session", "Campaign", etc.) are proposed based on the
vision but have not been validated in a tree-test or card sort with real users. **Risk:** Wrong
labels reduce findability below the 80% target. **Mitigation:** Conduct a card sort and tree test
with 8–12 DMs and players before implementation begins.

### OQ-2: Tablet breakpoint definition for orientation detection
The spec uses "landscape" / "portrait" as proxies for the Tablet rail vs. tab-bar switch, but a
landscape tablet at 768px and a large phone in landscape at 600px may trigger the same rule
differently. **Risk:** The wrong nav surface appears on edge-case devices. **Mitigation:** Profile
selection (PLAT-001) must use capability descriptors (touch + pointer, viewport width + height)
rather than just orientation; the Tablet rail should activate based on both `width ≥ 600px AND
height ≥ 500px AND landscape`, not orientation alone.

### OQ-3: Command palette on Android without hardware keyboard
`Ctrl+K` requires a hardware keyboard. On Android touch-only, the palette button in the tab bar or
"More" sheet is the only trigger. **Risk:** The palette trigger is buried in "More" if the tab bar
is full. **Mitigation:** Reserve one of the 5 tab bar slots for a search/palette icon on Mobile
(replacing the fifth section tab, which moves to "More"). Confirm this layout in usability testing.

### OQ-4: MCP section actor availability
The vision brief states MCP can be "completely disabled". For players, MCP is listed as a section
they cannot access (DM-only in the registry). However, some MCP capabilities may be player-facing
(e.g., MCP-assisted dice, narrative suggestions visible in Session). **Risk:** Over-filtering hides
player-relevant MCP output; under-filtering leaks DM MCP config. **Mitigation:** Define the player-
visible MCP surface explicitly in `14-ai-mcp.md` and confirm whether it warrants its own nav entry
or is embedded in Session.

### OQ-5: Local nav (Tier 2) contract per section
This document defines the Tier 2 pattern (secondary panel on Desktop; segmented control on Tablet/
Mobile) but each section's local nav content is owned by its respective UX doc. **Risk:** Sections
implement incompatible local nav patterns, breaking the consistency principle. **Mitigation:** Each
section UX doc must declare its local nav contract (tabs / tree / flat list) and the nav shell must
provide a composable API for populating Tier 2 rather than each section building its own sidebar.

### OQ-6: Pinned items and role-switching mid-session
If a user's role changes mid-session (DM temporarily grants a player an elevated capability set),
pinned items previously inaccessible may become accessible, or vice versa. **Risk:** Stale pinned
items pointing to unauthorized content show "Not available" confusingly. **Mitigation:** The actor-
filtered navigation API must be reactive (not cached at session start); pinned items that become
unauthorized are visually marked "Unavailable" with a tooltip, not silently removed (to avoid
confusing disappearances).

### OQ-7: Electron / PWA in-app back button placement
PWA standalone mode and Electron hide the browser's native back button. UX-NAV-017 marks an in-app
back button as Should-have for these platforms. **Risk:** Users on PWA/Electron have no back
affordance if this is deprioritized. **Mitigation:** Classify as Must-have for any platform
profile that ships without browser chrome. Coordinate with `12-sync-offline-reliability.md` on
PWA platform scope.

---

## Sources

[1] Nielsen Norman Group — "Navigation Menu Design: Best Practices" — https://www.nngroup.com/articles/navigation-menu-design/

[2] Nielsen Norman Group — "Hamburger Menus and Hidden Navigation Hurt UX Metrics" — https://www.nngroup.com/articles/hamburger-menus/

[3] Apple Human Interface Guidelines — "Sidebars", "Tab Bars", "NavigationSplitView" — https://developer.apple.com/design/human-interface-guidelines/sidebars / https://developer.apple.com/design/human-interface-guidelines/tab-bars

[4] Material 3 — "Navigation Bar", "Navigation Rail", "Navigation Drawer", "Window size classes" — https://m3.material.io/components/navigation-bar/overview / https://m3.material.io/components/navigation-rail/overview / https://m3.material.io/foundations/layout/applying-layout/window-size-classes

[5] Microsoft Fluent / WinUI — "NavigationView" — https://learn.microsoft.com/en-us/windows/apps/design/controls/navigationview

[6] VS Code — "Command Palette" documentation — https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette / Raycast — https://www.raycast.com / Linear — https://linear.app

[7] WHATWG — HTML Living Standard — "Session history and navigation" — https://html.spec.whatwg.org/multipage/nav-history-apis.html

[8] WAI-ARIA Authoring Practices Guide (APG) — "Breadcrumb", "Tabs", "Combobox", "Dialog", "Landmark Regions", "Managing Focus in SVG and SPA" — https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/ / https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ / https://www.w3.org/WAI/ARIA/apg/patterns/combobox/ / https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ / https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/

[9] Nielsen Norman Group — "Breadcrumb Navigation Increasingly Useful" — https://www.nngroup.com/articles/breadcrumb-navigation-useful/

[10] OWASP — "Broken Object Level Authorization (BOLA)" — https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/ / OWASP Testing Guide — "Authorization Testing" — https://owasp.org/www-project-web-security-testing-guide/
