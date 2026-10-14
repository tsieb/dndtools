# RC-ENG-5.1 — Security review v2

## 2026-10-14 — resumed implementation

- Base: `81b6b34c8`; task branch `dispatch/dndtools/0bb074e8a3eee4c5e4d8`.
- Previous attempt `d8c570af-b684-416d-89a0-34cbcd2caf56` left no file changes.
  Its log ends in an automatic cybersecurity-risk rejection, not a repository gate failure.
  The proposed browser reproduction did not run. Continuing with source review and existing
  tests; no exploit reproduction is claimed.
- Headroom is available. Exact original output is retrieved before citing diagnostic evidence.
- `/security-review` is not exposed as a callable command or skill in this session; searches of
  repository skills and the local skill locations found no matching instruction file. The required
  per-PR command runs remain outstanding. No substitute invocation or extra agent is claimed.
- Repository write fence: `docs/planning/RC_ROADMAP.md` §21.2. The task's resolved owned path is
  the dated report; runtime remediation requires operator claim repair or a prerequisite fix task.
  The security README is explicitly required by acceptance; this journal is explicitly required
  by the implementation brief. No dispatcher state changes are authorized or made.
- Assessment recorded in `docs/security/app-security-review-2026-10-14.md`.

## Findings and acceptance evidence

- **Blocked: no open high.** H-01 is an open High source finding: app-origin blob worker execution
  (`apps/gm-react/src/app/widgets/WorkerHost.ts:663`, `WidgetRenderSlot.tsx:551`) with the hosted
  CSP permitting blob workers (`infra/web-hosting/template.yaml:206`). Named private databases
  (`apps/gm-react/src/platform/storage/privateStore.ts:34`) do not isolate this execution context.
  Browser semantics were checked against MDN. No exploit reproduction ran or is claimed.
- M-01 records conditional exposure from broad same-origin GET caching. V-01 records the missing
  per-platform update-signature evidence. Neither is silently treated as closed.
- **README updated:** `docs/security/README.md` §5 links the report and explicitly qualifies the
  earlier widget/private-store guarantees while H-01 remains open.
- Runtime fixes are not made outside the resolved claim. The report names the needed runtime
  paths, remediation direction, and browser regression requirements for the operator handoff.
- The required per-PR `/security-review` command runs remain unavailable and outstanding; prior
  reports and this source assessment are not claimed as substitutes.

## Verification

- 14 selected test files, **338 tests passed**. The dated report lists the exact commands and
  Headroom artifacts. Original stdout retrieved for every listed run:
  `d8dc0e283a8140db9f04e599360292f4`, `dff0bbe7241b4087bfb56363ec23edd1`,
  `f359710025fd4d3b957600fec67b7de3`, `9931305d8cee442d98cff74fe9fbacd9`,
  `a5a1a21371e54cfaa72161c332a6fb20`.
- The initial cloud command selected billing but used an unmatched sync path; the corrected
  `packages/cloud-fns/src/sync/handler.test.ts` run passed 36 tests. No sync coverage is attributed
  to the first run.
- The source is unchanged from the reviewed base; this candidate changes only documentation.
  No visual gate, full repository gates, deployed checks, dependency audit, or packaged signing
  smoke is claimed. Central gates and independent review remain outstanding.
- Prettier applied to the new documents; README formatting check and `git diff --check` passed.
  Final all-three-document format and diff checks are recorded by the commit preparation tools.

## Delivery boundary

Commit the report, README, and this journal on the current branch as a blocked assessment.
No push, promotion, extra agent, loop, or dispatcher control-state edit. This is useful preserved
evidence, **not task completion**. The operator must resolve H-01 under an appropriate runtime
claim and provide the required review capability before acceptance can be asserted.

## Claim-gate feedback — required paths retained

The candidate gate rejected `docs/security/README.md` and
`docs/security/app-security-review-2026-10-14.md` against the literal owned path
`docs/security/app-security-review-<date>.md`.

Both files are retained under the feedback's explicit required-file exception:

- `docs/security/README.md` is named verbatim in the acceptance criterion requiring its update.
- `docs/security/app-security-review-2026-10-14.md` is the requested dated whole-app security
  report, with `<date>` instantiated as the assessment date. Removing it would discard the
  task's primary deliverable and the evidence for the open High.

The follow-up commit message records these reasons for the operator. The claim has not been
widened and the rejection is not fixed: operator approval of concrete claimed paths is still
required. H-01 and the missing review/signature evidence remain open independently of the claim
failure. No runtime or dispatcher changes were made in this feedback pass; earlier test results
remain evidence for the unchanged reviewed source, not new test executions.
