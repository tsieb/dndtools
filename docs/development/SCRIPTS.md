# Script Reference

Workspace scripts defined in the root `package.json`. Run from the repo root with `pnpm <script>`.
Per-app scripts live in `apps/gm-react/package.json` and `packages/core/package.json`.

For the full test/validation story (scopes, gating, the `pnpm validate` harness), see
`docs/development/VALIDATION.md` — it is the source of truth; this file is just the inventory.

---

## Build & Dev

| Script              | Purpose                                                       |
| ------------------- | ------------------------------------------------------------- |
| `pnpm dev`          | Start the GM app (`@dndtools/gm-react`) Vite dev server       |
| `pnpm build`        | Build core, cloud Lambda bundles, then the React app          |
| `pnpm build:demo`   | Build the GM app in demo mode                                 |
| `pnpm preview`      | Preview the built GM app                                      |
| `pnpm preview:demo` | Preview the demo build                                        |
| `pnpm typecheck`    | Typecheck core + cloud functions + React app (`tsc --noEmit`) |

## Desktop (Electron, optional)

| Script                   | Purpose                                           |
| ------------------------ | ------------------------------------------------- |
| `pnpm desktop:dev`       | Run the GM app in the Electron shell (dev)        |
| `pnpm desktop:build`     | Package the Electron desktop app                  |
| `pnpm desktop:build:dir` | Package into an unpacked directory (no installer) |

## Android (Capacitor, optional)

These scripts are package-local; invoke them from the root with
`pnpm --filter @dndtools/gm-react <script>`.

| Script         | Purpose                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `android:sync` | Build the renderer and synchronize it into the tracked Android project |
| `android:open` | Open the Android project in Android Studio                             |
| `android:run`  | Build/sync and run through Capacitor                                   |

Native unit/lint/package commands use the pinned wrapper from `apps/gm-react/android`, for example
`./gradlew testReleaseUnitTest lintRelease assembleRelease bundleRelease`. See the
[Android alpha runbook](../runbooks/android-alpha.md) for prerequisites and signing.

## Tests

| Script                    | Purpose                                                                      |
| ------------------------- | ---------------------------------------------------------------------------- |
| `pnpm test`               | `test:critical` + `test:cloud` + `test:app` + `test:tooling`                 |
| `pnpm test:critical`      | Core unit tests (`@dndtools/core`)                                           |
| `pnpm test:cloud`         | Net / cloud / transport tests (`vitest run --config vitest.cloud.config.ts`) |
| `pnpm test:app`           | Non-network React app tests (`vitest run --config vitest.app.config.ts`)     |
| `pnpm test:coverage:core` | Core coverage report + global/security regression floors                     |
| `pnpm test:tooling`       | Repo-level tooling/guardrail tests (`vitest run`)                            |
| `pnpm test:smoke`         | Fast smoke gate: boundary lint + typecheck                                   |
| `pnpm e2e`                | Playwright (desktop + mobile Chromium) against the GM app                    |

## Verify (headless behavior checks)

| Script                                                                    | Purpose                                                                                                                |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                                             | Self-contained `verify:routes` + `verify:roundtrip` + `verify:canvas` + `verify:ui`; manages a local-first Vite server |
| `pnpm verify:routes` / `verify:roundtrip` / `verify:canvas` / `verify:ui` | Individual node checks under `apps/gm-react/scripts/`; caller supplies Vite on port 5273                               |

## Lint & Format

| Script                      | Purpose                                                                |
| --------------------------- | ---------------------------------------------------------------------- |
| `pnpm lint`                 | `eslint .` + boundary lint + non-text contrast lint                    |
| `pnpm lint:boundary`        | Architectural boundary lint (`scripts/boundary-lint.ts`)               |
| `pnpm lint:fix`             | ESLint auto-fix                                                        |
| `pnpm tokens:contrast`      | Semantic design-token contrast lint (`scripts/token-contrast-lint.ts`) |
| `pnpm format`               | Prettier write                                                         |
| `pnpm format:check`         | Prettier check (CI-safe)                                               |
| `pnpm format:check:changed` | Blocking Prettier check for maintained files changed in this branch    |

## Accessibility

| Script               | Purpose                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm a11y:contrast` | Non-text contrast lint (`scripts/a11y-nontext-contrast-lint.ts`)                                 |
| `pnpm a11y:axe`      | Playwright axe gate (`apps/gm-react/tests/e2e/a11y-axe-gate.spec.ts`, desktop + mobile Chromium) |
| `pnpm a11y:report`   | Merge per-worker axe artifacts and evaluate the gate (`scripts/a11y-axe-report.ts`)              |
| `pnpm a11y:gate`     | `a11y:contrast` + `a11y:axe` + `a11y:report`                                                     |

## Quality Gates & Validation

| Script                                                                     | Purpose                                                                                 |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm gates`                                                               | Enforce the tiered quality-gate registry (`scripts/quality-gates.ts`), fails closed     |
| `pnpm audit:repo`                                                          | Repo-boundary guardrail tests (`tests/unit/ci-guardrails.test.ts`)                      |
| `pnpm security:secrets`                                                    | Scan tracked files for high-confidence committed credentials                            |
| `pnpm cloud:drift`                                                         | Detect CloudFormation drift (`dev` by default; accepts a stage)                         |
| `pnpm release:verify`                                                      | Verify release versions, the six desktop/Android packages, checksums, and SPDX coverage |
| `pnpm check`                                                               | `gates` + boundary lint + typecheck + full test suite                                   |
| `pnpm validate`                                                            | Whole-application validation harness (`scripts/validate/`) — see VALIDATION.md          |
| `pnpm validate:fast` / `validate:live` / `validate:full` / `validate:list` | Harness variants (fast subset / opt-in live AWS / full / list checks)                   |
| `pnpm feature-audit`                                                       | Feature-gap drift audit (`scripts/validate/feature-audit.ts`)                           |

## Per-app scripts

- `apps/gm-react/package.json`: `dev` (`vite --port 5273`), `build`, `preview` (:4273),
  `typecheck`, `verify:p2p`, `verify:p2p-live`, `desktop:dev`, `desktop:build`, `android:sync`,
  `android:open`, and `android:run`.
- `packages/core/package.json`: `build` & `typecheck` (`tsc -p tsconfig.json --noEmit`), `test` (`vitest run`).
