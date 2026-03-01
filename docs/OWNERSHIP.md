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
| `src/routes/`        | Renderer route orchestration      | `@trent`         | Route-level composition, no direct storage access, accessibility    |
| `src/lib/state/`     | Renderer state/store layer        | `@trent`         | Side-effect boundaries, persistence via adapters, state consistency |
| `src/lib/ui/`        | Renderer presentation layer       | `@trent`         | Reusable component contracts, UX consistency, accessibility         |
| `src/lib/domain/`    | Shared domain logic               | `@trent`         | Pure logic, deterministic behavior, runtime-agnostic design         |
| `src/lib/markdown/`  | Markdown pipeline                 | `@trent`         | Parsing/sanitization safety, renderer output correctness            |
| `src/lib/platform/`  | Runtime integration adapters      | `@trent`         | Adapter boundaries, bridge contract correctness                     |
| `src/lib/runtime/`   | Renderer bootstrap/runtime wiring | `@trent`         | Startup sequencing, error handling, observability hooks             |
| `src/lib/types/`     | Shared contracts                  | `@trent`         | Backward compatibility, explicit schema evolution                   |
| `electron/`          | Trusted main/preload process      | `@trent`         | IPC validation, privilege boundaries, process lifecycle             |
| `mcp/`               | MCP server runtime                | `@trent`         | Tool contracts, staged write safety, renderer boundary isolation    |
| `tests/`             | Cross-runtime test coverage       | `@trent`         | Regression coverage, scenario quality, determinism                  |
| `scripts/`           | Developer tooling and automation  | `@trent`         | CLI stability, safe defaults, reproducibility                       |
| `.github/workflows/` | CI/CD and release gates           | `@trent`         | Gate reliability, branch protection, artifact integrity             |
| `docs/`              | Engineering documentation         | `@trent`         | Accuracy, source-of-truth alignment, maintainability                |

## Boundary Escalation Rules

- `src/*` -> `electron/*`: require explicit IPC contract review.
- `mcp/*` -> renderer-specific modules: prohibited (lint-enforced).
- `src/routes/*` -> storage adapters: prohibited (lint-enforced; must route via `src/lib/state/*`).
- Schema or persistence changes (`mcp/storage.ts`, `src/lib/types/*`) require docs and migration review.
