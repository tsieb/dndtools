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
- Security review: [`/security-review` report below](#security-review-report).
- Attempt 2 (2026-09-12): independent review approved everything except the missing
  `/security-review` report. The `security-review` skill was available in this session and was run.
  Its report replaces the earlier manual substitute. The four owned docs are unchanged since
  `f3d72b87`.

## Security-review report

### `/security-review` run (attempt 2, 2026-09-12)

Invoked the `security-review` skill against branch HEAD `f3d72b87`. The command diffs from the
merge-base with `main` (`1e84f783`), so its range covers 101 files: this task's docs and the
integrated loop/rc code commits beneath it. The skill's own procedure calls for sub-tasks. Step 1
(identification) ran as one read-only general-purpose sub-agent given the full command prompt and
exclusions. It returned no findings, so step 2 (per-finding false-positive sub-tasks) and step 3
(confidence ≥ 8 filter) had nothing to process. No files were modified by the review.

**Result: no High or Medium vulnerabilities found.** The identification sub-task's conclusion,
verbatim:

> I found no vulnerabilities that meet the bar (>80% confidence, High/Medium severity) in
> `1e84f783...f3d72b87`.

Coverage the sub-agent recorded, summarized:

- Electron `scene-display:open` IPC and kiosk window: gated by `isPrimarySender`. The renderer
  supplies no URL or bounds. The kiosk window uses the least-privilege preload with sandbox and
  context isolation on, and navigation away from `#/display` destroys it.
- Core `scene.duplicate-widget`: same authority, package and binding checks as add. Copied fields
  come from the core's own state. A caller `copyId` colliding with a live or tombstoned widget is
  refused. Remote players cannot reach it because the relay only forwards `dice.`/`character.`.
- Widget sandbox and style tokens: extra theme tokens are forwarded only with `host-theme-tokens`.
  `--widget-*` values go through the existing `resolveWidgetStyleVariables` sanitizer.
- PDF export, scene-display hero `blob:` URL, dev-only component gallery (with the production-bundle
  check), `promote-production.yml` and the legal-placeholder script: no untrusted sink found.
- The RC-UX-5.3 docs, other journals, tests and snapshots are excluded from findings by the
  command's rules (documentation and test-only files). **The command therefore gives no security
  verdict on the ADR-042 decision itself.** That doc-level analysis is the manual review below.

I checked three of the sub-agent's claims against source myself: the sender gate at
`apps/gm-react/electron/main.cjs:448`, the relay allowlist at `apps/gm-react/src/net/SessionHost.ts:32`,
and the `copyId` collision check at `packages/core/src/commands/widget.ts:1007-1015`. I did not
re-verify its other claims, and I ran no dynamic testing.

### Manual decision review (attempt 1, unchanged)

Method: manual source/diff review by the task agent, 2026-09-12, scoped to ADR-042, the ADR-026
amendment/index and the threat-model consent changes, compared with the linked local source at the
base commit. No deployed service or live onboarding was exercised. This is not an independent
security approval.

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

Attempt 1: browser, deployment and central wrapper gates were not run. No push, promotion, loop
launch, additional agent or dispatcher control-state change.

Attempt 2 (journal-only change; owned docs untouched):

- Ran `/security-review` as recorded above. Its step-1 sub-agent is the only agent spawned. The task
  requires this command, and the command's procedure is multi-agent. The sub-agent was read-only.
- Re-ran focused `pnpm exec prettier --check`, `git diff --check`, and the local link/anchor check
  on this journal. Results are in the attempt-2 commit message.
- Browser, deployment and central wrapper gates were not run. No push, promotion, loop launch or
  dispatcher control-state change. The central operator's gates and independent review remain
  pending.
