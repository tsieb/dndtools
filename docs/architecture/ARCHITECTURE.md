# Architecture

This document defines the **implemented** architecture and the required constraints for DND Tools.
Every claim below maps to a file in the current tree. The pivot to a React primary app is recorded in
[ADR-018](../adr/018-promote-react-app-to-primary.md) (which amends ADR-016).

## 1. Surfaces

The workspace is a pnpm monorepo. There is one primary application, a shared processing core, a set
of cloud Lambdas, and the AWS infrastructure that hosts them.

| Surface         | Package                                      | Role                                                                                                                                                               |
| --------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GM app          | `apps/gm-react` (`@dndtools/gm-react`)       | Vite + React 18 + react-router-dom v6 (HashRouter). Owns rendering, command dispatch, platform storage, remote play, cloud backup, and the Electron desktop shell. |
| Processing core | `packages/core` (`@dndtools/core`)           | Framework-independent (zod-only). Owns commands, reducers, permissions/visibility, actor-scoped queries, and the declared registries.                              |
| Cloud functions | `packages/cloud-fns` (`@dndtools/cloud-fns`) | AWS Lambda handlers for WebRTC signaling and encrypted backup.                                                                                                     |
| Infrastructure  | `infra/`                                     | AWS SAM stacks for the opt-in cloud backend (see [`infra/README.md`](../../infra/README.md)).                                                                      |

Retired code is preserved but **not built**: the original SvelteKit GM app at `archive/gm-svelte`
(tag `svelte-gm-final`) and the earlier v1 document editor (tag `v1-final`).

## 2. Runtime Topology (`apps/gm-react`)

The app is browser-first. The same renderer bundle also runs inside an Electron desktop shell.

### 2.1 React renderer

- Entry: `src/main.tsx` mounts `src/App.tsx` into `#root`.
- Shell: `src/app/AppShell.tsx` renders the navigation, top bar, and the active screen. Screens live
  in `src/screens/*.tsx`; the design system is `src/ds/components/**`; styles/tokens are
  `src/styles/index.css` + `src/styles/tokens/*.css`.
- Navigation is defined once in `src/app/nav.ts` (grouped IA + `SECTION_TITLES`) — see
  [NAVIGATION_CONTRACT.md](NAVIGATION_CONTRACT.md) and [INFORMATION_ARCHITECTURE.md](INFORMATION_ARCHITECTURE.md).
- The renderer never mutates durable state directly. Every GUI mutation is a command sent through the
  runtime (§3).

### 2.2 Command runtime

- `src/runtime/SceneRuntime.ts` is the **single durable write choke point**. `SceneRuntime.dispatch(command)`
  runs the pure `dispatchCommand` reducer from `@dndtools/core`, persists the result, and notifies
  dispatch listeners. Dispatches, agent-tool writes, and destructive storage maintenance share one
  serialized queue, so backup restore/reset cannot race an in-flight command.
- `src/runtime/RuntimeContext.tsx` provides `RuntimeProvider` / `useRuntime`. React components read an
  actor-filtered `CoreStateSlice` and call `runtime.dispatch(...)` to change anything.
- A dev-only `window.__rt` handle exists for debugging; it is never present in a production build.

### 2.3 Platform storage

- `src/platform/storage/coreStore.ts` owns the only Dexie database and exposes `loadCoreState`,
  transactional command persistence, cloud restore, full local-vault restore, reset, and a type-only
  `storagePort`. `assetStore.ts` reaches the binary table only through this adapter's narrow seam.
- The Dexie database (`V2Database`) holds state-slice documents, the append-only operation log, a
  migration journal used for crash-safe upgrade recovery, and content-addressed map/audio bytes.
- Normal commands commit state plus operations atomically. Cloud restore validates then atomically
  replaces state/history while preserving local asset bytes; local backup restore atomically replaces
  state/history/assets. Persisted future schemas or corrupt operation sequences reject the whole load.
- Persistence conforms to the framework-free `StoragePort` shape declared in `@dndtools/core`; the
  boundary lint (`scripts/boundary-lint.ts`) keeps storage details out of the UI.

### 2.4 Remote play (`src/net/`)

- LAN / serverless WebRTC transport. The DM host (`SessionHost.ts`) holds the single authoritative
  `SceneRuntime` and replicates **player-safe view-models** (`viewModels.ts`) built from the
  actor-filtered query layer. Players (`SessionClient.ts`) are non-authoritative and send back only
  intents (dice rolls, edits to their own character).
- LAN discovery uses mDNS (`discovery.ts`); pairing/QR in `qr.ts`; message contracts in `messages.ts`.
- The internet path reuses the same transport over a signaling relay + coturn TURN (`signaling.ts`,
  `cloudBridge.ts`); the threat model is in [../security/README.md](../security/README.md).

### 2.5 Cloud backup + auth (`src/cloud/`)

- Opt-in. AWS Cognito identity (`auth.ts`, `AuthContext.tsx`); end-to-end-encrypted backup
  (`cloudSync.ts`, `syncEngine.ts`, `vaultKey.ts`) with account-and-vault-scoped client-held keys.
  AES-GCM authenticates account, vault, artifact kind, and revision, preventing ciphertext replay into
  a different server-visible context. Tokens/keys live in an OS
  credential store on desktop and are memory-only on the web (`tokenStore.ts`, `secureStore.ts`).
- Backup stays **off by default and fail-closed** behind the core `SYNC-017` gate
  (`packages/core/src/sync/cloud-sync-gate.ts`). The current product uploads a recoverable encrypted
  copy and restores it only on explicit request; it does not merge changes between devices. Details:
  [../security/README.md](../security/README.md).

### 2.6 Electron desktop shell (`electron/`)

- `main.cjs` owns the BrowserWindow and serves packaged content from the privileged
  `dndtools://app` origin; `preload.cjs` exposes a minimal, explicit bridge; `discovery.cjs` bundles
  mDNS peer discovery for LAN play. The native application menu is hidden by default while native
  controls remain, and the title-bar overlay follows the application theme. The shell adds no
  authoritative state — it hosts the same renderer and command runtime.

## 3. Data Path

```
React screen ──dispatch(command)──▶ SceneRuntime ──▶ dispatchCommand (core reducer, pure)
                                          │
                                          ├──▶ coreStore (Dexie/IndexedDB): persist slices + op-log
                                          ├──▶ dispatch listeners ──▶ SessionHost (P2P replication)
                                          └──▶ (opt-in) cloud backup engine: E2EE recovery copy
```

Reads flow the other way: components subscribe to the runtime and select an **actor-filtered**
`CoreStateSlice`, so hidden/DM-only content is removed by the core query layer before it reaches the
view (and before it is replicated to a player).

## 4. Processing Core Boundary (Strict)

`@dndtools/core` is platform-independent: it imports **no React, Svelte, DOM, Node, Electron,
Capacitor, cloud, or app-runtime code** — only zod. This is enforced mechanically by
`scripts/boundary-lint.ts` (which, per ADR-018, now also forbids React imports).

The core owns:

- commands + the deterministic `dispatchCommand` reducer (`src/commands`, `src/state`),
- permission/visibility evaluation and actor-scoped queries (`src/permissions`, `src/queries`),
- zod schemas (`src/schemas`),
- the declared, owned registries:
  - source-of-truth registry — `src/constraints/source-of-truth.ts`
  - quality-gate registry — `src/platform/quality-gates.ts`
  - performance-budget registry — `src/perf/budget-registry.ts`
  - security regression gates — `src/security/regression-gates.ts`
  - cloud-sync gate — `src/sync/cloud-sync-gate.ts`

All durable mutation flows through commands into this core; nothing else may produce authoritative
state.

## 5. Quality & Verification

- `pnpm gates` (`scripts/quality-gates.ts`) enforces the tiered quality-gate registry, failing closed.
- `pnpm lint:boundary` enforces the core boundary.
- Accessibility is gated: `pnpm a11y:contrast` (non-text contrast) + `pnpm a11y:axe` (Playwright axe
  gate, `apps/gm-react/tests/e2e/a11y-axe-gate.spec.ts`).
- `pnpm validate` is the whole-application harness — see [../development/VALIDATION.md](../development/VALIDATION.md).

## 6. Architecture Decision Process

For any major architecture change, add/update an ADR before merge:

1. Start from `docs/adr/000-template.md`.
2. Add or update a numbered ADR in `docs/adr/`.
3. Update `docs/adr/README.md` with a one-line summary and status.
4. Update affected implementation docs in the same change set.

The full decision history — including the ADRs that describe now-retired v1/Svelte runtimes — lives in
[`docs/adr/`](../adr/README.md). Those historical ADRs are the decision record, not current behavior.
