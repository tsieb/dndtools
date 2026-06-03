## NAV - Navigation and Information Architecture

Capability tree:

- Home and canonical sections: `NAV-001`, `NAV-009`
- Route aliases and deep links: `NAV-002`, `NAV-004`, `NAV-005`
- Global/local/contextual navigation: `NAV-003`
- IA validation and accessibility semantics: `NAV-006`, `NAV-007`
- Command palette and actor filtering: `NAV-008`, `NAV-010`

### NAV-001
**Statement:** The application shall use the Command Center as home and maintain canonical section-rooted navigation for approved Navigation Sections such as Knowledge, Atlas, Session, Campaign, Characters, Audio, MCP, and Settings.
**Source:** Vision Command Center; Feature Inventory I13.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given the app opens with a vault, when routing completes, then the home surface is Command Center.
- Given a user navigates by primary nav, when a section opens, then route, landmark, and title reflect the canonical section.
- Given a player or observer navigates by primary nav, when sections are filtered, then DM-only sections and actions are absent or disabled with non-leaking reasons.

### NAV-002
**Statement:** The system shall generate or validate legacy route aliases from a route alias table, preserving search parameters and hashes by default.
**Source:** Defects `CLAUDE-ROUTE-LEGACY-DUPES`, `CODEX-PR13-MAP-REDIRECT-PARAMS`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a legacy map URL includes `?poi=abc&x=1&y=2`, when redirected, then all search parameters are preserved.
- Given a full duplicate legacy implementation exists instead of a redirect stub, when route audit runs, then the gate fails.

### NAV-003
**Statement:** A user shall be able to navigate using global navigation, local section navigation, contextual navigation, breadcrumbs, backlinks, pinned/recent items, and command palette without redundant conflicting route state.
**Source:** Feature Inventory I13; UX Guidelines Navigation.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a note is open, when backlinks or breadcrumbs are used, then navigation updates route and history coherently.
- Given mobile profile is active, when local nav is opened, then it appears as an accessible drawer/sheet and does not trap focus after closing.

### NAV-004
**Statement:** Navigation focus restoration shall preserve browser back/forward behavior, hash anchors, scroll position, route landmarks, and deep-link semantics.
**Source:** UX Guidelines Navigation; Defect `CODEX-PR7-HASH-FOCUS`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a URL with a heading hash, when navigation completes, then the heading scroll target remains active instead of unconditional landmark focus.
- Given a normal route transition without hash, when completed, then the route landmark receives appropriate focus and live announcement.

### NAV-005
**Statement:** A user shall be able to open map, Scene, note, object, character, and search result deep links that restore the intended selected entity, viewport, tab, or section when authorized.
**Source:** Feature Inventory I9/I13; Search requirements.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: yes
**Acceptance criteria:**
- Given a deep link targets a visible POI, when opened, then the map viewport focuses the POI.
- Given the target is hidden from a player, when opened, then the app shows a generic unavailable state without revealing the hidden target.
- Given the target has not been cached locally, when opened offline, then the app reports unavailable content while preserving non-sensitive route state.

### NAV-006
**Statement:** Navigation architecture shall be validated before route scaffolding using IA review, route audits, and user-task-oriented checks.
**Source:** Defect `RESEARCH-IA-VALIDATION`; Feature Inventory I13.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: not applicable | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a new top-level section is proposed, when architecture review runs, then it includes task fit, route ownership, aliases, and local nav contract.
- Given a route is added without IA metadata, when route audit runs, then the gate fails.

### NAV-007
**Statement:** Navigation components shall expose stable page titles, exactly one route-level `h1`, semantic landmarks, and live route announcements.
**Source:** Accessibility heading hierarchy; UX Guidelines.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given any primary route, when accessibility tests run, then exactly one `h1` exists and page title matches route context.
- Given route changes, when completed, then a live announcement communicates the new route.

### NAV-008
**Statement:** The command palette or equivalent command menu shall provide action, navigation, settings, note, Scene, map, and widget commands filtered by actor visibility and permission on every supported platform profile.
**Source:** Feature Inventory I13; UX Guidelines command palette.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player opens the command palette, when searching commands, then DM-only actions are absent.
- Given a visible command is disabled by current state, when shown, then it has an accessible disabled reason.
- Given a mobile profile cannot show a desktop command palette layout, when a Must-have command is needed, then the equivalent command menu exposes the same Processing Core command and filtering result.

### NAV-009
**Statement:** The approved top-level Navigation Section registry shall define owner, route root, player/observer availability, aliases, landmarks, local navigation contract, and release status for each section.
**Source:** Glossary "Navigation Section"; Defect `RESEARCH-IA-VALIDATION`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a new top-level section is proposed, when IA review runs, then owner, route root, aliases, actor availability, and local navigation contract are required.
- Given a section is DM-only, when a player or observer receives navigation data, then that section is absent or represented only by an allowed placeholder.

### NAV-010
**Statement:** Navigation and command surfaces shall use the same actor-filtered command availability API as widgets and visible controls.
**Source:** Architecture Contract 1 Command API; Permission requirements.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a command is unavailable because of missing visibility, when shown in navigation or command palette, then it is hidden or disabled without revealing the hidden target.
- Given a command is available through both a visible button and command palette, when invoked from either surface, then the same Processing Core command type and validation path are used.
