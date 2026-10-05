# RC-WID-6.1 run journal

## Implementation

- Core (`widget-package-state.ts`): `WidgetCommandDescriptor.executor` over a closed
  `WidgetCommandExecutor` set (roll, advance, tick, reset, set-value, show, mark-complete,
  write-note-line, start, pause, resume). `widgetCommandHasExecutor` also accepts the commands the
  core already ran by name (`timer.*`, `dice.roll`, listed as `CORE_NAMED_WIDGET_COMMANDS`).
  The schema closes the enum (`schemas/widget-package.ts`).
- Core (`widget-command.ts`): one executor per verb behind `widget.dispatch-command`. roll calls
  `handleRollDice` with the payload's `formula` and keeps `lastRoll` on the instance. The counter
  verbs write `localState.counter`, which moves the scene revision; each op logs previous and next.
  show writes `localState.shownMessage`. write-note-line and mark-complete delegate to
  `handleUpdateContentItem` and `handleUpdateVaultObject` under the presser's own edit check, plus
  a press record carrying the idempotency key so a retry does not append twice. start, pause and
  resume reuse `reduceTimerOperate` through a new `operation` parameter. `widgetCommandAvailability`
  is the shared unavailable check: the panel runs it without the vault and the core runs it with the
  vault before executing.
- Undo: `buildWidgetCommandInverse` maps a counter press to the core-reserved
  `widget.counter-restore` with the prior value. That command is only accepted on a widget that
  declares a counter command, and under that command's authority. `buildWidgetInverse` delegates to
  it. This crosses into `lifecycle/widget-undo.ts` with one case.
- Install and upgrade (`widget-package.ts`): `schema.command-no-executor` refuses a `template`
  widget command that has no executor, and the message names the command. Custom code is exempt.
- Builder: the catalogue gives every entry an executor. Draw, Rename and Set duration had none and
  were removed, along with their EN/ES keys. Roll, Start, Write a note line, Show and Set value add
  the config field their payload reads; Roll defaults to `1d20`. Each row gets a "Runs" picker.
  `validate.ts` names a template command with no executor on the Commands step, which also blocks
  Review.
- Action panel: a button whose executor is unavailable gets `aria-disabled` and the reason as its
  `title`. The readout shows `Count: N`, `Rolled <expr>: <total>` and the message shown to players.
  `BoardWidget.localState` was added in `board-helpers.ts` (outside owned paths, two lines).
- Outside owned paths, needed so existing producers do not fail the new install rule:
  - `starter-widgets/loot-ledger.ts` now declares `loot-ledger.write-note-line` with the
    write-note-line executor. Its old `content.update-item` command never ran either.
  - The MCP propose tool (`mcp/tool-dispatch.ts`) records the executor the verb names via
    `inferWidgetCommandExecutor`, and its description lists the verbs (`tool-registry.ts`). The test
    fixture `mark-sold` became `mark-complete`.
  - `core/index.ts` exports, EN/ES catalogue plus the regenerated qps-ploc, and test fixtures in
    `templates.test.tsx`. In `widget-builder.spec.ts`, Rename became Set value.
- Headroom tools were loaded but only Bash and Read were used. No agents, pushes, promotions, loop
  launches or dispatcher edits.

## Validation

- Core: new `tests/widget-command-executors.test.ts` (24 tests: one or more per executor, install
  and upgrade rejection, undo and redo, restore refusal, availability). Full core suite 5208/5208.
  `tsc --noEmit` passes for core and gm-react.
- App: new catalogue, validation and action-panel unit tests. Full app suite 1767/1767.
- E2E `widget-commands.spec.ts` passes 4/4 on desktop-chromium and mobile-chromium. One test builds
  Roll + Advance, installs, enables, places, and presses both in Standby: it sees a dice result and
  `Count: 1` with no `role=alert`. The other shows a blank command blocking Review until "Runs" is
  picked. Neighbouring specs (widget-builder, widget-intents, starter-widgets, widget-generate,
  widget-trust-review, custom-widgets, widget-kit) pass 67/67 on both profiles.
- ESLint and Prettier are clean on every touched file. `CommandsStep.tsx` is 763 lines, under the
  800-line gate.

## Attempt 2 — back inside the claim

The gate flagged five paths outside the claim: `board-helpers.ts`, `lifecycle/widget-undo.ts`,
`mcp/tool-dispatch.ts`, `mcp/tool-registry.ts` and `starter-widgets/loot-ledger.ts`. All five are
reverted to base `eedadc1d`. The acceptance criteria are still met without any of them:

- Counter, last roll and shown message now live in the instance **configuration** under namespaced
  keys (`executor.counter`, `executor.lastRoll`, `executor.shownMessage`) instead of `localState`.
  The board view-model already carries `configuration` to the templates, so `BoardWidget` needs no
  new field. Builder configuration schemas are open (`additionalProperties: true`), and
  `scene.configure-widget` edits send the current configuration, so the keys survive.
- `widget-undo.ts`: the delegation is gone. `buildWidgetCommandInverse` stays exported from the
  core, under the same pure contract. Nothing in the app offered this undo before either.
- Loot Ledger starter: `content.update-item` joins `CORE_NAMED_WIDGET_COMMANDS`. Its widget route
  runs the note's own command with `itemId` pinned to the widget's bound note, and refuses any
  other item. The starter installs unchanged and its write now actually runs.
- MCP propose: install records on a template command the executor its verb names
  (`effectiveWidgetCommandExecutor`, in `widget-package.ts` `normalizeDefinition`). A verb that
  names none is refused, so `mark-sold` fails approval with `schema.command-no-executor`. Dispatch
  reads template commands the same way, which also covers older builder packages; it never infers
  for custom code. The MCP test now asserts the executor after approval, plus the refusal.
- Prettier was accidentally run over all of `packages/core/src`. Every unrelated file was restored
  from HEAD before committing.

Validation: core tsc + vitest 5213/5213; app tsc + vitest 1767/1767. Playwright on desktop-chromium
and mobile-chromium passes 71/71: `widget-commands` 4/4, plus widget-builder, widget-intents,
starter-widgets, widget-generate, widget-trust-review, custom-widgets and widget-kit. Prettier and
ESLint are clean on every changed file.

## Independent-review repair — 2026-10-03

The previous claim that acceptance was met without app undo integration was incorrect. This repair
supersedes that claim and intentionally restores the necessary cross-file integration requested by
independent review; it does not change dispatcher ownership or control state.

- Executor inference now checks own properties and the closed executor enum before returning a
  value. Regression cases cover constructor, toString, valueOf, **proto** and hasOwnProperty;
  each is refused at install with schema.command-no-executor.
- The public buildWidgetInverse delegates counter commands to buildWidgetCommandInverse. Both
  actual press paths (scene editor and home board) now record accepted commands in useLayoutHistory.
- History serializes consecutive writes before capturing their prior state and refreshes widget
  command revisions and idempotency keys on undo/redo. An older inverse cannot be rejected merely
  because intervening presses moved the scene revision or mistaken for an already-applied operation.
- The canvas permits history shortcuts from panel buttons while preserving native text-field undo.
  The phone's separate StackedBoard receives the same history, keyboard shortcuts and touch buttons.
- Browser acceptance now covers both scene and home board, two presses, two undos, two redos and
  another undo, on desktop and mobile. Desktop uses keyboard shortcuts; mobile uses touch controls.
- Necessary integration paths beyond the original owned list: lifecycle/widget-undo.ts,
  useLayoutHistory.ts, SceneBoardCanvas.tsx, canvas/keyboard.ts, StackedBoard.tsx, Board.tsx, and sceneEditor's index.tsx
  and useSceneCommands.ts; regression tests accompany these changes. No unrelated files changed.

Validation in progress: focused core 50/50 and app 67/67 passed. Initial checks exposed a queued-write
microtask regression (fixed by awaiting only an existing write), the canvas key guard, and the
missing mobile history path. Final browser, type and lint results will be recorded below. Headroom
is not available in this tool inventory; native tool outputs and local log files are used directly.

Final validation (native output inspected):

- Core executor/inverse suites: 53/53, including all four counter verbs through buildWidgetInverse.
- App history, templates and builder suites: 67/67; after extracting the canvas key guard into the
  existing keyboard module, keyboard/history suites: 10/10.
- Browser widget-commands plus canvas-keyboard: 10/10 across desktop-chromium/mobile-chromium,
  including the keyboard-only axe check. Final widget-commands rerun after helper extraction: 6/6.
- Core and app typechecks passed; ESLint on changed source/tests and Prettier passed.
- Quality/docs gates passed. The added canvas guard initially exceeded the 800-line hard limit;
  extraction into canvas/keyboard.ts restored the limit without a grandfather exception.
- Full repository suites, build and pinned-container visual gate are left to the central operator's
  post-commit gates and independent review, as requested; no prior-candidate gate result is claimed
  as verification of this repair.
- No push, promotion, additional agent, loop launch or dispatcher control-state mutation.

## Attempt 4 — widened claim, reconciled onto loop/rc afa00e6e (2026-10-05)

- The only gate finding was the claim check. The operator brief now owns the eight integration paths,
  so no source moves back out of them.
- `loop/rc` had moved 84 commits since base `2450f59c`. A trial merge conflicted in three files, so
  the branch was rebased onto `afa00e6e` (pre-rebase head kept as
  `backup/rc-wid-6.1-pre-rebase-5b11` = `9a958533`):
  - `schemas/widget-package.ts`: import-list conflict with RC-WID-5.2. Kept both
    `WIDGET_COMMAND_EXECUTORS` and `WIDGET_DATA_QUERY_SOURCES`.
  - `canvas/useLayoutHistory.ts`: RC-CAN-8.1 rewrote the hook around a write queue, multi-command
    entries and `replay`. Took that version in full. Only `prepareWidgetCommand` (a fresh
    idempotency key and the current scene revision for `widget.dispatch-command`) was re-applied,
    in `run` and in `replay`. The old inflight/serialization code is gone because upstream's
    `enqueue` already covers it.
  - `canvas/keyboard.ts`: kept RC-CAN-8.1's `canvasKey`/`useNudges`/`useDragOverlay` and re-added
    `isTileContentKey`.
- E2E race found after the rebase: under load (3 specs × 2 profiles in parallel), the desktop board
  run failed about 1 time in 12. The final Ctrl+Z was dropped because "Count: 2" paints before the
  redo's write persists, and the history refuses an undo while a redo is still replaying (upstream
  design). The spec now waits before each undo/redo press by queueing a no-op through
  `__rt.runExclusiveMaintenance`. No product change.

Validation (native output read):

- Core and gm-react `tsc --noEmit` are clean.
- Core vitest: 5233/5233 passed. App vitest (`pnpm test:app`): 2003/2003 passed.
- Prettier and ESLint are clean on every changed file. `pnpm gates` (quality + docs) passes.
- Playwright: widget-commands + canvas-keyboard + widget-builder on desktop-chromium and
  mobile-chromium, `--repeat-each=4 --retries=0`: 112/112 passed. Before the spec fix, the same
  run at `--repeat-each=3` gave 83 passed and 1 failed.
- No push, promotion, extra agents, loop launch or dispatcher control-state change.
