# RC-ENG-7.1 run journal

## Scope and implementation

- Owned implementation: `.github/workflows/release.yml` and
  [the runnable RC checklist](../RC_CHECKLIST.md). This journal is the requested run evidence.
- Added explicit `rc` dispatch channel; plain semver tags remain compatible with Android.
  Tag pushes still select preview. RC creates only a draft prerelease, retaining unsigned
  desktop and existing Android signing behavior. Production requirements are unchanged.
- Checklist commands run from the pinned tag with full history, record exact SHA, workflow
  revision, run/attempt, commands, exit codes and UTC timestamps. A failed command blocks
  release creation, while all subsequent commands still collect evidence.
- Successful report/log archives join release assets before checksums and provenance;
  failed runs retain their evidence as workflow artifacts. Manual scope/review/historical
  evidence is explicitly PENDING. Unsigned RC cannot replace a production or preview draft.

## Verification

- Headroom tools were not available; native command outputs were read directly.
- `pnpm exec vitest run tests/unit/release-verify.test.ts tests/unit/ci-guardrails.test.ts`:
  2 files / 23 tests pass. Original log: `/tmp/rc-eng-7.1-tests.log`.
- Runner fixture (`/tmp/rc-runner-test.py`): checks shell syntax, 12 command results,
  exit-7 propagation to overall exit 1, continued execution after failure, explicit pending
  manual bars, and wrong-SHA rejection. Fixture commands do not constitute release evidence.
- Initial `pnpm gates` found the new checklist unreachable from the docs index. This linked
  journal lives in the indexed run-journal directory and provides a documentation route to it.
  Final gate result recorded below after rerun.

## Remaining acceptance and scope blockers

No RC tag was pushed, workflow dispatched, release created or published, or dispatcher state
changed. The end-to-end tagged run and release attachments therefore **have not occurred**;
RC-ENG-7.2's operator rehearsal must supply that evidence after integration and independent review.
The local implementation tests are not substitutes for this acceptance criterion.

The requested Discussions form and Help → Send feedback action cannot be implemented inside the
supplied two-path ownership fence. `RC_ROADMAP.md` §21.2 explicitly blocks candidate changes
outside the claim. The operator must grant `.github/DISCUSSION_TEMPLATE/` and the relevant
`apps/gm-react/src/app/help/` menu paths (plus any actual shell wiring) before that work can land.
No control-state or roadmap ownership changes were made. The checklist records this as a beta
launch prerequisite; it does not claim that a feedback route already exists.

## Final local results

- `pnpm gates`: exit 0; six quality gates, 310 reachable docs and 445 resolved links.
  Existing 500-line target warnings remain; there were no gate failures. Original output:
  `/tmp/rc-eng-7.1-gates.log`.
- Reran the 23 release/CI guardrail tests after the workflow edits: all pass.
- Runner fixture passes; extracted checklist and workflow Bash steps pass `bash -n`.
- Prettier check on all three changed files and `git diff --check` pass.
- Structured performance and whole-app reports, when generated, are included in the evidence
  archive in addition to command logs. RC alone extends the release timeout to 360 minutes.

## Review retry — 2026-10-14

- Starting candidate: `5d4b0715b3243fd0dc9a931358aed16553001b53`; working tree was clean.
- Reconfirmed the high-severity finding directly: `git ls-tree -r --name-only HEAD
.github/DISCUSSION_TEMPLATE` returns no files; `apps/gm-react/src/app/help/HelpMenu.tsx`
  renders getting started, guides, release notes and shortcuts, without a feedback action.
- The retry still grants only the workflow and checklist. The review explicitly says not to
  bypass that fence; `docs/planning/RC_ROADMAP.md` §21.2 requires the changed paths to be owned.
  Requested authorization for `.github/DISCUSSION_TEMPLATE/beta-feedback.yml` and
  `apps/gm-react/src/app/help/HelpMenu.tsx`, or a companion task. No ownership or dispatcher
  control state was changed. Message catalogs and tests are documented companion paths.
- Added explicit implementation/verification checkboxes for the beta route and an operator
  evidence table to the checklist. These are tracking improvements, not a fix for the missing
  functionality. The high-severity finding remains unresolved pending ownership correction.
- Hosted acceptance remains outstanding: no RC tag pushed, workflow dispatched, or release
  mutated. The evidence table requires the run URL/attempt, exact tag/SHA, downloadable report
  and archive, checksum verification, and completed manual checklist on the same release.
- Headroom tools are unavailable in this session; inspected native output directly.
- Retry validation: `pnpm gates` exited 0 (six quality gates, 310 reachable docs, 445
  resolved links; existing file-size warnings only). Read the complete original output at
  `/tmp/rc-eng-7.1-retry-gates.log`. Initial formatting check flagged the new journal text;
  applied Prettier before the final formatting and whitespace checks. No executable code changed.

## Second review retry — 2026-10-14

- Starting candidate: `26c6433540232fd8ba56a4831f35251b1995288b`; working tree was clean.
- Corrected the workflow's unsigned draft title-mismatch diagnostic to identify the requested
  channel and tag instead of claiming every mismatch is a signed production draft.
- Added the RC-UX-5.5 accepted IA decision precondition to the manual checklist, matching
  RC_ROADMAP.md's RC-ENG-7.3 requirements, including required follow-up verification on the RC SHA.
- Initial focused tests caught a step-name dependency in `ci-guardrails.test.ts:384`; retained
  the existing workflow step name and reran the tests. Final result: 2 files, 23 tests passed
  (`release-verify.test.ts` and `ci-guardrails.test.ts`). No release protection behavior changed.
- `pnpm gates` exited 0; read the original `/tmp/rc-eng-7.1-review2-gates.log`: six quality
  gates, 310 reachable documents, 445 resolved links; existing file-size warnings only.
- Prettier and whitespace checks passed for the implementation edits. Headroom unavailable;
  native command output was inspected directly.
- Both high-severity findings remain unresolved. This retry still authorizes only the two
  implementation paths and forbids publication. No tagged hosted run or release attachments
  were produced. The Discussions form and Help feedback action still require an ownership
  correction or companion task, including localization, tests and visual verification.
- Operator action required: authorize the feedback implementation paths, then integrate and
  run the hosted RC rehearsal with matching evidence assets. Alternatively, explicitly rescope
  hosted acceptance to RC-ENG-7.2. This candidate does not change acceptance or dispatcher state,
  and must not be represented as satisfying RC-ENG-7.1's end-to-end acceptance criterion.

## Self-heal round 1 — partial ownership correction, 2026-10-14

- Starting candidate: `fd67207776fadc0566b1caf3fe35bccc3104f18b`; clean worktree.
  The supplied claim now includes `apps/gm-react/src/app/help/HelpMenu.tsx`.
  RC_ROADMAP §21.2 grants catalogs and test files as companion paths.
- Implemented Help topics → Send feedback using the platform external-browser adapter and
  a fixed GitHub beta-feedback URL. English/Spanish catalog strings explain public feedback
  and exclusion of campaign content, credentials and vault exports. Blocked/throwing opens
  show the copyable destination; no campaign data is put into the URL.
- Still blocked: `.github/DISCUSSION_TEMPLATE/beta-feedback.yml` is outside the supplied claim.
  Requested explicit correction; no response received during implementation. The category/form
  has not been verified. This action alone does not resolve the review's high-severity finding.
- Discovered an additional desktop requirement: `electron/main.cjs` deliberately denies external
  windows and requires narrow user-confirmed IPC for external-link features. Requested ownership
  of Electron main/preload and renderer typings; did not weaken the restriction. Desktop currently
  uses the copyable URL fallback, not an automatically opened browser.
- Headroom tools unavailable; native original logs inspected directly:
  - `/tmp/rc-eng-7.1-feedback-tests.log`: 3 component tests pass (success, false, rejection).
  - `/tmp/rc-eng-7.1-feedback-keyboard.log`: 2 Playwright tests pass, desktop/mobile Chromium;
    Enter activates the button and a blocked open displays the fixed URL.
  - `/tmp/rc-eng-7.1-feedback-types.log`: app TypeScript check exits 0.
  - `/tmp/rc-eng-7.1-feedback-lint.log`: focused ESLint exits 0.
  - `/tmp/rc-eng-7.1-feedback-gates.log`: quality gates exit 0, existing size warnings only.
- Pinned visual comparison is **not green**: `palette-help.spec.ts` exits 1, all 15 theme/tier
  cases differ at the Help screenshot. Read original diagnostics and inspected desktop tavern
  actual/expected images. Log: `/tmp/rc-eng-7.1-feedback-help-visual.log`. Baselines under
  `tests/visual/__screenshots__` remain unchanged; they are not listed in this task's claim or
  the roadmap's named `__snapshots__` companion paths. Their ownership and review are needed.
  An initial full visual run was interrupted to narrow to Help: 34 passed, 2 interrupted,
  552 not run (`/tmp/rc-eng-7.1-feedback-visual.log`); this is not a full-suite pass.
- Hosted acceptance remains outstanding. No local tag points at the starting candidate; no tag
  pushed, workflow dispatched, release altered, promotion attempted or dispatcher state changed.
  RC-ENG-7.2 must provide the authorized exact-tag run and verified release attachments.

## Visual-gate repair — 2026-10-14

- Starting candidate: `61ed07b0e6c0f7d9f8d6fa40f5330b5a63900a99`; clean worktree.
- Read the original wrapper log at
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/13602e91-6577-4b18-bda8-33f3b3ac74d0/output.log`.
  It reports 572 passes and 16 failures: 15 Help snapshot mismatches and one Settings rail/tavern
  readiness timeout. The Settings error context shows `Loading your vault…`, not an empty-state
  rendering mismatch.
- Corrected the previous journal's ownership conclusion: read-only inspection of the actual
  dispatcher manifest confirms both `apps/gm-react/tests/visual/*.ts` and
  `apps/gm-react/tests/visual/__screenshots__/*` are companion paths. No dispatcher state changed.
- Updated the Help capture to scroll the feedback region into view before capturing the full
  dialog. The baseline now verifies the requested action, its privacy copy, surrounding topics
  and dialog chrome on five themes and three tiers. Reviewed all 15 final PNGs in tier contact
  sheets. Existing command-palette and shortcut captures are retained.
- Settings now waits up to the app boot budget of 20 seconds for its actual empty-state title;
  runtime readiness alone does not guarantee that the lazy Settings route has hydrated its vault.
  The assertion still fails if that state never arrives; screenshot thresholds are unchanged.
- The initial extra feedback-region captures exceeded the unchanged 37 MiB baseline budget.
  Retained one complete Help dialog capture per theme/tier instead, and applied lossless PNG
  optimization with decoded RGBA equality checked before each write. No image pixels were
  quantized, resized or masked to suppress a mismatch; no repository dependency was added.
- Headroom tools are unavailable; original native logs inspected. The first targeted comparison
  passed 30/30 Help and Settings tests. Final capture/comparison and budget results follow below.
- The Discussions template, Electron bridge and hosted exact-tag rehearsal/attachments remain
  outstanding as recorded above. This validation repair does not satisfy the release acceptance.

### Final repair verification

- `bash apps/gm-react/tests/visual/run-in-container.sh palette-help.spec.ts settings-polish.spec.ts
--update-snapshots=none`: exit 0, **30 passed (1.2m)**; original log read at
  `/tmp/rc-eng-7.1-visual-repair-final-compare.log`. This covers all 16 cases named in the failing
  wrapper run plus the other Settings themes/tiers; the full 588-test wrapper was not rerun locally.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs`: exit 0; 894 files,
  **37802.9 KiB / 37888.0 KiB**. Final Zopfli optimization saved 339436 bytes with exact decoded
  RGBA equality. Reproduction uses `zopfli.png.optimize(png_bytes, lossy_transparent=False,
lossy_8bit=False)`; optimization tools were installed only in a temporary environment.
- `pnpm gates`: exit 0; original `/tmp/rc-eng-7.1-visual-repair-final-gates.log` inspected,
  six quality gates and docs checks passed, existing file-size warnings only.
- `pnpm format:check:changed`: exit 0; original
  `/tmp/rc-eng-7.1-visual-repair-format.log` inspected. Focused ESLint and `git diff --check` pass.
- Committed scope: the two visual specs, 15 reviewed Help baselines, and this journal only.
  No release, tag, publication, promotion or dispatcher-control mutation occurred.

## Wrapper timing repair — 2026-10-14

- Starting candidate: `b843c48892cbfbe796e7f3eb38b7b488892a21c9`; clean worktree.
- Read original wrapper evidence at
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/ed6aa645-4d1a-4559-a9d2-73587169e412/output.log`
  and the three Playwright error contexts. Result: 585 passed, 3 failed. Help and Settings passed.
  No pixel-difference count was reported for these failures:
  - Rail dungeon shell: the reopened vault-error dialog was visible, but screenshot capture
    exhausted five seconds while waiting for stable layout.
  - Phone high-contrast play: the player frame was visible, but its screenshot likewise timed
    out waiting for layout stability after fonts loaded.
  - Phone tavern scene: the hash had changed to `/scene/:id` while Command Center remained in
    the DOM; the five-second redirect assertion expired before the lazy editor committed.
- Align only those three waits with the existing 20-second boot/frame-readiness budget. The
  scene assertion still requires the exact screen id and edit query. Screenshots still use
  the existing pixel thresholds and unchanged baselines; no retries or sleeps were added.
- These visual spec files are granted companion paths in the manifest, verified read-only.
  Headroom unavailable; original native outputs inspected. No dispatcher controls changed.
- Verification uses the pinned container with snapshot updates disabled, repeating the affected
  scene themes and shell/play cases three times on rail and phone. Results follow below.
- Remaining form/Electron ownership and authorized RC-tag/release-evidence requirements are
  unchanged. This test-readiness repair is not end-to-end release acceptance.

### Timing-repair results

- Pinned command: `bash apps/gm-react/tests/visual/run-in-container.sh shell-polish.spec.ts
play-polish.spec.ts golden-routes.spec.ts --project=visual-rail --project=visual-phone
-g 'app shell — dungeon|play stage high-contrast|/scene/:id' --repeat-each=3
--update-snapshots=none`.
- Exit 0, **30 passed (1.4m)**. Original log inspected:
  `/tmp/rc-eng-7.1-readiness-repeat.log`. All three previously failing cases passed three times;
  the selected additional themes/tiers passed too. No baseline files changed. This targeted run
  does not claim a new full 588-test wrapper result.
- `pnpm gates`: exit 0, six quality gates and documentation checks pass with existing file-size
  warnings only (`/tmp/rc-eng-7.1-readiness-gates.log`).
- Focused ESLint: exit 0 (`/tmp/rc-eng-7.1-readiness-lint.log`).
  `pnpm format:check:changed`: exit 0, all four changed text files pass
  (`/tmp/rc-eng-7.1-readiness-format.log`). `git diff --check` passes.
- No publication, promotion, tag, workflow dispatch or dispatcher-control changes occurred.

## Self-heal round 2 — base-first graph diagnosis, 2026-10-14

- Starting candidate: `d9ba81e7992fbdd4e4a48c170e30c3246f76221e`; clean worktree.
- Read original wrapper log
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/0666fd90-efaf-477e-b14e-82fa6bf9fc9c/output.log`:
  **587 passed, 1 failed**. Desktop tavern Graph exhausted the five-second page-screenshot
  timeout after fonts loaded. There was no pixel-difference diagnostic. All previously repaired
  Help, Settings, scene, shell and play cases passed in that full wrapper run.
- As requested, ran the failing check on the task base first, before editing anything. Temporarily
  checked out `81b6b34c85f88c9855c7e0ca5aab7f69b1bafdc2` detached in the clean worktree, retaining
  its installed dependencies and pinned container, then restored the task branch at the exact
  candidate SHA. No dependency installation, source edit or baseline update occurred between runs.
- Command on both commits: `bash apps/gm-react/tests/visual/run-in-container.sh graph-polish.spec.ts
--project=visual-desktop -g 'graph polish — tavern' --repeat-each=10 --update-snapshots=none`.
- Base: exit 0, **10 passed (24.9s)**. Read original `/tmp/rc-eng-7.1-graph-base.log`.
- The graph spec, graph screen and Playwright configuration have no diff between base and
  candidate. This alone is not proof of inherited failure: shared application changes can affect
  tests, and the wrapper's long-run timing conditions differ from a focused run.
- Headroom unavailable; used native original output. No dispatcher controls, publication,
  promotion, tag or hosted workflow changed. Existing feedback-route and release-evidence blockers
  remain; these diagnostics do not satisfy end-to-end RC acceptance.
- Candidate: exit 0, **10 passed (23.2s)**. Read original
  `/tmp/rc-eng-7.1-graph-candidate.log`. The failure is **unreproduced on both base and candidate**;
  inheritance is unproven, and no task-caused Graph regression was demonstrated. Do not describe
  this as an inherited failure, a fixed failure, or a green full-suite result. No graph source,
  tests, timeout or baseline changes are justified by this comparison, so none were made.
- `pnpm gates`: exit 0, six quality gates and docs checks pass with existing size warnings
  (`/tmp/rc-eng-7.1-graph-diagnosis-gates.log`). This commit records evidence only; the last full
  wrapper result remains 587 passes and one timeout, pending operator disposition.

## App-gate repair — pseudo-locale catalog, 2026-10-14

- Starting candidate: `810cccfcf781c4b2a4e1f7d7a6d3d01add2f2a61`; clean worktree.
- Read original wrapper app-test log at
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/fd5420ea-5eef-4b3c-bb84-d4d6408c497c/output.log`:
  2279 passed, 2 failed. Both failures identify the same task-caused omission: the generated
  pseudo-locale lacks `help.sendFeedback`, `help.feedbackPrivacy`, and `help.feedbackFallback`,
  introduced by the Help feedback action. This is not an inherited failure.
- Regenerated with `pnpm exec tsx scripts/i18n-catalog.ts pseudo`, then applied Prettier.
  The entire generated diff consists of those three entries. The existing exact-catalog and
  100-percent pseudo-locale coverage tests remain unchanged and guard future omissions.
- Confirmed read-only that `apps/gm-react/src/i18n/dev/qps-ploc.ts` is an authorized companion path.
  Headroom unavailable; inspected original native output.
- The preceding wrapper visual log
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/30c46bc1-0be1-4091-af5f-0b1ef100aa51/output.log`
  records **588 passed (15.3m)** on the starting candidate. That is the operator's full visual run,
  not a new visual run on this catalog repair. The development-only pseudo catalog does not change
  the English visual baselines.
- Full app-suite and quality/format verification results follow below. No release, tag, workflow,
  promotion, publication or dispatcher-control mutation occurred. The outstanding feedback-route
  scope corrections and authorized tagged-release acceptance remain unresolved.

### Pseudo-locale repair verification

- `pnpm test:app`: exit 0, **190 files / 2281 tests passed**, 66.40s. Read original
  `/tmp/rc-eng-7.1-pseudo-app.log`; this includes both previously failing i18n checks and the
  feedback component tests. Existing test stderr includes expected error-path/React warnings;
  the final suite reports no failures.
- `pnpm gates`: exit 0, six quality gates and docs checks pass with existing size warnings
  (`/tmp/rc-eng-7.1-pseudo-gates.log`).
- `pnpm format:check:changed`: exit 0, both changed files pass
  (`/tmp/rc-eng-7.1-pseudo-format.log`). `git diff --check` passes.
- Commit contains only the three generated pseudo-locale entries and this journal. The catalog
  repair fixes the observed app-gate regression; it does not claim the outstanding RC acceptance.

## Independent-review retry — ownership still incomplete, 2026-10-14

- Starting candidate: `152f0cde84979986b113f7b406474ba2452f9d2b`; clean worktree.
- Reconfirmed from original native output: `git ls-tree -r --name-only HEAD
.github/DISCUSSION_TEMPLATE` returns no files. `openExternalUrl` in
  `apps/gm-react/src/platform/capabilities.ts:539` handles Android and otherwise calls
  `globalThis.open`; `apps/gm-react/electron/main.cjs:670` permits only trusted display
  windows and denies other destinations. The existing preload has no feedback bridge.
- The supplied scope still grants only the workflow, checklist and HelpMenu. Requested explicit
  authorization for the missing template and Electron/renderer bridge paths. The review and
  RC_ROADMAP §21.2 prohibit bypassing this fence; no out-of-claim implementation was attempted.
- Updated the checklist with the concrete claim correction and desktop integration checks.
  This is an operator handoff, not a fix for either blocking implementation finding.
- No RC tag, hosted workflow, release attachment, push, promotion, new loop or dispatcher
  control-state change was attempted. End-to-end RC acceptance remains outstanding.
- Headroom tools are unavailable in this session; native output was inspected directly.
- `pnpm gates`: exit 0; six quality gates pass, 310 reachable documents and 445 resolved
  links; existing file-size warnings only. Read the complete original output at
  `/tmp/rc-eng-7.1-scope-retry-gates.log`. No executable code changed in this retry.

## Repeated independent-review handoff — 2026-10-14

- Starting HEAD: `fa1232e845a9bb6d20e7dfb256c750e0587ace90`; worktree clean.
  Headroom tools are unavailable; inspected native command output directly.
- Rechecked `git ls-tree -r --name-only HEAD .github/DISCUSSION_TEMPLATE`: empty.
  `git tag --points-at HEAD` is also empty. No hosted release evidence was produced.
- Inspected `apps/gm-react/src/platform/capabilities.ts:539-555` and
  `apps/gm-react/electron/main.cjs:670-706`: the renderer still falls through to
  `globalThis.open`, and the main handler still denies non-display URLs. This is an
  unresolved integration defect; no passing desktop-route test is claimed.
- Read RC_ROADMAP §21.2 and the manifest companion/journal grants without changing them.
  The supplied self-heal scope still adds only HelpMenu, leaving both reviewed defects
  outside the write fence. The manifest grants this journal and focused tests, but not
  the template, main/preload, or capabilities adapter.
- Made the checklist's ownership correction concrete: grant
  `.github/DISCUSSION_TEMPLATE/beta-feedback.yml`,
  `apps/gm-react/electron/main.cjs`, `apps/gm-react/electron/preload.cjs`, and
  `apps/gm-react/src/platform/capabilities.ts`. The typed bridge can live in that adapter.
  The operator must apply the scope correction before another implementation retry.
- Both high-priority findings remain unresolved. End-to-end tagged-release acceptance
  remains outstanding for the authorized RC-ENG-7.2 rehearsal. No push, promotion,
  tag/release creation, extra loop/agent, or dispatcher control-state edit occurred.
- This retry changes documentation only; executable code and prior test results are
  unchanged. Verification of this documentation change is recorded below.
- Verification: `pnpm gates` exit 0 (six quality gates; 310 reachable docs and 445
  resolved links; existing size warnings). Read the complete original log at
  `/tmp/rc-eng-7.1-review-scope-gates.log`. Targeted Prettier and `git diff --check`
  pass. No application, browser, desktop or hosted release test was rerun.
