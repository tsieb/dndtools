# CON-security-and-source-of-truth-constraints — Completion Evidence

Workpack status: `complete`

Epic: `CON-security-and-source-of-truth-constraints` — CON: Security and source-of-truth constraints
Requirements covered: **CON-001, CON-002, CON-005**
Branch: `epic/CON-security-and-source-of-truth-constraints`
Base HEAD: `5630e6b` (tip of the v2 epic chain)

## What CON-001/002/005 require and what was built

These are governance CONSTRAINTS (meta/architectural invariants), not user-facing features. Each is
delivered as a machine-checkable, fail-closed governance gate in the Processing Core that COMPOSES the
existing enforcement machinery (it never re-implements or redesigns it), mirroring the established
CON-003/CON-004/CON-006 + SEC-008 + PLAT-010 registry-gate pattern. Each gate is wired into
`pnpm v2:gates` (`scripts/quality-gates.ts`) so a violation fails CI/pre-push fail-closed, and each has a
dedicated adversarial meta-test proving RED on a deliberate violation and GREEN on the real codebase.

- **CON-001** — "never rely on GUI hiding as the authoritative enforcement mechanism for visibility,
  permissions, sync filtering, or security decisions." Module
  `apps/v2/packages/core/src/con/gui-hiding-not-authoritative.ts` composes the existing data-layer
  visibility filter (`filterEntityForActor`/`evaluateVisibility`) and the SEC-010 stream-privacy scan
  (`findStreamPrivacyLeaks`) to prove hidden data is omitted at the storage/query layer (AC1) and that the
  GUI-bound payload carries no DM-only field to leak (AC2). `auditGuiHidingReliance` proves every declared
  non-DM delivery surface enforces at the data layer (none `gui-only`).
- **CON-002** — "never make MCP, AI, cloud sync, or network access required for core local vault
  ownership/editing/search/maps/characters/Scenes/dice/combat/session continuity." Module
  `apps/v2/packages/core/src/con/network-not-required.ts` composes the SYNC-001 local-first model
  (`evaluateWorkflowAvailability`, `deriveLocalFirstStatus`, `hasNoNetworkDependency`) and the MCP
  AI-boundary seam (`applyAiAnnotation`) to prove core workflows stay usable under a total external outage
  (AC1), AI degrades to the deterministic path (AC2), and multi-user delivery is reported unavailable, never
  required (AC3). `auditExternalDependencyRequirement` proves every external dependency class is
  `supplementary`, never `required`.
- **CON-005** — "never treat cloud storage, external sources, generated snapshots, player-device caches, or
  widget-local state as the sole source of truth for core vault content." Module
  `apps/v2/packages/core/src/con/source-of-truth.ts` composes the SYNC-007/008 storage-classification policy
  (`classifyStorageCategory`, `eligibleCloudCategories`) to prove the vault stays usable + can queue ops with
  cloud off (AC1), and proves widget-local state never holds canonical entity data (AC2,
  `findWidgetLocalSourceOfTruthViolation`). `auditSourceOfTruthOwnership` proves every core content class is
  owned by a durable local state document (`vault/scene/session/map/permission-state`), never a
  derived/remote/cache/widget store.

## Requirement coverage / traceability

All code paths below are under `apps/v2/packages/core/src/` and all test paths under
`apps/v2/packages/core/tests/`.

| Requirement | Acceptance criterion | Code | Test |
| --- | --- | --- | --- |
| CON-001 | AC1 — hidden data already absent when it leaves the storage/query layer | `apps/v2/packages/core/src/con/gui-hiding-not-authoritative.ts` `projectEntityForActor` (over `apps/v2/packages/core/src/permissions/visibility-filter.ts`) | `apps/v2/packages/core/tests/con-gui-hiding-not-authoritative.test.ts` "CON-001 AC1" |
| CON-001 | AC2 — no DM-only field present to leak even if a UI renders everything | `apps/v2/packages/core/src/con/gui-hiding-not-authoritative.ts` `assertProjectionHasNoDmOnlyField`/`findDmOnlyFieldLeaks` (over `apps/v2/packages/core/src/collab/stream-privacy.ts`) | `apps/v2/packages/core/tests/con-gui-hiding-not-authoritative.test.ts` "CON-001 AC2" |
| CON-001 | drift audit — no non-DM surface relies on GUI hiding | `apps/v2/packages/core/src/con/gui-hiding-not-authoritative.ts` `auditGuiHidingReliance`, `NON_DM_DELIVERY_SURFACES` | same file "GREEN" + "RED (adversarial)" |
| CON-002 | AC1 — core local workflows usable with all network/MCP integrations disabled | `apps/v2/packages/core/src/con/network-not-required.ts` `evaluateWorkflowsUnderOutage`, `assertExternalDependencyOptional` (over `apps/v2/packages/core/src/sync/local-first.ts`) | `apps/v2/packages/core/tests/con-network-not-required.test.ts` "CON-002 AC1" |
| CON-002 | AC2 — deterministic features continue without AI when AI fails | `apps/v2/packages/core/src/con/network-not-required.ts` `annotationDegradesWithoutAi` (over `apps/v2/packages/core/src/mcp/ai-boundary.ts`) | `apps/v2/packages/core/tests/con-network-not-required.test.ts` "CON-002 AC2" |
| CON-002 | AC3 — local source of truth usable; multi-user delivery unavailable, not required | `apps/v2/packages/core/src/con/network-not-required.ts` re-exports `deriveLocalFirstStatus` semantics | `apps/v2/packages/core/tests/con-network-not-required.test.ts` "CON-002 AC3" |
| CON-002 | drift audit — every external dependency is supplementary, never required | `apps/v2/packages/core/src/con/network-not-required.ts` `auditExternalDependencyRequirement`, `EXTERNAL_DEPENDENCY_POSTURE` | same file "GREEN" + "RED (adversarial)" |
| CON-005 | AC1 — vault usable + can queue ops when cloud unavailable | `apps/v2/packages/core/src/con/source-of-truth.ts` `vaultUsableWithoutCloud` (over `apps/v2/packages/core/src/sync/storage-classification.ts`) | `apps/v2/packages/core/tests/con-source-of-truth.test.ts` "CON-005 AC1" |
| CON-005 | AC2 — canonical entity data resides in owning entity/session/map state document | `apps/v2/packages/core/src/con/source-of-truth.ts` `findWidgetLocalSourceOfTruthViolation`, `CANONICAL_FIELD_SIGNAL_KEYS` | `apps/v2/packages/core/tests/con-source-of-truth.test.ts` "CON-005 AC2" |
| CON-005 | drift audit — no cloud/cache/snapshot/widget store is the sole source of truth | `apps/v2/packages/core/src/con/source-of-truth.ts` `auditSourceOfTruthOwnership`, `CORE_CONTENT_OWNERSHIP` | same file "GREEN" + "RED (adversarial)" |

## Demo / programmatic verification path

These are programmatic governance constraints. The reviewer-runnable demo path:

1. `pnpm --filter @dndtools/v2-core test` — the three CON meta-tests (56 tests) prove each gate goes GREEN on
   the real codebase and RED on a deliberate constraint-violation fixture (adversarial blocks at the bottom of
   each test file).
2. `pnpm v2:gates` — the wired gate runner (`scripts/quality-gates.ts`) runs all three audits against the live
   codebase and exits 0 (GREEN). Verified fail-closed: temporarily flipping one
   `EXTERNAL_DEPENDENCY_POSTURE` entry to `required` makes `pnpm v2:gates` exit 1 with
   `[security-source-of-truth-violation] con-002:network: [CON-002] ...`; reverting restores exit 0.

## How the gate is wired into CI

`scripts/quality-gates.ts` (the `pnpm v2:gates` runner, itself a registered gate in `QUALITY_GATES` and part
of `pnpm v2:check`) now also runs `auditGuiHidingReliance()` (CON-001), `auditExternalDependencyRequirement()`
(CON-002), and `auditSourceOfTruthOwnership()` (CON-005), each mapped to a `GateProblem` with the new
`security-source-of-truth-violation` kind (added to `GateProblemKind` in
`apps/v2/packages/core/src/platform/quality-gates.ts`). Any problem makes the runner exit 1, fail-closed.

## Quality gates run (exact results)

| Gate | Command | Result |
| --- | --- | --- |
| Core unit + CON meta-tests | `pnpm --filter @dndtools/v2-core test` | PASS — 182 files / 2799 tests (incl. 56 new CON-001/002/005 tests) |
| App unit tests | `pnpm --filter @dndtools/v2-app test` | PASS — 13 files / 65 tests |
| Core typecheck | `pnpm --filter @dndtools/v2-core typecheck` | PASS — `tsc --noEmit` clean |
| App typecheck | `pnpm --filter @dndtools/v2-app typecheck` | PASS — svelte-check 882 files, 0 errors / 0 warnings |
| v2 boundary lint | `pnpm v2:lint` | PASS — v2 boundary lint passed |
| Full ESLint (+ nav + tokens + repo-boundary-audit) | `pnpm lint` | PASS — eslint clean; nav 132 files; tokens 132 files; repo-boundary-audit 5 tests |
| Docs validation | `pnpm docs:validate` | PASS — docs validation passed |
| Workpack validation | `pnpm v2:workpack:validate` | PASS — v2 workpack validation passed |
| Quality gates (wired CON-001/002/005) | `pnpm v2:gates` | PASS — 7 gates owned/budgeted/wired; CON audits GREEN |
| Quality gate fail-closed proof | inject `network: 'required'`, `pnpm v2:gates` | exit 1 (RED), reverted → exit 0 (GREEN) |

E2E (`pnpm e2e`) was intentionally SKIPPED: this epic touched only Processing-Core modules
(the new `apps/v2/packages/core/src/con/` gates plus `apps/v2/packages/core/src/index.ts` and
`apps/v2/packages/core/src/platform/quality-gates.ts`), the `scripts/quality-gates.ts` tooling runner,
tests, and generated planning files. No route, layout, Svelte component, or visible-flow file was changed,
so there is no browser surface to regress.

## Changed files (full repo-relative paths)

New:
- `apps/v2/packages/core/src/con/gui-hiding-not-authoritative.ts`
- `apps/v2/packages/core/src/con/network-not-required.ts`
- `apps/v2/packages/core/src/con/source-of-truth.ts`
- `apps/v2/packages/core/tests/con-gui-hiding-not-authoritative.test.ts`
- `apps/v2/packages/core/tests/con-network-not-required.test.ts`
- `apps/v2/packages/core/tests/con-source-of-truth.test.ts`
- `docs/planning/v2/epics/CON-security-and-source-of-truth-constraints.completion.md`

Modified:
- `apps/v2/packages/core/src/index.ts` (export the three CON gate modules)
- `apps/v2/packages/core/src/platform/quality-gates.ts` (`security-source-of-truth-violation` GateProblemKind)
- `scripts/quality-gates.ts` (wire the three CON audits into `pnpm v2:gates`, fail-closed)
- `docs/planning/v2/epics/CON-security-and-source-of-truth-constraints.yaml` (generated — status)
- `docs/planning/v2/status.yaml` (generated — status/metrics)
- `docs/planning/v2/workpack-state.yaml` (mutable source of truth — status)

## Quality review summary

- Correctness: every CON-001/002/005 acceptance criterion is implemented and test-covered; no deferrals.
- Architecture: obeys ADR-014 and Contracts 1–4. Pure Processing-Core policy (no DOM/Svelte/Node/cloud/v1
  imports); each module COMPOSES existing enforcement and adds the declared invariant + fail-closed validator.
- Security/permissions: CON-001 proves the data layer (not the GUI) is authoritative; reuses the visibility
  filter + stream-privacy scan choke-points.
- Persistence/sync/offline: CON-002 proves local-first holds with everything external off; CON-005 proves
  local is the primary copy and the vault queues ops with cloud unavailable.
- Data safety: all audits fail closed; adversarial tests prove RED on violation, GREEN on the real codebase;
  audits are deterministic.
- Maintainability: small, cohesive, fully typed modules with comment density matching the existing CON gates;
  no speculative abstractions, no unrelated refactors.
- Docs/operational: gate wiring documented in `scripts/quality-gates.ts`; this evidence file records the full
  trace.

## Known / deferred gaps

None. All three requirements and all acceptance criteria are implemented, tested, and CI-wired.

## Git evidence

Branch: `epic/CON-security-and-source-of-truth-constraints`
Implementation commit SHA: `5914af8d3a8b8f68c502ae599337cd298b832343`
(`feat(v2): complete CON-security-and-source-of-truth-constraints epic`)
Followed by `docs(v2): mark ... complete` (regenerated planning files) and this SHA-record follow-up.

Final `git status --short` (clean — empty output):

```
```
