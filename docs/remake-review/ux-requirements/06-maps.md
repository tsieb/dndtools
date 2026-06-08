# UX Requirements — Maps

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read `00-overview-and-principles.md`
> first — it defines the shared principles, the parameter rubric, the requirement-ID scheme, the
> platform profiles, and the design tokens this document builds on.
>
> **Status:** Draft v1
> **Functional requirement coverage:** `MAP-001..MAP-020`
> **Owner surface(s):** `/maps/*` routes; map widget embedded in `/session`, `/canvas/*`; layer
> panel, annotations panel, fog controls, POI popovers, authoring panel, generation UI, import
> wizard, nested-map breadcrumb, minimap overlay

---

## 1. Scope

- **Covers:** All map-related UI surfaces in DND Tools 0.2.0 — the full-screen map viewer
  (pan/zoom, nested-map transitions, minimap, breadcrumb), the layer system panel (named layers,
  visibility, opacity, reorder, group, tags/query), the map creation toolset (drawing/painting
  tools, tool palette, undo), the procedural generation UI (parameter controls, seed input,
  regenerate/preview/accept), the import wizard (preview, diagnostics, rollback), POI placement
  and popover/sheet interaction, fog-of-war brush controls with leak-proof DM/player separation,
  DM-only annotation authoring vs. player-visible overlay controls, and the map-as-widget embed
  pattern on a canvas.
- **Does NOT cover:** Canvas embedding protocol and widget data contracts (see
  `04-canvas-scene-widgets.md`); session state push to players (see `08-sessions-live-play.md`);
  graph traversal and search results UX (see `10-graph-search-discovery.md`); sync/offline state
  indicators beyond map-specific feedback (see `12-sync-offline-reliability.md`); accessibility
  baseline and keyboard model (see `03-accessibility.md`); visual tokens and motion system (see
  `01-visual-design-system.md`).
- **Related functional requirements:** `../requirements/03-maps.md`
  - `MAP-001` — Map entity creation (name, scale, projection, visibility, initial layers)
  - `MAP-002` — Image/SVG import with content-addressed storage; adapter model for external formats
  - `MAP-003` — Draw/paint map content with undo; async-safe before/after state capture
  - `MAP-004` — Procedural generation (terrain, settlements, dungeons) from explicit params + seed
  - `MAP-005` — Named layer CRUD: create, rename, reorder, duplicate, lock, delete; type/opacity/tags
  - `MAP-006` — Independent DM/player layer visibility and opacity toggles; no cross-layer bleed
  - `MAP-007` — Tag/query layers by metadata; hidden layers never enter player query results
  - `MAP-008` — Nest one map inside another; independent layers/permissions per map preserved
  - `MAP-009` — Smooth scroll-zoom transitions between nested maps; blocked for hidden children
  - `MAP-010` — POI placement, categorization, normalized-coordinate anchoring, note/object linking
  - `MAP-011` — POI visibility independent of layer; DM-only POIs never appear in player list/search
  - `MAP-012` — Fog-of-war reveal/conceal as durable commands; sync to players; queue when offline
  - `MAP-013` — Route drawing, distance measurement, travel-time computation, waypoint linking
  - `MAP-014` — Grid, token, range, AoE overlay modes with declared prerequisite gating
  - `MAP-015` — POI popover/sheet interaction safety (no premature dismiss on hover/scroll/focus)
  - `MAP-016` — Pre-projection consistency validation (layer/POI/route/token/nested coherence)
  - `MAP-017` — Nested map cycle prevention; deterministic coordinate transforms; broken-link state
  - `MAP-018` — All query surfaces (search, graph, widget, MCP, deep-link) use actor-filtered model
  - `MAP-019` — Combat token lifecycle, movement, AoE overlays, actor-filtered token projection
  - `MAP-020` — Import preview, capability summary, per-element diagnostics, rollback
- **Related UX docs:**
  - `01-visual-design-system.md` — design tokens consumed throughout (color, spacing, motion)
  - `03-accessibility.md` — canvas keyboard model; map alt-text strategy; live-region pattern
  - `04-canvas-scene-widgets.md` — map-as-widget embed contract on the canvas
  - `08-sessions-live-play.md` — player view delivery, fog reveal during live play

---

## 2. UX goals for this surface

Maps are a primary feature of DND Tools 0.2.0, used under live time pressure AND in careful
offline prep. The UX must serve both extremes: a DM revealing fog in combat at 11 PM with tired
players watching, and a solo DM spending an afternoon building a continent from scratch.

| Parameter | Goal for this surface |
|---|---|
| **Visual appeal** | Map surfaces feel like a premium cartographic tool — atmosphere and genre cues (parchment tones, ink-weight layer icons, fantasy typography for POI labels) without sacrificing legibility. The layer panel is calm and scannable. Tool palettes are compact and icon-first. Fog of war has a distinct visual treatment (revealed vs. concealed contrast, soft edge) that reads instantly even on a small screen. |
| **Information scent** | Layer type badges, visibility icons (eye / eye-slash), lock icons, and fog-operation labels provide immediate orientation. The breadcrumb/wayfinding bar names each nesting level so a user always knows where they are. Layer tags are surfaced as filterable chips, not invisible metadata. |
| **Navigability** | ≤ 2 gestures or keystrokes to reach any primary map view state (zoom-to-fit, toggle fog, open layer panel). The nested-map breadcrumb provides one-tap/click return to any ancestor. A minimap always shows current viewport position within the full map extent. Deep-link URLs reach a specific map + POI in one step (MAP-018). |
| **Intuition / learnability** | Empty states for a new map teach the first action (import an image or start drawing). Tool icons follow cartographic convention (brush, eraser, stamp, polygon for fog, pin for POI). First use of the fog brush shows a 3-second tooltip: "This area is hidden from players." Generation controls use plain-English labels (Terrain style, Settlement density, Seed) not internal enum names. |
| **Accessibility** | Every layer-panel control is keyboard-operable. The fog brush has a keyboard-draw mode (arrow keys with configurable brush size). POI popovers follow ARIA dialog/popover patterns with correct focus management. Map canvas exposes alt-text on named regions (see `03-accessibility.md` map alt-text strategy). Fog reveal changes announce to screen readers via a live region. |
| **Adaptability (platform profiles)** | Desktop: full authoring — all tools, full layer panel, keyboard shortcuts throughout. Tablet (landscape): split-view with map left, layer/fog panel right; drawing with Apple Pencil / stylus. Tablet (portrait): map full-screen, panel as a pull-up sheet. Mobile: view + fog-reveal brush + POI tap — no drawing tools; layer panel as a bottom drawer; minimap collapsed to a corner button. |
| **Effective emphasis (visual hierarchy)** | Active tool is visually distinct (filled icon, accent border). Current fog-reveal operation has the highest visual weight on the DM view. DM-only annotations are styled with a hatching pattern that is immediately distinguishable from player-visible content. One primary action per panel region (Add Layer, Reveal Area, Add POI, Generate, Import). |
| **Feedback & responsiveness** | Fog reveal renders on the DM view within 100 ms of pointer release; player view update acknowledged within 1 s (or queued-offline indicator shown). Paint strokes appear immediately as the pointer moves (optimistic local render). Layer opacity changes apply in real time (no commit step). Generation shows a determinate progress indicator (not spinner) labelled with the current phase (e.g., "Placing settlements…"). |
| **Error prevention & recovery** | Undo available for every paint stroke, fog operation, and POI move. Destructive layer deletion requires confirmation. Import requires preview + explicit commit — no partial writes. Pre-projection consistency check (MAP-016) blocks delivery with a clear conflict list. Fog reveal defaults to DM-view-only until explicitly projected. |
| **Consistency** | Layer row anatomy is identical across all map types. FOW brush controls reuse the same slider/button pattern as opacity. POI popovers reuse the shared dialog component from `01-visual-design-system.md`. Generation parameter sliders reuse the same range input component with identical step/label conventions. |

---

## 3. Researched best practices

### 3.1 Pan/zoom and smooth transitions

Mapbox GL JS achieves 60 fps tile-layer compositing at zoom levels 0–22 on mobile hardware by
uploading tiles to GPU textures and compositing them in WebGL [1]. The key UX takeaway: zoom
transitions must be animated (ease-in-out, ~300 ms) to preserve spatial context — abrupt cuts
disorient users. **Implication:** Nested-map transitions must animate the viewport (scale +
translate) over 250–350 ms, not cut; use `prefers-reduced-motion` to replace with a cross-fade.

Google Maps uses a continuous logarithmic zoom model [2]: the user always sees *where* they are
going during zoom, never a blank frame. **Implication:** Nested-map enter/exit must keep at least
the parent map visible (at reduced opacity or scaled behind the child) during the transition, so
the user understands spatial hierarchy.

OpenSeadragon (open-source deep-zoom viewer) documents that a minimap with ≥ 15–20% of the main
viewport provides sufficient spatial context for large images without obscuring content [3].
**Implication:** The minimap should be ~15% viewport width (min 120 px, max 200 px), collapsible
on mobile.

### 3.2 Layer panel UX

Photoshop's Layers panel [4] established the canonical row anatomy: drag-handle · thumbnail ·
name (editable inline) · visibility toggle (eye) · lock indicator. Each row is ~32 px tall in
compact mode. Users expect drag-to-reorder as the primary reorder gesture. **Implication:** The
map layer panel row must include a drag handle, eye icon, lock icon, and inline name edit;
reorder via drag AND up/down buttons (WCAG 2.2 SC 2.5.7).

Figma's layer panel [5] adds collapse groups, search-filter, and type badges. Tag-based
filtering (comparable to the query system in MAP-007) is surfaced as chip filters above the list.
**Implication:** Layer type badges (heightmap, roads, fog, POI, annotations, player overlay)
should appear as small colored chips on each row; a filter bar at the top of the layer panel
allows narrowing by tag.

### 3.3 VTT fog of war and scene controls

Foundry VTT [6] uses a scene toolbar with tools grouped by category: select, measure, draw walls,
fog-of-war, notes, tokens. The fog tool has sub-options: polygon reveal, rectangle reveal, brush
reveal, and reset. Brush size is set via a slider in the tool options bar (range 5–500 px). The
key pattern: **tool options appear contextually below or beside the active tool icon**, not in a
separate panel. **Implication:** When the fog brush is active, a compact options strip (brush
size slider, feather toggle, reveal vs. conceal toggle) appears directly below the toolbar.

Roll20 [7] separates the "Fog of War" layer from the map layer, making it explicit that fog is a
separate data layer. Reveal operations are always undoable, and the DM can "Reveal All" or "Hide
All" in one click. **Implication:** Provide "Reveal All" and "Reset Fog" as preset buttons in the
fog controls section (with confirmation on "Reset Fog").

Owlbear Rodeo [8] achieves a minimal VTT UX by keeping the toolbar to ≤ 8 icons at all times,
using a right-click context menu for secondary actions, and collapsing secondary tool options into
a floating panel anchored to the active tool. **Implication:** The map toolbar must have ≤ 8
visible icons; secondary tools (route, AoE, grid align) live in a "More" overflow.

### 3.4 Map creation and procedural generation

Dungeondraft [9] uses a side toolbar with tool categories (terrain, paths, objects, text, regions,
lights) and a properties panel that changes to show options for the active tool. Brush sizes are
specified in "room units" not pixels, so the scale is consistent regardless of zoom.
**Implication:** Brush size for drawing tools should be expressed in map-space units (the map's
configured scale unit), not pixels, and should display the real-world equivalent (e.g.,
"5 ft — 1 square").

Azgaar's Fantasy Map Generator [10] allows generating a continent with ≥ 50 configurable
parameters but shows only 6–8 on the initial panel (seed, map type, number of states, biomes,
rivers, coastline). Advanced parameters live behind "Advanced settings." **Implication:** The
generation UI exposes ≤ 8 parameters by default; "Advanced settings" reveals the full set.

Wonderdraft [11] surfaces seed input as a plain text field with a randomize-dice button beside it,
making the concept of deterministic reproducibility immediately learnable without explanation.
**Implication:** The seed input always shows a dice/shuffle button to randomize the seed with one
click/tap.

Dungeon Scrawl [12] demonstrates that browser-based dungeon drawing can feel tactile with a
minimal toolbar (pen, eraser, select, fill, stamp) and a canvas-first layout where the tool
options float contextually near the cursor. **Implication:** Drawing tool options (brush size,
color/terrain type) should float contextually at the edge of the canvas, not in a fixed sidebar.

### 3.5 POI interaction and deep-linking

Google Maps deep-links to a place via a URL containing lat/lng and place ID [2]. The pattern is
that a POI tap opens a bottom sheet (mobile) or a panel (desktop) with the place's details; the
map remains visible and the POI is highlighted. **Implication:** POI deep-links must resolve to
the correct map viewport + highlighted POI marker without requiring the user to navigate.

Mapbox GL [1] documents popover interaction: a popover triggered by a marker click must not close
when the pointer moves from the marker into the popover (since the pointer must cross a gap).
This matches MAP-015 exactly. **Implication:** The "hover gap" pattern — where any pointer
movement inside the popover is treated as `inside: true` — must be enforced at the core level,
matching the `controlInteractionReducer` already implemented.

### 3.6 Accessibility on map canvases

WAI-ARIA APG does not have a specific map pattern, but the Carousel and Toolbar patterns [13]
cover the tool palette; the Dialog pattern covers POI popovers; the Combobox pattern covers layer
tag search. WCAG 2.2 SC 2.5.3 requires touch targets ≥ 44 × 44 CSS px. SC 2.1.1 requires all
functionality to be operable by keyboard. SC 4.1.3 requires status messages (fog reveal synced,
layer locked) to be announced to assistive technology via a live region.
**Implication:** Every map tool, layer row action, and fog control must be keyboard-accessible;
fog operation sync results must be announced via an `aria-live="polite"` region.

---

## 4. Reference implementations (exemplars)

| Product | What they do well (specific) | Principle / why it works | Borrow / Avoid | Link |
|---|---|---|---|---|
| **Foundry VTT** | Scene control toolbar (≤8 icons), contextual tool options strip, fog polygon/brush/rectangle tools, undoable fog operations, scene-layer separation | Tool context strips prevent panel overload; separation of fog as an explicit data layer prevents accidental reveal | Borrow: toolbar layout, fog layer separation, undo model. Avoid: the dense control panel that requires VTT expertise to parse | https://foundryvtt.com/article/scene-controls/ |
| **Azgaar's Fantasy Map Generator** | Progressive disclosure of generation params (6 on default, 50+ in advanced), seed + randomize button, live preview during generation | Progressive disclosure keeps novice path clean; live preview removes fear of commit | Borrow: ≤8 primary params, randomize-dice button, live preview. Avoid: overloading the default view with raw numeric parameters | https://azgaar.github.io/Fantasy-Map-Generator/ |
| **Mapbox GL JS / Google Maps** | Continuous logarithmic zoom, animated transitions that preserve spatial context, minimap, POI bottom sheet (mobile) / side panel (desktop) | Animated zoom preserves spatial orientation (prevents "where am I?"); POI sheet keeps map visible | Borrow: animated zoom transitions, spatial context preservation, platform-appropriate POI surface. Avoid: Google Maps' cramped desktop POI panel with too many actions at equal hierarchy | https://docs.mapbox.com/mapbox-gl-js/api/ |
| **Photoshop / Figma layers panel** | Row anatomy (drag handle, thumbnail, name, eye, lock), drag-to-reorder, group collapse, search/filter, type badges | Established user mental model for layers; group collapse manages complexity | Borrow: row anatomy, drag-to-reorder + button fallback, type badges as chips, filter bar. Avoid: Photoshop's undiscoverable right-click-only actions | https://helpx.adobe.com/photoshop/using/layer-basics.html and https://help.figma.com/hc/en-us/articles/360039831974 |
| **Owlbear Rodeo** | ≤8 toolbar icons, right-click context for secondary, no modal tool dialogs, mobile-first touch target sizing | Minimal toolbar reduces cognitive load under time pressure (live play) | Borrow: ≤8 icon constraint, right-click/long-press context, 44px targets. Avoid: hiding too much — Owlbear sometimes makes fog tools too hard to find | https://owlbear.rodeo |
| **Dungeondraft** | Side toolbar by category, properties panel changes per active tool, brush size in map units | Map-unit brush sizing is the correct abstraction for RPG maps | Borrow: tool categories, contextual properties panel, map-unit sizing. Avoid: desktop-only assumptions (no touch support) | https://dungeondraft.net |

**North-star narratives:**

1. **Foundry VTT's scene toolbar is the gold standard for live-play tool density.** The ≤8-icon
   toolbar with contextual tool options strips eliminates panel switching under time pressure. DND
   Tools must adopt this exact pattern: one active tool at a time, with its options appearing in a
   compact strip immediately below the active icon — no modal dialogs.

2. **Mapbox GL's animated zoom transition preserves spatial orientation.** The single most
   important lesson from digital cartography: never cut the camera. Every nested-map zoom must
   animate. When a player zooms into a region, they must see the parent map shrink as the child
   fills the viewport — this builds the mental model of "I am in the northern region, which is in
   the continent." This spatial narrative is what makes nested maps actually usable.

3. **Azgaar's progressive-disclosure generation UI is the right model for procedural generation.**
   6 parameters visible, 50+ available. The randomize-dice button makes seeds learnable in 5
   seconds without documentation. DND Tools must copy this pattern exactly: ≤8 primary sliders
   with plain-English labels, a dice button, and a collapsed "Advanced" section for the full
   parameter set.

---

## 5. UX/UI requirements

### UX-MAP-001 — Map viewer pan and zoom

- **Requirement:** The map viewer must support continuous pan and scroll-zoom with smooth animated
  transitions, centered on the pointer/pinch point, at any zoom level the map supports.
- **Rationale:** Continuous zoom preserves spatial context (see §3.1 [1][2]); abrupt cuts
  disorient users navigating large maps under time pressure.
- **Spec:**
  - Pan: pointer drag (left-button or two-finger scroll) or arrow keys (16 px per step at 1× zoom;
    accelerates with repeat: 16 → 32 → 64 px per step after 3 repeats).
  - Zoom: scroll wheel (logarithmic factor 1.2 per notch), pinch gesture (continuous), `+`/`−`
    keyboard (factor 1.4 per press), or the zoom-to-fit button.
  - Zoom transition duration: 200 ms ease-out for keyboard/button; continuous for pointer scroll
    and pinch. `prefers-reduced-motion`: cross-fade at 0.2 opacity blend over 100 ms.
  - Minimum zoom: enough to see the entire map extent. Maximum zoom: 16× native resolution.
  - Scroll-to-zoom must center exactly on pointer/pinch point (not map center).
  - A "Zoom to fit" button (icon: frame arrows, tooltip: "Fit map to window") always visible in
    the toolbar; keyboard shortcut `0` (zero).
- **States:** default · panning (cursor: grab) · zooming (no cursor change, viewport animates)
- **Platform profiles:**
  - Desktop: scroll wheel + keyboard + drag. Trackpad: pinch natively.
  - Tablet: two-finger pinch + drag. One-finger drag pans.
  - Mobile: same as tablet. No keyboard. Zoom buttons (+/−) visible in toolbar as ≥44×44 px
    targets because scroll wheel unavailable.
- **Input:** Pointer: scroll wheel + left-drag. Touch: pinch + one-finger drag. Keyboard: arrows
  (pan), `+`/`−` (zoom), `0` (fit).
- **Accessibility:** `aria-label="Map viewport"` on the canvas container. Arrow key pan announced
  via a live region (debounced 500 ms): "Panned [direction]." Zoom level announced on keyboard
  zoom: "Zoom [N]×." Focus ring visible on the canvas container when keyboard-focused.
- **Acceptance criteria:**
  - Given the map is loaded, when the user scrolls the wheel, then the map zooms centered on the
    pointer position within one animation frame (≤16 ms initial response).
  - Given `prefers-reduced-motion` is set, when a zoom occurs, then no scale animation plays;
    instead a cross-fade at ≤100 ms is used.
  - Given the map is at minimum zoom, when the user zooms out further, then zoom stops and no
    blank space appears outside the map extent.
  - Given focus is on the canvas, when the user presses arrow keys, then the viewport pans and a
    live-region announces direction.
- **Priority:** Must-have

---

### UX-MAP-002 — Nested-map zoom transition and wayfinding breadcrumb

- **Requirement:** When the user zooms past the configured threshold into a nested map, the
  viewport must animate from parent to child with spatial continuity; a breadcrumb bar must always
  show the full nesting path and allow one-tap/click return to any ancestor.
- **Rationale:** Spatial continuity during nesting prevents "where am I?" disorientation (§3.1
  [1][2]). The breadcrumb addresses MAP-009 and MAP-017 — users need explicit wayfinding across
  nesting levels.
- **Spec:**
  - Transition into child: animate scale (parent shrinks to 0.6×, child expands from 0.6× to 1×)
    over 300 ms ease-in-out, with parent map fading to 0 opacity at 200 ms. Net effect: the child
    "grows out of" the parent's region.
  - Transition out (zoom out past threshold): reverse animation, same timing.
  - `prefers-reduced-motion`: replace animation with an instant cross-fade (100 ms, opacity only).
  - Breadcrumb: fixed bar at the top of the map viewer, height 32 px, showing the ancestor chain
    as `World › Northern Region › Silverdale › Inn (Ground Floor)`. Each level is a clickable link
    (tap target ≥44×44 px on mobile, where overflow condenses to `… › Inn (Ground Floor)` with a
    back button). Separator is `›` (U+203A).
  - If the child map is unavailable to the actor, the transition is blocked; the unavailable area
    shows a placeholder (no name leaked — MAP-017 AC3). Breadcrumb entry for the unavailable child
    is absent.
  - Threshold zoom level for transition: configurable per embed (default: child occupies ≥40% of
    the viewport). An "Enter [Name]" affordance appears when the threshold is ≈80% reached.
- **States:** parent-active · transitioning-into-child · child-active · transitioning-to-parent ·
  child-unavailable (placeholder shown, transition blocked)
- **Platform profiles:**
  - Desktop: breadcrumb always visible. "Enter" affordance appears as a tooltip on the nested area.
  - Tablet: breadcrumb always visible; truncated if >4 levels (back chevron + last label).
  - Mobile: breadcrumb shows back button + current-level name only. Tap back to reveal full path
    as a dropdown sheet.
- **Input:** Pointer: zoom past threshold triggers transition. Click breadcrumb crumb to navigate.
  Keyboard: `Enter` on a nested area's region button enters child map. `Escape` or `Alt+ArrowLeft`
  returns to parent. Touch: pinch past threshold triggers transition.
- **Accessibility:** Breadcrumb is a `<nav aria-label="Map nesting">` containing an ordered list.
  Current level has `aria-current="page"`. Transition announced: "Entered [Name]" or "Returned to
  [Name]" via `aria-live="polite"`. If child unavailable: announced as "Area unavailable."
- **Acceptance criteria:**
  - Given a visible nested map, when the user zooms to 40% viewport fill, then an "Enter [Name]"
    affordance appears on the nested area.
  - Given the user triggers transition, when the transition plays, then the viewport animates from
    parent to child in ≤350 ms (including the 300 ms ease).
  - Given the child map has DM-only layers, when a player triggers the transition, then the child
    map renders only player-visible layers and DM-only content is absent.
  - Given `prefers-reduced-motion` is active, when the transition triggers, then no scale animation
    plays; a cross-fade occurs in ≤100 ms.
  - Given the user is at nesting level 3, when they click a breadcrumb level 1 crumb, then the
    viewport returns to the ancestor map in one step.
- **Priority:** Must-have (transition animation: Should-have if GPU compositing is unavailable)

---

### UX-MAP-003 — Minimap overlay

- **Requirement:** A minimap must show the current viewport's position within the full map extent
  at all times, and allow clicking/tapping the minimap to jump the viewport to that location.
- **Rationale:** Minimap provides spatial context on large maps (§3.1 [3]) — essential for
  session-play fog-reveal operations where the DM must navigate quickly.
- **Spec:**
  - Position: bottom-right corner of the map viewport. Size: 15% viewport width, min 120 px,
    max 200 px, height proportional to map aspect ratio.
  - Shows: the full map at low resolution (no layer-by-layer compositing — the base layer
    thumbnail only). A rectangle overlay shows the current viewport. DM view shows fog-revealed
    areas; player view shows only the revealed portion.
  - Click/tap on the minimap centers the viewport on that map coordinate (animated pan, 200 ms
    ease-out).
  - A collapse toggle (chevron, 24×24 px, ≥44×44 px touch target including padding) collapses the
    minimap to a 28×28 px button showing only the globe icon. State persists per user per map.
  - On mobile: minimap collapsed by default; tap globe button to expand temporarily (3 s auto-
    collapse).
- **States:** expanded · collapsed · loading (skeleton rectangle)
- **Platform profiles:**
  - Desktop: always expanded by default.
  - Tablet: expanded by default in landscape; collapsed by default in portrait.
  - Mobile: collapsed by default; tap to expand.
- **Input:** Pointer: click minimap to jump. Drag the viewport rectangle on the minimap to pan.
  Keyboard: `M` toggles minimap; when minimap is focused, arrow keys move the viewport rectangle
  (pan), `Enter` jumps viewport to minimap center.
- **Accessibility:** `role="img" aria-label="Minimap — current viewport highlighted"`. The
  collapse button: `aria-label="Collapse minimap"` / `"Expand minimap"`. Minimap is not a
  required navigation surface — all navigation must be achievable without it.
- **Acceptance criteria:**
  - Given the map is loaded, when the user pans the main viewport, then the minimap viewport
    rectangle updates within 100 ms.
  - Given the user clicks the minimap, when the click position is valid, then the main viewport
    animates to center on that map coordinate within 200 ms.
  - Given mobile profile, when the map loads, then the minimap is collapsed and only a globe icon
    button is visible.
- **Priority:** Should-have

---

### UX-MAP-004 — Layer panel layout and row anatomy

- **Requirement:** The layer panel must display named layers as rows with a consistent anatomy
  (drag handle, type badge, visibility toggle, name, opacity, lock, actions menu), support
  drag-to-reorder with a button fallback, and filter layers by tag via a filter bar.
- **Rationale:** The Photoshop/Figma layer panel row anatomy (§3.2 [4][5]) is the established
  mental model for layer management; deviation without payoff increases the learning tax.
- **Spec:**
  - Panel: fixed width 280 px on desktop (min 240 px, max 360 px — user-resizable); right
    sidebar. On tablet (landscape): 260 px right sidebar. On portrait tablet / mobile: bottom
    drawer (48% viewport height collapsed, 80% expanded).
  - Filter bar: at the top of the panel, a row of tag chips (layer type + any user tags). A chip
    toggles a filter; active chips have `--color-accent` background. A "Clear filters" button
    appears when any chip is active.
  - Layer list: scrollable. Rows in render order (top of list = top of render stack). Each row:
    - **Drag handle** (≥20×44 px, `cursor: grab`, `aria-hidden="true"` — reorder via buttons is
      the accessible path).
    - **Type badge chip**: 12 px label in a pill shape, colored by layer type (see §6 table).
    - **Eye icon button** (20×20 icon, 44×44 px target): toggles DM display on/off. Filled eye =
      visible; slashed eye = hidden. `aria-label="[Layer name]: DM display [on/off]"`.
    - **Player-visible indicator**: a person icon (12×12 px) with a slash when `dm-only`. Tapping
      opens the visibility dropdown (dm-only / player-visible / shared).
    - **Layer name**: editable inline on double-click/Enter. Truncated with ellipsis at 120 px max.
    - **Opacity readout**: "75%" in 10 px muted text; click opens a small popover with a slider
      (0–100%, step 5%).
    - **Lock icon button** (18×18 icon, 44×44 px target): toggles lock. Locked rows dim to 50%
      opacity and all action controls are disabled.
    - **Actions overflow button** ("⋮", 44×44 px): dropdown menu with Rename, Duplicate, Move to
      Group, Add Tag, Delete.
  - Reorder: drag-and-drop (HTML Drag and Drop API or pointer-event equivalent). Keyboard
    fallback: focus on layer row, then `Alt+ArrowUp`/`Alt+ArrowDown` moves it one position.
  - "Add layer" button: bottom of the list, always visible. Click opens a compact creation form
    inline (name field + type picker + initial visibility selector + Save/Cancel).
  - The DM-only authoring controls (add, reorder, opacity, lock, delete) are entirely absent for
    player/observer actors — the panel renders the actor-filtered layer list with no controls.
- **States:** default · drag-active (row has lift shadow, drop targets show insertion line) ·
  editing-name (name field shown inline) · locked (row dimmed, controls disabled) · filter-active
  (non-matching rows dimmed to 40%) · loading (skeleton rows) · empty (empty state: "No layers
  visible to you" for players; "Add your first layer" for DM)
- **Platform profiles:**
  - Desktop: full row anatomy. Hover reveals drag handle and action overflow.
  - Tablet: same anatomy; drag-handle always visible (touch drag); actions overflow tap-accessible.
  - Mobile: bottom drawer panel. Simplified row: type badge + eye toggle + name + "⋮" only.
    Opacity set in the "⋮" action sheet.
- **Input:** Pointer: drag handle drag to reorder; click eye/lock/actions. Touch: touch-drag handle
  to reorder. Keyboard: `Tab` between rows; `Space`/`Enter` activates eye/lock; `Alt+Up/Down`
  reorders; `Enter` on name to edit; `Escape` cancels edit.
- **Accessibility:** Layer list is a `<ul role="listbox">` or an ordered `<ul>` with each `<li>`
  carrying `aria-label="[Layer name], type: [type], [visibility], [locked/unlocked]"`. Reorder
  announced: "[Layer name] moved to position [N] of [total]." Opacity change: "[Layer name]
  opacity [N]%."
- **Acceptance criteria:**
  - Given three layers, when the DM drags layer C above layer A, then the layer list reorders
    immediately and an aria announcement confirms the new position.
  - Given `Alt+ArrowUp` is pressed on a focused layer row, when the row is not already at
    position 1, then the row moves up one position and focus remains on the row.
  - Given a player opens the layer panel, when the panel renders, then no add/delete/reorder
    controls are visible and only player-visible layers appear.
  - Given a filter chip for "fog" is active, when the layer list renders, then only fog-type layers
    are at full opacity; others are dimmed.
- **Priority:** Must-have

---

### UX-MAP-005 — Layer type system and visibility badge matrix

- **Requirement:** Each layer type must have a distinct icon, badge color, and visibility-badge
  combination that allows the DM to scan the layer list and understand all layers' types and
  audiences in under 3 seconds.
- **Rationale:** Effective emphasis (§2 rubric) — layers must be distinguishable by type and
  visibility at a glance, especially when managing large maps with 10+ layers.
- **Spec:** Layer type visual identifiers:

  | Layer type | Badge label | Badge color (token) | Icon |
  |---|---|---|---|
  | base | BASE | `--layer-base` (warm grey) | mountain |
  | heightmap | HEIGHT | `--layer-height` (green tint) | topography lines |
  | political | POLI | `--layer-political` (amber) | flag |
  | climate | CLIMATE | `--layer-climate` (teal) | cloud-sun |
  | roads/transport | ROADS | `--layer-roads` (orange) | road |
  | waterways | WATER | `--layer-water` (blue) | waves |
  | watersheds | WSHED | `--layer-wshed` (blue-green) | droplet |
  | fog-of-war | FOG | `--layer-fog` (charcoal) | cloud-fog |
  | POIs | POI | `--layer-poi` (red) | map-pin |
  | DM annotations | DM ONLY | `--layer-dm` (purple) | eye-lock |
  | player overlay | PLAYER | `--layer-player` (gold) | users |
  | combat overlay | COMBAT | `--layer-combat` (red-orange) | swords |
  | custom/user | tag label | `--layer-custom` (light grey) | tag |

  Visibility icons (appear after type badge in the row):
  - `dm-only`: a purple eye-lock icon (16×16 px). Tooltip: "DM only — players cannot see this."
  - `player-visible`: a gold users icon (16×16 px). Tooltip: "Visible to players."
  - `shared`: a teal share icon (16×16 px). Tooltip: "Shared with all participants."

  DM annotations layer rows have a hatching pattern on their left border (4 px wide,
  `--layer-dm` color with 45° diagonal lines) to distinguish them at a glance even in grayscale.

- **States:** Standard row states apply (see UX-MAP-004). Visibility icon changes on toggle.
- **Platform profiles:** All profiles use the same badge anatomy. On mobile, badge labels are
  truncated to 3 chars to fit the narrower row.
- **Input:** Visibility badge click opens a 3-option dropdown (dm-only / player-visible / shared).
- **Accessibility:** Badge chips carry `aria-label="Layer type: [type name]"`. Visibility icons
  carry `aria-label="Visibility: [dm-only/player-visible/shared]"`.
- **Acceptance criteria:**
  - Given a fog-of-war layer, when the layer panel renders, then the row shows a charcoal "FOG"
    badge and a cloud-fog icon within 100 ms.
  - Given a DM-annotations layer, when the panel renders in grayscale simulation, then the
    hatching border is still visible and distinguishes the row from other layer types.
- **Priority:** Must-have

---

### UX-MAP-006 — Map creation form (MAP-001)

- **Requirement:** The DM must be able to create a new map entity through a focused form with
  name, scale, projection, and default visibility, with sensible defaults and inline validation.
- **Rationale:** MAP-001 — the creation form is the DM's entry point into the map surface; a poor
  first impression undermines learnability.
- **Spec:**
  - Trigger: "New map" button in the maps navigation (icon: plus-circle, label visible). Opens a
    dialog (desktop/tablet) or a full-screen sheet (mobile).
  - Fields (in order):
    1. **Name** (required, text input, `placeholder="e.g. Sunless Citadel"`, autofocus on open).
    2. **Scale** (optional): two inline fields — units-per-map (number, `placeholder="120"`) and
       unit label (text, `placeholder="miles"`). A "?" icon button explains: "Used for distance
       measurement and travel time."
    3. **Projection** (select, default: Flat): Flat / Equirectangular / Web Mercator.
    4. **Default visibility** (select, default: DM only): DM only / Player visible / Shared.
       Adjacent hint text: "New maps default to DM only — safe to share when ready."
  - Submit: "Create map" primary button. Disabled when Name is empty.
  - Defaults: visibility defaults to `dm-only` if left unspecified (fail-closed, MAP-001 AC2).
  - On success: dialog closes; the new map opens in the viewer with its first (empty base) layer.
  - On error: inline error below the field that failed; focus moved to the error field.
- **States:** empty · valid · submitting (button spinner, fields disabled) · error
- **Platform profiles:**
  - Desktop/Tablet: modal dialog, max-width 480 px.
  - Mobile: full-screen sheet from bottom; keyboard pushes form up.
- **Input:** Keyboard: `Tab` through fields; `Enter` submits when all required fields valid;
  `Escape` cancels. No pointer-specific behavior required.
- **Accessibility:** Dialog role `dialog` with `aria-labelledby` pointing to "Create a new map"
  heading. Focus trapped in dialog. On error, `aria-describedby` links field to error message.
  Dismissed: focus returns to the "New map" trigger.
- **Acceptance criteria:**
  - Given the DM opens "New map" without filling the name, when they attempt to submit, then the
    submit button remains disabled (or form validation prevents submission) and the name field
    shows an error.
  - Given the form is submitted without specifying visibility, when the map is created, then its
    default visibility is `dm-only`.
  - Given the form submits successfully, when the dialog closes, then the new empty map opens in
    the viewer.
- **Priority:** Must-have

---

### UX-MAP-007 — Map drawing and painting tool palette (MAP-003)

- **Requirement:** The map editor must present a compact tool palette with categorized drawing
  tools, a contextual options strip for the active tool, and a visible undo control. Tool options
  must express brush size in map-space units.
- **Rationale:** Foundry VTT's ≤8-icon toolbar with contextual options strip is the gold standard
  for live-play tool density (§3.3 [6]); map-unit brush sizing is the correct abstraction for RPG
  maps (§3.4 [9]).
- **Spec:**
  - **Tool palette bar:** vertical strip on the left edge of the map editor canvas, width 48 px.
    Contains (top to bottom):
    1. **Select** (pointer icon) — select/move features
    2. **Brush/Terrain paint** (paintbrush icon) — freehand terrain painting
    3. **Stamp** (stamp icon) — place terrain stamps (trees, mountains, etc.)
    4. **Shape** (polygon icon) — draw filled/stroked polygons
    5. **Eraser** (eraser icon) — remove features
    6. **Text** (T icon) — place map labels
    7. **Fill** (paint-bucket icon) — flood-fill a region
    8. **More** ("⋮" icon, overflow) — reveals route drawing, AoE template, grid align, etc.
  - Each tool button: 44×44 px, icon 20×20 px, `aria-pressed` true when active. Active tool:
    filled background `--color-accent`, icon `--color-on-accent`.
  - **Contextual tool options strip:** appears below the tool palette bar (or to its right on
    desktop when space allows), shows options for the active tool only. For the brush tool:
    - Brush size: slider (min 0.5, max 50, step 0.5, in map scale units; label shows real-world
      equivalent, e.g., "2 ft"). Slider width 160 px. Keyboard: `[`/`]` decrements/increments by
      1 step.
    - Terrain type: segmented control or icon picker showing terrain categories (water, grass,
      forest, stone, sand, etc.) — at most 8 visible with overflow.
    - Feather edge toggle (checkbox, default off).
  - **Undo button:** immediately above or below the tool palette bar. Icon: undo arrow. Keyboard:
    `Ctrl+Z` / `Cmd+Z`. Disabled when no undo history. `aria-label="Undo last paint stroke"`.
  - **Redo button:** adjacent to undo. `Ctrl+Shift+Z` / `Cmd+Shift+Z`.
  - Every paint stroke is committed immediately to the processing core with before/after state
    capture (MAP-003). The UI updates optimistically (the stroke appears immediately); if the
    command fails, the stroke is rolled back and a toast error shows: "Stroke could not be saved.
    Undo available."
- **States:** tool-inactive · tool-active · stroke-in-progress (cursor: crosshair) · undo-
  available · undo-unavailable · command-pending (tool buttons disabled)
- **Platform profiles:**
  - Desktop: vertical tool palette on left. Options strip below/right. Keyboard shortcuts active.
  - Tablet: vertical tool palette on left edge, 56 px wide (larger touch targets). Options strip
    appears as a floating pill anchored above the active tool icon.
  - Mobile: tool palette is a horizontal strip at the bottom, below the map. Only brush, eraser,
    and undo are shown (drawing is limited on mobile — map editing is a "slim" surface). "More"
    opens a sheet with all tools.
- **Input:** Pointer: click tool to select; drag on canvas to draw. Touch: tap tool; touch-draw
  on canvas; pinch still pans (two-finger). Pen: recognized as pointer; pressure-sensitivity
  mapped to opacity if available. Keyboard: `B` brush, `E` eraser, `S` select, `[`/`]` brush
  size, `Ctrl+Z` undo, `Ctrl+Y` redo.
- **Accessibility:** Tool palette is a `<toolbar role="toolbar" aria-label="Drawing tools">`.
  Each tool button: `aria-pressed`, `aria-label="[Tool name]"`. Brush size slider:
  `aria-label="Brush size in [unit]" aria-valuemin aria-valuemax aria-valuenow aria-valuetext`.
  After an undo: live-region announces "Undo applied. Last stroke removed."
- **Acceptance criteria:**
  - Given the brush tool is active, when the options strip renders, then a brush-size slider and
    terrain type picker are visible and no other tool's options are shown.
  - Given the DM paints a stroke, when the stroke commits, then `Ctrl+Z` is enabled and pressing
    it removes the stroke exactly (MAP-003 undo contract).
  - Given a stroke command fails, when the failure returns, then the stroke is rolled back
    visually and a toast error appears within 500 ms.
  - Given mobile profile, when the map editor opens, then only brush, eraser, and undo tools are
    visible in the bottom strip without scrolling.
- **Priority:** Must-have (full palette: Should-have; mobile slim: Must-have)

---

### UX-MAP-008 — Procedural generation UI (MAP-004)

- **Requirement:** The procedural generation panel must expose ≤8 primary parameters with a seed
  field and randomize button, a live preview, and an explicit Accept/Discard flow. Advanced
  parameters must be accessible behind a disclosure.
- **Rationale:** Azgaar's progressive-disclosure model (§3.4 [10]) and Wonderdraft's
  seed+dice button (§3.4 [11]) are proven UX patterns for making procedural generation learnable
  without documentation.
- **Spec:**
  - **Entry point:** "Generate" button in the map authoring panel (icon: magic-wand or dice).
    Opens a generation sheet (desktop: right drawer 320 px; mobile: bottom sheet).
  - **Primary parameters (always visible, max 8):**
    1. **Generation type** (segmented control): Terrain / Settlement / Dungeon.
    2. **Seed** (text input, `placeholder="e.g. crypt-1"`). Adjacent button: dice icon, randomizes
       seed in one click/tap. `aria-label="Randomize seed"`.
    3. **Size** (slider: Small / Medium / Large / Huge — 4 stops with labels).
    4. **Density** (slider: 0–100%, step 5%, label "Feature density"). For dungeon: "Room density."
    5. **Terrain style** / **Settlement type** / **Dungeon style** (select, context-sensitive label).
    6. **Water coverage** (slider: 0–100%, only shown for Terrain type).
    7. **Elevation profile** (select: Flat / Rolling / Mountainous — only for Terrain).
    8. **Hazard density** (slider: 0–100%, only for Dungeon; "Trap & hazard density").
  - **Advanced settings** collapsible (chevron + "Advanced settings" label): exposes full
    parameter set (biomes, political boundaries, river count, road density, etc.).
  - **Preview pane:** 240×240 px thumbnail that regenerates on parameter change (debounced
    400 ms). Shows a low-resolution preview of the generated result with a "Generating…" overlay
    when pending. `aria-label="Generation preview"`.
  - **Progress indicator:** when generation runs (deterministic, may take >500 ms), shows a
    determinate progress bar (not an indeterminate spinner) labelled with the current phase:
    "Generating heightmap…", "Placing settlements…", "Drawing roads…". Each phase is estimated
    as a fraction of total time.
  - **Accept / Discard:** "Accept and add to map" (primary button) saves the generated layers as
    editable map layers. "Discard" closes without writing. No partial state is committed until
    Accept.
  - **Determinism contract (MAP-004):** the same seed + parameters always produce identical
    output. The seed field shows the last-used seed so the DM can note it down.
- **States:** idle · generating (progress bar, buttons disabled) · preview-ready · accepted ·
  error (generation failed; error message; try again button)
- **Platform profiles:**
  - Desktop: right drawer 320 px, always visible alongside the map.
  - Tablet: bottom sheet (50% height), map visible above.
  - Mobile: full-screen sheet; map not visible during generation.
- **Input:** Keyboard: `Tab` through parameters; `Enter` triggers Generate; `Escape` discards.
  Touch: sliders have step-button fallbacks (−/+) at 44×44 px. Dice button: tap/click.
- **Accessibility:** Each slider: `aria-label`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`,
  `aria-valuetext` (human label). Progress bar: `role="progressbar" aria-valuenow aria-valuemax
  aria-label="Generation progress"`. Phase label associated via `aria-describedby`.
  On completion: live-region announces "Generation complete. [N] layers added."
- **Acceptance criteria:**
  - Given seed "crypt-1" and type Dungeon, when the DM generates twice with the same parameters,
    then the resulting layer set is identical (MAP-004 determinism).
  - Given the DM clicks the dice button, when the seed changes, when the preview refreshes within
    400 ms debounce, then the preview thumbnail updates.
  - Given generation is running, when the progress bar is visible, then the phase label updates as
    each generation phase starts.
  - Given the DM clicks Discard, when the sheet closes, then no layers are added to the map.
- **Priority:** Should-have

---

### UX-MAP-009 — Map import wizard (MAP-002, MAP-020)

- **Requirement:** The import wizard must present a preview phase before commit, show a capability
  summary for external formats, classify each element (importable / lossy / unsupported), and
  allow cancellation with full rollback at any point.
- **Rationale:** MAP-020's preview-before-commit model is essential for error prevention; users
  need to see what will (and won't) import before committing irreversibly (§2 rubric: error
  prevention & recovery).
- **Spec:**
  - **Trigger:** "Import" button in map authoring (icon: upload-cloud). Opens a step-by-step
    wizard (desktop: modal dialog; mobile: full-screen sheet).
  - **Step 1 — Source selection:**
    - Radio: "Image / SVG (native)" or "External scene format."
    - Native: file picker (`accept="image/*,.svg"`). Shows filename + size after selection.
    - External: format-ID text field with a datalist of declared adapters. Checkbox list of
      declared elements the file contains.
    - "Preview" button proceeds to Step 2.
  - **Step 2 — Import preview (MAP-020):**
    - If native: shows asset metadata (filename, dimensions, byte size, content hash).
    - If external: shows adapter capability summary as a table:

      | Element | Support |
      |---|---|
      | dimensions | Importable |
      | grid | Importable |
      | walls | Importable |
      | lights | Lossy (approximated) |
      | notes | Unsupported |
      | tokens | Unsupported |

      Color-coded: green (importable), amber (lossy), red (unsupported).
    - Dropped elements listed explicitly: "These elements will not be imported: notes, tokens."
    - If format has no declared adapter: error message "Unsupported format — no adapter declared";
      only a "Back" and "Cancel" button; no commit path.
    - "Commit import" primary button proceeds. "Cancel (rollback)" abandons — nothing written.
  - **Step 3 — Result:** Shows imported map name, layer count. "Open map" or "Close" button.
  - **Error handling:** If commit fails after staging, rollback runs automatically; error message
    shown with "No data was written" confirmation (MAP-020 AC3).
  - **File size validation (MAP-002 AC2):** if the file exceeds the configured limit, step 1 shows
    an error before proceeding to step 2 — no storage mutation occurs.
- **States:** source-selection · previewing · committing (spinner + "Importing…") · success ·
  error (with rollback confirmation)
- **Platform profiles:**
  - Desktop/Tablet: modal dialog, width 560 px.
  - Mobile: full-screen sheet; step navigation at the bottom.
- **Input:** Keyboard: `Tab` through step fields; `Enter` advances step; `Escape` cancels.
- **Accessibility:** Dialog `role="dialog" aria-labelledby="import-wizard-title"`. Progress steps:
  `<ol aria-label="Import steps">`. Current step: `aria-current="step"`. Error announcements
  via `role="alert"`. Rollback confirmation: `role="status"`.
- **Acceptance criteria:**
  - Given a file exceeds the size limit, when the user selects it in step 1, then an error
    appears and the Preview button remains disabled.
  - Given an external format with no declared adapter, when step 2 renders, then no commit button
    is visible.
  - Given the user cancels in step 2, when the wizard closes, then no map entity, asset record, or
    partial layer exists in the store.
  - Given the import commit fails after staging, when rollback completes, then the user sees
    "No data was written" and no orphaned assets remain.
- **Priority:** Must-have

---

### UX-MAP-010 — POI placement, editing, and deep-linking (MAP-010, MAP-011, MAP-015)

- **Requirement:** The DM must be able to place a POI by clicking/tapping the map canvas, assign
  it a category and visibility, and link it to a note or entity. A POI marker must open a
  popover (desktop/tablet) or bottom sheet (mobile) that does not dismiss on hover, scroll, or
  focus-into-action — only on explicit close. POI deep-links must resolve to the correct map +
  POI without leaking hidden state.
- **Rationale:** MAP-015 exactly specifies the dismissal policy; MAP-011 requires per-POI
  visibility independent of the layer; MAP-018 requires deep-link safety (§3.5 [1][2]).
- **Spec:**
  - **Placement (DM only):** When the POI tool is active (pin icon in toolbar), clicking/tapping
    the map canvas places a POI marker at the normalized coordinate of the click. Immediately
    opens the POI creation form as a popover anchored to the new marker.
  - **POI marker:** a pin icon (map-pin, 20×20 px canvas-space, scales with zoom to remain 16–28
    px screen-space). Category-colored fill (see category color table in §6). DM-only POIs have a
    lock overlay on the pin icon. `aria-label="[POI name], [category]"` on the marker element.
  - **POI creation form (inline popover):** fields: Label (required), Category (select), Linked
    note (optional entity picker), Visibility (dm-only / player-visible / shared, default
    dm-only). "Save POI" and "Cancel" buttons. Saves to core via `map.create-poi` command.
  - **POI detail popover (desktop/tablet):** anchored below the marker. Max width 320 px.
    Contains: POI name (bold), category badge, linked note (clickable), "Focus on map" button,
    "Edit" button, "Open deep link" link (`?map=[id]&poi=[id]`), "Delete" button (DM only).
    Stays open when pointer moves from marker into popover. Dismisses only on: explicit Close
    button, `Escape` key, outside pointerdown, or opening another POI. Focus moves into the
    popover on open; returns to marker trigger on genuine dismiss.
  - **POI detail sheet (mobile):** bottom sheet. Same content. `role="dialog" aria-modal="true"`.
    Dismiss on swipe-down, Close button, or Escape.
  - **POI visibility toggle (DM only):** in the popover/sheet, a toggle with three states:
    DM only / Player visible / Shared. Changing this dispatches `map.update-poi` immediately.
    Player views refresh without map reload (MAP-011 AC2).
  - **Deep link resolution (MAP-018):** `?map=[id]&poi=[id]` URL opens the map, centers the
    viewport on the POI, and opens its popover/sheet. If the POI is hidden from the current
    actor: shows a generic "Location unavailable" state with no POI name, coordinates, or
    category in the URL or visible UI.
  - **Consistency check warning (MAP-016):** if a player-visible POI is on a hidden layer, a
    warning chip appears below the visibility toggle: "This POI is on a hidden layer. Players
    cannot see it." (non-blocking; projection validation will catch it before delivery).
- **States:** no-poi-selected · placement-mode (cursor: crosshair + pin) · popover-open ·
  popover-closing · sheet-open · hidden-unavailable (actor cannot see this POI)
- **Platform profiles:**
  - Desktop: popover anchored to marker.
  - Tablet: popover anchored to marker (landscape); bottom sheet (portrait).
  - Mobile: always bottom sheet.
- **Input:** Pointer: click marker to open popover; click outside to close (if outside popover).
  Touch: tap marker; tap outside closes. Keyboard: `Tab` to marker, `Enter`/`Space` opens
  popover; `Tab` within popover to actions; `Escape` closes; `Delete` on focused marker deletes
  POI (with confirmation).
- **Accessibility:** Marker: `role="button" aria-haspopup="dialog"`. Popover: `role="dialog"
  aria-label="[POI name] actions"`. Focus trap within dialog. On open: focus moves to first
  action button. On close: focus returns to marker trigger. All POI actions have visible labels
  (no icon-only). Live region: "[POI name] marked as player-visible" on visibility change.
- **Acceptance criteria:**
  - Given a POI popover is open, when the pointer moves from the marker into the popover, then the
    popover remains open.
  - Given the DM changes a POI from dm-only to player-visible, when the command commits, then the
    player view shows the POI without a map reload.
  - Given a player opens a deep link targeting a dm-only POI, when the link resolves, then no POI
    name, coordinates, or category are visible in the UI or URL.
  - Given a player-visible POI is on a hidden layer, when the DM views the POI detail, then a
    warning chip is visible below the visibility toggle.
- **Priority:** Must-have

---

### UX-MAP-011 — Fog-of-war controls (MAP-012)

- **Requirement:** The DM must be able to reveal and conceal fog areas using a brush, rectangle,
  or polygon tool, with explicit brush-size and feather controls, and one-click presets (Reveal
  All, Reset Fog). Player views update within 1 s of commit. Offline queuing is visible.
- **Rationale:** Fog of war is the single most time-pressured DM operation in live play; controls
  must be instant to reach and unambiguous (§3.3 [6][7]).
- **Spec:**
  - **Fog controls section:** accessible via a dedicated "Fog" tool in the toolbar (cloud-fog icon)
    or a "Fog" tab in the annotations panel. When the fog tool is active, the contextual options
    strip shows:
    - **Operation toggle:** two large buttons, full-width of options strip — "Reveal" (green-tint
      fill) and "Conceal" (charcoal fill). Active state: filled; inactive: outlined. Last-used
      operation persists across tool switches.
    - **Shape sub-tool:** three icons — freehand brush / rectangle / polygon. Default: rectangle.
    - **Brush size** (only for freehand brush): slider 5–200 "canvas units" (where 1 unit = 1 grid
      square at 1× zoom). `[`/`]` keyboard steps.
    - **Feather** (checkbox): softens edges of the fog region by 4 px (canvas space). Default off.
  - **Preset buttons** (below the options strip):
    - "Reveal All" — reveals the entire map; confirmation dialog: "Reveal the entire map to
      players? This cannot be undone automatically." Primary: Reveal All. Secondary: Cancel.
    - "Reset Fog" — hides the entire map behind fog; confirmation dialog similar to above.
  - **Visual feedback:**
    - DM view: revealed areas show the map at full opacity; concealed areas show the map at 20%
      opacity with a grey fog texture overlay (charcoal, 60% opacity) so the DM can still see the
      underlying terrain.
    - Player view: revealed areas at full opacity; concealed areas show solid fog (charcoal, 95%
      opacity, soft edge). The actual map content beneath concealed areas is never transmitted to
      player clients (MAP-006 AC2).
    - As the DM drags the reveal brush, the region being revealed is shown with a green-tint
      overlay (50% opacity, 2 px green border) in real time. On release, the overlay commits.
  - **Sync status:** a status pill below the fog controls: "Synced" (green dot) /
    "Syncing…" (pulsing dot) / "Queued offline — [N] operations pending" (amber dot + count).
    MAP-012 AC2: when offline, the reveal commits locally and queues; the DM sees "Queued offline."
  - **Undo:** `Ctrl+Z` undoes the last fog operation. Fog operations are individually undoable
    as durable commands (MAP-012 / MAP-003).
- **States:** fog-tool-inactive · reveal-mode-active · conceal-mode-active · dragging-reveal ·
  dragging-conceal · committing (brief 100 ms lockout) · synced · queued-offline · error
- **Platform profiles:**
  - Desktop: full controls visible in the contextual strip. Keyboard shortcuts active.
  - Tablet: same; freehand brush with stylus/finger. Options strip as floating pill.
  - Mobile: "Reveal" and "Conceal" as two large buttons (≥56×56 px) in a bottom strip. Only
    rectangle tool available (no freehand on mobile — "slim" surface). Preset buttons behind
    a "⋮" more menu.
- **Input:** Pointer: drag for freehand brush; click-drag for rectangle; click waypoints for
  polygon. Keyboard: `R` switches to Reveal; `C` switches to Conceal; `[`/`]` brush size;
  `Ctrl+Z` undo. Touch: finger drag for freehand/rectangle; no polygon on mobile.
- **Accessibility:** Operation toggle: `role="radiogroup"` with two `role="radio"` buttons.
  Brush size: slider with `aria-label` as specified in UX-MAP-007. After a fog operation commits:
  live-region (`aria-live="polite"`) announces "Area revealed — players updated" or "Area
  concealed." Sync status: `aria-live="polite"` updates when status changes.
- **Acceptance criteria:**
  - Given the DM is in Reveal mode and drags the rectangle tool, when the pointer is released,
    then the region is revealed on the DM view within 100 ms and player views update within 1 s.
  - Given the DM clicks "Reveal All," when the confirmation is shown and confirmed, then the
    entire map reveals and the player view updates.
  - Given the DM is offline, when a reveal operation commits locally, then the sync status shows
    "Queued offline" with a count, and the operation appears in the player view when reconnected.
  - Given a fog reveal commits, when a screen reader is active, then the live region announces
    the outcome within 500 ms.
- **Priority:** Must-have

---

### UX-MAP-012 — DM-only annotations vs. player-visible overlays (MAP-003, MAP-006, MAP-011)

- **Requirement:** The DM must be able to author annotations visible only to them, and separately
  author overlays visible to players, with a persistent, unambiguous visual distinction between
  the two that survives zoom, theme changes, and grayscale rendering.
- **Rationale:** Accidental DM annotation visibility is a critical safety failure (§2 rubric:
  error prevention, principle 8: safe by default). The distinction must be visually
  pre-attentive — not dependent on reading a label.
- **Spec:**
  - **DM-only annotations layer(s):** any layer set to `dm-only` visibility. DM annotation
    content on the canvas uses a visually distinct style:
    - Note markers: purple bookmark icon (16×16 px) with a lock overlay.
    - Drawing features: `--layer-dm` purple tint, 60% opacity, dashed stroke outline (4 px dash,
      2 px gap) — distinguishable from solid-stroke player features.
    - A persistent badge "DM ONLY" (purple pill, 10 px label) floats at the top-left of the
      selected DM-only feature when selected.
  - **Player-visible overlay layer(s):** any layer set to `player-visible` or `shared`. Content
    uses solid strokes and standard fill colors.
  - **DM authoring panel — annotation vs. overlay picker:** when the DM adds a new annotation or
    drawing feature, a two-segment control at the top of the creation form selects:
    - "DM annotation" (lock icon + purple tint)
    - "Player overlay" (users icon + gold tint)
    This controls which layer receives the feature. The DM cannot inadvertently switch to player-
    visible by a single misclick — the control is a segmented choice, not a checkbox.
  - **Pre-projection consistency gate (MAP-016):** before the DM projects a map to players, the
    system runs a full consistency check. If any DM-only annotation is referenced by a player-
    visible route or POI, projection is blocked with a conflict list (see UX-MAP-016).
- **States:** dm-only-mode-selected (purple border on authoring form) · player-overlay-mode-
  selected (gold border) · consistency-warning (amber badge on projection button)
- **Platform profiles:** All profiles show the DM/player segmented control. On mobile, the
  control labels condense to icons only.
- **Input:** Keyboard: `D` switches active annotation target to DM-only; `P` to player-visible.
- **Accessibility:** Segmented control: `role="radiogroup"` with two `role="radio"` options.
  DM-annotation features: `aria-label` includes "DM only —" prefix so screen reader reads the
  classification.
- **Acceptance criteria:**
  - Given a DM-only annotation layer, when features are drawn on it and viewed in grayscale,
    then the dashed stroke and purple tint are distinguishable from player-visible features.
  - Given the DM has "DM annotation" selected in the segmented control, when they draw, then the
    feature is placed on a `dm-only` layer.
  - Given a player opens the same map, when the map renders, then DM-only annotation features are
    absent from the canvas and from the feature list.
- **Priority:** Must-have

---

### UX-MAP-013 — Pre-projection consistency check UI (MAP-016)

- **Requirement:** Before projecting a map to players, the DM must see a consistency report that
  lists all blocking visibility conflicts. Projection must be blocked while conflicts remain, with
  a clear conflict list and one-click navigation to each conflict.
- **Rationale:** MAP-016 is a safety requirement — projecting an inconsistent map could leak
  DM-only content. The UX must make the gate visible and actionable, not just a silent block.
- **Spec:**
  - **Projection gate:** the "Project to players" button (in session controls or the layer panel
    footer) runs the consistency check before enabling delivery. The check result is pre-computed
    whenever layers/POIs/routes change (debounced 500 ms), so the result is available instantly
    when the DM clicks Project.
  - **Consistency status badge:** a persistent badge at the bottom of the layer panel showing:
    - Green check + "Safe to project" — no conflicts.
    - Amber warning + "N warnings" — non-blocking issues (e.g., DM token on DM-only layer,
      safely omitted).
    - Red alert + "N conflicts — projection blocked" — blocking issues.
  - **Conflict list panel:** clicking the amber/red badge opens a panel listing each conflict as:
    - Conflict type icon + "Player-visible POI '[Name]' is on hidden layer '[Layer]'."
    - "Go to [POI/route/token]" link — navigates the viewport to the conflicting entity.
    - "Fix" dropdown — offers quick resolutions (hide the POI, reveal the layer, remove the
      route reference).
  - Blocking conflicts must be resolved before the "Project" button is enabled. Non-blocking
    warnings allow projection with a final confirmation: "N warnings noted — project anyway?"
- **States:** checking (spinner, debounced) · safe · warnings · blocked
- **Platform profiles:**
  - Desktop: badge in layer panel footer; conflict list as a side panel.
  - Tablet: same; conflict list as a sheet.
  - Mobile: badge in the toolbar; conflict list as a bottom sheet.
- **Accessibility:** Badge: `role="status"` updating with `aria-live="polite"` when status
  changes. Conflict list: `role="list"` with each conflict as a `role="listitem"`. Blocked state:
  `aria-disabled="true"` on the Project button with `aria-describedby` linking to the conflict
  count.
- **Acceptance criteria:**
  - Given a player-visible POI on a hidden layer, when the consistency check runs, then the badge
    shows "blocked" and the Project button is disabled.
  - Given the DM clicks the conflict badge, when the conflict list opens, then each conflict has
    a "Go to" link and a "Fix" dropdown.
  - Given all conflicts are resolved, when the badge updates, then the Project button becomes
    enabled.
- **Priority:** Must-have

---

### UX-MAP-014 — Layer tag query UI (MAP-007)

- **Requirement:** The DM must be able to tag layers and filter/query the layer list by tags,
  with the query results always actor-filtered (hidden layers never appear in player results).
- **Rationale:** MAP-007 — tag-based layer queries are a first-class feature for large campaigns
  with many maps and layers. The UI must make tags discoverable without requiring documentation.
- **Spec:**
  - **Tag management:** in the layer row's "⋮" actions menu, an "Add tag" option opens a small
    inline tag input field. Tags are free-form text labels (max 40 chars, lowercase, hyphen-
    separated). Existing tags shown as chips; click chip × to remove.
  - **Filter bar:** above the layer list, a row of tag chips showing all tags present in the
    current map's layers. Clicking a chip adds it to the active filter (AND logic between
    multiple active chips). A "Search layers…" text input allows substring matching on tag and
    layer name.
  - **Query surface (DM sidebar or command palette):** a "Query layers" command accepts
    structured input, e.g., `region:northern-coast type:poi`, and returns a filtered layer list.
    The query result is always actor-filtered: hidden layers matching the query are omitted for
    player/observer actors (MAP-007 AC2).
  - Layer count badge on the filter bar: "Showing [N] of [total] layers" updates as filters change.
- **States:** no-filter · filter-active (chips highlighted) · query-running · no-results
- **Platform profiles:**
  - Desktop: full filter bar above layer list; search field always visible.
  - Mobile: filter bar collapsed to a "Filter" button + active chip count badge; tap to expand.
- **Acceptance criteria:**
  - Given layers tagged `region:northern-coast`, when the DM clicks that tag chip, then only
    matching layers appear at full opacity in the layer list.
  - Given a player opens the map, when the same query runs, then hidden layers with matching tags
    are absent from the result.
- **Priority:** Should-have

---

### UX-MAP-015 — Combat overlay controls (MAP-014, MAP-019)

- **Requirement:** The DM must be able to set the active combat overlay mode (none / grid-align /
  range / aoe), place and move tokens, and manage AoE templates, with explicit prerequisite
  gating visible in the UI and actor-filtered token controls.
- **Rationale:** MAP-014 requires prerequisite gating (grid-align requires visible grid); MAP-019
  requires actor-filtered token movement (players can only move their own tokens).
- **Spec:**
  - **Overlay mode selector:** in the combat annotations section, a segmented control:
    None / Grid / Range / AoE. If a selected mode's prerequisite is not met, the segment is
    amber-tinted and clicking it shows a tooltip: "Grid must be visible to use Grid mode. Enable
    grid?" with an "Enable" action.
  - **Token management (DM):** "Add token" button opens a token creation form: name, linked
    character (entity picker), size (dropdown: Tiny/Small/Medium/Large/Huge/Gargantuan), initial
    visibility (dm-only / player-visible). Placed by clicking the map or entering coordinates.
  - **Token on canvas:** circular token with character portrait thumbnail (32×32 px minimum,
    scales with token size). Drag to move. Token size in grid squares: Tiny=0.5, Small=1,
    Medium=1, Large=2, Huge=3, Gargantuan=4.
  - **Actor-filtered movement:** a player can only drag tokens they are authorized to move
    (MAP-019 AC4). Unauthorized tokens show a lock cursor on hover; move attempt shows toast:
    "You can't move [Name]."
  - **AoE templates:** circle (radius), cone (angle + length), line (length + width), cube (side).
    Placed by click-drag on the canvas. Linked to a caster token (optional). Hidden origin tokens
    and hidden targets are omitted from player payloads (MAP-019 AC3).
  - **Range measurement:** ruler tool; click start point, move to end, shows distance in map
    units and grid squares.
- **States:** overlay-none · overlay-grid · overlay-range · overlay-aoe · token-moving ·
  move-blocked (unauthorized token) · aoe-placing
- **Platform profiles:**
  - Desktop: full combat overlay panel. Drag-and-drop token movement.
  - Tablet: same; token drag via touch. AoE templates placed by two-finger pinch-drag.
  - Mobile: token list with tap-to-move (select token, then tap destination — no drag on mobile).
    AoE template selection from a bottom sheet.
- **Accessibility:** Token elements: `role="img" aria-label="[Character name] token, [size]"`.
  Drag-to-move: keyboard alternative is Tab to token + arrow keys to move 1 square at a time.
  AoE template placement: keyboard alternative is form inputs for center position + radius.
- **Acceptance criteria:**
  - Given Grid mode is selected but the grid is not visible, when the DM clicks the Grid segment,
    then an amber tooltip shows "Enable grid?" and Grid mode is not applied until confirmed.
  - Given a player is authorized for only their own token, when they attempt to drag another
    token, then the move is rejected and a toast appears.
  - Given an AoE template is placed with a hidden origin token, when the map is projected to
    players, then the hidden origin token's data is absent from the player payload.
- **Priority:** Should-have

---

### UX-MAP-016 — Map widget embed on canvas (MAP-008, MAP-018)

- **Requirement:** Any map or map region must be embeddable as a widget on any canvas, with the
  widget rendering the actor-filtered map view, supporting pan/zoom within the widget, and
  linking to the full map viewer.
- **Rationale:** Canvas integration is a primary product feature (vision brief, Maps > Canvas
  integration); MAP-018 requires that all widget queries use the same actor-filtered model as
  the renderer.
- **Spec:**
  - **Widget type:** "Map" widget in the canvas widget library. Configured with: map ID, initial
    viewport (x, y, zoom), show-minimap toggle, show-fog toggle, show-poi-labels toggle.
  - **Widget body:** renders the map at the widget's dimensions. Pan/zoom within the widget is
    independent of the full-screen map viewer. A "Open full map" button (top-right corner of
    widget, 32×32 px) opens the full map viewer for this map.
  - **Actor filtering:** the widget renders only layers/POIs/tokens/fog that the current actor
    may see (MAP-018). DM-only content is absent for player-facing widget instances.
  - **Nested map within widget:** if the widget's configured viewport overlaps a nested map
    boundary, the nested map renders within the widget (same actor-filter rules).
  - **Widget dimensions:** min 200×150 px; max fills the canvas pane. Resizable by drag.
  - **Embedding reference:** see `04-canvas-scene-widgets.md` for widget data contract and canvas
    layout rules. This document prescribes only the map-specific rendering and controls.
- **States:** loading · loaded · degraded (asset not synced — base layer thumbnail only) ·
  unavailable (map hidden from actor)
- **Platform profiles:**
  - Desktop: full widget rendering. Pan/zoom within widget via scroll wheel inside widget bounds.
  - Tablet: same; pinch within widget to zoom.
  - Mobile: widget is read-only (no drawing tools). Pan by single finger within widget.
- **Accessibility:** Widget container: `role="img" aria-label="[Map name] — interactive map
  widget"`. "Open full map" button: `aria-label="Open [Map name] in full map viewer"`. Keyboard:
  `Tab` into widget, then arrow keys to pan, `+`/`−` to zoom, `Enter` to open full map.
- **Acceptance criteria:**
  - Given a player canvas has a map widget configured for a map with DM-only layers, when the
    player views the widget, then DM-only layers, POIs, and annotations are absent.
  - Given the map widget asset is unavailable on the current device, when the widget renders,
    then a degraded state shows with the base-layer thumbnail and "Asset syncing…" label.
- **Priority:** Must-have

---

### UX-MAP-017 — Route drawing and measurement UI (MAP-013)

- **Requirement:** The DM must be able to draw multi-waypoint routes on the map, with
  distance and travel-time derived from map scale displayed live, and waypoints that are safely
  deletable without triggering underlying map actions.
- **Rationale:** MAP-013 AC2 explicitly prohibits accidental waypoint placement on the delete
  control's pointerdown; the UI must use a pointer-event design that prevents this.
- **Spec:**
  - **Route tool:** in the "More" overflow of the toolbar (or in the annotations panel). When
    active, each click/tap places a waypoint. Double-click/double-tap ends the route.
  - **Waypoint markers:** small circle markers (12 px diameter, 44×44 px hit area). Drag to move.
    Hover/focus: shows an × delete button as a 24×24 px icon positioned 8 px above the waypoint
    (not overlapping the marker hit area). Delete button uses `pointerdown` stopped from
    propagating to the underlying map — no accidental waypoint placement.
  - **Route line:** solid line connecting waypoints, 2 px stroke, `--color-route` (amber).
    Player-visible routes use a thicker line (3 px) and `--color-player` (gold).
  - **Distance and time display:** a label floating at the midpoint of the route showing:
    "[distance] [unit] (~[travel time] [time unit])". Updates live as waypoints are added/moved
    (MAP-013 AC1).
  - **Visibility:** routes have their own visibility toggle (dm-only / player-visible / shared),
    independent of the layer. Hidden routes and their waypoints are absent from player views;
    deep-link references to hidden routes show "Route unavailable" (MAP-018 / MAP-011).
- **States:** drawing (active waypoint placement) · idle · waypoint-hovered (delete button
  visible) · deleting · calculating (travel time computing)
- **Platform profiles:**
  - Desktop: click to place waypoints; hover to show delete buttons.
  - Tablet: tap to place; tap waypoint to show delete button (tap × to delete).
  - Mobile: same as tablet (slim surface — no polyline drawing with finger, use "place waypoints
    one at a time" mode only).
- **Acceptance criteria:**
  - Given a route with a waypoint, when the pointer is over the waypoint delete button and
    pointerdown fires, then the waypoint is deleted and no new waypoint is placed at that
    position.
  - Given a route with map scale set, when a waypoint is added, then distance and travel time
    update within 200 ms.
- **Priority:** Should-have

---

### UX-MAP-018 — Actor-filtered map search (MAP-018)

- **Requirement:** All map search surfaces (inline map search, command palette, graph, deep-link)
  must use the same actor-filtered query model, producing results that never include hidden map
  artifacts for non-DM actors.
- **Rationale:** MAP-018 requires a single query model across all surfaces; any divergence
  creates a leak vector. The UX must not give users a path to accidentally surface hidden data.
- **Spec:**
  - **Inline map search:** a search field at the top of the annotations panel (or triggered by
    `Ctrl+F` / `Cmd+F` on the map view). Searches POI labels, route labels, token names.
    Results appear as a list below the field (max 8 visible, scrollable). Each result: kind
    badge (POI / route / token) + label + "Go to" link that centers the viewport on the artifact.
  - **Command palette integration:** `map.search` command in the command palette (see
    `05-command-center.md`). Same actor-filtered model.
  - **No hidden-artifact exposure:** if a search query matches a hidden artifact, the match is
    silently omitted. No "N hidden results not shown" count (which would confirm the artifact
    exists to a player). The result list simply shows only visible matches.
  - **Deep link safety (MAP-018 AC2):** if `?map=[id]&poi=[id]` targets a hidden artifact, the
    URL parameters are not echoed in visible UI (no URL bar parameter display that could be
    screenshot-leaked). The page shows "Location unavailable."
- **Acceptance criteria:**
  - Given a player searches "Dragon's Lair" (a DM-only POI), when results appear, then the
    player-side result list is empty.
  - Given a deep link targets a hidden map, when a player opens the link, then the URL bar
    does not show the hidden map's ID in any visible UI element beyond the address bar.
- **Priority:** Must-have

---

## 6. Component & state specifications

### Layer row anatomy

```
[drag-handle] [type-badge] [eye] [player-icon] [name ─────────] [opacity%] [lock] [⋮]
   20×44px      chip 12px   44px    16×16px     max 120px         10px text  44px  44px
```

Full state matrix for a layer row:

| State | Drag handle | Eye | Player icon | Name | Opacity | Lock | Actions |
|---|---|---|---|---|---|---|---|
| Default | visible on hover | filled/slashed | icon variant | truncated | readout | icon | visible on hover |
| Hovered | grab cursor | — | — | — | click opens slider | — | visible |
| Focused (keyboard) | focus ring | focus ring | focus ring | — | focus ring | focus ring | focus ring |
| Locked | dimmed, no drag | dimmed | dimmed | dimmed 50% | dimmed | filled lock | disabled |
| Selected (in filter) | — | — | — | **bold** | — | — | — |
| Filter-hidden (not matching) | 40% opacity | 40% | 40% | 40% | 40% | 40% | 40% |
| Loading | skeleton bar | — | — | skeleton | — | — | — |

### Layer type badge color tokens

| Type | Token | Hex (light theme approx.) |
|---|---|---|
| base | `--layer-base` | `#9E9E9E` |
| heightmap | `--layer-height` | `#4CAF50` |
| political | `--layer-political` | `#FF9800` |
| climate | `--layer-climate` | `#009688` |
| roads | `--layer-roads` | `#FF5722` |
| waterways | `--layer-water` | `#2196F3` |
| watersheds | `--layer-wshed` | `#00BCD4` |
| fog-of-war | `--layer-fog` | `#455A64` |
| POI | `--layer-poi` | `#E53935` |
| DM annotations | `--layer-dm` | `#7B1FA2` |
| player overlay | `--layer-player` | `#F9A825` |
| combat | `--layer-combat` | `#D84315` |
| custom | `--layer-custom` | `#BDBDBD` |

### POI popover anatomy

```
┌─────────────────────────────────────────┐
│ [Category badge]  [Name ─────────] [×]  │  header (32px)
├─────────────────────────────────────────┤
│ Linked note: [Note name link]           │  body
│ Visibility: [○DM ●Player ○Shared]       │  (DM only)
├─────────────────────────────────────────┤
│ [Focus on map]  [Edit]  [Deep link ↗]   │  actions
│ [Delete] (DM only, danger style)        │
└─────────────────────────────────────────┘
max-width: 320px; padding: 12px; border-radius: 8px; box-shadow: elevation-3
```

### Fog operations strip (active fog tool)

```
[Reveal ██████] [Conceal ░░░░░░]     operation toggle (full width)
[~] [■] [⬡]                          shape sub-tool (brush/rect/polygon)
Brush size: [────●───] 24 units      only when brush shape active
Feather: [□]                         checkbox
──────────────────────────────────────
[Reveal All]        [Reset Fog]       preset buttons (secondary style)
Sync: ● Synced                        status pill
```

### Generation panel parameter layout

```
┌────────────────────────────────────────────┐
│ Generate map layers                        │
│                                            │
│ Type: [Terrain] [Settlement] [Dungeon]     │ segmented control
│                                            │
│ Seed: [crypt-1              ] [🎲]          │ text + dice button
│                                            │
│ Size: Small ──●────────── Huge             │ slider, 4 stops
│ Density: [──────●────] 50%                 │ slider 0-100
│ Terrain style: [Temperate Forest    ▾]     │ select (context varies)
│ Water coverage: [────●──────] 35%          │ slider (terrain only)
│ Elevation: [Flat] [Rolling] [Mountainous]  │ segmented (terrain only)
│                                            │
│ ▼ Advanced settings                        │ collapsed by default
│                                            │
│ ┌────────────────────────────────┐         │
│ │ [Generation preview — 240×240] │         │
│ │      Generating…               │         │
│ └────────────────────────────────┘         │
│ ████████████░░░ Placing settlements…       │ progress bar
│                                            │
│ [Accept and add to map] [Discard]          │
└────────────────────────────────────────────┘
```

---

## 7. Layout & responsive behavior

### Desktop (≥ 1024 px)

```
┌────────────────────────────────────────────────────────┐
│ [Breadcrumb: World › Northern Region]    [Map name] [⋮]│  top bar 32px
├──┬─────────────────────────────────────────────────────┤
│T │                                              [Mini]  │
│o │              Map canvas                     [ map]  │
│o │              (pan/zoom, layers composited)          │
│l │                                                      │
│b │                                      [+ −] [fit]   │
│a ├─────────────────────────────────────────────────────┤
│r │ options strip (active tool)                         │
│  │                                                      │
│48├──────────────────────────────┬──────────────────────┤
│px│                              │ Layer panel (280px)  │
│  │                              │ [filter chips]       │
│  │                              │ [layer rows]         │
│  │                              │ [Add layer]          │
│  │                              │ ─────────────────── │
│  │                              │ Annotations          │
│  │                              │ [POIs] [Routes] [Fog]│
│  │                              │ [Tokens] [Overlay]   │
│  │                              │ ─────────────────── │
│  │                              │ Consistency: ✓ Safe  │
└──┴──────────────────────────────┴──────────────────────┘
```

- Toolbar: left edge, 48 px wide, vertical.
- Map canvas: fills remaining space (full bleed, pointer events active).
- Right panel: 280 px, resizable 240–360 px. Contains layer panel + annotations panel stacked.
- Minimap: bottom-right of canvas, 15% viewport width.
- Breadcrumb: top bar, left-aligned, 32 px height.
- Options strip: appears between toolbar and canvas bottom, 48 px height, contextual.

### Tablet landscape (600–1024 px)

Same as desktop but right panel is 260 px and toolbar icon size increases to 56 px. Layer panel
and annotations panel are separate tabs within the right panel (not stacked). Minimap collapsed by
default in portrait, visible in landscape.

### Tablet portrait

Map takes full width. Right panel collapses to a pull-up sheet (drag handle at bottom of canvas,
expands to 50% viewport height). Toolbar moves to bottom of canvas, horizontal strip, 8 icons
max, 56 px height.

### Mobile (< 600 px)

```
┌──────────────────────────────────┐
│ ← Back  [Map name]         [⋮]   │  top bar 44px
├──────────────────────────────────┤
│                                  │
│   Map canvas                     │
│   (view only — no drawing tools) │
│                              [M] │  minimap collapse button
│                                  │
├──────────────────────────────────┤
│ [Reveal] [Conceal]  [POI] [≡]    │  bottom action strip 56px
└──────────────────────────────────┘
```

- No toolbar rail — bottom strip only with primary map actions: Reveal, Conceal, POI, Menu.
- All authoring (drawing, generation, import) deferred to a desktop session or accessible via
  the "≡" menu as a slim form in a bottom sheet.
- Layer panel: accessible via "≡" menu as a bottom sheet (48% height), simplified rows.
- Breadcrumb: condensed to "← [Parent map]" back button + current map name.

---

## 8. Motion & feedback

All durations and easing reference the motion system defined in `01-visual-design-system.md`.
Surface-specific overrides are listed here.

| Interaction | Duration | Easing | `prefers-reduced-motion` fallback |
|---|---|---|---|
| Nested-map zoom transition | 300 ms | ease-in-out | 100 ms cross-fade (opacity only) |
| Viewport pan (keyboard) | 150 ms | ease-out | instant (no animation) |
| Viewport jump (minimap click) | 200 ms | ease-out | instant |
| Layer row drag lift | 120 ms | ease-out | no lift shadow (instant) |
| Layer row drop settle | 200 ms | spring (bounce 0.1) | instant reorder |
| Fog reveal commit (DM view) | 80 ms | ease-out | instant |
| Fog reveal sync (player view) | up to 1000 ms | ease-out | instant on receive |
| Tool switch (palette) | 80 ms | ease-out | no transition |
| POI popover open | 120 ms | ease-out (scale + opacity) | instant appear |
| POI popover close | 80 ms | ease-in | instant disappear |
| Generation progress bar | continuous | linear | continuous (no change) |
| Generation preview update | 400 ms debounce, then 200 ms fade | ease-out | instant update |
| Breadcrumb transition text | 100 ms | ease-out | instant |

**What must NOT animate (even without `prefers-reduced-motion`):**
- Layer panel opacity changes (must feel instant to be usable as a real-time control).
- Sync status badge updates (must not animate — users read them for safety information).
- Consistency check badge updates.
- Any DM-only / player-visible boundary indicator (must never animate in a way that could hint
  at hidden content transitioning into view).

---

## 9. Accessibility requirements (surface-specific)

Beyond `03-accessibility.md`, this surface adds the following specific requirements:

### Canvas keyboard model

The map canvas is a spatial widget. It must implement a two-mode keyboard model:
- **Navigation mode** (default when canvas is focused): arrow keys pan the viewport; `+`/`−`
  zoom; `Tab` moves focus to the next interactive element on the canvas (POI markers, token
  markers, nested-map indicators).
- **Feature selection mode** (activated by `Tab`-ring navigation): arrow keys move the selected
  feature (token, POI) within the map; `Enter`/`Space` opens its popover/detail.
Switching between modes: `Escape` returns to navigation mode from feature selection.

### Map alt-text strategy

Per `03-accessibility.md`, large spatial canvases cannot have exhaustive alt text. This surface
implements a **progressive alt-text** approach:
- Canvas container: `aria-label="[Map name] — interactive map. [N] POIs, [N] tokens, fog
  [on/off]."` Updated on content change (debounced 2 s) via `aria-live="off"` (polite on
  significant changes only).
- Each POI marker: `aria-label="POI: [Name], [category], [visibility]"`.
- Each token: `aria-label="Token: [Character name], [size], [position: grid square [col][row]]"`.
- Fog state: announced on change via `aria-live="polite"`: "Fog updated — [N]% of map revealed."
- The layer panel's list provides a complete textual index of all visible map content for users
  who cannot navigate the spatial canvas.

### Focus management rules

- Opening a POI popover: focus moves to the first focusable element in the popover.
- Closing a POI popover: focus returns to the marker trigger button.
- Opening generation or import panels: focus moves to the first field.
- Closing panels: focus returns to the triggering button.
- Layer panel open (sheet on mobile): focus moves to the panel's close button or first layer row.
- Consistency conflict list: focus moves to the first conflict item.

### Live region requirements

All live regions must use `aria-live="polite"` except the following which use `"assertive"`:
- Fog reveal/conceal committed: `"polite"` (DM action, not urgent).
- Projection blocked (consistency check failed): `"polite"`.
- Command rejected (move rejected, mode blocked): `"polite"` (no `"assertive"` — not an error).
- Undo applied: `"polite"`.

No `"assertive"` live regions are used on this surface — all messages are informational
follow-ups to user-initiated actions, not interrupts.

### WCAG 2.2 mapping

| Requirement | SC | Notes |
|---|---|---|
| All map tools operable by keyboard | 2.1.1 | Keyboard draw mode, arrow-key token movement |
| Touch targets ≥44×44 CSS px | 2.5.5 / 2.5.8 | All toolbar buttons, layer row actions, POI markers |
| No gesture-only operations | 2.5.7 | Every drag/pinch has a discrete button/keyboard alternative |
| Focus visible | 2.4.11 | All interactive elements have ≥3px focus ring |
| Status messages in live regions | 4.1.3 | Fog sync, undo, consistency check |
| Error identification | 1.3.1 / 3.3.1 | Import diagnostics, consistency conflicts, mode-blocked errors |
| Non-text contrast ≥3:1 | 1.4.11 | Layer type badge colors, fog boundary, POI markers |

---

## 10. Anti-patterns & explicit limitations

### AP-1: Accidental fog reveal (MUST NOT implement)

**Pattern:** Fog-reveal brush with no confirmation, no visual indication of what is being
revealed, and no undo. Used by: older Roll20 versions.
**Why rejected:** In live play, a DM can accidentally reveal a room the players haven't entered.
Without undo, this ruins immersion and cannot be undone mid-session. Research: Foundry VTT
added an explicit undo-fog operation in version 9 after community reports of accidental reveals
[6]. **Our requirement:** every fog operation is undoable (MAP-003, MAP-012), and the DM sees
a visual pre-reveal overlay before releasing the pointer.

### AP-2: DM layer data leaking to players via search or graph (MUST NOT implement)

**Pattern:** A search index that includes all map content regardless of actor role, then filters
the display — but not the response — for players. Players can infer hidden content from result
counts, autocomplete suggestions, or error messages naming hidden entities.
**Why rejected:** MAP-018 and the architecture's actor-filtered query model (Contract 3) are
explicit that hidden data must be absent from *responses*, not merely hidden in the display.
A player seeing "3 results hidden" knows DM-only content exists. **Our requirement:** query
responses contain zero references to hidden artifacts for non-DM actors (MAP-007 AC2, MAP-018
AC1). No "N hidden results" count is shown to non-DM actors.

### AP-3: Modal tool dialogs that block the map (MUST NOT implement)

**Pattern:** Clicking a tool opens a full-screen modal dialog that the user must configure and
dismiss before returning to the map. Used by: older mapping tools, some VTT layer management UIs.
**Why rejected:** During live play, the DM needs to act on the map while seeing it. Any
modality that hides the map increases cognitive load and response time. Owlbear Rodeo explicitly
avoids this (§3.3 [8]). **Our requirement:** all tool options appear in contextual strips or
non-modal side panels (UX-MAP-007). The map canvas is always visible during tool configuration.

### AP-4: No keyboard or touch parity for map authoring (MUST NOT implement)

**Pattern:** Map drawing and fog operations are mouse-drag-only with no keyboard or touch
equivalent. Common in desktop-first VTT tools.
**Why rejected:** WCAG 2.2 SC 2.5.7 requires that all pointer gestures have a non-pointer
alternative. Players and DMs at a physical table may be using a tablet with a stylus, a
trackpad, or an accessibility device. **Our requirement:** every map operation has a discrete
(non-gesture) alternative — buttons, form inputs, or keyboard commands (UX-MAP-007, UX-MAP-011).

### AP-5: Lost in nested maps (no wayfinding) (MUST NOT implement)

**Pattern:** Zooming into a nested map with no breadcrumb, no back button, and no indication of
the parent map. Used by: naive deep-zoom implementations.
**Why rejected:** Spatial disorientation is a known usability failure in deep-zoom applications
(§3.1 [3]). Users lose their place in the map hierarchy and must navigate back to the root to
reorient. **Our requirement:** the breadcrumb bar is always visible and functional at every
nesting level (UX-MAP-002). `Escape` or `Alt+ArrowLeft` always returns to the parent.

### AP-6: Opacity and visibility as the same control (MUST NOT implement)

**Pattern:** A single opacity slider where 0% = "invisible" and serves as the visibility toggle.
Used by: some layer editors.
**Why rejected:** Visibility (dm-only vs. player-visible) and opacity (0–100%) are orthogonal.
A DM may want 0% opacity on a layer for themselves (to declutter their view) without changing
its player visibility. Conflating them creates a category error that causes accidental visibility
changes. MAP-006 requires the three presentation axes (player-visibility, DM-display, opacity) to
be independent controls. **Our requirement:** they are always three separate controls on the
layer row (UX-MAP-004).

### AP-7: Import without preview or rollback (MUST NOT implement)

**Pattern:** Clicking "Import" immediately imports the file, creates layers, and writes assets
with no preview and no rollback if it fails partway through. Common in older map tools.
**Why rejected:** MAP-020 explicitly requires a preview phase and rollback. Partial imports
create orphaned assets and inconsistent map state that is difficult to diagnose and clean up.
**Our requirement:** import is a two-phase transaction (preview → commit); cancel at any point
leaves no state change (MAP-020 AC2, AC3).

### AP-8: POI popover that closes on pointer-move-out (MUST NOT implement)

**Pattern:** A hover-triggered popover that closes when the pointer moves from the POI marker
into the popover (crossing the gap between the trigger and the popover). Very common in naive
tooltip implementations.
**Why rejected:** The pointer must cross from the marker to the popover, and any gap will trigger
the close, making actions inside the popover unreachable. MAP-015 and the
`controlInteractionReducer` architecture explicitly prohibit this. Mapbox GL's documentation
names this the "hover gap" problem (§3.5 [1]). **Our requirement:** the popover uses a
`pointerdown` dismiss model, not a `pointerleave` model (UX-MAP-010).

### AP-9: Fog that hides content from DM (DM view parity failure) (MUST NOT implement)

**Pattern:** The fog layer hides content equally from DM and players — the DM must toggle fog
off to see the underlying map during play.
**Why rejected:** The DM needs to see the full map at all times to run encounters effectively.
Fog must render at reduced opacity (20%) on the DM view so the DM can see terrain behind it,
while the player view shows solid fog (UX-MAP-011). This is the standard VTT pattern (Foundry,
Roll20, Owlbear all implement DM fog transparency).

### AP-10: Generation parameter overload on the default panel (MUST NOT implement)

**Pattern:** Showing all 50+ generation parameters on the initial panel. Used by: raw procedural
generation tools (Azgaar exposes this optionally, but the default is progressive disclosure).
**Why rejected:** Parameter overload discourages use of the generation feature entirely (§3.4
[10]). New users do not know what most parameters mean; experienced users can reveal them.
**Our requirement:** ≤8 parameters on the default panel; advanced settings collapsed
(UX-MAP-008).

---

## 11. Success metrics

| Metric | Target | Measurement method |
|---|---|---|
| Time to reveal a fog area from DM view load | ≤ 10 s | Usability test (first-time DM) |
| Fog reveal appears on player view | ≤ 1 s after DM release | Performance test (local network) |
| Time to add a named POI to an existing map | ≤ 20 s (first time) | Usability test |
| DM-only layer visible to player in any test | 0 occurrences | Security/QA test (MAP-006, MAP-011) |
| Hidden artifact in player search results | 0 occurrences | Automated test (MAP-007, MAP-018) |
| Layer panel findability (tree test: "hide a layer from players") | ≥ 80% success | Tree test |
| Nested-map transition disorientation rate ("where am I?") | < 10% of sessions | Usability observation |
| First-time import completion without help | ≥ 75% success rate | Usability test |
| Consistency check false negatives (blocked map projects with inconsistent state) | 0 | Automated test (MAP-016) |
| Keyboard-only task completion (reveal area, toggle layer, add POI) | 100% possible | Manual a11y test |
| Perceived-performance: map tool response | ≤ 100 ms (paint stroke first pixel) | Performance profiling |
| Paint stroke commits with undo available | 100% | Automated test (MAP-003) |
| Generation with identical seed reproduces identical layers | 100% | Automated test (MAP-004) |

---

## 12. Open questions & risks

1. **GPU compositing availability:** The nested-map animated zoom transition and fog layer
   compositing depend on efficient GPU rendering. If the target platform (Electron, WebView on
   mobile) does not support `WebGL` or `OffscreenCanvas`, the transition degrades to a cross-fade
   per UX-MAP-001/002. The `prefers-reduced-motion` fallback doubles as the degraded path. Risk:
   on low-end Android WebViews this may be the default path.

2. **ADR-014: pixel renderer deferred.** Per ADR-014, the full pixel renderer (GPU compositing,
   fog canvas, real brush painting) is deferred. The current v2 component implementations
   demonstrate the data model but not the visual rendering. This document specifies the full
   visual rendering UX as the target state; the deferred renderer must conform to these
   specifications when implemented.

3. **POI deep-link URL visibility:** UX-MAP-018 requires that hidden POI IDs not be visible in
   the URL bar when a non-DM actor opens a deep-link to a hidden artifact. URL bar contents are
   outside the app's control on mobile browsers. The mitigation is to not echo the POI ID in the
   page's visible content; the URL bar cannot be controlled. This risk should be documented in
   the security review.

4. **Mobile drawing tools:** The current spec designates mobile as a "slim" surface with no
   freehand drawing. This matches `MAP-003` / `MAP-012`'s `Mobile: slim` compatibility flags. If
   a future requirement adds mobile map authoring, UX-MAP-007 will need revision. For now, the
   mobile drawing limitation is intentional.

5. **Layer drag-to-reorder on touch:** HTML Drag and Drop API does not fire on touch without
   polyfills. The implementation must use pointer-event-based drag for touch reorder, or fall
   back to up/down buttons as the primary reorder mechanism on tablet/mobile. The up/down button
   fallback is the required accessible alternative per WCAG 2.2 SC 2.5.7 regardless.

6. **Minimap rendering cost:** Rendering a minimap thumbnail at 60 fps for large maps with many
   layers could be expensive. The spec limits the minimap to the base layer only at low
   resolution (not a live composite), which should be acceptable. This trade-off should be
   validated with performance profiling.

7. **POI marker Z-ordering with tokens:** When POI markers and token markers overlap at the same
   map coordinate, Z-ordering and interaction disambiguation are not specified here. This is a
   canvas rendering concern deferred to `04-canvas-scene-widgets.md` and the renderer
   implementation.

8. **Fog opacity values (DM vs. player view):** The spec uses 20% DM fog opacity and 95% player
   fog opacity. These values should be validated with usability testing — DMs have reported in
   community discussions [6][7] that too-transparent DM fog (≥30%) makes it hard to distinguish
   revealed vs. concealed areas during fast gameplay. The values may need adjustment.

---

## Sources

[1] Mapbox GL JS documentation — Mapbox — https://docs.mapbox.com/mapbox-gl-js/api/

[2] Google Maps Platform — Places deep links and coordinate URL scheme — Google —
https://developers.google.com/maps/documentation/urls/get-started

[3] OpenSeadragon documentation — Deep Zoom and Minimap patterns — OpenSeadragon contributors —
https://openseadragon.github.io/

[4] Adobe Photoshop — Layer basics — Adobe Help Center —
https://helpx.adobe.com/photoshop/using/layer-basics.html

[5] Figma Help — Layers panel overview — Figma —
https://help.figma.com/hc/en-us/articles/360039831974-Layers-panel-overview

[6] Foundry VTT — Scene Controls documentation — Foundry Project —
https://foundryvtt.com/article/scene-controls/

[7] Roll20 — Fog of War documentation — Roll20 —
https://help.roll20.net/hc/en-us/articles/360039478334-Fog-of-War

[8] Owlbear Rodeo — Product and UX blog / interface overview — Owlbear Rodeo —
https://www.owlbear.rodeo

[9] Dungeondraft — Map editor features and documentation — Megasploot —
https://dungeondraft.net/features

[10] Azgaar's Fantasy Map Generator — Web application — Azgaar —
https://azgaar.github.io/Fantasy-Map-Generator/

[11] Wonderdraft — Map creation software — Megasploot —
https://www.wonderdraft.net

[12] Dungeon Scrawl — Browser-based dungeon mapper — ProbableTrain —
https://dungeonscrawl.com

[13] WAI-ARIA Authoring Practices Guide — Toolbar, Dialog, Carousel patterns — W3C —
https://www.w3.org/WAI/ARIA/apg/patterns/

[14] WCAG 2.2 — Success Criteria 2.5.7 (Dragging Movements), 2.5.8 (Target Size), 4.1.3
(Status Messages) — W3C — https://www.w3.org/TR/WCAG22/
