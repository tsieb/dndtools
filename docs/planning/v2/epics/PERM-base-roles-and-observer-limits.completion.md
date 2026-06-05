# Completion Evidence: PERM-base-roles-and-observer-limits

Epic: `PERM-base-roles-and-observer-limits` — PERM: Base roles and observer limits
Requirement IDs: **PERM-001**, **PERM-011**
Architecture contract: **Contract 3 — Role, Visibility & Permission Grant Model** (Base Roles).

## Summary

This epic delivers the fail-closed foundation of the v2 permission model: a base-role floor
computed purely from a participant's single base role, and an Observer ceiling that no grant can
ever breach. The computation is pure Processing-Core policy (Contract 1: the GUI consumes the
computed permission set; it never computes or overrides permissions). Grant issuance/management UI
and the full grant lifecycle are intentionally out of scope (later PERM epics); grants are
represented only enough to prove they cannot elevate an Observer.

Fail-closed posture, evaluated in order:

1. **Resolve one base role** (`resolveBaseRole`). Any state that yields zero or multiple base
   roles is normalized to the **least-privileged** interpretation (`observer`). An unauthenticated
   participant infers **no** anonymous role and is denied (PERM-001 AC2).
2. **Compute the base permission floor purely from the role** (`computeBasePermissionFloor`).
   Observer floor = read-only, no character data, grants capped at `read` and never on characters.
3. **Apply grants additively but capped by the role ceiling** (`computeEffectivePermissions`). A
   grant that would exceed the ceiling is **dropped** and recorded; for an Observer every
   write-capable grant and every character grant is dropped, regardless of grant validity.

## Demo

Visible path (DM-facing + actor-filtered):

1. `pnpm v2:dev`, open the app, go to **Settings** (`/settings/`).
2. The **"Your permissions"** panel (`data-testid="permission-summary"`) renders the effective
   permission surface the Processing Core computes for the active actor. As the default DM you see
   role `dm`, `can write`, character data `available`, and the DM-only **Permission consistency**
   audit (`perm-consistency`) reporting "No permission consistency problems detected."
3. Use the header **"View as"** control (`view-as-select`) to switch to **Demo Observer**
   (`actor-observer`). The panel now shows role `observer`, `read-only`, character data `none`, and
   the DM-only consistency audit is **absent** for the observer.
4. Switch to **Demo Player** to see role `player`, `can write`.

The observer read-only / no-character-data surface and the DM consistency audit are also exercised
headlessly by `apps/v2/app/tests/e2e/permission-roles.spec.ts` across the desktop and mobile
platform profiles.

## Files changed

New (Processing Core — pure permission policy):

- `apps/v2/packages/core/src/permissions/base-roles.ts` — base-role resolution
  (`resolveBaseRole`), base permission floor (`computeBasePermissionFloor`), and the ceiling-capped
  effective-permission computation (`computeEffectivePermissions`,
  `computeEffectivePermissionsForActor`). Observer ceiling is the single source of truth here.
- `apps/v2/packages/core/src/permissions/consistency.ts` — DM-facing permission consistency audit
  (`auditPermissionConsistency`, `auditActorGrantConsistency`) that surfaces dropped observer
  write/character grants and ambiguous roles, plus the fail-closed character-data read guard
  (`decideCharacterDataRead`, `readCharacterDataForActor`) for PERM-011 AC2. Messages are generic
  and never leak hidden titles/values.
- `apps/v2/packages/core/tests/base-roles.test.ts` — 30 unit tests, the primary evidence,
  including adversarial/negative cases (see below).
- `apps/v2/app/src/lib/gui/PermissionSummary.svelte` — GUI surface that renders the computed
  permission set + DM consistency audit; computes nothing itself.
- `apps/v2/app/tests/e2e/permission-roles.spec.ts` — visible role/observer behavior e2e.

Modified:

- `apps/v2/packages/core/src/index.ts` — public exports for the new permission-core API.
- `apps/v2/app/src/routes/settings/+page.svelte` — mounts `PermissionSummary`.
- `apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts` — adds a demo Observer participant so the
  observer surface is reachable from "View as".
- `docs/planning/v2/workpack-state.yaml`, `docs/planning/v2/status.yaml`,
  `docs/planning/v2/epics/PERM-base-roles-and-observer-limits.yaml` — generated workpack status
  (via the workpack commands, not hand-edited).

## Traceability

| Requirement            | Acceptance criterion                                       | Implementation                                                                                                                             | Tests                                                                                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PERM-001               | exactly one base role on join                              | `resolveBaseRole`, `computeBasePermissionFloor`                                                                                            | "resolves a single valid role"; "computes the base permission floor purely from the role"                                                                                                                               |
| PERM-001               | unauthenticated → no anonymous role, denied                | `resolveBaseRole` (empty/`null` actor → not authenticated, observer floor); `computeEffectivePermissions` (no grants when unauthenticated) | "an unauthenticated participant infers no anonymous role and is denied"; "an unauthenticated request never gains grants"                                                                                                |
| PERM-001 (adversarial) | zero/multiple/invalid roles fail closed to least privilege | `resolveBaseRole` distinct-role reduction                                                                                                  | "no role record → observer"; "two conflicting role records → LEAST privileged"; "malformed/unknown role → observer"                                                                                                     |
| PERM-011               | observer always read-only, no character data               | `ROLE_FLOORS.observer`, `grantSurvivesCeiling`                                                                                             | "clean observer is read-only with no character data"; "forged write grant dropped"; "stale manager grant dropped"; "character grant dropped"; "character viewer grant dropped"; "malformed capability set fails closed" |
| PERM-011 AC1           | stale write grant ignored + DM consistency error           | grant drop in `computeEffectivePermissions` + `auditPermissionConsistency`                                                                 | "reports an observer write grant as a consistency error"; "reports an observer character grant as a consistency error"                                                                                                  |
| PERM-011 AC2           | observer character read returns no fields                  | `decideCharacterDataRead`, `readCharacterDataForActor`                                                                                     | "denies character data to a clean observer"; "denies character data even with a forged character owner grant"                                                                                                           |

### Adversarial / negative cases (primary evidence)

All resolve to the safe least-privileged result with no character-data leak:

- Observer with a **forged** write grant (`co-editor`) → grant dropped, surface stays read-only.
- Observer with a **stale elevated** grant (widget `manager`) → dropped.
- Observer with a **character** grant (`owner` and `viewer`) → dropped, character data `none`.
- Observer with a **malformed/unknown** capability set → fails closed to write-capable, dropped.
- Participant with **two role records** (conflicting) → least-privileged role; combined with a
  forged write grant → resolves to observer and drops the grant.
- Participant with **no role record** → observer.
- **Unauthenticated** request with grants present for the (empty) id → no role, no grants.
- Character-data read for an observer holding a **forged character owner grant** → returns `null`.

## Tests run

- `pnpm --filter @dndtools/v2-core test` — **434 passed** (38 files), including the new 30
  `base-roles.test.ts` cases.
- `pnpm --filter @dndtools/v2-app test` — **55 passed** (12 files).
- `apps/v2/app/tests/e2e/permission-roles.spec.ts` — **6 passed** (3 tests × desktop + mobile
  chromium).
- `pnpm v2:lint` (boundary lint) — passed.
- `pnpm v2:typecheck` — passed (core `tsc` + app `svelte-check` 0 errors).
- `pnpm v2:gates` — passed (7 gates).
- `pnpm v2:workpack:validate` — passed.

## Quality review

- **Correctness:** Both requirements and all acceptance criteria implemented and tested, with
  adversarial coverage proving the fail-closed guarantees.
- **Architecture:** Pure functions in `@dndtools/v2-core` permissions module; no Svelte/DOM/Node/
  platform/v1 imports (boundary lint passes). GUI consumes computed results only (Contract 1). The
  observer ceiling and read-only floor are computed first and cap grants (Contract 3 Base Roles).
- **Tests:** Unit (30 adversarial-heavy) + e2e (cross-profile) + boundary + typecheck.
- **Accessibility:** The permission panel uses semantic `section`/`h2`/`h3`/`dl` with
  `aria-label`s and `data-testid`s, consistent with the existing Settings surfaces; states are
  text, not color-only.
- **Performance:** O(actors × grants) pure passes over in-memory state; negligible.
- **Security / permissions:** Fail-closed at every branch — unknown role → observer; unknown
  capability set → write-capable (dropped for observers); no grant can elevate an observer; no
  character data leaks. Consistency messages are generic and never expose hidden titles/values.
- **Persistence:** No new durable state shapes; uses the existing `PermissionState`. No migration
  needed (no schema change).
- **Sync/offline:** Computation is pure and local-first; resolves identically on replay. Grants
  carry enough info to re-validate. No network dependency.
- **UX:** Read-only and no-character-data states are explicit and reachable via "View as"; the DM
  sees an actionable, non-leaking remediation list.
- **Maintainability:** Two small, cohesive, fully-typed modules; the observer ceiling lives in a
  single `ROLE_FLOORS.observer` object; read-only capability sets are allowlisted so unknowns fail
  closed.
- **Docs:** This completion file; module-level and function-level rationale comments tie code to
  PERM-001/PERM-011 and Contract 3.

## Known gaps / deferred items

- Grant **issuance/management UI** and the full grant lifecycle (create/revoke/expiry/transfer) are
  deferred to later PERM epics (PERM-004/005/006/013), as scoped by this epic. The grant model is
  represented only enough to prove grants cannot elevate an Observer.
- The `Actor` model still carries a single role field; `resolveBaseRole` accepts a list of role
  records as the normalization choke point so adversarial multi-record state (from future
  sync/storage) resolves the same way. A durable multi-record representation is not introduced here.
- Visibility filtering (PERM-002/003/012) and full consistency coverage (PERM-007 across all
  invalid states) belong to their own capability branches.

## Stop conditions

None hit. ADR-014 is Accepted and consistent with the approach; no v1 runtime imports; no ambiguous
hidden behavior (Contract 3 specifies the observer rules precisely); workpack validates; no
unrelated overlapping changes.

Note: 9 pre-existing `mobile-chromium` e2e failures in `scene-create.spec.ts` and
`scene-accessibility.spec.ts` were confirmed to fail identically on the base commit `1715837`
(verified by stashing this epic's changes), so they are unrelated to this epic. This epic's own e2e
(`permission-roles.spec.ts`) passes on both desktop and mobile profiles.

## Git

Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic PERM-base-roles-and-observer-limits`.

- Branch: `epic/PERM-base-roles-and-observer-limits` (created from `1715837`, the
  `epic/PLAT-quality-gates-and-onboarding` HEAD).
- Commit SHA: recorded at handoff (see final report).
- Final `git status --short`: clean after the epic commit (empty output; recorded in the final
  report).
