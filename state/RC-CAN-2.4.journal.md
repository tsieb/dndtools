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

## Attempt 4 (2026-09-11)

Gate feedback on `80481fc7`: every gate passed except Browser acceptance (run `6d9a5236`, 1090
tests: 976 passed, 99 failed, 8 flaky, 7 skipped, 29.5 min).

Diagnosis: the gate was testing another worktree's dev server, and that server died mid-run. This
tree was not the cause.

- Mechanism. `apps/gm-react/playwright.config.ts:14` defaults the port to 5273, and `:66` sets
  `reuseExistingServer: … || !process.env.CI`. The dispatcher sets neither `CI` nor
  `DNDTOOLS_E2E_PORT` for the Browser acceptance gate, so two overlapping gates share whichever vite
  holds :5273.
- Overlap. Worktree `b982c72c5e489e8055d5` ran two Browser acceptance gates inside this gate's window
  (born 1789192931, ended 1789194701): attempt `a83f77a6` (1789192142 → 1789193316) and attempt
  `038e294a` (1789193443 → 1789194710).
- Evidence in the log:
  - about 230 `page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5273/…` errors, the
    cascade when the other run's vite exits;
  - the rest were element-not-found failures such as `getByTestId('scene-board-bounded')` and
    `…getByTestId('tile-actions-trigger')`;
  - `b982c72c`'s tree has no `tile-actions-trigger` anywhere under `apps/gm-react/src`, so every
    tile-menu test fails against its server by construction;
  - the failures span specs this task never touched (co-dm, collab, combat, command-palette,
    dice-tray, custom-types).
- Local repro on an isolated port (`DNDTOOLS_E2E_PORT=5391`, desktop-chromium): 5/5 passed.
  `canvas.spec.ts:47` (the `scene-board-bounded` failure), `canvas.spec.ts:1533` (Duplicate + undo),
  `co-dm.spec.ts:278`, `command-palette.spec.ts:32` and `dice-tray.spec.ts:38`.
- No code change: none of the failures reproduce against this tree. The remedy is operator-side and
  outside this task's role: give the Browser acceptance gate a per-worktree `DNDTOOLS_E2E_PORT`, or
  serialize browser gates. This task does not edit the manifest or dispatcher control state.
- Full suite on the same tree (`894439d0`, whose app code matches the gated `80481fc7`), exact gate
  argv on an isolated port: `DNDTOOLS_E2E_PORT=5391 pnpm e2e --workers=2 --retries=2`.
  - Result: exit 0 in 19.0 min, with 1076 passed, 0 failed, 3 flaky and 11 skipped, and no
    `ERR_CONNECTION_REFUSED`.
  - All 10 tile-action-menu tests passed, desktop and mobile.
  - Flaky, each passed on retry, none in code this task touches: `map-editor.spec.ts:342` (desktop)
    and `scene-cards.spec.ts:519` (desktop + mobile). The gate run marked `scene-cards.spec.ts:519`
    flaky as well.
