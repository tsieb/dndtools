# Initiative 14 — Adaptive Cross-Platform Shell

## Status: PLANNED

**Outcome:** The application feels genuinely native on every platform it runs on. On
mobile, navigation is thumb-reachable and the editor does not fight the software
keyboard. On desktop, panels are persistent, resizable, and keyboard-driven. On tablet,
the app scales intelligently between phone and desktop patterns without awkward hybrid
states. The Electron desktop shell has proper OS-level chrome that does not clash with
the application's own header.

**Depends on:** I13 (navigation model must be defined before it can be rendered
adaptively)

**Why this is a distinct initiative:** The current implementation treats the application
as a desktop-first web app with a mobile afterthought. The sidebar collapses to a
fixed-width overlay at mobile widths — a pattern explicitly de-emphasised in Material 3,
Apple HIG, and Windows guidance because it hides primary navigation and forces users into
"trial and error" discovery. The TopBar window chrome (minimize/maximize/close) embedded
in the application header breaks on every Electron platform (wrong position on macOS,
wrong style on Windows, completely wrong on Linux). These are not surface-level problems;
they require an architectural change to how the layout is composed.

**Root-cause diagnosis:**

The layout is defined in `src/routes/+layout.svelte` as a single flex-row containing
a sidebar and a main content area. There are no breakpoint-aware layout variants — the
same structure renders at all sizes. The sidebar's mobile behaviour is an `if(isMobile)`
branch that changes position to `fixed` and adds a backdrop — not an adaptive layout,
but a post-hoc patch. There are no structural layout tokens beyond `--width-sidebar:
260px` and `--width-content: 720px`.

---

## Epic 14.1 — Layout Token Architecture and Breakpoint Contract

**Goal:** All layout dimensions and breakpoint decisions reference a canonical token set.
No structural dimension is hardcoded in a component. Every layout tier is testable.

**Stories:**

- **S14.1.1 — Layout breakpoint contract**
  Define three layout tiers in the design token system (see I15 for token architecture)
  and in `docs/architecture/LAYOUT_TIERS.md`:
  - **Compact**: viewport width < 640px — mobile phones, small windows. Single-pane
    content. Bottom navigation bar. No persistent sidebar.
  - **Medium**: 640px–1099px — tablets, medium desktop windows. Navigation rail
    (icon-only, 60px). Content fills remaining space. Optional slide-out local panel.
  - **Expanded**: >= 1100px — large desktop. Navigation rail + persistent expandable
    local panel. Optional right detail panel. Full keyboard chrome.
    These tiers are the only width thresholds used in any layout component. Device-type
    detection (`isMobile`) is replaced with reactive viewport width observation derived
    from these tiers. No Tailwind `sm:`, `md:`, `lg:` breakpoints are used for structural
    layout — only for content-level responsive adjustments.

- **S14.1.2 — Structural layout CSS custom properties**
  Add to `app.css` `@theme`:
  - `--layout-rail-width`: 60px (icon rail, always shown in Medium/Expanded)
  - `--layout-panel-width`: 240px (local nav panel, Expanded only by default)
  - `--layout-panel-width-narrow`: 200px (user can resize down to this)
  - `--layout-panel-width-wide`: 320px (user can resize up to this)
  - `--layout-detail-width`: 300px (right detail panel)
  - `--layout-topbar-height`: 48px
  - `--layout-bottomnav-height`: 60px (Compact only)
    All sidebar-width, content-area calculations, and panel animations use these tokens.
    Remove the existing `--width-sidebar: 260px` in favour of the new system.

- **S14.1.3 — Layout tier Svelte store**
  Implement a `layoutTier` reactive store in `src/lib/state/layout.svelte.ts` that
  observes `window.innerWidth` with a `ResizeObserver` and emits `'compact'`,
  `'medium'`, or `'expanded'`. Components subscribe to this store for adaptive
  behaviour — no `window.innerWidth` reads in component logic. The store debounces at
  100ms to avoid thrashing. SSR-safe: defaults to `'expanded'` during server render.

---

## Epic 14.2 — Compact Layout (Mobile Shell)

**Goal:** On narrow viewports, the navigation is thumb-reachable, the content fills the
screen, and the editor is not obscured by the software keyboard.

**Stories:**

- **S14.2.1 — Bottom navigation bar for primary sections**
  On Compact layout, replace the slide-out sidebar with a bottom navigation bar
  (`<nav aria-label="Primary" class="mobile-bottom-nav">`). The bar shows the five
  primary section icons with labels, fixed to the bottom of the viewport. The active
  section is indicated by a filled icon and accent-colored label. The bar has a safe
  area inset (env(safe-area-inset-bottom)) for notched devices. The existing
  `mobile-bottom-nav` CSS class in `app.css` is already referenced — build the
  component to use it. The bar is `aria-hidden` when the software keyboard is open
  (the existing `.dndtools-keyboard-open .mobile-bottom-nav { display: none }` rule
  is already correct — wire it up).

- **S14.2.2 — Mobile local navigation bottom sheet**
  On Compact layout, local navigation (folder tree, filters, tags) is accessed via a
  bottom sheet that slides up from below content. A persistent "Browse" pill button
  above the bottom nav triggers the sheet. The sheet slides in from the bottom, covers
  the bottom 70% of the screen, has a drag handle, and is dismissable by: swipe down,
  Escape key, or backdrop tap. The sheet uses the Dialog/Sheet component from I15.
  Focus is trapped in the sheet while it is open. Back gesture on mobile closes it.

- **S14.2.3 — Mobile TopBar simplification**
  On Compact layout, the TopBar contains only: (1) current section title / breadcrumb
  (expanding to fill available space), (2) command palette trigger icon, (3) overflow
  menu (`...`) for less-frequent actions (theme toggle, settings, DM/Player switch).
  Back/forward navigation is dropped from the TopBar on Compact (bottom sheet provides
  context; OS back handles history). The TopBar height on Compact is 48px with a 1px
  bottom border.

- **S14.2.4 — Mobile note editor experience**
  On Compact layout, the note editor occupies the full viewport height when active. The
  editor toolbar is a floating bottom bar positioned above the keyboard (using
  `env(keyboard-inset-height)` and the existing `--dndtools-keyboard-inset` variable).
  The content area scrolls independently. "Done" / "Back" navigation is a back button
  in the TopBar. The editor does not show the sidebar or any navigation chrome while
  in editing mode — full-screen focused writing.

- **S14.2.5 — Touch gesture support with keyboard alternatives**
  On Compact layout, support swipe-right from the left edge to open the bottom sheet
  (mirroring iOS navigation drawer convention). Swipe-left on a note list item reveals
  quick actions (pin, delete). All swipe gestures have button alternatives — swipe-left
  quick actions have a long-press context menu fallback, and the bottom sheet has the
  "Browse" pill button. Per WCAG 2.2 SC 2.5.7: no path through the app requires a
  path gesture as the sole method.

---

## Epic 14.3 — Expanded Layout (Desktop Shell)

**Goal:** On large viewports, the application has a persistent, efficient panel
structure that maximises content space while keeping navigation always accessible. Panels
are resizable and their state persists across sessions.

**Stories:**

- **S14.3.1 — Navigation rail + expandable local panel**
  On Expanded layout, the left edge has a permanent 60px navigation rail (PrimaryNav
  component, icon-only). To the right of the rail, the local navigation panel (240px
  default) is permanently visible and shows the active section's panel content. The
  main content area fills the remainder. The local panel can be collapsed with
  Ctrl+B (same as current sidebar toggle) — when collapsed, it disappears and the
  content area expands to fill its space. Panel collapse state is persisted in
  `localStorage`.

- **S14.3.2 — Right detail panel for contextual content**
  On Expanded layout, a right-side detail panel (300px) is available as an opt-in. When
  open, it shows contextual content for the active view: backlinks for a note, entity
  metadata for an object note, map legend for a map view, session quick-reference for
  session mode. Toggled with Ctrl+Shift+R. The detail panel slides in from the right
  with a transition respecting `prefers-reduced-motion`. When no contextual content is
  defined for the current view, the detail panel is not available (the toggle is
  disabled).

- **S14.3.3 — Resizable panels with drag handle and keyboard resize**
  The local navigation panel has a drag handle at its right edge. Dragging resizes the
  panel width within the range defined by the layout tokens (200px–320px). Width is
  persisted per section in `localStorage`. Keyboard alternative: the drag handle is
  focusable, and arrow keys resize in 10px increments when the handle is focused. The
  resize handle meets WCAG 2.2 SC 2.5.7 (dragging alternatives).

- **S14.3.4 — Focus mode (Zen mode)**
  A Zen mode collapses all panels (rail, local panel, detail panel) and the TopBar,
  leaving only the content area with minimal chrome (just the breadcrumb and close-zen
  button). Activated by F11 or a toolbar button in the editor. Zen mode is especially
  valuable for note writing sessions and for presenting the session board. Exiting Zen
  restores all panels to their prior state. Zen mode is persisted across navigation
  within the session but not across app restarts.

- **S14.3.5 — Persistent panel state across navigation**
  When a user navigates between routes within a section, the local panel's scroll
  position, expanded/collapsed section states, and selected item highlight persist.
  When switching between primary sections, each section's panel state is independently
  remembered. The panel does not flash or reset on every route change — it only updates
  its content reactively.

---

## Epic 14.4 — Electron Desktop Platform Refinements

**Goal:** The Electron application feels like a first-class desktop app, not a web app
running in a shell. The window chrome is OS-appropriate, OS integration features work,
and the application correctly handles system-level events.

**Stories:**

- **S14.4.1 — Custom titlebar with proper drag region and OS-native chrome position**
  Remove the minimize/maximize/close buttons from the TopBar. Implement a proper
  frameless window approach: the Electron window's `titleBarStyle` is set to `hidden`
  (Windows/Linux) or `hiddenInset` (macOS). A thin OS-level titlebar region (24px) sits
  above the application TopBar. On Windows and Linux, custom window controls are
  rendered in this titlebar region at the right. On macOS, the native traffic lights
  appear at left (hiddenInset provides this). The TopBar's `desktop-drag` class is
  removed; the titlebar region becomes the exclusive drag area. This eliminates the
  awkward mixing of window chrome with application controls.

- **S14.4.2 — Native context menus via Electron Menu API**
  Replace the custom HTML context menu for folder actions (the `folderContextMenu`
  popover in Sidebar.svelte) with a native OS context menu via Electron's
  `Menu.buildFromTemplate()` / `popup()`. Extend to note list items (right-click on a
  note card: Open, Pin/Unpin, Move to folder, Delete). Native context menus appear at
  the correct position, support OS-level accessibility, and feel correct on all
  platforms. The IPC channel for context menu events is explicitly typed and validated
  per the I1 IPC security model.

- **S14.4.3 — Keyboard accelerators for Electron menus**
  Implement an Electron application menu (the menubar in macOS, Alt-accessible in
  Windows) with keyboard accelerators for all primary actions. Menus are the expected
  discoverability surface for keyboard shortcuts on desktop platforms. Menu structure:
  File (New Note, Open Vault, Export...), Edit (standard text operations), View (Toggle
  Sidebar, Toggle Dark Mode, Zoom), Session (Start Session, Open Dice Tray, Open Combat
  Tracker), Help (Keyboard Shortcuts, About). Accelerators in the menu match the
  in-app keyboard shortcuts.

- **S14.4.4 — OS-level file association and protocol handler**
  Register `.md` files as associated with DND Tools in the Electron installer. Opening
  an `.md` file from the OS file manager opens the app and navigates to that note.
  Register the `dndtools://` protocol handler. Deep links (`dndtools://note/{id}`,
  `dndtools://session/{boardId}`) bring the app to the foreground and navigate to the
  correct content. Both mechanisms handle "app not running" (launch app) and "app
  running" (focus and navigate) cases.

- **S14.4.5 — Filesystem change detection for vault auto-refresh**
  Replace the manual "Refresh vault" button (currently in the TopBar) with automatic
  filesystem change detection using Electron's `fs.watch` / chokidar. When files in the
  vault directory change outside the app (another editor, git pull, MCP write), the app
  detects the change and reloads the affected notes without a full vault reload. A subtle
  toast notifies the user ("2 notes updated from disk"). This eliminates the manual
  refresh button entirely, removing one control from the TopBar.

---

## Epic 14.5 — Medium Layout (Tablet Shell)

**Goal:** On medium viewports (tablets, 2-in-1s, large phones in landscape), the
application uses the navigation rail as the stable global nav surface and adopts a
split-pane pattern for content where appropriate.

**Stories:**

- **S14.5.1 — Navigation rail for medium layout**
  On Medium layout, the icon-only navigation rail (60px) is permanently visible on the
  left. Tapping a section icon either (a) navigates to the section root if the section
  is not already active, or (b) opens a temporary local panel overlay (300px) if the
  section is already active. The overlay anchors to the rail's right edge, covers the
  content area partially, and dismisses on backdrop tap or Escape. This is the
  "navigation drawer" pattern in its modern form, anchored to a visible rail.

- **S14.5.2 — Split-view for Knowledge section on Medium layout**
  In the Knowledge section on Medium layout, show a master-detail split: the note list
  occupies the left 35–40%, and the selected note's content occupies the right 60–65%.
  When no note is selected, the right pane shows a contextual empty state ("Select a
  note to read it"). This matches the UX pattern users expect from apps like Notion,
  Bear, and Apple Notes on iPad. The split ratio is not user-resizable on Medium (only
  on Expanded).

- **S14.5.3 — Input modality awareness on Medium layout**
  On Medium layout, detect whether an external keyboard is connected (via
  `KeyboardEvent` presence on first keypress). When a keyboard is detected, enable
  desktop-class keyboard shortcut discoverability: show keyboard shortcut hints in
  tooltips, enable the command palette (Ctrl+P), and show the keyboard shortcut overlay
  on `?` press. In touch-only mode, hide shortcut hints and ensure touch target sizes
  meet the 44px recommended minimum.
