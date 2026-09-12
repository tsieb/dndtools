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
