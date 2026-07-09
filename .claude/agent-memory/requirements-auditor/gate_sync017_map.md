---
name: gate-sync017-map
description: SYNC-017/SEC-009/SEC-012 cloud-sync gate — file/symbol map, call sites, and current OPEN/CLOSED state
metadata:
  type: project
---

# SYNC-017 cloud-sync enablement gate — surface map

Pure-policy gate: `packages/core/src/sync/cloud-sync-gate.ts` — `evaluateCloudSyncGate({securityModel, currentlyEnabled})`. Fail-closed, default model `UNMET_CLOUD_SYNC_SECURITY_MODEL` (all flags false) ⇒ canEnable=false. Five prereqs: encryption-at-rest, encryption-in-transit, key-custody, key-rotation, key-recovery.

**What supplies the satisfied checklist at runtime:** `packages/core/src/security/cloud-security-decision.ts` exports `DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL` (all flags true, recovery `unsupported-by-design`) + `DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD`. Runtime call site = `apps/gm-react/src/cloud/cloudSync.ts:53` (`getCloudSyncStatus`). Adds a DEVICE custody check (`vaultKeyManager.custodyAvailable()` → OS keychain; false on web).

**Real crypto behind the declaration** (ADR-017, not just asserted): `packages/core/src/security/vault-crypto.ts` — AES-256-GCM via WebCrypto SubtleCrypto; `encryptForKeyring`/`decryptFromKeyring`; `rotateVaultKeyring` composes SEC-012 `rotateKeyOnRevocation` (epoch math in `key-custody.ts`) + mints fresh random epoch key. Wired: `apps/gm-react/src/cloud/vaultKey.ts` (encrypt/decrypt/rotate), `syncEngine.ts:144` asserts server-sees-only-metadata, `packages/cloud-fns/src/sync/handler.ts` server-side enforces same record.

**key-recovery** = `unsupported-by-design` declared-limitation escape hatch (valid per AC3), surfaced to user. `key-custody.ts` `partitionRecoveryScope` is scope-isolation for a hypothetical recovery, NOT an actual recovery mode. No key escrow exists by design.

**State (audited 2026-07-09):** pure SYNC-017 gate is OPEN — `canEnable=true` under the release-approved model. Runtime `enabled` still false by default (opt-in) and `canEnableOnThisDevice` false on web (needs Electron OS keychain). Tests: `packages/core/tests/{sync-cloud-sync-gate,security-vault-crypto,security-key-custody,security-cloud-security-model}.test.ts` — 44 pass. Rotation lockout is REAL crypto (vault-crypto test L100-119: revoked keyring `rejects(/no key for epoch/)`). Run with `npx vitest run` from `packages/core` (root `pnpm vitest` finds no files — config is per-package, include `tests/unit/**`? no — use explicit file paths).
