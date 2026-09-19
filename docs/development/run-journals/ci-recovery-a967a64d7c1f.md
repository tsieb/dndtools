# ci-recovery-a967a64d7c1f unblock journal

- Failing workflow on `a967a64d7c1f` was CI run `35286323232` (the `pull_request` run for the
  dispatcher delivery PR #76). One job failed: **Android unit, lint, and package checks**, at
  `Run instrumentation and lifecycle acceptance on API 36`. Gradle, instrumentation and every other
  job on that run were green, as were Supply Chain and Performance.
- The same commit's `push` run, `35286320709`, passed the identical Android job in 8m34s. Two runs
  of the same tree, same workflow, same runner image, opposite outcomes — so this is a race in the
  acceptance script, not a regression in the tree. Nothing under `apps/gm-react/android/` or
  `scripts/android-emulator-acceptance.sh` changed in the three `docs(state)` commits this branch
  carries.
- The assertion that failed is
  `wait_until_foreground || fail 'Back did not cancel the Android share/save sheet'`, 20s after a
  single `KEYCODE_BACK`. The `fail` dump shows why the wait never came back: 20s later
  `com.android.intentresolver/…ChooserActivityLauncher` still owned the window — it held the
  navigation-bar `mControlTarget` — and `intentresolver` was still in `VisibleActivityProcess`. The
  sheet never moved. The step's own timing agrees: `step` printed at 23:31:34 and `fail` at
  23:32:15, so the eight UI interactions before it consumed ~20s and `wait_until_not_foreground`
  returned after a poll or two, i.e. the Back went out the instant the app stopped being resumed.
- Root cause: `wait_until_not_foreground` greps `dumpsys activity activities` for
  `(mResumedActivity|topResumedActivity).*com.dndtools.gm`. While Android hands the foreground from
  the app to a system surface, `mResumedActivity` is briefly `null` — the app has paused and the
  chooser has not resumed. The grep does not match, so the helper reports "not foreground" one beat
  BEFORE any window owns input focus. A `KEYCODE_BACK` injected in that window is dropped by the
  input dispatcher (no focused window to deliver it to), the chooser then comes up and stays up, and
  the following `wait_until_foreground` times out. The window is about one poll wide, which is why
  it passes most runs and why the sibling run on the same commit was green.
- Fix: `wait_for_settled_system_focus`, which reads `mCurrentFocus` and requires a focused window
  that is not the app's and that is still the same window one poll later, inserted between
  `wait_until_not_foreground` and the `KEYCODE_BACK` at the three sites that press Back into a
  surface the app does not own — the external HTTPS browser, the share/save sheet and the file
  picker. This waits for the assertion's precondition; the assertion itself is unchanged, and Back
  is still pressed exactly once. Nothing was retried, relaxed or removed. `fail` now also prints
  `mCurrentFocus`/`mFocusedApp`, so a recurrence is diagnosable rather than inferred.
- Reproduced deterministically. The emulator cannot run here (it segfaults ~30s into cold boot on
  this host under `-gpu swiftshader_indirect`, `-gpu guest` and `-wipe-data` alike, exit 139), and
  the APK cannot be built here either — the machine has a JRE 25 and no JDK, so `gradlew` aborts at
  `JAVA_HOME is set to an invalid directory`, the same limitation recorded in the
  `ci-recovery-41ebc122f9d8` journal. So the race was driven against a stub `adb` that models the
  API 36 hand-off (two polls of `mResumedActivity: null` / `mCurrentFocus=null`, then the chooser;
  a Back injected with no focused window is dropped). The driver `eval`s the real helper bodies out
  of the script under test rather than a copy. Against the pre-fix script the old sequence fails
  with `BACK injected with focus='<none>'` and the exact CI message; against the fixed script the
  same model lands `BACK injected with focus='com.android.intentresolver/…ChooserActivityLauncher'`
  and passes.
- The contract test `tests/unit/android-emulator-acceptance.test.ts` gained a case asserting that
  each of the three system-surface waits is followed by `wait_for_settled_system_focus` and then the
  Back press. Mutation-checked: it fails against `HEAD`'s script and passes against the fixed one.
- Other local checks: `bash -n` on the script, `pnpm vitest run tests/unit` (26 files, 193 tests),
  `pnpm typecheck` (core, cloud-fns, gm-react), `eslint` and `prettier --check` on the changed test,
  and `node scripts/check-android.mjs` (20 XML files, 11 Java files, package versions agree).
- Not verified locally: the emulator job itself, for the two reasons above. That half is for the
  central operator's run.
- Unrelated churn, reverted not committed: `cap sync android` rewrote the generated
  `apps/gm-react/android/capacitor.settings.gradle` to this worktree's newer Capacitor versions.
  CI regenerates that file before Gradle reads it, exactly as the `41ebc122f9d8` journal records.
