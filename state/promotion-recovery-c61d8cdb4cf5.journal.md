# Promotion recovery c61d8cdb4cf5 — run journal

Task: `promotion-recovery-c61d8cdb4cf56bd6922a-2b3ab8fb8050`.
Base: `c61d8cdb4cf56bd6922aab386976dee58ef6cdb0` (Keep the focused tile in view when the board
pane changes width).

## Investigation

- Only `CI: e2e` failed (attempt `b93259d7-3bc4-458d-9e93-fe117f1506be`): 1 failed, 35 skipped,
  1,856 passed. The failure was `[mobile-chromium] tests/e2e/shell-polish.spec.ts:67` "keyboard
  skip, palette focus return, empty queue feedback and large text", at line 90. The click on the
  header Search button timed out because `<div class="app-fixed-viewport">` intercepted pointer
  events. The failure screenshot and ARIA snapshot both show the command palette still open, with
  its input focused.
- Reproduced on the base: `--project=mobile-chromium --repeat-each=30 --workers=4` on
  `shell-polish.spec.ts:67` gave 1 failed and 29 passed. In that run the failure surfaced one
  assertion earlier (line 85, `toBeFocused` received "inactive"): the same dropped Escape, but the
  palette's focus timer took focus from the opener before the assertion polled.
- Cause: the DS `CommandPalette` (`src/ds/components/command/CommandPalette.tsx`) renders the
  dialog straight away but focuses its input in a `setTimeout(0)`, and Escape was handled only by
  the input's own `onKeyDown`. The spec opens the palette with Enter, waits for the dialog to be
  visible, then presses Escape. When that Escape lands before the timer fires, focus is still on
  the opener. The key is dropped, `toBeFocused(search)` still passes because focus never left the
  opener, and then the timer moves focus into the input. The palette stays open over the page and
  blocks the click at line 90. A real keyboard user who presses Escape quickly loses the key in
  the same way. Dialog, Sheet and Popover do not have this problem because they own Escape on
  `document` in the capture phase.

## Repair

- `CommandPalette.tsx`: Escape now goes through the same mechanism as Dialog, Sheet and Popover:
  an escape layer (`platform/escapeLayers`) plus a capture-phase `keydown` listener on `document`.
  The listener is installed in a `useLayoutEffect`, so it is live before the palette paints.
  Closing no longer depends on where focus is. The input's own Escape branch was removed because
  the document listener now handles that key and stops it there. The map editor's document
  keymap is already `suspended` while its palette is open, so stopping propagation does not
  change that surface.
- New `src/ds/components/command/CommandPalette.test.tsx`: a regression test that opens the
  palette while focus is on an opener and presses Escape before the input's focus timer fires,
  plus a check that Escape from the input still closes it. The first test fails on the base
  (`× closes on an Escape pressed before its input has focus`) and passes with the fix. It lives
  in its own file because `ds-interaction-fixes.test.tsx` is capped at its grandfathered
  1,766-line baseline (RC-STB-2.7 file-size gate). That baseline was not raised.
- No e2e assertions, specs, thresholds, baselines, retries or workflows changed.

## Validation

- After the fix: `shell-polish.spec.ts:67` on mobile-chromium, `--repeat-each=60 --workers=4`,
  passed 60 of 60.
- Every e2e spec that drives the palette, on both profiles (`--workers=2`): `shell-polish`,
  `command-palette`, `palette-polish`, `map-editor`, `local-vaults`, `screens`, `atlas-polish`,
  `feature-spotlight`, `maturity-signals`, `knowledge-filters`, `responsive`, `ux-audit`:
  374 passed, 4 skipped, 0 failed.
- `pnpm test` exit 0: 286 / 5,234, 46 / 569, 169 / 2,030 and 31 / 246 files / tests (includes
  `tests/unit/file-size-gate.test.ts`).
- `pnpm typecheck` exit 0. `eslint` on `src/ds/components/command/`: 0 errors. One
  `exhaustive-deps` warning on the existing `flat.length` effect remains; it predates this change.
  `prettier --check` clean.
- The full e2e suite was not re-run locally. The operator's promotion gates cover it.
