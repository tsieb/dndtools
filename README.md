# DND Tools

A canvas-first command platform for tabletop RPG play. Content, tools, and AI compose into a
single spatial workspace — the **Command Center** — where the GM runs sessions, maps, and
characters. See the [vision brief](docs/remake-review/00-vision-brief.md) for the full intent.

This repository is a pnpm workspace. The **GM app** (`apps/gm`) is the primary application; the
platform-independent **processing core** (`packages/core`) is shared by every surface.

## Layout

```text
apps/
  gm/          @dndtools/gm   — the GM command platform (SvelteKit / Svelte 5, browser-first)
packages/
  core/        @dndtools/core — the processing core (commands, reducers, permissions, queries)
docs/          — architecture, ADRs, planning, development, reference
scripts/       — workspace tooling (boundary lint, quality gates, a11y/token lints)
tests/         — repo-level tooling/guardrail tests
```

Future surfaces (a player app, Electron desktop / Capacitor mobile shells, a cloud-sync service,
an MCP server) are documented in [`docs/reference/PROJECT_STRUCTURE.md`](docs/reference/PROJECT_STRUCTURE.md)
and added when a real boundary appears. The structure and naming are recorded in
[ADR-016](docs/adr/016-promote-gm-app-and-monorepo-reorg.md).

## Commands

```bash
pnpm install          # install the workspace
pnpm dev              # start the GM app dev server
pnpm build            # build core, then the GM app
pnpm typecheck        # typecheck core + GM app
pnpm test             # core + GM app + repo tooling tests
pnpm e2e              # Playwright (desktop + mobile Chromium) against the GM app
pnpm lint             # eslint + boundary lint + non-text contrast lint
pnpm lint:boundary    # processing/display + platform-primitive boundary lint
pnpm gates            # tiered quality-gate registry enforcement
pnpm check            # gates + boundary lint + typecheck + tests
```

## Boundaries

- `@dndtools/core` is platform-independent: no Svelte, DOM, Node, Electron, Capacitor, cloud, or
  app-runtime imports. Enforced mechanically by `scripts/boundary-lint.ts`.
- `@dndtools/gm` owns rendering, platform services (Dexie/IndexedDB), and command dispatch; it
  depends on `@dndtools/core` via `workspace:*` and never mutates durable state directly.

## History

The prior v1 document-editor application has been retired; its last state is preserved at the git
tag `v1-final`. The current GM app is the product of a full remake; the dated planning, audit, and
requirements artifacts from that remake have been pruned from the tree and remain recoverable in
git history.
