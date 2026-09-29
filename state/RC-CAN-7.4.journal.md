# RC-CAN-7.4 run journal

## 2026-09-26 — implementation

- Starting from a clean task branch. No Headroom tools are available in this session; direct tool output is used.
- Core already owns `scene.set-pinned`, `scene.reorder-pins`, actor-filtered screen queries and durable order. CAN-7.3 already supplies library/header pin controls and the create-intent dialog.
- Implement shared pin rows, canonical screen navigation, accessible rail entries, and pins first in phone More. Keep the global IA intact and preserve uniquely labelled landmarks.
- Default screen provisioning is a later story: resolve recorded default origins when present and retain existing route aliases otherwise. The current home pointer still represents the old GM board, so do not reinterpret it as the new Command Center.
- The owned BottomTabBar.jsx has migrated to BottomTabBar.tsx. Phone route selection actually belongs to shell/Footer.tsx; a minimal resolver call there is required for consistent default destinations.
- Validation results are recorded below.

## Implementation and functional evidence

- Sidebar Screens and phone More share `PinnedScreenRows`, using CAN-7.3's actor-filtered names and pin order. Rows open the canonical `/screen/:id` route. More lists this group before the existing sections. Create passes the existing library intent; All screens is always available.
- Rail inserts accessible icon rows between Run and Library, with canonical selected state and a textual Live accessible name. No new global primary sections or nested navigation landmarks.
- Alt+Up/Down, row-menu Move up/down, and drag all use one `scene.reorder-pins` dispatch carrying the complete current pin set. Boundary moves are no-ops, focus follows stable keyed rows, results are announced, and rejected/persist-failed writes show errors. Row menus unpin with the same command used by library/header controls.
- Live requires both the active scene and active session workflow; idle/standby rows name visibility instead of inventing Draft/Ready editorial status.
- Run resolves default origins `command-center`, `gm-screen`, `session` when provisioned; existing aliases remain until later default-provisioning stories supply them. `Footer.tsx` is the actual phone route owner and needed the same resolver. No change was needed in the migrated BottomTabBar.tsx presentation primitive.
- Removed four raw style values from Sidebar; lowered its mandatory lint allowance from 24 to 20.
- Browser suite: 14 passed (both Chromium projects), including explicit 1440/900/390px cases, single-operation keyboard/drag assertions, retained keyboard focus, header/library/row unpin, create dialog, navigation, live/idle posture, and axe `landmark-unique`.
- Earlier run: two existing CAN-7.3 selectors became ambiguous with the new shell controls; scoped them to the content region. One startup timeout occurred during concurrent browser/container runs; the subsequent complete run passed. No application behavior was changed to mask it.
- Default resolver unit tests: 4 passed, including actor filtering and pre-provisioning aliases.
- App typecheck, full lint (existing emphasis warnings only), and `pnpm gates` passed.

## Visual verification

- The first whole visual run was stopped to focus on golden routes. Focused home checks: six expected desktop/rail shell differences, all three phone checks passed.
- A broad golden update exposed minor non-shell pixel differences. To check attribution, temporarily restored the six shell source files to HEAD and ran the original desktop tavern board baseline: passed. An exact baseline capture at that same HEAD also contains the board button pixel differences (bbox 476x206+440+287); those are within existing screenshot tolerance and do not originate in this implementation. Restored all implementation files afterward.
- Regenerated affected golden-route baselines while retaining prior pixels outside the shell; final comparison results follow below.

- Golden-route regeneration completed: 216 passed across the three visual projects. Retained HEAD pixels outside the sidebar/rail; a pixel-boundary audit confirmed all 116 modified PNGs differ only inside the shell (264px desktop, 64px rail), with zero changes outside it. No phone baseline changed.
- Added explicit phone 44px checks for New screen, All screens and row actions; shared row buttons can shrink beside their action control so long names truncate within the available width. Keyboard shortcuts are exposed through `aria-keyshortcuts`.
- Final shell unit run: 10 tests / 2 files passed. Full lint exited 0; targeted lint after the last touch-target change exited 0. Final typecheck exited 0.
- ImageMagick's default encoding pushed the refreshed set over the 32 MiB baseline budget. Applied lossless PNG compression only to the 116 changed baselines, reducing the full set to 30,321.5 KiB / 32,768 KiB. Budget check passed. Repeated the pixel-boundary audit after compression: 116 checked, zero differences outside the shell.

- Final pinned-container comparison without snapshot updates: **216 passed (5.0m)** across desktop, rail and phone. Exit 0.

## Final verification and handoff

- Final functional suite, `pinned-screens.spec.ts` plus `screens.spec.ts`, both Chromium projects: **14 passed (42.5s)**. Includes the added rail-order, phone pins-first and 44px control assertions. Persistent captures are saved by the focused tier tests for review.
- Pinned-container golden-route comparison: **216 passed**, no snapshot-update flag. Baseline size budget passes; only shell pixels changed.
- `pnpm gates` rerun passed, `git diff --check` clean, final app typecheck passed, shell unit tests 10 passed, full lint passed (existing warnings only).
- Scope additions needed for this implementation: phone route owner Footer.tsx, regression tests, mandatory shrinking style allowance, and affected screenshot baselines. No core/IA/provisioning changes; no dispatcher control state edits, agents, push, promotion, or additional loop.
- Implementation is ready for the central operator's independent gates and review. Existing aliases remain the fallback until CAN-7.6/7.8 provisions recorded default screens.
- Final capture run: 3 tier cases passed (10.7s), after waiting for the library and disabling capture-time animations. Inspected desktop, rail and phone captures: pins and controls fit their navigation surfaces; phone controls remain above the sheet's scrolling content.

## 2026-09-29 — retry after ownership rejection

- Starting at implementation commit `5f6a1382c5abbee2216b57a27838106a374229b0` on the same task branch, with a clean working tree.
- The supplied gate feedback was solely: `candidate changes paths outside its claim: apps/gm-react/src/app/shell/Footer.tsx`.
- The reissued task explicitly includes that exact path in its Owned paths. The existing Footer change is the phone Run-tab call to the shared, actor-filtered default-screen resolver, as required for consistent destinations across tiers. Retained that implementation; no application code or baseline change is needed for this ownership correction.
- No Headroom tools are available in this session. Inspected the actual commit and source using native tool output. No dispatcher claim/control state was edited; the current task's supplied ownership is the authorization, and the central operator must rerun its claim gate.
- Rechecking the two acceptance e2e files and shell unit tests below. The prior visual/typecheck/lint results above are historical evidence from the unchanged implementation, not newly executed gates in this retry. A journal-only follow-up does not change pixels, so the visual suite is not rerun.
- Fresh retry results: `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/pinned-screens.spec.ts tests/e2e/screens.spec.ts --workers=1` exited 0, **14 passed (35.7s)**; includes all three tiers, one-command keyboard reorder, and axe `landmark-unique`. `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/app/shell` exited 0, **10 passed / 2 files**. Journal formatting and `git diff --check` passed.
- This follow-up changes only the run journal. The original implementation remains committed and intact, including the now-owned Footer.tsx. No push, promotion, new loop, or dispatcher mutation was performed.

## 2026-09-29 — reconcile integration rebase conflicts

- The central rebase restored the original commits after binary baseline conflicts. Started clean at `ec3af1e0`; rebased the task branch onto the requested integration SHA `7fab0ebd28d92b659045dfbf6581911015783731`.
- Reproduced exactly 39 PNG conflicts and no source conflicts. Retained integration's `ROW_TEXT` two-line label wrapping in rows.tsx, its TopBar search sizing fix, and all other incoming application/test changes.
- Resolved each conflicting screenshot from Git's actual stage 2 (integration) and stage 3 (task): retain integration's full screenshot, replace only the left 264px desktop sidebar or 64px rail with the task navigation. Used lossless PNG encoding. No wholesale choice of either side, and no content-area baseline overwrite.
- Rebase completed: implementation `2be9dacf`, ownership journal `7b2f5284`, both on top of `7fab0ebd`. The working tree was clean immediately afterward. Baseline budget: 556 images, 31,006.5 KiB / 32,768 KiB, passed.
- Rebased-tree validation and pixel audit are recorded below. No Headroom tools are available; all diagnostics are original native tool output. No dispatcher state edits, pushes, promotion, loops, or agents.
- Pixel audit against the actual integration commit: 116 task-modified PNGs checked, **zero pixel differences outside the desktop sidebar/rail**. This covers both conflict resolutions and automatically replayed baselines.
- Fresh rebased-tree acceptance run: `pinned-screens.spec.ts` + `screens.spec.ts`, both Chromium projects, **16 passed (43.7s)**. The increased count includes integration's /board re-entry regression test. Shell unit suite: **10 passed / 2 files**. Repository gates passed; full pinned-container screenshot comparison with snapshot updates disabled is running next.
- Fresh app typecheck, full lint, and repository gates all exited 0. Existing nonblocking emphasis/file-size warnings remain. The complete pinned visual suite contains 426 tests on this integration base; running `bash apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=2` rather than relying on the pre-rebase 216-test result.
- Source-scope audit relative to `7fab0ebd`: production changes are exactly Sidebar.tsx, RailNav.tsx, MoreSheet.tsx, Footer.tsx, rows.tsx, and sections.ts. Incoming production code outside those six owned files is unchanged. Confirmed `7fab0ebd` is an ancestor and no unmerged paths remain.
- Visually inspected representative reconciled desktop Command Center and rail scene-editor baselines; navigation is intact alongside integration's content and editor polish. These reconciled golden-route baselines passed the full comparison run; additional Graph baseline failures are detailed below.

- Full pinned-container comparison exited 1: **416 passed, 10 failed / 426 tests (8.2m)**. All failures were Graph desktop/rail snapshots across five themes, whose baselines still showed Scenes. The original implementation had run only the 216 golden-route cases, so it missed this separate specification. Inspected original failure logs and expected/actual/diff images; the visible mismatch was navigation.
- Regenerated Graph's initial, selected, empty, and repair states in the pinned container, then retained integration's exact pixels outside the sidebar/rail. This updates 40 additional PNGs; phone baselines remain unchanged. Snapshot generation passed 15 cases, but comparison with updates disabled is the validation gate.
- Fresh focused comparison: `bash apps/gm-react/tests/visual/run-in-container.sh graph-polish.spec.ts --update-snapshots=none --workers=2` exited 0, **15 passed (28.1s)**, covering all four Graph states at all three tiers. The other 411 non-Graph cases passed in the preceding full run. The complete 426-case suite was not rerun after this baseline-only fix.
- Final pixel audit against `7fab0ebd`: **156 PNGs, zero differences outside navigation**. Baseline budget passed: 556 files, 29,897.0 KiB / 32,768.0 KiB. Visually checked the Graph repair high-contrast rail baseline. No application changes followed the successful functional/typecheck/lint/gate runs.
- Reconciliation is committed on the current task branch for central review; no push, promotion, dispatcher mutation, additional loop, or delegation.
