# ADR-RC-CLD-1.3: Add opt-in TURN TLS and staged secret rotation

- Status: Accepted
- Date: 2026-09-08
- Deciders: Engineering (RC loop)
- Supersedes: N/A

## Context

`template.yaml` runs one coturn host and publishes a plaintext TURN URI. The public DNS zone
and production deploy are operator responsibilities. Existing credential minting and validation
are outside this story's `infra/turn/*` ownership; both need changes before TLS publication.
The warm Lambda secret cache also prevents safe time-bounded retirement today.

## Decision

Add an optional DNS identity, Let's Encrypt HTTP-01 issuance and renewal on the host, and a
separate TLS probe endpoint. Keep legacy publication by default and require an explicit
`PublishTlsUri=true` cutover after the minter handoff. Use a digest-pinned, ARM64-compatible
Certbot container, reusing Docker. No cross-account DNS write privileges are granted.

Keep Secrets Manager's existing JSON `secret` contract. The host's explicit refresh command
atomically writes AWSCURRENT plus at most one requested overlapping version stage to a private
coturn config. Restart to apply static secrets. No automatic reader silently restores old keys.
Use documented manual host replacement with the same EIP and secret for failover.

The pinned coturn image defaults to `nobody:nogroup`. Select container UID 0 explicitly so the
existing root-only secret file and ACME private keys are readable; drop all capabilities except
NET_BIND_SERVICE (needed for optional port 443), deny privilege elevation, and mount config and
certificates read-only. Mount the config directory so atomic replacement is visible on restart.

## Consequences

TLS gets a publicly trusted DNS identity without another always-on service. Existing deployments
remain compatible until cutover. Certificate restarts, rotation application and host replacement
interrupt allocations; clients reconnect. Port 80 and working public DNS remain renewal
dependencies. The seven-day expiry alarm provides advance notice; the live probe verifies the
actual trusted TLS connection, relay selection and bidirectional data delivery.

No claim of automatic high availability or completed production rollout follows from this code.
Root inside the container is a deliberate file-access tradeoff, bounded by capabilities and
read-only mounts. A future non-root deployment should explicitly provision a private shared group
for the certificate/config files and test the pinned image's UID/GID contract.

## Rejected alternatives

| Alternative                                       | Reason                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Immediate `turns:` publication                    | Existing minter appends an unsupported UDP transport; current live gate rejects TLS |
| Cross-account Route53 DNS-01 automation           | Requires additional DNS/account permissions outside the owned stack                 |
| Additional TLS load balancer or always-on standby | Adds resources; this story permits documented manual failover                       |
| Copy the web edge certificate into coturn         | Its CloudFront certificate lifecycle is a separate deployment contract              |
| Assume credential TTL drains every old secret     | The current minter caches secrets indefinitely                                      |
| SIGHUP to apply static secrets                    | The documented signal behavior is log reset, not a general config reload            |

## Migration and rollback

Follow [README.md](README.md) for the two-step DNS/bootstrap rollout, minter/live-verifier
handoffs, explicit TLS publication, staged rotation and manual failover. Existing EC2 user data
must be applied deliberately; a CloudFormation update alone does not rerun first-boot scripts.
Before TLS publication, the legacy URI is unchanged. To revert a failed cutover, set
`PublishTlsUri=false` and redeploy signaling; record that TLS acceptance is withdrawn. Secret
rollback must preserve two-key overlap until all minters and credentials drain.

## Verification and evidence

- `hardening.test.mjs`: executes embedded secret rendering/rotation and certificate renewal
  logic, exercises real local TLS trust/hostname validation, rejects wrong ICE relay paths.
- `verify-tls.mjs`: trusted DNS TLS preflight and relay-only Chromium peers, checking both
  selected candidates use TLS and exchanging an echoed message.
- `template.yaml`: bounded Docker logs, encrypted disk, TLS/expiry heartbeat, immutable images,
  optional public TLS/HTTP-01 ingress and explicit TLS publication.
- Production acceptance remains the operator's TLS-only `validate:live` run after integration.

Upstream contracts checked for this change:

- [Coturn configuration at the pinned image revision](https://github.com/coturn/coturn/blob/78c1f7c7cec328be75fd7dbeb5613ebe3c73ba9a/examples/etc/turnserver.conf)
  documents TLS listeners, certificate paths and the default protocol minimum.
- [Coturn server options](https://github.com/coturn/coturn/blob/master/README.turnserver)
  document multiple static shared secrets and the restart-sensitive configuration.
- [Certbot Docker installation](https://eff-certbot.readthedocs.io/en/stable/install.html#running-with-docker)
  and [renewal behavior](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates)
  describe standalone HTTP-01, persistent certificate storage and renewal/dry-run behavior.
