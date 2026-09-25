# ci-recovery-4b276e85d570 — Android FocusEvent ANR on the offline cold relaunch

## Failure

- CI run 36087978748 (`pull_request`, `4b276e85`) failed only **Android unit, lint, and package
  checks**, at `Android emulator acceptance failed: Session did not render after offline process
death`. The `push` run on the same SHA (36087973680) passed the whole CI workflow, including this
  job. Instrumentation (8/8) and every acceptance step before the offline one passed.
- The failure dump has the ANR report:
  `ANR in Window{... com.dndtools.gm/com.dndtools.gm.MainActivity} ... Waited 5000ms for
FocusEvent(hasFocus=true)` at 03:05:16.51. That is the same failure class as `e1a2ba4b`,
  `20ea1aec` and `d50b657a`. This time it came on the cold relaunch in `offline process-death
recovery`, not on the rotation leg.
- Timeline: the step printed at 03:05:08.89. The WebView's GPU instance for the relaunched app was
  created at 03:05:11.32, and the stuck FocusEvent was sent at about 03:05:11.5, which is right at
  first display. So the main thread stalled for 5 s during the relaunch itself, before the script
  sent any input. Before the relaunch, the step toggles airplane mode, disables data and Wi-Fi,
  checks the settings flags and force-stops the app. That all took about 2.5 s.
- Guest state at the ANR: load 8.93 / 11.33 / 5.29, CPU PSI `some avg300=31.34`. Memory PSI was
  low (`full avg300=0.06`), so the 4096M bump in `d50b657a` did its job, and this is CPU
  contention, not paging. Right after the ANR, the app was at 176%, with `RenderThread` at 84% and
  `Chrome_InProcGp` at 61%, almost all of it kernel time. That is swiftshader rendering of the cold
  WebView's first frames.

## Cause

The step checks `airplane_mode_on` and `wifi_on`, but those settings flip as soon as the toggle is
accepted. The radio teardown, the loss of the default network and the
`AIRPLANE_MODE`/`CONNECTIVITY_CHANGE` broadcast fan-out to every registered receiver happen after
that. The script force-stopped and relaunched in the middle of all this. So the cold WebView's
first frames competed with the teardown on the 2-core software-GPU guest, and the main thread
missed the focus-event deadline. The ANR dialog then held focus, so the `Session` tap never
reached the app, and every dump for the next 2 minutes lacked `LIVE SESSION`.

There is also a correctness gap. Nothing checked that the device had actually lost its network
before the "offline" relaunch, so a green run did not strictly prove offline boot.

`4b276e85` (and the RC-POL-1.9 commits under it) do not touch the Android shell, the Session route
or the script. The green push run on the same SHA confirms that this failure is intermittent and
environmental.

## Fix

- `scripts/android-emulator-acceptance.sh`:
  - A new `default_network` helper reads ConnectivityService's `Active default network:` dump line.
    Its format was checked against AOSP `ConnectivityService.java` on `main`, which prints `none`
    when there is no default network. After the Wi-Fi check, the step waits up to 30 s for `none`
    and fails closed with `a default network remained during offline acceptance`. This adds an
    assertion.
  - It then runs `am wait-for-broadcast-idle`. That command is present in the Android 16
    `ActivityManagerShellCommand`. It drains the broadcast fan-out before the force-stop. It only
    sets up a precondition on load, so it is bounded by `timeout 120` and moves on either way.
  - After the offline root renders, `wait_for_settled_app_rotation 0` runs before the `Session` tap.
    The app's own window must hold focus in two consecutive idle dumps. This is the same guard
    `d50b657a` added after the new-process restart. It fails closed with
    `the offline relaunch did not settle before Session`, which also names an ANR dialog directly
    instead of timing out later on `LIVE SESSION`.
- `tests/unit/android-emulator-acceptance.test.ts`: a new contract test pins this order inside the
  offline step: Wi-Fi off, then no default network, then broadcast idle, then force-stop, then the
  rendered root, then the settle, then the `Session` tap.

No assertion was removed or relaxed. The ANR dialog is still neither dismissed nor tolerated.
Offline boot, vault survival, the restored session command and the return to root are all still
required.

## Verification

- `bash -n scripts/android-emulator-acceptance.sh`: ok.
- `default_network` against a stub `adb` that prints a CRLF dump: `none` is read as offline and
  `100` as online.
- `pnpm exec vitest run tests/unit/android-emulator-acceptance.test.ts`: 6/6 pass.
- Mutation checks. With the `HEAD` script restored, the new test fails
  (`expected ... to contain 'Active default network: '`). With only the settle line removed, it
  fails with `expected 607 to be less than 563`.
- `pnpm exec vitest run tests/unit`: 29 files, 219 tests pass. `eslint` and `prettier --check` pass
  on the changed files, and so does `node scripts/check-android.mjs`.
- Not verified on a device. The local emulator (37.1.11, API 36 `google_apis` x86_64) now exists
  on this host but SIGSEGVs in `qemu-system-x86_64-headless` during a full startup. It did so
  twice: once with the CI flags (`-gpu swiftshader_indirect -memory 4096`) and once more with
  `-feature -Vulkan` added (coredumps 1812333 and 1817111, 2026-09-24). The CI APK artifact
  (`android-checks`) was downloaded for a local run but could not be installed. The CI Android job
  is the end-to-end proof. This is a roughly 1-in-20 failure, so a single green run is weak
  evidence. If it comes back, check whether the ANR's FocusEvent timestamp still falls right at
  first display, and compare the CPU PSI numbers with the ones above.
