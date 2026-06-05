# SES-combat — Completion Evidence

Epic: `SES-combat` — SES: Combat
Requirement IDs: SES-002, SES-006
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 3 (Role, Visibility &
Permission Grant Model); Contract 4 (Embed/Link/Project Rules — encounter links by reference) + the
standing v2 architecture contracts and ADR-014.
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic SES-combat`.

## Summary

This is the FIRST SES epic. It establishes a clean, cohesive, extensible session combat-tracker +
encounter model that later SES epics build on, by REUSING the existing building blocks rather than
introducing parallel systems:

- **SES-002 (run combat):** the DM runs combat with INITIATIVE ORDER, ROUNDS, and TURNS via a PURE
  deterministic turn/round state machine (`advanceTurn` wraps to the next round at the end of the
  order; `orderInitiative` sorts by initiative descending with a deterministic, stable, recorded
  tie-break). Each combatant carries per-combatant HP / temp HP / CONDITIONS / CONCENTRATION / DEATH
  SAVES using the CHAR-007 resource SHAPES; an NPC/monster uses the same shape inline, and a character
  combatant seeds from the live character combat block. STAT-BLOCK PREVIEWS are a read-only projection;
  the durable ENCOUNTER LOG records every combat event in order. Running combat is gated on the session
  workflow being `active` (the CMD-active-session-control guard, reused) and is DM-run; a player
  combatant may edit only a character combatant they hold `combat-participant` on (CHAR-007 authority,
  reused). Fails closed otherwise and for unauthorized actors.
- **SES-006 (build encounters):** the DM builds an ENCOUNTER with COMBATANT SELECTION, deterministic
  CHALLENGE GUIDANCE (a pure CR/difficulty calculator over the selected combatants + party — no ambient
  randomness), TERRAIN NOTES, LEGENDARY/LAIR ACTIONS, LOOT, and GENERATED SESSION LOG LINKS. The
  encounter is durable and modeled consistent with the declared `encounter` Vault Object subtype
  (`title`/`difficulty`/`participantIds` map onto that subtype's frontmatter contract via
  `encounterObjectFrontmatter`). Session-log links are BY REFERENCE (target ids only) — never a clone
  (Contract 4); a `note` link is validated to resolve to a real content item, fail-closed. Starting
  combat from an encounter flows its combatant selection into the tracker by reference (no clone).

All policy is PURE deterministic Processing-Core code; durable writes funnel through new `combat.*` and
`encounter.*` commands (op-log + lifecycle), so the durable write re-checks authority and the
session-active gate fail-closed. The GUI dispatches command intents and renders the actor-filtered
computed models; it never touches storage (Architecture Contract 1). Boundary lint stays green; no v1
imports.

## Reused existing building blocks (no re-implementation)

- **Session workflow + active-session guard (CMD-active-session-control):** every combat-running
  command requires `state.session.workflow === 'active'` (the same guard CHAR-007 reuses).
- **CHAR-007 combat-resource shapes:** `apps/v2/packages/core/src/state/character-resources.ts`
  (`DeathSaveState`, `ConcentrationState`, `DEATH_SAVE_MAX`, the HP-burns-temp-HP and
  death-save-bound rules) are reused for combatant resources; the tracker mirrors a character's
  combat block at start.
- **CHAR-007 combat-participant authority:** `hasGrantedCapability(..., 'combat-participant')` decides
  whether a non-DM may edit a character combatant.
- **CONTENT-013 `encounter` Vault Object subtype:** the durable encounter is modeled consistent with
  the declared subtype in `apps/v2/packages/core/src/state/vault-object-schema.ts`; the encounter is
  NOT cloned into a separate object record.
- **CONTENT content items + op-log/lifecycle/PERM:** session-log links reference content items by id;
  durable writes use `appendOperationDraft` and the command-result lifecycle; visibility/permission
  follows the standing PERM model (encounter prep is DM-only; the combat tracker is actor-filtered).
- **NAV registry + alias machinery:** the `session` canonical section flips to `released`, reusing the
  existing alias-redirect stub pattern for `/sessions` and `/play`.

## Files changed

New core model + policy:

- `apps/v2/packages/core/src/state/combat-tracker.ts` — SES-002 durable combat state + the pure
  initiative/round/turn state machine (deterministic stable tie-break; `advanceTurn` wraps).
- `apps/v2/packages/core/src/state/encounter.ts` — SES-006 durable encounter model + the pure
  deterministic CR/difficulty challenge calculator + encounter→subtype frontmatter projection.

New core commands:

- `apps/v2/packages/core/src/commands/combat.ts` — `combat.start` / `combat.advance-turn` /
  `combat.apply-resource` / `combat.end` handlers (DM-run + combat-participant authority + active gate).
- `apps/v2/packages/core/src/commands/encounter.ts` — `encounter.build` / `encounter.update` handlers
  (DM-only; note-link reference validation fail-closed).

New core queries:

- `apps/v2/packages/core/src/queries/combat-tracker-view.ts` — the single actor-filtered combat tracker
  read model (hidden combatants omitted or replaced by a DM-approved placeholder; DM hidden count).
- `apps/v2/packages/core/src/queries/encounter-query.ts` — the single actor-filtered encounter read
  model (DM sees all with recomputed guidance; non-DM gets an empty list — DM prep, fail closed).

Core wiring + extension:

- `apps/v2/packages/core/src/commands/types.ts` — `encounters` slice on `CoreStateSlice`; SES command
  types, events, and `encounter-not-found` / `combatant-not-found` rejection codes.
- `apps/v2/packages/core/src/commands/dispatch.ts` — dispatch cases for the new commands; retired the
  placeholder `session.update-combat`.
- `apps/v2/packages/core/src/schemas/commands.ts` — SES-002/SES-006 input schemas; removed the
  placeholder `updateSessionCombatInputSchema`.
- `apps/v2/packages/core/src/state/session-state.ts` — `SessionCombatState` now owned by the combat
  tracker (re-exported here for existing importers).
- `apps/v2/packages/core/src/commands/session-control.ts` — archive snapshot deep-clones via
  `ensureSessionCombatState`; removed `handleUpdateSessionCombat`.
- `apps/v2/packages/core/src/commands/helpers.ts` — `ensureSessionState` hydrates combat via
  `ensureSessionCombatState`; added `ensureEncounterStateSlice`.
- `apps/v2/packages/core/src/migration/schema-versions.ts` — `encounters` durable state document +
  target schema version.
- `apps/v2/packages/core/src/queries/navigation-sections.ts` — `session` canonical section →
  `released`.
- `apps/v2/packages/core/src/testing/fixtures.ts` — `buildInitialState` seeds the `encounters` slice.
- `apps/v2/packages/core/src/index.ts` — public exports for the new model/queries/schemas.

App (GUI + storage + runtime):

- `apps/v2/app/src/routes/session/+page.svelte`, `apps/v2/app/src/routes/session/+page.ts` — the
  Session combat surface route.
- `apps/v2/app/src/routes/sessions/+page.ts`, `apps/v2/app/src/routes/play/+page.ts` — legacy alias
  redirect stubs (NAV-002) to `/session/`.
- `apps/v2/app/src/lib/gui/CombatTracker.svelte` — run-combat GUI (start/advance/apply/end + log).
- `apps/v2/app/src/lib/gui/EncounterBuilder.svelte` — build-encounter GUI with live challenge guidance.
- `apps/v2/app/src/lib/platform/storage/scene-store.ts` — persist/hydrate the `encounters` document +
  combat-tracker hydration.
- `apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts` — seed/hydrate the `encounters` slice + combat.

Tests:

- `apps/v2/packages/core/tests/combat-tracker.test.ts` — SES-002 unit coverage.
- `apps/v2/packages/core/tests/encounter.test.ts` — SES-006 unit coverage.
- `apps/v2/app/tests/e2e/session-combat-and-encounters.spec.ts` — SES-002/SES-006 e2e (both projects).
- Updated for the new model / released Session section:
  `apps/v2/packages/core/tests/active-session-control.test.ts`,
  `apps/v2/packages/core/tests/command-availability.test.ts`,
  `apps/v2/packages/core/tests/command-lifecycle.test.ts`,
  `apps/v2/packages/core/tests/map-query.test.ts`,
  `apps/v2/packages/core/tests/navigation-ia-validation.test.ts`,
  `apps/v2/packages/core/tests/navigation-sections.test.ts`,
  `apps/v2/packages/core/tests/participant-status.test.ts`,
  `apps/v2/packages/core/tests/route-aliases.test.ts`,
  `apps/v2/app/tests/unit/command-center-store.test.ts`,
  `apps/v2/app/tests/unit/route-audit.test.ts`.

Planning (generated by the workpack commands):

- `docs/planning/v2/workpack-state.yaml`, `docs/planning/v2/status.yaml`,
  `docs/planning/v2/epics/SES-combat.yaml`.

## Traceability (requirement → code → tests)

### SES-002-S01 — run combat (SES-002)

- Initiative/round/turn state machine: `apps/v2/packages/core/src/state/combat-tracker.ts`
  (`orderInitiative`, `advanceTurn`, `activeCombatant`) →
  `apps/v2/packages/core/tests/combat-tracker.test.ts` ("pure turn/round state machine" — advance +
  wrap, deterministic stable tie-break) and ("run combat (commands)" — start persists order/round,
  advance wraps to next round).
- Per-combatant HP/conditions/concentration/death saves + encounter log:
  `apps/v2/packages/core/src/commands/combat.ts` (`handleApplyCombatResource`) →
  `apps/v2/packages/core/tests/combat-tracker.test.ts` ("applies HP/condition/death-save/concentration
  and logs each event", "damage consumes temporary HP first").
- Authority + session-active gating fail-closed:
  `apps/v2/packages/core/src/commands/combat.ts` (`requireActiveSession`, `requireDm`,
  `actorMayEditCombatant`) → `apps/v2/packages/core/tests/combat-tracker.test.ts` ("fails closed when
  the session is not active and when a non-DM runs combat"; "lets an authorized combat-participant edit
  their character combatant, but fails closed otherwise").
- Stat-block previews + hidden-combatant non-leak (AC4):
  `apps/v2/packages/core/src/queries/combat-tracker-view.ts` →
  `apps/v2/packages/core/tests/combat-tracker.test.ts` ("actor-filtered combat tracker view" — omit /
  placeholder hidden combatants; DM sees all + hidden count) and
  `apps/v2/app/tests/e2e/session-combat-and-encounters.spec.ts` (player sees no encounter prep).
- End combat persists the durable log: `handleEndCombat` →
  `apps/v2/packages/core/tests/combat-tracker.test.ts` ("ends combat and persists the durable encounter
  log").
- Visible flow: `apps/v2/app/src/lib/gui/CombatTracker.svelte`,
  `apps/v2/app/src/routes/session/+page.svelte` →
  `apps/v2/app/tests/e2e/session-combat-and-encounters.spec.ts` (SES-002 run-combat e2e, both projects).

### SES-006-S02 — build encounters (SES-006)

- Deterministic CR/difficulty challenge guidance: `apps/v2/packages/core/src/state/encounter.ts`
  (`challengePointsForCr`, `partyDeadlyThreshold`, `computeEncounterChallenge`) →
  `apps/v2/packages/core/tests/encounter.test.ts` ("deterministic challenge guidance" — pure,
  monotone, escalating bands, PCs not threats).
- Combatant selection / terrain / legendary-lair actions / loot saved with the encounter:
  `apps/v2/packages/core/src/commands/encounter.ts` (`handleBuildEncounter`) →
  `apps/v2/packages/core/tests/encounter.test.ts` ("builds a durable encounter ...").
- Generated session-log links BY REFERENCE (Contract 4) + fail-closed missing target:
  `handleBuildEncounter` + `validateNoteLinks` →
  `apps/v2/packages/core/tests/encounter.test.ts` ("rejects a session-log NOTE link whose target does
  not exist"; "links a generated session-log NOTE by reference").
- Encounter → combat flow (AC2): `apps/v2/packages/core/src/commands/combat.ts` (`handleStartCombat`
  with `encounterId`) → `apps/v2/packages/core/tests/encounter.test.ts` ("flows the encounter combatant
  selection + party into session combat"; "rejects starting combat from a non-existent encounter").
- DM-only encounter prep (actor-filtered): `apps/v2/packages/core/src/queries/encounter-query.ts` →
  `apps/v2/packages/core/tests/encounter.test.ts` ("shows the DM every encounter ... but a non-DM sees
  none").
- Visible flow: `apps/v2/app/src/lib/gui/EncounterBuilder.svelte` →
  `apps/v2/app/tests/e2e/session-combat-and-encounters.spec.ts` (SES-006 build + guidance e2e, both
  projects).

## Demo notes

Run `pnpm v2:dev` and open the app.

- SES-006 (build encounters): navigate to `/session/` as the DM. In "Build encounter", set a title and
  party, add combatants (name + CR + quantity + HP), and watch the challenge band under "Challenge:"
  update deterministically as you add threats. Click "Build encounter"; it appears under "Encounters"
  with its difficulty badge.
- SES-002 (run combat): on the Command Center (`/`), click the `active` session workflow control. Back
  on `/session/`, select the encounter under "Run encounter" and click "Roll initiative". The
  initiative order renders with the active combatant badged; "Next turn" advances and wraps to the next
  round; enter an HP change and "Apply HP" to a combatant; the encounter log records each event. "End
  combat" preserves the log. Switch the header "view as" to Demo Player: the encounter builder is
  absent (DM prep is DM-only) and the combat tracker shows only what the player may see.

## Quality review

- **Correctness:** every mapped acceptance criterion is implemented and unit-tested, including the
  deterministic state machine + tie-break, CR guidance bands, encounter→combat flow, and fail-closed
  negatives. 1178/1178 core tests pass; 55/55 app unit tests pass.
- **Architecture:** pure Processing-Core policy (state machine, CR guidance, log derivation, hidden
  redaction) with durable writes only through `combat.*`/`encounter.*` commands + op-log; the GUI
  dispatches intents and renders computed models. v2 boundary lint passes; no v1 runtime imports.
- **Tests:** unit (core), e2e on BOTH Playwright projects, plus boundary/route-audit/nav gates updated.
- **Accessibility:** combat/encounter surfaces use labeled controls, `aria-label`ed sections,
  `role="alert"` errors, and an ordered initiative list; rendered identically (stacked) on desktop and
  compact profiles (e2e runs on both).
- **Performance:** all combat/guidance math is integer-exact pure functions over small in-memory data;
  no new heavy work on the dispatch path.
- **Security / permissions:** combat is DM-run; a non-DM may edit only a character combatant they hold
  `combat-participant` on; observers never write. Encounter prep is DM-only. The combat tracker view
  omits/redacts hidden combatants (no name/stat/id/log leak). All re-enforced in the core, fail-closed.
- **Persistence:** the new `encounters` durable document and the combat-tracker slice persist through
  the storage adapter and hydrate fail-closed (`ensureEncounterState`, `ensureSessionCombatState`);
  durable mutations append op-log records.
- **Sync/offline:** every accepted mutation appends an operation with before/after revision and
  dependency metadata (encounter links and `note:<id>` dependencies); the model is single-device
  local-first, consistent with ADR-014 (no cloud/CRDT introduced).
- **Migration:** `encounters` added to `DURABLE_STATE_DOCUMENT_IDS` + `TARGET_SCHEMA_VERSIONS`; older
  vaults hydrate to a safe empty encounter slice and a safe empty combat tracker.
- **UX:** empty/idle/ended states are explicit; combat is gated with a visible "needs active session"
  note; challenge guidance updates live.
- **Maintainability:** small typed modules; the combat resource block reuses CHAR-007 shapes; no
  speculative fields; the placeholder `session.update-combat` command was retired in favor of the real
  combat commands.
- **Docs:** this completion file; inline module docs reference the requirement ids and contracts.

## Tests run

- `pnpm lint` (eslint + lint:navigation + lint:tokens + audit:repo): PASS.
- `pnpm docs:validate`: PASS (see handoff).
- `pnpm v2:typecheck`: PASS (0 errors). `pnpm v2:lint` (boundary): PASS. `pnpm v2:gates`: PASS.
- Core unit suite (`pnpm --filter @dndtools/v2-core test`): 1178 passed.
- App unit suite (`pnpm --filter @dndtools/v2-app test`): 55 passed.
- `pnpm --filter @dndtools/v2-app exec playwright test` (desktop-chromium AND mobile-chromium): 354
  passed, 18 skipped, 0 failed.
- `pnpm v2:workpack:validate`: PASS (before and after `complete`).

## Known gaps / deferred items

- The encounter's TERRAIN NOTES are recorded on the encounter; they are not yet auto-pushed as a map
  overlay when combat starts (the encounter→combat flow seeds combatants + the encounter reference;
  richer terrain projection is later SES/MAP work).
- The encounter→Vault-Object frontmatter projection (`encounterObjectFrontmatter`) is provided as a
  pure helper consistent with the CONTENT-013 subtype, but auto-materializing an encounter as a
  note-backed object record is deferred to the CONTENT object epics (no clone introduced here).
- Legendary/lair actions and loot are durable free-form records; structured automation of them during
  combat is later SES work.
- No stop condition was hit.

## Git evidence

- Branch: `epic/SES-combat` (created from `epic/CONTENT-visibility-and-embeds` HEAD `5f41562`).
- Implementation commit SHA: `0293929` (this docs SHA-record commit follows it).
- Final `git status --short`: clean.

```
(clean)
```
