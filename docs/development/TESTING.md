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
| Android native     | `./gradlew testReleaseUnitTest lintRelease`                | Java/plugin unit checks + Android lint from `apps/gm-react/android`               |
| Android acceptance | API 36 signed-APK checklist                                | install, lifecycle, persistence, share/import, upgrade, Back, and Quick Map       |
| Whole application  | `pnpm validate`                                            | staged, capability-gated harness — see [VALIDATION.md](VALIDATION.md)             |

Fast smoke: `pnpm test:smoke` (boundary lint + typecheck). Pre-handoff gate: `pnpm check` (gates +
boundary lint + typecheck + `pnpm test`). CI also builds the production app, runs full lint, and uses
path-filtered jobs for sharded browser E2E, axe, and Electron smoke coverage. `validate` remains the
deep on-demand + scheduled sweep (`.github/workflows/validate.yml`).

The pre-Android baseline is 4,323 unit/tooling tests (core 3,759, cloud/transport 295, React app 196,
repo tooling 73) plus 29 logical mobile-responsive/map Playwright scenarios. Android capability,
secure-store, export, lifecycle/Back, notification, AI-provider, responsive, and Quick Map coverage is
additive; removing or skipping baseline coverage is not an acceptable way to make the alpha green.

Android's Java tests live in `apps/gm-react/android/app/src/test`; Keystore instrumentation lives in
`apps/gm-react/android/app/src/androidTest`. Renderer platform tests live beside their TypeScript
modules under `apps/gm-react/src/platform`. The release workflow uses JDK 21, API 36, Gradle 8.14.3,
and Android Gradle Plugin 8.13, verifies APK/AAB signatures, then installs and cold-launches the signed
APK on an API 36 emulator. The full emulator acceptance matrix is in the
[Android alpha runbook](../runbooks/android-alpha.md).

Formatting is incremental: `pnpm format:check:changed` blocks CI when maintained files changed by a
branch are not Prettier-clean. The historical repo-wide `pnpm format:check` remains visible in the
validation report while the baseline expands; archived and generated material is excluded.

## Mandatory rules

- Every bug fix includes a regression test.
- New domain behavior in `packages/core` includes at least one unit test.
- User-critical UI changes include Playwright E2E coverage.
- Storage or sync write-path changes include state-transition/round-trip tests.
- Android bridge changes include both a renderer contract test and a Java/plugin test where native
  behavior is involved. Keystore behavior must cover authenticated round-trip and tamper/wrong-key
  failure.
- Mobile UI changes cover compact portrait, short landscape, tablet/foldable, 200% text, reduced
  motion, forced colors, safe areas, and a virtual-keyboard-reduced viewport. Interactive targets are
  checked at 48px and critical/serious axe findings fail the gate.
- Quick Map changes cover pan/pinch, explicit edit arming, selection/movement, fog, projection,
  layers/history/generation, undo/redo, import/export, and preservation of precision geometry authored
  on desktop.
- CI or gate changes update this doc and [VALIDATION.md](VALIDATION.md) in the same change set.
