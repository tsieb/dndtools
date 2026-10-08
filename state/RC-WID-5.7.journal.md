# RC-WID-5.7 — Public surface for the GM board builtins

## 2026-10-08

Started at `1028592b` with a clean task worktree. Dispatch Headroom tools are available and used
for some searches; no additional agents.

Ledger on entry: 48 findings, all RC-WID-5.7 — 41 private builtin uses (timer, audio,
initiative-tracker, character, map, session, getting-started, tools, atlas, player-views, combat,
search) and 7 builtin bodies on the fresh GM board (map, initiative-tracker, dice, timer, audio,
quick-reference, prep).

Approach. Renaming the fresh board's widget types was rejected: the inspector, tile metadata,
session-control, the demo seed, `withDefaultMapBinding`, dozens of core tests and the e2e suite key
on `map`, `timer`, `initiative-tracker`. Instead the seven board tools stop being builtin bodies:
their system definitions become copyable template definitions (new board template kinds
`map-view`, `initiative`, `dice-roller`, `countdown`, `now-playing`, `item-list`) whose renderers
draw the same DOM from the definition's declared queries and commands. Existing boards keep their
instances and settings and render through the same templates, so fresh and customised boards
behave alike.

Public surface added:

- Query sources (actor-scoped, in `dataEnvironment.ts`): `widget-timer`, `session-audio`,
  `bound-map`, `bound-character`, `session-status`, `onboarding`, `command-center`,
  `map-projection`, `player-view-controller`, `encounters`, `saved-searches`. Board sources carry a
  structured `detail` beside their rows (timer record, audio readout, map view, combat tracker,
  dice rolls); a withheld query carries none.
- Commands the core runs by name through `widget.dispatch-command`: `combat.advance-turn`,
  `combat.apply-resource`, `combat.set-combatant-visibility`, `session.set-active-map`,
  `session.project-active-map`, and `scene.configure-widget` confined to the dispatching instance.
- Builder catalogue: Data step sources, Commands step named commands, template kinds.

Write path: timer and dice keep the board's `onCommand`; the map and initiative templates send the
same `widget.dispatch-command` envelope themselves so they can announce the core's result as the
bodies did.

Progress. Core: board template kinds, `ALL_WIDGET_BOARD_QUERY_SOURCES`, six new
`CORE_NAMED_WIDGET_COMMANDS` delegated in `widget.dispatch-command` (configure pinned to the
dispatching instance, idempotency key recorded via `recordDelegatedPress`), seven board
definitions rewritten as copyable template definitions through a shared `asBuilderSaves` (the
timer's unused `timer.started` event dropped: the builder writes `events: []`). Core suite green
after the definition change (291 files / 5,292 tests, `/tmp/rcwid57-core1.log`).

App: eleven sources in `dataEnvironment.ts` (`resolveBoardSource`), `detail` on query results;
the seven bodies `git mv`'d to `templates/board/` and rewritten to read `detail`/rows and run
declared commands; builtin switch and parity map shrink to the legacy hub bodies; ledger empty;
exposure scan reads bracketed members (`stateChains`). A placement check on `widget-timer` was
tried and removed: `getSceneForActor` without a projection scope would hide timers on widgets a
player receives through a player-view projection, which the body never did.

First focused run: parity + map tile 55/55 (`/tmp/rcwid57/parity1.log`).

Second pass. `widget-timer` regained a reachability gate, this time the one
`widget.dispatch-command` already applies (`widgetInstanceReachesActor`: screen visibility or a
player-view projection that includes the widget), so projected timers keep working and a player
never reads a DM-only board's timer. Ambience rows were keyed by layer id, not source id; fixed.
Board command descriptors live once in core (`BOARD_COMMAND_DESCRIPTORS`), used by the map and
initiative definitions and offered by the builder's Commands step (with "The table's own command"
in the Runs picker instead of "Nothing yet"). `combat.apply-resource` is declared `manager`: the
desk initiative tile has no HP control, so as an operate command it would fail
`custom-widgets.spec.ts`'s "every declared operate command runs from the keyboard" contract; on the
board it is the DM's either way. The Data step says when a `bound-map`/`bound-character` query has
no binding of that type (`BoundSourceHint`, in `DataStepBindings.tsx` to keep `DataStep.tsx` under
the 800-line gate).

Crossings outside the owned paths, each forced by a type, a gate or acceptance: `packages/core/src/
index.ts` (exports), `widgetBuilder/{vocabulary.ts,BuilderPreview.tsx,DataStepBindings.tsx}`,
`canvas/AddWidgetGallery.tsx`, `widgets/WorkerHost.ts` (Record<WidgetTemplateKind> maps), i18n
`en.ts`/`es.ts` + regenerated `qps-ploc.ts`, the raw-style ratchet regenerated with
`pnpm lint:raw-style-count --write` (a pure rename of four entries; its trailing total comment was
stale at 437 and now reads the real 295), two stale path comments, and tests: core
`widget-command-board-tools.test.ts` (new), `board-resizable.test.ts`, `AddWidgetGallery.test.tsx`,
`draftStore.test.ts`, e2e `widget-query-sources.spec.ts` (source list), `add-panel.spec.ts`
(the Dice miniature is the inert tile now) and `custom-widgets.spec.ts` (Next turn is declared).
The id for a press comes from `runtime.newId()`: `crypto.randomUUID` in GUI code fails the
PLAT-006 boundary lint.

Tests run: first full `pnpm test` (`/tmp/rcwid57/test-full.log`): core 292 files / 5,307, cloud
46 / 569, app 178 / 2,274 green; tooling failed 3 (boundary lint and renderer isolation on
`crypto.randomUUID`, file-size gate on DataStep at 805 lines). All three fixed and rerun green
(29/29). Lint wrappers: changed-file ESLint and Prettier clean, `git diff --check` clean,
`lint:emphasis` and `a11y:contrast` exit 0. Final full run below.

Final runs (after the fixes, on the committed tree):

- `pnpm typecheck` exit 0. Full `pnpm test` (`/tmp/rcwid57/test-full2.log`): core 292 files /
  5,307, cloud 46 / 569, tooling green, app 177 of 178 files. The one failure is
  `screens/play/Sheet.test.tsx` "every control drawn for the owner…" timing out at 5s under full-suite
  load. `Sheet.tsx` imports nothing this story changed. Run alone it passes; on base `1028592b`
  the same test takes 3.0–4.1s alone (branch 3.8–4.4s), so it is a pre-existing load-sensitive
  test near its timeout, not a regression. Not changed here.
- Full Playwright, both projects (`/tmp/rcwid57/e2e-full.log`): 1,932 passed, 38 skipped, 0
  failed, 34.1 min, exit 0. Visual goldens were not run (container-only); the board tiles render the
  same DOM, and the builtin body text snapshots are unchanged.

Committed as `038ded88` plus this journal update. No push, promotion, loop or control-state edits.
