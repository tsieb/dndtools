# RC-DOC-1.1 — Requirements corpus audit

## Scope and method

- Baseline: `81b6b34c85f88c9855c7e0ca5aab7f69b1bafdc2`; current task branch;
  initially clean worktree. Owned changes: inventory and feature-audit validator, plus this journal.
- Applied the user-provided docs-research skill. Read the documentation map, development and Git
  workflow rules, existing inventory, validator and unit tests. No applicable AGENTS.md or
  available Headroom tools found. Native command output is the evidence for this run.
- Delegated the explicitly requested read-only `requirements-auditor` role to audit all 22
  surfaces and 9 layers against source and specs. The editing agent handles reconciliation.
- Initial findings: malformed Onboarding row; unanchored limits; obsolete spotlight, tile-gallery,
  design-theme and performance limits; loose parser accepts missing evidence silently.

## Audit results and reconciliation

- The read-only `requirements_auditor` returned 31 row verdicts: 6 MET from source/spec inspection,
  25 PARTIAL with retained limits, 0 UNMET, 0 OBSOLETE, 0 UNVERIFIED among the revised capability
  claims. MET here does not mean browser tests ran. The per-claim source/spec evidence is in
  `docs/requirements/FEATURE-GAPS.md:35` (surfaces) and `:66` (layers).
- Removed closed spotlight, tile-gallery, three-theme, missing-visual-suite, between-pass AI
  cancellation, provisional-budget and missing-perf-drift limitations. Replaced current-prod,
  SES, Stripe and TURN status assertions with conditional implementation boundaries; deployment
  and manual UX/hardware checks were not reclassified as passing.
- Repaired the truncated Onboarding row and nonexistent/bare spec references. Each separate
  behavior has a source line or spec; every retained limit has an exact source line and literal.
  Configuration/schema inspection included cloud configuration/capabilities and core system-package
  schemas, alongside implementation and existing specs.
- `scripts/validate/feature-audit.ts:131` rejects missing/unbalanced/empty inventory blocks,
  malformed/duplicate rows, missing behavior evidence, invalid paths/lines/specs and unanchored
  limit entries. `checkAnchors` validates literals at the cited line. `runFeatureAudit` and the
  standalone entrypoint both fail on a missing or malformed corpus. Text presence remains a drift
  check, not a substitute for the auditor's semantic review.

## Validation

Commands ran from this task worktree; original outputs were read, not compressed summaries.

- `pnpm feature-audit`: exit 0; **41 declared limits, 0 stale, 0 inventory issues**;
  0 mock imports and 0/23 screens requiring wiring review. The 30 code-marker matches are
  informational, not claims of unimplemented features. Exact log: `/tmp/rc-doc-feature-audit-final.log`.
- `pnpm exec vitest run tests/unit/feature-audit.test.ts`: **7/7 passed**. Exact log:
  `/tmp/rc-doc-tests-final.log`. Existing Vite native-config warning is unrelated to these changes.
- `pnpm exec tsx /tmp/rc-doc-parser-check.ts`: passed temporary isolated fixtures for valid data,
  ten malformed/evidence mutations, stale literals, exact-line mismatch and missing ledger;
  valid wrapper returns pass, malformed/missing wrapper returns fail. Fixtures were outside the
  repository to preserve the task's owned-path fence; no new test path was claimed.
- `pnpm exec eslint scripts/validate/feature-audit.ts`: exit 0.
- `pnpm gates`: exit 0; six registered gates, **308 reachable docs / 443 resolved relative links**.
  Existing application file-size warnings remain; none concerns the owned paths. Exact log:
  `/tmp/rc-doc-gates-final.log`.
- Scoped Prettier and `git diff --check` passed before commit.

Full browser, visual, hardware, live service, and independent operator gates remain with the
central operator. This task changes documentation and its validator, not app pixels. No push,
promotion, loop launch, dispatcher control-state edit, or unrelated tracked-file change occurred.

## Independent-review corrections — 2026-10-14

- Starting candidate: `842ded3884123c22de7a411227617813508edd92`; clean worktree.
  Rechecked both findings using the supplied docs-research skill and original source output.
- Restored the unresolved Session parchment phase-control contrast limit (DEBT-2026-008).
  `SessionBody.tsx:198` renders `SessionHeader`, `screens/session/Lifecycle.tsx:95` renders
  `Seg`, and `app/screen-kit.tsx:688-690` still uses accent on accent-subtle for 12.5px text.
  `styles/tokens/colors.css:165,168` retains the recorded pair. `DEBT.md:72-89` remains open;
  `tests/e2e/session-polish.spec.ts:27,33,64` documents and filters the exception. These app paths
  resolve under `apps/gm-react/src/`, and the spec under `apps/gm-react/`.
  The restored limit asserts the exact spec line naming the ratio and debt. No UI fix is claimed.
- Split Notes templates and saved-search filters into separately cited claims. Read the template
  creation assertions and `knowledge-filters.spec.ts:88-126` saved-search persistence/actions.
- Existing validator already asserts the restored anchor; no validator change is necessary.
- Correction validation (original command output inspected): `pnpm feature-audit` exited 0 with
  **42 declared limits, 0 stale anchors, 0 inventory issues**, no mock imports and 0/23 screens
  requiring wiring review. `pnpm gates` exited 0 (6 gates; 308 reachable docs / 443 resolved links),
  with existing app file-size warnings. Scoped Prettier and `git diff --check` passed.
- Browser and live-service checks remain unrun; no application or validator code changed.
  Central operator wrapper gates and independent review remain pending. No push, promotion,
  loop launch or dispatcher control-state change was performed.

## Second independent-review corrections — 2026-10-14

- Starting candidate: `92cf2ddf9fe213295d9e400516a91bffb7fb4332`; clean worktree.
  Applied the supplied docs-research guidance to the review findings; no Headroom tools available.
- Restored the desktop-specific worker limit. `WorkerHost.ts:660-666` documents and constructs
  blob workers; `apps/gm-react/electron/main.cjs:283-306` has no worker-src and restricts script-src
  to self. The inventory now asserts the exact CSP directive at line 289. No packaged runtime
  execution is claimed.
- Restored recorded operator limits: SES/public sign-up on Invite redeem and Cloud and sync
  (`docs/runbooks/ses-production-access.md:14-18`), Stripe account/legal identity on Plans & cloud
  (`docs/runbooks/stripe-billing.md:3-6`), TURN TLS rollout on Cloud and sync (ADR-039:41), and
  the explicitly open RC-PLT-1.1 operator task on Shells and platform (roadmap:4109).
  These correct the earlier journal's decision to replace operator status with conditionals.
  The header distinguishes recorded status from fresh live-service observations; no AWS, Stripe,
  signing or TURN deployment was inspected or modified.
- Replaced the Screens citation to useI18n with the filtering expression and a separate claim
  citing useScreenActions (read its dispatches for pin, metadata, duplicate, delete/restore and
  template creation). Cloud backup cites getCloudSyncStatus instead of a closing comment line.
  Fixed the two missing E2E-list commas.
- The existing validator asserts all restored anchors without code changes. The suggested new
  parser unit tests remain follow-up work outside this task's owned paths; no temporary fixture
  run is presented as committed test coverage.
- Original validation output inspected: `pnpm feature-audit` exit 0, **47 declared limits,
  0 stale anchors, 0 inventory issues**, 0 mock imports, 0/23 screens needing wiring review;
  `pnpm exec vitest run tests/unit/feature-audit.test.ts` exit 0, **7/7 tests passed**;
  `pnpm gates` exit 0, six registered gates, 308 reachable docs / 443 resolved links.
  Existing app file-size and Vite config warnings remain. Scoped Prettier initially detected
  table alignment drift; formatted the owned inventory and journal and rechecked before commit.
- Full wrapper gates and independent review remain with the central operator. Browser, hardware
  and live-service checks were not run. No push, promotion, loop launch, dispatcher control-state
  edit or unrelated tracked-file change was performed.

## Billing preview review correction — 2026-10-14

- Starting candidate: `c7f719db3c5e49fe6bd551def4ce190ca41723ac`; clean worktree.
  Used the supplied docs-research skill; no Headroom tools were available.
- Qualified the Plans & cloud limit: device-local or explicitly enabled preview enrollment
  takes no payment; loaded server-backed accounts with preview enrollment disabled instead
  show plan changes unavailable. Read EntitlementsProvider initialization and account handling,
  Upgrade's gating/render branches, PlanCards' disabled actions, and both no-billing unit tests.
  The inventory anchors the preview assertion and the production gating condition separately.
  Application and validator changes were unnecessary. Table padding changed through Prettier.
- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/screens/Upgrade.test.tsx
-t 'no billing configured'`: exit 0, 2 passed, 14 skipped. This exercises both preview and
  unavailable states locally; it does not validate deployed billing. Existing Vite config warning.
- `pnpm gates`: exit 0, six gates, 308 reachable docs and 443 resolved links; existing file-size
  warnings only. Initial feature-audit caught an incorrectly transcribed test line; corrected it
  to the actual assertion before the final check.
- Full wrapper gates and independent review remain with the central operator. No browser,
  hardware or live-service checks, push, promotion, loop launch or dispatcher-state edits.
- Final `pnpm feature-audit`: exit 0, 48 declared limits, 0 stale anchors, 0 inventory issues,
  no mock imports and 0/23 screens requiring wiring review. Original output inspected.
- Scoped Prettier and `git diff --check` passed before commit.

## Settings and Story evidence corrections — 2026-10-14

- Starting candidate: `ec4b17a96b598bd76fdb3f804c34a7e0e84f0436`; clean worktree.
  Applied the supplied docs-research skill; no Headroom tools were available.
- Corrected Settings' unconditional billing limitation to the actual no-live-billing,
  server-backed, preview-disabled branch. The literal anchor now asserts
  `screens/settings/Subscription.tsx:361`; surrounding lines 349-371 select live billing,
  unavailable or preview copy. `cloud/entitlements.ts:365-410` confirms the separate preview
  paths. Paths in this item resolve under `apps/gm-react/src/`.
- Split Story's NPC claim from quest/faction authoring: `campaign.spec.ts:263` browses seeded
  NPCs and `:289` exercises sheet navigation to Characters. `Campaign.tsx:424,439` implements
  that navigation. The inventory no longer claims this spec demonstrates NPC creation/editing.
- Original local command outputs inspected: `pnpm feature-audit` exit 0, 48 declared limits,
  0 stale anchors, 0 inventory issues, no mock imports and 0/23 screens needing wiring review;
  `pnpm gates` exit 0, six gates, 308 reachable docs and 443 resolved relative links;
  `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/screens/Upgrade.test.tsx
-t 'no billing configured'` exit 0, 2 passed and 14 skipped. Existing file-size and Vite
  configuration warnings remain. These unit tests exercise Upgrade, not the Settings panel.
- No application or validator changes were needed. Browser, hardware, deployed-service checks,
  central wrapper gates and independent review remain unrun in this correction. No push,
  promotion, loop launch or dispatcher control-state change was performed.
