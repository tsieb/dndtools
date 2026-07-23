# Threat Model — Vault Privacy Modes (ADR-026)

Status: current for phase 1 (consent + gates only; both modes ride the E2EE transport).
This document is the review artifact the phase-2 sign-off requires before the Cloud-Enhanced
decision record may flip to `approved: true`.

## Assets

| Asset                                                                     | Sensitivity                                                             |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Vault content (notes, secrets, hidden titles, handouts, maps, characters) | High — the DM's whole campaign, including player-hidden material        |
| Vault keyring (per-epoch AES-256 keys)                                    | Critical — decrypts every cloud artifact for the vault                  |
| Recovery-key file (passphrase-sealed keyring)                             | Critical — equivalent to the keyring once the passphrase is known       |
| Privacy-mode choice + consent record                                      | Medium — integrity matters (a flipped bit must not widen trust)         |
| Allowed server metadata (6 classes)                                       | Low — vault id, participant id, revision, size, content hash, timestamp |

## Trust boundaries by mode

### Private (E2EE) — `private-e2ee`

Unchanged from ADR-015/017. The server (sync-api Lambda, DynamoDB, S3, any AWS operator) sees
ciphertext plus the six allowed metadata classes, enforced by `assertServerSeesOnlyAllowedMetadata`
(SEC-009 AC4) client-side before upload and proven by the core test suites. Key custody is
client-held (OS credential store); compromise of the entire cloud store exposes only ciphertext +
documented metadata (SEC-012 AC3).

**New in ADR-026:** the recovery-key file. Threats and mitigations:

- **T1 — Recovery file theft.** The file alone is useless: the keyring is sealed with AES-256-GCM
  under a key derived from the user's passphrase (PBKDF2-SHA-256, 600,000 iterations, 16-byte random
  salt, fresh IV). Residual risk: a weak passphrase is brute-forceable offline — the UI enforces a
  minimum length and states the risk plainly.
- **T2 — Malicious/corrupted recovery file import.** The plaintext must parse into a
  schema-validated `VaultKeyring` (same strict decode path the OS-store read uses); GCM
  authentication rejects tampering; import never creates custody on a device without an OS
  credential store (fail closed).
- **T3 — Stale-file rollback.** Import merges epochs with existing-local-wins and the current epoch
  advancing to the newer of the two, so an old file cannot silently downgrade an active keyring or
  resurrect a rotated-away epoch key it does not contain.
- **T4 — Export as an exfiltration path.** Export requires the signed-in account, runs only on a
  device that already holds custody, and produces a file the user explicitly saves. It does not
  weaken SEC-004: nothing is logged, synced, or persisted outside the user-chosen file.

### Cloud-Enhanced — `cloud-enhanced` (phase 2; gate closed in phase 1)

The consented boundary: **server-side feature code may read vault content.** Encryption in transit
(TLS) and at rest (SSE-KMS, provider-held keys) protects against storage-media and network
adversaries, **not** against the service operator or a compromise of the service's runtime role —
that residual exposure is precisely what the user consents to, and the consent copy must say so.

Phase-2 obligations (review checklist — all must hold before `approved: true`):

- [ ] Dedicated KMS key per stage with key policy scoped to the sync-api role; CloudTrail on
      decrypt; no wildcard principals.
- [ ] Plaintext path accepts uploads **only** for vaults whose server-side mode registration says
      `cloud-enhanced`; an E2EE vault's envelope is never readable regardless of a client bug
      (server-side mode check, not client honor system).
- [ ] Tenant isolation identical to the E2EE path (Cognito sub scoping on every row/object key).
- [ ] Server-side feature code (RAG indexer, search) runs with read-only scoped access and never
      writes derived plaintext into a broader-scoped store.
- [ ] Mode switch = re-upload migration; the old-mode artifacts are deleted after the new-mode copy
      verifies. Cloud-Enhanced → Private switch copy states that previously-server-readable content
      was readable while the mode was active.
- [ ] Deletion (account or vault) purges plaintext artifacts and derived indexes/embeddings.
- [ ] The `assertServerVisibilityForRecord` relaxation is reachable only via
      `securityDecisionRecordForVaultMode('cloud-enhanced')` and only once the record is approved.

## Consent integrity (both modes, phase 1)

- **T5 — Defaulted or bypassed choice.** The onboarding step has no pre-selected option and cannot
  be skipped (skip/Escape/back are refused until decided). The stored flag's absence or any
  unrecognized value resolves to Private (fail closed) — a cleared localStorage can only ever
  _narrow_ the trust boundary, never widen it.
- **T6 — Flag tampering widens trust.** Phase 1: irrelevant — the Cloud-Enhanced record is
  unapproved, so a tampered flag still cannot open any server-readable path. Phase 2: the server
  registers the mode at consent time and enforces it server-side (see checklist); the device-local
  flag is UX state, not the authority.
- **T7 — Consent theater.** Phase-1 Cloud-Enhanced copy must describe features as upcoming and the
  current transport as still end-to-end encrypted; the Settings surface shows the live mode and the
  gate status truthfully.

## Out of scope

Remote-play P2P transport (separate ECDH/PIN model, ADR-cloud-backend hardening docs), marketplace
content (public by intent, ADR-020), BYO-key AI transport (ADR-021/025 — user's own key, content
sent only on explicit user action to the user's chosen provider).
