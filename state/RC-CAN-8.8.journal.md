# RC-CAN-8.8 run journal

Base: `7dc67b3f` (RC-CAN-8.5 head = branch start).

## Attempt 2: claim gate

Attempt 1 (`a8e1712b`) was refused for paths outside the claim: `Board.tsx`,
`docs/planning/SCREENS_PARITY.md`, `packages/core/src/commands/command-center.ts` and
`scripts/emphasis-baseline.json`. None of them is needed for the acceptance criteria (a 260px visual
of the button on one line, a formula-validator unit test, e2e save + apply on both profiles), so all
four are reverted to base. The core commands I added for rename/delete
(`command-center.rename-preset` / `delete-preset`) need their handler in `command-center.ts`, so I
reverted them too, including their companion edits in `dispatch.ts`, `types.ts`,
`schemas/commands.ts`, `index.ts` and `tests/command-center.test.ts`. A handler written into
`dispatch.ts` would technically fall inside the companions, but no handler lives there. **Rename
and delete are therefore not built**. See the handoff below. Every path changed against base is now
owned or a manifest companion.

## Implementation

- **Save keeps its width** (`BoardLayoutsPanel.tsx`). The DS Input's `width: 100%` left the button
  as the only thing that could shrink, so at 260px it stacked one letter per line (CAN-15). The save
  row is now a wrapping flex row:
  - the field is `flex: 1 1 8rem; min-width: 0`;
  - the button is `flex: 0 0 auto; white-space: nowrap`.

  At 260px (desktop, rail) and 280px (phone) the button sits beside the field; on a narrower panel it
  wraps under it. A 9rem basis wrapped at 260px in the pinned container, and the visual spec's
  same-row assertion caught it. The row is a `<form>`, so Enter in "Layout name" saves.

- **Saved layouts list**: Apply only. It is a `<ul>` labelled by its section label. Each row is
  named "Apply “<name>”", shows the name as its text, and ellipsizes a long one.
- **Restore previous says what it restores**: a line under the button, also its
  `aria-describedby`. It reads either "Puts back the layout you had before applying “X”: N tiles,
  saved at <time>." or "Puts back the layout saved automatically at <time>: N tiles."
  - `safePointOf(commandCenter)` in `useBoardLayouts.ts` reads it off `commandCenter.autoSave`.
  - `applyPreset` pairs the safe point's `capturedAt` with the preset it was taken in front of.
  - That pairing sits in module scope, because Board (not owned, unchanged) passes the panel only
    the hook's commands.
  - Any later checkpoint has a different `capturedAt`, so the line falls back to the generic wording.
  - The panel reads the runtime with `useRuntime()`. Its props are exactly the base ones.
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
- i18n: 3 new `board.*` keys (`applyLayout`, `restoreBeforeApplying`, `restoreCaptured`) in
  `en.ts`/`es.ts`, `qps-ploc.ts` regenerated (`npx tsx scripts/i18n-catalog.ts pseudo`).
- Ratchet: `no-raw-style-values` for the panel is 3 → 2 (gaps now tokens; the allow-list is a
  companion path). The panel title keeps its display face, so the emphasis baseline is unchanged.

## Tests and evidence (attempt 2, re-run after the revert)

- Unit `apps/gm-react/src/app/canvas/TileDialogs.test.tsx` (7 pass):
  - the formula validator: the example, `d20`, keep suffixes, an empty field and a trailing comma
    are accepted; the first bad formula is named; a range error passes the parser's reason on;
  - the number validator;
  - every system entry field has a placeholder, an example and a check;
  - a jsdom render of Dice Configure: Enter on a bad list shows the message and writes nothing,
    Enter on a good list writes one configure-widget and closes, the Escape guard / keep editing /
    discard, and an untouched dialog closes on the first Escape.

  **Negative control (attempt 1, same code):** with the parser's verdict ignored, 3 fail / 4 pass.

- e2e `tests/e2e/board-layouts.spec.ts` + `canvas.spec.ts`, `--project=desktop-chromium
--project=mobile-chromium`: **84 passed**.
  - The layouts test checks that Save is one line and disabled while the name is empty, that Enter
    saves, and that Apply brings back a dropped tile. It checks the restore line names the applied
    layout and the tile count, also as the button's accessible description. Restore then removes the
    tile again. Axe runs on the open panel.
  - The Dice Configure test checks the placeholder and description; that a bad formula sets
    `aria-invalid`, shows the message and writes nothing; Escape guard → Keep editing; Enter saves;
    Discard keeps the saved value. Axe runs on the dialog.
  - `canvas.spec.ts` "Bind… and Configure…" now expects the draft contract: Escape → guard →
    Escape → nothing written → Save → written.

  **Negative control (attempt 1, same styling):** with the old row styling the Save button is
  76.4px tall against a 38px limit and the test fails.

- Visual `tests/visual/board-layouts.spec.ts`: the panel in tavern on 3 tiers. It asserts the width
  (260, or 280 on a phone) and that Save is right of the field, inside its row, and no taller than
  it.
  - Baselines were regenerated in the pinned container (`--update-snapshots=missing`; the first run's
    3 "failures" are the writes) and inspected (desktop).
  - They were losslessly re-deflated (61,366 → 58,179 B) and re-compared with
    `--update-snapshots=none`: 3 passed.
  - Budget 33,244.2 / 34,816 KiB.
- `pnpm test` (4 configs): 5234 + 569 + 2035 + 246 passed. `pnpm typecheck`, `pnpm lint` and
  `pnpm gates` all exit 0. `git diff --check` is clean.
- I read command output directly; the dispatch Headroom tools were not used.

## Scope notes / handoffs

- Changed paths: the three owned files plus companions only: i18n catalogs + `qps-ploc.ts`,
  `*.test.tsx`, `tests/e2e/*.spec.ts`, `tests/visual/*`, `scripts/eslint-rules/*.allow.js`, and
  this journal.
- HANDOFF (needs a wider claim): rename and delete for saved layouts. They need core
  `command-center.rename-preset` / `command-center.delete-preset`, whose handlers belong in
  `packages/core/src/commands/command-center.ts`. A complete implementation is in `a8e1712b` on this
  branch (handlers, schemas, command/event unions, dispatch, 3 core tests, the panel rows, i18n,
  e2e). An operator who widens the claim to `command-center.ts` (and `Board.tsx`, or keeps the
  current prop shape) can take it from there.
- HANDOFF: the scene editor Inspector (`screens/sceneEditor/fields.tsx`, not owned) still commits each
  field on blur. It could reuse `fieldGuide` for the same placeholders, examples and messages.
- HANDOFF: `docs/planning/SCREENS_PARITY.md` BD-07 could mention Enter-to-save and the restore line.
- No push, promotion, dispatcher state edit or additional agents.
