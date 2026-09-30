# ci-recovery-5d7070af2671 run journal

## Scope

Repair CI for `5d7070af2671eec5cb8afcaadd9a3e46fed47c69` on the current task branch.
No push, promotion, additional agents, loops, or dispatcher control-state edits.

## Remote evidence

- CI runs [36645938936](https://github.com/tsieb/dndtools/actions/runs/36645938936)
  and [36645928774](https://github.com/tsieb/dndtools/actions/runs/36645928774)
  both fail the Android lifecycle acceptance script with
  `Android emulator acceptance failed: Settings destination did not render`.
- The push run passed build-and-test, all three browser shards, visual regression,
  accessibility, and Electron smoke. Android instrumentation passed all eight tests
  before the acceptance script failed while opening Settings from More.
- Exact failed-step logs retrieved with `gh run view --log-failed` are retained locally
  at `/tmp/ci-5d7070-push.log` and `/tmp/ci-5d7070-pr.log`.
- Dispatch Headroom tools are unavailable in this session; native command output is used.

## Investigation

- Browser reproduction at 412 × 842: Settings starts at y=1365 in More, below the
  viewport; its centre hits no element. Scrolling and clicking renders Settings normally.
- The native tap helper accepted zero-area accessibility bounds and reported success
  after an ineffective tap. The added regression test failed against the original helper:
  `unexpected tap: shell input tap 0 0` (exact log: `/tmp/ci-5d7070-regression-red.log`).
- The renderer build passed. Local Gradle configuration stopped because a JDK 21
  toolchain is absent, so native acceptance uses the exact debug APK downloaded from
  run 36645938936 instead. No renderer or Android package code is changed by this repair.
- The local emulator crashed during boot with SwiftShader. API 36 Google APIs / Pixel 6
  boots with `-gpu swangle -feature -Vulkan -memory 4096`. Animations are disabled,
  as in CI. An initial script run was invalidated by editing its source while Bash was
  still reading it; reproduction was restarted from a separate immutable `git show HEAD`
  copy at `/tmp/ci-5d7070-base-acceptance.sh`.

## Repair

- Reject zero-width/height button bounds before injecting a tap.
- Scroll within the native accessibility bounds of the sheet until Settings is tappable;
  fail after a bounded search if the control is missing or no scroll region exists.
- Preserve all destination, native surface, lifecycle, persistence, and signing assertions.
  Workflow protections and timeouts are unchanged.
- Four regression cases cover empty/clipped bounds, successful scroll-and-tap, and a
  missing destination that exhausts the search without tapping an unrelated location.

## Validation

- Focused acceptance tooling tests: 12 passed.
- Original script, exact CI APK, API 36 emulator: **exit 1**, reproduced
  `Android emulator acceptance failed: Settings destination did not render`.
  Exact output: `/tmp/ci-5d7070-repro.log`. The native accessibility tree reports Settings
  as an `android.widget.Button` with bounds `[52,2339][1002,2339]`; its height is zero.
- CI APK SHA-256: `37546bda773e79f21ab1bb3d42cd46c848814db4489cda5d41c446cd92dbc074`.
- `pnpm test:tooling`: **exit 0**, 30 files / 232 tests passed.
  Exact output: `/tmp/ci-5d7070-tooling.log`.
- `pnpm gates`, ESLint on the changed test, explicit Prettier checks on the changed test
  and journal, `bash -n scripts/android-emulator-acceptance.sh`, and `git diff --check` passed.
- Repaired native acceptance: **exit 0**, `Android emulator acceptance passed.`
  Ran an immutable copy (verified identical with `cmp`) of the final script with
  `ANDROID_EXPECT_PRIVATE_DATA=1`, using the same APK and emulator. Exact output:
  `/tmp/ci-5d7070-fixed.log`. All native surface cancellations, shortcuts, notification
  channels, import review, private vault/temporary-file checks, offline process death,
  background/resume, new-process restart, rotation/root Back, and same-signer upgrade passed.
- App/package sources and workflows are unchanged. Native package build and instrumentation
  were already green on the exact CI commit; local native verification above deliberately
  uses that run's APK. No new remote CI run was requested or claimed.
