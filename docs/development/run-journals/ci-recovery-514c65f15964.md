# ci-recovery-514c65f15964 — System UI ANR dialog over the first-run check

## Failure

- CI run 36220588362 (`pull_request`, `514c65f1`) failed only **Android unit, lint, and package
  checks**. The failing step was `Run instrumentation and lifecycle acceptance on API 36`, and the
  error was `Android emulator acceptance failed: first-run setup did not become accessible`. All other
  jobs passed. The `push` run on the same SHA (36220585072) passed the identical job.
- Instrumentation passed (`Finished 8 tests`). The acceptance script installed the APK and cold
  launched it at 05:33:13, then waited about 2.5 minutes for `Skip setup` before failing.
- The dump shows `mCurrentFocus=Window{... Application Not Responding: com.android.systemui}` while
  `mFocusedApp` was `com.dndtools.gm/.MainActivity`. The dialog belonged to System UI. The app was
  not the process that stalled.
- The ANR report came from before the app was installed:
  `05:32:16 ANR in com.android.systemui — Reason: executing service
com.android.systemui/.keyguard.KeyguardService, waited 20077ms`. Load was 15.24 on the guest,
  with CPU PSI `some avg10=86.15` and a `gms.persistent` startup ANR a second later. That is the
  cold-booted emulator stalling during instrumentation.

## Cause

The emulator raised an ANR for one of its own processes (System UI) during boot. Its
"System UI isn't responding" dialog stayed on top and kept input focus. So every uiautomator dump
the first-run wait took read the dialog instead of the app. Nothing dismissed the dialog, and the
wait timed out.

Commit `514c65f1` only changes how the Playwright e2e port is derived. The job failed before any
app-specific assertion could run. The failure is environmental and intermittent, which fits the
green push run on the same SHA.

## Fix

- `scripts/android-emulator-acceptance.sh`: a new `dismiss_foreign_anr_dialog` helper runs inside
  `dump_ui`. If the dump contains the ANR dialog's `android:id/aerr_wait` button and the focused
  window is `Application Not Responding: <package>` for a package other than the app's, it taps
  **Wait** and dumps again (up to three times). Wait leaves the stalled system process alone. The
  script logs each dismissal to stderr, so a run that needed one still shows it.
- ANR dialogs for the app's own processes (`com.dndtools.gm`, `com.dndtools.gm:*`) are never
  touched. They still block and fail whichever assertion they cover, as `24984b6c` required, and
  `fail` still prints the ANR report.
- `tests/unit/android-emulator-acceptance.test.ts`: a behavioural test extracts `focused_window`,
  `dismiss_foreign_anr_dialog` and `dump_ui` from the script and runs them against a fake `adb`.
  With a System UI ANR, Wait gets tapped at its centre and the next dump shows the app. With an ANR
  from `com.dndtools.gm` or `com.dndtools.gm:remote`, nothing is tapped and the dialog dump comes
  back unchanged.

No assertion, timeout or workflow setting changed.

## Verification

- `bash -n scripts/android-emulator-acceptance.sh`: ok.
- `pnpm exec vitest run tests/unit/android-emulator-acceptance.test.ts`: 7/7 pass.
- Mutation checks:
  - Without the own-package guard, the test fails with
    `the app's own ANR dialog (com.dndtools.gm) was dismissed`.
  - With `HEAD`'s `dump_ui`, the test fails with
    `Wait was not tapped at the centre of its button`.
- `eslint` on the test file: clean.
- I did not run a local emulator. An emulator on this host would not reproduce a System UI boot ANR
  on demand. The CI Android job is the real check.
