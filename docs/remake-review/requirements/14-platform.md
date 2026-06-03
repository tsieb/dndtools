## PLAT - Platform Shell, Persistence, and Runtime

Capability tree:

- Platform profiles and shells: `PLAT-001`, `PLAT-002`, `PLAT-003`, `PLAT-004`, `PLAT-005`, `PLAT-016`
- Persistence and boundaries: `PLAT-006`, `PLAT-007`, `PLAT-011`, `PLAT-012`, `PLAT-018`
- Migration and diagnostics: `PLAT-008`, `PLAT-009`, `PLAT-017`
- Quality gates and onboarding: `PLAT-010`, `PLAT-013`, `PLAT-014`, `PLAT-015`

### PLAT-001
**Statement:** The shell shall select desktop, tablet, mobile, or web platform profiles at runtime from capability descriptors rather than feature components branching on raw viewport width.
**Source:** Architecture Contract 1 Platform Profile Selection.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a device has touch input and compact viewport, when profile detection runs, then the shell selects a profile and passes capabilities to GUI packages.
- Given a feature component needs layout variation, when implemented, then it branches on profile capability rather than `window.innerWidth`.

### PLAT-002
**Statement:** The desktop shell shall provide trusted filesystem storage, OS dialogs, updates, protocol handling, titlebar controls, context menus, file watching, and MCP sidecar lifecycle behind typed platform services.
**Source:** Project Overview desktop shell; Security model.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: not applicable | Player-safe: yes
**Acceptance criteria:**
- Given the renderer requests a vault file, when running on desktop, then the request crosses typed IPC into trusted platform services.
- Given titlebar state changes, when maximized/restored, then controls reflect current shell state and respect platform-specific hitbox dimensions.
- Given desktop titlebar controls render, when target-size audit runs, then hitboxes meet the platform chrome baseline and remain inside the declared titlebar height.

### PLAT-003
**Statement:** The mobile GUI shall provide density-reduced access to all Must-have commands through sheets, drawers, tabs, command menus, and focused views without creating alternate data models.
**Source:** Architecture Contract 1 Slimmer Device Definition; UX Guidelines Mobile.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a Scene has multiple widgets, when opened on mobile, then widgets can be operated through focused or stacked views backed by the same Scene state.
- Given a mobile workflow lacks room for a desktop panel, when adapted, then the same command remains reachable through an alternate control.

### PLAT-004
**Statement:** The web/PWA runtime shall use browser-safe storage and cloud-cache capabilities while preserving local-first behavior for cached vault content.
**Source:** Project Overview PWA; Feature Inventory I6.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a PWA has cached content, when offline, then the user can read and edit supported cached vault content.
- Given a filesystem-only feature is unavailable, when invoked in web profile, then the app shows degraded capability status.
- Given a PWA has never cached a vault or auth state, when opened offline, then it shows first-time setup unavailable without blocking already cached local vaults in the same browser profile.
- Given cloud or Google Docs auth expires while the PWA is offline, when the user edits cached content, then the edit remains local/queued and reauthorization is requested only when network returns.
- Given a service worker update is pending, when cached vault content is open, then the update policy preserves current local writes and reports any reload requirement before activation.

### PLAT-005
**Statement:** The Android runtime shall use Capacitor platform services for storage, file access, keyboard adaptation, and share/import flows without exposing native APIs to feature components.
**Source:** Project Overview Android; Feature Inventory I6.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given the Android app imports a file, when the operation runs, then feature logic receives a platform service result rather than raw native API access.
- Given the virtual keyboard opens in editor, when layout adjusts, then the active input remains visible and controls remain reachable.

### PLAT-006
**Statement:** All persistence shall route through typed storage adapters or sync source adapters, never direct filesystem, IndexedDB, cloud, or native bridge calls from GUI components.
**Source:** Project Overview Storage abstraction; Architecture Contract 1 layers.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a GUI component needs to save a note, when implemented, then it dispatches a core command rather than calling storage directly.
- Given boundary lint runs, when a component imports filesystem or IndexedDB primitives directly, then the gate fails.

### PLAT-007
**Statement:** Every IPC or platform-service boundary shall require named methods, runtime schemas, payload size limits, enum allowlists, and structured error handling.
**Source:** Security IPC Injection and Type Confusion; Defect `CLAUDE-IPC-CLEAR-CHANGELOG`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a new IPC handler is registered without schema validation, when tests or lint run, then the gate fails.
- Given an oversized payload crosses IPC, when parsed, then it is rejected before business logic runs.

### PLAT-008
**Statement:** The system shall provide migration, integrity verification, safety snapshots, write-ahead recovery, and dry-run upgrade checks for vault schema and durable state documents.
**Source:** Feature Inventory I1; Project Overview migrations.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: dm-only | Mobile: yes | Player-safe: dm-only
**Acceptance criteria:**
- Given a vault needs migration, when dry-run runs, then the user receives required changes and blocking issues before mutation.
- Given migration fails mid-write, when the app restarts, then write-ahead recovery or rollback restores a consistent state.

### PLAT-009
**Statement:** The DM or platform administrator shall be able to view system health, diagnostics, sync/source status, platform capability status, and exportable support bundles without leaking secrets by default.
**Source:** Feature Inventory I1 diagnostics; Security device-local diagnostics.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: dm-only | Mobile: slim | Player-safe: dm-only
**Acceptance criteria:**
- Given a sync source fails, when system health opens, then source status and remediation are shown.
- Given diagnostics are exported, when the bundle is generated, then secrets and raw absolute paths are redacted unless explicitly included by the user.
- Given a player or observer requests an exportable support bundle, when permissions are evaluated, then export is denied unless an explicit DM/admin diagnostic grant exists.

### PLAT-010
**Statement:** Release and platform quality gates shall be tiered, high-value, owned, and bounded by configured time budgets that preserve developer feedback without allowing platform-critical regressions.
**Source:** Vision CI/CD Philosophy; Defects `CLAUDE-INFRA-CI-GATES`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: not applicable | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a change affects platform code, when CI runs, then the relevant platform smoke or release gate is selected by path/tier rules.
- Given a gate exists, when reviewed, then it has an owner, reason, and user-facing defect class it protects.
- Given the smoke path runs on supported CI hardware, when measured, then it completes under the configured target of three minutes or records an explicit scope exception.
- Given a gate has not caught or prevented a user-facing defect class for the configured review window, when quality review runs, then the gate is removed, narrowed, or re-justified.

### PLAT-011
**Statement:** Type-only contracts, runtime constructors, defaults, validators, and cross-boundary helpers shall live in separate modules with import rules enforced by lint and tests.
**Source:** Known Defect `AUDIT-21.5-TYPE-RUNTIME-MIX`.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: not applicable | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a module under a type-only contract path exports runtime values, when boundary lint runs, then the gate fails.
- Given runtime validators are needed across Electron, MCP, and renderer code, when imported, then they come from approved runtime modules rather than type-only paths.

### PLAT-012
**Statement:** Direct platform or filesystem access exceptions shall be explicit, scoped, owned, linted, and regression-tested.
**Source:** Known Defect `AUDIT-21.5-MCP-FS-EXCEPTIONS`; Security model.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: not applicable | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given code imports a platform primitive outside approved services or exception allowlists, when lint runs, then the gate fails.
- Given an exception is approved, when reviewed, then it has owner, rationale, allowed paths, tests, and removal criteria.

### PLAT-013
**Statement:** Fresh-vault onboarding, feature-tier visibility, maturity gates, help surfaces, and first-run Command Center setup shall be covered by fixture-driven acceptance tests.
**Source:** Known Defect `AUDIT-21.4-FEATURE-TIER-E2E`; Feature Inventory onboarding and maturity tiers.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: dm-only | Mobile: yes | Player-safe: dm-only
**Acceptance criteria:**
- Given a fresh vault fixture, when first-run onboarding completes, then the Command Center, core navigation, and feature-tier state match expected defaults.
- Given core/intermediate/advanced feature gates are configured, when fixture tests run, then each tier shows and hides the correct capabilities without manual verification.

### PLAT-014
**Statement:** Platform support status for desktop, web/PWA, Android, tablet, and mobile profiles shall be declared before release with explicit parity, degradation, and unsupported-feature lists.
**Source:** Vision Decoupled Processing / Display; Feature Inventory I6.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a Must-have command is unsupported on a platform profile, when release review runs, then the release is blocked unless the requirement explicitly allows that exception.
- Given a platform degrades a feature, when the user opens capability status, then the reason and available fallback are visible.

### PLAT-015
**Statement:** Engineering release notes, structure inventories, and defect-count summaries shall be generated or validated from structured sources rather than hand-synchronized markdown counts.
**Source:** Known Defects `CLAUDE-CODEX-COUNT-MISMATCH`, `CHANGELOG-LOW-SIGNAL`, `AUDIT-21.4-PROJECT-STRUCTURE`.
**Priority:** Should-have
**Compatibility:** Offline: yes | Multi-user: not applicable | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given the defect register changes, when documentation validation runs, then summary counts match structured finding data.
- Given repository structure changes, when docs validation runs, then stale generated structure references are reported.
- Given `10-requirements.md` contains a Count Audit table, when docs validation runs, then counts are recomputed from requirement headings and the table fails validation if hand-synchronized values drift.

### PLAT-016
**Statement:** The web/PWA release shall publish a cached read/write support matrix covering notes, maps, Scenes, characters, sessions, handouts, assets, search, graph, sync status, and unsupported platform features.
**Source:** Project Overview PWA; Open Gaps; Sync local-first model.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given release review runs, when the PWA matrix is inspected, then each core domain is marked as cached read, cached write, queued write, unavailable, or unsupported with the required fallback.
- Given release review runs, when the PWA matrix is inspected, then auth state, first-time auth limits, service-worker cache/update policy, storage quota, and eviction recovery behavior are declared for each affected domain.
- Given browser storage eviction removes cached assets, when the user opens affected content, then missing assets are reported and core cached metadata remains safe.
- Given a queued PWA edit reconnects, when sync resumes, then the edit is replayed through the same operation validation as desktop.
- Given a PWA feature depends on filesystem, OS credential store, protocol handling, or MCP sidecar access, when invoked, then it reports unsupported capability rather than attempting a native path.

### PLAT-017
**Statement:** Participants shall be able to view non-leaking connection, sync, platform capability, and session delivery status relevant to their own session without receiving DM/admin diagnostics or support bundles.
**Source:** Collaboration status requirements; Security diagnostics.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a player is disconnected or stale, when they open participant status, then they see reconnecting, offline, stale, or unavailable state without hidden entity names, source paths, or DM diagnostics.
- Given a handout, Scene projection, or sync source is unavailable to a participant, when status renders, then the reason is generic and action-oriented without revealing whether hidden content exists.
- Given the DM exports diagnostics, when participant-safe status data is included, then it excludes secrets, raw paths, hidden titles, and private player content by default.

### PLAT-018
**Statement:** User-visible durable commands across notes, maps, Scenes, widgets, sessions, permissions, and sync shall expose standard pending, success, failure, retry, cancellation, and undo/recovery states where the command contract supports them.
**Source:** UX Guidelines Reliability; Defects async mutation timing bugs.
**Priority:** Must-have
**Compatibility:** Offline: yes | Multi-user: yes | Mobile: yes | Player-safe: yes
**Acceptance criteria:**
- Given a durable command fails after user input is accepted, when the command result returns, then pending state clears, no partial UI success is shown, and retry or recovery guidance is available.
- Given a map, content, or session command supports undo, when undo is invoked, then the recorded inverse or committed before state is applied through the Processing Core command model.
- Given a command is cancelled before commit, when state is inspected, then no durable operation is appended and any temporary UI state is discarded or marked draft-only.
