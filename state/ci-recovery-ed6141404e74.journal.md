# ci-recovery-ed6141404e74 run journal

## Scope

Repair GitHub CI for promoted commit `ed6141404e7443ee425e804f6f024c8902f5512b` on `loop/rc`
(failing workflow: CI). No push, promotion, loops, or dispatcher control-state edits.

## What is red

Both CI runs for `ed614140` (push 37188122128, pull_request 37188126286) fail one step: "Android
unit, lint, and package checks → Run instrumentation and lifecycle acceptance on API 36". The 8
instrumentation tests pass. `scripts/android-emulator-acceptance.sh` then fails at
`Expert experience level was not reachable`. The `UI hierarchy at failure:` dump shows the
**Characters** screen, not Settings. (The Performance workflow is also red, but it is out of scope:
the task names only CI.)

## Cause

`ed614140` (RC-POL-1.17) split each Experience card: the `role=radio` button now holds only the name,
badge and blurb, and the feature list sits under it. `choose_experience_level` took the radio's
accessibility bounds and tapped `top + 48`. The WebView reports a node's box clipped to the WebView
window, not to the page's scroll region `[0,306][1080,1989]`. A card scrolled in at the bottom
therefore read e.g. `[34,2150][1046,2339]`, passed the ≥96px check, and the tap at (540, 2198) landed
on the fixed bottom navigation's Characters tab `[433,2191][648,2330]`. After that the helper kept
scrolling Characters and never found Expert.

`tap_ui_control` already clipped to the innermost scrolling ancestor for the same reason (the
Settings picker under the sticky header). `choose_experience_level` never did.

## Fix

- The scroll-region clip moves out of `tap_ui_control` into `visible_extent` (same logic: awk
  innermost scrolling ancestor, clip, refuse a sliver).
- `choose_experience_level` clips the radio to that region and still requires ≥96px visible before
  tapping its leading row. Otherwise it returns 1, so `tap_ui_scrolling` scrolls further.
- No assertion is weakened. The level is still confirmed through the panel's exact `text="Expert"`
  badge.

## Verification

- No sibling: `origin/loop/rc` == `ed614140`, and no `dispatch/dndtools/*` branch built on it touches
  the script or `Experience.tsx`.
- `bash -n` OK. Pinned shellcheck v0.11.0 (`-S warning`, the supply-chain workflow's binary) reports
  0 findings on the old and new script.
- Synthetic-dump harness, with the functions extracted from the script and `adb`/`dump_ui` stubbed:
  - The old helper on the failure geometry taps `540 2198`, inside the Characters tab.
  - The new helper refuses cards at `[..,2150]` and `[..,1950]` (scroll further).
  - It taps `540 1748` for a card at `[..,1700]`, inside the pane.
  - It refuses an offscreen collapsed node.
  - `tap_ui_control` behaves as before: clipped top taps 403, a whole node taps its centre.
- Not run locally: the Android emulator gate. There is no local JDK, and the local emulator crashes
  (see memory). The hosted `android-checks` job on the next promotion is the real check.

## Attempt 2: Tooling tests gate

The first attempt (`71607f60`) failed the wrapper's "Tooling tests" gate. Four cases in
`tests/unit/android-emulator-acceptance.test.ts` failed. That file extracts `tap_ui_control` and
`choose_experience_level` from the script by regex and runs them in bash on their own, so the new
`visible_extent` was missing (`bash: visible_extent: command not found`). My harness in attempt 1
pulled `visible_extent` in by hand, which is why it missed this.

- Every test that runs those helpers now extracts `visible_extent` with them. No expectation changed.
- New regression case, shaped on the CI 37188122128 dump (scroll region `[0,306][1080,1989]`,
  Characters tab `[433,2191][648,2330]`). Its title is "clips a card to the scroll pane so its tap
  never lands on the bottom navigation":
  - Cards at `[..,2150][..,2339]` and `[..,1950][..,2339]` get no tap and return 1.
  - A card at `[..,1700][..,2339]` is tapped at `540 1748` and confirmed through the badge.
  - The old helper would have tapped 2198 and 1998, both outside the pane.
- `pnpm test:tooling`: 31 files and 246 tests pass (exit 0).
- `pnpm format:check:changed -- --base loop/rc` and eslint on the test file are clean.

## Attempt 3: reconciled onto the sibling fix `404c6238`

The gate could not rebase this branch onto `404c6238`, because it conflicted in
`scripts/android-emulator-acceptance.sh`. `404c6238` (from ci-recovery-eedadc1d6cdf) lands the same
repair for the same red, and `origin/loop/rc` is now at it. It moves the scroll-ancestor clip out of
`tap_ui_control` into `visible_node_bounds` and uses that in `choose_experience_level`, with the same
96px minimum and leading-row tap. It also adds a regression test built on the CI 37188122128
geometry. My `visible_extent` version did the same thing under another name. Following the
sibling-race rule, I resolved in `loop/rc`'s favour: the branch now sits on `404c6238`, my two
script/test commits (`a3a7f2a9`, `0001d016`) are gone, and this journal is the only change.

Checked against `404c6238`:

- I replayed the geometries from my dropped test through the sibling's `visible_node_bounds` +
  `choose_experience_level`. Cards at `[34,2150][1046,2339]` and `[34,1950][1046,2339]` get no tap
  and return 1, so the caller scrolls. A card at `[34,1700][1046,2339]` gets tapped at `540 1748`,
  inside the pane. My dropped test had nothing the sibling's code misses.
- `npx vitest run tests/unit/android-emulator-acceptance.test.ts`: 20/20. `bash -n` on the
  script is clean.
- `pnpm test:tooling`: 31 files, 246 tests passed (exit 0).

Hosted CI on `404c6238`: the pull_request run 37204544694 passed, including `Android unit, lint, and
package checks`. The push run 37204540979 failed that job for another reason: "the restarted app did
not settle in portrait before rotation". The Expert step passed in that run. Logcat shows
`ANR in com.dndtools.gm … Waited 5000ms for FocusEvent(hasFocus=true)` at 13:23:53. That was about
two seconds after the root destination rendered after the force-stop relaunch, and before the script
sent any input or rotation. The cause was a 5.4s cold-start frame (`Davey! duration=5465ms`), mostly
`Chrome_InProcGp` kernel time on the swiftshader GPU. After that, the app's own ANR dialog held focus
until the settle check ran out of time. That check is working as designed. The script deliberately
never dismisses the app's own ANR dialog (`dismiss_foreign_anr_dialog`,
`clear_foreign_anr_dialogs`), and dismissing it here would weaken the gate. I counted the failures
in the last 20 red CI runs: this is the only one of its kind. The other 19 were the Expert, Play
shortcut and Settings-picker reds, all since fixed. I'm treating it as a one-off emulator load flake
outside this task's failure and made no speculative change. If it comes back, use the same approach
as the offline relaunch: set a load precondition before the cold launch, and leave the ANR dialog
alone.
