# UX Requirements — Canvas / Scene / Widgets

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read `00-overview-and-principles.md`
> first — it defines the shared principles, the parameter rubric, the requirement-ID scheme, the
> platform profiles, and the design tokens this document builds on.
>
> **Status:** Draft v1
> **Functional requirement coverage:** `CANVAS-001..018`
> **Owner surface(s):** `/scene/*`, `/canvas/*`, all widget host rendering surfaces; the spatial
> canvas layer used by `/session` (Command Center); any route that renders a `SceneState` document.

---

## 1. Scope

- **Covers:** The infinite-canvas spatial workspace ("Scene"): pan and zoom model; widget placement
  via library/insert flow; widget move/resize/rotate; alignment, snapping, grid, smart guides;
  selection (single, multi, marquee, shift-add); grouping and z-order/layers; widget anatomy and
  chrome (title bar, drag handle, resize handles, context menu, settings panel, collapse, link
  affordance); data-binding affordances (connecting a widget to an entity); canvas templates (save
  and recall); DM-view vs. player-view affordance on the same canvas; empty-canvas teaching state;
  undo/redo model; performance and perceived performance with many widgets; multi-touch gestures and
  their non-gesture equivalents.

- **Does NOT cover:** Command Center–specific widget presets and session controls — see
  `05-command-center.md`. Map rendering, fog-of-war, and layer management inside a map widget — see
  `06-maps.md`. Character-sheet widget internals — see `07-characters.md`. The global keyboard model
  and full ARIA tree — see `03-accessibility.md` (this document states canvas-specific a11y
  requirements and defers the complete tree). Visual tokens (color, typography, spacing, motion
  easing) — see `01-visual-design-system.md`; this document consumes those tokens.

- **Related functional requirements:** `../requirements/01-canvas-scene-widgets.md`
  - `CANVAS-001` — Scene creation, persistence, metadata
  - `CANVAS-002` — Adding widgets via command API
  - `CANVAS-003` — Move, resize, layer, group, dock, pin
  - `CANVAS-004` — Scene templates (save and instantiate)
  - `CANVAS-005` — DM projection of widgets/scenes to players
  - `CANVAS-006` — Player view with hidden fields redacted server-side
  - `CANVAS-007` — Co-editor capability set on shared scenes
  - `CANVAS-008` — Widget package authoring contract
  - `CANVAS-009` — Actor-scoped data binding states
  - `CANVAS-010` — Command validation before mutation
  - `CANVAS-011` — Widget version migration
  - `CANVAS-012` — Keyboard/touch alternatives for every drag operation
  - `CANVAS-013` — Scene-level metadata editing
  - `CANVAS-014` — Widget destroy without deleting bound entity
  - `CANVAS-015` — Projection confers no write permission
  - `CANVAS-016` — Focus order follows z-order and grouping
  - `CANVAS-017` — Widget package lifecycle (install, enable, disable, remove, export)
  - `CANVAS-018` — Sections as layout metadata only

- **Related UX docs:**
  - `01-visual-design-system.md` — tokens, motion system, density modes
  - `02-navigation-and-platform-profiles.md` — platform profile definitions, global nav
  - `03-accessibility.md` — complete keyboard model, ARIA patterns, motion policy
  - `05-command-center.md` — canvas as application home; widget library entry point

---

## 2. UX goals for this surface

The canvas is the **primary UI primitive** of DND Tools 0.2.0. Every other surface either lives
inside it (as a widget) or is a focused view of it. The spatial canvas must feel immediately
natural to anyone who has ever rearranged sticky notes on a whiteboard, yet powerful enough for an
experienced DM managing twenty widgets during live combat. It must be equally operable with a mouse
and keyboard, a finger, or an Apple Pencil — and must never strand a player in a broken view.

| Parameter | Goal for this surface |
|---|---|
| **Visual appeal** | The canvas feels like premium spatial software (Figma-class polish), not a web app table layout. Widget chrome is minimal and recedes in favor of widget content. Grid, guides, and snap indicators are visible only when active. The empty-canvas state is atmospheric and instructive, never a blank white void. |
| **Information scent** | A widget's title, icon, binding indicator, and chrome color communicate its type and linked entity at a glance without the user needing to open it. The "player sees / player doesn't see" boundary is rendered unmistakably (not color-only). The widget library uses categorical headers, thumbnails, and search so users know which widget to pick before they place it. |
| **Navigability** | Pan and zoom are always available; zoom-to-fit restores orientation in ≤1 key/tap. A minimap provides permanent orientation. Undo/redo is always reachable. The canvas never traps focus — Escape always returns to a known state. |
| **Intuition / learnability** | Widgets behave exactly like moveable objects in physical space: grab handle to move, corner/edge handle to resize. No modes (e.g., no "select mode vs. pan mode" toggle). The empty canvas guides the first action with contextual callout targets. |
| **Accessibility** | WCAG 2.2 AA throughout. Every spatial operation (move, resize, zoom, group) has a keyboard-operable alternative with discrete numeric input. Touch targets ≥44×44 CSS px with ≥8 px gap. `prefers-reduced-motion` collapses all canvas animations. |
| **Adaptability (platform profiles)** | Desktop: mouse drag + full keyboard shortcut set is first-class. Tablet: two-finger pan/zoom; direct-manipulation drag; on-canvas toolbar instead of right-click menu. Mobile: focused single-widget panels dominate; pan/zoom with inertia; bulk operations via command palette, not canvas drag. Same processing-core command on all profiles. |
| **Effective emphasis (visual hierarchy)** | Selected widget(s) carry high-contrast selection ring. The active/focused widget is always unambiguously highlighted. Inactive widget chrome is muted. The DM-only/hidden-from-player badge uses a distinct visual treatment that survives a squint test and a grayscale test. |
| **Feedback & responsiveness** | Widget placement acknowledges within 100 ms (ghost appears immediately, commit is optimistic). Pan and zoom are 60 fps; any frame drop produces a visible degradation affordance rather than a freeze. Binding resolution shows a skeleton until data arrives. |
| **Error prevention & recovery** | Multi-level undo (≥50 steps). Move/resize snaps to safe positions to prevent off-canvas placement. Deleting a widget requires confirmation and warns that the bound entity is not deleted. Template instantiation never overwrites an existing scene. |
| **Consistency** | Widget handles, context menus, and keyboard shortcuts are identical across all widget types. Snap, grid, and guide behavior is identical whether operating on one widget or a selection group. Token use, radii, and shadow levels are defined in `01-visual-design-system.md` and never overridden locally. |

---

## 3. Researched best practices

### 3.1 Pan and zoom

Figma uses a trackpad two-finger pan natively and maps Ctrl/Cmd + scroll to zoom [1]. The zoom
range is 0.02×–256× but useful working range is roughly 10%–400%. Figma zooms toward the cursor
position, not the canvas center — this dramatically reduces disorientation after zooming [1].
**Implication:** DND Tools must zoom toward the pointer/pinch midpoint, not the viewport center.

Miro anchors zoom behavior to cursor position as well, and provides a minimap thumbnail fixed to
the bottom-right corner with a viewport rectangle that users can drag to pan [2]. The minimap is
permanently visible on desktop and toggleable on tablet. **Implication:** A persistent minimap with
a draggable viewport rect is a Must-have on Desktop; toggleable on Tablet; collapsed by default on
Mobile.

tldraw (open-source) defines its zoom model in `@tldraw/tldraw`: minimum zoom 0.1, maximum 8.0,
with discrete snap stops at 10%, 25%, 50%, 75%, 100%, 150%, 200% [3]. A "zoom-to-fit" command
(Shift+1 in tldraw, Shift+Cmd+H in Figma) resets the viewport to show all content with 5–10%
padding margin [3]. **Implication:** Adopt snap stops for the zoom slider, with zoom-to-fit as a
first-class keyboard shortcut.

### 3.2 Snap, grid, and smart guides

Figma's snap system uses four distinct layers: grid snapping, object edge snapping, object center
snapping, and smart guide equidistance indicators [1]. Snap threshold is 4 CSS px at 100% zoom
(scales inversely with zoom level) [1]. Snap is always on by default; a temporary override key
(Alt/Option) disables it during drag. **Implication:** DND Tools uses the same four-layer snap model
with the same 4 px threshold and an Alt/Option override.

Excalidraw draws real-time equidistance guides as orange dashed lines when an object is aligned or
evenly spaced with respect to its neighbors [4]. The guides disappear immediately when the object is
released. **Implication:** Smart equidistance guides during drag improve layout quality for DMs
arranging many widgets.

Apple HIG specifies that grid lines should have low-contrast styling so they are visible but do not
compete with content [5]. The recommended grid color is a 10–15% opacity overlay of the canvas
surface color. **Implication:** Grid uses a subtle token from `01-visual-design-system.md`; it is
never rendered at full canvas-stroke weight.

### 3.3 Selection and multi-select

Figma's marquee/rubber-band selection activates only on empty canvas space, never on widget chrome,
to prevent accidental deselection [1]. Shift+click adds or removes individual items from selection.
Ctrl/Cmd+A selects all. Selecting a group selects the group; double-click enters the group to
select members [1]. **Implication:** Adopt this exact selection hierarchy: canvas click → select
widget; Shift+click → toggle; Ctrl/Cmd+A → select all; double-click group → enter group.

NN/g's research on direct manipulation establishes that drag-and-drop without a keyboard-accessible
alternative fails WCAG 2.2 SC 2.5.7 [6]. The recommended pattern is: select + arrow keys to move,
resize via a properties panel with numeric inputs, and a context menu for all operations. Every
gesture must map to a discrete action. **Implication:** All canvas operations require a keyboard
path; see UX-CANVAS-012.

### 3.4 Widget chrome and anatomy

FigJam's sticky-note anatomy separates the content area from the chrome (author avatar, menu
trigger, resize handle) by rendering chrome at low opacity until hover or focus [7]. This reduces
visual noise on a dense canvas. Miro uses the same pattern: a floating toolbar appears only on
selection [2]. **Implication:** Widget chrome defaults to 20% opacity or muted-token state; full
opacity on hover/select/focus.

Obsidian Canvas (1.1+) uses a uniform resize handle system: 8 edge midpoints + 4 corners, each
16×16 CSS px on desktop (scalable by zoom level) [8]. Handles are visually the same across all node
types (text cards, file embeds, links). **Implication:** DND Tools uses a uniform handle system
across all widget types; handle rendering is a shared canvas component, not per-widget.

### 3.5 Grouping and z-order

Figma treats groups as transparent containers: the group bounding box is the union of its children,
and clicking a group item selects the child directly (unless the click lands on empty space inside
the group bounding box) [1]. Bring-to-front / send-to-back are discrete commands (Ctrl/Cmd +
\]/[) [1]. **Implication:** DND Tools groups use the same click-through semantics and the same
z-order shortcuts.

Apple Freeform (iOS 17+) supports a layers panel that shows z-order as a named, reorderable list —
a non-spatial alternative to spatial z-order that is more accessible and learnable [9].
**Implication:** A layers/z-order panel is a Should-have; it is the keyboard/AT-accessible
alternative to drag-to-reorder.

### 3.6 Data binding affordances

Whimsical's connector system uses a proximity affordance: hover near the edge of a shape to reveal
connection anchor points, then drag from an anchor to another shape [10]. Connection creation is
gesture-first but has a discrete alternative (right-click → Connect to…). **Implication:** Widget
binding uses the same proximity affordance on Desktop/Tablet; a discrete "Bind to entity…" menu on
Mobile and as the keyboard-accessible path everywhere.

### 3.7 Multi-touch gestures

Apple HIG specifies that two-finger pinch-to-zoom must have a keyboard-equivalent (usually Cmd++/−
and the scroll wheel) and that drag operations must support pointer alternatives [5]. Material 3
specifies a minimum touch target of 48×48 dp (≈48 CSS px on 1× displays) for interactive controls,
with 8 dp minimum spacing between targets [11]. **Implication:** DND Tools targets ≥44×44 CSS px
(WCAG 2.2 §2.5.8, Target Size Minimum) with ≥8 px gap; pinch-to-zoom always has a keyboard/button
alternative.

### 3.8 Performance and virtualization

Figma's canvas uses a WebGL renderer with a tile-based culling system: only widgets within the
current viewport + a 1-viewport bleed margin are actively rendered [1]. Off-screen widgets are
represented as bounding-box culled geometry. tldraw uses a similar approach with a
`ShapeUtil.toSvg()` fallback for export [3]. **Implication:** DND Tools must not render widgets
outside the viewport; a culling strategy is required before any canvas with >50 widgets ships.

Miro's performance guidance for large boards recommends a render budget of <16 ms per frame (60
fps) for the pan/zoom interaction loop, with a degraded-mode poster frame rendered at <8 fps during
rapid pan when the frame budget is exceeded [2]. **Implication:** Define a 60 fps target for
pan/zoom with a graceful degradation mode (poster-frame) when the budget is exceeded.

### 3.9 Empty-canvas teaching state

Figma and FigJam render an empty-state illustration with action callouts ("Press F to create a
frame", "Drag a file here") that disappear immediately when the first object is placed [7].
Excalidraw adds a subtle context-sensitive hint bar at the bottom of the viewport [4].
**Implication:** The empty canvas must serve as a teaching surface; all callouts disappear as soon
as the first widget is placed.

### 3.10 DM/Player visibility boundary

No mainstream canvas app has an exact analog for the DM/player visibility boundary, making this a
product-specific pattern. The closest is Miro's "guest access" mode where certain boards or areas
are marked private [2], but that operates at board granularity, not per-widget. The principle from
WCAG 2.2 and NN/g on status indicators [6] is that a safety-relevant state (content the player
must not see) must be conveyed by more than color alone — it needs a shape, label, or pattern
indicator. **Implication:** Hidden-from-player widgets carry a persistent badge (icon + text label
"DM Only") that uses a redundant shape signal, not color alone. This must be the most legible
indicator on the canvas when present.

---

## 4. Reference implementations (exemplars)

| Product | What they do well (specific) | Principle / why it works | Borrow / Avoid | Link |
|---|---|---|---|---|
| **Figma** | Cursor-anchored zoom; 4-layer snap (grid/edge/center/equidistance); marquee on empty space; Ctrl+]/[ z-order; group click-through | Spatial consistency — same gesture produces same result regardless of what's under the cursor | Borrow: all selection and snap mechanics; zoom anchor; z-order shortcuts | https://help.figma.com/hc/en-us/articles/360040449893 |
| **tldraw** | Open-source; zoom range 0.1–8; discrete snap stops; zoom-to-fit (Shift+1); real-time collaboration via Yjs; clean keyboard model | Simplicity + open-source reference for infinite-canvas implementation patterns | Borrow: snap stop values, zoom-to-fit shortcut, zoom range; Avoid: minimal chrome (too sparse for a live-play context) | https://tldraw.dev |
| **Miro** | Minimap with draggable viewport rect; poster-frame degradation during fast pan; "guest view" per-board privacy indicator | Orientation on large boards; graceful performance degradation | Borrow: minimap pattern, performance degradation strategy; Avoid: board-level (not widget-level) privacy — too coarse for DND Tools | https://help.miro.com/hc/en-us/articles/360017730533 |
| **Obsidian Canvas** | Uniform 16×16 px handles on all node types; node collapse; connection anchors visible on hover; z-order context menu | Consistent chrome across heterogeneous node types — reduces learning cost | Borrow: uniform handle size and hover-reveal chrome pattern; also relevant for linked-widget anchor affordance | https://obsidian.md/canvas |
| **FigJam** | Sticky-note chrome at 20% opacity until hover; floating toolbar on selection; teaching empty-state callouts | Reduces chrome noise on dense boards; selection-driven context | Borrow: muted-chrome-until-hover; floating toolbar on selection; empty-state callout pattern | https://www.figma.com/figjam/ |
| **Excalidraw** | Equidistance smart guides in orange; bottom hint bar for context-sensitive shortcuts; pure keyboard operation | Visual feedback during drag; progressive disclosure of shortcuts | Borrow: smart guide rendering style; Avoid: no snap-to-grid by default (DND Tools needs grid for alignment) | https://excalidraw.com |
| **Apple Freeform** | Layers panel as reorderable named list; two-finger pan + pinch with pointer alternative | Non-spatial z-order for accessibility; gesture + discrete input parity | Borrow: layers panel as a11y-accessible z-order surface; Avoid: limited to Apple ecosystem interaction model | https://support.apple.com/en-us/111914 |
| **Whimsical** | Proximity-reveal connector anchors on node hover; discrete "Connect to…" menu | Gesture-first with discrete fallback — satisfies WCAG 2.2 §2.5.7 | Borrow: binding/connection affordance for widget data-binding; the proximity model scales to touch and keyboard | https://whimsical.com |

### North-star narratives

**Figma** is the primary spatial-mechanics reference. Its zoom-to-cursor, four-layer snap, and
marquee-on-empty-canvas selection together produce a canvas that feels predictable and never
fights the user. DND Tools must reach the same mechanical quality: no interaction on the canvas
should surprise an experienced Figma user.

**tldraw** is the open-source implementation reference. Its clean zoom model (10%–800%, discrete
stops, zoom-to-fit) and its investment in keyboard parity (every gesture has a keyboard path) set
the accessibility floor. DND Tools should use tldraw's architecture as a study source for canvas
rendering and keyboard handling before writing any canvas code.

**Obsidian Canvas** is the genre reference. It handles heterogeneous node types (text, file, link,
group) with a single, uniform chrome system on a dark canvas — exactly the visual problem DND Tools
faces with heterogeneous widgets. The hover-reveal anchor pattern and uniform 16×16 px handle size
transfer directly.

---

## 5. UX/UI requirements

---

### UX-CANVAS-001 — Canvas viewport: pan and zoom model

- **Requirement:** The canvas viewport must support continuous pan and zoom with cursor/pinch
  midpoint as the anchor, discrete zoom snap stops, and keyboard-accessible alternatives for every
  gesture.
- **Rationale:** Cursor-anchored zoom eliminates disorientation [1]. Snap stops at common
  percentages give users reliable reference points [3].
- **Spec:**
  - **Zoom range:** 5% minimum (overview) to 800% maximum (detail). Discrete snap stops: 10%, 25%,
    50%, 75%, 100%, 150%, 200%, 300%, 400%.
  - **Zoom anchor:** pointer position on Desktop/Tablet; viewport center on Mobile (no pointer).
  - **Pinch anchor:** midpoint of the two-finger spread.
  - **Zoom-to-fit:** fits all widgets into the viewport with 48 px padding on each side.
  - **Zoom-to-selection:** fits the current selection bounding box into the viewport with 48 px
    padding.
  - **Pan inertia:** enabled on touch profiles; momentum decays with easing-out cubic over 400 ms.
    Disabled when `prefers-reduced-motion` is active.
  - **Minimap:** persistent on Desktop (bottom-right, 160×120 CSS px); toggleable on Tablet
    (toggle button in canvas toolbar); hidden by default on Mobile (accessible via command palette).
  - **Minimap viewport rect:** draggable; 1 px stroke in `--color-accent-primary`; interactive
    area extends 8 px beyond the visible rect.
  - **Zoom indicator:** shows current zoom % in the canvas toolbar; tappable to open a zoom preset
    menu; editable by keyboard (type a number + Enter).
- **States:**
  - *Default:* viewport displays at the last saved zoom/pan position.
  - *Zoom transitioning:* smooth scale transform over 120 ms ease-out (disabled under
    `prefers-reduced-motion` — instant snap).
  - *Pan dragging:* canvas cursor is `grab` (Desktop); no visual cursor change on touch.
  - *Zoom-to-fit:* animates over 200 ms ease-in-out (instant under reduced-motion).
  - *Minimap hover (Desktop):* viewport rect highlights to `--color-accent-primary` at 80% opacity.
- **Platform profiles:**
  - *Desktop:* mouse-wheel to zoom; Ctrl/Cmd + scroll = zoom; middle-mouse or Space+drag = pan;
    trackpad two-finger scroll = pan; trackpad pinch = zoom.
  - *Tablet:* two-finger pinch = zoom; two-finger drag = pan; on-canvas zoom +/− buttons (44×44 px)
    as non-gesture alternative.
  - *Mobile:* two-finger pinch = zoom; two-finger drag = pan; on-canvas zoom +/− buttons (44×44 px)
    always visible; minimap hidden by default.
- **Input:**
  - *Keyboard:* `+` / `−` keys zoom in/out by one snap stop; `0` = zoom-to-fit; `Shift+0` =
    zoom-to-selection; `1` = 100%; `2` = 200%; `5` = 50%; Arrow keys pan by 32 px per press;
    Shift+Arrow pans by 128 px.
  - *Pointer:* scroll wheel zooms; Space+drag pans (cursor becomes `grab`).
  - *Touch:* two-finger pinch+pan simultaneously.
- **Accessibility:** Zoom % is announced in a `role="status"` live region on change (debounced
  500 ms). Minimap has `aria-label="Canvas overview — drag to navigate"`. Zoom toolbar buttons have
  `aria-label="Zoom in"` / `"Zoom out"` / `"Zoom to fit"`. All zoom/pan controls are reachable by
  Tab; Enter/Space activates.
- **Acceptance criteria:**
  - Given a Desktop user scrolls the mouse wheel over a widget, when the scroll occurs, the canvas
    zooms and the widget remains under the cursor position (zoom-to-pointer).
  - Given a Tablet user performs a two-finger pinch, when the pinch occurs, zoom anchors to the
    midpoint between the two touch points.
  - Given a keyboard-only user, when they press `0`, the canvas animates to zoom-to-fit showing all
    placed widgets.
  - Given `prefers-reduced-motion: reduce` is set, when any zoom/pan animation would play, it is
    replaced by an instant snap with no transform animation.
  - Given the minimap is visible, when the user drags the viewport rect, the canvas pans to match.
- **Priority:** Must-have

---

### UX-CANVAS-002 — Placing widgets: widget library and insert flow

- **Requirement:** The DM must be able to open a widget library, search/filter by type and name,
  preview a widget, and place it onto the canvas — all within ≤4 interactions.
- **Rationale:** CMD-005 requires a quick-access widget library; the insert flow must be
  efficient for live-play use where time is scarce.
- **Spec:**
  - **Library trigger:** a `+` button in the canvas toolbar (Desktop: top-left; Tablet: floating
    action button bottom-right; Mobile: bottom bar). Keyboard shortcut: `W` (widget) or `I`
    (insert).
  - **Library panel:** slides in from the left on Desktop (304 px wide), as a bottom sheet on
    Mobile/Tablet (60% viewport height, scrollable).
  - **Library layout:** categorized grid; 2 columns on Desktop panel; 3 columns on bottom sheet.
    Each item: 64×64 px thumbnail, 12 px label below.
  - **Search:** text input auto-focused when library opens; filters live on keystroke; searches
    name and type tags.
  - **Category headers:** collapsible; categories include: Combat, Characters, Maps, Notes,
    Dice & Timers, Atmosphere, Reference, Custom.
  - **Unavailable widgets** (not supported on current profile) are shown at 40% opacity with a
    tooltip/disclosure giving the reason (per CMD-005).
  - **Placement flow:**
    - *Desktop:* click a library item → cursor becomes a preview ghost; click on canvas to place
      at default size; Escape cancels.
    - *Tablet/Touch:* tap a library item → a "tap to place" affordance appears on the canvas;
      tap on canvas to place; or drag from the library panel directly onto the canvas.
    - *Keyboard:* select item with arrow keys + Enter → moves focus to canvas in "place mode";
      arrow keys position the ghost; Enter confirms; Escape cancels.
  - **Default sizes:** every widget type declares a default size in its widget package manifest.
    The canvas places at the declared default, centered on the clicked/tapped point.
  - **Ghost/preview:** semi-transparent (60% opacity) preview of the widget at default size
    follows the cursor/finger. The preview clips to show the widget title and icon only — not data.
- **States:**
  - *Library closed:* `+` button visible in toolbar.
  - *Library open:* panel/sheet visible; canvas is still interactive behind it on Desktop.
  - *Placing (ghost active):* cursor = `crosshair`; ghost follows pointer; canvas snap guides active.
  - *Placed:* widget appears at full opacity; selected; undo stack records the placement.
  - *Cancelled (Escape):* ghost disappears; library remains open for another selection.
- **Platform profiles:**
  - *Desktop:* left-panel library; click-to-place with ghost.
  - *Tablet:* bottom-sheet library; drag-to-canvas or tap-to-place.
  - *Mobile:* bottom-sheet library; tap-to-place only (no drag from sheet); placed widget opens in
    its focused panel immediately.
- **Input:** keyboard `W` or `I` opens library; arrow keys navigate items; Enter selects;
  arrow keys position ghost; Enter places; Escape cancels.
- **Accessibility:** library panel is a `role="dialog"` with `aria-label="Widget library"`. Items
  are `role="option"` in a `role="listbox"`. Placing mode announces "Widget ghost active — use arrow
  keys to position, Enter to place, Escape to cancel" in a live region.
- **Acceptance criteria:**
  - Given the DM presses `W`, when the library opens, the search field receives focus.
  - Given the DM selects a "Dice Roller" widget and clicks the canvas, a Dice Roller widget appears
    at the click position with the default size, selected.
  - Given the DM presses Escape during ghost mode, the ghost disappears and no widget is placed.
  - Given a widget is marked unavailable for the current profile, when shown in the library, it
    renders at 40% opacity and cannot be selected.
  - Given a Mobile user opens the library and taps a widget, the tap-to-place flow activates and the
    widget is placed on the first canvas tap.
- **Priority:** Must-have

---

### UX-CANVAS-003 — Widget move and resize

- **Requirement:** Widgets must be moveable by drag (pointer/touch) and by keyboard arrow keys, and
  resizable via visible handles and via a properties panel with numeric inputs.
- **Rationale:** CANVAS-003 requires move/resize; CANVAS-012 requires non-drag alternatives;
  WCAG 2.2 §2.5.7 (Dragging Movements) mandates pointer-alternative for all drag operations [6].
- **Spec:**
  - **Move by drag:** click/tap the widget title bar (the drag handle area) and drag. Not the
    content area, to prevent accidental moves while interacting with widget content.
  - **Move by keyboard:** select a widget; arrow keys move 1 px; Shift+Arrow moves 8 px (nudge);
    Ctrl/Cmd+Shift+Arrow moves 32 px.
  - **Move via properties panel:** dedicated X / Y number inputs (integer CSS px from canvas
    origin); Tab between fields; Enter to commit; Escape to revert.
  - **Resize handles:** 8 handles — 4 corners + 4 edge midpoints. Each handle is 12×12 CSS px
    visible zone with a 44×44 CSS px invisible touch target (centered on the handle). Corner handles
    resize in two axes; edge handles constrain to one axis.
  - **Aspect-ratio lock:** Shift+drag on any corner handle; also a toggle in the properties panel.
  - **Resize by keyboard:** when a widget is selected, Tab to the resize handle group (announced
    "Resize handles"); arrow keys grow/shrink by 8 px; Shift+Arrow by 32 px.
  - **Resize via properties panel:** W / H number inputs; a lock icon toggles aspect-ratio
    constraint.
  - **Minimum widget size:** 120×80 CSS px (enforced; widget cannot be resized below this).
  - **Maximum widget size:** unbounded (widget can expand to fill the canvas).
  - **Snap during move:** snaps to grid, edge, center, equidistance guides at 4 px threshold
    (scales inversely with zoom). Alt/Option held = snap disabled temporarily.
  - **Snap during resize:** snaps to grid and to sibling widget edges.
  - **Off-canvas prevention:** if a drag would place the widget's bounding box entirely outside the
    visible canvas extent by >200 px, it snaps to 20 px inside the viewport edge.
  - **Cursor:** on drag handle hover `grab`; on drag active `grabbing`; on resize handle hover
    directional cursor (`nw-resize`, `n-resize`, etc.).
- **States:**
  - *Default:* handles hidden; drag handle area visible in widget title bar.
  - *Hover (Desktop):* handles appear at full opacity; title bar highlights.
  - *Selected:* handles visible permanently; selection ring (2 px, `--color-accent-primary`) drawn
    outside the widget border.
  - *Dragging:* widget renders at 80% opacity; a full-opacity outline remains at the source
    position; snap guides appear.
  - *Resizing:* live dimensions shown in a floating tooltip (e.g. "320 × 240 px") adjacent to the
    active handle.
  - *Disabled/locked:* handles hidden or rendered at 20% opacity if the widget is locked; cursor
    `not-allowed` on drag attempt.
- **Platform profiles:**
  - *Desktop:* drag by title bar; resize by corner/edge handles; keyboard nudge; properties panel.
  - *Tablet:* drag by title bar (touch); resize by handles (44×44 touch targets); long-press opens
    context menu with "Move" / "Resize" numeric input option.
  - *Mobile:* no on-canvas drag-to-move (canvas area is too small for reliable precision); moving
    is done via context menu → "Position…" numeric input modal; resize via context menu →
    "Resize…" numeric input modal.
- **Input:** pointer drag; touch drag; arrow keys; Shift+arrow for 8× nudge; `P` opens position
  panel; `R` opens resize panel (when widget selected).
- **Accessibility:** Move operation announced on drop: "Widget moved to X, Y". Resize announced:
  "Widget resized to W × H". Handles have `aria-label="Resize: top-left corner"` etc. Handles are
  focusable tab stops within the widget's focus group. Dimensions and positions exposed as
  `aria-valuetext` on the active handle.
- **Acceptance criteria:**
  - Given a selected widget, when the user presses the right arrow key, the widget moves 1 px right
    and a screen-reader announcement fires.
  - Given a selected widget, when the user Shift+arrows, the widget moves 8 px per press.
  - Given a Mobile user selects a widget, when they open its context menu and tap "Position…", a
    numeric input modal opens and committing it moves the widget.
  - Given the user drags a widget toward the canvas boundary, when the widget bounding box would be
    >200 px outside the viewport, it snaps to 20 px inside the viewport edge.
  - Given Shift is held during a corner resize drag, when the user drags, the aspect ratio is
    maintained.
- **Priority:** Must-have

---

### UX-CANVAS-004 — Widget rotation

- **Requirement:** Widgets must be rotatable in 15° increments by default (free rotation with Shift
  hold) via a rotation handle above the widget, with keyboard and properties-panel alternatives.
- **Rationale:** CANVAS-003 lists rotation as a layout operation. Constrained-increment rotation
  (analogous to Figma's 15° snap) is more precise for layout alignment.
- **Spec:**
  - **Rotation handle:** a circular handle 20 px above the top-center edge of the widget when
    selected. 12×12 CSS px visible; 44×44 CSS px touch target. Cursor: `grab` → `grabbing`.
  - **Default snap:** 15° increments. Shift held = free rotation (1° precision).
  - **Rotation indicator:** current angle shown as a floating label (e.g. "45°") near the handle
    during rotation.
  - **Properties panel:** a `Rotation` number input (0–359°). Accepts typed values. Up/Down arrow
    keys in the field increment by 1°; Shift+arrow increments by 15°.
  - **Reset:** double-click the rotation handle resets to 0°.
  - **Widget content:** rotated widgets clip their content to the rotated bounding box. Resize
    handles are rendered in the rotated frame.
- **States:** Same as UX-CANVAS-003 (default, hover, selected, active rotation).
- **Platform profiles:**
  - *Desktop:* rotation handle drag; keyboard in properties panel.
  - *Tablet:* rotation handle drag (touch, 44×44 px target); properties panel.
  - *Mobile:* no rotation handle (too small); rotation via context menu → "Rotate…" numeric modal.
- **Input:** rotation handle drag; keyboard in properties panel; double-click handle to reset.
- **Accessibility:** Rotation handle has `role="slider"` with `aria-valuemin="0"`,
  `aria-valuemax="359"`, `aria-valuenow`, `aria-label="Widget rotation"`. Arrow keys on the handle
  change rotation by 15°. Rotation change announced in a live region.
- **Acceptance criteria:**
  - Given a selected widget, when the user drags the rotation handle without Shift, it snaps to the
    nearest 15° increment.
  - Given the user double-clicks the rotation handle, the widget rotation resets to 0°.
  - Given a Mobile user opens the context menu, when they tap "Rotate…", a numeric input modal
    appears and committing it rotates the widget.
- **Priority:** Should-have

---

### UX-CANVAS-005 — Selection model: single, multi, marquee

- **Requirement:** The canvas must support single selection by click/tap, additive selection by
  Shift+click, marquee (rubber-band) selection by drag on empty canvas space, and Ctrl/Cmd+A
  select-all — each with consistent keyboard and touch alternatives.
- **Rationale:** Standard direct-manipulation selection model [6] [1]. Marquee on empty space only
  prevents accidental deselection when clicking near a widget.
- **Spec:**
  - **Single select:** click/tap a widget → selects it; deselects all others. Click/tap empty
    canvas space → deselects all.
  - **Shift+click:** toggles the clicked widget in or out of the current selection. Works for any
    number of widgets.
  - **Marquee:** drag starting on empty canvas space; a 1 px dashed rectangle (`--color-accent-
    primary` at 70% opacity) shows the selection area. Widgets whose bounding box is **fully inside**
    the marquee are selected on release. Shift+marquee adds to existing selection.
  - **Select all:** Ctrl/Cmd+A selects all widgets on the canvas, including hidden-from-player
    ones. On Mobile: accessible via context menu on the canvas background → "Select all".
  - **Escape:** collapses selection to none; if in a mode (resize, rotate, group edit), exits the
    mode first.
  - **Selection ring:** 2 px solid `--color-accent-primary`, drawn 2 px outside the widget border.
    Multi-selection also shows a unified bounding-box ring around all selected items at 1 px dashed.
  - **Selection count badge:** when ≥2 widgets are selected, a floating badge above the selection
    shows "N selected" with a context toolbar (align, distribute, group, delete).
- **States:**
  - *None selected:* no rings; canvas cursor `default`.
  - *Single selected:* selection ring; handles visible; properties panel shows widget properties.
  - *Multi-selected:* individual rings + group bounding ring; handles on group bounding box;
    properties panel shows common properties (position, size, visibility).
  - *Marquee in progress:* dashed rectangle drawn; no selection until release.
- **Platform profiles:**
  - *Desktop:* drag on empty canvas = marquee; Shift+click = additive; Ctrl/Cmd+A = select all.
  - *Tablet:* drag on empty canvas = marquee (two-finger drag = pan, which takes priority — single
    finger on empty canvas = marquee start); Shift+tap = additive; Select All via long-press
    context menu.
  - *Mobile:* no marquee (canvas too small, pan dominates); additive selection via long-press →
    "Add to selection"; Select All via canvas context menu.
- **Input:** click/tap; Shift+click; drag on empty space (Desktop/Tablet); Ctrl/Cmd+A; Escape to
  deselect; Tab moves focus between widgets (does not select); Space/Enter selects the focused
  widget.
- **Accessibility:** Selected state is conveyed by `aria-selected="true"` on widget elements.
  Selection count is announced in a live region: "3 widgets selected". Ctrl/Cmd+A is documented in
  keyboard shortcuts help. Selection ring must meet 3:1 contrast against the canvas background per
  WCAG 2.2 §1.4.11.
- **Acceptance criteria:**
  - Given the user clicks widget A then Shift+clicks widget B, both widgets are selected and the
    count badge shows "2 selected".
  - Given the user drags from empty canvas space, a dashed marquee appears; on release, only
    fully-enclosed widgets are selected.
  - Given the user presses Ctrl/Cmd+A, all widgets on the canvas are selected.
  - Given the user presses Escape, the selection is cleared.
  - Given a screen-reader user focuses a widget and presses Space, the widget is selected and
    "1 widget selected" is announced.
- **Priority:** Must-have

---

### UX-CANVAS-006 — Grouping and z-order

- **Requirement:** Selected widgets must be groupable/ungroupable; groups must behave as transparent
  containers; z-order must be controllable via keyboard shortcuts, context menu, and a layers panel.
- **Rationale:** CANVAS-003 requires grouping and layering. Apple Freeform's layers panel provides
  the accessible alternative to drag-to-reorder [9]. Figma's click-through group semantics reduce
  the number of clicks to reach a child [1].
- **Spec:**
  - **Group:** select ≥2 widgets → Ctrl/Cmd+G. Group bounding box is the union of all members.
    Clicking the group selects it; double-click enters the group and selects the clicked child.
    Escape exits the group back to group-level selection.
  - **Ungroup:** select group → Ctrl/Cmd+Shift+G. Members remain in place; z-order is preserved.
  - **Z-order shortcuts:**
    - Bring to Front: Ctrl/Cmd+Shift+] (or Ctrl/Cmd+] × n)
    - Send to Back: Ctrl/Cmd+Shift+[ (or Ctrl/Cmd+[ × n)
    - Bring Forward one: Ctrl/Cmd+]
    - Send Backward one: Ctrl/Cmd+[
  - **Context menu z-order:** right-click (Desktop) / long-press (Touch) → "Arrange" submenu →
    Bring to Front / Bring Forward / Send Backward / Send to Back.
  - **Layers panel:** a panel (toggle: `L` key on Desktop; toolbar button on Tablet/Mobile) that
    shows all widgets as a vertically reorderable named list, topmost widget at the top. Drag rows
    to reorder; keyboard: select row, Ctrl/Cmd+Arrow up/down to reorder. Widget type icon + name +
    visibility toggle per row. Clicking a row selects the widget on canvas. Groups are collapsible
    rows with child indentation.
  - **Lock widget:** a lock icon in the layers panel row prevents move/resize; the widget is still
    interactive for its content.
- **States:**
  - *Group default:* rendered with no visible group border; child handles hidden.
  - *Group selected:* group bounding box ring; group context toolbar.
  - *Group editing (double-click entered):* child handles visible; group outline shown as dashed.
  - *Widget locked:* lock icon in layers panel; handles disabled; cursor `not-allowed` on drag
    attempt.
- **Platform profiles:**
  - *Desktop:* keyboard shortcuts first-class; layers panel as persistent sidebar panel or
    collapsible overlay.
  - *Tablet:* layers panel as collapsible overlay (toggle button); context menu for z-order.
  - *Mobile:* layers panel as a bottom sheet; z-order via context menu only; no keyboard shortcuts.
- **Input:** Ctrl/Cmd+G / Shift+G; Ctrl/Cmd+]/[; `L` opens layers panel; drag in layers panel;
  Ctrl/Cmd+Arrow in layers panel; double-click to enter group; Escape to exit group.
- **Accessibility:** Groups are `role="group"` with `aria-label` from the group name (auto-named
  "Group of N" if unnamed). Layers panel rows have `role="row"` in `role="treegrid"`. Reorder is
  announced: "Widget moved up one level in z-order". Lock toggle is `role="checkbox"` with
  `aria-label="Lock [widget name]"`.
- **Acceptance criteria:**
  - Given two selected widgets, when the user presses Ctrl/Cmd+G, they are grouped and a single
    selection ring appears around the group bounding box.
  - Given a group is selected and the user double-clicks a child widget, the child is selected and
    the child's handles become visible.
  - Given a widget is selected, when the user presses Ctrl/Cmd+], the widget's z-order increases by
    one and the layers panel updates.
  - Given the layers panel is open, when the user drags a row upward, the corresponding widget's
    z-order increases and the canvas renders immediately.
- **Priority:** Must-have

---

### UX-CANVAS-007 — Widget chrome and anatomy

- **Requirement:** Every widget must expose a consistent chrome structure: title bar (drag handle,
  icon, name, badge area), resize handles, a context-menu trigger, a settings trigger, a collapse
  toggle, and a link/binding indicator. Chrome must be muted when inactive and full-opacity on
  hover/focus/select.
- **Rationale:** Uniform chrome across all widget types (per Obsidian Canvas [8] and FigJam [7])
  reduces learning cost. Muted chrome prevents visual noise on a dense canvas.
- **Spec:**
  - **Title bar:** full-width, 32 px height (Desktop); 44 px height (Tablet/Mobile, for touch
    target). Contains (left to right): widget type icon (16×16 px), widget name (truncated with
    ellipsis, max 240 px), visibility badge (DM-only or player-visible indicator), and a `⋯` more-
    actions trigger (24×24 px visible, 44×44 px touch target).
  - **Widget name:** editable by double-clicking the name in the title bar. Inline text input;
    Enter commits; Escape reverts.
  - **Collapse toggle:** a chevron icon in the title bar right area. Collapsed state: only the title
    bar is visible; widget content area is hidden. Collapsed state persists in `SceneState`.
  - **Resize handles:** 8 positions as described in UX-CANVAS-003.
  - **Context menu trigger:** the `⋯` button in the title bar. Opens a positioned menu with:
    Copy, Duplicate, Rename, Bind to entity…, Widget settings, Arrange (z-order submenu), Lock,
    Hide from player / Show to player, Delete.
  - **Settings panel:** accessible from context menu → "Widget settings". Opens as a side panel
    (Desktop) or bottom sheet (Mobile/Tablet) specific to the widget type.
  - **Link/binding indicator:** a small connector icon (chain-link) in the bottom-left of the widget
    frame, visible whenever the widget has at least one active data binding. Clicking it opens the
    binding management panel.
  - **Chrome opacity:** default 20% opacity on all chrome (handles, title bar background, binding
    indicator) when the widget is not hovered/focused/selected. Full opacity on hover or selection.
  - **Widget content area:** takes all space below the title bar. Scrollable if content overflows.
    A subtle inset border separates content from title bar.
  - **DM-only badge:** when the widget is hidden from all players, the title bar renders a "DM Only"
    pill badge (icon + label) in `--color-dm-only` with a diagonal-stripe texture overlay (not
    color-only). This badge is always full-opacity regardless of hover/focus state.
  - **Player-visible badge:** when the widget is actively projected to ≥1 player, a small eye icon
    badge in `--color-player-visible` appears in the title bar. Tooltip: "Visible to: [player
    names]".
- **States:**
  - *Default (inactive):* chrome at 20% opacity; no handles visible; content fully opaque.
  - *Hover (Desktop):* chrome fades to 100% opacity; handles appear; cursor on title bar = `grab`.
  - *Selected:* chrome 100% opacity; handles visible; selection ring active.
  - *Collapsed:* only title bar visible (32/44 px height); resize disabled; collapse chevron rotated
    180°.
  - *Locked:* handles absent; lock icon visible in title bar badge area; cursor `not-allowed` on
    title bar drag attempt.
  - *Error:* title bar background shifts to `--color-error-subtle`; a ⚠ icon in the badge area;
    tooltip describes the error.
  - *Binding missing:* chain-link icon in `--color-warning`; widget content area shows a "Binding
    missing" placeholder (icon + text + "Rebind" action button).
  - *Binding conflicted:* chain-link icon in `--color-warning`; content area shows conflict state
    per CANVAS-009.
  - *Hidden data (player binding):* content area renders a blank placeholder instead of the data
    value; never a zero-value or empty string that could be confused for real data.
- **Platform profiles:**
  - *Desktop:* 32 px title bar; handles on hover; right-click opens context menu.
  - *Tablet:* 44 px title bar; handles always visible on selected; long-press opens context menu.
  - *Mobile:* 44 px title bar; handles not rendered (manipulation via menus); tap title bar to
    select; `⋯` opens context menu.
- **Input:** double-click title bar name to rename; `⋯` click/tap for context menu; `F2` renames
  selected widget; `Delete`/`Backspace` on selected widget opens delete confirmation; `C` collapses/
  expands selected widget; right-click (Desktop) / long-press (Tablet) opens context menu.
- **Accessibility:** Title bar is `role="heading" aria-level="3"` (within the canvas landmark).
  The `⋯` button is `role="button" aria-label="[Widget name] actions"`. Context menu is a
  `role="menu"`. Collapse toggle: `role="button" aria-expanded="true/false"
  aria-label="Collapse [widget name]"`. DM-only badge: `aria-label="Hidden from players"`. Binding
  indicator: `aria-label="Data binding: [entity name]"` or `"No data binding"`. All chrome elements
  are Tab-reachable within the widget's focus group (see UX-CANVAS-015).
- **Acceptance criteria:**
  - Given an inactive widget, when no pointer is over it, the title bar and handles are at 20%
    opacity.
  - Given a Desktop user hovers a widget, when the pointer enters, the chrome fades to 100% opacity
    within 120 ms.
  - Given a widget has `dm-only` visibility, the DM-only badge is visible at all times, uses an
    icon + text label, and uses a diagonal-stripe pattern (not color alone).
  - Given a widget has a missing binding, the chain-link icon renders in `--color-warning` and the
    content area shows a "Binding missing" placeholder with a "Rebind" action.
  - Given a screen-reader user focuses the `⋯` button, the accessible name is "[Widget name]
    actions".
- **Priority:** Must-have

---

### UX-CANVAS-008 — Widget data binding affordances

- **Requirement:** The DM must be able to bind a widget to an entity (character, note, map, etc.)
  using a proximity-reveal anchor on Desktop/Tablet and a discrete "Bind to entity…" menu on all
  profiles. Binding state must be visually clear and persistently indicated on the widget.
- **Rationale:** CANVAS-009 requires actor-scoped bindings. Whimsical's proximity-reveal connector
  pattern [10] provides a discoverable gesture; the discrete menu satisfies WCAG 2.2 §2.5.7 [6].
- **Spec:**
  - **Proximity-reveal anchors (Desktop/Tablet):** when the pointer/touch hovers within 16 px of a
    widget's border (Desktop) or within 24 px (Tablet touch), four edge-center anchor points appear:
    small filled circles (8×8 CSS px visible, 44×44 px touch target). These are binding anchors.
    Dragging from an anchor to another widget or to an entity listed in a sidebar creates a binding.
  - **Binding line:** a bezier curve (2 px, `--color-accent-secondary`, dashed) is drawn between
    bound widgets/entities during the binding drag and as a persistent indicator when the "show
    bindings" overlay is toggled.
  - **Discrete binding menu:** context menu → "Bind to entity…" (available on all profiles).
    Opens a search-and-select panel: type to search entities (characters, notes, maps), select one,
    choose the binding type (character HP, character conditions, etc.), confirm. Same processing-core
    command as drag-from-anchor.
  - **Active binding indicator:** the chain-link icon in the widget's bottom-left chrome (see
    UX-CANVAS-007). Clicking it opens the binding management panel showing all active bindings for
    this widget: entity name, binding type, binding status (active/missing/conflicted/hidden).
    Each binding row has a "Remove" action.
  - **Show bindings overlay:** a toolbar toggle "Show bindings" renders all binding curves on the
    canvas simultaneously. Useful for DMs auditing a complex scene. Default: off.
  - **Binding types:** declared by each widget package. The UI presents the declared types as a
    labeled list in the binding panel. Types include (examples): `character.hp`, `character.
    conditions`, `character.name`, `map.region`, `note.content`, `timer.state`.
  - **Binding status states:** active (data resolved), missing (entity not found), hidden (entity
    exists but is redacted for this actor), conflicted (entity has unresolved conflict).
- **States:**
  - *No binding:* chain-link icon in `--color-muted`; tooltip "No data binding".
  - *Binding active:* chain-link in `--color-accent-secondary`; tooltip lists bound entity names.
  - *Binding missing:* chain-link in `--color-warning`; widget content shows placeholder.
  - *Binding hidden (player view):* chain-link in `--color-muted`; content shows blank
    placeholder — never a zero or stale value.
  - *Binding conflicted:* chain-link in `--color-warning`; content shows conflict state.
  - *Dragging from anchor:* bezier curve follows cursor; eligible target widgets/entities highlight
    with a green ring.
- **Platform profiles:**
  - *Desktop:* proximity anchors + drag-from-anchor; discrete menu always available.
  - *Tablet:* proximity anchors (touch, 24 px zone); drag-from-anchor (touch drag); discrete menu.
  - *Mobile:* no proximity anchors (too small); discrete menu only.
- **Input:** hover proximity to reveal anchors; drag from anchor to target; keyboard: context menu →
  "Bind to entity…" (Tab navigable); `B` key (when widget selected) opens binding panel.
- **Accessibility:** Binding management panel: `role="dialog"` with `aria-label="Widget data
  bindings"`. Binding status is announced when it changes (live region). Anchor drag is the gesture;
  "Bind to entity…" menu is the WCAG-compliant alternative. All binding management is Tab-operable.
- **Acceptance criteria:**
  - Given a Desktop user hovers near a widget border, binding anchors appear within 120 ms.
  - Given the user drags from a widget anchor to a character entity, a binding is created and the
    chain-link indicator changes to `--color-accent-secondary`.
  - Given a Mobile user opens the context menu and selects "Bind to entity…", the binding panel
    opens and they can complete binding without any drag gesture.
  - Given a widget has a binding to a `dm-only` entity in a player session, the content area
    renders a blank placeholder and the chain-link shows `--color-muted`.
  - Given the "Show bindings" overlay is toggled, all binding curves render as dashed bezier lines
    on the canvas.
- **Priority:** Must-have

---

### UX-CANVAS-009 — Alignment, grid, and smart guides

- **Requirement:** The canvas must provide an optional grid, snap-to-edge/center/equidistance, and
  real-time smart-guide lines during drag and resize. Each snap layer must be independently
  toggleable. A snap-override key (Alt/Option) must disable snap temporarily during drag.
- **Rationale:** Figma's four-layer snap model [1] and Excalidraw's equidistance guides [4] reduce
  manual alignment work for DMs arranging many widgets.
- **Spec:**
  - **Grid:** optional (toggle in canvas settings); default 16 px; range 8–128 px, user-adjustable.
    Grid lines rendered at 10% opacity `--color-canvas-grid` (from `01-visual-design-system.md`).
    Grid snaps widget corners to nearest grid intersection. Grid is cosmetic only when snap is
    disabled.
  - **Snap layers (each independently toggleable in canvas settings):**
    1. Grid snap (widget corners → grid intersections)
    2. Edge snap (widget edges align to sibling widget edges)
    3. Center snap (widget centers align to sibling widget centers)
    4. Equidistance snap (even spacing between selected widgets and siblings)
  - **Snap threshold:** 4 CSS px at 100% zoom. Scales inversely with zoom: at 50% zoom the
    threshold is 8 CSS px; at 200% zoom it is 2 CSS px.
  - **Snap indicator lines:** 1 px solid in `--color-snap-guide` (orange-ish from design system);
    drawn from the snapped edge/center through the full viewport width or height. Disappear on
    mouse-up/touch-end.
  - **Equidistance indicators:** a pair of equal-length arrows or dimension labels drawn between
    the object being dragged and its equidistant neighbors, in `--color-snap-guide`.
  - **Alt/Option override:** holding Alt/Option during drag disables all snap layers for that drag
    gesture. Releasing restores snap.
  - **Align toolbar:** when ≥2 widgets are selected, the context toolbar shows: Align Left, Align
    Center Horizontal, Align Right, Align Top, Align Center Vertical, Align Bottom, Distribute
    Horizontal, Distribute Vertical. Each executes a processing-core command that repositions the
    selected widgets.
  - **Smart guides on resize:** same edge/center snap applies during resize (the growing edge snaps
    to sibling edges/centers).
- **States:**
  - *Snap guides:* appear only during drag/resize; immediately disappear on release.
  - *Grid:* persistent when enabled; hidden when disabled.
  - *Align toolbar:* appears in the multi-selection context toolbar.
- **Platform profiles:** identical snap/grid behavior across Desktop and Tablet. Mobile: snap still
  active; align toolbar available via context menu rather than floating toolbar.
- **Input:** Alt/Option = disable snap during drag. In canvas settings: checkboxes for each snap
  layer; number input for grid size. Align toolbar: Tab to toolbar, arrow keys between buttons,
  Enter to activate.
- **Accessibility:** Align commands are `role="button"` in a `role="toolbar"`. Each button has
  `aria-label` (e.g. "Align selected widgets left"). Executing an align command announces the result
  in a live region: "3 widgets aligned left".
- **Acceptance criteria:**
  - Given snap is enabled and the user drags a widget near a sibling edge, a snap guide line appears
    and the widget snaps when within 4 px (at 100% zoom).
  - Given the user holds Alt/Option during drag, no snap occurs.
  - Given two widgets are selected, when the user clicks "Distribute Horizontal", the widgets are
    evenly spaced horizontally by the same processing-core command used on Desktop and Mobile.
  - Given grid is enabled at 16 px, widget corners snap to the nearest 16 px intersection during
    drag.
- **Priority:** Must-have (grid and snap); Should-have (equidistance indicators, align toolbar).

---

### UX-CANVAS-010 — Canvas templates: save and recall

- **Requirement:** The DM must be able to save any canvas as a named template and instantiate it
  instantly; template instantiation must create new widget instances without cloning bound entities.
- **Rationale:** CANVAS-004 requires templates. CMD-007 requires Command Center presets (which are
  templates). Templates are a key speed path for live-play session startup.
- **Spec:**
  - **Save template:** Canvas menu (top-left, `⋯`) → "Save as template…" → modal: name field
    (required), description (optional, 240 char max), thumbnail (auto-generated from current
    viewport), tags (comma-separated). Confirm saves the template.
  - **Template library:** accessible from the canvas menu → "New canvas from template…" or from the
    widget library panel's "Templates" tab. Shows a grid of named templates with auto-generated
    thumbnails and creation dates.
  - **Instant recall:** selecting a template and confirming creates a new canvas with new widget
    instances and the same bindings as the template (binding to the same entities). The new canvas
    opens in ≤2 seconds (local operation; no network required).
  - **Missing binding in template:** if an entity referenced by a template binding no longer exists,
    the affected widget renders the explicit `missing` state (not a blank or stale value). A
    notification at the top of the new canvas lists "N bindings could not be resolved".
  - **System templates:** a set of read-only system-provided templates (e.g., "Combat Session",
    "Prep Board", "Player Handout Canvas") is pre-installed. System templates are marked with a
    "Built-in" badge and cannot be overwritten.
  - **Template thumbnail:** auto-generated at 320×240 px from the current viewport at the moment of
    saving. Updated only on explicit re-save.
  - **Delete template:** template library row → `⋯` → "Delete". Confirmation required. Deleting
    a template does not affect any canvas instantiated from it.
- **States:**
  - *Template saving:* loading indicator in the modal confirm button; success toast on completion.
  - *Template library loading:* skeleton grid while templates load.
  - *Instantiating:* the new canvas opens immediately with widget skeletons, filling in as data
    resolves (optimistic open).
  - *Missing bindings:* inline warning banner on the new canvas listing unresolved entities.
- **Platform profiles:** same flow on Desktop/Tablet. Mobile: template library opens as a full-
  screen sheet; instantiation opens the new canvas in focused view.
- **Input:** keyboard-operable modal; templates listed as a grid of `role="option"` items in a
  `role="listbox"`; arrow keys navigate; Enter instantiates; Escape closes.
- **Accessibility:** Template thumbnail has `alt` text: "[Template name] — [N] widgets, created
  [date]". Missing-binding warning is a `role="alert"` region.
- **Acceptance criteria:**
  - Given a canvas with 5 widgets, when the DM saves it as a template and instantiates it, a new
    canvas appears with 5 new widget instances and the same entity bindings, in ≤2 seconds.
  - Given a template binding references a deleted entity, when the template is instantiated, the
    affected widget shows "Binding missing" state and the warning banner lists the entity name.
  - Given a system template is shown in the library, it is marked "Built-in" and has no "Delete"
    option.
- **Priority:** Must-have

---

### UX-CANVAS-011 — DM view vs. player view affordance

- **Requirement:** The DM canvas must provide an unambiguous, persistent, non-color-only affordance
  on every widget to show its player-visibility state; the DM must be able to change visibility
  in ≤2 interactions; and the DM must be able to preview the player's view without leaving the DM
  canvas.
- **Rationale:** CANVAS-005, CANVAS-006, CANVAS-015 mandate player-view control and data safety.
  Per WCAG 2.2 §1.4.1, color alone must not convey meaning [6]. The DM/player boundary is
  safety-critical — any leakage is a product defect.
- **Spec:**
  - **Visibility states per widget:**
    - `dm-only`: visible to the DM only. Badge: a closed-eye icon + "DM Only" text pill, always
      full-opacity, rendered with `--color-dm-only` fill and a diagonal-stripe texture overlay.
    - `player-visible`: visible to all assigned players. Badge: open-eye icon + "Players" text pill
      in `--color-player-visible`.
    - `projected-to`: visible to specific players only. Badge: open-eye icon + "N players" in
      `--color-player-visible`; tooltip lists names.
    - `no-assignment` (default for new widgets): `dm-only` until explicitly shared.
  - **Change visibility:** 2 paths, ≤2 interactions each:
    1. Context menu → "Show to players" / "Hide from players" / "Show to specific players…"
    2. Click the visibility badge → inline popover with a toggle (all players) and a multi-select
       player list.
  - **Player-view preview:** a toolbar button "Preview player view" (eye icon, keyboard shortcut
    `Shift+P`). Activates a non-destructive read-only overlay of the canvas as a specific player
    would see it: `dm-only` widgets become invisible; `player-visible` and `projected-to` widgets
    render with player-appropriate data. A persistent orange banner at the top of the viewport reads
    "PLAYER VIEW PREVIEW — [player name] — Press Shift+P or Esc to exit". No mutation is possible
    in preview mode.
  - **Player selector in preview:** a dropdown in the preview banner selects which player's view to
    preview. Defaults to the first connected player.
  - **Safety constraint:** preview mode is purely a UI overlay; it fetches no additional data. It
    renders widgets with the filtered data already loaded by the DM session. It must not expose
    hidden fields through the preview state.
  - **Player view canvas (the actual player's device):** renders only the widgets and data that
    have been projected/assigned. Widget chrome and DM badges are hidden. The player's canvas is
    not editable unless a `co-editor` or `manager` capability grant exists (CANVAS-007).
- **States:**
  - *DM canvas, dm-only widget:* "DM Only" badge persistent.
  - *DM canvas, player-visible widget:* "Players" badge persistent.
  - *Preview mode:* orange banner; dm-only widgets hidden; canvas interaction disabled.
  - *Player canvas:* no DM badges; no resize handles (unless granted); no `⋯` menu (unless
    granted).
- **Platform profiles:** identical behavior on Desktop/Tablet. Mobile preview: full-screen sheet
  with a prominent "PREVIEW" banner at the top.
- **Input:** `Shift+P` to enter/exit preview mode; Escape also exits. Context menu visibility
  actions Tab-navigable.
- **Accessibility:** Preview mode banner is `role="alert"` on entry (announces "Player view preview
  active for [player name]"). DM-only badge: `aria-label="Hidden from players"`. Player-visible
  badge: `aria-label="Visible to all players"`. Visibility state changes announced in a live region.
- **Acceptance criteria:**
  - Given the DM right-clicks a `dm-only` widget and selects "Show to players", the widget badge
    changes to "Players" and the player canvas receives the widget on next sync.
  - Given the DM presses Shift+P, the canvas enters preview mode; `dm-only` widgets are hidden;
    the orange preview banner is visible.
  - Given preview mode is active, when the DM attempts to move a widget, no move occurs and the
    canvas remains read-only.
  - Given the DM exits preview mode (Esc or Shift+P), the canvas returns to full DM view with all
    widgets and their actual visibility badges.
  - Given a widget is `dm-only`, the badge uses both the diagonal-stripe texture and the
    closed-eye icon — not color alone — and survives a grayscale test.
- **Priority:** Must-have

---

### UX-CANVAS-012 — Undo/redo

- **Requirement:** The canvas must maintain a per-canvas undo/redo stack of ≥50 steps covering all
  layout operations (place, move, resize, rotate, group, delete, bind, visibility change, template
  apply). Undo/redo must be available at all times and keyboard-operable.
- **Rationale:** CANVAS-003 implies reversibility. The safety principle (§1.8 of 00-overview) and
  the parameter rubric (error prevention/recovery) require undo for all destructive operations.
- **Spec:**
  - **Undo:** Ctrl/Cmd+Z (unlimited within 50-step stack; 50th step is a hard limit — a toast
    warns "Undo limit reached").
  - **Redo:** Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y.
  - **What is undoable:** every canvas layout mutation dispatched through the processing-core command
    API: place widget, move, resize, rotate, group, ungroup, z-order change, lock/unlock, bind,
    unbind, visibility change, template instantiate. Scene-level metadata edits (name, tags) are
    also undoable. Widget content edits (e.g., text typed inside a notes widget) have their own
    undo stack managed by the widget; canvas undo does not reach inside widget content.
  - **What is NOT undoable:** binding resolves data from external entities — undo does not change
    external entity data. Projection to players (undo locally removes the widget from the player
    view assignment, but cannot undo data received by the player's device). Permanent entity
    deletion (which requires a separate, confirmed command).
  - **Undo indicator:** an "Undo [action name]" tooltip on the Ctrl/Cmd+Z affordance (visible in
    the toolbar on hover; e.g. "Undo: Move widget 'Initiative Tracker'"). This requires that every
    processing-core layout command carries a human-readable description.
  - **Undo across sessions:** the undo stack is per-canvas session (in-memory); it does not persist
    across app restarts. A warning toast appears if the user attempts to undo after a restart.
  - **Multi-user undo:** undo only affects the local user's own operations. A remote collaborator's
    operations appear as committed and are not in the local undo stack (CRDT/OT model per SYNC
    requirements).
  - **Undo after delete:** if a widget was deleted and the user undoes, the widget is restored in
    its last position. A toast confirms: "Widget restored: [name]".
- **States:**
  - *Stack non-empty:* Ctrl/Cmd+Z enabled; undo toolbar button enabled.
  - *Stack empty:* Ctrl/Cmd+Z disabled; undo button grayed with tooltip "Nothing to undo".
  - *Redo available:* Ctrl/Cmd+Shift+Z enabled; after any new action, redo stack is cleared.
- **Platform profiles:** same behavior on Desktop/Tablet/Mobile. Mobile: undo/redo accessible via
  the canvas `⋯` menu → "Undo" / "Redo" (no keyboard assumed).
- **Input:** Ctrl/Cmd+Z (undo); Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y (redo); toolbar undo/redo buttons.
- **Accessibility:** Undo/redo buttons have `aria-label="Undo [action name]"` / `"Redo [action
  name]"`. `aria-disabled="true"` when stack is empty. Undo/redo actions announced in a live region:
  "Undone: Move widget Initiative Tracker".
- **Acceptance criteria:**
  - Given the DM moves a widget, when they press Ctrl/Cmd+Z, the widget returns to its previous
    position and "Undone: Move widget [name]" is announced.
  - Given the undo stack has 50 steps and the DM performs a 51st action, the oldest step is
    discarded and a "Undo limit reached" toast appears on the next undo attempt at the stack
    boundary.
  - Given a widget was deleted, when the DM presses Ctrl/Cmd+Z, the widget is restored with a
    "Widget restored" toast.
  - Given a remote collaborator moves a widget, when the local DM presses Ctrl/Cmd+Z, only the
    local DM's own operations are reversed.
- **Priority:** Must-have

---

### UX-CANVAS-013 — Empty-canvas teaching state

- **Requirement:** A canvas with no widgets must render an atmospheric, instructive empty state that
  guides the first action without being distracting, and must disappear entirely when the first
  widget is placed.
- **Rationale:** First-run empty states that teach are a proven pattern [7] [4]; the canvas is the
  primary surface and must not disorient first-time users. The vision requires the canvas to feel
  "spatial, composable, live" from first contact.
- **Spec:**
  - **Background:** canvas background in the current theme's `--color-canvas-bg` token. A subtle
    dot-grid or crosshatch pattern at 8% opacity on the background texture (only in empty state;
    fades out as widgets are placed).
  - **Center callout:** a centered illustration (SVG, role="presentation") with a brief headline
    ("Your scene is empty") and a primary call-to-action button ("Add your first widget" →
    opens the widget library). Font: `--font-heading-md`; color: `--color-text-secondary`.
  - **Secondary callouts:** 2–3 contextual hint annotations positioned around the empty canvas with
    light arrows pointing to relevant UI areas (e.g., "Drag from the widget library", "Press W to
    open the widget panel"). Rendered with `--color-text-tertiary` at 60% opacity.
  - **Keyboard hint bar:** a thin strip at the bottom of the viewport showing 3–5 key shortcuts:
    "W — Add widget · 0 — Zoom to fit · Shift+P — Preview player view". Color: `--color-text-
    tertiary`. Dismissable. Reappears if the canvas returns to empty state.
  - **Disappearance:** as soon as the first widget is placed (any widget), all empty-state elements
    fade out over 200 ms (instant under `prefers-reduced-motion`). They do not return unless the
    canvas is emptied again.
  - **Atmospheric background:** the canvas may display an optional themed ambient background image
    (DM-configurable per scene metadata, per CANVAS-013). The empty-state callout overlays this
    background. When a background image is set, the dot-grid overlay is suppressed.
- **States:**
  - *Empty (no widgets placed):* full empty-state rendering.
  - *Transitioning (first widget being placed):* empty-state fades out.
  - *Non-empty:* no empty-state elements; background image or plain `--color-canvas-bg`.
- **Platform profiles:** same content on Desktop/Tablet. Mobile: center callout simplified to
  headline + single button; no secondary callout annotations (too cluttered); hint bar retained.
- **Input:** CTA button opens widget library (same as `W` key).
- **Accessibility:** Center callout illustration: `aria-hidden="true"`. CTA button: standard
  `role="button"`. Hint bar: `aria-hidden="true"` (decorative shortcut reminders; actual shortcuts
  are discoverable via the keyboard shortcuts reference). Empty state is announced to screen readers
  as "Scene empty — press W or activate the Add widget button to begin."
- **Acceptance criteria:**
  - Given a newly created canvas, when it opens, the center callout and secondary hints are visible.
  - Given the DM places the first widget, when placement is confirmed, the empty-state elements
    fade out within 200 ms (or instantly under reduced-motion).
  - Given the user presses the CTA button in the empty state, the widget library opens.
  - Given `prefers-reduced-motion: reduce` is active, the fade-out is replaced by an instant
    display change.
- **Priority:** Should-have

---

### UX-CANVAS-014 — Performance and perceived performance

- **Requirement:** The canvas must maintain 60 fps during pan and zoom up to 100 widgets; must
  virtualize off-screen widgets; must provide a degraded poster-frame mode during rapid pan when the
  frame budget is exceeded; and must show skeleton placeholders while widget data resolves.
- **Rationale:** Performance is a first-class constraint per the vision. With a live DM managing
  20–50+ widgets, any frame drop during pan/zoom is immediately disruptive to table flow.
  Figma [1] and Miro [2] both use culling and degraded-mode strategies to maintain perceived
  smoothness.
- **Spec:**
  - **Frame target:** 60 fps (16.7 ms per frame) for pan and zoom interactions.
  - **Frame budget breakdown:** ≤10 ms for canvas transform; ≤4 ms for visible widget updates;
    ≤2 ms for chrome updates. Implementation must profile against this budget before release.
  - **Virtualization:** widgets whose bounding box is entirely outside the current viewport + 1
    viewport bleed margin are not rendered or are represented as empty bounding-box placeholders. The
    bleed margin prevents pop-in during slow pan.
  - **Poster-frame degradation:** when actual frame time exceeds 20 ms for >3 consecutive frames
    during a pan/zoom gesture, the canvas switches to poster-frame mode: the last rendered frame is
    displayed as a static bitmap while pan/zoom continues; widgets resume rendering when the gesture
    ends or the frame budget recovers. A subtle "rendering…" indicator appears at the canvas edge
    (not a spinner; a thin progress line).
  - **Widget render budget:** each widget type declares a `renderBudget` in its manifest (in ms).
    The canvas scheduler enforces this: widgets that exceed their budget are deferred to the next
    idle frame.
  - **Skeleton state:** when widget data is pending (initial load, rebind, sync), the widget content
    area shows a skeleton that matches the approximate layout of its content (not a generic spinner).
    Skeleton uses `--color-skeleton-base` and `--color-skeleton-shine` tokens with a shimmer
    animation (disabled under `prefers-reduced-motion`).
  - **Max widgets per canvas (soft limit):** the canvas should warn the DM when >150 widgets are
    placed (a non-blocking notification: "This canvas has many widgets. Consider grouping or moving
    widgets to separate scenes for best performance."). No hard cap enforced by the system.
  - **Canvas with >100 widgets:** all performance targets remain binding; if virtualization is not
    sufficient, a "Performance mode" toggle reduces chrome rendering (handles hidden, animations
    disabled) to recover frame budget.
- **States:**
  - *Normal:* 60 fps rendering; all chrome visible per hover/focus rules.
  - *Poster-frame:* static bitmap; pan continues; "rendering…" line visible.
  - *Skeleton:* widget frame visible; content area shows shimmer skeleton.
  - *Performance mode (DM-triggered):* chrome simplified; animations off.
- **Platform profiles:**
  - *Desktop:* full 60 fps target; virtualization mandatory for >50 widgets.
  - *Tablet:* 60 fps target for touch pan/zoom; poster-frame degradation at >30 ms frame time.
  - *Mobile:* 60 fps for single-widget focused view; canvas overview (multi-widget) targets 30 fps
    minimum with poster-frame at >35 ms.
- **Input:** no user input directly relates to performance management. The "Performance mode" toggle
  is in canvas settings.
- **Accessibility:** Skeleton shimmer animation must be suppressed under `prefers-reduced-motion`.
  The "rendering…" indicator has `aria-live="polite"` with text "Canvas rendering, please wait."
  that is only announced once per poster-frame episode.
- **Acceptance criteria:**
  - Given a canvas with 50 widgets, when the DM pans continuously, the canvas maintains ≥60 fps
    (measured via performance profiling in CI).
  - Given the frame budget is exceeded during a pan gesture for >3 frames, the canvas enters
    poster-frame mode with a "rendering…" indicator.
  - Given a widget's data is loading, the widget content area shows a layout-matched skeleton, not
    a generic spinner.
  - Given >150 widgets are placed, a non-blocking notification warns the DM about performance.
  - Given `prefers-reduced-motion: reduce` is active, no skeleton shimmer animation runs.
- **Priority:** Must-have

---

### UX-CANVAS-015 — Canvas keyboard model and focus management

- **Requirement:** Every canvas operation must have a keyboard path; focus must be predictable and
  auditable; Tab order on the canvas must follow declared focus metadata (per CANVAS-016); and
  Escape must always provide a clear exit from any mode or nested state.
- **Rationale:** CANVAS-012 mandates keyboard alternatives. CANVAS-016 mandates metadata-driven
  focus order. WCAG 2.2 §2.1.1 (Keyboard) and §2.4.3 (Focus Order) apply [6].
- **Spec:**
  - **Canvas focus entry:** Tab from the application chrome → enters the canvas at the
    topmost/first widget in z-order focus metadata.
  - **Widget traversal:** Tab moves forward through widgets in z-order focus order; Shift+Tab moves
    backward. Arrow keys pan the viewport (do not move focus between widgets — to avoid conflict
    with widget move arrow-key shortcut, arrow-key navigation between widgets uses Tab only).
  - **Within a widget:** Enter or F2 enters the widget's internal keyboard model (managed by the
    widget); Escape exits back to canvas level with the widget still selected.
  - **Canvas-level keyboard shortcuts (when focus is at canvas level, not inside a widget):**
    | Key | Action |
    |---|---|
    | `W` or `I` | Open widget library |
    | `Delete` / `Backspace` | Delete selected widget(s) (confirmation dialog) |
    | `Ctrl/Cmd+Z` | Undo |
    | `Ctrl/Cmd+Shift+Z` | Redo |
    | `Ctrl/Cmd+A` | Select all |
    | `Ctrl/Cmd+G` | Group selection |
    | `Ctrl/Cmd+Shift+G` | Ungroup |
    | `Ctrl/Cmd+D` | Duplicate selection |
    | `Ctrl/Cmd+]/[` | Z-order forward/backward |
    | `Ctrl/Cmd+Shift+]/[` | Z-order to front/back |
    | `0` | Zoom to fit |
    | `1` | Zoom to 100% |
    | `+` / `−` | Zoom in/out one stop |
    | `Shift+P` | Toggle player-view preview |
    | `L` | Toggle layers panel |
    | `G` | Toggle grid |
    | `Escape` | Deselect all / exit mode / exit group edit |
    | `F2` | Rename selected widget |
    | `C` | Collapse/expand selected widget |
    | `B` | Open binding panel for selected widget |
    | `P` | Open position panel for selected widget |
    | `R` | Open resize panel for selected widget |
    | `Arrow keys` | Pan viewport 32 px; or move selected widget 1 px (if widget is selected) |
    | `Shift+Arrow` | Pan 128 px or move widget 8 px |
    | `Ctrl/Cmd+Shift+Arrow` | Move widget 32 px |
  - **Mode stack:** the canvas maintains a mode stack (normal, placing, group-editing, preview).
    Escape always pops one level from the stack. If the stack is at normal level and nothing is
    selected, Escape moves focus out of the canvas to the application chrome.
  - **Focus visibility:** focus ring must be visible on all focused elements. The canvas-level focus
    indicator (when the canvas itself has focus but no widget is selected) is a 2 px inset border
    on the canvas viewport edge in `--color-focus-ring`.
  - **Keyboard shortcuts reference:** `?` key (when canvas has focus) opens a keyboard shortcuts
    panel listing all canvas shortcuts in a searchable table.
- **States:**
  - *Canvas focused, no widget selected:* canvas-level focus ring visible.
  - *Widget focused:* widget has selection ring + focus ring; handles active.
  - *Widget content active (Enter pressed):* focus is inside the widget; canvas shortcuts are
    suspended; widget's own keyboard model takes precedence.
  - *Preview mode:* all edit shortcuts disabled; Escape and Shift+P exit preview.
- **Platform profiles:**
  - *Desktop:* full shortcut set; Tab traversal; arrow key pan/move.
  - *Tablet:* optional hardware keyboard supported with same shortcut set. On-screen keyboard: no
    shortcut assumption; all operations reachable via menus.
  - *Mobile:* keyboard shortcuts not assumed; all operations reachable via menus, buttons, and the
    command palette.
- **Input:** keyboard only (this requirement). See individual requirements for pointer/touch input.
- **Accessibility:** Keyboard shortcut reference panel (`?`) is `role="dialog"`. Focus ring must
  meet 3:1 contrast against adjacent colors per WCAG 2.2 §2.4.11. Focus order is tested by
  automated tooling. All shortcuts are listed in the application's keyboard shortcuts reference.
  Canvas region has `role="application"` with `aria-label="Scene canvas"` and
  `aria-roledescription="Spatial canvas"`.
- **Acceptance criteria:**
  - Given keyboard-only operation, when the user presses Tab from the nav rail, focus enters the
    canvas at the first widget in z-order focus metadata.
  - Given a widget is focused and the user presses Delete, a confirmation dialog appears; confirming
    removes the widget; canceling restores focus to the widget.
  - Given the user presses `0`, the canvas zooms to fit all widgets and "Zoomed to fit" is announced
    in a live region.
  - Given focus is inside a widget's content (Enter was pressed), when the user presses Escape,
    focus returns to canvas level with the widget still selected.
  - Given the user presses `?`, a keyboard shortcuts panel opens and is navigable by Tab.
- **Priority:** Must-have

---

### UX-CANVAS-016 — Multi-touch gestures and non-gesture alternatives

- **Requirement:** All multi-touch gestures used on the canvas must have a discrete (tap/button/
  menu/keyboard) alternative that executes the same processing-core command; no operation may be
  gesture-only.
- **Rationale:** WCAG 2.2 §2.5.7 (Dragging Movements) and §2.5.1 (Pointer Gestures) [6]; the
  platform cross-profile rule in `00-overview-and-principles.md` §3; CANVAS-012.
- **Spec:**
  - **Gesture → alternative mapping:**
    | Gesture | Alternative |
    |---|---|
    | Two-finger pinch to zoom | Zoom +/− buttons; keyboard +/−; zoom input field |
    | Two-finger drag to pan | Arrow key pan; minimap viewport drag; scroll bars |
    | Single-finger drag to move widget | Arrow key move; context menu "Position…" |
    | Single-finger drag to resize | Arrow key resize; context menu "Resize…"; properties panel |
    | Long-press to open context menu | Right-click (Desktop); `⋯` button; keyboard context menu key |
    | Drag from widget library | Tap-to-place flow; keyboard place mode |
    | Drag binding anchor to entity | Context menu "Bind to entity…"; keyboard B shortcut |
    | Drag layers panel row to reorder | Ctrl/Cmd+Arrow in layers panel |
    | Drag marquee for multi-select | Shift+Tab to add to selection; Ctrl/Cmd+A; keyboard select |
  - **Touch target minimum:** ≥44×44 CSS px for every interactive element, with ≥8 CSS px gap
    between adjacent targets. This applies to: widget handles, toolbar buttons, context menu items,
    minimap viewport rect, library items, and all form controls in panels.
  - **Pen input:** treated as a precise pointer on Tablet. Pen hover triggers the same hover states
    as mouse. Pen drag on the drag handle moves the widget. Pen long-press opens context menu.
    Pen is not a first-class input on Desktop or Mobile but must not produce errors.
  - **Hover states on touch:** widgets must not rely on hover for their only affordance. All actions
    available on hover must also be available on tap or through a context menu. (Per WCAG 2.2
    §2.5.3.)
  - **Pointer cancellation:** all pointer-down operations must be cancellable on pointer-up outside
    the original target (WCAG 2.2 §2.5.2). A drag-move cancelled by releasing outside a valid drop
    zone returns the widget to its original position.
- **States:** see UX-CANVAS-003, UX-CANVAS-005, UX-CANVAS-007 for state machines for each
  gesture type.
- **Platform profiles:**
  - *Desktop:* gestures apply to trackpad; mouse has no multi-touch; all alternatives are primary.
  - *Tablet:* gestures are the primary input; alternatives are required but may be in secondary
    menus.
  - *Mobile:* alternatives are first-class (often the primary path); gestures are available where
    touch area allows.
- **Input:** this requirement is the master index of gesture-to-alternative mappings. See
  individual requirements for full input specs.
- **Accessibility:** WCAG 2.2 §2.5.7 compliance is an acceptance criterion. All gestures have
  documented alternatives. Touch target sizes are validated by automated testing.
- **Acceptance criteria:**
  - Given any multi-touch gesture, when the user cannot perform it (e.g., motor disability), there
    exists a documented and operable discrete alternative that produces the same result.
  - Given a touch user taps the `⋯` button on a widget, the context menu opens without requiring
    any hover or long-press gesture.
  - Given a pointer-down drag that is released outside a valid drop zone, the widget returns to its
    original position.
  - Given automated a11y testing, touch targets ≥44×44 CSS px with ≥8 px gaps pass on all
    interactive canvas elements.
- **Priority:** Must-have

---

## 6. Component and state specifications

### 6.1 Widget anatomy (canonical structure)

```
┌──────────────────────────────────────────────────────────────┐
│ [icon] Widget Name              [DM Only 🔒] [👁 Players] [⋯] │  ← title bar (32px/44px)
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [widget content area — scrollable if overflow]              │
│                                                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
 ↑ resize handles (corners + edges, hidden until hover/select)
 ↑ chain-link binding indicator (bottom-left corner of frame)
 ↑ rotation handle (20px above top-center, hidden until selected)
```

### 6.2 Widget chrome state matrix

| State | Title bar opacity | Handle visibility | Selection ring | Cursor on title |
|---|---|---|---|---|
| Default | 20% | Hidden | None | `default` |
| Hover (Desktop) | 100% | Visible | None | `grab` |
| Selected | 100% | Visible | 2 px solid accent | `grab` |
| Dragging | 100% | Visible | Outline at origin | `grabbing` |
| Collapsed | 100% | Resize hidden | Per selection | `grab` |
| Locked | 100% | Hidden | Per selection | `not-allowed` |
| Error | 100%, error bg | Per selection | Error ring | Per state |
| Focused (keyboard) | 100% | Visible | Focus ring | — |

### 6.3 Canvas toolbar layout

```
Desktop:
[≡ Scene menu] [+ Add widget] [Undo] [Redo]    ...    [Grid] [Snap] [L Layers] [Zoom% ▾] [0 Fit] [👁 Preview] [⋯]

Tablet:
[≡] [Undo] [Redo]    ...    [Zoom% ▾] [👁]    [+ FAB bottom-right]

Mobile:
[≡]    ...    [⋯]    [+ FAB bottom-right]
```

### 6.4 Minimap specification

| Attribute | Value |
|---|---|
| Position | Fixed, bottom-right, 16 px inset |
| Size (Desktop) | 160×120 CSS px |
| Size (Tablet, when visible) | 120×90 CSS px |
| Size (Mobile) | Hidden by default; 96×72 when toggled |
| Background | `--color-canvas-bg` at 85% opacity |
| Border | 1 px solid `--color-border-subtle` |
| Widget representation | Solid rectangles at `--color-accent-primary` 40% opacity |
| Viewport rect | 1 px stroke `--color-accent-primary`; draggable |
| Toggle shortcut | `M` key (Desktop) |

### 6.5 Binding management panel

| Element | Detail |
|---|---|
| Panel title | "Data bindings — [Widget name]" |
| Binding rows | Entity icon + entity name + binding type + status chip + "Remove" button |
| Status chips | Active (green) / Missing (amber) / Hidden (muted) / Conflicted (amber) |
| "Add binding" button | Triggers binding search panel |
| Keyboard navigation | Tab between rows; Enter to activate "Remove"; Escape closes panel |

### 6.6 Context menu items (widget, full set)

| Item | Destructive? | Shortcut |
|---|---|---|
| Copy | No | Ctrl/Cmd+C |
| Duplicate | No | Ctrl/Cmd+D |
| Rename | No | F2 |
| Bind to entity… | No | B |
| Widget settings | No | — |
| Arrange ▶ (submenu) | No | Ctrl/Cmd+]/[ |
| Lock / Unlock | No | — |
| Collapse / Expand | No | C |
| Show to players / Hide from players | No | — |
| Show to specific players… | No | — |
| Delete | Yes | Delete/Backspace |

---

## 7. Layout and responsive behavior

### 7.1 Desktop (≥1024 px)

The canvas occupies the full main content area (right of the persistent nav rail/sidebar, below the
top bar). The canvas toolbar sits at the top of the canvas area as a horizontal bar (40 px height).
The widget library slides in from the left as an overlay panel (304 px) without pushing the canvas.
The layers panel appears as a right overlay (240 px). The minimap is fixed bottom-right. The
properties panel (position, size, rotation inputs) appears as a right sidebar (240 px) when a
widget is selected, or as an overlay on the widget.

```
┌────────────────────────────────────────────────────────┐
│  Top bar (global)                                      │
├──────┬─────────────────────────────────────────────────┤
│ Nav  │ [canvas toolbar: add | undo | redo | zoom | ···]│
│ Rail │─────────────────────────────────────────────────│
│      │                                                 │
│      │         C A N V A S                             │
│      │   (pan / zoom / widgets)                        │
│      │                                     [Minimap]   │
│      │                                                 │
└──────┴─────────────────────────────────────────────────┘
```

### 7.2 Tablet (600–1024 px)

The nav rail collapses to icon-only or to a bottom tab bar (landscape). The canvas toolbar
collapses to essential controls: hamburger Scene menu, undo/redo, zoom percentage, preview toggle.
The widget library appears as a bottom sheet (60% height). The layers panel appears as a bottom
sheet. The minimap is toggleable (off by default). Floating action button `+` (56×56 px, bottom-
right) opens the widget library. The properties panel opens as a bottom sheet (40% height).

```
┌──────────────────────────────────────────────────────────────┐
│  [≡] [Undo][Redo]                           [Zoom%][👁][···] │
│──────────────────────────────────────────────────────────────│
│                                                              │
│                   C A N V A S                                │
│                                                              │
│                                                     [+ FAB]  │
│──────────────────────────────────────────────────────────────│
│  [Icons: home | scene | chars | maps | session]              │
└──────────────────────────────────────────────────────────────┘
```

### 7.3 Mobile (<600 px)

The canvas is available but widget manipulation is predominantly via menus rather than on-canvas
drag. The mobile canvas prioritizes one of two modes:
- **Overview mode:** the full canvas is visible at a zoomed-out level; the user can pan/zoom to
  inspect widget positions. Widget manipulation triggers via tap → context menu.
- **Focused mode:** a single widget occupies most of the screen in a focused panel view. Switching
  between widgets uses a horizontal swipe or a widget picker (the layers panel as a full-screen
  sheet).

The canvas toolbar is minimal: a hamburger Scene menu and a `⋯` button for canvas-level actions.
The `+` FAB (56×56 px, bottom-right) opens the widget library.

The "same command, same result" rule applies: moving a widget on Mobile via the "Position…" modal
dispatches the same processing-core command as a drag on Desktop.

---

## 8. Motion and feedback

All durations and easing use the tokens defined in `01-visual-design-system.md`. Canvas-specific
motion rules:

| Interaction | Duration | Easing | Reduced-motion fallback |
|---|---|---|---|
| Zoom in/out (button or key) | 120 ms | ease-out | Instant |
| Zoom to fit / to selection | 200 ms | ease-in-out | Instant |
| Pan inertia deceleration | 400 ms | cubic-bezier(0.0, 0.0, 0.2, 1) | Instant stop |
| Widget placement (ghost → placed) | 80 ms | ease-out | Instant |
| Widget delete (fade out) | 150 ms | ease-in | Instant |
| Empty-state fade out on first widget | 200 ms | ease-out | Instant |
| Widget chrome hover fade in | 120 ms | ease-out | Instant (CSS `transition: none`) |
| Widget chrome hover fade out | 200 ms | ease-in | Instant |
| Snap guide appear/disappear | 60 ms | ease-out | Instant |
| Selection ring appear | 80 ms | ease-out | Instant |
| Preview mode enter (banner slide) | 150 ms | ease-out | Instant |
| Skeleton shimmer | 1500 ms loop | linear | No animation; static muted color |
| Poster-frame indicator | 300 ms | ease-out | Instant |

**Key rules:**
- Pan and zoom transform animations must use CSS `transform` (or WebGL equivalent) — never layout
  properties — to maintain GPU-composited 60 fps.
- Snap guides must appear and disappear without transition delay; 60 ms is the upper bound.
- Widget content transitions (e.g., data loading) are owned by each widget type and must declare
  their motion budget. Canvas-level motion must not compound widget-level motion.
- The `prefers-reduced-motion: reduce` media query suppresses all canvas animations. The canvas
  remains fully functional; all state changes are immediate.

---

## 9. Accessibility requirements (surface-specific)

Beyond `03-accessibility.md`:

### 9.1 Canvas landmark and structure

The canvas region must be `role="application"` with `aria-label="Scene: [scene name]"` and
`aria-roledescription="Spatial canvas"`. The `role="application"` suppresses the browser's default
document reading mode so the keyboard model (Tab traversal, arrow key pan/widget move) can be fully
owned by the application. **Complementary:** a hidden skip link before the canvas region allows
screen-reader users to bypass it: `Skip to canvas controls`.

### 9.2 Widget focus groups

Each widget is a `role="group"` with `aria-label="[Widget name] — [Widget type]"`. Within the
group, focusable elements are: the title bar (as `role="heading"` for the name), the `⋯` button,
the collapse toggle, the resize handles (as a `role="group"` with `aria-label="Resize handles"`),
and the content area (whose internal keyboard model is widget-managed). Tab within a widget cycles
through these; Escape exits to canvas level.

### 9.3 Z-order and focus order

Focus order follows the z-order metadata declared in `SceneState` (per CANVAS-016), not DOM order.
This is implemented by dynamically setting `tabindex` values based on z-order rank, or by using a
roving tabindex model. The layers panel renders the same order and provides a spatially-independent
keyboard navigation path.

### 9.4 Live regions

| Event | Live region type | Announcement |
|---|---|---|
| Widget placed | `polite` | "Widget added: [name]" |
| Widget moved (keyboard) | `polite` | "Widget moved to [X], [Y]" |
| Widget resized (keyboard) | `polite` | "Widget resized to [W] by [H]" |
| Widget deleted | `assertive` | "Widget deleted: [name]" |
| Undo executed | `polite` | "Undone: [action description]" |
| Redo executed | `polite` | "Redone: [action description]" |
| Selection changed | `polite` | "N widget(s) selected" |
| Zoom changed | `polite` (debounced 500 ms) | "Zoom: N%" |
| Preview mode entered | `assertive` | "Player view preview active — [player name]" |
| Preview mode exited | `polite` | "Preview mode exited" |
| Binding resolved | `polite` | "Binding resolved: [entity name]" |
| Binding missing | `assertive` | "Binding error: [entity name] not found" |

### 9.5 Color and contrast

- Selection ring: ≥3:1 against canvas background (WCAG §1.4.11 Non-text Contrast).
- DM-only badge: ≥4.5:1 text contrast; diagonal-stripe texture ensures non-color differentiation.
- Snap guide lines: ≥3:1 against canvas background.
- Widget content: each widget type is responsible for its own contrast; the canvas chrome tokens
  are set to ensure chrome meets contrast requirements.
- All canvas chrome typography (widget title, badge labels, toolbar) meets ≥4.5:1.

### 9.6 Touch target validation

Automated tests must assert that all interactive canvas elements (handles, buttons, minimap rect,
toolbar items, library items, menu items) meet ≥44×44 CSS px with ≥8 px gap. This must run on
both Desktop and Mobile CI profiles.

### 9.7 Motion safety

All canvas animations listed in §8 have `prefers-reduced-motion` fallbacks. The skeleton shimmer
is one of the highest-risk animations (continuous loop) and must be the first to be validated under
reduced-motion CI. No canvas animation runs on a cycle longer than 3 seconds unless user-initiated
(e.g., a loading spinner awaiting a network response).

---

## 10. Anti-patterns and explicit limitations

### A1 — Gesture-only manipulation (REJECT)
**Pattern:** Requiring drag gestures (move, resize, pan, zoom) as the only path.
**Reason:** Fails WCAG 2.2 §2.5.7 (Dragging Movements). Excludes users with motor impairments,
users on Mobile where gesture areas are small, and users with hardware keyboards. Competitors that
do this (e.g., some early-generation board apps) routinely receive accessibility complaints and
require costly retrofits [6].
**DND Tools rule:** Every gesture has a documented discrete alternative, always. No exceptions for
"advanced" operations.

### A2 — Mode-based canvas (REJECT)
**Pattern:** A "Select mode" vs. "Pan mode" toggle (e.g., v1-era canvas tools, early Miro mobile).
**Reason:** Mode error is one of the most disruptive interaction patterns in direct manipulation.
NN/g documents that mode switching adds cognitive load and increases error rate, especially under
time pressure [6]. A DM in live combat cannot afford a mode error.
**DND Tools rule:** The canvas has no mode toggle for basic operations. Pan, select, and widget
interaction coexist without switching modes. (The only "modes" are structured modes with a visible
banner and Escape exit: placing, preview, group-editing.)

### A3 — Infinite canvas without orientation aids (REJECT)
**Pattern:** An unbounded canvas with no minimap, no zoom-to-fit, and no breadcrumb of current
position. Exhibited by early versions of Mural and some wiki-canvas tools.
**Reason:** Users lose their place on large canvases, especially after zoom or after another user
pans to a different area. Recovery requires manual pan — time-consuming during live play [2].
**DND Tools rule:** The minimap is mandatory on Desktop. Zoom-to-fit is a first-class keyboard
shortcut (`0`). The zoom indicator is always visible. A "Locate selected widget" command (`Shift+F`
or equivalent) centers the viewport on the selected widget.

### A4 — Unbounded widget count without virtualization (REJECT)
**Pattern:** Rendering all widgets regardless of viewport visibility.
**Reason:** At >50 widgets, without culling, frame rate degrades below 60 fps on typical hardware.
Figma's own documentation notes that frame-rate drops during pan/zoom are the top user complaint
for large files [1].
**DND Tools rule:** Virtualization is a Must-have acceptance criterion for any canvas with >50
widgets. The CI performance gate must fail if >50 widgets cause <60 fps on the reference device.

### A5 — Color-only DM/player visibility distinction (REJECT)
**Pattern:** Using only a color change (e.g., a green/red tint) to distinguish "visible to players"
from "hidden from players."
**Reason:** Fails WCAG 2.2 §1.4.1 (Use of Color). Color-blind users (roughly 8% of males) cannot
distinguish red/green. More critically, a DM who misreads the badge may accidentally expose
hidden content to players — a safety defect in the product's core mechanics.
**DND Tools rule:** The DM-only badge always uses both an icon (closed-eye) and a label ("DM Only")
and a texture pattern (diagonal stripe), regardless of color. The player-visible badge uses
open-eye icon + "Players" label. These must survive a grayscale screenshot test.

### A6 — Leaking hidden data through error or skeleton states (REJECT)
**Pattern:** Showing a zero value, an empty string, or a stale cached value in a widget when a
binding is `hidden` or `missing` for a player.
**Reason:** A widget showing "HP: 0" when the real HP is hidden could mislead a player. An empty
field could be confused with a real empty value. Per CANVAS-006, hidden fields must be
represented as an explicit `hidden` placeholder, never a data-shaped value.
**DND Tools rule:** When a binding is `hidden`, the widget content area renders a visually distinct
non-data placeholder ("—" or a lock icon), never a value that could be mistaken for real data.
Skeleton states during loading also must not show stale data — they show a layout skeleton only.

### A7 — Widget chrome that competes with content (REJECT)
**Pattern:** Full-opacity, always-visible handles, title bars, and resize controls — the common
pattern in early-generation canvas apps.
**Reason:** On a dense DND canvas (20–50 widgets), full-opacity chrome on every widget creates a
visual noise level that makes it impossible to read widget content at a glance. FigJam's
hover-reveal chrome pattern was specifically designed to address this [7].
**DND Tools rule:** Widget chrome (handles, title bar background) defaults to 20% opacity. Full
opacity only on hover, focus, or selection. The DM-only badge is the sole exception (always
full-opacity for safety).

### A8 — Undo that crosses widget content and canvas layout (REJECT)
**Pattern:** A unified undo stack that intermixes canvas layout operations with in-widget content
edits (e.g., typing in a notes widget).
**Reason:** A DM typing notes and then pressing Ctrl+Z to undo a typing mistake does not expect
the undo to also move a widget. Mixing the two stacks creates confusion and accidental data loss.
**DND Tools rule:** Canvas layout undo (move, resize, group, etc.) is managed by the canvas.
Widget content undo (typing, formatting) is managed by each widget. The two stacks never
interleave. The user always knows what Ctrl+Z will do by reading the undo tooltip.

### A9 — Template instantiation that overwrites an existing canvas (REJECT)
**Pattern:** Applying a template to an existing canvas in place, replacing its current content.
**Reason:** Live-play context means a DM may accidentally apply a template mid-session, destroying
their current layout. This is unrecoverable if undo is not available (e.g., after an app restart).
**DND Tools rule:** Template instantiation always creates a new canvas. It never replaces the
content of an existing canvas. A "Apply template to current canvas" function (if ever implemented)
requires an explicit destructive-action confirmation and must place the result in the undo stack.

### A10 — Pan inertia under `prefers-reduced-motion` (REJECT)
**Pattern:** Continuing to apply momentum-based pan deceleration for touch users even when they
have requested reduced motion.
**Reason:** Inertia scrolling/panning has been identified as a vestibular disorder trigger for some
users with `prefers-reduced-motion` preferences [5]. The WCAG 2.2 §2.3.3 (Animation from
Interactions) applies.
**DND Tools rule:** Pan inertia is completely disabled when `prefers-reduced-motion: reduce` is
active. Touch pan stops immediately on finger lift with no momentum continuation.

---

## 11. Success metrics

| Metric | Target | Measurement method |
|---|---|---|
| Widget placement time (DM, experienced) | ≤8 s from intent to placed widget | Lab usability study, 5 participants |
| Zoom-to-fit recovery time (lost-in-canvas) | ≤1 s (one keypress + animation) | Automated timing test |
| First-task success on empty canvas (first-run DM) | ≥80% place first widget without instruction | Moderated first-run study |
| Canvas frame rate, 50 widgets, active pan | ≥60 fps on reference device (mid-range tablet 2024) | CI performance profile |
| Canvas frame rate, 100 widgets, active pan | ≥30 fps (degraded but usable) | CI performance profile |
| Keyboard-only task completion (move + resize + bind) | 100% task completion by AT user | Keyboard-only usability study |
| Touch target validation | 0 failures on automated touch-target audit | Automated CI check |
| axe automated a11y scan (canvas) | 0 critical violations | CI axe-core scan |
| WCAG 2.2 AA (canvas surface) | Pass (manual + automated) | Pre-release a11y audit |
| Player-view preview entry/exit | ≤2 interactions (Shift+P or menu → exit Shift+P/Esc) | Interaction count test |
| Widget binding completion (mouse) | ≤5 interactions from intent to active binding | Usability study |
| Widget binding completion (keyboard) | ≤8 interactions from intent to active binding | Keyboard-only study |
| Undo of last action (keyboard) | ≤1 interaction (Ctrl+Z) | Automated |
| Empty-state callout dismissal on first widget | ≤200 ms after widget placed | Automated timing test |
| DM-only badge: passes grayscale test | 100% (icon + texture, not color alone) | Manual grayscale screenshot review |

---

## 12. Open questions and risks

1. **Canvas engine choice:** This document assumes the canvas is implemented with a custom WebGL/
   Canvas2D renderer (like Figma/tldraw), not a DOM-positioned-element approach. If a DOM-first
   approach is used, the virtualization and 60 fps targets may require different implementation
   strategies. This must be resolved before detailed canvas implementation begins.

2. **Widget coordinate system:** The document specifies CSS px coordinates, but the actual canvas
   coordinate space is zoom-scaled. The implementation must define the canonical unit (device-
   independent pixels at 100% zoom) and all requirements interpret "CSS px" in that unit.

3. **Multi-user concurrent canvas edits:** The undo model (§UX-CANVAS-012) specifies that remote
   operations are not in the local undo stack. The exact CRDT/OT strategy for reconciling concurrent
   widget moves is owned by the SYNC requirements. A risk exists if the sync model allows remote
   operations to conflict with in-progress local drags; a conflict resolution UI may be needed on
   the canvas.

4. **Mobile canvas utility:** The Mobile profile canvas (overview + focused widget modes) is a
   significant design departure from Desktop. The utility of the canvas overview on a <600 px screen
   is genuinely uncertain — a small user study should validate whether Mobile users actually use
   canvas overview or always default to focused widget panels before the Mobile canvas is fully
   designed.

5. **Widget rotation and binding:** Rotated widgets with visible binding anchors may have
   confusingly positioned anchors (rotated with the widget). The spec should clarify whether binding
   anchors are always axis-aligned (fixed to the widget's visual frame edge in screen space) or
   rotate with the widget. This is an open implementation question.

6. **Scene naming ("Scene" vs. alternatives):** The vision brief notes "A better name is still
   needed" for the canvas concept. If the product name changes before implementation, the UX
   copy (all references to "Scene" in labels, tooltips, empty states, and announcements) will need
   a global find-and-replace. This document uses "Scene" as the placeholder per the brief.

7. **Template thumbnail generation:** Auto-generating thumbnails from the current viewport requires
   a canvas-to-image export operation. This must be implemented without blocking the UI thread.
   If the canvas renderer is WebGL, an off-screen readPixels call is needed. This has known
   performance and timing complexity, especially with many widgets.

8. **Binding drag animation performance:** Drawing live bezier curves between widgets during the
   binding drag operation adds GPU load. If more than 5 bindings are displayed simultaneously (the
   "Show bindings" overlay), the render budget may be exceeded. A maximum number of simultaneously-
   rendered binding curves should be defined and enforced.

---

## Sources

[1] Figma — "Figma Help Center: Guide to prototyping, components, and canvas" — Figma, Inc. —
    https://help.figma.com/hc/en-us/articles/360040449893

[2] Miro — "Miro Help Center: Canvas navigation and minimap" — Miro B.V. —
    https://help.miro.com/hc/en-us/articles/360017730533

[3] tldraw — "tldraw developer documentation: zoom and viewport" — tldraw, Inc. —
    https://tldraw.dev/docs/editor

[4] Excalidraw — "Excalidraw documentation: gestures and snap guides" — Excalidraw contributors —
    https://docs.excalidraw.com

[5] Apple — "Human Interface Guidelines: Gestures, Touch Targets, and Animation" — Apple, Inc. —
    https://developer.apple.com/design/human-interface-guidelines/gestures

[6] Nielsen Norman Group — "Drag and Drop: How to Design for Direct Manipulation" and "WCAG 2.2
    Dragging Movements (SC 2.5.7)" — NN/g —
    https://www.nngroup.com/articles/drag-drop/

[7] FigJam — "FigJam Overview: sticky notes, chrome, and empty states" — Figma, Inc. —
    https://www.figma.com/figjam/

[8] Obsidian — "Obsidian Canvas: nodes, connections, and groups" — Obsidian.md —
    https://obsidian.md/canvas

[9] Apple — "Freeform User Guide: Layers and z-order" — Apple, Inc. —
    https://support.apple.com/en-us/111914

[10] Whimsical — "Whimsical connector anchors and diagrams" — Whimsical, Inc. —
     https://whimsical.com

[11] Google — "Material Design 3: Touch targets" — Google LLC —
     https://m3.material.io/foundations/accessible-design/accessibility-basics#28032e45-c598-450c-b355-f9fe737b1cd8

[12] W3C — "WCAG 2.2: Understanding Success Criterion 2.5.7 Dragging Movements" — W3C —
     https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html

[13] W3C — "WCAG 2.2: Understanding Success Criterion 2.5.1 Pointer Gestures" — W3C —
     https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html

[14] W3C — "WAI-ARIA Authoring Practices Guide: application role" — W3C —
     https://www.w3.org/WAI/ARIA/apg/patterns/
