# PERF-budget-ownership-and-measurement — Completion Evidence

Epic: `PERF-budget-ownership-and-measurement` — PERF: Budget ownership and measurement
Requirement IDs: PERF-001, PERF-007
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 2 (Cloud Sync &
Offline Model); Contract 4 (Scene and Widget Contract)

This epic delivers the budget OWNERSHIP registry (PERF-001) and the budget MEASUREMENT seam
(PERF-007) as PURE Processing-Core policy. It COMPOSES and UNIFIES the project's existing, scattered
budget/percentile/measurement code rather than inventing a parallel system:

- It reuses the nearest-rank `percentile` helper from the COLLAB live-session module
  (`apps/v2/packages/core/src/collab/session-sync.ts`) — the measurement layer imports it, it is not
  re-implemented.
- It mirrors the shape of the PLAT-010 quality-gate registry
  (`apps/v2/packages/core/src/platform/quality-gates.ts`): an owned, justified, time-reviewed
  registry plus a fail-closed validator. The two registries are deliberately kept separate (quality
  gates own CI test/lint TIERS; the new registry owns user-facing PERFORMANCE WORKFLOWS) but read the
  same way.
- It MIGRATES the COLLAB ad-hoc `DEFAULT_SESSION_LATENCY_BUDGET` p95 target into the registry: the
  registry now owns the `live-session-delivery` budget (target 500ms p95), and
  `collab/session-sync.ts` reads its default p95 from the registry via
  `budgetForId(LIVE_SESSION_DELIVERY_BUDGET_ID)`. The number is now declared in exactly one place.
  The existing COLLAB-003 latency tests are unchanged and still pass.

All new logic is deterministic over plain data — no DOM/Node/Svelte/clock/entropy/network. Review
windows and provisional review-date checks take an EXPLICIT `today` input, never `Date.now()`, so
validation and measurement are reproducible. The module obeys ADR-014: it lives in
`@dndtools/v2-core`, imports no Svelte/DOM/platform/v1-runtime code, and boundary lint stays green.

## Demo (programmatic)

This is a pure-core capability (no route/Svelte/visible flow is touched), so the demo path is
programmatic, exercised through the public `@dndtools/v2-core` API and proven by tests:

1. OWNERSHIP — list the declared budgets and confirm each is owned + qualified:

   ```ts
   import { PERFORMANCE_BUDGETS, validateBudgetRegistry, budgetsForOwner } from '@dndtools/v2-core';
   validateBudgetRegistry({ today: '2026-06-05' }); // [] — every budget owned + qualified
   budgetsForOwner('Maps'); // [map-pan-zoom-desktop, map-pan-zoom-slim]
   ```

2. MEASUREMENT — grade observed samples against a declared budget, fail closed:

   ```ts
   import { measureBudget } from '@dndtools/v2-core';
   measureBudget('search', [120, 130, 140]).result;          // 'pass' (p95 <= 250ms)
   measureBudget('smoke-ci', [4 * 60 * 1000]).result;        // 'breach' (> 3 min)
   measureBudget('search', []).result;                       // 'unknown' (no samples — not a pass)
   measureBudget('not-registered', [10]).result;             // 'error' (unknown budget — never a pass)
   ```

Requirement IDs exercised by the demo: PERF-001, PERF-007.
Deferred out of this epic: live benchmark harness wiring / CI capture of real samples (the measurement
takes samples as explicit inputs; producing them on real hardware is a later PERF slice), and
re-baselining provisional targets into measured baselines.

## Traceability

### PERF-001 — define measurable, OWNED performance budgets before feature implementation

- Code: `apps/v2/packages/core/src/perf/budget-registry.ts`
  - `PERFORMANCE_BUDGETS` — the single authoritative registry. Each `PerformanceBudget` ties a
    workflow (startup, vault open, Scene render, widget update, map pan/zoom desktop+slim, search,
    graph indexing, sync reconciliation, smoke CI, live-session delivery) to an `owner`, a
    `userFacingRisk`, a `BudgetMetric` (measurement method + target), a `dataset`, a `deviceClass`,
    and a `BudgetMaturity` (provisional + review date, or baseline + measured date).
  - `budgetForId` / `budgetsForOwner` — planning-review lookups (AC1). `budgetForId` returns `null`
    for an unknown id, the fail-closed signal the measurement layer turns into an error.
  - `validateBudgetRegistry` — fails CLOSED: missing owner / user-facing risk (AC2), missing dataset /
    device class / review date (AC3 — never "fast enough"), non-positive target, out-of-range
    percentile, duplicate id, and a provisional review date that has already lapsed relative to an
    explicit `today` (AC3).
  - AC1 (relevant budgets + measurement method exist): every budget names its `BudgetMetric` kind;
    the registry covers all workflows the PERF-007 artifact names.
  - AC2 (breach identifies owning domain + user-facing risk): `owner` + `userFacingRisk` are required
    and non-empty; the measurement message names both on a breach.
  - AC3 (provisional targets fully qualified): provisional budgets require dataset, device class, and
    a future review date; a lapsed review date is flagged.
- Tests: `apps/v2/packages/core/tests/perf-budget-registry.test.ts`
  - Asserts every PERF-007 workflow is declared; every budget is owned + carries a risk; every
    provisional budget declares dataset/device-class/review-date; the canonical registry validates
    clean; `validateBudgetRegistry` rejects missing owner / risk / dataset / device-class / bad
    target / bad percentile / duplicate id / lapsed review date; boundary: a review date exactly
    `today` is NOT yet overdue; determinism: identical input → identical problems; the migrated
    `live-session-delivery` budget is owned with target 500.

### PERF-007 — concrete provisional thresholds + pass/fail measurement against named targets

- Code: `apps/v2/packages/core/src/perf/measurement.ts`
  - `measureBudget` — grades observed samples against a DECLARED budget, fail closed. Unknown budget
    id → `error`/`unknown-budget` (never a pass). No usable samples → `unknown`/`no-samples`
    (un-proven, not green). Otherwise grades the worst run (`duration-ms`) or the nearest-rank
    percentile (percentile metrics, reusing COLLAB `percentile`) against the target; exactly-at-target
    PASSES. Returns the owning workflow, owner, dataset (fixture), device class (platform profile),
    observed value, target, and a direction-oriented `marginToTarget` (AC2).
  - `measureBudgetSuite` — grades a set of benchmark runs; `allPassed` only when EVERY measurement
    passes (a breach, an unknown, OR an error keeps the suite from passing — fail closed).
  - `PERFORMANCE_BUDGETS` provides the concrete provisional thresholds the PERF-007 artifact lists
    (smoke CI < 3 min, startup < 2s, vault open < 3s, Scene first render < 1.5s, widget update
    100ms p95, map pan/zoom >= 50/30 fps, search 250ms p95, graph indexing 500ms, sync reconciliation
    2s) — the executable form of the table in `docs/remake-review/requirements/18-performance.md`.
  - AC1 (smoke CI has a concrete target): `smoke-ci` is a `duration-ms` budget graded against its
    3-minute ceiling like every other budget.
  - AC2 (each benchmark reports pass/fail against a named target, fixture, platform profile): the
    measurement names the budget id, workflow, owner, dataset, and device class.
- Tests: `apps/v2/packages/core/tests/perf-measurement.test.ts`
  - Fail-closed: unknown budget → `error`; empty/all-discarded samples → `unknown`; lower-is-better
    ceiling (single sample, exactly-at-threshold, p95 breach naming owner+risk); higher-is-better
    floor (at-floor pass, below-floor breach, non-positive fps discarded); `duration-ms` worst-run
    grading; determinism (identical samples and input order yield identical results); canonical
    registry grading (smoke-ci 3-min ceiling, search naming fixture + profile); suite fail-closed
    (breach/unknown/error/empty all keep the suite from passing).

## Quality gates (all run; exact results)

- `pnpm --filter @dndtools/v2-core test` — PASS: 172 files, 2529 tests passed (includes the 2 new
  perf test files, 38 new tests, and the unchanged COLLAB-003 latency tests after the migration).
- `pnpm --filter @dndtools/v2-app test` — PASS: 13 files, 65 tests passed.
- `pnpm v2:typecheck` — PASS: core `tsc --noEmit` clean; app `svelte-check` 0 errors / 0 warnings.
- `pnpm v2:lint` (boundary) — PASS: "v2 boundary lint passed".
- `pnpm lint` (full eslint CI gate) — PASS: eslint clean; navigation lint, token lint, repo audit all
  passed.
- `pnpm docs:validate` (CI gate) — PASS: "docs validation passed".
- `pnpm v2:workpack:validate` — PASS: "v2 workpack validation passed".
- `pnpm v2:gates` (quality-gate registry runner) — PASS: "quality-gate check passed: 7 gate(s) owned,
  budgeted, and wired to package scripts."
- Playwright e2e (`pnpm e2e`, desktop-chromium + mobile-chromium) — NOT RUN, justified: this epic is
  genuinely pure-core. The only changed runtime files are `apps/v2/packages/core/src/perf/*`,
  `apps/v2/packages/core/src/index.ts` (export wiring), and
  `apps/v2/packages/core/src/collab/session-sync.ts` (the budget migration). No route, layout,
  `.svelte`, `apps/v2/app/**`, or e2e spec was touched, so no visible flow changed. The existing e2e
  suite is unaffected.

## Changed files

- `apps/v2/packages/core/src/perf/budget-registry.ts` (new) — PERF-001 owned budget registry +
  fail-closed validator + the migrated `live-session-delivery` budget.
- `apps/v2/packages/core/src/perf/measurement.ts` (new) — PERF-007 deterministic measurement against a
  declared budget (pass/breach/unknown/error) + suite summary.
- `apps/v2/packages/core/tests/perf-budget-registry.test.ts` (new) — PERF-001 coverage.
- `apps/v2/packages/core/tests/perf-measurement.test.ts` (new) — PERF-007 coverage.
- `apps/v2/packages/core/src/index.ts` (modified) — public exports for the perf registry +
  measurement.
- `apps/v2/packages/core/src/collab/session-sync.ts` (modified) — `DEFAULT_SESSION_LATENCY_BUDGET`
  reads its p95 from the registry (migration); no behavior or value change.
- `docs/planning/v2/epics/PERF-budget-ownership-and-measurement.yaml` (regenerated by set-status).
- `docs/planning/v2/status.yaml` (regenerated by set-status).
- `docs/planning/v2/workpack-state.yaml` (regenerated by set-status).
- `docs/planning/v2/epics/PERF-budget-ownership-and-measurement.completion.md` (this file).

## Quality review summary

- Correctness: every PERF-001 and PERF-007 acceptance criterion is implemented and test-covered,
  including adversarial edges (empty/single/at-threshold/breach/unknown/unowned).
- Architecture: pure Processing Core; no Svelte/DOM/platform/v1 imports; boundary lint green; obeys
  ADR-014 and Contract 1. Composes existing percentile + quality-gate patterns; no parallel system.
- Tests: 38 new unit tests + determinism + edge/adversarial coverage; full core suite green.
- Accessibility / UX: not applicable (no GUI surface in this epic).
- Performance: the registry IS the performance budget source of truth; measurement is deterministic.
- Security / permissions: not applicable (no actor-filtered data); measurement leaks no content —
  messages name only budget metadata.
- Persistence / sync / offline: no durable state; pure functions over explicit inputs; offline-safe.
- Maintainability: two small, cohesive, typed modules with high comment density matching the repo;
  no speculative abstraction; the migration removes a duplicated budget number.
- Docs: this completion evidence + the executable registry now mirror the
  `18-performance.md` budget table.

## Git evidence

- Branch: `epic/PERF-budget-ownership-and-measurement` (from the v2 epic-chain tip `414d4cf`).
- Commits:
  - feature + tests + completion evidence: `8847566` (`feat(v2): complete
    PERF-budget-ownership-and-measurement epic`).
  - regenerated derived planning files after `v2:workpack:complete`: `09125b0` (`docs(v2): mark
    PERF-budget-ownership-and-measurement complete`).
  - this SHA-record follow-up: `e906645` (`docs(v2): record commit SHAs ...`), the HEAD of this branch.

Workpack status: `complete`

Final `git status --short` (clean tree at handoff after all three commits):

```
```
