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
