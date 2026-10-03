# ci-recovery-1d4f6c4cf0c0 run journal

## Scope

Repair GitHub CI for promoted commit `1d4f6c4cf0c0cfb03fb3ea67febb04cfb4536e5b`. Reported
failing workflow: `CI`. Reproduce locally, fix the cause, verify without weakening tests or
workflow protections. No push, promotion, loops, additional agents, or dispatcher control-state
edits. The task branch sits on `loop/rc` `6dec65df`, which still fails the same way.

## Diagnosis

- Runs 37094263059 (push) and 37094268864 (pull_request) on `1d4f6c4c`, plus 37097056394
  (`5611f236`) and 37101025774 (`6dec65df`): `Android unit, lint, and package checks` is the only
  failing job in each. Build, lint, unit and instrumentation tests passed. The failure was in
  `scripts/android-emulator-acceptance.sh`, step `native share and file-picker cancellation`:
  `Android emulator acceptance failed: Settings section choices did not open`.
- The last green CI was `9a691042`. Between it and `1d4f6c4c` only RC-UX-5.2 landed
  (`64081688` and follow-ups). It gates Settings sections by experience tier: `settings.nav.sync`
  ("Backup & history") needs `intermediate` and `settings.backup.title` needs `advanced`. A
  fresh install reads the default `core` (Beginner) tier.
- The e2e specs got `preferTier()` in RC-UX-5.2. The Android script runs on a fresh install,
  never changes the level, and expects a `Backup` choice in the phone section picker. That choice
  no longer exists, so `wait_for_ui_text 'Backup'` timed out. No local gate runs the emulator,
  which is the known blind spot in the hosted-CI notes.
- Reproduced in phone Chromium (Pixel 5 profile, dev server, fresh profile): the picker offered
  Appearance, Language & region, Account, Tool preferences, Accessibility, About & diagnostics.
  After tapping the Expert card, it offered all 13 sections, including Backup & history. The
  only scroll region on the page is `#main-content`. The Experience card sits at the bottom of
  Appearance, below the fold, and the picker is static at the top.

## Fix

- `scripts/android-emulator-acceptance.sh`: before opening the section picker, choose Expert
  on Appearance the way a user would, then scroll back to the picker. The assertions that follow
  are unchanged: the Backup choice, Local backup, Download/Restore and both cancellations.
- `tap_ui_button_scrolling` becomes a wrapper over the new `tap_ui_scrolling`, which takes a tap
  helper, a label and a direction (`down` or `up`). The swipe geometry is unchanged for `down`,
  so the More-sheet Settings tap is unaffected. `up` reverses it.
- `tap_ui_control` now refuses collapsed offscreen bounds, as `tap_ui_button` already does.
  Without that it would "tap" the picker at the clipping edge after the page scrolled down.
- `tests/unit/android-emulator-acceptance.test.ts`: the scrolling test extracts the new helper.
  New cases cover `tap_ui_control` refusing empty bounds, the upward swipe reaching a control
  above the fold, and the Expert step ordered before the picker and the Backup choice.

## Verification

- `bash -n scripts/android-emulator-acceptance.sh` passes.
- `pnpm exec vitest run tests/unit/android-emulator-acceptance.test.ts`: 15/15 pass.
- `pnpm exec eslint` and `prettier --check` pass on the test file.
- Phone Chromium replay of the new flow on a fresh, onboarded profile: tap Expert, scroll
  `#main-content` to the top, select Backup & history. "Local backup", one "Download backup"
  and one "Restore from backup" all rendered. The only clickable node containing "Expert" is
  the Expert radio card.
- Not run locally: the emulator itself. There is no JDK or emulator on this host (see the Android
  Gradle notes), so the hosted `Android unit, lint, and package checks` job is the final proof.
