# Lamplight

A canvas-first command platform for tabletop RPG play. Content, tools, and AI compose into a
single spatial workspace — the **Command Center** — where the GM runs sessions, maps, and
characters.

This repository is a pnpm workspace. The **GM app** (`apps/gm-react`) is the primary application;
the platform-independent **processing core** (`packages/core`) is shared by every surface.

## Layout

```text
apps/
  gm-react/    @dndtools/gm-react — the GM command platform (Vite + React 18, browser-first,
               plus Electron desktop and Capacitor Android shells and LAN/cloud remote play)
packages/
  core/        @dndtools/core     — the processing core (commands, reducers, permissions, queries)
  cloud-fns/   @dndtools/cloud-fns — AWS Lambda handlers for signaling + encrypted backup
infra/         — AWS SAM stacks for the opt-in cloud backend (see infra/README.md)
docs/          — architecture, ADRs, requirements, design, development, planning, reference
scripts/       — workspace tooling (boundary lint, quality gates, a11y/token lints, validate harness)
tests/         — repo-level tooling/guardrail tests
archive/       — retired code kept for reference only (the original Svelte GM app); not built
```

The repository layout and the decision to make React the primary GM surface are recorded in the
[ADRs](docs/adr/README.md). See [`docs/README.md`](docs/README.md) for the full documentation map.

> The GM app was first built in SvelteKit. As of the React pivot it is maintained in React
> (`apps/gm-react`); the Svelte app is preserved at `archive/gm-svelte` and the git tag
> `svelte-gm-final`. The earlier v1 document-editor is preserved at the tag `v1-final`.

## Commands

```bash
pnpm install          # install the workspace
pnpm dev              # start the React GM app dev server (:5273)
pnpm build            # build core, cloud functions, and the React GM app
pnpm typecheck        # typecheck core, cloud functions, and the React GM app
pnpm test             # core + cloud/transport + app + repo tooling unit tests
pnpm e2e              # Playwright (desktop + mobile Chromium) against the React app
pnpm a11y:gate        # non-text contrast + axe accessibility gate
pnpm lint             # eslint + boundary lint + non-text contrast lint
pnpm lint:boundary    # processing/display + platform-primitive boundary lint
pnpm gates            # tiered quality-gate registry enforcement
pnpm check            # gates + boundary lint + typecheck + tests
pnpm validate         # whole-application validation harness (staged, capability-gated)
pnpm desktop:dev      # run the Electron desktop shell against the dev server
pnpm --filter @dndtools/gm-react android:sync # build and synchronize the Android project
```

## Boundaries

- `@dndtools/core` is platform-independent: no React, Svelte, DOM, Node, Electron, Capacitor,
  cloud, or app-runtime imports. Enforced mechanically by `scripts/boundary-lint.ts`.
- `@dndtools/gm-react` owns rendering, platform services (Dexie/IndexedDB), remote-play transport,
  and command dispatch; it depends on `@dndtools/core` via `workspace:*` and never mutates durable
  state directly — all changes flow through commands into the processing core.
- Browser, Electron, and Android consume the centralized `PlatformCapabilities` contract. Native
  integrations stay in `apps/gm-react/electron` and `apps/gm-react/android`; the shared core never
  imports them.

Android build, installation, signing, backup, and alpha limitations are documented in the
[Android alpha runbook](docs/runbooks/android-alpha.md).

## History

The prior v1 document-editor application has been retired (tag `v1-final`). The GM command platform
was then built as a remake, first in SvelteKit (tag `svelte-gm-final`, now at `archive/gm-svelte`)
and now in React (`apps/gm-react`). The dated planning, audit, and requirements artifacts from the
remake have been pruned from the tree and remain recoverable in git history.
