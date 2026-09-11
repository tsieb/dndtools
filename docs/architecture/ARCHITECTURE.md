# Architecture

Every claim here maps to a file in the tree. The React-primary decision is
[ADR-018](../adr/018-promote-react-app-to-primary.md).

## 1. Surfaces

```text
apps/gm-react/    @dndtools/gm-react — the GM app: Vite + React 18 + react-router v6 (HashRouter).
                  Owns rendering, command dispatch, platform storage, remote play, cloud client,
                  and the Electron (electron/) and Capacitor Android (android/) shells.
packages/core/    @dndtools/core     — the processing core: commands, deterministic reducers,
                  permissions and visibility, actor-scoped queries, schemas, declared registries.
packages/cloud-fns/ @dndtools/cloud-fns — Lambda handlers for signaling, E2EE sync, app-api, billing.
infra/            AWS SAM stacks for the opt-in cloud backend (infra/README.md).
scripts/, tests/  Workspace tooling, gates, the validate harness, repo guardrail tests.
tools/loop/       The autonomous RC loop's roadmap parser and prompts.
archive/gm-svelte/ The retired SvelteKit app; not in the workspace, not built, not linted.
```

Build artifacts (`dist/`, `release/`, Gradle outputs, `.aws-sam/`) are generated and ignored.

## 2. The GM app

- **Renderer.** `src/main.tsx` mounts `src/App.tsx`; `src/app/AppShell.tsx` renders the shell and
  the active screen from `src/app/nav.ts` ([NAVIGATION.md](NAVIGATION.md)). Screens live in
  `src/screens/`, the design system in `src/ds/`, tokens in `src/styles/tokens/`.
- **Command runtime.** `src/runtime/SceneRuntime.ts` is the single durable write choke point:
  `dispatch(command)` runs the pure `dispatchCommand` reducer from `@dndtools/core`, persists the
  result, and notifies listeners. Dispatches, agent-tool writes, and destructive storage maintenance
  share one serialized queue, so a restore cannot race an in-flight command. `RuntimeContext.tsx`
  provides `useRuntime()`; components read an actor-filtered `CoreStateSlice`. A dev-only
  `window.__rt` handle exists for the verify scripts and e2e; it is absent from production builds.
- **Platform storage.** `src/platform/storage/coreStore.ts` owns the Dexie database and exposes
  load, transactional command persistence, cloud restore, full local restore, and reset
  ([DATA_MODEL.md](DATA_MODEL.md)). `privateStore.ts` owns the player-private databases.
- **Platform capabilities.** `src/platform/capabilities.ts` resolves the `PlatformCapabilities`
  contract per runtime kind; lifecycle, Back, export, and secure-store adapters sit beside it
  ([PLATFORMS.md](PLATFORMS.md)).
- **Remote play** (`src/net/`). The DM host (`SessionHost.ts`) holds the authoritative runtime and
  replicates player-safe view-models (`viewModels.ts`) built from actor-filtered queries; players
  (`SessionClient.ts`) send back intents only. LAN discovery is the Electron mDNS bridge; the
  internet path reuses the transport over the signaling relay and TURN (`signaling.ts`,
  `cloudBridge.ts`, `cloudCrypto.ts`). Threat model: [../security/README.md](../security/README.md).
- **Cloud client** (`src/cloud/`). Cognito auth, E2EE backup and cross-device merge
  (`syncEngine.ts`, `vaultKey.ts`), app-api (`appApi.ts`), billing (`billing.ts`), telemetry, and
  Google integrations. Off by default and fail-closed behind the core `SYNC-017` gate.
- **AI** (`src/ai/`). BYO-key or local Ollama transport; every model tool call routes through the
  MCP pipeline as a staged proposal ([ADR-021](../adr/021-client-side-ai-provider-transport.md),
  [ADR-025](../adr/025-agentic-multi-step-assistant-runs.md)).
- **i18n** (`src/i18n/`). Keyed catalogs, `t()` as the only path, memoized `Intl` formatting
  ([ADR-032](../adr/032-internationalization-architecture.md)).

## 3. Data path

```text
React screen ──dispatch(command)──▶ SceneRuntime ──▶ dispatchCommand (core reducer, pure)
                                          ├──▶ coreStore (Dexie): slices + op log, one transaction
                                          ├──▶ dispatch listeners ──▶ SessionHost (P2P replication)
                                          └──▶ (opt-in) cloud sync: E2EE snapshot + op-log tail
```

Reads flow the other way: components select an actor-filtered `CoreStateSlice`, so DM-only content
is removed by the core query layer before it reaches a view or a player.

## 4. The core boundary

`@dndtools/core` imports no React, Svelte, DOM, Node, Electron, Capacitor, cloud, or app-runtime
code, only zod. `scripts/boundary-lint.ts` enforces it. The core owns commands and the reducer
(`src/commands`, `src/state`), permissions and queries (`src/permissions`, `src/queries`), schemas
(`src/schemas`), the MCP tool registry (`src/mcp`), map generation and geometry (`src/generation`,
`src/geometry`), and the declared registries: source of truth (`src/constraints/source-of-truth.ts`),
quality gates (`src/platform/quality-gates.ts`), performance budgets (`src/perf/budget-registry.ts`),
security regression gates (`src/security/regression-gates.ts`), and the cloud-sync gate
(`src/sync/cloud-sync-gate.ts`). Nothing else may produce authoritative state.

## 5. Quality and verification

`pnpm gates` enforces the quality-gate registry; `pnpm lint:boundary` the core boundary;
`pnpm a11y:gate` accessibility; `pnpm validate` the whole application; `pnpm feature-audit` the
inventory in `docs/requirements/FEATURE-GAPS.md`. Details: [../development/TESTING.md](../development/TESTING.md).

## 6. Decisions

Add or update an ADR before merging a change that materially alters runtime boundaries, storage,
security, or platform strategy: start from `docs/adr/000-template.md`, index it in
`docs/adr/README.md`, and update the affected implementation doc in the same change. ADRs 001–013
predate the React pivot; the index marks which still govern.
