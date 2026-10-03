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
