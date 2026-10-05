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
- The out-of-claim Android acceptance-script patch that was preserved here has now landed on the branch (see the next entry).

## 2026-10-05 review rejection: CI scripts, replay, cleanup

The review of `61d784cb` rejected the candidate for two CI jobs that assume a seeded fresh profile, which the story removes. Both fixes are outside the claim. The fence feedback for an earlier attempt said to revert out-of-claim paths unless they are required, so the task should now block for the operator to decide whether to widen the claim. Without these two paths the review rejects the candidate, and with them the fence blocks it.

- `apps/gm-react/electron/smoke-parity.cjs` (desktop-smoke job): the parity smoke clicked Start session on a fresh profile, and an empty campaign has no scene, so the badge never appeared. The smoke now opens the Screens library first, which creates the Command Center home scene the same way the hub's "Open scene" button does, then returns to `#/`. `DISPLAY=:0 pnpm --filter @dndtools/gm-react desktop:smoke` passed every step, parity write and verify included (`/tmp/rc-ux36-smoke1.log`), and passed again on the final tree (`/tmp/rc-ux36-smoke2.log`).
- `scripts/android-emulator-acceptance.sh` (android-checks job): applied the patch that was preserved in this journal. Back skips setup, "Open scene" creates the home scene, New map plus a typed name creates a map before the editor step, and the root check accepts "Open DM screen". I checked every label against the current catalog ("Create map" is a literal in `MapCreationForm.tsx`). `bash -n` passed, and the source-contract test `tests/unit/android-emulator-acceptance.test.ts` passed 20 of 20. I replayed the sequence in phone Chromium with a temporary spec (now deleted): skip, Open scene, Home, Session, then Start session and confirm, "Players see", Back to root, Maps, New map, Harbor + Enter, and "Open in map editor" enabled. It passed. The emulator itself cannot run here (no JDK), so `gh workflow run CI --ref <branch>` is still the operator's check; I did not push.
- Replay (medium finding): the name field now pre-fills from the catalog unless creation is pending, and the system select starts at the active package. Finishing only dispatches `system.select` when the system actually changed, and skip no longer dispatches it at all.
- i18n (low): the skip fallback name uses `home.yourCampaign`. A rejected system change shows `onboarding.v3.systemFailed`, and any storage or catalog error shows `onboarding.v3.saveFailed`, in place of the English exception text.
- Dead code (low): deleted the v2 step components (Welcome, Vault, Privacy, Tools, Players, Ready), ChoiceCard and StepRail, the unused `shared.ts` exports and their raw-style allowances. `scripts/emphasis-baseline.json` still lists five of the deleted files. The emphasis lint only reports those entries as shrinkable and exits 0. I left the file alone because it is outside the claim. `apps/gm-react/scripts/verify-ui.mjs` is also outside the claim and untouched.
- Evidence (low): the Standard and Beginner runs now check for E2EE copy on all three steps. On phone they open More and check that the campaign row shows the name. The replay test now asserts the pre-filled name and Generic system.
- Results: `playwright test onboarding-consent golden-path cloud-enhanced-honest-limit --workers=3` **86 passed** (both profiles); `responsive` **162 passed**; vitest app (preferences, SceneRuntime, i18n) **75**, cloud vaultMode **6**, Android script contract **20**; gm-react typecheck, ESLint on changed files, Prettier, raw-style count and emphasis lint passed.
- Local commit only. Nothing pushed or promoted, and no dispatcher state touched.

## 2026-10-05 claim fence after rebase onto ae852b4e: two CI scripts kept

- The fence flagged `apps/gm-react/electron/smoke-parity.cjs` and `scripts/android-emulator-acceptance.sh` again. I kept both, so the task blocks for the operator's claim decision. The previous attempt reverted the Android script on the same fence rule, and the review of `61d784cb` then rejected the candidate for exactly these two CI breaks: desktop-smoke failed 3 of 3, and android-checks fails deterministically. Fresh vaults start empty because the story requires it, and neither script can pass on an empty vault without these edits. No path in the claim can supply a scene and a map to a fresh profile without seeding the vault, which the acceptance forbids. The decision needed is whether to widen the claim to these two paths.
- Re-verified on the rebased tree: gm-react typecheck passed; `playwright test onboarding-consent golden-path cloud-enhanced-honest-limit --workers=3` **86 passed** on both profiles; `desktop:smoke` passed every step, parity write and verify included (`/tmp/rc-ux36-smoke3.log`); the Android script contract test passed 20 of 20 and `bash -n` passed; raw-style count passed.
- Local commit only. Nothing pushed or promoted, and no dispatcher state touched.

## 2026-10-05 claim widened to the two CI scripts

- The operator widened the claim to `apps/gm-react/electron/smoke-parity.cjs` and `scripts/android-emulator-acceptance.sh`, so every changed path is now owned or a manifest companion. The fence feedback on this attempt predates the widening.
- No code changed. The branch is still `f9eb0f07`, `b4c753e1`, `4b818e2b` on base `ae852b4e`, the same tree that the previous entry's results cover: 86 e2e passed on both profiles, desktop smoke green, the Android contract test 20 of 20, typecheck and raw-style count passed.
- Local commit only. Nothing pushed or promoted, and no dispatcher state touched.
