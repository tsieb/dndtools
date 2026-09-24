# ci-recovery-b0665d2d7295 — superseded by the sibling Android Back-minimize fix

## Failure

- CI run 35722028791 (`pull_request`, `b0665d2d`) failed only **Android unit, lint, and package
  checks** at `Back killed the app process instead of minimizing it`. The logcat shows
  `ANR in com.dndtools.gm ... Input dispatching timed out ... Waited 5000ms for KeyEvent ...
keyCode=BACK(4)`. The `push` run on the same SHA (35722023997) passed.

## Resolution

- The first attempt (`344c8c65`, based on `a07a1b38`) added `wait_for_settled_app_rotation` after
  the portrait restore. Review rejected it because `loop/rc` had already landed `e1a2ba4b`
  (`ci-recovery-7c451039a69e`). That commit fixes the same ANR from this same run: it adds
  `wait_for_root_destination` after the force-stop restart and after the portrait restore, and
  pins the ordering with a contract test. `git merge-tree` showed conflicts in both files.
- The review said to resolve in `loop/rc`'s favour. `e1a2ba4b` is a superset: it also waits
  after the cold restart, which `344c8c65` did not. It is also proven in CI: runs 35753632110
  (`push`) and 35753639373 (`pull_request`) on `e1a2ba4b` are both green, including the Android
  job. The task branch was therefore reset onto `origin/loop/rc` and `344c8c65` was dropped. No
  script or test change remains in this task.

## Verification (on `e1a2ba4b`)

- `bash -n scripts/android-emulator-acceptance.sh` — ok.
- `pnpm vitest run tests/unit/android-emulator-acceptance.test.ts` — 4/4 pass.
- `gh run view 35753639373` — `Android unit, lint, and package checks: success`.
