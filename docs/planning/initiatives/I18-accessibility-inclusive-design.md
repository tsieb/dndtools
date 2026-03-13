# Initiative 18 — Accessibility & Inclusive Design

## Status: COMPLETED

## Notated Changes (2026-03-10)

- Accessibility remediation update: fixed `Settings` tab semantics by ensuring the About tab is contained in a proper `tablist`, removing a critical `aria-required-parent` violation.
- Accessibility remediation update: added explicit accessible names to unlabeled Settings appearance `<select>` controls (`UI density`, `Note reading width`) to resolve critical `select-name` violations in CI axe scans.

**Outcome:** DND Tools meets WCAG 2.2 Level AA. Every primary workflow is completable
by keyboard alone. Screen readers can navigate all primary sections, read notes, and
use the command palette. Focus is always visible and never obscured. Colors communicate
status only in conjunction with non-color signals. The application works correctly with
prefers-reduced-motion and high-contrast system settings. Accessibility testing is
automated in CI and manually validated before each release.

**Depends on:** I13 (navigation structure and semantic HTML must be established before
ARIA patterns can be applied correctly), I14 (layout components must be built before
their focus management can be audited), I15 (design system components must encapsulate
accessibility behaviors before the audit can confirm component-level compliance)

**Root-cause diagnosis:**

The current application has significant accessibility gaps despite some intentional
ARIA usage. Navigation items mix `<a>` and `<button>` elements without consistent
patterns. The folder tree in the sidebar is a series of `<button>` elements with inline
padding-left for indentation — it does not implement the WAI-ARIA tree view pattern
(`role="tree"`, `role="treeitem"`, `aria-expanded`, keyboard arrow-key navigation).
The 2x2 tab grid for sidebar modes (Tree/Recent/Favorites/Campaign) uses `<button>`
elements without `role="tablist"` / `role="tab"` / `aria-selected` — a screen reader
has no way to understand this as a tab interface. Dialog components (template picker,
confirm dialog, dice tray overlay) do not implement focus traps — tabbing in an open
dialog can reach content behind it. The sidebar context menu (`role="menu"` is present)
but has no keyboard activation handler for the `ContextMenu` key. Focus indicators
use browser defaults inconsistently applied. Status indicators (sync dot, health badge)
communicate state through color alone — the label is `hidden sm:inline`, meaning it is
hidden on small screens where the color-only signal is the only indicator. There is no
skip link. `prefers-reduced-motion` is not handled anywhere. The `title` attribute is
used as the primary tooltip mechanism throughout — `title` is inaccessible on touch
devices and to keyboard users who do not hover.

These gaps are not cosmetic — they represent real barriers for users who rely on
assistive technology or keyboard navigation, and they violate multiple WCAG 2.2 success
criteria. Given the project's goal of being the premier TTRPG tool, inaccessibility is
a market limitation, not just an ethical gap.

---

## Epic 18.1 — Semantic HTML and ARIA Landmark Architecture

**Goal:** Every page in the application has correct HTML landmark structure. Screen
readers can navigate between major regions. Navigation elements have appropriate ARIA
roles and labels. There are zero missing landmark violations in automated scans.

**Stories:**

- **S18.1.1 — Skip link and landmark foundation**
  Add a visually hidden but focusable skip link as the first element in `+layout.svelte`:
  `<a class="skip-link" href="#main-content">Skip to main content</a>`. The link
  becomes visible on focus (positioned absolutely, top-left, with high-contrast accent
  background). Wrap the primary navigation rail in `<nav aria-label="Primary
navigation">`. Wrap the local section panel in `<nav aria-label="{sectionName}
navigation">`. Wrap the main content area in `<main id="main-content">`. Wrap the
  session board in `<section aria-label="Session board">`. Wrap the TopBar in
  `<header role="banner">`. Wrap the sidebar footer in `<footer>`. These landmarks are
  the foundational layer that all subsequent ARIA patterns build on.

- **S18.1.2 — Navigation ARIA patterns**
  Every navigation pattern in the application uses the correct ARIA:
  - Primary section nav (NavRail / NavBar): `role="navigation"` + `aria-label="Primary"`.
    Active section: `aria-current="page"` on the current link.
  - Folder tree: `role="tree"` on the container, `role="treeitem"` on each item,
    `aria-expanded="true/false"` on folder nodes with children, `aria-selected` on
    the selected item. Keyboard: Down/Up move focus, Right expands a collapsed folder,
    Left collapses or moves to parent, Home/End jump to first/last, Enter navigates.
  - Sidebar mode tabs (Tree/Recent/Favorites/Campaign): `role="tablist"` on the
    container, `role="tab"` on each button, `aria-selected="true/false"`, `aria-
controls` pointing to the panel id. The currently selected tab's panel has
    `role="tabpanel"` and `aria-labelledby` pointing to the tab.
  - Breadcrumb: `<nav aria-label="Breadcrumb">` + `<ol>` + `<li>` + `<a>`, with
    `aria-current="page"` on the final (current) item.

- **S18.1.3 — Page title and heading hierarchy enforcement**
  Every route must have a single `<h1>` that matches the page title. The `<h1>` is
  updated on route transitions using `<svelte:head><title>...</title></svelte:head>`.
  Document the heading hierarchy contract: `<h1>` is the page title, `<h2>` is a major
  section, `<h3>` is a sub-section within a major section. Heading levels must not be
  skipped. Headings must not be used for visual styling — visual emphasis that is not
  semantically a heading uses `<strong>`, `<em>`, or CSS classes on `<p>` or `<span>`.
  Add a CI lint rule (Playwright axe scan) that flags heading hierarchy violations.

- **S18.1.4 — Status indicator ARIA announcements**
  Status indicators (sync status, vault health, MCP changes count, session mode active)
  that change state during use must announce changes to screen readers. Use `role="status"`
  (polite, for non-urgent updates like sync status change) or `role="alert"` (assertive,
  for errors like vault health critical). The sync indicator's text label (`Online`,
  `Offline`, `Syncing`, `Sync Error`) must be visible at all viewport sizes — the
  `hidden sm:inline` class on the label is removed. On Compact layout, the label appears
  in the overflow menu or as an accessible name on the icon button.

---

## Epic 18.2 — Focus Management and Keyboard Navigation

**Goal:** Keyboard users can navigate every primary workflow without a mouse. Focus is
always visible, logically ordered, and never lost into an unreachable element or trapped
behind a modal backdrop.

**Stories:**

- **S18.2.1 — Focus trap system for modals and overlays**
  Implement a `useFocusTrap` Svelte action in `src/lib/actions/focus-trap.ts`. The
  action: (1) on activation, queries all focusable elements within the container, (2)
  moves focus to the first focusable element, (3) intercepts Tab and Shift+Tab to cycle
  only within the container (wrapping at the ends), (4) intercepts Escape to close the
  parent overlay and return focus to the trigger element. The action is applied to:
  `Dialog.svelte`, `Sheet.svelte`, the command palette overlay, the template picker,
  the confirm dialog, the dice tray overlay. The trigger element is passed as a prop
  or detected via `document.activeElement` at activation time.

- **S18.2.2 — Focus visibility system**
  Define a global focus ring in `app.css`:
  `*:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }`
  `*:focus:not(:focus-visible) { outline: none; }` (suppress focus ring for mouse
  clicks, show for keyboard). `--color-focus-ring` is a semantic token: accent color in
  light theme, bright gold in dark theme, meeting 3:1 contrast ratio against adjacent
  backgrounds. Audit all components for `outline: 0` or `outline: none` overrides that
  remove focus visibility — each instance must be explicitly justified or removed. WCAG
  2.2 SC 2.4.11 (Focus Not Obscured, minimum): ensure sticky headers and the bottom
  navigation bar do not cover focused elements. Add `scroll-margin-top` and
  `scroll-margin-bottom` CSS to compensate for fixed headers/footers.

- **S18.2.3 — Keyboard shortcut registry and global handler**
  Build `src/lib/domain/keyboard-shortcuts.ts` as a registry: a typed map of shortcut
  definition (keys: `Ctrl+N`, `Ctrl+P`, `?`, `n`, `d`, etc.) to handler function and
  metadata (label, section, enabled condition). A global `KeyboardShortcutManager`
  subscribes to `document.keydown` and dispatches to the appropriate handler, respecting
  "enabled condition" (e.g., combat shortcuts only active when combat tracker is open;
  single-key shortcuts disabled when a text input is focused). Every existing shortcut
  (`Ctrl+B`, `Ctrl+P`, `Ctrl+D`, `Ctrl+N`) is migrated to the registry. New shortcuts
  are added only by registering in this file — no ad-hoc `addEventListener` in
  components. The registry is the source of truth for the keyboard shortcut overlay.

- **S18.2.4 — Arrow key navigation within lists**
  Interactive lists in the application — note list in Knowledge section, search results,
  command palette results, combat tracker initiative list — implement WAI-ARIA listbox
  keyboard behavior: Down/Up arrow move focus between items (with roving `tabindex`
  pattern), Enter activates the focused item, Home/End jump to first/last,
  `aria-activedescendant` on the container is updated to reflect the focused item.
  This means these lists are navigable without Tab-cycling through every item. The
  roving tabindex pattern: only the active item has `tabindex="0"`; all others have
  `tabindex="-1"`. Focus moves programmatically via JavaScript on arrow key press.

- **S18.2.5 — Focus restoration and route transitions**
  When navigating between routes, manage focus correctly: after a route transition, move
  focus to the page's `<h1>` (or `<main>` if no `<h1>` is immediately available).
  This ensures screen reader users hear the new page title announced and have a
  predictable starting point. When a modal closes, focus always returns to the element
  that triggered it. When a note is deleted and the user is on that note's route, focus
  is moved to the note list, not left in a void.

---

## Epic 18.3 — Sensory and Motion Accessibility

**Goal:** The application is fully usable by people with color vision deficiency,
vestibular sensitivity, and high contrast requirements. Motion is never required to
understand the application's state.

**Stories:**

- **S18.3.1 — Reduced motion global implementation**
  Add to `app.css`:

  ```css
  @media (prefers-reduced-motion: reduce) {
  	:root {
  		--duration-fast: 0ms;
  		--duration-medium: 0ms;
  		--duration-slow: 0ms;
  	}
  	*,
  	*::before,
  	*::after {
  		animation-duration: 0.01ms !important;
  		animation-iteration-count: 1 !important;
  		transition-duration: 0.01ms !important;
  	}
  }
  ```

  JavaScript-driven animations (dice roll visual, sidebar slide-in on mobile, session
  mode transition) must check `window.matchMedia('(prefers-reduced-motion: reduce)')
.matches` before animating. If true, skip the animation entirely and update state
  instantly. Add a "Reduce motion" toggle in Settings → Appearance that forces this
  behaviour regardless of the OS setting, stored in vault preferences.

- **S18.3.2 — Color independence for all status communication**
  Audit every instance where color communicates status or state. Required remediations:
  - Sync status indicator: the colored dot always accompanies a visible text label
    (`Online`, `Offline`, `Syncing`, `Sync Error`) — never color alone.
  - Vault health badge: uses icon shape (warning triangle for warning, stop octagon for
    critical) in addition to color. The count badge provides a non-color signal.
  - MCP changes badge: count number is the non-color signal.
  - Note list active/selected state: uses a combination of accent border + background
    fill, not color alone.
  - Error states in forms: uses an error icon + text, not border color alone.
  - Combat tracker HP bar: shows the numeric value alongside the bar; bar color shifts
    (green → yellow → red) accompany numeric display.

- **S18.3.3 — Contrast ratio audit and enforcement**
  Run a complete contrast audit against all semantic token combinations using an
  automated tool (Playwright color contrast scan or a design token linter). Required
  combinations to verify (all must meet WCAG AA 4.5:1 for small text, 3:1 for large
  text and UI components):
  - `--color-text` on `--color-bg`
  - `--color-text` on `--color-surface`
  - `--color-text-subtle` on `--color-bg`
  - `--color-text-subtle` on `--color-surface`
  - `--color-text` on `--color-primary-subtle` (active nav item background)
  - Focus ring color (3:1 against adjacent surface)
  - All semantic status colors (`success`, `warning`, `error`) on `surface` and `bg`
    Ratios that fail are fixed by adjusting the token values in `app.css`. All four theme
    presets (Parchment, Tavern, Scholar, Dungeon) must pass individually.

- **S18.3.4 — High contrast theme**
  Add a High Contrast theme preset (activated by `prefers-contrast: high` system setting
  or manual toggle in Settings → Appearance). The theme: uses system forced-color-safe
  values for backgrounds and text where possible, increases all border widths to 2px,
  increases focus ring to 3px solid with 3px offset, removes decorative opacity
  variations (no `opacity: 0.7` on muted text — uses a direct high-contrast color
  instead), and disables all background gradients and texture effects. The High Contrast
  theme is validated to pass WCAG AAA (7:1) for primary text combinations.

---

## Epic 18.4 — Touch Target and Pointer Accessibility

**Goal:** Every interactive element meets WCAG 2.2 target size requirements on touch
devices. Drag operations have pointer alternatives. Hover-only information is also
accessible to keyboard and touch users.

**Stories:**

- **S18.4.1 — Touch target audit and remediation**
  Audit all interactive elements against WCAG 2.2 SC 2.5.8 (Target Size Minimum,
  24x24px) and the recommended 44x44px for primary actions on touch surfaces. Current
  known violations:
  - Sidebar navigation items: `py-1.5` = ~28px total height — below 44px.
  - Tag pills in sidebar: ~24px height — at minimum, needs padding/spacing fixes.
  - Window chrome buttons (9 × 8 = 32px) — violated when in TopBar.
  - Breadcrumb links: typically `text-xs` with minimal padding.
  - Close buttons on toasts: often icon-only at 16px.
    Remediation: NavItem minimum height is 36px (Compact: 44px for mobile), primary
    action buttons minimum 44px, all close/dismiss buttons minimum 44px, tag pills use
    at least 4px vertical padding to reach 24px. Touch targets that are adjacent with
    < 8px spacing are given additional spacing to avoid accidental activation.

- **S18.4.2 — Drag operation alternatives (WCAG 2.5.7)**
  All drag operations in the application must have a single-pointer (click) alternative:
  - Sidebar panel width resize (drag handle): the handle is also a button that cycles
    through three preset widths on click (narrow / default / wide). The button is
    focusable and operable by keyboard (Enter/Space cycles, arrow keys adjust by 10px).
  - Session board tile reordering (drag-to-reorder): each tile has "Move up" / "Move
    down" buttons accessible via a tile action menu. The action menu is accessible from
    the keyboard.
  - Combat initiative reordering (drag-to-reorder ties): same pattern — "Move up" /
    "Move down" in the combatant action menu.

- **S18.4.3 — Tooltip accessibility for hover information**
  All uses of `title` attribute for informational tooltips are replaced with the
  `Tooltip.svelte` component (from I15). The Tooltip appears on: hover, keyboard focus
  of the trigger, and long-press (300ms) on touch. The tooltip content is linked to
  the trigger via `aria-describedby` so screen readers announce it. Tooltips that contain
  more than a short phrase offer a "More info" link that opens a HelpTip (I17) for full
  context. The `title` attribute is removed from all interactive elements — it is only
  acceptable on `<img>` elements without sibling text labels (where `alt` is primary).

---

## Epic 18.5 — Automated Accessibility Testing Pipeline

**Goal:** Accessibility regressions are caught by CI before they reach users. Manual
testing checklists exist for scenarios that cannot be automated. Every release includes
an accessibility checkpoint.

**Stories:**

- **S18.5.1 — Axe-core integration in Playwright E2E tests**
  Install `@axe-core/playwright` and add an accessibility scan to every Playwright test
  that exercises a route. The scan runs after page load and any significant state change.
  Violations are categorized: critical (block CI merge), serious (emit warning, tracked
  in a known-violations file), moderate and minor (logged, not blocking). The known-
  violations file lists each accepted violation with a justification and a target
  resolution date — it is not a permanent whitelist. CI fails if any critical violation
  is introduced, or if any violation's target resolution date has passed.

- **S18.5.2 — Keyboard-only Playwright test scenarios**
  Add dedicated keyboard-navigation Playwright tests for the critical user journeys:
  1. Open the app, navigate to Knowledge via keyboard, open a note, return to list.
  2. Open the command palette (Ctrl+P), search for a note, navigate to it, press Escape
     to return.
  3. Open a Dialog (e.g., template picker), navigate with Tab, dismiss with Escape,
     confirm focus returns to the trigger.
  4. Navigate the folder tree with arrow keys: expand a folder, select a note, collapse.
  5. Start the dice tray (Ctrl+D), use Tab to reach a die button, roll it, close.
     These tests use Playwright's keyboard API exclusively — no mouse events. Failures
     indicate regressions in keyboard navigation.

- **S18.5.3 — Manual screen reader QA process**
  Document a screen reader QA checklist in `docs/development/ACCESSIBILITY_QA.md`.
  The checklist covers three environments: VoiceOver + Safari on macOS, NVDA +
  Chrome on Windows, TalkBack + Chrome on Android. For each, the checklist walks:
  (a) navigate to each primary section using screen reader gestures, (b) open and read
  a note, (c) use the command palette to find a note, (d) use the dice tray, (e) verify
  all form controls in Settings are properly labelled. The checklist is executed before
  each minor and major version release. Results are documented in the release notes.
  Known screen reader issues that cannot be resolved are documented with workarounds.

- **S18.5.4 — Accessibility CI gate and reporting**
  Add an accessibility CI step to `.github/workflows/ci.yml` that runs the axe scans
  against the built application (using Playwright against a preview build). The step
  outputs a formatted accessibility report as a CI artefact. Pull requests that introduce
  new critical violations are blocked from merge via a GitHub status check. The
  accessibility report summary is posted as a PR comment summarising: violations found,
  new violations introduced, violations resolved since last run. This makes accessibility
  regression visible in the code review process.
