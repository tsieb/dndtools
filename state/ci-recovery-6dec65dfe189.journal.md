# ci-recovery-6dec65dfe189 run journal

## Scope

Repair GitHub CI for promoted commit `6dec65dfe18995ac00f485efad223e0e94699c45` (`loop/rc` head
and this branch's base). Reported failing workflow: `CI`. No push, promotion, loops, extra agents
or dispatcher control-state edits.

## Diagnosis

- Runs 37101025774 (push) and 37101028233 (pull_request): the Android job ("Android unit, lint,
  and package checks") is the only failure. Gradle build, lint, unit and the 8 instrumentation
  tests passed. `scripts/android-emulator-acceptance.sh` then failed in its native share and
  file-picker step with "Settings section choices did not open".
- The same message fails every CI run since `1d4f6c4c` (37094263059, 37097056394). The last green
  run is `9a691042`. In between, RC-UX-5.2 (`64081688`) gated Settings by experience tier:
  `settings.nav.sync` (Backup & history) needs `intermediate`, `settings.backup.title` (Local
  backup) needs `advanced`, and a fresh install reads `DEFAULT_FEATURE_TIER = 'core'`. The
  script drives a fresh install and never raises the tier, so the phone section picker has no
  Backup entry and `wait_for_ui_text 'Backup'` times out.

## Sibling races

Two other ci-recovery branches already carry the same repair on this base:
`dispatch/dndtools/822be9e1629bf39c1be9` (`ef8a94f8`, task ci-recovery-1d4f6c4cf0c0) and
`dispatch/dndtools/96bc13ef83aca5694fda` (`e63f961e`). Their trees are identical. Neither is on
`loop/rc` yet. To keep the eventual merge conflict-free, this branch takes that change verbatim
(`scripts/android-emulator-acceptance.sh` and `tests/unit/android-emulator-acceptance.test.ts`
from `ef8a94f8`) instead of writing a competing one:

- Choose Expert at the bottom of Settings → Appearance, then scroll back up to the section picker.
  Every downstream assertion (Backup choice, Local backup, Download/Restore, both cancellations)
  is unchanged.
- `tap_ui_button_scrolling` wraps a direction-aware `tap_ui_scrolling`. `tap_ui_control` now
  refuses collapsed offscreen bounds, as `tap_ui_button` already does.

## Verification

- `bash -n scripts/android-emulator-acceptance.sh`: OK.
- `pnpm exec vitest run tests/unit/android-emulator-acceptance.test.ts`: 15/15 pass. With the base
  script (`HEAD:scripts/android-emulator-acceptance.sh`) put back temporarily, 5 of them fail
  (scrolling helper, empty-bounds refusal, upward scroll, Expert-before-Backup ordering). So
  the tests guard this regression.
- `eslint` and `prettier --check` on the test file: clean. `shellcheck` is not installed here.
- Phone Chromium replay (Pixel 5 profile, dev server, fresh onboarded profile):
  - At first the picker offers Appearance, Language & region, Account, Tool preferences,
    Accessibility, About & diagnostics. No Backup entry, which reproduces the CI failure.
  - Exactly one clickable node contains "Expert".
  - After tapping it, the picker offers all 13 sections, including Backup & history.
  - Selecting Backup & history renders Local backup with one Download backup and one Restore from
    backup button.
- Emulator replay attempted with the CI-built `app-debug.apk` from run 37101025774 (artifact
  `android-checks`) on the local API 36 AVD. The emulator segfaults in its Vulkan renderer on this
  host with `swiftshader_indirect`, `guest`, and `-feature -Vulkan`, so the hosted job remains the
  final proof.
