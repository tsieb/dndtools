# CHAR-character-creation-and-drafts — Completion Evidence

Epic: `CHAR-character-creation-and-drafts` — CHAR: Character creation and drafts
Requirements: CHAR-001, CHAR-002, CHAR-013
Branch: `epic/CHAR-character-creation-and-drafts` (from `epic/MAP-pois-routes-fog-and-combat-overlays` HEAD `f121bb7`)

This is the FIRST CHAR epic. It establishes the foundational, typed, extensible character state model
that the later CHAR epics (sheets, leveling, inventory, conditions, sharing) build on, modeling exactly
what these three requirements need — no speculative fields.

## Demo

Path: start the app (`pnpm v2:dev`) and open the new **Characters** section (`/characters`, also reachable
from the primary nav and via the legacy aliases `/party` and `/pcs`). Use the header "View as" control to
switch between the DM and the demo players.

1. **CHAR-001 — DM quick-create (dm-only default, bindable).** As the DM, in "Quick-create a character",
   enter a name/HP/AC and submit. The NPC appears in the roster. It defaults to **DM-only** visibility:
   switch "View as" to _Demo Player_ and the NPC is **omitted** from the roster entirely (not redacted).
2. **CHAR-013 — draft ownership (exactly one owner, atomic transfer).** As the DM, in "Character drafts",
   create a draft for _Demo Player_. Pick a transfer target (_Demo Player 2_) and press **Transfer**: the
   prior owner is atomically replaced, leaving exactly one owner. "View as" _Demo Player_ now shows the
   "ask your DM" empty state (can no longer edit); _Demo Player 2_ can resume it.
3. **CHAR-002 — guided, resumable PC creation (owner-only).** As the owning player, work the guided flow
   (Identity → Ability scores point-buy → Class). Save a step, reload the app — the completed step and any
   unresolved validation issues are restored. A non-owner player sees no draft fields. Complete every valid
   step and **Finalize**: the PC enters the roster (visible to its owner).

## Requirement traceability

| Requirement                                                                                  | Implementation                                                                                                                                                                                                                                                                                                                                                                                                 | Tests                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CHAR-001 — DM quick-create (simplified stats, combat, visibility defaults, widget-bindable)  | `state/character-state.ts` (`buildQuickCreatedCharacter`, fail-closed `dm-only` default), `commands/character.ts` (`handleQuickCreateCharacter`, `handleSetCharacterCombat`), `queries/character-bindings.ts` (bridge to the existing `resolveWidgetBinding`), `queries/character-query.ts` (actor-filtered, fail-closed), GUI `CharacterQuickCreate.svelte` + `CharacterRoster.svelte`                        | core `character-creation-and-drafts.test.ts` (quick-create bindable AC1; dm-only omitted-from-player AC2; field-hidden; non-DM reject); e2e `character-creation-and-drafts.spec.ts` (NPC dm-only not visible to player)                                                                                            |
| CHAR-002 — guided structured PC creation (rules, options, validation, resumable; owner-only) | `state/character-draft-flow.ts` (pure steps/options/validation incl. point-buy budget, `computeDraftCompleteness`), `state/character-state.ts` (`applyDraftStep`, resumable progress), `commands/character.ts` (`handleUpdateCharacterDraftStep`, `handleFinalizeCharacterDraft`, owner-only fail-closed), `queries/character-query.ts` (`getDraftForActor` non-owner → null), GUI `CharacterDraftFlow.svelte` | core test (per-step + point-budget validation; non-owner/observer rejected AC3; resume round-trip AC2; finalize gated on validity AC1; draft is a character entity not a grant AC4; owner-visible finalized PC); e2e (resume round-trip, non-owner cannot edit, finalize into roster, over-budget blocks finalize) |
| CHAR-013 — draft ownership: create/assign/transfer/revoke, exactly one owner                 | `state/character-state.ts` (`CharacterDraft.ownerActorId` singular field; `transferDraftOwnership` atomic reassignment — same singular-ownership invariant as PERM-013), `commands/character.ts` (`handleCreateCharacterDraft`/`handleTransferCharacterDraft`/`handleRevokeCharacterDraft`, DM-only), GUI `CharacterDraftManager.svelte`                                                                       | core test (one owner on create AC1; atomic transfer leaves one owner + prior owner cannot edit AC2; reducer never zero/two owners; non-DM/unknown-draft rejects; revoke); e2e (transfer leaves exactly one owner)                                                                                                  |

## Architecture / reuse

- **Pure Processing-Core policy (Contract 1).** Character reducers, the draft-flow validator, and the
  ownership transfer are pure deterministic functions. The GUI dispatches command intents and renders
  computed query results; durable writes go through the storage adapter + command lifecycle, never from
  the GUI. Every mutation appends a durable `character.*` operation to the sync log.
- **Reused the PERM-013 singular-ownership pattern.** Draft ownership is a single `ownerActorId` scalar,
  so the draft structurally has exactly one owner; `transferDraftOwnership` revokes the prior owner and
  assigns the new owner in one atomic step (never zero or two), mirroring `computeOwnershipTransfer`.
- **Reused the widget binding model/resolver (Contract 4).** `buildCharacterDataEnvironment` projects each
  character into the existing `WidgetDataEnvironment`, so a Scene widget binds to `character:<id>` /
  `combat.hp` and the same `resolveWidgetBinding` decides the hidden/conflicted/missing fail-closed states
  and redacts DM-only fields. No widget-layer character code was added.
- **Reused the visibility fail-closed default.** Quick-create visibility defaults to `dm-only`; the
  actor-filtered character query omits (not redacts) characters the actor cannot see and strips declared
  `dmOnlyFields` for non-DM. A finalized PC is `shared` with its owner so the owner sees their own PC.
- **Durable slice + migration.** Added `characters` to `CoreStateSlice`, `DURABLE_STATE_DOCUMENT_IDS`,
  `TARGET_SCHEMA_VERSIONS`, the persist-boundary schema, the IndexedDB storage adapter (safe-default
  hydration for older vaults), runtime seeding, and diagnostics schema-health.
- **Navigation IA.** Flipped the canonical `characters` section to `released` and scaffolded `/characters`
  plus the `/party` and `/pcs` legacy alias redirect stubs; updated the route/alias/nav audits and tests.

## Tests run

- Core unit (Vitest): `pnpm --filter @dndtools/v2-core test` → **63 files, 808 passed** (15 new character
  tests; updated 4 nav/route tests for the released Characters section).
- App unit (Vitest): `pnpm --filter @dndtools/v2-app exec vitest run` → **12 files, 55 passed** (route-audit
  and alias-audit gates updated for `/characters`, `/party`, `/pcs`).
- E2E (Playwright), BOTH projects (`desktop-chromium` AND `mobile-chromium`):
  `pnpm --filter @dndtools/v2-app exec playwright test` → **222 passed, 18 skipped, 0 failed**
  (base was 212 passed; +10 new character tests). The 18 skips are the pre-existing intentional
  project-scoped skips. The new spec runs on both profiles (stacked list/form UI, no profile fork).
- Boundary lint: `pnpm v2:lint` → passed (no v1 runtime imports; core imports no GUI/DOM/storage).
- Typecheck: `pnpm v2:typecheck` → 0 errors in both packages.
- Workpack: `pnpm v2:workpack:validate` → passed (before and after `complete`).

## Quality review

- **Correctness:** every mapped acceptance criterion is implemented and test-covered (see traceability).
- **Architecture:** ADR-014 honored (client/static SvelteKit app, package-local pure core, durable writes
  through the adapter). Contracts 1/3/4 honored. No v1 imports. Boundary lint green.
- **Tests:** unit (pure reducers/validators incl. fail-closed + exactly-one-owner negatives), integration
  (command dispatch through state), e2e on both profiles, plus the binding round-trip.
- **A11y:** forms use labelled controls; step navigation uses `aria-current="step"`; validation issues use
  `role="alert"`; status uses `role="status"`. Reuses the app's existing route-landmark/h1 a11y shell.
- **Performance:** pure synchronous reducers/validators; no new heavy work on the dispatch hot path.
- **Security/permissions:** DM-only authoring; owner-only draft editing (non-owner/observer rejected
  `not-draft-owner`); visibility fail-closed before any non-DM read; observers get no character data.
- **Persistence:** new durable `characters` document persisted via the adapter + operation-log invariant;
  safe-default hydration for vaults written before this slice; registered for migration planning.
- **Sync/offline:** every mutation appends a durable, replayable `character.*` operation (single-device
  local op-log per ADR-014); no cloud/CRDT introduced.
- **UX:** empty states (no players, no drafts, no characters, finalized), error messages surfaced from
  rejections, resumable progress with per-step done/valid indicators.
- **Maintainability:** cohesive typed modules; the model is designed for the 5 remaining CHAR epics to
  extend (open `data` block, combat block, step list) without reshaping the documents. No unrelated refactors.
- **Docs:** this completion file; thorough module/JSDoc comments tracing to requirements and contracts.

## Files changed

New (core): `state/character-state.ts`, `state/character-draft-flow.ts`, `commands/character.ts`,
`queries/character-bindings.ts`, `queries/character-query.ts`, `apps/v2/packages/core/tests/character-creation-and-drafts.test.ts`.
Modified (core): `commands/types.ts`, `commands/dispatch.ts`, `commands/helpers.ts`, `schemas/commands.ts`,
`schemas/platform-service.ts`, `migration/schema-versions.ts`, `queries/navigation-sections.ts`,
`testing/fixtures.ts`, `index.ts`; updated tests `command-availability.test.ts`,
`navigation-ia-validation.test.ts`, `navigation-sections.test.ts`, `route-aliases.test.ts`.

New (app): `routes/characters/+page.svelte` + `+page.ts`, `routes/party/+page.ts`, `routes/pcs/+page.ts`,
`lib/gui/CharacterQuickCreate.svelte`, `lib/gui/CharacterDraftManager.svelte`,
`lib/gui/CharacterDraftFlow.svelte`, `lib/gui/CharacterRoster.svelte`,
`apps/v2/app/tests/e2e/character-creation-and-drafts.spec.ts`.
Modified (app): `lib/canvas-runtime/runtime.svelte.ts`, `lib/platform/storage/scene-store.ts`,
`lib/platform/diagnostics-context.ts`; updated test `tests/unit/route-audit.test.ts`.

Planning: `docs/planning/v2/workpack-state.yaml`, `docs/planning/v2/status.yaml`,
`docs/planning/v2/epics/CHAR-character-creation-and-drafts.yaml` (via workpack commands).

## Known gaps / deferred

- The `owner` capability-set grant on a finalized character is **CHAR-003** (not this epic). Here a
  finalized PC is `shared` with its creating player so the owner can see/use it; party-wide visibility and
  combat-participant player writes are **CHAR-007/011**. The DM-only `character.set-combat` command is the
  foundation those epics extend.
- The PC-creation rule set is a small, self-contained prototype (identity / point-buy abilities / class),
  intentionally not a full 5e engine; later epics add steps/rules in `character-draft-flow.ts`.

## Workpack status

Workpack status: `complete` (set via `pnpm v2:workpack:complete -- --epic CHAR-character-creation-and-drafts`).

## Stop conditions

None hit.

## Git

- Branch: `epic/CHAR-character-creation-and-drafts`
- Commit SHA: see the epic commit on this branch (recorded at handoff).
- Final `git status --short`: clean (recorded at handoff after committing all code, tests, GUI, docs, and
  regenerated workpack files).
