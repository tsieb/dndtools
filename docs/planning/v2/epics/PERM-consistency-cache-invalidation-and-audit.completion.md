# Completion Evidence: PERM-consistency-cache-invalidation-and-audit

Epic: `PERM-consistency-cache-invalidation-and-audit` — PERM: Consistency, cache invalidation, and audit
Requirement IDs: **PERM-007**, **PERM-009**, **PERM-010**, **PERM-014**
Architecture contracts: **Contract 1** (Processing / Display Decoupling), **Contract 3** (Role,
Visibility & Permission Grant Model — Consistency Requirements, Session Join Model, Visibility
evaluation order), **Contract 4** (Widget / Canvas — player-view binding rules).

## Summary

This epic delivers the consistency-detection, cache-invalidation, denial-audit, and DM-diagnostics
branch of the v2 permission model. Everything is **pure Processing-Core policy** (Contract 1: the
GUI consumes the computed audit/diagnostic/cache models; it never computes or overrides a permission
decision). It **extends** the prior PERM base-role/observer work rather than duplicating it:

- The role-ceiling drops + observer ceiling continue to live in
  `permissions/base-roles.ts`; this epic reuses `computeEffectivePermissionsForActor`,
  `isWriteCapableCapabilitySet`, and the dropped-grant model.
- The role/grant consistency audit continues to live in `permissions/consistency.ts`
  (`auditPermissionConsistency`); this epic **adds** the entity-scoped audit alongside it.
- All audit/diagnostic output is non-leaking by construction. Where free text could carry a path or
  secret it is checked against the PLAT redaction `containsSensitiveData`
  (`diagnostics/redaction.ts`) in tests.

Grant issuance/management UI and the full grant lifecycle remain **out of scope** (other PERM
epics); grants are represented only enough to detect inconsistencies and key the cache.

## What each requirement delivers

- **PERM-007 — consistency errors for invalid permission states.** New
  `auditEntityPermissionConsistency` in `permissions/consistency.ts` detects every invalid state in
  Contract 3's "Consistency Requirements": write grants on non-visible (`dm-only`/unshared) content,
  unknown capability sets for the entity type, grants on deleted/unavailable entities, multiple
  character owners, observer write grants, and hidden widget bindings in player-views. Each is a
  typed `EntityConsistencyProblem` carrying only an entity reference + grant + generic remediation.
  The system-defined capability-set schema per entity type lives in
  `permissions/capability-schema.ts` (Contract 3 Minimum Capability Sets).
- **PERM-009 — immediate capability-cache invalidation.** New `permissions/capability-cache.ts`
  models a deterministic cache keyed by a per-participant **fingerprint** of every input that
  affects effective capabilities (role, ownership, surviving + dropped grants, the visibility of
  granted entities, and the capability-schema version). `invalidateCapabilityCache` recomputes
  synchronously and invalidates **exactly** the affected participants; a schema-version change
  **fails closed** and invalidates everyone. `isCapabilityCacheEntryValid` is the fail-closed
  reconnect guard (PERM-009 AC2). No timers / background system.
- **PERM-010 — denial audit without leaking hidden content.** New `permissions/access-audit.ts`
  produces a public denial **and** a DM-facing audit record for denied cross-trust-boundary
  attempts. The public reason for a hidden/unshared target collapses to `not-found`, making it
  indistinguishable from a non-existent entity; the audit record carries only actor + entity
  reference + reason category. A write to hidden content is masked as not-found, never as a
  permission error.
- **PERM-014 — actionable DM diagnostics, redacted for everyone else.** New
  `permissions/permission-diagnostics.ts` folds the role/grant audit, the entity audit, and
  denied-access records into one actionable DM view (reference + grant + remediation, errors first).
  `getPermissionDiagnostics` is the actor-scoped entry point: only the DM receives the actionable
  view; every other actor receives a generic `unavailable`/`unauthorized` view with no references,
  grants, or counts. Leak-proof by construction — the diagnostics never carry titles or field
  values.

## Demo

This epic adds **no visible GUI surface** (pure core), so the demo is exercised headlessly through
the unit suites, which are the primary evidence:

1. PERM-007: `apps/v2/packages/core/tests/entity-consistency.test.ts` — a player write grant on a
   `dm-only` note is reported (AC1); a player-view widget bound to hidden data is reported as an
   invalid player-view assignment (AC2).
2. PERM-009: `apps/v2/packages/core/tests/capability-cache.test.ts` — revoking a player's grant
   invalidates exactly that player; the participant's next capability check reads invalid (AC1); an
   offline-during-revocation participant reads invalid on reconnect so role/grants re-evaluate
   before catch-up (AC2).
3. PERM-010: `apps/v2/packages/core/tests/access-audit.test.ts` — a player requesting a hidden note
   by id is denied and audited with actor/reference/reason (AC1); the denial shown to the actor is
   byte-identical to a not-found denial and reveals no title/content (AC2).
4. PERM-014: `apps/v2/packages/core/tests/permission-diagnostics.test.ts` — the DM sees the affected
   entity reference, grant, and remediation (AC1); the same situation surfaced to a player through a
   command denial contains only a generic unavailable reason (AC2).

The computed models are exported from `@dndtools/v2-core` for the GUI to render whichever projection
the actor is entitled to. The entitlement gate (`getPermissionDiagnostics`) lives inside the core so
the GUI cannot leak the DM view.

## Files changed

New (Processing Core — pure permission policy):

- `apps/v2/packages/core/src/permissions/capability-schema.ts` — the system-defined capability-set
  schema per entity type + `CAPABILITY_SCHEMA_VERSION` (Contract 3 Minimum Capability Sets).
- `apps/v2/packages/core/src/permissions/capability-cache.ts` — deterministic capability cache +
  synchronous, fail-closed invalidation (PERM-009).
- `apps/v2/packages/core/src/permissions/access-audit.ts` — non-leaking denial audit for denied
  cross-trust-boundary access (PERM-010).
- `apps/v2/packages/core/src/permissions/permission-diagnostics.ts` — actionable DM diagnostics +
  actor-scoped redacted projection (PERM-014).
- `apps/v2/packages/core/tests/entity-consistency.test.ts` — PERM-007 (incl. adversarial no-leak).
- `apps/v2/packages/core/tests/capability-cache.test.ts` — PERM-009 (each trigger + fail-closed).
- `apps/v2/packages/core/tests/access-audit.test.ts` — PERM-010 (adversarial no-leak / not-found).
- `apps/v2/packages/core/tests/permission-diagnostics.test.ts` — PERM-014 (DM vs non-DM no-leak).

Modified:

- `apps/v2/packages/core/src/permissions/consistency.ts` — added the entity-scoped consistency
  audit (`auditEntityPermissionConsistency`) and its types, reusing the existing role/grant audit.
- `apps/v2/packages/core/src/index.ts` — public exports for the new permission-core API.
- `docs/planning/v2/workpack-state.yaml`, `docs/planning/v2/status.yaml`,
  `docs/planning/v2/epics/PERM-consistency-cache-invalidation-and-audit.yaml` — generated workpack
  status (via the workpack commands, not hand-edited).

## Traceability

| Requirement   | Acceptance criterion                                                                | Implementation                                                                                  | Tests (file → case)                                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PERM-007 AC1  | player write grant on `dm-only` note → DM sees an error                             | `auditEntityPermissionConsistency` (`write-grant-on-hidden-content`)                            | `entity-consistency` → "a player write grant on a dm-only note is reported to the DM"                                                                        |
| PERM-007 AC2  | player-view scene widget bound to hidden data → invalid assignment reported          | `auditEntityPermissionConsistency` (`hidden-widget-binding-in-player-view`)                     | `entity-consistency` → "reports a player-view widget bound to dm-only data"                                                                                  |
| PERM-007 (all)| unknown capability set / deleted entity / multiple owners / observer write surfaced | `auditEntityPermissionConsistency`, `capability-schema.isKnownCapabilitySet`                    | `entity-consistency` → unknown-capability, deleted-entity, multiple-character-owners, observer-write blocks                                                  |
| PERM-009 AC1  | revoked grant → next command using it is rejected                                   | `invalidateCapabilityCache`, `isCapabilityCacheEntryValid` (fingerprint mismatch fails closed)  | `capability-cache` → "revoking a player grant invalidates only that player"                                                                                  |
| PERM-009 AC2  | offline during revocation → role/grants re-evaluated before catch-up                | `isCapabilityCacheEntryValid` (stale entry reads invalid on reconnect)                          | `capability-cache` → "a participant offline during revocation reads as invalid on reconnect"                                                                 |
| PERM-009 (all)| grants/visibility/roles/ownership/schema-version each invalidate exactly affected   | `computeCapabilityFingerprint`, `invalidateCapabilityCache` (schema-version fails closed → all) | `capability-cache` → grant/visibility/role/ownership/schema-version blocks                                                                                   |
| PERM-010 AC1  | hidden-note request → audit records actor, reference, reason                         | `auditAccessAttempt` → `AccessDenialAuditRecord`                                                 | `access-audit` → "a player requesting a hidden note by id is denied and audited"                                                                             |
| PERM-010 AC2  | denial shown to actor does not reveal hidden title/content                           | `auditAccessAttempt` public reason masks `not-visible`/`not-shared` as `not-found`              | `access-audit` → "a hidden-note denial is indistinguishable from not-found"; "neither the public denial nor the audit record carries the title/content"     |
| PERM-014 AC1  | write grant on hidden content → DM sees reference, grant, remediation                | `getPermissionDiagnosticsForDm`                                                                  | `permission-diagnostics` → "a write grant on hidden content surfaces the affected reference + remediation to the DM"                                          |
| PERM-014 AC2  | same diagnostic via player command denial → generic reason only                     | `getPermissionDiagnostics` actor-scoped redacted projection                                     | `permission-diagnostics` → "a player gets a redacted unavailable view"; "no actor-scoped result of any kind leaks the hidden entity reference"               |

### Adversarial / negative cases (primary evidence)

- PERM-007: forged/garbage capability set reported as unknown; widget bound to a `shared` entity not
  shared with the player reported; widget bound to an entity with **no** visibility record fails
  closed (reported); every problem asserted free of `title`/`value`/`content` keys and free of
  secret-shaped data.
- PERM-009: an observer's **dropped** bogus write grant is still part of the fingerprint, so
  removing the stale record still invalidates the observer; a removed participant is invalidated and
  dropped from the next cache; identical inputs invalidate no one.
- PERM-010: a write to hidden content is masked as `not-found`, never `no-permission` (no existence
  probe); hidden vs non-existent denials are byte-identical to the actor; the public result shape is
  asserted to be exactly `{kind, publicReason, message}` (no leak surface).
- PERM-014: players, observers, unknown, and unauthenticated actors all get only a generic view;
  every actor-scoped result is serialized and asserted not to contain the hidden entity id or grant
  id.

## Tests run

- `pnpm --filter @dndtools/v2-core test` — **488 passed** (42 files), including the new 54 cases
  across `entity-consistency`, `capability-cache`, `access-audit`, and `permission-diagnostics`
  (was 434 before this epic).
- `pnpm --filter @dndtools/v2-app test` — **55 passed** (12 files).
- `pnpm v2:lint` (boundary lint) — passed (core stays free of GUI/platform/v1 imports).
- `pnpm v2:typecheck` — passed (core `tsc` + app `svelte-check`: 0 errors, 0 warnings).
- `pnpm v2:gates` — passed (7 gates).
- `pnpm v2:workpack:validate` — passed.

Playwright e2e: **not run** for this epic. It adds **no visible surface** (no `.svelte`/route/GUI
file changed — see `git status --short`), so the conditional "run full e2e on both Playwright
projects if a visible surface changes" does not apply. The known pre-existing `mobile-chromium`
failures noted in the prior PERM completion are unrelated to this pure-core epic.

## Quality review

- **Correctness:** All four requirements and all eight acceptance criteria implemented and tested,
  with adversarial coverage proving the fail-closed and no-leak guarantees.
- **Architecture:** Pure functions in `@dndtools/v2-core` `permissions/`; no Svelte/DOM/Node/
  platform/v1 imports (boundary lint passes). The GUI consumes computed audit/diagnostic/cache
  models; entitlement gating is inside the core (Contract 1). Capability sets are schema-defined
  named options, not per-instance field lists (Contract 3 / Cross-Contract Non-Negotiable 9).
- **Tests:** 54 new unit cases, adversarial-heavy; the primary evidence per the epic emphasis.
- **Accessibility:** No new GUI; the computed models are plain data the existing accessible Settings
  surfaces can render.
- **Performance:** All passes are O(actors × grants + entities) over in-memory state; the cache
  fingerprint is a sorted string join. Negligible; no async, no I/O.
- **Security / permissions:** Fail-closed at every branch — unknown entity type has no schema (every
  capability unknown); missing visibility record → not visible; hidden/unshared denial masked as
  not-found; schema-version change invalidates the whole cache. Denial messages and audit records
  carry no titles or field values; the non-DM diagnostics view exposes nothing.
- **Persistence:** No new durable state shapes; the cache is a derived, serializable string-keyed
  structure rebuildable from `PermissionState` + visibility. No migration needed (no schema change
  to durable documents). `CAPABILITY_SCHEMA_VERSION` is a string so future bumps are explicit.
- **Sync/offline:** Invalidation is pure, synchronous, and deterministic, so it resolves identically
  on replay and on reconnect; the reconnect guard fails closed before catch-up (PERM-009 AC2). No
  network dependency.
- **UX:** The DM gets an actionable, ordered (errors-first) diagnostics list with remediation; every
  other actor gets a single generic, non-leaking reason.
- **Maintainability:** Small, cohesive, fully-typed modules; the capability-set schema and its
  version live in one place; the entity audit reuses the base-role write-capability predicate; the
  fingerprint folds all triggers through `computeEffectivePermissionsForActor`.
- **Docs:** This completion file; module- and function-level rationale comments tie code to
  PERM-007/009/010/014 and the relevant Contract 3 rules.

## Known gaps / deferred items

- Grant **issuance/management UI** and the full grant lifecycle (create/revoke/expiry/transfer) stay
  in other PERM epics. This epic detects inconsistencies, invalidates caches, and audits denials but
  does not mutate grants.
- The denial-audit `hasRequiredPermission` flag is supplied by the caller from the computed
  effective surface; wiring `auditAccessAttempt` into the live command dispatch path (so every
  rejected command emits an audit record) is a query/command-layer integration deferred to the
  session/sync epics. The pure decision + record shape is complete and tested here.
- Visibility authoring/revocation commands (PERM-012) and ownership-transfer commands (PERM-013)
  belong to their own capability branches; this epic models ownership change only as the singular
  owner grant changing, which the cache and consistency audit already react to.
- No visible GUI surface was added; rendering the diagnostics/denial models is left to a later UX
  pass so this epic stays a focused, fail-closed core slice.

## Stop conditions

None hit. ADR-014 is Accepted and consistent with the approach; no v1 runtime imports; the hidden
visibility/permission behavior is specified precisely by Contract 3 (Consistency Requirements,
Visibility evaluation order, Session Join Model); the workpack validates; no unrelated overlapping
changes (`git status --short` shows only this epic's files).

## Git

Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic PERM-consistency-cache-invalidation-and-audit`.

- Branch: `epic/PERM-consistency-cache-invalidation-and-audit` (created from `ae781db`, the
  `epic/PERM-base-roles-and-observer-limits` HEAD).
- Commit SHA: recorded at handoff (see final report).
- Final `git status --short`: clean after the epic commit (empty output; recorded in the final
  report).
