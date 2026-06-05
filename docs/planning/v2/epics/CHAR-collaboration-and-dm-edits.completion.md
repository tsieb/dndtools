# CHAR-collaboration-and-dm-edits — Completion Evidence

Epic: `CHAR-collaboration-and-dm-edits` — CHAR: Collaboration and DM edits
Requirements: CHAR-004, CHAR-005, CHAR-014
Branch: `epic/CHAR-collaboration-and-dm-edits` (from `epic/CHAR-character-creation-and-drafts` HEAD `9351c2f`)

This epic adds collaborative character editing on top of the foundational CHAR character model. The DM
and a character owner edit the SAME canonical character: edits to different field paths MERGE, while
concurrent edits to the SAME path are surfaced as durable, DM-resolvable CONFLICTS (never silent
last-write-wins). DM edits are ATTRIBUTED in the edit history on the ONE canonical value — there is no
separate hidden "DM override" value layer (the v2 contract explicitly retired that interpretation). The
actor-filtered collaborative view distinguishes DM-authored / player-authored / conflicted fields while
never leaking a DM-only field's value, path, author, history, or conflict to a non-DM actor.

## Demo

Path: start the app (`pnpm v2:dev`) and open the **Characters** section (`/characters`). Use the header
"View as" control to switch between the DM (`View as: ... (dm)`) and the demo players.

1. **CHAR-005 — DM edit, attributed, one canonical value.** As the DM, quick-create a `player-visible`
   character (e.g. "Pip", HP 10). In **Collaborative editing**, grant ownership to *Demo Player*, then
   edit `combat.hp` to `4` and press **Save**. The field shows a **DM-authored** badge and the canonical
   value is `4` — the same value the owner sees (no shadow value). Open **Edit history** to see the
   attributed edit. An empty `name` save is rejected (validated command, fail closed).
2. **CHAR-014 — collaborative view distinctions + non-leak.** Create a `player-visible` character that
   declares a `dm-only` data field, grant ownership, and "View as" the owner. The owner sees the visible
   fields with DM-authored / player-authored badges, but the `dm-only` field never appears — no label,
   value, history entry, or conflict reveals it.
3. **CHAR-004 — concurrent merge vs same-path conflict.** As the DM, start editing `combat.hp` (type a
   value, do not save). "View as" the owner and save a different `combat.hp` value. "View as" the DM and
   Save: the DM's edit was based on a now-stale revision of the SAME field, so a **Conflict** is surfaced
   (the canonical value is still the owner's; nothing was silently overwritten). The DM resolves it by
   choosing the local or remote value; the chosen value becomes the single canonical (DM-authored) value
   and the conflict clears. Editing DIFFERENT fields concurrently (e.g. DM edits the dm-only note while
   the owner edits backstory) merges cleanly with no conflict.

Requirement IDs exercised by the demo: CHAR-004, CHAR-005, CHAR-014.

## Requirement traceability

| Requirement | Implementation | Tests |
| --- | --- | --- |
| CHAR-004 — concurrent collaboration: field-level merge; same-path conflict surfaced for DM resolution | `state/character-collaboration.ts` (`applyFieldEdit` deterministic merge + same-path conflict keyed by field-path; `CharacterFieldConflict` shaped on Contract 2 `ConflictRecord` with `reason: 'same-scalar-path'`; `resolveFieldConflict` records the chosen value + new revision), `commands/character.ts` (`handleEditCharacterField` conflict path appends a durable `character.field-conflict` op without overwriting; `handleResolveCharacterConflict` DM-only), `queries/character-bindings.ts` (an unresolved conflict makes the path's binding resolve `conflicted` via the existing resolver), GUI `CharacterCollaboration.svelte` (conflict surface + resolve controls) | core `character-collaboration-and-dm-edits.test.ts` (AC1 different paths merge; AC2 same scalar path → conflict, not LWW; binding resolves `conflicted`; DM resolves → canonical + binding clears; non-DM cannot resolve; unknown conflict fails closed; sequential same-author edit not a conflict; no-op edit); e2e `character-collaboration-and-dm-edits.spec.ts` (concurrent same-field edit → conflict → DM resolves) |
| CHAR-005 — DM edits any field through validated commands, attributed, no hidden override layer | `state/character-collaboration.ts` (`validateFieldEdit` fail-closed path/value validation; `FieldAuthorship` + `CharacterEdit` attribution on the SINGLE canonical value; `writeFieldValue` mutates the one canonical field), `schemas/commands.ts` (`editCharacterFieldInputSchema`), `commands/character.ts` (`handleEditCharacterField` — DM edits any field; owner edits owned non-dm-only fields; invalid field/value rejected; no second value layer), `state/character-state.ts` (`Character.collaboration` sidecar annotates `data`/`combat`/`name`, not a parallel value) | core test (AC1 DM HP edit records DM attribution; exactly one value per field — no parallel override; AC2 dm-only field stays omitted from player read; invalid value/path rejected; `validateFieldEdit` purity; authority: non-owner + owner-on-dm-only rejected); e2e (DM HP edit flagged DM-authored; invalid name rejected) |
| CHAR-014 — collaborative view distinguishes DM-authored / player-authored / conflicted without exposing dm-only fields | `queries/character-collaboration.ts` (`getCollaborativeCharacterView` actor-filtered projection; `FieldAuthorKind` dm-authored/player-authored/original; `conflicted` flag; the single `fieldVisibleToActor` gate omits dm-only field value/path/author from the field list, history, AND conflict list for non-DM actors), GUI `CharacterCollaboration.svelte` (badges + history + conflict markers rendered from the projection) | core test (AC1 DM edit to visible field flagged DM-authored with history; distinguishes dm/player/conflicted in one view; AC2 NON-LEAK hard assertions — no field/history/conflict/serialized reference to the dm-only path or value; a dm-only conflict never appears in a non-DM view; non-visible character → null); e2e (dm-only field never shown to the owning player) |

## Architecture / reuse

- **Pure Processing-Core policy (Contract 1 / Cross-Contract Non-Negotiable 1).** Merge, conflict
  detection, validation, attribution stamping, and the actor-filtered projection are pure deterministic
  functions in `@dndtools/v2-core` (no GUI, no storage, no ambient clock/entropy — ids/clock come from
  the command env). The GUI dispatches command intents and renders the actor-filtered model; durable
  writes go through the op-log + command result, never directly from the GUI.
- **Reuses the prior CHAR + PERM + binding work, no new parallel mechanisms.**
  - Conflicts are shaped on the existing Architecture Contract 2 `ConflictRecord` (`same-scalar-path`),
    matching the MAP/PERM conflict-shaped op pattern, and surface through the EXISTING widget binding
    `conflicted` state (`EntityBindingRecord.conflict` → `resolveWidgetBinding`).
  - DM-only non-leak reuses the field-level visibility idiom from the PERM visibility-filter and the
    existing `dmOnlyFields` declaration on the character; the collaborative view applies the same
    field-visibility gate to the field list, history, and conflict list.
  - Attribution rides on the operation log's existing `actorId`/`issuedAt` provenance plus per-field
    `FieldAuthorship`; no shadow value layer (Contract 2 research conclusion retiring "DM override").
- **Fail-closed data safety.** Invalid field/value rejected; unknown path rejected; a non-owner non-DM
  rejected; an owner editing a dm-only field rejected (generic message, no existence confirmation); a
  same-path concurrent edit never overwrites — it conflicts; conflict resolution is DM-only; a
  non-visible character yields no collaborative view at all.
- **Boundary integrity.** No v1 runtime imports; `pnpm v2:lint` (boundary) and the core boundary test
  stay green. `SvelteMap`/`SvelteSet` not required (the GUI state uses plain keyed `$state` records, not
  reactive collections).

## Tests run

- `pnpm lint` (full repo = `eslint . && lint:navigation && lint:tokens && audit:repo`) — PASS.
- `pnpm v2:typecheck` — PASS (0 errors, core + app).
- `pnpm v2:lint` (boundary) — PASS.
- Core unit suite (`vitest run` in `@dndtools/v2-core`) — 64 files, **829 passed**.
- App unit suite (`vitest run` in `@dndtools/v2-app`) — 12 files, **55 passed**.
- Full Playwright on BOTH projects (`@dndtools/v2-app exec playwright test`, desktop-chromium +
  mobile-chromium) — **230 passed, 18 skipped (intentional project-scoped), 0 failed** (baseline 222 +
  8 new collaboration specs across both projects).
- `pnpm v2:workpack:validate` — PASS before and after `complete`.

New tests: core `apps/v2/packages/core/tests/character-collaboration-and-dm-edits.test.ts` (19 cases);
e2e `apps/v2/app/tests/e2e/character-collaboration-and-dm-edits.spec.ts` (4 cases × 2 projects).

## Quality review

- **Correctness:** every mapped acceptance criterion is implemented and covered (see traceability).
  CHAR-004 AC1 (different-path merge) / AC2 (same-path conflict); CHAR-005 AC1 (DM attribution) / AC2
  (dm-only stays omitted) / AC3 (player-visible DM edit flagged without a parallel value); CHAR-014 AC1
  (DM-authored flag + history) / AC2 (non-leak).
- **Architecture:** ADR-014 + Contracts 1/2/3 respected; pure core policy; durable writes via op-log;
  no v1 runtime imports; conflict reuses Contract 2 shape and the existing binding `conflicted` state.
- **Tests:** unit (merge/conflict/attribution/validation/projection incl. negative + non-leak cases),
  e2e on both profiles, boundary.
- **Accessibility:** the collaborative editor uses labelled inputs, a `role="alert"` error region,
  a keyboard-operable `<details>` history, and standard button/select controls; it renders identically
  on desktop and compact profiles (the field rows wrap so every Save/Resolve control stays reachable on
  the compact viewport — verified by the mobile-chromium e2e run).
- **Performance:** all operations are O(fields + edits + conflicts) over a single character's small
  sidecar; no new indexes or background work.
- **Security / permissions:** DM authority for edits/resolution; owner-only non-dm-only edits; observer
  and non-owner reads/edits fail closed; resolution is DM-only.
- **Persistence / sync / offline:** every accepted mutation appends a durable, replayable operation
  (`character.edit-field` / `character.field-conflict` / `character.resolve-conflict`) carrying actor,
  before/after revision, and conflict payload — the operation-shaped local log per ADR-014; the
  `collaboration` sidecar hydrates safe-empty for pre-slice characters. (Offline degrade per CHAR-004 is
  satisfied: edits are local-first; conflicts are the modeled reconciliation outcome.)
- **UX:** attribution badges, conflict markers, resolve controls, and an edit-history disclosure; empty
  and error states present.
- **Maintainability:** one cohesive pure module (`state/character-collaboration.ts`), one query module
  (`queries/character-collaboration.ts`), two new commands, one GUI component; no unrelated refactors.
- **Docs:** this completion file; inline module/contract documentation.

## Files changed

Core (`@dndtools/v2-core`):
- `apps/v2/packages/core/src/state/character-collaboration.ts` (new) — merge/conflict/attribution reducers + validation.
- `apps/v2/packages/core/src/state/character-state.ts` — added the optional `collaboration` sidecar to `Character`.
- `apps/v2/packages/core/src/queries/character-collaboration.ts` (new) — actor-filtered collaborative view (CHAR-014).
- `apps/v2/packages/core/src/queries/character-bindings.ts` — unresolved conflict paths drive the binding `conflicted` state.
- `apps/v2/packages/core/src/commands/character.ts` — `handleEditCharacterField`, `handleResolveCharacterConflict`.
- `apps/v2/packages/core/src/commands/dispatch.ts` — wire the two new commands.
- `apps/v2/packages/core/src/commands/types.ts` — new command types, events, and the `conflict-not-found` rejection code.
- `apps/v2/packages/core/src/schemas/commands.ts` — `editCharacterFieldInputSchema`, `resolveCharacterConflictInputSchema`.
- `apps/v2/packages/core/src/index.ts` — public exports for the new model, view, and schemas.
- `apps/v2/packages/core/tests/character-collaboration-and-dm-edits.test.ts` (new).

App (`@dndtools/v2-app`):
- `apps/v2/app/src/lib/gui/CharacterCollaboration.svelte` (new) — collaborative editor surface.
- `apps/v2/app/src/routes/characters/+page.svelte` — mount the collaborative editor for DM + player roles.
- `apps/v2/app/tests/e2e/character-collaboration-and-dm-edits.spec.ts` (new).

Planning (`docs/planning/v2`):
- `workpack-state.yaml`, `status.yaml`, `epics/CHAR-collaboration-and-dm-edits.yaml` (status via workpack
  commands), and this completion file.

## Known gaps / deferred

- The collaborative editor exposes `name`, the scalar `combat.*` fields, and existing `data.*` keys as
  editable paths; richer structured sheet fields (spells, inventory, advancement) land in their own
  later CHAR epics (CHAR-007/008/009) and reuse this edit/attribution/conflict spine.
- Cross-device sync transport / true offline replay is out of scope per ADR-014 (single-device local
  operation log); CHAR-004's concurrency is modeled and proven against the operation log + base-revision
  conflict detection, which is the provider-agnostic shape later sync attaches to.
- No stop condition was hit.

## Workpack status

Workpack status: `complete` (set via `pnpm v2:workpack:complete -- --epic CHAR-collaboration-and-dm-edits`).

## Git

- Branch: `epic/CHAR-collaboration-and-dm-edits` (from `9351c2f`).
- Commit: see the epic commit on this branch (recorded at handoff).
- Final `git status --short`: clean (recorded below at completion time).

```
(clean working tree after the epic commit)
```
