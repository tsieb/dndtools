# Completion Evidence: PERM-grants-and-capability-sets

Epic: `PERM-grants-and-capability-sets` — PERM: Grants and capability sets
Requirement IDs: PERM-004, PERM-005, PERM-006, PERM-008, PERM-013
Architecture contracts: Contract 1 (Processing/Display Decoupling), Contract 3 (Role, Visibility & Permission Grant Model)

## Summary

Delivered the grants and capability-sets branch of PERM on top of the prior PERM base-role/observer
model, capability schema, capability cache + invalidation, and denial audit. Added durable
DM-authored grant, revoke, and atomic ownership-transfer commands; per-entity-type capability-set
inheritance, human explanations, and a core-computed effective-permission preview; and a DM grant UI
on Settings that consumes only core-computed models. All writes route through the Processing Core
command model and the durable operation log/storage adapter — no GUI component touches storage.

## Demo path / notes

User-visible flow (DM, default actor):

1. Open `/settings/`. As the DM, the "Grant capability sets" panel (`data-testid="grant-manager"`)
   is visible. Players/observers do not see it (DM-only authoring, Contract 3 Axis 2 rule 2).
2. Choose a player, an entity type (only schema-defined types: character, note, widget, scene,
   timer-widget, plus the field/section variants), an entity id, and a **named** capability set.
3. The **effective-permission preview** (`grant-preview`) shows the set label, explanation, allowed
   operations, the inherited sets it includes, and the sets it excludes — never raw field
   checkboxes. Selecting `combat-participant` summarizes writable combat operations (HP, conditions,
   spell slots) and shows `owner`/`backstory-editor` as excluded (PERM-008 AC1). A set not defined
   for the entity type is never offered (PERM-008 AC2).
4. Click **Grant** to issue a durable grant; it appears in **Active grants** with its player, entity,
   and optional expiry.
5. For a character, click **Transfer owner** to move ownership to the selected player; the previous
   owner's `owner` grant is atomically revoked so exactly one owner ever exists (PERM-013).
6. Click **Revoke** on any grant to remove it; the player immediately loses that capability.

Requirement IDs exercised by the demo: PERM-004, PERM-005, PERM-006 (inheritance shown in preview
and enforced in effective surface), PERM-008, PERM-013.

Intentionally deferred (out of scope for this epic): a dedicated character/note editor UI that
consumes these grants at the entity level (the grant model and effective-surface computation are
complete and unit-tested; wiring them into per-entity editors belongs to CHAR/CONTENT epics); and
surfacing expiry countdowns in the player's own permission summary.

## Tests run

- `pnpm --filter @dndtools/v2-core test` — 45 files, **523 passed** (488 baseline + 35 new across
  grant commands, capability sets, and grant cache invalidation).
- `pnpm --filter @dndtools/v2-app test` — 12 files, **55 passed** (app unit + boundary lint tests).
- `pnpm --filter @dndtools/v2-app exec playwright test` — **both** `desktop-chromium` AND
  `mobile-chromium`: **132 passed, 18 skipped (pre-existing intentional project-scoped skips),
  0 failed**. The 10 new grant-management tests pass on both projects. (Baseline before this epic was
  122 passed / 18 skipped / 0 failed; the delta is exactly the 10 new grant tests across 2 projects.)
- `pnpm v2:typecheck` — core + app, 0 errors.
- `pnpm v2:lint` (boundary lint) — passed; no GUI component reaches storage/native directly.
- `pnpm v2:gates` — passed (7 gates owned/budgeted/wired).
- `pnpm v2:workpack:validate` — passed before and after `complete` (no drift).

## Traceability (requirement → code → tests)

| Req | Code | Tests |
| --- | --- | --- |
| PERM-004 (grant one set to one player on one entity; durable; fail-closed; expiry) | `permissions/grant-records.ts` (`validateGrantRecord`, `buildGrantRecord`, `upsertGrant`, `isGrantActive`); `commands/grant.ts` (`handleGrantCapabilitySet`, `handleRevokeGrant`); `schemas/commands.ts` (`grantCapabilitySetInputSchema`, `revokeGrantInputSchema`); `state/permission-state.ts` (`updatedAt`, `expiresAt` on `PermissionGrant`); dispatch + types wiring | `tests/grant-commands.test.ts` (durable op, expiry inert, non-DM/observer/unknown-actor/unknown-set/no-schema/past-expiry/malformed-expiry rejections, revoke, idempotent re-grant); `tests/grant-cache-invalidation.test.ts` (grant/revoke invalidate the affected player) |
| PERM-005 (sets are system-schema-defined per entity type, not raw field lists) | reused `permissions/capability-schema.ts`; `permissions/capability-sets.ts` (`listGrantableCapabilitySets`, `describeCapabilitySet`); validation rejects unknown/undefined sets | `tests/capability-sets.test.ts` (named sets listed, undefined sets not grantable, no-schema type offers nothing); `tests/grant-commands.test.ts` (unknown/no-schema rejections) |
| PERM-006 (capability-set inheritance in effective surface, capped by role + expiry) | `permissions/capability-sets.ts` (`inheritedCapabilitySets`, `capabilitySetGrants`); `permissions/grants.ts` (`hasGrantedCapability`, `effectiveCapabilitySetsForActorOnEntity` apply inheritance + skip expired); `permissions/base-roles.ts` (`computeEffectivePermissions` excludes expired grants, still caps by ceiling) | `tests/capability-sets.test.ts` (owner⇒combat/backstory/viewer; viewer confers no write; per-entity graphs); `tests/grant-cache-invalidation.test.ts` (owner grant on observer dropped, no inherited elevation) |
| PERM-008 (DM grant UI: named sets + explanations + effective preview; visible surface; core-computed) | `permissions/capability-sets.ts` (`previewGrantEffect`); `app/.../gui/GrantManager.svelte`; `app/.../routes/settings/+page.svelte` (DM-only mount) | `tests/capability-sets.test.ts` (preview: combat operations + exclusions; owner excludes nothing; viewer read-only); `app/tests/e2e/grant-management.spec.ts` (named sets, preview, unavailable-set-not-offered) on both projects |
| PERM-013 (atomic ownership transfer; revoke prior singular grant; fail-closed) | `permissions/grant-records.ts` (`validateOwnershipTransfer`, `singularGrantsOnEntity`, `computeOwnershipTransfer`); `commands/grant.ts` (`handleTransferOwnership`); `schemas/commands.ts` (`transferOwnershipInputSchema`) | `tests/grant-commands.test.ts` (atomic single-owner result, two-owner-impossible, non-singular/non-DM/observer rejections); `tests/grant-cache-invalidation.test.ts` (transfer invalidates both prior + new owner); `app/tests/e2e/grant-management.spec.ts` (transfer leaves exactly one owner) on both projects |

## Quality review

- **Correctness**: Every mapped acceptance criterion is implemented and tested, including the
  adversarial/negative cases the epic called out (forged/expired/unknown-capability grants, observer
  elevation attempts, transfer atomicity, inheritance + role-cap interaction, cache invalidation on
  grant/transfer).
- **Architecture**: Durable mutations enter only as Processing Core commands; the grant UI dispatches
  domain commands and reads core-computed view models. Capability sets remain schema-defined named
  options per entity type — no parallel schema, no raw field lists. The prior capability cache and
  invalidation are reused (grant fingerprint now also keys on expiry). Boundary lint stays green: no
  GUI access to storage/native; no new platform-access exception needed (grants flow through the
  existing `persistFullState` permission document + operation log).
- **Tests**: Unit tests are the primary evidence (35 new core tests). Full Playwright on both
  desktop-chromium and mobile-chromium (the Settings grant UI renders identically on both profiles,
  so no profile-scoped skip was needed).
- **Accessibility**: The grant form uses native `<label>`/`<select>`/`<input>` controls, an
  `aria-label`'d region, `role="alert"` for errors, and keyboard-operable buttons; it works on the
  compact profile (verified by the mobile-chromium e2e run).
- **Performance**: All new computation is pure and O(grants); no new persistence hot-path cost beyond
  the existing permission-document write.
- **Security/permissions**: Fail-closed throughout — non-DM authors, observers as targets, unknown
  actors/entity types/capability sets, and past/malformed expiries are all rejected. Expired grants
  are inert. Transfers cannot produce zero or two owners.
- **Persistence / sync / offline**: Grant/transfer/revoke each append a durable `permission.*`
  operation to the local-first operation log and persist the permission document via the storage
  adapter; nothing requires the network.
- **UX**: Empty states (no players, no grants), inline error messages, and a clear preview of what a
  grant allows/excludes are all present.
- **Maintainability**: New modules are cohesive and pure (`capability-sets.ts`, `grant-records.ts`,
  `commands/grant.ts`); no speculative abstractions or unrelated refactors.
- **Docs**: This completion file plus thorough module/JSDoc comments tying code to requirements.

## Status command

Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic PERM-grants-and-capability-sets`.

## Git

- Branch: `epic/PERM-grants-and-capability-sets` (created from `epic/PERM-consistency-cache-invalidation-and-audit` HEAD `27775b1`, NOT master).
- Commit: see the epic commit on this branch (recorded at handoff).
- Final `git status --short`: clean after the completion commit (recorded in the handoff report).

## Known gaps / deferred

- Per-entity editor surfaces (character sheet, note section editor) that consume these grants at the
  field level are deferred to CHAR/CONTENT epics; the grant model + effective surface are complete.
- Expiry is enforced at evaluation time and surfaced in the active-grants list; a live countdown in
  the player's own permission summary is deferred.

## Stop conditions

None hit. The v2 stack ADR is present and consistent; no v1 runtime imports; no ambiguous hidden
behavior; the workpack validates; and the working tree carried no unrelated overlapping changes.
