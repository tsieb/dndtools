# CLAUDE.md - Agent Development Guide

This file documents repository-specific guidance for AI-assisted development.

## Project Snapshot

DND Tools is an Electron-first local markdown vault application with:

- SvelteKit renderer UI
- filesystem storage in desktop mode
- IndexedDB fallback in browser mode
- MCP sidecar for agent access
- staged MCP write review as default safety mode

## Runtime Model

1. Electron main (`electron/main.ts`)

- owns vault selection and filesystem adapter lifecycle
- hosts IPC surface and sidecar management

2. Renderer (`src/`)

- uses `StorageAdapter` abstraction
- bootstraps via `src/lib/runtime/bootstrap.ts`

3. MCP (`mcp/`)

- stdio server from `mcp/index.ts`
- tools/resources registered from domain modules

## Important Boundaries

- Renderer must not access Node APIs directly.
- Data access in renderer must go through storage adapter.
- MCP and Electron main are trusted runtime boundaries.
- Do not bypass markdown pipeline for rendered note content.

## Tech Stack (Current)

- SvelteKit 2, Svelte 5, TypeScript 5 strict
- Tailwind CSS 4 + custom CSS tokens in `src/app.css`
- CodeMirror 6 (lazy-loaded)
- unified/remark/rehype markdown pipeline with custom wikilink plugin
- MiniSearch for full-text local search
- Dexie for IndexedDB fallback
- Electron 37 desktop shell
- MCP SDK for tool/resource server
- Vitest (unit/integration) + Playwright (E2E) for testing
- pnpm as package manager

## Repository Structure

Key roots:

- `src/` renderer
- `electron/` desktop shell
- `mcp/` sidecar server
- `docs/` engineering and product docs
- `tests/` e2e + fixtures

## Coding Standards

- strict typing, avoid `any`
- single-purpose modules
- explicit runtime boundary separation
- update tests and docs with behavior changes

## Required Commands Before Handoff

- `pnpm check`
- `pnpm test:e2e` for UI behavior changes
- `pnpm desktop:build` for desktop/runtime integration changes
- `pnpm mcp:build` for MCP entrypoint/tool/resource changes

## Git Workflow

For all story-level work, create a branch before starting:

git checkout master && git checkout -b story/<epic-id>-<story-id>-<slug>

Commit format: `<type>(<scope>): <imperative summary>`
Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
Scopes: `mcp`, `renderer`, `electron`, `storage`, `ui`, `ci`

Pre-commit hooks run `pnpm lint && pnpm format:check` automatically.
Pre-push hooks run `pnpm check` automatically. Never bypass with `--no-verify`.

Always run `pnpm format` before staging many files Ã¢â‚¬â€ Prettier is enforced in CI and pre-commit.

When a story is complete, open a PR and enable auto-merge:

gh pr create --title "<type>(<scope>): <summary> [Epic X.Y / SX.X.X]" --base master
gh pr merge --auto --squash

**You may merge your own PRs when CI passes** Ã¢â‚¬â€ no human approval required.

Full branch strategy, commit sizing, PR process, and recovery:
Ã¢â€ â€™ `docs/development/GIT_WORKFLOW.md`

## Common Task Notes

### New MCP Tool

1. Add tool file under correct `mcp/tools/<domain>/` folder.
2. Register in `mcp/tools/index.ts`.
3. Add tests for success, validation failure, and edge cases.
4. Update `docs/reference/AGENTIC_NOTES_WORKFLOW.md` if tool contract changes.

### Storage Contract Changes

1. Update `src/lib/types/storage.ts`.
2. Update both adapters:

- `src/lib/platform/storage/indexeddb-adapter.ts`
- `mcp/storage.ts`

3. Update Electron adapter bridge if needed.
4. Add migration/tests.
5. Update `docs/architecture/DATA_MODEL.md` and `docs/architecture/ARCHITECTURE.md`.

### UI Workflow Changes

1. Keep route components thin.
2. Place business logic in `src/lib/services/*` or stores.
3. Add/adjust e2e tests for critical paths.
4. Update docs if user behavior changed.

## Key Architecture Decisions

- Storage abstraction layer (`StorageAdapter` interface) Ã¢â‚¬â€ never access IndexedDB directly from components.
- Markdown pipeline in `src/lib/markdown/` Ã¢â‚¬â€ all parsing goes through unified, never manual.
- Offline-first: treat network as enhancement, not requirement.
- State managed via Svelte 5 runes classes in `src/lib/state/*.svelte.ts`.
- MCP server (`mcp/`) for AI agent vault access:
  - Uses `FileSystemAdapter` (reads/writes markdown files on disk)
  - 43+ tools across `vault/`, `notes/`, `objects/`, `boards/`, `search/`, `dice/`, `random/` domains (canonical list: `mcp/tools/index.ts`)
  - Tool contract framework (`mcp/tools/shared/contracts.ts`) Ã¢â‚¬â€ permissions, idempotency, retry
  - Schema migrations (`mcp/migrations.ts`) Ã¢â‚¬â€ versioned, with checkpoint/rollback
  - Staged storage (`mcp/staged-storage.ts`) Ã¢â‚¬â€ MCP writes staged for human review by default
  - Vault intelligence (`mcp/tools/vault/vault-intelligence.ts`) Ã¢â‚¬â€ analytics engine for agent planning

## Documentation Map

- `CLAUDE.md` Ã¢â‚¬â€ agentic development guide (root, authoritative)
- `docs/README.md` Ã¢â‚¬â€ documentation hub and guided reading index
- `docs/GLOSSARY.md` Ã¢â‚¬â€ domain terminology definitions
- `docs/CONTRIBUTING.md` Ã¢â‚¬â€ onboarding and first-run guide

Architecture: `docs/architecture/` Ã¢â‚¬â€ ARCHITECTURE.md, DATA_MODEL.md, TECH_STACK.md, SECURITY.md

Development: `docs/development/` Ã¢â‚¬â€ DEVELOPMENT.md, GIT_WORKFLOW.md, TESTING.md, PERFORMANCE.md, ACCESSIBILITY.md, UX_GUIDELINES.md, OWNERSHIP.md

Planning: `docs/planning/` Ã¢â‚¬â€ ROADMAP.md, PLANNING_TIERS.md, `initiatives/README.md` (initiative map + vision), `initiatives/I1-*.md`Ã¢â‚¬Â¦`I12-*.md` (per-initiative epic/story details)

Operations: `docs/operations/` Ã¢â‚¬â€ SCHEMA_MIGRATIONS.md, MCP_INSPECTOR_WORKFLOW.md, RELEASE.md, MOBILE.md

Reference: `docs/reference/` Ã¢â‚¬â€ AGENTIC_NOTES_WORKFLOW.md (MCP tool contracts), RANDOM_TABLES.md, PROJECT_STRUCTURE.md

Architecture Decisions: `docs/adr/README.md` Ã¢â‚¬â€ ADR index (ADR-001 through ADR-010)

## Development Phases

- Phase 0: Scaffolding (SvelteKit + tooling setup) Ã¢â‚¬â€ complete
- Phase 1: Core note system (MVP Ã¢â‚¬â€ CRUD, markdown, editor, nav, MCP server) Ã¢â‚¬â€ complete
- Phase 2: Linking & knowledge graph (wikilinks, backlinks, tags) Ã¢â‚¬â€ complete
- Phase 3: Search & discovery (full-text, quick switcher, graph view) Ã¢â‚¬â€ complete
- Phase 4: Polish & advanced features (import/export, templates, a11y audit) Ã¢â‚¬â€ in progress
- Phase 5: Cloud & sharing Ã¢â‚¬â€ future
- Phase 6: D&D-specific tools Ã¢â‚¬â€ maps, player features, campaign mgmt Ã¢â‚¬â€ future

## Completed Epics

- **Epic 18.4** - Pointer Accessibility and Alternative Interactions:
  - Completed touch-target remediations across dense controls to satisfy minimum pointer target sizing for
    desktop and touch contexts.
  - Added keyboard and single-pointer alternatives for drag-dependent workflows in board, resize, and layout
    interactions so core tasks are operable without drag gestures.
  - Replaced interactive native `title` tooltips with accessible tooltip/label patterns, including shared tooltip
    behavior upgrades for focus and touch, and removed direct `title` usage on interactive controls.
  - Added regression coverage in desktop e2e tests for:
    - drag workflow alternatives (`tests/e2e-desktop/interactive-controls.spec.ts`)
    - interactive control tooltip accessibility semantics (`tests/e2e-desktop/accessibility.spec.ts`).

- **Epic 18.3** - Sensory and Motion Accessibility:
  - Added vault-scoped appearance accessibility preferences:
    - `reduceMotion` (`system` | `reduce` | `no-preference`)
    - `highContrast` (`system` | `high` | `standard`)
    - wired through renderer state (`src/lib/state/ui.svelte.ts`), settings UI
      (`src/lib/ui/settings/AppearanceSettingsTab.svelte`, `src/lib/ui/settings/GeneralSettingsTab.svelte`),
      storage adapters (`src/lib/platform/storage/indexeddb-adapter.ts`,
      `src/lib/platform/storage/capacitor-adapter.ts`, `mcp/storage.ts`), and IPC schema/security validation
      (`electron/ipc-schemas.ts`, `electron/ipc-security.test.ts`).
  - Added manual reduced-motion runtime behavior in addition to OS preference:
    - root `html.reduce-motion` class application in `src/routes/+layout.svelte`
    - global reduced-motion class overrides in `src/app.css`
    - JS motion guard updates in `src/lib/ui/maps/MapCanvasViewer.svelte` and compact sheet drag behavior in
      `src/lib/ui/layout/AppShell.svelte`.
  - Added high-contrast theme mode:
    - root `html.theme-high-contrast` class application in `src/routes/+layout.svelte`
    - high-contrast semantic token overrides and focus/border/decorative-effect adjustments in `src/app.css`
      (including forced-colors-safe token fallback).
  - Completed color-independence remediations for required status surfaces:
    - vault health severity now uses shape distinction (warning triangle vs critical octagon) in
      `src/lib/ui/layout/TopBar.svelte` and `src/lib/ui/common/Icon.svelte`
    - note-list active state now uses accent border + background fill in `src/lib/ui/common/NoteCard.svelte`
    - combat HP bars now use ratio-based green/yellow/red tones alongside numeric HP in
      `src/routes/combat/+page.svelte`.
  - Added contrast enforcement test coverage:
    - `src/lib/domain/contrast-audit.test.ts` validates required token contrast pairs across
      Parchment, Tavern, Scholar, Dungeon, and High Contrast modes.

- **Epic 18.2** - Focus Management and Keyboard Navigation:
  - Added shared focus-trap action in `src/lib/actions/focus-trap.ts` with:
    - initial focus placement, tab/shift+tab loop containment, escape callback support
    - trigger-focus restoration on close (with explicit return-target override support)
  - Migrated overlay/dialog focus trapping to the new action path across shared UI surfaces.
  - Added route-transition focus restoration in `src/routes/+layout.svelte`:
    - after navigation, focus now moves to page `<h1>` (fallback: `#main-content`).
  - Added global keyboard shortcut manager in
    `src/lib/domain/keyboard-shortcut-manager.ts` and routed keyboard dispatch through it
    in `src/routes/+layout.svelte`.
  - Extended keyboard shortcut registry with combat single-key shortcuts:
    - `n` next turn, `d` quick damage, `h` quick heal (active only in combat tracker context).
  - Removed ad-hoc combat `window.keydown` handling from `src/routes/combat/+page.svelte`
    and replaced it with managed shortcut dispatch events.
  - Implemented arrow-key listbox navigation (roving tabindex + `aria-activedescendant`) in:
    - command palette results (`src/lib/ui/search/QuickSwitcher.svelte`)
    - notes list (`src/routes/notes/+page.svelte` + `src/lib/ui/common/NoteCard.svelte`)
    - search results (`src/routes/search/+page.svelte`)
    - combat initiative list (`src/routes/combat/+page.svelte`)
  - Added focus-visibility and focus-obscuration CSS guardrails in `src/app.css`:
    - global `*:focus-visible` outline, suppression for non-keyboard focus,
    - top/bottom `scroll-margin` offsets for sticky chrome.
  - Added tests:
    - `src/lib/actions/focus-trap.test.ts`
    - updated `src/lib/domain/keyboard-shortcuts.test.ts` for combat shortcut gating.

- **Epic 18.1** — Semantic HTML and ARIA Landmark Architecture:
  - Added a global skip link in `src/routes/+layout.svelte` targeting
    `#main-content`, with visible-on-focus styling in `src/app.css`.
  - Standardized landmark structure:
    - primary navigation labeled `Primary` in `src/lib/ui/layout/PrimaryNav.svelte`,
      `src/lib/ui/layout/MobileBottomNav.svelte`, `src/lib/ui/nav/NavBar.svelte`,
      and `src/lib/ui/nav/NavRail.svelte`
    - section-local navigation labels updated to `"<Section> navigation"` across
      `src/lib/ui/sections/local-nav/*.svelte`
    - top bar promoted to banner landmark (`src/lib/ui/layout/TopBar.svelte`)
    - sidebar help area moved to semantic `<footer>` (`src/lib/ui/layout/Sidebar.svelte`)
    - session board route wrapped in named section landmark
      (`src/routes/session-board/+page.svelte`)
  - Implemented tree-pattern keyboard semantics and collapsible `aria-expanded`
    behavior in `src/lib/ui/layout/local-nav/LocalNavTree.svelte`.
  - Updated breadcrumb semantics to `aria-label="Breadcrumb"` in
    `src/lib/ui/navigation/Breadcrumb.svelte`.
  - Enforced heading/title parity in `src/routes/+layout.svelte` by deriving
    route-matched document titles from active page headings and normalizing to
    `"<h1> | DND Tools"`.
  - Added status announcements for sync, vault health, MCP change count, and
    session mode transitions:
    - live status regions in `src/routes/+layout.svelte`
    - visible sync label indicator in `src/lib/ui/layout/TopBar.svelte`
  - Expanded accessibility verification:
    - landmark and heading-order checks in `tests/e2e-desktop/accessibility.spec.ts`
    - updated navigation semantics assertions in `tests/e2e/navigation.spec.ts` and
      `tests/e2e/mobile-ui.spec.ts`
    - documented heading hierarchy contract in `docs/development/ACCESSIBILITY.md`

- **Epic 17.4** — First-Run Onboarding Reimagined:
  - Replaced checklist-style onboarding with a persisted state machine in
    `src/lib/state/onboarding.svelte.ts` and new onboarding domain contracts in
    `src/lib/domain/onboarding.ts`.
  - Added first-run setup wizard `src/lib/ui/onboarding/SetupWizard.svelte` and gated app-shell
    rendering in `src/routes/+layout.svelte` so empty first-run vaults start in guided setup.
  - Added starter vault support for worldbuilding in `src/lib/domain/vault-templates.ts` and
    wired template-backed setup completion flow.
  - Added guided first-action wikilink prompts in `src/routes/notes/[id]/edit/+page.svelte`
    with one-time trigger/dismiss behavior persisted in onboarding settings.
  - Added optional help surfaces:
    - `src/lib/ui/onboarding/GettingStartedPanel.svelte` (milestone discovery summary)
    - `src/lib/ui/onboarding/WhatsNewPanel.svelte` (version-keyed update list)
    - Help menu integration + unread badge updates in `src/lib/ui/layout/Sidebar.svelte`
  - Added changelog parsing support in `src/lib/domain/whats-new.ts` and project changelog source
    `CHANGELOG.md`.
  - Updated onboarding tests/docs:
    - `src/lib/domain/onboarding.test.ts`
    - `src/lib/types/settings.test.ts`
    - `tests/e2e-desktop/critical-workflows.spec.ts`
    - `docs/development/TESTING.md`
    - `docs/development/UX_GUIDELINES.md`

- **Epic 17.3** — Contextual Help Architecture:
  - Added reusable contextual help primitive `src/lib/ui/common/HelpTip.svelte`:
    - 16px `?` trigger (`aria-label="Help"`) with `aria-expanded`/`aria-controls`
    - focus-trapped contextual dialog popover with close control and optional learn-more link
  - Placed initial HelpTips in required UX surfaces:
    - MCP staged review counter in `src/lib/ui/layout/TopBar.svelte`
    - World Calendar toggle in `src/lib/ui/calendar/WorldCalendarReference.svelte` (used by `src/routes/session-board/+page.svelte`)
    - Object Notes concept in `src/lib/ui/sections/local-nav/CampaignLocalNavPanel.svelte`
    - advanced search operators in `src/lib/ui/search/QuickSwitcher.svelte`
  - Added central shortcut registry in `src/lib/domain/keyboard-shortcuts.ts` and migrated global shortcut matching in `src/routes/+layout.svelte` to use it.
  - Rebuilt keyboard shortcuts overlay in `src/lib/ui/layout/KeyboardShortcutsOverlay.svelte`:
    - sectioned list (Navigation, Notes, Session, Dice, Editor, System)
    - searchable filter input
    - `<kbd>` rendering for shortcut keys
    - open via `?` (outside text inputs) and Help menu entry
  - Added consistent Help footer section in `src/lib/ui/layout/Sidebar.svelte`:
    - Keyboard shortcuts, Getting started, Report a bug, About DND Tools
    - replaced prior Onboarding footer entry with Getting started wording/behavior
  - Added spotlight system for advanced features:
    - spotlight definitions in `src/lib/domain/feature-spotlights.ts`
    - per-vault spotlight state/queue in `src/lib/state/feature-spotlights.svelte.ts`
    - overlay renderer in `src/lib/ui/common/FeatureSpotlight.svelte`
    - route-idle queue/show wiring in `src/routes/+layout.svelte`
    - persisted vault preference key `seenSpotlights` added to settings/storage + IPC schema/security whitelist.
  - Added/updated tests:
    - `src/lib/domain/keyboard-shortcuts.test.ts`
    - `src/lib/state/feature-spotlights.svelte.test.ts`
    - `tests/e2e/navigation.spec.ts`

- **Epic 17.1** — Empty States as Teaching Moments:
  - Added reusable empty-state UI primitive in `src/lib/ui/common/EmptyState.svelte` with:
    - consistent illustration system (`illustration` keys + optional custom illustration snippet)
    - required headline + optional body
    - primary action + optional secondary ghost action
    - accessible status semantics (`role="status"` + container `aria-label`)
  - Reworked Knowledge empty states:
    - empty vault and empty folder states in `src/routes/notes/+page.svelte`
    - empty search result teaching state (including related tag suggestions) in
      `src/routes/search/+page.svelte`
  - Added Session empty-state coverage:
    - no-session-board teaching states in `src/lib/ui/sections/local-nav/SessionLocalNavPanel.svelte`
      and `src/routes/session-board/+page.svelte`
    - no-combat-active state in `src/routes/combat/+page.svelte`
    - no-rollable-tables state with example-note flow in
      `src/lib/ui/sections/local-nav/SessionLocalNavPanel.svelte`
  - Added Atlas / Campaign / Graph / Timeline empty states:
    - atlas no-maps state in `src/routes/maps/+page.svelte`
    - campaign no-entities state in `src/lib/ui/sections/local-nav/CampaignLocalNavPanel.svelte`
    - graph no-links teaching state in `src/routes/graph/+page.svelte`
    - timeline no-events-detected state in `src/routes/timeline/+page.svelte`
  - Added/updated tests:
    - `tests/e2e/search.spec.ts` for empty-result search actions

- **Epic 17.2** — Progressive Disclosure System:
  - Added feature-tier reference registry in `docs/reference/FEATURE_TIERS.md` for Core, Intermediate, and Advanced surfaces.
  - Added configurable maturity thresholds in `src/lib/domain/maturity-thresholds.ts` and disclosure logic in
    `src/lib/domain/vault-maturity.ts`, with renderer maturity state in
    `src/lib/state/vault-maturity.svelte.ts`.
  - Applied maturity-based disclosure to navigation and local panels:
    - Knowledge tags and collections unlocks in `src/lib/ui/sections/local-nav/KnowledgeLocalNavPanel.svelte`
    - graph reveal behavior in local navigation, mobile nav, and quick switcher
    - session prominence badge in `src/lib/ui/layout/PrimaryNav.svelte` and
      `src/lib/ui/layout/MobileBottomNav.svelte`
    - campaign entity-list reveal behavior in `src/lib/ui/sections/local-nav/CampaignLocalNavPanel.svelte`
  - Added advanced-feature opt-in settings and persistence:
    - `featureSettings` contract in `src/lib/types/settings.ts`
    - renderer state in `src/lib/state/feature-settings.svelte.ts`
    - Settings -> Features UI in `src/lib/ui/settings/FeaturesSettingsTab.svelte`
    - MCP opt-in acknowledgement flow before enabling staged review
    - contextual Object Notes enable prompt when NPC signal threshold is reached
  - Restructured Settings progressive disclosure in `src/routes/settings/+page.svelte`:
    - Always visible group: General, Appearance, Vault
    - Features group: Features, World Calendar, conditional Maps, MCP
    - Advanced group collapsed by default: System Health, Sync, Handouts
    - About section moved to bottom
  - Updated storage/security contracts for new `featureSettings` key:
    - adapters: `src/lib/platform/storage/indexeddb-adapter.ts`, `src/lib/platform/storage/capacitor-adapter.ts`, `mcp/storage.ts`
    - IPC schema whitelist/value validation in `electron/ipc-schemas.ts`
    - IPC key whitelist tests in `electron/ipc-security.test.ts`
  - Added maturity-domain tests in `src/lib/domain/vault-maturity.test.ts`.

- **Epic 16.1** — Session Mode as Application-Level State:
  - Added application-level session mode state in `src/lib/state/session-mode.svelte.ts`
  - Extended persisted session schema (`src/lib/types/session-state.ts`) with:
    - `mode: 'idle' | 'active'`
    - `activeSession` payload (`sessionBoardId`, `startedAt`, `sceneId`, `combatActive`)
  - Kept session persistence in `.vault/session-state.json` through existing storage adapters
  - Added Start Session / End Session flows in `src/lib/ui/sections/local-nav/SessionLocalNavPanel.svelte`
  - Added global nav End Session entry point and session-active pulse indicator in `src/lib/ui/layout/PrimaryNav.svelte`
  - Added session-active layout behavior in `src/lib/ui/layout/AppShell.svelte`:
    - auto-open detail panel on active transition (expanded layout)
    - compact session status bar above bottom navigation
  - Wired session scene/combat persistence hooks in:
    - `src/routes/session-board/+page.svelte`
    - `src/routes/combat/+page.svelte`
    - `src/routes/+layout.svelte`
  - Added session state normalization tests in `src/lib/types/session-state.test.ts`

- **Epic 16.2** — Dice: Always-Accessible, Session-Integrated:
  - Added session-scoped roll-history persistence to `SessionState` (`sessionRollHistory`) and quick-table pinning (`pinnedRollableTableIds`) in `src/lib/types/session-state.ts` + `src/lib/state/session-state.svelte.ts`
  - Wired dice rolls into active-session history logging via `src/lib/state/dice.svelte.ts` and `src/lib/state/session-mode.svelte.ts`
  - Added persistent session dice bar UI (local nav + detail panel strip) using custom die-face SVG assets in `static/icons/dice/*` and `src/lib/ui/dice/SessionDiceBar.svelte`
  - Added session roll-history detail panel (`src/lib/ui/session/SessionRollHistoryPanel.svelte`) with inline label editing, nat 20 / nat 1 flags, and expandable die breakdowns
  - Added inline roll markdown support for `[[roll:EXPRESSION]]` through:
    - `src/lib/markdown/plugins/remark-roll-buttons.ts`
    - sanitize/pipeline updates in `src/lib/markdown/pipeline.ts`
    - hydrated `RollButton` component in `src/lib/ui/viewer/RollButton.svelte`
    - note-viewer hydration wiring in `src/lib/ui/viewer/NoteViewer.svelte`
  - Added Session Tables tab with rollable markdown-table discovery + rolling:
    - parser/roller domain in `src/lib/domain/rollable-tables.ts`
    - Session local-nav integration in `src/lib/ui/sections/local-nav/SessionLocalNavPanel.svelte`
    - pinned-table quick rolls in `src/lib/ui/board/SessionQuickPanel.svelte`
  - Consolidated Dice Tray entry points to keyboard shortcut plus Session-section controls (idle Dice icon + active-session Custom button)
  - Added tests:
    - `src/lib/types/session-state.test.ts`
    - `src/lib/markdown/pipeline.test.ts`
    - `src/lib/domain/rollable-tables.test.ts`

- **Epic 16.3** — Combat Tracker: Persistent, Fast, and Touch-Ready:
  - Moved combat tracker runtime state into persisted session state (`src/lib/types/session-state.ts`)
    including combatants, round, active index, selected combatant, and stat block reference id.
  - Added session combat domain helpers in `src/lib/domain/session-combat.ts` for:
    - initiative sorting
    - turn advancement with round-wrap condition decrement/expiry notices
    - HP damage/heal/temp application with undo snapshots
  - Rebuilt `/session/combat` UI (`src/routes/combat/+page.svelte`) as a full-height
    list/detail tracker with:
    - large `Next Turn` CTA and keyboard shortcuts (`n`, `d`, `h`)
    - touch-friendly HP controls and press-hold numeric quick-adjust popover
    - 5-second undo affordance after HP changes
    - per-combatant condition badges + duration editing
    - linked stat block reference actions (detail panel on expanded, bottom sheet on compact/medium)
  - Updated Session local navigation combat snapshot (`src/lib/ui/sections/local-nav/SessionLocalNavPanel.svelte`)
    to read from session-state combat fields instead of board tile state.
  - Extended session detail panel quick-reference (`src/lib/ui/layout/DetailPanel.svelte`) to render
    selected combat stat block references.
  - Added collapsible stat block action/trait sections for mid-combat focus in
    `src/lib/ui/viewer/StatBlockView.svelte`.
  - Added/updated tests:
    - `src/lib/domain/session-combat.test.ts`
    - `src/lib/types/session-state.test.ts`
    - `tests/e2e-desktop/critical-workflows.spec.ts`

- **Epic 16.4** — Session Board: Mission Control Redesign:
  - Added first-class board scene + handout history contracts in `src/lib/types/session-board.ts`:
    - `scenes[]`, `activeSceneId`
    - `handoutHistory[]` entries with source kind and delivery timestamp
  - Added board scene/history normalization in `src/lib/domain/session-board.ts` and wired persistence
    through session board state + filesystem storage (`src/lib/state/session-boards.svelte.ts`, `mcp/storage.ts`).
  - Updated session routing/local-nav integration to track active scene by `activeSceneId`:
    - `src/lib/ui/sections/local-nav/SessionLocalNavPanel.svelte`
    - `src/routes/+layout.svelte`
  - Added mission control UI in `src/lib/ui/session/SessionMissionControl.svelte`:
    - zoned layout (active scene, references, status, quick actions)
    - scene timeline and prep-mode scene editor
    - first-class handout delivery with player preview and board delivery history logging
  - Updated `src/routes/session-board/+page.svelte` to use Mission Control in view mode and keep tile
    customization in edit mode.
  - Added/updated tests:
    - `src/lib/domain/session-board.test.ts`
    - `tests/e2e-desktop/critical-workflows.spec.ts`

- **Epic 16.5** — Session Prep and Recap Workflow:
  - Added session prep/recap continuity domain workflow in `src/lib/domain/session-prep-workflow.ts`:
    - prep view model hydration from existing MCP bundles (`get_session_prep_bundle`, `get_open_threads`, `get_recap_generation_bundle`)
    - continuity summary hydration from `get_continuity_check_bundle`
    - structured capture helpers (`parseTagEntryInput`, `buildSessionLogNoteContent`)
  - Added idle-mode Session Prep UI in `src/lib/ui/session/SessionPrepPanel.svelte` and integrated it below board selection in `src/routes/session-board/+page.svelte`.
  - Added unified end-session capture + continuity flow dialog in `src/lib/ui/session/SessionEndWorkflowDialog.svelte`:
    - confirmation step
    - structured session capture
    - session log note creation in `/sessions/session-{date}.md`
    - continuity follow-up quick-create actions for missing NPC/location notes
  - Replaced legacy end-session entry points with the unified flow in:
    - `src/lib/ui/layout/PrimaryNav.svelte`
    - `src/lib/ui/sections/local-nav/SessionLocalNavPanel.svelte`
    - `src/lib/ui/session/SessionMissionControl.svelte`
  - Hardened session scene persistence to avoid no-op scene write loops in:
    - `src/lib/state/session-mode.svelte.ts`
    - `src/routes/session-board/+page.svelte`
  - Added/updated tests:
    - `src/lib/domain/session-prep-workflow.test.ts`
    - `tests/e2e-desktop/critical-workflows.spec.ts`

- **Epic 1.3** Ã¢â‚¬â€ Integrity Verification & Self-Repair (commit `115d933`):
  - `NoteIntegrityIssueStatus` extended with `'orphan_entry'`
  - `vaultHealthState` singleton in `src/lib/state/vaultHealth.svelte.ts`
  - TopBar health badge (triangle warning icon, severity-coloured)
  - `pnpm vault:verify` CLI (`mcp/cli/vault-verify.ts`)
  - Settings Vault tab: severity-grouped report, Rebuild Index, Clear Changelog, on-close cadence, snapshot sizes
  - IPC: `dndtools:storage:rebuild-index`, `dndtools:storage:clear-changelog`
  - Pre-migration safety snapshot in run-migrations IPC handler
  - `electron/ipc-schemas.ts` + `ipc-security.test.ts` (IPC security foundation)

- **Epic 1.5** Ã¢â‚¬â€ Diagnostic Telemetry & Health Dashboard (commit `d3375cf`):
  - In progress on branch `story/1.5-diagnostic-telemetry-health`
- **Epic 13.1** — IA Audit, North-Star Definition & Route Architecture:
  - Added IA source of truth in docs/architecture/INFORMATION_ARCHITECTURE.md
  - Added redundancy elimination log in docs/architecture/NAVIGATION_REDUNDANCY_LOG.md
  - Added three-layer navigation contract in docs/architecture/NAVIGATION_CONTRACT.md
  - Added nav-layer lint gate (scripts/nav-layer-lint.ts) and integrated it into pnpm lint
  - Added canonical route hierarchy roots and section paths:
    - /knowledge/\*
    - /atlas/\*
    - /session/\*
    - /campaign/\*
    - /settings/\*
  - Added breadcrumb metadata loaders in canonical route +page.ts files and wired breadcrumb rendering to route metadata
  - Added client-side canonicalization redirects for legacy route paths in src/routes/+layout.svelte
- **Epic 13.2** — Global Navigation Layer Reconstruction:
  - Added PrimaryNav shell component in src/lib/ui/layout/PrimaryNav.svelte
  - Added section icon system in src/lib/ui/layout/PrimaryNavIcon.svelte
  - Added iconography specification in docs/architecture/NAVIGATION_ICONOGRAPHY.md
  - Reduced TopBar scope and documented ownership in docs/architecture/TOPBAR_CHARTER.md
  - Added centralized activeSection / activeRoute state in src/lib/state/navigation.svelte.ts
  - Moved DM/Player persona controls to sidebar footer switcher and added persistent player-mode shell indicators
- **Epic 13.3** — Local Navigation: Section Panels and Contextual Browse:
  - Replaced monolithic sidebar content with section-scoped local navigation panels:
    - KnowledgeLocalNavPanel
    - AtlasLocalNavPanel
    - SessionLocalNavPanel
    - CampaignLocalNavPanel
    - SettingsLocalNavPanel
  - Added collapsible local panel sections with persisted localStorage state in src/lib/state/local-navigation-panels.svelte.ts
  - Added reusable local-nav primitives:
    - src/lib/ui/layout/local-nav/CollapsibleLocalNavSection.svelte
    - src/lib/ui/layout/local-nav/LocalNavTree.svelte
  - Implemented Knowledge local-nav tabs (Browse/Recent/Saved), ARIA tree semantics, saved search collection pills, and cross-type recent item rendering
  - Extended navigation state with cross-type recent item tracking (note/entity/map) and route-level recording for atlas map visits
  - Implemented Session local-nav status panel with active board summary, initiative snapshot, start/resume controls, and quick dice access
  - Added direct Save action in search bar for saved search workflow
  - Added tests:
    - src/lib/state/local-navigation-panels.svelte.test.ts
    - updated src/lib/state/navigation.svelte.test.ts
    - updated tests/e2e/navigation.spec.ts
- **Epic 13.4** — Contextual Navigation: Breadcrumbs, Backlinks, Deep Links:
  - Added semantic breadcrumb component in `src/lib/ui/navigation/Breadcrumb.svelte`:
    - Proper breadcrumb markup (`nav > ol > li`) with `aria-current="page"` on current item
    - Narrow-viewport truncation with middle-crumb disclosure (`...`) for full-path reveal
  - Updated `LocationBar` to consume the breadcrumb component and enrich route metadata with
    contextual hierarchy:
    - Folder hierarchy + note title for note detail routes
    - Atlas map hierarchy for selected map routes
    - Active session board name for session board routes
  - Redesigned note backlinks UI in `src/lib/ui/viewer/BacklinksPanel.svelte`:
    - New "Referenced by (N)" contextual panel treatment
    - Source note title + folder path breadcrumb + excerpt snippet per backlink occurrence
    - Desktop side-panel friendly with narrow-screen collapsible behavior
  - Added cross-section contextual links panel in `src/lib/ui/viewer/CrossSectionLinksPanel.svelte`:
    - "View entity" links into Campaign section for entity-like notes
    - "View on Atlas" links for map-linked entities/notes
    - Session-context quick link when note is active on current session board
  - Updated session board note surfaces to expose explicit "View in Knowledge" links.
  - Hardened navigation history behavior in `src/lib/state/navigation.svelte.ts`:
    - Back/forward only enables for same-section history
    - Back is disabled on section root routes
    - Added explicit `navigationState.reset()` for vault switch/repair history reset
  - Hooked vault switch and vault repair flows to clear navigation history state in
    `src/lib/ui/settings/VaultSettingsTab.svelte`.
  - Added browser history label normalization in `src/routes/+layout.svelte` so history entries
    keep human-readable labels used by TopBar tooltips.
  - Added/updated tests:
    - `src/lib/state/navigation.svelte.test.ts`
    - `tests/e2e/navigation.spec.ts`
- **Epic 13.5** — Command Palette and Search as Primary Navigation:
  - Replaced Quick Switcher with a prefix-driven command palette in `src/lib/ui/search/QuickSwitcher.svelte`:
    - Default mode (no prefix) navigates notes via title/content search
    - `>` mode executes commands (create note, session switch, settings vault, theme toggle, roll 1d20, etc.)
    - `#` mode filters note navigation by tag
    - `/` mode navigates primary section routes
  - Added command-palette scope controls with explicit scope labeling (`All notes`, `Current folder`, `NPCs only`) and keyboard-complete behavior (Arrow wrap, Enter activation, Escape close + focus return, Tab/Shift+Tab scope traversal).
  - Added shared scope contract helpers in:
    - `src/lib/domain/search-scope.ts`
    - `src/lib/domain/search-scope.test.ts`
  - Extended search page (`src/routes/search/+page.svelte`) with URL-backed scope controls:
    - Scope label + inline selector (`all` / `folder` / `type`)
    - Scope persisted in query string (`scope`, `scopeValue`) for shareable/bookmarkable search URLs
    - Scope-aware query execution and semantic fallback filtering
  - Upgraded search result rendering for hierarchy context:
    - Title match highlighting
    - Folder breadcrumb path
    - Type icon token + primary tags (up to 3) + last-modified date
    - Section-grouped results with per-group collapse when scope is `all`
  - Updated keyboard/help copy from “Quick switcher” to “Command palette”:
    - `src/lib/ui/settings/GeneralSettingsTab.svelte`
    - `src/lib/domain/welcome-note.ts`
  - Added and updated end-to-end coverage:
    - `tests/e2e/search.spec.ts`
    - `tests/e2e/navigation.spec.ts`
    - `tests/e2e-desktop/accessibility.spec.ts`
    - `tests/e2e-desktop/interactive-controls.spec.ts`
- **Epic 14.1** — Layout Token Architecture and Breakpoint Contract:
  - Added canonical layout tier state in `src/lib/state/layout.svelte.ts`:
    - Contract breakpoints: compact `<640`, medium `640–1099`, expanded `>=1100`
    - `ResizeObserver` viewport tracking with 100ms debounce
    - SSR-safe default tier (`expanded`)
  - Rewired shell/layout consumers to tier-based state (removed legacy `ui.checkMobile` / width breakpoint logic):
    - `src/routes/+layout.svelte`
    - `src/lib/ui/layout/AppShell.svelte`
    - `src/lib/ui/layout/Sidebar.svelte`
    - `src/lib/ui/layout/PrimaryNav.svelte`
    - local-nav panels + compact editor/notification behavior
  - Added structural layout tokens in `src/app.css` and removed `--width-sidebar`:
    - rail/panel/detail widths
    - top bar and bottom nav heights
    - tier breakpoint tokens
  - Added architecture contract doc: `docs/architecture/LAYOUT_TIERS.md`
  - Added tests:
    - `src/lib/state/layout.svelte.test.ts`
    - `tests/e2e/navigation.spec.ts` (tier breakpoint shell behavior)
- **Epic 14.2** — Compact Layout (Mobile Shell):
  - Reworked compact shell behavior in `src/lib/ui/layout/AppShell.svelte`:
    - Added persistent `Browse` pill above bottom navigation.
    - Added compact local-nav bottom sheet with drag handle, 70vh presentation, focus trap, and dismiss via backdrop, Escape, swipe-down, and mobile back gesture.
    - Added compact left-edge swipe-right gesture to open the local-nav sheet.
    - Suppressed navigation chrome for compact note editor routes to provide focused full-screen editing.
  - Simplified compact topbar in `src/lib/ui/layout/TopBar.svelte`:
    - Compact mode now shows title context, command palette icon, and overflow menu.
    - Overflow menu hosts theme selection, settings shortcut, and DM/Player mode switch.
    - Compact note editor mode now exposes a topbar back/done affordance.
  - Updated compact primary nav behavior:
    - Added keyboard-open ARIA hiding in `src/lib/ui/layout/PrimaryNav.svelte`.
    - Updated compact active-state styling in `src/app.css` for accent-forward active labels.
  - Added compact note-list gesture alternatives in `src/lib/ui/common/NoteCard.svelte` and `src/routes/notes/+page.svelte`:
    - Swipe-left quick actions (pin/delete) for note cards.
    - Long-press + explicit quick-action menu fallback to satisfy non-gesture alternatives.
    - Delete confirmation flow and pin/unpin feedback for quick actions.
  - Added/updated tests:
    - `tests/e2e/mobile-ui.spec.ts`
    - `tests/e2e/helpers.ts`
- **Epic 14.3** — Expanded Layout (Desktop Shell):
  - Added expanded desktop shell state in `src/lib/state/desktop-shell.svelte.ts`:
    - local panel collapsed state persisted in `localStorage`
    - per-section local panel widths (`200px`-`320px`) persisted in `localStorage`
    - per-section local panel scroll memory across navigation
    - detail panel open state + zen mode state management
  - Reworked expanded shell layout in `src/lib/ui/layout/AppShell.svelte`:
    - permanent icon rail + persistent local panel behavior
    - right contextual detail panel surface with route-aware availability
    - draggable + keyboard-accessible local panel resize handle (`ArrowLeft`/`ArrowRight`)
    - zen mode chrome collapse with breadcrumb + explicit exit control
  - Added contextual detail panel component `src/lib/ui/layout/DetailPanel.svelte`:
    - note context (cross-section links + backlinks + object metadata summary)
    - map context legend summary for selected atlas map
    - session quick-reference summary for active board
  - Updated shell controls and shortcuts:
    - `Ctrl+B` now collapses/expands expanded local panel (persisted)
    - `Ctrl+Shift+R` toggles contextual detail panel when available
    - `F11` and editor toolbar `Zen` button toggle zen mode
    - TopBar charter updated to include detail panel toggle ownership
  - Added/updated tests:
    - `src/lib/state/desktop-shell.svelte.test.ts`
    - `src/lib/domain/detail-panel-context.test.ts`
    - `tests/e2e/navigation.spec.ts` (expanded shell collapse/detail/resize/zen behaviors)
- **Epic 14.4** — Electron Desktop Platform Refinements:
  - Added dedicated desktop titlebar strip and removed TopBar drag ownership:
    - new `src/lib/ui/layout/DesktopTitlebar.svelte` with Windows/Linux custom controls
    - `src/lib/ui/layout/AppShell.svelte` now renders a 24px desktop titlebar region above TopBar
    - TopBar no longer applies `desktop-drag`
  - Added native desktop context menus via Electron Menu API:
    - typed IPC schema in `electron/ipc-schemas.ts` (`desktopContextMenuRequestSchema`)
    - context menu IPC handler in `electron/main.ts` (`dndtools:desktop:show-context-menu`)
    - renderer integrations for folder tree (`KnowledgeLocalNavPanel`) and note cards (`NoteCard` / notes page)
  - Added Electron application menu with accelerators and renderer command routing:
    - File/Edit/View/Session/Help menu template in `electron/main.ts`
    - renderer command handling in `src/routes/+layout.svelte`
    - preload/bridge event wiring (`onAppMenuCommand`)
  - Added protocol/file-open desktop intent handling:
    - new parser module + tests (`electron/desktop-intents.ts`, `electron/desktop-intents.test.ts`)
    - single-instance handling, protocol registration, open-url/open-file and second-instance routing in `electron/main.ts`
    - `electron-builder.yml` now registers `dndtools://` protocol and `.md` file associations
  - Replaced manual vault refresh flow with filesystem watch auto-refresh:
    - chokidar watcher in `electron/main.ts` batches changed markdown paths and emits incremental updates
    - preload/bridge event wiring (`onVaultFileSync`) and incremental renderer application (`notesState.applyExternalVaultSync`)
    - user-facing toast notification in `src/routes/+layout.svelte` ("N notes updated from disk")
  - Added/updated tests:
    - `electron/ipc-security.test.ts` (native context menu IPC schema validation)
    - `electron/desktop-intents.test.ts`
    - `tests/e2e-desktop/interactive-controls.spec.ts` (vault watcher update flow)
- **Epic 14.5** — Medium Layout (Tablet Shell):
  - Added medium-layout primary rail overlay behavior in `src/lib/ui/layout/AppShell.svelte` and `src/lib/ui/layout/PrimaryNav.svelte`:
    - tapping an active medium rail icon opens a temporary local-navigation overlay anchored to the rail edge
    - overlay dismisses on backdrop tap and `Escape`
  - Added medium Knowledge master-detail split in `src/routes/notes/+page.svelte`:
    - non-resizable split panes (`~38%` list / `~62%` detail)
    - URL-backed selected-note preview (`?note=<id>`)
    - contextual empty-state when no note is selected
  - Added medium input-modality awareness:
    - new `src/lib/state/input-modality.svelte.ts` keyboard detection state
    - tooltip shortcut hints now medium-modality-aware in `src/lib/ui/layout/TopBar.svelte`
    - new `src/lib/ui/layout/KeyboardShortcutsOverlay.svelte`, opened via `?` in medium when keyboard modality is detected
  - Added/updated tests:
    - `src/lib/state/input-modality.svelte.test.ts`
    - `tests/e2e/navigation.spec.ts` (medium overlay, split-view, and shortcut overlay behaviors)
  - Updated medium-tier architecture contract docs in `docs/architecture/LAYOUT_TIERS.md`
- **Epic 15.1** — Design Token Architecture:
  - Redesigned `src/app.css` with a semantic color token layer (`--color-bg`, `--color-surface`, `--color-surface-elevated`, `--color-surface-alt`, `--color-border`, `--color-border-strong`, `--color-ink`, `--color-ink-muted`, `--color-ink-faint`, `--color-accent`, `--color-accent-hover`, `--color-accent-subtle`, `--color-accent-foreground`, `--color-success`, `--color-warning`, `--color-error`, `--color-error-hover`, `--color-focus-ring`)
  - Dark mode override block `html.dark { }` sets all semantic tokens to tavern palette values — components no longer need `dark:` Tailwind prefix for structural/surface styling
  - Typography scale tokens (`--text-2xs` through `--text-2xl`) override Tailwind defaults; all `text-[Npx]` arbitrary sizes migrated to scale tokens across all component and route files
  - Spacing scale (4px base unit, `--space-0.5` through `--space-16`) with component token layer; `--component-nav-item-px/py` tokens applied to `.primary-nav-item` CSS rule
  - Motion tokens (`--duration-fast/medium/slow`) moved to `@theme` block so Tailwind generates `duration-fast` etc. utilities; elevation tokens (`--shadow-sm/md/lg`) moved to `@theme` overriding Tailwind built-in shadow values; `prefers-reduced-motion` collapses all durations
  - All session board tiles and AppShell sheet migrated from `duration-150` to `duration-fast` Tailwind utility
  - `bg-surface-elevated` applied to all floating elements (dropdowns, modals, overlays, tooltips) throughout the codebase
  - Body background gradient refactored to use palette tokens via `color-mix()`; handout preview structural colors migrated to semantic tokens
  - Token compliance lint gate: `pnpm lint:tokens` (`scripts/token-compliance-lint.ts`) enforces no arbitrary font sizes and no structural `dark:` prefixes; wired into `pnpm lint`
  - Architecture contract: `docs/architecture/DESIGN_TOKENS.md`
- **Epic 15.2** — Icon System:
  - Installed `lucide-svelte` (v0.577.0) as the single, tree-shakeable icon library
  - Built `src/lib/ui/common/Icon.svelte`: `name: IconName`, `size` ('xs'|'sm'|'md'|'lg'), `color`, `strokeWidth`, `class` props; renders Lucide icons via `<svelte:component>`; `aria-hidden="true"` by default
  - Exports `IconName` union type derived from `ICON_MAP` const; all 27 domain icons registered
  - Replaced all inline SVG icon blocks across the codebase: `TopBar`, `DesktopTitlebar`, `NoteHeader`, `KnowledgeLocalNavPanel`, `MigrationReadinessScreen`, `NoteCard`, `notes/+page`, `search/+page`, `notes/[id]/edit/+page`
  - Updated `PrimaryNavIcon.svelte` to use `<Icon>` with section→icon mapping (`book`, `map`, `hexagon`, `flag`, `settings`)
  - Graph visualization SVG in `graph/+page.svelte` intentionally kept (data canvas, not an icon)
  - Domain icon vocabulary documented in `docs/reference/ICON_VOCABULARY.md`
  - Navigation iconography spec in `docs/architecture/NAVIGATION_ICONOGRAPHY.md` updated (source of truth is now `Icon` component)
- **Epic 15.3** — Core Component Library Rebuild:
  - Extended `src/lib/ui/common/Button.svelte`: added `link` variant, `icon` (leading), `trailingIcon`, `ariaPressed`, `class` props; `children` optional for icon-only usage
  - Added 8 new icons to Icon.svelte: `alert-circle`, `check-circle`, `chevron-down`, `eye`, `eye-off`, `info`, `plus`, with `<Comp>` syntax (replacing deprecated `<svelte:component>`)
  - Built form component suite in `src/lib/ui/common/`: `Input.svelte`, `Textarea.svelte`, `Select.svelte`, `Checkbox.svelte`, `Toggle.svelte`, `TagInput.svelte` — all use semantic tokens, proper labels, error states with icon indicators
  - Built navigation component suite in `src/lib/ui/nav/`: `NavItem.svelte` (link/button duality, icon, badge, depth), `NavSection.svelte` (collapsible with caret + action icon), `NavRail.svelte` (vertical icon rail), `NavBar.svelte` (horizontal compact nav); exported from `src/lib/ui/nav/index.ts`
  - Refactored `CollapsibleLocalNavSection.svelte` to wrap `NavSection`
  - Updated `Sidebar.svelte` DM/Player mode switcher to use `Toggle`; Onboarding button to use `Button`
  - Built `src/lib/ui/common/Card.svelte` (header/body/footer slots, interactive mode, padding/elevation variants) and `ListItem.svelte` (link/button/div triple mode, leadingIcon, trailing/action slots)
  - Updated `NoteCard.svelte` to use Card surface tokens (border, bg-surface, rounded-lg, shadow-sm) with consistent spacing
  - Built `src/lib/ui/common/Dialog.svelte` (proper `aria-labelledby`, focus trap, Button close); `Modal.svelte` now wraps `Dialog`
  - Built `src/lib/ui/common/Sheet.svelte` (bottom-anchored, drag-handle dismiss, focus trap)
  - Built `src/lib/ui/common/Popover.svelte` (non-modal, outside-click/Escape dismiss, anchor-relative positioning)
  - Built `src/lib/ui/common/Tooltip.svelte` (`role="tooltip"`, hover+focus trigger, placement variants)
  - Updated `ConfirmDialog.svelte` to use `Dialog` directly
  - Updated `Toast.svelte` to use `Icon` for status icons; dismiss button aria-label changed to "Dismiss notification"; `role="alert"` for warning/error, `role="status"` for info/success
  - Updated `MetadataEditor.svelte` and `Modal.svelte` close button to use `Button`
- **Epic 15.4** — TTRPG Visual Language:
  - Added theme preset domain contract in `src/lib/domain/theme.ts` (+ tests) with presets `parchment`, `tavern`, `scholar`, `dungeon` and compatibility handling for legacy `light`/`dark` values.
  - Reworked theme selection UX to preset-driven appearance controls:
    - `ThemeToggle.svelte` now exposes Auto + four presets
    - TopBar/command-palette direct theme toggles removed
    - root layout applies `html.theme-*` classes and preserves `dark` family class behavior for compatibility.
  - Upgraded markdown rendering pipeline and presentation:
    - added figure/caption transform plugin (`rehype-figure-images`)
    - added `[!Secret]` callout type support with visual treatment
    - improved table, heading, wikilink, and image figure styling in `src/app.css`.
  - Added canonical stat block visual renderer in `src/lib/ui/viewer/StatBlockView.svelte` and wired it into note page/detail panel object rendering.
  - Refined `PlayerCharacterSheet.svelte` into a two-column, session-readable viewer (with compact mode for detail panel).
  - Added dramatic dice-result chip treatments (nat 20 shimmer, nat 1 pulse, reduced-motion fallback) in `DiceTrayPanel.svelte` + `src/app.css`.
  - Updated token architecture reference `docs/architecture/DESIGN_TOKENS.md` for preset-class based theme overrides.
- **Epic 15.5** — Density, Readability, and Content Width:
  - Added global appearance preferences `uiDensity` and `noteReadingWidth` to `AppSettings` with adapter-level normalization (`indexeddb`, `capacitor`, `mcp`), wired into UI state, and surfaced in Settings → Appearance.
  - Root layout now applies `data-density` and `data-note-reading-width` on `<html>`; `src/app.css` maps these to density tokens and prose width tokens (`68ch`, `90ch`, `full`).
  - Refined note readability and list information scent:
    - prose viewer/editor containers now consume `max-width: var(--component-note-reading-width)`
    - note cards now show note-type icon, stronger title hierarchy, folder breadcrumb, relative modified date, two-tag pills, and two-line excerpt.
  - Applied sidebar density contract tokens:
    - primary rail nav item height 48px
    - folder-tree items 32px
    - tag pills 24px
    - Open Threads rows 32px
  - Extended IPC setting validation to include new settings keys (`uiDensity`, `noteReadingWidth`) and updated IPC security regression coverage.

## What Not To Do

- do not bypass storage abstraction
- do not add direct Node usage to renderer
- do not introduce broad IPC without validation
- do not claim docs are up to date without verifying files
- do not merge large behavior changes without test updates
- do not commit story-level work directly to `master` Ã¢â‚¬â€ use a story branch
- do not force-push `master` under any circumstances
- do not use `--no-verify` to bypass git hooks

## Current Known Gaps to Respect

- CI workflows exist (`.github/workflows/ci.yml`, `.github/workflows/e2e.yml`) but are not yet comprehensive: coverage threshold enforcement and cross-platform matrix testing are not yet added.
- MCP tool-level test coverage is incomplete Ã¢â‚¬â€ many tools rely only on `all-tools.test.ts` contract tests; dedicated per-tool unit/integration tests are sparse.
- Epic 1.4 (IPC Hardening) is substantially complete: explicit named channels, Zod schema validation, `SECURITY.md` threat model, and IPC security regression tests are all in place. One residual gap: `dndtools:storage:clear-changelog` handler does not use `parseIpcArg()` validation.
- Atomic filesystem writes are implemented in `mcp/safe-write.ts` and `mcp/storage.ts`; write-journal recovery runs at startup. This is substantially complete.
