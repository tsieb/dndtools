# RC-CLD-6.1 implement journal

## Attempt 1 (2026-10-24)

- Scope: the two owned paths (`packages/cloud-fns/src/sync`, `infra/sync-api/template.yaml`) plus this
  journal. No push, promotion, dispatcher state edits or extra agents. Base `loop/rc` = `3cbf4b7cc`.
- Design: one `mode#registration` row per vault in the sync table, inside the existing
  `${sub}#${vaultId}` partition, written by `PUT /vaults/{vaultId}/mode` and read by
  `GET /vaults/{vaultId}/mode` (`sync/vault-mode.ts`, wired in `sync/handler.ts`). The row carries
  `ownerSub`, `mode`, `consentVersion` (Cloud-Enhanced only, server allow-list `ADR-042-phase-1`),
  server-set `consentedAt`, `generation`, `schemaVersion`.
  - Absent row reads as Private (`registered: false`). A failed read, a malformed row, a row whose
    `ownerSub` differs from the token's sub, or a key component that could alias a partition is
    `VaultModeUnavailable`, answered 503, never a default mode.
  - `requireServerReadableVault(owner)` is the gate RC-CLD-6.2/6.4 must call. Its only input is the
    authenticated owner. It passes the server registration and the imported
    `DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD` to `isPlaintextUploadPermitted`, and returns
    `generation` so 6.2 can fence a write against a concurrent mode change. Under the shipped
    (unapproved) record it refuses every vault, so `serverReadable` is always false today.
  - Consent writes are conditional on the generation read (409 on a lost race), idempotent on replay
    (keep the first `consentedAt`), refused while the vault's usage marker is deleting/deleted, and
    re-checked after the write so a purge that started mid-request either lists the row or the
    writer deletes it. `DELETE /vaults/{vaultId}` already purges every non-usage row, registration
    included.
  - Request bodies naming owner, generation, timestamps, vault or `serverReadable` are 400. The
    ciphertext routes already reject a `mode` field (exact-key bodies); headers, query and token
    claims are never read for a mode (CORS also allows only `authorization`/`content-type`).
- Not used: `sanctionSecurityDecisionRecord`. The core containment scan pins the test files allowed
  to call it and `packages/core` is not owned, so `vault-mode.test.ts` simulates the post-review
  posture by partially mocking `isPlaintextUploadPermitted` (opens only for `cloud-enhanced` with
  the imported record instance).
- Template: `GetVaultMode`/`PutVaultMode` HttpApi events on SyncFn, table comment updated. Existing
  `DynamoDBCrudPolicy` on SyncOpsTable covers the row; no IAM change. Not deployed.

### Validation

- `vitest -c vitest.cloud.config.ts packages/cloud-fns/src`: 16 files, 363 tests passed
  (`vault-mode.test.ts` new, `handler.test.ts` +11 route tests). Full `pnpm test:cloud` earlier:
  47 files / 626 passed.
- Mutation checks on `vault-mode.ts`, each reverted: absent row → Cloud-Enhanced (7 fail), read
  failure → Private default (4 fail), owner re-check removed (2 fail), gate fed `'cloud-enhanced'`
  instead of the registration (3 fail).
- `pnpm --filter @dndtools/cloud-fns typecheck` and `build`, `eslint packages/cloud-fns/src/sync`,
  prettier, `sam validate --lint` on the template: clean. Core
  `security-vault-privacy-modes` + `security-cloud-security-model` tests: 40 passed (sanction scan
  unchanged). `tests/unit/infra-retention.test.ts`: passed.
- The handler test's fake `putItemConditional` stored `undefined` attributes as the string
  `"undefined"`; it now omits them like the real `toItem`. No existing test depended on it.

### Left for other stories (not in this claim)

- Client wiring: `apps/gm-react/src/cloud/vaultMode.ts` / `SyncPrivacy.tsx` do not call
  `PUT /mode` yet. That is RC-CLD-6.3's handoff (connect consent to server registration, re-consent
  rule; phase-1 consent is stored with its version so 6.3 can tell it apart).
- Threat-model evidence lines for the "server-side mode registration" and tenant-isolation items
  (`docs/security/vault-privacy-modes-threat-model.md`) still describe no registration store; that
  file belongs to RC-CLD-6.5.
- The Copilot indexer's `authorize` port can now be backed by `readVaultModeRegistration`; the
  adapter is RC-CLD-6.4's.
