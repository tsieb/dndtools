# Development Standards

This document defines enforceable engineering standards for this repository.

## 1. Prerequisites

- Node.js 20+
- pnpm 9+
- Windows/macOS/Linux desktop environment for Electron testing

## 2. Canonical Scripts

From `package.json`:
- `pnpm dev`: Vite dev server for renderer development
- `pnpm build`: renderer build
- `pnpm test`: vitest run
- `pnpm test:watch`: vitest watch
- `pnpm test:e2e`: playwright
- `pnpm lint`: eslint
- `pnpm typecheck`: svelte-check
- `pnpm check`: lint + typecheck + tests
- `pnpm mcp:dev`: run MCP from source
- `pnpm mcp:build`: build MCP bundle
- `pnpm mcp:inspect`: run MCP inspector
- `pnpm desktop:build`: build renderer + MCP + Electron bundles
- `pnpm desktop:start`: launch built Electron app
- `pnpm desktop`: build + start desktop

## 3. Required Workflow

For every non-trivial change:
1. Update code in the correct runtime boundary.
2. Update tests at the right level.
3. Run `pnpm check`.
4. Run `pnpm test:e2e` when UI behavior changed.
5. Update docs when contracts or architecture changed.

## 4. Boundary Rules (Mandatory)

- Renderer (`src/`) must not import Node-only APIs.
- Electron main/preload must not import renderer-only modules except shared types.
- MCP server code must not import Svelte runtime modules.
- Persistence logic belongs in adapters/services, not Svelte components.

## 5. Coding Rules

- TypeScript strict mode is non-negotiable.
- Avoid `any`; use narrow types and runtime validation where needed.
- Keep modules single-purpose.
- Prefer pure functions in `src/lib/services` and `src/lib/utils`.
- Keep IPC payloads explicit and validated.

## 6. Definition of Done (Engineering)

A task is complete only when all are true:
- behavior implemented
- tests added/updated
- docs synced
- no boundary violations introduced
- no known regressions in lint/typecheck/tests

## 7. Documentation Rules

- Use exact file paths and tool names.
- Separate "implemented" from "planned".
- Every `TODO(APP)` must include reason and target files.

## 8. Current High-Risk Gaps

`TODO(APP):` No CI pipeline currently enforces quality gates.
Impact: regressions can merge unnoticed.
Target: add `.github/workflows/*` for lint/typecheck/test/build/e2e.

`TODO(APP):` Electron storage IPC uses broad dynamic dispatch.
Impact: weakens contract clarity and security posture.
Target:
- `electron/main.ts`
- `electron/preload.ts`
- `src/lib/storage/electron-adapter.ts`

`TODO(APP):` MCP tool test coverage is incomplete for many domains.
Impact: behavioral drift risk in agent workflows.
Target: `mcp/**/*.test.ts` expansion.

## 9. Architectural Governance

For major design changes, require:
- problem statement
- alternatives considered
- migration plan
- test plan
- docs update in same change

`TODO(APP):` Create ADR process directory and template under `docs/adr/`.
