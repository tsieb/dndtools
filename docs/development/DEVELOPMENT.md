# Development Standards

This document defines the engineering rules that apply to every code change in this repository.

## 1. Prerequisites

- Node.js 22.13+
- pnpm 10.34.5 (the exact version pinned in `package.json` and CI)
- Electron desktop is optional; a packaged-app smoke run needs a display.

## 2. Script Surface

Canonical references:

- `docs/development/SCRIPTS.md` - complete script inventory and use cases
- `docs/development/VALIDATION.md` - test/validation story and the `pnpm validate` harness
- `docs/development/GIT_WORKFLOW.md` - branch model and CI gates

High-signal commands:

- `pnpm check` - `gates` + boundary lint + typecheck + full test suite (pre-handoff gate)
- `pnpm validate` - whole-application validation harness (see VALIDATION.md)
- `pnpm test` - core unit + cloud/net + app + repo tooling tests
- `pnpm e2e` - Playwright (desktop + mobile Chromium) against `apps/gm-react`
- `pnpm a11y:gate` - contrast + axe accessibility gate

## 3. Required Workflow

For every non-trivial change:

1. Work in the correct runtime boundary.
2. Update tests at the correct layer.
3. Run the smallest validating command that matches the change while iterating.
4. Run `pnpm check` before handoff.
5. Run the relevant gates from `docs/development/GIT_WORKFLOW.md` before opening a PR.
6. Update docs when contracts, workflows, or architecture change.

## 4. Boundary Rules

- Shared core (`packages/core`) is framework-independent: it imports NO React, Svelte, DOM, Node, Electron, or cloud APIs.
- The renderer (`apps/gm-react/src`) must not import Node-only APIs; Electron main/preload live under `apps/gm-react/electron` and must not import renderer-only modules except shared types.
- Screens (`apps/gm-react/src/screens`) dispatch commands; they never mutate durable state directly.
- Durable storage goes only through the Dexie/IndexedDB adapter (`apps/gm-react/src/platform/storage/coreStore.ts`), never from screens or components.

Boundary violations are lint-enforced by `scripts/boundary-lint.ts` (which also forbids React imports in `packages/core`) and fail CI.

## 5. Coding Rules

- TypeScript strict mode is non-negotiable.
- Avoid `any`; prefer narrow types and runtime validation (zod in core).
- Keep modules single-purpose.
- Keep screen/route files thin and push business logic into core commands/reducers.

## 6. Definition of Done

A change is complete only when all are true:

- behavior implemented
- tests added or updated
- docs synced
- no boundary violations introduced
- no known regressions in lint, typecheck, or tests
- performance budgets in `packages/core/src/perf/budget-registry.ts` are not regressed

## 7. Documentation Rules

- Use exact file paths and script names.
- Separate implemented behavior from planned work.
- Every `TODO(APP)` must include `reason`, `risk`, and `target`.
- Long-lived source TODOs must map into `DEBT.md`.

## 8. Refactor Budget Governance

Technical debt is tracked in `DEBT.md`.

- Every debt entry includes `ID`, `Severity`, `Impact`, `Owner`, and `Resolution Window`.
- Any PR introducing a long-lived deferment must resolve it immediately or register debt before merge.
- Quarterly debt review is mandatory.

## 9. Architectural Governance

Major design changes require:

- problem statement
- alternatives considered
- migration plan
- test plan
- same-change docs update
