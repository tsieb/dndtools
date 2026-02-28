# UX Guidelines

This document defines strict UX requirements for DND Tools and tracks known gaps.

## 1. Product UX Context

Primary usage context:

- active tabletop sessions
- fast retrieval under time pressure
- low tolerance for data loss or confusing state

Primary user roles:

- Dungeon Masters (heavy linking, high note volume)
- Players (lighter but frequent read/update access)

## 2. Non-Negotiable UX Principles

1. Content-first layout.
2. Fast interaction feedback.
3. Zero-surprise persistence behavior.
4. Keyboard parity for all major actions.
5. Accessible defaults.

## 3. Current Implemented UX Baseline

Verified from code:

- Theme system with light/dark/system modes.
- Sticky location bar with breadcrumbs and route context hints.
- Sidebar mode switcher for folder tree, recent, favorites, and campaign entities.
- Command palette (`Ctrl/Cmd+P`) supporting actions, navigation, settings, and notes.
- Command palette template creation actions, including one-click session recap scaffold generation.
- New note shortcut (`Ctrl/Cmd+N`).
- Global search shortcut (`Ctrl/Cmd+Shift+F`).
- Top bar back/forward controls with recent-route clarity.
- Link graph exploration view with folder/tag/text filters and isolated-node toggle.
- Top bar template button for quick "create from template" access.
- Editor lazy loading and rich toolbar actions.
- Reusable editor snippet library in the insert menu.
- Editor split-pane mode with synchronized preview scrolling.
- Structured frontmatter metadata controls in note edit flow.
- Structured object forms for object-backed notes with markdown sync, lint feedback, and history-revert controls.
- Unresolved-link workflow in editor (batch create, quick rename, disambiguation suggestions).
- Backlinks panel in note view.
- Session-mode focus reading toggle with minimal chrome.
- Related note quick-jump panel (tags, backlinks, object references).
- Guided first-run onboarding checklist with dismiss/revisit controls.
- Contextual onboarding tips for wikilinks, backlinks, and object embeds.
- First-run shortcuts for sample vault starters and Obsidian import preview.
- Settings tabs including MCP pending changes (desktop mode).
- Skip link and focus-visible styling.
- Reduced motion media query handling.

## 4. Interaction Requirements

### 4.1 Navigation

- Every page must have a clear route back to note list or home.
- Back/forward browser semantics must remain intact.
- Sidebar toggling must never trap focus.

### 4.2 Editing

- Editor must provide visible save status.
- Auto-save failures must be surfaced with actionable messaging.
- Keyboard shortcuts in editor must be documented and discoverable.

### 4.3 Search

- Quick switcher is title-first navigation.
- Global search is content-oriented discovery.
- Search results must expose enough context for fast disambiguation.

## 5. Visual System Requirements

Current theme tokens are in `src/app.css` and must remain source of truth.

Rules:

- use semantic tokens, not hard-coded random colors
- ensure contrast ratios meet WCAG 2.1 AA
- use consistent spacing and interaction states
- preserve reduced-motion compliance

## 6. Accessibility Requirements (Mandatory)

- Full keyboard access for all critical workflows.
- Visible focus indicators across controls.
- Correct ARIA semantics on tablists, dialogs, and dynamic regions.
- Skip-to-content present and functional.
- Avoid keyboard traps in modals/sidebars.

`TODO(APP):` Add automated accessibility assertions in E2E for key routes.
Reason: backlog item tracked for planned implementation.
Risk: quality and behavior drift if deferred.
Target:

- `tests/e2e/*`
- Playwright setup with axe integration.

## 7. Mobile and Responsive Requirements

Current behavior:

- sidebar becomes overlay drawer on mobile
- main content remains scrollable

Required improvements:

- stable touch target sizing (>=44x44 for core controls)
- better keyboard + virtual keyboard handling in editor
- explicit viewport-specific QA matrix

`TODO(APP):` Add mobile-specific e2e scenarios for note edit/search/sidebar interactions.
Reason: backlog item tracked for planned implementation.
Target: see the surrounding section and referenced files in this block.
Risk: quality and behavior drift if deferred.

## 8. Reliability UX Requirements

- destructive actions must use explicit confirmation.
- trash behavior must be reversible unless permanent delete is explicitly requested.
- vault-switch and MCP actions must display progress/result feedback.

## 9. Known UX Gaps

`TODO(APP):` Add explicit failure state UX for background save/index failures with retry guidance.
Reason: backlog item tracked for planned implementation.
Target: see the surrounding section and referenced files in this block.
Risk: quality and behavior drift if deferred.

`TODO(APP):` Add import/export preview UX with conflict reporting before applying changes.
Reason: backlog item tracked for planned implementation.
Target: see the surrounding section and referenced files in this block.
Risk: quality and behavior drift if deferred.
