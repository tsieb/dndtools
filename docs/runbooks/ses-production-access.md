# Runbook: SES production access (prod)

**Status (2026-09-10): one step left, and only a human can take it.** Everything AWS asked for is
deployed and verified in prod; what remains is a console action.

- Account `649320110863`, region `ca-central-1`, profile `dndtools-prod`.
- Case `178562576600649` closed unanswered on 2026-09-10 and is recorded as `DENIED`; a denied
  request cannot be resubmitted through the API (`put-account-details` returns `ConflictException`).
- Sending domain `lamplight.click`, verified with Easy DKIM (RSA 2048); envelope sender
  `accounts@lamplight.click`.

## Why it matters

`ProductionAccessEnabled` is `false`, so the account is in the SES sandbox: 200 messages a day, one
a second, delivery only to individually verified addresses. Prod Cognito sends through this
identity, so a member of the public signs up, sees a success screen, never receives the code, and is
stranded `UNCONFIRMED`. Public registration on lamplight.click cannot work until this is granted;
nothing else blocks it.

## Verify the evidence before replying

```sh
export AWS_PROFILE=dndtools-prod AWS_REGION=ca-central-1
aws sesv2 get-account --query '{prod:ProductionAccessEnabled,quota:SendQuota,suppression:SuppressionAttributes}'
aws sesv2 get-configuration-set-event-destinations --configuration-set-name dndtools-prod-email
aws cloudwatch describe-alarms --query 'MetricAlarms[?contains(AlarmName,`Bounce`)||contains(AlarmName,`Complaint`)].{n:AlarmName,s:StateValue}'
aws sns list-subscriptions --query 'Subscriptions[?contains(TopicArn,`operational-alerts`)]'
```

Last verified 2026-09-09: foundation and identity `UPDATE_COMPLETE`; configuration set
`dndtools-prod-email` publishes SEND, DELIVERY, BOUNCE, COMPLAINT, REJECT, RENDERING_FAILURE, and
DELIVERY_DELAY to CloudWatch; `EmailBounceRateAlarm` and `EmailComplaintRateAlarm` are `OK`; the
`dndtools-prod-operational-alerts` topic has a confirmed subscriber; account-level suppression covers
BOUNCE and COMPLAINT; both senders (Cognito via `EmailConfiguration.ConfigurationSet`, the invite
Lambda via `SES_CONFIGURATION_SET`) use the set. A green alarm is not proof of delivery; check
`describe-alarm-history --history-item-type Action` if in doubt.

## What to do

Get into the prod console through the SSO portal (`https://d-9d675c34a3.awsapps.com/start`,
management account `856108750466`, AdministratorAccess), then switch role
`OrganizationAccountAccessRole` into `649320110863`. Then, in order, until one works:

1. Open the old case and choose **Reopen case** if offered
   (`https://support.console.aws.amazon.com/support/home#/case/?displayId=178562576600649`).
2. SES console → Account dashboard → **Request production access**.
3. Support Center → Create case → Service limit increase → SES Sending Limits, Canada (Central).

Paste the text below. AWS usually answers within a business day and closes an unanswered case after
14 days; watch `jade-lamplight-admin@sieb.net`. On approval, re-check `ProductionAccessEnabled` and
complete one real sign-up on lamplight.click with a never-verified address. If AWS declines again,
answer the specific concern rather than resubmitting, and update this runbook.

Prod `INVITE_SENDER` is still empty, so today only Cognito mail goes out; invites start once
`/dndtools/prod/app-api/invite-sender` is set to a bare address (the Lambda's send policy is
conditioned on `ses:FromAddress`, so a `Name <addr>` form denies every send).

## Resubmission text

```text
Lamplight (https://lamplight.click) is a tabletop RPG campaign-management web and desktop app. This is a resubmission. Our previous request (case 178562576600649) asked for detail on volume, list hygiene, and bounce and complaint handling, and it closed before we replied. The answers are below.

WHAT WE SEND. All mail is transactional, and every message is caused by an action someone just took. There are exactly two kinds. (1) Amazon Cognito account mail: a sign-up verification code or a password-reset code, sent only to the address the person typed into our own form seconds earlier. (2) Campaign invitations: a signed-in user enters one friend's address and we send one message with a join link. Each invitation goes to exactly one address, its link expires after 14 days, the message tells the recipient to ignore it if they weren't expecting it, and an account can hold at most 50 active invitations at a time. Invited addresses are not added to any list. We send no marketing, newsletters, digests, or bulk mail. We never buy, rent, harvest, or scrape addresses. An address enters our system only when its owner types it into our form, or when a user invites that one specific person.

VOLUME. Tens of messages per day. The app is in alpha with a small number of users, and the ceiling is structural: one message per registration, per password reset, per invitation. We are asking to leave the sandbox for reachability, not throughput. The 200/day quota is not the problem; the verified-recipients-only restriction is, because new users never receive their sign-up code.

BOUNCES AND COMPLAINTS. This is deployed in this account now, not planned:
- Configuration set dndtools-prod-email publishes SEND, DELIVERY, BOUNCE, COMPLAINT, REJECT, RENDERING_FAILURE and DELIVERY_DELAY events to CloudWatch, with reputation metrics enabled.
- Both senders use that set: Cognito through its EmailConfiguration.ConfigurationSet, and our invitation Lambda through ConfigurationSetName on every SendEmail call. Nothing in the account sends outside it.
- CloudWatch alarms fire at account bounce rate >= 5% and complaint rate >= 0.1%, and notify an SNS topic that has a confirmed human subscriber.
- Account-level suppression is enabled for BOUNCE and COMPLAINT, so a hard bounce or a complaint stops all further mail to that address automatically.

UNSUBSCRIBE. There is no recurring mail to unsubscribe from. An invitation is declined by ignoring it, account mail stops when the account is deleted, and a complaint permanently suppresses the address.

IDENTITY. The sending domain lamplight.click is verified in this account with Easy DKIM (RSA 2048) and feedback forwarding enabled. The sender is accounts@lamplight.click.
```

## History

- 2026-08-02: bounce and complaint monitoring built, making the original request's claim true.
- 2026-09-04: foundation and identity applied in prod (with the KMS key-policy fix that let alarms
  notify anyone).
- 2026-09-09: evidence re-verified; v0.3.7 promoted to prod. 2026-09-10: case found closed and denied.
