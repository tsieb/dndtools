# Testing

The full test/validation story lives in one place: **[VALIDATION.md](VALIDATION.md)**. This page is a
short pointer plus the non-negotiable testing rules.

## Where the tests are

| Layer | Command | What runs |
| --- | --- | --- |
| Core unit | `pnpm --filter @dndtools/core test` (`pnpm test:critical`) | Vitest suite in `packages/core` |
| Cloud + transport | `pnpm test:cloud` | net/cloud unit + transport tests (`vitest.cloud.config.ts`) |
| Repo tooling | `pnpm test:tooling` | guardrail/tooling tests in `tests/unit/` |
| All of the above | `pnpm test` | `test:critical` + `test:cloud` + `test:tooling` |
| Browser E2E | `pnpm e2e` | Playwright specs in `apps/gm-react/tests/e2e/` (desktop + mobile Chromium) |
| Accessibility gate | `pnpm a11y:gate` | non-text contrast lint + Playwright axe gate (`a11y-axe-gate.spec.ts`) + report |
| Whole application | `pnpm validate` | staged, capability-gated harness — see [VALIDATION.md](VALIDATION.md) |

Fast smoke: `pnpm test:smoke` (boundary lint + typecheck). Pre-handoff gate: `pnpm check` (gates +
boundary lint + typecheck + `pnpm test`). CI runs the fast gates on every push/PR; `validate` is the
deep on-demand + scheduled sweep (`.github/workflows/validate.yml`).

## Mandatory rules

- Every bug fix includes a regression test.
- New domain behavior in `packages/core` includes at least one unit test.
- User-critical UI changes include Playwright E2E coverage.
- Storage or sync write-path changes include state-transition/round-trip tests.
- CI or gate changes update this doc and [VALIDATION.md](VALIDATION.md) in the same change set.
