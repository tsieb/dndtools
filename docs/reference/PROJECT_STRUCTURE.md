# Project Structure

This repository is a pnpm workspace organized by surface and runtime boundary. The GM command
platform (`apps/gm`) is the primary application; the platform-independent processing core
(`packages/core`) is shared by every surface.

## Top-Level Layout

- `apps/`: deployable end-user applications (one GUI per surface).
- `packages/`: shared libraries with no GUI, reused across apps and services.
- `docs/`: architecture, ADRs, planning, requirements, and reference docs.
- `scripts/`: workspace tooling (boundary lint, quality gates, a11y/token lints).
- `tests/`: repo-level tooling/guardrail tests (each app and package owns its own test suite).

## Applications (`apps/`)

- `apps/gm/`: `@dndtools/gm` — the GM command platform. SvelteKit / Svelte 5 browser-first GUI.
  Owns rendering, platform services (Dexie/IndexedDB), command dispatch wiring, and the visible
  Scene/Command-Center workflow.

Future surfaces (documented here, not yet scaffolded — added when a real boundary appears, per
ADR-016): a player app, and Electron desktop / Capacitor mobile shells.

## Packages (`packages/`)

- `packages/core/`: `@dndtools/core` — the platform-independent Processing Core. Owns command
  validation, deterministic reducers, permission/visibility evaluation, actor-scoped queries, the
  local operation-log shape, and the declared quality-gate / security / source-of-truth registries.
  No Svelte, DOM, Node, Electron, Capacitor, cloud, or app-runtime imports.

Future shared packages (documented, not scaffolded): a shared UI kit, shared schemas, and MCP
tool definitions.

## Services (`services/`)

Reserved for server/cloud-side runtimes (cloud sync backend per ADR-007, an MCP server). Documented
here for orientation; not scaffolded until a concrete boundary lands (ADR-016).

## Cleanup Rules

- Build artifacts (`build/`, `.svelte-kit/`) are generated and should not be committed.
- Local package store (`.pnpm-store/`) is ignored.
- Empty placeholder directories should be removed unless they are intentionally reserved with
  documentation.
