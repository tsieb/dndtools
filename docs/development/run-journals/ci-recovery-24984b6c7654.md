# ci-recovery-24984b6c7654 — Android landscape-rotation ANR after the cold restart

## Failure

- CI run 36079457931 (`pull_request`, `24984b6c`) failed only **Android unit, lint, and package
  checks**, at `Android emulator acceptance failed: the app did not settle in landscape`. The
  `push` run on the same SHA (36079453096) passed the identical job, and the Android job had been
  green on every CI run since `20ea1aec` (2026-09-23). All other CI jobs in the failing run passed.
- The dump shows `mCurrentFocus=Window{... Application Not Responding: com.dndtools.gm}` over
  `MainActivity`. Thanks to the ANR logcat capture added in `20ea1aec`, the reason is now known:
  `Input dispatching timed out ... Waited 5157ms for FocusEvent(hasFocus=true)`. InputDispatcher
  then logged `spent 5413ms processing FocusEvent`, so the app recovered about 90 ms after the ANR
  fired. The ANR dialog kept focus anyway, and `wait_for_settled_app_rotation 1` correctly refused
  to treat the dialog as the app.
- The stall was a single frame: `HWUI Davey! duration=6399ms`, almost all of it between
  `IssueDrawCommandsStart` and `SwapBuffers` (about 5.6 s). That is the landscape relayout rendering
  through `-gpu swiftshader_indirect`.
- At the time of the ANR the guest was under pressure: load 10.2 on 2 cores, CPU PSI
  `some avg300=29.68`, memory PSI `full avg300=0.62`, `kswapd0` active, and more than 50k major
  faults across system processes in the 214 s window (systemui 18170, the IME 10025, system_server
  7527). In the 0.5 s after the ANR, the app process itself was still in `Jit thread pool` (23%).
  The emulator ran at its default 2560M RAM (`Increasing RAM size to 2560MB`).

## Cause

This is the same failure class that `e1a2ba4b` and `20ea1aec` fixed. This time the stall came on
the first configuration change, with nothing stacked on it. The script force-stops the app,
relaunches it, waits for a rendered root destination and then rotates straight away. A rendered
root shows that the WebView painted. It does not show that the cold process is idle. The rotation
relayout was queued behind JIT and first-run work in a memory-starved guest, and one frame held
the main thread past the 5 s input deadline.

Commit `24984b6c` (character builder and import polish) does not touch the Command Center route,
the Android shell or the script. The failure is environmental and intermittent, which matches the
green push run on the same SHA.

## Fix

- `scripts/android-emulator-acceptance.sh`: `wait_for_settled_app_rotation 0` now runs before the
  landscape rotation. The app's own window must hold focus in two consecutive idle portrait
  uiautomator dumps. Those dumps are served on the app's main thread, so they show it is responsive
  before the configuration change. The call fails closed with `the restarted app did not settle in
portrait before rotation`.
- `.github/workflows/ci.yml` and `.github/workflows/release.yml`: the API 36 emulator now gets
  `ram-size: 4096M` instead of the 2560M default. The public-repo `ubuntu-latest` runners have
  16 GB, and Gradle is capped at `-Xmx1536m`. Both workflows run the same script, so they stay in
  step.
- `tests/unit/android-emulator-acceptance.test.ts` pins the new portrait settle between the restart
  and the landscape rotation. It also requires `ram-size` of at least 4096M in both emulator steps.

No assertion was removed or relaxed. The ANR dialog is not dismissed or tolerated. The process must
still survive rotation with the same pid, the vault must remain, both rotations must settle on the
app's own window, the root must re-render and Back must minimize.

## Verification

- `bash -n scripts/android-emulator-acceptance.sh`: ok.
- `pnpm exec vitest run tests/unit/android-emulator-acceptance.test.ts`: 5/5 pass.
- Mutation checks. With the `HEAD` script restored, the rotation test fails
  (`expected 595 to be less than 581`: the first portrait settle after the restart comes after
  the landscape rotation). With the `HEAD` `ci.yml` restored, the workflow test fails
  (`expected NaN to be greater than or equal to 4096`).
- `pnpm exec vitest run tests/unit`: 29 files, 218 tests pass. `eslint` and `prettier --check` on
  the changed files pass, and so does `node scripts/check-android.mjs`.
- Not verified locally: the emulator job itself. The emulator segfaults on this host and there is
  no JDK (see `ci-recovery-a967a64d7c1f.md`). The pinned action (`a421e438`, v2.38.0) declares
  the `ram-size` input. The CI Android job is the end-to-end proof. This failure showed up once in
  about 20 runs, so a single green run does not prove much. If it comes back, compare the ANR
  report's PSI and major-fault numbers with the ones above.
