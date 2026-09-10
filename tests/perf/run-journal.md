# RC-ENG-1.3 implement retry journal

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
