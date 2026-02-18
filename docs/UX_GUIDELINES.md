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
- Sidebar with recent, pinned, folders, and tags sections.
- Quick switcher (`Ctrl/Cmd+P`).
- New note shortcut (`Ctrl/Cmd+N`).
- Global search shortcut (`Ctrl/Cmd+Shift+F`).
- Editor lazy loading and rich toolbar actions.
- Backlinks panel in note view.
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

## 8. Reliability UX Requirements

- destructive actions must use explicit confirmation.
- trash behavior must be reversible unless permanent delete is explicitly requested.
- vault-switch and MCP actions must display progress/result feedback.

## 9. Known UX Gaps

`TODO(APP):` Add explicit failure state UX for background save/index failures with retry guidance.

`TODO(APP):` Add unresolved-link disambiguation flow for duplicate titles.

`TODO(APP):` Add import/export preview UX with conflict reporting before applying changes.
