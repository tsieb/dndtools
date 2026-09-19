# RC-CAN-4.3 run journal

## Scope

`>board` and `>scene` command-palette actions: Add tile of type…, Apply template…, Toggle edit,
Undo, visible only on `/board` and `/scene/:id`. Owned paths: `app/CommandPalette.tsx`,
`app/shortcuts/registry.ts` (under `apps/gm-react/src`), `packages/core/src/queries/command-actions.ts`
(contextual action provider), `packages/core/src/queries/quick-switcher-query.ts`, and wiring in
`apps/gm-react/src/screens/Board.tsx` and `screens/sceneEditor/index.tsx`. Acceptance:
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

## Supporting paths and screen wiring

- `apps/gm-react/src/screens/Board.tsx`, `screens/sceneEditor/index.tsx` (added to this claim by
  the 2026-09-18 operator brief): each extracts its Edit-layout button handler into `enterEditing(next)`
  (no behaviour change) and adds one `useEffect` that registers the canvas surface. Needed
  because Toggle edit and Undo act on state that only lives in those screens.
- `packages/core/src/index.ts`: exports `listCanvasCommandActions`, `canvasSurfaceForRoute` and
  the two new types.
- `apps/gm-react/src/i18n/messages/{en,es}.ts`: seven `palette.canvas.*` keys each.
- `apps/gm-react/tests/e2e/command-palette.spec.ts` (the acceptance spec) and a new
  `packages/core/tests/canvas-command-actions.test.ts`.

## Rebase follow-up (2026-09-19)

- Rebased the candidate onto local `loop/rc` at `268e32b8`. Kept the upstream dialog-scoped
  assertion when resolving the sole conflict in the acceptance spec. No fetch, push or promotion.
- Both screen edits remain wiring only: share the toolbar handler and register the current canvas.
- Current `loop/rc` includes `scene.apply-template`; the earlier deferral is closed. Scene routes
  now offer built-in, nonempty saved-preset and live template-scene sources, using the picker payload.
  Applying appends to the selected scene, leaving the home scene untouched.
- Literal `>board` and `>scene` prefixes scope the query to that route's canvas actions; an
  optional following query filters those actions. Other routes return no scoped canvas actions.
- Added core dispatch and browser coverage for scene template application and literal prefixes.
- Dispatch Headroom tools were unavailable in this session; native commands retain full gate logs
  under `/tmp/rc-can-43-*.log`. No additional agents or dispatcher state changes.
- Post-rebase validation on the final source:
  - `pnpm typecheck`: exit 0 (`/tmp/rc-can-43-typecheck-final.log`).
  - `pnpm lint`: exit 0 (`/tmp/rc-can-43-lint-final.log`); baseline warnings remain.
  - `pnpm test:app`: exit 0, 139 files / 1524 tests (`/tmp/rc-can-43-app.log`).
  - Focused core `canvas-command-actions.test.ts` + `command-actions.test.ts`: exit 0,
    2 files / 14 tests (`/tmp/rc-can-43-core.log`).
  - Final `command-palette.spec.ts`, desktop and mobile Chromium: exit 0, 42 passed (1.8m)
    (`/tmp/rc-can-43-e2e-final.log`). This run began after all source/spec edits.
  - Changed-file Prettier and `git diff --check`: passed.
- Historical validation below is retained for provenance only.

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

## Quality-gate retry (2026-09-19)

- Read the original dispatcher attempt log for `b97c602a-aa0c-4fc8-a98d-cbc78845f3dd`.
  Its only failure was `file-size-exceeded`: `CommandPalette.tsx` had 810 lines against
  the 800-line limit. Earlier local checks did not include `pnpm gates`.
- Condensed the palette component's repetitive documentation, retaining its filtering,
  dispatch and DS input contracts. No executable code or screen wiring changed.
- `loop/rc` remains `268e32b8`; it is already an ancestor of this candidate.
- Validation on this retry:
  - `pnpm gates`: exit 0; six gate contracts and documentation checks passed
    (`/tmp/rc-can-43-retry-gates.log`). Palette is 794 lines; existing soft-limit warnings remain.
  - `command-palette.spec.ts`, desktop/mobile Chromium with one worker: exit 0,
    42 passed (1.4m), `/tmp/rc-can-43-retry-e2e.log`.
  - Changed-file Prettier and `git diff --check`: passed.
- Final diff review confirms the source change is documentation only. No gate exception,
  threshold change, executable-code change, or dispatcher-state mutation.
