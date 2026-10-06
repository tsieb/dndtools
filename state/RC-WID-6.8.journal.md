# RC-WID-6.8 run journal

## Implementation

- `draft.ts`: `DOCKING_SURFACES` (`command-center`) and `surfacesDock`. `buildWidgetDefinition`
  writes the dock-preference field only when the draft's surfaces include a docking one, so a
  scene-only (or scene + player-view) widget has no dock field and no schema key for it. `readPackage`
  already defaults a missing field to `canvas`, so build → read → build is stable. An edit that drops
  the field emits a migration with no defaults; the open configuration schema keeps any stored value.
- `draft.ts`: `widgetSettingsFields` is the one rule for what a placed tile offers. It drops
  `visibility` and the dock preference. `titleSetting` (key `title`, display group; `board-helpers`
  already reads it as the tile title), `rangeSettings` (`min`/`max`, number, content group), and
  `counterRecipe(name, range)`: a tracker template with count (content), title, minimum and
  maximum. RC-WID-6.3's Quick track has not landed (`quickRecipes.ts` does not exist), so the
  counter recipe lives in `draft.ts`, which both stories own. 6.3's "Counter or clock" card is meant
  to be this draft.
- `TileActionMenu.tsx`: settings come from `widgetSettingsFields`. With none, the row reads "No
  settings", disabled, with the reason as a described hint ("This widget declares nothing to set.
  Add settings in Edit widget." when Edit widget is available). Edit widget stays beside it. The
  Configure dialog gets the filtered fields (`{ ...w, configFields: settings }`), so it never shows
  the dock preference.
- `Inspector.tsx`: same filter. When nothing is declared at all, the settings tabs say
  "No settings: this widget declares nothing to set." and point at Edit widget definition when it is
  available.
- `ConfigStep.tsx`: `visibility` is flagged as a reserved key beside the dock preference.
- i18n: `sceneEditor.noSettings`, `sceneEditor.noSettingsEdit`, `builder.config.reservedVisibility`
  (EN/ES). `builder.layout.dockPreferenceHelp` now says the dock preference is saved only when the
  widget can go on the Command Center. qps-ploc regenerated (`tsx scripts/i18n-catalog.ts pseudo`).
- `docs/architecture/WIDGETS.md` §6: "Settings that exist".

## Attempt 2: back inside the claim

- Attempt 1 edited `apps/gm-react/src/app/widgets/templates/Tracker.tsx` (RC-WID-6.5) so the meter
  ran between a configured `min`/`max`. The claim fence refused it. The acceptance does not need a
  meter, so the file is back at base `c66d0904`. The range settings are now content-group numbers.
  The unchanged tracker already shows every content number as a figure, so a counter tile reads
  "Count 3 · Minimum 0 · Maximum 8", and a title or range saved in Configure… is what the tile says.
  The count has no declared `max`, so the tracker never draws it against a ceiling the GM did not set.
- HANDOFF (RC-WID-6.5 or 6.3): a meter that fills between the configured range would read better
  than three figures. It needs the tracker to take its ceiling from the `min`/`max` settings.

## Deliberately not done

- Colour as a recipe setting: per-instance colour is the `configuration.styleTokens` override
  object (`resolveWidgetStyleVariables`), which no flat config control writes. A flat `colour`
  field would be one more setting that does nothing. Players-visible is the host's per-instance
  visibility (tile menu › Visibility, Inspector), which `widgetSettingsFields` deliberately leaves
  out of the settings list. A field for it would put the same control on the tile twice.
- HANDOFF (RC-WID-6.4, owns `LayoutStep.tsx`): the Layout step still shows the dock picker for a
  scene-only widget. The picked value is now dropped on build, and the help text says so. Hiding the
  picker when no docking surface is selected belongs with 6.4's progressive-disclosure pass.
- HANDOFF (RC-WID-6.3): build the Quick track's "Counter or clock" card from `counterRecipe` and
  its settings from `titleSetting`/`rangeSettings`, so a Quick-track counter is this definition.

## Tests

- `draft.test.ts` › "RC-WID-6.8 widget settings that exist": a scene-only widget has no dock field
  (also scene + player-view, and after a read-back and rebuild); the dock field is still declared
  for a Command Center widget; dropping it migrates with no defaults; `widgetSettingsFields` drops
  visibility and the dock preference; the counter installs through the real core and round-trips
  through the Full builder unchanged apart from the version.
- `tests/e2e/widget-settings.spec.ts` (desktop-chromium + mobile-chromium): the counter is built in
  the page from `draft.ts` and installed with author trust, then placed from the Add gallery on
  /board. It reads "Count 0 Minimum 0 Maximum 6". Its Configure… dialog shows Title (empty),
  Minimum (0), Maximum (6) and Count (0), with no "Dock preference" and no select. Saving title
  "Doom of the Lich", maximum 8 and count 3 changes the tile's accessible name and its readout to
  "Count 3 Minimum 0 Maximum 8". Opened again, the dialog holds those values, and a minimum of 2
  shows on the tile. A scene-only widget with no settings stores no dock field, its menu has no
  Configure… and a disabled "No settings" row with the reason as its accessible description, Edit
  widget is offered, and pressing the disabled row opens nothing.

## Verification (local, 2026-10-06, attempt 2)

- `git diff --stat c66d0904`: only claimed paths plus companions (catalogs, qps-ploc, the new e2e
  spec, `WIDGETS.md`, this journal). `Tracker.tsx` is identical to base.
- `vitest --config vitest.app.config.ts` over `widgetBuilder`, `widgets`, `canvas`, `sceneEditor`:
  29 files, 635 tests passed.
- `tsc --noEmit` (gm-react): clean. `eslint` on the changed files and the spec: clean.
- `playwright test tests/e2e/widget-settings.spec.ts` on both profiles, `--repeat-each=2`: 8 passed.
- Neighbouring specs (canvas, board-layouts, binding-inspector, widget-builder, widget-edit-fork,
  starter-widgets, widget-honest-previews, widget-author-trust, note-depth) on both profiles:
  still running when this was committed; see the follow-up commit.

## Verification, attempt 1 (superseded)

- `vitest --config vitest.app.config.ts` over `widgetBuilder`, `widgets/templates`, `canvas`,
  `sceneEditor`: 17 files, 272 tests passed.
- `tsc --noEmit` (gm-react): clean. `eslint` on the changed files: clean. `pnpm lint:raw-style-count`:
  passes. `TileActionMenu.tsx` is 789 lines, under the 800-line `.tsx` gate.
- `playwright test tests/e2e/widget-settings.spec.ts` on both profiles, `--repeat-each=2`: 8 passed.
