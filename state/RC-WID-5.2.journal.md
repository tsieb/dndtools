# RC-WID-5.2 — Query sources for hub screens

## Session 1 — 2026-10-02: implementation

Started on `dispatch/dndtools/ef824cc98aba2d1aa49f` at `5611f236` with a clean tree. No Headroom
tools were exposed in this session, so command output went to `/tmp/rc-wid52-*.log` and I read
those logs directly.

### What landed

Seventeen query sources were added after the original eight, in `ALL_WIDGET_DATA_QUERY_SOURCES`
order: `screens`, `vault-counts`, `party`, `campaign`, `dice-history`, `handouts`, `rollable-tables`,
`quick-reference`, `session-archives`, `continuity-digest`, `rest-log`, `presence`,
`player-projections`, `initiative-call`, `combatant-status`, `capture-candidates`, `widget-library`.
The story names the first eight. The other nine are the rows SCREENS_PARITY §4.1 G-02 adds
(BD-27, SE-19–SE-25, SE-34/35, SE-39/41, SE-42–44, BD-29, CC-14/15).

- Owned `packages/core/src/state/widget-package-state.ts`: the union and the ordered list.
- Owned `packages/core/src/schemas/widget-package.ts`: `source` is now
  `z.enum(ALL_WIDGET_DATA_QUERY_SOURCES)`, so the schema cannot drift from the list.
- Owned `apps/gm-react/src/app/widgets/dataEnvironment.ts`: `resolveHubSource` maps each new
  source onto an existing `*ForActor` read (table in WIDGETS.md §3.2). The rows gain optional
  `avatar` (initials) and `thumbnail` (the scene background token, since screens carry no image).
  An optional `WidgetHostContext` brings in the two device-local values: the vault name from the
  local catalog and the platform profile. `useWidgetHostContext` supplies them, and
  `useWidgetTemplateData` passes them through.
- Owned `DataStep.tsx` / `DataStepBindings.tsx`: every query card shows a live preview. It gives
  the author's row count and header, the preview player's count (or "not shown" when the declaration
  withholds it), and the first three rows. A new "Every source" section opens a catalogue of all 25
  sources, each with the same two readings. Both previews call `resolveWidgetTemplateData`, the same
  resolver a placed widget uses, against the live vault: once as the author, once as
  `PREVIEW_PLAYER_ACTOR_ID`. The catalogue resolves only while it is open.

### Outside the owned paths (flagged for the operator)

- `apps/gm-react/src/app/widgetBuilder/vocabulary.ts` (+17 lines) and
  `packages/core/src/mcp/tool-registry.ts` (+17 glosses, one comment) each hold a
  `Record<WidgetDataQuerySource, …>`, so typecheck fails until every source has an entry. Both
  edits only add entries. `mcp-widget-package-propose.test.ts` also requires the tool description
  to name every source.
- Companions: `en.ts`/`es.ts` (+26 keys each), `qps-ploc.ts` (regenerated with
  `npx tsx scripts/i18n-catalog.ts pseudo`), `docs/architecture/WIDGETS.md` (§3 line, new §3.2), the
  new test `dataEnvironment.hub.test.ts` and the new spec `tests/e2e/widget-query-sources.spec.ts`.

### Not covered, and why

The following G-02 items do not come from a core read, so no query source can honestly answer them:

- live P2P peers and initiative readiness: these belong to the host transport in
  `apps/gm-react/src/net/`. The `presence` source covers the core-presence half of SE-23.
- post-save continuity mentions (SE-41): transient Session UI state.
- a durable campaign name: core has none. The vault catalog name comes in through
  `WidgetHostContext`. Without it the row reads "Your campaign", as the Command Center hero does.

### Evidence

- `dataEnvironment.hub.test.ts`: 99 tests passed (`/tmp/rc-wid52-hub-test.log`). Each of the 16
  sources is checked the same way. The DM's reading must carry a `SECRET` row (the control). The
  readings for a real player, an observer and the preview player must contain no `SECRET`, with the
  query declared `audience: 'shared'` so the core read is what keeps the row out. A player must
  still get their visible rows, and `audience: 'dm'` must withhold the query. `session-archives` has
  its own branch: an archive without a recap is the DM's alone, and appears for the player once
  `session.author-recap` runs.
- Mutation check: pointing the `handouts` and `party` reads at the DM actor turned 8 tests red
  (`/tmp/rc-wid52-hub-mutant.log`). The file was then restored byte for byte from `/tmp`. Dropping
  only presence's `resolveSceneVisibility` did not fail a test, because the row's scene-name lookup
  also uses the viewer's own visible scenes. That source has two guards.
- `widget-query-sources.spec.ts` on desktop-chromium + mobile-chromium: 4 passed
  (`/tmp/rc-wid52-e2e.log`). The source picker offers all 25 sources. The catalogue lists all 25,
  each with both readings. A DM-only screen made through `scene.create` counts for the DM and not
  for the player. Quick reference reads "For a player: 0 rows". A query card follows a change of
  source, and switching it to DM-only makes it read "not shown". Axe on the open catalogue found no
  critical or serious violations.
- `widget-builder.spec.ts` + `widget-generate.spec.ts` + the new spec, both profiles: 28 passed
  (`/tmp/rc-wid52-e2e-builder.log`).
- App vitest over `app/widgets`, `app/widgetBuilder`, `i18n` and the file-size gate: 21 files, 432
  tests passed (`/tmp/rc-wid52-app-vitest.log`). The first run failed on my own copy:
  `builder.data.previewMore` was a plural whose branches were identical, which the catalogue shape
  check misparsed. I replaced it with a plain `{count}` argument.
- Full core vitest: 284 files, 5184 tests passed (`/tmp/rc-wid52-core-vitest.log`).
- Full app vitest (`vitest.app.config.ts`): 160 files, 1850 tests passed (`/tmp/rc-wid52-app-full.log`).
- `pnpm typecheck` exit 0 (final run after the last edit, `/tmp/rc-wid52-typecheck.log`). ESLint over every changed TS/TSX file, Prettier `--check` on every
  changed file and `git diff --check` all passed.

The full wrapper gates, pinned visual regression and independent review are left to the central
operator. No push, promotion, dispatcher-state edit or additional agent was used.

## Session 2 — 2026-10-02: claim-fence repair

The gate rejected `42f59ae9` for touching `apps/gm-react/src/app/widgetBuilder/vocabulary.ts` and
`packages/core/src/mcp/tool-registry.ts`, neither of which is in the claim. No Headroom tools were
exposed, so output went to `/tmp/rc-wid52-r2-*.log` and I read those logs directly.

- `tool-registry.ts`: **reverted to base `5611f236`** (now byte-identical). The source list is split
  in the owned `widget-package-state.ts`. `ALL_WIDGET_DATA_QUERY_SOURCES` is back to the original
  eight, which is the list the propose tool's `z.enum` and its exhaustive gloss `Record` are keyed
  on. The new `ALL_WIDGET_HUB_QUERY_SOURCES` holds the 17 hub sources, and
  `WIDGET_DATA_QUERY_SOURCES` is both lists together. The persisted schema and the builder catalogue
  read `WIDGET_DATA_QUERY_SOURCES`. Consequence: the `widget.package.propose` tool still teaches and
  accepts only the original eight, and WIDGETS.md §3.2 says so.
- `vocabulary.ts`: **kept** (18 added lines: entries only, plus one comment). The acceptance
  criterion needs the builder's Data step to list every source, so the hub sources must be members
  of the query `source` type. Two files outside the claim then constrain that type:
  - `vocabulary.ts`: `QUERY_SOURCE_LABEL: Record<WidgetDataQuerySource, MessageKey>` is exhaustive,
    so widening `WidgetDataQuerySource` fails typecheck without the new entries;
  - `WorkerHost.ts:430`: `const source: WidgetDataQuerySource = definition?.dataQueries?.[0]?.source …`.
    Keeping the exported union narrow and widening only the field makes this fail instead. I ran
    that experiment and restored the file afterwards: `error TS2322: Type 'WidgetQuerySourceAll' is
not assignable to type 'WidgetDataQuerySource'` (`/tmp/rc-wid52-r2-optionC.log`).

  So one file outside the claim has to change either way. The entries-only `vocabulary.ts` edit is
  the smaller of the two. **The operator needs to decide whether to widen the claim to that file.**

- Companion `packages/core/src/index.ts` exports the two new constants. The hub test, the e2e spec
  comment, `DataStepBindings.tsx` and `dataEnvironment.ts` now use the split names.

Validation after the repair:

- `pnpm typecheck` exit 0 (`/tmp/rc-wid52-r2-typecheck.log`).
- App vitest over `app/widgets`, `app/widgetBuilder`, `i18n` and the file-size gate: 21 files, 432
  tests passed, including the 99 hub isolation tests (`/tmp/rc-wid52-r2-app.log`).
- Full core vitest: 284 files, 5184 tests passed, including `mcp-widget-package-propose`
  (`/tmp/rc-wid52-r2-core.log`).
- `widget-query-sources.spec.ts` + `widget-builder.spec.ts` + `widget-generate.spec.ts` on
  desktop-chromium and mobile-chromium: 28 passed (`/tmp/rc-wid52-r2-e2e.log`).
- ESLint and Prettier `--check` on the changed files, and `git diff --check`, all passed.

## Session 3 — 2026-10-04: widened claim verification

Resumed at `733b53fa` on the existing task branch with a clean tree. The operator brief now
explicitly includes `apps/gm-react/src/app/widgetBuilder/vocabulary.ts`, resolving the ownership
blocker recorded in session 2. The implementation and acceptance tests are already committed in
the candidate history; no source rewrite is needed to address that ownership feedback.

No Headroom tools are exposed in this session. Fresh validation output is retained in
`/tmp/rc-wid52-r3-*.log` and read directly. Every command below exited 0:

- Focused app Vitest (`app/widgets`, `app/widgetBuilder`, `i18n`): 21 files and 432 tests passed,
  including the hub-source isolation suite (`/tmp/rc-wid52-r3-app.log`).
- `pnpm typecheck`: core, cloud functions and React app passed
  (`/tmp/rc-wid52-r3-typecheck.log`).
- Core custom-widget-platform, mcp-widget-package-propose and widget-data-safety suites:
  3 files and 40 tests passed (`/tmp/rc-wid52-r3-core.log`).
- Query-source, widget-builder and widget-generate Playwright specs: 28 passed on desktop and
  mobile Chromium, including source catalogue previews, audience withholding and axe checks
  (`/tmp/rc-wid52-r3-e2e.log`). The worktree-specific dev server used port 5756.
- ESLint on all six owned implementation files passed (`/tmp/rc-wid52-r3-lint.log`).
- Prettier on those files and this journal passed (`/tmp/rc-wid52-r3-format.log`), as did
  `git diff --check`.

The existing source list, actor-scoped resolver branches, per-source isolation cases and live
builder previews were inspected against SCREENS_PARITY G-02. Session 1's host-transport and
transient-UI limitations and session 2's unchanged MCP propose-source limitation still apply.
This session changes only the required run journal. The implementation remains in `42f59ae9`
and `733b53fa`; the newly authorized vocabulary entries are retained. Full wrapper gates,
pinned visual regression and independent review remain for the central operator. No push,
promotion, dispatcher-control edit, additional loop or additional agent was performed.

## Session 4 — 2026-10-04: pinned visual gate investigation

Resumed at rebased candidate `57d20d314587570d228455ff6603926ff8aaa71f` with a clean tree.
Read the original gate log at
`/home/trinkle/Programming/agent-dispatcher/.state/attempts/fc368a4e-a761-4d70-87f5-46830e6754fb/output.log`.
It reports 482 passing tests and one failure: visual-rail, parchment, `/session`. The screenshot
assertion exhausted its 5000 ms timeout after fonts loaded; no pixel-difference count was reported.
Quality gates and changed-file formatting passed in the operator's supplied gate result.

No Headroom tools are exposed. Reproduction output is retained directly in
`/tmp/rc-wid52-r4-visual-target.log`. The first title filter used display-only separators and matched
no tests; the corrected filter is `golden routes.*parchment.*/session$`.

Fresh verification, with exit code 0 confirmed for each run:

- `bash apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=2
--project=visual-rail --grep 'golden routes.*parchment.*/session$' --repeat-each=5`:
  **5 passed**, without changes (`/tmp/rc-wid52-r4-visual-target.log`).
- `bash apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=2`:
  **483 passed in 11.7 minutes**, including the original rail/parchment Session case in 2.7 seconds
  (`/tmp/rc-wid52-r4-visual-full.log`). No snapshots were updated, assertion settings changed or
  retries added. This is local pinned-container evidence, not central review or promotion.
- `pnpm exec vitest run --config vitest.app.config.ts
apps/gm-react/src/app/widgets/dataEnvironment.hub.test.ts`: **99 passed**
  (`/tmp/rc-wid52-r4-isolation.log`).

The failure did not reproduce in five focused repetitions or the complete gate. The evidence
supports a transient capture timeout, not a demonstrated pixel regression; its underlying timing
cause is not established. No source or baseline change is justified by these results. Only this
journal is changed. The task implementation remains in rebased commits `53e1b71a` and `6470150e`.
No push, promotion, dispatcher-control edit, additional loop or agent was performed.

## Session 5 — 2026-10-04: review findings (live table, continuity mentions, screen visibility)

Resumed at `d149555a` with a clean tree to answer the independent review. No Headroom tools are
exposed, so output went to `/tmp/rc-wid52-r5-*.log` and I read those logs directly.

### Finding 1 (high): live peers, readiness and post-save continuity had no source

Three sources were added to `ALL_WIDGET_HUB_QUERY_SOURCES` (now 20 hub sources, 28 in all):

- `live-peers` (SE-23 transport half). `WidgetHostContext` gains `table: WidgetLiveTable`, built by
  `useWidgetHostContext` from the P2P session (`useSession`, read through a guard so a render with
  no `SessionProvider` gets no table rather than a crash). On a host it is the host's peer list,
  invited peers included. On a joined device it is the roster the host already projected for it.
  The DM reads every peer with its transport id and role, and an unanswered invitation reads
  `Invited`. Anyone else reads only connected peers, keyed by actor, with the fields the host's
  presence broadcast already sends a player (name, status, hand, ready). Online/away prefers core
  presence, as the Session console roster does.
- `table-readiness` (SE-34). Connected players with `Ready`/`Not ready` and an `N of M ready` header,
  for a hosting DM only, which is the rule the console's ready chips follow. A non-DM gets no rows.
- `continuity-mentions` (SE-41). The latest archive whose recap carries a structured capture, run
  through the core's `detectContinuityMentions` against the DM's roster and vault labels (the same
  check `Capture.tsx` runs after save). A quick-created NPC drops off by itself; "Not now" stays a
  local dismissal. DM-only: against a player's smaller roster a hidden NPC's name would come back as
  a "no record" row.

A caller that passes no table gets "The live table is not available here." rather than an empty
roster, and a solo device reads "Not hosting a table".

### Finding 2 (medium): screens lost visibility

`WidgetDataRow` gains `visibility`. A screen row now carries `visibility` and `meta` = the scene's
visibility (as `selected-scene` and `maps` already do), the live flag in `active`, and `· Live` at
the end of `secondary`. A private live screen still reads as private.

### Tests

- `dataEnvironment.hub.test.ts`: 122 passed (`/tmp/rc-wid52-r5-hub.log`). New: `live-peers` and
  `table-readiness` cases in the per-source table, run against a hosting DM's table whose transport
  ids and unanswered invitation carry `SECRET`. A new `dmOnly` flag makes every non-DM reading of a
  DM-only source assert zero rows, not just no `SECRET` (applies to quick-reference,
  continuity-digest, widget-library and table-readiness). A `continuity-mentions` block with its own
  archived-capture fixture covers the DM control, player/observer/preview-player isolation, NPC
  creation and the pre-capture state. A screens test makes each of the three visibilities live in
  turn and checks every row keeps its own visibility. Further cases cover a missing table, a solo
  device and a joined device.
- Mutation check (`/tmp/rc-wid52-r5-orig.ts` restored afterwards, `cmp` clean): unfiltered peers for
  non-DM → 4 failures; continuity open to non-DM → 3; readiness open to non-DM → 4; screen
  `visibility` dropped → 3.
- App vitest over `app/widgets`, `app/widgetBuilder`, `i18n`: 21 files, 455 passed
  (`/tmp/rc-wid52-r5-app.log`).
- Full core vitest: 284 files, 5184 passed (`/tmp/rc-wid52-r5-core.log`).
- `pnpm typecheck` exit 0 (`/tmp/rc-wid52-r5-typecheck.log`); ESLint on changed TS/TSX exit 0
  (`/tmp/rc-wid52-r5-lint.log`); Prettier `--check` on every changed file and `git diff --check` pass.
- `widget-query-sources.spec.ts` + `widget-builder.spec.ts` + `widget-generate.spec.ts`, desktop and
  mobile Chromium, port 5756: 28 passed (`/tmp/rc-wid52-r5-e2e.log`). The spec now lists 28 sources
  and checks that the live-table previews read the real (solo) P2P session ("Not hosting a table";
  readiness "shows while you host a table", player 0 rows) and that `continuity-mentions` reads "No
  session log saved yet." The `DefinitionPane` forwardRef warning in that log comes from
  `BuilderPanes.tsx`, which this change does not touch.

### Companions and limits

- Owned: `widget-package-state.ts`, `dataEnvironment.ts`, `vocabulary.ts` (3 labels). Companions:
  `en.ts`/`es.ts` (+3 keys each), `qps-ploc.ts` (regenerated), the hub test, the e2e spec and
  `WIDGETS.md` §3.2 (table rows, and the paragraph that used to record these exclusions).
- HANDOFF (RC-WID-5.3, which owns `apps/gm-react/src/app/widgets/templates`): the template slot's
  `connect` in `templates/index.tsx` and `WorkerHost.ts` still call `resolveWidgetTemplateData` without
  a host context, as they did before this story. Until they pass `useWidgetHostContext()`, a placed
  template widget reads the live-table sources as "not available here" (honest, not empty) and the
  campaign name as "Your campaign". The builder's previews already pass it. Neither file is in this
  claim, and the acceptance criterion (isolation per source, builder previews) does not need them.

No push, promotion, dispatcher-control edit, additional loop or agent was performed.
