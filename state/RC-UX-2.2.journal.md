# RC-UX-2.2 run journal

## Scope and findings

- Canvas and map screen-reader contracts. Owned: `app/SceneBoardCanvas.tsx`, `app/canvas`, `app/map`,
  `tests/e2e/a11y-axe-gate.spec.ts`, `docs/development/ACCESSIBILITY.md`. No agents, push, promotion or
  dispatcher changes.
- Headroom tools were not used; all output cited here is from native commands.
- Before: the board/scene canvas wrapper had no role or name; the flow layout likewise. The map editor canvas
  was already `role="application"` but its name had no counts. The map List view (RC-MAP-4.1) already existed
  with counts in its region and table names. Canvas keyboard moves, pick-up and put-down were silent; only
  resize, zoom and undo/redo spoke.
- Constraints: `SceneBoardCanvas.tsx` sat at exactly the 800-line RC-STB-2.7 limit and `EditorCanvas.tsx` at its
  grandfathered baseline, so the contract lives in two new modules and those files did not grow.
  `SceneBoardModel.ts` and the i18n catalogs are outside ownership, so no new props and no new catalog keys;
  copy is English-only like the rest of `app/canvas`, and the map name reuses the existing `mapList.summary`.

## Decisions

- `role="application"` only while a layout is being EDITED (the canvas owns the arrow keys then). In view mode
  the surface is a named `region`, so browse mode still reads widget content. Map canvas stays `application`.
- Names carry counts: "GM Screen, 6 widgets" / "GM Screen layout editor, 6 widgets" / "Scene canvas|Scene layout,
  N widgets" / "Scene layout editor, N widgets" / "Map canvas — name. N points of interest, … Drawing tool: X."
- The list path for board/scene is the reading-ordered, named widget frames; for the map it is the List view.
- One operation live region per surface (`OperationLiveRegion` + `useOperationNotice`, seq-keyed so repeats
  re-announce). FlowBoard's duplicated notice code now uses it. Removal is already voiced by the Undo toast.

## Validation results

- New `a11y tree:` Playwright tests (board, scene editor, map editor) passed on desktop-chromium and
  mobile-chromium (6 tests).
- Mutation checks: making the canvas count off by one failed the board and scene tests; dropping the counts
  from the map canvas name failed the map test. Both restored.
- Neighbouring e2e specs, both profiles: a11y-axe-gate, canvas, custom-widgets, flow-layout, map-editor,
  android-quick-map, atlas — 277 passed, 5 skipped. canvas-keyboard, responsive, scene-cards, combat-tile,
  note-depth — 145 passed, 5 skipped.
- Vitest (`--root apps/gm-react`) over app/canvas, app/map, flow/board tests and screens: 27 files, 314 tests
  passed, including the new `surfaceA11y.test.ts`. Run from the wrong cwd these files fail with ENOENT on
  repo-relative reads; that is the invocation, not the change.
- App typecheck and ESLint on changed files clean. `scripts/quality-gates.ts` passed (size gate:
  SceneBoardCanvas 798, FlowBoard 777, EditorCanvas unchanged at its 1071-line baseline).

## Manual script

- ACCESSIBILITY.md §4 rewritten as a timed one-hour NVDA / VoiceOver / TalkBack script with a results log.
  It has NOT been run; the log row says "not yet run" and is for the owner to fill in.

## Rebase onto 287a3f2a (retry)

- The rebase conflicted in `SceneBoardCanvas.tsx` with RC-CAN-3.6 (multi-select, align/distribute, group,
  z-order) and the extracted `EmptyCanvas`. Resolved in favour of the integration branch: pointer and
  keyboard moves go through `moveAll` over the whole selection, and the operation live region announces
  the focused tile's new position. The arrange "done" notice now speaks through the same shared region
  (`announce`), which replaced `sizeNotice`. The empty state stays `<EmptyCanvas>`.
- SceneBoardCanvas is 787 lines, under the 800-line size gate.
- After the resolve: app `tsc --noEmit` exit 0, ESLint and Prettier clean on the changed files, and
  canvas-related vitest from the repo root passed (5 files, 95 tests). `a11y-axe-gate.spec.ts` passed on
  both profiles, 58 of 58, including the three `a11y tree:` tests.
