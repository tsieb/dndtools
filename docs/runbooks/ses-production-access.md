# Runbook — SES production access (prod)

**Status: one step left, and only a human can take it.** Everything the AWS case asked us to build
is deployed and verified in prod. What remains is replying to the case in the Support console.

- Account `649320110863`, region `ca-central-1`, profile `dndtools-prod`.
- Case `178562576600649` (SES production access).
- Sending domain `lamplight.click`, verified with Easy DKIM (RSA 2048), feedback forwarding on.
- Envelope sender `accounts@lamplight.click`.

## Why this matters

`ProductionAccessEnabled` is `false`, so the account is in the SES sandbox: 200 messages/day,
1/second, and delivery **only** to individually verified addresses. Prod Cognito runs
`EmailSendingAccount=DEVELOPER` against this identity, so a member of the public signs up, sees a
success screen, never receives the code, and is stranded `UNCONFIRMED`. Public registration on
lamplight.click cannot work until this is granted. Nothing else blocks it — the app itself has been
promoted to prod and is live.

## Verify the evidence is still true before replying

```sh
export AWS_PROFILE=dndtools-prod AWS_REGION=ca-central-1
aws sesv2 get-account --query '{prod:ProductionAccessEnabled,quota:SendQuota,suppression:SuppressionAttributes}'
aws sesv2 get-configuration-set-event-destinations --configuration-set-name dndtools-prod-email
aws cloudwatch describe-alarms --query 'MetricAlarms[?contains(AlarmName,`Bounce`)||contains(AlarmName,`Complaint`)].{n:AlarmName,s:StateValue}'
aws sns list-subscriptions --query 'Subscriptions[?contains(TopicArn,`operational-alerts`)]'
```

Last verified 2026-09-09:

| Claim                                 | Evidence                                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation + identity applied in prod | both stacks `UPDATE_COMPLETE`, last updated 2026-09-04                                                                                   |
| SES event publishing exists           | configuration set `dndtools-prod-email`, destination `cloudwatch`, `Enabled: true`                                                       |
| Events captured                       | SEND · DELIVERY · BOUNCE · COMPLAINT · REJECT · RENDERING_FAILURE · DELIVERY_DELAY                                                       |
| Alarms exist and are healthy          | `dndtools-prod-identity-EmailBounceRateAlarm` OK, `…-EmailComplaintRateAlarm` OK                                                         |
| Alarms actually notify someone        | `dndtools-prod-operational-alerts` has a **confirmed** subscription (a real subscription ARN, not `PendingConfirmation`)                 |
| Suppression is on                     | account-level suppression for `BOUNCE` and `COMPLAINT`                                                                                   |
| Both senders use the set              | Cognito via `EmailConfiguration.ConfigurationSet`; app-api invites via `SES_CONFIGURATION_SET` → `SendEmailCommand.ConfigurationSetName` |

A green alarm is not proof of delivery — see the operational-alerts history if in doubt
(`aws cloudwatch describe-alarm-history --history-item-type Action`).

## What to do

1. Open the case in the Support console (the `DescribeCases` API needs a paid support plan, so this
   cannot be scripted): <https://support.console.aws.amazon.com/support/home#/case/?displayId=178562576600649>
2. Post the reply below, adjusting anything the verification step contradicts.
3. AWS typically answers within one business day. On approval, re-check
   `aws sesv2 get-account --query ProductionAccessEnabled` and then complete one real sign-up on
   lamplight.click with an address that has never been verified in this account — that is the
   acceptance test for RC-CLD-1.1.
4. If AWS declines again, they will name the specific concern. Do not re-submit the same text;
   answer the concern and update this runbook with what they asked for.

## Reply draft

> Thanks for coming back to us — here are the specifics on volume, list hygiene, and how we handle
> bounces and complaints.
>
> **What we send.** Lamplight is a tabletop RPG campaign-management app. All of our mail is
> transactional and every message is caused by an action someone just took. There are exactly two
> kinds. Amazon Cognito account mail — a sign-up verification code or a password-reset code, sent
> only to the address the person typed into our own form seconds earlier. And campaign invitations —
> a signed-in user enters one friend's address and we send one message with a join link. We send no
> marketing, no newsletters, no digests, and no bulk mail of any kind. There is no mailing list to
> buy, rent, or scrape from, because we never build one: an address enters our system only by being
> typed into a form by the person who owns it or by a user inviting one specific person.
>
> **Volume.** Tens of messages per day. The app is in alpha with a small number of users, and the
> ceiling is structural rather than a policy we have chosen: one verification per registration, one
> per password reset, one per invitation. We are asking to leave the sandbox for reachability, not
> for throughput — the 200/day sandbox quota is not the constraint, the verified-recipients-only
> restriction is.
>
> **Bounce and complaint handling.** This is now built and deployed in the account, not planned:
>
> - SES configuration set `dndtools-prod-email` publishes SEND, DELIVERY, BOUNCE, COMPLAINT, REJECT,
>   RENDERING_FAILURE and DELIVERY_DELAY events to CloudWatch, with reputation metrics enabled.
> - Both senders are bound to that set: Cognito through `EmailConfiguration.ConfigurationSet`, and
>   our invitation Lambda through `SendEmailCommand.ConfigurationSetName`. Nothing in the account
>   sends outside it.
> - CloudWatch alarms fire on account bounce rate ≥ 5% and complaint rate ≥ 0.1% — the levels at
>   which SES itself opens a review — and publish to an SNS topic with a confirmed human subscriber.
> - Account-level suppression is enabled for both BOUNCE and COMPLAINT, so a hard bounce or a
>   complaint stops all further mail to that address automatically.
> - We chose CloudWatch aggregate metrics rather than SNS event payloads deliberately: recipient
>   addresses stay inside SES and never reach our logs.
>
> **Unsubscribe.** There is no recurring mail to unsubscribe from. An invitation is declined by
> ignoring it, account mail stops when the account is deleted, and a complaint permanently suppresses
> the address through the account suppression list.
>
> **Identity.** The sending domain `lamplight.click` is verified in this account with Easy DKIM
> (RSA 2048) and feedback forwarding enabled. The envelope sender is `accounts@lamplight.click`.
>
> Happy to provide configuration-set ARNs, alarm ARNs, or anything else that helps.

## History

- 2026-08-02 — monitoring built (`f5e0ac3a`) so the claim in the original `UseCaseDescription` about
  bounce/complaint monitoring became true; at submission time it was not.
- 2026-09-04 — `foundation` and `identity` applied in prod, which is what made the evidence above
  real. The foundation apply also carried the KMS key-policy fix without which no alarm could
  notify anyone.
- 2026-09-09 — evidence re-verified live; `v0.3.7` promoted to prod. Case reply still outstanding.

## Related

- `docs/planning/RC_ROADMAP.md` § RC-CLD-1.1.
- **Gotcha, still live:** `infra/deploy.sh` passes CLI `--parameter-overrides` for app-api, and those
  _replace_ the samconfig list wholesale — a value added to `samconfig.toml` is dropped silently on
  every deploy. `InviteSender` therefore reads `/dndtools/<stage>/app-api/invite-sender` from SSM.
  Use a **bare address**: the Lambda's send policy is conditioned on `ses:FromAddress`, which matches
  the address alone, so a `Name <addr>` form denies every send.
