# Feature Inventory

## Source Set

This document was extracted from:

- `docs/planning/initiatives/README.md`
- `docs/planning/initiatives/I1-*.md` through `docs/planning/initiatives/I21-*.md`
- `docs/reference/AGENTIC_NOTES_WORKFLOW.md`
- `docs/reference/RANDOM_TABLES.md`
- `src/routes/` file inventory only
- `src/lib/domain/` module inventory only
- `mcp/index.ts`, `mcp/staged-storage.ts`, `mcp/tools/index.ts`,
  `mcp/tools/shared/contracts.ts`, `mcp/tools/shared/contract-server.ts`,
  `mcp/tools/vault/vault-intelligence.ts`
- `mcp/tools/{boards,dice,notes,objects,random,search,vault}/` tool files and tool tests
- `mcp/resources/index.ts`, `mcp/resources/shared/contracts.ts`, and resource registration files

The initiative files are the main product source. Route and domain-module listings were used only
as implementation evidence; route source was intentionally not read for this step. MCP source and
test files were read for the 2-B MCP tool inventory.

## Status Conventions

| Status | Meaning in this inventory |
| --- | --- |
| Complete | Initiative or epic is documented as delivered. |
| In Progress | Initiative or epic has shipped parts and remaining planned work. |
| Deferred | Planned but intentionally delayed, usually behind cloud/collaboration dependencies. |
| Not Started | Planned capability with no current implementation baseline. |

## Current Feature Surface Snapshot

The current app is strongest in local-first DM workflows: notes, links, search, object-backed
campaign entities, maps, session boards, dice, combat, handouts, encounters, MCP vault
intelligence, desktop/PWA/mobile storage adapters, accessibility, and progressive-disclosure UX.
The main unfinished product areas are collaboration/cloud, public community content, full player
character management, atmosphere/audio, plugins, and remaining I21 quality realignment.

## Initiative Inventory

### I1 - Platform Foundation & Trust

**Status:** Complete

**Epics:** 1.1 Atomic Filesystem Writes - Complete; 1.2 Schema Migration Engine - Complete;
1.3 Integrity Verification & Self-Repair - Complete; 1.4 IPC Hardening & Security Model -
Complete; 1.5 Diagnostic Telemetry & Health Dashboard - Complete.

**Feature list:** safe temp-file/fsync/rename writes; safe `.vault/*.json` metadata writes;
write-ahead journal; data-loss regression fixtures; schema versioning; dry-run migrations;
rollback checkpoints; migration readiness screen; startup integrity scanner; note checksum
validation; vault repair flow; automated safety snapshots; explicit named IPC channels; Zod IPC
payload validation; threat model; IPC security tests; error taxonomy; System Health page;
diagnostics bundle export; MCP sidecar lifecycle telemetry.

**Worked well:** The initiative made data integrity, migration safety, and security boundaries
foundational instead of late-stage polish. It also created the trust model that later MCP and
desktop features rely on.

**Problematic or incomplete:** One residual validation gap exists on `dndtools:storage:clear-changelog`
per the architecture/defect review. The rewrite should make IPC schema registration impossible to
skip.

**Notable implementation approach:** Trusted Node runtimes own filesystem access; renderer access
flows through typed storage adapters and explicit IPC. Vault mutation safety is handled with atomic
writes, journals, checkpoints, and diagnostics.

### I2 - Engineering Excellence

**Status:** Complete, with follow-up backlog

**Epics:** 2.1 CI/CD Pipeline & Release Automation - Complete; 2.2 Test Pyramid Coverage -
Complete but uneven MCP per-tool coverage; 2.3 ADRs - Complete; 2.4 Developer Tooling &
Boundary Enforcement - Complete; 2.5 Performance Engineering Excellence - Complete; 2.6 CI/CD
Audit Follow-up Backlog - In Progress / backlog.

**Feature list:** core CI; desktop E2E; desktop build validation; release-please; docs validation;
MCP/storage/staged workflow tests; Playwright workflows; performance budgets; ADR template and
ADRs 001-013; runtime boundary linting; fixture vault generator; CODEOWNERS; debt register;
performance marks and metrics; worker offload strategy; memory profiling scripts; CI audit backlog
for duplicate jobs, formatting, coverage, timeouts, path-aware gates, and least privilege.

**Worked well:** CI, ADRs, documentation validation, and scriptable audits created strong project
memory and prevented many boundary regressions. The tiered smoke/full gate model is worth carrying
forward.

**Problematic or incomplete:** Browser E2E, Android validation, global coverage, MCP per-tool tests,
and some lint scripts are not uniformly merge-blocking. CI complexity grew enough to require its own
follow-up backlog.

**Notable implementation approach:** Quality gates are split by branch tier, with `smoke` for
initiative branches and `quality` for `master`. Architecture decisions are recorded in ADRs, and
runtime boundaries are enforced by lint/tests rather than convention alone.

### I3 - Core Knowledge Architecture

**Status:** Complete

**Epics:** 3.1 Note & Wikilink Graph Engine - Complete; 3.2 Structured Object System - Complete;
3.3 Advanced Search & Discovery - Complete; 3.4 Template & Snippet Library - Complete;
3.5 Import/Export & Interoperability - Complete; 3.6 Vault Graph Intelligence - Complete;
3.7 In-World Calendar & Custom Time System - Complete.

**Feature list:** incremental wikilink graph updates; aliases; disambiguated link picker; dead-link
highlighting and bulk repair; typed object schemas; relationship graph; object validation/linting;
object history and revert; object embeds; advanced search operators; facets; saved searches;
semantic search; note templates; variables; snippets; create-from-template workflows; Obsidian
import mapping; import analyzer; resumable imports; zip and deterministic exports; orphan/hub
insights; graph visualization; backlink snippets; link quality report; custom world calendar;
calendar formatting; moon phase/reference panel; calendar-aware MCP tools.

**Worked well:** The knowledge model became the shared substrate for session, map, object, and MCP
features. Notes remain portable markdown while structured objects add typed domain behavior.

**Problematic or incomplete:** Some planned search/template/import breadth is expensive to remake
unless scoped aggressively. Object taxonomy should be kept, but generic extensibility should wait
until I8 scope is real.

**Notable implementation approach:** Markdown notes are canonical content; structured objects are
note-backed with typed frontmatter/data projections. Search and graph logic live in domain modules
and MCP tools consume pre-indexed vault metadata.

### I4 - Session-Time Command Center

**Status:** Complete

**Epics:** 4.1 Live Session Dashboard - Complete; 4.2 Combat Tracker - Complete; 4.3 Quick
Reference - Complete; 4.4 Dice Engine - Complete; 4.5 Campaign Timeline - Complete; 4.6
Player-Facing View Mode - Complete with known privacy defects; 4.7 Random Generation - Complete;
4.8 Handout System - Complete; 4.9 Encounter Builder - Complete.

**Feature list:** session board templates; live note preview tiles; session quick panel; timer
tile; initiative tracker; HP/conditions; linked stat-block previews; encounter log creation;
command palette entity lookup; wikilink hover cards; session context panel; quick-reference
overlay; dice parser; dice tray and roll history; editor roll insertion; roll macros; timeline
events; session log linkage; open-thread tracking; visibility tags; player route; player character
sheet view; random table format; built-in SRD-oriented tables; contextual generation; roll blocks;
generator panel; handout object/library/creator/delivery/cipher workflow; CR-aware encounter
builder with terrain, legendary/lair actions, logs, and loot.

**Worked well:** Session-time tools are cohesive around the DM's live table needs and use the same
notes, objects, calendar, and board primitives rather than isolated subsystems.

**Problematic or incomplete:** Player visibility has known leak risks when enforced in UI surfaces
instead of query/data boundaries. Several interaction-heavy surfaces later accumulated oversized
files and pointer/keyboard defects.

**Notable implementation approach:** Session features are persisted through session state and
session-board models, with pure domain modules for dice, combat, boards, timelines, handouts,
random tables, and encounters.

### I5 - AI Creative Partnership

**Status:** Complete

**Epics:** 5.1 Semantic MCP Architecture - Complete; 5.2 Vault Intelligence Engine - Complete;
5.3 Human Oversight & Staged Change - Complete; 5.4 Content Generation Workflows - Complete;
5.5 Local AI & Offline Intelligence - Complete / partly capability-dependent.

**Feature list:** vault intelligence cache; session prep bundle; recap bundle; continuity check
bundle; large-vault semantic compression; campaign health score; coverage gaps; stale note
detection; thematic cluster analysis; semantic staged diffs; per-agent MCP policy; batch approval;
audit trail browser; conflict detection; contextual NPC/encounter/story-hook generation;
post-session checklist; local embeddings; local LLM routing; deterministic fallbacks; Ollama model
management concept.

**Worked well:** MCP is framed as an intelligence layer with bundled context, not just CRUD. Staged
writes and policy controls preserve human ownership of campaign content.

**Problematic or incomplete:** Dedicated tests are uneven across MCP tools, and local AI support
depends on external runtimes. A remake should preserve algorithmic fallbacks so AI is additive.

**Notable implementation approach:** MCP exposes read/write tools and stable resources. Writes are
staged by default; semantic bundle tools pre-process vault data to reduce agent context load.

### I6 - Multi-Platform Distribution

**Status:** Complete

**Epics:** 6.1 Desktop Shell Hardening - Complete; 6.2 Android Build & Sideload Pipeline -
Complete; 6.3 Offline-First Sync Architecture - Complete locally, cloud sync deferred into I7;
6.4 Accessibility Compliance Program - Complete; 6.5 PWA & Browser Support - Complete.

**Feature list:** signed desktop packaging plan; auto-update; bundled MCP sidecar runtime; vault
lifecycle UX; Capacitor Android scaffolding; Capacitor storage adapter; mobile navigation;
virtual-keyboard adaptation; APK signing pipeline; sync status; offline queue and conflict model;
WCAG audit; axe tests; keyboard reachability; screen-reader QA; touch/motion audit; service worker;
IndexedDB storage adapter; PWA manifest/install; browser-mode feature parity audit.

**Worked well:** Storage adapters let Electron, browser/PWA, and Android share renderer/domain
logic. Accessibility became a platform requirement rather than an afterthought.

**Problematic or incomplete:** Android and browser validation are weaker than desktop validation in
the current gates. True cloud sync is deferred to I7.

**Notable implementation approach:** Runtime selection happens at bootstrap by choosing Electron,
Capacitor, or IndexedDB storage adapters. Platform-specific shell capabilities are isolated behind
bridges and graceful degradation rules.

### I7 - Collaborative Infrastructure

**Status:** Deferred

**Epics:** 7.1 AWS Backend Foundation - Deferred; 7.2 Real-Time Session Sync - Deferred; 7.3 P2P
Direct Connection - Deferred; 7.4 Player Client Experience - Deferred; 7.5 Async Content Sharing -
Deferred; 7.6 Multi-Device Sync UX - Deferred.

**Feature list:** planned Cognito/S3/DynamoDB/API Gateway backend; cloud vault sync; end-to-end
encryption; WebSocket session channel; DM-controlled collaborative session boards; reveal workflow;
presence and reconnect; WebRTC P2P; mDNS discovery; QR invitations; player-optimized UI; player
sheet sync; private journal; party overview; shareable read-only vault links; public campaign wiki;
player inbox; recap publishing; per-note sync status; conflict resolution; delta sync; cloud
version history.

**Worked well:** The planned shape is explicit and preserves local-first as the baseline.

**Problematic or incomplete:** Entire initiative is blocked behind backend, identity, encryption,
and conflict-resolution scope. It should not be included in a remake MVP unless collaboration is the
primary product goal.

**Notable implementation approach:** Planned AWS backend plus shared session-state protocol for
WebSocket and WebRTC channels.

### I8 - Extensibility & Ecosystem

**Status:** Not Started

**Epics:** 8.1 Plugin Architecture - Not Started; 8.2 Campaign System Modules - Not Started; 8.3
Custom Object Types - Not Started; 8.4 External Compendium Integrations - Not Started; 8.5 Theme &
Design System - Partly superseded by I15; 8.6 Developer API/Webhooks - Not Started; 8.7 i18n -
Not Started.

**Feature list:** planned plugin manifests; worker sandbox; plugin registry UI; lifecycle hooks;
plugin SDK; campaign system module interface; D&D 5e and generic system modules; system selector;
custom object type UI; schema registry; Open5e import; compendium source interface; user-defined
theme tokens; local REST API; webhooks; automation integrations; CLI; string externalization;
locale formatting; RTL; community translation workflow.

**Worked well:** The initiative identifies important extension seams for a long-lived platform.

**Problematic or incomplete:** Public plugin and API surfaces would multiply architecture and
security burden. In a remake, keep internal seams clean but defer public extensibility until core
workflows stabilize.

**Notable implementation approach:** Planned plugin sandbox via Web Worker/Comlink and a capability
manifest; campaign systems would become modules instead of hardcoded 5e assumptions.

### I9 - Maps & Spatial Intelligence

**Status:** Complete

**Epics:** 9.1 Map Asset Manager & Viewer - Complete; 9.2 POIs & Note Linking - Complete; 9.3
Combat Grid & Token Management - Complete; 9.4 Fog of War & Map Reveal - Complete; 9.5 World
Atlas & Region Hierarchy - Complete.

**Feature list:** map import/library; image asset metadata; tiled pan/zoom viewer; grid overlay;
map graph relationships; POI placement; POI hover preview and navigation; reverse note-to-map
links; annotation layers; combat tokens; movement/range indicators; AoE templates; status
indicators; combat map persistence; fog paint tools; player fog enforcement; reveal animation;
fog persistence; parent/child map hierarchy; party location; route drawing; distance and travel
time; geographic frontmatter and map-scoped search.

**Worked well:** Maps integrate with objects, notes, session boards, MCP context, and the atlas
hierarchy instead of living as standalone images.

**Problematic or incomplete:** Map implementation became one of the largest and riskiest areas:
known defects cluster around undo transactions, mode transitions, pointer propagation, player
visibility, focus, and deep-link redirects.

**Notable implementation approach:** Maps are object-backed entities with POIs, layers, routes,
fog, and hierarchy stored in map data. Viewer behavior later moved toward explicit mode/state
machines.

### I10 - Player Character Suite

**Status:** Not Started

**Epics:** 10.1 Complete D&D 5e Character Sheet - Not Started; 10.2 Spell Slot/Resource Tracking -
Not Started; 10.3 Advancement & Downtime - Not Started; 10.4 Party Coordination - Not Started;
10.5 Player Session Journal - Not Started.

**Feature list:** planned full 5e character sheet; stats/saves/skills; HP/AC/speed/initiative;
equipment/currency/encumbrance; features/personality/backstory; spell slots; prepared spells;
class resources; rest workflow; concentration/death saves; guided level-up; XP/milestone modes;
downtime; character history; live party HP/status; party inventory; resource summary; marching
order; player private vault; bookmarks/NPC impressions; personal quests; highlights/quotes.

**Worked well:** The plan correctly separates long-lived character data from session overlays such
as current HP and resource usage.

**Problematic or incomplete:** The current app remains DM-centric. Player character work depends on
strong player-mode privacy and, for sync, I7 collaboration.

**Notable implementation approach:** Planned character objects plus session-scoped overlays and
collaborative party panels.

### I11 - Atmosphere, Audio & Immersive Scene Management

**Status:** Not Started

**Epics:** 11.1 Ambient Audio Engine - Not Started; 11.2 Scene Cards & Display Mode - Not Started;
11.3 Audio Preset Library & Scene Builder - Not Started; 11.4 Atmosphere Automation - Not Started.

**Feature list:** planned Web Audio engine; local audio asset library; web audio sources; audio
control widget; scene card object type; fullscreen/second-screen display mode; scene queue;
player device scene push; categorized preset library; custom preset editor; scene packages;
scene package export/import; event-driven triggers; combat music automation; sound effects;
MCP atmosphere tools.

**Worked well:** The initiative is well integrated with session, maps, and MCP concepts on paper.

**Problematic or incomplete:** Audio brings licensing, browser autoplay, device routing, and
performance concerns. It should remain outside a remake MVP unless immersion is a core target.

**Notable implementation approach:** Planned audio state is session-scoped and event-driven, with
scene packages combining audio, imagery, and reveal workflows.

### I12 - Community & Content Ecosystem

**Status:** Deferred

**Epics:** 12.1 Campaign Module Format - Deferred; 12.2 Community Content Directory - Deferred;
12.3 Creator Tooling - Deferred; 12.4 Public Campaign Wiki - Deferred.

**Feature list:** planned `.dndmodule` manifest; module export/import; dependency resolution;
module version tracking; hosted community directory API; in-app directory browser; ratings/reviews;
curator picks; module creator workspace; validation checklist; versioned publishing; attribution
and license enforcement; public wiki publish workflow; mobile wiki reader; access control;
subscriber notifications.

**Worked well:** The content ecosystem plan is coherent and depends correctly on collaboration,
cloud, and module format work.

**Problematic or incomplete:** Entirely backend/community dependent. It should be treated as a
future platform layer, not core remake scope.

**Notable implementation approach:** Planned hosted directory plus installable vault bundles with
structured manifests and non-destructive import/update semantics.

### I13 - Information Architecture & Navigation System Overhaul

**Status:** Complete

**Epics:** 13.1 IA Audit & Route Architecture - Complete; 13.2 Global Navigation - Complete;
13.3 Local Navigation - Complete; 13.4 Contextual Navigation - Complete; 13.5 Command Palette &
Search Navigation - Complete.

**Feature list:** content taxonomy; navigation redundancy inventory; three-layer navigation
contract; URL redesign; breadcrumbs; primary section icons; global nav component; TopBar charter;
active route/section state; persona switch; section panels; collapsible local nav; Knowledge and
Session local nav; pinned/recent access; collections; backlinks; cross-section links; preserved
history state; command palette; search scopes; hierarchy-aware results; keyboard-complete palette.

**Worked well:** The global/local/contextual navigation model is clear and worth preserving.
Section-rooted ownership made the app easier to reason about.

**Problematic or incomplete:** Legacy routes still exist as duplicate implementations in several
areas. A remake should start from canonical routes and generate redirect aliases.

**Notable implementation approach:** Navigation is treated as an architecture contract and linted
through route/landmark rules rather than just component styling.

### I14 - Adaptive Cross-Platform Shell

**Status:** Complete

**Epics:** 14.1 Layout Token Architecture - Complete; 14.2 Compact Layout - Complete; 14.3
Expanded Layout - Complete; 14.4 Electron Desktop Refinements - Complete; 14.5 Medium Layout -
Complete.

**Feature list:** breakpoint contract; structural layout tokens; layout-tier store; mobile bottom
nav; local-nav bottom sheet; simplified mobile TopBar; mobile editor adaptation; gestures with
keyboard alternatives; desktop nav rail and local panel; right detail panel; resizable panels;
Zen mode; persistent panel state; custom titlebar; native context menus; accelerators; protocol
handler; file watcher; tablet rail/split view; input modality awareness.

**Worked well:** Three layout tiers provide a durable shell model across desktop, tablet, and
mobile without scattering layout decisions across components.

**Problematic or incomplete:** Desktop titlebar sizing and touch-target reuse produced known issues.
The remake should define platform-specific shell primitives early.

**Notable implementation approach:** Shell state derives from layout tokens and a central layout
store; platform chrome lives in Electron-specific components/services.

### I15 - Design System & Visual Language

**Status:** Complete

**Epics:** 15.1 Design Token Architecture - Complete; 15.2 Icon System - Complete; 15.3 Core
Component Library - Complete; 15.4 TTRPG Visual Language - Complete; 15.5 Density/Readability -
Complete.

**Feature list:** semantic color tokens; typography tokens; spacing tokens; motion/elevation
tokens; icon library integration; icon component; domain icon vocabulary; button/input/nav/card/list
components; dialog/sheet/popover/toast components; theme presets; upgraded note rendering; stat
block component; character sheet visuals; dice result visuals; density preferences; reading width;
enhanced note list; sidebar density.

**Worked well:** Semantic tokens, shared components, and icon vocabulary give the app a coherent
cross-feature visual language.

**Problematic or incomplete:** Some components bypass tokens or reuse utilities in contexts where
they do not fit. Token lint and platform-specific component contracts should be stricter in v2.

**Notable implementation approach:** Raw palette values flow into semantic CSS variables, then
component tokens. Shared primitives are meant to be the only styling surface for common controls.

### I16 - Session-Time UX Reimagined

**Status:** Complete

**Epics:** 16.1 Session Mode State - Complete; 16.2 Dice Integration - Complete; 16.3 Combat
Tracker UX - Complete; 16.4 Session Board Mission Control - Complete; 16.5 Prep & Recap Workflow -
Complete.

**Feature list:** session mode state machine; start/end session flows; session-active layout;
session persistence; persistent dice bar; roll history panel; inline dice buttons; random tables as
session assets; dice tray consolidation; combat persistence; redesigned combat tracker; touch HP
adjustment; stat-block quick reference; condition durations; board layout redesign; scene
management; handout delivery action; prep vs session mode; pre-session prep view; end-of-session
capture; continuity check integration.

**Worked well:** Session mode turns scattered tools into a coherent runtime state and aligns dice,
combat, boards, prep, and recap.

**Problematic or incomplete:** Interaction complexity increased sharply, especially in board/combat
surfaces. Dialog-local keyboard behavior and touch actions need focused regression tests.

**Notable implementation approach:** Session mode is application-level state rather than route-only
state, allowing session tools to remain available across navigation.

### I17 - Learnability, Progressive Disclosure & Help Systems

**Status:** Complete

**Epics:** 17.1 Empty States - Complete; 17.2 Progressive Disclosure - Complete; 17.3 Contextual
Help - Complete; 17.4 First-Run Onboarding - Complete.

**Feature list:** EmptyState component; Knowledge/Session/Atlas/Campaign/Graph empty states;
feature-tier registry; vault maturity signals; advanced feature enablement; progressive settings;
HelpTip component; feature spotlights; shortcut overlay; help menu; vault setup wizard; guided
first-action prompts; onboarding state machine; What's New panel.

**Worked well:** Feature tiers and vault maturity prevent the app from overwhelming new users while
keeping advanced capabilities discoverable.

**Problematic or incomplete:** Fresh-vault feature-tier behavior still needs stronger E2E coverage.
Manual verification should not be the only guard.

**Notable implementation approach:** Progressive disclosure is backed by domain/state modules, not
only instructional copy.

### I18 - Accessibility & Inclusive Design

**Status:** Complete

**Epics:** 18.1 Semantic HTML/ARIA - Complete; 18.2 Focus & Keyboard Navigation - Complete; 18.3
Sensory/Motion Accessibility - Complete; 18.4 Touch/Pointer Accessibility - Complete; 18.5
Automated Accessibility Pipeline - Complete.

**Feature list:** skip links; landmarks; navigation ARIA patterns; page-title and heading hierarchy
enforcement; live status announcements; focus trap system; focus visibility; shortcut registry;
arrow-key list navigation; focus restoration; reduced motion; color-independent statuses; contrast
audit; high contrast theme; touch target audit; drag alternatives; accessible tooltips; axe
Playwright integration; keyboard-only Playwright scenarios; manual screen-reader QA process;
accessibility CI gate/reporting.

**Worked well:** Accessibility is documented as an engineering system with tests, reports, tokens,
and interaction contracts.

**Problematic or incomplete:** Known regressions remain around hash focus, titlebar hitboxes,
popover hover/focus containment, and test artifact stability.

**Notable implementation approach:** Accessibility is split across shared actions/components,
keyboard shortcut registry, design tokens, and Playwright/axe policy files.

### I19 - Map Tool UX

**Status:** Complete

**Epics:** 19.1 Map Library UX - Complete; 19.2 Map Viewer Mode Architecture - Complete; 19.3 POI
UX - Complete; 19.4 Editing Tool Ergonomics - Complete; 19.5 Canvas Accessibility & Mobile -
Complete.

**Feature list:** map empty state; thumbnail gallery; map hierarchy in Atlas local nav; route split
between library and viewer; map mode state machine; mode indicator strip; contextual tool panels;
mode-switching toolbar; keyboard shortcuts; POI ghost pin feedback; POI popover; POI selected state
in detail panel; guided note creation from POI; undo/redo stack; fog paint ergonomics; explicit
route waypoints; layer management; keyboard POI navigation; map canvas ARIA; mobile touch gestures;
mobile toolbar placement.

**Worked well:** The mode/state-machine direction is the correct answer for a complex map tool.
Atlas local navigation and route splitting improved clarity.

**Problematic or incomplete:** Review defects show the mode model was not fully hardened: grid
visibility, force bypass, async undo, pointer propagation, POI player visibility, and deep-link
preservation all need redesign-level attention.

**Notable implementation approach:** Map UI evolves from many booleans to explicit viewer modes
and command-like editing operations.

### I20 - Board Tool UX

**Status:** Complete

**Epics:** 20.1 Tile Visual Identity - Complete; 20.2 Board Interaction Model - Complete; 20.3
Tile Creation Flow - Complete; 20.4 Mobile Board - Complete; 20.5 Empty States/Progressive
Disclosure/Performance - Complete.

**Feature list:** tile semantic colors and icons; note depth controls; accessible tile action menu;
keyboard and preset resizing; three board zoom presets; natural scroll/drag pan model; tile keyboard
navigation and placement; overflow indicator; tile gallery sheet; note assignment search with
preview; command-palette tile creation; map tile type; compact stacked tile rendering; full-screen
tile expansion; floating session action bar; touch-first combat tile; board empty state; layout
quality indicator; progressively disclosed templates; virtual rendering for full-depth note tiles.

**Worked well:** Board UX now recognizes distinct tile types, mobile constraints, and keyboard
operation instead of treating the board only as a desktop canvas.

**Problematic or incomplete:** Pan/selection conflicts and oversized board route files remain key
risks. Board gestures and child controls need stronger event ownership boundaries.

**Notable implementation approach:** Session boards are persisted models with typed tiles; UI
behavior layers tile identity, zoom presets, compact rendering, and virtualization on top.

### I21 - Codebase Realignment & Quality Audit

**Status:** In Progress

**Epics:** 21.1 CI/CD Pipeline Restructuring - Complete; 21.2 Build Scripts & Tooling Audit -
Complete; 21.3 Metrics Baseline - Complete; 21.4 Project Organization Audit - Complete; 21.5
Module Boundary Audit - Complete; 21.6 ADR/Standards Review - Complete; 21.7 Route Component
Decomposition - Pending; 21.8 Domain Logic Decomposition - Pending; 21.9 Infrastructure
Decomposition - Pending; 21.10 Test File Decomposition - Pending; 21.11 Bundle/Build Performance -
Pending; 21.12 Runtime Performance - Pending; 21.13 Test Suite Performance - Pending; 21.14
Storage/Data Audit - Pending; 21.15 MCP Deep Audit - Pending; 21.16 Renderer Core Audit - Pending;
21.17 UI/Design System Audit - Pending; 21.18 Session System Audit - Pending; 21.19 Maps/Atlas
Audit - Pending; 21.20 Electron Shell Audit - Pending; 21.21 Security Audit - Pending; 21.22
Accessibility Audit - Pending; 21.23 UX/Data Exposure Audit - Pending; 21.24 Test Coverage -
Pending; 21.25 Documentation Realignment - Pending; 21.26 Final Validation - Pending.

**Feature list:** branch model and smoke/full gates; smoke test suite; workflow restructuring;
script inventory; composite agent commands; metrics baselines; project/IA/file/tier audits; module
boundary audits; ADR/design/navigation compliance audits; planned decomposition of oversized route,
domain, infrastructure, and test files; planned performance recovery; planned deep audits for
storage, MCP, renderer, UI, session, maps, Electron, security, accessibility, UX, docs, and final
release readiness.

**Worked well:** I21 produced the clearest evidence about what should be redesigned in a remake:
oversized files, legacy route duplication, boundary drift, test gaps, and privacy/visibility risks.

**Problematic or incomplete:** Most of the corrective implementation remains pending. The known
largest files and interaction-heavy surfaces should be treated as remake warnings, not patterns to
copy.

**Notable implementation approach:** Audit-first realignment: establish baselines and written
findings before decomposition and performance recovery.

## Route Inventory

Canonical section routing exists alongside legacy duplicate routes. The remake should keep only
section-rooted routes plus thin redirect aliases where backward compatibility is needed.

| Area | Route files |
| --- | --- |
| Root shell/home | `src/routes/+layout.svelte`, `src/routes/+layout.ts`, `src/routes/+page.svelte` |
| Knowledge | `src/routes/knowledge/+page.svelte`, `src/routes/knowledge/+page.ts`, `src/routes/knowledge/notes/+page.svelte`, `src/routes/knowledge/notes/+page.ts`, `src/routes/knowledge/notes/[id]/+page.svelte`, `src/routes/knowledge/notes/[id]/+page.ts`, `src/routes/knowledge/notes/[id]/edit/+page.svelte`, `src/routes/knowledge/notes/[id]/edit/+page.ts`, `src/routes/knowledge/search/+page.svelte`, `src/routes/knowledge/search/+page.ts`, `src/routes/knowledge/graph/+page.svelte`, `src/routes/knowledge/graph/+page.ts` |
| Atlas | `src/routes/atlas/+page.ts`, `src/routes/atlas/maps/+page.svelte`, `src/routes/atlas/maps/+page.ts`, `src/routes/atlas/maps/[id]/+page.svelte`, `src/routes/atlas/maps/[id]/+page.ts` |
| Session | `src/routes/session/+page.ts`, `src/routes/session/boards/+page.svelte`, `src/routes/session/boards/+page.ts`, `src/routes/session/combat/+page.svelte`, `src/routes/session/combat/+page.ts`, `src/routes/session/encounter/new/+page.svelte`, `src/routes/session/encounter/new/+page.ts` |
| Campaign | `src/routes/campaign/+page.ts`, `src/routes/campaign/timeline/+page.svelte`, `src/routes/campaign/timeline/+page.ts` |
| Settings | `src/routes/settings/+page.svelte`, `src/routes/settings/+page.ts` |
| Legacy duplicate / compatibility routes | `src/routes/notes/+page.svelte`, `src/routes/notes/[id]/+page.svelte`, `src/routes/notes/[id]/+page.ts`, `src/routes/notes/[id]/edit/+page.svelte`, `src/routes/search/+page.svelte`, `src/routes/graph/+page.svelte`, `src/routes/maps/+page.svelte`, `src/routes/session-board/+page.svelte`, `src/routes/combat/+page.svelte`, `src/routes/encounter/new/+page.svelte`, `src/routes/timeline/+page.svelte`, `src/routes/player/+page.svelte` |

## Domain Module Inventory

Domain modules show the feature boundaries that already exist and should be kept or made sharper in
a remake:

- Appearance and theme: `appearance.ts`, `theme.ts`
- Navigation/context: `backlink-context.ts`, `detail-panel-context.ts`, `keyboard-shortcuts.ts`,
  `keyboard-shortcut-manager.ts`, `link-extractor.ts`, `link-resolution.ts`,
  `related-note-jumps.ts`, `related-note-suggestions.ts`, `search-scope.ts`
- Knowledge/search: `note-persistence.ts`, `search.ts`, `semantic-search.ts`,
  `link-graph-intelligence.ts`, `unresolved-links.ts`, `templates.ts`, `template-automation.ts`,
  `snippets.ts`, `vault-templates.ts`, `vault-maturity.ts`, `maturity-thresholds.ts`
- Objects: `objects.ts`, `object-notes.ts`, `object-validation.ts`, `object-templates.ts`,
  `object-relationships.ts`, `object-embeds.ts`
- Session tools: `session-board.ts`, `session-combat.ts`, `session-prep-workflow.ts`,
  `session-timeline.ts`, `combat-tracker.ts`, `combat-map.ts`, `dice.ts`, `random-tables.ts`,
  `rollable-tables.ts`, `quick-reference.ts`, `handouts.ts`, `encounter-builder.ts`,
  `contextual-generator.ts`
- Maps/atlas: `map-atlas.ts`, `map-library.ts`, `map-pois.ts`, `map-fog.ts`, `map-routes.ts`
- Campaign/world: `campaign-timeline.ts`, `world-calendar.ts`, `world-calendar-events.ts`,
  `open-threads.ts`
- Platform-adjacent domain concerns: `sync.ts`, `import-export.ts`, `export.ts`,
  `mcp-change-preview.ts`, `error-taxonomy.ts`, `visibility.ts`, `settings-tabs.ts`
- Onboarding/help: `onboarding.ts`, `feature-spotlights.ts`, `welcome-note.ts`, `whats-new.ts`

## MCP Tool Inventory

The MCP server starts from `mcp/index.ts`, selects direct filesystem writes only when `--direct` or
`DNDTOOLS_MCP_STAGED=0` is present, otherwise wraps the filesystem adapter with
`StagedMcpAdapter`, then registers tools and resources. Every tool is registered through
`createContractServer`, which adds strict top-level input validation, an optional
`idempotencyKey`, permission checks, response envelope validation, response schema validation, and
idempotency-key response caching for retry-required tools. Bundle tools ending in `_bundle` also
append best-effort performance samples to `.vault/mcp-performance.json`.

### MCP Notes Domain

| Tool | Signature | Permission / retry | Test coverage | Staged write behavior |
| --- | --- | --- | --- | --- |
| `list_notes` | `folder?`, `tag?`, `includeDeleted? = false`, `limit? = 100` | `read-only` / `idempotent` | Dedicated in `mcp/tools/notes/note-tools.test.ts` plus `all-tools.test.ts` | Reads the staged virtual note view when staged mode is active. |
| `read_note` | `id?`, `title?` | `read-only` / `idempotent` | Dedicated in `note-tools.test.ts` plus `all-tools.test.ts` | Reads the staged virtual note view, including pending note creates/updates/deletes. |
| `create_note` | `title?`, `content?`, `folder?`, `tags?`, `visibility? = dm_only`, `frontmatter? = {}`, `templateId?`, `templateContext?` | `write-staged` / `idempotency-key-required` | Dedicated in `note-tools.test.ts` and template/idempotency paths in `all-tools.test.ts` | In staged mode records an MCP `create` change with a proposed file path and diff preview instead of writing the note immediately. |
| `update_note` | `id`, optional `title`, `content`, `folder`, `tags`, `visibility`, `frontmatter`, `frontmatterMode? = merge` | `write-staged` / `idempotency-key-required` | Dedicated in `mcp/tools/notes/update-note.test.ts` plus `all-tools.test.ts` | In staged mode records an `update` change against the virtual latest note and reindexes links against staged content. |
| `delete_note` | `id`, `permanent? = false` | `write-staged` / `idempotency-key-required` | Dedicated in `note-tools.test.ts` plus `all-tools.test.ts` | In staged mode records `soft_delete` or `permanent_delete`; soft deletes remain visible only through staged virtual state until approved. |
| `restore_note` | `id` | `write-staged` / `idempotent` | Dedicated in `note-tools.test.ts` plus `all-tools.test.ts` | In staged mode records a `restore` change and exposes the restored note through virtual reads. |

### MCP Search, Dice, and Random Domains

| Tool | Signature | Permission / retry | Test coverage | Staged write behavior |
| --- | --- | --- | --- | --- |
| `search_notes` | `query`, `limit? = 20`, `mapId?` | `read-only` / `idempotent` | Dedicated in `mcp/tools/search/search-notes.test.ts` plus `all-tools.test.ts` | Uses staged note state through storage search/index views where available. |
| `get_backlinks` | `id` | `read-only` / `idempotent` | Dedicated in `mcp/tools/search/get-backlinks.test.ts` plus `all-tools.test.ts` | Computes links from staged content in `StagedMcpAdapter`; also includes map placement backlinks from objects. |
| `get_tags` | no input | `read-only` / `idempotent` | Only `all-tools.test.ts` | Tag counts are derived from staged virtual notes in staged mode. |
| `roll_dice_expression` | `expression` | `read-only` / `idempotent` | Dedicated in `mcp/tools/dice/dice-tools.test.ts` plus `all-tools.test.ts` | No write behavior. |
| `get_dice_macros` | no input | `read-only` / `idempotent` | Dedicated in `dice-tools.test.ts` plus `all-tools.test.ts` | Reads dice macros from settings; settings are not staged by `StagedMcpAdapter`. |
| `roll_dice_macro` | `macroId?`, `label?` | `read-only` / `idempotent` | Dedicated in `dice-tools.test.ts` plus `all-tools.test.ts` | No write behavior. |
| `roll_table` | `name`, `includeSystem? = true`, `maxDepth? = 6` | `read-only` / `idempotent` | Dedicated in `mcp/tools/random/roll-table.test.ts` plus `all-tools.test.ts` | Reads random-table notes through staged virtual note state. |

### MCP Vault Intelligence Domain

| Tool | Signature | Permission / retry | Test coverage | Staged write behavior |
| --- | --- | --- | --- | --- |
| `get_vault_summary` | `staleAfterDays? = 45`, `maxExamples? = 12` | `read-only` / `idempotent` | Dedicated in `mcp/tools/vault/get-vault-summary.test.ts` plus `all-tools.test.ts` | Uses staged index/link views for notes and links; objects/boards remain direct storage reads. |
| `get_campaign_health` | `staleAfterDays? = 45`, `maxGapExamples? = 8` | `read-only` / `idempotent` | Only `all-tools.test.ts` | Same staged intelligence path as `get_vault_summary`. |
| `get_coverage_gaps` | `staleAfterDays? = 45`, `limit? = 20` | `read-only` / `idempotent` | Only `all-tools.test.ts` | Same staged intelligence path as `get_vault_summary`. |
| `get_stale_notes` | `staleAfterDays? = 45`, `limit? = 50` | `read-only` / `idempotent` | Only `all-tools.test.ts` | Same staged intelligence path as `get_vault_summary`. |
| `get_folder_tree` | no input | `read-only` / `idempotent` | Only `all-tools.test.ts` | Reads folder tree from staged virtual notes. |
| `get_recent_activity` | `limit? = 20`, `since?` | `read-only` / `idempotent` | Only `all-tools.test.ts` | Reads recent notes from staged virtual notes. |
| `get_link_graph` | `includeDeleted? = false`, `includeIsolated? = true`, `folderFilter?`, `tagFilter?`, `includeQuality? = true` | `read-only` / `idempotent` | Dedicated in `mcp/tools/vault/get-link-graph.test.ts` plus `all-tools.test.ts` | Builds graph from staged note/index/link views. |
| `get_calendar_events` | `dateRange: { from, to? }`, `includeKinds? = []`, `limit? = 200` | `read-only` / `idempotent` | Only `all-tools.test.ts` | Reads notes/objects directly through storage; note reads include staged virtual notes. |
| `get_open_threads` | `limitPerType? = 25`, `includeKinds? = []`, `arcTag?` | `read-only` / `idempotent` | Dedicated in `mcp/tools/vault/get-open-threads.test.ts` plus `all-tools.test.ts` | Reads staged notes plus direct objects/settings. |
| `vault_health_check` | no input | `read-only` / `idempotent` | Dedicated in `mcp/tools/vault/vault-health-check.test.ts` plus `all-tools.test.ts` | Scans staged virtual notes and staged link entries for note/link health. |
| `get_session_prep_bundle` | `focusTag?`, `worldDate?`, `staleAfterDays? = 45`, `recentLimit?`, other bounded bundle limits | `read-only` / `idempotent` | Dedicated in `mcp/tools/vault/get-session-prep-bundle.test.ts` plus `all-tools.test.ts` | Combines staged note/link intelligence with direct board/object/settings reads. |
| `estimate_travel_time` | `mapId`, `routeName` | `read-only` / `idempotent` | Dedicated in `mcp/tools/vault/estimate-travel-time.test.ts` plus `all-tools.test.ts` | Reads map objects directly; object writes are not staged. |
| `get_recap_generation_bundle` | `since?`, `worldDate?`, `noteLimit? = 30`, `objectLimit? = 25`, `boardLimit?`, `tagLimit?` | `read-only` / `idempotent` | Only `all-tools.test.ts` | Reads changed notes through staged virtual state and objects/boards directly. |
| `get_continuity_check_bundle` | `staleAfterDays? = 45`, `maxExamples? = 12` | `read-only` / `idempotent` | Only `all-tools.test.ts` | Uses the staged vault intelligence path for note/link continuity signals. |

`mcp/tools/vault/vault-intelligence.ts` is the shared analysis engine behind summary, health,
coverage, stale-note, session-prep, recap, and continuity outputs. Its direct test coverage is
`mcp/tools/vault/vault-intelligence.test.ts`.

### MCP Session Board Domain

| Tool | Signature | Permission / retry | Test coverage | Staged write behavior |
| --- | --- | --- | --- | --- |
| `list_session_boards` | no input | `read-only` / `idempotent` | Dedicated in `mcp/tools/boards/session-board-tools.test.ts` plus `all-tools.test.ts` | Reads boards directly; board state is not virtualized by staged mode. |
| `create_session_board` | `name`, `description? = ""`, `noteIds? = []` | `write-direct` / `idempotency-key-required` | Dedicated in `session-board-tools.test.ts` plus `all-tools.test.ts` | Requires direct mode; staged mode returns `MCP_PERMISSION_DENIED`. |
| `update_session_board` | `boardId`, optional `name`, `description`, `tiles`, `layout`, `style`, `addNoteIds? = []` | `write-direct` / `idempotency-key-required` | Dedicated in `session-board-tools.test.ts` plus `all-tools.test.ts` | Requires direct mode; staged mode returns `MCP_PERMISSION_DENIED`. |
| `delete_session_board` | `boardId` | `write-direct` / `idempotent` | Dedicated in `session-board-tools.test.ts` plus `all-tools.test.ts` | Requires direct mode; deletion of a missing board is a no-op once permitted. |
| `suggest_related_board_notes` | `boardId?`, `noteIds? = []`, `limit? = 8` | `read-only` / `idempotent` | Dedicated in `session-board-tools.test.ts` plus `all-tools.test.ts` | Uses staged notes/links for related-note scoring, but board reads are direct. |

### MCP Object Domain

| Tool | Signature | Permission / retry | Test coverage | Staged write behavior |
| --- | --- | --- | --- | --- |
| `create_stat_block_object` | object base fields plus stat-block fields: `size?`, `creatureType?`, `alignment?`, `armorClass?`, `hitPoints?`, `speed?`, `challengeRating?`, `abilities?`, `traits?`, `actions?`, `reactions?`, `legendaryActions?` | `write-direct` / `idempotency-key-required` | Only `all-tools.test.ts`; shared schemas covered by `mcp/tools/shared/object-schema.test.ts` | Requires direct mode; object writes bypass staged notes. |
| `create_character_object` | object base fields plus character fields: `ancestry?`, `className?`, `level?`, `background?`, `alignment?`, `armorClass?`, `hitPoints?`, `speed?`, `proficiencyBonus?`, `abilities?`, `goals?`, `bonds?`, `flaws?`, `notes?` | `write-direct` / `idempotency-key-required` | Only `all-tools.test.ts`; shared schemas covered by `object-schema.test.ts` | Requires direct mode. |
| `create_image_object` | object base fields plus `url`, `alt?`, `caption?`, `credit?`, `width?`, `height?` | `write-direct` / `idempotency-key-required` | Only `all-tools.test.ts`; shared schemas covered by `object-schema.test.ts` | Requires direct mode. |
| `create_character_sheet_note` | same character input shape as `create_character_object` | `write-direct` / `idempotency-key-required` | Only `all-tools.test.ts`; shared schemas covered by `object-schema.test.ts` | Requires direct mode. |
| `create_stat_block_note` | same stat-block input shape as `create_stat_block_object` | `write-direct` / `idempotency-key-required` | Only `all-tools.test.ts`; shared schemas covered by `object-schema.test.ts` | Requires direct mode. |
| `list_objects` | `type?`, `query?`, `limit? = 50` | `read-only` / `idempotent` | Only `all-tools.test.ts` | Reads direct object storage; not staged. |
| `read_object` | `id` | `read-only` / `idempotent` | Only `all-tools.test.ts` | Reads direct object storage; not staged. |
| `update_object` | `id`, optional `name`, `summary`, `tags`, `visibility`, `relationships`, `data` | `write-direct` / `idempotency-key-required` | Only `all-tools.test.ts` | Requires direct mode. |
| `delete_object` | `id` | `write-direct` / `idempotency-key-required` | Only `all-tools.test.ts` | Requires direct mode. |
| `embed_object_in_note` | `noteId`, `objectId`, `label?`, `position? = append`, `renderView? = card`, `open?`, `maxDepth?`, `allowCycle? = false` | `write-staged` / `idempotency-key-required` | Only `all-tools.test.ts` | Updates target note content through staged note writes; object lookup remains direct. |
| `embed_note_in_note` | `noteId`, `targetNoteId`, `label?`, `position? = append`, `renderView? = card`, `open?`, `maxDepth?`, `allowCycle? = false` | `write-staged` / `idempotency-key-required` | Only `all-tools.test.ts` | Updates target note content through staged note writes and uses staged note reads for cycle checks. |
| `import_image_note` | `sourcePath`, `name?`, `summary? = ""`, `tags? = []`, `visibility? = dm_only`, `relationships? = []`, `assetFolder? = /assets/images`, `noteFolder? = /objects/image`, `alt?`, `caption?`, `credit?`, `moveFile? = false`, `overwrite? = false` | `write-direct` / `idempotency-key-required` | Dedicated in `mcp/tools/objects/import-image-note.test.ts` plus `all-tools.test.ts` | Requires direct mode because it copies/moves an asset file and creates object/note records immediately. |

### MCP Resource Inventory

| Resource | URI | Legacy URI | Payload |
| --- | --- | --- | --- |
| `note` | `dndtools://v1/notes/{id}` | `note://{id}` | `text/markdown` note content, or a plain-text not-found/invalid-id message. |
| `vault-structure` | `dndtools://v1/vault/structure` | `vault://structure` | JSON `{ totalNotes, folders: [{ path, noteCount }] }` for active notes. |
| `vault-tags` | `dndtools://v1/vault/tags` | `vault://tags` | JSON tag-count array. |
| `vault-resource-catalog` | `dndtools://v1/resources/catalog` | none | JSON discoverability metadata for canonical and legacy resources. |

Resources use `textResourceResult` / `jsonResourceResult` from `mcp/resources/shared/contracts.ts`
for payload validation. Dedicated resource catalog/registration coverage lives in
`mcp/resources/resource-catalog.test.ts`.

### MCP Test and Remake Implications

- `mcp/tools/all-tools.test.ts` is the only cross-tool contract harness. It verifies every
  registered tool has a valid fixture, rejects unknown top-level fields, validates success payloads
  against `MCP_TOOL_CONTRACTS`, enforces staged/direct permissions, covers empty-vault read
  behavior, checks deterministic missing-note errors, and exercises idempotency-key caching.
- Dedicated tool tests are strong for notes, boards, dice, random tables, search notes/backlinks,
  import-image, link graph, open threads, session-prep, travel-time, vault summary, vault health,
  and the shared vault intelligence engine.
- Dedicated tests are missing for `get_tags`, most object CRUD/embed tools, and several vault
  bundle/report tools (`get_campaign_health`, `get_coverage_gaps`, `get_stale_notes`,
  `get_folder_tree`, `get_recent_activity`, `get_calendar_events`,
  `get_recap_generation_bundle`, `get_continuity_check_bundle`).
- The staged write model is intentionally note-centric. Note CRUD and note embed tools stage
  changes and expose them through virtual note/link/tag/index reads. Session boards, objects,
  settings, asset imports, and object-backed map data remain direct; a remake should either make
  that boundary explicit in product UX or introduce a generalized staged transaction layer for all
  MCP mutators.

## Remake Carry-Forward Summary

Carry forward:

- Local-first markdown vault plus typed object overlays.
- StorageAdapter boundary and sandboxed renderer model.
- Section-rooted IA: Knowledge, Atlas, Session, Campaign, Settings.
- MCP staged write model and semantic bundle tools.
- Session mode as application state.
- Map and board state machines, but with stricter command/event boundaries.
- Semantic design tokens, shared components, accessibility gates, and progressive disclosure.
- Tiered CI gates, ADRs, docs validation, and metrics baselines.

Redesign or delay:

- Player-mode privacy should be enforced at data-query boundaries, not scattered UI guards.
- Map and board interactions should use explicit command transactions and centralized pointer
  ownership from the start.
- Legacy duplicate routes should become generated redirects that preserve query parameters.
- Oversized route/domain/infrastructure files should be decomposed before features accumulate.
- Collaboration, plugins, community content, full character suite, and atmosphere/audio should be
  explicit post-MVP initiatives unless they are the remake's core differentiator.
