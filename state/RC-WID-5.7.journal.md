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

## Claim-gate follow-up — 2026-10-08

Gate feedback: seven paths outside the claim. Reverted to base `1028592b` the three the acceptance
does not need: `app/map/canvas/useCombatTokens.ts` and `screens/sceneEditor/playerPreview.ts`
(stale path comments only) and `widgetBuilder/DataStepBindings.tsx` (the bound-source hint moved
back into the owned `DataStep.tsx`, written compactly: 794 lines, under the 800-line gate).

Kept, because the acceptance cannot compile without them: `canvas/AddWidgetGallery.tsx`
(`PREVIEW_TEMPLATES`), `widgetBuilder/BuilderPreview.tsx` (`RAW_TEMPLATES`),
`widgets/WorkerHost.ts` (`WORKER_TEMPLATES`) and `widgetBuilder/vocabulary.ts` (`TEMPLATE_LABEL`,
`TEMPLATE_HELP`, `QUERY_SOURCE_LABEL`). Each is an exhaustive `Record<WidgetTemplateKind | 
WidgetDataQuerySource, …>`, written so that a kind or source added to the schema fails the build
there. Proof: with those four files at base, `tsc --noEmit` on gm-react reports TS2740 at
AddWidgetGallery.tsx:106, BuilderPreview.tsx:81, vocabulary.ts:34/49/66 and WorkerHost.ts:679
(`/tmp/rcwid57/forced.txt`). The new public sources are required by the acceptance (and the Data
step's catalogue support by the story); the board template kinds are what makes the fresh board's
tools template definitions. This blocks the task for the operator to decide on widening the claim.

After the revert: gm-react typecheck clean; changed-file ESLint clean; builder, widgets and canvas
suites 32 files / 767 tests green (`/tmp/rcwid57/app4.log`); file-size, boundary-lint and
renderer-isolation gates 29/29.

## Self-heal round 1 — 2026-10-09

The claim was widened to the four Record-forced files (`AddWidgetGallery.tsx`, `BuilderPreview.tsx`,
`vocabulary.ts`, `WorkerHost.ts`). Their diff against base is 31 added lines and nothing else: the
`BOARD_TEMPLATE_RENDERERS` spread in the three renderer maps, and the six template-kind labels,
six help lines and eleven source labels in `vocabulary.ts`. No code change this round.

On head `9dc3720c`: `pnpm typecheck` exit 0; full `pnpm test` exit 0 (`/tmp/rcwid57/test-full3.log`):
core 292 files / 5,307, cloud 46 / 569, app 178 / 2,274, tooling 31 / 249. `Sheet.test.tsx`
passed this run; it stays load-sensitive near its 5s timeout on base as well.

## Quality-gate follow-up — 2026-10-09

The wrapper's "Quality gates" (`pnpm gates`, `scripts/quality-gates.ts`) failed on head `ee017fcb`
with four broken relative links, read from the original log
(`.state/attempts/a44626d4-…/output.log`, lines 40–44): `docs/planning/SCREENS_PARITY.md`
lines 213, 214, 630 and 648 linked to `widgets/builtin/{InitiativeBody,InitiativeTracker,TimerBody,
NextTurnControl}.tsx`, which this story moved to `widgets/templates/board/{Initiative,
InitiativeCompact,Countdown,NextTurnControl}.tsx`. Repointed the four links, nothing else in the
file. That file is outside the claim; the gate cannot pass without it. Backtick paths elsewhere in
the docs (the roadmap's historical `Owns:` records) are not links and are left as written.

`pnpm gates` locally: exit 0, "docs check passed: 306 file(s) reachable from docs/README.md, 417
relative link(s) resolved" (`/tmp/rcwid57/gates.log`). No code changed since the full `pnpm test`
on `9dc3720c`.

## Claim-gate round — 2026-10-09

Gate feedback: `docs/planning/SCREENS_PARITY.md` is outside the claim. Kept, not reverted: at base
its four relative links (lines 213, 214, 630, 648) name `widgets/builtin/{InitiativeBody,
InitiativeTracker,TimerBody,NextTurnControl}.tsx`, which this story moves to
`widgets/templates/board/`, and `pnpm gates` (the wrapper's Quality gates) then fails its docs
check with exactly those four broken links. The only in-claim alternative is to leave stub modules
at the old `builtin/` paths purely so the links resolve, which would be dead code in the builtin
directory the parity gate reasons about. The diff is the four link targets (4+/4−). Operator
decision needed on widening the claim to that file.

## Self-heal round 2 — 2026-10-10

The claim now includes `docs/planning/SCREENS_PARITY.md`. Retained its four link-target fixes
and the prior implementation unchanged. Started at `155db2ce` with a clean worktree. No
Headroom tools are available in this session; validation uses original local command output.
Confirmed the acceptance tests enumerate every new board source, exercise command permissions,
require an empty parity ledger, and compare original package bytes after builder round trips for
all seven board tools.

Validation on the retained implementation at `155db2ce` (only this journal changed):

- Full `pnpm test` exit 0: core 292 files / 5,307 tests; cloud 46 / 569; app 178 / 2,274;
  tooling 31 / 249. Original output: `/tmp/rcwid57-round2/test.log`.
- `pnpm gates` exit 0: six quality gates validated, 306 documentation files reachable and
  417 relative links resolved. Original output: `/tmp/rcwid57-round2/gates.log`.
- `git diff --check` exit 0.

No additional agents, push, promotion, loop or dispatcher control edits. Central independent
review and delivery remain the operator's next steps.

## Visual-gate follow-up — 2026-10-10

Started at `3a6dd95a` with a clean worktree (the prior task commits were rebased). Read the
original failed gate log at
`/home/trinkle/Programming/agent-dispatcher/.state/attempts/78e2198c-9625-430f-a346-5652fbb9cf01/output.log`:
531 passed, 15 failed, all in `scene-editor-polish.spec.ts`. Inspected expected and actual
inspector images and the phone resize-handle crop. The public template definitions correctly
expose the existing inspector's "Edit widget definition" button, shifting controls down; the
baselines still describe the old builtin without that button. This is a required visible effect
of builder editability, so retain the implementation and refresh only the affected visual
baselines using the pinned container. No Headroom tools are available in this session.

Targeted pinned-container generation passed 15/15 (`/tmp/rcwid57-visual/update.log`). Reviewed
every rewritten PNG: 15 inspector captures, three tavern Transform captures and the tavern phone
resize-handle crop, all showing the new edit button and its consequent layout shift. No source,
test assertions, thresholds or container settings changed. These test artifacts accompany the
required visible change under `docs/development/TESTING.md` section 8's baseline policy.
The baseline budget passed: 852 files, 36,301.7 KiB / 37,888.0 KiB.

`pnpm test` passed (exit 0): core 292 files / 5,314 tests; cloud 46 / 569; app 180 / 2,288;
tooling 31 / 249. `pnpm gates` passed (exit 0): six quality gates, 306 reachable documentation
files and 417 relative links. Original logs: `/tmp/rcwid57-visual/test.log` and `gates.log`.
Full pinned-container comparison (`--update-snapshots=none --workers=2`) passed all 546 tests
(exit 0), including all 15 previously failing inspector cases. Original output is retained at
`/tmp/rcwid57-visual/compare.log`. Journal formatting and `git diff --check` also passed.

Final change: 19 scene-editor visual baselines plus this journal; the widget implementation is
unchanged. No push, promotion, additional agents, loop or dispatcher control-state edits.
