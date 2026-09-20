# RC-ENG-5.3 — API edge hardening

## Status

The 2026-09-20 resubmission below supersedes the previous architecture and acceptance gaps.

2026-09-16 (later): rebased onto `d28fdf69`. One conflict, in
`packages/cloud-fns/src/app-api/handler.ts` — see "Rebase onto d28fdf69" at the end. The rebase
also changed one factual claim in this journal and in `docs/security/README.md`, because the
integration branch put part of the app API behind CloudFront; both were corrected rather than
left standing.

2026-09-16: second attempt, after the first was rejected for delivering no WAF at all. A web ACL
with a per-IP rate-based rule now exists and is wired to the web hosting distribution. The other
half of the acceptance clause — "a per-IP rate rule fronts the app API" — is **not satisfiable by
any template change**, for a reason confirmed against AWS's own documentation rather than asserted;
see "The constraint" below. No deploy, push, promotion, loop launch, or dispatcher control-state
change.

## What the first attempt got right, and what it missed

The per-Cognito-sub write quota and its contract test (20 listing writes accepted, 429 on the 21st)
are unchanged from the rejected commit `80a79da1` and still pass. The rejection was specifically
about WAF, and the first attempt's response to the WAF constraints was to document them and stop.
That was the wrong call: the constraints rule out _the story's stated placement_ of the ACL, not
the ACL itself. Two of the three "blocking findings" in the previous journal were really ownership
objections, and the standing guidance here is to cross an ownership boundary minimally and amend
the contract rather than leave an acceptance criterion unmet.

## The constraint (verified, not assumed)

Both facts were checked against current AWS documentation, because the whole design turns on them:

1. **AWS WAF cannot protect an API Gateway HTTP API.** The protectable resource types are
   CloudFront, API Gateway **REST** API, ALB, AppSync, Cognito user pool, App Runner, Bedrock
   AgentCore Gateway, Verified Access and Amplify
   (<https://docs.aws.amazon.com/waf/latest/developerguide/waf-chapter.html>). `app-api` is
   `AWS::Serverless::HttpApi` (`infra/app-api/template.yaml:177`); `sync-api` is the same
   (`infra/sync-api/template.yaml:248`) and `signaling` is an ApiGatewayV2 WebSocket API. None of
   the three can take a web ACL.
2. **A CLOUDFRONT-scope web ACL must be created in `us-east-1`**
   (<https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-wafv2-webacl.html>,
   `Scope`). `foundation`, where the story placed the ACL, is a `ca-central-1` stack, so it cannot
   hold one — a REGIONAL ACL declared there would have no protectable resource in this account and
   would be decorative.

A third fact settled the wiring: `AWS::CloudFront::Distribution` `WebACLId` takes the WAFv2 ACL
**ARN** despite its WAF-Classic name
(<https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-distribution-distributionconfig.html>).

## Changes

- **`infra/edge-waf/`** (new stack, us-east-1, per-stage, per-account). One CLOUDFRONT-scope
  `AWS::WAFv2::WebACL`, default action allow, a single rate-based rule at 2000 requests per
  five-minute window aggregated on `IP`, blocking with a 429 and a JSON body. `AggregateKeyType: IP`
  rather than `FORWARDED_IP` because CloudFront is the first hop — trusting `X-Forwarded-For` there
  would let a caller pick its own rate-limit bucket. Gated behind `CreateWebAcl` (dev false, prod
  true) so the billable resource does not exist in dev at all. Outputs `WebAclArn`.
- **`infra/web-hosting/template.yaml`** — `WebAclArn` parameter, `HasWebAcl` condition, and
  `WebACLId` on the distribution with an `AWS::NoValue` fallback so a blank parameter means no
  association rather than an association to nothing.
- **`infra/web-hosting/samconfig.toml`** — `WebAclArn` set explicitly on **both** stages (the
  omitted-parameter-keeps-its-old-value trap), blank for now on both.
- **`infra/deploy.sh`** — region pin extended to `edge-waf`; the "static stacks take no CLI
  overrides" note updated to name it, so nobody later adds a lone `WebAclArn` pair and wipes
  web-hosting's domain parameters (the failure ADR-033 already records).
- **`packages/cloud-fns/src/app-api`** — the per-sub write quota is unchanged. Added a per-source-IP
  budget of 60 requests/UTC minute on the two unauthenticated routes
  (`GET /invites/resolve/{token}`, `GET /wikis/{wikiId}`), which previously had no per-caller bound
  at all. Keyed by SHA-256 of the address, so the raw address is never persisted — the same
  treatment the existing wiki-password limiter uses. Consumed before any route work, so a rejected
  request costs one conditional update rather than an S3 read or a scrypt verification.
- **`docs/security/README.md`** — the controls, the two AWS constraints with citations, the cost
  gate, and what an ADR would have to decide to close the app-API gap.
- **`scripts/check-cloudformation-drift.sh`** — `edge-waf` added to the checked set, with a
  per-stack region override. The script ran every stack in one region, so without this the new
  stack would have reported "not deployed" forever and an out-of-band rule edit or a
  console-relaxed rate limit would never have surfaced. Raised by the reviewer as F-5.
- **`infra/README.md`**, **`.claude/agents/infra-ops-reviewer.md`**, **`.claude/skills/infra-deploy/SKILL.md`**
  — deploy order is now nine stacks, not eight. Leaving these stale would have meant the very agent
  this story requires a pass from was reviewing against an outdated stack list. Note that this
  commit therefore edits the rulebook the reviewing agent enforces; the edits were verified against
  the templates rather than taken on trust, but they deserve a deliberate human read (reviewer F-10).

## Ownership: crossed deliberately, contract amended

The story's `Owns` named `infra/foundation/template.yaml` for the ACL and nothing else in `infra/`.
Delivering a deployable ACL required `infra/edge-waf/`, `infra/web-hosting/{template.yaml,samconfig.toml}`,
`infra/deploy.sh`, `infra/README.md` and `scripts/check-cloudformation-drift.sh`. `docs/planning/RC_ROADMAP.md` has been amended in place:
the `Owns` list now matches what was touched, and a dated note records why the ACL moved out of
`foundation` and why one acceptance clause is unsatisfiable as written. `infra/foundation/template.yaml`
was **not** modified — its CI deploy role already carries `PowerUserAccess`, which covers `wafv2:*`.

The roadmap parser was re-run after the edit: 297 stories still parse, and RC-ENG-5.3's resolved
`Owns` is the intended set of paths (an earlier draft wrote a bare `samconfig.toml`, which the
resolver would have suffix-matched onto every stack's samconfig; fixed to the full path).

## Acceptance, item by item

| Criterion                                                        | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Throttles and alarms on the app API match the other stacks       | **Already true on the base branch**, verified rather than changed: `app-api` carries `ThrottlingBurstLimit: 20` / `ThrottlingRateLimit: 10` (`template.yaml:187`) exactly as `sync-api:258` and `signaling:255` do, plus Errors, 5xx metric-filter and Throttles alarms, and one extra `BillingWebhookErrorsAlarm`. No infra edit was needed. The story's "app-api has none" premise was stale.                                                                                                                                                            |
| A per-IP rate rule fronts the web hosting distribution           | **Done**, pending one out-of-band copy step (below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A per-IP rate rule fronts the app API                            | **Not possible at the edge.** Served instead by the stage throttles plus the new in-handler per-IP budget. Closing it properly needs an ADR: either migrate the HTTP API to a REST API (new authorizer type, v1 payload format, new API id every client resolves), or front it with its own CloudFront distribution and block direct origin access — which moves the API to a new hostname the web CSP and the Electron shell's `connect-src` both have to be widened for. Neither is an `M`-sized change and neither should be decided inside this story. |
| Contract test proves a 429 on the 21st listing write in a minute | **Done** (unchanged from the previous attempt), plus four new tests for the per-IP budget.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `infra-ops-reviewer` pass recorded                               | See below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Out-of-band steps a push cannot perform

1. `infra/deploy.sh edge-waf prod` — creates the ACL. Not added to any CI workflow, matching
   `edge-cert`, which is likewise deployed by hand and appears in no workflow.
2. Paste that stack's `WebAclArn` output into `infra/web-hosting/samconfig.toml` (prod) and
   redeploy `web-hosting`. SSM cannot be read cross-region, so this is the same manual copy
   `WebCertificateArn` already needs. **Until this happens the prod distribution has no web ACL**,
   and nothing fails loudly — a blank `WebAclArn` is a legitimate state (it is what dev runs). Check
   the distribution, not the stack status.
3. Decide whether dev should ever run `CreateWebAcl=true`. At ~$6/month against a $12 ceiling it
   currently cannot without breaching the budget alarm.

## Validation

All run in this worktree at the commit under review:

- `sam validate --template infra/edge-waf/template.yaml --region us-east-1` — exit 0.
- `sam validate --lint` on `infra/edge-waf/template.yaml` and `infra/web-hosting/template.yaml`
  — both "is a valid SAM Template", exit 0. This is the same blocking+lint pair `infra/deploy.sh`
  runs before a deploy.
- The `WebAclArn` `AllowedPattern` was tested as a regex against six cases: empty, AWS's own
  documented example ARN, a realistic prod ARN, a REGIONAL ARN, a wrong-region ARN and a bare
  WAF-Classic id. All six matched the intended verdict. An over-strict pattern here would be a
  deploy-time rejection, which is why it was tested rather than eyeballed.
- `bash -n infra/deploy.sh` — exit 0; the region-pin branch was exercised directly and resolves
  `edge-waf` to `us-east-1`. (`shellcheck`, which `supply-chain.yml` runs, is not installed here.)
- `pnpm exec vitest run --config vitest.cloud.config.ts` — 36 files, 490 tests passed (486 before;
  the 4 new ones are the per-IP contracts).
- `pnpm --filter @dndtools/cloud-fns typecheck` — exit 0.
- `pnpm exec eslint` on the changed handler and test — exit 0.
- `pnpm exec prettier --check` on all nine changed text files — clean; `git diff --check` clean.
- Roadmap parser re-run via the dispatcher's own `rc.parse_roadmap` — 297 stories, expected `Owns`.

No live AWS call, deploy, or drift check was performed, so nothing here is evidence about the
deployed state of either stage.

## infra-ops-reviewer pass

Run 2026-09-16 against the working tree, base `4d551c9c`. **Verdict: PASS — no blockers.** All
eight verification questions put to it came back CONFIRMED, including the two the design depends
on (the template is deployable; `WebACLId` takes a WAFv2 ARN) and the two that were claims rather
than changes (app-api throttle/alarm parity already held since `cdd3102b`; the cross-region
parameter copy is structurally identical to `edge-cert`). It independently re-ran `sam validate`
and `sam validate --lint` on both templates, checked every WAF property against the bundled
CloudFormation resource schemas, and re-tested the ARN pattern against six ARN shapes.

Its caveat is worth repeating verbatim in spirit: nothing in this commit is deployed by `git push`.

**Fixed in this commit, in response to the review:**

- F-5 — `edge-waf` was invisible to the weekly drift job (`scripts/check-cloudformation-drift.sh`
  ran one region for all stacks). Added, with a per-stack region override.
- F-6 — teardown is order-sensitive (`WAFAssociatedItemException` if the ACL is deleted while
  associated). Documented in the `CreateWebAcl` description, both samconfigs and `infra/README.md`.
- F-2 — an _explicit_ blank `WebAclArn` does not merely omit an association, it removes one, so a
  console-attached ACL is silently reverted by the next promotion. Called out in the samconfig.
- F-4 — no verification exists for the one coupling that fails silently. Added the
  `get-distribution-config` check to `infra/README.md` rather than leaving "check the distribution"
  as advice with no command.
- F-7 — with `CreateWebAcl=false` the dev stack declares no resources and would park in
  `REVIEW_IN_PROGRESS`. The samconfig now says plainly that dev is not meant to be deployed.
- F-3 (partial) / F-9 — `infra/README.md`'s headline "roughly $12/month" was stale, and both
  READMEs called WAF "flat and independent of traffic", which omits $0.60/million requests. Both
  corrected; the security README now also states the prod forecast-alert consequence.
- F-8 — the roadmap's "Current state: `app-api` has none" was stale; struck through with the
  commit that made it stale.
- N-2, N-3 — `EvaluationWindowSec: 300` now explicit so `RateLimitPer5Min` is self-verifying, and
  the "AWS floor is 100" comment corrected (AWS allows 10; 100 is this project's choice).
- N-4 — the security README's "the raw address is neither persisted nor logged" oversold an
  unsalted SHA-256 over enumerable IPv4 space. Reworded as storage hygiene bounded by a 2-minute
  TTL, not anonymisation.
- N-1 — already addressed before the review landed: the ARN pattern's id segment was widened to
  `[0-9A-Za-z-]+`, so AWS's own documented example ARN is accepted. The reviewer tested the
  earlier `[0-9a-f-]+`.

**Deliberately NOT fixed here, and why:**

- F-1 — no workflow deploys `edge-waf`. Adding a step to `promote-production.yml` would only
  automate one of the three steps (the ARN copy is still a commit), and unilaterally editing the
  production promotion path is the owner's call, not this story's. Recorded under "Out-of-band
  steps" above instead.
- F-3 (the budget itself) — raising prod `MonthlyBudgetUsd` from 20 to 25 means editing
  `infra/foundation/` and amending ADR-033, which is what budgets this. Flagged for the owner:
  **expect the prod FORECASTED-80% ($16) budget alert to begin firing once the ACL is on.**
- F-5 (second half) — `AiConnectSources` is absent from web-hosting's `parameter_overrides` on both
  stages, contradicting `infra/README.md`. Pre-existing, unrelated to this change, and pinning it
  would alter a deployed CSP value; left for a separate story.
- `edge-cert` is also absent from the drift script (it carries no stage in its stack name, so the
  script's `dndtools-<stage>-<component>` shape does not fit it). Pre-existing gap, noted not fixed.

The reviewer could not reach AWS — SSO is expired for both profiles — so every stack-status and
deployed-parameter cell in its drift table is inferred from CI run history, not observed. **No
claim in this journal is evidence about the live state of either stage.**

## Rebase onto d28fdf69

**The conflict.** RC-CLD-4.4 (`fd6c9058`, `584a5469`) added a third unauthenticated route,
`GET /wikis/{wikiId}/{document}`, in exactly the block this story had restructured to charge a
per-IP budget. Both sides rewrote the same lines.

**Resolution.** Integration's three route blocks are kept verbatim and the budget is charged once
in a single guard above them, rather than re-nesting the routes inside the guard as the original
commit did. That keeps this story's diff against the integration branch small, covers the new
document route, and leaves the next person who adds an unauthenticated route one list to append to
instead of a nested branch to unpick.

The document route calls `readWiki` internally, so charging per call site would have billed it
twice. A test now pins that: 60 successful `reader` requests from one address, 429 on the 61st.

**One claim this story made is no longer true, and has been corrected.** The integration branch
also gave `web-hosting` a `/wikis/*` cache behaviour pointing at the app-api HTTP API origin
(`infra/web-hosting/template.yaml:265-274`, gated on `WikiApiId`). So once `WikiApiId` is set, the
crawlable wiki routes _are_ served through the distribution and _are_ behind this story's web ACL —
the app API is no longer entirely un-fronted. It is still the exception: every other app-api route,
and `/wikis/*` fetched directly from the `execute-api` hostname, bypasses CloudFront entirely.
`docs/security/README.md` now says this rather than the flat "WAF cannot protect the app API".

Net effect on the acceptance clause "a per-IP rate rule fronts the app API": partially satisfied by
the integration branch's own routing, for the wiki surface only, and only when `WikiApiId` is set
and the ACL ARN has been copied into `web-hosting`. The rest still needs the ADR described above.

**Post-rebase validation.**

- `pnpm exec vitest run --config vitest.cloud.config.ts` — 37 files, 500 tests passed (was 36/490
  pre-rebase; integration added a file and the new per-IP document test adds one).
- `pnpm --filter @dndtools/cloud-fns typecheck` — exit 0.
- `pnpm exec eslint packages/cloud-fns/src` — exit 0.
- `sam validate --lint` on `infra/edge-waf/template.yaml` and `infra/web-hosting/template.yaml`
  (the latter now also carrying RC-CLD-4.4's wiki origin and cache behaviours) — both valid.
- Prettier and `git diff --check` clean.

No re-run of the `infra-ops-reviewer` pass: the rebase changed no infrastructure template content
from this story, only the handler and the two documents above. The reviewer's verdict and findings
recorded in the section above still describe what is committed.

## 2026-09-20 — scoped resubmission

The operator's expanded ownership permits the necessary edge infrastructure. Removed all three
previous agent-memory changes by restoring those paths to `d28fdf69`; the final candidate must have
no net changes under `.claude/agent-memory/`. No dispatcher state, push, promotion or deployment.

Implemented a production app API CloudFront distribution with the shared per-IP WAF ACL,
caching disabled, all methods and viewer Authorization/cookies/query forwarding. A generated
origin secret is overwritten by CloudFront. Public routes (wiki, invites, telemetry, Stripe) use
an uncached Lambda authorizer; JWT routes retain Cognito and verify the origin credential before
business work. Viewer functions overwrite the client-IP header for the handler budgets. Dev
keeps the existing direct API. App URL and CSP origin are published through SSM. Production
CloudFormation rules reject blank ACLs, and the wrapper obtains the ARN from the edge stack in
us-east-1, retaining the complete hosting parameter list. Activation requires a coordinated
client rebuild and Stripe endpoint refresh; old binaries using execute-api will be rejected.

Owned-path justification:

- `infra/app-api/template.yaml`: API distribution, origin credential/authorizer, SSM coordinates;
  existing 20/10 throttles and alarms already match sync/signaling.
- `packages/cloud-fns/src/app-api`: preserve quota contracts, add origin enforcement and tests.
- `infra/web-hosting/template.yaml`: protected wiki origin, trusted viewer address, CSP source,
  and required production WAF association; samconfig comments describe wrapper-supplied ARN.
- `infra/edge-waf/{template.yaml,samconfig.toml}`: retained rate-rule stack; update consumer/order
  and teardown comments. Regional foundation needs no change; its deployment policy covers WAF.
- `infra/deploy.sh`: retain region pin and resolve the ACL for both consumers without dropping
  configured domain parameters; unavailable production output is blocking.
- `scripts/check-cloudformation-drift.sh`: retained edge stack region-aware drift coverage.
- `infra/README.md`, `.claude/skills/infra-deploy/SKILL.md`, `.claude/agents/infra-ops-reviewer.md`:
  correct dependency order, automatic ARN handoff, cost and review procedure. Reviewer must return
  evidence rather than writing agent memory during centrally scheduled runs.
- `docs/planning/RC_ROADMAP.md`, `docs/security/README.md`: remove the previous claim that API
  protection is unsatisfiable and document the implemented boundary and activation requirements.
- This journal is updated under the task's explicit journal instruction.

### infra-ops-reviewer pass (2026-09-20)

The separately invoked `infra_ops_review` agent used `.claude/agents/infra-ops-reviewer.md` and
returned **PASS — static acceptance review; no implementation blockers found**. It verified
throttle/alarm parity; production ACL associations and fail-closed lookup; public authorizer and
JWT origin checks; atomic quota semantics and existing 21st-write contract; no IAM widening or
stateful replacement. It independently ran SAM validate AND lint on app-api, web-hosting and
edge-waf (all exit 0), shell syntax checks and diff whitespace checks (exit 0). Documentation
findings (order, manual-copy/teardown comments and budget arithmetic) were corrected. Optional
follow-up: explicit authorizer log retention. No reviewer agent-memory files were written.

AWS deployment/drift remains unverified. This PASS is local static review evidence, not deployment
or central integration approval. AWS sources used to verify policy IDs and forwarding semantics:
https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html
https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html
https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-property-httpapi-lambdaauthorizer.html

### Validation

- Full cloud suite after origin guard: 37 files / 501 tests passed; cloud-fns typecheck exit 0.
- Initial new handler test accidentally used an unknown route (`/entitlements`, 404); corrected
  to the actual `/account/entitlements` route, then reran the full suite above successfully.
- Further authorizer and viewer-IP execution contracts added; final results recorded below.

- Final targeted handler/edge contracts: 2 files / 90 tests passed (87 handler + 3 edge).
- Final cloud-fns typecheck, app-api ESLint and shell syntax checks: exit 0.
- CI guardrail suite: 1 file / 13 tests passed.
- Wrapper dry-run harness substitutes all AWS/SAM/pnpm commands (no deployment). Production
  hosting and app-api retained complete parameters and received the ACL; dev retained explicit
  blanks; failed production ACL lookup prevented deploy. All four cases passed. Its initial
  app-api fixture returned an invalid web origin; corrected the fixture to an HTTPS origin and
  reran, with no implementation change needed.

## Reconcile onto integration 2d9f566d (2026-09-20)

The central gate restored the original candidate after a rebase conflict. Rebased the task commit
onto `2d9f566d194d10e597c8001015b7e8be31811d59` and resolved both conflicts additively:

- `handler.ts`: retain integration's expanded `PublishBudgetKind` and `BUDGET_LABEL`, including
  review and flag daily limits, alongside this task's minute-write and public-IP quota helpers.
  Discovery, ratings, moderation, account-export/deletion and transaction behavior are preserved.
- `handler.test.ts`: retain both `query` and `sourceIp` in the fixture. Integration's transaction
  fake and discovery contracts remain intact. Extend the existing shared-quota contract to assert
  429 for install, review, report and moderation writes after the publishing budget is exhausted.
- The automatically merged app-api template preserves integration's discovery routes with default
  Cognito JWT authorization; they pass through the origin guard and shared write budget.

Validation on the resolved candidate: full cloud suite passed (40 files, 534 tests); cloud-fns
TypeScript and app-api ESLint passed; shell syntax checks passed; CI guardrails passed (14 tests).
The final extended handler quota contract passed with all 101 handler tests; both conflicted
source files passed Prettier checks.

**infra-ops-reviewer refresh: PASS** against the exact integration base above, with no
rebase-related blockers. The reviewer verified discovery JWT/origin coverage, minute quotas on
new writes, retained daily review/flag budgets, both fixture fields, WAF associations and stage
throttles. It independently ran SAM validation with lint on app-api, web-hosting and edge-waf
(all exit 0), shell syntax and diff-whitespace checks (passed), and confirmed no conflict markers
or agent-memory changes. Review was of resolved source before Git staging; no AWS mutations or
file writes by the reviewer. Deployment/live drift remain unverified.

This reconciliation changes only the two owned source files and the explicitly required journal
relative to the prior task implementation. No push, promotion, dispatcher-state edit or deployment.

## Tooling-gate diagnosis (2026-09-20)

Read the original failed gate output for attempt `e068e78f-2761-4454-b057-a80b34e5a079`
from the dispatcher's attempt log. The only failures are two assertions in
`tests/unit/wiki-hosting.test.ts`: an exact header list excluding `x-app-client-ip`, and
`ReadWikiDocument.Auth.Authorizer === 'NONE'`. Reproduced both with
`pnpm exec vitest run tests/unit/wiki-hosting.test.ts` (2 failed, 2 passed).

The implementation deliberately forwards an edge-overwritten viewer address for per-IP budgets
and uses the origin-only authorizer for anonymous wiki reads. It does not forward Cognito tokens
or cookies on that wiki behavior. Reverting these controls to satisfy the assertions would weaken
the intended edge boundary. Prepared a narrow test patch outside the repository at
`/tmp/RC-ENG-5.3-wiki-hosting-test.patch`: update those two expectations, retain cookie/JWT
separation checks, and execute the shipped wiki viewer function to prove spoofed addresses are
overwritten. A standalone read-only execution of the proposed assertions against both templates
passed; this is NOT a passing tooling gate, whose file remains unchanged.

The failing test file is outside the explicit owned paths. Requested operator authorization to
add only `tests/unit/wiki-hosting.test.ts` to scope before applying the patch. No out-of-scope
repository edits or production-control changes were made. Tooling gate remains failed pending
that scope decision, application of the patch, and the full `pnpm test:tooling` rerun. Existing
infra review remains applicable because no implementation or template changed in this diagnosis.
