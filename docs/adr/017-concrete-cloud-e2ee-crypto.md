# ADR-017: Concrete Cloud E2EE Cryptography (Client-Held AES-256-GCM per Key Epoch)

- Status: Accepted
- Date: 2026-07-06
- Deciders: Engineering
- Consulted: Product, Design, Security, QA
- Supersedes: N/A (implements the concrete crypto deferred by ADR-014 and framed by ADR-015)
- Amends: ADR-015 — supplies the concrete cryptography that ADR-015 declared but left unspecified.

## Context

ADR-015 declared the cloud security **model** (E2EE, client-held keys, bounded server metadata,
rotation on revocation, recovery tradeoffs) in a machine-checkable, fail-closed form, and ADR-014
**deferred** the concrete cryptography. Both the SYNC-017 cloud-sync enablement gate
(`packages/core/src/sync/cloud-sync-gate.ts`) and the SEC-009 cloud-release gate
(`packages/core/src/security/cloud-security-model.ts`) were built to stay BLOCKED until a real crypto
implementation makes the declared model TRUTHFUL — at which point the same gates open with no call-site
change.

The cloud backend (Cognito accounts + internet remote play) is now deployed, and cloud sync/backup is
the next capability. That requires the deferred cryptography to actually exist so the declared model is
honest and the gate may legitimately open. This ADR chooses and records that concrete crypto.

## Decision

### Cipher and envelope

- **AES-256-GCM** authenticated encryption for every cloud-bound artifact (operation values, snapshots,
  asset blobs). GCM provides confidentiality **and** integrity (the 128-bit auth tag detects tampering
  and wrong-key decryption, both of which fail closed).
- A fresh random **96-bit IV** per encryption (never reused under a key).
- Implemented with the standard **WebCrypto `SubtleCrypto`** API on `globalThis.crypto`, which is
  present in browsers, the Node 20 Lambda runtime, and the test runner — so the identical code encrypts
  on every client and the envelope shape is shared with the server, which only ever stores/relays
  ciphertext and holds **no** key material.
- The sealed **`EncryptedEnvelope`** (`packages/core/src/security/vault-crypto.ts`) carries only
  `{ v, alg, epoch, iv, ct, contentHash }`, all **base64url** (no `/`, `+`, `=`, or `.`) so the
  diagnostics redaction guard never mistakes ciphertext for a path/JWT/secret. There is no plaintext in
  the envelope.

### Key custody (client-held)

- Content keys are **client-held**: raw 256-bit keys held only in the OS/platform credential store
  (Electron `safeStorage`, via `durableSecretStore`), never in IndexedDB, localStorage, the operation
  log, exports, diagnostics, or any sync/player stream (`SEC-004`). The server never receives them.
- **Device capability gate (fail closed):** a device without an OS credential store (the web build) has
  no durable place to hold the client key, so cloud sync is **not offered** there — a key that cannot be
  durably held would make cloud data unrecoverable under the recovery model below. Encryption still works
  in-session; only durable cloud sync is gated off (`apps/gm-react/src/cloud/{vaultKey,cloudSync}.ts`).

### Key epochs and rotation on revocation

- Each **key epoch** has its own **independent random** 256-bit content key, held in a client-side
  `VaultKeyring`. A participant only ever receives the epoch keys they are authorized for.
- On revocation the keyring **rotates** to a fresh random key at a new epoch (`rotateVaultKeyring`,
  composing the SEC-012 `rotateKeyOnRevocation` epoch math). Because epoch keys are independent (not
  derived from a shared root), a revoked party who holds only old-epoch keys **cannot** derive or
  decrypt the new epoch — the lockout is cryptographic, not merely policy-enforced (`SEC-012` AC1).

### Server trust boundary

- Under this E2EE model a server-side path may read ONLY the allowed metadata classes (`vault-id`,
  `participant-id`, `operation-revision`, `operation-size`, `content-hash`, `timestamp`). The envelope
  contributes only `content-hash` (of the ciphertext) and `operation-size`; everything else is
  ciphertext. `envelopeAsStoredArtifact` / `envelopeServerVisibleFields` bridge an envelope to the
  existing `assertCompromiseMatchesTrustBoundary` / `assertServerSeesOnlyAllowedMetadata` guards, so a
  cloud-publish path (and the tests) prove the boundary holds.

### Recovery tradeoff

- Recovery is **unsupported-by-design** (a valid declared tradeoff per SYNC-017 AC3). There is no key
  escrow: losing every device and its local key means the encrypted **cloud** copy is unrecoverable;
  **local** vault data is unaffected. The app surfaces this limitation at enable time. A future ADR may
  add an optional user-held recovery passphrase (passphrase-wrapped key) without changing the envelope
  format or the gate.

### Release-approved model constants

`packages/core/src/security/cloud-security-decision.ts` publishes the populated
`DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL` (all prerequisites met, `recovery: 'unsupported-by-design'`) and
`DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD` (`encryption: 'end-to-end-encrypted'`, `keyCustodian:
'client-held'`, complete + approved). Supplying these to the existing gates yields `canEnable === true`
and `canRelease === true`. This is the "supplies a complete approved record + satisfied model" event
ADR-015 named as its acceptance trigger.

## Consequences

### Positive

- The deferred crypto is real and standard (AES-256-GCM / WebCrypto); the declared cloud security model
  is now truthful and the SYNC-017 / SEC-009 gates open legitimately.
- The server is cryptographically untrusted: it stores ciphertext + a bounded metadata set only.
- Rotation on revocation is a cryptographic lockout, proven by tests.

### Negative

- No cloud recovery if all devices/keys are lost (accepted, declared limitation).
- Durable cloud sync requires an OS credential store, so the web build cannot enable it (desktop only for
  now).
- Encrypting the operation `value` means server-side idempotency/dedup must key on server-visible
  metadata (content-hash, revision), not on decrypted payload contents — a Stage-3 sync-engine
  requirement.

## Rejected Alternatives

| Alternative                                          | Why Rejected                                                                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Provider-held keys / server-side encryption          | Contradicts the E2EE target and `SEC-009`/`SEC-012`; a compromised server would expose hidden content. Rejected by `validateCloudSecurityRecord`. |
| Single shared key derived per-epoch via HKDF of a root | A holder of the root could derive every epoch — no cryptographic revocation. Independent per-epoch random keys give real forward lockout. |
| Ship a user recovery passphrase now                  | More surface (passphrase-strength UX, escrow blob) for a pre-revenue feature; unsupported-by-design is a valid declared tradeoff and can be upgraded later without rework. |

## Migration Impact

- New code: `packages/core/src/security/{vault-crypto,cloud-security-decision}.ts` and
  `apps/gm-react/src/cloud/{vaultKey,cloudSync}.ts`. No change to the existing gate/policy call sites —
  they consume the newly-populated model constants.
- The SyncOperation shape and the Stage-3 sync engine (which encrypts the op-log tail before upload and
  lifts server-visible metadata out of the encrypted value) are follow-up work; this ADR delivers the
  crypto primitive + custody + declared model they build on.

## Rollback Plan

- Trigger conditions: a defect in the crypto primitive or custody path is found before cloud sync ships.
- Technical rollback steps: revert the populated model constants to the fail-closed defaults
  (`UNMET_CLOUD_SYNC_SECURITY_MODEL` / `UNDECLARED_CLOUD_SECURITY_DECISION_RECORD`); the gate returns to
  BLOCKED with no other call-site change. Cloud sync is off by default and opt-in, so no cloud data is at
  risk.
- Data recovery considerations: none — cloud sync is not yet wired to upload; no cloud data exists.

## Verification and Evidence

- Key file paths:
  - `packages/core/src/security/vault-crypto.ts`
  - `packages/core/src/security/cloud-security-decision.ts`
  - `apps/gm-react/src/cloud/vaultKey.ts`, `apps/gm-react/src/cloud/cloudSync.ts`
- Tests:
  - `packages/core/tests/security-vault-crypto.test.ts` (AES-GCM round-trip, tamper rejection, envelope
    opacity vs the trust-boundary/server-visibility guards, cryptographic rotation lockout, and that the
    release-approved model opens the SYNC-017 / SEC-009 gates)
  - the existing `security-cloud-security-model`, `security-key-custody`, `sync-cloud-sync-gate`, and
    `sec-regression-gate-coverage` suites remain green (defaults still fail closed).
