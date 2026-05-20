# Architecture & Boundaries

This document synthesizes the current architecture, boundary rules, IPC surface, ADRs, security
model, navigation contract, layout system, and documented boundary violations needed to remake
DND Tools from scratch.

## Runtime Model

```text
                    user-owned vault directory
          notes / objects / boards / settings / .vault metadata
                         ^                    ^
                         | trusted fs I/O     | trusted fs I/O
                         |                    |
+------------------------+----+     +---------+------------------+
| Electron main process       |     | MCP sidecar process        |
| Node trusted runtime        |     | Node trusted runtime       |
|                             |     |                            |
| - BrowserWindow lifecycle   |     | - stdio MCP server         |
| - vault selection/history   |     | - tools/resources          |
| - FileSystemAdapter         |     | - staged write adapter     |
| - IPC validation            |     | - vault intelligence       |
| - updates/diagnostics       |     | - safe-write journal       |
| - file watcher              |     +----------------------------+
| - MCP sidecar lifecycle     |
+-------------+---------------+
              |
              | contextBridge: window.dndtoolsDesktop
              | explicit named methods only
              v
+-------------+---------------+
| Renderer / SvelteKit app    |
| sandboxed, no Node APIs     |
|                             |
| - routes and UI             |
| - runtime bootstrap         |
| - StorageAdapter contract   |
| - sync-aware storage wrapper|
| - search/link graph/worker  |
| - markdown rendering        |
+-----------------------------+
```

Non-desktop runtimes preserve the renderer/domain model but swap the shell and storage backend:

| Runtime | Shell | Storage path | Intentional degradations |
| --- | --- | --- | --- |
| Desktop | Electron main + preload + renderer | `ElectronStorageAdapter` -> preload bridge -> IPC -> `FileSystemAdapter` | Full desktop features: vault chooser, file watcher, auto-update, MCP sidecar, diagnostics export. |
| Android | Capacitor native shell + same renderer | `CapacitorStorageAdapter` -> Capacitor Filesystem | No MCP sidecar, desktop controls, auto-update, or desktop diagnostics. |
| Browser/PWA | SvelteKit app + service worker | `IndexedDbStorageAdapter` -> Dexie/IndexedDB | No filesystem vault chooser, no MCP sidecar, no Electron update flow. Uses import/export and service worker refresh. |

Bootstrap is centralized in `src/lib/runtime/bootstrap.ts`. It is guarded by one in-flight
promise, checks desktop schema migration readiness before storage initialization, initializes the
runtime storage adapter, loads persisted UI/editor/onboarding/player/feature settings, loads all
notes, then builds search, saved searches, MCP changes, and session boards in parallel. Desktop
integrity warnings are surfaced after startup.

## Hard Boundary Rules

| Boundary | Rule | Rationale |
| --- | --- | --- |
| Renderer -> filesystem | Renderer must never import Node/Electron modules or access the filesystem directly. All storage goes through `StorageAdapter`. | Keeps compromised renderer code away from host filesystem capabilities. |
| Preload bridge | Preload exposes one typed `window.dndtoolsDesktop` object with named methods. It must not expose raw `ipcRenderer` or a generic `invoke(channel, args)` escape hatch. | Preserves least privilege and makes IPC audit possible. |
| IPC handlers | IPC payloads must be runtime-validated with Zod schemas in `electron/ipc-schemas.ts` before business logic. | TypeScript types do not protect runtime IPC inputs. Validation blocks path traversal, type confusion, key injection, and oversized payloads. |
| Storage | Renderer features depend on `src/lib/types/storage.ts`; concrete adapters live under `src/lib/platform/storage/`. New persisted concepts must be added to the adapter contract and all concrete adapters. | Prevents feature code from coupling to desktop-only implementation details. |
| MCP writes | MCP write tools are staged by default through `StagedMcpAdapter`; direct writes require explicit `--direct` or `DNDTOOLS_MCP_STAGED=0`. | AI-assisted mutations require human review unless the user explicitly opts into trusted behavior. |
| MCP tools | Tool handlers should access vault data through `FileSystemAdapter`, with one tool per file under domain folders. | Keeps tool behavior testable and centralizes path/integrity controls. |
| Markdown rendering | All rendered markdown goes through the shared sanitized pipeline. Raw HTML rendering and per-component parsers are disallowed. | Consistent rendering and XSS containment. |
| Navigation | Every navigation element is classified as global, local, or contextual. Global navigation switches sections only; local navigation is section-scoped; contextual links stay content-adjacent. | Prevents duplicate route surfaces and keeps screen-reader landmarks clear. |
| Layout | Shell structure derives from `layoutState` tiers only. Components must not add their own structural breakpoints or read `window.innerWidth` for shell layout. | Keeps compact/medium/expanded behavior coherent across the app. |
| Design tokens | Components use semantic CSS tokens; raw palette tokens and structural `dark:` utilities are banned except limited status-color cases. | Allows theme presets and high-contrast modes without per-component dark-mode branches. |
| ADR governance | Major runtime, storage, security, or platform decisions require an ADR update and ADR index update in the same change set. | Keeps remake-critical architecture decisions explicit and reviewable. |

## IPC Channel Inventory

Direction key:

- `Renderer -> Main`: preload method invokes an `ipcMain.handle` channel.
- `Main -> Renderer`: main process sends an event that preload exposes as a subscription method.

Validation key:

- `Zod`: handler validates payloads with `parseIpcArg(...)`.
- `No payload`: channel takes no renderer payload.
- `Partial/gap`: documented validation gap.
- `Main event`: event payload is produced by trusted main process; no renderer input.

| Area | Channel names | Direction | Validation status |
| --- | --- | --- | --- |
| Notes | `dndtools:storage:get-note`, `dndtools:storage:get-all-notes`, `dndtools:storage:save-note`, `dndtools:storage:delete-note`, `dndtools:storage:restore-note`, `dndtools:storage:get-notes-by-folder`, `dndtools:storage:get-notes-by-tag`, `dndtools:storage:get-recent-notes`, `dndtools:storage:get-deleted-notes`, `dndtools:storage:resolve-title`, `dndtools:storage:import-notes`, `dndtools:storage:export-all-notes`, `dndtools:storage:get-note-count`, `dndtools:storage:get-tag-counts`, `dndtools:storage:refresh-from-disk` | Renderer -> Main | `Zod` for payload channels; `No payload` for deleted/export/count/refresh. |
| Links and suggestions | `dndtools:storage:get-links-from`, `dndtools:storage:get-links-to`, `dndtools:storage:set-links-from`, `dndtools:storage:get-all-links`, `dndtools:storage:suggest-related-notes` | Renderer -> Main | `Zod` for payload channels; `No payload` for `get-all-links`. |
| Session boards and session state | `dndtools:storage:get-session-boards`, `dndtools:storage:get-session-board`, `dndtools:storage:save-session-board`, `dndtools:storage:delete-session-board`, `dndtools:storage:get-session-state`, `dndtools:storage:save-session-state` | Renderer -> Main | `Zod` for ID/board/state payloads; `No payload` for collection/state reads. |
| Objects | `dndtools:storage:get-object`, `dndtools:storage:get-all-objects`, `dndtools:storage:save-object`, `dndtools:storage:delete-object`, `dndtools:storage:get-object-relationship-graph`, `dndtools:storage:lint-objects`, `dndtools:storage:get-object-history`, `dndtools:storage:revert-object-history` | Renderer -> Main | `Zod` for ID/options/object payloads; `No payload` for relationship graph and lint reads. |
| Settings/templates/snapshots | `dndtools:storage:get-setting`, `dndtools:storage:set-setting`, `dndtools:storage:get-note-templates`, `dndtools:storage:get-reusable-snippets`, `dndtools:storage:create-safety-snapshot`, `dndtools:storage:list-safety-snapshots`, `dndtools:storage:restore-deleted-from-snapshot` | Renderer -> Main | `Zod` for setting keys/values and snapshot IDs/reasons; `No payload` for template/snippet/snapshot lists. |
| Import/export | `dndtools:import-export:pick-source`, `dndtools:import-export:analyze-source`, `dndtools:import-export:start-job`, `dndtools:import-export:get-job`, `dndtools:import-export:get-checkpoint`, `dndtools:import-export:resume-checkpoint`, `dndtools:import-export:clear-checkpoint`, `dndtools:import-export:export-zip` | Renderer -> Main | `Zod` for analyze/start/get/export payloads; `No payload` for picker/checkpoint resume/clear reads. |
| Maps/assets | `dndtools:maps:import-from-dialog`, `dndtools:maps:resolve-asset-url` | Renderer -> Main | `Zod` for asset path resolution; `No payload` for dialog import. |
| Vault integrity and migrations | `dndtools:storage:get-integrity-report`, `dndtools:storage:repair-integrity`, `dndtools:storage:rebuild-index`, `dndtools:storage:clear-changelog`, `dndtools:schema:get-migration-report`, `dndtools:schema:run-migrations`, `dndtools:schema:list-checkpoints`, `dndtools:schema:restore-checkpoint` | Renderer -> Main | `Zod` for migration run/restore; `No payload` for reports/repair/rebuild/list; `Partial/gap` for `clear-changelog` because it accepts raw options without `parseIpcArg()`. |
| Platform/meta | `dndtools:backend-info`, `dndtools:pick-vault`, `dndtools:vault:recent`, `dndtools:vault:permissions`, `dndtools:vault:switch` | Renderer -> Main | `Zod` for recent/permissions/switch payloads; `No payload` for backend info and picker. |
| Updates | `dndtools:update:get-status`, `dndtools:update:check`, `dndtools:update:download`, `dndtools:update:install`, `dndtools:update:remind-later` | Renderer -> Main | `Zod` for remind-later hours; `No payload` for other update calls. |
| MCP sidecar and semantic embeddings | `dndtools:mcp-status`, `dndtools:mcp-restart`, `dndtools:semantic:status`, `dndtools:semantic:embed` | Renderer -> Main | `Zod` for embedding model/texts; `No payload` for status/restart. |
| Diagnostics | `dndtools:diagnostics:mark-success`, `dndtools:diagnostics:record-error`, `dndtools:diagnostics:record-performance`, `dndtools:diagnostics:get-health`, `dndtools:diagnostics:export` | Renderer -> Main | `Zod` for mark/error/performance payloads; `No payload` for health/export. Export redacts vault paths and omits note content. |
| MCP staged changes | `dndtools:mcp-changes:list`, `dndtools:mcp-changes:audit`, `dndtools:mcp-changes:approve`, `dndtools:mcp-changes:approve-all`, `dndtools:mcp-changes:reject`, `dndtools:mcp-changes:reject-all`, `dndtools:mcp-policy:get`, `dndtools:mcp-policy:set` | Renderer -> Main | `Zod` for audit limit, policy settings, and change IDs; `No payload` for list/approve-all/reject-all/policy get. |
| Desktop UI/window | `dndtools:desktop:show-context-menu`, `dndtools:window:minimize`, `dndtools:window:toggle-maximize`, `dndtools:window:close`, `dndtools:window:get-state` | Renderer -> Main | `Zod` for context-menu request; `No payload` for window controls/state. |
| Desktop events | `dndtools:window-state`, `dndtools:app-menu-command`, `dndtools:desktop-navigate`, `dndtools:vault-file-sync` | Main -> Renderer | `Main event`. Exposed through unsubscribe-returning preload listener methods. |

IPC schema highlights:

- IDs and folder paths reject `..` and ASCII control characters.
- Note and object content is capped at 10 MB.
- Bulk note imports are capped at 10,000 notes.
- Semantic embedding requests are capped at 32 text chunks.
- Settings writes validate both the setting key whitelist and the per-key value schema.
- MCP policies are limited to `strict_review`, `balanced`, and `trusted`.

## ADR Inventory

| ADR | Title | Decision summary | Status |
| --- | --- | --- | --- |
| ADR-001 | Electron Filesystem Ownership | Trusted runtimes own filesystem access: Electron main for renderer-initiated storage, MCP sidecar for MCP storage, renderer only through bridge/adapter. | Current / Accepted |
| ADR-002 | Staged MCP Write Model | MCP writes are staged by default with policy-driven approval; direct mode is explicit opt-in. | Current / Accepted |
| ADR-003 | IPC Surface Strategy | IPC uses explicit named channels, runtime schema validation, and typed preload methods; no raw IPC exposure. | Current / Accepted, with `clear-changelog` validation gap. |
| ADR-004 | StorageAdapter Abstraction Boundary | Renderer persistence goes through one shared storage contract resolved at bootstrap, with runtime-specific adapters. | Current / Accepted |
| ADR-005 | Unified Markdown Pipeline | Markdown parsing/rendering is centralized, supports app-specific extensions, and sanitizes by default. | Current / Accepted |
| ADR-006 | Multi-Platform Approach: Electron + Capacitor | Desktop uses Electron; Android uses Capacitor; renderer/domain layers are shared behind platform adapters. | Current / Accepted |
| ADR-007 | Cloud Backend Architecture: AWS Cognito + S3 + API Gateway | Future cloud sync/collaboration targets AWS managed identity, object storage, and APIs; local-first remains default. | Current / Accepted, planned/deferred in product rollout. |
| ADR-008 | MCP Semantic Bundling Strategy | High-level MCP read workflows use deterministic semantic bundle tools backed by vault intelligence and contract validation. | Current / Accepted |
| ADR-009 | Performance Budget Registry and Telemetry | Performance operation names, targets, regression thresholds, telemetry, and CI comparisons share one typed registry. | Current / Accepted |
| ADR-010 | Offline Sync Queue and Conflict Resolution | Renderer-managed sync wrapper persists queue/conflict state in vault settings and resolves conflicts with three-way snapshots. | Current / Accepted |
| ADR-011 | Theme Preset Architecture | Theme presets are semantic CSS token sets; components use semantic tokens and token lint blocks structural dark-mode drift. | Current / Accepted |
| ADR-012 | Progressive Disclosure via Vault Maturity | Vault maturity signals gate advanced navigation/features through centralized thresholds and reactive state. | Current / Accepted |
| ADR-013 | Three-Layer Navigation Contract | Navigation is global/local/contextual, uses required ARIA labels, and is enforced by navigation lint. | Current / Accepted |

## Security Model

DND Tools is currently local-only: no user account service, no cloud backend, no analytics, and no
network-accessible API. Primary threat actors are malicious vault content, a compromised renderer,
MCP sidecar abuse, and local physical access.

Current protections:

- `BrowserWindow` uses `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- Renderer cannot import Node APIs and cannot access `ipcRenderer`.
- Preload is the sole renderer/main crossing and exposes only named methods.
- IPC handlers validate payloads with Zod and reject malformed inputs as rejected promises.
- Path traversal is blocked at IPC schema level and independently by `FileSystemAdapter` vault
  containment checks.
- User content rendering goes through the sanitized markdown pipeline.
- MCP uses stdio only, not TCP/HTTP.
- MCP writes are staged by default and audited.
- Diagnostics export redacts vault paths and excludes note content.

Residual or planned security considerations:

- `trusted` MCP policy can auto-approve writes by user choice.
- Cloud sync/collaboration will require an expanded threat model for identity, tokens, remote
  storage, abuse controls, and transport security.
- `clear-changelog` remains the one documented IPC payload-validation gap.

## Navigation Architecture

The application has five primary sections:

1. `Knowledge`
2. `Atlas`
3. `Session`
4. `Campaign`
5. `Settings`

Canonical section roots are `/knowledge/*`, `/atlas/*`, `/session/*`, `/campaign/*`, and
`/settings/*`. Non-section legacy routes are supposed to redirect to canonical routes; the audit
found several still implemented as duplicate full pages.

The navigation contract has three layers:

| Layer | Purpose | Rules |
| --- | --- | --- |
| Global | Stable section switching. | 5-7 destinations, maps to primary section roots, visible in main shell except immersive modes, no content actions. Uses `aria-label="Primary"`. |
| Local | Section-scoped browse/filter/navigation. | Shows only active-section structures, can include trees/tabs/filters/recent lists, must not duplicate global switching. Uses `aria-label="<Section> navigation"`. |
| Contextual | Content-adjacent relationships. | Breadcrumbs, backlinks, related links, object cross-links; not a substitute for section switching. Breadcrumbs use `aria-label="Breadcrumb"`. |

Every new navigation element must be classified as exactly one of `global`, `local`, or
`contextual`. `scripts/nav-layer-lint.ts` enforces labeled navigation landmarks in CI.

Section ownership:

| Section | Owns |
| --- | --- |
| Knowledge | Markdown notes, folders, templates, graph, search. |
| Atlas | Maps, map hierarchy, spatial exploration. |
| Session | Session board, combat tracker, encounter builder, dice tray, roll tables, handouts. |
| Campaign | Structured world entities, quests, factions, timeline, relationships. |
| Settings | Preferences, diagnostics, vault health, sync, MCP policies, system administration. |

TopBar is intentionally narrow: route context, history controls, local/detail panel toggles,
command palette, and compact utility status. It must not regain dice shortcuts, manual refresh,
duplicate settings destinations, create menus, or global navigation destinations.

## Layout Tier System

Shell layout has exactly three structural tiers:

| Tier | Width | Shell behavior |
| --- | --- | --- |
| `compact` | `< 640px` | Single-pane content, bottom navigation, local-nav bottom sheet, persistent Browse pill, compact TopBar, no persistent local nav panel. |
| `medium` | `640px` to `1099px` | 60px icon rail plus content shell; active section icon opens temporary 300px local-nav overlay; Knowledge uses non-resizable split view; keyboard hints appear after keyboard modality is detected. |
| `expanded` | `>= 1100px` | 60px icon rail plus persistent 240px local panel, collapsible/resizable local panel, optional 300px right detail panel, Zen mode support. |

Runtime tier detection lives in `src/lib/state/layout.svelte.ts` and uses viewport observation with
debounce. SSR defaults to `expanded`.

Structural dimensions are CSS tokens in `src/app.css`, including rail width, panel widths, detail
width, TopBar height, bottom-nav height, and breakpoint tokens. Components may use Tailwind
responsive utilities for content-level adaptation, but shell structure must use `layoutState`.

## Design Token Architecture

Visual decisions are expressed as CSS custom properties in `src/app.css`:

```text
raw palette tokens -> semantic tokens -> component tokens
```

Carry-forward rules:

- Components reference semantic tokens such as `bg-surface`, `text-ink`, `border-border`,
  `bg-accent`, and `text-accent-foreground`.
- Structural/component styling must not use raw palette values or structural `dark:` variants.
- Theme presets are implemented through root token overrides: `parchment`, `tavern`, `scholar`,
  `dungeon`, plus system/light/dark delegation and high-contrast support.
- Typography, spacing, motion, elevation, density, reading width, and shell dimensions all have
  token contracts.
- `pnpm lint:tokens` blocks arbitrary pixel font sizes and structural `dark:` drift.

## Known Boundary Violations and Architecture Gaps

| ID/source | Severity | Gap | Remake implication |
| --- | --- | --- | --- |
| S21.4 / REM-5.3 | P2 | `dndtools:storage:clear-changelog` accepts raw unvalidated options instead of using `parseIpcArg()`. | Model every IPC payload up front, including maintenance endpoints. |
| S21.4 / REM-2.1 | P2 | 10 legacy routes are full duplicate implementations rather than redirects to canonical section routes. | Start with section-rooted routing only; add legacy aliases as thin redirects preserving query parameters. |
| S21.5.6 | Low | Several `src/lib/types/*` files export runtime values, and Electron/MCP import runtime values from type modules. | Separate pure type contracts from runtime constructors/defaults/normalizers before enforcing `verbatimModuleSyntax`. |
| S21.5.3 | Low / justified exceptions | MCP tools are adapter-clean except `mcp/tools/objects/import-image-note.ts` for external source-file reads and `mcp/tools/shared/contract-server.ts` for diagnostics telemetry writes. | Keep exceptions explicit, documented, and lint-allowlisted. |
| S21.6.3 | Tracked debt | 53 source files exceed the 500-line target, including `src/routes/maps/+page.svelte`, `src/routes/session-board/+page.svelte`, `mcp/storage.ts`, `MapCanvasViewer.svelte`, and `electron/main.ts`. | Remake should decompose route pages, storage implementation, map viewer, and main process services early. |
| S21.6.3 | Test gap | MCP tool-level test coverage is incomplete; many tools rely on aggregate contract tests only. | Build per-tool tests alongside each MCP tool domain. |
| S21.4 / REM-1.1, REM-1.3 | P1 | Player/DM visibility boundaries have known leaks such as `dmNotes` rendering without player-mode guard. | Treat player visibility as a data and rendering policy boundary, not just a UI toggle. |

## Carry-Forward Architecture Principles

- Keep local-first and user-owned vault data as the default operating model.
- Keep the renderer sandboxed and storage-agnostic.
- Keep platform-specific behavior behind explicit adapters/bridges.
- Keep MCP powerful but staged, auditable, and contract-validated.
- Keep route ownership section-rooted from day one.
- Keep architecture decisions in ADRs, not tribal knowledge.
