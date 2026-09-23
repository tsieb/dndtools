# ci-recovery-df379bf7b289 — Android rotation ANR before the portrait root check

## Failure

- CI run 35822355828 (`pull_request`, `df379bf7`) failed only **Android unit, lint, and package
  checks** at `Android emulator acceptance failed: rotation back to portrait did not re-render the
root destination`. The `push` run on the same SHA (35822351000) passed the identical job.
- The failure dump shows `mCurrentFocus=Window{... Application Not Responding: com.dndtools.gm}`
  while `mFocusedApp` is still `com.dndtools.gm/.MainActivity`. The process was not killed this
  time: the ANR dialog held focus, so every uiautomator dump for the next ~137 s showed the dialog
  and never the Command Center CTA.
- The logcat tail (`-t 300 '*:E'`) held one unrelated line, so the ANR reason was not captured.

## Cause

`e1a2ba4b` (ci-recovery-7c451039a69e) already waits for the rendered root destination after the
force-stop restart and after the portrait restore. The landscape leg still had no wait: rotate to
`user_rotation 1`, a fixed `sleep 2`, then restore `user_rotation 0` straight away. That stacks
two configuration changes, and two full WebView relayouts, on a `-gpu swiftshader_indirect`
emulator. The app's main thread stalled into an ANR between the restart render (05:39:54) and the
first portrait check. Without the ANR report the stalled event cannot be named. The rotation leg
is the only unsynchronised step in that window.

## Fix

`scripts/android-emulator-acceptance.sh`:

- new `wait_for_settled_app_rotation N`: the app's own activity window (`$PACKAGE_ID/…`, which
  the ANR dialog's `Application Not Responding: $PACKAGE_ID` title does not match) holds focus,
  and two consecutive idle uiautomator dumps carry `<hierarchy rotation="N">` and the app package;
- replaces the fixed `sleep 2` with `wait_for_settled_app_rotation 1` before the portrait restore,
  and adds `wait_for_settled_app_rotation 0` before the existing portrait root check;
- `fail()` now also prints the `ANR in` / `Input dispatching timed out` report from the
  main/system/crash logcat buffers, so the next ANR comes with its reason.

No assertion is removed or relaxed. The process must still survive rotation with the same pid,
the vault must remain, the root destination must re-render and Back must minimize. Both new waits
`fail` closed. `tests/unit/android-emulator-acceptance.test.ts` pins the ordering.

## Verification

- `bash -n scripts/android-emulator-acceptance.sh`: ok.
- `pnpm exec vitest run tests/unit/android-emulator-acceptance.test.ts`: 5/5 pass. Mutation
  check: with the HEAD script restored, the new test fails
  (`expected … to contain 'rotation=\"$expected\"'`).
- A bash harness with a fake `adb` exercised the helper: app window at rotation 1 settles; the
  app window still at rotation 0 does not; the ANR dialog at rotation 1 does not.
- The emulator cannot run on this host (see `ci-recovery-a967a64d7c1f.md`), so the CI Android job
  is the end-to-end proof.
