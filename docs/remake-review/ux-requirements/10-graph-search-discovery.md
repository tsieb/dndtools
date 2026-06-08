# UX Requirements — Graph, Search & Discovery

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read `00-overview-and-principles.md`
> first — it defines the shared principles, the parameter rubric, the requirement-ID scheme, the
> platform profiles, and the design tokens this document builds on.
>
> **Status:** Draft v1
> **Functional requirement coverage:** `GRAPH-001..010`, `SRCH-001..011`
> **Owner surface(s):** Graph visualization panel (`/knowledge/graph`), backlinks panel (all routes),
> global search overlay, quick-switcher overlay, search-results pane within the command palette shell,
> saved-search widgets, filter/facet controls, link-repair picker, graph legend and filter toolbar.

---

## 1. Scope

- **Covers:** Two closely related but distinct surfaces. **UX-GRAPH** governs the link-graph
  *visualization and exploration* — the force-directed or hierarchical canvas that renders nodes and
  edges, all filter/focus/expand/collapse controls on that canvas, the graph legend, hover/select
  interaction, local vs. global graph toggle, clustering and level-of-detail at scale, the backlinks
  panel as a graph-derived navigation surface, the link-repair picker (dead-link suggestions), and
  all platform adaptations of those surfaces. **UX-SRCH** governs content *discovery* — global
  full-text search, the quick switcher (title-first navigation), the search/results design within the
  command palette shell, result-row anatomy, ranking and relevance transparency, filter/operator
  controls, scoping indicators, recent/suggested items, keyboard model within search, zero-result and
  error states, freshness/stale indicators, and saved-search widgets. Actor filtering that enforces
  DM/Player/Observer visibility boundaries is covered in *both* series wherever the surface could
  leak hidden content.
- **Does NOT cover:** The command-palette shell invocation mechanics and global keybinding
  (`Cmd/Ctrl+K`) — those are owned by `02-navigation-and-platform-profiles.md`; this document owns
  the search *result design* and *filter model* rendered inside that shell. Visual design tokens
  (colors, typography, spacing) are defined in `01-visual-design-system.md` and consumed here by
  name. Graph *indexing* algorithms, backlink query APIs, and source-reconciliation mechanics are
  covered functionally in `07-graph.md` and `08-search.md`; this document specifies the *UI* for
  those capabilities. Permission grant UI is owned by `11-collaboration-permissions.md`. Calendar
  search (SRCH-010) is included in UX-SRCH but the calendar *widget* itself is owned by
  `08-sessions-live-play.md`.
- **Related functional requirements:**
  - `GRAPH-001` — Cross-source graph index; offline; player-safe hidden-node omission.
  - `GRAPH-002` — Backlinks panel; snippet redaction; visible cross-section links.
  - `GRAPH-003` — Unresolved links, orphan detection, hub notes, relationship-quality scores.
  - `GRAPH-004` — Filtered graph visualization by folder, tag, type, source, relationship, text.
  - `GRAPH-005` — Incremental graph updates; stale-state marking; repair command.
  - `GRAPH-006` — Source-agnostic query API; actor-filtered results for widgets and MCP tools.
  - `GRAPH-007` — DM-only health/coverage reports; player-safe output.
  - `GRAPH-008` — Source-specific identifiers; revision metadata; stale-partial offline display.
  - `GRAPH-009` — Calendar/time references in graph; visibility-filtered.
  - `GRAPH-010` — Link-repair picker; bulk-preview; disambiguation; capability-grant scoping.
  - `SRCH-001` — Full-text search over visible notes, objects, maps, POIs, handouts, session artifacts.
  - `SRCH-002` — Quick switcher; title-first ranking; actor-filtered commands and targets.
  - `SRCH-003` — Filter by source, type, tag, folder, date, relationship, saved search.
  - `SRCH-004` — DM saved searches; pinned to Command Center; player-safe exposure.
  - `SRCH-005` — Deterministic ranking with recency, title, tag, link, type, session-context signals.
  - `SRCH-006` — Result context: title, source, type, snippet, tags, relationship hints.
  - `SRCH-007` — Open results into correct route/viewport/heading; preserve history and params.
  - `SRCH-008` — Stable IDs in diagnostics; deterministic saved-search export/import.
  - `SRCH-009` — Index freshness and stale/partial-result indicators per domain.
  - `SRCH-010` — Calendar-date filtering; player-safe hidden-event omission.
  - `SRCH-011` — Semantic search: optional, visibility-filtered, source-cited, secondary to deterministic.
- **Related UX docs:**
  - `01-visual-design-system.md` — all color, spacing, motion, icon, and density tokens consumed here.
  - `02-navigation-and-platform-profiles.md` — command palette shell, `Cmd/Ctrl+K` invocation,
    global keyboard model; this doc owns search result UX *within* that shell.
  - `03-accessibility.md` — global a11y contract; surface-specific additions in §9 of this doc.
  - `04-canvas-scene-widgets.md` — canvas keyboard model; graph panel may be embedded as a widget.
  - `05-command-center.md` — saved-search widgets pinned to Command Center (SRCH-004).
  - `11-collaboration-permissions.md` — actor role assignment that drives all filter gates here.
  - `15-onboarding-learnability.md` — graph and search empty states as teaching surfaces.

---

## 2. UX goals for this surface

Graph and Search are the connective tissue of the content vault. The graph reveals *structure* the
user did not explicitly create — orphans, hubs, forgotten arcs, cross-source relationships. Search
surfaces *any* piece of content in under two keystrokes regardless of where it lives. Together they
are the primary mechanism by which a DM survives a session without pre-memorizing everything. The
DM/Player visibility boundary must hold absolutely: a player must not be able to infer the existence
of hidden content through autocomplete suggestions, result counts, graph node density, or error text.

| Parameter | Goal for this surface |
|---|---|
| **Visual appeal** | The graph is an atmospheric, readable network — not a hairball. Nodes use genre-appropriate color encoding (fantasy-palette token set from `01-visual-design-system.md`), legible labels at every zoom level, and clean edge routing. The search overlay is a premium "search-as-you-type" surface: dark glass-morphism card, well-spaced result rows, consistent type/source iconography. Neither surface should feel like a developer debug tool. |
| **Information scent** | Every graph node's color, shape, and label encodes its type unambiguously — never color-only. Every search result row communicates *what it is*, *where it lives*, and *why it matched* without requiring the user to open it. Filter chips show exact active scope. |
| **Navigability** | The graph is an alternative navigation surface: double-clicking a node opens the entity. Search results open directly into the correct route, viewport, and heading. Keyboard users navigate both surfaces without a mouse. ≤ 2 keystrokes to open any result from the palette. |
| **Intuition / learnability** | First-open empty states for both graph and search teach by example. The graph legend is always visible (not hidden behind a toggle). Search scope is shown before the user types (e.g., "Searching all visible content"). Filter syntax is offered via chips/menus, not undiscoverable text operators. |
| **Accessibility** | Graph canvas has a keyboard-navigable node list as its primary accessible surface. Search result list is a proper ARIA `listbox` or `role="option"` list. Contrast ≥ 4.5:1 on all labels. Focus never lost during async result updates. Motion-reduced users see no force-directed animation. |
| **Adaptability (platform profiles)** | Desktop: full graph canvas + sidebar filter panel + expandable result columns. Tablet: graph canvas with overlay filter sheet; search as full-screen overlay. Mobile: graph replaced by a backlink-list "slim" surface; search is a full-screen overlay with minimal filter controls accessible via a filter chip row. |
| **Effective emphasis (visual hierarchy)** | Selected/hovered graph nodes are immediately distinct from peers (size, ring, brightness). Search result with focus is clearly distinguished from adjacent results. Active filters are visually "on" (filled chip, distinct color) vs. inactive (ghost chip). One primary action per result row (open); secondary actions (preview, copy link) are revealed on hover/focus only. |
| **Feedback & responsiveness** | Search debounce ≤ 150 ms; results render within 300 ms for cached indexes. Graph pan/zoom responds within 16 ms (60 fps). Index staleness shown inline without blocking results. Every filter change acknowledges immediately with an updated result count or node count. |
| **Error prevention & recovery** | Search never shows a blank result list without context (zero-result state explains why and offers next steps). Graph never renders into a blank white void (empty/loading states are explicit). Filter combinations that produce zero results show which filter is responsible. Dead-link repair previews all changes before writing. |
| **Consistency** | Search result rows use the same anatomy across global search, quick switcher, and saved-search widgets. Graph node types use the same color/icon mapping as the rest of the product (entity-type tokens). Filter chip design is identical to the filter pattern used in Atlas, Session, and Characters surfaces. |

---

## 3. Researched best practices

### 3.1 Force-directed graph readability and the hairball problem

Force-directed layout (e.g., d3-force, Cola.js) produces organic, explorable graphs when node count
is low, but degrades catastrophically beyond roughly 200–300 visible nodes, producing the "hairball"
anti-pattern where overlapping edges obscure all structure [1]. Obsidian's graph view — the closest
direct precedent — defaults to showing all notes but provides depth-of-link sliders and minimum-edge
filters specifically because unfiltered vaults with thousands of notes become unreadable [2]. Roam
Research's graph view similarly collapses to a visual texture above ~500 nodes, offering no real
navigational value [3]. The implication for DND Tools: the graph must cluster nodes beyond 300
visible nodes (using a community-detection or degree-based algorithm), display cluster bubbles with
labels and member counts, and require the user to explicitly "expand" a cluster before rendering
individual nodes. This is non-negotiable above the 300-node threshold.

### 3.2 Multi-attribute encoding: beyond color-only

WCAG 2.2 Success Criterion 1.4.1 (Use of Color) prohibits conveying information by color alone [4].
Graph visualizations routinely violate this by using only color to distinguish node types. Gephi's
published graph design guidelines and academic graph-drawing literature (Purchase 2002 [5], Ware
2012 [6]) show that combining color with shape variation and size variation produces 40–60% faster
type identification than color alone and remains legible under colorblindness simulations. The
implication: DND Tools graph nodes use color + shape + (optionally) icon-badge to encode type. The
legend documents all three dimensions. Edges use dash-pattern variation in addition to color to
distinguish relationship types.

### 3.3 Level-of-detail and progressive label rendering

Sigma.js documentation and WebGL-based graph rendering research recommend rendering node labels only
when the node occupies ≥ 20 px on screen, hiding labels at lower zoom levels to prevent label
collision [7]. Obsidian's graph view implements a minimum-zoom threshold for labels (approximately
0.4× zoom) [2]. The implication: DND Tools graph renders labels conditionally based on current zoom
scale; zoomed-out views show only node shapes/colors; panning into a cluster reveals labels
progressively as nodes grow on screen.

### 3.4 Search debounce and perceived performance

Nielsen's 1994 research on response time limits identifies 100 ms as the threshold for "instant
feel," 1 s as the limit before users notice delay, and 10 s as the limit before users abandon a
task [8]. Algolia's InstantSearch documentation and benchmark data show that search-as-you-type with
a 150 ms debounce and optimistic local-index queries feels instant to users even when remote
refinement is pending [9]. The implication: DND Tools uses a 150 ms debounce on keystroke input
before firing the query engine, shows cached results immediately (with stale indicators), and
overlays remote-freshened results without layout shift.

### 3.5 Result anatomy: title + context + type + source

Nielsen Norman Group's research on search result pages establishes that users need title, a brief
context excerpt (showing the search term in context), and source/type metadata to evaluate relevance
without opening each result [10]. Notion's search and Slack's search both include: matched title,
type icon, workspace/channel/source, and a short snippet with the search term highlighted. DocSearch
(Algolia) adds a breadcrumb-style hierarchy path above the title. The implication: every DND Tools
search result row must expose all four signals: title (with match highlight), type icon, source
label, and a snippet of ≤ 120 characters with the matching term highlighted and surrounding context.

### 3.6 Search scoping and "searchbox anatomy"

NN/g research on enterprise and intranet search shows that users frequently do not know *what* is
being searched, leading to false negatives ("it's not here") when the scope excluded their target
[10]. Slack and Notion both address this with a persistent scope chip at the leading edge of the
search field (e.g., "In: #general", "In: Engineering wiki"). The cmdk library (used in Vercel,
Raycast web, and many SaaS tools) surfaces active group/page context in a "breadcrumb" above the
input [11]. The implication: DND Tools search overlays must show the current search scope (e.g.,
"All visible content", "Notes · Atlas only", "Session #12") as a chip or inline label that the user
can tap to change.

### 3.7 Keyboard model for search overlays

VS Code's command palette, Raycast, and Linear all implement the same keyboard contract for
search overlays: `ArrowDown`/`ArrowUp` moves through results; `Enter` opens the focused result;
`Escape` closes without navigation; `Tab` (if applicable) moves focus into a filter group; `Ctrl+N`/
`Ctrl+P` as Emacs-style alternatives to arrow keys [12]. The cmdk library formalizes this contract
in its API documentation. The implication: DND Tools must implement this exact keyboard contract for
both global search and quick switcher — no deviation, because users muscle-memorize it from other
tools.

### 3.8 Actor-filtered search: timing attacks and count inference

OWASP's guide on Information Disclosure vulnerabilities documents that returning different result
*counts* or different *response times* for queries that match hidden content allows an adversary to
infer the existence of hidden resources through differential analysis [13]. Slack's "DM you can't
see" problem — where a reply count badge revealed a hidden thread — illustrates this in a product
context. The implication: DND Tools must return identical result counts, identical timing, and
identical empty-state messages regardless of whether hidden content matches the query. The backend
must apply visibility filtering *before* counting; the frontend must never receive a "redacted count"
that exposes the number of hidden items.

### 3.9 Graph as navigation vs. graph as decoration

Logseq's graph view is cited in user research as "visually impressive but rarely navigated" — users
open it once, admire it, and return to linear list views for actual navigation [3]. Obsidian's graph
view has the same criticism: it is used for discovery and analysis, not routine navigation [2]. The
implication: DND Tools must not position the graph as the primary navigation surface. It must be
clearly labeled as a *discovery/analysis* view with an explicit path back to list-based navigation.
Double-clicking a node opens the entity, but routine navigation (go to this note) should feel faster
via search or direct nav links.

### 3.10 Mobile graph degradation

Force-directed graphs on mobile viewports (< 600px) suffer from three compounding problems: small
touch targets on nodes (often < 20px), accidental pan triggering node selection, and the canvas
monopolizing the screen with no room for filter controls [2][7]. Obsidian mobile replaced its graph
view entirely with a backlinks/outgoing-links panel for vault navigation. The implication: on Mobile,
DND Tools degrades the graph canvas to a structured backlink list (slim surface) and hides the
force-directed canvas entirely. Tablet portrait shows a simplified canvas with a floating filter
button; Tablet landscape shows the full Desktop graph with a narrower filter sidebar.

---

## 4. Reference implementations (exemplars)

| Product | What they do well (specific) | Principle / why it works | Borrow / Avoid | Link |
|---|---|---|---|---|
| **Obsidian Graph View** | Depth slider, node-type color filters, orphan toggle, local vs. global toggle, minimum-link threshold to reduce hairball; force-directed with GPU-accelerated canvas | Most direct precedent for a content-graph in a knowledge tool; progressive filtering reduces visual noise | Borrow: depth/threshold sliders, local graph mode, orphan toggle; Avoid: no clustering above ~500 nodes (hairball still appears in Obsidian) | https://help.obsidian.md/Plugins/Graph+view |
| **Roam Research Graph** | Shows full bidirectional link graph; color by page type; click-to-navigate | Proves graph-as-navigation is learnable; color encoding by page type | Borrow: color-by-type encoding; Avoid: no level-of-detail or clustering (unreadable at scale) | https://roamresearch.com |
| **Raycast** | Command palette with result groups (Applications, Files, Recent), type icons, keyboard-shortcut hints on every result, recency weighting, `Cmd+K` anywhere | Proves palette-first UX is fast and learnable; result group labeling prevents "what does Enter do?" confusion | Borrow: result group headers, type icons, keyboard shortcut hints in results, recency weighting | https://raycast.com |
| **Linear Command Menu** | `Cmd+K` with fuzzy search, category headers (Navigate, Create, Actions), recent items at top, `Escape` always closes, keyboard navigation with arrow keys | Best-in-class command palette UX; category separation prevents cognitive overload | Borrow: category headers, recent-at-top, Escape semantics; result anatomy (icon + title + shortcut hint) | https://linear.app |
| **Algolia DocSearch** | Hierarchical results (lvl0 › lvl1 › snippet), type icons per source, match highlighting in title and snippet, keyboard navigation (`↑↓` / `Enter` / `Escape`) | Shows how to handle multi-source, hierarchical content in a search UI | Borrow: hierarchical breadcrumb in results, match highlighting, multi-level result anatomy | https://docsearch.algolia.com |
| **Notion Search** | Scope chip ("In: Space name"), type filters (Page, Database, Comment), result rows with icon + title + path + snippet, recent-without-query | Scope chip eliminates "what am I searching?" confusion; shows recent items before the user types | Borrow: scope chip pattern, recent items pre-query, path breadcrumb in result row | https://notion.so |
| **VS Code Command Palette** | `>` prefix for commands vs. bare text for file search; `@` for symbol search; result rows with type icon + title + file path + keyboard shortcut; grouped by type | Multi-mode palette distinguishes navigation from action from symbol lookup | Borrow: mode-prefix disambiguation, grouped results with type headers; Avoid: VS Code's reliance on memorized mode-prefix syntax (offer visual mode chips instead) | https://code.visualstudio.com |
| **Sigma.js** | WebGL-accelerated graph with level-of-detail label rendering, cluster support, hover-highlight subgraph, programmatic camera | Technical reference for performant graph rendering at scale (>5000 nodes demonstrated) | Borrow: LOD label threshold (~20px node size), subgraph highlight on hover, cluster bubble rendering | https://www.sigmajs.org |

**North-star narratives:**

**Obsidian Graph View (graph visualization):** The single most important lesson from Obsidian is
that graph filters must be available *alongside* the canvas, not behind a separate settings screen.
The depth slider, node-color toggles, and minimum-link threshold in Obsidian's left sidebar are what
transform the graph from decoration into an analytical tool. DND Tools must implement an equivalent
always-visible filter sidebar on Desktop. The lesson DND Tools must *not* borrow is Obsidian's
absence of clustering — vaults above ~300 notes become hairballs that Obsidian's filters can only
partially fix. DND Tools must cluster proactively.

**Raycast + Linear (search and command palette result design):** These two products define the
current state of the art for command palette UX. The shared pattern: result rows are narrow but
information-dense (icon + title + right-aligned shortcut hint or source label); results are grouped
by category with a text header; recent items appear at the top before the user types; arrow keys and
Enter are the only navigation required. DND Tools must adopt this result anatomy precisely. The
quality bar is: a new user who has used Raycast or Linear needs zero learning time to use the DND
Tools search overlay.

**Algolia DocSearch (result anatomy at hierarchy depth):** DND Tools content has deep source
hierarchy (Vault › Folder › Note › Heading) and multiple source types (local, Obsidian, Google
Docs). DocSearch proves that a hierarchical breadcrumb *above* the title (in smaller, muted type)
disambiguates results from different sources without crowding the title line. Combined with a type
icon and a source badge, each result row is self-describing. DND Tools must adopt this three-line
result anatomy (breadcrumb / title+icon / snippet) for global search results.

---

## 5. UX/UI requirements

### UX-GRAPH-001 — Graph canvas with force-directed layout and GPU acceleration

- **Requirement:** The graph view shall render a force-directed node-link diagram of all visible
  graph nodes and edges, using GPU-accelerated canvas (WebGL preferred, Canvas2D fallback) to
  maintain ≥ 30 fps at 300 visible nodes and ≥ 15 fps at 1000 visible nodes (after clustering).
- **Rationale:** GRAPH-004; sigma.js performance benchmarks [7]; 60 fps canvas rendering is
  achievable at this node count with WebGL and is the correct performance floor for a tool used
  during live play.
- **Spec:**
  - Canvas fills the graph panel area with a dark background (`--color-surface-graph` token, default
    `#0e0e12` in dark theme).
  - Pan: click+drag (pointer) or two-finger drag (touch). Zoom: scroll wheel (pointer) or pinch
    (touch), range 0.1×–4× with smooth interpolation.
  - Default layout: force-directed with repulsion force preventing node overlap; edge length
    proportional to link type weight (configurable in settings).
  - Simulation runs until energy drops below threshold (≤ 2 s for typical 100-node graph); after
    convergence, nodes are pinned unless user explicitly resets layout.
  - Layout reset button: top-right corner of canvas, icon `refresh-layout`, tooltip "Reset layout".
- **States:**
  - Loading: skeleton shimmer overlay with "Building graph…" text and a determinate progress bar
    if index is being built; indeterminate spinner if awaiting API response < 2 s.
  - Rendered: canvas live.
  - Stale: a 24 px amber banner below the toolbar reading "Graph index is partial — [sources list]
    unavailable. Showing cached data." with a "Refresh" button.
  - Empty (no visible nodes): illustrated empty state (see UX-GRAPH-010).
  - Error: inline error card with message and "Retry" button; never a blank canvas.
- **Platform profiles:**
  - Desktop (≥ 1024px): graph panel is a full-page route (`/knowledge/graph`) with a persistent
    filter sidebar (240 px, left of canvas). Can also be embedded as a widget in the Command Center
    canvas (slim variant, no sidebar — filter toolbar collapses to a top strip).
  - Tablet (600–1024px): full-page route; filter sidebar replaced by a floating "Filters" button
    (bottom-right of canvas) that opens a bottom sheet with filter controls.
  - Mobile (< 600px): graph canvas is NOT rendered. The `/knowledge/graph` route shows the slim
    backlink-list surface (UX-GRAPH-009). A persistent banner explains "Graph view is available on
    tablet and desktop" with a link to the backlinks panel.
- **Input:** pointer: click-drag pan, scroll zoom, click node, double-click node to open; touch:
  two-finger pan, pinch zoom, tap node, double-tap node to open; keyboard: see UX-GRAPH-007.
- **Accessibility:** The canvas is `role="application"` with `aria-label="Link graph"`. A keyboard-
  navigable node list (UX-GRAPH-007) is the primary accessible alternative to the visual canvas. The
  canvas provides `aria-describedby` pointing to a visually hidden description of the current graph
  state (node count, edge count, active filters).
- **Acceptance criteria:**
  - Given a vault with 100 visible nodes, when the graph renders, then frame rate is ≥ 30 fps during
    panning, measured with browser performance tools.
  - Given the user is on Mobile (< 600px), when they navigate to `/knowledge/graph`, then the canvas
    is absent and the backlink-list slim surface renders instead.
  - Given the graph index is stale, when the canvas renders, then the amber stale banner is visible
    and the canvas still shows cached data without blocking.
- **Priority:** Should-have (functional GRAPH-004 is Should-have; canvas rendering is its UX impl)

---

### UX-GRAPH-002 — Node encoding: color + shape + icon-badge (never color-only)

- **Requirement:** Each graph node type shall be encoded by a unique combination of color, shape,
  and optional icon-badge so that the type is identifiable without relying on color alone.
- **Rationale:** WCAG 2.2 SC 1.4.1 [4]; graph-drawing research [5][6]; DND Tools serves colorblind
  users and must pass a grayscale contrast test.
- **Spec — node type encoding table (normative):**

  | Entity type | Shape | Color token | Icon-badge |
  |---|---|---|---|
  | Note (local) | Circle | `--graph-node-note` | none |
  | Note (Obsidian) | Circle | `--graph-node-note-obsidian` | small obsidian icon |
  | Note (Google Docs) | Circle | `--graph-node-note-gdocs` | small G-doc icon |
  | Map / Atlas | Diamond | `--graph-node-map` | `map` icon |
  | Character | Square (rounded) | `--graph-node-character` | `person` icon |
  | POI | Pentagon | `--graph-node-poi` | `pin` icon |
  | Session artifact | Hexagon | `--graph-node-session` | `bolt` icon |
  | Handout | Circle + border | `--graph-node-handout` | `scroll` icon |
  | Unresolved link | Circle (dashed outline) | `--graph-node-unresolved` | `?` badge |
  | Orphan note | Circle (faded fill) | `--graph-node-orphan` | none |

  - Node default diameter: 12 px (min) to 24 px (max), scaled by degree (number of edges). Hub
    notes (degree ≥ 10) get a subtle outer glow (`--graph-node-hub-glow`).
  - Icon-badge: 8 × 8 px, rendered at top-right of node, only when node diameter ≥ 16 px.
  - Labels: rendered only when node diameter ≥ 10 px on screen (zoom-adjusted); font size 10–12 px,
    `--font-mono-small`, truncated at 24 characters with ellipsis.
- **States:**
  - Default: per table above.
  - Hover: node scales to 1.2×, label always visible (overrides zoom threshold), tooltip shows full
    name + type + degree count.
  - Selected (clicked): node scales to 1.4×, 2 px ring in `--color-accent-primary`, connected edges
    brighten to full opacity; all non-connected nodes and edges dim to 20% opacity.
  - Focus-visible (keyboard): 2 px focus ring in `--color-focus-ring` (matches global focus style).
- **Platform profiles:** Identical encoding on Desktop and Tablet canvas. Not applicable on Mobile
  (canvas not rendered; backlink list uses the same type icons from `01-visual-design-system.md`).
- **Input:** Encoding is visual; no input-specific variance.
- **Accessibility:** The node-list alternative (UX-GRAPH-007) must display the shape name and color
  name in visually hidden text for each node so screen reader users understand type without seeing
  the graph. The legend (UX-GRAPH-003) must also be reachable via keyboard.
- **Acceptance criteria:**
  - Given the graph renders, when a grayscale filter is applied to the viewport, then each node type
    remains distinguishable by shape alone (no two types share the same shape).
  - Given a colorblind user views the graph, when the type legend is open, then shape + label alone
    identify each type without relying on color perception.
  - Given a hub note (degree ≥ 10) is in the graph, when rendered, then it is visually larger than
    its peers and has the hub glow applied.
- **Priority:** Must-have

---

### UX-GRAPH-003 — Graph legend: always visible, interactive filter toggles

- **Requirement:** The graph shall display a persistent legend panel showing all rendered node types
  and edge types, with toggle controls to show/hide each type, and a distinct visual encoding for
  "type hidden" vs. "type visible."
- **Rationale:** Without a legend, multi-attribute node encoding is not learnable [6]. Obsidian
  provides legend-like color filters in its graph settings panel but buries them; DND Tools must
  make the legend a first-class, always-open panel [2].
- **Spec:**
  - Location: bottom-left corner of graph canvas, 200 px wide, max-height 320 px with internal
    scroll if needed.
  - Node types section: one row per type — shape swatch (16 × 16 px) + color dot (8 × 8 px) + type
    label + count of visible nodes of that type + toggle checkbox. Active toggle: full opacity row;
    inactive toggle: row at 40% opacity with strikethrough on count.
  - Edge types section: one row per relationship type — dash-pattern swatch (32 × 8 px) + color dot
    + type label + toggle. Edge types: Wikilink (solid), Embed (dotted), Tag-shared (dashed),
    Object-reference (long-dash), Map↔POI (double-line), Unresolved (faded solid).
  - Legend header: "Graph Legend" in `--font-label-small`, with a collapse chevron to minimize the
    legend to a 32 × 32 px icon button when canvas space is limited.
  - Toggling a type immediately re-renders the canvas (no "Apply" step).
- **States:**
  - Type visible: full opacity, checkbox checked.
  - Type hidden: 40% opacity row, checkbox unchecked, nodes/edges of that type removed from canvas.
  - Collapsed: legend replaced by a `?` icon button with tooltip "Show graph legend".
- **Platform profiles:**
  - Desktop: legend always shown, collapsed by user choice.
  - Tablet: legend collapsed by default; floating `?` button in bottom-left; tap to expand as
    bottom-sheet overlay.
  - Mobile: N/A (canvas not rendered).
- **Input:** pointer: click toggle; touch: tap toggle; keyboard: Tab into legend, Space to toggle
  each checkbox, `Escape` collapses legend.
- **Accessibility:** Each toggle row is `role="checkbox"` with `aria-checked`, `aria-label` of
  "{type} nodes: visible/hidden". Legend region is `role="group"` with `aria-label="Graph legend"`.
- **Acceptance criteria:**
  - Given the graph renders with multiple node types, when the legend is visible, then every distinct
    node type shown in the canvas has a corresponding legend row.
  - Given the user unchecks "Character" in the legend, when re-render completes, then no Character
    nodes are visible in the canvas and the Character row shows 0 in its count.
  - Given a keyboard user Tabs to the legend, when they navigate rows with arrow keys and press Space,
    then the corresponding node type toggles without requiring a mouse.
- **Priority:** Should-have

---

### UX-GRAPH-004 — Filter sidebar: folder, tag, type, source, relationship, text

- **Requirement:** The graph shall provide a filter sidebar (Desktop) or filter sheet (Tablet) with
  controls for folder scope, tag filter, node-type filter, source filter, relationship-type filter,
  isolated-node toggle, and visibility-safe text filter; all filters compound (AND logic) with
  immediate re-render.
- **Rationale:** GRAPH-004; Obsidian's graph filter panel [2]; compound filtering is the primary
  mechanism for reducing hairball complexity without discarding structure.
- **Spec:**
  - Sidebar width: 240 px fixed on Desktop, full-width sheet on Tablet.
  - Filter sections (collapsible, expanded by default):
    1. **Search text** — single-line input, placeholder "Filter by name…", debounce 150 ms. Matches
       node labels (title/name). Does NOT leak hidden node titles to players.
    2. **Node types** — checkbox group matching legend (same type list). "All types" is the default.
    3. **Source** — checkbox group: Local, Obsidian, Google Docs, All. Unavailable sources shown
       greyed with "(unavailable)" suffix.
    4. **Folder** — tree-picker or flat searchable list of visible folders. "All folders" default.
    5. **Tags** — multi-select chip input. Shows only tags present on visible nodes.
    6. **Relationship types** — checkbox group matching edge types in legend.
    7. **Show isolated nodes** — toggle switch, default OFF. When ON, nodes with no visible edges
       (orphans) are included.
    8. **Depth from selection** — integer stepper 1–5, active only when a node is selected. Default
       2. Limits the subgraph rendered to N hops from the selected node (local graph mode).
  - Active filter count badge on the "Filters" button (Tablet) showing N active non-default filters.
  - "Clear all filters" button at bottom of sidebar, disabled when all filters are at defaults.
  - Filter state is preserved in URL parameters so deep links restore the filtered graph view.
- **States:** Each filter control follows its component state matrix from `01-visual-design-system.md`
  (checkbox, toggle, stepper, chip-input). Active filter chips in Tablet bottom sheet show filled
  state.
- **Platform profiles:**
  - Desktop: sidebar always visible to the left of canvas; collapsible to 0 width via drag handle.
  - Tablet: floating "Filters" button (bottom-right, 44 × 44 px, `filter` icon + badge count) opens
    a bottom sheet (max-height 60vh) with all controls; "Apply" button not needed — changes are live.
  - Mobile: N/A.
- **Input:** pointer/touch: standard control interactions; keyboard: Tab through controls, arrow
  keys in tree-picker, Space for checkboxes, Enter for text filter.
- **Accessibility:** Filter sidebar is `<aside role="complementary" aria-label="Graph filters">`.
  Each section is `<fieldset>` with `<legend>`. The depth stepper has `role="spinbutton"`.
- **Acceptance criteria:**
  - Given the user sets a tag filter to "npc", when the graph re-renders, then only nodes tagged
    "npc" and their visible edges appear.
  - Given a player is logged in, when they type "dragon" in the text filter, then nodes whose titles
    match "dragon" appear only if those nodes are visible to players; no hidden-node title leaks.
  - Given three filters are active, when the user clicks "Clear all filters", then all filters reset
    to defaults and the full visible graph renders within 300 ms.
- **Priority:** Should-have

---

### UX-GRAPH-005 — Local graph mode: focus + expand/collapse

- **Requirement:** The graph shall support a "local graph" mode that, given a selected node (or the
  currently open entity), renders only the subgraph within N hops, with controls to expand/collapse
  individual edge sets.
- **Rationale:** GRAPH-002, GRAPH-004; local graph mode is Obsidian's most-used graph feature
  because it provides meaningful context without visual overload [2].
- **Spec:**
  - Activation: selecting any node while "Depth from selection" stepper > 0 switches to local mode.
    The canvas dims non-local nodes before removing them over a 200 ms fade. A "Local graph: [Node
    name]" badge appears in the top-left of the canvas.
  - Exit: clicking the badge or pressing `Escape` returns to global graph with all previously visible
    nodes restored.
  - Expand/collapse edges: hovering a node in local mode shows a `+` / `−` button (20 × 20 px) at
    the node's leading edge. Clicking `+` increases depth by 1 from that node, adding its neighbors.
    Clicking `−` collapses to one fewer hop from that node.
  - Maximum depth in local mode: 5. The depth stepper in the filter sidebar controls the initial
    depth; individual node expand/collapse overrides per-node.
  - Backlinks panel integration: when an entity is open in the main content area, the graph widget
    (if present in the Command Center) auto-enters local mode for that entity, depth 2, without
    requiring the user to first select a node.
- **States:**
  - Global mode: all visible nodes rendered.
  - Local mode: subgraph only; badge shown; non-local nodes faded out during 200 ms transition.
  - Expanding: nodes appear with a 150 ms fade-in; edges animate from length 0.
  - Collapsing: nodes fade out over 150 ms; edges retract.
- **Platform profiles:**
  - Desktop / Tablet: full local graph canvas as above.
  - Mobile: local mode is represented by the backlinks list for the current entity (UX-GRAPH-009).
- **Input:** pointer: click node, click `+`/`−`; touch: tap node, tap `+`/`−`; keyboard: `Enter`
  on selected node to enter local mode, `+`/`-` keys to adjust depth, `Escape` to exit.
- **Accessibility:** Local mode badge has `role="status"` and announces "Local graph: [name], depth
  [N]" to screen readers when activated. The `+`/`−` expand buttons have `aria-label="Expand
  neighbors of [node name]"` / `"Collapse [node name]"`.
- **Acceptance criteria:**
  - Given a node is selected and depth is 2, when local mode activates, then only nodes within 2
    edges of the selected node are visible and all others are removed from canvas.
  - Given local mode is active, when the user presses `Escape`, then global mode restores and the
    canvas returns to the pre-selection view within 300 ms.
  - Given a DM selects a hidden node in the DM-only graph, when a player view is active, then the
    hidden node and its local subgraph are entirely absent from the player's graph canvas.
- **Priority:** Should-have

---

### UX-GRAPH-006 — Clustering above 300 visible nodes

- **Requirement:** When the number of nodes that would be rendered exceeds 300, the graph shall
  automatically cluster nodes by community (tag cluster, folder cluster, or degree cluster) and
  render cluster bubbles with member counts instead of individual nodes, requiring explicit
  user interaction to expand a cluster.
- **Rationale:** Force-directed hairball problem [1]; Obsidian does not solve this above ~300 nodes
  [2]; DND Tools must not ship the same defect.
- **Spec:**
  - Threshold: 300 visible nodes. When a filter change or zoom action would expose > 300 nodes,
    clustering engages automatically.
  - Cluster algorithm (default): folder-based grouping (same top-level folder → same cluster). If
    folder information is unavailable, fall back to tag-based, then degree-based.
  - Cluster bubble: ellipse shape, size proportional to member count (min 40 px width, max 120 px
    width). Label: "{folder/tag name} · {N} nodes". Fill: blended color of member node colors.
  - Expand cluster: double-click (pointer) or Enter (keyboard) on cluster bubble expands it in
    place, rendering its member nodes within the bubble's bounding area. Other clusters remain
    collapsed. If expanding would exceed 300 total visible nodes, show a confirmation: "Showing
    {N} nodes. Performance may be affected. Continue?"
  - Re-cluster: clusters reform when the user zooms out past a threshold where node labels would be
    < 6 px on screen.
  - A "Clustering active" notice chip appears below the toolbar when clusters are shown, with a
    link to graph-settings to adjust the threshold.
- **States:**
  - Clustered: bubble shown, members hidden.
  - Expanding: 300 ms ease-out scale animation as member nodes appear within bubble.
  - Expanded: member nodes visible, bubble outline remains as a faint boundary.
  - Performance warning dialog: modal with "Continue" / "Keep clusters" buttons.
- **Platform profiles:** Tablet uses the same clustering logic. Mobile: N/A.
- **Input:** pointer: double-click cluster; touch: double-tap cluster; keyboard: Tab to cluster,
  Enter to expand.
- **Accessibility:** Cluster bubble is `role="button"` with `aria-label="{name} cluster, {N}
  nodes. Press Enter to expand."`. When expanded, focus moves to the first member node.
- **Acceptance criteria:**
  - Given a vault with 400 visible nodes, when the graph renders without filters, then cluster
    bubbles appear and fewer than 300 individual nodes are rendered.
  - Given the user double-clicks a cluster of 80 notes, when expansion completes, then all 80 nodes
    are visible within the cluster boundary.
  - Given expanding a cluster would bring total nodes to 380, when the user initiates expansion,
    then the performance-warning dialog appears before rendering.
- **Priority:** Should-have

---

### UX-GRAPH-007 — Keyboard-navigable node list as accessible graph alternative

- **Requirement:** The graph panel shall provide a keyboard-accessible node list (table or listbox)
  that replicates all node interaction (select, open, filter) without requiring the canvas, serving
  as the primary accessible surface for keyboard-only and screen-reader users.
- **Rationale:** WCAG 2.2 SC 1.3.1, 2.1.1 [4]; a `role="application"` canvas cannot expose its
  content to assistive technology without a DOM-based alternative.
- **Spec:**
  - Toggle: "Node list" button in the graph toolbar (icon `list`, label "List view"), keyboard
    shortcut `Alt+L` on Desktop.
  - Layout: replaces the canvas with a data table. Columns: Type icon, Name, Source, Edge count,
    Tags. Sortable by Name (default), Edge count, Type.
  - Row interaction: click/Enter opens entity; Shift+click selects multiple; selected rows highlight
    their edges in the canvas (if canvas is also visible in a split layout).
  - Search within list: standard text filter field at top of the list panel.
  - List reflects active graph filters: folder, tag, type, source filters from the filter sidebar
    apply to the list as well.
  - Canvas + list split: on Desktop ≥ 1280px, "Split" button allows canvas left (60%) + list right
    (40%) simultaneously.
- **States:** row default, hover, focused (outline), selected, opened (bold name).
- **Platform profiles:**
  - Desktop: toggle between canvas-only, list-only, or split (≥ 1280px).
  - Tablet: toggle between canvas and list (no split).
  - Mobile: list is the *default and only* view (no canvas).
- **Input:** keyboard: Tab to list, `↑↓` to move rows, `Enter` to open, `Space` to select, `Ctrl+A`
  to select all visible, `Escape` returns focus to toolbar.
- **Accessibility:** Table has `role="grid"`, column headers `role="columnheader"` with
  `aria-sort`, rows `role="row"`, cells `role="gridcell"`. Screen reader announces "Node list,
  {N} nodes" when view activates.
- **Acceptance criteria:**
  - Given a keyboard-only user opens the graph panel, when they activate "List view", then all
    visible nodes appear as rows navigable with arrow keys.
  - Given the user presses Enter on a row, when navigation completes, then the entity opens in the
    correct route and history is updated.
  - Given a screen reader user activates the graph panel, when they Tab into the node list, then
    the screen reader announces the node name, type, and edge count for the focused row.
- **Priority:** Must-have

---

### UX-GRAPH-008 — Graph health indicators: orphans, unresolved links, hub notes

- **Requirement:** The graph shall visually surface graph-health issues — orphan nodes, unresolved
  links, and hub notes — using distinct encoding, with a DM-accessible health summary panel.
- **Rationale:** GRAPH-003, GRAPH-007; surfacing health issues in the visualization turns the graph
  into an active campaign-maintenance tool, not just a view.
- **Spec:**
  - Orphan nodes (zero edges after filtering): rendered with faded fill (30% opacity), dashed
    outline. "Show orphans" toggle in filter sidebar (UX-GRAPH-004) controls their visibility.
  - Unresolved wikilinks: rendered as dashed-outline circle with `?` icon-badge (per UX-GRAPH-002
    type table). Clicking opens the link-repair picker (UX-GRAPH-011).
  - Hub notes (degree ≥ 10): outer glow ring in `--graph-node-hub-glow`. Hovering shows degree
    count in tooltip ("12 connections").
  - Health summary panel (DM only): accessible via "Graph Health" button in graph toolbar.
    Panel shows: orphan count, unresolved link count, duplicate-title count, and a deterministic
    health score (0–100). Each count is a link that filters the graph to show only those nodes.
    Player actors do not see the health button or panel.
  - Score label: "{score}/100 — Last checked {relative time}". Recalculated on graph load and after
    incremental updates.
- **States:** Health panel: default (score shown), loading (spinner), stale (amber badge on button).
- **Platform profiles:** Desktop/Tablet: health panel as slide-in drawer from graph toolbar.
  Mobile: N/A (canvas not rendered; health summary accessible via Settings › Graph Health on Mobile).
- **Input:** pointer: click "Graph Health" button; keyboard: `Alt+H` opens health panel from graph
  view.
- **Accessibility:** Health panel is `role="dialog"` with `aria-label="Graph health summary"`.
  Score is announced via live region when panel opens.
- **Acceptance criteria:**
  - Given an orphan note exists in the vault, when the graph renders with "Show orphans" ON, then
    the orphan note node uses faded fill and dashed outline.
  - Given the DM opens the graph health panel, when it renders, then orphan count and unresolved
    link count are both correct and each links to a filtered graph view.
  - Given a player opens the graph view, when the toolbar renders, then the "Graph Health" button
    is absent from the DOM (not merely visually hidden).
- **Priority:** Should-have

---

### UX-GRAPH-009 — Mobile slim surface: backlinks list replaces graph canvas

- **Requirement:** On Mobile (< 600px), the graph surface shall be replaced by a structured
  backlinks and outgoing-links list that provides the same navigational value without a canvas.
- **Rationale:** Mobile graph readability research [10]; Obsidian mobile approach [2]; GRAPH-002.
- **Spec:**
  - Route: `/knowledge/graph` on Mobile renders the slim surface.
  - Layout: two sections — "Backlinks" (notes linking to current entity) and "Outgoing links"
    (notes this entity links to). Each section is a collapsible accordion, expanded by default.
  - Each link row: 44 px height, type icon (20 × 20 px) + note title + source badge + chevron.
    Tapping opens the linked entity.
  - Snippet: collapsible; tapping the row expands a 2-line snippet below the title showing the link
    context (visible content only, no hidden snippets).
  - Filter chip row above the list: "All", "Notes", "Maps", "Characters", "Sessions" — single
    select, scrollable horizontally. 36 px chip height.
  - Empty state for each section: "No backlinks yet — link to this note from another to see them
    here." with a button "Open graph on desktop".
  - Banner at top of page: "Full graph view is available on tablet and desktop."
- **States:** each row: default, pressed (ripple), expanded (snippet visible).
- **Platform profiles:** Mobile only. Tablet and Desktop: this slim surface is not shown (canvas
  is used instead).
- **Input:** touch: tap row to open, tap row to expand snippet; keyboard (external): arrow keys to
  move rows, Enter to open, Space to expand snippet.
- **Accessibility:** Each section is `<section>` with a `<h2>` heading. Each row is `role="button"`
  with `aria-expanded` for the snippet toggle. Snippet content is `role="region"` with
  `aria-label="Link context for [note name]"`.
- **Acceptance criteria:**
  - Given a Mobile user navigates to `/knowledge/graph`, when the page loads, then the backlink list
    renders (not a canvas), the banner is shown, and all link rows are tappable.
  - Given a link from a DM-hidden note, when a player views the backlinks list, then that link row
    is absent.
- **Priority:** Must-have (Mobile parity for GRAPH-002)

---

### UX-GRAPH-010 — Graph empty and sparse states

- **Requirement:** The graph shall display instructive empty states when no nodes exist, when all
  nodes are filtered out, or when the graph is sparse (< 5 nodes), teaching the user how to
  populate or adjust the view.
- **Rationale:** Principle 4 (Progressive disclosure); principle §3 (Information scent); `15-
  onboarding-learnability.md` — empty states are teaching moments.
- **Spec:**
  - **No nodes at all (fresh vault):** Centered illustration (topic: a constellation forming from
    sparse stars) + heading "Your knowledge graph starts here" + body "Create notes, link them with
    [[wikilinks]], and connections will appear here." + CTA button "Create your first note".
  - **All nodes filtered out:** Icon (filter with X) + heading "No nodes match your filters" + body
    listing the active filters (e.g., "Folder: /npcs · Tag: dragon") + two buttons: "Clear filters"
    and "Adjust filters".
  - **Sparse graph (1–4 nodes, no edges):** Normal canvas renders but shows a contextual tip card
    (dismissible, bottom-center): "Add [[wikilinks]] between notes to see relationships form."
  - **Player with all content hidden:** Illustrated empty state (opaque, no data leakage) + "No
    visible content in the graph. Content will appear as the DM shares it with you."
- **States:** Static (no animation required; respect `prefers-reduced-motion`).
- **Platform profiles:** Desktop/Tablet: empty state centered in canvas area. Mobile: empty state
  in the backlinks list area.
- **Input:** CTA buttons: pointer click, touch tap, keyboard Enter.
- **Accessibility:** Empty state is a `<section role="status">` with appropriate heading levels.
  CTA buttons are standard `<button>` elements.
- **Acceptance criteria:**
  - Given a fresh vault with no notes, when the user opens the graph, then the "starts here" empty
    state renders with the CTA button and no canvas.
  - Given all filter controls eliminate all visible nodes, when the canvas re-renders, then the
    "No nodes match" state renders with the active filter list and "Clear filters" button.
  - Given a player with no visible content opens the graph, when the page loads, then the player-
    specific empty state renders with no hidden node count or title visible.
- **Priority:** Must-have

---

### UX-GRAPH-011 — Link-repair picker: dead-link disambiguation without hidden-target leakage

- **Requirement:** When an unresolved wikilink node is selected in the graph or flagged in the
  backlinks panel, a link-repair picker shall open showing candidate targets, a preview of each
  candidate, and a confirm-before-write flow; hidden targets must be excluded from suggestions for
  non-DM actors.
- **Rationale:** GRAPH-010; GRAPH-003; principle 8 (Safe by default).
- **Spec:**
  - Trigger: clicking an unresolved-link node (`?` badge) in the graph or a "Repair" action in the
    backlinks panel opens the picker as a modal dialog.
  - Picker layout: two columns. Left: list of candidate targets (title + source + type icon, ≤ 8
    candidates, scrollable if more). Right: preview pane showing the first 200 characters of the
    selected candidate.
  - Candidate ranking: deterministic — exact title match first, then alias match, then fuzzy title
    match. No AI suggestions unless AI is enabled.
  - "Repair link" button: enabled only when one candidate is selected. Click shows a diff preview:
    old link text → new resolved link, affected note name, and warning if the repair affects more
    than one occurrence ("3 occurrences in this note — all will update").
  - Confirm-and-write: "Confirm repair" button. After write, graph and search indexes update
    incrementally; picker closes; focus returns to the graph node (now resolved).
  - Bulk repair (DM only): accessible from graph health panel. Shows a table of all unresolved
    links with candidate matches, each checkable. "Preview all" button shows full diff before any
    write. "Apply selected" writes only checked repairs.
- **States:** picker: loading candidates (spinner), candidates loaded, candidate selected (preview
  shown), confirming (button spinner), success (toast "Link repaired — [old] → [new]"), error
  (inline error with retry).
- **Platform profiles:** Desktop/Tablet: modal dialog (560 px wide, max-height 80vh). Mobile: full-
  screen sheet with left/right sections stacked vertically.
- **Input:** pointer: click candidate, click "Repair"; keyboard: arrow keys to move candidates,
  Enter to select, `Tab` to "Repair" button, `Escape` to close without changes.
- **Accessibility:** Modal is `role="dialog"` with `aria-modal="true"`, `aria-label="Repair
  unresolved link"`. Candidate list is `role="listbox"`. Focus trapped inside dialog. Escape closes.
- **Acceptance criteria:**
  - Given an unresolved wikilink node is selected, when the picker opens, then only visible
    candidate targets appear; hidden-note titles are absent.
  - Given the user selects a candidate and clicks "Repair link", when the diff preview shows, then
    the number of affected occurrences is listed before any write occurs.
  - Given the DM uses bulk repair and there are hidden notes among candidates, when the bulk
    picker opens for the DM, then hidden notes appear as valid DM candidates.
- **Priority:** Must-have (GRAPH-010 is Must-have)

---

### UX-SRCH-001 — Global search overlay: invocation, layout, and scope indicator

- **Requirement:** The global search overlay shall be a full-width modal panel invoked from the
  search icon in the top bar or via the keyboard shortcut defined in `02-navigation-and-platform-
  profiles.md` (`Cmd/Ctrl+Shift+F`); it shall display a scope indicator before the user types,
  showing what is being searched, and render results within 300 ms of a query.
- **Rationale:** SRCH-001; NN/g search scoping research [10]; search scope confusion is the
  leading cause of false-negative search failures.
- **Spec:**
  - Panel: modal overlay, max-width 680 px, centered horizontally, top: 15vh. Dark glass card,
    `--color-surface-overlay`, 12 px radius, 24 px shadow. Backdrop: 60% opacity dark scrim.
  - Search field: 48 px height, 16 px horizontal padding, `--font-body-large`, placeholder
    "Search all visible content…". Leading icon: `search` (20 × 20 px). Trailing: `Esc` key hint
    chip ("Esc to close") in `--color-text-tertiary`.
  - Scope indicator: a chip row directly below the search field (8 px gap). Default chip: "All
    visible content" (filled, active). Additional chips appear as filters are applied (e.g.,
    "Notes only", "Session #12"). Tapping a chip opens the filter panel.
  - Results area: max-height 60vh, scrollable. Results render below the scope chip row, grouped by
    type (see UX-SRCH-004).
  - Stale indicator: if any search index is stale, a 24-px amber bar below the search field: "Some
    results may be outdated — [sources list]. [Refresh]".
  - Empty-before-query state: "Recent" section (last 5 opened entities) + "Suggested" section (3
    contextually relevant entities based on current session/entity). See UX-SRCH-007.
- **States:**
  - Closed: no DOM element (removed, not hidden).
  - Opening: 150 ms ease-out scale from 95% + fade-in. `prefers-reduced-motion`: instant.
  - Idle (no query): recent + suggested sections.
  - Typing (query ≤ 2 chars): no results yet; "Keep typing for results…" hint.
  - Results: grouped result list.
  - No results: zero-result state (UX-SRCH-008).
  - Closing: 100 ms ease-in fade. Focus returns to trigger element.
- **Platform profiles:**
  - Desktop: max-width 680 px modal, as above.
  - Tablet: max-width 90vw modal, same layout.
  - Mobile: full-screen overlay (100vw × 100vh); search field at top; results fill remaining height;
    keyboard does not push content (use `env(keyboard-inset-bottom)` CSS variable).
- **Input:** pointer: click search icon or results; touch: tap; keyboard: `Cmd/Ctrl+Shift+F` to
  open (defined in `02-navigation-and-platform-profiles.md`); `↑↓` to navigate results; `Enter`
  to open focused result; `Escape` to close; `Tab` to move into filter chips; `Ctrl+N`/`Ctrl+P`
  as Emacs-style arrow alternatives.
- **Accessibility:** Overlay is `role="dialog"`, `aria-modal="true"`, `aria-label="Global search"`.
  Search field is `role="combobox"`, `aria-controls` pointing to result list, `aria-autocomplete=
  "list"`, `aria-expanded` true when results visible. Result list is `role="listbox"`. Focus moves
  to search field on open. Screen reader announces "Search results updated, {N} results" via a
  `role="status"` live region on each result change.
- **Acceptance criteria:**
  - Given the user opens global search, when the overlay renders, then the scope indicator chip
    shows "All visible content" and the search field has focus.
  - Given the user types "dragon", when 300 ms elapse, then results are visible and grouped by type.
  - Given a player types a term that matches only DM-hidden content, when results render, then zero
    results show and the zero-result state is identical to a query with no matches anywhere (no
    count difference that could infer hidden matches).
- **Priority:** Must-have

---

### UX-SRCH-002 — Result row anatomy: three-line format with match highlighting

- **Requirement:** Every search result row in global search shall use a three-line anatomy:
  (1) breadcrumb path + source badge, (2) type icon + title with match highlight, (3) snippet with
  match highlight; and conform to prescribed dimensions.
- **Rationale:** SRCH-006; Algolia DocSearch hierarchy pattern [9]; NN/g result anatomy research
  [10]; three-line rows are the minimum to disambiguate multi-source content.
- **Spec — result row ASCII wireframe:**

  ```
  ┌─────────────────────────────────────────────────────────────────┐
  │ [src-badge] Obsidian › /campaign/npcs            [type-icon]    │  ← line 1: 12px, --color-text-tertiary
  │ [icon] Dragon Cult Leader                                        │  ← line 2: 15px bold, match highlighted
  │ "…the [Dragon] Cult Leader commands three wyverns from the…"    │  ← line 3: 13px, match highlighted
  └─────────────────────────────────────────────────────────────────┘
  ```

  - **Row height:** 72 px (3-line) or 48 px (2-line, when no snippet is available).
  - **Horizontal padding:** 16 px leading, 12 px trailing.
  - **Line 1 (breadcrumb):** Source badge (pill: 10 px font, 4 px v-padding, 8 px h-padding,
    `--color-source-{type}` background) + " › " separator + folder path. Max 1 line, truncate
    leading path segments with "…" when needed. Right-aligned: type icon (16 × 16 px,
    `--color-text-secondary`).
  - **Line 2 (title):** Type icon (20 × 20 px) left-aligned, 8 px gap, title text in
    `--font-body-medium` 600 weight. Match highlight: `<mark>` with `--color-search-highlight`
    background (not color-only: also bold). Max 1 line, truncate with ellipsis.
  - **Line 3 (snippet):** Max 120 characters surrounding the first match in the body. Match
    highlighted same as title. Truncated with "…" on both ends if mid-body. Omitted if no body
    match (title-only match).
  - **Hover / focus state:** row background `--color-surface-hover`; 2 px left accent bar in
    `--color-accent-primary`.
  - **Trailing actions (hover only):** two ghost icon buttons (28 × 28 px): `eye` ("Preview") and
    `link` ("Copy link"). Visible on row hover or focus-within; hidden otherwise.
  - **Keyboard shortcut hint (selected row only):** right-aligned "↵ Open" in `--color-text-tertiary`.
- **States:** default, hover, focused (keyboard), loading (skeleton rows), error (error inline).
- **Platform profiles:**
  - Desktop: 72/48 px rows as specified.
  - Tablet: same anatomy, same dimensions.
  - Mobile: 80 px rows (larger touch target); trailing actions replaced by a swipe-right gesture to
    reveal "Copy link" action; "Preview" accessible via long-press.
- **Input:** pointer: click row, hover for trailing actions; touch: tap to open, swipe-right for
  copy-link; keyboard: `↑↓` to navigate, `Enter` to open, `Tab` to focus trailing actions, `Escape`
  closes overlay.
- **Accessibility:** Each row is `role="option"`. `aria-label="{title}, {type}, in {source},
  {breadcrumb path}"`. Match highlights use `<mark>` (accessible by default in most screen readers).
  Trailing action buttons have `aria-label="Preview {title}"` / `"Copy link to {title}"`.
- **Acceptance criteria:**
  - Given search returns a result with a body match, when the row renders, then all three lines are
    present: breadcrumb path, title with highlight, snippet with highlight.
  - Given the user tabs to a result row, when it receives keyboard focus, then the "↵ Open" hint is
    visible and trailing action buttons are focusable with a subsequent Tab.
  - Given a snippet would expose a hidden-content section boundary, when returned to a player, then
    the snippet is truncated before the hidden section begins.
- **Priority:** Must-have

---

### UX-SRCH-003 — Result grouping by type with collapsible group headers

- **Requirement:** Global search results shall be grouped by content type (Notes, Maps, Characters,
  Sessions, Handouts, Commands) with collapsible group headers, each showing a count of results in
  that group.
- **Rationale:** SRCH-006; VS Code command palette grouping [12]; Linear command menu grouping
  (§4); ungrouped flat lists at scale cause cognitive overload and make it impossible to target a
  specific content type.
- **Spec:**
  - Group header: 32 px height, `--font-label-small` uppercase, `--color-text-tertiary`, right-
    aligned count badge (e.g., "NOTES 12"), background `--color-surface-grouped-header`,
    full-width with 8 px horizontal padding. Collapse chevron on the right.
  - Group order (default): Notes → Characters → Maps → Sessions → Handouts → Commands. Groups with
    zero results are hidden.
  - Results per group (default): max 3 visible, with a "Show {N} more in Notes…" link row at the
    bottom of each group if results exceed 3. Expanding a group shows all results from that group.
  - Collapsed group: header row only, with count badge; content rows hidden.
  - "All results" view: available via a "Show all results" link at the bottom of the overlay,
    opens a full-page search results view (`/search?q={query}`) with pagination and advanced filter
    sidebar.
- **States:** Group header: collapsed (chevron right), expanded (chevron down). "Show more" link:
  default, loading (spinner while fetching more results).
- **Platform profiles:**
  - Desktop/Tablet: groups as above.
  - Mobile: groups collapsed by default (only top-scoring result per group shown initially);
    "See all Notes" expands to full-screen Notes-filtered results.
- **Input:** pointer: click group header to collapse/expand; keyboard: `←`/`→` on focused group
  header to collapse/expand group; `↓` moves to first result in group.
- **Accessibility:** Group header is `role="option"` within the `listbox`, or alternatively a
  `role="group"` with `aria-label="{type} results"` wrapping its children. The count badge is
  `aria-label="{N} {type} results"`.
- **Acceptance criteria:**
  - Given search returns results across three content types, when the overlay renders, then each type
    has a labeled group header with its count.
  - Given a group header is focused and the user presses `←`, when the key fires, then the group
    collapses and the header remains focused.
  - Given a player searches for a term with hidden-content matches, when groups render, then the
    count badge reflects only visible results (hidden matches do not inflate the count).
- **Priority:** Must-have

---

### UX-SRCH-004 — Filter controls: chips, operators, and the filter panel

- **Requirement:** Global search shall support filter controls accessible via chip tokens in the
  scope row and an expandable filter panel, without requiring the user to type raw query operators.
- **Rationale:** SRCH-003; NN/g faceted search research [10]; query operators are undiscoverable
  for casual users; chip-based filters provide the same power with visual feedback.
- **Spec:**
  - **Scope chip row** (below search field): Active filters are shown as removable filled chips.
    Default: "All visible content" chip (not removable). Additional chips append for each filter:
    e.g., "Source: Obsidian ×", "Type: Map ×", "Tag: dragon ×". Chip height: 28 px, 12 px h-
    padding, `--color-chip-active` background.
  - **Filter panel** (accessible via "Filters" icon button in search field trailing area, or `Tab`
    then `Enter`): slide-down panel, max-height 280 px. Sections:
    - **Source:** checkbox group — Local, Obsidian, Google Docs.
    - **Content type:** checkbox group — Notes, Maps, Characters, Sessions, Handouts.
    - **Tags:** multi-select chip input (shows available tags from visible content).
    - **Folder:** tree-picker or searchable flat list.
    - **Date range:** "Modified" or "Created" + date range picker (calendar or natural language:
      "last 7 days", "in session #12").
    - **Saved search:** dropdown of the user's saved searches (SRCH-004); selecting one populates
      all filter fields from the saved definition.
  - **Text operators** (power-user, optional): the search engine accepts `tag:dragon`,
    `type:map`, `in:obsidian`, `modified:last7d` as typed operators; these are documented in a
    "Search tips" tooltip on the search field's `?` icon. They are *supplementary* to chips —
    typing an operator auto-generates the equivalent chip.
  - **"Clear all" button:** appears in the filter panel when any filter is non-default. Resets all
    filters, removes all chips except the default scope chip.
- **States:** each filter control follows component state matrix from `01-visual-design-system.md`.
  Active chip: filled. Inactive chip: ghost outline. Filter panel: collapsed (hidden), expanded
  (slide-down, 200 ms ease-out).
- **Platform profiles:**
  - Desktop: filter panel slides down below the scope chip row, within the search overlay.
  - Tablet: filter panel as bottom sheet (opens from bottom of screen, max-height 50vh).
  - Mobile: filter panel as full-screen sheet; accessed via a "Filters" button at the bottom of the
    search overlay.
- **Input:** pointer: click chip to remove, click filter icon to open panel; keyboard: `Tab` to
  chip row, `Delete`/`Backspace` on chip to remove, `Enter` on "Filters" button to open panel.
- **Accessibility:** Chip row is `role="group"` with `aria-label="Active search filters"`. Each
  chip is `role="button"` with `aria-label="Remove {filter name} filter"`. Filter panel is
  `role="region"` with `aria-label="Search filters"`.
- **Acceptance criteria:**
  - Given the user selects "Source: Obsidian" in the filter panel, when the panel closes, then an
    "Obsidian ×" chip appears in the scope row and results update to Obsidian-only.
  - Given the user types "tag:dragon" in the search field, when input processes, then a "Tag:
    dragon ×" chip appears in the scope row and a `tag:dragon` filter is active.
  - Given a relationship filter would match hidden related content, when a player applies it, then
    hidden relationships do not appear in result rows, chips, or result counts.
- **Priority:** Should-have

---

### UX-SRCH-005 — Quick switcher: title-first navigation overlay

- **Requirement:** A quick switcher shall be available as a distinct overlay (separate from global
  search) optimized for title-first navigation — finding a known entity by approximate title, opening
  it instantly, and supporting recent-items pre-query display.
- **Rationale:** SRCH-002; Obsidian quick switcher; VS Code `Ctrl+P` file quick-open. Title-first
  navigation has a different mental model from content search: the user knows *approximately* what
  they want; global search is for discovery.
- **Spec:**
  - Invocation: `Cmd/Ctrl+O` (defined as the quick-switcher shortcut in `02-navigation-and-platform-
    profiles.md`). Separate from `Cmd/Ctrl+Shift+F` (global search) and `Cmd/Ctrl+K` (command
    palette).
  - Panel: narrower than global search — max-width 560 px, top: 20vh. Same glass card style.
  - Search field: 48 px, placeholder "Go to note, map, character…". No scope chip row (scope is
    always "all visible titles").
  - Results: two-line rows (no body snippet): line 1 = type icon + title with match highlight;
    line 2 = source badge + folder path. Row height: 48 px.
  - Ranking: title matches ranked above body matches; exact prefix match first, then fuzzy;
    recently opened entities promoted (recency weight: ×2 for items opened in last 24 h).
  - Pre-query state: last 7 recently opened entities, labeled "Recent". No "Suggested" section
    (quick switcher is navigation, not discovery).
  - Max results displayed: 8 (scrollable if more, but showing ≤ 8 is optimal per Hick's Law [8]).
  - Commands: if the query begins with `>`, the quick switcher switches to command mode and shows
    matching commands instead of entity titles (same behavior as VS Code `Ctrl+P` → `>`).
- **States:** closed (no DOM), opening (150 ms ease), idle/recent, query, results, command-mode,
  closing (100 ms ease).
- **Platform profiles:**
  - Desktop: max-width 560 px modal as above.
  - Tablet: max-width 90vw.
  - Mobile: full-screen overlay; recent items pre-query; no command-mode (command palette via bottom
    sheet is the command surface on Mobile).
- **Input:** keyboard: `Cmd/Ctrl+O` to open; `↑↓` to navigate; `Enter` to open; `Escape` to close;
  `>` prefix to switch to command mode; touch: tap result to open.
- **Accessibility:** `role="dialog"`, `aria-modal="true"`, `aria-label="Quick switcher"`. Results
  list `role="listbox"`. Focus to search field on open. `role="status"` live region: "Showing
  {N} results for {query}".
- **Acceptance criteria:**
  - Given the user opens the quick switcher and types "drag", when results render, then title
    matches for "drag" appear ranked above body-only matches.
  - Given a player opens the quick switcher, when DM-only entity titles would match the query, then
    those titles are absent and no count or hint reveals their existence.
  - Given the user types ">export", when the query processes, then command-mode results appear
    showing matching commands (not entity titles).
- **Priority:** Must-have

---

### UX-SRCH-006 — Relevance transparency and ranking signals

- **Requirement:** When AI-assisted ranking or semantic search is active, the search UI shall label
  the AI contribution distinctly and provide a way to view the deterministic-only ranking; the
  deterministic base ranking shall always be the default when AI is disabled or unavailable.
- **Rationale:** SRCH-005, SRCH-011; principle 8 (Safe by default — AI cannot silently override
  deterministic results). Transparency in search ranking is a documented best practice for user trust
  in AI-augmented systems [9].
- **Spec:**
  - Default (AI disabled): results ranked deterministically by: (1) exact title match, (2) alias
    match, (3) tag match, (4) body match, (5) recency, (6) session-context relevance (if active
    session), (7) link-graph centrality. Tie-breaking: alphabetical by title (stable sort).
  - AI-assisted mode (opt-in): a chip label "AI-ranked ✦" appears in the scope chip row when
    semantic reranking is active. Clicking the chip shows a tooltip: "Results are reranked by AI
    semantic similarity. Switch to deterministic ranking."
  - Deterministic-only toggle: the tooltip includes a "Use deterministic ranking" link that removes
    the AI-ranking chip and re-queries without semantic reranking.
  - Score debug (DM/developer mode, opt-in): each result row shows a small `{score}` badge on hover
    (visible only in developer mode). Score components: title_score, recency_score, context_score,
    ai_score (if applicable).
  - Session-context boost: when an active session is running and a map is active, POIs on that map
    receive a ×1.5 context multiplier in ranking. The scope chip shows "Session boost active" when
    this multiplier is applied.
- **States:** AI-ranked chip: default (filled purple), hover (tooltip), dismissed (removes chip for
  session).
- **Platform profiles:** Identical across all profiles. On Mobile, the AI-ranked chip is truncated
  to "AI ✦" with full label in a tooltip on tap.
- **Input:** pointer: click AI chip for tooltip; keyboard: Tab to chip, Enter for tooltip/toggle.
- **Accessibility:** AI-ranked chip has `aria-label="AI semantic ranking is active. Press Enter
  for options."` The "Use deterministic ranking" link is a standard `<a>` element.
- **Acceptance criteria:**
  - Given AI ranking is disabled, when the user searches, then results rank in deterministic order
    and no AI chip appears.
  - Given AI ranking is enabled and produces a different order, when results render, then the "AI-
    ranked ✦" chip is visible in the scope row.
  - Given the user clicks "Use deterministic ranking", when the query re-fires, then results return
    to deterministic order and the AI chip is removed.
- **Priority:** Must-have (deterministic default); Could-have (AI-ranked UI labels)

---

### UX-SRCH-007 — Recent items and suggested content pre-query

- **Requirement:** The global search overlay shall display recent items and contextually suggested
  content when the query is empty, providing immediate value before the user types.
- **Rationale:** SRCH-002; Notion pre-query recent items [§4]; Raycast recent items [§4]; NN/g
  research shows empty search boxes cause hesitation — pre-populated recent items reduce time-to-
  first-action [10].
- **Spec:**
  - **Recent items section:** Last 5 entities the actor opened (stored locally, actor-scoped).
    Label: "RECENT" group header. Each row: 48 px, type icon + title + source badge. No snippet.
  - **Suggested section:** 3 entities surfaced by session context — e.g., entities linked from the
    currently open note, entities referenced in the active session, entities flagged in the active
    map. Label: "SUGGESTED" group header with `?` icon tooltip "Why suggested: [reason]".
  - Recent + suggested sections are visible only when the search field is empty (query length = 0).
  - At query length ≥ 1 character, recent/suggested sections disappear and typed results appear.
  - At query length 1–2 characters: a hint "Keep typing for results…" appears below the scope row.
    No premature results (avoids showing too many low-relevance matches).
  - Recent items are stored per-actor in local storage; they are never shared with other actors and
    are cleared on sign-out.
- **States:** pre-query (recent + suggested), typing 1-2 chars (hint), typing ≥ 3 chars (results).
- **Platform profiles:** All profiles: same pre-query behavior. Mobile: recent 3 items (reduced for
  screen space); suggested 2 items.
- **Input:** pointer/touch: click/tap row to open; keyboard: `↓` from search field moves into
  recent rows.
- **Accessibility:** Recent and Suggested are `role="group"` with `aria-label="Recent items"` and
  `"Suggested items"`. The suggestion `?` tooltip has `aria-describedby` pointing to the reason
  text.
- **Acceptance criteria:**
  - Given the user opens global search with an empty query, when the overlay renders, then "Recent"
    and "Suggested" sections are visible with up to 5 and 3 rows respectively.
  - Given the user types one character, when the input updates, then recent/suggested sections
    disappear and a "Keep typing…" hint appears.
  - Given a player opens global search, when the suggested section renders, then all suggested
    entities are visible to the player (no hidden entity appears as a suggestion).
- **Priority:** Should-have

---

### UX-SRCH-008 — Zero-result and error states

- **Requirement:** When search returns no results or fails, the overlay shall show a distinct,
  actionable state that explains why and offers next steps — never a blank area.
- **Rationale:** Principle 7 (Feedback); principle 9 (Error prevention & recovery); SRCH-001,
  SRCH-009. Blank search results cause users to assume the system is broken, not that content is
  absent [10].
- **Spec:**
  - **Zero results (no matches):**
    - Icon: `search-x` (24 × 24 px), `--color-text-tertiary`.
    - Heading (16 px, weight 600): "No results for "{query}""
    - Body (14 px): "Try different words, or check your filters." If filters are active: "Your
      current filters may be too narrow — [Clear filters]."
    - Suggested actions: "Search the web for "{query}"" (opens browser, optional), "Create a note
      titled "{query}"" (CTA button).
  - **Zero results (all content hidden — player):**
    - Same layout but body text: "No visible content matches. Content may not be shared with you
      yet." No count or hint about hidden matches.
  - **Index error (search engine failed):**
    - Icon: `alert-triangle`, `--color-status-warning`.
    - Heading: "Search is temporarily unavailable"
    - Body: "Using cached results. [Retry] or check connection."
    - Cached results (if any) display below the error card with a stale badge.
  - **Partial results (some indexes stale):**
    - Not a zero-result state — results display normally. Amber stale bar above results (per
      UX-SRCH-001) is the indicator.
- **States:** static (no animation needed).
- **Platform profiles:** Same layout on all profiles. Mobile: heading and body text wraps to full
  screen width; CTA buttons are full-width.
- **Input:** CTA buttons: pointer click, touch tap, keyboard Enter. "Clear filters" link: standard
  keyboard-focusable.
- **Accessibility:** Zero-result container is `role="status"` so screen readers announce it when
  it appears. CTA buttons are standard `<button>`. Heading uses correct heading level (`<h3>` or
  `<h2>` depending on context).
- **Acceptance criteria:**
  - Given a query returns no results, when the result area renders, then the zero-result state
    shows the query text in the heading, and a "Clear filters" link if filters are active.
  - Given a player queries a term matching only hidden content, when the state renders, then it is
    visually and textually identical to the no-matches state (no count differential).
  - Given the search engine errors, when the error state renders, then a "Retry" button is present
    and keyboard-focusable.
- **Priority:** Must-have

---

### UX-SRCH-009 — Index freshness and stale-result indicators

- **Requirement:** The search UI shall display index freshness status per source inline in the
  search overlay, without blocking results, and allow the user to trigger a manual reindex.
- **Rationale:** SRCH-009; local-first architecture means results can be stale when sync has not
  completed; users must know when to trust results and when to refresh.
- **Spec:**
  - **Amber stale bar:** 24 px height, shown immediately below the scope chip row when any indexed
    source is stale. Text: "Some results may be outdated — Obsidian (15 min ago), Google Docs (2 h
    ago). [Refresh now]". Bar is dismissible (×) per session.
  - **"Refresh now" action:** triggers a background reindex for stale sources. Bar text changes to
    "Refreshing…" with spinner. On completion: bar fades out (results have updated). On failure:
    "Could not refresh — [Retry]".
  - **Per-source freshness in filter panel:** each source in the Source filter section shows a
    freshness timestamp: "Obsidian · Last indexed 3 min ago" (green dot if < 5 min, amber if
    5–60 min, red if > 60 min or error).
  - **Result-level stale badge:** if a specific result is known to be from a stale source (cursor
    not yet advanced past this document's last change), a small "⟳" badge appears on the trailing
    edge of the result row. Tooltip: "This result may be outdated."
  - Freshness data is displayed only to the current actor; no cross-actor freshness leakage.
- **States:** fresh (no bar), stale (amber bar shown), refreshing (bar with spinner), error (red
  bar with retry).
- **Platform profiles:** Desktop/Tablet: amber bar as described. Mobile: freshness indicator is a
  single "Results may be outdated" line below the search field (no source list detail — too narrow).
- **Input:** pointer/touch: click/tap "Refresh now"; keyboard: Tab to bar, Enter to refresh, Tab
  again to dismiss ×.
- **Accessibility:** Stale bar is `role="alert"` so it announces to screen readers when it appears.
  Dismiss button has `aria-label="Dismiss freshness warning"`.
- **Acceptance criteria:**
  - Given a search index source is more than 5 minutes stale, when the user opens global search,
    then the amber stale bar shows that source name and elapsed time.
  - Given the user clicks "Refresh now", when reindex completes, then the amber bar disappears and
    results update without closing the overlay.
  - Given a result is from a stale source, when the row renders, then the "⟳" stale badge is
    visible on that row only.
- **Priority:** Must-have

---

### UX-SRCH-010 — Saved searches: creation, pinning, and player-safe display

- **Requirement:** The DM shall be able to save any search (with active filters) as a named saved
  search, pin it to the Command Center as a widget, and delete it; saved searches with DM-only
  criteria must not be visible to players in shared navigation.
- **Rationale:** SRCH-004; saved searches are a recurring campaign-workflow tool (e.g., "All
  unlinked NPCs in Act 3").
- **Spec:**
  - **Save a search:** "Save search" button appears in the search overlay when a query and/or filters
    are active. Clicking opens a small dialog: Name field (required, ≤ 48 characters), optional
    description (≤ 120 characters), "Pin to Command Center" toggle (default: off), "Save" button.
  - **Saved search management:** accessible via Settings › Search › Saved searches. Table: name,
    query, filters summary, created date, pinned status, Edit / Delete actions.
  - **Pinned widget (Command Center):** when pinned, a saved-search card appears in the Command
    Center canvas. Card shows: name, result count (live), last-updated timestamp, top 3 result
    rows (48 px each, 2-line anatomy), "Open full results" link. Card updates on session load and
    after each vault sync.
  - **Player safety:** DM saved searches are not visible in the player's Command Center or
    navigation. If a DM shares a session and a saved search was used to build shared content, the
    *results* may be shared (per visibility rules) but the *saved search definition* (name, query,
    filters) is never exposed to players.
  - **Quick-apply from quick switcher:** typing `>saved:` in the quick switcher command mode lists
    saved searches; selecting one opens the search overlay pre-populated with that search's query
    and filters.
- **States:** Save dialog: idle, saving (spinner), saved (toast "Search saved"), error. Widget:
  loading, results shown, stale (amber indicator on widget), error (error card in widget).
- **Platform profiles:**
  - Desktop/Tablet: full saved-search management UI in Settings; Command Center widget as described.
  - Mobile: saved searches listed in Settings › Search; no Command Center widget on Mobile (slim
    Command Center doesn't support widgets); accessible via "Saved searches" in the filter panel.
- **Input:** pointer/touch: standard dialog interactions; keyboard: Tab through dialog fields,
  Enter to save, Escape to cancel.
- **Accessibility:** Save dialog is `role="dialog"`, `aria-modal="true"`. Name field is labeled.
  Command Center widget is `role="region"` with `aria-label="{saved search name} results"`.
- **Acceptance criteria:**
  - Given the DM saves a search and pins it to Command Center, when Command Center loads, then the
    widget appears with the saved search name and result count.
  - Given a player loads the app, when the Command Center renders, then DM-saved-search widgets
    are absent from the DOM.
  - Given the DM deletes a saved search that was pinned, when deletion completes, then the widget
    is removed from Command Center within one navigation cycle.
- **Priority:** Should-have

---

## 6. Component & state specifications

### 6.1 Graph toolbar

Mounted at the top of the graph panel, full-width, 48 px height, background `--color-surface-nav`.

| Slot | Component | States |
|---|---|---|
| Leading | "Graph" heading (14 px, weight 600) | Static |
| Center | "Local / Global" segmented control (2 segments, 80 px each) | Default, active segment filled |
| Trailing | "List view" toggle button (icon: `list`) | Default, active (filled icon) |
| Trailing | "Graph Health" button (DM only, icon: `heart-pulse`) | Default, stale-badge (amber dot) |
| Trailing | "Reset layout" button (icon: `refresh-layout`) | Default, loading (spinner) |
| Trailing | "Fullscreen" button (icon: `expand`) | Default, active (icon changes to `compress`) |

### 6.2 Search result list (global search)

| State | Visual | ARIA |
|---|---|---|
| Loading | 3 skeleton rows (shimmer, 72 px each) | `aria-busy="true"` on list |
| Results | Grouped result rows per §UX-SRCH-003 | `role="listbox"`, `aria-live="polite"` |
| No results | Zero-result state card (per §UX-SRCH-008) | `role="status"` |
| Error | Error card with Retry button | `role="alert"` |
| Focused row | Left accent bar + background highlight | `aria-selected="true"` on `role="option"` |

### 6.3 Quick switcher

| Element | Spec |
|---|---|
| Panel width | max 560 px |
| Panel top offset | 20vh |
| Result rows | 48 px, 2-line (no snippet) |
| Max visible rows | 8 (scroll for more) |
| Pre-query content | Recent 7 items, labeled "RECENT" |
| Command mode trigger | Leading `>` character in query |
| Close trigger | `Escape` or click outside backdrop |

### 6.4 Node tooltip (graph hover)

- Container: 8 px padding, 6 px radius, `--color-surface-tooltip`, max-width 240 px.
- Line 1: node title (14 px, weight 600).
- Line 2: type label + source badge.
- Line 3: "N connections" (degree count).
- Line 4 (DM only): relationship-quality score if computed ("Quality: 87/100").
- Appears after 400 ms hover delay (prevents noise during pan). Disappears instantly on cursor leave.
- Not shown during active pan/zoom gesture.

### 6.5 Graph filter sidebar (Desktop)

| Control | Component | Default |
|---|---|---|
| Text filter | Single-line input, 36 px height | Empty |
| Node types | Checkbox group, 6 options | All checked |
| Source | Checkbox group, 3 options | All checked |
| Folder | Searchable flat list, max-height 200 px | "(All folders)" selected |
| Tags | Multi-select chip input | Empty (no filter) |
| Relationship types | Checkbox group, 6 options | All checked |
| Show isolated nodes | Toggle switch | OFF |
| Depth from selection | Integer stepper 1–5 | 2 (inactive until node selected) |
| Clear all | Button, ghost style | Disabled when at defaults |

---

## 7. Layout & responsive behavior

### Desktop (≥ 1024px)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Global nav sidebar (220px) │ Graph panel                                     │
│                            │ ┌──────────────────────────────────────────────┐│
│                            │ │ Toolbar (48px): heading · Local/Global ·     ││
│                            │ │ List · Health · Reset · Fullscreen           ││
│                            │ ├──────────────┬───────────────────────────────┤│
│                            │ │ Filter       │ Canvas (WebGL, fills area)    ││
│                            │ │ sidebar      │                               ││
│                            │ │ (240px)      │        [nodes + edges]        ││
│                            │ │              │                               ││
│                            │ │ Text filter  │ ┌─────────────────────────┐  ││
│                            │ │ Node types   │ │ Legend (bottom-left)    │  ││
│                            │ │ Source       │ └─────────────────────────┘  ││
│                            │ │ Folder       │                               ││
│                            │ │ Tags         │                               ││
│                            │ │ Rel types    │                               ││
│                            │ │ Orphans ◯    │                               ││
│                            │ │ Depth [2]    │                               ││
│                            │ │ [Clear all]  │                               ││
│                            │ └──────────────┴───────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

Global search overlay appears as a centered modal at top: 15vh, max-width 680px, above all content
(z-index from `01-visual-design-system.md` overlay layer).

### Tablet (600–1024px)

Graph panel: full-width minus global nav rail (56 px). Filter sidebar is hidden; replaced by a
"Filters" FAB (44 × 44 px, bottom-right of canvas, `filter` icon + badge count). Tapping FAB opens
a bottom sheet (max-height 55vh) with the same filter controls in a scrollable list. Legend: FAB
button in bottom-left; tap to expand as a 200 px-wide card overlay on the canvas.

Graph canvas fills the remaining width. Toolbar remains mounted.

Search overlay: max-width 90vw, same vertical position. Filter panel opens as bottom sheet.

### Mobile (< 600px)

Graph canvas: NOT rendered. Route `/knowledge/graph` shows the slim backlink-list surface (UX-
GRAPH-009). The toolbar is replaced by a single "Backlinks" page heading with a filter chip row.

Global search: full-screen overlay. Search field pinned to top. Results fill remaining height.
Virtual keyboard uses `env(keyboard-inset-bottom)` to avoid covering results. Filter panel opens
as full-screen sheet.

Quick switcher: full-screen overlay (same as global search, with 2-line result rows and no snippet).

---

## 8. Motion & feedback

All animations respect `prefers-reduced-motion: reduce` (fallback: instant transition).

| Element | Animation | Duration | Easing | Reduced-motion fallback |
|---|---|---|---|---|
| Search overlay open | Scale 95%→100% + opacity 0→1 | 150 ms | ease-out | Instant |
| Search overlay close | Opacity 1→0 | 100 ms | ease-in | Instant |
| Result list update | Crossfade (old→new rows) | 120 ms | ease | Instant swap |
| Graph force simulation | Continuous position updates | Until convergence (≤ 2 s) | Physics | Skip simulation, render final positions |
| Node hover scale | 1.0→1.2× | 80 ms | ease-out | Instant |
| Node selected scale | 1.0→1.4× + non-connected dim | 120 ms | ease-out | Instant |
| Local mode transition | Non-local nodes fade to 0 opacity | 200 ms | ease | Instant remove |
| Cluster expand | Member nodes scale from 0 within boundary | 300 ms | ease-out | Instant render |
| Legend collapse | Height 0 + opacity | 150 ms | ease | Instant |
| Filter sidebar collapse | Width 240→0 px | 200 ms | ease-in-out | Instant |
| Bottom sheet open (Tablet) | translateY: 100%→0 | 250 ms | ease-out | Instant |
| Node tooltip appear | Opacity 0→1 | 100 ms | ease | Instant (400 ms delay preserved) |
| Stale bar appear | Height 0→24 px | 150 ms | ease-out | Instant |

Graph force simulation: `prefers-reduced-motion` suppresses the animated convergence entirely —
nodes snap directly to their computed final positions. Users who need to see the graph forming can
enable "Graph animation" in Settings.

---

## 9. Accessibility requirements (surface-specific)

These supplement the global contract in `03-accessibility.md`.

### 9.1 Graph canvas accessibility

- The canvas element (`role="application"`, `aria-label="Link graph"`) must be accompanied by a
  visually hidden `<div role="status">` that announces changes: "Graph updated: {N} nodes, {M}
  edges" when the filter changes or the graph re-renders.
- All interactive canvas elements (nodes, cluster bubbles) must be keyboard-reachable via the
  node list (UX-GRAPH-007). The canvas itself does not need to be keyboard-navigable beyond a
  "focus first node" shortcut that switches to list view.
- Node selection via keyboard: in list view, `Enter` selects the node and (if canvas is visible)
  triggers the canvas selection animation for pointer users watching the same session.
- `prefers-reduced-motion`: force-directed animation is entirely suppressed; nodes render at
  computed positions without movement. This is verified by checking `window.matchMedia('(prefers-
  reduced-motion: reduce)').matches` before starting the simulation loop.
- Color-only prohibition: confirmed by the node encoding table in UX-GRAPH-002 (shape + icon-
  badge + color). The legend includes shape swatches, not just color swatches.

### 9.2 Search overlay accessibility

- The search field is `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded` (true when
  results visible), `aria-controls="{result-list-id}"`, `aria-activedescendant="{focused-row-id}"`.
- Result list is `role="listbox"`. Each result is `role="option"`, `aria-selected` (true when
  keyboard-focused). Keyboard selection does not trigger navigation; only `Enter` navigates.
- Group headers within the result list are `role="presentation"` or grouped with `role="group"`.
  Do not use `role="option"` on headers (they are not selectable destinations).
- When results update asynchronously, the `role="status"` live region (`aria-live="polite"`)
  announces: "Search results updated: {N} results across {groups}." Not on every keystroke —
  debounced to match the 150 ms query debounce.
- Focus management on overlay close: focus returns to the element that triggered the overlay
  (search icon button or keyboard shortcut focus target). If the trigger element is no longer in
  the DOM, focus returns to the main content landmark.
- Contrast: match highlights (`<mark>`) must maintain ≥ 4.5:1 contrast ratio between the
  highlighted text color and the `--color-search-highlight` background.

### 9.3 WCAG 2.2 success criteria mapping

| SC | Criterion | Compliance notes for this surface |
|---|---|---|
| 1.3.1 | Info and Relationships | Node type conveyed by shape + label + color (not color alone). Group headers in result list are labeled. |
| 1.4.1 | Use of Color | Graph node types use shape + color. Search match highlights use `<mark>` element (semantic). |
| 1.4.3 | Contrast (Minimum) | All text labels ≥ 4.5:1; graph node labels at default zoom ≥ 4.5:1 against graph background. |
| 1.4.11 | Non-text Contrast | Node outlines and edge lines ≥ 3:1 against graph canvas background. |
| 2.1.1 | Keyboard | All graph interactions available via node list. All search interactions keyboard-only. |
| 2.1.2 | No Keyboard Trap | Escape always closes overlay and releases focus. Graph list Tab cycles are managed. |
| 2.4.3 | Focus Order | Search overlay focus order: field → scope chips → filter button → results. Graph list: toolbar → list rows. |
| 2.4.7 | Focus Visible | All interactive elements use `--color-focus-ring` outline (2 px, 2 px offset). |
| 2.5.3 | Label in Name | All icon buttons have `aria-label` that contains the visible label text (for voice control). |
| 2.5.7 | Dragging Movements | Graph pan has tap-to-move-to-node-list alternative. No drag-only operations. |
| 2.5.8 | Target Size | All toolbar buttons ≥ 44 × 44 px on Tablet/Mobile. Desktop: ≥ 32 × 32 px (pointer). |
| 4.1.3 | Status Messages | Stale bar is `role="alert"`. Result count update is `role="status"`. |

---

## 10. Anti-patterns & explicit limitations

### 10.1 The graph "hairball" — must not ship

Rendering all nodes without clustering when node count exceeds 300 produces an overlapping tangle
of edges that conveys no information and cannot be navigated [1]. This is the most common graph-view
failure mode (visible in Obsidian at scale, in Roam Research at any scale [2][3]). **DND Tools must
implement the clustering threshold (UX-GRAPH-006) before the graph view ships in any public release.
Shipping graph view without clustering is a regression, not an MVP compromise.**

### 10.2 Graph-as-decoration — must be rejected

If the graph view is only opened once per session to admire and then closed, it has failed as a
UX surface. Logseq user research and Obsidian community reports confirm that force-directed graphs
are rarely used for navigation in practice [3]. The mitigation: the graph must be a genuine
navigation surface (double-click to open, local-graph mode, graph health panel) and a backlinks
panel must serve as the routine graph-derived navigation for all profiles. If the graph is added as
a visual "wow" feature without these navigation affordances, it must not be shipped.

### 10.3 Color-only node type encoding — WCAG violation

Using only fill color to distinguish node types (as many graph tools do) is a WCAG 2.2 SC 1.4.1
violation [4] and a usability failure for colorblind users (~8% of males). **Every node type must
use shape in addition to color.** This is non-negotiable.

### 10.4 Hidden-content inference through search counts or timing

Returning different result counts (e.g., "3 results" when 2 are visible and 1 is hidden) or
different response times for queries that match hidden content allows actors to perform differential
attacks [13]. **The backend must apply actor visibility filtering before counting. The frontend must
never display a "filtered out" count or any hint that additional results exist beyond the visible
set.** This includes: total result counts, group counts, facet counts in filter dropdowns, related-
entity counts in result snippets, and autocomplete suggestion lists.

### 10.5 Undiscoverable text search operators as the primary filter UX

Designing filters as raw query operators (`tag:npc`, `in:local`) with no visual chip/menu
alternative creates a split user population: power users who know the operators, and everyone else
who sees an empty search [10]. **Text operators must be supplementary, not primary.** Chip-based
filters are always available and are the default interaction. The "Search tips" tooltip teaches
operators to users who are ready to learn them.

### 10.6 No keyboard model for the search overlay

Implementing global search as a mouse-only UI (no keyboard navigation in results, no Escape to
close, no arrow-key navigation) is a WCAG 2.1.1 failure and an experience failure for power users
who live in the keyboard [4]. **The keyboard contract (↑↓/Enter/Escape/Tab) defined in §3.7 is
mandatory and must be implemented before global search ships.**

### 10.7 Force simulation animation without reduced-motion support

Running force-directed graph animation for users who have `prefers-reduced-motion: reduce` set can
trigger vestibular disorders (WCAG 2.3.3 at AAA level; a documented a11y concern at AA-adjacent
severity) [4]. **The graph must detect `prefers-reduced-motion` and skip all animation, including
the force simulation convergence animation, rendering nodes at their computed final positions
immediately.**

### 10.8 Graph view on Mobile without a slim-surface fallback

Rendering a force-directed graph on a < 600px viewport makes nodes too small to tap reliably and
wastes the screen on a view that cannot be usefully navigated at that size [10]. **The Mobile
profile must never render the graph canvas. The backlink-list slim surface (UX-GRAPH-009) is the
mandatory Mobile substitute.**

### 10.9 Search scope ambiguity (the "what am I searching?" problem)

Opening a search overlay with no scope indicator and no pre-query state leaves users uncertain
whether they are searching their local vault, Obsidian, Google Docs, the current section, or
something else. This causes false negatives ("it's not there") and unnecessary friction [10].
**The scope indicator chip (UX-SRCH-001) showing "All visible content" (or active scope) is
mandatory before any query is entered.**

### 10.10 AI ranking that silently overrides deterministic results

Allowing optional AI-assisted reranking to replace deterministic ranking without user awareness
violates the product principle that "Algorithms are primary" and undermines user trust (the user
cannot understand why a result is ranked first). Furthermore, AI ranking that processes hidden-
content signals could expose ranking artifacts that leak visibility [13]. **AI ranking must: (a) be
opt-in, (b) be labeled in the UI when active, (c) be togglable per-session, (d) never change the
base deterministic score — only add an additive AI component above it, and (e) be disabled server-
side for player sessions until the safety proof is complete.**

---

## 11. Success metrics

| Metric | Target | Measurement method |
|---|---|---|
| Graph canvas frame rate (100 nodes) | ≥ 60 fps during pan/zoom | Browser Performance tab, `requestAnimationFrame` timing |
| Graph canvas frame rate (300 nodes, clustered) | ≥ 30 fps during pan/zoom | Same |
| Search results time (cached index, local vault) | ≤ 300 ms from last keystroke (after 150 ms debounce) | Performance mark from query-fire to result-render |
| Quick switcher time-to-result | ≤ 200 ms for title matches | Same |
| Search overlay opening animation | ≤ 150 ms (scale + fade) | CSS animation duration; verified by eye at 60 fps |
| Zero-result state appearance | ≤ 300 ms from query with no matches | Performance mark from query-fire to empty-state-render |
| Graph filter re-render (< 200 nodes) | ≤ 500 ms from filter change to canvas update | Performance mark |
| Graph clustering engagement time (300+ nodes) | ≤ 1 s from node-count-exceeded to clusters visible | Performance mark |
| Actor-filtered leak rate | 0 hidden titles, counts, or timing differentials in player search | Automated test suite: player queries that match DM-only content assert empty result set + same response time ± 50 ms |
| Search task success rate (find known entity in < 30 s) | ≥ 90% (moderated usability test) | Usability testing with 5–10 participants |
| Graph node type identification (legend visible) | ≥ 85% correct type identification without color cues | A/B test with grayscale filter applied |
| Search overlay keyboard task completion | 100% (no keyboard-blocking path) | Automated keyboard-only test suite |
| WCAG 2.2 AA violations (axe-core) | 0 critical, 0 serious | CI automated scan on graph and search surfaces |

---

## 12. Open questions & risks

1. **Clustering algorithm choice:** Folder-based clustering is specified as the default, but some
   campaigns may have very flat folder structures (few top-level folders, hundreds of notes at root
   level). A fallback to degree-based clustering is specified, but the threshold for "flat enough to
   fall back" has not been defined. The human designer must specify this threshold or validate that
   folder-based clustering degrades gracefully.

2. **Graph widget in Command Center (embedded graph):** UX-GRAPH-001 mentions the graph canvas can
   be embedded as a widget in the Command Center canvas. The slim-variant spec (filter toolbar
   collapses to a top strip) is described but not fully specified. This needs a detailed widget-mode
   spec pass, coordinated with `04-canvas-scene-widgets.md` and `05-command-center.md`.

3. **Semantic search architecture gate (SRCH-011):** The "search architecture decision" referenced
   in SRCH-011 has not been made. UX-SRCH-006 specifies the UI for when AI ranking is active, but
   the trigger condition (who enables it, how it is deployed, what model) is unresolved. The UI
   requirements here are sufficient to proceed with implementation; the architecture decision is
   upstream.

4. **Full-page search results view (`/search?q=`):** UX-SRCH-003 references a full-page search
   results view with pagination and an advanced filter sidebar. This full-page view is only sketched
   here (as a link from the overlay). A dedicated pass is needed if this view is to support complex
   faceted search workflows.

5. **Graph performance on lower-end tablets:** The 30 fps floor at 300 clustered nodes may not be
   achievable on entry-level tablets with integrated GPUs (e.g., budget Android tablets). A
   fallback to a purely DOM-based list view (already specified as the node-list in UX-GRAPH-007)
   should be auto-triggered if the first frame of the canvas takes > 500 ms. This performance
   fallback logic needs engineering validation.

6. **Saved-search widget refresh strategy (SRCH-004):** The saved-search Command Center widget is
   specified to update "on session load and after each vault sync." The polling/event-driven
   strategy for live updates during a session (e.g., a new NPC is created that matches the saved
   search) has not been specified. This is a backend API concern but will affect perceived
   freshness in live play.

7. **Link-repair bulk write safety (GRAPH-010):** The bulk-repair flow confirms all changes before
   writing. The UX specifies a diff preview, but the maximum number of simultaneously repaired links
   (and the UX when that number is very large, e.g., 200 dead links) has not been addressed. A
   paginated or batched repair UI may be needed.

8. **Calendar search integration (SRCH-010):** The calendar-date filter in the filter panel
   references "natural language" date input ("last 7 days", "in session #12"). The natural-language
   date parser is not specified elsewhere in the requirements. If it is not implemented, the filter
   panel should fall back to a standard date-range picker only, which is fully specified here.

---

## Sources

[1] "The 'hairball' problem in graph visualization" — Kobourov, Liotta, Montecchiani (2014),
    *Graph Drawing: 22nd International Symposium* — https://link.springer.com/chapter/10.1007/978-3-319-27261-0_41

[2] Obsidian Graph View documentation — Obsidian.md —
    https://help.obsidian.md/Plugins/Graph+view

[3] Logseq graph view user research and Roam Research community reports — Logseq Community Forum
    (2022) — https://discuss.logseq.com/t/graph-view-improvements/8329

[4] Web Content Accessibility Guidelines (WCAG) 2.2 — W3C —
    https://www.w3.org/TR/WCAG22/

[5] Purchase, H.C. (2002). "Metrics for Graph Drawing Aesthetics." *Journal of Visual Languages &
    Computing* 13(5), 501–516 —
    https://www.sciencedirect.com/science/article/pii/S1045926X02902326

[6] Ware, C. (2012). *Information Visualization: Perception for Design*, 3rd ed., Chapter 5 — Morgan
    Kaufmann — https://www.elsevier.com/books/information-visualization/ware/978-0-12-381464-7

[7] Sigma.js documentation: rendering performance and level-of-detail — Sigma.js —
    https://www.sigmajs.org/docs/

[8] Nielsen, J. (1994). "Response Times: The 3 Important Limits" — Nielsen Norman Group —
    https://www.nngroup.com/articles/response-times-3-important-limits/

[9] Algolia InstantSearch documentation and search UX best practices — Algolia —
    https://www.algolia.com/doc/guides/building-search-ui/what-is-instantsearch/js/

[10] Whitenton, K. (2018). "Site Search Suggestions" and related search UX articles — Nielsen Norman
     Group — https://www.nngroup.com/articles/site-search-suggestions/
     and https://www.nngroup.com/articles/search-results-descriptions/

[11] cmdk — Command Menu component library documentation — Vercel / pacocoursey —
     https://cmdk.paco.me/

[12] VS Code Keyboard Shortcuts Reference (Command Palette) — Microsoft —
     https://code.visualstudio.com/docs/getstarted/keybindings

[13] OWASP Testing Guide: OTG-AUTHZ-001 — Object Level Authorization and Information Disclosure
     through timing and differential responses — OWASP Foundation —
     https://owasp.org/www-project-web-security-testing-guide/
