# RC-UX-5.3 run journal

## Scope and decisions

2026-09-12: documentation-only task on the current dispatch branch; four owned documents plus this
required journal. No runtime changes. Used the supplied docs-research instructions and repository
ADR skill. Headroom tools are not available in this session; source evidence uses native reads.

Reviewed roadmap §1.6 D3 and RC-UX-3.6, the mode reader/schema/tests, onboarding and its consent spec,
Settings setter, core approval record and existing threat model at base
`8b582677939ad2d89ff843affa60af78bd578ae9`. ADR-042 records the accepted target separately from
observed phase-1 implementation. ADR-026's original rationale remains as dated history beneath the
controlling amendment. The index retains its existing three-column format.

## Progress

- Added Accepted ADR-042 with disclosure copy for both phases, Expert choice, no forced sample
  step, unchanged legacy fallback, Settings access, migration support limits/costs and rollback.
- Linked the dated ADR-026 amendment in both directions and updated both index rows.
- Replaced the threat model's universal forced-consent requirement with scoped creation defaults,
  disclosure, legacy preservation, server authority and migration obligations.
- Security review: [report below](#security-review-report).

## Security-review report

Method: manual source/diff review by the task agent, 2026-09-12. No callable `/security-review`
command or skill was exposed in this session; this report is a manual substitute, **not a claim
that the slash command ran or that an independent security reviewer approved the change**. The
central operator's independent review remains required.

Scope: ADR-042, ADR-026 amendment/index and threat-model consent changes; compare to the linked
local source at the base commit. No deployed service or live onboarding was exercised.

Disposition: the documentation preserves the closed phase-2 gate and makes the product's weaker
consent model explicit. No runtime authorization change is introduced. Remaining implementation
findings must be resolved or accurately surfaced before the corresponding feature ships:

1. **Consent and legacy isolation:** simple-tier defaulting belongs only in proven new-vault
   creation. Current onboarding forces choices, and its single localStorage mode key cannot prove
   per-vault disclosure or isolation. RC-UX-3.6 must cover skip, replay, storage failures and
   existing-vault behavior; a tier switch must never widen trust.
2. **Server authority:** the unapproved core record remains `approved: false`. Local preference
   cannot authorize plaintext. The existing phase-2 checklist still requires authenticated server
   registration, race protection, tenant isolation, deletion and deployed KMS evidence. This docs
   review provides none of that approval.
3. **False migration assurance:** Settings only invokes `setVaultPrivacyMode`. ADR-042 therefore
   explicitly says readable-cloud-content migration is unsupported today and requires verified
   re-upload/cleanup or an unavailable state before phase 2. Past server access cannot be revoked.
4. **Disclosure discoverability:** accepted residual risk is that defaulting users may miss a line
   of copy. The document requires server readability (including secrets), truthful phase-1 wording
   and Settings access at every tier. Browser validation of the future UI remains outstanding.

## Validation

Run from the repository root:

- `pnpm --filter @dndtools/core exec vitest run tests/security-vault-privacy-modes.test.ts`:
  passed, 1 file / 14 tests; existing record, gate, visibility and recovery behavior only.
- Initial `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/cloud/vaultMode.test.ts`
  exited 1 with no tests: that config explicitly excludes cloud paths. No product failure inferred.
- Corrected `pnpm exec vitest run --config vitest.cloud.config.ts apps/gm-react/src/cloud/vaultMode.test.ts`:
  passed, 1 file / 3 tests; legacy fallback and explicit mode persistence only.
- Focused `pnpm exec prettier --check` on the five changed Markdown files: passed.
- Python check using `pathlib` and Markdown link/status extraction: both ADR index cells exactly
  match their Status lines; all 61 local links and anchors in the five files resolve.
- `git diff --check`: passed. Final diff reviewed; only the four owned docs and required journal
  changed. Prettier normalized the touched ADR tables without changing other rows' content.

Browser, deployment and central wrapper gates were not run. No push, promotion, loop launch,
additional agent or dispatcher control-state change. The manual security report above does not
satisfy literal execution of an unavailable `/security-review` command; operator review is pending.
