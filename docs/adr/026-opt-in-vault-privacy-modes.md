# ADR-026: Opt-In Vault Privacy Modes — Private (E2EE) vs Cloud-Enhanced

- Status: Accepted
- Date: 2026-07-23
- Deciders: Engineering
- Consulted: Product, Design, Security, QA
- Supersedes: the "end-to-end encryption is the sole cloud model for vault content" position of
  [ADR-015](./015-v2-cloud-security-model-and-key-custody.md) — E2EE becomes the **Private** mode of a
  two-mode, per-vault, user-chosen model rather than the only possible declaration. ADR-015 otherwise
  remains the governing security model **for Private vaults**, and this ADR also amends its
  "recovery is intentionally unsupported" tradeoff (recovery-key export now exists). Amends
  [ADR-020](./020-app-api-backend-and-simulated-entitlements.md): the class of server-side features a
  paid plan may gate now includes Cloud-Enhanced-mode capabilities; the simulated-checkout carve-out
  itself is unchanged.

## Context

The paid tiers (Hearth/Lantern/Beacon, ADR-020) are fully built but thin as a _cloud product_:
almost every server-side capability worth paying for — managed AI/RAG over the whole campaign,
server-side semantic + full-text search, opening a campaign in any browser without the device-held
vault key, server-generated asset thumbnails/CDN, server-brokered async player views — requires the
server to **read** vault content. ADR-015/017 forbid exactly that: the E2EE invariant is enforced in
code by `assertServerSeesOnlyAllowedMetadata` (SEC-009 AC4) and the fail-closed SYNC-017/SEC-009
gates. The invariant is the single biggest blocker to a viable paid cloud tier, and it was chosen at
a time when no alternative was on the table.

Privacy-conscious DMs are simultaneously a real segment: E2EE must remain fully available, first-class,
and never silently downgraded. The product decision (2026-07-22 roadmap review) is therefore a
**per-vault choice between two modes**, not a replacement of one invariant with another.

Three further findings shape the decision:

1. **The two-mode model already exists in core.** `packages/core/src/security/cloud-security-model.ts`
   declares `EncryptionResponsibility = 'end-to-end-encrypted' | 'server-side-encrypted' | 'undeclared'`
   and `KeyCustodian = 'client-held' | 'provider-held' | …`, with a fail-closed release gate over a
   typed `CloudSecurityDecisionRecord`. The app simply hard-wires the one E2EE record. Adding a mode
   is populating a **second record** and selecting between them — not a new security framework.
2. **There is no forced-consent moment anywhere in the product.** The first-run wizard
   (`apps/gm-react/src/app/Onboarding.tsx`) is entirely skippable and every choice defaults. A trust
   decision of this weight must not default.
3. **Recovery-key export was still pending.** Users will not trust paid cloud backup while "losing
   every device loses the cloud copy" has no counter-measure; a Private-mode vault needs a
   user-managed recovery path before the mode choice is honest.

## Decision

Introduce a **per-vault privacy mode**, chosen explicitly by the user, with two values:

- **Private (E2EE)** — `private-e2ee`. Exactly today's ADR-015/017 model: AES-256-GCM sealed
  client-side, client-held per-epoch keys, server stores ciphertext plus the six allowed metadata
  classes only. Maximum privacy; server-readable features are permanently unavailable to this vault.
- **Cloud-Enhanced** — `cloud-enhanced`. Vault content is encrypted in transit (TLS) and at rest
  under **server-managed KMS keys** (`server-side-encrypted` / `provider-held`), and is readable by
  server-side feature code (AI/RAG, search, keyless browser access, thumbnails, async views). The
  server trust boundary widens from "sees six metadata classes" to "sees vault content"; that is the
  consented point of the mode, not a leak.

### Consent is forced, explicit, and undefaulted

The mode is a **non-skippable first-run decision** with **no pre-selected option**
(`apps/gm-react/src/app/Onboarding.tsx`). Onboarding's skip/Escape/back paths refuse to dismiss the
wizard until the forced decisions are recorded: the privacy mode, the sample-vs-fresh vault choice,
and — when Private is chosen — a typed acknowledgment (mirroring the `AccountDangerPanel`
type-to-confirm pattern) that cloud backups are only recoverable with user-held keys and that the
user is responsible for exporting a recovery key. The choice persists device-locally
(`apps/gm-react/src/cloud/vaultMode.ts`) and is changeable later in Settings behind the same
explicit-consent UX. **An absent/legacy value always behaves as Private** — no vault is ever
server-readable without a recorded, explicit opt-in (fail closed).

### Phased rollout — consent now, server-readable pipeline later

- **Phase 1 (this ADR's implementation):** the mode exists end-to-end on the client (forced
  onboarding, Settings surface, persisted choice, mode-aware core gates), but the **transport for
  both modes remains the E2EE pipeline**. The Cloud-Enhanced decision record ships with
  `approved: false`, so `evaluateCloudEnhancedRelease().canRelease === false` and every
  server-readable code path stays release-blocked by the existing SEC-009 gate machinery. A
  Cloud-Enhanced vault in phase 1 therefore gets strictly **more** privacy than it consented to.
- **Phase 2 (future work, gated on a security review of the threat model):** the sync-api gains a
  mode-aware plaintext ingestion path (SSE-KMS on S3/DynamoDB, scoped IAM, per-vault key context),
  the Cloud-Enhanced record flips to `approved: true`, and Cloud-Enhanced paid features (Campaign
  Copilot RAG, server search, keyless browser access) build on it — each behind the Beacon plan per
  ADR-020's entitlement matrix.

### Mode-aware SEC-009 (the relaxation is scoped, not removed)

`assertServerSeesOnlyAllowedMetadata` remains the unconditional guard for **every E2EE-claimed
record**. Core gains a mode-aware wrapper (`assertServerVisibilityForRecord`) that enforces the
metadata boundary for `end-to-end-encrypted` records and returns without asserting for an
**approved** `server-side-encrypted` record — the machine-checkable expression of "the relaxation
applies only to a vault that consented". Selection helpers
(`securityDecisionRecordForVaultMode` / `securityModelForVaultMode` in
`packages/core/src/security/cloud-security-decision.ts`) are the only sanctioned way to pick a
record from a mode, so no call site can pair a Private vault with the relaxed record.

### Recovery for Private vaults: from "unsupported by design" to "supported (user-managed)"

Core gains passphrase-sealed keyring export/import
(`packages/core/src/security/vault-crypto.ts`: PBKDF2-SHA-256 (600k iterations) → AES-256-GCM over
the serialized `VaultKeyring`), surfaced as **Export/Import recovery key** in Settings
(`apps/gm-react/src/cloud/vaultKey.ts`, `screens/Settings.tsx`). The release-approved Private-mode
records change `recovery: 'unsupported-by-design'` → `'supported'`; the enable-time UI copy changes
from "recovery-key export is not available yet" to instructing the user to export and safeguard the
file. Import merges epochs conservatively (existing local epochs win; the current epoch advances to
the newer of the two) so a stale recovery file can never roll an active keyring backwards.

## Consequences

### Positive

- The entire class of subscription-worthy server-side features stops being architecturally
  impossible; the paid tiers can carry real cloud value (the ADR-020 amendment).
- Privacy is **strengthened** where it matters: E2EE stays first-class on every plan, the choice is
  now explicit instead of implicit, the legacy default is Private, and Private vaults finally get a
  recovery path.
- The relaxation is fail-closed at three independent layers: an unapproved Cloud-Enhanced record
  (phase 1), the mode-selection helpers (no accidental pairing), and the unchanged E2EE assert for
  every E2EE-claimed record.
- Zero server or infra changes in phase 1 — nothing to redeploy, no new attack surface until the
  phase-2 review.

### Negative

- Two trust models mean two of everything downstream: threat model, UI copy, support answers, and
  eventually two sync paths to audit. The compatibility matrix must be kept honest per feature.
- Phase 1 knowingly ships consent UX for capabilities that do not exist yet; Cloud-Enhanced copy
  must say "upcoming" or it is theater (the completion-pass lesson).
- A future mode **switch** is a re-upload migration (ciphertext cannot be re-keyed server-side), and
  Cloud-Enhanced → Private cannot un-ring the bell for content the server already saw; the Settings
  copy states this.
- Forced onboarding adds friction to first run — accepted deliberately for a decision of this
  weight; everything else in onboarding stays skippable.

## Rejected Alternatives

| Alternative                                                      | Why Rejected                                                                                                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Keep E2EE as the sole invariant (status quo)                     | Permanently blocks every server-side premium feature; the paid tiers stay theater. The roadmap review found no viable paid cloud product under it.                       |
| Drop E2EE entirely; server-readable for everyone                 | Betrays the privacy-conscious segment and the local-first brand; contradicts SEC-009's intent. Never considered seriously.                                               |
| Silent default to Cloud-Enhanced (opt-out E2EE)                  | A trust boundary this large must be an informed, explicit choice; product decision is a forced, undefaulted pick. Legacy/absent value must mean Private.                 |
| Per-feature consent prompts instead of a vault mode              | Consent fatigue and an untestable matrix of partial states; a single per-vault mode is auditable and maps cleanly onto the SEC-009 record machinery that already exists. |
| Client-side search/AI over E2EE data instead of any relaxation   | Already exists (BYO-key AI, local search) and keeps working; it cannot deliver keyless browser access, server RAG over large corpora, thumbnails, or async views.        |
| E2EE with user-key-wrapped server compute (homomorphic/enclaves) | Operationally and economically unrealistic at this product's scale; enclaves would still hold plaintext in memory, weakening the honesty of an "E2EE" claim.             |
| Ship phase 2 (server-readable pipeline) in the same change       | Widens a security boundary without its dedicated review; phase 1's `approved: false` record lets consent UX ship while the gate stays closed.                            |

## Migration Impact

- **Core (`@dndtools/core`):** `cloud-security-decision.ts` gains `VaultPrivacyMode`, the
  Cloud-Enhanced record (`approved: false`), mode-selection helpers, and
  `evaluateCloudEnhancedRelease()`; `cloud-security-model.ts` gains `assertServerVisibilityForRecord`;
  `vault-crypto.ts` gains recovery-file seal/open; the Private records' `recovery` flips to
  `'supported'`. All existing call sites keep compiling (additive exports; the SYNC-017 gate shape is
  unchanged).
- **App (`apps/gm-react`):** new `cloud/vaultMode.ts` (persisted mode, fail-closed reader); forced
  onboarding steps; Settings vault-privacy panel + recovery-key export/import; `cloud/vaultKey.ts`
  export/import plumbing. The backup engine (`syncEngine.ts`) is untouched in phase 1 — both modes
  ride the E2EE pipeline.
- **Server/infra:** none in phase 1. Phase 2 requires a sync-api handler + template change, a KMS
  key policy, and a fresh security review before the record's `approved` flips.
- **Tests:** core suites extend `security-cloud-security-model` / `sync-cloud-sync-gate` /
  `security-vault-crypto` coverage (mode selection, unapproved-record blocking, recovery round-trip,
  relaxation scoping); app adds `vaultMode` unit tests and an onboarding forced-consent e2e spec.
- **Back-compat:** existing installs have no stored mode → treated as Private; existing e2e/gate
  bypass flags (`dndtools:react:onboarded`) keep working; no schema-version bumps anywhere.

## Rollback Plan

- **Trigger:** the consent UX proves confusing in practice, or the phase-2 security review rejects
  the server-readable design outright.
- **Steps:** phase 1 is client-only and additive — remove the onboarding step and Settings panel,
  ignore the stored mode flag (its absence already means Private), and mark this ADR Superseded. The
  Cloud-Enhanced record was never approved, so no gate ever opened and no server-readable data path
  ever existed.
- **Data recovery:** none needed in phase 1 (no plaintext ever left a device under this ADR).
  Recovery-key export is independent of the mode decision and would survive a rollback on its own
  merits. After phase 2 ships, rollback additionally requires deleting server-side plaintext copies
  and is materially harder — which is exactly why `approved` stays false until the dedicated review.
- **Known risks:** users who chose Cloud-Enhanced in phase 1 and were told "features are coming"
  would see them cancelled — a product-trust cost, not a data-safety one.

## Verification and Evidence

- Threat model: `docs/security/vault-privacy-modes-threat-model.md` (assets, adversaries, per-mode
  boundary tables, the phase-2 review checklist).
- Core: `packages/core/src/security/cloud-security-decision.ts` (records + mode helpers),
  `packages/core/src/security/cloud-security-model.ts` (`assertServerVisibilityForRecord`),
  `packages/core/src/security/vault-crypto.ts` (recovery-file seal/open).
- Core tests: `packages/core/tests/security-cloud-security-model.test.ts`,
  `packages/core/tests/security-vault-crypto.test.ts`, `packages/core/tests/sync-cloud-sync-gate.test.ts`
  (`pnpm --filter @dndtools/core test`).
- App: `apps/gm-react/src/cloud/vaultMode.ts` (+ `vaultMode.test.ts`),
  `apps/gm-react/src/app/Onboarding.tsx` (forced steps),
  `apps/gm-react/src/screens/Settings.tsx` (vault-privacy panel, recovery export/import),
  `apps/gm-react/src/cloud/vaultKey.ts` (export/import custody plumbing).
- E2E: `apps/gm-react/tests/e2e/onboarding-consent.spec.ts` (forced choice cannot be skipped;
  Private requires the typed acknowledgment; both modes complete; bypass flag still honored).
- Product roadmap this ADR executes: `docs/development/CLOUD_TIER_ROADMAP.md` (P0 #1/#3).
