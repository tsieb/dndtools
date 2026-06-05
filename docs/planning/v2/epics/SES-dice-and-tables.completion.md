# SES-dice-and-tables — Completion Evidence

Epic: `SES-dice-and-tables` — SES: Dice and tables
Requirement IDs: SES-003, SES-008
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 2 (Cloud Sync & Offline
Model — recorded, reproducible roll outcomes); Contract 3 (Role, Visibility & Permission Grant Model);
Contract 4 (Embed/Link/Project Rules — append to notes by reference) + the standing v2 architecture
contracts and ADR-014.
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic SES-dice-and-tables`.

## Summary

This epic delivers the SES dice-and-tables capability branch by REUSING the existing building blocks
(the seeded PRNG, the durable session roll-history slot, the `dice-table` Vault Object subtype, the
content write path, the command-lifecycle/op-log, and PERM) rather than introducing parallel systems:

- **SES-003 (dice):** a participant rolls DICE EXPRESSIONS, MACROS, INLINE ROLLS, and ROLLABLE TABLES
  through the SHARED `dice.roll` / `dice.roll-table` commands. The EXPRESSION PARSER is PURE and
  DETERMINISTIC (`parseDiceExpression`: text → AST; same text always parses to the same AST; supports
  `NdM`, flat modifiers, `+`/`-`, implicit single die `d20`, and keep-highest/lowest `kh`/`kl` for
  advantage/disadvantage). A MALFORMED expression is rejected FAIL-CLOSED (`invalid-dice-expression`) —
  never silently evaluated. CRUCIAL (Contract 2): the random OUTCOME is computed EXACTLY ONCE in the
  Processing Core from a recorded SEED (`evaluateRoll` threads the seeded PRNG from `state/prng.ts` and
  records every individual die with a kept flag, the kept values, the modifier, and the total), then
  STORED in the durable session ROLL HISTORY. Replaying `seed` + `expression` reproduces the IDENTICAL
  result, so every participant sees the SAME roll and nothing is re-rolled per device/render.
- **SES-008 (tables + generators):** the DM draws a RANDOM TABLE — a declared `dice-table` Vault Object
  (`dice` expression + `entries` rows) — as a session asset. `resolveTableDraw` rolls the table's dice
  deterministically from the recorded seed and maps the total onto the rows (clamped into range,
  fail-closed). The generated RESULT is ATTRIBUTED (actor + role + the source table id + the selected
  row are recorded in history) and may OPTIONALLY be APPENDED to a SESSION NOTE via `dice.append-to-note`
  — the append goes through the EXISTING content write path (the `updateContentItem` reducer +
  `content.update-item` body edit), so no unrelated data is cloned and the note history (revision bump +
  `content.append-roll` op + `content.item-changed` event) records the actor and the source roll.

All policy is PURE deterministic Processing-Core code; durable writes funnel through new `dice.*`
commands (op-log + lifecycle), so the durable write re-checks authority + the session-active gate
fail-closed. Roll VISIBILITY composes with PERM (Contract 3): only the DM may author a `dm-only` (secret)
roll, a `dm-only` roll is OMITTED from a player's history by the actor-filtered read model
(`getDiceHistoryForActor`), and a `shared` roll reaches only the listed participants. The GUI
(`DiceTools.svelte`) dispatches command intents and renders the actor-filtered computed model; it never
touches storage (Architecture Contract 1). Boundary lint stays green; no v1 imports.

## Reused existing building blocks (no re-implementation)

- **Seeded PRNG (MAP-004):** `apps/v2/packages/core/src/state/prng.ts` (`createRng`/`normalizeSeed`,
  mulberry32) is the SAME deterministic generator the dice evaluator threads — no new RNG, no
  `Math.random`.
- **Durable session roll history:** the existing `SessionState.diceHistory` slot and `SessionDiceRoll`
  record in `apps/v2/packages/core/src/state/session-state.ts` are EXTENDED (new fields are optional, so
  legacy records hydrate safely) rather than replaced. The legacy `session.record-dice` manual-total
  command is preserved intact (used by session-lifecycle/archive tooling).
- **`dice-table` Vault Object subtype (CONTENT-013):** the declared subtype schema
  (`apps/v2/packages/core/src/state/vault-object-schema.ts`, `dice` + `entries` frontmatter) is the
  contract a rollable table is read against; `dice.roll-table` reads `content.create-object` items by
  reference, never cloning.
- **Content write path + append-by-reference:** `dice.append-to-note` reuses `updateContentItem`
  (`apps/v2/packages/core/src/state/content.ts`) and the same authorized-editor rule + `content.*`
  op/event pattern as `content.update-item`.
- **Command-lifecycle + op-log + active-session guard (CMD-active-session-control):** every dice command
  requires `state.session.workflow === 'active'` and funnels through `appendOperationDraft` and the
  command-result lifecycle (the same guard combat reuses).
- **PERM visibility/authority:** `hasGrantedCapability` decides whether a non-DM may draw a table or
  append to a note; the actor-filtered history mirrors the SES-002 combat-tracker-view fail-closed shape.
- **Session route + "view as" control:** `DiceTools` mounts in the existing `/session` Session section
  (already `released` by SES-combat); the e2e uses the existing `view-as-select` to prove actor
  filtering. No new navigation section was added.

## Files changed

New (core):

- `apps/v2/packages/core/src/state/dice.ts` — the PURE deterministic dice engine: expression parser
  (text → AST, malformed rejected fail-closed), recorded roll evaluator (deterministic from a recorded
  seed; every die recorded), rollable-table resolution from a recorded draw, and pure macro resolution.
- `apps/v2/packages/core/src/commands/dice.ts` — the shared dice commands: `dice.roll` (expression /
  macro / inline), `dice.roll-table` (draw a `dice-table` asset), `dice.append-to-note` (append a
  recorded result through the content write path). Authority + session-active + visibility fail closed.
- `apps/v2/packages/core/src/queries/dice-history.ts` — THE single actor-filtered roll-history read
  model (`getDiceHistoryForActor`): a secret roll is omitted from a player; a shared roll reaches only
  the listed participants; the DM sees all + the hidden count + the recorded seed.

New (app + tests):

- `apps/v2/app/src/lib/gui/DiceTools.svelte` — the Session dice + tables surface (roll an expression
  with a visibility selector, draw a table, append a result to a note, and the actor-filtered history).
- `apps/v2/packages/core/tests/dice-engine.test.ts` — unit tests for the pure parser (deterministic +
  malformed-reject), the recorded/reproducible roll evaluator, rollable-table resolution, and macros.
- `apps/v2/packages/core/tests/dice-commands.test.ts` — command + history-visibility tests (recorded
  roll reproduces; malformed rejected; secret/shared visibility fail-closed; table draw + attribution;
  append-to-note through the content write path; legacy `session.record-dice` still works).
- `apps/v2/app/tests/e2e/session-dice-and-tables.spec.ts` — Playwright e2e on BOTH projects (roll +
  recorded history; malformed reject; secret-roll hidden from a player; draw a table + append to a note,
  verified on the durable content document).

Modified (core):

- `apps/v2/packages/core/src/state/session-state.ts` — extended `SessionDiceRoll` with the recorded
  outcome (seed, dice, kept, modifier, per-term breakdown), visibility, table source/row, append
  attribution, and op id (all optional for back-compat); added `DiceRollVisibility` / `DiceRollSourceKind`.
- `apps/v2/packages/core/src/schemas/commands.ts` — added `rollDiceInputSchema`, `rollTableInputSchema`,
  `appendRollToNoteInputSchema`.
- `apps/v2/packages/core/src/commands/types.ts` — added the `dice.roll` / `dice.roll-table` /
  `dice.append-to-note` command variants, the `session.roll-recorded` event, and the new rejection codes
  (`invalid-dice-expression`, `unknown-macro`, `not-a-dice-table`, `invalid-dice-table`, `roll-not-found`).
- `apps/v2/packages/core/src/commands/dispatch.ts` — wired the three dice handlers into the dispatch table.
- `apps/v2/packages/core/src/index.ts` — exported the dice engine, the history query, and the schemas.

Modified (app + planning):

- `apps/v2/app/src/routes/session/+page.svelte` — mounts `DiceTools` in the Session section.
- `docs/planning/v2/epics/SES-dice-and-tables.yaml`, `docs/planning/v2/status.yaml`,
  `docs/planning/v2/workpack-state.yaml` — regenerated by the workpack status/complete commands (not
  hand-edited).

## Traceability (requirement → code → tests)

### SES-003 (SES-003-S01)

- AC1 (a valid `2d20kh1+5` records dice, kept values, modifier, total, actor, timestamp):
  `parseDiceExpression` + `evaluateRoll` in `apps/v2/packages/core/src/state/dice.ts`; `handleRollDice`
  in `apps/v2/packages/core/src/commands/dice.ts` (builds the `SessionDiceRoll`). Tests:
  `apps/v2/packages/core/tests/dice-engine.test.ts` ("records dice, kept values, modifier, and total")
  and `apps/v2/packages/core/tests/dice-commands.test.ts` ("records dice, kept values, modifier, total,
  actor, and timestamp"); e2e `apps/v2/app/tests/e2e/session-dice-and-tables.spec.ts` ("the DM rolls an
  expression").
- AC2 (an invalid expression records no roll + returns a validation message): the fail-closed parser +
  the `invalid-dice-expression` rejection in `handleRollDice`. Tests:
  `apps/v2/packages/core/tests/dice-engine.test.ts` ("rejects malformed expressions fail-closed");
  `apps/v2/packages/core/tests/dice-commands.test.ts` ("rejects a malformed expression fail-closed");
  e2e ("a malformed expression is rejected fail-closed and records no roll").
- AC3 (a private / DM-only roll omits the hidden expression, values, total, reason from player history):
  `resolveRollVisibility` in `apps/v2/packages/core/src/commands/dice.ts` + `getDiceHistoryForActor` in
  `apps/v2/packages/core/src/queries/dice-history.ts`. Tests:
  `apps/v2/packages/core/tests/dice-commands.test.ts` ("a DM-only (secret) roll is omitted from a player
  history"; "a player cannot author a DM-only (secret) roll"); e2e ("a DM-only secret roll is hidden
  from a player history").
- AC4 (a shared roll reaches only the listed participants): `resolveRollVisibility` (shared list) +
  `actorCanSeeRoll`. Test: `apps/v2/packages/core/tests/dice-commands.test.ts` ("a shared roll reaches
  only the listed participants").
- Reproducibility (Contract 2 — computed once, recorded, replays identically; no re-roll): `evaluateRoll`
  records the seed; `rollExpression` replays. Tests: `apps/v2/packages/core/tests/dice-engine.test.ts`
  ("REPRODUCES the identical result from the recorded seed"); `apps/v2/packages/core/tests/dice-commands.test.ts`
  ("REPRODUCES the recorded result by replaying the stored seed").

### SES-008 (SES-008-S02)

- AC1 (drawing a rollable table records the roll + selected row in session history): `resolveTableDraw`
  in `apps/v2/packages/core/src/state/dice.ts`; `handleRollTable` in
  `apps/v2/packages/core/src/commands/dice.ts` (reads the declared `dice-table` frontmatter). Tests:
  `apps/v2/packages/core/tests/dice-engine.test.ts` ("draws deterministically and selects the row");
  `apps/v2/packages/core/tests/dice-commands.test.ts` ("draws a dice-table and records the roll +
  selected row"); e2e ("the DM draws a rollable table").
- AC2 (appending a generated result to a note records actor + source in note history): `handleAppendRollToNote`
  reuses `updateContentItem` + appends a `content.append-roll` op carrying `{ rollId, sourceKind, total }`
  and records `appendedToItemId` on the roll. Tests:
  `apps/v2/packages/core/tests/dice-commands.test.ts` ("appends a generated result to a note through the
  content write path; note history records actor + source"); e2e ("...appends the result to a note",
  verified on the durable content document).

## Quality review

- **Correctness:** every mapped acceptance criterion is implemented and test-covered (deterministic
  parse + malformed-reject; recorded roll reproduces; table draw + attribution + append; visibility
  fail-closed). Keep policies, modifier signs, clamping, and back-compat hydration are unit-tested.
- **Architecture:** parser/evaluator/table-resolution are PURE deterministic core functions; durable
  mutation enters only through `dice.*` commands (op-log + lifecycle); the GUI dispatches intents and
  renders the actor-filtered model (Contract 1). The recorded-seed model satisfies Contract 2 (computed
  once, stored, reproducible). Boundary lint + v2 gates pass; no v1 runtime import.
- **Tests:** unit (engine + commands), integration (history visibility, content append), and e2e on both
  profiles. Core: 1215 passing. App unit: 55 passing. Playwright: 362 passed / 18 skipped / 0 failed.
- **Accessibility:** the dice surface uses labelled form controls, a `role="alert"` error region, and an
  `aria-label`ed section + list — the same patterns as the combat tracker. It renders identically on
  desktop and compact profiles (stacked forms), exercised on mobile-chromium.
- **Performance:** the engine is bounded (`MAX_DICE_COUNT`, `MAX_DICE_SIDES`, `MAX_EXPRESSION_LENGTH`) so
  a pathological expression cannot blow up; no allocation-heavy hot paths.
- **Security / permissions:** only the DM may author a secret roll or draw a DM table; the read model
  omits non-visible rolls entirely (no existence/expression/total/label leak), and the recorded seed is
  exposed only to the DM.
- **Persistence:** rolls live in the already-persisted `SessionState.diceHistory`; the append uses the
  already-persisted content store. No new storage document was introduced.
- **Sync/offline:** every mutation appends a durable, replayable, idempotent op carrying the recorded
  draw, so the roll reproduces on replay; the append op declares its dependency on the source roll. All
  local-first (no network).
- **UX:** the surface shows empty/error/needs-active-session states, a visibility selector gated by role,
  and an attributed, actor-filtered history. Append/draw clear their inputs on success.
- **Maintainability:** small, typed, cohesive modules with no speculative abstraction; the legacy dice
  command and all prior tests are preserved.
- **Docs:** this completion doc; inline module docs reference the contracts and the reused building blocks.

## Demo path

1. Start the v2 app (`pnpm v2:dev`). On the home Command Center, start the session (`active`).
2. Go to `/session`. In "Dice and tables": enter `2d20kh1+5`, optionally a label and visibility, and
   click **Roll** — the recorded result appears in the history (same for every participant who may see it).
3. Enter a malformed expression (e.g. `2d6++bad`) and roll — it is rejected with a validation message and
   no roll is recorded.
4. As the DM, set visibility to **DM only (secret)** and roll; switch the header "view as" to a player —
   the secret roll is absent from the player's history.
5. On `/knowledge`, create a `dice-table` object (`dice: 1d6`, `entries: [...]`) and a note. Back on
   `/session`, select the table and **Draw table** (the selected row is recorded), then select the roll +
   note and **Append to note** — the note body gains the attributed result line.

## Gaps / deferred items

- Macros are supported by the command (resolve `@name` against a supplied macro table) and unit-tested,
  but no persistent macro LIBRARY UI is added — the DiceTools surface rolls free expressions/tables; a
  saved-macro manager is out of scope for this branch.
- Roll-history pagination/filtering UI is minimal (full visible history is shown); a larger history view
  is deferred.
- Contextual GENERATORS beyond rollable tables (e.g. composed name/loot generators) are represented by
  the rollable-table mechanism; richer generator composition is a later enhancement.

## Stop conditions

None hit. The v2 stack ADR (ADR-014) is Accepted and consistent with the approach; no v1 runtime import
was needed; visibility/permission/sync/persistence behavior was unambiguous (reused PERM + the recorded
op model); the generated workpack validates; `git status --short` showed only this epic's files.

## Git evidence

Branch: `epic/SES-dice-and-tables` (created from `epic/SES-combat` HEAD `ce76404`, per the chained v2
epic-branch workflow — NOT from master).

Final `git status --short` (after the completion + docs commits):

```
(clean)
```

Commit: recorded in the follow-up docs commit on `epic/SES-dice-and-tables` (see `git log`).
