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
