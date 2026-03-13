# Development Standards

This document defines the engineering rules that apply to every code change in this repository.

## 1. Prerequisites

- Node.js 20+
- pnpm 9+
- Desktop environment support for Electron validation
- Java 21 + Android SDK for APK builds

## 2. Script Surface

Canonical references:

- `docs/development/SCRIPTS.md` - complete script inventory, runtimes, and use cases
- `docs/development/TESTING.md` - test-scope guidance and smoke/full-gate policy
- `docs/development/GIT_WORKFLOW.md` - initiative/epic branch model and CI tiers

High-signal commands:

- `pnpm audit:quick` - structured local smoke run
- `pnpm audit:full` - structured local full-quality run
- `pnpm test:smoke` - CI smoke contract for epic PRs
- `pnpm check` - lint + typecheck + full Vitest suite
- `pnpm desktop:test:critical` - desktop critical-path regression gate
- `pnpm metrics:capture` / `pnpm metrics:compare` - baseline capture and comparison

## 3. Required Workflow

For every non-trivial change:

1. Work in the correct runtime boundary.
2. Update tests at the correct layer.
3. Run the smallest validating command that matches the change while iterating.
4. Run `pnpm check` before handoff.
5. Run the relevant manual gates from `docs/development/GIT_WORKFLOW.md` before opening a PR.
6. Update docs when contracts, workflows, or architecture change.

## 4. Boundary Rules

- Renderer (`src/`) must not import Node-only APIs.
- Electron main/preload must not import renderer-only modules except shared types.
- MCP code must not import Svelte runtime modules.
- Route components must not import storage adapters directly.
- Persistence logic belongs in adapters/services, not Svelte components.

Boundary violations are lint-enforced and fail CI.

## 5. Coding Rules

- TypeScript strict mode is non-negotiable.
- Avoid `any`; prefer narrow types and runtime validation.
- Keep modules single-purpose.
- Keep route files thin and push business logic into domain/state modules.
- Keep IPC payloads explicit and validated.

## 6. Definition of Done

A change is complete only when all are true:

- behavior implemented
- tests added or updated
- docs synced
- no boundary violations introduced
- no known regressions in lint, typecheck, or tests
- performance budgets and committed baselines are not regressed

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
