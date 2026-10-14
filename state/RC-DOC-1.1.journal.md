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
