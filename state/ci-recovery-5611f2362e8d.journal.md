# ci-recovery-5611f2362e8d run journal

## Scope

Repair GitHub CI for promoted commit `5611f2362e8d912c3912a1361d33eb182c0695d8`. Reported
failing workflow: `CI`. Reproduce locally, fix the cause, verify without weakening tests or
workflow protections. No push, promotion, loops, additional agents, or dispatcher control-state
edits. The task branch sits on `loop/rc` `6dec65df`, which still fails the same way.

## Diagnosis

- Runs 37097056394 (push) and 37097059421 (pull_request) on `5611f236`: the only failing job is
  `Android unit, lint, and package checks`, in the step
  `Run instrumentation and lifecycle acceptance on API 36`. Gradle reported `:app:connectedDebugAndroidTest` as successful. The failure is in
  `scripts/android-emulator-acceptance.sh`, step `native share and file-picker cancellation`:
  `Android emulator acceptance failed: Settings section choices did not open`.
- The same message fails `1d4f6c4c` (37094263059/37094268864) and `6dec65df`
  (37101025774/37101028233). `5611f236` did not cause it. RC-UX-5.2 did: it gates Backup &
  history by experience tier, and the fresh install the script drives reads Settings at Beginner.
- A sibling recovery task, `ci-recovery-1d4f6c4cf0c0`, already fixed this in `e63f961e` on
  `dispatch/dndtools/96bc13ef83aca5694fda`. That commit is not on `loop/rc` yet (checked against
  `origin/loop/rc` `6dec65df`). Its base is the same as this task's.

## Fix

- Cherry-picked `e63f961e` unchanged: the script chooses Expert on Appearance before it opens
  the section picker, and the test is updated to match. Because the blobs are identical, this
  branch and the sibling branch merge cleanly whichever lands first. No new behaviour on top.

## Independent verification

- Phone Chromium replay (Pixel 5 profile, fresh profile, dev server on port 5391, script in
  `/tmp`), following the emulator order: Skip setup → privacy step → Cloud-Enhanced → skip.
  - Before Expert, the section picker lists: Appearance, Language & region, Account, Tool
    preferences, Accessibility, About & diagnostics. No Backup option, which reproduces the
    CI failure.
  - There is exactly one `radio` named Expert. After choosing it, the picker lists 13 sections,
    including Backup & history.
  - Selecting Backup & history renders "Local backup", one "Download backup" and one "Restore
    from backup".
  - The script's later checks still pass at the Expert tier: the root destination ("open scene")
    after Home, after Back and after a reload; "LIVE SESSION"; and "Now playing" on `#/play`.
    No page errors.
- `bash -n scripts/android-emulator-acceptance.sh` passes.
- `pnpm exec vitest run tests/unit/android-emulator-acceptance.test.ts`: 15/15 pass.
  `pnpm exec vitest run tests/unit`: 31 files, 241 tests pass.
- `eslint` and `prettier --check` pass on the test file and the journals.
- Not run locally: the emulator itself (no JDK or emulator on this host). shellcheck is not
  installed. The hosted `Android unit, lint, and package checks` job is the final proof.
