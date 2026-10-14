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

## Self-heal round 1 — document claim corrected

The new implementation brief explicitly includes `docs/security/README.md` and
`docs/security/app-security-review-2026-10-14.md` in the owned paths and requires keeping both.
This supersedes the document-claim blocker in the preceding entry. Both files are preserved;
the report's acceptance handoff now distinguishes this correction from the remaining blockers.

The authorized paths still contain no runtime source. H-01 therefore remains open: remediation
needs `apps/gm-react/src/app/widgets/WorkerHost.ts` (and affected tests), with
`apps/gm-react/src/app/widgets/WidgetRenderSlot.tsx` additionally required if the repair is made
at renderer selection. The existing report supplies the fail-closed remediation direction and
browser validation criteria. The required `/security-review` runs and update-signature evidence
also remain outstanding. No finding was waived or relabeled to satisfy acceptance.

This pass changes only the report handoff and journal. Earlier test results are not new runs;
formatting and diff checks are run for these documentation edits. No central gate success is
claimed, and no dispatcher control state, runtime file, push, promotion, or extra agent is used.

## Independent-review rejection follow-up

- Starting HEAD: `e7c7bdccffc9f77b1e611fe9a8e7298539e2922f`; working tree clean.
- Read the supplied independent rejection and rechecked renderer worker selection, the blob
  factory, hosted CSP, and service-worker cache admission directly. H-01 and M-01 remain present.
- Read roadmap §21.2: resolved ownership is a write fence and scope must not be widened.
  The explicit current claim still contains only security documents. No runtime repair is
  authorized by the document claim correction. Record the concrete factory and cache paths in
  the report for central rescheduling; do not change dispatcher state.
- No Headroom tool is exposed in this session. Native command output was inspected directly.
  Repository/local skill searches did not find `/security-review`; no substitute run is claimed.
- Updated report and README with the independent rejection and remaining prerequisites.
  The earlier unit-test results and supplied exact-head gate results are historical evidence,
  not executions in this follow-up. Acceptance remains blocked; no High was waived.
- Validation for these documentation edits: Prettier check of all three changed documents and
  `git diff --check` (results recorded during commit preparation). No runtime tests warranted
  for this documentation-only follow-up; browser and signature evidence remain outstanding.

## Latest independent-review rejection — f6d704839

- Starting HEAD: `f6d70483906e18410ab46f56389e6e7c204c5e79`; working tree clean.
- Rechecked the production blob-worker factory, custom-worker renderer selection, hosted CSP,
  and service-worker cache admission directly. H-01 and conditional M-01 remain unchanged.
- The current explicit claim still excludes runtime source, and roadmap §21.2 forbids widening
  scope. The document self-heal cannot close H-01. No runtime edit or dispatcher mutation made.
- Updated the report and README to identify the latest rejected revision, removed attribution
  of earlier gate results to this rejection, and made the factory repair/validation handoff
  concrete. No High waived; acceptance remains unmet.
- Headroom and `/security-review` are not exposed in this session; the repository skill list
  contains no security-review skill. No per-PR run, browser test, dependency audit, signature
  verification, or repeat of the historical unit tests is claimed.
- Journal retained and updated under the implementation brief's explicit instruction to keep it
  current and roadmap §21.3's run-journal convention.
- Validation: Prettier check passed for all three documents; `git diff --check` passed.

## Self-heal round 2 — H-01 fixed, M-01 mitigated

- Starting HEAD: `e7a6b35d45f76f26ea62b4162ee6d5f75a85c9ce`; working tree clean. Claim widened to
  `WorkerHost.ts` and `service-worker.js`.
- H-01: replaced `createBlobWorker` with `refuseUnisolatedWorker`, which throws before any blob URL
  or `Worker` exists. The session's existing catch publishes `WORKER_COPY.unsupported` and
  `isolateFrame`, and the tile shows the preserved placeholder. Package data is untouched.
  `WidgetRenderSlot.tsx` was not changed.
- M-01: `isCacheable` refuses `Authorization` requests and `no-store`/`private` responses. Hosted
  headers (`immutable`, `no-cache`) are unaffected.
- Verification: a temporary vitest file (stubbed `Worker`/`createObjectURL`, classic and module)
  ran with `WorkerHost.test.ts`, `serviceWorker.test.ts` and `WidgetRenderSlot` tests: 4 files, 37
  tests passed. The scratch file was deleted because the test file is unowned.
  `pnpm typecheck` exited 0; eslint and prettier passed on the changed files. The
  `pwa-offline.spec.ts` run on desktop and mobile Chromium passed 18/18.
- Report and README updated: no open High. V-01 and the per-PR `/security-review` runs are still
  open, and a committed factory-refusal test is a follow-up.
