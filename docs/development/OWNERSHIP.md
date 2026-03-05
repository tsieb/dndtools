# Ownership Map

This map defines the code ownership model used by `CODEOWNERS` and architectural boundary reviews.

## Ownership Policy

- Every production directory has an explicit owner for review routing.
- Owners are accountable for boundary integrity, API changes, and migration safety in their area.
- Cross-boundary changes require review from each affected owner.
- If ownership changes, update `CODEOWNERS` and this file in the same PR.

## Module Ownership

| Module path          | Architectural boundary            | Primary owner(s) | Review focus                                                        |
| -------------------- | --------------------------------- | ---------------- | ------------------------------------------------------------------- |
| `src/routes/`        | Renderer route orchestration      | `@jade`          | Route-level composition, no direct storage access, accessibility    |
| `src/lib/state/`     | Renderer state/store layer        | `@jade`          | Side-effect boundaries, persistence via adapters, state consistency |
| `src/lib/ui/`        | Renderer presentation layer       | `@jade`          | Reusable component contracts, UX consistency, accessibility         |
| `src/lib/domain/`    | Shared domain logic               | `@jade`          | Pure logic, deterministic behavior, runtime-agnostic design         |
| `src/lib/markdown/`  | Markdown pipeline                 | `@jade`          | Parsing/sanitization safety, renderer output correctness            |
| `src/lib/platform/`  | Runtime integration adapters      | `@jade`          | Adapter boundaries, bridge contract correctness                     |
| `src/lib/runtime/`   | Renderer bootstrap/runtime wiring | `@jade`          | Startup sequencing, error handling, observability hooks             |
| `src/lib/types/`     | Shared contracts                  | `@jade`          | Backward compatibility, explicit schema evolution                   |
| `electron/`          | Trusted main/preload process      | `@jade`          | IPC validation, privilege boundaries, process lifecycle             |
| `mcp/`               | MCP server runtime                | `@jade`          | Tool contracts, staged write safety, renderer boundary isolation    |
| `tests/`             | Cross-runtime test coverage       | `@jade`          | Regression coverage, scenario quality, determinism                  |
| `scripts/`           | Developer tooling and automation  | `@jade`          | CLI stability, safe defaults, reproducibility                       |
| `.github/workflows/` | CI/CD and release gates           | `@jade`          | Gate reliability, branch protection, artifact integrity             |
| `docs/`              | Engineering documentation         | `@jade`          | Accuracy, source-of-truth alignment, maintainability                |

## Boundary Escalation Rules

- `src/*` -> `electron/*`: require explicit IPC contract review.
- `mcp/*` -> renderer-specific modules: prohibited (lint-enforced).
- `src/routes/*` -> storage adapters: prohibited (lint-enforced; must route via `src/lib/state/*`).
- Schema or persistence changes (`mcp/storage.ts`, `src/lib/types/*`) require docs and migration review.
