# RC-CAN-2.4 run journal

## Scope

Tile action menu (`…` → DS `Menu`, `role="menu"`): Move, Resize, Duplicate (core
`scene.duplicate-widget`), Bind…, Configure…, Visibility submenu, Open source, Remove. Acceptance: a
menu keyboard pattern test; `canvas.spec.ts` duplicates a tile; the duplicate is undoable. No agents,
dispatcher mutations, push or promotion.

## Attempt 2 (2026-09-11)

Store record at start: `status: running`, `stage: implement`, revision 99, blocker `candidate changes
paths outside its claim` listing `tests/e2e/canvas.spec.ts`, `commands/dispatch.ts`,
`commands/types.ts`, `schemas/commands.ts`, `tests/command-lifecycle.test.ts`,
`tests/widget-duplicate.test.ts`.

- Every one of those paths now matches the manifest `companion_paths` that `engine.py` adds to the write
  fence (`apps/gm-react/tests/e2e/*.spec.ts`, the three append-only core barrels, `*.test.ts`). The
  rejection predates that change, so the four existing commits stay as they are. Nothing in them sits
  outside `owns` + `companion_paths` + this journal.
- `git merge-tree loop/rc HEAD` is clean. `loop/rc` is 17 commits past the base `5e6064d9`, and its
  `types.ts` append (map features) does not conflict with the `scene.duplicate-widget` union member.
- Gap found. The last commit (`fa8cb075`) made Duplicate undoable: the menu mints `copyId` before
  dispatch, `buildWidgetInverse` maps it to `scene.destroy-widget`, and `scene.restore-widget` now
  inverts to destroy so redo keeps the copy's identity. It kept those tests out of the tree to stay
  inside the old fence, so neither suite exercised undoing a duplicate end to end.
  - `packages/core/tests/widget-duplicate.test.ts`: new case covering the copyId inverse, undo,
    redo-as-restore of the same id, the restore's own inverse, and refusal of a copyId that is
    already in use (live or tombstoned).
  - `apps/gm-react/tests/e2e/canvas.spec.ts`: the Duplicate test now presses toolbar Undo (copy gone,
    "Undone: duplicated …") and Redo (same id back) before its reload check.

- Prettier reflowed a few lines that were already unformatted in the committed
  `widget-duplicate.test.ts` (the `setup` return, a section literal). CI's `format:check:changed`
  checks whole changed files, so the reflow stays in.

## Validation results

- `pnpm --filter @dndtools/core exec vitest run`: 273 files, 4774 tests passed (includes the new
  copyId undo/redo case and `command-lifecycle.test.ts`).
- `pnpm --filter @dndtools/core typecheck` and `pnpm --filter @dndtools/gm-react typecheck`: clean.
- `eslint` on both edited test files: exit 0. `prettier --check`: clean after `--write`.
- `pnpm gates`: exit 0 (6 gates; file-size lines are warn-only and none name a file this task owns).
- `DNDTOOLS_E2E_PORT=5391 playwright test canvas.spec.ts -g "tile action menu" --workers=2`: 10/10
  passed across desktop-chromium and mobile-chromium. Covered: the WAI-ARIA menu-button keyboard
  pattern with submenu; Duplicate followed by toolbar Undo (copy gone, "Undone: duplicated …") and
  Redo (same id back), then the reload check; Move/Visibility/Remove; Bind…/Configure….
- Not run here: the full Playwright suite (the operator's Browser acceptance gate runs it).
