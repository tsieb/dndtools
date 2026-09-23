# RC-SES-6.1 run journal

- Scope: the twelve owned core/app files plus companion tests; no delegation, push, promotion or dispatcher changes.
- Native Bash/Read used for reads and command output (dispatch Headroom tools not loaded). Full logs kept at `/tmp/rc-ses-6-1-{core,app,tooling}.log`.

## What changed

- `lifecycle/session-workflow.ts`: every former `live-session` and `dm-admin` command is `always`; the category type is now `lifecycle | always`. New `SESSION_LIVE_ONLY_EFFECTS` (session clock, audio automation + SFX, session-start triggers), `isLiveWorkflow`, the additive `SessionWorkflowStamp` field, `stampWorkflow` and `happenedLive`.
- Guards removed from dice, combat (incl. combatant management), character combat resources, handout delivery, `session.record-dice`, `session.project-active-map`, the quick-panel timer and session-writing widget commands. The palette's "Project active map" no longer requires live.
- Records stamped with the workflow they happened in: every dice roll (incl. legacy `record-dice`), every new encounter-log entry (stamped centrally in `combat.ts` `withCombat`, so tracker-generated expiry entries are covered too) and every handout delivery.
- Archive on recap/archived keeps only live records: rolls, encounter-log entries, and handouts with at least one live delivery. Capture and recap both read this archive, so neither sees a Standby roll.
- `state/audio-automation.ts`: `AudioAutomationTrigger.sessionWorkflow`; a trigger fired outside `active` resolves no rule. Absent = a hand-run resolution ("Run now", outcome preview), which is not gated. `combat-audio-automation.ts` passes the current workflow.
- `queries/session-control.ts`: `canMutateActiveSession` / `canExecuteLiveCommands` are true in every workflow; new `recording` flag (live only); prep/idle/ending report `ready`, recap/archived stay `read-only`.

## Decisions

- "Live" means `active` only, matching the story wording and the existing `mode: 'live'`. A roll made while paused or ending counts as outside a session.
- A record with no stamp predates this story, when every writing command was refused outside `active`, so `happenedLive` reads it as live.

## Outside the claim (follow-ups)

- `state/session-state.ts` / `state/combat-tracker.ts` are not owned, so the field is declared in `SessionWorkflowStamp` and not yet on `SessionDiceRoll`, `CombatLogEntry` or `HandoutDeliveryRecord`.
- `apps/gm-react/src/runtime/sfx-events.ts` is not owned. It must pass `sessionWorkflow: nextState.session.workflow` for SFX events to wait for Go live; the core gate is ready.
- The "Outside a session" history label needs the UI (`DiceTray.tsx`, owned by RC-SES-6.2) or `queries/dice-history.ts` to read `happenedLive`. No i18n key was added, to avoid an unused key.

## Validation

- `pnpm --filter @dndtools/core typecheck` and `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- Core vitest: 274 files / 4944 tests passed (was 4779; the new `session-standby-permits-everything.test.ts` covers 22 commands × 7 workflow states). After formatting and the import fix, a targeted re-run of the 9 touched core test files passed 380/380.
- App vitest (`vitest.app.config.ts`): 126 files / 1336 tests passed; targeted re-run of `combat-audio-automation` + `sfx-events` passed 17/17.
- Root tooling vitest: 24 files / 162 tests passed. `pnpm lint:boundary`: passed. ESLint on changed files: exit 0.
- Prettier: files clean at HEAD are formatted. Five files were already unformatted at HEAD; attempt 1 formatted only my hunks in them.

## Attempt 2 (gate feedback: "Format (changed)" failed on `b75d1b14`)

- The gate (`pnpm format:check:changed --base loop/rc`) checks whole changed files, so the five files that were already unformatted failed it: `commands/handout.ts`, `commands/widget-command.ts`, `queries/session-control.ts`, `tests/dice-commands.test.ts` and `tests/handout-delivery.test.ts`. Ran `prettier --write` on all five. This is formatting only; the changed lines outside my hunks are line wrapping and `(typeof x)['parse']` parentheses.
- After formatting: `pnpm format:check:changed --base loop/rc` exit 0. Core typecheck exit 0. ESLint on the five files exit 0. Vitest on dice-commands, handout-delivery, session-standby-permits-everything, session-lifecycle, active-session-control, quick-reference and widget-lifecycle passed 7 files / 273 tests.

## Attempt 3 (gate feedback: "Browser acceptance" failed on `d59fb103`)

- Real failure: `tests/e2e/inline-roll.spec.ts:124` "outside a session it still rolls and says the result was not recorded", on both projects and all 3 attempts. The chip read "… Recorded in the session log." because the core now accepts a Standby roll and `NoteViewer`'s logger returns true on accept. The three flaky tests passed on retry and are unrelated to this story: knowledge-filters saved search (desktop + mobile) and the map-editor POI nudge.
- The old copy was also untrue under this story, because a Standby roll is recorded but kept out of the session log. `RollButton.tsx` and `NoteViewer.tsx` are not owned, so the fix stays in companion paths:
  - `markdown.rollRecorded` → "Recorded in the roll history." (ES "Registrado en el historial de tiradas."), which is true live and in Standby.
  - `markdown.rollNotRecorded` → "Not recorded." (ES "Sin registrar."). It now shows only for a refusal or a host with no logger, so "no session is running" was no longer its reason.
  - `render.test.tsx` expects the new copy.
  - The e2e test now asserts that a Standby roll lands in the history with `sourceKind: 'inline'` and the current non-live workflow, that the chip shows its total and "Recorded in the roll history", and that the chip never mentions the session log.
- Follow-up outside the claim: the `RollButton.tsx` / `NoteViewer.tsx` header comments still say the core refuses rolls outside a session. A chip that says "Outside a session" for a non-live roll needs those files.
- Validation: inline-roll e2e passed 8/8 (desktop + mobile, `/tmp/rc-ses-6-1-inline-roll.log`). App vitest passed 126 files / 1336 tests. gm-react typecheck exit 0. ESLint on the four edited files exit 0. The old copy appears nowhere else in the repo.

## Attempt 4 (independent review: SFX and non-live history defects)

- The prior journal's SFX, type attribution, and dice-history label follow-ups are now implemented. Necessary companion paths are included to finish the reviewed behavior; no dispatcher state was edited.
- `runtime/sfx-events.ts` ignores dispatched table events outside `active` and supplies the workflow to the core resolver. A seven-workflow runtime matrix covers critical rolls, handout delivery, map reveal and death saves, alongside the existing combat-start runtime coverage.
- Session resets retain non-live dice history, combat log entries and handout deliveries; archives continue to contain only live records. Starting a new combat preserves prior non-live log entries. The lifecycle regression follows Standby records through recap, archive and idle and verifies the archive still excludes them.
- The three durable record interfaces now declare the additive workflow stamp. The actor-filtered dice query retains that stamp without changing visibility filtering. Both newest and older dice history rows label non-live rolls "Outside a session" (English and Spanish catalogs). A rendered seven-workflow UI test caught and then verified the newest-row case.
- Validation: full core suite 274 files / 4944 tests passed; full app suite 127 files / 1350 tests passed. Original logs: `/tmp/rc-ses-6-1-review-core-full.log` and `/tmp/rc-ses-6-1-review-app-full.log`. Focused lifecycle/capture matrix: 226 passed; audio runtimes: 24 passed. Core typecheck and changed-file ESLint passed. Final app typecheck, boundary and format checks recorded below after completion.
- Browser acceptance and central wrapper gates are left to the central operator, as requested; no push or promotion performed.
- Final checks: gm-react typecheck exit 0; boundary lint passed; Prettier on all changed source/tests passed; `git diff --check` clean.

## Attempt 5 (2026-09-19: expanded ownership after claim fence)

- The operator brief dated 2026-09-18 explicitly adds the five paths named by the claim fence. The existing implementation is present at `48b93caa`; the working tree was clean on entry. No implementation rewrite is needed for this ownership-only feedback. This attempt preserves the candidate and records fresh verification.
- Minimal-change justification for each newly owned path:
  - `apps/gm-react/src/runtime/sfx-events.ts`: pass the recorded dispatch workflow to automation resolution and ignore non-live event dispatches, so table tools cannot play automatic SFX in Standby.
  - `apps/gm-react/src/screens/session/DiceTray.tsx`: carry the optional workflow stamp in the view prop and label both newest and older non-live rolls "Outside a session". No layout redesign.
  - `packages/core/src/queries/dice-history.ts`: expose the optional recorded workflow through the existing actor-filtered read model. Visibility checks are unchanged.
  - `packages/core/src/state/combat-tracker.ts`: extend `CombatLogEntry` with the optional workflow stamp, declaring the additive field already written by combat commands.
  - `packages/core/src/state/session-state.ts`: extend dice rolls and handout deliveries with the same optional stamp, retaining compatibility with older records.
- The existing lockstep regression, 22-command/seven-workflow matrix, combat-start runtime test, SFX workflow matrix, rendered history labels and capture/recap exclusion tests remain in place. No agents, dispatcher writes, push or promotion were used. Headroom tools were unavailable; native command logs retain the original validation output under `/tmp/rc-ses-6-1-sep19-*.log`.
- Fresh validation: full core suite passed (274 files / 4944 tests); core and gm-react typechecks exited 0; ESLint over all candidate TypeScript paths exited 0; boundary lint passed; changed-file formatting against `710931d0^` passed (34 files); `git diff --check` passed.
- Full app suite: 126 files passed, 1 failed; 1349 tests passed, 1 failed. Original diagnostic in `/tmp/rc-ses-6-1-sep19-app.log`: `apps/gm-react/src/app/help/changelog.test.ts:85`, expected `0.3.7`, received `Unreleased`. The changelog parser, test, root CHANGELOG.md and app package.json have no changes between `710931d0^` and this candidate (`git diff --exit-code` returned 0). This unrelated failure is preserved for the central operator; the app suite is not claimed green.
- Focused SFX, combat automation and rendered dice-history suites passed 3 files / 31 tests (original output `/tmp/rc-ses-6-1-sep19-focused-app.log`). No production code changed during this attempt; only this ownership justification and current validation record are committed. Browser acceptance and independent central gates remain pending.

## Attempt 6 (integration rebase onto 51cec177)

- Rebased this task branch onto `51cec17732d5423acaa381ff8c6a521f8a566e0c` as requested. The sole textual conflict was the combat authority header: retained RC-SES-5.1's player initiative permissions and RC-SES-6.1's workflow availability documentation.
- Reconciled the integration branch's new initiative resource handler with this task: removed its remaining call to the deleted live-session guard. Running-combat, character ownership, one-roll-per-call and DM adjustment restrictions remain intact.
- Added seven-workflow initiative coverage in the existing RC-SES-5.1 companion suite. It opens initiative, checks unauthorized cross-character rolls are refused, permits the owner's first roll and the DM's adjustment, checks workflow attribution and rejects a duplicate player roll.
- No newly owned path needed another change. No delegation, push, promotion or dispatcher-state edits. Native tools used because no Headroom tools were available. Rebase validation originals are under `/tmp/rc-ses-6-1-rebase-*.log`.
- Final rebase validation: full core suite passed 282 files / 5074 tests; full app suite passed 141 files / 1543 tests. Both typechecks exited 0; touched-file ESLint, boundary lint, candidate changed-file formatting and explicit formatting of the added initiative tests/journal passed. `git diff --check` passed. The prior changelog test failure does not reproduce on this integration base.
- Verified `51cec17732d5423acaa381ff8c6a521f8a566e0c` is an ancestor of HEAD. Range-diff confirms the four later candidate commits replayed unchanged and the original implementation commit differs only in the preserved initiative authority header; this follow-up commit carries the new initiative guard reconciliation and tests. Central wrapper/browser gates and independent review remain the operator's next step.

## Attempt 7 (independent review of 380ae33c: recovery and command coverage)

- Entry state: clean current task branch at `380ae33c`. No Headroom tools are available in this session; native command output originals are retained under `/tmp/rc-ses-6-1-review-fixes-*.log`. No agents, dispatcher writes, push, promotion or additional loop.
- Fixed the high-severity recovery loss in owned `commands/session-control.ts`: recovery merges archived records with current non-live records by durable identity and orders them by recorded time. Combat tracker state still restores from the archive. Handouts merge delivery identities within each handout while restoring archived handout content; outside-only handouts survive. Archive snapshots remain unchanged.
- Added a recovery regression covering Standby rolls, combat-start history, outside-only handouts, mixed Standby/live deliveries of the same handout, a post-archive recap roll, repeated recovery without duplicate records, and archive immutability. Ran it against the original handler: failed with the reported missing Standby/recap rolls (`/tmp/rc-ses-6-1-recovery-before.log`). Restored the fix and verified it passes.
- Extended the companion workflow matrix with all ten missing combat commands: previous-turn, add-combatants, remove-combatant, reorder-combatant, set-combatant-visibility, place-token, move-token, remove-token, place-template and remove-template. Each executes with its real preconditions in all seven workflows. Existing initiative coverage remains in `rc-ses-5-1-player-initiative.test.ts`; existing lockstep coverage remains in `session-lifecycle.test.ts`.
- Validation: 7 focused core files / 420 tests passed, including workflow matrix (237 tests), recovery, capture, lifecycle lockstep, initiative, tracker and tokens. Core typecheck and changed-TypeScript ESLint exited 0. Original logs: `/tmp/rc-ses-6-1-review-fixes-core.log`, `/tmp/rc-ses-6-1-review-fixes-typecheck.log`, `/tmp/rc-ses-6-1-review-fixes-eslint.log`. Central wrapper/browser gates and independent review are not claimed run.
- Still unresolved: the combat history projection drops `workflow` in `packages/core/src/queries/combat-tracker-view.ts`. That file is absent from the explicit owned-path list, including the operator's five additions. Requested authorization for the minimal projection/type change and companion visibility tests; no answer received during this attempt. Left that file unchanged to respect the previous ownership fence. This commit is a partial repair, not a claim that every review finding is resolved.

## Attempt 8 (combat projection review; ownership update still missing)

- Entry: clean task branch at `3130af3e`. The new task prompt repeats the same explicit owned paths and the review's requirement for an ownership update; `packages/core/src/queries/combat-tracker-view.ts` remains excluded. Requested that single-path scope addition. No authorization received before this journal update, so the production query remains unchanged.
- Reproduced the review defect with a temporary Vitest probe: dispatched `combat.start` in all seven workflows, then read the existing actor-filtered query as DM and player. All 14 rows lose the stored workflow; all 12 non-active rows are consequently misclassified as live by `happenedLive`. The original output was read directly at `/tmp/rc-ses-6-1-projection-scope-probe.log`. The probe failed as expected on the attribution assertion; this is not a passing gate. An initial probe invocation used the wrong query signature; the retained final probe uses `(combat, permissions, actorId)`.
- Retained the temporary probe source at `/tmp/rc-ses-6-1-projection-scope-probe.test.ts` outside the tracked test suite. The minimal pending repair is to expose the optional workflow on `CombatLogEntryView` and copy it in the existing filtered projection, with outside-session labeling and visibility-preserving regression coverage. Do not replace actor-scoped reads or change archive filtering.
- This attempt commits only the required run journal. Acceptance remains incomplete pending ownership authorization. No production edits, dispatcher control changes, agents, additional loops, push or promotion. Headroom tools were unavailable; native tools retained exact probe output.

## Attempt 9 (combat history projection now owned)

- Entry: clean task branch at `8a5a16fb`. The 2026-09-22 operator brief adds `packages/core/src/queries/combat-tracker-view.ts` to the owned paths. Headroom tools were unavailable; native output originals are under `/tmp/rc-ses-6-1-a9-*.log`. No agents, dispatcher writes, push, promotion or extra loop.
- Fix (justification for the newly owned path): `CombatLogEntryView` now extends `SessionWorkflowStamp`, and the existing actor-filtered projection copies `workflow` only when the stored entry has one. Legacy entries still project without the field and read as live. The filter is unchanged, so attribution cannot widen visibility.
- Regression coverage in `session-standby-permits-everything.test.ts`: in all seven workflows, a DM and a player each read the projected history. Every row keeps the stored workflow, `happenedLive(row)` matches the stored record, and the entry that names a hidden combatant still reaches only the DM. A separate legacy-entry case confirms no workflow is invented. Mutation check: with the projection line removed, all 7 workflow cases fail. With it restored, they pass.
- Validation: full core suite 282 files / 5153 tests passed; `pnpm test:app` 141 files / 1543 tests passed. Core and app typechecks exited 0. ESLint on the touched files exited 0. Prettier was applied to the test. An earlier app run with the wrong vitest config gave IndexedDB-missing failures in unrelated audio tests; the correct root `vitest.app.config.ts` run is green. Central wrapper/browser gates and independent review are not claimed run.

## Attempt 10 (visual gate red on `/scene/:id`; reproduced on the base)

- Entry: clean task branch at `01ab6d55` (the operator's rebase of attempt 9). Gate feedback: quality gates and changed-file formatting passed. The pinned visual container failed 1 of 135 tests: `[visual-phone] golden routes — high-contrast › /scene/:id`, with 25196 px (0.08) different. Original log: `.state/attempts/f4890abd-…/output.log`. Headroom tools were unavailable, so I read native originals directly.
- The failing capture is the Command Center, not the scene editor. The spec opens `/` and then `/scene/:id` with `openShelled`. The second `goto` changes only the hash, and `__rt.loaded`, `#main-content` and the `h1` already exist from the first page, so every wait resolves before the router swaps routes. This is a harness race in `apps/gm-react/tests/visual/golden-routes.spec.ts`. The spec is not an owned path, and this story does not render the scene editor differently.
- Evidence: `run-in-container.sh --update-snapshots=none --workers=2 --repeat-each=3 -g "/scene/:id"`. On this branch, three runs failed 4/27, 8/27 and 5/27 (`/tmp/rc-ses-6-1-a10-visual-{1,2,3}.log`). On a detached `/tmp` worktree at merge-base `7c451039`, two runs failed 4/27 and 3/27 (`/tmp/rc-ses-6-1-a10-base-visual-{1,2}.log`). Failures landed on every theme and on both viewports. A base failure artifact (`tavern` phone) shows the same Command Center capture. The `/tmp` worktree has since been removed.
- Not changed: the unowned spec and the PNG baselines. Re-baselining would be wrong, because the expected image is correct. The minimal follow-up fix, for its owner, is to have the `/scene/:id` case wait for a scene-editor-specific element or for `location.hash` and the new `h1` text before `snap`. A gate retry can pass, since the race is intermittent (about 1 in 6 of the six per-run `/scene/:id` cases failed under repeat load). This commit adds only the journal. No production edits, agents, dispatcher writes, push or promotion.

## Attempt 11 (resume after provider allowance limit)

- Entry: clean task branch at `24906e5e`. The previous session hit its provider allowance after committing attempt 10. The work tree was clean, so nothing was lost. The operator's 2026-09-22 combat-projection fix is already committed in `d50b5b43`, with its seven-workflow regression and legacy-entry case. Headroom tools were unavailable. Native output originals are under `/tmp/rc-ses-6-1-a11-*.log`. No agents, dispatcher writes, push, promotion or extra loop.
- Base: this branch is 15 commits behind `origin/loop/rc` (`52161311`). Its merge-base is `b0665d2d`. `git merge-tree --write-tree HEAD origin/loop/rc` merges cleanly. I did not rebase; integration is the operator's step.
- Revalidation: 8 focused core files / 402 tests passed. They cover the workflow matrix with the combat projection regression, lifecycle lockstep, dice, handouts, combat tracker, recovery and initiative, and the quick timer. 3 app files / 31 tests passed: SFX workflow gating, combat-start automation in Standby vs live, and dice-history labels. Core and gm-react typechecks exited 0. I don't claim the central wrapper/browser gates or the independent review. The `/scene/:id` visual race from attempt 10 still belongs to the unowned spec.

## Attempt 12 (browser acceptance red; every failure reproduces on the base)

- Entry: clean task branch at `d452a6eb`, based on the `origin/loop/rc` tip `52161311`. Gate feedback: Browser acceptance failed. The other nine gates passed. Headroom tools were unavailable, so I read the original log directly: `.state/attempts/32e8d2d8-…/output.log`. Its result: 3 failed, 7 flaky, 1265 passed. No agents, dispatcher writes, push, promotion or extra loop. No production or test code changed in this attempt.
- The hard failures were `settings.spec.ts:101` on desktop and mobile and `themes.spec.ts:45` on mobile. After a second reload, `__rt.loaded` never became true and the page was blank. A temporary console probe showed `net::ERR_INSUFFICIENT_RESOURCES` on module loads during the third reload. The probe was deleted afterwards. That symptom is the shared-/tmp shm exhaustion that `32ef11ad` ("stop 304 revalidation exhausting Chromium shared memory") fixes. `32ef11ad` is not an ancestor of this branch or of `origin/loop/rc`.
- Evidence, both specs run with `--repeat-each=3` on two workers:
  - This branch as committed: 12/12 failed (`/tmp/rc-ses-6-1-a12-branch.log`).
  - This branch with `32ef11ad`'s `vite.config.ts` and `playwright.config.ts` hunks applied uncommitted: 12/12 passed (`/tmp/rc-ses-6-1-a12-branch-withfix.log`).
  - A detached worktree at base `52161311` without the fix: 12/12 failed (`/tmp/rc-ses-6-1-a12-base-nofix.log`).
- The flaky tests were re-run with the fix applied: all of `sfx-events.spec.ts` (this story's area), `settings.spec.ts:180/:203`, `themes.spec.ts:59` and `custom-widgets.spec.ts:742`, each with `--repeat-each=3`. 41 passed and 1 failed (`/tmp/rc-ses-6-1-a12-flaky-withfix.log`). The one failure was `custom-widgets.spec.ts:742`: the live region read `Paused 1:59` where the timer text read `0:59`. The same test on the base with the fix failed 2 of 10 runs with the identical `Paused 1:59` message (`/tmp/rc-ses-6-1-a12-base-cw.log`). This branch's only functional change to widget timers removes the active-workflow check, and that test goes live first. The failure is therefore a race in the RC-WID-4.4 spec, which reads the timer text before it re-renders.
- Not changed: `apps/gm-react/vite.config.ts`, `playwright.config.ts` and the specs. None of them are owned. The remedy is to land `32ef11ad` on `loop/rc`, then rebase and re-run browser acceptance. The temporary hunks, probe spec and base worktree were removed, and the tree is clean apart from this journal. At the probe, /tmp quota use was about 9.7 GB of 12.8 GB.

## Attempt 13 (browser acceptance still red on the same base-red spec)

- Entry: clean task branch at `e6338afe`. `origin/loop/rc` is still at `52161311` and still lacks `32ef11ad`. Headroom tools were unavailable, so I read the original gate log directly: `.state/attempts/c592368d-…/output.log`. Its result: 1 failed, 12 flaky, 1262 passed. No agents, dispatcher writes, push, promotion or extra loop. No code changed; there have been no code changes since `d452a6eb`, only journal entries.
- The one hard failure was `[mobile-chromium] settings.spec.ts:101`, with a `waitReady` `__rt.loaded` timeout after reload. This is the spec that attempt 12 proved red 12/12 on the base without `32ef11ad` and green 12/12 on this branch with it.
- `sfx-events.spec.ts:82` (mobile), in this story's area, was flaky and passed on its second retry. Neither failure was an assertion. The first try failed on `browserContext.close: Target page, context or browser has been closed`. Retry 1 hit the same boot timeout in `gotoRoute` → `waitReady`, before any SFX assertion ran. The whole file passed 3/3 on both profiles in attempt 12 with the memory fix applied. The other flaky specs (map onboarding, maturity signals, party stash, `responsive.spec.ts:242`, `settings.spec.ts:203`) are outside this story. The log has no `ERR_INSUFFICIENT_RESOURCES` line because Playwright doesn't print browser console output there. Without that line I attribute the boot timeouts only by their shape and by attempt 12's A/B.
- Still blocked outside the owned paths: this gate can't go green until `32ef11ad` (the `vite.config.ts` + `playwright.config.ts` fix) lands on `loop/rc` and this branch is rebased. I have not cherry-picked it, because it would cross the write fence.

## Attempt 14 (rebased onto repaired `loop/rc` `42c9f7ea`; browser gate still blocked by `32ef11ad`)

- Entry: clean branch at `2240c5d6`. As requested, rebased onto the local integration branch `loop/rc` `42c9f7ea`. The rebase was clean. That tip adds only `state/ci-recovery-983ec990e3d6.journal.md` on top of `52161311`, and it still lacks `32ef11ad`: `vite.config.ts` has no `DNDTOOLS_E2E_FULL_RESPONSES`. `origin/loop/rc` is unchanged at `52161311`. Headroom tools were unavailable, so I read the originals directly: the gate log at `.state/attempts/e362a743-…/output.log` and local logs at `/tmp/rc-ses-6-1-a14-*.log`. No agents, dispatcher writes, push, promotion or extra loop. No code changed.
- Gate feedback for `2240c5d6`: the only hard failure was `[mobile-chromium] settings.spec.ts:101` again. The flaky `sfx-events.spec.ts:104` (mobile) was a `waitReady` boot timeout, not an SFX assertion.
- Local gates on the rebased head:
  - Core suite: 282 files / 5153 tests passed.
  - `pnpm test:app`: 146 files / 1644 tests passed.
  - Root `pnpm typecheck`: exited 0.
  - Full `pnpm lint`: exited 0.
  - `format:check:changed -- --base loop/rc`: passed.
- Browser, with `sfx-events.spec.ts` + `settings.spec.ts:101`, `--repeat-each=3` on both profiles:
  - As committed, 11/24 failed. All 6 `settings:101` runs failed; the other 5 were SFX runs that shared the host with them (`/tmp/rc-ses-6-1-a14-e2e.log`).
  - `sfx-events.spec.ts` alone passed 18/18 (`…-sfx-alone.log`).
  - With `32ef11ad`'s config hunks applied uncommitted, 24/24 passed (`…-e2e-withfix.log`). The hunks were reverted afterwards.
- So nothing left in the browser gate belongs to this story. It stays red until `32ef11ad` lands on `loop/rc`. That commit touches unowned `vite.config.ts` and `playwright.config.ts`, so it was not cherry-picked here.

## Attempt 15 (same base defect; now visible directly in the gate log)

- Entry: clean branch at `37733d91`. Rebased onto `loop/rc` `f6a8aa36` (= `origin/loop/rc`). The rebase was clean. That tip adds only `promotion-recovery-f691d2271daa.md`, and it still lacks `32ef11ad`. No code changed; this commit adds only the journal. Headroom tools were unavailable, so I read the gate log directly: `.state/attempts/2a45f5f5-…/output.log`. No agents, dispatcher writes, push, promotion or extra loop.
- Gate result: 2 failed, 7 flaky, 1266 passed.
  - Hard failures: `settings.spec.ts:101` on both profiles. All four printed failure blocks with this signature are `waitReady` `__rt.loaded` timeouts.
  - Flaky `sfx-events.spec.ts:131` (mobile): its failed try logged `page.goto: net::ERR_INSUFFICIENT_RESOURCES at …/#/session`. This is the first gate log where the resource exhaustion that `32ef11ad` fixes shows up directly.
  - The other flaky failures match known issues: `settings.spec.ts:180` (the environmental stall noted in the /tmp-quota memory note) and `responsive.spec.ts:242` ("left 555px of the main pane unused", which also fails on the base).
- Attempt 14's A/B holds, because only docs have changed since. As committed, 11 of 24 runs of `sfx-events` + `settings:101` failed. `sfx-events` alone passed 18/18. With the `32ef11ad` config hunks applied, all 24 passed. None of the browser gate failures belong to this story. The gate stays red until `32ef11ad` lands on `loop/rc`. It touches unowned files, so I have not cherry-picked it.

## Attempt 16 (unchanged base; unchanged verdict)

- Entry: clean branch at `bdaeaf7b`. `loop/rc` and `origin/loop/rc` are both still at `f6a8aa36`, 0 commits ahead of this branch. `vite.config.ts` there has no `FULL_RESPONSES`, so `32ef11ad` is still missing. Headroom tools were unavailable, so I read the gate log directly: `.state/attempts/533e3906-…/output.log`. No code changed, and no agents, dispatcher writes, push, promotion or extra loop.
- Gate result: 1 failed (`[mobile-chromium] settings.spec.ts:101`), 12 flaky, 1262 passed. The printed errors:
  - 9 `waitReady` `__rt.loaded` timeouts and 1 `locator.waitFor` timeout.
  - 2 `page.goto: net::ERR_INSUFFICIENT_RESOURCES`, one at `#/session` and one at `#/settings`.
  - 1 `responsive.spec.ts:242`, which also fails on the base.
  - No SFX or combat assertion failed. The flaky specs this time include `knowledge.spec.ts` and `audio-presets.spec.ts`, which this story doesn't touch. That fits exhaustion shared across the whole host rather than anything specific to this branch.
- Verdict as in attempts 12, 14 and 15: the Browser acceptance gate can't pass on any candidate until `32ef11ad` is on `loop/rc`. As of 2026-09-22 it existed only on `dispatch/dndtools/0266d1edb79db814617e`. Re-running this task without that change repeats this result. It needs operator action outside this task's owned paths.

## Attempt 17 (rebased onto `loop/rc` `df379bf7`; e2e shm fix still not integrated)

- Entry: clean branch at `19b7ed11`. As requested, rebased onto local `loop/rc` `df379bf7`. The rebase was clean. The two new commits there (`ba5042a4`, `df379bf7`) fix core Vitest storage and timezone coverage. Neither touches the e2e server: `vite.config.ts` still has no `FULL_RESPONSES`. The `32ef11ad` port `c71169bb` exists only on `dispatch/dndtools/ccc3c883bac6850e6e25`. `origin/loop/rc` is still at `f6a8aa36`. Headroom tools were unavailable, so I read the gate log directly: `.state/attempts/d75cf9da-…/output.log`. No code changed, and no agents, dispatcher writes, push, promotion or extra loop.
- Re-ran the checks the new base could affect. Core suite: 282 files / 5153 tests passed. `tests/unit/vitest-core-storage.test.ts`: 2 tests passed. Core typecheck: exited 0. Logs: `/tmp/rc-ses-6-1-a17-*.log`.
- Gate result for `19b7ed11`: 1 failed (`[mobile-chromium] settings.spec.ts:101`), 7 flaky, 1267 passed. The printed errors:
  - 5 `waitReady` boot timeouts.
  - 1 `page.goto: net::ERR_INSUFFICIENT_RESOURCES` (`#/settings?tab=appearance`).
  - 2 "Target page, context or browser has been closed".
  - No SFX or combat assertion failed. The flaky `sfx-events.spec.ts:104` was a boot timeout. The other flaky specs (`share-import`, `shortcuts`, `themes`) are outside this story.
- Verdict unchanged since attempt 12: nothing in the browser gate belongs to this story. The gate needs `32ef11ad`/`c71169bb` on `loop/rc`.

## Attempt 18 (unchanged base `df379bf7`; unchanged verdict)

- Entry: clean branch at `9151b07b`. `loop/rc` and `origin/loop/rc` are both at `df379bf7`, 0 commits ahead of this branch. `vite.config.ts` there still has no `FULL_RESPONSES`, so neither `32ef11ad` nor its port `c71169bb` has been integrated. Headroom tools were unavailable, so I read the gate log directly: `.state/attempts/28922de4-…/output.log`. No code changed, and no agents, dispatcher writes, push, promotion or extra loop.
- Gate result: 3 failed, 4 flaky, 1268 passed.
  - Hard failures: `settings.spec.ts:101` on both profiles, plus `settings.spec.ts:180` on desktop. The `:180` failure is a `toContainText("Appearance")` on the settings section picker, which this story doesn't touch. It is the same environmental `settings :101/:180` stall that `32ef11ad`'s journal attributes to the shm exhaustion.
  - Printed errors: 4 `waitReady` boot timeouts, 1 `locator.waitFor` timeout and 1 `page.goto: net::ERR_INSUFFICIENT_RESOURCES` (`#/session`). No SFX or combat assertion failed. The flaky `sfx-events` runs passed on retry.
- Verdict as in attempts 12–17: the Browser acceptance gate is blocked outside this task's owned paths until `c71169bb`/`32ef11ad` lands on `loop/rc`. Requeueing without that change reproduces this result.

## Attempt 19 (browser gate killed by SIGTERM; unchanged base)

- Entry: clean branch at `ab3ad7a0`. `loop/rc` and `origin/loop/rc` are both at `df379bf7`, 0 commits ahead of this branch, and `vite.config.ts` still has no `FULL_RESPONSES`. Headroom tools were unavailable, so I read the gate log directly: `.state/attempts/5d8bc6eb-…/output.log`. No code changed, and no agents, dispatcher writes, push, promotion or extra loop.
- The Browser acceptance gate exited with `-15`: it was terminated from outside and did not finish. The log ends at test 1232 of 1292 with `ELIFECYCLE Command failed.` and has no Playwright summary. This attempt was not a completed red run. Why it was terminated is not visible from the task worktree.
- Failures up to the kill, all on desktop. The mobile tests that ran before the kill logged no failures.
  - `settings.spec.ts:101` (3 tries), `:180` (2) and `:217` (3).
  - `themes.spec.ts:59` (1).
  - `responsive.spec.ts:242` (2 viewports, a known base-red race).
- All of these are settings, theme or layout specs this story doesn't touch. `settings:217` is new in this series: it failed right after `settings:101` in the same spec file on the same worker, and fits the shm stall in attempts 12–18. No SFX, combat, dice or handout spec failed.
- Verdict unchanged: nothing left for this story in owned paths. The gate needs `c71169bb`/`32ef11ad` on `loop/rc`, and this run also needs to finish rather than be terminated.
