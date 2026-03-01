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
- `pnpm test:e2e:desktop`: desktop Playwright suite
- `pnpm test:e2e:desktop:critical`: desktop route/workflow regression gate
- `pnpm test:e2e:desktop:perf`: desktop performance benchmark suite (`@perf`)
- `pnpm lint`: eslint
- `pnpm typecheck`: svelte-check
- `pnpm check`: lint + typecheck + tests
- `pnpm docs:validate`: docs path/TODO/schema drift checks
- `pnpm mcp:dev`: run MCP from source
- `pnpm mcp:build`: build MCP bundle
- `pnpm mcp:inspect`: run MCP inspector
- `pnpm desktop:build`: build renderer + MCP + Electron bundles
- `pnpm desktop:start`: launch built Electron app
- `pnpm desktop:smoke`: launch built desktop app against temp vault and assert readiness
- `pnpm desktop`: build + start desktop

## 3. Required Workflow

For every non-trivial change:

1. Update code in the correct runtime boundary.
2. Update tests at the right level.
3. Run `pnpm check`.
4. Run `pnpm test:e2e` when UI behavior changed.
5. Update docs when contracts or architecture changed.

For story-scoped work, branch before starting — see `docs/GIT_WORKFLOW.md`
for branch naming, commit conventions, PR process, and recovery guidance.

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

`TODO(APP):` Coverage thresholds are configured but not yet enforced in the CI gate.
Reason: UI coverage is still below reliable enforcement thresholds for route and component flows.
Target: `vite.config.ts`, `.github/workflows/ci.yml`, `tests/**/*`.
Risk: regressions can slip through in low-coverage renderer areas.

`TODO(APP):` Desktop release artifacts are built and signed at checksum level, but OS-native installer signing/notarization is not yet automated.
Reason: current pipeline validates runtime bundles; platform trust-sign workflows are still pending.
Target: `.github/workflows/release-assets.yml`, packaging/signing tooling in desktop release pipeline.
Risk: distribution trust posture remains weaker than a fully signed/notarized installer chain.

## 9. Architectural Governance

For major design changes, require:

- problem statement
- alternatives considered
- migration plan
- test plan
- docs update in same change

ADR governance is implemented under `docs/adr/`:

- `docs/adr/000-template.md` defines required decision sections.
- `docs/adr/README.md` is the canonical index for accepted decisions.
- Major architecture changes must update/add ADR content in the same change set.
