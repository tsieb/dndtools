# Testing

The full test/validation story lives in one place: **[VALIDATION.md](VALIDATION.md)**. This page is a
short pointer plus the non-negotiable testing rules.

## Where the tests are

| Layer              | Command                                                    | What runs                                                                         |
| ------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Core unit          | `pnpm --filter @dndtools/core test` (`pnpm test:critical`) | Vitest suite in `packages/core`                                                   |
| Cloud + transport  | `pnpm test:cloud`                                          | net/cloud unit + transport tests (`vitest.cloud.config.ts`)                       |
| React app unit     | `pnpm test:app`                                            | non-network app logic, storage, AI, and view-model tests (`vitest.app.config.ts`) |
| Core coverage      | `pnpm test:coverage:core`                                  | V8 HTML/JSON/text report with global and `src/security` regression floors         |
| Repo tooling       | `pnpm test:tooling`                                        | guardrail/tooling tests in `tests/unit/`                                          |
| All of the above   | `pnpm test`                                                | `test:critical` + `test:cloud` + `test:app` + `test:tooling`                      |
| Browser E2E        | `pnpm e2e`                                                 | Playwright specs in `apps/gm-react/tests/e2e/` (desktop + mobile Chromium)        |
| Accessibility gate | `pnpm a11y:gate`                                           | non-text contrast lint + Playwright axe gate (`a11y-axe-gate.spec.ts`) + report   |
| Whole application  | `pnpm validate`                                            | staged, capability-gated harness — see [VALIDATION.md](VALIDATION.md)             |

Fast smoke: `pnpm test:smoke` (boundary lint + typecheck). Pre-handoff gate: `pnpm check` (gates +
boundary lint + typecheck + `pnpm test`). CI also builds the production app, runs full lint, and uses
path-filtered jobs for sharded browser E2E, axe, and Electron smoke coverage. `validate` remains the
deep on-demand + scheduled sweep (`.github/workflows/validate.yml`).

Formatting is incremental: `pnpm format:check:changed` blocks CI when maintained files changed by a
branch are not Prettier-clean. The historical repo-wide `pnpm format:check` remains visible in the
validation report while the baseline expands; archived and generated material is excluded.

## Mandatory rules

- Every bug fix includes a regression test.
- New domain behavior in `packages/core` includes at least one unit test.
- User-critical UI changes include Playwright E2E coverage.
- Storage or sync write-path changes include state-transition/round-trip tests.
- CI or gate changes update this doc and [VALIDATION.md](VALIDATION.md) in the same change set.
