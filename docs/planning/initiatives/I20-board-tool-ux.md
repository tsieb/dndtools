# Initiative 20 — Board Tool UX: Tile Interaction Design, Mobile Board & Map Integration

## Status: COMPLETED

**Outcome:** The session board is a mission control surface that works equally well in
prep mode at a desk and in active-session mode at the table. Individual tiles are
visually distinct by type and immediately scannable. Creating a tile is a two-click
visual gallery flow with live preview. On Compact layout, the board is a vertically
stacked set of collapsible panels — not an infinite canvas requiring pinch-zoom. A map
tile brings the Atlas into the session board, resolving the disconnection between spatial
and reference content during combat. Keyboard users can add, move, and configure tiles
without a mouse.

**Why this matters:** I16 redesigns the session board's structural layout into zones and
establishes the session-mode state machine. I20 completes the board experience at the
interaction level. The tile creation flow, tile visual identity, mobile board layout, map
tile integration, and board keyboard accessibility are not addressed by I16 and remain
primary sources of DM friction at the table. A DM running a session on a tablet must
currently manage an infinite-canvas pinch-zoom board while also tracking initiative and
answering player questions. The mobile board experience directly degrades session quality.

**Depends on:** I9 (map object system and reusable `MapCanvasViewer` component),
I13 (Session section navigation model, `/session/*` route structure), I14 (Compact /
Medium / Expanded layout tiers and right detail panel), I15 (Icon, Button, Card, Dialog,
Sheet, Popover, Tooltip, ListItem components and design tokens), I16 (session-mode state
machine, board zone redesign, scene management), I17 (EmptyState component, board empty
state foundation), I18 (drag operation alternatives, touch target minimums, keyboard
navigation), I19 (map viewer component reusability and mobile map patterns)

---

**Root-cause diagnosis:**

The tile creation flow requires the DM to: enter edit mode, understand the "note slot"
abstraction (a tile that visually appears as an empty box), search through a flat list
of up to 40 notes, and assign a note to the slot. There is no visual preview of what
a tile will look like when populated. New tile types (combat, dice, encounter, generator,
handouts, timer, calendar) are added via a menu but without any visual preview of what
each type provides. The tile type menu is a flat text list, not a visual gallery.

The tile visual design is uniform: every tile is a card-like box with a header and
content area. Combat tracker tiles, note tiles, and dice tray tiles are visually
indistinguishable at a glance — there is no type-specific color, icon, or structural
differentiation. In a live session under time pressure, the DM cannot scan the board
and immediately identify tile types; they must read the header label of each tile.

The board uses an infinite canvas with zoom from 20% to 400%. This zoom range is
appropriate for diagramming tools (Miro, Figma, Excalidraw) but not for a mission
control reference panel. DMs do not zoom to 400% to annotate tiles — they want to see
all tiles at once and access content quickly. The wide zoom range creates confusion about
the "correct" zoom level and makes the board feel like a whiteboard tool. The current
`MIN_ZOOM = 0.2` constant allows shrinking tiles to 20% of their designed size, making
content unreadable.

On Compact layout (phones, small tablets), the infinite canvas with tiles at absolute
pixel coordinates is effectively unusable. A tile positioned at `x: 8, y: 4` is
off-screen without panning, there is no scroll-based navigation, and pinch-zoom
conflicts with OS scroll gestures. The board has no mobile layout whatsoever.

No tile type exists for displaying a map. Combat on a gridded map is managed at
`/atlas/maps/{id}`, a separate route that requires the DM to navigate away from the
session board entirely, losing their scene context, NPC references, and initiative order
visibility. The map and board tools are architecturally connected (the combat tracker
tile feeds token state into the map's combat grid, and `SessionBoardCombatMapTemplate`
types exist) but the board has no surface to display the map itself.

The `src/routes/session/boards/+page.svelte` file is a thin `<LegacySessionBoardPage />`
wrapper. The improvements in this initiative refactor the actual implementation in
`src/routes/session-board/+page.svelte` and its component subtree in `src/lib/ui/board/`.

---

## Epic 20.1 — Tile Type Visual Identity System

**Goal:** Every tile type is visually recognizable at a glance by its header accent,
icon, and structural silhouette. A DM scanning the board identifies tile types in under
one second per tile without reading labels. The visual identity system is built from
semantic design tokens, not per-component hardcoded colors.

**Stories:**

- **S20.1.1 — Tile type semantic color and icon tokens**
  Add tile type surface tokens to `app.css` under the `@theme` block. These tokens are
  semantic — they reference the existing palette but assign roles by function:
  - `--color-tile-note`: `--color-surface` (neutral — note tiles carry no accent color).
  - `--color-tile-combat`: maps to crimson-700 (light) / crimson-900 (dark).
  - `--color-tile-encounter`: maps to amber-700 (light) / amber-900 (dark).
  - `--color-tile-dice`: maps to indigo-700 (light) / indigo-900 (dark).
  - `--color-tile-generator`: maps to emerald-700 (light) / emerald-900 (dark).
  - `--color-tile-handouts`: maps to rose-700 (light) / rose-900 (dark).
  - `--color-tile-timer`: maps to slate-600 (light) / slate-800 (dark).
  - `--color-tile-calendar`: maps to teal-700 (light) / teal-900 (dark).
  - `--color-tile-map`: maps to saddle-brown-700 (light) / saddle-brown-900 (dark).
    Each tile type's header bar (top 32px of the tile) displays: a 4px left border in the
    type token color, the type icon (16px, domain vocabulary from I15 S15.2.3) in the type
    token color, and the tile label in `--text-sm weight-semibold`. The type icon assignment:
    note → `scroll`, combat → `swords`, encounter → `shield`, dice → `dice-5`, generator
    → `wand-2`, handouts → `file-text`, timer → `clock`, calendar → `calendar`, map →
    `map`. Type token and icon are defined in a central `TILE_TYPE_METADATA` constant in
    `src/lib/domain/session-board.ts` — the source of truth for all tile-type-specific UI
    decisions.

- **S20.1.2 — Note tile depth controls: three content levels**
  Note tiles display content at one of three configurable depth levels, stored per tile
  in the session board JSON:
  - **Title only**: note title + modified date + up to 2 tag pills. Tile height: minimum
    1 row unit. Used for reference notes the DM knows well and only needs to identify.
  - **Summary**: note title + the first 5 lines of rendered note content (same markdown
    pipeline as the note reading view, wikilinks rendered as plain text). Tile height:
    minimum 2 row units.
  - **Full**: complete rendered note, scrollable within the tile. Tile height: minimum 3
    row units, user-resizable. Used for room descriptions and NPC profiles the DM reads
    at length during a session.
    The depth level selector is in the tile's action menu (S20.1.3): "Content depth →
    Title only / Summary / Full" as a RadioGroup. In edit mode, a depth badge appears on
    the tile header: a small `T` / `S` / `F` chip beside the tile label. In session-active
    mode (I16), tiles default to their configured depth — the depth badge is hidden so the
    board has a cleaner mission-control appearance.

- **S20.1.3 — Tile action menu using Popover with accessible menu pattern**
  Each tile has a `...` (overflow) icon button (24px icon in a 36px tap target, I18
  S18.4.1) in its top-right corner. On desktop: visible on tile hover. On touch: always
  visible. The button opens a Popover (I15 S15.3.5) with a `role="menu"` list:
  - All tiles: "Move tile" (enters keyboard move mode, S20.2.3), "Resize tile" (opens
    resize controls, S20.1.4), "Duplicate tile", "Remove tile" (danger, shows
    confirmation dialog before deletion).
  - Note tiles additionally: "Open note" (navigates to Knowledge section), "Change note"
    (opens note search Dialog), "Content depth" submenu.
  - Combat tile: "Reset combat", "Export encounter log".
  - Map tile: "Change map", "Toggle combat overlay".
    The `...` button has `aria-label="Tile options for {tileLabel}"`, `aria-haspopup=
"menu"`, and `aria-expanded` linked to the Popover state. Keyboard: Escape closes the
    menu and returns focus to the `...` button. Up/Down arrows navigate menu items. Enter
    activates the focused item. This replaces any inline icon buttons in tile headers that
    currently compete with content space.

- **S20.1.4 — Tile resize with keyboard and preset alternatives**
  Each tile shows a resize handle at its bottom-right corner in edit mode (a 16px `×`
  icon, 32px touch target). Drag snaps to grid (nearest w/h unit). Drag alternative per
  I18 S18.4.2: clicking the handle without dragging cycles through three size presets:
  - Small: 2 columns × 1 row
  - Medium: 3 columns × 2 rows
  - Large: 4 columns × 3 rows
    Keyboard alternative via the tile action menu's "Resize tile" option: entering resize
    mode highlights the tile with a dashed accent border and activates arrow key controls —
    Left/Right adjust width by 1 column unit, Up/Down adjust height by 1 row unit. Current
    size is announced via `aria-live="polite"` as "Tile size: 3 wide, 2 tall." Enter or
    Escape saves and exits resize mode. Minimum tile size: 2 × 1 (enforced by snap — the
    resize handle cannot drag below this).

---

## Epic 20.2 — Board Interaction Model: Fit-First, Scroll-Natural, Keyboard-Operable

**Goal:** The board zoom model is appropriate for a reference panel, not a diagramming
tool. Scroll moves the board; zoom is a three-preset choice, not a continuous range.
Tile keyboard navigation is complete. Tile drag has a Move up/down keyboard alternative.
The board never silently places tiles off-screen.

**Stories:**

- **S20.2.1 — Board zoom model: three intentional presets**
  Replace the continuous 20%–400% zoom range with three named presets:
  - **Fit** (`0`): zoom is computed as the minimum ratio that makes all tiles visible
    within the viewport simultaneously. This is the default view mode and the post-load
    initial state. Keyboard: `0`.
  - **Comfortable** (`1`): tiles render at 1× scale (unscaled `rowHeight` and
    `CELL_WIDTH` values). Keyboard: `1`.
  - **Detail** (`2`): tiles render at 1.5× scale, useful for reading dense note content
    without opening the note. Keyboard: `2`.
    `+`/`-` keys cycle through presets sequentially. The current zoom slider and `MIN_ZOOM
= 0.2` / `MAX_ZOOM = 4` constants are removed. Three Button components replace the
    slider in the board toolbar: "Fit", "Comfortable", "Detail". The active preset button
    uses the primary variant; inactive presets use the ghost variant. This change aligns
    the board with its mission: seeing and using content, not navigating a canvas. The
    computed zoom for Fit mode is never less than 0.5 — boards with very many tiles show a
    scroll bar rather than making tiles unreadably small.

- **S20.2.2 — Board scroll behavior: wheel scrolls, drag pans**
  Redesign pan behavior so it matches the expected model for a reference panel:
  - Vertical scroll wheel: scrolls the board vertically. No zoom on scroll.
  - Horizontal scroll / Shift+scroll: scrolls horizontally.
  - Middle-mouse drag or two-finger trackpad pan: pans the board.
  - Touch: single-finger scroll (vertical/horizontal). No pinch-to-zoom — the preset
    buttons replace it.
    The current `pan` state (pointer-based drag pan) is kept for middle-mouse and
    two-finger touch but single-finger touch and single-mouse-drag on the board background
    become standard scroll. This eliminates the current ambiguity where a single touch on
    the background either pans or accidentally fails to select a tile, depending on how
    precisely the user avoids tile boundaries.

- **S20.2.3 — Tile keyboard navigation and placement**
  When the board viewport is focused (Tab reaches the board), pressing Tab cycles focus
  through tiles in reading order (left-to-right, top-to-bottom, derived from `x`/`y`
  sort). The focused tile receives the global focus ring (I18 S18.2.2). Keyboard
  interactions on a focused tile:
  - Enter: enter the tile's interactive content (focus moves to first interactive element
    within the tile's content area).
  - Space: select the tile for move mode. In move mode: arrow keys move the tile one grid
    unit per keypress, snapping to valid positions. Enter saves the new position. Escape
    cancels and returns to original position. The tile's current position is announced
    via `aria-live="assertive"` as "Tile at column 3, row 2" during keyboard movement.
  - `a` (when the board is focused, in edit mode): opens the tile creation Sheet
    (S20.3.1) via keyboard. This provides keyboard-first tile creation without requiring
    mouse navigation to the "+" button in the toolbar.
  - Delete: shows tile removal Dialog (prevents accidental deletion of tiles the DM has
    configured with content).

- **S20.2.4 — Board column overflow indicator**
  When a tile drag or placement would position a tile beyond the board's column count,
  it snaps back to the last valid column (leftmost valid x that fits the tile's width).
  A snap feedback animation (a brief red border flash on the tile, 150ms, skipped if
  `prefers-reduced-motion`) shows that the position was corrected. If the board currently
  contains tiles that are partially off-screen (x + w > columns), a non-blocking
  information banner appears below the board toolbar: "Some tiles extend beyond the
  visible board width. Drag them back or reduce their width." A "Fix layout" Button in
  the banner attempts to auto-repack the tiles into a valid grid arrangement (using a
  simple bin-packing: tiles sorted by y then x, placed greedily). The banner is
  dismissable per session and does not appear again until the board is next edited.

---

## Epic 20.3 — Tile Creation Flow: Visual Gallery and Live Preview

**Goal:** Adding a tile is a two-click operation using a visual gallery Sheet. The DM
sees what each tile type provides before creating it. Note assignment uses a search-with-
preview Dialog, not a flat 40-item list. Tiles can be created from the Command Palette.
The map tile brings the Atlas directly into session board context.

**Stories:**

- **S20.3.1 — Tile type gallery Sheet**
  The "Add tile" action in edit mode (toolbar "+" button, keyboard `a`, or Command
  Palette `>board Add tile`) opens a Sheet (I15 S15.3.5) containing a visual tile type
  gallery. Tiles are shown as Card components (I15 S15.3.4) in a 2-column grid, each
  showing: the type accent color as a left border, the type icon (24px), the type name
  in `--text-base weight-semibold`, and a one-line description of what the tile provides:
  - Note: "Display any vault note with live content preview."
  - Combat tracker: "Track initiative, HP, and conditions in real time."
  - Encounter builder: "Build and balance encounters with CR math."
  - Dice tray: "Roll dice expressions and review session roll history."
  - Generator: "Roll random tables and generate NPCs with campaign context."
  - Handouts: "Browse and deliver vault handouts to players."
  - Timer: "Track session time, countdown timers, and lap marks."
  - Calendar: "Reference the world calendar for the current in-game date."
  - Map: "Display an interactive vault map, including the combat grid."
    Selecting a type immediately adds a tile at the next available board position (lowest
    row with space, leftmost column) and closes the Sheet. The new tile is focused
    (keyboard focus moves to it) for immediate keyboard interaction.

- **S20.3.2 — Note tile assignment: search with inline content preview**
  A note tile with no assigned note shows the EmptyState component (I17 S17.1.1) inside
  the tile: illustration `note-tile-empty`, headline "Assign a note", primary action
  "Choose note". Clicking "Choose note" (or tapping the empty tile in edit mode) opens a
  Dialog (I15 S15.3.5) with: a search Input (auto-focused), and results as ListItem
  components (I15 S15.3.4) showing note title, folder breadcrumb, and up to 2 tags.
  Below each result: a 3-line content preview in `--text-xs text-subtle`. The preview
  updates as the search query changes. Selecting a result assigns it and closes the
  Dialog. The tile immediately renders at the configured depth level. This replaces the
  current "note slot" pattern — the EmptyState makes the unassigned state legible and
  purposeful, not broken-looking.

- **S20.3.3 — Tile creation from Command Palette**
  Extend the Command Palette (I13 S13.5.1) with board tile commands. When the session
  board route is active, typing `>board` in the Command Palette shows:
  - "Add note tile" → opens the note assignment Dialog (S20.3.2).
  - "Add combat tracker" → adds a combat tile.
  - "Add dice tray" → adds a dice tile.
  - "Add timer" → adds a timer tile.
  - "Add map tile" → opens the map picker (S20.3.4).
    These commands are visible only when the session board is the active route (scoped
    availability per the command palette's context system). They provide keyboard-first
    tile creation without entering edit mode first — the Command Palette adds the tile and
    enters edit mode automatically if the board was in view mode.

- **S20.3.4 — Map tile type**
  Add `map` as a tile type in the session board type system (`src/lib/types/session-
board.ts`). The map tile metadata: `mapId` (string, required), `initialZoom` ('fit' |
  'comfortable' | 'detail', default 'fit'), `combatOverlay` (boolean, default false).
  The tile renders the `MapCanvasViewer` component (already reusable from I9 S9.1.2)
  within the tile's content area, sized to fill the tile's current dimensions. The map
  viewer inside the tile has pan/zoom enabled (the same controls as the full map viewer,
  scaled to the tile size). When `combatOverlay` is true and the session has an active
  combat state, the map tile renders combat tokens, AoE templates, and movement indicators
  synchronized with the session combat state — bringing the combat grid into the board
  without navigation. The tile's action menu (S20.1.3) offers "Change map" (opens a map
  picker Dialog) and "Toggle combat overlay". The tile's header accent uses
  `--color-tile-map`. A map tile with no assigned map shows the EmptyState: headline
  "No map selected", primary action "Choose map".

---

## Epic 20.4 — Mobile Board: Stacked Panels and Touch-First Interaction

**Goal:** On Compact layout, the session board renders as a vertically stacked set of
collapsible tile panels — a standard scrolling list, not an infinite canvas. Every tile
is accessible by scrolling. A floating action bar surfaces the three most common
mid-session actions above the bottom navigation bar. The combat tracker tile is redesigned
for one-handed touch operation.

**Stories:**

- **S20.4.1 — Compact layout: stacked tile panel rendering**
  On Compact layout (I14 S14.1.1), the board rendering logic in `+page.svelte` detects
  the `layoutTier` store (I14 S14.1.3). When `layoutTier === 'compact'`, the board
  ignores the tile `x` / `y` / `w` / `h` absolute position fields and instead renders
  tiles as a vertically ordered, full-width stack. Tile order in the stack is derived
  from sorting tiles by `y` (primary) then `x` (secondary) — the desktop layout's
  reading order maps to the mobile stack order without requiring a separate mobile layout
  configuration. Each stacked tile is a collapsible panel: the header (type icon + label
  - collapse chevron, 48px height) is always visible; the body collapses/expands on
    header tap. Expanded state per tile is stored in `sessionStorage` keyed to the board
    ID — persists through route changes within the session but resets on new sessions. The
    board has no zoom or pan on Compact — it scrolls as a standard page. The board's
    background pattern and empty-state logic remain unchanged.

- **S20.4.2 — Compact board: tile full-screen expand**
  Each tile panel in the stacked Compact layout has a full-screen expand button in the
  header: a `maximize-2` icon button (36px tap target, `aria-label="Expand {tileLabel}
to full screen"`). Tapping it transitions the tile to `position: fixed; inset: 0;
z-index: var(--z-overlay)` with a bottom inset equal to `--layout-bottomnav-height`
  (so the tile does not cover the bottom nav bar). The tile content fills the expanded
  area. A "Minimize" button (`minimize-2` icon, always visible in the expanded tile
  header) collapses back. This is a CSS-level transition — no SvelteKit routing — so it
  does not affect browser history. The expand/collapse uses the `--duration-medium`
  motion token with `--easing-standard`. When `prefers-reduced-motion` is active, the
  transition is instant. Full-screen expand is most useful for: combat tracker tile
  (full-height initiative list), note tile in Full depth (full-screen note reading),
  and map tile (full-screen map with combat grid).

- **S20.4.3 — Compact board: floating session action bar**
  On Compact layout when session mode is `active` (I16 S16.1.3), a floating action bar
  appears between the last tile and the bottom navigation bar. The bar is `position:
sticky; bottom: --layout-bottomnav-height` and scrolls with the page until the bottom
  of the tile list is reached, then sticks. Bar contents:
  - d6 and d20 icon buttons (40px × 40px, using die-face SVG icons from the domain
    vocabulary). Tapping rolls the die and shows the result in a toast that also appends
    to the session roll history (I16 S16.2.2).
  - "Next turn" button (primary variant, shown only when `session.combatActive === true`,
    40px height, `aria-label="Advance to next combat turn"`). The button uses
    `--color-tile-combat` as its accent to visually connect it to the combat state.
  - "Handout" icon button (`file-text` icon, 40px × 40px). Tapping opens the handout
    delivery Sheet (I16 S16.4.3).
    The bar has `role="toolbar"` and `aria-label="Session quick actions"`. It is only
    visible on Compact layout in session-active mode — it does not appear in prep mode or
    on Medium/Expanded layouts (where the Session local nav panel provides this access).

- **S20.4.4 — Touch-first combat tracker tile on Compact layout**
  The `CombatTrackerTile.svelte` component detects `layoutTier === 'compact'` and renders
  a touch-optimized layout. Changes vs. the desktop version:
  - Combatant row height: 56px (thumb-reachable, meeting I18 S18.4.1 recommended 44px+).
  - HP display: a tappable button (`aria-label="Adjust HP for {combatantName}: {current}
/ {max}"`) — tapping opens a bottom Sheet with a numeric keypad and +/- buttons
    (large digits, 56px button height) for damage, healing, and temporary HP. The Sheet
    closes on confirm or Escape.
  - "Next turn" Button: full-width at the bottom of the tile, 48px height.
  - Condition badges: 32px × 32px touch targets; tapping opens a Tooltip (I15 S15.3.5)
    showing the condition name and duration.
  - Swipe-left on a combatant row reveals quick actions (Damage, Heal, Remove) using the
    same touch gesture system as I14 S14.2.5.
  - Combatant reordering: drag-to-reorder is available on touch; keyboard alternative is
    the Move up / Move down buttons in the combatant action menu (I18 S18.4.2).

---

## Epic 20.5 — Board Empty States, Progressive Disclosure and Performance

**Goal:** A new DM opening their first board reaches a functional two-tile board in under
two minutes. Board-level feedback (layout quality, tile count, rendering performance) is
surfaced without interruption. Board templates are progressively disclosed. Full-depth
note tiles with large content do not cause rendering jank.

**Stories:**

- **S20.5.1 — Board-level empty state for no tiles**
  When a board has no tiles (first creation or after all tiles are removed), the board
  canvas shows the EmptyState component (I17 S17.1.1) centered in the board area:
  illustration key `session-board-empty`, headline "Your mission control is empty", body
  "Add tiles to build your session reference center — notes, combat tracker, dice, maps,
  and handouts all in one view.", primary action "Add your first tile" (opens the tile
  gallery Sheet from S20.3.1), secondary action "Apply a template" (opens the template
  picker Dialog). On Compact layout, the EmptyState renders as a full-width stacked item
  at the top of the panel list. The empty state dismisses automatically when any tile is
  added. On subsequent empty states (user removed all tiles), only the primary action is
  shown — the full body text is omitted since the DM is already familiar with the board.

- **S20.5.2 — Board layout quality indicator**
  After the user has edited a board for more than 60 seconds or has 6+ tiles, a layout
  quality indicator icon appears in the board toolbar: a `layout-dashboard` icon with a
  status color dot. The icon is `role="button"` with `aria-label="Board layout quality:
{status}"` where status is "Good" or "Needs attention". The status is:
  - Good: no tiles extend beyond the column boundary, no tiles overlap.
  - Needs attention: one or more tiles are partially off-screen or overlapping.
    Clicking/tapping opens a Popover listing specific issues: "Tile '{label}' extends
    beyond column limit", "Tile '{label}' overlaps Tile '{otherLabel}'". Each issue has a
    "Select" link that focuses the tile for correction. The indicator uses shape (checkmark
    icon vs. warning-triangle icon) in addition to color per I18 S18.3.2. The indicator
    does not appear until the board has been in use for 60+ seconds, avoiding distraction
    during initial setup.

- **S20.5.3 — Board templates as progressively disclosed entry points**
  Board templates (I4 S4.1.1) are surfaced only at three contextual moments, not as
  a permanent toolbar item per I17 S17.2.1:
  (1) In the board empty state secondary action ("Apply a template", S20.5.1).
  (2) In the tile gallery Sheet's header: a "Start from template" option above the type
  grid, shown only when the board has 0 tiles.
  (3) In the Command Palette via `>board Apply template`.
  Outside these moments, templates are not a visible entry point in the board toolbar or
  session panel. The template picker is a Dialog (I15 S15.3.5) showing templates as
  Cards with thumbnail previews of the tile layout they produce. Built-in templates
  (Combat Scene, NPC Encounter, Exploration, Town Visit) have generated thumbnail
  illustrations; user-saved templates show a live rendered miniature of their tile grid.

- **S20.5.4 — Full-depth note tile: virtual rendering for large content**
  Note tiles in "Full" depth mode (S20.1.2) render the complete note content. For notes
  exceeding 200 lines, full rendering causes layout jank when the board loads. Implement
  virtual rendering for full-depth note tiles: only the content visible within the tile's
  current scroll position is rendered; content above and below is replaced with spacers
  of equal height. This uses `IntersectionObserver` on sentinel elements at the top and
  bottom of the tile's scrollable content area, triggering re-renders as the user scrolls
  within the tile. During initial render of a tile with a large note, a shimmer
  placeholder (a pulsing grey rectangle matching the tile height) is shown until the
  markdown pipeline resolves, then transitions to content with a 150ms fade. Tiles with
  notes under 200 lines render normally without virtualization — no IntersectionObserver
  overhead for the majority of tiles.

---
