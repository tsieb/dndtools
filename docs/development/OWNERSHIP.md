# Ownership Map

This map defines the code ownership model for architectural boundary reviews. If a `CODEOWNERS` file is added, keep it in sync with this map.

## Ownership Policy

- Every production directory has an explicit owner for review routing.
- Owners are accountable for boundary integrity, API changes, and migration safety in their area.
- Cross-boundary changes require review from each affected owner.
- If ownership changes, update this file (and `CODEOWNERS` if present) in the same PR.

## Module Ownership

| Module path                   | Architectural boundary                          | Primary owner(s) | Review focus                                                                              |
| ----------------------------- | ----------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| `apps/gm-react/src/screens/`  | Route views (React)                             | `@jade`          | Dispatch-only screens (no durable-state mutation), composition, accessibility             |
| `apps/gm-react/src/app/`      | App shell, nav, command palette                 | `@jade`          | Navigation contract, shell wiring, screen kit                                             |
| `apps/gm-react/src/ds/`       | Design system components                        | `@jade`          | Reusable component contracts, UX consistency, accessibility                               |
| `apps/gm-react/src/styles/`   | Tokens + global CSS                             | `@jade`          | Token contract, contrast, single-writer discipline                                        |
| `apps/gm-react/src/platform/` | Shared platform capability + storage services   | `@jade`          | Runtime capabilities, lifecycle, export, secure-store, Dexie boundary, persistence safety |
| `apps/gm-react/src/net/`      | LAN/serverless WebRTC remote play               | `@jade`          | Transport contract, player-safe view models, command-request stamping                     |
| `apps/gm-react/src/cloud/`    | AWS cloud backup + Cognito auth                 | `@jade`          | Auth flow, E2EE backup, token/secret handling                                             |
| `apps/gm-react/src/runtime/`  | Renderer bootstrap/runtime wiring               | `@jade`          | Startup sequencing, error handling                                                        |
| `apps/gm-react/electron/`     | Electron desktop shell (main/preload/discovery) | `@jade`          | IPC validation, privilege boundaries, CSP, process lifecycle                              |
| `apps/gm-react/android/`      | Capacitor Android shell + native plugins        | `@jade`          | Gradle/API compatibility, Keystore, intents, WebView/network policy, signing boundary     |
| `packages/core/`              | Framework-independent shared core               | `@jade`          | Commands, reducers, permissions, queries, schemas, registries; no React/DOM/Node imports  |
| `packages/cloud-fns/`         | Cloud Lambdas                                   | `@jade`          | Handler contracts, auth, input validation                                                 |
| `infra/`                      | AWS SAM infrastructure                          | `@jade`          | Template safety, least privilege, deploy integrity (`infra/README.md`)                    |
| `scripts/`                    | Developer tooling, gates, validation            | `@jade`          | CLI stability, gate reliability, reproducibility                                          |
| `.github/workflows/`          | CI/CD and release gates                         | `@jade`          | Gate reliability, branch protection, artifact integrity                                   |
| `docs/`                       | Engineering documentation                       | `@jade`          | Accuracy, source-of-truth alignment, maintainability                                      |

## Boundary Escalation Rules

- `packages/core/*` importing React / Svelte / DOM / Node / Electron / Capacitor / Android / cloud:
  prohibited (lint-enforced by `scripts/boundary-lint.ts`).
- `apps/gm-react/src/*` (renderer) importing Node-only APIs: prohibited; Electron-only code lives
  under `apps/gm-react/electron/`, Android-native code under `apps/gm-react/android/`, and feature
  code consumes `PlatformCapabilities` rather than native globals.
- `apps/gm-react/src/screens/*` mutating durable state directly: prohibited — screens dispatch commands; persistence routes only through `apps/gm-react/src/platform/storage/coreStore.ts`.
- Schema or persistence changes (`packages/core/src/schemas/*`, `packages/core/src/migration/*`) require docs and migration review.
