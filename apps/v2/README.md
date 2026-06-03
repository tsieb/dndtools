# DND Tools v2 (apps/v2)

Clean v2 subproject for the DND Tools 0.2.0 remake. Scaffolded per
[ADR-014](../../docs/adr/014-v2-stack-and-subproject-boundary.md).

## Packages

- `@dndtools/v2-core` (`packages/core/`) — platform-independent Processing Core. Owns command
  validation, deterministic reducers, permission/visibility evaluation, actor-scoped queries, and
  the local operation log shape. No Svelte, DOM, Node, Electron, Capacitor, MCP, cloud, or v1
  runtime imports.
- `@dndtools/v2-app` (`app/`) — SvelteKit/Svelte 5 browser-first GUI. Owns rendering, platform
  services (Dexie/IndexedDB), command dispatch wiring, and visible Scene workflow.

## Root scripts

Public agent contract (run from repo root):

```
pnpm v2:dev          # Start v2 SvelteKit dev server
pnpm v2:build        # Build core then app
pnpm v2:typecheck    # Strict typecheck of both packages
pnpm v2:lint         # Run v2 boundary lint
pnpm v2:test         # Run Vitest in both packages
pnpm v2:e2e          # Run Playwright against the v2 app
pnpm v2:check        # Workpack validate + lint + typecheck + tests
```

## Boundaries enforced

- `@dndtools/v2-core` may not import: Svelte, SvelteKit, browser DOM APIs, Electron, Capacitor,
  Node filesystem APIs, MCP, cloud SDKs, or any v1 runtime path (`src/`, `electron/`, `mcp/`).
- `@dndtools/v2-app` may not import any v1 runtime path. It depends on `@dndtools/v2-core` via
  `workspace:*` only.
- `scripts/v2-boundary-lint.ts` fails CI when these rules are violated.

## First slice

This scaffold lands together with the `CANVAS-scene-state` epic
(`docs/planning/v2/epics/CANVAS-scene-state.yaml`), which covers requirements CANVAS-001,
CANVAS-003, CANVAS-004, CANVAS-013, and CANVAS-018.
