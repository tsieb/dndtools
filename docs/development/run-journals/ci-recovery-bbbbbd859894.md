# ci-recovery-bbbbbd859894: our Wait tap made the app ANR during cold launch

## Failure

- CI run 36255858538 (`pull_request`, `bbbbbd85`) failed only the **Android unit, lint, and
  package checks** job. The failing step was `Run instrumentation and lifecycle acceptance on API 36`
  with `Android emulator acceptance failed: first-run setup did not become accessible`. Every other
  job passed. The `push` run on the same SHA (36255854877) passed the same Android job.
- Instrumentation passed (`Finished 8 tests`). The acceptance script cold launched the fresh APK at
  16:44:40. At 16:44:47 it logged
  `choosing Wait on a system ANR dialog (Application Not Responding: com.android.systemui)`. That is
  the `dismiss_foreign_anr_dialog` path from `ci-recovery-514c65f15964`.
- Four seconds after the tap, the app ANR'd:
  `16:44:51 ANR in com.dndtools.gm (.MainActivity) — Input dispatching timed out ... Waited 5000ms
for TouchModeEvent(inTouchMode=true)`. Guest load was 43.33, with CPU PSI `some avg10=94.00`. The
  app's own ANR dialog then held focus until the first-run wait gave up at 16:47:17. As designed,
  nothing dismissed that dialog.
- The System UI ANR report was logged at 16:44:06, during instrumentation. So its dialog was already
  up before the app was installed and launched.

## Cause

The fix in `8dd5f664` taps Wait on a foreign ANR dialog whenever `dump_ui` finds one. On a cold
launch, the first dump comes seconds after `am start`, while MainActivity's main thread is still
starting the WebView. The display was not in touch mode, so the tap switched it into touch mode.
When the System UI dialog closed, that `TouchModeEvent` went to MainActivity, which could not handle
it within 5 s on a CPU-starved guest. So the dismissal itself caused the app ANR that fails the job.

Commit `bbbbbd85` only changes a Playwright widget-kit spec and a journal. The failure is
environmental and intermittent, which fits the green push run on the same SHA.

## Fix

- `scripts/android-emulator-acceptance.sh`: `launch_app` now calls a new
  `clear_foreign_anr_dialogs` before `am start`. While the focused window is an
  `Application Not Responding:` dialog, it runs `dump_ui`, which chooses Wait only on a foreign
  dialog. It returns once focus has been on something else for two consecutive polls. This is the
  launcher before the first cold launch and after each force-stop. Any touch-mode switch therefore
  reaches the launcher, not an app that is still starting.
- If an ANR dialog still holds focus after 30 polls, the launch fails with
  `an ANR dialog still held focus before the app launched`. That covers the app's own dialog, which
  is still never dismissed. `fail` prints the ANR report.
- The dismissal in `dump_ui` is unchanged, so a foreign dialog raised mid-run is still handled.
- `tests/unit/android-emulator-acceptance.test.ts`: a new behavioural test extracts `launch_app` and
  its helpers and runs them against a fake `adb`. With a System UI ANR dialog up, the order of events
  must be `tap` then `launch`. With the app's own ANR dialog up, the script must exit 1 with the new
  message, without tapping or launching.

No assertion, timeout or workflow setting changed.

## Verification

- `bash -n scripts/android-emulator-acceptance.sh`: ok.
- `pnpm exec vitest run tests/unit/android-emulator-acceptance.test.ts`: 8/8 pass.
- Mutation check: with the `clear_foreign_anr_dialogs` call removed from `launch_app`, the new test
  fails with `Wait must be chosen before the app starts: expected [ 'launch' ] to deeply equal
[ 'tap', 'launch' ]`.
- `eslint` and `prettier --check` on the test file: clean.
- I did not run a local emulator. An emulator on this host cannot produce a System UI boot ANR on
  demand. The CI Android job is the real check.
