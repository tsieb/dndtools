# Development Standards

This document defines the engineering rules that apply to every code change in this repository.

## 1. Prerequisites

- Node.js 22.13+
- pnpm 10.34.5 (the exact version pinned in `package.json` and CI)
- Electron desktop is optional; a packaged-app smoke run needs a display.
- Android work requires JDK 21 plus Android SDK/API 36 and build-tools 36.0.0; use the pinned Gradle
  8.14.3 wrapper and Android Gradle Plugin 8.13. See
  [`../runbooks/android-alpha.md`](../runbooks/android-alpha.md).

### Android preflight and local compilation

`pnpm check:android` needs only the installed Node dependencies, so it runs first in `pnpm check`
without Java or an Android SDK. It parses every XML file under `apps/gm-react/android` (excluding
`build`, `.gradle`, and `node_modules` output), checks the Gradle `major.minor.patch` contract against
both root and GM package versions, and requires those versions to agree. It also rejects related
standard Java exception types in multi-catches, including `SecurityException | RuntimeException`.
The Java guard covers the standard hierarchy listed in `scripts/check-android.mjs`; it does not
resolve arbitrary imported or application-defined exception hierarchies or prove Java compilation.

Install a **JDK 21** with both `java` and `javac`. An empty `/usr/lib/jvm/java-21-openjdk` directory
or a working JRE is insufficient. For Linux, configure the signed repository using the
[official Adoptium package instructions](https://adoptium.net/installation/linux/), then install:

```bash
# Debian/Ubuntu, after configuring the Adoptium repository:
sudo apt update
sudo apt install temurin-21-jdk
# RPM distributions, after configuring the Adoptium repository:
sudo dnf install temurin-21-jdk
```

Use the command for your distribution. Set `JAVA_HOME` to the installed JDK directory (find it with
`dpkg -L temurin-21-jdk` or `rpm -ql temurin-21-jdk`, looking for `bin/javac`), then verify:

```bash
export JAVA_HOME=/absolute/path/to/installed/jdk-21
export PATH="$JAVA_HOME/bin:$PATH"
test -x "$JAVA_HOME/bin/java" && test -x "$JAVA_HOME/bin/javac"
java -version
javac -version
```

Both versions must report 21. Install the SDK/API 36 and build-tools 36.0.0 using the
[Android runbook](../runbooks/android-alpha.md#local-prerequisites), set `ANDROID_HOME`, and run
from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm check:android
pnpm --filter @dndtools/gm-react android:sync
cd apps/gm-react/android
./gradlew --stop
./gradlew --version
./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug
```

Confirm Gradle reports JDK 21; check any `org.gradle.java.home` override if it does not.
The debug APK is `apps/gm-react/android/app/build/outputs/apk/debug/app-debug.apk`.
A passing static preflight is only an early guard; record a successful Gradle run before claiming
that the native build compiles. Emulator and release-signing acceptance remain in the runbook.

For historical regression verification, export an old tree to a temporary directory and run
`pnpm check:android /absolute/path/to/exported-tree` from the current checkout. This uses the new
checker against the old Android sources and package versions without changing branches.

## 2. Script Surface

Canonical references:

- `docs/development/SCRIPTS.md` - complete script inventory and use cases
- `docs/development/VALIDATION.md` - test/validation story and the `pnpm validate` harness
- `docs/development/GIT_WORKFLOW.md` - branch model and CI gates

High-signal commands:

- `pnpm check` - Android static preflight + `gates` + boundary lint + typecheck + full test suite (pre-handoff gate)
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

- Shared core (`packages/core`) is framework-independent: it imports NO React, Svelte, DOM, Node,
  Electron, Capacitor, Android, or cloud APIs.
- The renderer (`apps/gm-react/src`) must not import Node-only APIs; Electron main/preload live under `apps/gm-react/electron` and must not import renderer-only modules except shared types.
- Renderer features consume `PlatformCapabilities` from `apps/gm-react/src/platform/capabilities.ts`;
  they do not probe native globals. Android Java/plugin code stays under `apps/gm-react/android`.
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
- Android changes pass the matching Gradle, API 36 emulator, signing, responsive, accessibility, and
  persistence checks in the Android runbook

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
