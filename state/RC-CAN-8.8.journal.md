# RC-CAN-8.8 run journal

Base: `7dc67b3f` (RC-CAN-8.5 head = branch start).

## Implementation

- **Save keeps its width** (`BoardLayoutsPanel.tsx`): the DS Input's `width: 100%` left the button
  as the only thing that could shrink, so at 260px it stacked one letter per line (CAN-15). The
  save row is now a wrapping flex row. The field is `flex: 1 1 8rem; min-width: 0`, and the button is
  `flex: 0 0 auto; white-space: nowrap`. At 260px (desktop and rail) and 280px (phone) the button
  sits beside the field. On a narrower panel it wraps underneath it. The first try was 9rem, which
  wrapped at 260px in the pinned container, and the visual spec's same-row assertion caught it.
  The save row is a `<form>`, so Enter in "Layout name" saves.
- **Saved layouts list**: each row is Apply ("Apply “<name>”", visible text = name, ellipsis),
  Rename and Delete. Rename swaps the row for a field plus Save/Cancel: Enter saves, and Escape
  backs out without closing the panel, returning focus to Rename. Delete asks first ("Delete “X”?
  The board stays as it is."). After deleting, focus goes to the name field. The rows sit in a
  `<ul>` labelled by the section label.
- **Restore previous says what it restores**: a line under the button, also its
  `aria-describedby`. It reads either "Puts back the layout you had before applying “X”: N tiles,
  saved at <time>." or "Puts back the layout saved automatically at <time>: N tiles." The hook
  pairs the safe point's `capturedAt` with the preset applied right after it. A later checkpoint
  (edit start, template apply) has a different `capturedAt`, so it falls back to the generic line.
- **Core (crossed minimally, not owned)**: no rename/delete preset command existed, and presets live
  in core state. Added `command-center.rename-preset` (trimmed non-empty name, bumps revision and
  `updatedAt`, snapshot untouched) and `command-center.delete-preset` (board and auto-save
  untouched). Both are DM-only and reject an unknown id with `preset-not-found`. Each is one
  `command-center` op plus an event. Touched files: `schemas/commands.ts`, `commands/types.ts`
  (command + event unions), `commands/command-center.ts`, `commands/dispatch.ts`, `index.ts`.
  Tests are in `packages/core/tests/command-center.test.ts` (+3).
- **Board.tsx (crossed minimally, not owned)**: it now passes the hook result as `layouts={layouts}`
  instead of nine props. The `presets` sort moved into `useBoardLayouts`. Net -16 lines.
- **Configure dialog** (`TileDialogs.tsx`): the controls edit a draft. Save, or Enter in a
  single-line field (Ctrl/⌘+Enter in a textarea), validates every entry field, focuses the first
  invalid one, or writes all changes in one `scene.configure-widget` and toasts "Saved <tile>
  settings". Cancel, Escape and the close button go through one `cancel()`: with no changes it closes;
  with changes it shows a warning callout ("You have unsaved changes", naming the changed fields)
  and the footer becomes Keep editing / Discard changes. Escape again means keep editing. Every
  text/textarea/number field gets a placeholder, an example (the Field help, wired to
  `aria-describedby`) and a validator (the Field error, `aria-invalid`):
  - Dice formulas: placeholder `1d20+5, 2d6`, example "Separate formulas with commas, for example
    1d20+5, 2d6. Empty rolls a d20." `validateDiceFormulas` runs each comma piece through core
    `parseDiceExpression`, skipping empty pieces as the tile does. A syntax error gives "“2x6” is
    not a dice formula. Write dice like 1d20+5 or 2d6."; a range error passes the parser's reason on.
  - Title override, Heading, Body: placeholder, example, length limit (60/120/10,000).
  - Number fields: placeholder = default, example from min/max, `validateNumberField` (a number,
    bounds, step).
  - Toggle/select/color cannot hold a bad value, so they get no validator. They now write through
    the draft too, instead of committing on click.
    Copy stays in the file's English-only `TEXT` table, like the rest of the tile dialogs.
- i18n: 10 new `board.*` keys in `en.ts`/`es.ts`, `qps-ploc.ts` regenerated
  (`npx tsx scripts/i18n-catalog.ts pseudo`).
- Ratchets: the panel's title moved off the display face (it was below 24px), so its
  `emphasis-baseline.json` entry is removed (count 0). `no-raw-style-values` for the panel is
  3 → 2 (gaps now tokens). Both changes only lower counts.

## Tests and evidence

- Unit `apps/gm-react/src/app/canvas/TileDialogs.test.tsx` (new, 7 pass): the formula validator
  (example, `d20`/keep suffixes/empty/trailing comma accepted; first bad formula named; range error
  passed through), the number validator, every system entry field having placeholder + example +
  check, and a jsdom render of Dice Configure (placeholder and example shown, Enter on a bad list
  shows the message and dispatches nothing, Enter on a good list writes one configure-widget and
  closes, Escape guard / keep editing / discard, untouched dialog closes on first Escape).
  **Negative control:** with `parseDiceExpression`'s verdict ignored, 3 fail / 4 pass; restored → 7.
- Core `command-center.test.ts`: 12 pass (+3: rename, rejections, delete).
- New e2e `tests/e2e/board-layouts.spec.ts`, `--project=desktop-chromium --project=mobile-chromium
--repeat-each=2`: **8 passed**. It covers Save on one line, Enter saves, a dropped tile restored
  by Apply, the restore line naming the applied layout and the tile count (also as the button's
  accessible description), rename (Escape keeps the panel and refocuses Rename; Enter saves), delete
  confirm, and focus after delete. It also runs the Dice Configure flow: placeholder and description,
  a bad formula → `aria-invalid` + message + nothing written, Escape guard → Keep editing, Enter saves,
  Discard leaves the saved value. Axe (`button-name`, `label`, `list`, `listitem`,
  `aria-allowed-attr`, `nested-interactive`) runs on the open panel and the dialog: clean.
  **Negative control:** with the old row styling (no wrap, Input full width) the Save button is
  76.4px tall against a 38px limit and the test fails; restored.
- Updated `canvas.spec.ts` "Bind… and Configure…": the switch now changes the draft, and the test
  checks Escape → guard → Escape → nothing written → Save → written.
- Related e2e on both profiles: board-layouts, canvas, scene-templates, add-panel: **103 passed,
  1 skipped** (add-panel's mouse-hover case on touch, skipped by design).
- Visual `tests/visual/board-layouts.spec.ts`: Layouts panel in tavern on the 3 tiers, with a saved
  layout, a typed name and the restore line. It asserts the panel width (260 / 280 on phone) and that
  Save sits right of the field, inside its row, no taller than it. Baselines were generated in the
  pinned container (`run-in-container.sh … --update-snapshots=missing`), inspected (desktop, phone),
  losslessly re-deflated (63,911 → 60,631 B), then re-compared with `--update-snapshots=none`:
  3 passed. Budget after: ~33,247 / 34,816 KiB. I did not run the full visual suite; no golden route
  opens the Layouts panel or a Configure dialog.
- `pnpm test` (4 configs): 5237 + 569 + 2035 + 246 passed. `pnpm typecheck`: exit 0 (the first run
  caught the new test's `vi.fn` typing, now fixed). `pnpm lint`: exit 0. `pnpm gates`: exit 0
  (TileDialogs 496 lines, panel 293, Board 686). Prettier on every changed file and
  `git diff --check`: clean.
- I read the command output directly; the dispatch Headroom tools were not used.

## Scope notes / handoffs

- Outside the three owned files: core (rename/delete commands, required for the acceptance's
  rename/delete), `Board.tsx` (prop threading), i18n catalogs + `qps-ploc.ts`, the two lint
  ratchet files (lowered only), `docs/planning/SCREENS_PARITY.md` BD-07 (the row now describes
  rename/delete/restore line; Prettier realigned the table), `canvas.spec.ts`, and new test/visual
  files.
- HANDOFF: the scene editor's Inspector still commits each field on blur through `FieldControl`
  (`screens/sceneEditor/fields.tsx`, not owned). It could reuse `fieldGuide` for the same
  placeholders, examples and messages.
- HANDOFF: the command palette's preset rows (`queries/command-actions.ts`) list apply only. The new
  rename/delete commands are not offered there.
- No push, promotion, dispatcher state edit or additional agents.
