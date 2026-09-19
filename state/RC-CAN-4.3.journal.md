# RC-CAN-4.3 run journal

## Scope

`>board` and `>scene` command-palette actions: Add tile of type…, Apply template…, Toggle edit,
Undo, visible only on `/board` and `/scene/:id`. Owned paths: `app/CommandPalette.tsx`,
`app/shortcuts/registry.ts` (under `apps/gm-react/src`), `packages/core/src/queries/command-actions.ts`
(contextual action provider), `packages/core/src/queries/quick-switcher-query.ts`. Acceptance:
`command-palette.spec.ts`. No agents, dispatcher mutations, push or promotion.

## Design

- **Core provider** — `listCanvasCommandActions(state, actor, { profileId, surface })` in
  `command-actions.ts`. `surface` is `{ kind: 'board' }` or `{ kind: 'scene', sceneId }`.
  - "Add tile: <type>" for every library entry (`includeUnavailable`), targeting the canvas on
    screen: the home scene on `/board`, THAT scene on `/scene/:id`. The payload is
    `resolveAddWidgetCommand`'s, so it matches the gallery's command exactly (unit-tested).
  - "Apply template: <name>" on the board = the Command Center presets
    (`command-center.apply-preset`, the Layouts panel's command).
  - Fails closed: a non-author gets `[]`; a missing, template or deleted scene gets `[]`.
- **Route gate** — `canvasSurfaceForRoute(route)` in `quick-switcher-query.ts` maps only `/board`
  and `/scene/:id` to a surface (query/fragment ignored, id URL-decoded, nested/empty → null).
  The palette offers every canvas verb only when this returns a surface.
- **Toggle edit / Undo** — both are screen-local by design (edit mode is screen state; the undo
  stack is per-person `useLayoutHistory`, never core state). `registry.ts` gained a one-slot
  `registerCanvasSurface` / `activeCanvasSurface` / `subscribeCanvasSurface` bridge; the palette
  reads it through `useSyncExternalStore`, so it picks the rows up even when it opens before the
  canvas mounts. The rows call the toolbar button's own handler and `history.undo`. Undo prints
  its chord from `canvas.undoRedo` in the registry, is disabled with "Nothing to undo yet." when
  the stack is empty, and shows what it would reverse ("Removed Dice") when it isn't.
- **Placement** — a palette-added tile takes the gallery's next free slot (`nextFreeSlot`, or the
  end of the reading order under flow) instead of the library default, then enters edit mode
  and focuses the new tile, as a gallery pick does.
- **Density** — on an empty query "On this screen" holds Toggle edit, Undo and the templates. The
  tile types appear once there's a query or `>`, capped at `ACTION_LIMIT`, so the library can't
  flood the empty palette.
- On canvas routes the global catalog's home-scene "Add <widget>" / "Apply preset" rows are
  suppressed: the canvas provider replaces them. On a scene route they would have added to
  the wrong scene.
- `searchCommandActions` now matches every whitespace token across title + keywords (it used to
  match the whole query as one substring), so `>add tile dice` finds "Add tile: Dice". A query
  with one token behaves exactly as before.

## Boundary crossings (outside Owns — flagged)

- `apps/gm-react/src/screens/Board.tsx`, `screens/sceneEditor/index.tsx` (owned by RC-POL-1.2 /
  RC-POL-1.3 / CAN-4.x): each extracts its Edit-layout button handler into `enterEditing(next)`
  (no behaviour change) and adds one `useEffect` that registers the canvas surface. Needed
  because Toggle edit and Undo act on state that only lives in those screens.
- `packages/core/src/index.ts`: exports `listCanvasCommandActions`, `canvasSurfaceForRoute` and
  the two new types.
- `apps/gm-react/src/i18n/messages/{en,es}.ts`: seven `palette.canvas.*` keys each.
- `apps/gm-react/tests/e2e/command-palette.spec.ts` (the acceptance spec) and a new
  `packages/core/tests/canvas-command-actions.test.ts`.

## Deferred

- **Apply template on `/scene/:id`**: the core has no command that applies a template to an
  existing scene yet. `scene.instantiate-template` creates a NEW scene, and `apply-preset` only
  materializes onto the home scene. RC-CAN-4.4 owns the new `scene.apply-template` (in
  `commands/command-center.ts`) and its palette surfacing. The provider already takes the scene
  surface, so the rows plug in there. Until then a scene route lists no template rows, rather
  than a verb the core would reject.

## Spec fixes to pre-existing tests

- "the palette leads with the actions for the current screen" asserted
  `page.getByRole('group').first()` is "On this screen". On `/board` the board's own Zoom
  `role=group` precedes the palette in the document, so the assertion only held when the palette
  won a race against the board mounting. It failed on this branch. A debug probe showed
  `getByRole('group').first()` resolving to "Zoom" on the base commit as well. The assertion is
  now scoped to the palette dialog.
- `openViaKeyboard` scopes its combobox focus check to the dialog, because a board tile can carry
  its own combobox.

## Validation results

All run locally on this branch, on 2026-09-18:

- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0. Emphasis/contrast warnings are pre-existing baseline entries. One
  pre-existing `react-hooks/exhaustive-deps` warning in `CommandPalette.tsx` (`runtime.state` in
  the memo's dependency list, untouched here).
- Core vitest (`packages/core`): 279 files / 4873 tests passed, including the new
  `canvas-command-actions.test.ts`: 7 tests.
- `pnpm test:app`: 138 files / 1516 tests passed.
- Playwright, both `desktop-chromium` and `mobile-chromium`:
  - `command-palette.spec.ts` + `canvas.spec.ts` + `canvas-arrange.spec.ts` +
    `canvas-keyboard.spec.ts` + `shortcuts.spec.ts`: 136 passed.
  - `add-widget-gallery.spec.ts` + `command-palette.spec.ts` at `--repeat-each=2`: 84 passed.
- Prettier `--write` was run on every changed file.
