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

## Attempt 3 (2026-09-11)

Gate feedback on the rebased head `08f73b4e`: Quality gates passed, and `Format (changed)`
(`pnpm format:check:changed --base loop/rc`) failed on `apps/gm-react/src/app/canvas/TileDialogs.tsx`.
Attempt 2 only ran Prettier on the files it edited itself, and this owned file from the earlier
commit `aa2d5c4e` was never formatted.

- `prettier --write` on `TileDialogs.tsx` rewrapped two long `.map(…)` callbacks: whitespace only, no
  behaviour change.
- `pnpm format:check:changed --base loop/rc`: all 15 changed files pass. `eslint TileDialogs.tsx`:
  exit 0.
- Lesson: before committing, run the gate's own command over the whole branch, not Prettier over the
  files touched in this attempt.
- Committed as `232daed0`. The first failure stopped the dispatcher, so the later gates never ran on
  this head; I ran each manifest gate whose `paths` match this diff, at the manifest's own argv:
  - Typecheck (`pnpm typecheck`): exit 0.
  - Lint (`pnpm lint`, incl. boundary lint and the non-text contrast gate): exit 0.
  - Core tests (`pnpm test:critical --maxWorkers=3`): 273 files, 4779 tests passed.
  - App tests (`pnpm test:app --maxWorkers=3`): 122 files, 1281 tests passed.
  - Build (`pnpm build`): exit 0. Only the usual chunk-size warning; `check-prod-bundle` OK.
  - Requirements audit (`pnpm feature-audit`): exit 0, 0/22 screens need wiring review.
  - Quality gates and Format (changed) already passed above.
  - Not run: Cloud tests and Tooling tests (no matching paths), and Browser acceptance (the full
    `pnpm e2e` suite, left to the operator gate). Attempt 2's tile-menu e2e block passed 10/10 on
    both projects, and this attempt changed only whitespace in app code since then.
