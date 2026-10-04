# ci-recovery-eedadc1d6cdf — repair GitHub CI for `eedadc1d`

Task: repair GitHub CI for promoted commit `eedadc1d6cdf9817054b204777de2a57cd0d0be2`
(`fix(i18n): synchronize pseudo catalogue with tile label messages`). Failing workflow: CI.
Branch base: `be43018f` (= `origin/loop/rc` at start).

## Reported failure

`CI` red on `eedadc1d`, runs 37147852509 (PR) and 37147849550 (push). In both runs only
`Android unit, lint, and package checks` failed, in `scripts/android-emulator-acceptance.sh`:

```
acceptance: home-screen shortcuts
emulator acceptance failed: the Play shortcut did not open the player view
```

The `UI hierarchy at failure:` dump shows the player view did open: "Join your table",
"Ask your DM for an invite…", "Join a table". The script was still waiting for "Now playing".

Cause: `eb9e529a` (`fix(play): show join-first companion before a seat is assigned`) made a
seatless `/play` render `JoinFirstStage` instead of the companion with its "Now playing" tab. A
fresh emulator install has no seat. The check stayed hidden on `43cf31ce`/`6dcb0a00`, because
there the script died earlier at the Settings picker (fixed by `2b5d74ff`). From `4314e0d3`
onwards every loop/rc run failed here (`4314e0d3`, `eedadc1d`, `2450f59c`).

## Second red on the current candidate

At `be43018f` the Android job was skipped because `build-and-test` failed first (run
37163508003): `apps/gm-react/src/cloud/AuthModal.test.tsx` failed 6 of 6 with
`Button not found: …` / `Input not found: auth-password`. RC-UX-6.1 (`f5fb225a`/`be43018f`) now
portals the Dialog panel to `document.body`, but the test only searched its render
`container`. I reproduced this locally and got the same 6 failures.

## Repair

- `scripts/android-emulator-acceptance.sh`: the Play shortcut now waits for "Join your table",
  the fresh-install `/play` heading. The check still proves the shortcut navigated to the player
  view and not to some other route.
- `AuthModal.test.tsx`: queries now run against `document.body`. Every assertion and expected
  string is unchanged.

## Verification (local, at be43018f + this change)

- `npx vitest run src/cloud/AuthModal.test.tsx`: failed 6 of 6 before the change, 6 of 6 pass after.
- `pnpm test`: exit 0 (284 + 45 + 161 + 31 files, all passed).
- `tsc --noEmit -p apps/gm-react`, eslint and prettier on the changed test, and `bash -n` on the
  script: clean.
- I did not run the Android emulator acceptance locally. There is no local JDK and the emulator
  segfaults. The new text comes from the CI failure's own UI dump, so the hosted
  `android-checks` job is the real check for this change.

## Reconcile with sibling `879489ab` (2026-10-04)

The gate's rebase onto `879489ab` conflicted in both changed files. `879489ab`
(`ci-recovery-4314e0d325a4`) is the same repair: identical code, comment wording aside. The
sibling's version wins. This branch is now `879489ab` plus this journal. The duplicate code commit
was dropped, so nothing here touches `AuthModal.test.tsx` or the acceptance script.

- Hosted `CI` on `879489ab`: success (push 37176393577, PR 37176396074). That includes the
  Android emulator acceptance, so the reported `eedadc1d` failure is fixed on the integration
  branch.
- Local `pnpm test` at `879489ab`: exit 0 (critical 284/5184, cloud 45/559, app 161/1773,
  tooling 31/245).

## Third red: Expert radio tap lands on the bottom navigation (2026-10-04)

Independent review rejected the journal-only candidate (`dc358daa`): the same required Android
job is red on its base `ed614140`. The failure is flaky on identical code. `Android unit, lint, and
package checks` failed in runs 37188122128 and 37188126286 (`ed614140`) and 37197602054
(`a7a08de6`, journals only), and passed in 37197781114 and 37197785431 (`e4f153cc`, journals only).
Every failure is `scripts/android-emulator-acceptance.sh:546` with "Expert experience level was
not reachable", and the `UI hierarchy at failure:` dump shows the Characters route.

Cause: WebView clips an accessibility node's bounds to the WebView (`[0,128][1080,2337]`), not
to the scroll region that holds it (`[0,306][1080,1989]`). When a swipe stopped with the Expert
radio's top between about y=1941 and y=2241, `choose_experience_level` saw a ≥96px node and tapped
48px under its top. That point is below the scroll region and on the fixed bottom navigation, and
at x=527 it hits the "Characters" button (`[433,2191][648,2330]`). The level never changed, and the
remaining scroll attempts swiped through the roster. `tap_ui_control` already clipped to the
scroll ancestor for the sticky top bar (`2b5d74ff`). `choose_experience_level` did not. RC-POL-1.17
changed the Settings layout, so the radio now lands in that band more often.

Repair:

- `scripts/android-emulator-acceptance.sh`: the scroll-ancestor clipping moved out of
  `tap_ui_control` into a new `visible_node_bounds` helper, and `choose_experience_level` now uses
  it too. The 96px minimum and the leading-row tap are unchanged, but they now measure only the
  part of the radio inside its scroll region. A radio under the navigation is not tapped, and
  `tap_ui_scrolling` swipes further instead.
- `tests/unit/android-emulator-acceptance.test.ts`: the existing helper tests now load
  `visible_node_bounds` too. A new test replays the CI geometry: the radio at
  `[34,2150][1021,2337]` under the Characters button must lead to a swipe, then a tap at 1448 once it
  is revealed. Against the old script this test fails with `shell input tap 527 2198`, the
  Characters button. Every existing assertion is unchanged.

Verification (local, at `ed614140` + this change):

- `npx vitest run tests/unit/android-emulator-acceptance.test.ts`: 20/20. With only the script
  reverted, 19/20 (the new test fails as described).
- `pnpm test:tooling` 31 files / 246 tests passed; `pnpm typecheck` exit 0; eslint clean on the
  test; `bash -n` on the script clean.
- A replay of the new helper against the real failure dump from 37197602054 finds the scroll
  ancestor `[0,306][1080,1989]` and clips nodes correctly.
- I did not run the emulator. There is no local JDK, and the local emulator segfaults. The hosted
  `android-checks` job on the integration candidate is the end-to-end check. This task forbids
  pushing, so I could not dispatch it on a branch.
