# RC-ENG-1.3 implement retry journal

## 2026-09-10 — tooling gate dependency recovery

Starting candidate: `824eb1e519579e7368a62644ca15ac93af8e1adb`.
Read the original tooling gate output for attempt
`0d5d0789-d273-4aa5-b867-0f2453c03341`. Its ten failures were in
`tests/unit/check-android.test.ts`; the diagnostic was `ERR_MODULE_NOT_FOUND`
for `saxes`, imported by `scripts/check-android.mjs`. The perf tests passed
in that same gate run. Both `package.json` and `pnpm-lock.yaml` already declared
the dependency, while this worktree had no `node_modules/saxes` entry.

Ran `ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile`:
exit 0, lockfile resolution skipped, `saxes 6.0.0` restored. No tracked files
changed. Then reran the exact failed command,
`pnpm test:tooling --maxWorkers=3`: exit 0, **24 files / 158 tests passed**
(09:03:14 local start, 9.22 seconds). Shell syntax validation for
`scripts/perf/ci.sh` and `git diff --check` also passed.

This was stale installed dependency state after the branch changed, requiring
no perf or Android source edit. Refresh dependencies from the frozen lockfile
before running gates after future branch updates. The supplied wrapper feedback
reported Typecheck and Lint passing on the starting candidate; those checks were
not rerun here. This local tooling rerun does not establish hosted performance
acceptance or a new central wrapper result. No push, promotion, workflow dispatch,
new loop, or dispatcher control-state edit was performed.

## 2026-09-10 — hosted acceptance evidence remains pending

Starting candidate: `e1fccabf1dc06f0128e6fae4867fbc83546c7c68`.
The working tree was clean. Independent review requested hosted-CI evidence,
and reported no high/critical code defect. This retry preserves the reviewed
implementation and the explicitly local evidence document.

Validation on the starting candidate:

- `pnpm exec vitest run tests/unit/perf-pipeline.test.ts tests/unit/perf-baseline.test.ts`:
  2 test files and 13 tests passed.
- `bash -n scripts/perf/ci.sh`: passed.
- `git diff --check`: passed.
- Read-only GitHub API query
  `repos/tsieb/dndtools/actions/runs?head_sha=e1fccabf1dc06f0128e6fae4867fbc83546c7c68&per_page=100`
  returned `{"runs":[],"total_count":0}` after selecting run IDs, SHAs and statuses.
  No hosted evidence exists in that response for this candidate. Recent workflow
  runs for other SHAs do not establish this candidate's acceptance.

The task prohibits pushing or promoting, and assigns subsequent gates to the
central operator. No push, promotion, workflow dispatch, new loop, or dispatcher
control-state edit was performed. Repeating the workstation capture would not
resolve the hosted-evidence requirement. Acceptance remains unverified.

## Operator handoff

After publication is authorized, run the candidate's `Performance` workflow on
the published task revision (a PR targeting the normal base or a manual workflow
dispatch on that branch). Preserve the workflow run URL, exact checked-out SHA,
job conclusion, and downloaded `perf-run` artifact. Its five `current-N.json`
captures must identify that revision; the five `reference-N.json` captures must
identify the pinned reference. Review all five `report-N.md` and `verdict-N.json`
files alongside their raw captures and `baseline-N.json` files. Confirm every
comparison passes, all 11 budgets have numeric drift, and `stability.txt` reports
agreement for the same candidate SHA. One workflow invocation performs all five
paired captures on one hosted runner allocation.

Run the central wrapper gates and independent review against the resulting
candidate as well. This journal and the local evidence are not wrapper or hosted
gate success evidence. Do not mark the acceptance criterion complete until the
hosted artifact has been reviewed.

## 2026-09-12 — ownership repair and amended pre-merge acceptance

Starting branch HEAD: `d20a20ed`. `git range-diff` confirms that the nine
candidate commits ending at `c5102e4d` are patch-equivalent to the rebased
series `8fa715b6` through `e2cf5d33`, on base `5e6064d9`. Preserve that rebase
and the subsequent manual-ref workflow input.

Previous gate feedback identified `tests/unit/perf-pipeline.test.ts` outside
this task's claim. Move that new test to `tests/perf/perf-pipeline.test.ts`.
A scoped Vitest config inherits root aliases and worker limits and includes
the pipeline suite plus the existing baseline tests. The Performance workflow
runs this configuration before measurement, and the README gives the same
local command. No changes to the existing root test configuration are needed.

The amended acceptance requires fresh workstation evidence on the candidate;
the September 10 report is historical evidence only. A new capture and its
results will be recorded below. Hosted five-run acceptance belongs to
RC-ENG-1.4 after integration. No hosted run is claimed here.

Measured implementation commit: `8193b9cba1360013b6b366bb71d525885bc0fb87`.
The scoped unit command passed **2 files / 14 tests** (exit 0). Targeted ESLint,
Prettier, `bash -n scripts/perf/ci.sh`, `git diff --check`, and an explicit
base-to-candidate owned-path check passed. The initial expanded Vitest config
also ran all tooling tests successfully (25 files / 169 tests), before its
include list was narrowed to the two intended performance suites.

Started a fresh workstation capture with `CI=true`, ports 15273/15373 and a
new temporary `RUNNER_TEMP`, using `bash scripts/perf/ci.sh`. Output is retained
in `tmp/perf/workstation.log`. This uses CI grading on a Ryzen workstation,
not hosted CI; the harness's configured runner label does not change that fact.
Runs 1 and 2 each completed with all 11 gate verdicts PASS, seven batches per
budget, zero missing baselines, and numeric drift throughout. Run 3 is in
progress. No capture source, app source, or comparison policy changed during
measurement; this journal update is documentation only.

Runs 3 and 4 also completed with all 11 gate verdicts PASS and every drift
column populated. Run 4 had zero absolute target breaches, whereas runs 1–3
had one; their baseline-based gate verdicts nevertheless agreed throughout.
Run 5 is now in progress. No measured source or policy has changed.

### Final workstation result

The uninterrupted five-run invocation finished with **exit 0**. Its stability
check reports agreement on all 11 CI budget verdicts for implementation commit
`8193b9cba1360013b6b366bb71d525885bc0fb87`; all 55 verdicts are PASS and all
55 drift values are numeric. Every reference and candidate capture has seven
batches per budget. The reference stayed pinned to
`48a827861616fc3c3f6ccf69f0872edc1c8c771a`.

Committed evidence is in
[the workstation report](reports/2026-09-12-workstation/README.md), with all
26 original output files in an exact-byte archive and SHA-256 checksums.
Verified every capture SHA, matching hardware metadata, batch count, flattened
raw samples, and all verdicts. Extracted the archive using the documented
review commands: all 27 checksums (archive plus members) passed and the
stability checker again exited 0. `scene-first-render` ranged from 1406.1 to
1981.1 ms: its absolute target diagnostic flipped, but the baseline-based gate
remained PASS in all five runs.

The final commit adds only this journal and the reports; it preserves the
measured implementation. The amended pre-merge unit, workstation-report and
manual-ref-input requirements are now evidenced locally. Hosted acceptance
remains RC-ENG-1.4's post-integration work, with central gates and independent
review still pending. No push, promotion, workflow dispatch, new loop, or
control-state edit occurred.

## 2026-09-12 — inherited Electron tooling failure after another rebase

Starting candidate: `31dc027c1147152952bf3288b8dcb94ce7ba61c7`; clean tree.
The original output of tooling attempt `ed7380d4-1ae5-4683-bb48-02fe6f26000d`
was read directly, without compression. It reports one failure at
`tests/unit/electron-hardening.test.ts:147`: the test expects two matches of
`devTools: !app.isPackaged` in `apps/gm-react/electron/main.cjs`, but finds three.

The current task series is a patch-equivalent rebase of the previous twelve
commits onto `ac99ca7b97570d6e9a77a1890db9c9f5eb1fbf59`, confirmed by
`git range-diff 5e6064d9..be36a815 ac99ca7b..31dc027c` (all twelve entries `=`).
That base commit adds the chosen-display kiosk window with a third guarded
`devTools` setting. The three current settings are at main.cjs lines 489, 551,
and 612. The assertion still counts exactly two.

Neither implicated file is changed by this task: `git diff ac99ca7b HEAD --
tests/unit/electron-hardening.test.ts apps/gm-react/electron/main.cjs` is empty.
Git blob identities match between the base and candidate:

- Test: `e731899bc3fd7f28ca4fd1c0f021bbca8041dd39` on both revisions.
- Electron main: `df13d7cf02fe4ee5dab1e026e2886a15b5e76b44` on both revisions.

Validation on this candidate:

- Exact failed command, `pnpm test:tooling --maxWorkers=3`: exit 1,
  **23 files / 161 tests passed; 1 file / 1 test failed** with the same
  expected-two/received-three assertion. This is a reproduced base defect,
  not a fixed gate or missing dependency.
- `pnpm exec vitest run --config tests/perf/vitest.config.ts`: exit 0,
  **2 files / 14 tests passed**.
- Base-to-candidate changed paths remain inside the task claim.

Both the Electron implementation and its unit test are outside the explicit
owned paths. No security setting was removed, assertion bypassed, test excluded,
or out-of-scope file changed to make the gate pass. The Electron/base owner must
reconcile the hardening assertion with the third window (while retaining checks
that every privileged window disables packaged devtools), then rerun tooling.
This task cannot repair that inherited assertion within its current claim.

The rebase also changes app/core source relative to measured SHA `8193b9cb`.
The archived five-run result therefore remains historical evidence for that SHA,
not acceptance evidence for `31dc027c`. The report now says so explicitly. After
the base defect is repaired and rebased, capture fresh workstation evidence on
the resulting candidate, then run central gates and independent review. No new
performance capture or hosted verification is claimed during this blocked retry.
The reviewed perf implementation and exact-byte measurement archive are preserved.

This retry commits only the journal and provenance clarification. Validation is
still blocked; no push, promotion, workflow dispatch, additional loop, dispatcher
control-state edit, or sub-agent was used.

### Repeated dispatch on unchanged blocker

Read original tooling output for `70d183fb-e01d-42fd-a8ac-537ae36fcec3`
on `47c9be520e9729fd46310a970e8091127b521d9a`. It confirms the identical
line-147 expected-two/received-three assertion: 161 tests pass, one fails.
The tree was clean and both implicated files still have an empty diff against
`ac99ca7b`. There is no new source change or diagnostic justifying another
identical test run or a fresh performance capture yet.

Concrete minimal base repair: change the expected guarded-window count from
2 to 3 in `tests/unit/electron-hardening.test.ts:147`, retaining the guard
pattern and all other security assertions. That file is outside this task's
owned paths. The operator must assign that repair to its owner or explicitly
expand this task's ownership before it can be applied here. Then rerun the
full tooling gate and capture fresh workstation evidence for the resulting
candidate. No gate bypass or out-of-scope change was made on this dispatch.

### Rebase onto integration head `6a745225` (2026-09-18)

Tooling log `87605be1-bc4e-4d9e-8afa-060bc43a40e1` showed the same line-147
Electron assertion. The integration branch now counts guards per
`webPreferences` block (`tests/unit/electron-hardening.test.ts:152`), so no
out-of-scope repair is needed. A first rebase onto `origin/loop/rc` (`1baa5e21`)
pulled in main-merge docs commits that are absent from the integration head, and
the operator's rebase onto `6a745225` then conflicted in
`docs/security/vault-privacy-modes-threat-model.md`. The 14 perf commits were
replayed with `git rebase --onto 6a745225 1baa5e21`. The candidate diff against
`6a745225` now touches only `.github/workflows/perf.yml`, `scripts/perf` and
`tests/perf`.

On the rebased tree: `pnpm test:tooling` passed 26 files / 193 tests,
the perf vitest config passed 2 files / 14 tests, `typecheck`, `lint` and
`gates` exited 0, and `format:check:changed -- --base 6a745225` was clean.

A fresh workstation capture on the pre-rebase candidate was started, then
killed with exit 143 during run 1 `smoke-ci` when the session ended. It produced
no evidence. The 2026-09-12 archive remains evidence for `8193b9cb` only. A new
interleaved median-of-7 capture on the rebased candidate follows below if it
completes. No push, promotion, workflow dispatch, extra loop, dispatcher
control-state edit or sub-agent was used.

### Fresh workstation evidence on `7ccdfc0a` (2026-09-18)

The first capture invocation on `7ccdfc0a` failed closed in run 1. One
`sync-reconciliation` batch hit the 30 s `__rt.loaded` timeout after a reload
while another worktree's Playwright suite was running, and baseline/compare
refused the incomplete capture. The scenario completed in that invocation's
run 2. Because run 1 had no verdict, the set could not pass, so it was stopped
and restarted from scratch. The second invocation completed all five runs,
`ci.sh` exited 0, and `stability.ts` confirmed that all 55 CI verdicts pass and
agree with drift populated. Every capture records candidate `7ccdfc0a` and
reference `48a82786`. The archive, checksums and analysis are in
`reports/2026-09-18-workstation/`, which supersedes the 2026-09-12 report for
acceptance. `search` reads +67–117% in four runs, which is 6 ms rising to
10–13 ms, inside the 25 ms floor. That is a small real offset between the two
commits, not a verdict flip. Hosted five-run agreement remains RC-ENG-1.4's.

## RC-ENG-1.4 — CI performance policy (2026-09-18)

Branch `dispatch/dndtools/30779a09fcac910ba751`, based on `2a9a7b71` (the
`origin/loop/rc` tip at the time).

`perf.yml` now runs in two modes, chosen by `PERF_MODE`. `scheduled` is the
new nightly cron on `main` and the default for `workflow_dispatch`: five paired
runs, drift binding. `pull-request` covers pull requests, pushes to `main` and
`loop/rc`, and dispatches with `mode=pull-request`: two paired runs, and only a
target breached in both of them is binding. `ci.sh`'s exit status no longer
decides the job. The new `compare.ts --policy` step reads the `verdict-N.json`
files, writes `policy.json`/`policy.md` to the job summary, and fails only when
`baseline.ci.json` has a `recorded` block for this reference and runner class.
The committed file has `"recorded": null`, so every mode is advisory until a
scheduled run's proposed `baseline.ci.json` artifact lands through a delivery
PR. `compare.ts --agreement <dir>` checks five scheduled runs' `policy.json`
files for agreement.

Outside the owned paths, kept minimal: `scripts/perf/ci.sh` takes `PERF_RUNS`
(default 5) and runs `stability.ts` only for five; `tests/perf/perf-pipeline.test.ts`
now expects the new concurrency key (per PR number and event, so sibling PRs no
longer cancel each other) and covers both modes; `tests/perf/README.md` got a
pointer to the policy.

Evidence on this branch: the perf vitest config passed 2 files / 20 tests. A
mutation (a confirmed breach needing one repeat instead of both) was caught by
the PR-mode test. A fixture CLI run of `--policy pull-request` produced the
advisory summary and exited 0. Hosted evidence cannot exist before
integration. The five-scheduled-run agreement has to be collected after merge
with the `--agreement` recipe in PERFORMANCE.md §2.1, and the first baseline has
to be recorded by a dispatch plus a delivery PR. No push, dispatch, promotion or
sub-agent was used.

## RC-ENG-1.4 — expanded claim and integration rebase (2026-09-19)

Rebased the previous implementation onto local `loop/rc` at
`c8a2c291463c39e0f1deeff83cc64027ce3bcf59` without conflicts. The operator
expanded ownership to include `ci.sh`, this journal and the performance README.
The prior policy test changes in `tests/perf/perf-pipeline.test.ts` remain outside
that claim and were restored to the integration version. The concurrency key
still separates events, PRs, refs and modes, with the ref component first to
preserve the existing pipeline contract. The aggregate diff now contains exactly
the seven authorized paths.

Fixed a missing-capture loophole: when a baseline is recorded for the pinned
reference, no runner capture now fails closed instead of disabling enforcement.
Documentation also distinguishes setup/test/upload failures from the performance
policy verdict.

Validation after rebase:

- `pnpm test:tooling`: exit 0, 26 files / 193 tests.
- `pnpm exec vitest run --config tests/perf/vitest.config.ts`: exit 0,
  2 files / 14 tests on the final in-scope tree. Before restoring the unowned
  test changes, the expanded suite also passed 20 tests.
- `pnpm typecheck`, `pnpm lint`, `pnpm gates`: exit 0. Lint and gates retain
  existing warnings; there were no blocking errors.
- Direct assertions exercised missing captures in both states: advisory without
  a recording, failed with a recording. Both passed.
- `bash -n scripts/perf/ci.sh`, targeted ESLint, changed-file formatting and
  `git diff --check`: passed.

Original command logs for tooling, typecheck, lint and gates are retained locally
under `/tmp/rc-eng-1.4-*.log`. These checks do not establish hosted performance
agreement. `recorded` remains null: no hosted baseline or timing was fabricated.
Five scheduled workflow runs on one commit and the baseline delivery PR remain
pending operator execution after authorized publication, using PERFORMANCE.md
section 2.1. No push, promotion, workflow dispatch, extra loop, dispatcher-state
edit or sub-agent was used. Central wrapper gates and independent review remain
separate from these local results.

## RC-ENG-1.4 — review follow-up and current integration rebase (2026-09-19)

Rebased candidate `c65ef50d` onto `loop/rc` at
`51cec17732d5423acaa381ff8c6a521f8a566e0c`, also verified as the fetched
`origin/loop/rc` tip. The rebase completed without conflicts; implementation
HEAD before this journal update is `6e184f4a`. The aggregate change still touches
only the seven owned paths. No policy code change was indicated by the supplied
independent review, whose outstanding finding concerns hosted acceptance evidence.

Read-only GitHub queries on this date returned `[]` for both of these commands:

```bash
gh run list --workflow perf.yml --event schedule --limit 100 --json databaseId,headSha,status,conclusion
gh run list --workflow perf.yml --event workflow_dispatch --limit 100 --json databaseId,headSha,status,conclusion
```

There is therefore no scheduled or manually dispatched run set available from
these queries to download and validate. Recent pull-request runs are not a
substitute. Five genuine scheduled-mode artifacts on the same candidate/reference
SHA and their original successful `compare.ts --agreement` output remain missing.
The baseline recording and delivery evidence also remain missing; `recorded` is
still null. This task is **not acceptance-complete**. The operator must publish
the candidate through the authorized delivery path before hosted captures can
measure it, collect the five runs and agreement output, and deliver the reviewed
baseline separately. The no-push/no-promotion restriction prevents completing
that publication in this implement task. No hosted timing or agreement was
inferred from local tests.

Post-rebase local checks passed: quality gates, typecheck, lint (existing warnings), tooling
(26 files / 193 tests), performance tests (2 files / 14 tests), changed-file
formatting against `loop/rc`, shell syntax and `git diff --check`. Original gate,
lint, tooling and typecheck logs are retained in `/tmp/rc-eng-1.4-recheck/`.
No push, promotion, workflow dispatch, additional loop, dispatcher control-state
edit or sub-agent was used.

## RC-ENG-1.4 — renewed implement validation (2026-09-19)

Rebased the reviewed candidate `68fe9c90` onto current local `loop/rc` at
`27e419688943c189a61e9f5a47c5066c8b059929` without conflicts. The rebased
implementation HEAD before this journal entry is
`7e2fdf3f822282a5f6af9cbc62774908acdc55c3`. The aggregate diff remains within
the seven owned paths; the reviewed performance policy is unchanged.

Fresh read-only `gh run list` queries using the schedule and workflow_dispatch
commands above both exited 0 and returned `[]`. There are still no hosted runs
from those queries to download for agreement verification. `recorded` remains
null. The review's missing hosted evidence finding is unresolved: this candidate
is **not acceptance-complete**. Authorized publication, five genuine scheduled-mode
artifacts on one candidate/reference SHA, successful agreement output, and the
reviewed baseline delivery remain necessary. Repeating local gates cannot replace
those captures, and this implement task prohibits pushing or promoting.

Post-rebase local validation passed:

- `pnpm gates`: exit 0, six quality gates and documentation checks; existing warnings.
- `pnpm typecheck`: exit 0 across core, cloud functions and the React app.
- `pnpm lint`: exit 0; existing warnings, no blocking errors.
- `pnpm test:tooling`: exit 0, 26 files / 193 tests.
- Performance Vitest configuration: 2 files / 14 tests passed.
- Changed-file formatting against `loop/rc`, shell syntax and diff whitespace passed.

Original quality-gate, typecheck, lint and tooling logs are retained locally in
`/tmp/rc-eng-1.4-current/`. Central wrapper gates and independent review must still
assess the resulting commit. No push, promotion, workflow dispatch, additional
loop, dispatcher control-state edit or sub-agent was used.
