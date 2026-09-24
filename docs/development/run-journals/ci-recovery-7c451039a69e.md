# ci-recovery-7c451039a69e — Android emulator Back-minimize ANR

## Failure

- CI run 35709510322 (`pull_request`, `7c451039`) failed **Android unit, lint, and package
  checks** at `Android emulator acceptance failed: Back killed the app process instead of
minimizing it`. The `push` run on the same SHA (35709503604) passed the identical job, and CI run
  35722028791 (`b0665d2d`, `pull_request`) failed at the same line. The current task base
  (`a07a1b38`) is green on both events.
- Both failure dumps carry `ANR in com.dndtools.gm ... Input dispatching timed out ... Waited
5000ms for KeyEvent ... keyCode=BACK(4)`, followed by the process's AppOps teardown. The
  headless (`-no-window`) emulator kills an ANR'd process instead of showing a dialog, so the
  launcher gets focus and `wait_for_pid` then finds no process.

## Cause

Step timestamps: `new-process restart` 09:31:45.8 → `rotation and root Back minimize` 09:31:48.5 →
ANR 09:31:56.9 for a Back sent ~09:31:51 (run 35709510322; run 35722028791 has the same shape).
After `am force-stop` the script only waited for a pid, so the cold WebView was still booting when
it rotated to landscape, restored portrait and pressed Back within ~5s. The main thread (2.8% CPU
in the ANR report; RenderThread/JIT busy, load 10) could not consume the key within 5s.

## Fix

`scripts/android-emulator-acceptance.sh`:

- after the force-stop relaunch, `wait_for_root_destination` (the same check the offline cold
  relaunch already uses) before rotating;
- after restoring `user_rotation 0`, assert the setting took and `wait_for_root_destination`
  again (uiautomator only dumps an idle UI) before the minimize Back.

The assertions are unchanged: Back is still pressed the same way, and the process must survive
minimize. Both new waits `fail` if the app never renders, so the script is stricter than before.
`tests/unit/android-emulator-acceptance.test.ts` pins the ordering; mutation-checked by restoring
the HEAD script (test fails: "rotated before the restart rendered").

## Verification

- `bash -n scripts/android-emulator-acceptance.sh`
- `pnpm vitest run tests/unit/android-emulator-acceptance.test.ts` — 4/4 pass.
- The emulator itself cannot run on this host (see `ci-recovery-a967a64d7c1f.md`), so the CI job
  is the end-to-end proof.
