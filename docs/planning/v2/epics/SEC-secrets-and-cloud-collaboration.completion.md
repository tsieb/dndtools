# Completion Evidence: SEC-secrets-and-cloud-collaboration

- Epic: `SEC-secrets-and-cloud-collaboration` — SEC: Secrets and cloud collaboration
- Requirements: SEC-004, SEC-005, SEC-009, SEC-012
- Git branch: `epic/SEC-secrets-and-cloud-collaboration` (chained off the prior tip `dfe0240`)
- Workpack status: `complete`

## Summary

This branch adds four small, pure, fail-closed Processing-Core SECURITY POLICY modules for secrets and cloud
collaboration, plus their adversarial regression coverage, registers all four new invariants in the SEC-008
regression-gate registry, and records the SEC-009 prose decision record (ADR-015, Proposed). It COMPOSES the
existing infrastructure and adds NO parallel secrets store, NO crypto framework, NO v1 runtime import, NO new
durable-mutation path, and NO change to any route, layout, Svelte component, or canvas runtime. Per ADR-014
the real transport/crypto is DEFERRED; this epic delivers the fail-closed POLICY + the seams + the regression
gates those deferred implementations plug into.

Composed seams (reused, never duplicated):

- the diagnostics REDACTION guard (`diagnostics/redaction.ts` — `containsSensitiveData` / `redactValue`),
  the same scrubber that proves support bundles, MCP responses, and content exports clean;
- the SYNC STORAGE-CLASSIFICATION registry (`sync/storage-classification.ts`), which already classifies
  `auth-refresh-token` / `os-credential-record` as `device-local`;
- the SYNC-017 cloud-sync enablement gate (`sync/cloud-sync-gate.ts`) and SYNC-011 replay validation
  (`sync/replay-validation.ts` / `operation-log.ts`);
- the COLLAB-001 session-join policy (`collab/session-join.ts`) and COLLAB-014 cache-privacy seal
  (`collab/cache-privacy.ts`), which explicitly deferred real key custody / transport auth;
- the SEC-008 regression-gate registry (`security/regression-gates.ts`).

### Modules added

1. **Secret custody** (`apps/v2/packages/core/src/security/secret-custody.ts`, SEC-004) — the single declared
   secret-kind catalogue (auth/refresh/session/cloud/MCP), the OS/platform credential-store PREFERENCE policy
   (`requiredSecretLocation`: `os-credential-store`, else fail-closed `encrypted-device-local`), the proof
   each secret kind maps to a device-local category (`assertSecretCategoryIsDeviceLocal`), and the
   `assertNoSecretLeak` / `findSecretLeak` boundary guard that — reusing the redaction scrubber — blocks a
   plaintext secret destined for ANY of the eight durable/outbound channels (vault markdown, export, op-log,
   sync stream, player stream, diagnostics, log, error message).

2. **Cloud-collaboration boundary** (`apps/v2/packages/core/src/security/cloud-boundary.ts`, SEC-005) — the
   fail-closed, pre-payload cloud policy: rate-limited joins that do not leak session existence
   (`evaluateJoinRateLimit` / `recordFailedJoinAttempt`), the pre-auth join gate (`evaluateCloudJoinGate`:
   rate limit + revocation), revoked-participant queued-op admissibility
   (`isQueuedOpAdmissibleAfterRevocation`), and the cloud-side request gate (`authorizeCloudRequest`:
   tenant/session/stream isolation, fail-closed unsupported-payload-version parsing, nonce-replay
   rejection/idempotency). Every decision precedes payload generation; denials are non-disclosing.

3. **Cloud security model + release gate** (`apps/v2/packages/core/src/security/cloud-security-model.ts`,
   SEC-009) — the machine-checkable `CloudSecurityDecisionRecord` mirror of ADR-015, the fail-closed release
   gate (`evaluateCloudReleaseGate` / `canReleaseCloud`) that blocks cloud release until a complete approved
   record AND the SYNC-017 prerequisites are satisfied, and the server-visibility classifier
   (`findServerVisibilityViolations` / `assertServerSeesOnlyAllowedMetadata`) proving an E2EE claim exposes
   ONLY the allowed metadata classes to server-side code paths.

4. **Cloud key custody** (`apps/v2/packages/core/src/security/key-custody.ts`, SEC-012) — the logical
   key-epoch model (no cipher, per ADR-014): rotation on revocation (`rotateKeyOnRevocation` /
   `canDecryptEpoch` / `assertRevokedCannotDecryptNewEpoch`) locks a removed participant out of the new
   content epoch; recovery-scope isolation (`partitionRecoveryScope` / `assertRecoveryWithinScope`) restores
   only the approved scope; the compromised-store trust-boundary check (`evaluateServerTrustBoundary` /
   `assertCompromiseMatchesTrustBoundary`) proves only ciphertext + documented metadata are exposed.

5. **SEC-008 registry** (`apps/v2/packages/core/src/security/regression-gates.ts`) — four new boundary rows
   (`secret-custody`, `cloud-collaboration-boundary`, `cloud-security-model-gate`, `cloud-key-custody`), each
   naming its guard surface + dedicated coverage test, so the coverage meta-test fails closed if any loses
   its tests.

6. **ADR-015** (`docs/adr/015-v2-cloud-security-model-and-key-custody.md`, Proposed) — the SEC-009 prose
   decision record declaring encryption responsibilities, key custody, server trust boundary, rotation, and
   recovery tradeoffs; release stays BLOCKED until accepted alongside a concrete crypto ADR.

## Demo path (programmatic — pure Processing-Core)

No visible route/flow changed (these are pure-core security policies). Reviewer-runnable evidence:

```
pnpm --filter @dndtools/v2-core test -- security-secret-custody security-cloud-boundary \
  security-cloud-security-model security-key-custody sec-regression-gate-coverage
```

- `assertNoSecretLeak({ fields: { authorization: 'Bearer sk-live-...' } }, 'sync-stream')` throws — a token
  never crosses a durable/outbound channel.
- `evaluateCloudJoinGate({ ..., revocation })` denies a revoked participant before any payload; repeated
  failed joins are throttled with a non-disclosing message.
- `evaluateCloudReleaseGate()` (defaults) returns `canRelease: false` — cloud release is blocked with no
  approved decision record.
- `rotateKeyOnRevocation(epoch, removedHolding)` then `canDecryptEpoch(revokedHolding, newEpoch) === false`
  — a removed participant cannot decrypt newly delivered content.

## Requirement coverage / traceability

### SEC-004 — secrets stored in credential stores; never in vault/export/log/diagnostics/player streams

- AC "diagnostics exported → token-like values redacted": `assertNoSecretLeak`/`findSecretLeak`/`scrubForChannel`
  over the `diagnostics` channel (reuses `containsSensitiveData`/`redactValue`).
  → `secret-custody.ts`; `security-secret-custody.test.ts`.
- AC "vault export → auth secrets absent": `assertNoSecretLeak` over `vault-markdown` / `export-package`;
  every secret kind is device-local (`assertSecretCategoryIsDeviceLocal`, `storageCategoryForSecret`).
  → `secret-custody.ts`; `security-secret-custody.test.ts`. (Existing `content-export.ts` already scrubs.)

### SEC-005 — authenticated channels, identity, revocation, rate-limited joins, isolation, replay, fail-closed parsing

- AC "unsupported future payload version → fail closed with upgrade-required diagnostic":
  `authorizeCloudRequest` → `unsupported-payload-version`. → `cloud-boundary.ts`; `security-cloud-boundary.test.ts`.
- AC "repeated invalid joins → throttled without leaking session existence": `evaluateJoinRateLimit` /
  `evaluateCloudJoinGate` (non-disclosing message). → `cloud-boundary.ts`; `security-cloud-boundary.test.ts`.
- AC "cross vault/session/tenant/stream access → denied before payload generation": `authorizeCloudRequest`
  (tenant/session/stream isolation). → `cloud-boundary.ts`; `security-cloud-boundary.test.ts`.
- AC "replayed payload → rejected/ignored idempotently": `authorizeCloudRequest` → `replayed-nonce`,
  `idempotent: true`. → `cloud-boundary.ts`; `security-cloud-boundary.test.ts`.
- AC "revoked participant → stream torn down, credentials invalidated, queued ops rejected unless accepted
  before revocation": `evaluateCloudJoinGate` (revocation denial) + `isQueuedOpAdmissibleAfterRevocation`;
  cache seal composed from COLLAB-014. → `cloud-boundary.ts`; `security-cloud-boundary.test.ts`.

### SEC-009 — cloud security model declares encryption/custody/trust-boundary/rotation/recovery before release

- AC "cloud sync enabled → encryption at rest/in transit, key ownership, recovery documented + test-covered":
  `CloudSecurityDecisionRecord` + `validateCloudSecurityRecord`; ADR-015. → `cloud-security-model.ts`;
  `security-cloud-security-model.test.ts`; `docs/adr/015-v2-cloud-security-model-and-key-custody.md`.
- AC "credential/session key rotated/revoked → stale credentials no longer authorize": composes SEC-005
  revocation gate + SEC-012 epoch rotation. → `cloud-boundary.ts` + `key-custody.ts`; the two tests.
- AC "no decision record → release gating blocks": `evaluateCloudReleaseGate` / `canReleaseCloud` fail-closed
  default. → `cloud-security-model.ts`; `security-cloud-security-model.test.ts`.
- AC "E2EE claim → server-side paths cannot read hidden content except allowed metadata":
  `findServerVisibilityViolations` / `assertServerSeesOnlyAllowedMetadata` + `ALLOWED_SERVER_METADATA_CLASSES`.
  → `cloud-security-model.ts`; `security-cloud-security-model.test.ts`.

### SEC-012 — key custody/rotation/revocation/recovery enforced by tests before cloud release

- AC "participant removed + keys rotate → removed credentials cannot decrypt new content":
  `rotateKeyOnRevocation` / `canDecryptEpoch` / `assertRevokedCannotDecryptNewEpoch`.
  → `key-custody.ts`; `security-key-custody.test.ts`.
- AC "recovery flow → restores only approved scope, no other vault/tenant/participant stream":
  `partitionRecoveryScope` / `assertRecoveryWithinScope`. → `key-custody.ts`; `security-key-custody.test.ts`.
- AC "cloud storage compromised → exposed plaintext/metadata match documented server trust boundary":
  `evaluateServerTrustBoundary` / `assertCompromiseMatchesTrustBoundary`. → `key-custody.ts`;
  `security-key-custody.test.ts`.

All four requirement boundaries are additionally registered in the SEC-008 regression-gate registry
(`security/regression-gates.ts`), proven covered by `sec-regression-gate-coverage.test.ts`.

## Adversarial tests added (what each proves)

- `security-secret-custody.test.ts` — a planted bearer/refresh token in a note/handout/log/diagnostic/sync
  payload is detected and blocked across ALL eight channels; the finding never re-leaks the secret;
  `scrubForChannel` produces a payload that provably passes the guard; a token buried deep in a nested op
  payload is still caught.
- `security-cloud-boundary.test.ts` — rate limiting throttles a brute-force source without leaking session
  existence; a revoked participant is denied pre-payload and their at/after-revocation ops are rejected; a
  cross-tenant/session/stream request is denied before payload generation; a future payload version fails
  closed; a replayed nonce is rejected idempotently.
- `security-cloud-security-model.test.ts` — release is blocked with no decision record, with an incomplete
  record, or with an unsatisfied SYNC-017 model; an E2EE-claim-with-provider-keys record is rejected; a
  server-visible field carrying plaintext content (or a token in an allowed metadata value) violates the
  E2EE claim.
- `security-key-custody.test.ts` — a removed participant cannot decrypt the post-rotation epoch; a recovery
  excludes cross-vault/tenant/stream items; a compromised store exposing plaintext content / a leaky
  ciphertext / an undocumented metadata class exceeds the trust boundary, while ciphertext + documented
  metadata matches it.

## Quality gates (exact results)

- `pnpm --filter @dndtools/v2-core test` — PASS: 170 files, 2485 tests passed.
- `pnpm --filter @dndtools/v2-app test` — PASS: 13 files, 65 tests passed.
- `pnpm v2:typecheck` — PASS: core `tsc --noEmit` clean; app `svelte-check` 0 errors / 0 warnings.
- `pnpm v2:lint` — PASS: v2 boundary lint passed.
- `pnpm lint` — PASS: full eslint + navigation + token-compliance + repo-boundary audit passed.
- `pnpm docs:validate` — PASS: docs validation passed.
- `pnpm v2:workpack:validate` — PASS: v2 workpack validation passed.
- `pnpm v2:gates` — PASS: 7 gate(s) owned, budgeted, and wired.
- Playwright e2e — SKIPPED (justified): this epic touches ONLY pure Processing-Core modules
  (`apps/v2/packages/core/src/security/*`, `index.ts`), core tests, ADR docs, and generated planning files.
  No `apps/v2/app` route, layout, Svelte component, or visible-flow file was touched, so no route/layout/
  visible flow changed.

## Changed files (full repo-relative paths)

New:
- `apps/v2/packages/core/src/security/secret-custody.ts`
- `apps/v2/packages/core/src/security/cloud-boundary.ts`
- `apps/v2/packages/core/src/security/cloud-security-model.ts`
- `apps/v2/packages/core/src/security/key-custody.ts`
- `apps/v2/packages/core/tests/security-secret-custody.test.ts`
- `apps/v2/packages/core/tests/security-cloud-boundary.test.ts`
- `apps/v2/packages/core/tests/security-cloud-security-model.test.ts`
- `apps/v2/packages/core/tests/security-key-custody.test.ts`
- `docs/adr/015-v2-cloud-security-model-and-key-custody.md`

Modified:
- `apps/v2/packages/core/src/index.ts` (export the four new modules' public surfaces)
- `apps/v2/packages/core/src/security/regression-gates.ts` (four new SEC-008 boundary rows)
- `apps/v2/packages/core/tests/sec-regression-gate-coverage.test.ts` (expected-boundary-id assertion)
- `docs/adr/README.md` (ADR-015 index row)
- `docs/planning/v2/epics/SEC-secrets-and-cloud-collaboration.yaml` (generated)
- `docs/planning/v2/status.yaml` (generated)
- `docs/planning/v2/workpack-state.yaml` (status source of truth)

## Known gaps / deferred (per ADR-014)

- The LIVE cloud transport (wire protocol, TLS, auth handshake) and the real CRYPTO (cipher, KMS, client
  key library) are DEFERRED per ADR-014. This epic delivers the fail-closed POLICY + the seams a transport/
  crypto implementation plugs into, plus the regression gates. The key-custody model is LOGICAL (epoch-based)
  until a cipher is selected.
- Cloud sync/collaboration RELEASE stays BLOCKED by design: the SEC-009 decision record (ADR-015) is
  Proposed, and the SYNC-017 security model defaults unmet — `evaluateCloudReleaseGate().canRelease` is
  `false`. Accepting ADR-015 alongside a concrete crypto ADR opens the same gate with no call-site change.
- Recovery is declared `unsupported-by-design` at this stage (a valid SEC-009/SYNC-017 tradeoff); the
  recovery-scope isolation policy is implemented and tested for when a recovery flow is later configured.

## Quality review summary

- Correctness: every SEC-004/005/009/012 acceptance criterion is implemented and adversarially tested.
- Architecture: pure Processing-Core (no DOM/Node/Svelte/cloud/crypto/v1 imports), Contract 2 + Contract 3,
  fail-closed, default-off; ADR-014 boundaries respected (v2 boundary lint + full eslint green).
- Tests: 4 adversarial suites + the SEC-008 coverage meta-test; whole v2-core suite green.
- Security/permissions: fail-closed everywhere; secrets never cross a boundary; cloud denials non-disclosing.
- Persistence/sync/offline: no durable-mutation path added; composes the existing classification/replay/seal
  seams; cloud sync stays off by default.
- Accessibility/performance/UX: not applicable (no visible flow changed).
- Maintainability: small, cohesive, typed modules with comment density matching the codebase; no speculative
  abstractions, no unrelated refactors.
- Docs: ADR-015 decision record + README index + this completion evidence.

## Git evidence

- Branch: `epic/SEC-secrets-and-cloud-collaboration`
- Base tip: `dfe0240`
- Implementation commit SHA: `da25dd9` (`feat(v2): complete SEC-secrets-and-cloud-collaboration epic`)
- Mark-complete commit SHA: `4ba6615` (`docs(v2): mark SEC-secrets-and-cloud-collaboration complete`)

### `git status --short` (after completion — clean slate)

```
(empty — clean working tree after the completion commits)
```
