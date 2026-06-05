# CHAR-combat-resources-and-advancement — Completion Evidence

Epic: `CHAR-combat-resources-and-advancement` — CHAR: Combat, resources, and advancement
Requirements: CHAR-007, CHAR-008, CHAR-009
Branch: `epic/CHAR-combat-resources-and-advancement` (from `epic/CHAR-collaboration-and-dm-edits` HEAD `35b8e1b`)

This epic adds the combat-resource, spell/resource, and advancement capability branch on top of the
existing CHAR character model. A character OWNER or authorized COMBAT PARTICIPANT updates combat
resources (HP, temporary HP, conditions, death saves, spell slots, class resources, concentration)
DURING a session — gated on the session workflow being `active` (the CMD-active-session-control guard,
reused) and fail-closed for anyone else. The OWNER manages structured spell/slot/class-resource state,
triggers DETERMINISTIC short/long REST RECOVERY, and sees an append-only EXPENDITURE history. Level-up /
ADVANCEMENT (XP or milestone) uses the STAGED-THEN-COMMIT pattern: the staged draft lives on the durable
character (so it restores across restarts with its validation state), and the character revision is
finalized only when VALIDATION passes — an invalid/incomplete advancement never partially mutates the
character.

All resource math, rest recovery, and advancement validation are pure deterministic Processing-Core
functions; the GUI dispatches command intents and renders computed models; durable writes go through the
op-log/lifecycle, never directly from the GUI (ADR-014 / Architecture Contract 1). The structured state
EXTENDS the existing model (`Character.resources` plus advancement on `Character.data`) — no parallel
model. No v1 runtime imports; the boundary lint stays green.

## Demo

Path: start the app (`pnpm v2:dev`) and open the **Characters** section (`/characters`). Use the header
"View as" control to switch between the DM and the demo players.

1. **CHAR-007 — combat resources during a session (owner / combat-participant / fail-closed).** As the
   DM, quick-create a `player-visible` character (e.g. "Pip", HP 10) and grant ownership to *Demo Player*
   in the **Collaborative editing** card. In **Combat & resources**, note that the combat controls are
   disabled with a "Session not active" message. Open the home Command Center (`/`) and click the
   **active** session workflow button, then return to `/characters`. The combat controls are now enabled:
   apply `-4` HP and see `HP 6/10` and a **Damage 4** entry in the expenditure history. A player without a
   grant (e.g. *Demo Player 2*) sees no combat controls at all (fail closed), and the Processing Core
   re-rejects any such command. Attempting to change the character name as a combat-participant is
   rejected (`character.edit-field` requires `owner`).
2. **CHAR-008 — structured spells/resources + deterministic rest recovery + history.** As the owner, open
   **Manage spells, slots & resources**, declare 2 level-1 spell slots, then (with the session active)
   **Cast** one slot to see `1/2`. Click **Long rest** to deterministically restore the slot to `2/2`.
   A short rest restores short-rest class resources but leaves spell slots and long-rest resources alone.
   Every change is recorded in the **Expenditure history** disclosure.
3. **CHAR-009 — advancement with validation before finalization.** As the owner, open **Advancement** and
   click **Level up (milestone)**. Enter only a class and Save: a validation issue ("Enter the hit points
   gained…") appears and **Finalize level-up** stays disabled (no partial mutation). Enter the hit points
   and Save: validation passes, finalize enables, and committing advances the character to **Level 2**
   (max HP increases) and clears the staged draft. XP mode is gated on the cumulative XP threshold for the
   next level (set XP, then **Level up (XP)** becomes available). Reopening the app restores an in-progress
   staged advancement with its validation state intact.

Requirement IDs exercised by the demo: CHAR-007, CHAR-008, CHAR-009.

## Requirement traceability

### CHAR-007 — combat resources during a session (owner or combat participant)

- Pure policy: `apps/v2/packages/core/src/state/character-resources.ts` — `applyHpDelta` (temp-HP-first
  damage), `setTempHp`, `setCondition`, `recordDeathSave` (bounded), `setConcentration`, `expendSpellSlot`,
  `expendClassResource`, and the append-only `ResourceLedgerEntry` expenditure history.
- Durable command: `apps/v2/packages/core/src/commands/character-resources.ts` —
  `handleUpdateCombatResource` reuses the CMD-active-session-control guard (`requireActiveSession`, fail
  closed when `session.workflow !== 'active'`) and the owner-OR-combat-participant authority check
  (`actorMayUpdateCombatResources`, fail closed for unauthorized players and always for observers).
- Schema: `updateCombatResourceInputSchema` (discriminated union) in `apps/v2/packages/core/src/schemas/commands.ts`.
- Wiring: `apps/v2/packages/core/src/commands/dispatch.ts`, `apps/v2/packages/core/src/commands/types.ts`.
- GUI: `apps/v2/app/src/lib/gui/CharacterCombatResources.svelte` (session-gated controls; the core
  re-enforces authority and session gating on dispatch).
- Tests: `apps/v2/packages/core/tests/character-combat-resources-and-advancement.test.ts` (CHAR-007
  describe block); `apps/v2/app/tests/e2e/character-combat-resources-and-advancement.spec.ts`.
- AC1 (combat-participant updates HP, shared widgets refresh): owner/combat-participant HP update accepted
  while active, durable op appended, `character.resource-changed` event emitted (the widget bindings read
  the same canonical `combat`/`resources`). AC2 (the same player may NOT change the name): rejected
  `actor-not-authorized` — name edits require `owner`, not combat-participant.

### CHAR-008 — structured spell/resource state, rest recovery, expenditure history

- Pure policy: `apps/v2/packages/core/src/state/character-resources.ts` — `setSpellSlots`,
  `setClassResource` (with `recharge` rest declaration), `setSpell` (prepared/known), `applyRest`
  (deterministic short/long recovery), and the ledger.
- Durable commands: `apps/v2/packages/core/src/commands/character-resources.ts` — `handleSetSpellSlots`,
  `handleSetClassResource`, `handleSetCharacterSpell`, `handleRestCharacter`, all OWNER-only
  (`actorMayManageResources`).
- Schemas: `setSpellSlotsInputSchema`, `setClassResourceInputSchema`, `setCharacterSpellInputSchema`,
  `restCharacterInputSchema` in `apps/v2/packages/core/src/schemas/commands.ts`.
- GUI: `apps/v2/app/src/lib/gui/CharacterCombatResources.svelte` (owner-only manage disclosure + rest
  buttons + expenditure history disclosure).
- Tests: `apps/v2/packages/core/tests/character-combat-resources-and-advancement.test.ts` (CHAR-008
  describe block); `apps/v2/app/tests/e2e/character-combat-resources-and-advancement.spec.ts`.
- AC1 (cast expends the appropriate slot/resource, history records it): covered by spell-slot expenditure
  + ledger assertions. AC2 (rest applies recovery rules deterministically): covered by long-rest (restores
  slots/long-rest resources/HP, clears death saves & concentration) and short-rest (restores only
  short-rest resources) tests, plus a determinism re-run.

### CHAR-009 — level-up / advancement (XP or milestone) with validation before finalization

- Pure policy: `apps/v2/packages/core/src/state/character-advancement.ts` — `XP_THRESHOLDS` + `xpForLevel`,
  `checkAdvancementEligibility` (XP threshold vs milestone), `buildAdvancementDraft`,
  `mergeAdvancementChoices`, `validateAdvancement` (required class/HP, subclass at L3, ASI/feat at ASI
  levels), `commitAdvancement` (mutates the character ONLY when valid — no-partial-commit),
  `writeAdvancementDraft`/`clearAdvancementDraft` (staged draft on the durable character).
- Durable commands: `apps/v2/packages/core/src/commands/character-advancement.ts` —
  `handleSetCharacterXp`, `handleOpenAdvancement` (eligibility fail-closed), `handleSetAdvancementChoices`
  (staged, not finalized), `handleCommitAdvancement` (validation fail-closed), `handleCancelAdvancement`;
  all OWNER-only.
- Schemas: `setCharacterXpInputSchema`, `openAdvancementInputSchema`, `setAdvancementChoicesInputSchema`,
  `commitAdvancementInputSchema`, `cancelAdvancementInputSchema` in
  `apps/v2/packages/core/src/schemas/commands.ts`.
- GUI: `apps/v2/app/src/lib/gui/CharacterAdvancement.svelte` (staged choices, validation issues, finalize
  disabled until valid).
- Tests: `apps/v2/packages/core/tests/character-combat-resources-and-advancement.test.ts` (CHAR-009
  describe block); `apps/v2/app/tests/e2e/character-combat-resources-and-advancement.spec.ts`.
- AC1 (invalid/incomplete choices block finalization): commit rejected `draft-incomplete`, level/maxHp/
  revision unchanged, staged draft retained (no partial commit) — asserted in unit + e2e. AC2 (DM reviews/
  edits a level-up, attributed and synced): the DM bypasses owner authority as administrator and the
  commit appends an attributed durable op; the finalized revision records the actor. AC3 (advancement in
  progress restored after restart with validation state): the staged draft lives on the durable character;
  a serialize/restore round-trip test confirms the draft + recomputed validation survive.

## Files changed

Added (core):

- `apps/v2/packages/core/src/state/character-resources.ts`
- `apps/v2/packages/core/src/state/character-advancement.ts`
- `apps/v2/packages/core/src/commands/character-resources.ts`
- `apps/v2/packages/core/src/commands/character-advancement.ts`
- `apps/v2/packages/core/tests/character-combat-resources-and-advancement.test.ts`

Added (app):

- `apps/v2/app/src/lib/gui/CharacterCombatResources.svelte`
- `apps/v2/app/src/lib/gui/CharacterAdvancement.svelte`
- `apps/v2/app/tests/e2e/character-combat-resources-and-advancement.spec.ts`

Modified:

- `apps/v2/packages/core/src/state/character-state.ts` (added the optional `resources` block to `Character`)
- `apps/v2/packages/core/src/schemas/commands.ts` (CHAR-007/008/009 command input schemas)
- `apps/v2/packages/core/src/commands/types.ts` (new `CoreCommand` types + `CoreEvent` variants)
- `apps/v2/packages/core/src/commands/dispatch.ts` (dispatch wiring for the new commands)
- `apps/v2/packages/core/src/index.ts` (public exports for the new state/policy + schemas)
- `apps/v2/app/src/routes/characters/+page.svelte` (mounts the new combat-resources + advancement surfaces)
- `docs/planning/v2/epics/CHAR-combat-resources-and-advancement.yaml`,
  `docs/planning/v2/status.yaml`, `docs/planning/v2/workpack-state.yaml` (generated workpack status)
- `docs/planning/v2/epics/CHAR-combat-resources-and-advancement.completion.md` (this file)

## Tests run

- `pnpm lint` — PASS (full repo: `eslint .` + `lint:navigation` + `lint:tokens` + `audit:repo`; 132 Svelte
  files checked; repo-boundary + CI guardrail tests green).
- `pnpm docs:validate` — PASS.
- `pnpm v2:typecheck` — PASS (0 errors).
- `pnpm v2:lint` — PASS (v2 boundary lint; no v1 runtime imports, no core→GUI imports).
- `pnpm v2:gates` — PASS (7 gates owned/budgeted/wired).
- Core unit suite (`pnpm --filter @dndtools/v2-core test`) — PASS (65 files, 854 tests, including the 21
  new CHAR-007/008/009 tests).
- App unit suite (`pnpm --filter @dndtools/v2-app test`) — PASS (12 files, 55 tests).
- Full Playwright e2e (`pnpm --filter @dndtools/v2-app exec playwright test`) on BOTH projects
  (desktop-chromium AND mobile-chromium) — PASS (238 passed, 18 intentional project-scoped skips, 0
  failed; +8 from the 230 baseline = 4 new tests × 2 projects).
- `pnpm v2:workpack:validate` — PASS before and after `pnpm v2:workpack:complete` (no drift).

## Quality review

- **Correctness:** every mapped acceptance criterion is implemented and covered by tests, including
  fail-closed and no-partial-commit negative cases. Resource math (temp-HP-first damage, bounded death
  saves, slot/resource expenditure) and deterministic rest recovery are unit-tested; advancement
  validation, eligibility gating, and no-partial-commit are unit + e2e tested.
- **Architecture:** pure Processing-Core policy (`state/character-resources.ts`,
  `state/character-advancement.ts`) with deterministic functions; durable mutation only via commands that
  append op-log entries; the structured state EXTENDS `Character` (no parallel model); the session-active
  guard and grant inheritance are reused, not reinvented. ADR-014 boundaries hold (no v1 imports, no
  core→GUI imports; `pnpm v2:lint` green).
- **Tests:** 21 new core unit tests + 4 e2e tests across both Playwright profiles; authority matrix
  (owner / combat-participant / unauthorized / observer), session-active gating, deterministic rest, and
  advancement validation + restart-restore are all asserted.
- **Accessibility:** the new surfaces use labelled form controls, `role="alert"` for errors, disabled
  fieldsets when the session is inactive, and `<details>`/`<fieldset>` semantics; they render the same
  stacked UI on desktop and compact profiles (verified on mobile-chromium).
- **Performance:** all policy is O(n) over a character's resources/choices; no new heavy work on render.
- **Security / permissions:** combat-resource writes fail closed for non-owner/non-participant actors and
  for observers; spell/resource management and advancement are owner-only (DM bypasses as administrator);
  the GUI hints are non-authoritative — the core re-enforces on dispatch.
- **Persistence / sync / offline:** every accepted mutation appends a durable `character.*` op with
  before/after revisions; the staged advancement draft persists on the durable character and restores
  across restart (serialize/restore test); all behavior is local-first and offline-safe.
- **UX:** empty/inactive/error states are handled (no characters, session inactive, validation issues,
  disabled finalize); the expenditure history and validation issues are surfaced inline.
- **Maintainability:** small typed modules, no speculative abstractions, no unrelated refactors; new
  exports are namespaced and documented.
- **Docs:** this completion file plus inline module documentation; generated workpack updated via the
  programmatic commands.

## Gaps / deferred

- The prototype rule system is intentionally small (point-buy-free advancement: required class + HP, a
  subclass at L3, an ASI/feat at the ASI levels; a 5e-style XP table). It is data-driven and extensible;
  a full class/feature engine is out of scope for this slice.
- The combat-participant grant is not yet offered as a dedicated button in the GUI (the collaboration card
  grants `owner`, which inherits combat-participant); the e2e exercises owner + unauthorized, and the core
  unit tests cover the explicit combat-participant grant. No requirement AC depends on a GUI
  combat-participant grant control.
- Spell-slot/class-resource widget bindings reuse the existing CHAR-006 binding bridge over the canonical
  `combat`/`resources`; no new widget binding selectors were added.

## Status command

Workpack status: `complete` (set via `pnpm v2:workpack:complete -- --epic CHAR-combat-resources-and-advancement`),
followed by `pnpm v2:workpack:validate` (no drift).

## Git

- Branch: `epic/CHAR-combat-resources-and-advancement` (from `epic/CHAR-collaboration-and-dm-edits` HEAD
  `35b8e1b`).
- Commit: see the final epic commit on this branch (`feat(v2): complete CHAR-combat-resources-and-advancement epic`).
- Final `git status --short`: clean (no untracked or unstaged files) after the epic commit.
