# Cloud security audit — dndtools (2026-07-06)

Scope: **all** cloud work on `feat/cloud-backend` — infrastructure (SAM/CloudFormation),
server Lambdas (`packages/cloud-fns`), and client (`apps/gm-react` cloud/auth/transport +
Electron shell). Conducted with three parallel auditors (IaC, Lambda code, client), then
mitigated. Nothing was treated as out of scope.

**Verification after mitigation:** cloud test suite 87/87 (incl. new ECDH round-trip +
authorization regression tests), `gm-react` typecheck, `cloud-fns` esbuild build, eslint,
boundary lint, and CloudFormation template parse — all green.

> ⚠️ **The infra fixes only take effect on `sam deploy`.** Redeploy the `foundation`,
> `turn`, `signaling`, and `identity` stacks to apply them.

---

## Fixed

### Critical / High

| # | Finding | File(s) | Fix |
|---|---------|---------|-----|
| 1 | **CI deploy role = account takeover.** PowerUser + `iam:PassRole Resource:'*'` (no condition) is the textbook escalation-to-admin combo. | `infra/foundation/template.yaml` | `PassRole` constrained to `dndtools-*` roles + `iam:PassedToService`; role/policy/instance-profile management scoped to the `${ProjectName}-*` namespace; **permissions boundary** added to the CI role and every role it creates, hard-denying IAM-user / Organizations / account-takeover actions. |
| 2 | **coturn shared secret leaked.** `set -x` wrote the secret in cleartext to `/var/log/turn-bootstrap.log`; secret also passed as a CLI arg (`ps`, `docker inspect`). | `infra/turn/template.yaml` | Removed xtrace; secret now lives only in a `chmod 600` `turnserver.conf` mounted read-only (off the command line). |
| 3 | **coturn open relay / SSRF.** No `denied-peer-ip`, so a client with valid TURN creds could relay into the VPC's private ranges and the `169.254.169.254` metadata endpoint. | `infra/turn/template.yaml` | Added `denied-peer-ip` for RFC1918, loopback, CGNAT, link-local (incl. metadata), and IPv6 ULA/link-local; added `total-quota`/`user-quota`/`max-bps` bandwidth caps. |
| 4 | **`offer` relay had no authorization.** Any authenticated user could inject a forged offer into an arbitrary connection (even cross-session) by naming its `connectionId`. Sibling `answer` route was already safe. | `packages/cloud-fns/src/signaling/handler.ts` | Only the actual host of the session the target is joining may relay it an offer (server-side resolution mirrors the `answer` path). |
| 5 | **Remote-play session key relayed in cleartext.** The offer code embeds the raw AES-GCM session key + SDP. LAN/QR exchange it out-of-band, but the cloud bridge relayed the same code through the signaling server, which could then decrypt all remote-play traffic — contradicting the "untrusted relay" model. | `apps/gm-react/src/net/cloudCrypto.ts` (new), `net/cloudBridge.ts`, `packages/cloud-fns/src/signaling/handler.ts` | Added ephemeral **ECDH (P-256) → AES-GCM** wrap. The cloud bridge now seals every relayed offer/answer under a per-pairing ECDH-derived key; the relay only ever sees each side's ephemeral **public** key + ciphertext. Transparent to `SessionHost`/`SessionClient` (the `DiscoveryBridge` contract is unchanged); the handler just forwards the two public keys. |

### Medium / Low

- **No API throttling; 24h TURN TTL** (`infra/signaling`) → per-connection throttling added; TURN credential TTL cut 24h → 1h. Combined with #3's coturn quotas this bounds TURN-cred farming / relay abuse.
- **`ADMIN_USER_PASSWORD_AUTH` enabled in prod** (`infra/identity`) → now dev-only via an `IsDev` condition (browsers always use SRP/PKCE). `PreventUserExistenceErrors` confirmed already `ENABLED`.
- **`$connect`/`$default` could degrade to an empty `sub`** (`signaling/handler.ts`) → both now fail closed; the rate-limit / ownership key derives only from the authenticated `sub`, never a spoofable connection id.
- **`answer` forwarded a client `reqId`** → now always the sender's own connection id (can't cross-wire the host's pending-handshake map). Relayed/stored strings are size-capped.
- **sync handler leaked raw AWS SDK error text + unbounded push** (`sync/handler.ts`) → client-safe `BadRequest` messages vs. logged generic `500`s; caps on ops-per-push and ciphertext/snapshot size.
- **Electron shell** (`electron/main.cjs`) → deny-all device-permission handler; `webviewTag:false`; secure-store IPC restricted to the `cog:`/`vaultkey:` namespaces, `keys()` filtered, and `remove`/`keys` gated on encryption availability.
- **Auth modal** (`cloud/AuthModal.tsx`) → sign-in failures collapse to one generic message (enumeration defense-in-depth).

---

## Verified good (no change needed)

- **sync-api tenant isolation** — every S3/DynamoDB key is namespaced by the authenticated Cognito `sub` (`pk = sub#vaultId`), taken only from the verified JWT, so a client cannot escape its own namespace regardless of the `vaultId` it passes (S3 does not normalize `..`).
- **Both JWT authorizers** verify issuer + audience/client-id + signature + expiry and **fail closed**; the WS authorizer pins `tokenUse:'id'`.
- **DynamoDB marshalling** is typed (`{S}`/`{N}`) with constant key names — no NoSQL/expression injection or prototype-pollution path.
- **TURN HMAC secret** is fetched from Secrets Manager, cached, and never logged or returned beyond the derived time-boxed credential.
- **Client secret custody (SEC-004)** — tokens and the vault keyring live in memory + OS-encrypted `safeStorage` only; the web path persists nothing; Electron uses `contextIsolation`/`sandbox`/`nodeIntegration:false` and treats Linux `basic_text` safeStorage as unavailable (fail closed).
- **S3 ciphertext bucket** — public access fully blocked, `BucketOwnerEnforced`, SSE, versioned, lifecycle-expired.

---

## Residual / recommended (not forced — needs a deploy or a product decision)

1. **Redeploy the hardened infra stacks** — the template fixes above are inert until `sam deploy`.
2. ~~**Active-MITM SAS (follow-up to #5)**~~ — **RESOLVED 2026-07-07** by the join-PIN work below: the PIN is folded into the HKDF that derives the pairing key, so a relay that swaps both public keys still cannot derive the wrap key (it never learns the PIN and cannot compute the ECDH secret). See the follow-up section.
3. **CSP `connect-src`** is a `*.execute-api.<region>` wildcard (any AWS account's API GW in-region). Pin to the specific signaling/sync API IDs at build time. Also add an equivalent CSP **response header** to the Stage 4 web host (the Electron CSP doesn't cover the web deployment).
4. ~~**`browse` returns every live session globally**~~ — **RESOLVED 2026-07-07** (see follow-up): browse is now scoped to the caller's own rooms; strangers get an empty roster.
5. **Open self-signup** — anyone can create an account (a valid principal against signaling/sync). Reasonable for a hobby tool where players self-serve, but consider an invite allow-list (`PreSignUp` trigger) and/or Cognito threat protection (`AdvancedSecurityMode`, paid) if abuse appears.
6. **Observability / durability** — set Lambda CloudWatch log retention on both serverless stacks; enable PITR on `SyncOpsTable`; pin the `coturn/coturn` image to a digest; consider `turns:` (TLS) once a TURN hostname/cert exists.

---

## Follow-up: cloud remote-play join authorization (2026-07-07)

A subsequent `/security-review` of the same branch surfaced one HIGH-confidence finding not
covered above: **the cloud remote-play path admitted any authenticated user with no invite
credential.** Because open self-signup makes "any authenticated user" ≈ "anyone", an attacker
could `browse` every live session globally, `join` a stranger's session by id, and be
auto-admitted to the first open player/observer seat — receiving that seat's session key and
live view-model stream. The ECDH wrap (fix #5 above) protects the code from the relay but
authenticates nothing about the joiner, so it did not restore the "possession of the code is
the credential" trust model that LAN/QR gets for free from out-of-band exchange.

**Fix (client-only crypto + one server scoping change):**

| Part | File(s) | Change |
|------|---------|--------|
| **Join PIN as the admission credential** | `apps/gm-react/src/net/cloudCrypto.ts` | The pairing key is now `ECDH → HKDF-SHA256(salt = sha256(PIN)) → AES-256-GCM`. A per-session 128-bit PIN is minted by the host and folded into the salt. A joiner without the PIN derives a different key and **cannot open the sealed offer** (which carries the session key) nor complete the handshake — cryptographic admission, not a checkable flag. The PIN **never transits the relay**, so the relay can neither read it nor brute-force it offline (it lacks the ECDH private halves). This also closes residual #2 (active key-substitution MITM). |
| **PIN plumbed through the bridge/host/UI** | `net/cloudBridge.ts`, `net/discovery.ts`, `net/SessionContext.tsx`, `net/SessionPanel.tsx` | Host mints the PIN on "Host online" and surfaces a single **online join code** (`base64url({sessionId, pin})`) to share out-of-band (copy). Joiner pastes that code; it decodes to id + PIN. LAN bridge ignores the optional PIN (proximity is its credential). |
| **Scoped browse** | `packages/cloud-fns/src/signaling/handler.ts` | `browse` no longer returns a global roster — it filters to the caller's **own** rooms (`r.sub === sub`), so a stranger cannot enumerate anyone's live sessions. Online discovery is now exclusively via the out-of-band join code ("require exact sessionId"). Closes residual #4. |

**Verification:** cloud suite **88/88** — includes a new *"a wrong join PIN cannot open the
relayed offer (no admission)"* test and a rewritten *"browse is scoped to the caller"*
cross-tenant-isolation test. gm-react + cloud-fns typecheck, cloud-fns Lambda bundle, and the
`gm-react` app build all green.

> ⚠️ **Deploy note:** the PIN change is client-only (the relay just forwards opaque public keys
> + ciphertext, unchanged). The scoped-`browse` change requires a redeploy of the **signaling**
> stack (`sam deploy`) to take effect server-side.
