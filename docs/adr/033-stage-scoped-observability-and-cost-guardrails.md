# ADR-033: Stage-Scoped Observability and Cost Guardrails

- Status: Accepted
- Date: 2026-09-03
- Deciders: Engineering
- Consulted: Platform, Security
- Supersedes: N/A

## Context

The organisation's AWS bill went from $1.28/month (March–June 2026) to $12.14 in July and $40.16 in
August. Nothing was compromised and no traffic arrived — neither stage has ever served a Lambda
invocation. The bill was infrastructure watching infrastructure that was doing nothing.

Three independent facts combined:

1. **CloudWatch free allowances are per-organisation and consumed as resource-months.** Three free
   dashboards, ten free alarms, shared across all four accounts under consolidated billing. On
   2026-08-01 the prod account came up alongside dev, which duplicated every per-stack dashboard and
   alarm. Eight dashboards consume three dashboard-months in three-eighths of a month, so CloudWatch
   billed $0.00 through 12 August and $0.85/day thereafter. The mid-month onset made it look like a
   change had been deployed on 13 August. Nothing had.
2. **Each service stack owned its own dashboard.** `app-api`, `sync-api`, `signaling` and `identity`
   each declared an `AWS::CloudWatch::Dashboard`. That is the natural place to put one when a stack is
   considered in isolation, and it scales linearly with stacks × stages against an allowance that does
   not scale at all. A fifth dashboard was already queued behind the un-deployed prod `identity` stack.
3. **The guardrails that should have caught it were not wired to a human.** Dev's budget alerted to an
   address nobody watched; its $15 ceiling was breached at $19.33 without consequence. Dev's thirteen
   alarms published to an SNS topic whose only email subscription had been created, never confirmed,
   and silently deleted by AWS three days later — while CloudFormation continued to report the
   subscription `CREATE_COMPLETE`. Prod's $40 ceiling was loose enough that a 3x org-wide cost
   increase sat entirely inside it.

The forcing function is that this recurs every month by construction. The free allowance resets on the
first, is exhausted around the twelfth, and bills for the rest of the month.

## Decision

Observability becomes a **stage-scoped** concern with a **per-organisation budget**, not a per-stack
default.

1. **One dashboard per stage, owned by `foundation`.** The four per-stack `AWS::CloudWatch::Dashboard`
   resources are deleted. `infra/foundation/template.yaml` declares a single
   `dndtools-<stage>-overview` carrying every widget the four carried plus the TURN heartbeat none of
   them showed. It is gated by `CreateStageDashboard` (prod `true`, dev `false`), keeping the
   organisation at two of its three free dashboards with one slot spare.
2. **Widgets resolve metrics by `SEARCH()`, not by name.** `foundation` deploys first and cannot look
   up the service stacks' CloudFormation-generated Lambda names. Every widget matches on the
   `dndtools-<stage>` prefix instead, so the dashboard has no cross-stack dependency, needs no
   redeploy when a function is added, and renders empty rather than failing when a stack does not yet
   exist.
3. **Alarms are opt-in per stack via `CreateAlarms`** (prod `true`, dev `false`). Prod keeps all
   eleven; dev creates none.
4. **The alerts topic is encrypted in prod only.** Dev's customer-managed KMS key is removed and its
   topic left unencrypted. This is a deliberate three-way choice recorded on `AlertsKey`: the
   AWS-managed `alias/aws/sns` remains forbidden, because its non-editable policy is what silently
   broke alarm delivery through 2026-08-02.
5. **The budget resource drops its explicit `BudgetName`.** `NotificationsWithSubscribers` is a
   Replacement-update property, and replacement is create-then-delete, so a named budget collides with
   itself and can never have its notifications changed. Both accounts were wedged by this.
6. **Both stages alert to one confirmed address** (`jade@sieb.net`), with ceilings set near expected
   steady state (dev $12, prod $20) rather than at a comfortable distance from it.

Dev keeps exactly the two controls that would have caught this incident — the Budget and Cost Anomaly
Detection, both free — and drops the ones that cost money while notifying nobody.

## Consequences

### Positive

- Recurring CloudWatch spend goes to $0 against a $15.89/month August charge; the org holds a spare
  dashboard slot and thirteen spare alarm slots as headroom.
- The mid-month billing cliff cannot recur while the org stays within the allowance, and the tightened
  ceilings mean a regression trips the 40% warning inside the month it happens.
- The budget resource is now actually updatable, unblocking `dndtools-prod-foundation`, which had been
  stuck in `UPDATE_ROLLBACK_COMPLETE` since 2026-08-03.
- One dashboard per stage is a better operator surface than four fragmented ones, and picks up new
  functions without a template change.

### Negative

- **Dev has no alarms.** A dev regression surfaces when someone looks, not when it happens. This is
  honest rather than new: dev's alarms notified nobody for their entire life.
- **A `SEARCH` widget is empty both when a stage is idle and when it is broken.** The dashboard cannot
  distinguish healthy silence from failure; alarms are what carry that signal, and dev has none.
- **Dev's alerts topic is unencrypted.** Acceptable because it carries cost-anomaly notices about an
  account holding no user data, and it must be revisited if that changes.
- **The budget's physical name is now CloudFormation-generated**, so it is no longer greppable as
  `dndtools-<stage>-monthly` and must be read from the stack output.
- Dashboard ownership no longer sits with the stack whose metrics it shows, which is less obvious when
  reading a service template in isolation.

## Rejected Alternatives

| Alternative                                                                             | Why Rejected                                                                                                                                                                         |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Keep four dashboards, gate them on `IsProd`                                             | Leaves four prod dashboards plus one neighbouring account = five, still two over the allowance at $6/month, and still scales with stack count. Fixes the symptom, not the mechanism. |
| Merge into one dashboard owned by the last stack in the deploy order                    | Inverts the dependency direction: `sync-api` would need `app-api`'s and `signaling`'s function names, reintroducing the SSM coupling and `ParameterNotFound` ordering trap.          |
| Keep per-stack dashboards, publish function names to SSM for a `foundation` second pass | Adds a deploy-ordering constraint and a second pass to solve a problem `SEARCH()` solves with no coupling at all.                                                                    |
| Delete the dashboards out of band in the console                                        | Cheapest immediately, but the weekly drift job treats out-of-band change as failure, and the next `sam deploy` recreates them.                                                       |
| Keep `BudgetName` and delete the budget by hand before each change                      | Preserves a readable name at the cost of a landmine that had already wedged two stacks' deploys for a month.                                                                         |
| Turn off Cost Anomaly Detection in dev too                                              | It is free, and it is one of only two controls that would have caught this. Removing it saves nothing and removes the detection.                                                     |

## Migration Impact

- **Templates:** dashboards removed from `infra/{app-api,sync-api,signaling,identity}/template.yaml`;
  `CreateAlarms` parameter + `ShouldCreateAlarms` condition added to those four and to `infra/turn`;
  `CreateStageDashboard`, the merged dashboard, prod-only `AlertsKey`, and the unnamed budget in
  `infra/foundation/template.yaml`.
- **`infra/deploy.sh`:** parameter overrides are assembled as bare `Key=Value` pairs with
  `--parameter-overrides` attached once at the end. This fixes a silent pre-existing bug — `signaling`
  appended its override to an empty array, so `sam deploy` received a stray positional argument, which
  the SAM CLI accepts and discards. `signaling` had therefore never received `ReserveLambdaConcurrency`.
  Stacks whose per-stage config is static (`turn`, `foundation`, `web-hosting`, `edge-cert`) now take
  no CLI overrides at all, so their `samconfig.toml` stays authoritative. Log retention became
  stage-derived (dev 14 / prod 90), replacing a hardcoded `30` that had been silently overriding the
  values each `samconfig.toml` declared.
- **Rollout sequencing:** `foundation` first (it owns the dashboard and the topic), then the service
  stacks in the documented order. Prod needs no manual budget cleanup: its rollback left
  `dndtools-prod-foundation` still owning `dndtools-prod-monthly`, so the unnamed-budget change
  replaces it the same way it did in dev — new generated-name budget created, old one deleted, no
  name collision. Verified against the live stack before prod was attempted.
- **Back-compat:** no application, API or data contract changes. Nothing outside `infra/` is touched.
- **Dev TURN:** torn down in the same pass (a `t4g.nano`, an Elastic IP and an 8 GB volume, ~$7.70/month,
  idle since 1 August). Not an observability change, but it shares this ADR's premise — paying for
  always-on infrastructure in a stage with no traffic. It couples to deploys: `signaling` resolves
  `/dndtools/<stage>/turn/secret-arn` at deploy time, so a dev `signaling` deploy fails with
  `ParameterNotFound` until `turn` is rebuilt. The rebuild procedure is in `infra/README.md`, and was
  exercised end-to-end on 2026-09-03 to clear `signaling`'s alarms before the final teardown.

## Rollback Plan

- **Trigger:** a dev incident that alarms would have caught and nobody did; or a prod deploy blocked by
  the dashboard/alarm changes.
- **Steps:** set `CreateAlarms=true` (or `DNDTOOLS_CREATE_ALARMS=true`) and redeploy the affected
  stacks; set `CreateStageDashboard=true` in `infra/foundation/samconfig.toml` and redeploy
  `foundation`. Both are parameter flips, no template edit.
- **Data recovery:** none required; alarms and dashboards hold no state. CloudWatch metrics are retained
  independently of whether an alarm or dashboard reads them, so history is not lost while they are off.
- **Known risks:** re-enabling dev alarms without first confirming the dev SNS email subscription
  restores the original silent-failure mode. Confirm against
  `aws sns list-subscriptions-by-topic`, never against stack status. Turning dev's dashboard on takes
  the org to three of three, so a fourth dashboard anywhere then costs $3/month.
- **Irreversible:** the dev KMS key `a704577f-d4a5-4cd2-aed5-8eb392789f08` was scheduled for deletion on
  2026-09-10. Cancel with `aws kms cancel-key-deletion` before that date; afterwards a new key must be
  created, which is a `foundation` parameter change rather than a recovery.

## Verification and Evidence

- `infra/foundation/template.yaml` — `CreateStageDashboard`, `StageOverviewDashboard` (SEARCH widgets),
  `AlertsKey` (`Condition: IsProd`, and the three-way encryption matrix), `MonthlyCostBudget`.
- `infra/{app-api,sync-api,signaling,identity,turn}/template.yaml` — `CreateAlarms` + gated alarms.
- `infra/deploy.sh` — `PARAM_OVERRIDES` assembly and the completeness note.
- `infra/README.md` § "Observability and what it costs" — the free-tier mechanics, the dev/prod split,
  the delivery-verification runbook, and the dev TURN rebuild procedure.
- Dashboard body validated against the live API before deployment: `put-dashboard` returned an empty
  `DashboardValidationMessages`, and the `SEARCH` syntax was confirmed to resolve 432 datapoints
  against `dndtools/TURN`.
- Deployed to dev 2026-09-03: `dndtools-dev-foundation` `UPDATE_COMPLETE`, budget $12 → `jade@sieb.net`,
  topic `KmsMasterKeyId` `None`, dev dashboards 4 → 0, dev alarms 13 → 0.
