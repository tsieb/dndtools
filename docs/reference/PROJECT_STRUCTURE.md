# Project Structure

This repository is a pnpm workspace organized by surface and runtime boundary. The GM command
platform (`apps/gm-react`) is the primary application; the platform-independent processing core
(`packages/core`) is shared by every surface. The layout and the React-primary decision are recorded
in [ADR-018](../adr/018-promote-react-app-to-primary.md) (amending ADR-016).

## Top-Level Layout

```text
apps/
  gm-react/    @dndtools/gm-react  — the GM command platform (Vite + React 18, browser-first),
               plus an Electron desktop shell and LAN/cloud remote play
packages/
  core/        @dndtools/core      — the processing core (commands, reducers, permissions, queries)
  cloud-fns/   @dndtools/cloud-fns — AWS Lambda handlers for signaling + encrypted backup
infra/         — AWS SAM stacks for the opt-in cloud backend (see infra/README.md)
docs/          — architecture, ADRs, requirements, design, development, planning, reference
scripts/       — workspace tooling (boundary lint, quality gates, a11y/token lints, validate harness)
tests/         — repo-level tooling/guardrail tests
archive/       — retired code kept for reference only; not built
```

## Applications (`apps/`)

- `apps/gm-react/`: `@dndtools/gm-react` — the GM command platform. Owns rendering (`src/screens`,
  `src/app`, `src/ds`, `src/styles`), command dispatch (`src/runtime`), platform storage
  (`src/platform/storage/coreStore.ts`, Dexie/IndexedDB), LAN/serverless remote play (`src/net`), the
  AWS encrypted-backup + Cognito client (`src/cloud`), and the Electron desktop shell (`electron/`).

## Packages (`packages/`)

- `packages/core/`: `@dndtools/core` — the platform-independent processing core. Owns command
  validation, deterministic reducers, permission/visibility evaluation, actor-scoped queries, the
  operation-log shape, and the declared quality-gate / performance / security / source-of-truth
  registries. Imports no React, Svelte, DOM, Node, Electron, Capacitor, cloud, or app-runtime code
  (zod only); enforced by `scripts/boundary-lint.ts`.
- `packages/cloud-fns/`: `@dndtools/cloud-fns` — AWS Lambda handlers for WebRTC signaling and
  end-to-end-encrypted backup, deployed by the SAM stacks in `infra/`.

## Infrastructure (`infra/`)

AWS SAM stacks for the opt-in cloud backend (identity, signaling, TURN, sync-api, web hosting). See
[`infra/README.md`](../../infra/README.md).

## Archive (`archive/`)

Retired code, preserved for reference and not part of the workspace or any build:

- `archive/gm-svelte/`: the original SvelteKit GM app (git tag `svelte-gm-final`), superseded by the
  React pivot.

The earlier v1 document-editor application is preserved at the git tag `v1-final` only.

## Cleanup Rules

- Build artifacts (`dist/`, `dist-demo/`) are generated and should not be committed.
- The local package store (`.pnpm-store/`) is ignored.
- Empty placeholder directories should be removed unless intentionally reserved with documentation.
