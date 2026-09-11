# TURN TLS operations

RC-CLD-1.3 infrastructure preparation. **Production cutover is pending** the integration
handoffs below and an operator deployment. No DNS record, certificate, deployment, live relay
check or production rotation is claimed by the offline tests.

## Enable TLS on a DNS name

`template.yaml` keeps the current `turn:` URI until `PublishTlsUri=true`. Set
`TurnDomainName` and `AcmeEmail` together to add a TLS listener, Let's Encrypt HTTP-01
issuance, twice-daily renewal and TLS certificate/expiry health checks. TLS uses port 5349
by default; `TlsListeningPort=443` is available for networks that permit only that port.
DTLS stays disabled. Coturn 4.11 defaults to TLS 1.2 or newer.

1. Choose the stage's account/profile and public DNS name. Keep the stage's existing
   `samconfig.toml` VPC/subnet parameters. Add explicit `TurnDomainName`, `AcmeEmail`,
   `TlsListeningPort` and `PublishTlsUri=false` to that stage's **complete** parameter list.
   Supplying `AcmeEmail` authorizes Certbot to accept the Let's Encrypt terms.
2. Point a public, unproxied A record at the stack's `TurnEip` output, with a 60-second TTL.
   Do not publish an AAAA record: this stack exposes IPv4 ingress only. Allow Let's Encrypt
   under any existing CAA policy. The name must resolve to this EIP from the public internet.
   For a new stack, create it with TLS parameters empty first so the EIP is available.
3. Deploy the TURN change through the normal operator path (`infra/deploy.sh turn <stage>`).
   The template opens TCP 80 for HTTP-01 and the configured TLS port; UDP relay ports and
   existing 3478 ingress remain. HTTP-01 runs only while Certbot issues or renews a certificate.
   The instance has no DNS-write permission and there is no additional always-on host.
4. **An existing EC2 host does not rerun first-boot user data on a CloudFormation update.**
   In a maintenance window, connect with SSM Session Manager, obtain the updated user data
   through IMDSv2 and run it as root. The script handles secret values internally. Do not use
   shell tracing or paste the generated coturn configuration into logs. For example, on the host:

   ```bash
   sudo bash <<'BOOTSTRAP'
   set -euo pipefail
   umask 077
   TURN_IMDS_TOKEN=$(curl --fail --silent --show-error -X PUT \
     -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' \
     http://169.254.169.254/latest/api/token)
   curl --fail --silent --show-error \
     -H "X-aws-ec2-metadata-token: $TURN_IMDS_TOKEN" \
     http://169.254.169.254/latest/user-data > /run/dndtools-turn-bootstrap.sh
   bash /run/dndtools-turn-bootstrap.sh
   BOOTSTRAP
   ```

   Do this outside a rotation overlap: bootstrapping loads AWSCURRENT only. Normal reboots
   use the existing root-only config and Docker's restart policy. A failed first issuance
   stops bootstrap before starting a new relay; fix DNS/EIP/port 80 and rerun bootstrap.
   CloudFormation outputs alone are not evidence of a healthy service.

5. Confirm `dndtools-turn-certificate.timer` and `dndtools-turn-health.timer` are active.
   Run `sudo systemctl start dndtools-turn-certificate.service`, confirm it succeeds, and
   check that the stage TURN heartbeat is healthy.
   The heartbeat checks the served TLS chain/name, flags unapplied certificate changes, and
   alarms when the certificate file has under seven days remaining. It does not prove relay
   allocation or application delivery.
6. From outside the VPC, run the TLS probe below using the `/turn/tls-uri` SSM parameter
   and derived probe credentials. Complete a Certbot renewal dry run in dev using the same
   pinned container/mounts from `dndtools-turn-certificate`, replacing the `certonly`
   arguments with `renew --cert-name <DNS name> --dry-run`. A dry run must not replace the
   trusted certificate or restart coturn.
7. After the minter and verifier handoffs land, set `PublishTlsUri=true`, deploy TURN,
   then redeploy signaling so its deployment-time SSM reference picks up the base `turns:`
   URI. Run the probe with credentials from signaling, then the targeted acceptance gate:

   ```bash
   env -u TURN_CREDENTIALS_FILE timeout 150 node infra/turn/verify-tls.mjs
   pnpm validate:live --only=cloud:turn
   ```

   The first command needs `WS_URL` and `TOKEN` already set for an entitled account. The
   existing `validate:live` wrapper creates a synthetic dev user and rejects production;
   run it only in dev after its launcher handoff. Production uses the read-only probe with
   an operator-supplied account token. Do not change production's disabled admin-password flow.

Certificate renewal restarts coturn only when the installed certificate hash changes. A restart
drops active allocations: schedule play around the renewal window or accept reconnects on this
single host. Failed renewal does not restart the running relay. A failed TLS check never records
an applied certificate. Renewal/account state is on the encrypted root disk; replacing the host
requires fresh issuance. Investigate renewal failures before the seven-day expiry alarm.

## Rotate the shared secret

Use a maintenance window. The installed `dndtools-turn-refresh-secret [AWSPENDING|AWSPREVIOUS]`
always loads AWSCURRENT and, if explicitly requested, one overlapping stage. It validates all
values before an atomic mode-0600 config replacement, never prints secrets, and never promotes
Secrets Manager versions or restarts a container. **Restart coturn after a changed config.** The
directory bind mount ensures a restart sees the replaced file. Coturn accepts both configured
static secrets; removing a secret from Secrets Manager alone does not revoke a loaded key.

Prerequisites: stage-specific Secrets Manager read/write/version-label privileges for the
operator, SSM access to the TURN host, a working TLS probe, and no other rotation in progress.
Do not retire a key until the signaling cache handoff is deployed: the current
`packages/cloud-fns/src/lib/aws.ts` caches old secrets indefinitely. Redeploying an unchanged
stack is not proof that all warm minters have refreshed.

On the operator workstation, select explicit stage coordinates and keep generated material private:

```bash
set -euo pipefail
umask 077
TURN_PROFILE=dndtools
TURN_REGION=ca-central-1
TURN_STAGE=dev
turn_aws() { aws --profile "$TURN_PROFILE" --region "$TURN_REGION" "$@"; }
TURN_SECRET_ARN=$(turn_aws ssm get-parameter --name "/dndtools/$TURN_STAGE/turn/secret-arn" --query Parameter.Value --output text)
TURN_TLS_URI=$(turn_aws ssm get-parameter --name "/dndtools/$TURN_STAGE/turn/tls-uri" --query Parameter.Value --output text)
TURN_ROTATION_DIR=$(mktemp -d)
trap 'rm -f "$TURN_ROTATION_DIR/candidate.json" "$TURN_ROTATION_DIR/probe.json"; rmdir "$TURN_ROTATION_DIR"' EXIT
TURN_CURRENT_VERSION=$(turn_aws secretsmanager get-secret-value --secret-id "$TURN_SECRET_ARN" --version-stage AWSCURRENT --query VersionId --output text)
TURN_PENDING_VERSION=$(python3 -c 'import uuid; print(uuid.uuid4())')
python3 -c 'import json,secrets; print(json.dumps({"secret":secrets.token_hex(24)}))' > "$TURN_ROTATION_DIR/candidate.json"
# Inspect version LABELS only and stop if another distinct AWSPENDING version exists.
turn_aws secretsmanager list-secret-version-ids --secret-id "$TURN_SECRET_ARN" \
  --query 'Versions[].{Version:VersionId,Stages:VersionStages}'
```

Define a probe-file helper. Only a ten-minute derived credential reaches the file; the shared
secret stays inside the pipe/Python process. The TLS URI is public configuration.

```bash
turn_probe_file() {
  turn_aws secretsmanager get-secret-value --secret-id "$TURN_SECRET_ARN" \
    --version-stage "$1" --query SecretString --output text |
    TURN_PROBE_URI="$TURN_TLS_URI" python3 -c '
import base64, hashlib, hmac, json, os, sys, time
secret = json.load(sys.stdin)["secret"]
username = str(int(time.time()) + 600) + ":rotation-probe"
credential = base64.b64encode(hmac.new(secret.encode(), username.encode(), hashlib.sha1).digest()).decode()
json.dump({"iceServers":[{"urls":os.environ["TURN_PROBE_URI"], "username":username, "credential":credential}]}, sys.stdout)
' > "$TURN_ROTATION_DIR/probe.json"
}
turn_check_probe() {
  env -u WS_URL -u TOKEN TURN_CREDENTIALS_FILE="$TURN_ROTATION_DIR/probe.json" \
    timeout 150 node infra/turn/verify-tls.mjs
}
```

1. **Preload:** write the candidate as AWSPENDING; this must not change AWSCURRENT.

   ```bash
   turn_aws secretsmanager put-secret-value --secret-id "$TURN_SECRET_ARN" \
     --client-request-token "$TURN_PENDING_VERSION" --version-stages AWSPENDING \
     --secret-string "file://$TURN_ROTATION_DIR/candidate.json" --query VersionId --output text
   ```

   On the host run `sudo dndtools-turn-refresh-secret AWSPENDING`, then
   `sudo docker restart --time 10 coturn`. On the workstation run
   `turn_probe_file AWSCURRENT; turn_check_probe` and
   `turn_probe_file AWSPENDING; turn_check_probe`. Both must allocate and exchange data.

2. **Promote:** only after both probes pass, move AWSCURRENT with its expected old version:

   ```bash
   turn_aws secretsmanager update-secret-version-stage --secret-id "$TURN_SECRET_ARN" \
     --version-stage AWSCURRENT --move-to-version-id "$TURN_PENDING_VERSION" \
     --remove-from-version-id "$TURN_CURRENT_VERSION"
   ```

   Secrets Manager moves AWSPREVIOUS to the old version. On the host run
   `sudo dndtools-turn-refresh-secret AWSPREVIOUS`; the identical two-key config needs no
   additional restart. Check AWSCURRENT, AWSPREVIOUS, and **real signaling-issued** credentials
   over TLS. Confirm minters actually refresh to the promoted key.

3. **Drain:** after the bounded cache fix lands, wait at least its maximum cache age plus the
   deployed `TURN_TTL_SECONDS`, maximum mint invocation duration and clock-skew margin.
   The template currently defaults to 3600 seconds but permits other values; inspect the
   deployed setting and do not assume one hour is an upper bound. Record the promotion time,
   cache bound and resulting retirement deadline. Without a proven cache bound, stop here.
4. **Retire:** immediately before removal generate `turn_probe_file AWSPREVIOUS`, and confirm
   that still-unexpired old credential passes. On the host run
   `sudo dndtools-turn-refresh-secret`, then `sudo docker restart --time 10 coturn`.
   The same old probe must now fail while `turn_probe_file AWSCURRENT; turn_check_probe`
   and a real signaling probe pass. A timeout alone is insufficient: confirm current-key
   success and check that the old probe's ten-minute expiry has not elapsed.
   Remove the AWSPENDING label from the promoted version after success. Keep AWSPREVIOUS
   for a bounded rollback window under Secrets Manager access controls; no timer/normal
   reboot loads it into the running relay automatically.

Before promotion, rollback by loading AWSCURRENT only and restarting; remove AWSPENDING from
the candidate. After promotion, first restore the two-key config and verify both probes, then
move AWSCURRENT back with explicit expected version IDs. Keep both keys until the same cache
and credential drain completes. For a compromised key, immediate retirement interrupts old
clients; do not keep overlap merely to avoid downtime.

## Recover a failed host

This is **documented manual failover**, with reconnects and an operator-dependent recovery time.
There is no standby, automatic availability-zone failover or uninterrupted allocation transfer.

1. Confirm the host-status and application-heartbeat alarms, and try SSM plus container/renewal
   service status. A listening socket alone is not recovery; use the external TLS relay probe.
2. If the instance cannot recover, preserve the existing CloudFormation stack, `TurnSharedSecret`
   and `TurnEip` logical resources. Save the EIP allocation ID from `TurnEipAllocationId` and
   the current rotation stage/version IDs (not secret values).
3. Use an operator-reviewed change set that replaces **TurnInstance only**, for example by
   selecting a healthy public subnet in another availability zone of the same VPC/region.
   Check replacement of the EIP association, retention of the EIP and shared secret, and the
   subnet's internet-gateway/NACL relay port access. Do not delete/recreate the stack: that
   would change the secret and EIP and require additional signaling/DNS recovery.
4. CloudFormation associates the existing EIP with the replacement. The A record remains
   unchanged. Wait for association and public reachability before rerunning bootstrap if
   first issuance raced the EIP move. Restore any deliberate two-key overlap with the helper
   before declaring recovery. The new host must obtain a trusted certificate for the same DNS name.
5. Verify TLS identity, current (and overlapping, if applicable) credentials, selected TLS relay
   candidates, bidirectional delivery and the heartbeat. Users reconnect to obtain new allocations.
   Record alarm-to-recovery time in the dev drill. The template normally lets CloudFormation
   delete the old instance after resource replacement, before this external probe runs. If a
   rollback host is needed, explicitly include `UpdateReplacePolicy: Retain` in the reviewed
   operator change set before replacement and plan its later cleanup. Do not assume an old
   instance survives with the default template.

For a region outage the EIP cannot move across regions. A separately provisioned relay, access
to the correct current secret, DNS cutover and certificate issuance are additional operator work;
this single-region procedure does not claim regional disaster recovery.

## Verification and remaining integration

Run offline checks from the repository root:

```bash
timeout 60 node --test --test-concurrency=1 infra/turn/hardening.test.mjs
pnpm test:tooling
```

The owned tests execute the actual embedded secret loader and renewal script with mocked AWS,
Docker and ACME; test real local TLS trust/hostname failures; and reject plaintext/incorrect ICE
paths. They do not run coturn, issue a public certificate or establish a live WebRTC relay.

TODO(APP), owners below, target RC1: these handoffs block TLS cutover/acceptance.

| Owner/file                                                                     | Required work                                                                                     | Risk until complete                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Cloud, `packages/cloud-fns/src/lib/turn.ts` and its tests                      | Emit TCP-only URLs for `turns:`; preserve legacy `turn:` transports                               | TLS credentials include unsupported UDP        |
| Cloud, `packages/cloud-fns/src/lib/aws.ts` and its tests                       | Bound secret caching, test expiry/failure, document the maximum age                               | Old keys can be minted indefinitely            |
| Validation, `infra/verify-turn.sh`                                             | Invoke `infra/turn/verify-tls.mjs` with the already minted WS_URL/TOKEN                           | `validate:live` still runs the legacy probe    |
| Validation, `infra/verify-signaling.mjs`                                       | Recognize `turns:` credentials                                                                    | Signaling gate rejects TLS URLs                |
| Validation, `scripts/validate/cloud-live.ts` and `docs/development/TESTING.md` | Describe trusted TLS, selected relay paths and delivery; preserve dev-only synthetic auth         | Acceptance description is stale                |
| Tooling, `vitest.config.ts` or `package.json`                                  | Wire the owned Node test runner into automatic tooling gates                                      | Wrapper tooling suite alone misses these tests |
| Operator                                                                       | DNS, parameter changes, deploy/bootstrap, renewal/rotation/failover drills and live gate evidence | Production readiness remains unproven          |

The TLS, rotation, and failover decision is [ADR-039](../../docs/adr/039-turn-tls-and-secret-rotation.md).
