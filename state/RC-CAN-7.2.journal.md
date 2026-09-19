# RC-CAN-7.2 run journal

## Scope

Additive screen metadata on the scene (byte-identical round trip when absent, so no schema bump), the
commands `scene.set-pinned`, `scene.reorder-pins`, `scene.set-layout-policy` and `scene.duplicate`,
and the `listScreensForActor` read in which players list only the screens visible to them.
Acceptance: reducer and schema tests; a round-trip test on a fixture vault with a customised home
board proving every widget survives; an isolation test for the read. No agents, no dispatcher
mutations, no push, no promotion.

## Attempt 1 (2026-09-16)

### Survey before writing anything

- `packages/core/src/state/scene-state.ts` already carries two additive, optional scene fields
  (`deletedAt` from the soft-delete work, `tombstones?` from RC-CAN-1.2). Both drop their key when
  empty (`withTombstones`), which is the established idiom for "absent round-trips byte-identically".
  Screen metadata follows it exactly: `withScreenMeta` deletes the key when the value equals
  `DEFAULT_SCREEN_META`.
- `packages/core/src/schemas/scene.ts` (`sceneSchema`, `.strict()`) is **out of this task's claim**
  and out of `companion_paths`, so it is untouched. It is not the persistence boundary: the only
  runtime validator for a persisted scene document is the hand-written structural check in
  `apps/gm-react/src/platform/storage/coreStore.ts` (`trustedPersistedDocument`), which validates
  document-level shape plus `scene.id === key` and passes every other scene field through verbatim.
  `sceneSchema` is referenced only by `packages/core/tests/schemas.test.ts` and already omits
  `deletedAt` and `tombstones`, so it has been a stale mirror since before this story. Adding
  `screen?` does not make it more stale, and widening it is a separate change under a different
  claim. Noted here rather than silently.
- The four new command inputs go in `packages/core/src/schemas/commands.ts`, which IS a companion
  path and is where every other `scene.*` input schema lives.

### What landed

- `state/scene-state.ts` — `Scene.screen?: ScreenMeta | null` plus `ScreenLayoutPolicy`,
  `ScreenOrigin`, `DEFAULT_SCREEN_META`, `hydrateScreenMeta`, `screenMetaOf`, `isDefaultScreenMeta`,
  `withScreenMeta`, `screenLayoutPolicy`, `isPinnedScreen`, `screenPinOrder`, `compareScreenOrder`
  and `listPinnedScreens`. `SCENE_SCHEMA_VERSION` and `SCENE_STATE_SCHEMA_VERSION` are unchanged.
- `commands/scene.ts` (new) — `handleSetScreenPinned`, `handleReorderScreenPins`,
  `handleSetScreenLayoutPolicy`, `handleDuplicateScene`. All DM-only, matching every other
  scene-level command in `scene-meta.ts`. `scene-meta.ts` itself needed no change: the screen
  commands are additive and none of the existing scene reducers touch the new field.
- `queries/screens.ts` (new) — `listScreensForActor` and `listPinnedScreensForActor`.
- Companion wiring: the four zod inputs in `schemas/commands.ts`, the command/event union members in
  `commands/types.ts`, the switch arms in `commands/dispatch.ts`, the barrel exports in `index.ts`.
- `tests/screen-metadata.test.ts` (new) — 30 tests.

### Decisions worth arguing with

- **No renumber on unpin.** `scene.set-pinned` appends above the current maximum and unpinning leaves
  the remaining orders sparse; `scene.reorder-pins` is the one command that renumbers to 0..n-1.
  Renumbering inside `set-pinned` would bump the revision of every other pinned scene for a change
  that concerned one of them, and `compareScreenOrder` sorts by value, so sparse is not a defect.
  There is a test on exactly this sequence (unpin leaves `[1, 2]`, reorder normalises to `[0, 1]`).
- **`reorder-pins` demands the exact pinned set.** Rejecting an omission is the point: a client
  working from a stale list would otherwise unpin a screen by reordering the rest, silently.
- **Re-pinning an already-pinned screen is rejected, not replayed**, mirroring `scene.delete`
  refusing a re-delete. A durable command that changes nothing should not mint an operation.
- **`scene.duplicate` starts GM-only** with no sharing targets and no player-view assignments, per
  ADR-041's "creating or pinning one does not project it to players". It carries the source's layout
  policy but never its pin — a pin is a shortcut in one GM's shell, not a property of the content.
- **Group ids are remapped, not nulled.** `scene.save-template` drops `groupId`; a duplicate is
  supposed to reproduce the arrangement, so each distinct source group gets one new id shared by its
  members. Asserted directly (two copied members, one shared group id, not the source's).
- **`widgetCount` is scoped to what the actor is delivered.** A player assigned one section of a
  three-widget screen is told 1, not 3, so a library card cannot report how much the GM is
  withholding. This is the one place the read computes something rather than copying it.
- **Templates are omitted from the screens read for everyone**, where `listScenesForActor` shows them
  to DMs. A template is a source to create from ("new from template", CAN-7.3), not a workspace to
  open; listing it would put a non-openable row in the library. A deliberate divergence, not an
  oversight.
- Not touched: `lifecycle/command-lifecycle.ts` (`UNDOABLE_COMMAND_TYPES`). The screen commands are
  self-inverse or invert to `scene.delete`, but the registry only maps types — the payload builders
  live app-side with the UI, which is CAN-7.3/7.4's claim. Out of scope here rather than half-wired.

## Validation results

Mutation-checked before trusting the green run — four deliberate mutations, each caught by the tests
that claim to cover it, then reverted (`diff` against a pre-mutation copy confirms the revert):

| Mutation                                                       | Caught by                                          |
| -------------------------------------------------------------- | -------------------------------------------------- |
| `deliverableWidgetCount` always returns `scene.widgets.length` | the section-scoped isolation test                  |
| `withScreenMeta` never drops the key                           | the three byte-identity / key-drop tests           |
| the read's `evaluation.kind !== 'visible'` filter defanged     | the player isolation + GM-only pin tests (8 total) |
| `nextPinSlot` always returns 0                                 | the pin-append, reorder and sparse-order tests     |

- `pnpm --filter @dndtools/core exec vitest run`: 274 files, 4811 tests passed (30 new).
- `pnpm typecheck` (core + cloud-fns + gm-react): exit 0.
- `pnpm lint`: exit 0. `eslint` on the four new/changed source files: exit 0.
- `pnpm test:app --maxWorkers=3`: 127 files, 1372 tests passed.
- `pnpm build`: exit 0; `check-prod-bundle` OK.
- `pnpm gates`: exit 0 (6 gates; docs check 254 files / 279 links). File-size lines are warn-only and
  name no file this task owns.
- `prettier --write` over every changed file; `pnpm format:check:changed --base loop/rc`: exit 0.
- Not run here: the full Playwright suite. This change is core-only — no app code, no route, no
  component — and nothing existing reads `Scene.screen` yet, so there is no browser surface to
  exercise until CAN-7.3. The operator's Browser acceptance gate runs it.
