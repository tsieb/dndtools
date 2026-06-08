# UX Requirements — Accessibility

> Part of the **DND Tools 0.2.0 UX/UI Requirements Package**. Read `00-overview-and-principles.md`
> first — it defines the shared principles, the parameter rubric, the requirement-ID scheme, the
> platform profiles, and the design tokens this document builds on.
>
> **Status:** Draft v1
> **Functional requirement coverage:** `A11Y-001..011`
> **Owner surface(s):** Product-wide; every route, widget, dialog, map, combat surface, and canvas
> inherits this contract. Surface-specific a11y sections in sibling docs (`04-canvas-scene-widgets.md`,
> `06-maps.md`, `08-sessions-live-play.md`, etc.) add surface detail but must not dilute this bar.

---

## 1. Scope

- **Covers:** The product-wide accessibility contract — the floor every surface must meet. Defines
  WCAG 2.2 AA conformance obligations; keyboard and focus models; live-region strategy; the canvas
  keyboard model for spatial surfaces; non-visual alternatives for maps and POIs; combat
  announcement rules that cannot leak DM-only data; color-independence requirements; drag
  alternatives and touch-target minima; motion-sensitivity handling; screen-reader patterns for
  dialogs/menus/tabs/trees/disclosures; the automated gate expectations; and the inherited acceptance
  bar that every sibling surface document must satisfy.

- **Does NOT cover:** Visual token values (colors, sizes, easing) — defined in
  `01-visual-design-system.md`, which this document references. Surface-specific widget behavior
  beyond what is needed to state the accessibility rule — those details live in the relevant sibling
  docs (`04`, `06`, `08`, etc.). Functional capability contracts — those are in `../requirements/16-accessibility.md`.

- **Related functional requirements:**
  - `A11Y-001` — WCAG 2.2 AA conformance for core workflows
  - `A11Y-002` — Keyboard-only completion of all critical workflows
  - `A11Y-003` — Focus order, trapping, restoration, roving tabindex, visible indicators
  - `A11Y-004` — Target size and pointer-cancellation contracts
  - `A11Y-005` — Unified motion preference resolution
  - `A11Y-006` — Live announcements for route changes, async status, and session events
  - `A11Y-007` — Accurate names, roles, values, non-color state for all entities
  - `A11Y-008` — Deterministic, isolated a11y CI artifacts
  - `A11Y-009` — Nonvisual list/table summaries for spatial surfaces
  - `A11Y-010` — Release gates failing on unapproved AA-blocking violations
  - `A11Y-011` — Color-independent state across all semantic tokens and overlays

- **Related UX docs:**
  - `01-visual-design-system.md` — owns contrast tokens, focus-ring tokens, motion tokens, density
  - `02-navigation-and-platform-profiles.md` — owns tab-order at navigation level
  - `04-canvas-scene-widgets.md` — inherits canvas keyboard model from here
  - `06-maps.md` — inherits map alt/description strategy from here
  - `08-sessions-live-play.md` — inherits live-combat announcement rules from here

---

## 2. UX goals for this surface

Accessibility is not a mode or a feature flag — it is the baseline quality of every surface. The
product serves players and DMs under live-play time pressure; an inaccessible hot path fails the
table, not just the individual user.

| Parameter | Goal for this surface |
|---|---|
| Visual appeal | Focus indicators are designed, not bolted on — they use the token ring system (color + offset + shape) and never look like browser defaults. High-contrast mode uses the same layout; nothing reflows or collapses. |
| Information scent | Accessible names mirror visible labels exactly. ARIA descriptions add the scent the visual context provides sighted users — widget type, binding, state — without fabricating information. |
| Navigability | Landmark structure (`main`, `nav`, `region`, `complementary`) plus heading hierarchy (one `h1` per route) let screen-reader users jump directly to any area. Canvas widgets are reachable via a dedicated Scene Outline without spatial traversal. |
| Intuition / learnability | ARIA roles map to familiar patterns (APG: dialog, menu, tree, tabs, disclosure, grid). A user who knows the WAI-ARIA Authoring Practices Guide should find no surprises. |
| Accessibility | WCAG 2.2 AA is the floor, not the ceiling. Zero axe critical/serious violations in CI. Full keyboard parity for every Must-have action. Reduced-motion, high-contrast, and large-text supported without separate modes. |
| Adaptability (platform profiles) | Desktop: keyboard shortcuts and mouse interactions at full parity. Tablet/Mobile: ≥44×44 CSS px touch targets, virtual-keyboard-safe layouts (no fixed content obscured by IME), TalkBack/VoiceOver gesture paths for every action. |
| Effective emphasis | State (selected, disabled, error, hidden, bloodied, concentrating) is always communicated by role/name/value or a visible non-color indicator alongside any color change. Never color-only. |
| Feedback & responsiveness | Live regions acknowledge actions within one browser repaint. Assertive regions reserved for urgent errors and critical combat events only. Polite regions for routine status. Announcements are debounced to prevent flooding. |
| Error prevention & recovery | Accessible error messages are inline, associated with their field via `aria-describedby`, and actionable. Validation never clears fields on error. |
| Consistency | One implementation of each pattern (focus-trap, roving-tabindex, live-announcer, drag-alternative) used everywhere. No bespoke implementations per surface. |

---

## 3. Researched best practices

### 3.1 WCAG 2.2 new success criteria

WCAG 2.2 (published October 2023) added criteria beyond 2.1 AA that this product must satisfy [1]:

- **2.4.11 Focus Not Obscured (Minimum, AA):** When a component receives keyboard focus, it is not
  entirely hidden by author-created content (e.g., sticky headers, floating toolbars, toast stacks).
  *Implication: The canvas toolbar and any pinned UI chrome must not fully cover a focused widget.*
- **2.4.12 Focus Not Obscured (Enhanced, AAA):** No part of the focus indicator is hidden. Targeting
  this as the practical bar for all surfaces except the canvas where partial obscurement may be
  unavoidable.
- **2.4.13 Focus Appearance (AA):** Focus indicators must have a minimum area of the perimeter of
  the unfocused component × 2 CSS px, a contrast ratio ≥ 3:1 between focused/unfocused states, and
  ≥ 3:1 against adjacent colors. *Implication: Thin 1px outlines fail; use 2px offset ring from
  token `--focus-ring-width: 2px; --focus-ring-offset: 2px`.*
- **2.5.7 Dragging Movements (AA):** All drag operations have a single-pointer alternative. *Implication:
  every canvas drag, map pin drag, and widget resize must have a keyboard or menu alternative.*
- **2.5.8 Target Size (Minimum, AA):** Interactive targets are ≥ 24×24 CSS px or have sufficient
  spacing such that the bounding box is ≥ 24×24 px. *Implication: 24 px is the hard floor; 44 px
  is the recommended touch target.*
- **3.2.6 Consistent Help (AA):** If a help mechanism (tooltip, documentation link, contact) appears
  on multiple pages, it appears in the same relative position. *Implication: the "?" / help trigger
  in the Command Center must appear at the same position across all routes.*
- **3.3.7 Redundant Entry (AA):** Information entered by the user is not re-requested in the same
  session unless necessary. *Implication: campaign/session context (campaign name, DM identity)
  must not be re-entered within the same flow.*
- **3.3.8 Accessible Authentication (Minimum, AA):** No cognitive function test is required for
  authentication (e.g., no CAPTCHA without an alternative). *Implication: any login or join-session
  flow must not rely on recognizing distorted text without an alternative.*

### 3.2 Infinite canvas keyboard accessibility

The WAI-ARIA APG does not yet have a canonical pattern for infinite spatial canvases (as of 2024)
[2]. Research into Figma, Excalidraw, and Miro reveals three converging patterns:

1. **Two-mode access:** A spatial mode (arrow keys pan/move within the canvas viewport) and a
   structural mode (a separate "layers/outline" panel that presents widgets as a DOM list with full
   tabindex navigation). Figma's Layers panel and Excalidraw's "element list" are the reference
   implementations [3][4].
2. **Roving tabindex on the canvas surface:** Only one widget holds tabindex=0 at a time; arrow keys
   move focus-ring to adjacent widgets (by reading order / spatial order). Home/End jump to first/last.
3. **Action mode:** When a widget is focused (selected), Enter enters "action mode" where Tab cycles
   through the widget's internal controls (resize handles, link port, properties). Escape returns to
   the spatial level [5].
   *Implication: the canvas must implement both a roving-tabindex spatial mode and a Scene Outline
   panel as the canonical non-visual access path.*

### 3.3 Maps and fog-of-war non-visual access

WCAG 2.1 Technique G92 (providing long descriptions for non-text content) and H45 (using `longdesc`)
are the formal guidance [6], but modern practice favors `aria-describedby` pointing to a visually
hidden structured summary, or an explicit "accessible description" toggle. The critical constraint
for this product: the nonvisual description of a map must not leak DM-only content (hidden POIs,
fog-of-war state) to player screen readers. Player ARIA must only reference the visible-to-player
version of the map.
*Implication: map alt/description must be computed from the player-visible layer, not the raw data
model.*

### 3.4 Live-region strategy for combat

The W3C ARIA spec defines two live-region politeness levels [7]:
- `aria-live="polite"` — waits for the user to be idle; use for non-urgent status updates.
- `aria-live="assertive"` — interrupts immediately; reserve for errors and critical warnings.

For combat, a graduated strategy is needed: turn changes and HP updates are "polite"; death saves
and round-end triggers may be "assertive." Critically, assertive announcements must not include
combatant names or HP values that are hidden from the current role — an assertive announcement of
"Goblin Ambusher drops to 4 HP" to a player whose DM has hidden that token leaks DM-only data.
*Implication: live-region content for combat must be filtered by the same visibility predicate that
governs the visual display.*

### 3.5 Color-only states

WCAG 1.4.1 (Use of Color) requires that color is never the sole means of conveying information [8].
WCAG 1.4.11 (Non-text Contrast) requires ≥ 3:1 contrast ratio for the visual presentation of UI
components and graphical objects relative to adjacent colors [9]. For a product with rich status
color (role badges, health gradients, visibility indicators, fog states), this means:
- Every color badge needs a text label, icon, or pattern fill as a redundant signal.
- Focus indicators need ≥ 3:1 contrast against their background (2.4.13).
- Disabled controls need shape/pattern change, not just opacity.
*Implication: design tokens must encode both the color AND the non-color indicator (e.g., icon name
or pattern ID) for every semantic state.*

### 3.6 Touch target research

Apple HIG specifies 44×44 pt as the minimum touch target for all interactive elements [10]. Material
Design 3 specifies 48×48 dp [11]. WCAG 2.5.8 sets a hard minimum of 24×24 CSS px with exceptions.
GOV.UK Design System uses 44×44 px as a hard floor [12]. The converging practice is:
- 24 px: WCAG 2.5.8 absolute minimum (no spacing exception for this product — too tight for
  the map/canvas context)
- 44 px: recommended for all touch targets on Tablet and Mobile profiles
- Desktop: minimum 24×24 px hit area; visual size may be smaller if spacing compensates
*Implication: all button, icon-button, and canvas-handle components must expose an explicit
touch-target size token separate from visual size.*

### 3.7 Screen-reader patterns (APG)

The WAI-ARIA Authoring Practices Guide [2] defines canonical patterns this product must implement:
- **Dialog (modal):** `role=dialog`, `aria-modal=true`, `aria-labelledby` pointing to the dialog
  title, focus trapped inside, Escape closes and returns focus to trigger.
- **Menu/Menubar:** `role=menu`/`menubar`, arrow key navigation, Home/End, Escape closes, item
  roles `menuitem`/`menuitemcheckbox`/`menuitemradio`.
- **Tabs:** `role=tablist`, `role=tab`, `role=tabpanel`, `aria-selected`, arrow-key selection,
  Tab enters panel.
- **Tree:** `role=tree`, `role=treeitem`, `aria-expanded`, arrow keys to navigate, right/left to
  expand/collapse, Enter to activate.
- **Disclosure (show/hide):** Button with `aria-expanded` controlling a `<div>` whose visibility
  is managed via `hidden` or CSS, not `aria-hidden` (which defeats the purpose).
- **Grid/spreadsheet:** `role=grid`, `role=row`, `role=gridcell`, arrow-key cell navigation,
  Enter/F2 to enter edit mode, Escape to exit.

---

## 4. Reference implementations (exemplars)

| Product | What they do well (specific) | Principle / why it works | Borrow / Avoid | Link |
|---|---|---|---|---|
| Figma | Layers panel as the canonical keyboard/SR path for canvas objects; spatial canvas also supports arrow-key widget movement with screen-reader announcements of position deltas | Two-mode canvas access — structural list for full AT parity, spatial mode for power users | Borrow: two-mode architecture, position-delta announcements (e.g., "moved 10px right") | https://help.figma.com/hc/en-us/articles/360039956914-Accessibility-features-in-Figma |
| Excalidraw | Open-source accessible canvas: keyboard selection, arrow-key movement, Tab cycling through elements, explicit element list in sidebar | Minimal but complete: every drawn element is addressable by keyboard without requiring the pointer | Borrow: Tab-cycles-all-elements model; Avoid: no role-visibility filtering (not a problem Excalidraw has) | https://github.com/excalidraw/excalidraw/issues/3780 |
| GOV.UK Design System | Focus-ring at 3px yellow/black, zero browser-default reliance; all state described by text not just color; strict target sizes; full WCAG 2.2 implementation notes | Government-grade accessibility: the highest real-world evidence bar outside specialist tools | Borrow: focus ring implementation detail (high-contrast yellow over dark AND light backgrounds); consistent help pattern | https://design-system.service.gov.uk/accessibility/ |
| Inclusive Components (Heydon Pickering) | Definitive implementations of dialog, menu, tabs, tree, disclosure, card patterns with full ARIA wiring | Evidence-based, peer-reviewed patterns that map exactly to the WAI-ARIA APG | Borrow: all ARIA wiring details verbatim | https://inclusive-components.design/ |
| Deque/axe-core | Rule taxonomy maps every violation to a WCAG SC; "best-practice" rules cover common gaps not yet in WCAG | Automated rule set that the CI gate uses directly | Borrow: rule IDs as references in acceptance criteria; axe.run() against every route | https://dequeuniversity.com/rules/axe/ |

**North-star exemplars:**

1. **Figma's Layers panel** is the single most important reference for this product's canvas a11y story. It proves that an infinite spatial canvas can be fully keyboard- and screen-reader-accessible without crippling the spatial UI — the key is the parallel structural list. Every design decision about the Scene Outline should ask: "does this give a screen reader user the same power Figma's Layers panel gives?"

2. **GOV.UK Design System** sets the standard for "designed, not bolted on" accessibility. Their focus indicator (3px solid yellow, 3px solid black offset, works on any background) inspired the WCAG 2.4.13 approach this product must use. Their consistency enforcement — same component everywhere, never bespoke — is the model for this product's one-pattern-per-problem rule.

3. **Deque's axe-core rule set** is the north star for automated enforcement. Every requirement in this document that can be expressed as an axe rule is expressed that way. The CI gate owns the machine-checkable portion; this document owns the human-checkable contract.

---

## 5. UX/UI requirements

---

### UX-A11Y-001 — WCAG 2.2 AA as the binding conformance floor

- **Requirement:** Every route, dialog, widget, canvas surface, map, and combat interface must
  conform to WCAG 2.2 Level AA. No success criterion may be knowingly left unmet without a
  documented, owner-assigned exception with a remediation date.
- **Rationale:** `A11Y-001`; WCAG 2.2 [1]; package principle 9 ("Accessible is the baseline,
  not a mode").
- **Spec:** Conformance is against the full WCAG 2.2 AA success criteria set, including the 2.2
  additions (2.4.11, 2.4.12, 2.4.13, 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8). The known-violation
  register (`docs/development/ACCESSIBILITY.md` §4) must be maintained, with every open item
  carrying severity, WCAG SC, owner, and remediation date. AAA criteria are aspirational targets
  where feasible (2.4.12, 1.4.6, 2.5.5).
- **States:** n/a (conformance obligation)
- **Platform profiles:** All profiles; WCAG applies independent of viewport or input modality.
- **Input:** All modalities.
- **Accessibility:** This requirement IS the accessibility contract.
- **Acceptance criteria:**
  - Given any primary route, when axe.run() is executed in CI against the route, then zero critical
    and zero serious violations are reported (excluding items in the approved known-violation register
    with a future remediation date).
  - Given any new WCAG 2.2 AA success criterion applicable to an added interaction, when a PR is
    opened, then the PR description explicitly states which criteria were tested.
  - Given a known violation's remediation date passes, when CI runs, then the gate fails until the
    violation is resolved or the date is extended with owner approval.
- **Priority:** Must-have

---

### UX-A11Y-002 — Keyboard parity for all Must-have actions

- **Requirement:** Every Must-have action available via pointer or touch must be completable via
  keyboard alone, producing the same core command result. No Must-have workflow may have a
  pointer-only step.
- **Rationale:** `A11Y-002`; WCAG 2.1.1 (Keyboard); WCAG 2.5.7 (Dragging Movements) [1][13].
- **Spec:** The canonical keyboard map below (§6) lists every must-have action and its keyboard
  path. Actions without a keyboard path are not considered complete. Keyboard equivalents for drag
  operations must dispatch the identical processing-core command as the drag gesture.
- **States:** n/a
- **Platform profiles:**
  - Desktop: physical keyboard shortcuts as listed; access via Tab + Enter as fallback.
  - Tablet: hardware keyboard attached — same shortcuts as Desktop. Virtual keyboard — touch-only
    paths still backed by an accessible action button or menu item.
  - Mobile: no hardware keyboard assumed; all actions must be reachable via touch target + context
    menu/action sheet. When hardware keyboard is attached, Desktop shortcuts apply.
- **Input:** Keyboard (every shortcut documented); touch (action alternatives documented per
  surface); pointer (primary).
- **Accessibility:** Compliance with WCAG 2.1.1 and 2.5.7.
- **Acceptance criteria:**
  - Given keyboard-only input, when a tester completes session start, global search, initiative
    advance, and note create/edit/save flows, then no pointer-only step is encountered.
  - Given a drag operation (widget move, widget resize, map pin drag, canvas pan), when the
    keyboard alternative is used, then the processing core receives the same command as the drag
    gesture.
  - Given a touch-only device (no hardware keyboard), when every Must-have action is exercised,
    then each action is reachable via a touch target with no pointer-drag requirement.
- **Priority:** Must-have

---

### UX-A11Y-003 — Canvas keyboard model: selection, move, resize, link

- **Requirement:** The infinite canvas (Scene surface) must support a fully keyboard-operable model
  for selecting, moving, resizing, and linking widgets — implemented as roving tabindex in spatial
  mode plus a separate Scene Outline panel as the structural mode.
- **Rationale:** `A11Y-002`, `A11Y-009`; Figma accessibility model [3]; WAI-ARIA APG grid/listbox
  patterns [2]; WCAG 2.1.1.
- **Spec:**
  - **Spatial mode:** The canvas has a single tabindex=0 entry point (the canvas element or a
    canvas container landmark). Arrow keys move focus between widgets spatially (nearest neighbor in
    the arrow direction). Tab/Shift+Tab cycle through widgets in document/layer order. Home/End jump
    to first/last widget in layer order.
  - **Action mode:** Enter on a focused widget enters action mode. In action mode, Tab cycles
    through the widget's internal handles (resize corners, link ports, text fields). Escape exits
    action mode and returns to spatial mode with the widget still focused.
  - **Movement:** When a widget is focused in spatial mode, Ctrl+Arrow moves the widget by the
    grid snap increment (default 8px; fine mode Shift+Ctrl+Arrow = 1px). The announcement says
    "Widget moved to X [position description]."
  - **Resize:** In action mode, focusing a resize handle and pressing Arrow keys resizes by the
    snap increment. Announcement says "Widget resized to W×H."
  - **Link:** In action mode, focusing a link port and pressing Enter begins a link operation.
    Arrow keys select the target widget; Enter completes the link. Escape cancels. Announcement
    says "Link from [source] to [target] created."
  - **Delete:** Delete or Backspace on a focused widget (not in text edit mode) triggers the delete
    confirmation flow.
  - **Multi-select:** Shift+arrow extends selection. Ctrl+A selects all visible widgets.
  - **Scene Outline panel:** A persistent or on-demand panel listing all widgets in layer order as
    an ARIA tree or listbox. Each item has: accessible name (widget type + bound entity display
    name, visibility-safe), expand/collapse for grouped widgets, context menu for actions. This is
    the canonical path for screen-reader users who cannot use the spatial model.
- **States:** spatial-focus / action-mode / multi-select / empty-canvas (announce "Canvas empty —
  use the toolbar to add a widget")
- **Platform profiles:**
  - Desktop: full keyboard model as above; Scene Outline in a collapsible sidebar panel.
  - Tablet: hardware keyboard follows Desktop model; on-screen Scene Outline accessible via toolbar
    icon; touch handles for resize/move on widget.
  - Mobile: Scene Outline is the primary non-visual access path (spatial mode not practical on
    small screen); touch handles exposed; no spatial keyboard model required on mobile-only.
- **Input:** keyboard (shortcuts above); touch (widget touch handles + Scene Outline); pointer
  (full spatial drag).
- **Accessibility:** `role=application` on the canvas container with `aria-label="Scene canvas"`;
  each widget has `role=group` or an appropriate landmark with `aria-label` derived from entity
  name (visibility-safe); focused widget announces its type, name, and position (e.g., "Map widget:
  Undermountain — row 2, column 3 of 6").
- **Acceptance criteria:**
  - Given a keyboard-only user on the canvas, when Tab is pressed from the toolbar, then focus
    enters the canvas and the first widget receives a visible focus ring.
  - Given a widget is focused in spatial mode, when Enter is pressed, then action mode is entered
    and Tab cycles through internal handles.
  - Given a widget is in action mode, when Escape is pressed, then action mode exits and the widget
    retains focus in spatial mode.
  - Given a widget is focused in spatial mode, when Ctrl+Arrow is pressed, then the widget moves by
    the grid snap increment and a polite announcement confirms the new position.
  - Given the Scene Outline is open and a widget is activated from it, when Enter/Space is pressed,
    then the canvas scrolls to and focuses the widget.
  - Given the canvas is empty, when focus enters the canvas, then a polite announcement says
    "Canvas empty — use the toolbar to add a widget."
- **Priority:** Must-have

---

### UX-A11Y-004 — Scene Outline: structural access to spatial surface

- **Requirement:** A Scene Outline panel must provide a keyboard-navigable, screen-reader-accessible
  list of all canvas widgets, usable without spatial orientation.
- **Rationale:** `A11Y-009`; Figma Layers panel reference [3]; WCAG 1.3.1, 2.1.1.
- **Spec:**
  - Implemented as an ARIA tree (`role=tree`) or ordered list (`role=listbox`) depending on whether
    widgets have nesting/grouping.
  - Each widget item includes: accessible name (visibility-safe — see UX-A11Y-008 on
    leakage), widget type icon (decorative), layer order position, and visibility state
    (visible / hidden / DM-only — but player-role items never expose DM-only labels).
  - Context menu on each item exposes: focus on canvas, edit properties, bring to front/back, link
    to, delete.
  - Filter by type and search by name available.
  - Panel keyboard: Up/Down arrows navigate items; Right/Left expand/collapse groups; Enter activates
    context; Space toggles selection. Typing in the search field filters the list.
- **States:** populated / empty / filtered-empty ("No widgets match filter")
- **Platform profiles:**
  - Desktop: persistent collapsible sidebar panel, keyboard shortcut `Ctrl+Shift+L` to focus.
  - Tablet: slide-over sheet; accessible from toolbar icon.
  - Mobile: full-screen sheet accessible from toolbar; primary non-visual canvas access path.
- **Input:** keyboard (arrow keys, Enter, Space, Ctrl+Shift+L); touch (swipe-to-open, tap to
  activate); pointer (click to select, right-click context).
- **Accessibility:** `aria-label="Scene outline"` on the panel landmark; tree/listbox ARIA as
  above; live region on count: "5 widgets".
- **Acceptance criteria:**
  - Given the Scene Outline is open, when a screen-reader user presses Down, then each widget item
    is announced by name and type in layer order.
  - Given a widget item is activated from the Scene Outline, when Enter is pressed, then the canvas
    scrolls to and visually focuses the widget, and focus returns to the canvas element.
  - Given the current user is a Player, when the Scene Outline lists widgets, then no DM-only
    widget names, labels, or descriptions appear in the list.
- **Priority:** Must-have

---

### UX-A11Y-005 — Maps: non-visual access and fog-of-war safety

- **Requirement:** Every map surface must provide a structured nonvisual summary of visible POIs,
  routes, and areas; this summary must be computed from the player-visible layer and must never
  expose fog-of-war state or DM-only POIs to player screen readers.
- **Rationale:** `A11Y-007`, `A11Y-009`; WCAG 1.1.1 (Non-text Content); G92 long descriptions [6];
  principle 8 (visibility boundary must never leak).
- **Spec:**
  - **Map alt text:** The map image/canvas element has a concise `aria-label` describing the map
    name and scale (e.g., "Map: Undermountain Level 1 — dungeon map"). The concise label does not
    describe content (content is in the structured summary).
  - **Structured summary:** An accessible "Map summary" panel or drawer lists: visible POIs (name,
    type, optional brief description), visible routes (from, to, name), and visible areas (name,
    type). Activated by a "Map accessibility summary" button adjacent to the map.
  - **Visibility filtering:** The summary data source is the player-visible layer predicate, not
    the raw POI model. DM-only POIs, hidden markers, and fog-covered areas are completely absent
    from the player summary. The DM's summary includes all data.
  - **Fog state announcements:** When fog-of-war state changes (reveal, hide), a polite
    announcement is issued to all users with the change visible to them. The announcement does not
    mention areas still hidden: "Area revealed: The Sunken Plaza" (not "Area hidden from players:
    The Guard Post").
  - **POI activation:** From the map summary list, pressing Enter on a POI focuses the map at that
    POI location, centers the viewport, and announces the POI's name and type. If the user is a
    player and the POI is not accessible to them, it does not appear in the list.
  - **Map image alt:** For static map images (uploaded handouts), `alt` text follows WCAG 1.1.1 —
    decorative maps use `alt=""`, content maps use a brief description plus reference to the
    structured summary.
- **States:** loading / populated / empty ("No visible points of interest") / error
- **Platform profiles:**
  - Desktop: map summary panel in a collapsible sidebar; keyboard shortcut `Ctrl+Shift+M`.
  - Tablet/Mobile: map summary as a bottom sheet, triggered by a dedicated button.
- **Input:** keyboard (Tab to navigate POI list, Enter to focus POI, Escape to close summary);
  touch (tap POI in list); pointer (click).
- **Accessibility:** map container `role=application` or `role=img` per context; summary panel
  `aria-label="Map accessibility summary"`; POI list items `role=listitem` with `aria-label` =
  "{POI name}, {type}".
- **Acceptance criteria:**
  - Given a map with five visible POIs and two DM-only POIs, when a Player user opens the map
    summary, then exactly five POIs appear and zero DM-only POIs appear.
  - Given fog-of-war reveals an area, when a Player screen reader user is present, then a polite
    announcement names the revealed area without mentioning any still-hidden area.
  - Given a DM activates fog-of-war hide on a visible area, when a Player is using the map, then
    neither the summary nor any announcement reveals the hidden area's name or existence to the
    player.
  - Given a POI is activated from the map summary, when Enter is pressed, then the map viewport
    centers on the POI and the POI name is announced.
- **Priority:** Must-have

---

### UX-A11Y-006 — Live combat: graduated announcements without data leakage

- **Requirement:** Combat state changes (initiative order, turn advance, HP change, status
  effects, death saves) must be announced via ARIA live regions at the appropriate politeness
  level, and announcement content must be filtered by the current user's role visibility predicate.
- **Rationale:** `A11Y-006`, `A11Y-007`; WCAG 4.1.3 (Status Messages); WAI-ARIA live regions [7];
  principle 8 (visibility boundary never leaks).
- **Spec:**
  - **Politeness levels:**
    - `polite`: HP change, status effect applied/removed, condition gained/lost, end of turn.
    - `assertive`: combatant death (final save failed), player character incapacitated, round change
      (DM override), critical error in combat state.
  - **Visibility filtering rules:**
    - A combatant is "visible" to a user if: (a) it is not DM-only, OR (b) the user is the DM.
    - Announcement text for a combatant event uses the combatant's *visible name* if visible; if
      the combatant is hidden from the user, the event is suppressed — the user does not hear
      anything about that combatant.
    - HP values are announced only if the DM has enabled HP visibility for that combatant type
      (a per-combatant or per-role setting).
    - Example (DM): "Goblin Ambusher — 4 HP remaining, bloodied." (polite)
    - Example (Player, same event, HP not visible): "Goblin Ambusher — bloodied." (polite)
    - Example (Player, combatant hidden): [no announcement]
    - Example (Player character incapacitated): "[Character Name] is incapacitated." (assertive)
  - **Turn advance:** "It is now [combatant name]'s turn, initiative [value]." (polite)
  - **Round change:** "Round [N] begins." (polite for normal; assertive if DM-triggered reset)
  - **Debouncing:** Rapid HP events (e.g., area-of-effect hitting multiple combatants) are
    batched into a single announcement: "3 combatants affected by [effect]." Individual
    announcements fire after a 300 ms debounce per combatant.
  - **Live region implementation:** A single `LiveAnnouncer` singleton (building on the v1
    `LiveAnnouncer.svelte`) with separate polite and assertive ARIA regions. Surface-specific
    components call the announcer API; they do not add their own live regions.
- **States:** active-combat / out-of-combat (no combat announcements) / combat-paused
- **Platform profiles:** Identical across all profiles (live regions are screen-reader concerns,
  not layout concerns).
- **Input:** n/a (these are output/announcement requirements).
- **Accessibility:** `aria-live="polite"` region with `aria-atomic="true"` for polite queue;
  `aria-live="assertive"` region with `aria-atomic="true"` for urgent queue; both regions
  visually hidden (`sr-only`) but always in the DOM from page load.
- **Acceptance criteria:**
  - Given a Player screen reader user in combat with a hidden DM-only combatant, when that
    combatant takes damage, then no announcement is emitted to the player.
  - Given a Player screen reader user, when initiative advances to a combatant whose HP is not
    visible to the player, then the turn announcement states the combatant name but not HP.
  - Given a Player character's HP drops to 0, when the incapacitation event fires, then an
    assertive announcement "[Character Name] is incapacitated" is emitted to all users who can
    see that character.
  - Given 5 combatants are affected by an area effect within 200 ms, when the announcements
    would fire, then a single batched announcement is emitted after 300 ms instead of 5 individual
    announcements.
  - Given the combat surface is inspected by axe, when the test runs, then zero violations are
    found on the `aria-live` regions (no duplicate live regions, correct roles).
- **Priority:** Must-have

---

### UX-A11Y-007 — Color independence: state never color-only

- **Requirement:** No state, role, status, or distinction that a user needs to understand or act on
  may be conveyed by color alone. Every color-coded indicator must have a text label, icon, shape,
  pattern, or ARIA state as a redundant signal.
- **Rationale:** `A11Y-007`, `A11Y-011`; WCAG 1.4.1 (Use of Color) [8]; WCAG 1.4.11 (Non-text
  Contrast) [9].
- **Spec:**
  - **Role badges (DM / Player / Observer):** Color tint from design-token semantic role color +
    text label (never icon-only or color-only on the badge itself).
  - **Health state (full / bloodied / critical / dead):** Color gradient on HP bar + icon (full
    heart / cracked heart / half-heart / skull) + text percentage or numeric value. The icon and
    text are visible to users for whom HP is visible; for others, only the visible subset is shown.
  - **Visibility state (visible / hidden / DM-only):** Token-driven icon (eye-open / eye-strikethrough
    / lock) alongside any color tint. The `aria-label` or `aria-description` of the element states
    visibility in text.
  - **Fog-of-war covered area:** Texture or hatching overlay in addition to the fog color fill.
    The ARIA description of the map region states "fog of war" not just the background color.
  - **Combatant status effects (concentrating, stunned, poisoned, etc.):** Status badge uses a
    distinct icon-per-effect plus a short text label (or `aria-label`). Never rely on badge color
    alone.
  - **Active/current-turn combatant:** Bold border + a "Current turn" text annotation in the
    initiative row (screen-reader only is acceptable here) + arrow/chevron icon.
  - **Selected/focused canvas widget:** Distinct focus ring (2px ring + 2px offset, contrasting
    color) + selection handles (visible shape change), not color alone.
  - **Error state on form fields:** Red border + error icon (`⚠` or `✕`) + inline error text
    associated via `aria-describedby`. Never only red border.
  - **Sync / offline / saving state:** Icon change + text label in the status bar. Not icon/color
    alone.
  - **Design token rule:** Every semantic token that encodes state (e.g., `--color-status-error`,
    `--color-hp-bloodied`) must be paired with a sibling token or design note specifying the
    non-color indicator. Defined in `01-visual-design-system.md`.
- **States:** All state indicators listed above.
- **Platform profiles:** Identical requirement across profiles; icon sizes must meet non-text
  contrast at all densities.
- **Input:** n/a (output requirement).
- **Accessibility:** All state-bearing icons must have `aria-label` or be accompanied by a
  visually-hidden text span. Icons that are purely decorative when text label is present use
  `aria-hidden="true"`.
- **Acceptance criteria:**
  - Given high-contrast mode is active, when any status badge, HP bar, fog overlay, role badge,
    or sync state is rendered, then a shape/icon/text indicator is present and visible independently
    of color.
  - Given a screen reader user focuses a bloodied combatant row, when inspected, then the
    accessible name or description includes "bloodied" in text, not only a color token.
  - Given a form field has an error, when inspected by a screen reader, then the error message
    is associated via `aria-describedby` and the field has `aria-invalid="true"`.
  - Given the grayscale test is applied to the combat tracker and map, when viewed, then every
    meaningful state distinction remains distinguishable.
- **Priority:** Must-have

---

### UX-A11Y-008 — Visibility boundary in ARIA: no leakage via accessible names or live regions

- **Requirement:** Accessible names, descriptions, alt text, and live-region content must be
  generated from the same visibility-filtered data model that drives the visual display. DM-only
  information must never appear in any ARIA output directed at player or observer roles.
- **Rationale:** `A11Y-007`; package principle 8 (visibility boundary must never leak through any
  channel, including ARIA live regions and alt text) [00-overview §1.8].
- **Spec:**
  - **Rendering rule:** All accessible-name computation functions receive the current user's
    visibility predicate as a parameter. They must not access the raw data model directly.
  - **Hidden widgets on canvas:** DM-only widgets that are invisible to the player have no ARIA
    representation in the player DOM. They are neither in the roving-tabindex sequence nor in the
    Scene Outline for players.
  - **Hidden combatants in combat tracker:** Combatant rows hidden from players are not rendered
    into the player DOM. They produce no live-region announcements for players (see UX-A11Y-006).
  - **Hidden POIs on maps:** DM-only POIs do not appear in the player map summary (see UX-A11Y-005).
  - **Handouts:** A handout not yet delivered to a player has no accessible name in the player
    context.
  - **Search results:** Search results that a player cannot view are excluded from player search
    ARIA output (not just visually hidden — removed from the DOM or `aria-hidden="true"` on
    hidden items, but preferably not rendered at all for players).
  - **Testing obligation:** Every screen-reader QA checklist run must include a Player-role session
    verifying that DM-only content is absent from all ARIA output. This is a required checklist
    item in `docs/development/ACCESSIBILITY_QA.md`.
- **States:** DM session / Player session / Observer session.
- **Platform profiles:** Identical; the visibility predicate applies regardless of device.
- **Input:** n/a (rendering contract).
- **Accessibility:** The single most safety-critical a11y requirement in this product.
- **Acceptance criteria:**
  - Given a Player is using a screen reader, when a DM-only map POI exists on the current map,
    then no accessible name, live-region text, or alt text mentioning the POI name appears in the
    player's browsing context.
  - Given a Player is using a screen reader, when a DM-only canvas widget exists on the Scene,
    then the widget does not appear in Tab order, Scene Outline, or any live announcement.
  - Given a Player session is tested with axe and a DOM inspection tool, when DM-only objects exist,
    then zero references to DM-only names/data appear in the ARIA tree for the player context.
- **Priority:** Must-have

---

### UX-A11Y-009 — Focus management: order, trapping, restoration, visible ring

- **Requirement:** Focus must be logically ordered, correctly trapped inside modals, restored to the
  correct element on close, and always visibly indicated — meeting WCAG 2.4.3, 2.4.7, 2.4.11, and
  2.4.13.
- **Rationale:** `A11Y-003`; WCAG 2.4.3, 2.4.7, 2.4.11, 2.4.13 [1]; APG dialog pattern [2].
- **Spec:**
  - **Focus order (2.4.3):** Tab order follows reading order (top-to-bottom, left-to-right within
    each landmark). Canvas widgets are ordered by layer/document order in the roving sequence, not
    by spatial position. No positive `tabindex` values above 0 (they disrupt natural order).
  - **Focus visible (2.4.7):** Every interactive element shows a visible focus ring when focused.
    No `outline: none` without a custom indicator. The focus ring uses design tokens from
    `01-visual-design-system.md`: 2px solid ring, 2px offset, color `--focus-ring-color` (must
    contrast ≥ 3:1 against both ring-adjacent background and the unfocused element, per 2.4.13).
  - **Focus not obscured (2.4.11):** No sticky or fixed UI chrome (toolbar, toast stack, command
    bar) may completely cover a focused element. Scroll margins, z-index ordering, and toast
    placement must account for this. Toast notifications appear above the content but do not
    permanently cover the focal point.
  - **Focus appearance (2.4.13):** Ring area ≥ perimeter × 2 px; contrast ratio of focused vs.
    unfocused state ≥ 3:1; contrast of ring against adjacent colors ≥ 3:1.
  - **Focus trap (modal dialogs):** When a dialog opens, focus moves to the dialog's first
    focusable element (or the dialog's `aria-labelledby` element). Tab cycles within the dialog.
    Escape closes the dialog and returns focus to the trigger. The `focus-trap` utility
    (extending v1's `src/lib/ui/a11y/focus-trap.ts`) handles this uniformly.
  - **Focus trap (command palette / quick switcher):** Same rules as dialogs.
  - **Focus trap (sheets/drawers on mobile):** Same rules; swipe-to-dismiss equivalent to Escape.
  - **Focus restoration:** When a dialog, sheet, menu, or popover closes, focus returns to the
    element that opened it. When a route transitions, focus moves to the route's main landmark (`<main>`)
    or its first heading, not to the document body.
  - **Roving tabindex on grids/canvases:** Only the active item holds `tabindex=0`; all others
    use `tabindex=-1`. Arrow keys update both the DOM focus and the `tabindex=0` assignment atomically.
- **States:** focused / focus-visible (keyboard) / focus-within (parent) / obscured (must not
  happen) / dialog-trapped
- **Platform profiles:**
  - Desktop: keyboard focus ring always visible; no touch-specific changes.
  - Tablet/Mobile: focus ring also visible when hardware keyboard is attached. On touch-only
    interaction, focus ring may be suppressed for pointer events (`:focus-visible` CSS selector
    governs this) but must reappear on keyboard input.
- **Input:** keyboard (Tab, Shift+Tab, arrow keys, Escape, Enter); touch (no focus ring on touch
  tap, per `:focus-visible`).
- **Accessibility:** `focus-trap` utility mandatory for all dialogs, sheets, popovers. No
  exceptions without documented rationale.
- **Acceptance criteria:**
  - Given a modal dialog is open, when Tab is pressed repeatedly, then focus never leaves the
    dialog until Escape is pressed.
  - Given Escape closes a dialog, when it closes, then focus returns to the element that
    triggered the dialog, confirmed by `document.activeElement`.
  - Given any interactive element receives keyboard focus, when inspected visually, then a focus
    ring meeting 2.4.13 contrast and area criteria is visible.
  - Given the canvas toolbar is fixed to the top of the viewport, when a widget in the canvas
    receives keyboard focus, then the widget is scrolled into view such that the focus ring is
    not fully hidden behind the toolbar.
  - Given Tab order is traced on any route, when logged, then no positive `tabindex` values above
    0 are found in the DOM.
- **Priority:** Must-have

---

### UX-A11Y-010 — Touch and pointer targets: size minimums by profile

- **Requirement:** All interactive controls must meet minimum touch-target size requirements per
  platform profile, with no control below the WCAG 2.5.8 minimum of 24×24 CSS px.
- **Rationale:** `A11Y-004`; WCAG 2.5.8 [1]; WCAG 2.5.5 (AAA aspirational); Apple HIG 44pt [10];
  Material Design 3 48dp [11]; GOV.UK 44px [12].
- **Spec:**
  - **Hard floor (all profiles):** 24×24 CSS px bounding box (hit area, not visual size). No
    exceptions without WCAG 2.5.8 documented exception (e.g., native checkbox in a group, inline
    text link that the browser controls).
  - **Recommended (Tablet and Mobile):** 44×44 CSS px touch target. When visual size is smaller
    (icon button 24×24), the hit area is expanded via padding or a `::before`/`::after` pseudo-
    element to 44×44 CSS px. Minimum 8 CSS px spacing between adjacent targets to avoid
    accidental activation.
  - **Desktop:** 24×24 CSS px minimum hit area; visual size may be smaller per density mode.
    Titlebar controls must not overflow the titlebar height (v1 defect `CODEX-PR9-TITLEBAR-HITBOX`
    is fixed in v1; must not regress in v2).
  - **Canvas widget handles (resize, rotate, link):** 24×24 CSS px minimum on Desktop;
    44×44 CSS px on Tablet/Mobile. Resize handles rendered at visual size 8×8 CSS px but hit area
    expanded to 24×24 CSS px on Desktop, 44×44 CSS px on touch profiles.
  - **Context menu trigger (right-click / long-press):** No minimum size requirement (it follows
    the parent element's target); but the alternative action menu button must meet the above sizes.
  - **Pointer cancellation (WCAG 2.5.2):** All drag operations with destructive or irreversible
    effects must support cancellation by dragging back to the origin or pressing Escape during drag.
    Click-and-release events that use `mouseup`/`touchend` must not trigger if the pointer was
    dragged away from the target.
  - **Token:** `--touch-target-min: 44px` (Tablet/Mobile); `--touch-target-desktop: 24px`. Defined
    in `01-visual-design-system.md`.
- **States:** default / hover (pointer) / active (pressed) / disabled (not focusable, reduced opacity
  + shape indicator).
- **Platform profiles:**
  - Desktop: 24 px hard floor; pointer events only.
  - Tablet: 44 px recommended; touch + optional pointer.
  - Mobile: 44 px required; touch only.
- **Input:** pointer (hit area as above); touch (44 px Tablet/Mobile); keyboard (target size does
  not apply to keyboard navigation, but focus ring must be visible at any size).
- **Accessibility:** Touch-target CI check (building on v1's `accessibility.spec.ts` touch-target
  scan) must run against all primary routes on mobile-chromium profile.
- **Acceptance criteria:**
  - Given a Tablet or Mobile profile route, when the touch-target CI scan runs, then every
    interactive control reports a bounding rect ≥ 44×44 CSS px.
  - Given the Desktop profile, when the target-size scan runs, then zero controls fall below
    24×24 CSS px.
  - Given a widget resize handle on the canvas in Mobile profile, when measured, then its touch
    hit area is ≥ 44×44 CSS px even if the visual handle is 8×8 CSS px.
  - Given a drag operation is in progress and Escape is pressed, when Escape fires, then the drag
    is cancelled and the element returns to its original position.
- **Priority:** Must-have

---

### UX-A11Y-011 — Reduced motion: single resolved preference, all surfaces

- **Requirement:** A single resolved motion preference state (OS preference × user override)
  governs all animations, transitions, and reveal effects across every surface. Reduced-motion
  mode must not degrade functionality or information.
- **Rationale:** `A11Y-005`; WCAG 2.3.3 (Animation from Interactions, AAA — target as practical
  bar for non-essential motion) [1]; `prefers-reduced-motion` media query.
- **Spec:**
  - **Resolution precedence:** (1) user in-app override (Settings → Appearance → Motion) if set;
    (2) OS `prefers-reduced-motion` media query value; (3) default = motion-allowed.
  - **Reduced-motion contract:** When motion is reduced:
    - Transitions: instant (0 ms) or ≤ 100 ms cross-fade. No sliding panels; content appears
      in place.
    - Reveal animations: instant opacity change instead of slide/scale.
    - Map transitions (pan, zoom): instant repositioning instead of smooth scroll.
    - Canvas widget move animations: instant repositioning.
    - Dice roll animation: static result shown immediately (no tumbling animation).
    - Loading skeletons: static placeholder, no pulse wave animation.
    - Toast appear/dismiss: instant, no slide.
    - Fog-of-war reveal: instant fill change, no expanding fog animation.
    - Initiative tracker advance: instant row highlight, no scroll animation.
  - **Non-reduced motion contract:** All motion follows the motion system defined in
    `01-visual-design-system.md`. Durations: 100–300 ms standard; 400 ms for large transitions.
    Easing: `ease-out` for enter, `ease-in` for exit.
  - **Implementation:** A single CSS class on `<html>` (`data-motion="reduced"` / `data-motion="full"`)
    set by the resolved preference. All motion is gated by this class or the media query, never
    by component-local logic.
- **States:** motion-full / motion-reduced
- **Platform profiles:** Identical; the OS media query is respected on all platforms. Android
  "Remove animations" and iOS "Reduce Motion" both trigger `prefers-reduced-motion: reduce`.
- **Input:** n/a (CSS/rendering contract).
- **Accessibility:** Respects WCAG 2.3.3 and the WAI-ARIA guidance on avoiding vestibular triggers.
- **Acceptance criteria:**
  - Given OS reduced motion is enabled, when any animated element transitions, then no sliding,
    scaling, or rotating animation plays (only instant or ≤ 100 ms opacity change).
  - Given OS reduced motion is enabled and the user has not set an override, when motion resolution
    is checked, then the app emits `data-motion="reduced"` on the html element.
  - Given the user sets in-app motion preference to "full" while OS reduced motion is enabled,
    when motion resolution is checked, then the app emits `data-motion="full"` (user override wins).
  - Given reduced motion is active, when a dice roll is triggered, then the result is displayed
    immediately with no roll animation.
- **Priority:** Must-have

---

### UX-A11Y-012 — Screen-reader patterns: dialog, menu, tabs, tree, disclosure, grid

- **Requirement:** All instances of dialog, menu/menubar, tabs, tree, disclosure, and grid UI
  patterns must implement the WAI-ARIA Authoring Practices Guide canonical pattern for that widget
  type, using the shared component library. No bespoke implementations.
- **Rationale:** `A11Y-003`, `A11Y-007`; WAI-ARIA APG [2]; Inclusive Components [5].
- **Spec:**

  **Dialog / Modal:**
  - `role=dialog`, `aria-modal=true`, `aria-labelledby={dialogTitleId}`.
  - First focusable element receives focus on open (or the dialog title if no focusable element
    precedes it).
  - Tab cycles within; Shift+Tab cycles backward. No escape to background.
  - Escape closes; focus returns to trigger.
  - Backdrop click closes (configurable; destructive-confirmation dialogs may disable backdrop
    close).
  - Alert dialogs use `role=alertdialog`.

  **Menu / Context menu:**
  - `role=menu`, children `role=menuitem` / `role=menuitemcheckbox` / `role=menuitemradio`.
  - Arrow Up/Down navigate; Arrow Right/Left open/close submenus.
  - Home/End jump to first/last item. Typeahead (first character match).
  - Escape closes menu and returns focus to trigger.
  - Enter/Space activates item.
  - `aria-haspopup=menu` on the trigger button.

  **Tabs:**
  - `role=tablist` on container, `role=tab` per tab, `role=tabpanel` per panel.
  - `aria-selected=true` on active tab; `aria-controls={panelId}` on tab.
  - Arrow Left/Right navigate tabs (automatic activation on arrow key — do not require Enter to
    switch, per APG recommendation for this product's density).
  - Tab enters the active panel; Shift+Tab returns to the tablist.

  **Tree (Scene Outline, content hierarchy):**
  - `role=tree`, `role=treeitem` per item, `aria-expanded` on items with children.
  - Arrow Up/Down navigate visible items. Arrow Right expands/enters; Arrow Left collapses/goes up.
  - Home/End navigate to first/last item. Enter/Space activates item's primary action.
  - `aria-level`, `aria-setsize`, `aria-posinset` for position context.

  **Disclosure (show/hide sections):**
  - Trigger is a `<button>` with `aria-expanded={true|false}` and `aria-controls={contentId}`.
  - Content panel shown/hidden via `hidden` attribute or `visibility: hidden` (not `display: none`
    if it causes layout reflow issues) — but never via `aria-hidden` on the controlled element
    (that would hide it from AT without hiding visually).
  - Pressing Enter or Space on the trigger toggles the state.

  **Grid (initiative tracker, character list):**
  - `role=grid`, `role=row`, `role=gridcell` / `role=columnheader`.
  - Arrow keys navigate cells. Enter enters cell edit mode; Escape exits.
  - Page Up/Down skip multiple rows. Home/End navigate to row start/end; Ctrl+Home/End to grid
    start/end.
  - `aria-sort` on sortable column headers.

- **States:** all widget states per the APG spec for each pattern.
- **Platform profiles:**
  - Desktop: full keyboard model as above.
  - Tablet/Mobile: same ARIA; keyboard model applies when hardware keyboard is attached. Touch
    interaction is primary but does not bypass the ARIA semantics.
- **Input:** keyboard per pattern above; touch (tap equivalent of Enter/Space; swipe equivalent of
  arrow for lists where applicable).
- **Accessibility:** Each pattern implemented once in the shared component library
  (extending v1 components). Consumers must not re-implement the ARIA wiring.
- **Acceptance criteria:**
  - Given a modal dialog, when a screen reader user is inside, then Tab key never reaches elements
    behind the dialog.
  - Given a tabs component, when Arrow Left is pressed on the first tab, then focus wraps to the
    last tab and the panel content updates.
  - Given a tree component with collapsed nodes, when Arrow Right is pressed on a collapsed node,
    then the node expands and `aria-expanded` changes to `true`.
  - Given a disclosure button, when inspected, then `aria-expanded` value accurately reflects
    whether the controlled content is visible.
  - Given a grid in the combat tracker, when Arrow Down is pressed from a cell, then focus moves
    to the same column in the next row and the cell is announced.
- **Priority:** Must-have

---

### UX-A11Y-013 — Drag alternatives (WCAG 2.5.7) for all drag operations

- **Requirement:** Every drag operation (widget move on canvas, widget resize, map pin reposition,
  initiative order reorder, file import) must have a single-pointer (click/tap) alternative that
  requires no path-based gesture.
- **Rationale:** `A11Y-002`; WCAG 2.5.7 (Dragging Movements) [1].
- **Spec:**
  - **Canvas widget move:** Keyboard: Ctrl+Arrow (spatial mode, as per UX-A11Y-003). Menu:
    "Move widget" → position field (X, Y input). Both dispatch the same core command.
  - **Canvas widget resize:** Keyboard: action mode → resize handle → Arrow keys. Menu:
    "Resize widget" → W/H input fields.
  - **Map pin drag:** Keyboard: select pin in map summary → "Reposition" → enter new grid
    coordinates or use arrow keys. Pointer alternative: click-to-place (click the pin, click the
    new location).
  - **Initiative order reorder:** Keyboard: select combatant row → Ctrl+Up/Down moves in initiative
    order. Menu: "Set initiative value" number input. Touch: handle button on each row.
  - **File import (drag-and-drop onto canvas):** Alternative: "Import" button → file picker dialog.
  - **Panel resize (sidebar width):** Alternative: "Panel width" preference (narrow / standard /
    wide) in settings.
  - **No drag-only gates:** A drag operation must never be the only way to reach a state. If a
    user cannot drag, they must still reach the final state via the alternative.
- **States:** dragging / alternative-active / cancelled
- **Platform profiles:** Identical requirement; on Mobile the alternative is typically the primary
  path (touch handles + context menus).
- **Input:** pointer (drag); touch (touch handles); keyboard (as above); pen (same as pointer).
- **Accessibility:** Alternative actions must be accessible themselves (keyboard reachable, ARIA
  named). WCAG 2.5.7 compliance tested by the release checklist.
- **Acceptance criteria:**
  - Given a keyboard-only user, when they attempt to reorder initiative, then Ctrl+Up/Down or a
    "Set initiative" number input achieves the reorder without drag.
  - Given a keyboard-only user, when they attempt to move a canvas widget, then Ctrl+Arrow or a
    coordinate input achieves the move without drag.
  - Given a user cannot use a drag gesture (motor accessibility), when they need to import a file,
    then a file picker button alternative is immediately visible.
- **Priority:** Must-have

---

### UX-A11Y-014 — Consistent help (WCAG 3.2.6)

- **Requirement:** If a help mechanism appears on multiple pages or views, it must appear in the
  same relative position across all of them.
- **Rationale:** WCAG 3.2.6 [1].
- **Spec:**
  - The "?" help trigger (command palette help, keyboard shortcut reference) appears in the top
    bar, right side, at a consistent position on all routes that show it.
  - Contextual help tooltips on controls are triggered by the same mechanism (hover + focus) on
    all surfaces.
  - The help keyboard shortcut (`?` or `F1`) is consistent across all routes.
  - Inline form help text appears below the field label, above the input, on all surfaces.
- **States:** n/a
- **Platform profiles:** Desktop: help button top-right in toolbar. Tablet: same. Mobile: help
  accessible from settings or the command palette.
- **Input:** pointer (hover for tooltip, click for help panel); keyboard (`?`, `F1`).
- **Accessibility:** Help trigger has `aria-label="Help"` and consistent position in the DOM.
- **Acceptance criteria:**
  - Given the help trigger is visible on two different routes, when position is compared, then
    both appear in the same relative position in the top bar.
  - Given a user presses `?` on any route that supports shortcuts, when the keyboard shortcut
    reference opens, then it opens consistently across all routes tested.
- **Priority:** Must-have

---

### UX-A11Y-015 — Redundant entry (WCAG 3.3.7) and accessible authentication (WCAG 3.3.8)

- **Requirement:** Information entered in the current session must not be re-requested in the same
  flow. Authentication must not rely on a cognitive function test (e.g., CAPTCHA without
  alternative).
- **Rationale:** WCAG 3.3.7, 3.3.8 [1].
- **Spec:**
  - **Redundant entry:** Campaign name, session title, and user identity entered at session start
    must pre-populate any subsequent form in the same flow that requests them. If a user
    creates a character with a name and then the system asks for that name again in the same flow,
    the field must be pre-filled.
  - **Accessible authentication:** If the app introduces any authentication step (join session,
    DM access to a locked scene), it must not use an image-based CAPTCHA or visual puzzle as the
    only option. Alternatives: link-based auth, passkey, or audio alternative.
  - **Local-first exemption:** The primary local-first persona has no authentication step; this
    applies to any multi-user join or cloud sync flow.
- **States:** authenticated / unauthenticated / joining
- **Platform profiles:** Identical requirement.
- **Input:** All modalities.
- **Accessibility:** Pre-filled fields must still be editable; `aria-required` and `aria-invalid`
  as appropriate.
- **Acceptance criteria:**
  - Given a user enters their display name in the session join flow, when a subsequent form in the
    same flow requests a display name, then the field is pre-filled with the previously entered
    value.
  - Given any authentication step exists, when inspected, then no CAPTCHA or visual puzzle is the
    sole option to proceed.
- **Priority:** Must-have

---

### UX-A11Y-016 — Non-text contrast: UI components and graphical objects (WCAG 1.4.11)

- **Requirement:** The visual presentation of all UI component boundaries, icons, focus indicators,
  and status graphical objects must achieve ≥ 3:1 contrast ratio against adjacent colors.
- **Rationale:** `A11Y-011`; WCAG 1.4.11 [9]; WCAG 2.4.13 for focus indicators.
- **Spec:**
  - **Form field borders:** ≥ 3:1 against the surrounding background in both light and dark themes.
  - **Icon-only buttons:** The icon foreground must achieve ≥ 3:1 against its background. If the
    button has a background, the background boundary must also achieve ≥ 3:1 against the page
    background.
  - **Focus indicators:** ≥ 3:1 contrast between focused and unfocused appearance AND ≥ 3:1
    against adjacent colors (per 2.4.13 in addition to 1.4.11).
  - **Status icons (sync, error, health bars, fog coverage):** All meaningful graphical elements
    ≥ 3:1 against their background.
  - **Disabled state:** WCAG exempts disabled controls from contrast requirements; however, this
    product uses a shape/pattern indicator alongside reduced opacity to communicate disabled state
    (per UX-A11Y-007). The shape indicator must be visible even if contrast is below 3:1.
  - **High-contrast mode:** When the OS high-contrast mode is active, the app must honor forced
    colors via the CSS `forced-colors` media query. Tokens must fall back to system color keywords
    (`ButtonText`, `Highlight`, `CanvasText`, etc.) where forced colors are active.
- **States:** default / hover / focus / active / disabled / high-contrast
- **Platform profiles:** Identical requirement; high-contrast media query applies on all platforms.
- **Input:** n/a (visual rendering requirement).
- **Accessibility:** Automated check: axe rule `color-contrast` covers text; `1.4.11` requires
  manual or specialized tooling (e.g., Colour Contrast Analyser on key graphical elements per the
  release checklist).
- **Acceptance criteria:**
  - Given a light-theme route is scanned, when 1.4.11 contrast is checked on all form field
    borders and icon-only buttons, then all achieve ≥ 3:1.
  - Given OS high-contrast mode is active, when any route renders, then no UI element loses its
    visible boundary or icon shape due to forced color override.
  - Given the focus ring is rendered on any element, when contrast is measured between focused and
    unfocused states, then ratio ≥ 3:1.
- **Priority:** Must-have

---

### UX-A11Y-017 — Automated a11y gate: axe CI expectations

- **Requirement:** The automated accessibility gate must run axe against all primary routes on
  both desktop-chromium and mobile-chromium Playwright profiles, block on critical/serious
  violations, and produce deterministic artifacts for CI evidence.
- **Rationale:** `A11Y-008`, `A11Y-010`; Deque axe-core [14]; v1 CI baseline.
- **Spec:**
  - **Scope:** All routes listed in `docs/development/ACCESSIBILITY.md` §2, plus all new v2 routes
    (`/scene`, `/canvas`, `/map/:id`, `/combat`, `/session`, `/player`, etc.).
  - **Profiles:** Both `desktop-chromium` and `mobile-chromium` Playwright projects. (Per the
    `Run Both E2E Projects` memory note: layout/profile-affecting surfaces must run both.)
  - **Severity handling:**
    - `critical`: gate blocks immediately. Zero tolerance. Unapproved items must not merge.
    - `serious`: blocks unless item is in the approved known-violation register with a future
      remediation date.
    - `moderate` / `minor`: logged in a report artifact; do not block.
  - **Artifact determinism:** Each Playwright worker writes an isolated artifact (worker-scoped
    file); a merge step combines them post-run. Dynamic IDs in accessible names are normalized
    (UUID suffix stripped) before fingerprint generation. (Extends v1 fixes for
    `CODEX-PR12-A11Y-REPORT-RACE` and `CODEX-PR12-AXE-FINGERPRINTS`.)
  - **Manual-only criteria:** For criteria not automatable by axe (1.4.11 graphical contrast,
    visible focus ring design review, motion behavior, SR QA checklist), the release evidence
    file records: criterion, manual test result, tester ID, scope, and date.
  - **axe configuration:** Run with `tags: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa',
    'best-practice']` to include WCAG 2.2 AA rules when axe-core adds them.
- **States:** passing / failing / known-violation-expired
- **Platform profiles:** Desktop-chromium + Mobile-chromium (both required per memory note).
- **Input:** CI execution (Playwright).
- **Accessibility:** This IS the automated enforcement of all other requirements.
- **Acceptance criteria:**
  - Given a PR is opened, when the a11y CI job runs, then axe reports for all routes on both
    desktop-chromium and mobile-chromium profiles are produced as artifacts.
  - Given an axe critical violation is found on any route, when the gate runs, then the CI job
    fails and the PR cannot merge.
  - Given two Playwright workers run in parallel, when axe artifacts are produced, then each
    worker's artifact is isolated and the merged report contains no duplicates.
  - Given a known-violation entry's remediation date has passed, when CI runs, then the gate
    treats that violation as unapproved and fails.
- **Priority:** Must-have

---

### UX-A11Y-018 — Screen-reader QA environments and release checklist

- **Requirement:** Before every minor and major release, a human QA tester must execute the
  screen-reader checklist in VoiceOver+Safari (macOS), NVDA+Chrome (Windows), and TalkBack+Chrome
  (Android), covering v2-specific surfaces (canvas, map, combat).
- **Rationale:** `A11Y-010`; v1 QA baseline (`docs/development/ACCESSIBILITY_QA.md`).
- **Spec:**
  - Extend v1 checklist to cover: Scene canvas keyboard model, Scene Outline panel, map summary
    panel, combat live announcements (Player role and DM role sessions), fog-of-war reveal
    announcement, widget drag alternatives, and the visibility-boundary check (UX-A11Y-008).
  - Player-role session must be tested separately from DM session. The tester must confirm that
    DM-only content is absent from all ARIA output in the player session.
  - Results recorded in release notes with the template from `ACCESSIBILITY_QA.md`.
  - Known unresolved issues carry WCAG criterion, user impact, workaround, and target fix release.
- **States:** n/a (process requirement).
- **Platform profiles:** macOS (Desktop), Windows (Desktop), Android (Mobile).
- **Input:** Screen reader + keyboard (VoiceOver, NVDA); Screen reader + touch (TalkBack).
- **Acceptance criteria:**
  - Given a minor or major release, when the release checklist is executed, then results for all
    three SR environments are recorded in the release notes.
  - Given the Player-role session is tested with TalkBack, when a DM-only canvas widget is present,
    then the tester confirms it is not announced or reachable.
- **Priority:** Must-have

---

## 6. Component & state specifications

### 6.1 Focus ring specification

| State | Visual appearance | Token | WCAG SC |
|---|---|---|---|
| Default (no focus) | No ring | — | — |
| Focus-visible (keyboard) | 2px solid ring, 2px offset | `--focus-ring-color`, `--focus-ring-width: 2px`, `--focus-ring-offset: 2px` | 2.4.7, 2.4.13 |
| Focus-visible on dark bg | Yellow ring (`--focus-ring-color-dark-bg`) | token | 2.4.13 |
| Focus inside dialog | Same ring, contained to dialog | — | 2.4.3 |
| Focus on canvas widget | Ring on widget bounding box, 2px inside edge | `--focus-ring-canvas` | 2.4.7 |

Ring area: perimeter of element × 2 CSS px minimum (WCAG 2.4.13). Contrast of ring vs. adjacent: ≥ 3:1.

### 6.2 Live-region architecture

| Region | `aria-live` | `aria-atomic` | `aria-relevant` | Usage |
|---|---|---|---|---|
| `#live-polite` | `polite` | `true` | `additions text` | Route changes, save/sync status, turn advance, HP changes |
| `#live-assertive` | `assertive` | `true` | `additions text` | PC incapacitation, death, critical errors |
| `#live-status` | `polite` | `false` | `additions` | Toast/notification stream |

Rules:
- Both regions are always in the DOM from initial page load (they must exist before announcements fire).
- Both are visually hidden (`clip: rect(0,0,0,0)`, `position: absolute`, `overflow: hidden`).
- Only the `LiveAnnouncer` singleton writes to them. No component writes directly.
- Assertive region is cleared after 3 seconds to prevent stale content being re-read.

### 6.3 Keyboard shortcut map (product-wide, Must-have actions)

| Action | Desktop shortcut | Notes |
|---|---|---|
| Open command palette | `Ctrl+P` / `Cmd+P` | All routes |
| Global search | `Ctrl+K` / `Cmd+K` | All routes |
| Open keyboard shortcut reference | `?` | All routes (no modifier) |
| Toggle Scene Outline panel | `Ctrl+Shift+L` | Canvas routes |
| Navigate canvas (spatial mode) | `Tab` / `Shift+Tab`, `Arrow` keys | Canvas focus |
| Enter widget action mode | `Enter` | Focused widget in spatial mode |
| Exit action mode | `Escape` | Widget in action mode |
| Move focused widget | `Ctrl+Arrow` (8px), `Ctrl+Shift+Arrow` (1px) | Widget in spatial mode |
| Delete focused widget | `Delete` / `Backspace` | Widget in spatial mode |
| Multi-select canvas | `Ctrl+A` (all), `Shift+Arrow` (extend) | Canvas |
| Open map summary | `Ctrl+Shift+M` | Map surface |
| Advance initiative turn | `Ctrl+Enter` | Combat surface |
| Move combatant up/down | `Ctrl+Up` / `Ctrl+Down` | Initiative tracker row focused |
| Close dialog / sheet | `Escape` | Any open dialog |
| Undo | `Ctrl+Z` / `Cmd+Z` | All editable surfaces |
| Save | `Ctrl+S` / `Cmd+S` | All editable surfaces |
| Help | `F1` or `?` | All routes |

### 6.4 ARIA landmark structure (per route)

```
<body>
  <div id="live-polite" aria-live="polite" aria-atomic="true" class="sr-only"></div>
  <div id="live-assertive" aria-live="assertive" aria-atomic="true" class="sr-only"></div>
  <header role="banner">         <!-- App top bar, global nav -->
  <nav role="navigation" aria-label="Primary navigation">
  <main role="main" aria-label="{route name}">
    <h1>{Route title}</h1>       <!-- one per route, always -->
    <!-- route content -->
    <aside role="complementary" aria-label="Scene outline">  <!-- canvas routes -->
    <aside role="complementary" aria-label="Map summary">    <!-- map routes -->
  </main>
  <div role="region" aria-label="Toast notifications">
</body>
```

Every dialog is appended to `<body>` (not inside `<main>`) to ensure z-index and focus-trap
integrity.

---

## 7. Layout & responsive behavior

Accessibility requirements apply uniformly across profiles. The following lists profile-specific
implementation notes:

**Desktop (≥ 1024px):**
- Scene Outline panel: persistent collapsible sidebar; `Ctrl+Shift+L` to focus.
- Map summary: collapsible sidebar panel; `Ctrl+Shift+M` to open.
- Full keyboard shortcut set available.
- Focus ring always rendered (no `:hover` suppression of ring).

**Tablet (600–1024px):**
- Scene Outline: slide-over sheet from toolbar icon; same ARIA content as Desktop.
- Map summary: bottom sheet.
- Touch targets: 44×44 CSS px enforced.
- Hardware keyboard: full Desktop shortcut model when detected.
- Virtual keyboard (IME): fixed or sticky UI elements must not obscure focused inputs when the
  virtual keyboard opens. The app must listen to `visualViewport` resize events and scroll
  focused inputs into view. No fixed-bottom chrome that does not account for the keyboard inset.

**Mobile (< 600px):**
- Scene Outline: full-screen sheet; primary non-visual access path.
- Spatial canvas keyboard model: not required (no physical keyboard assumed); Scene Outline is the
  canonical access path.
- Touch targets: 44×44 CSS px enforced; 8 CSS px minimum gap between adjacent targets.
- Virtual keyboard: same inset handling as Tablet.
- TalkBack/VoiceOver swipe navigation: element order must follow DOM reading order.
- Bottom tab bar: items 44×44 CSS px; `aria-selected` for active tab; `aria-current="page"` where
  applicable.

---

## 8. Motion & feedback

Fully covered in `01-visual-design-system.md` (motion tokens). This document owns the reduced-
motion contract (UX-A11Y-011) and the live-region feedback contract (UX-A11Y-006). Summary:

| Context | Full motion | Reduced motion |
|---|---|---|
| Panel open/close | 200 ms ease-out slide | Instant |
| Toast appear | 150 ms ease-out fade+slide | Instant fade |
| Canvas widget move | 100 ms ease-out | Instant |
| Fog reveal | 400 ms expanding circle | Instant |
| Dice roll animation | 1500 ms physics tumble | Immediate result |
| Route transition | 200 ms crossfade | Instant |
| Loading skeleton | Pulse wave 1.5 s loop | Static placeholder |
| Initiative row advance | 200 ms row highlight scroll | Instant row highlight |

Live-region announcements fire independently of animation state — the announcement must fire at
the moment the state changes, not at animation completion.

---

## 9. Accessibility requirements (surface-specific)

This document IS the global accessibility requirements baseline. Sibling surface documents (§04,
§06, §08, etc.) must include a §9 section that:

1. Inherits this document's requirements without repeating them.
2. Adds surface-specific detail (e.g., canvas §04 specifies the exact widget ARIA roles; map §06
   specifies the exact POI list structure; combat §08 specifies the exact live-region strings).
3. References this document for any pattern defined here.

Surface-specific additions must not contradict or weaken any requirement in this document. If a
conflict arises, it must be raised as an open question in the sibling document's §12 and resolved
before the surface is considered complete.

---

## 10. Anti-patterns & explicit limitations

**Required section.** The following are hard limits — patterns this product must not use even
though they are common elsewhere.

### AP-1: `aria-label` that names DM-only content to player role

**Forbidden:** Setting `aria-label="The Guard Post (hidden)"` or any accessible name that reveals
a DM-only POI name, combatant name, or widget content to a player screen reader.

**Reason:** ARIA output is read by assistive technology connected to the player's device. The
visibility boundary applies to all channels, not just the visual render. A player using VoiceOver
can inspect the ARIA tree of the full DOM; any DM content present in the DOM (even in visually
hidden elements) will be read. The correct implementation is not rendering the element for the
player at all, not hiding it visually while leaving its name in the ARIA tree.

**Research basis:** ARIA `aria-label` is consumed by ATs even on `aria-hidden="true"` elements in
some SR implementations; `visibility: hidden` removes from AT but leaves in DOM; only removing the
element from the DOM or using `hidden` attribute (which ATs respect) fully prevents leakage. See
ARIA spec §6.6 and testing reports from Deque on `aria-hidden` behavior [14].

---

### AP-2: Color-only state

**Forbidden:** Communicating any meaningful state (role, health, visibility, turn, error, sync)
via color alone, with no accompanying text, icon, shape, or ARIA state.

**Reason:** WCAG 1.4.1 is a hard AA criterion. Color blindness affects ~8% of males and ~0.5% of
females. A player with deuteranopia cannot distinguish red HP (bloodied) from green HP (full) if
the only indicator is the hue. Beyond legal compliance, this is a live-play reliability issue: a
DM needs to see at a glance which combatant is concentrating — the icon must be there even if
they can see color.

---

### AP-3: Focus traps that can't be escaped

**Forbidden:** Any focus trap without a documented and tested Escape-key (or equivalent) exit.

**Reason:** WCAG 2.1.2 (No Keyboard Trap) is a Level A requirement — the absolute floor. A focus
trap that cannot be escaped renders the entire application inoperable for keyboard-only users from
that point. The focus-trap utility must always expose an Escape handler. Custom implementations
without Escape are forbidden.

---

### AP-4: `aria-live="assertive"` for non-urgent events

**Forbidden:** Using `assertive` for routine status updates (save confirmations, sync status, turn
advance, roll results).

**Reason:** `assertive` interrupts the screen reader mid-sentence. Overuse causes users to turn
off AT or miss genuine urgent events. The APG and WebAIM explicitly recommend reserving assertive
for genuine emergencies [7]. This product's only legitimate assertive events are player character
incapacitation and critical combat state errors.

---

### AP-5: Motion without reduced-motion fallback

**Forbidden:** Any CSS transition, animation, or JS-driven motion that does not check the
resolved motion preference before running.

**Reason:** Vestibular disorders affect ~35% of adults over 40 (source: Vestibular Disorders
Association). Motion-triggered dizziness or nausea can be severe. WCAG 2.3.3 (AAA) prohibits
motion from interactions unless the user can disable it. This product targets the practical AA bar
of honoring `prefers-reduced-motion`. The fog-of-war reveal animation, dice roll, and canvas zoom
are the highest-risk animations — all must have instant fallbacks.

---

### AP-6: Drag-only operations

**Forbidden:** Any Must-have action that can only be accomplished by a path-based drag gesture,
with no click/tap/keyboard alternative.

**Reason:** WCAG 2.5.7 (Dragging Movements, AA) explicitly requires pointer alternatives to drag.
Users with motor impairments, tremor, or reduced fine-motor control cannot reliably execute drag
gestures. On touch, drag can conflict with scroll. Every drag operation in this product is a
convenience shortcut; the canonical path must always be available via discrete actions.

---

### AP-7: `role=application` without keyboard instructions

**Forbidden:** Using `role=application` on the canvas container without providing keyboard
instructions for SR users who enter application mode (where the SR's native shortcuts are
suspended).

**Reason:** `role=application` suspends most SR reading-mode shortcuts, requiring the SR user to
interact exclusively via the keyboard model the app provides. If the app does not announce its
keyboard model, the user is trapped in a mode with no escape and no instruction. The canvas must
announce "Use arrow keys to navigate widgets; Enter to interact; Escape to return; F1 for help"
when the canvas receives focus from outside.

---

### AP-8: Positive `tabindex` values

**Forbidden:** `tabindex` values greater than 0 on any element.

**Reason:** Positive tabindex values create a parallel focus order that overrides DOM order.
This causes unpredictable Tab behavior that screen-reader users cannot anticipate and testers
cannot reliably verify. The roving tabindex pattern (`tabindex=0` / `tabindex=-1`) achieves the
same result correctly. MDN, WCAG Technique C27, and all major style guides prohibit positive
tabindex.

---

### AP-9: Visually hidden text that leaks DM content to player ARIA tree

**Forbidden:** Using `class="sr-only"` (visually hidden, readable by AT) to show DM content
labels on elements that are present in the player DOM.

**Reason:** This is variant of AP-1. A visually hidden span with DM-only content is invisible to
sighted players but fully readable by screen readers. The pattern is commonly (mis)used to add
"extra" SR context, but in this product it is a visibility-boundary violation. If information
must not be visible to a player, it must not be in the player DOM in any form.

---

### AP-10: Suppressing focus ring via `outline: none` without custom indicator

**Forbidden:** `outline: none` or `outline: 0` on any interactive element without an
equivalent custom focus indicator that meets WCAG 2.4.7 and 2.4.13.

**Reason:** Removing the focus ring without replacement makes the entire application inoperable for
keyboard users who rely on focus visibility. The v1 codebase fixed all such instances (gap
register, fixed). v2 must not reintroduce them. Every `outline: none` in the codebase must have a
corresponding custom `:focus-visible` rule that passes 2.4.13.

---

## 11. Success metrics

| Metric | Target | Measurement method |
|---|---|---|
| axe critical violations | 0 | CI gate: every PR, all routes, both profiles |
| axe serious violations (unapproved) | 0 | CI gate |
| Keyboard-only task completion: session start, search, combat advance | 100% | Manual QA checklist, each release |
| Screen-reader QA: all 3 environments pass | 100% (minor/major release) | Manual checklist |
| Player SR session: 0 DM-only content leaks | 0 leaks found | Manual QA, Player role session |
| Touch target compliance (Mobile profile) | 100% of interactive elements ≥ 44×44 CSS px | Automated scan, mobile-chromium |
| Focus ring WCAG 2.4.13 contrast | ≥ 3:1 (ring vs. adjacent) | Manual spot-check + Colour Contrast Analyser |
| Reduced-motion compliance | 100% of animated elements have a reduced-motion path | Code review + manual test |
| WCAG 2.5.7 drag alternatives | 100% of drag operations have keyboard/click alternative | Manual QA |
| Time for SR user to navigate from any route to combat tracker | ≤ 3 landmarks + heading jumps | Manual SR QA |
| Known-violation register open items | < 5 at any release (none critical) | Register audit |

---

## 12. Open questions & risks

1. **`role=application` on the canvas:** Using `role=application` suspends SR reading-mode
   shortcuts. The alternative (`role=region` or implicit `<section>`) gives the SR user access to
   their shortcuts but makes the roving-tabindex model harder to explain. Recommend piloting both
   with actual SR users before committing. **Owner: UX + a11y lead.**

2. **axe-core WCAG 2.2 rule coverage:** As of axe-core 4.9, coverage of WCAG 2.2 AA criteria
   (2.4.11, 2.4.13, 2.5.7, 2.5.8) is partial — some criteria require manual checks or custom rules.
   The CI gate must be supplemented with manual checklist items for criteria not yet in axe.
   **Risk: medium; track axe-core release notes for new rules.**

3. **Fog-of-war reveal animation and `prefers-reduced-motion`:** The product vision includes
   atmospheric fog reveals. The reduced-motion fallback (instant fill change) may be jarring and
   break the atmospheric intent. Consider an intermediate: a very short (100 ms) crossfade that
   is not vestibular-triggering. **Owner: motion design lead; requires user research with motion-
   sensitive users.**

4. **Mobile canvas access:** The Scene Outline as sole Mobile canvas access path means the Scene
   content is only visible to mobile SR users as a list, never spatially. For Tablet users with
   hardware keyboard, the spatial model should also work. Need to confirm which touch-gesture
   model TalkBack uses for `role=application` elements. **Risk: high; requires device testing.**

5. **Multi-user live-region flooding:** In a large combat encounter (8+ combatants) with rapid
   events, the 300 ms debounce may still produce many successive announcements. The batching
   strategy (UX-A11Y-006) needs validation with actual SR users in a simulated combat session.
   **Owner: a11y QA; test before combat surface ships.**

6. **WCAG 3.3.8 (Accessible Authentication) scope:** The product is primarily local-first and
   may add cloud/multi-user sync in a future epic. This criterion becomes critical at that point.
   The current document states the requirement; the sync/auth surface must implement it.
   **Risk: low now; high if cloud auth ships in v2.**

7. **Conflict with UX-CANVAS: Scene Outline as a sibling-doc detail.** The Scene Outline panel
   is specified here (UX-A11Y-004) and will also be referenced in `04-canvas-scene-widgets.md`.
   The canvas doc owns the visual layout and interaction detail; this doc owns the ARIA contract.
   Any conflict between the two must be resolved at the canvas surface doc level with this doc
   as the binding authority for ARIA and keyboard behavior.

---

## Sources

[1] Web Content Accessibility Guidelines (WCAG) 2.2 — W3C — https://www.w3.org/TR/WCAG22/

[2] WAI-ARIA Authoring Practices Guide 1.2 — W3C WAI — https://www.w3.org/WAI/ARIA/apg/

[3] Figma Accessibility Features — Figma Help Center — https://help.figma.com/hc/en-us/articles/360039956914-Accessibility-features-in-Figma

[4] Excalidraw Accessibility Issue #3780 — GitHub — https://github.com/excalidraw/excalidraw/issues/3780

[5] Inclusive Components — Heydon Pickering — https://inclusive-components.design/

[6] WCAG 2.2 Technique G92: Providing long description for non-text content — W3C — https://www.w3.org/WAI/WCAG22/Techniques/general/G92

[7] WAI-ARIA 1.2 Specification: Live Region Attributes — W3C — https://www.w3.org/TR/wai-aria-1.2/#dfn-live-region

[8] Understanding WCAG 2.2 SC 1.4.1 Use of Color — W3C — https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html

[9] Understanding WCAG 2.2 SC 1.4.11 Non-text Contrast — W3C — https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html

[10] Apple Human Interface Guidelines: Accessibility — Buttons and Controls — Apple — https://developer.apple.com/design/human-interface-guidelines/accessibility

[11] Material Design 3: Accessibility — Touch targets — Google — https://m3.material.io/foundations/accessible-design/accessibility-basics

[12] GOV.UK Design System: Accessibility — Target sizes — GOV.UK — https://design-system.service.gov.uk/accessibility/

[13] Understanding WCAG 2.2 SC 2.5.7 Dragging Movements — W3C — https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html

[14] Deque University: axe-core Rules — Deque Systems — https://dequeuniversity.com/rules/axe/

[15] What's New in WCAG 2.2 — W3C WAI — https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/

[16] Understanding WCAG 2.2 SC 2.4.13 Focus Appearance — W3C — https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html

[17] Understanding WCAG 2.2 SC 2.4.11 Focus Not Obscured — W3C — https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html

[18] WebAIM: Using ARIA Live Regions — WebAIM — https://webaim.org/techniques/aria/live-regions/

[19] TPGi: How to test for WCAG 2.5.7 Dragging Movements — TPGi — https://www.tpgi.com/how-to-test-2-5-7-dragging-movements/
