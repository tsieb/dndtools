# UX-A11Y-release-gates-and-contrast — Completion Evidence

UX workpack status: `complete`

Epic: `UX-A11Y-release-gates-and-contrast` (phase "01 Foundations", priority P0)
Branch: `ux/UX-A11Y-release-gates-and-contrast` (off `ux/UX-VIS-component-library-motion-density-icons`)
Requirements: UX-A11Y-001, UX-A11Y-016, UX-A11Y-017, UX-A11Y-018

## Summary

Foundational accessibility release gates for the v2 UI remake: a deterministic axe gate across all
primary routes on both Playwright profiles, a WCAG 1.4.11 non-text contrast gate, a machine-readable
known-violation register with remediation-date expiry enforcement, and an extended screen-reader QA
release checklist for the v2 surfaces. Gates reuse the epic-2 token system and the existing Playwright
projects rather than per-surface hacks. Running the new axe gate surfaced real violations on the
existing v2 app, which were fixed (critical + structural) or tracked in the register (touch-target,
owned by the interaction-primitives epic).

## Demo path (Desktop / Tablet / Mobile)

The gates are CI/tooling, not new visible UI, so the "demo" is the gate runs themselves:

- Desktop (`desktop-chromium`): `pnpm a11y:axe` scans `/`, `/scenes`, `/atlas`, `/characters`,
  `/knowledge`, `/session`, `/settings` — 7/7 pass.
- Mobile (`mobile-chromium`, Pixel 5): same 7 routes — 7/7 pass. Tablet shares the Desktop layout
  profile (the platform profiles collapse to desktop/compact); the mobile-chromium project is the
  compact/touch profile and is covered. 14/14 axe tests pass across both profiles.
- Merged gate: `pnpm a11y:report` → `tmp/a11y/a11y-summary.md`: 0 critical, 8 serious (all approved
  known violations), 2 moderate (logged), 0 blocking, 0 expired → Gate PASS.
- Contrast gate: `pnpm a11y:contrast` → 79 non-text pair checks across 5 themes + 4 forced-colors
  remap checks, all pass.

## Tests run

- `pnpm exec vitest run tests/unit/a11y-axe-policy.test.ts tests/unit/a11y-nontext-contrast.test.ts`
  — 15/15 pass. Includes the non-vacuity negative probes: a critical always blocks; a serious blocks
  unless an active register entry approves it; an expired register entry FAILS the gate; a focus ring
  below 3:1 is flagged.
- `pnpm a11y:axe` (Playwright, both projects) — 14/14 pass.
- `pnpm a11y:report` — exit 0, Gate PASS.
- `pnpm a11y:contrast` — pass.
- `pnpm lint` (eslint + navigation + tokens + a11y:contrast + repo audit) — pass.
- `pnpm docs:validate` — pass.
- `pnpm v2:lint` (boundary) — pass.
- `pnpm --filter @dndtools/v2-core typecheck` — pass.
- `pnpm --filter @dndtools/v2-app typecheck` (svelte-check) — 0 errors.
- `pnpm --filter @dndtools/v2-app test` — 132/132 pass.
- Regression e2e for the three edited gui components + route-accessibility on both profiles
  (`diagnostics`, `permission-roles`, `session-handouts-and-tools`, `session-prep-recap-and-calendar`,
  `route-accessibility`) — 34/34 pass.
- `pnpm v2:ux-workpack:validate` — pass.

## Files changed

Gate tooling (new):

- `scripts/lib/a11y-axe-policy.ts` — pure, unit-tested gate policy engine (fingerprint normalization,
  merge/dedupe, severity gating, known-violation approval + remediation-date expiry).
- `scripts/a11y-axe-report.ts` — merge worker artifacts → deterministic report + Markdown summary; CI
  exit code.
- `scripts/a11y-nontext-contrast-lint.ts` — WCAG 1.4.11 / 2.4.13 non-text contrast + forced-colors gate.
- `apps/v2/app/tests/e2e/a11y-axe-gate.spec.ts` — axe scan, both profiles, isolated worker artifacts.
- `apps/v2/app/tests/a11y/known-violations.json` — v2 known-violation register.
- `tests/unit/a11y-axe-policy.test.ts`, `tests/unit/a11y-nontext-contrast.test.ts` — negative probes.

App fixes uncovered by the new gate (in `apps/v2/app/src/lib/gui/`, this epic's file ownership):

- `QuickReference.svelte` — `aria-label` on the unlabeled pin-target `<select>` (fixes `select-name`
  CRITICAL on `/session`).
- `ParticipantStatusPanel.svelte`, `PermissionSummary.svelte` — misused `<dl class="scene-list">`
  (no `<dt>`/`<dd>`) converted to `<div>` (fixes `definition-list` SERIOUS on `/settings`); `.scene-list`
  is class-styled grid, so no visual change.

Docs:

- `docs/development/ACCESSIBILITY.md` — §9 V2 gate, severity policy, known-violation register table,
  manual-only criteria.
- `docs/development/ACCESSIBILITY_QA.md` — V2 Surfaces SR checklist (canvas, Scene Outline, map summary,
  combat announcements, drag alternatives, required Player-role no-leak check) + v2 release template.

Wiring:

- `package.json` — `a11y:contrast` (also added to `pnpm lint`), `a11y:axe`, `a11y:report`, `a11y:gate`.

Generated (via `pnpm v2:ux-workpack:set-status` / `:complete`):

- `docs/planning/v2/ux/workpack-state.yaml`, `status.yaml`, and the regenerated epic packets.

## Requirement coverage (traceability)

- **UX-A11Y-001 (WCAG 2.2 AA binding floor):** axe gate spec + `scripts/lib/a11y-axe-policy.ts`
  (critical/serious gating, register exclusion); register + remediation-date expiry in
  `known-violations.json` + report; documented in ACCESSIBILITY.md §9. Tests: `a11y-axe-policy.test.ts`
  (AC1 severity, AC3 expiry), `a11y-axe-gate.spec.ts` (per-route AC1).
- **UX-A11Y-016 (non-text contrast 1.4.11):** `scripts/a11y-nontext-contrast-lint.ts` (focus ring,
  selected boundary, status graphics, DM marker ≥3:1 all themes; AC3 focused-vs-unfocused delta; AC2
  forced-colors remap). Tests: `a11y-nontext-contrast.test.ts` (real CSS passes; negative probe; AC2).
- **UX-A11Y-017 (automated axe gate):** `a11y-axe-gate.spec.ts` both profiles + WCAG 2.2 tag set
  (AC1); critical blocks (AC2, proven by the real `select-name` catch + unit test); isolated worker
  artifacts merged + deduped via fingerprint normalization (AC3); expired-known fails (AC4).
- **UX-A11Y-018 (SR QA environments + checklist):** ACCESSIBILITY_QA.md V2 Surfaces — three SR
  environments, v2 surface checks, and the required Player-role visibility-boundary no-leak check (AC2).

## Actor-safety / no-leak evidence

- The axe gate scans player-relevant routes; the required Player-role visibility-boundary check is a
  mandatory, blocking line in the v2 SR checklist (UX-A11Y-008): DM-only names/labels/alt/live-region
  text must be absent from and unreachable in the player context. A leak is a release blocker, never a
  known issue.
- App fixes were attribute/structure only and did not change any visibility predicate; the
  `permission-roles` and `diagnostics` player/observer no-leak e2e tests still pass on both profiles.

## Known gaps / deferred

- `target-size` (serious, `/session` native checkboxes, mobile profile) is tracked in the register,
  owned by `UX-A11Y-interaction-primitives-and-help-compliance` (UX-A11Y-010), target 2026-09-30.
- The resting decorative border token (`--color-border`) is below 3:1 in the dark themes; per the
  WCAG 1.4.11 decorative-separator interpretation the gate enforces the focus/selected/status state
  indicators instead. Documented in ACCESSIBILITY.md §9.2 and the lint header.
- 2 moderate axe findings are logged (non-blocking) for later follow-up.
- The SR checklist is process documentation; manual SR execution happens at release time.
- CI workflow YAML wiring (GitHub Actions) is out of scope here; the gates are wired as discoverable
  `pnpm` scripts ready for a CI step.

## Git

Branch: `ux/UX-A11Y-release-gates-and-contrast`. Commit: see the epic commit
`feat(v2-ux): UX-A11Y release gates and contrast`.

Final `git status --short` (pre-commit working-tree state; the commit then leaves the tree clean):

```
 M apps/v2/app/src/lib/gui/ParticipantStatusPanel.svelte
 M apps/v2/app/src/lib/gui/PermissionSummary.svelte
 M apps/v2/app/src/lib/gui/QuickReference.svelte
 M docs/development/ACCESSIBILITY.md
 M docs/development/ACCESSIBILITY_QA.md
 M docs/planning/v2/ux/epics/UX-A11Y-release-gates-and-contrast.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
 M package.json
?? apps/v2/app/tests/a11y/
?? apps/v2/app/tests/e2e/a11y-axe-gate.spec.ts
?? docs/planning/v2/ux/epics/UX-A11Y-release-gates-and-contrast.completion.md
?? scripts/a11y-axe-report.ts
?? scripts/a11y-nontext-contrast-lint.ts
?? scripts/lib/a11y-axe-policy.ts
?? tests/unit/a11y-axe-policy.test.ts
?? tests/unit/a11y-nontext-contrast.test.ts
```
