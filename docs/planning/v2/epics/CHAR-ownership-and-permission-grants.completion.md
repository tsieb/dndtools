# Completion Evidence: CHAR-ownership-and-permission-grants

- Epic: `CHAR-ownership-and-permission-grants` — CHAR: Ownership and permission grants
- Requirement IDs: CHAR-003, CHAR-010
- Architecture contract: Contract 3 (Role, Visibility & Permission Grant Model)
- Branch: `epic/CHAR-ownership-and-permission-grants` (created from the prior epic HEAD `b5af829`, NOT master)

## Summary

This epic is COMPOSITION of the already-built PERM machinery with the CHAR field-edit authority — it
does not build a parallel grant system.

- CHAR-003 reuses the PERM singular-ownership invariant + capability-set grant + atomic ownership
  transfer (`apps/v2/packages/core/src/permissions/grant-records.ts`,
  `apps/v2/packages/core/src/commands/grant.ts`). The new work proves, with hard assertions, that the
  DM role floor retains FULL administrative authority after granting `owner` to a player (the DM
  still edits every field — narrative, combat, and DM-only — after the grant and after a transfer).
- CHAR-010 adds a pure, deterministic FIELD-SCOPED authority policy
  (`apps/v2/packages/core/src/permissions/character-field-authority.ts`) that maps each character
  field path to the MINIMUM capability set that may write it (narrative → `backstory-editor`, combat
  → `combat-participant`, identity/other → `owner`, fail-closed). The field-edit command
  (`apps/v2/packages/core/src/commands/character.ts` `handleEditCharacterField`) is now DRIVEN by this
  policy and by the existing PERM grant inheritance + the character's `dmOnlyFields` metadata, so a
  `backstory-editor` may edit ONLY the narrative surface and never a combat/identity/DM-only field,
  and a DM-only field's value never appears in their view (reusing the PERM visibility-filter / the
  CHAR-014 actor-filtered projection).

## Files changed

Core (Processing-Core policy + commands + queries):

- `apps/v2/packages/core/src/permissions/character-field-authority.ts` (NEW) — pure field-scope
  policy: `requiredCapabilityForCharacterField`, `isBackstoryEditorField`, `BACKSTORY_EDITOR_DATA_KEYS`.
- `apps/v2/packages/core/src/commands/character.ts` — `handleEditCharacterField` authority is now
  field-scoped by capability set; the DM-only check runs first with a generic message (non-probeable);
  an EXPIRED grant is inert (passes `now` to `hasGrantedCapability`, fail-closed).
- `apps/v2/packages/core/src/queries/character-collaboration.ts` — the collaborative view always
  exposes the narrative field surface (`BACKSTORY_EDITOR_DATA_KEYS`) so a backstory-editor/owner can
  author an as-yet-empty narrative field; per-field DM-only visibility still applied (non-leak intact).
- `apps/v2/packages/core/src/queries/character-query.ts` — `redactCharacter` now strips the `data.` /
  `combat.` scope prefix from declared `dmOnlyFields` so the correct `data`/`combat` key is removed
  for a non-DM actor (fixes a non-leak gap where `data.dmNotes` was not actually redacted).
- `apps/v2/packages/core/src/index.ts` — exports the new field-authority module.

GUI (dispatch intents + render computed/filtered models only):

- `apps/v2/app/src/lib/gui/CharacterCollaboration.svelte` — the DM grant control now picks a NAMED
  capability set (`owner` or the field-scoped `backstory-editor`); the per-field edit gate is
  field-scoped via `requiredCapabilityForCharacterField` (a backstory-editor sees edit inputs only on
  narrative fields). No direct state writes — every mutation dispatches a core command.

Tests:

- `apps/v2/packages/core/tests/character-ownership-and-permission-grants.test.ts` (NEW) — unit
  coverage for both stories.
- `apps/v2/app/tests/e2e/character-ownership-and-permission-grants.spec.ts` (NEW) — e2e coverage on
  BOTH Playwright projects.

Planning (via workpack commands only — not hand-edited for status):

- `docs/planning/v2/workpack-state.yaml`, `docs/planning/v2/status.yaml`,
  `docs/planning/v2/epics/CHAR-ownership-and-permission-grants.yaml`
- `docs/planning/v2/epics/CHAR-ownership-and-permission-grants.completion.md` (this file)

## Traceability

### CHAR-003 (CHAR-003-S01) — DM assigns exactly one `owner`; DM retains full authority

- Implementation: PERM grant + singular-ownership transfer reused from
  `apps/v2/packages/core/src/commands/grant.ts` and
  `apps/v2/packages/core/src/permissions/grant-records.ts`; the DM bypass / role-floor retention is
  inherent in `apps/v2/packages/core/src/permissions/grants.ts` (`hasGrantedCapability` returns true
  for the DM) and enforced in `handleEditCharacterField`
  (`apps/v2/packages/core/src/commands/character.ts`).
- Unit tests (`apps/v2/packages/core/tests/character-ownership-and-permission-grants.test.ts`):
  - AC1 — granting `owner` confers owner-inherited capabilities; exactly one owner grant; durable op.
  - the owner grant is singular (audit reports no multiple-owner problem for a single owner).
  - a SECOND distinct owner is flagged `multiple-character-owners` by
    `auditEntityPermissionConsistency` (Contract 3 invalid state).
  - DM-RETAINS-ADMIN — after granting `owner` to a player, the DM still edits a narrative field, a
    combat field, AND the DM-only field; the DM-only edit is attributed to the DM.
  - AC2 / transfer — atomic ownership transfer leaves exactly one owner; the DM still edits the
    DM-only field after the transfer.
  - granting `owner` is DM-authored only (a player self-grant is rejected fail-closed).
- e2e (`apps/v2/app/tests/e2e/character-ownership-and-permission-grants.spec.ts`):
  - "granting owner to a player leaves exactly one owner and is recorded".
  - "the DM still edits EVERY field after granting owner to a player".

### CHAR-010 (CHAR-010-S02) — `backstory-editor`/`owner` field-scoped editing, no DM-only access

- Implementation: `apps/v2/packages/core/src/permissions/character-field-authority.ts` (field-scope
  policy) drives `handleEditCharacterField` in
  `apps/v2/packages/core/src/commands/character.ts`; non-leak in the read views via
  `apps/v2/packages/core/src/queries/character-query.ts` and
  `apps/v2/packages/core/src/queries/character-collaboration.ts` (which reuse the PERM
  visibility-filter contract — `apps/v2/packages/core/src/permissions/visibility-filter.ts`).
- Unit tests (`apps/v2/packages/core/tests/character-ownership-and-permission-grants.test.ts`):
  - field-authority policy mapping (narrative→backstory-editor, combat→combat-participant, else→owner).
  - AC1 — a backstory-editor edits a narrative (relationships) field; accepted + attributed.
  - a backstory-editor edits EVERY narrative field but a combat field and an identity (name) field
    are rejected fail-closed (canonical values unchanged).
  - AC2 / non-leak — a backstory-editor cannot write the DM-only field; the DM-only value never
    appears in `getCharacterForActor` or `getCollaborativeCharacterView` (value/path/history absent;
    asserted via `JSON.stringify` not containing the value or `dmNotes`).
  - the DM-only rejection is INDISTINGUISHABLE from a missing-capability rejection (same message).
  - an `owner` (inherits backstory-editor) edits narrative + combat + identity, but still cannot write
    a DM-only field.
  - an ungranted player and an observer cannot edit any field (fail-closed).
  - an EXPIRED backstory-editor grant is inert — the narrative edit is rejected.
- e2e (`apps/v2/app/tests/e2e/character-ownership-and-permission-grants.spec.ts`):
  - "a backstory-editor may edit a narrative field".
  - "a backstory-editor cannot edit a combat field (no edit input is offered)" — also asserts the
    identity field is read-only.
  - "a DM-only field never appears in the backstory-editor view (non-leak)".

## Demo path

1. `pnpm v2:dev`, open `/characters/`.
2. As the DM, quick-create a player-visible character (e.g. a sidekick "Pip").
3. In the "Collaborative editing" card, choose a capability set (`Owner` or `Backstory Editor`) and a
   player, then click "Grant".
4. Grant `Owner` to Demo Player: the owner line shows exactly one owner. The DM can still edit every
   field (narrative, combat, identity), demonstrating DM-retains-admin (CHAR-003).
5. Grant `Backstory Editor` to Demo Player, then use the "view as" header control to view as Demo
   Player: narrative fields (backstory, personality, relationships, goals, bonds, flaws, history,
   player notes) offer edit inputs; combat and identity fields are read-only; no DM-only field appears
   (CHAR-010).

## Tests run

- `pnpm lint` (FULL: `eslint . && lint:navigation && lint:tokens && audit:repo`): PASS (eslint clean;
  navigation lint passed 132 files; token lint passed 132 files; repo-boundary + ci-guardrails 5/5).
- `pnpm docs:validate`: PASS (run after writing this completion doc).
- `pnpm v2:typecheck`: PASS (0 errors; core `tsc` + app `svelte-check` 656 files 0 errors 0 warnings).
- `pnpm v2:lint` (boundary): PASS ("v2 boundary lint passed").
- `pnpm v2:gates`: PASS ("7 gate(s) owned, budgeted, and wired").
- Core unit suite (`pnpm --filter @dndtools/v2-core test`): PASS — 66 files, 869 tests.
- App unit suite (`pnpm --filter @dndtools/v2-app test`): PASS — 12 files, 55 tests.
- Full Playwright (`pnpm --filter @dndtools/v2-app exec playwright test`) on BOTH `desktop-chromium`
  AND `mobile-chromium`: PASS — 248 passed, 18 intentional project-scoped skips, 0 failed (the
  documented green baseline of 238 + the 10 new owner/grant tests across both projects).
- `pnpm v2:workpack:validate`: PASS before and after `complete` (no drift).

## Quality review

- Correctness: both stories' acceptance criteria implemented and proven with hard assertions, including
  fail-closed negatives (wrong-scope edit, DM-only write, ungranted/observer, expired grant).
- Architecture integrity: pure Processing-Core policy (field-authority, capability resolution,
  visibility are deterministic pure functions); the GUI dispatches command intents and renders the
  computed/filtered model; durable writes go through the op-log via the command handler, never from
  the GUI. v2 boundary lint green; no v1 runtime imports.
- Tests: unit (core) + e2e (both Playwright profiles) + permission/security (field-scope + non-leak).
- Accessibility: the grant control and field rows are labeled form controls; the flow renders the same
  on desktop and compact profiles (asserted on `mobile-chromium`).
- Performance: pure set-membership lookups; no new IO, timers, or heavy computation.
- Security / permissions: enforced in the data layer before render; fail-closed; DM-only status is not
  probeable (uniform rejection message); a non-DM never receives DM-only field value/path/author.
- Persistence / sync: edits remain durable `character.*` ops; grants remain durable `permission.*`
  ops; no new storage path.
- Sync/offline: unchanged — single-device local op-log; no remote behavior introduced.
- UX: a backstory-editor sees edit inputs only where they may write; read-only fields show values.
- Maintainability: one small typed policy module; the field-edit handler is driven by it; no parallel
  grant system; no unrelated refactors.
- Docs: this completion file; inline module/handler documentation references the requirement IDs.

## Gaps / deferred

- The `CharacterQuickCreate` GUI form does not author `data.*` narrative fields or `dmOnlyFields`, so
  the e2e non-leak test asserts the structural absence of any `dmNotes` surface. The load-bearing
  non-leak proof (a character WITH an authored DM-only field whose value never appears for a
  backstory-editor across both read views) lives in the core unit suite, per existing repo convention.
- A general DM grant UI for arbitrary capability sets already exists on Settings (PERM
  `GrantManager.svelte`); this epic adds the in-context character grant on the Characters page only.

## Status command run

- `pnpm v2:workpack:set-status -- --epic CHAR-ownership-and-permission-grants --status active` (at start)
- `pnpm v2:workpack:complete -- --epic CHAR-ownership-and-permission-grants` (at completion)
- `pnpm v2:workpack:validate` (after complete — no drift)

Workpack status: `complete` (set via `pnpm v2:workpack:complete -- --epic CHAR-ownership-and-permission-grants`).

## Git

- Branch: `epic/CHAR-ownership-and-permission-grants`
- Base: prior epic HEAD `b5af829` (NOT master)
- Final `git status --short` (after the single epic commit):

```
(clean)
```
