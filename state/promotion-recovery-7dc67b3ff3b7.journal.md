# Promotion recovery 7dc67b3ff3b7 — run journal

Task: `promotion-recovery-7dc67b3ff3b770aa51bb-5cb00b7c2379`.
Base: `7dc67b3ff3b770aa51bbaf9c5a645165db40af8c` (RC-CAN-8.5: an Add panel a GM can read).

## Investigation

- Only `CI: e2e` failed (attempt `afe2d161-fd5b-4976-b5fa-e8fd1ecf1ac9`): 1 failed, 35 skipped,
  1,856 passed. The failure was
  `[desktop-chromium] tests/e2e/add-panel.spec.ts:22` "adds Dice in two clicks after Edit
  layout", at line 49. The new tile's bottom edge was 744 against a 720px viewport. Its
  screenshot showed the new Dice tile in the third row, cut off by the bottom of the board.
- Reproduced on the base: `--repeat-each=12 --workers=3` on desktop-chromium gave 2 failed and
  10 passed, with the same `Received: 744`.
- Cause: the gallery focuses the new frame and calls `scrollIntoView` in a `setTimeout(0)` after
  the panel closes. Closing the side panel widens the board pane. `SceneBoardCanvas` reads that
  width through a ResizeObserver (`wrapWidth`), and on Fit the width sets the scale. When that
  re-render commits after the gallery's timeout, every tile grows and moves down. The tile that
  had just been scrolled fully into view at the old, smaller scale then extends past the bottom.

## Repair

- `SceneBoardCanvas.tsx`: a `useLayoutEffect` keyed on `wrapWidth` scrolls the focused element
  into view (`block`/`inline: 'nearest'`) when it is inside the board. It runs in the same commit
  that applies the new scale, so the result holds whichever order the two events arrive in. It
  does nothing when focus is outside the board or the element is already in view. It is keyed on
  the pane width only, not on content-extent changes, so a drag in progress is never scrolled.
- No assertions, specs, thresholds, retries or workflows changed.

## Validation

- After the fix: the same test with `--repeat-each=40 --workers=3` passed 40 of 40.
- `pnpm typecheck` exit 0. `eslint` on the changed file exit 0. `prettier --check` clean.
- `pnpm test` exit 0: 286 / 5,234, 46 / 569, 168 / 2,028 and 31 / 246 files / tests.
- Full e2e (both profiles, `--workers=2`, `/tmp/e2e-full-aa6.log`): the session ended at test 68
  of 1,892. All 68 that ran passed. The suite was not completed.
- Targeted board/canvas e2e on both profiles: see below.
