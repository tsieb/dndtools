# ADR-015: V2 Cloud Security Model and Key Custody

- Status: Accepted
- Date: 2026-06-05 (Accepted 2026-07-06)
- Deciders: Engineering
- Consulted: Product, Design, Security, QA
- Supersedes: N/A
- Amended by: ADR-017 (concrete cloud E2EE cryptography) — supplies the deferred crypto that makes this
  model truthful; with ADR-017 the release gate opens (`evaluateDndtoolsCloudRelease().canRelease === true`).

> **Acceptance note (2026-07-06):** This ADR was Accepted once ADR-017 delivered the concrete
> cryptography it was waiting on. The AES-256-GCM client-held per-epoch crypto
> (`packages/core/src/security/vault-crypto.ts`) makes the declared model honest, and the populated
> `DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL` / `DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD`
> (`packages/core/src/security/cloud-security-decision.ts`) open the SYNC-017 / SEC-009 gates with no
> call-site change. The "fail-closed until Accepted" posture below is preserved for the DEFAULT
> (undeclared) models; the release-approved constants are the exception this acceptance authorizes. Note
> the file paths below use the pre-ADR-016 `apps/v2/packages/core/...` layout; the live modules are at
> `packages/core/...`.

## Context

The v2 requirements `SEC-009` and `SEC-012` require that, **before** cloud sync or collaboration is
released, the cloud security model declares encryption responsibilities, key custody, server trust
boundaries, credential rotation, and recovery tradeoffs, and that those behaviors are **enforced by
tests**. `SEC-004` requires that auth/refresh/session/cloud/MCP secrets are stored in OS/platform
credential stores and never persisted/logged/synced/exported in plaintext. `SEC-005` requires that
cloud collaboration uses authenticated protected channels with participant identity, revocation,
rate-limited joins, tenant/session isolation, replay protection, cloud-side stream filtering, and
fail-closed parsing for unsupported payload versions.

ADR-014 **defers** the concrete cryptography, transport, and provider choices for v2 (encryption, key
custody, rotation, recovery, participant cache sealing, CRDT/websocket provider). This decision record
exists to satisfy the SEC-009 "declare before release" obligation in a **machine-checkable** form while
that concrete crypto remains deferred: it declares the security model **framework**, the **fail-closed
default posture**, and the **release gate** that stays BLOCKED until an accepted model + satisfied
prerequisites exist. The (since-pruned) remake-review traceability matrix — retained in git history;
current requirements live in `docs/requirements/` — named exactly
this requirement: a decision record + test coverage for encryption, key ownership, server trust
boundaries, rotation, revocation, and recovery before cloud sync/collaboration release.

This is the prose artifact the code references; the Processing-Core modules
(`apps/v2/packages/core/src/security/cloud-security-model.ts`, `key-custody.ts`, `cloud-boundary.ts`,
`secret-custody.ts`) are its machine-checkable mirror.

## Decision

### Status posture (fail closed)

The cloud security model is **Proposed**, not Accepted. The release gate is therefore **BLOCKED**: cloud
sync and cloud collaboration may not be released. The default
`UNDECLARED_CLOUD_SECURITY_DECISION_RECORD` and `UNMET_CLOUD_SYNC_SECURITY_MODEL` keep
`evaluateCloudReleaseGate(...).canRelease === false`. Accepting this ADR (with a concrete crypto
implementation under a follow-up ADR) supplies a complete, approved decision record and a satisfied
security model, which opens the same gate with no call-site change.

### Encryption responsibilities

- **Encryption in transit:** all cloud collaboration uses an authenticated, protected channel
  (`SEC-005`). The transport (deferred, ADR-014) MUST authenticate the channel and the participant
  before any payload crosses it.
- **Encryption at rest:** stored cloud artifacts (operation log, compacted snapshots, asset blobs,
  permission metadata, session state) MUST be encrypted at rest under the release-approved model
  (`SYNC-017` prerequisites `encryption-at-rest` / `encryption-in-transit`).
- **End-to-end encryption (target):** the intended model is **end-to-end-encrypted with client-held
  keys** — the server stores ciphertext and a strictly bounded metadata set. An E2EE claim is only valid
  with `client-held` key custody (a provider-held/escrow custodian contradicts the claim and is rejected
  by `validateCloudSecurityRecord`).

### Key custody

- Keys are **client-held**. The server never holds plaintext content keys.
- Secrets and key material are **device-local only** and live in the OS/platform credential store where
  available, else a fail-closed encrypted-device-local fallback — never vault markdown, exports, logs,
  diagnostics, the operation log, or a sync/player stream in plaintext (`SEC-004`). The SYNC
  storage-classification registry already classifies `auth-refresh-token` / `os-credential-record` as
  device-local; the SEC-004 secret-custody policy proves they never cross a durable/outbound channel.

### Server trust boundary

Under the E2EE model, a server-side code path may read ONLY the explicitly allowed metadata classes:
`vault-id`, `participant-id`, `operation-revision`, `operation-size`, `content-hash`, `timestamp`
(`ALLOWED_SERVER_METADATA_CLASSES`). Note bodies, handout content, hidden titles, and secrets are
ciphertext to the server. If cloud storage is compromised, the exposed plaintext + metadata classes MUST
match this documented boundary (`SEC-012` AC3), proven by `evaluateServerTrustBoundary`.

### Credential and key rotation / revocation

- Credential/session-key rotation is declared (`credentialRotationDeclared`). Rotating the key on a
  participant revocation locks the removed participant out of the new content epoch: their credentials
  cannot decrypt newly delivered/synced content (`SEC-012` AC1, `canDecryptEpoch` /
  `rotateKeyOnRevocation`).
- A revoked participant is denied at the cloud boundary before any payload is generated, their stream is
  torn down, and their queued operations issued at/after the revocation are rejected unless explicitly
  accepted before revocation (`SEC-005` AC5, `evaluateCloudJoinGate` /
  `isQueuedOpAdmissibleAfterRevocation`). Device-local session caches are sealed even offline (the
  existing COLLAB-014 cache-privacy seal).

### Recovery tradeoffs

Recovery is **intentionally unsupported by design at this stage** (`unsupported-by-design` is a valid,
declared tradeoff — not a missing prerequisite). When a recovery flow is later configured, it MUST
restore only the approved scope and never expose another vault, tenant, or participant stream (`SEC-012`
AC2, `partitionRecoveryScope` / `assertRecoveryWithinScope`).

### Cloud boundary controls (SEC-005)

Authenticated joins are rate-limited without leaking session existence; requests are isolated by
tenant/session/stream and rejected before payload generation; unsupported payload versions fail closed
with an upgrade-required diagnostic; replayed nonces are rejected/ignored idempotently. These are
enforced by `apps/v2/packages/core/src/security/cloud-boundary.ts`.

## Consequences

### Positive

- The SEC-009 "declare before release" obligation is satisfied in a machine-checkable, test-enforced form
  while the concrete crypto stays deferred per ADR-014.
- The release gate fails closed: cloud sync/collaboration cannot ship without an accepted model and
  satisfied prerequisites.
- The security model has one declared source of truth (this ADR + its Processing-Core mirror), so the
  policy cannot silently drift from the code.

### Negative

- Cloud sync/collaboration remains unreleasable until this ADR is Accepted alongside a concrete crypto
  implementation ADR — by design, but it blocks the cloud feature until then.
- The key-custody model is logical (epoch-based) until a cipher is chosen; integration with a real KMS /
  client crypto library is future work.

## Rejected Alternatives

| Alternative                                                          | Why Rejected                                                                                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ship cloud sync now with provider-held keys / server-readable model | Contradicts the E2EE target and `SEC-009`/`SEC-012`; a compromised server would expose hidden content. Fails the documented trust boundary.                   |
| Accept this ADR now and unblock cloud release                       | The concrete cryptography/transport is deferred per ADR-014; accepting without an implementation would let cloud release proceed without enforced crypto.     |
| Defer declaring any cloud security model until implementation       | Violates `SEC-009` AC3 (release gating must block when no decision record exists) and leaves the secrets/cloud-collaboration seams without an enforced policy. |

## Migration Impact

- Code/data contracts affected: `apps/v2/packages/core/src/security/{cloud-security-model,key-custody,cloud-boundary,secret-custody}.ts`
  and the SEC-008 regression-gate registry rows for the four boundaries.
- Rollout sequencing: cloud sync/collaboration release stays blocked until this ADR is Accepted with a
  concrete crypto/transport ADR; until then the gate's fail-closed default holds.
- Validation and test changes: the four adversarial test suites
  (`security-secret-custody`, `security-cloud-boundary`, `security-cloud-security-model`,
  `security-key-custody`) plus the SEC-008 coverage meta-test enforce the invariants.
- Backward compatibility: no v1 data migration; no v1 runtime behavior change.

## Rollback Plan

- Trigger conditions: the declared framework proves unworkable when the concrete crypto is selected.
- Technical rollback steps: revise or supersede this ADR; the Processing-Core modules remain pure policy
  and can be adjusted without touching durable data (cloud sync is never enabled).
- Data recovery considerations: none — cloud sync/collaboration is not released, so no cloud data exists.
- Known rollback risks: none beyond re-opening the decision; no user data is affected.

## Verification and Evidence

- Key file paths:
  - `apps/v2/packages/core/src/security/cloud-security-model.ts`
  - `apps/v2/packages/core/src/security/key-custody.ts`
  - `apps/v2/packages/core/src/security/cloud-boundary.ts`
  - `apps/v2/packages/core/src/security/secret-custody.ts`
  - `apps/v2/packages/core/src/security/regression-gates.ts`
- Tests:
  - `apps/v2/packages/core/tests/security-secret-custody.test.ts`
  - `apps/v2/packages/core/tests/security-cloud-boundary.test.ts`
  - `apps/v2/packages/core/tests/security-cloud-security-model.test.ts`
  - `apps/v2/packages/core/tests/security-key-custody.test.ts`
  - `apps/v2/packages/core/tests/sec-regression-gate-coverage.test.ts`
- Operational docs: the SEC secrets-and-cloud-collaboration completion record, formerly under
  `docs/planning/v2/` _(since pruned from the tree; retained in git history)_.
