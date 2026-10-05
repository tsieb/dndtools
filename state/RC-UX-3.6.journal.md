# RC-UX-3.6 run journal

## 2026-10-02 implementation

- Replacing the seven-step forced-consent wizard with campaign, complexity, and ready steps.
- Verified RC-UX-6.2 campaign commands and RC-UX-6.3 guide are absent; using catalog naming, system.select, and Command Center focus fallbacks.
- Preserve existing vault modes on replay; apply ADR-042 defaults only to genuinely new campaigns. The task's newer skip rule supersedes ADR-042's older Expert skip restriction.
- Runtime boot currently seeds the legacy primary vault. A narrow integration change is required for empty fresh profiles while preserving the existing e2e gate hook.
- Validation pending. No push, promotion, dispatcher control edits, or additional agents.

## Validation and corrections

- First browser pass exposed the core Beginner fallback; onboarding now explicitly defaults to Standard without changing the core default.
- Golden first-run health found the disabled Continue reason was not programmatically associated. Added aria-describedby to the existing visible reason.
- New strings use the locale catalog; rewritten components use design tokens and their raw-style allowances were removed.
- `pnpm --filter @dndtools/gm-react exec playwright test onboarding-consent.spec.ts golden-path.spec.ts --workers=2`: **80 passed** across desktop and mobile (46.3s). Exact Headroom artifact `1ce24fbb54284dae99132bfc6c8025cc` retrieved in full. Includes axe on all three steps, named empty campaign in <=5 clicks/<60 seconds, Expert acknowledgement/mismatch, 560px desktop layout, Generic selection, replay preservation, three skip routes, focus, sidebar name, and the seeded fixture hook.
- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/platform/preferences.test.ts apps/gm-react/src/runtime/SceneRuntime.test.ts`: **26 passed**. Exact artifact `2475727df11c4130becd771f0de63aa4` retrieved.
- `pnpm exec vitest run --config vitest.cloud.config.ts apps/gm-react/src/cloud/vaultMode.test.ts`: **6 passed**. Exact artifact `785a008d6645453a9f11a0fc0ba5d2c1` retrieved. Includes disclosure-persistence failure and preservation of existing privacy decisions.
- App typecheck, targeted ESLint, and boundary lint passed. Final locale-key correction and skip-default hardening will receive a final targeted rerun.
- Pinned-container visual regression suite is running. No baseline rewrites requested.

## Final verification and handoff

- Hardened creation detection using catalog `lastOpenedAt`: an already-opened empty campaign is not new when UI preferences are cleared; a pending creation still resumes. Added both regression cases. Runtime/preferences final total: **28 passed** (`61cc2941705b4595a2707a62d22b2b35`, exact output retrieved).
- Golden-path plus onboarding final combined rerun: **80 passed** (`b6f9b869adbd4729b39710ef175190ad`, exact output retrieved).
- After the catalog-history guard, all **20 onboarding tests** plus two temporary screenshot-inspection drivers passed. Inspected campaign, Expert mismatch, and Ready screenshots on desktop and phone; removed the temporary driver. After selecting the primary button variant, reran the permanent onboarding suite: **20 passed** (`d4aaa73e75ff45149d8d213cb6114083`, exact output retrieved). The simple-tier journeys were 6.7 seconds or less for each complete test in this last run, including axe scans; the tests assert <=5 clicks and <60 seconds of scripted input.
- `apps/gm-react/tests/visual/run-in-container.sh --workers=2`: **426 passed** in the pinned image, no snapshot updates. Exact 52,049-byte log retrieved in four pages from artifact `b805ac27736447538e9b687513209aef`; no failure lines. Local log retained at `/tmp/rc-ux36-pinned-visual.log`.
- Final app typecheck passed (`895ad2bd96124860ab3c54cb32b97433`); changed-file ESLint and Prettier passed (`0814beb7f214469789b9c65acc77ab76`); raw-style-count passed (`902b663fa5cb4c438288ba934d8a3ea2`). Exact outputs retrieved. Boundary lint and git diff whitespace check also passed.
- Necessary integration beyond the listed ownership: runtime boot distinguishes fresh campaigns from seeded fixtures; Sidebar observes the catalog rename in the same run; locale catalog and shrinking style allowance enforce repository conventions; browser/unit tests carry the acceptance evidence.
- RC-UX-6.2/6.3/6.4 remain future integrations: current implementation uses catalog names, the existing system.select command, Command Center focus, and the current Settings feature-gate map. Existing privacy modes and fail-closed fallback remain unchanged. Expert skip defers the mode without a modal, as required by the newer task text.
- Local task-branch commit only. No push, promotion, dispatcher-control mutation, or additional agents.

## Claim-gate follow-up: required integrations retained

The dispatcher claim gate rejected `apps/gm-react/src/app/shell/Sidebar.tsx` and `apps/gm-react/src/runtime/SceneRuntime.ts` because they are outside the declared claim. The implementation is **blocked for an operator claim decision**, not ready for claim-gate clearance. No claim or dispatcher state was changed.

Both changes are retained because reverting either violates an explicit acceptance criterion. Verified with isolated reversions to base `5611f2362e8d912c3912a1361d33eb182c0695d8`, restoring each file to the committed implementation immediately after its test:

- **SceneRuntime.ts:** hydration must call the owned preference helper after inspecting stored state and before adding demo actors/maps or running the demo seed. The wizard mounts after runtime loading, so it cannot prevent that boot-time seed. Unconditionally writing the preference during module loading would bypass the existing-vault checks; wiping content after boot would be destructive. Reverting only this file made `golden-path.spec.ts --grep 'first run' --project=desktop-chromium` fail: the supposedly empty vault contained **5 characters and 3 maps**, versus the required zero. Exact Headroom output `d290c9cfdb4f4deca615babe1872ef24` retrieved in full.
- **Sidebar.tsx:** the sidebar keeps its catalog entry in component state and otherwise refreshes it only through its own switcher callback. Writing the catalog name from the owned onboarding code cannot update that state. The small rename-event subscription makes the name visible in the same run without a reload or direct DOM manipulation. Reverting only this file made `onboarding-consent.spec.ts --grep 'Standard:' --project=desktop-chromium` fail at the sidebar assertion: `Lantern Coast` was not present. Exact Headroom output `a78f8203f5f54ebe9732f8feb58117d7` retrieved in full.
- After restoring both files, `pnpm --filter @dndtools/gm-react exec playwright test golden-path.spec.ts onboarding-consent.spec.ts --grep 'first run|Standard:|existing gate hook' --workers=2 --output=/tmp/rc-ux36-claim-restored` passed **all 6 tests** across desktop and mobile, including the seeded fixture hook. Exact Headroom output `bf3f0f4016624c559ca15b061581d025` retrieved in full.

This follow-up changes only the run journal and adds the required explanation to its commit message. Product code remains at the tested implementation from `ae11dc03`. The operator must decide whether to widen the claim to these two integration paths. Nothing was pushed or promoted.

## 2026-10-04 claim widened; merged loop/rc

- Operator widened the claim to `apps/gm-react/src/app/shell/Sidebar.tsx` and `apps/gm-react/src/runtime/SceneRuntime.ts`, which clears the earlier ownership blocker. Product behaviour from `ae11dc03` is unchanged.
- The branch conflicted with `loop/rc` 9a7b675d, so I merged it in (`c7cc4590`). Sidebar keeps the new loop/rc imports plus `useCallback` for the rename subscription. en.ts keeps both the onboarding v3 and play.join keys. Both sides removed entries from the raw-style allowance, so all of those removals stay.
- loop/rc's catalog test now requires Spanish to cover every English key. Added Spanish for the 32 `onboarding.v3.*` keys and regenerated `qps-ploc.ts`, which the earlier attempt had also missed.
- Results: vitest app (i18n, preferences, SceneRuntime) **75 passed**; vitest cloud vaultMode **6 passed**; `playwright test onboarding-consent.spec.ts golden-path.spec.ts --workers=2` **80 passed** on desktop and mobile; app typecheck, targeted ESLint, boundary lint, raw-style count and Prettier passed.
- Local commit only. Nothing pushed or promoted, and no dispatcher state was touched.

## 2026-10-04 browser-acceptance gate fix

Gate run at `eec27573`: Browser acceptance failed 8 tests (1750 passed). Exact log `.state/attempts/7ed3255e-.../output.log`, read directly. These were four tests on both profiles that still drove the seven-step wizard:

- `cloud-enhanced-honest-limit.spec.ts` "onboarding offers Cloud-Enhanced…": the old test expected the deleted privacy step. It also exposed a real copy conflict: my disclosure said "Upcoming cloud features…", which RC-CLD-2.2 forbids. The disclosure now reads "Cloud-Enhanced lets our server read your campaign content, including secrets, to provide cloud features. Those features are not in this edition, so your vault stays end-to-end encrypted." That satisfies ADR-042 (names what the server can read, including secrets) and RC-CLD-2.2 ("not in this edition", "end-to-end encrypted", no promise). Updated in `vaultMode.ts`, en, es and the regenerated pseudo catalog. The test now checks the Standard step-1 disclosure, the Expert Cloud-Enhanced choice and the Ready summary.
- `responsive.spec.ts`:
  - The 375x520 test now walks the three steps (longest 80-character name, Expert, Private acknowledgement).
  - "starting fresh can reload into a HashRouter destination" became "finishing setup through its Settings link lands on a HashRouter destination". It lands on Settings › Backup & history and survives a reload. At Standard, Settings hides the privacy-mode section by design, so the test asserts the "Encrypted cloud backup" heading.
  - The 640/641/720x520 test exposed a real defect: the desktop content region used `overflow-y: visible`, so the 720x520 window minimum clipped content inside the panel. The content region now always uses `overflow-y: auto`. At 641x700 the panel is 560px with no inner scroll (asserted). At 720x520, and on phone, the content region is the only scroll path.
- Out of claim, needed so android-checks CI stays green: `scripts/android-emulator-acceptance.sh` still expected the forced privacy step ("Who can read your world") and the seeded demo (a scene to start and a map for the editor). Fresh installs are now empty by requirement. The script now:
  - skips setup with Back;
  - taps "Open scene" (this creates the Command Center scene) and returns Home;
  - creates a map with New map, typed name and Enter;
  - accepts the current "Open DM screen" root call to action (renamed from "Enter GM Screen").

  I cannot run the emulator locally (no JDK). I replayed the same sequence in phone Chromium with the Android runtime flag using a temporary spec (since deleted), and it passed. The source-contract unit test `tests/unit/android-emulator-acceptance.test.ts` passed 20 of 20, and `bash -n` passed.

- Not changed: `apps/gm-react/scripts/verify-ui.mjs` still drives the old wizard. It is outside the claim, no gate runs it, and it cannot run here (the `playwright` package is not installed).
- Results: `playwright test cloud-enhanced-honest-limit responsive onboarding-consent golden-path --workers=3` **248 passed** on both profiles. Vitest: app catalogs/preferences/SceneRuntime **75**, cloud vaultMode **6**. Typecheck, ESLint on changed files, Prettier, `format:check:changed --base loop/rc` and raw-style count all passed.

## 2026-10-04 claim gate: Android script reverted

- The claim gate rejected `scripts/android-emulator-acceptance.sh`. The acceptance criteria do not require it, so it is reverted to base `9a7b675d` per the gate rule. All remaining paths outside the owned set are manifest companions (e2e specs, `*.test.ts`, i18n catalogs, qps-ploc, raw-style allowance) or this journal.
- **Known follow-up for the operator:** at base, the Android emulator acceptance script (CI android-checks only, not a local gate) still expects the removed privacy step ("Who can read your world") and the old seeded demo content (a scene to start, a map to open in the editor). Fresh vaults now start empty because the acceptance criteria require it. Expect android-checks to fail at the first-run step after this merges, until the script is updated.
- The tested fix was commit `74541f09`; after the 2026-10-05 squash it is preserved as a patch at the end of this journal. It skips setup with Back, taps "Open scene" (this creates the Command Center scene), creates a map through New map, a typed name and Enter, and accepts the "Open DM screen" root call to action. It was replayed in phone Chromium with the Android runtime flag, and its source-contract unit test passed. Cherry-pick it under a claim that owns the script, or widen this claim.
- Product code and tests are unchanged from `436f79cd`, whose results stand: the four affected e2e specs 248 passed on both profiles; unit tests 75 + 6 passed; typecheck, ESLint, Prettier and raw-style count passed.

## 2026-10-04 format gate

- The Format (changed) gate failed only on this journal's Markdown formatting. I ran Prettier on the journal and nothing else changed.

## 2026-10-05 linear history for the dispatcher rebase

- The dispatcher's rebase onto `8f9669b5` replays commits one by one, so the early commits conflicted with integration changes made since (Sidebar.tsx, en.ts, the raw-style allowance). Those conflicts had already been reconciled in merge commits, which a rebase drops. I merged `8f9669b5` cleanly and squashed the branch into one commit on top of it, so a rebase onto `8f9669b5` is a no-op. The content is unchanged from the reconciled merge.
- The out-of-claim Android acceptance-script follow-up (formerly commit `74541f09`, no longer on the branch after the squash) is preserved here as a patch against the base script. Apply it under a claim that owns `scripts/android-emulator-acceptance.sh`:

```diff
diff --git a/scripts/android-emulator-acceptance.sh b/scripts/android-emulator-acceptance.sh
index 49afbf7e..3e92a2be 100755
--- a/scripts/android-emulator-acceptance.sh
+++ b/scripts/android-emulator-acceptance.sh
@@ -167,15 +167,16 @@ wait_for_ui_text() {
 }

 # The Command Center's primary CTA is state-dependent (CommandCenter.tsx): "Open scene" with no
-# live session, "Enter scene" when live on a table scene, and "Enter GM Screen" when the live scene
-# is the GM Screen's own home scene. `Session`'s "Start session" falls back to that home scene when
-# nothing else is active — which is exactly what happens on the fresh install this script drives —
-# so an assertion that only means "we are back on the root destination" must accept any of them.
+# live session, "Enter scene" when live on a table scene, and "Open DM screen" (formerly "Enter GM
+# Screen"; the role word follows the vocabulary setting) when the live scene is the GM Screen's own
+# home scene. The fresh vault this script drives starts empty (RC-UX-3.6), so its session goes live
+# on that home scene. An assertion that only means "we are back on the root destination" must
+# accept any of them.
 wait_for_root_destination() {
 	local ui='' label
 	for _ in {1..45}; do
 		ui=$(dump_ui || true)
-		for label in 'enter gm screen' 'enter scene' 'open scene'; do
+		for label in 'enter gm screen' 'open dm screen' 'open gm screen' 'enter scene' 'open scene'; do
 			if [[ "${ui,,}" == *"$label"* ]]; then
 				return 0
 			fi
@@ -469,23 +470,24 @@ adb install --no-streaming "$APK_PATH" | grep -q 'Success' || fail 'fresh APK in
 step 'fresh signed install and cold launch'
 launch_app

-# Fresh installs open the first-run dialog. ADR-026: setup is NOT dismissible until the vault
-# privacy mode is explicitly decided — the first Back must keep the app foreground and land on the
-# forced privacy step instead of dismissing. After an explicit choice (Cloud-Enhanced needs no
-# typed acknowledgment), Back routes to skip and dismisses only that topmost overlay.
+# Fresh installs open the first-run dialog. RC-UX-3.6 (ADR-042): a Beginner or Standard GM is not
+# asked for consent, and Back skips setup from its first step, recording the defaults. Back must
+# dismiss only that topmost overlay and keep the app foreground.
 wait_for_ui_text 'Skip setup' || fail 'first-run setup did not become accessible'
 adb shell input keyevent KEYCODE_BACK
-wait_until_foreground || fail 'Back minimized the app instead of routing to the privacy step'
-wait_for_pid >/dev/null || fail 'the refused Back dismissal terminated the app process'
-wait_for_ui_text 'Who can read your world' || fail 'Back did not land on the forced privacy step'
-tap_ui_node 'Cloud-Enhanced vault' || fail 'the Cloud-Enhanced privacy option was not tappable'
-sleep 0.5
-adb shell input keyevent KEYCODE_BACK
-wait_until_foreground || fail 'Back minimized the app instead of dismissing decided first-run setup'
+wait_until_foreground || fail 'Back minimized the app instead of skipping first-run setup'
 wait_for_pid >/dev/null || fail 'dismissing first-run setup terminated the app process'
-wait_for_ui_text_absent 'Skip setup' || fail 'Back did not dismiss the decided first-run setup'
+wait_for_ui_text_absent 'Skip setup' || fail 'Back did not dismiss first-run setup'
 wait_for_ui_text 'Open scene' || fail 'root destination did not render after first-run setup'

+# A fresh vault starts empty (RC-UX-3.6). Opening the Command Center scene creates the scene a
+# session can start on; Home then returns to the root destination for the checks below.
+step 'fresh vault scene'
+tap_ui_button 'Open scene' || fail 'Open scene was not reachable on the fresh vault'
+wait_for_ui_text 'New screen' || fail 'Open scene did not open the Screens library'
+tap_ui_button 'Home' || fail 'Home navigation control was not reachable from Screens'
+wait_for_root_destination || fail 'Home did not return to the root destination'
+
 # Exercise renderer history and commit a real Core command before the final root-level minimize
 # check. "players see" is rendered only after session.set-workflow was accepted, so observing it now
 # and after process death proves more than the presence of an IndexedDB directory.
@@ -516,6 +518,13 @@ wait_for_root_destination || fail 'Back did not return from Session to Command C
 step 'fullscreen editor Back ordering'
 tap_ui_button 'Maps' || fail 'Maps navigation control was not reachable'
 wait_for_ui_text 'Open in map editor' || fail 'Maps destination did not render'
+# The fresh vault has no map yet, and the editor entry stays disabled until one exists. New map
+# focuses its required name field, and Enter submits the form.
+tap_ui_button 'New map' || fail 'New map was not reachable on the Maps destination'
+wait_for_ui_text 'Create map' || fail 'the New map dialog did not open'
+adb shell input text 'Harbor'
+adb shell input keyevent KEYCODE_ENTER
+wait_for_ui_text_absent 'Create map' || fail 'the new map was not created'
 tap_ui_button_until_text 'Open in map editor' 'Navigate map' \
 	|| fail 'fullscreen quick-map editor did not open'
 step 'fullscreen editor opened'
```
