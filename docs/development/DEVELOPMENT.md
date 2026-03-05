# Development Standards

This document defines enforceable engineering standards for this repository.

## 1. Prerequisites

- Node.js 20+
- pnpm 9+
- Windows/macOS/Linux desktop environment for Electron testing
- Java 21 + Android SDK/Platform tools (required for Android APK builds)

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
- `pnpm desktop:package`: build and package desktop installers via `electron-builder`
- `pnpm desktop:package:win`: build/package signed Windows NSIS installer
- `pnpm desktop:package:mac`: build/package signed + notarized macOS artifacts
- `pnpm desktop:package:linux`: build/package Linux AppImage + `.deb`
- `pnpm desktop:start`: launch built Electron app
- `pnpm desktop:smoke`: launch built desktop app against temp vault and assert readiness
- `pnpm desktop`: build + start desktop
- `pnpm android:add`: scaffold native Android project (one-time)
- `pnpm android:sync`: build renderer and sync web assets/plugins into `android/`
- `pnpm android:open`: open Android Studio project
- `pnpm android:assemble:release`: build release APK via Gradle (`android/app/build/outputs/apk/release/`)
- `pnpm fixture:vault -- [options]`: generate configurable fixture vault for perf/migration/debug scenarios

## 3. Required Workflow

For every non-trivial change:

1. Update code in the correct runtime boundary.
2. Update tests at the right level.
3. Run `pnpm check`.
4. Run `pnpm test:e2e` when UI behavior changed.
5. Update docs when contracts or architecture changed.

For story-scoped work, branch before starting — see `docs/development/GIT_WORKFLOW.md`
for branch naming, commit conventions, PR process, and recovery guidance.

## 4. Boundary Rules (Mandatory)

- Renderer (`src/`) must not import Node-only APIs.
- Electron main/preload must not import renderer-only modules except shared types.
- MCP server code must not import Svelte runtime modules.
- Persistence logic belongs in adapters/services, not Svelte components.
- Route components must not import storage adapters directly; they must use state modules.

Boundary violations are lint-enforced in `eslint.config.js` and fail CI via `pnpm lint`.

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
- performance budgets not regressed (see `docs/development/PERFORMANCE.md` Section 1 for thresholds)

## 7. Documentation Rules

- Use exact file paths and tool names.
- Separate "implemented" from "planned".
- Every `TODO(APP)` must include `reason`, `risk`, and `target` fields.
- Any source-code `// TODO(APP)` that remains open beyond one quarter must map to an item in `DEBT.md`.

## 8. Refactor Budget Governance (Required)

Technical debt is tracked in the root-level `DEBT.md` register.

Policy:

- Every debt item must include: `ID`, `Severity`, `Impact`, `Owner`, and `Resolution Window`.
- Any PR introducing a long-lived deferment must either:
  - resolve the debt in the same PR, or
  - add/update a debt item in `DEBT.md` before merge.
- Quarterly debt review is mandatory. If a `// TODO(APP)` in source survives longer than one quarter, a linked debt item is required before further feature work in that area.
- Debt entries should be small and actionable. Break large debt clusters into separate IDs with independent windows.

## 9. Current High-Risk Debt Items

Tracked in `DEBT.md`:

- `DEBT-2026-001`: CI coverage threshold enforcement
- `DEBT-2026-003`: Accessibility automation coverage for critical UI flows
- `DEBT-2026-004`: Portable markdown export profile with validation report

## 10. Architectural Governance

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
