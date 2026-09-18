# ci-recovery-41ebc122f9d8 unblock journal

- Failing workflow on `41ebc122f9d8` was CI run `35070164269`. Only one job failed: **Android unit,
  lint, and package checks**, at the `Set up Android SDK` step, 24s in. Every other job on that run
  (build-and-test, all three browser E2E shards, accessibility, Electron smoke) passed, and the same
  single-job failure repeats on every CI run on `loop/rc` since `41ebc122` — including the current
  candidate `83f94aab` (runs `35086099665`, `35086095966`).
- The step never reached Gradle. `android-actions/setup-android@v4.0.1` ran
  `sdkmanager tools`, which printed `Warning: Failed to find package 'tools'` and exited 1. The
  workflows set no `packages` input, so the action used its own default, `tools platform-tools`.
  The obsolete `tools` package has been retired from Google's SDK repository, so that default can no
  longer resolve. Nothing in the repository changed: the last green Android job was `32d9ed73` on
  2026-09-13, and `git diff 32d9ed73..HEAD -- apps/gm-react/android apps/gm-react/capacitor.config.ts`
  is empty.
- Reproduced locally against the machine's SDK:
  `sdkmanager --sdk_root=/home/trinkle/Android tools` → `Failed to find package 'tools'`, exit 1 —
  byte-identical to the CI message. Cross-checked against
  `https://dl.google.com/android/repository/repository2-3.xml`: it lists `platform-tools`,
  `cmdline-tools;*` and `build-tools;*`, and there is no top-level `tools` package.
- Fix: pass `packages: platform-tools` explicitly to the three `setup-android` call sites
  (`ci.yml`, `validate.yml`, `release.yml`). This drops only the package that no longer exists.
  `platform-tools` is retained, and each workflow's next step already installs the real toolchain
  (`platforms;android-36`, `build-tools;36.0.0`, and for CI/release `emulator` and the API 36 system
  image), so the effective SDK is unchanged. No gate, assertion or job condition was relaxed — the
  Gradle gates (`testDebugUnitTest lintDebug assembleDebug bundleDebug`), the licence-status check
  and the instrumentation job are untouched.
- Verified the post-fix install path locally: `sdkmanager platform-tools` exits 0, and the full list
  each workflow requests — `platform-tools platforms;android-36 build-tools;36.0.0 emulator
system-images;android-36;google_apis;x86_64` — resolves and exits 0. `tools` was the only broken
  entry.
- Other local checks: the three workflow files parse as YAML and pass `prettier --check`,
  `pnpm gates` passed (6 gates owned and wired; docs check resolved 279 links across 255 reachable
  files; only the pre-existing RC-STB-2.7 file-size warnings), and `pnpm check:android` passed
  (18 XML files, 11 Java files, package versions agree).
- Not verified locally: the Gradle half of the job
  (`testDebugUnitTest lintDebug assembleDebug bundleDebug`). The renderer build and
  `cap sync android` both succeed here, but this machine has a JRE and no JDK, so `gradlew` aborts
  with `JAVA_HOME is set to an invalid directory` before configuring. That half of the job is for
  the central operator's run. It last passed green at `32d9ed73`, and nothing under
  `apps/gm-react/android/` has changed since, so the SDK setup step is the only known blocker.
- Unrelated observation, left alone: running `cap sync` locally rewrites the generated
  `apps/gm-react/android/capacitor.settings.gradle` to newer Capacitor versions than the committed
  copy records. That is this worktree's `node_modules` disagreeing with the committed generated
  file; CI regenerates the file during its own sync before Gradle reads it, so it is not a CI
  failure. The local edit was reverted rather than committed.
