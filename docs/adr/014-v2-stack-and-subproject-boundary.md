# ADR-014: V2 Stack and Subproject Boundary

- Status: Superseded by [ADR-016](./016-promote-gm-app-and-monorepo-reorg.md)
- Date: 2026-06-03
- Deciders: Engineering
- Consulted: Product, Design, Security
- Supersedes: N/A
- Superseded-by: ADR-016 (2026-06-09) — the `apps/v2` quarantine, `v2-` package naming, and
  v1-runtime import ban are retired now that the GM app is primary and v1 is removed. The stack,
  processing/display boundary, storage, and testing decisions below remain in force.
- Superseded-by: ADR-018 (2026-07-08) — the React-rejecting rationale in this ADR's
  rejected-alternatives table is reversed; React is now the primary GUI stack.
- Amended by: ADR-019 (2026-07-09) — the "large assets / map storage deferred until justified"
  storage deferral and the `content.write-to-source` transport deferral are lifted; asset bytes
  now live in a content-addressed Dexie blob table behind the platform boundary. The storage
  boundary itself (Dexie/IndexedDB, no binary in core state or the op log) remains in force.

## Context

DND Tools 0.2.0 is a remake with a Scene-first command platform, future cloud collaboration,
strict processing/display decoupling, local-first operation, platform profiles, and
data-layer visibility and permission enforcement.

The v2 implementation must live in a clean subproject at `apps/v2` while the current v1
application remains stable. Autonomous implementation agents consume generated v2 workpacks, so
the first runtime scaffold needs concrete stack, package, storage, testing, and import-boundary
decisions before any agent creates `apps/v2`.

Existing repo evidence favors preserving the proven development toolchain where it supports the v2
architecture:

- v1 already uses SvelteKit 2, Svelte 5, Vite, TypeScript strict mode, Vitest, Playwright, pnpm,
  and lint-enforced runtime boundaries.
- ADR-006 proves the current web renderer stack can support Electron, Android/Capacitor, and PWA
  shells when platform services stay behind typed adapters.
- ADR-009 and v2 performance requirements require measurable budgets and browser automation from
  the start.
- ADR-010 and the v2 architecture contracts require local-first operations and conflict-shaped
  state, but the first prototype does not need cloud transport or a CRDT implementation.

## Research and Evaluation

### Research Sources

The decision was re-evaluated against project requirements and current official/reference
documentation:

- SvelteKit project types, static generation, SPA, offline/PWA, mobile, and desktop app guidance:
  `https://svelte.dev/docs/kit/project-types`,
  `https://svelte.dev/docs/kit/adapter-static`, and
  `https://svelte.dev/docs/kit/single-page-apps`
- Svelte 5 runes/state model: `https://svelte.dev/docs/svelte/what-are-runes`
- pnpm workspace and filtering mechanics: `https://pnpm.io/workspaces` and
  `https://pnpm.io/filtering`
- IndexedDB browser storage contract: `https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API`
- Dexie IndexedDB wrapper: `https://dexie.org/docs/Dexie/Dexie`
- OPFS/browser filesystem tradeoffs:
  `https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system`
- Vitest and Playwright testing model: `https://vitest.dev/guide/why.html` and
  `https://playwright.dev/docs/test-projects`

### Evaluation Criteria

Candidate choices were scored against these constraints:

1. Satisfies the hard processing/display boundary without relying on GUI hiding.
2. Supports local-first browser/PWA prototype persistence and restart verification.
3. Keeps the first `CANVAS-scene-state` slice small enough for agent implementation.
4. Preserves future Electron, Capacitor, cloud, source-adapter, and collaboration seams.
5. Matches existing repo standards and minimizes new operational surface.
6. Gives agents concrete scripts, package ownership, and import rules.

### Evaluated Options

| Decision Area         | Options Considered                                                                          | Evaluation                                                                                                                                                                                                                                                                                                                                                                          | Final Choice                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Frontend/runtime      | SvelteKit/Svelte 5, React + Vite, Next.js, SolidStart, Vue/Nuxt                             | SvelteKit best matches the repo's existing Svelte 5/Vite/Playwright/PWA stack and supports static, SPA, offline, mobile, and desktop app shapes. React + Vite is viable but creates a full UI rewrite with no repo benefit. Next.js/Nuxt add server-oriented concepts that the first browser-local prototype does not need. SolidStart would add unfamiliar tooling.                | SvelteKit 2 + Svelte 5 + Vite, client/static for the first prototype.                                   |
| Core boundary         | App-local `src/lib/core`, v2 package-local core, repo-level shared package                  | App-local is easiest but weakens the required processing/display decoupling. Repo-level package creates broad monorepo churn and invites premature sharing. Package-local under `apps/v2` gives a hard import boundary while keeping v2 contained.                                                                                                                                  | `apps/v2/packages/core` as `@dndtools/v2-core`.                                                         |
| Workspace layout      | Single app package, repo-level `packages/`, isolated v2 workspace area                      | Single package makes GUI/core separation harder to enforce. Repo-level packages are appropriate only after shared ownership is proven. pnpm workspaces officially require a root `pnpm-workspace.yaml`, support local package linking, and support filtered scripts for agent commands.                                                                                             | Root workspace includes `apps/v2/app` and `apps/v2/packages/*`; app depends on core with `workspace:*`. |
| Prototype persistence | In-memory, `localStorage`, raw IndexedDB, Dexie over IndexedDB, OPFS, SQLite/WASM over OPFS | In-memory and `localStorage` fail durable structured-state requirements. Raw IndexedDB is valid but verbose and easier for agents to misuse. Dexie keeps IndexedDB's browser-standard storage with simpler typed code. OPFS and SQLite/WASM are stronger for large file or relational workloads but add worker, quota, and binary/runtime complexity not needed for Scene metadata. | Dexie 4 over IndexedDB behind app-owned storage adapter ports.                                          |
| Sync/collaboration    | Implement CRDT/provider now, operation-shaped local log only, skip sync shape               | Full CRDT/provider choice is premature and vendor-sensitive. Skipping sync shape violates `SYNC-002` and later collaboration seams. Local operation-shaped records prove command/revision/idempotency boundaries without cloud transport.                                                                                                                                           | Single-device local operation log; defer CRDT/cloud/provider choices.                                   |
| Testing               | Vitest only, Playwright only, Vitest + Playwright, Cypress                                  | Vitest aligns with Vite and fast reducer/storage/unit tests. Playwright supports multi-project browser/device coverage and is already in repo standards. Cypress would add a second browser automation stack.                                                                                                                                                                       | Vitest for unit/contract/component tests; Playwright for browser automation.                            |

### Evaluation Result

The current ADR direction remains the best fit. The re-evaluation changes only the precision of the
decision:

- The first v2 app is explicitly a client/static SvelteKit app with no server-owned state or
  server-only route modules.
- The pnpm workspace file and `workspace:*` dependency from app to core are explicit scaffold
  requirements.
- Dexie over IndexedDB remains the first persistence implementation; OPFS and SQLite/WASM are
  deferred until large assets, map storage, or relational query pressure justify them.
- Future sync/collaboration remains operation-shaped but provider-agnostic.

## Decision

### Frontend and Runtime Framework

Use SvelteKit 2, Svelte 5, Vite, and TypeScript strict mode for the v2 app package.

The first v2 GUI is browser/PWA-first and runs the processing core in the browser through typed
interfaces. Electron, Capacitor, native desktop packaging, Android packaging, and MCP sidecar
integration are not part of the first prototype.

The first v2 app build uses `@sveltejs/adapter-static` in client/static mode. It may use a SPA
fallback for app routes that cannot be fully prerendered, but it must prerender stable shell or
landing routes where practical. Do not add `+page.server.ts`, `+layout.server.ts`, `+server.ts`,
remote functions, server actions, or server-owned state for the first prototype. Any server runtime
or cloud-hosted backend assumption requires a later ADR or an accepted implementation epic that
explicitly changes this boundary.

SvelteKit is accepted for v2 because it preserves the repo's existing strict TypeScript, Svelte 5,
Vite, Vitest, Playwright, PWA, accessibility, and design-system knowledge without carrying v1
runtime modules into the remake. This ADR does not require v2 to reuse v1 route, component, state,
storage, Electron, or MCP code.

Use Svelte/SvelteKit for the app shell, route surfaces, platform-profile-aware GUI, widget host UI,
and visible Scene prototype. Use normal HTML/Svelte/CSS layout for the first Scene prototype. Do
not introduce a dedicated canvas, WebGL, Pixi, Konva, Fabric, Three.js, or map-rendering engine for
the first `CANVAS-scene-state` slice unless a later ADR or approved spike requires it.

### Package and Workspace Layout

Keep pnpm as the package manager.

Create v2 as an isolated pnpm workspace area under `apps/v2`. The scaffold must use this shape:

```text
apps/v2/
  README.md
  app/
    package.json              # @dndtools/v2-app, SvelteKit application
    src/
      lib/gui/                # Svelte components and view-specific helpers
      lib/platform/           # browser-local platform service adapters
      routes/                 # SvelteKit routes
  packages/
    core/
      package.json            # @dndtools/v2-core
      src/
        commands/
        state/
        queries/
        permissions/
        sync/
        schemas/
        testing/
```

The initial scaffold may add only the minimum workspace files needed to make pnpm discover these
packages. The root workspace must include `apps/v2/app` and `apps/v2/packages/*`, because pnpm
requires a root `pnpm-workspace.yaml` for workspace projects. `@dndtools/v2-app` must depend on
`@dndtools/v2-core` through `workspace:*` so installation fails if the core package is missing
rather than silently resolving an external package. Root scripts may delegate to v2 packages with
pnpm filters. The v1 app remains in its current root-level locations and must not be moved as part
of v2 scaffolding.

Avoid extra v2 packages until a real boundary appears. In particular, do not create public SDK,
cloud, sync-provider, widget-marketplace, Electron, Capacitor, or MCP packages during the first
prototype.

### Processing Core Boundary

The v2 processing core is package-local, not app-local.

`@dndtools/v2-core` owns:

- command schemas, command validation, deterministic reducers, and command result types
- `VaultState`, `SceneState`, `SessionState`, `MapState`, `PermissionState`, and `SyncState`
  state document types needed by implemented slices
- permission and visibility evaluation
- actor-filtered query and view-model assembly
- widget binding contracts and command descriptors
- operation log types, idempotency rules, revision rules, and conflict-shaped records
- deterministic dice/random, graph/search, map-model, and session algorithms when those slices
  are implemented
- memory test adapters and fixture builders that do not depend on browser, DOM, Svelte, Node,
  Electron, Capacitor, MCP, or cloud APIs

`@dndtools/v2-core` must not import:

- Svelte, SvelteKit, browser DOM APIs, route modules, or GUI components
- Electron, Capacitor, Node filesystem APIs, MCP runtime modules, or cloud SDKs
- v1 runtime modules from `src/`, `electron/`, or `mcp/`

The SvelteKit app owns GUI rendering, local UI state, platform profile detection, browser-local
platform services, IndexedDB adapter implementation, command dispatch wiring, accessibility
announcements, and browser automation entry points. The app may dispatch core commands and render
core query results. It may not directly mutate durable Scene, widget, permission, session, map, or
vault state.

### Storage Model for the First Prototype

The first prototype uses local prototype persistence only.

Implement browser-local IndexedDB persistence in `@dndtools/v2-app` through a typed storage adapter
that satisfies core-defined ports. Use Dexie 4 for the initial IndexedDB adapter unless the
scaffolding agent records a narrower reason to use native IndexedDB. The core package defines the
state-store and operation-log interfaces; the app package implements browser storage.

Do not use OPFS, SQLite/WASM, raw local files, or browser File System Access API for the first
Scene-state prototype. Those options remain valid future candidates for large assets, map layer
storage, filesystem-backed vaults, or query-heavy workloads, but they add unnecessary complexity
before Scene state, command validation, and adapter contracts are proven.

For the first `CANVAS-scene-state` slice, durable local storage must include:

- versioned `SceneState` documents
- any minimal `PermissionState` and actor metadata needed to prove DM-only behavior
- a local durable operation log for accepted commands
- schema version metadata and safe defaults for missing prototype records

The first prototype does not write local markdown files, Obsidian vaults, Google Docs, cloud
storage, Electron filesystem storage, Capacitor filesystem storage, or MCP-managed vault data.
Those adapters are represented by contracts or future package boundaries only.

### Sync and Collaboration Stance for the First Prototype

The first prototype is single-device and local-first.

It must preserve the architecture shape for future sync and collaboration by recording accepted
durable mutations as local operations with actor, target, revision/idempotency, and dependency
metadata where the implemented command requires it. It must not implement cloud sync, remote
collaboration, participant replication streams, CRDT documents, websocket presence, invitation
flows, cache sealing, or external source adapters.

Remote collaboration, cloud sync, Obsidian sync, Google Docs sync, presence, and player-device
cache privacy are blocked until later ADRs or accepted implementation epics select their concrete
storage, transport, security, and conflict strategies. Prototype UI may show these capabilities as
unavailable or degraded only when an approved slice requires visible status.

### Test Runner and Browser Automation Strategy

Use Vitest for v2 core unit tests, reducer tests, permission/visibility tests, storage adapter
contract tests, and Svelte component tests. Use jsdom for browser-like unit tests unless a specific
test can run in a pure TypeScript environment.

Use Playwright for v2 browser automation. The first Playwright coverage must run against the
SvelteKit v2 app and include at least:

- a desktop Chromium project
- a mobile or compact-viewport Chromium project for platform-profile behavior
- visible Scene creation/reload behavior for the first slice
- accessibility checks for any user-visible Scene workflow where the repo's existing axe policy is
  practical to reuse

Do not require Electron or Android automation for the first v2 prototype. Native shell automation
is deferred until native shells enter v2 scope.

### Build and Dev Command Expectations

The v2 scaffold must add root-level scripts that are stable enough for agents and CI to call:

- `pnpm v2:dev` starts the SvelteKit v2 app dev server.
- `pnpm v2:build` builds `@dndtools/v2-core` and `@dndtools/v2-app`.
- `pnpm v2:typecheck` typechecks v2 packages.
- `pnpm v2:lint` runs v2 lint and boundary checks.
- `pnpm v2:test` runs v2 Vitest coverage relevant to implemented packages.
- `pnpm v2:e2e` runs v2 Playwright browser automation.
- `pnpm v2:check` runs workpack validation plus v2 lint, typecheck, unit tests, and the required
  browser checks for implemented v2 surfaces.

Existing workpack scripts remain planning commands:

- `pnpm v2:workpack:generate`
- `pnpm v2:workpack:validate`
- `pnpm v2:workpack:status`
- `pnpm v2:prompt`

Scaffolding may add package-local scripts inside `apps/v2/app/package.json` and
`apps/v2/packages/core/package.json`, but root scripts are the public agent contract.

### V1 Runtime Import Boundary

v2 must not import v1 runtime code during the initial implementation phase.

Disallowed imports include runtime modules from:

- `src/`
- `electron/`
- `mcp/`
- v1 Svelte routes, components, stores, state modules, domain modules, platform adapters, markdown
  pipeline modules, Electron IPC modules, MCP tools, and MCP storage modules

This ban includes type-only imports from v1 runtime paths. If a future slice needs a shared runtime
library, it requires a separate extraction decision that creates a clean package with tests and
defines ownership for both v1 and v2.

### Allowed V1 Reuse

v2 may reuse:

- product docs, v2 requirements, generated workpacks, prompts, glossary terms, and ADR lessons
- coding standards, documentation standards, test philosophy, accessibility standards, performance
  budget philosophy, and security principles
- package-manager choice, dependency versions, lint concepts, Prettier style, Vitest/Playwright
  approach, and design-token principles
- architecture lessons from v1 storage adapters, Electron isolation, MCP staged writes, markdown
  safety, sync queue behavior, navigation contracts, and performance telemetry

v2 may inspect v1 code as evidence. It may not import it, and it may not copy large runtime modules
without rewriting the contract in v2 terms and adding v2-owned tests.

### Decisions Blocked Until Later ADRs

The following remain intentionally undecided for v2 runtime implementation:

- final cloud vendor confirmation or replacement for v2, including how ADR-007 applies to v2
- cloud encryption, key custody, rotation, recovery, and participant cache sealing
- CRDT, operation-log service, websocket, or realtime collaboration provider
- Obsidian and Google Docs source adapter implementation details
- Electron and Capacitor v2 shell implementation details
- MCP sidecar integration and v2 MCP tool surface
- custom widget sandbox/runtime, host-permission implementation, and public extension policy
- map rendering engine, WebGL/canvas strategy, large-asset pipeline, and map performance budgets
- v1 data migration/import strategy
- extraction of any shared runtime package from v1

## Acceptance Criteria for Unblocking `apps/v2`

`apps/v2` runtime scaffolding is unblocked when an implementation agent can satisfy all of these
criteria without asking another architecture question:

1. ADR-014 is Accepted.
2. The scaffold creates only the v2 workspace area under `apps/v2` plus the minimal root workspace
   and script changes required to run v2 commands.
3. `@dndtools/v2-core` exists as a package-local processing core with no Svelte, DOM, platform,
   cloud, MCP, Electron, Capacitor, or v1 runtime imports.
4. `@dndtools/v2-app` exists as the SvelteKit/Svelte 5 app and imports the core package only
   through public core APIs.
5. Local prototype persistence is implemented through a browser IndexedDB adapter in the app
   package, behind core-defined ports.
6. Durable mutations in the first slice enter through core commands and append local operation-log
   records where required by the implemented command contract.
7. Root v2 scripts exist for dev, build, typecheck, lint, test, e2e, and check.
8. Boundary lint or focused tests fail if v2 imports v1 runtime paths.
9. The first scaffold does not implement cloud sync, remote collaboration, native shells, MCP
   runtime, or v1 migration code.
10. `pnpm v2:workpack:validate` passes after scaffolding.

## Consequences

### Positive

- Agents can scaffold `apps/v2` without guessing the framework, workspace shape, core location,
  storage mode, sync stance, or test strategy.
- The processing/display boundary is enforceable from the first runtime slice.
- v2 can reuse the repo's strongest toolchain and standards while avoiding v1 runtime coupling.
- The first prototype proves Scene state and command-driven mutation before cloud and native
  runtime complexity enters the project.
- Later cloud, collaboration, MCP, native shell, and widget sandbox decisions have clear seams to
  attach to.

### Negative

- A package-local core adds workspace and build-script overhead before the first visible feature.
- Browser IndexedDB persistence is only a prototype storage backend and will need adapter expansion
  before desktop filesystem, mobile filesystem, or external source support.
- SvelteKit preserves frontend continuity but does not by itself prove map/canvas rendering,
  custom widget sandboxing, or realtime collaboration viability.
- Deferring CRDT/cloud/native decisions means early code must keep contracts honest without being
  able to integration-test remote behavior yet.

## Rejected Alternatives

| Alternative                                                                             | Why Rejected                                                                                                                                                                 |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build v2 in-place inside the current v1 app                                             | Violates the clean `apps/v2` subproject requirement and risks destabilizing v1.                                                                                              |
| Start `apps/v2` immediately from the placeholder ADR                                    | Leaves agents guessing foundational stack, package, storage, and test decisions.                                                                                             |
| Switch to React, Next.js, Solid, Vue, or another frontend stack for the first prototype | No repo evidence shows that a toolchain fork would better satisfy the v2 requirements, and it would discard existing Svelte 5, Vite, test, accessibility, and PWA standards. |
| Use Next.js App Router for v2                                                           | Strong framework, but its server/client component model and server-function surface add unnecessary server-runtime concepts to the browser-local first prototype.            |
| Put the processing core under `apps/v2/app/src/lib/core`                                | Easier initial scaffold, but weaker enforcement of the hard processing/display decoupling contract.                                                                          |
| Put v2 core packages at repo-level `packages/`                                          | Creates broader monorepo churn and makes the v2 experiment less contained than the selected `apps/v2` subproject.                                                            |
| Import v1 runtime modules into v2                                                       | Couples the remake to v1 architecture and can reintroduce v1 boundaries, defects, and oversized modules into the first slice.                                                |
| Implement Electron/Capacitor shells before the browser prototype                        | Adds native runtime complexity before the core command, storage, and Scene contracts are proven.                                                                             |
| Choose a cloud backend, CRDT, websocket, or collaboration vendor now                    | The first prototype only needs local operation-shaped persistence; premature vendor choice would exceed the ADR scope.                                                       |
| Use in-memory-only persistence for the first Scene slice                                | Fails `CANVAS-001` restart persistence and the local-first prototype requirement.                                                                                            |
| Use OPFS or SQLite/WASM for first persistence                                           | Better candidates for large file, map, or relational workloads, but too much runtime/storage complexity before the Scene-state command and adapter contracts are proven.     |
| Use `localStorage` for first persistence                                                | Too small and weakly structured for versioned Scene documents, operation logs, adapter contracts, and future sync-shaped records.                                            |

## Migration/Implementation Impact

The next implementation epic may create `apps/v2` and minimal root workspace/script changes. It
must not move v1 files or change v1 runtime behavior.

Expected scaffold impact:

- Add pnpm workspace discovery for `apps/v2/app` and `apps/v2/packages/*`.
- Add the root v2 command scripts listed in this ADR.
- Add SvelteKit/Svelte 5 app config for `@dndtools/v2-app`.
- Add TypeScript strict config for v2 packages, preserving `noUncheckedIndexedAccess`,
  `noImplicitReturns`, and `noFallthroughCasesInSwitch`.
- Add `@dndtools/v2-core` with public API entry points and import-boundary tests before feature
  code grows.
- Add focused lint/test rules that prevent v2 imports from v1 runtime paths and prevent core
  imports from GUI/platform/runtime paths.
- Implement only the local storage adapter needed for the selected first slice.
- Keep generated workpacks as the implementation control plane. Do not hand-edit generated epics
  except through the documented workpack workflow.

This ADR changes the v2 runtime plan only. It does not migrate existing v1 data, alter v1 routes,
alter Electron/Capacitor behavior, or create cloud infrastructure.

## Rollback Plan

If the selected stack or package boundary proves unworkable during the first prototype:

1. Stop approving new v2 runtime epics.
2. Preserve v1 and planning docs; do not delete generated requirements or workpacks.
3. Remove or archive only the `apps/v2` scaffold and root v2 scripts introduced after this ADR.
4. Keep any reusable tests or findings as evidence for an ADR-014 revision.
5. Reopen ADR-014 with a replacement stack or boundary before resuming runtime work.

Rollback has no user-data migration impact because the first prototype uses local v2-only
IndexedDB records and does not write v1 vaults, cloud storage, or native filesystem vaults.

## Verification and Evidence

Evidence reviewed for this decision:

- `CLAUDE.md`
- `docs/development/V2_AGENTIC_IMPLEMENTATION.md`
- The `docs/remake-review/` vision/architecture/requirements artifacts _(since pruned from
  the tree; retained in git history. The current requirements live in `docs/requirements/`.)_
- `docs/adr/006-multi-platform-approach-electron-capacitor.md`
- `docs/adr/007-cloud-backend-architecture-aws.md`
- `docs/adr/009-performance-budget-registry-and-telemetry.md`
- `docs/adr/010-offline-sync-queue-and-conflict-resolution.md`
- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- `eslint.config.js`
- SvelteKit docs: `https://svelte.dev/docs/kit/project-types`,
  `https://svelte.dev/docs/kit/adapter-static`,
  `https://svelte.dev/docs/kit/single-page-apps`
- Svelte 5 docs: `https://svelte.dev/docs/svelte/what-are-runes`
- pnpm docs: `https://pnpm.io/workspaces`, `https://pnpm.io/filtering`
- MDN IndexedDB docs: `https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API`
- Dexie docs: `https://dexie.org/docs/Dexie/Dexie`
- MDN OPFS docs:
  `https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system`
- Vitest docs: `https://vitest.dev/guide/why.html`
- Playwright docs: `https://playwright.dev/docs/test-projects`

Validation required for this ADR change:

- `pnpm v2:workpack:validate`
- a formatting or docs validation command relevant to Markdown changes, when available
