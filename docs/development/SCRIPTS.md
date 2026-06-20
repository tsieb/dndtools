# Script Reference

Workspace scripts defined in the root `package.json`. Run from the repo root with `pnpm <script>`.
Per-app scripts live in `apps/gm/package.json` and `packages/core/package.json`.

---

## Build & Dev

| Script          | Purpose                                            |
| --------------- | -------------------------------------------------- |
| `pnpm dev`      | Start the GM app (`@dndtools/gm`) Vite dev server  |
| `pnpm build`    | Build `@dndtools/core`, then the GM app            |
| `pnpm preview`  | Preview the built GM app                           |
| `pnpm typecheck`| Typecheck `@dndtools/core` + `@dndtools/gm`        |

## Tests

| Script               | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `pnpm test`          | Full suite: core unit + GM unit + repo tooling tests             |
| `pnpm test:tooling`  | Repo-level tooling/guardrail tests (`tests/unit/`) via Vitest    |
| `pnpm test:critical` | Curated critical subset (core unit tests)                        |
| `pnpm test:smoke`    | Fast smoke gate: boundary lint + typecheck                       |
| `pnpm e2e`           | Playwright (desktop + mobile Chromium) against the GM app        |

## Lint & Format

| Script               | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `pnpm lint`          | ESLint + boundary lint + non-text contrast lint                  |
| `pnpm lint:boundary` | Processing/display + platform-primitive boundary lint            |
| `pnpm lint:fix`      | ESLint auto-fix                                                  |
| `pnpm tokens:contrast` | Semantic design-token contrast lint                            |
| `pnpm format`        | Prettier write                                                  |
| `pnpm format:check`  | Prettier check (CI-safe)                                        |

## Accessibility

| Script             | Purpose                                                            |
| ------------------ | ----------------------------------------------------------------- |
| `pnpm a11y:contrast` | Non-text contrast lint                                          |
| `pnpm a11y:axe`    | Playwright axe gate (desktop + mobile Chromium)                   |
| `pnpm a11y:report` | Merge per-worker axe artifacts and evaluate the gate              |
| `pnpm a11y:gate`   | `a11y:contrast` + `a11y:axe` + `a11y:report`                     |

## Quality Gates

| Script           | Purpose                                                              |
| ---------------- | ------------------------------------------------------------------- |
| `pnpm gates`     | Enforce the tiered quality-gate registry (PLAT-010), fails closed   |
| `pnpm audit:repo`| Repo-boundary guardrail tests (`tests/unit/ci-guardrails.test.ts`)  |
| `pnpm check`     | `gates` + boundary lint + typecheck + full test suite               |
