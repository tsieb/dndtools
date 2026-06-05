# PLAT-quality-gates-and-onboarding — Completion Evidence

Epic: `PLAT-quality-gates-and-onboarding` — PLAT: Quality gates and onboarding
Requirements: PLAT-010, PLAT-013, PLAT-014, PLAT-015
Branch: `epic/PLAT-quality-gates-and-onboarding` (cut from prior epic HEAD `642b34a`, not master)

## Summary

A META / tooling epic. The work **extends the existing quality infrastructure** rather than
building a parallel system, and adds the real first-run/onboarding surface needed to make the
onboarding acceptance tests meaningful. Every new gate **fails closed** and is proven by a negative
/ regression test.

- **PLAT-010 — tiered, owned, time-bounded quality gates.** A declared, structured gate registry in
  the core (`apps/v2/packages/core/src/platform/quality-gates.ts`) maps the repo's EXISTING tiers
  (critical / smoke / full / release) onto the package.json scripts that already exist
  (`test:critical`, `test:smoke`, `v2:lint`, `audit:repo`, `v2:check`, `docs:validate`, `v2:e2e`).
  Each gate carries an owner, a reason, the user-facing defect class it protects, the change-path
  globs that select it, and a last-reviewed date; each tier carries a configured time budget
  (smoke = the 3-minute headline target with no scope exception). A new enforcement script
  (`scripts/quality-gates.ts`, run as `pnpm v2:gates`, wired into `v2:check` and CI) **fails
  closed** when a gate is unowned, names no defect class, references a missing script, sits in a
  tier without a budget, exceeds its measured budget, or is past the review window. The test runner
  is NOT rewritten.

- **PLAT-013 — fixture-driven onboarding.** A pure core onboarding model
  (`apps/v2/packages/core/src/state/onboarding.ts`): fresh-vault detection, feature-tier
  (core/intermediate/advanced) maturity gates, first-run Command Center setup steps, and help
  surfaces. The MINIMUM real first-run surface was implemented — a `FirstRun` onboarding component
  on the Command Center home plus a device-local feature-tier control — so the acceptance tests
  exercise real behavior. Fixture-driven Vitest (core) + Playwright (web + mobile) prove first-run
  defaults and per-tier show/hide without manual verification (closes
  `AUDIT-21.4-FEATURE-TIER-E2E`).

- **PLAT-014 — platform support status.** A declared, structured support-status artifact
  (`apps/v2/packages/core/src/platform/support-status.ts`) with explicit parity / degradation /
  unsupported per profile (desktop / web / Android / tablet / mobile), **built on** the prior
  epic's `platform-profile.ts` capability descriptors and `support-matrix.ts` (PLAT-016) — not
  duplicating them. The release gate (`validateSupportStatus`, surfaced through `pnpm v2:gates`)
  **blocks the release** when a Must-have command is unsupported on a profile without an allowed
  exception, and requires a reason + fallback on every degraded/unsupported entry. A `SupportStatus`
  view renders the active profile's lists with reasons/fallbacks on Settings.

- **PLAT-015 — generated/validated registers.** Pure audits
  (`scripts/lib/generated-doc-audit.ts`) recompute high-churn markdown registers from structured
  sources and are wired into `docs:validate`, mirroring the existing schema-version-sync /
  v2-workpack generate-and-validate fail-closed pattern: the `10-requirements.md` **Count Audit**
  table is recomputed from requirement headings (AC3); the `07-known-defects.md` **defect-count
  summary** (a machine-checkable `<!-- defect-count-summary: ... -->` comment + human bullets) is
  recomputed from the register rows (AC1, closes `CLAUDE-CODEX-COUNT-MISMATCH`); the
  `PROJECT_STRUCTURE.md` **top-level structure inventory** is validated against the real repo top
  level (AC2, closes `AUDIT-21.4-PROJECT-STRUCTURE`). Each fails closed, proven by negative tests.

## Demo path / notes

Visible behavior (`pnpm v2:dev`):

1. **PLAT-013 first-run (a fresh vault):** open `/`, then in DevTools delete the IndexedDB database
   `dndtools-v2` and reload. The onboarding surface (`data-testid="onboarding"`) shows the welcome
   banner and setup steps (`onboarding-step-command-center` done after the system template loads;
   `onboarding-step-first-scene` pending). The feature-tier radio
   (`feature-tier-core|intermediate|advanced`) changes the visible-capabilities list
   (`visible-features`): core shows Command Center / Scenes / navigation; intermediate adds widget
   library / presets / player views; advanced adds diagnostics / support status / permissions.
   Create a Scene from `/scenes/`, return to `/` — onboarding flips to `data-status="complete"` and
   the banner is gone. Help surfaces expand from the `help-surfaces` details.
2. **PLAT-014 support status:** open `/settings/`. The "Platform support status" section
   (`data-testid="support-status"`) lists parity / degraded / unsupported commands for the active
   profile; each degraded/unsupported entry shows its reason and fallback.
3. **PLAT-010 gates (developer-facing):** `pnpm v2:gates` prints the owned, budgeted, wired gate
   summary; it fails closed on a registry that drifts from package.json (proven by tests).
4. **PLAT-015 (developer-facing):** `pnpm docs:validate` recomputes the Count Audit, defect counts,
   and structure inventory; it fails closed on any drift (proven by negative tests). Editing the
   Count Audit total or the defect summary to a wrong number makes the gate fail.

## Requirement traceability

| Req      | Statement (abridged)                                                                                                                                                                  | Implementation                                                                                                                                                                                                                                                                                                                                                                                             | Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PLAT-010 | Quality gates tiered, high-value, owned, bounded by configured time budgets; path/tier selection; review window                                                                       | `apps/v2/packages/core/src/platform/quality-gates.ts` (`QUALITY_GATES` registry with owner/reason/defect-class/selectsOnPaths/lastReviewed; `QUALITY_GATE_BUDGETS` incl. 3-min smoke target; `selectGatesForPaths` AC1, `validateGateRegistry` AC2/AC4, `checkBudgets` AC3); enforcement `scripts/quality-gates.ts` (`pnpm v2:gates`), wired into `v2:check` + `.github/workflows/ci.yml`                  | `apps/v2/packages/core/tests/quality-gates.test.ts` (budgets per tier, smoke=3min, owner/defect-class present + negatives for missing owner/defect-class/unknown-script/no-budget/stale-review/duplicate; path/tier selection AC1; budget enforcement + over-budget negative); `tests/unit/ci-guardrails.test.ts` (gate enforcement wired through scripts + CI, fail-closed against silent removal)                                                                                        |
| PLAT-013 | Fresh-vault onboarding, feature-tier visibility, maturity gates, help surfaces, first-run Command Center setup covered by fixture-driven acceptance tests                             | Core `apps/v2/packages/core/src/state/onboarding.ts` (`isFreshVault`, `FEATURE_GATES`, `visibleFeatures`/`isFeatureVisible` tier gates, `resolveOnboarding` first-run/in-progress/complete + DM-only `canSetup`, `HELP_SURFACES`); GUI `apps/v2/app/src/lib/gui/FirstRun.svelte`, device-local `apps/v2/app/src/lib/state/feature-tier.svelte.ts`, wired in `+layout.svelte` + `+page.svelte`              | `apps/v2/packages/core/tests/onboarding.test.ts` (tier show/hide AC2 incl. monotonic disclosure + fail-closed unknown feature; fresh-vault first-run defaults AC1; DM-only setup; real `command-center.ensure-home` advances onboarding); `apps/v2/app/tests/unit/feature-tier-store.test.ts`; `apps/v2/app/tests/e2e/onboarding.spec.ts` (web + mobile: first-run surface + core defaults AC1, per-tier feature-list visibility AC2, Scene authoring completes onboarding, help surfaces) |
| PLAT-014 | Platform support status per profile declared before release with explicit parity/degradation/unsupported; Must-have-unsupported blocks release; degradation reason + fallback visible | `apps/v2/packages/core/src/platform/support-status.ts` (`PLATFORM_SUPPORT_STATUS` artifact built on `platform-profile.ts` + `support-matrix.ts`; `validateSupportStatus` release gate AC1; `summarizeProfileSupport` AC2; `supportStatusServiceInconsistencies` consistency with capability descriptors), surfaced through `pnpm v2:gates`; GUI `apps/v2/app/src/lib/gui/SupportStatus.svelte` on Settings | `apps/v2/packages/core/tests/support-status.test.ts` (every profile declared per command; clean validation; Must-have-unsupported BLOCKS release + allowed-exception passes AC1; missing reason/fallback negative AC2; profile summary AC2; descriptor consistency); `apps/v2/app/tests/e2e/onboarding.spec.ts` (support-status surface shows parity/degraded/unsupported + reason/fallback)                                                                                               |
| PLAT-015 | Release notes, structure inventories, and defect-count summaries generated/validated from structured sources, not hand-synced markdown; Count Audit recomputed from headings          | `scripts/lib/generated-doc-audit.ts` (`auditCountTable` AC3, `auditDefectCounts` AC1, `auditStructureInventory` AC2 — all pure, fail-closed) wired into `scripts/docs-validate.ts`; structured sources: requirement headings, defect register rows + `<!-- defect-count-summary -->` in `docs/remake-review/07-known-defects.md`, real repo top-level dirs                                                 | `tests/unit/generated-doc-audit.test.ts` (count recompute + drift/missing-domain/total/absent-table negatives AC3; defect compute + machine-summary-drift + bullet-drift + missing-summary negatives AC1; structure stale-ref + undocumented-dir + ignore-set AC2)                                                                                                                                                                                                                         |

## Tests run (all pass)

- `pnpm v2:check`: PASS (workpack validate + `v2:gates` + boundary lint + typecheck + core/app unit
  suites).
- `pnpm v2:gates` (PLAT-010 + PLAT-014 release gate): PASS on the clean tree; negative tests prove
  fail-closed.
- `pnpm v2:lint` (boundary lint): PASS — core stays pure, no v1 runtime imports, no GUI platform
  primitives.
- `pnpm v2:typecheck`: 0 errors (core `tsc --noEmit`; app `svelte-check` 578 files, 0 errors/0
  warnings).
- `pnpm docs:validate`: PASS (now includes the PLAT-015 Count Audit / defect-count / structure
  audits; also corrected 14 pre-existing broken doc path references in prior PLAT completion files —
  see Known gaps).
- `@dndtools/v2-core` Vitest: 37 files, **402** tests PASS (was 363; +39 across quality-gates,
  support-status, onboarding).
- `@dndtools/v2-app` Vitest: 12 files, **55** tests PASS (was 52; +3 feature-tier store).
- Root Vitest (`ci-guardrails` + `generated-doc-audit`): 17 tests PASS (+16; the new doc-audit
  suite + the extended CI guardrail).
- Playwright `apps/v2/app/tests/e2e/onboarding.spec.ts`: desktop-chromium 8 passed, mobile-chromium
  8 passed.
- Playwright full v2 e2e regression: desktop-chromium 63 passed / 4 skipped; mobile-chromium 53
  passed / 5 skipped. No regressions from the home-page onboarding surface or the Settings addition.

## Quality review

- **Correctness:** every mapped acceptance criterion has an implementation and a test; each new gate
  has a negative/regression test proving it fails closed (unowned gate, missing defect class, missing
  script, no budget, over budget, stale review, Must-have unsupported, missing reason/fallback, count
  drift, defect-count drift, stale structure ref).
- **Architecture:** obeys ADR-014 and the contracts. The quality-gate registry, support-status
  artifact, and onboarding model are pure core modules (no DOM/Svelte/Node/platform imports — core
  boundary lint passes). PLAT-014 builds on the prior epic's capability descriptors / support matrix
  rather than duplicating them. The GUI renders core query results and never derives onboarding,
  tier-visibility, or support status itself (Contract 1). No v1 runtime imports.
- **Tests:** unit (core registry/validators, support-status release gate, onboarding model, app
  feature-tier store, doc-audit recomputation) + fixture-driven e2e (web + mobile onboarding and
  support status) + CI-guardrail wiring. Negative tests dominate the gate coverage.
- **a11y:** the onboarding steps use a real ordered list with done-state text alternatives; the
  feature-tier control is a labelled `radiogroup`; help is a keyboard-operable `<details>`; the
  support-status surface uses headed lists with `data-status` + visible text. No new axe-relevant
  regressions (route-accessibility e2e still green).
- **Performance:** gate validation, support-status summarization, and onboarding resolution are O(n)
  pure logic over tiny declared data; the onboarding view is derived, not recomputed in a hot loop.
  Time budgets are explicitly enforced to keep the default loop fast (critical ≤ 60s, smoke ≤ 3min).
- **Security / permissions:** onboarding setup is DM-only (`canSetup`); a player/observer view is
  read-only and never triggers setup commands. Support-status fail-closed: an unsupported feature
  that a profile genuinely has the service for is reported as an inconsistency. No secrets, paths, or
  hidden content introduced.
- **Persistence / sync / offline:** no changes to persistence, sync, or offline semantics. Feature
  tier is a device-local GUI preference, not durable vault state (Contract 1). Fresh-vault detection
  reads only durable state. The support-status artifact documents (does not change) the local-first
  offline model.
- **UX:** the first-run surface is complete with welcome, steps, progressive-disclosure tier control,
  visible capabilities, and help; degraded/unsupported support entries show action-oriented
  fallbacks; empty/complete states are handled (the banner disappears when onboarding completes).
- **Maintainability:** small typed modules; the existing test runner, boundary lint, exception
  manifest, and `docs:validate` were EXTENDED in place, not forked; the gate registry is the single
  source of truth consumed by the enforcing script (no duplication).
- **Docs:** this completion file; inline rationale on every new module and gate; the defect register
  now carries a machine-checkable, validated count summary.

## Known gaps / deferred items

- **Time-budget enforcement is opt-in per run.** `checkBudgets` enforces budgets when a run passes
  `--measured tier=ms,...`; the always-on `pnpm v2:gates` enforces ownership/structure/review-window
  and the PLAT-014 release block. Wiring `run-smoke.ts` to emit its measured duration into
  `v2:gates --measured` is a small follow-up; the enforcement logic and its negative test already
  exist.
- **Support-status artifact is authored, not auto-derived per command.** It declares cross-profile
  status for a representative set of durable commands (Scene create/move, first-run setup, player-view
  projection, filesystem vault, MCP sidecar) and is consistency-checked against the live capability
  descriptors. A full per-command sweep is a later expansion; the gate and schema are in place.
- **Native shells remain deferred (ADR-014).** Desktop/tablet/mobile support status reflects the
  declared-unavailable descriptors from the prior epic; it flips when a later epic wires the real
  shells, without changing this artifact's shape.
- **Pre-existing doc path references corrected.** `docs:validate` was already failing on the base
  HEAD with 14 broken path references in prior PLAT completion files (abbreviated `src/...` /
  `tests/e2e/...` shorthand that does not resolve from the repo root). Because this epic formalizes
  `docs:validate` as a declared gate, those 14 references were corrected to their real
  `apps/v2/...` paths (verified to exist) so the gate is green. This is a doc-only correction; no
  prior-epic code or behavior changed.

## Stop conditions

None hit. ADR-014 is Accepted and consistent (it scopes the first slice to web/PWA and defers native
shells, which the support-status artifact honors). No v1 runtime imports were required or added. No
hidden visibility/permission/sync/persistence behavior was ambiguous (onboarding setup is DM-only;
feature tier is device-local GUI preference). The generated workpack validates. `git status --short`
showed no unrelated overlapping changes at the start of the epic.

## Git evidence

Workpack status: `complete` after running
`pnpm v2:workpack:complete -- --epic PLAT-quality-gates-and-onboarding` (re-validated clean, no
drift).

- Branch: `epic/PLAT-quality-gates-and-onboarding`
- Base: `642b34a` (prior completed epic HEAD `PLAT-platform-profiles-and-shells`)
- Commit: recorded at handoff (this file is committed with the epic work).
- Final `git status --short` after the epic commit: clean (empty) — no untracked or unstaged files
  caused by this epic. The full output is captured in the handoff report.
