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
