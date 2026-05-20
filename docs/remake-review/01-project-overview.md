# Project Overview

## Source Set

This document was extracted from:

- `CLAUDE.md`
- `docs/README.md`
- `docs/GLOSSARY.md`
- `docs/CONTRIBUTING.md`
- `docs/planning/ROADMAP.md`
- `docs/planning/PLANNING_TIERS.md`
- `docs/reference/FEATURE_TIERS.md`

`CLAUDE.md` appears to be the most current status source for phases and initiatives. Some older
planning text still describes only 12 initiatives, while the current initiative map runs from I1
through I21.

## Vision

DND Tools is an Electron-first, local-first markdown vault for tabletop RPG campaign work: a DM
or worldbuilder can keep notes, structured objects, maps, session boards, dice, combat state,
timelines, handouts, and campaign intelligence in one offline-capable vault while AI agents access
that vault through a staged, reviewable MCP sidecar. The product direction favors trustworthy local
ownership of campaign data, fast desktop workflows during live sessions, and progressive disclosure
of advanced campaign-management features instead of front-loading every tool on first use.

## Primary Users and Use Cases

| Persona | Primary use cases |
| --- | --- |
| DM / campaign owner | Prepare and run sessions, maintain campaign notes, browse/search a local vault, manage maps, session boards, combat, dice, handouts, encounters, timelines, and random generation. |
| Worldbuilder / campaign writer | Create linked markdown notes, use wikilinks/tags/templates, manage structured vault objects, import/export markdown archives, inspect graph and calendar context. |
| AI-assisted creator | Use MCP tools to search, summarize, generate, and reorganize vault content while writes default to staged human review. |
| Player / table participant | Consume player-safe views, handouts, and player-mode content. Full player character and collaborative player-session workflows are mostly deferred or not started. |
| Contributor / maintainer | Work within strict renderer/Electron/MCP boundaries, use the initiative/epic/story planning model, keep tests and docs aligned with behavior. |

## Scope

### In Scope

- Local markdown vaults with filesystem-backed desktop storage.
- Browser/PWA fallback via IndexedDB and Android support via Capacitor filesystem storage.
- Electron desktop shell with trusted main process, sandboxed renderer, typed IPC, and MCP sidecar
  lifecycle management.
- Markdown note CRUD, reading, editing, wikilinks, backlinks, tags, graph/search/discovery, and
  templates.
- Structured vault objects, including stat blocks, characters, images, and other typed object
  notes.
- Session-time tools: boards, dice, combat tracking, quick reference, random generation, handouts,
  encounter builder, timelines, maps, POIs, fog, routes, layers, and player mode.
- MCP agent access with staged writes by default, direct mode only for controlled/test contexts.
- Import/export, safety snapshots, migrations, vault integrity checks, diagnostics, accessibility,
  and CI quality gates.
- Progressive-disclosure navigation where core features stay visible, intermediate features are
  introduced through use, and advanced features are opt-in or contextually enabled.

### Deferred

- Cloud sync and collaborative infrastructure, including AWS backend, real-time sync, P2P sync,
  async sharing, player sessions, and multi-device cloud sync.
- Community/content ecosystem features that require cloud infrastructure: campaign module sharing,
  public community directory, creator tooling, public wiki.
- Plugin ecosystem expansion, developer API, compendium integration, i18n, and broad strategic
  integrations.
- Full D&D 5e player character suite: character management, spell/resource tracking, advancement,
  party coordination, and player journal.
- Atmosphere/audio/scene-management suite: ambient audio engine, scene cards, presets, and
  automation triggers.

### Out of Scope or Explicit Guardrails

- Renderer code must not access Node APIs directly.
- Renderer persistence must go through `StorageAdapter`; direct IndexedDB or filesystem access from
  components is prohibited.
- Rendered note content must go through the unified markdown pipeline, not ad hoc parsing.
- Broad or unvalidated IPC is prohibited.
- MCP writes should not bypass staged review except in direct mode for controlled/test contexts.
- Work should not claim planned or aspirational features as implemented without verifying source
  files.

## Key Product Constraints

- **Local-first / offline-first:** Network access is treated as an enhancement, not a requirement.
  Desktop vault data is stored locally as markdown files.
- **Desktop-primary:** The baseline runtime is Electron main + renderer + filesystem storage + MCP
  sidecar. Android and browser/PWA runtimes share renderer/domain logic but have reduced runtime
  surfaces.
- **Local-only trust model for current baseline:** Cloud collaboration is deferred until the cloud
  development environment and stability gates exist.
- **Storage abstraction:** All persistence is routed through `StorageAdapter` implementations for
  Electron/filesystem, Capacitor, or IndexedDB.
- **Sandboxed renderer:** Electron main and MCP are trusted boundaries; the renderer is sandboxed
  and communicates through typed, schema-validated IPC.
- **Human-reviewed AI writes:** MCP staged writes are the default safety mode.
- **Progressive disclosure:** Core notes/search/editing remain prominent; maps, boards, dice, and
  combat are intermediate; MCP staged review, object notes, encounter builder, graph, timeline,
  handouts, random tables, theme presets, custom templates, and inline dice are advanced.
- **Traceable planning:** Initiatives decompose into epics, stories, tasks, and atomics; durable work
  should remain traceable to higher-level product outcomes.

## Development Phase Map

| Phase | Status | What Shipped / Scope |
| --- | --- | --- |
| Phase 0 | Complete | SvelteKit scaffolding and project tooling setup. |
| Phase 1 | Complete | Core note MVP: CRUD, markdown, editor, navigation, and MCP server. |
| Phase 2 | Complete | Linking and knowledge graph: wikilinks, backlinks, and tags. |
| Phase 3 | Complete | Search and discovery: full-text search, quick switcher, and graph view. |
| Phase 4 | In Progress | Polish and advanced features: import/export, templates, accessibility audit, and related quality work. |
| Phase 5 | Future / Deferred | Cloud and sharing. Deferred behind stability gates and cloud infrastructure readiness. |
| Phase 6 | Future / Partially Delivered Elsewhere | D&D-specific tools. Many session/map/board tools shipped through later initiatives, but player character and atmosphere/audio suites remain future work. |

## Initiative Map

| Initiative | Status | Summary |
| --- | --- | --- |
| I1 - Platform Foundation & Trust | Complete | Atomic writes, schema migrations, vault integrity verification, IPC hardening, and diagnostic telemetry shipped. |
| I2 - Engineering Excellence | In Progress | CI/CD, test pyramid, and ADRs shipped; developer tooling audit, performance budgets, and CI/CD audit backlog remain incomplete or partly outdated. |
| I3 - Core Knowledge Architecture | Complete | Link graph, object system, advanced search, templates, import/export, graph intelligence, and world calendar shipped. |
| I4 - Session-Time Command Center | Complete | Session boards, combat tracker, quick reference, dice engine, timeline, player mode, random generation, handouts, and encounter builder shipped. |
| I5 - AI Creative Partnership | Complete | MCP semantic bundling, vault intelligence, staged change oversight, content generation workflows, and local AI integration shipped. |
| I6 - Multi-Platform Distribution | Complete | Desktop shell, Android build, offline sync, accessibility compliance, and PWA/browser support shipped; cloud sync moved to I7. |
| I7 - Collaborative Infrastructure | Deferred | Cloud backend, real-time sync, P2P, player sessions, async sharing, and multi-device sync deferred until cloud environment exists. |
| I8 - Extensibility & Ecosystem | Not Started | Plugin architecture, campaign system modules, custom objects, compendium integration, design system extensions, developer API, and i18n planned. |
| I9 - Maps & Spatial Intelligence | Complete | Map library UX, viewer mode, POIs, editing ergonomics, fog, routes, layers, and canvas accessibility/mobile shipped. |
| I10 - Player Character Suite | Not Started | D&D 5e character management, spell/resource tracking, advancement, party coordination, and player journal planned. |
| I11 - Atmosphere, Audio & Immersive Scene Management | Not Started | Ambient audio engine, scene cards, presets, and automation triggers planned. |
| I12 - Community & Content Ecosystem | Deferred | Campaign modules, community directory, creator tooling, and public wiki deferred behind cloud infrastructure. |
| I13 - Information Architecture & Navigation System | Complete | IA audit, global nav reconstruction, local nav panels, breadcrumbs/backlinks/deep links, and command palette shipped. |
| I14 - Adaptive Cross-Platform Shell | Complete | Layout tokens, compact/medium/expanded tiers, Electron titlebar/context menu/app menu/filesystem watch refinements, and tablet shell shipped. |
| I15 - Design System & Visual Language | Complete | Design tokens, Lucide icon system, core components, TTRPG visual language, theme presets, stat blocks, dice drama, and density/readability controls shipped. |
| I16 - Session-Time UX Reimagined | Complete | Session mode state machine, dice integration, combat persistence, session board mission-control redesign, and prep/recap workflow shipped. |
| I17 - Learnability, Progressive Disclosure & Help Systems | Complete | Empty states, progressive disclosure, contextual help, spotlights, shortcut overlay, first-run onboarding, setup wizard, and What's New shipped. |
| I18 - Accessibility & Inclusive Design | Complete | Semantic landmarks, focus management, sensory/motion accessibility, pointer accessibility, and automated accessibility testing pipeline shipped. |
| I19 - Map Tool UX | Complete | Map library UX, mode state machine, POI creation/preview/linking, undo, fog, routes, layers, and mobile/canvas accessibility shipped. |
| I20 - Board Tool UX | Complete | Tile visual identity, board interaction model, tile creation flow, board empty states/progressive disclosure, and note tile virtualization shipped. |
| I21 - Codebase Realignment & Quality Audit | In Progress | Phase A complete; Epics 21.4, 21.5, and 21.6 shipped. Remaining work is file decomposition and bundle optimization in Epics 21.7-21.8. |

## Feature Tier Snapshot

| Tier | Visibility Rule | Features |
| --- | --- | --- |
| Core | Always visible from first use. | Create note, browse notes, search notes, basic templates, dark/light mode, read notes, edit notes, follow wikilinks. |
| Intermediate | Revealed after maturity signals or first feature encounter. | Tags, folder organization, pinning, saved searches, maps, session boards, dice, basic combat tracking, world calendar. |
| Advanced | Opt-in via Settings > Features or contextual enable prompt. | MCP staged review, object notes/stat blocks, encounter builder, knowledge graph, timeline, handout delivery, custom templates, theme presets, random tables, inline dice rolls. |

## Planning Model

DND Tools uses a five-tier planning hierarchy:

| Tier | Unit | Purpose |
| --- | --- | --- |
| 1 | Initiative | Multi-month strategic product direction or major capability. |
| 2 | Epic | Coherent feature domain that is usable, tested, and documented when complete. |
| 3 | Story | One reviewable, demonstrable unit of work, normally one PR. |
| 4 | Task | Focused implementation step within a story. |
| 5 | Atomic | Minute-scale action tracked only during an active work session. |

Durable planning artifacts should live at tiers 1-4. Atomics are intentionally ephemeral and should
not be promoted into persistent roadmap documents.
