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

## Cache confidentiality follow-up — 2026-10-14

- Starting HEAD `dc4da0010`; clean task branch. Existing H-01 fail-closed fix retained.
- Found M-01 admission-only mitigation still allowed authenticated cache reads and retained old
  public copies when a response became private. `service-worker.js` now bypasses cache handling
  entirely for Authorization requests, deletes stale entries on non-cacheable network responses,
  and versions the policy namespace to remove previously admitted entries on activation.
- Added persistent regression coverage in `WorkerHost.test.ts` and
  `tests/unit/service-worker-security.test.ts`. Roadmap §21.2 explicitly grants companion
  `*.test.ts(x)` paths; these tests only cover the owned runtime fixes. This supersedes the prior
  journal/report assumption that factory-refusal coverage had to remain a scratch file.
- Current tests: service-worker confidentiality suite 8 passed; WorkerHost, serviceWorker and
  WidgetRenderSlot suites 37 passed across 3 files. Renderer error-boundary diagnostics are
  intentional. Targeted ESLint, Prettier and diff validation passed.
- Report/README reconcile M-01 status, distinguish historical runs from current evidence, and
  retain the update-signature evidence gap. No new open High identified; independent review
  remains the central operator's gate. `/security-review` and Headroom are unavailable here;
  required per-PR command runs remain outstanding, not replaced by this follow-up.
- No push, promotion, dispatcher mutation, additional loop, or extra agent. No new browser,
  deployed, dependency-advisory or installer-signature verification claimed.

## Per-PR evidence rejection follow-up — 2026-10-14

- Starting HEAD: `05c30a41d8b0b0274f268e287f01a8db83c21b40`; clean working tree.
- Supplied independent review confirms no unresolved High/Critical in candidate changes, but
  rejects the absent per-PR command evidence. No new runtime defect or runtime edit in this pass.
- Located dispatch Headroom tools through the tool inventory. Repository `.claude` inventory,
  installed skill/plugin filename search, and executable lookup expose no security-review command.
  Asked for its instructions or existing reports; no substitute authorization is assumed.
- Queried GitHub commit-to-PR associations for all nine existing surface anchors. Two publication
  PRs (#76, #93) were returned; neither body, review list, nor issue comments supplies a security
  report. Five anchors have no returned PR association. These limited queries do not prove the
  absence of other reviews and do not supply a complete review inventory.
- Retrieved exact original Headroom outputs `e6cb6348f74e49eb9b2aa11b3642708f` and
  `c5cf4a006be646f889292c5ea088aa58` before recording the results in the dated report.
- Updated README and dated report with concrete discovery anchors and the remaining owner handoff:
  supply command instructions and intended PR/revisions or reports, or explicitly authorize a
  substitute. Missing evidence remains open; no approval or completion claimed.
- Documentation-only verification: Prettier and diff checks run during commit preparation.
  Prior runtime and wrapper test results are not re-executed or claimed as current runs.
- No push, promotion, additional agent, loop, or dispatcher control-state edit.

## Independent-review follow-up — 911d3ea9c

- Starting HEAD `911d3ea9ce821a927ed13db8250078a6239f8f86`; working tree clean.
- Confirmed the supplied Medium from source: web-hosting forwards `/wikis/*`, and
  `readWiki` returns password-protected pages without private/no-store or Vary headers.
  The earlier hypothetical residual-Low classification was incorrect; report and README corrected.
- `apps/gm-react/src/sw/service-worker.js:32` now bypasses `/wikis` and `/api` roots and
  descendants regardless of credentials, and bypasses `x-wiki-password` anywhere. The same
  predicate filters precache admission and protects runtime admission. Fetch dispatch bypasses
  navigation and precache fallback too. The v3 policy namespace retires affected v2 caches on
  activation; existing waiting-worker acceptance behavior is unchanged.
- Companion test allowance: roadmap §21.2. `tests/unit/service-worker-security.test.ts` covers
  synthetic password read then offline anonymous access, seeded sensitive entries, navigation,
  password-bearing precache requests, install admission, and old namespace deletion. No browser
  or deployed exploitation is claimed. H-01's existing worker refusal is unchanged.
- Verification: `pnpm exec vitest run tests/unit/service-worker-security.test.ts` passed all
  14 tests. `pnpm exec eslint apps/gm-react/src/sw/service-worker.js
tests/unit/service-worker-security.test.ts` exited 0. Native original output inspected;
  no Headroom tools are exposed. Final Prettier and diff checks recorded during commit preparation.
- Missing per-PR review evidence remains a blocker. Current tools, repository `.claude` skills,
  local skill filename search, and executable lookup expose no `/security-review`. Requested
  instructions and intended PR base/head inventory or existing reports from the task owner;
  no reply or scope amendment received. Do not treat the previous discovery anchors or this
  regression suite as per-PR reviews. No High waived and no task completion asserted.
- No extra agent, push, promotion, additional loop, or dispatcher control-state edits.

## Owner amendment follow-up — 7380afb4d

- Starting HEAD `7380afb4d91dceb6764061bc30d5dfd3977e98aa`; working tree clean. Owner amendment
  (2026-10-15) replaces per-PR `/security-review` runs with a per-area review record.
- Reviewed all nine areas by hand at `7380afb4d` (injection, authz, secrets, data exposure,
  sandbox escape, update/supply chain). Report rewritten around one section per area with paths,
  last-touching commits, checklist results, findings, severities and dispositions.
- New findings: S-01 Medium (sandbox frame self-navigation exfiltration, source/spec-based),
  P-01 Medium (upgrade re-enables denied/disabled/never-enabled packages and keeps review-basis
  approvals), U-01 Low (AppImage updates: TLS + unsigned sha512), W-01 Low (hosted CSP still allows
  `worker-src blob:`), C-01 Info (formula function lookup reaches Object.prototype; arity refuses),
  D-01 Info (private store separated by name only). None High; S-01/P-01/W-01 need owner follow-up
  stories; fixes are outside this task's claim.
- P-01 confirmed with a scratch core test, C-01 with a scratch evaluation; both files deleted,
  nothing committed from them.
- Regression at `7380afb4d`: app 5 files/84 tests, sw-security 1/14, core 9/200, cloud 2/79; all
  exit 0 (17 files, 377 tests). Native output inspected; no Headroom tools used.
- README §5 updated. Prettier check and `git diff --check` pass on the changed docs.
- No push, promotion, extra agent, loop, or dispatcher control-state edit.

## Post-rebase visual gate red — 78d7b514d

- Gate run `850987b9`: 587/588 passed; the only failure was
  `[visual-phone] shell-polish.spec.ts:5 app shell — tavern` (8.2s vs ~3.4s typical), stuck at
  "waiting for element to be stable" on the More sheet
  (`getByRole('dialog', { name: 'All sections' })`). No pixel diff was reported.
- Not caused by this branch: the diff touches `WorkerHost.ts` (custom-widget workers), the service
  worker (registered under the dev server only with `?sw=dev`, see
  `platform/serviceWorker.ts:shouldRegisterServiceWorker`), docs and unit tests. The visual suite
  uses neither.
- Re-ran in the pinned container:
  `run-in-container.sh --update-snapshots=none --workers=2 tests/visual/shell-polish.spec.ts --repeat-each=3`
  → 45/45 passed (phone tavern 3.4–3.7s).
  This matches the known one-stall-per-full-run pattern on an untouched route. No snapshots
  re-baselined, no code changed.
- Full pinned-container visual gate re-run at `78d7b514d`
  (`run-in-container.sh --update-snapshots=none --workers=2`): 588 passed (15.4m), exit 0.
- No push, promotion, extra agent, loop, or dispatcher control-state edit.
- Format (changed) gate red at `47e215810`: the journal append wrapped inline code spans across
  lines; reflowed so Prettier accepts it unchanged.
