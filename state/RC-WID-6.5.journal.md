# RC-WID-6.5 run journal

## Implementation

- Core (`widget-package-state.ts`): `WidgetDataQueryDefinition.options` (`WidgetDataQueryOptions`):
  `characterKinds`, `tag`, `sceneMembership` (`active-scene` | `in-combat`), `status`
  (`up` | `bloodied` | `down`), `sort` (`name` | `value-high` | `value-low`), `limit` (1–50).
  `WIDGET_QUERY_FILTER_SOURCES` says which sources each filter applies to; `sort`/`limit` apply to
  all. `widgetQueryOptionIssues` is the one rule the schema and the builder share.
  `WIDGET_TEMPLATE_KINDS_READING_QUERIES` / `widgetTemplateReadsQueries` name the kinds that draw a
  query's rows.
- Schema (`schemas/widget-package.ts`): strict options object with per-field shapes, plus a query
  `superRefine` that refuses an option on a source that cannot honour it (path
  `options.<option>`). Additive and optional: a query with no options parses as before.
- Data environment (`dataEnvironment.ts`): filters run over the views the existing `*ForActor`
  reads return. Characters filter by `view.kind`, HP status from the redacted view (withheld HP
  matches no status), `active-scene` intersects with entity ids bound on the active screen as
  `getSceneForActor` delivers it to this actor, `in-combat` with the actor's combat tracker. Tags
  read `scene.tags`, `screen.tags`, and a note's or object's `fields.tags` as the viewer received
  them. Sort and limit run last over normalized rows. A filtered empty result says "…match these
  filters", not "nothing yet".
- Visibility chips: rows that name a visibility set `visibility` and put the app word ("DM only",
  "Shared", "Player visible") in `meta` (`VISIBILITY_WORD`). `StatusList` draws them through
  `RowTag` (shared.tsx) with the `common.visibility.*` keys, so `{gm}` vocabulary applies.
- No-data line: `emptyNoticeOf(null, kind)` says "This widget has no data source yet." only for a
  kind that reads queries. `TemplateShell` derives the kind from its `widget-template-<kind>` test
  id; `TemplateKindProvider` lets a caller name it for the shell-less hub kinds (the preview does).
- Preview: while a data template has no query, `previewNeedsSampleData` → `sampleTemplateData`
  draws three sample rows with a "Sample data" badge in the frame (`widget-builder-preview-sample`).
  As a player the DM-only sample row drops out. Excluded: trackers with configured content numbers
  and card grids with intents. A placed widget never gets sample rows.
- Eyebrow: the preview eyebrow is the author's category, or the template kind's label while the
  category is still the draft default "Custom" (custom code reads "Custom code").
- Data step: the source picker re-derives the query id (`isDerivedQueryId`: `source` or
  `source-N`) and the label while they still hold derived values, drops options the new source
  cannot honour, and renames the query in computed fields' inputs and formula names. A "Show what"
  group per query card (`QueryOptionPickers`, exported) offers only the options the source honours.
- i18n: EN/ES keys for the pickers and preview copy; qps-ploc regenerated
  (`npx tsx scripts/i18n-catalog.ts pseudo`).

## Tests

- `packages/core/tests/widget-query-options.test.ts`: every option's shape, source fit, installer
  refusal, template kinds.
- `apps/gm-react/src/app/widgets/dataEnvironment.options.test.ts`: each option for DM and player,
  including isolation (DM-only PC/NPC/note never returned under any filter; a hidden screen
  contributes nobody to `active-scene`).
- `apps/gm-react/src/app/widgets/templates/noQuery.test.tsx` + snapshot: all 12 kinds with no
  query, as a placed tile and as the preview draws it.
- `dataEnvironment.hub.test.ts`: screens `meta` is now the visibility word.
- `tests/e2e/widget-honest-previews.spec.ts` (desktop-chromium + mobile-chromium): sample preview
  and eyebrow per kind; the party list (one PC and one NPC made player-visible first, since the
  seed has none) filtered to PCs shows every PC and no NPC in the DM preview and on the placed
  board tile; previewed as a player it shows exactly the player-visible rows; axe on the pickers.
  Negative control: with the filters disabled the party test fails (5 rows, expected 3).
- `docs/architecture/WIDGETS.md` §3.3 documents the options.

## Verification (local, 2026-10-06)

- `pnpm --filter @dndtools/core test`: 287 files, 5248 tests passed.
- `pnpm test:app`: 172 files, 2072 tests passed.
- `pnpm typecheck` (core, cloud-fns, gm-react) and `pnpm lint`: pass (pre-existing emphasis warnings
  only).
- Playwright, both profiles: widget-builder, widget-query-sources, starter-widgets, widget-intents,
  widget-commands, widget-honest-previews: 44 + 6 passed. No visual baseline covers the builder,
  and no shipped template widget prints a visibility `meta`, so no golden route should move; the
  visual gate was not run locally.

## Handoffs (outside owned paths)

- Quick track "Show what": the Quick track (RC-WID-6.3, `QuickBuilder.tsx`) does not exist on this
  base. `QueryOptionPickers` is exported from `DataStep.tsx` for it to mount.
- Board tile eyebrow: `board-helpers.ts:178` still uses `def.category`, and `draft.ts` `emptyDraft`
  still defaults the category to "Custom". The preview is fixed here; the placed tile needs either
  the draft default dropped (draft.ts, RC-WID-6.3's claim) or board-helpers to apply the same
  fallback as `BuilderPreview`'s `eyebrowOf`.
- An empty launcher or link list (no intents, no query) on the board still shows the no-data line,
  because `Hub.tsx` draws no `TemplateShell` and `templates/index.tsx` does not name the kind.
  One `TemplateKindProvider` around the connected renderer in `templates/index.tsx` fixes it.

## Attempt 2 — post-rebase Browser acceptance (2026-10-06)

- Gate run `3bae9f0b`: 1871 passed, 2 failed, both
  `widget-honest-previews.spec.ts:80` (desktop + mobile). The rebase picked up RC-WID-6.2
  (`83e83121`): a template package with no permission now installs trusted and already enabled.
  The spec still clicked the `Enable Party HP` switch, which turned the package off. The Add panel
  then showed the disabled row plus its new in-place `Enable Party HP` button, so the
  `/Party HP/` button locator matched two elements (strict-mode violation).
- Fix (spec only, no product change): assert the switch is already checked, the same change
  RC-WID-6.2 made to widget-builder, widget-commands and widget-intents.
- Re-run: `widget-honest-previews.spec.ts` on both profiles, `--retries=0`: 6 passed, then
  `--repeat-each=3`: 18 passed. The dev-server `Function components cannot be given refs`
  warning (`DefinitionPane` → `Textarea`, `BuilderPanes.tsx`) is on the base; that file is untouched here.
