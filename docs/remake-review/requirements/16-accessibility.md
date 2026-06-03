## A11Y - Accessibility

Capability tree:

- WCAG conformance and evidence: `A11Y-001`, `A11Y-008`, `A11Y-010`, `A11Y-011`
- Keyboard, pointer, and focus: `A11Y-002`, `A11Y-003`, `A11Y-004`
- Motion, announcements, and semantics: `A11Y-005`, `A11Y-006`, `A11Y-007`
- Spatial nonvisual alternatives: `A11Y-009`

### A11Y-001
**Statement:** The application shall conform to WCAG 2.2 AA for core workflows, using WCAG 2.1 AA evidence as the v1 baseline and adding current 2.2 interaction criteria where applicable.
**Source:** Accessibility register; WCAG 2.2.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given primary routes and workflows, when automated and manual accessibility audits run, then WCAG 2.2 AA success criteria applicable to the workflow pass or have a documented, approved exception with remediation owner.
- Given a new interaction pattern is added, when reviewed, then applicable WCAG 2.2 keyboard, pointer, focus, target-size, drag, and accessible-name criteria are explicitly tested, not merely considered.

### A11Y-002
**Statement:** A keyboard-only user shall be able to complete all critical workflows including Scene layout, map editing alternatives, note editing, search, combat, handouts, dialogs, and Command Center actions.
**Source:** Accessibility register keyboard workflows; Defect `RESEARCH-A11Y-GESTURE-ALTERNATIVES`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given keyboard-only input, when completing a session start, search, and combat update flow, then no pointer-only step is required.
- Given a drag operation exists, when keyboard alternative is used, then it produces the same core command result.
- Given keyboard-only input, when editing a note, delivering a handout, using a dialog, and invoking Command Center actions, then every required control is reachable, named, and operable.
- Given map editing tools are available, when a keyboard-only user creates, selects, moves, or deletes a POI or route waypoint, then the same map command is dispatched as the pointer workflow.

### A11Y-003
**Statement:** Focus order, focus trapping, focus restoration, roving tabindex, and visible focus indicators shall be implemented through shared utilities and tested on route, dialog, card grid, canvas, and popover surfaces.
**Source:** Accessibility register; Defects `CODEX-PR13-MAP-CARD-FOCUS`, `CODEX-PR7-HASH-FOCUS`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a card grid uses arrow keys, when focus moves, then DOM focus and active item state move together.
- Given a modal opens, when Tab cycles, then focus remains inside until dismissed.
- Given a route transition completes without a hash target, when focus restoration runs, then the route landmark receives focus and the previous route control is not left active.
- Given a popover closes by Escape, outside click, or command completion, when focus is restored, then focus returns to the invoking control or an explicit fallback.
- Given a canvas or Scene widget is selected by keyboard, when roving focus changes selection, then visible focus indicators and selection state remain synchronized.

### A11Y-004
**Statement:** Interactive controls shall meet target-size and pointer-cancellation requirements for their platform context, with separate desktop chrome and touch target contracts.
**Source:** Accessibility register target size; Defect `CODEX-PR9-TITLEBAR-HITBOX`; WCAG 2.2 target size.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given mobile/touch controls, when target-size audit runs, then core controls meet a minimum 44 by 44 CSS pixel target unless an approved WCAG exception applies.
- Given desktop titlebar controls, when rendered, then hitboxes meet the platform chrome baseline and do not overflow constrained titlebar height.

### A11Y-005
**Statement:** Motion, animation, reveal effects, map transitions, dice effects, audio visuals, and focus changes shall respect a single resolved motion preference state.
**Source:** UX Guidelines reduced motion; Defect `CODEX-PR8-REDUCED-MOTION`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given OS reduced motion is enabled and user override is no-preference, when motion resolution runs, then the documented precedence determines emitted classes/tokens.
- Given reduced motion is active, when a reveal animation would play, then it is replaced by a reduced or instant transition.

### A11Y-006
**Statement:** The application shall provide live announcements for route changes, async command status, save state, sync state, validation failures, and session events without excessive or duplicate announcements.
**Source:** Accessibility register live announcer; UX Guidelines reliability.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a note save succeeds, when status changes, then a concise live announcement is emitted.
- Given repeated sync events occur rapidly, when announced, then debouncing prevents overwhelming output.

### A11Y-007
**Statement:** Screen reader users shall receive accurate names, roles, values, headings, labels, status messages, and non-color state indicators for notes, maps, widgets, combat, and search.
**Source:** Accessibility register gaps; WCAG 2.2.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a widget control is focused, when inspected by assistive technology, then it has an accessible name derived from widget type and bound entity where allowed.
- Given a combatant is bloodied or hidden, when presented, then status is not communicated by color alone.

### A11Y-008
**Statement:** Accessibility tests shall produce worker-isolated artifacts, deterministic fingerprints, normalized dynamic IDs, and release evidence tied to route/workflow coverage.
**Source:** Defects `CODEX-PR12-A11Y-REPORT-RACE`, `CODEX-PR12-AXE-FINGERPRINTS`; Accessibility CI.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: not applicable | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given Playwright runs in parallel, when accessibility reports are written, then each worker writes isolated artifacts that are merged after the run.
- Given dynamic fixture IDs differ, when fingerprints are generated, then normalized fingerprints remain stable.

### A11Y-009
**Statement:** Spatial Scene, map, graph, route, and timeline surfaces shall provide nonvisual list, table, or structured summaries that expose equivalent visible information and commands.
**Source:** WCAG 2.2; Architecture Contract 4 Widget / Canvas Accessibility; audit remediation.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a map has visible POIs and routes, when a screen reader user opens the nonvisual map summary, then visible POIs/routes can be reviewed and activated without pointer positioning.
- Given a Scene contains widgets in spatial positions, when a keyboard or screen reader user opens the Scene outline, then widgets are listed with accessible names, visibility-safe binding labels, and available commands.

### A11Y-010
**Statement:** Accessibility release gates shall fail on unapproved critical, serious, or WCAG 2.2 AA-blocking violations and shall require evidence for manual-only criteria.
**Source:** Accessibility CI; WCAG 2.2.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: not applicable | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given an unapproved AA-blocking violation is found in a core workflow, when release gates run, then the gate fails.
- Given a criterion cannot be fully automated, when release evidence is generated, then manual test result, tester, scope, and date are recorded.

### A11Y-011
**Statement:** Semantic color, high-contrast themes, token states, map overlays, combat statuses, and audio/session indicators shall be testable without relying on color alone.
**Source:** WCAG 2.2 non-text contrast/use of color; design token audit; map/combat visibility requirements.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given high-contrast mode is active, when notes, widgets, maps, tokens, combat rows, and alerts render, then text, icons, outlines, focus indicators, and state markers meet configured contrast targets.
- Given a token is hidden, selected, defeated, concentrating, or affected by an area overlay, when inspected visually and by assistive technology, then state is conveyed by text, icon, shape, pattern, or accessible metadata in addition to color.
- Given semantic color tokens change, when visual regression and accessibility checks run, then core status components are covered before release.
