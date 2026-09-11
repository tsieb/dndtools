# ADR-015: Cloud Security Model and Key Custody

- Status: Accepted (amended by ADR-017; amended by ADR-026)
- Date: 2026-06-05 (Accepted 2026-07-06)
- Deciders: Engineering
- Consulted: Product, Design, Security, QA
- Amended by: ADR-017 (2026-07-06), which supplied the concrete cryptography this model declared
  and thereby opened the release gate. ADR-026 (2026-07-23), which made E2EE the **Private** mode of
  a per-vault two-mode choice rather than the sole cloud model, and flipped recovery from
  `unsupported-by-design` to `supported` through passphrase-sealed recovery-key export. This ADR
  remains the governing model for Private vaults.

## Context

Requirements SEC-009 and SEC-012 demanded that, before cloud sync or collaboration shipped, the
security model declare encryption responsibilities, key custody, the server trust boundary,
rotation, and recovery tradeoffs, enforced by tests. SEC-004 requires secrets in OS credential
stores, never persisted, logged, synced, or exported in plaintext. SEC-005 requires authenticated
channels with participant identity, revocation, rate-limited joins, isolation, replay protection,
and fail-closed parsing. ADR-014 had deferred the cryptography, so this ADR declared the model in a
machine-checkable form with a release gate that stayed closed until an accepted implementation
existed.

## Decision

- **Fail closed by default.** The undeclared decision record and unmet security model keep
  `evaluateCloudReleaseGate(...).canRelease === false`. Accepting this ADR alongside a concrete
  crypto ADR supplies a complete approved record that opens the same gate with no call-site change;
  ADR-017 did that.
- **Encryption.** All cloud collaboration uses an authenticated protected channel. Stored artifacts
  (operation log, snapshots, asset metadata, permission metadata, session state) are encrypted at
  rest. The target is end-to-end encryption with client-held keys; a provider-held custodian
  contradicts an E2EE claim and is rejected by `validateCloudSecurityRecord`.
- **Key custody.** Keys are client-held and device-local in the OS credential store; the server
  never holds plaintext content keys.
- **Server trust boundary.** Under E2EE the server may read only `vault-id`, `participant-id`,
  `operation-revision`, `operation-size`, `content-hash`, and `timestamp`
  (`ALLOWED_SERVER_METADATA_CLASSES`). A storage compromise exposes only that set, proven by
  `evaluateServerTrustBoundary`.
- **Rotation and revocation.** Rotating the key on a participant's revocation locks them out of the
  new epoch (`rotateKeyOnRevocation`); a revoked participant is denied at the cloud boundary before
  any payload is generated, and queued operations issued after revocation are rejected.
- **Recovery** was declared `unsupported-by-design` as a valid tradeoff; ADR-026 supplies it.
- **Cloud boundary controls (SEC-005).** Rate-limited joins that do not leak session existence,
  tenant and session isolation, fail-closed unsupported payload versions, idempotent replay
  rejection.

## Consequences

The "declare before release" obligation is satisfied in tested code with one source of truth (this
ADR and its core mirror), and cloud features could not ship until the model was truthful.

## Rejected alternatives

| Alternative                                             | Why rejected                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Ship with provider-held keys or a server-readable model | Contradicts the E2EE target; a compromised server would expose hidden content.            |
| Accept the ADR before an implementation existed         | Would have let cloud release proceed without enforced crypto.                             |
| Declare nothing until implementation                    | Violates SEC-009's requirement that release gating blocks when no decision record exists. |

## Verification and evidence

- `packages/core/src/security/{cloud-security-model,key-custody,cloud-boundary,secret-custody}.ts`,
  `regression-gates.ts`.
- `packages/core/tests/security-{secret-custody,cloud-boundary,cloud-security-model,key-custody}.test.ts`,
  `sec-regression-gate-coverage.test.ts`.
