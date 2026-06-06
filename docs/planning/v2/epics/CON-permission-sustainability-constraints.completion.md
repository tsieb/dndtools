# CON-permission-sustainability-constraints — Completion Evidence

Workpack status: `complete`

Epic: `CON-permission-sustainability-constraints` — "CON: Permission sustainability constraints"
Requirement: **CON-004** — "The system must never allow per-instance raw field-list grants to replace
schema-defined capability sets for player permissions."

Architecture contract: Contract 3 (Role, Visibility & Permission Grant Model) +
Cross-Contract Non-Negotiable 9 ("Capability sets are schema-defined named options, not per-instance
raw field lists").

## What CON-004 requires and what was built

CON-004 is a **governance / sustainability constraint**, not a user-facing feature. It keeps the
permission model bounded, comprehensible, and auditable over time by forbidding any drift from the
named-capability-set grant model into a per-instance raw field-list grant surface.

It is delivered by **composing** the existing PERM infrastructure (the capability-set schema,
descriptors, inheritance, and the DM-authored grant command), mirroring the established mechanical
registry-gate pattern (SEC-008 `security/regression-gates.ts` and PERF-001 `perf/budget-registry.ts`):

- **New module** `apps/v2/packages/core/src/con/capability-set-sustainability.ts` — the single declared
  CON-004 invariant + a pure, fail-closed validator. No grant logic is re-implemented; it composes
  `capability-schema.ts` (`CAPABILITY_SET_SCHEMA`, `isKnownCapabilitySet`,
  `hasCapabilitySchemaForEntityType`) and `capability-sets.ts` (`describeCapabilitySet`).
  - `findRawFieldListGrant(payload)` / `isRawFieldListGrant` — the AC1 detector: a field-list-shaped
    key (`fields`, `allowedFields`, `fieldGrants`, … — `RAW_FIELD_LIST_SIGNAL_KEYS`, matched
    case/`-`/`_`-insensitively) or a non-name `capabilitySet` (array / object / blank) is the forbidden
    drift.
  - `auditCapabilitySetGovernance(schema?)` — the AC2 + sustainability audit: every grantable set is a
    named, schema-defined, GOVERNED (describable) option, and no entity type exceeds
    `MAX_CAPABILITY_SETS_PER_ENTITY_TYPE` (the bound that resists uncontrolled growth).
  - `isGovernedCapabilitySet(entityType, set)` — the AC2 supported-path predicate ("a new grouping is a
    named schema-defined set"); `summarizeCapabilitySetGovernance()` — DM-facing governance summary.
- **AC1 enforced at the grant boundary** — `commands/grant.ts` rejects a raw-field-list grant FAIL
  CLOSED with a CON-004 reason before schema parsing, on BOTH `permission.grant-capability-set` and
  `permission.transfer-ownership`.
- **Gate wired into CI** — the governance audit runs inside `scripts/quality-gates.ts`
  (`pnpm v2:gates`, a CI gate also reached by `pnpm v2:check`), surfaced through a new
  `permission-sustainability-violation` `GateProblemKind`. A drift (over-cap / ungoverned /
  blank / duplicate set) makes the gate exit non-zero. The constraint is ALSO covered by the vitest
  meta-test in `pnpm v2:test`.

## Requirement coverage / traceability (CON-004)

Story CON-004-S01 — "The system must never allow per-instance raw field-list grants to replace
schema-defined capability sets for player permissions."

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| **AC1** — Given a grant command contains a raw field list, when validated, then it is rejected. | `con/capability-set-sustainability.ts` (`findRawFieldListGrant`, `RAW_FIELD_LIST_SIGNAL_KEYS`); enforced in `commands/grant.ts` (`rejectRawFieldListGrant`, both grant + transfer). | `tests/con-permission-sustainability.test.ts` — "CON-004 AC1" describe blocks (field-list key, every signal key, separator variants, non-name `capabilitySet` as array/object/blank, transfer command, and a clean named-set grant still accepted) + detector unit tests. |
| **AC2** — Given the DM needs a new permission grouping, when supported, then it is added as a named schema-defined capability set for that entity type. | `con/capability-set-sustainability.ts` (`isGovernedCapabilitySet`, `auditCapabilitySetGovernance`) composing `CAPABILITY_SET_SCHEMA` + `describeCapabilitySet`. The only supported path to a new grouping is a named, governed schema set; raw field names are not governed groupings. | `tests/con-permission-sustainability.test.ts` — "CON-004 AC2 + sustainability" (real model GREEN; every real set is governed; a raw field name is NOT governed). |
| **Sustainability bound (constraint intent)** | `MAX_CAPABILITY_SETS_PER_ENTITY_TYPE` cap + `auditCapabilitySetGovernance` (`too-many-sets`/`blank-set-name`/`duplicate-set-name`/`set-not-governed`), wired into `scripts/quality-gates.ts`. | `tests/con-permission-sustainability.test.ts` — "the gate goes RED on a deliberate violation" (over-cap, blank, duplicate ⇒ flagged; small clean fixture GREEN; determinism). |

## Adversarial constraint-violation evidence (gate goes RED, then GREEN)

- **Unit / meta-test**: the "RED on a deliberate violation" describe block proves an over-cap entity
  type (`too-many-sets`), a blank set (`blank-set-name`), and a duplicate set (`duplicate-set-name`)
  are all flagged, while a small well-named fixture and the real model pass clean.
- **CI gate, live demonstration**: temporarily injecting an over-cap, ad-hoc-field-named entity type
  (`'demo-broken': ['a'..'i']`) into `capability-schema.ts` and running `pnpm v2:gates` produced:
  - RED — `quality-gate check failed with 1 problem(s): [permission-sustainability-violation]
    con-004:demo-broken: [CON-004] Entity type "demo-broken" declares 9 capability sets, exceeding the
    sustainability cap of 8…` and a non-zero exit code.
  - After reverting to the real model, `pnpm v2:gates` returned GREEN
    (`quality-gate check passed: 7 gate(s)…`). The schema file was restored cleanly (no residual diff).

## Demo path (programmatic — this is a governance constraint, no visible flow)

1. **AC1**: dispatch `permission.grant-capability-set` with a `fields: [...]` (or any
   `RAW_FIELD_LIST_SIGNAL_KEYS`) payload, or a `capabilitySet` that is an array/object → result is
   `rejected` with `code: 'invalid-payload'` and a CON-004 message. A clean single named-set grant is
   still `accepted`.
2. **AC2**: `isGovernedCapabilitySet('character', 'combat-participant')` is `true`; a raw field name
   (`isGovernedCapabilitySet('character', 'hp')`) is `false`. New groupings are added by extending
   `CAPABILITY_SET_SCHEMA` + descriptors, which the audit then governs.
3. **Gate**: `pnpm v2:gates` runs `auditCapabilitySetGovernance()` and fails closed on drift.

## Quality gates run (all green)

| Gate | Command | Result |
| --- | --- | --- |
| Core tests | `pnpm --filter @dndtools/v2-core test` | PASS — 178 files, 2701 tests |
| App unit tests | `pnpm --filter @dndtools/v2-app test` | PASS — 13 files, 65 tests |
| Typecheck | `pnpm v2:typecheck` | PASS — core `tsc --noEmit` clean; app svelte-check 0 errors / 0 warnings |
| Boundary lint | `pnpm v2:lint` | PASS — "v2 boundary lint passed" |
| Full ESLint (CI) | `pnpm lint` | PASS — eslint + navigation + tokens + repo audit |
| Docs validate (CI) | `pnpm docs:validate` | PASS — "docs validation passed" |
| Workpack validate | `pnpm v2:workpack:validate` | PASS — "v2 workpack validation passed" |
| Quality gates (incl. CON-004) | `pnpm v2:gates` | PASS — "quality-gate check passed: 7 gate(s)…"; RED on injected violation (demonstrated above) |

**Playwright e2e: not run — intentionally skipped.** This epic touches only Processing-Core modules
(`con/`, `commands/grant.ts`, `index.ts`, `platform/quality-gates.ts`), a CI tooling script
(`scripts/quality-gates.ts`), tests, and generated planning files. No route, layout, `.svelte`, or
visible-flow file was changed, so the e2e suite is not affected.

## Changed files (full repo-relative paths)

New:
- `apps/v2/packages/core/src/con/capability-set-sustainability.ts`
- `apps/v2/packages/core/tests/con-permission-sustainability.test.ts`
- `docs/planning/v2/epics/CON-permission-sustainability-constraints.completion.md` (this file)

Modified:
- `apps/v2/packages/core/src/commands/grant.ts`
- `apps/v2/packages/core/src/index.ts`
- `apps/v2/packages/core/src/platform/quality-gates.ts`
- `scripts/quality-gates.ts`

Generated planning files (via `set-status` / `complete`, not hand-edited):
- `docs/planning/v2/epics/CON-permission-sustainability-constraints.yaml`
- `docs/planning/v2/status.yaml`
- `docs/planning/v2/workpack-state.yaml`

## Known gaps / deferred

- None for CON-004. The constraint is enforced at the grant command boundary (runtime, fail closed),
  audited as a CI gate (`v2:gates`), and covered by a vitest meta-test that proves both RED-on-violation
  and GREEN-on-real-model. The `MAX_CAPABILITY_SETS_PER_ENTITY_TYPE` cap is set to 8 (the densest real
  entity type declares 4), leaving deliberate headroom while drawing a hard, reviewable line; raising it
  is itself a reviewable change in the declared registry.

## Git evidence

- Branch: `epic/CON-permission-sustainability-constraints` (based on `epic/PERF-search-graph-and-sync-responsiveness` HEAD `8152fa8`).
- Implementation commit SHA: `__IMPLEMENTATION_SHA__` (recorded in the follow-up SHA commit).

Final `git status --short` (after completion + clean slate):

```
__GIT_STATUS_SHORT__
```
