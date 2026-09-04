# Initiative 19 — Map Tool UX: Modal Clarity, Ergonomics & Accessible Exploration

## Status: SVELTE-ERA PLAN — React status tracked in RC_ROADMAP §8

> **Implementation note (2026-07-15, re-verified 2026-09-04):** The detailed stories below
> describe the retired Svelte map surface and remain planning history, not a completion claim.
> The maintained React editor is under `apps/gm-react/src/app/map/`. Android uses Quick Map mode:
> navigation is the default, edit modes are explicitly armed, multi-touch always pans/zooms, and
> desktop-authored precision geometry renders and is preserved even though its authoring controls
> are hidden. See the [Android alpha runbook](../../runbooks/android-alpha.md). Combat-on-map and
> editor-depth follow-ups remain open work, tracked as RC-MAP-1.x–3.x in
> `docs/planning/RC_ROADMAP.md` §8.

**Outcome:** The map viewer is the most spatial, powerful, and fluid tool in the
application. A new DM can import a map, place a POI, and link it to a note in under
three minutes. An experienced DM can run an entire combat on a gridded dungeon map —
placing tokens, revealing fog, marking AoE templates — without losing their place or
accidentally activating the wrong tool. On mobile, the map is pan-zoom-explorable with
full POI access. Assistive technology users can navigate POIs and read their linked
content without a mouse or visual canvas rendering.

**Why this matters:** Maps are among the most visually complex tools in the application.
The I9 initiative delivered the functional map capabilities — tiled canvas rendering, POI
linking, fog of war, combat grid, route drawing, and world hierarchy. What I9 did not
address is the _experience_ of using these capabilities. A DM mid-session should not need
to understand which of fifteen mode flags is currently active, or remember which button
to click to exit POI edit mode before switching to fog painting. The map tool's complexity
must be managed through a coherent mental model, not exposed as raw implementation state.

**Depends on:** I9 (functional map capabilities), I13 (Atlas section navigation model,
`/atlas/*` route structure), I14 (layout tiers and right detail panel), I15 (Icon,
Button, Card, Dialog, Sheet, Popover, Tooltip components and design tokens), I17
(EmptyState component and Atlas empty state foundation), I18 (canvas accessibility
patterns and drag operation alternatives)

---

**Root-cause diagnosis:**

The map route (`src/routes/maps/+page.svelte`) is a single component exceeding 1,000
lines with 15+ boolean state flags representing independent modes: `editPoiMode`,
`fogEditingEnabled`, `routeEditMode`, `combatModeEnabled`, `terrainPaintMode`,
`templatePlacementMode`, `editGridHandles`, `previewPlayerLayers`. These flags can
theoretically be active simultaneously, leading to undefined interaction states. A user
cannot tell from the UI which mode is currently active — there is no persistent mode
indicator, and no mechanism prevents activating contradictory modes.

The toolbar that controls these modes is context-blind: controls for all modes compete
for the same visual space simultaneously. A DM arriving at the map for the first time
sees a comprehensive set of tools with no guidance on which are relevant to their
immediate task (viewing vs. editing POIs vs. managing fog vs. running combat).

The map library (list of all maps with thumbnails) and the map viewer (canvas + all
editing tools) are rendered in the same route component as a single monolith. There is
no route-level separation. Navigating "back" from a map to the library is not a browser
history operation but an in-component state change — breaking the navigation model that
I13 establishes and preventing the user from using OS-level back gestures or the browser
back button to return to the library.

POI hover previews are implemented with manual `clientX/clientY` tracking in raw state
variables (`poiHover`), which produces fragile behavior during scroll, zoom, and canvas
resize. The I15 Popover component provides the correct solution: anchor-relative
positioning that automatically adjusts to viewport edges.

The HTML Canvas element is opaque to assistive technology. No `<canvas>` fallback
content, no `role` override, no keyboard-based POI navigation, and no ARIA description
of map regions are present. This is a WCAG 4.1.2 failure for screen reader users and a
complete barrier for keyboard-only DMs.

The `src/routes/atlas/maps/+page.svelte` file already exists as a thin legacy wrapper
(`<LegacyMapsPage />`). The route split proposed in Epic 19.1 replaces this wrapper with
a proper SvelteKit page hierarchy.

---

## Epic 19.1 — Map Library UX: Visual Discovery and Organization

**Goal:** The map library is a visually rich, easily navigable gallery that communicates
the breadth of the campaign's world at a glance. A DM can find any map in under three
seconds. The transition from library to viewer is a proper route navigation with correct
browser back/forward semantics. The Atlas local nav panel shows the map hierarchy tree.

**Stories:**

- **S19.1.1 — Map library empty state and first-map onboarding**
  When no maps exist, the map library shows the EmptyState component (I17 S17.1.1)
  with: illustration key `map-library`, headline "No maps yet", body "Maps anchor your
  world — import an image and pin notes to every location, dungeon, and city.", primary
  action "Import your first map" (triggers the desktop file picker or a URL/file input
  in browser mode). A HelpTip (I17 S17.3.1) beside the headline explains what a map
  object is and how it connects to notes. When maps exist but none match the current
  filter, show a filtered empty state: headline "No maps match this filter", primary
  action "Clear filter", no body text. Both states use the Atlas section semantic color
  and the `map` icon from the domain vocabulary (I15 S15.2.3).

- **S19.1.2 — Map thumbnail gallery with Card component**
  Redesign the map library grid to use the Card component (I15 S15.3.4). Each card shows:
  (1) map thumbnail image at 16:9 aspect ratio, lazy-loaded with a shimmer placeholder
  while loading, (2) map name in `--text-base weight-semibold`, (3) area/region label
  in `--text-xs text-subtle` derived from the linked location note title, (4) POI count
  chip ("4 POIs") and layer count chip ("2 layers") using the semantic badge token, (5) a
  `map-pin` icon badge on the card thumbnail for the map that currently holds the party
  location (derived from session state). Cards are interactive: hover shows a subtle
  shadow elevation change using `--shadow-md`. Keyboard: arrow keys navigate between
  cards, Enter opens the map viewer, Space previews it in the right detail panel
  (Expanded layout only) without navigating. The detail panel preview shows the map
  name, thumbnail, POI list, and an "Open map" button.

- **S19.1.3 — Map hierarchy tree in Atlas local nav panel**
  Implement the Atlas section local navigation panel (I13 S13.3.1) as a hierarchy tree
  of maps. Parent map nodes show the map name with a caret; child maps are indented
  below their parent. Selecting a map node opens the map viewer. The tree follows the
  WAI-ARIA tree view pattern (I18 S18.1.2): `role="tree"`, `role="treeitem"`,
  `aria-expanded` on nodes with children, keyboard arrow-key navigation (Down/Up move
  focus, Right expands collapsed parent, Left collapses or moves to parent, Home/End
  jump to first/last, Enter opens the map). Maps without a parent appear at the root
  level. A "Filter maps" text input at the top of the panel collapses non-matching
  branches and highlights matching text. The tree node for the currently open map has
  `aria-current="page"`.

- **S19.1.4 — Map library/viewer route split**
  Split the current monolithic map route into two SvelteKit pages:
  - `src/routes/atlas/maps/+page.svelte`: the map library (gallery of all maps, filter
    controls, hierarchy tree). Replaces the current `<LegacyMapsPage />` wrapper.
  - `src/routes/atlas/maps/[id]/+page.svelte`: the map viewer for a specific map (canvas,
    mode toolbar, POI overlay, all editing tools). New route.
    Each route exports a `breadcrumb` array per I13 S13.1.4: the library's breadcrumb is
    `[Atlas, Maps]`; the viewer's is `[Atlas, Maps, {mapName}]`. Browser back from the
    viewer returns to the library. All current map component state that belongs to the
    viewer moves from the monolith into the viewer route's component. State shared between
    library and viewer (selected map, map objects) remains in `mapsState`. The `[id]` route
    loads the map object by ID from `mapsState` and reports a 404 empty state if not found.

---

## Epic 19.2 — Map Viewer Mode Architecture: State Machine Replacing Boolean Flags

**Goal:** The map viewer has exactly one active mode at any time, always visible to the
user. Switching modes is a single intentional action that transitions a typed state
machine — not a toggle of one of fifteen independent boolean flags. Every mode's tools
are contextually surfaced only when that mode is active.

**Stories:**

- **S19.2.1 — Map mode state machine**
  Introduce a `MapViewerMode` union type in `src/lib/types/map-viewer.ts`:

  ```typescript
  type MapViewerMode =
  	| 'view' // read-only: navigate, hover POIs, read linked content
  	| 'poi_edit' // click-to-place POIs, drag POIs, edit pin metadata
  	| 'fog_paint' // paint fog reveal / refog operations
  	| 'route_edit' // draw and edit travel routes
  	| 'grid_align' // drag grid control points, set cell size
  	| 'combat' // token placement, movement ranges, AoE templates
  	| 'layer_manage'; // add, rename, reorder, delete annotation layers;
  ```

  The active mode is a single reactive `$state` variable. Entering a mode sets this
  variable and clears sub-mode state. Leaving a mode (via Escape or the toolbar exit
  button) always returns to `'view'`. Only one mode is active at a time — the boolean
  flags `editPoiMode`, `fogEditingEnabled`, `routeEditMode`, `combatModeEnabled`,
  `terrainPaintMode`, `templatePlacementMode`, `editGridHandles` are removed and their
  logic consolidated under this single variable. Mode transitions that involve unsaved
  changes (a POI being dragged, a route with uncommitted waypoints) prompt a save
  confirmation using the Dialog component (I15 S15.3.5) before transitioning.

- **S19.2.2 — Mode indicator strip**
  A horizontal mode indicator strip appears at the top of the map canvas whenever the
  active mode is not `'view'`. The strip contains: (1) the mode icon (20px, accent color)
  and mode name in `--text-sm weight-semibold`, (2) a one-line contextual hint for the
  mode's primary action (e.g., "Click the map to place a point of interest"), (3) an
  "Exit {Mode}" button (ghost variant, Button component, always visible) that returns to
  `view` mode. The strip uses `--color-warning-subtle` as background — a distinct amber
  tint that makes mode activation visually unmistakable. When mode is `'view'`, the strip
  is hidden entirely (not just transparent — `display: none` so it does not occupy
  height). Strip height: 36px. The strip is `role="status"` with `aria-live="polite"` so
  screen readers announce the mode change.

- **S19.2.3 — Contextual tool panel per mode**
  Each mode's controls render in a contextual tool panel that is visible only when that
  mode is active. On Expanded layout (I14 S14.3.2): the right detail panel. On
  Medium/Compact layout: a bottom Sheet (I15 S15.3.5) triggered by a "Tools" button in
  the mode indicator strip. Tool panel content per mode:
  - `view`: map legend if one is defined; selected POI details when a POI is focused.
  - `poi_edit`: category selector (RadioGroup), linked note search input, layer selector
    (Select), optional object link.
  - `fog_paint`: brush type (icon RadioGroup), brush radius slider with numeric readout,
    reveal/refog Toggle, fog color picker (3 swatches), "Clear all fog" danger Button.
  - `route_edit`: route name Input, route style selector (straight/curved), live distance
    readout when scale is defined.
  - `grid_align`: cell size Input (px), grid type RadioGroup (square/hex), origin
    coordinate display, "Snap to image edges" Button.
  - `combat`: AoE template shape RadioGroup, template size inputs, terrain paint Toggle,
    "End combat" danger Button.
  - `layer_manage`: layer list with per-row controls (see Epic 19.4).
    This eliminates the current approach where all controls for all modes are rendered
    simultaneously in the toolbar.

- **S19.2.4 — Map toolbar reduced to mode switcher**
  The map toolbar above the canvas is reduced to two functional groups separated by a
  vertical divider:
  - **Left group — mode switcher**: icon buttons for each mode (`map-pin` for poi_edit,
    `eye-off` for fog_paint, `route` for route_edit, `grid` for grid_align, `swords` for
    combat, `layers` for layer_manage). Implemented as a `role="radiogroup"` with
    `role="radio"` semantics. Active mode button has `aria-checked="true"` and the accent
    filled background. Inactive modes are ghost buttons. Each button has a Tooltip (I15
    S15.3.5) showing the mode name and its keyboard shortcut.
  - **Right group — global controls**: zoom fit button (`fit` icon), zoom 100% button,
    show/hide grid Toggle, player preview Toggle (shows only player-visible layers). These
    global controls are always available regardless of mode.
    No other content belongs in the toolbar. Mode-specific controls live exclusively in
    the contextual tool panel.

- **S19.2.5 — Keyboard shortcuts for mode switching**
  Register map-specific keyboard shortcuts in the global shortcut registry (I18 S18.2.3).
  Shortcuts activate only when the map viewer route is focused and no text input is
  active:
  - `v`: enter `view` mode (also exits any active mode)
  - `p`: enter `poi_edit` mode
  - `f`: enter `fog_paint` mode
  - `r`: enter `route_edit` mode
  - `g`: enter `grid_align` mode
  - `c`: enter `combat` mode
  - `Escape`: exit current mode, return to `view`
  - `0`: zoom to fit
  - `1`: zoom to 100%
  - `+` / `-`: zoom in / out by 10%
  - `Ctrl+Z`: undo last map edit operation (Epic 19.4)
  - `Ctrl+Shift+Z`: redo
    Shortcuts are shown in the Tooltip for each mode button.

---

## Epic 19.3 — POI UX: Creation Workflow, Preview Quality & Linking

**Goal:** Placing a POI is a natural single click in POI edit mode. The POI hover preview
is positioned correctly at all zoom levels and uses the Popover component. Linking a POI
to a note or creating a new note from a POI is a guided two-step Dialog flow. POI detail
is surfaced in the right detail panel, not in a floating form overlay competing with the
canvas.

**Stories:**

- **S19.3.1 — POI placement cursor and ghost pin feedback**
  In `poi_edit` mode, the canvas cursor changes to `crosshair`. A ghost pin icon (the
  `map-pin` SVG at 50% opacity) follows the cursor position. When a grid is active,
  the ghost pin snaps to the nearest grid cell center — the snap position is shown
  as a highlighted grid cell. Clicking places the pin at the ghosted position with a
  scale-in animation (0 → 1 over 150ms, respecting `prefers-reduced-motion`). For touch
  devices: tapping the canvas places a pin at the tap position. A "Tap to place" hint
  appears in the mode indicator strip on touch input modality (detected by the first
  `touchstart` event). Double-tapping the canvas in touch mode does not accidentally
  place two pins — a 300ms debounce prevents double-tap fires.

- **S19.3.2 — POI hover popover using Popover component**
  Replace the current manual `poiHover` state (`clientX/clientY`) with the Popover
  component (I15 S15.3.5). Each POI pin is rendered as an absolutely-positioned
  `<button>` overlaid on the canvas at the pin's screen coordinates (updated reactively
  on zoom/pan). The Popover anchors to this button element and contains: pin label in
  `--text-sm weight-semibold`, category chip with category icon, linked note preview
  (first 3 lines as plain text, 2-line truncation), and a "View note" link that opens the
  note in the right detail panel split view. The Popover appears on hover (100ms delay to
  avoid flickering during map pan) and on keyboard focus of the pin button. It dismisses
  on mouse leave, Escape, or click outside. Screen coordinate recalculation for pin
  position is performed in a `$derived` that re-computes when zoom or pan state changes,
  ensuring pins track correctly at all zoom levels.

- **S19.3.3 — POI selected state in right detail panel**
  When a POI is selected (clicked in `view` mode or focused in `poi_edit` mode), the
  right detail panel (Expanded layout) or a bottom Sheet (Compact/Medium) shows:
  - Pin label as `<h2>` (semantic heading, not just a large text).
  - Category badge: Icon + category name chip.
  - Layer assignment label.
  - Linked content section: if linked to a note, shows note title, folder breadcrumb,
    5-line preview, "Read note" button (primary) and "Open in new pane" button (ghost).
    If not linked: "No note linked" label with "Link existing note" button (opens a search
    Dialog) and "Create note here" button (opens the guided creation flow, S19.3.4).
  - Map position in fractional coordinates ("Position: 43% × 67%") for reference.
  - In `poi_edit` mode: the display-only fields become inline edit controls — the label
    becomes an Input, category becomes a Select, linked note becomes a search Input.
    Changes are saved on blur or on explicit "Save" Button click.
    On Compact layout, the POI detail Sheet uses `Sheet.svelte` with a drag handle and
    is dismissible by swipe-down, Escape, or backdrop tap.

- **S19.3.4 — Linked note creation from POI: guided Dialog flow**
  When "Create note here" is activated for an unlinked POI, a Dialog (I15 S15.3.5) opens
  with three steps rendered as a single-page form (not a multi-step wizard, to minimize
  clicks):
  1. **Title input** (Input component, pre-filled with the POI label).
  2. **Note type selector**: four large radio cards (Card component, interactive variant)
     labeled "Location", "NPC", "Faction", "Plain note". The card shows the type icon
     and a one-line description of what the template provides.
  3. **Optional**: a "Start with template content" checkbox that pre-fills the note body
     with a type-appropriate stub (Location: name / description / notable features
     skeleton; NPC: name / role / appearance / personality skeleton).
     The Dialog's primary action is "Create and Link" — creates the note in the vault,
     links it to the POI, and closes the dialog. The POI pin's linked state updates
     immediately. The note is openable from the right detail panel's "Read note" button
     without further navigation.

---

## Epic 19.4 — Editing Tool Ergonomics: Undo, Fog, Routes, and Layers

**Goal:** Map editing operations are error-tolerant and reversible. The fog brush shows
a live size preview. Route waypoints are explicit and deletable. Layer management is a
first-class panel with drag-reorder alternatives. Every editing tool has keyboard access
and touch ergonomics.

**Stories:**

- **S19.4.1 — Undo/redo stack for map editing operations**
  Implement an undo/redo stack for map editing in `src/lib/state/map-undo-stack.svelte.ts`.
  Operations subject to undo: POI placement, POI deletion, POI move, fog paint stroke
  (each completed stroke — mouseup or touchend — is one undo unit), route waypoint add,
  route finalize, route deletion, layer visibility toggle, grid alignment change. Stack
  depth: 50 operations. Keyboard: `Ctrl+Z` / `Ctrl+Shift+Z` (registered in the global
  shortcut registry per I18 S18.2.3, scoped to the map viewer route). After each undo,
  a toast (I15 S15.3.6) announces "Undone: {operation name}" (e.g., "Undone: POI moved").
  Operations that cannot be undone — map import, map deletion, fog state persistence to
  other tabs — require explicit Dialog confirmation before execution (per UX Guidelines
  §8). The undo stack clears on route navigation away from the map viewer.

- **S19.4.2 — Fog paint tool ergonomics**
  The `fog_paint` contextual tool panel (S19.2.3) provides:
  - **Brush type**: three large icon buttons as RadioGroup (circle, rectangle, polygon),
    each 40px × 40px to meet touch target requirements (I18 S18.4.1).
  - **Circle brush only**: radius slider (`<input type="range">`, min 2%, max 25% of map
    width). A numeric readout shows the radius as a percentage. Keyboard: Left/Right
    arrows adjust by 1%. On the canvas, a translucent circle tracks the cursor in
    `fog_paint` mode, previewing the exact brush area before painting.
  - **Polygon (lasso)**: click-to-place vertices. A vertex count indicator ("3 vertices")
    appears in the mode strip. Double-click or Enter closes the polygon. Escape cancels
    the in-progress polygon (removes all uncommitted vertices). The closing line is shown
    as a dashed preview from the last vertex to the cursor.
  - **Reveal/Re-fog toggle**: labeled Toggle (I15 S15.3.2), prominent size (44px height),
    with icon: `eye` for reveal, `eye-off` for refog.
  - **"Clear all fog"**: danger Button (I15 S15.3.1) with confirmation Dialog: "Remove
    all fog from this map? This cannot be undone."

- **S19.4.3 — Route drawing UX: explicit waypoint model**
  In `route_edit` mode, canvas interaction follows a clear model: click to place the
  first waypoint (rendered as a solid 8px circle), click again to place subsequent
  waypoints connected by the route line. The preview line from the last placed waypoint
  to the cursor is dashed and updates in real time. Double-click or Enter finalizes the
  route (dashed → solid line). Escape cancels all uncommitted waypoints (the route is
  not saved). Existing route waypoints are draggable; hovering a waypoint shows a delete
  button (`x` icon, 32px touch target, `aria-label="Delete waypoint"`). A live distance
  readout in the tool panel updates as waypoints are placed (formatted with the map's
  scale if configured). Routes are selectable: clicking a route line selects it and
  shows its name and distance in the tool panel for editing. A "Delete route" danger
  Button appears in the panel when a route is selected.

- **S19.4.4 — Layer management panel as first-class UI**
  In `layer_manage` mode, the contextual tool panel shows a layer list. Each row:
  - Visibility toggle (eye icon button, 32px, `aria-label="Toggle {layerName} visibility"`).
  - 16px color swatch (uses the layer's color theme token).
  - Layer name — inline-editable: click the name to enter an Input in place. Press Enter
    or blur to save.
  - `player_visible` icon badge: `user` icon (filled = visible to players). Clicking
    toggles; `aria-label="Players can see this layer"` / `aria-label="Players cannot see
this layer"`.
  - A `...` Popover menu: Rename, Duplicate, Delete (with confirmation if the layer has
    POIs), Move up, Move down.
    An "Add layer" Button (secondary variant, full-width at bottom of list) creates a new
    layer named "New Layer" and immediately puts the name into edit mode. Layer reordering:
    drag-and-drop with the Move up/Move down keyboard alternative per I18 S18.4.2. The
    active layer for new POI placement is highlighted with a left accent border; clicking
    any layer row (outside the controls) sets it as the active layer.

---

## Epic 19.5 — Map Canvas Accessibility and Mobile Experience

**Goal:** The map tool is usable by DMs who cannot use a mouse. POIs are navigable and
activatable by keyboard. Screen readers can access POI information and map region
descriptions. On mobile, pan/zoom is natural and ergonomic. The mode indicator does not
obstruct the canvas on small screens.

**Stories:**

- **S19.5.1 — Keyboard navigation for POI pins**
  Formalize the POI pin overlay as accessible interactive buttons. Each POI pin is an
  absolutely-positioned `<button>` element with:
  - `aria-label="{pinLabel}: {category}, linked to {noteTitle or 'no note linked'}"`.
  - `tabindex="0"` (in the Tab order when `view` mode is active).
  - Arrow key navigation: when a pin button is focused, Left/Right/Up/Down arrow keys
    move focus to the nearest pin in that cardinal direction from the current pin (using
    Euclidean distance on screen coordinates). Home/End jump to the first/last pin in
    the current layer (by insertion order).
  - Enter: select the pin (opens the right detail panel / bottom Sheet).
  - Delete (in `poi_edit` mode): deletes the pin after a confirmation if it is linked to
    a note. Unlinked pins delete immediately with an undo toast.
  - The focused pin receives a 2px focus ring (using `--color-focus-ring`) around the
    pin icon at a 2px offset per I18 S18.2.2.

- **S19.5.2 — ARIA structure for map canvas**
  The map canvas container (`<div>` wrapping the `<canvas>`) has:
  - `role="application"` with `aria-label="{mapName} — interactive map. {N} points of
interest in {L} layers."` updated when POI count changes via `aria-live="polite"`.
  - A visually hidden `<div aria-live="polite" class="sr-only">` that announces editing
    operations: "POI '{label}' placed", "Fog revealed in region", "Route '{name}' saved".
  - A `<ul aria-label="Points of interest" class="sr-only">` outside the canvas listing
    all POIs with their categories, linked note titles, and layer names — providing a
    screen-reader-browsable POI inventory without canvas interaction.
    A "List view" toggle button in the toolbar switches the map view between the canvas and
    an accessible table of all POIs: columns for Name, Category, Layer, and Linked Note,
    with a "Navigate to POI" action per row. This is the full keyboard-only access path for
    users who cannot interact with the canvas at all (WCAG 4.1.2 compliance for the canvas
    content).

- **S19.5.3 — Mobile touch gesture model**
  On Compact layout (I14 S14.1.1), the map viewer is optimised for touch:
  - **Single-finger pan**: immediate, no friction. Inertia: the canvas continues to drift
    for 300ms after lift, decelerating with `--easing-decelerate`. Single tap on the
    drifting canvas stops inertia.
  - **Pinch-to-zoom**: centered on the pinch midpoint. Minimum: fit-to-screen. Maximum:
    400% (matching the existing `MAX_ZOOM`).
  - **Double-tap**: zoom in one preset step (to 200%). Double-tap again returns to fit.
  - **Long-press on canvas background** (300ms): opens a bottom Sheet context menu with
    actions relevant to the active mode: in `view` mode: "Place POI here", "Mark party
    here", "Reset view"; in `fog_paint` mode: "Reveal this area", "Re-fog this area".
    This is the primary canvas action trigger on touch — it prevents accidental POI
    placement when the user intends to pan.
  - **In `fog_paint` mode on touch**: a large circular brush (default radius 15% of
    screen width) follows `touchmove`. A resize handle at the brush edge can be dragged
    to change size. Touch painting starts on `touchstart` and continues on `touchmove`
    with no separate "paint" button required.

- **S19.5.4 — Mobile mode toolbar placement**
  On Compact layout, the mode toolbar (S19.2.4) moves from the top of the canvas to a
  horizontal scrollable strip anchored above the bottom navigation bar (thumb-reachable
  zone). The mode strip shows mode buttons at 44px height each (meeting I18 S18.4.1).
  The mode indicator strip (S19.2.2) collapses to a compact chip at the top-centre of
  the canvas: "[Mode icon] POI Edit — tap for tools". Tapping the chip opens the
  contextual tool panel as a bottom Sheet. This prevents the mode strip from consuming
  canvas real estate on small screens. The global map controls (zoom fit, grid toggle)
  are accessible via a `...` overflow button in the mobile toolbar strip.

---
