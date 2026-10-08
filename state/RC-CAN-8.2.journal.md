# RC-CAN-8.2 — Every tile can be resized

## Implementation — 2026-10-08

Clean task branch on entry. No Headroom tools exposed; original command outputs
are read directly. No additional agents or dispatcher control-state edits.

- Replace the authorship lock with equal declared min/max size detection.
- Declare host bounds for every builtin beside the body registry; preserve core
  definitions, seed sizes and export bytes. The bounded board caps width at its
  right edge; vertically it grows. Free canvases grow on both axes.
- Fit pointer, keyboard and inspector sizes; show handles on hover and selection.
- Fixed-size copy names the widget. Validation and acceptance evidence follow.

## Acceptance evidence

- `board-helpers.ts:106`: resizing reads explicit fixed policy / equal min and max,
  never tier. `board-resizable.test.ts` uses a throwing tier getter for all four
  authorship tiers, checks fixed declarations and finite maxima, and tests every
  builtin's bounds plus unchanged 240×160 mapped layouts.
- `widgets/builtin/index.tsx:97`: exhaustive typed bounds table for all 20 bodies.
  Host-only declarations preserve definition/export bytes; no seed data changed.
- `board-helpers.ts:457`: all canvas resize paths clamp through the same helper.
  Inspector numeric inputs and S/M/L use it too. Labelled presets retain three
  labels when sizes coincide; handle cycling deduplicates equivalent sizes.
- `WidgetFrame.tsx:596`: selection or hover exposes the handle. Frame help and
  `TileActionMenu.tsx:471` name a fixed-size widget instead of locking system tier.
  Inspector fixed-size copy is translated in English/Spanish and regenerated in
  the pseudo locale.
- `tests/e2e/tile-resize.spec.ts:21`: every seeded menu enables Resize; Shift+Arrow
  grows Prep and Map, all six real note titles clear Prep's content edges, both
  Map zoom buttons clear its content edges, and committed heights survive reload.
  Line 103 covers hover and pointer drag; line 119 executes S, M and L through the
  builtin inspector and checks durable dimensions. Both browser profiles pass.
- `tests/visual/scene-editor-polish.spec.ts`: six new pinned baselines for the
  selected handle and Transform tab (Tavern × desktop/rail/phone). All five themes
  assert enabled S/M/L. Inspected the new desktop captures directly.
- `docs/architecture/WIDGETS.md`: bounds, fixed policy, presets and storage contract.

## Local validation (original outputs inspected)

- `pnpm test:app`: 176 files / 2187 tests passed, exit 0
  (`/tmp/rc-can82-app.log`). Expected error-boundary fixture logs say
  `renderer exploded`; these are not failed tests.
- After the localized copy update, focused i18n, pseudo catalog, resize and parity:
  89 tests passed (`/tmp/rc-can82-final-unit.log`). After the coincident-preset
  regression, resize/layout/parity: 80 tests passed (`/tmp/rc-can82-last-unit.log`).
  WID-5.5's unchanged parity suite remains green.
- Playwright `tests/e2e/tile-resize.spec.ts --workers=2`: 6/6 passed, desktop and
  mobile (`/tmp/rc-can82-e2e-presets.log`).
- Pinned container scene-editor suite, `--update-snapshots=none --workers=2`:
  15/15 passed (`/tmp/rc-can82-visual-compare.log`). During snapshot generation,
  two phone cases timed out waiting for `#main-content` before entering the editor
  (`/tmp/rc-can82-visual-final.log`); the final comparison passed both. No loading
  screen was accepted as a baseline.
- Initial all-theme additions exceeded the existing PNG budget. Retained the six
  representative new snapshots; budget passes at 34686.7 / 34816 KiB. Existing
  snapshots and the budget are unchanged.
- gm-react typecheck and changed-file ESLint passed. `pnpm gates` passed with
  existing file-size warnings (`/tmp/rc-can82-gates.log`). Final formatting and
  diff checks run before commit.

The broad visual suite, central wrappers and independent review remain the central
operator's responsibility. These are local results, not remote gate evidence.
No push, promotion, loop launch, additional agents or dispatcher control-state edit.
