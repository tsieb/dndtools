# Cloud operations runbook

## Ownership and alert response

| Severity | Alarm                                                                 | Owner                    | First check                                                           | Rollback threshold                                              |
| -------- | --------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| Sev 1    | API 5xx, sign-in outage, TURN unavailable                             | platform on-call         | CloudWatch Logs Insights by `requestId` and `releaseSha`; X-Ray trace | sustained customer impact for 10 minutes or data-integrity risk |
| Sev 2    | Lambda errors/throttles, backup/sync failure, CloudFront availability | platform on-call         | dashboard by route/error code and deployment event                    | error rate remains above baseline after mitigation              |
| Sev 3    | auth failures, cost anomaly, deployment failure                       | feature owner + platform | aggregate counts only; verify config and deploy summary               | no automatic rollback unless customer impact appears            |

Logs are JSON and may include correlation/request ID, stage, release SHA, operation, error code and
latency. They must never include vault contents, prompts, credentials, tokens, email addresses or raw
IP addresses. Dev retains logs for 14 days; prod retains logs for 90 days.

For an incident: acknowledge the SNS alarm, declare the severity in the incident channel, capture the
release SHA/config version, inspect the named query/dashboard, and update users with impact and next
update time. If the rollback threshold is met, promote the prior known-good tag through the protected
workflow—never edit production manually. Close with impact, timeline, remediation and follow-up owner.

## Privacy-safe client telemetry

Telemetry is opt-in and kill-switch controlled. Allowed fields are coarse funnel event, feature
adoption, performance-budget outcome, crash fingerprint, app version and platform. Campaign content,
user content, account identifiers, prompts and network identifiers are prohibited. Consent is
revocable; disable collection immediately and delete queued client events. Record the retention period
with the telemetry receiver before enabling collection in production.

## Cadence

Review dev cost weekly and production cost after each promotion. Quarterly, restore a synthetic
encrypted backup, rehearse promotion of a previous tag, review IAM/OIDC trust and drift, inspect cost
by tag, validate log redaction, and test deletion evidence against synthetic data only. Confirm the
SES sender and operations SNS subscription before first production traffic.
