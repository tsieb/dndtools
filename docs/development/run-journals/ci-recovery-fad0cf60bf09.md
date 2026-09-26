# ci-recovery-fad0cf60bf09 — same System UI ANR, already fixed by `8dd5f664`

## Failure

- CI run 36224624535 (`pull_request`, `fad0cf60`, started 06:43:44Z) failed only **Android unit,
  lint, and package checks**, with
  `Android emulator acceptance failed: first-run setup did not become accessible`. All other jobs
  passed. The `push` run on the same SHA (36224620969) passed the identical job.
- The failure dump shows
  `mCurrentFocus=Window{5ac96e2 u0 Application Not Responding: com.android.systemui}` over
  `mFocusedApp=com.dndtools.gm/.MainActivity`. The ANR report is from 06:52:58, before the app
  was installed at 06:53:53: `ANR in com.android.systemui — Reason: executing service
com.android.systemui/.SystemUIService, waited 20170ms`. Guest load was 14.61, CPU PSI
  `some avg10=86.29`, and `gms.persistent` hit a startup ANR a second later.

## Cause

This is the failure `ci-recovery-514c65f15964` diagnosed (run 36220588362). The cold-booted
emulator ANRs its own System UI, and that dialog keeps focus over the app for the whole first-run
wait. Only the stalled service differs here (`SystemUIService` rather than `KeyguardService`), and
it produces the same dialog.

The fix, `8dd5f664` (`dismiss_foreign_anr_dialog` in `dump_ui` taps **Wait** on an ANR dialog
that belongs to another process), landed at 06:53:15Z. That was after this run had checked out
`fad0cf60`. `git merge-base --is-ancestor 8dd5f664 fad0cf60` is false, and
`8dd5f664` is an ancestor of the current `loop/rc` tip `6fd96887`. So the promoted commit ran
the old script. `fad0cf60` itself only touches canvas specs and copy, which the Android job
never reaches.

## Fix

No new code change. Re-applying the fix would duplicate `8dd5f664`. This journal records why the
task is a superseded duplicate.

The fix covers this run's exact shape. `focused_window` strips
`Window{5ac96e2 u0 …}` down to `Application Not Responding: com.android.systemui`. That
does not start with `Application Not Responding: com.dndtools.gm`, so the dialog's
`android:id/aerr_wait` button gets tapped.

## Verification

- CI on `loop/rc` after the fix is green, both `push` and `pull_request`: runs 36227799750 and
  36227803176 on `8dd5f664`, and 36231346031 and 36231348579 on `6fd96887`. None of those four
  Android jobs logged `choosing Wait` or `ANR in`. The emulator did not ANR in them, so the Wait
  path has not yet been exercised in real CI.
- `bash -n scripts/android-emulator-acceptance.sh`: ok.
- `pnpm exec vitest run tests/unit/android-emulator-acceptance.test.ts`: 7/7 pass.
- Mutation check: I replaced `dismiss_foreign_anr_dialog "$ui" || break` in `dump_ui` with
  `break`, and the test failed with
  `Wait was not tapped at the centre of its button: expected '' to be '300 550'`. I then restored
  the script, and the tree was clean.
- I did not run a local emulator. It cannot produce a System UI boot ANR on demand.
