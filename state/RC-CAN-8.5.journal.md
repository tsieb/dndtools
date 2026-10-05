# RC-CAN-8.5 run journal

Base: `b04c529e` (= `loop/rc` at start; re-checked before baselining, no new commits).

## Implementation

- **Rows, not cards** (`WidgetFrame.tsx` `WidgetLibraryCard`): one short row per entry with an accent
  rail, glyph, title, category and a one-line purpose, all inside one button named "Add <widget>"
  (`boardCanvas.add.pick`). The purpose and any unavailability reason are its description;
  `aria-disabled` is kept for unsupported entries. The transparent overlay button is gone.
- **Miniature only on hover or keyboard focus** (`AddWidgetGallery.tsx` `Miniature`): mouse
  `pointerenter` or a `:focus-visible` focus (a tap does not count) draws the same template-body
  miniature in a fixed popover. It is portalled beside the row: left of the side panel over the
  canvas, or above/below the row on a phone. It is always `aria-hidden` + `inert`, and it follows
  scroll and resize. The always-mounted per-card miniatures and their IntersectionObserver are gone.
  I did not add a separate "details" toggle; touch users get the rows only.
- **"More ways to add"**: "Generate with assistant" and "Build your own" moved after the library
  into a labelled group. Each is still one click.
- **Pick flow**: the gallery sizes the tile from the default-size table and places it through
  `placeNewTile`. An accepted add closes the panel and calls the new `onPlaced`; Board passes
  `setSelectedId`, so the tile is selected and shows its selection chip. The gallery then focuses the
  frame, scrolls it fully into view (focus alone left a phone tile clipped sideways) and announces
  "Added <widget>" in a permanent polite region. `Board.addWidget` no longer re-finds the slot.
- **Shared placement** (`screens/screen/paletteRows.ts`, owned): `nextFreeSlot` moved here from the
  gallery (the gallery re-exports it, so `palettePresentation.slotFor` is unchanged), plus
  `visibleBoardRect` and `placeNewTile`. `nextFreeSlot`'s new `view` parameter defaults to the
  on-screen part of the surface drawing the tiles, read off their rendered frames. That puts palette
  "Add tile" rows on the same in-view rule without editing the unowned palette file. Rule: among free
  candidates (margin, column starts, the gutter past tile right/bottom edges, and tile tops), take the
  first in reading order whose corner is in view. If none is in view, take the one nearest the view
  centre. With no rendered surface, take the first in reading order. Flow screens append to the end of
  the reading order. WID-6.2 should call `placeNewTile`.
- **Side panel no longer scrolls the page**: since RC-UX-2.4 (`index.css`) the board root is
  `height:auto` with a floor, so the open panel's full list height grew the page and `<main>`
  scrolled the canvas's top row out of the window. The probe showed the board pane at `top=-186`, and
  in-view placement correctly avoided that row. The panel is now `contain: size`. It stretches to the
  board row and scrolls inside itself (`main` 645/645 with the panel open, was 1048/645).
- Copy moved from the gallery's local table into `en.ts` / `es.ts` (`boardCanvas.add.*`). `qps-ploc.ts`
  was regenerated with `npx tsx scripts/i18n-catalog.ts pseudo`. "Make something new" became "More
  ways to add".

## Tests and evidence

- New unit tests `apps/gm-react/src/app/canvas/AddWidgetGallery.test.tsx`: 8 pass. They cover reading
  order, a full-view board filling its top row, a scrolled board (nearest-to-centre and in-view gap),
  flow append, "Add <widget>" names, library before "More ways to add", and the pick position. They
  also check that a hover miniature is `aria-hidden` and `inert`, that it sits outside the panel, and
  that it adds no tab stop even though the live Dice body has real buttons. **Negative control:**
  without the `inert` attribute, that test fails (1 failed / 7 passed). The source was restored and
  verified.
- New e2e `apps/gm-react/tests/e2e/add-panel.spec.ts`, run with `--project=desktop-chromium
--project=mobile-chromium`: **9 passed, 1 skipped** (mouse hover has no touch equivalent).
  - Add Dice in two clicks after Edit layout (Add, then "Add Dice"). The panel closes; the new frame
    is focused, selected (`tile-selection-chip`) and inside the viewport; "Added Dice" is announced;
    no Fix-layout banner.
  - A scrolled board: the tile is placed in view and the board doesn't scroll back. **Negative
    control:** with `view` forced to null, it fails on both profiles (y = 24).
  - Axe (`button-name`, `nested-interactive`, `aria-hidden-focus`, `label`) on the open panel: no
    violations. Library rows come before "More ways to add".
  - Keyboard: Tab onto Dice shows the inert, aria-hidden miniature, which contains buttons. The next
    Tab lands on the next row and never inside the preview.
- Updated companion specs:
  - `note-depth.spec.ts`: the row is now named "Add Note".
  - `canvas-arrange.spec.ts`: the precondition is now "more than one left" instead of exactly 3. On a
    phone scrolled sideways to the second tile, the third lands beside it in view. Alignment is
    still exercised. Passes on both profiles with `--repeat-each=2` (4/4).
- Related e2e on both profiles: add-panel, note-depth, canvas-keyboard, canvas-arrange,
  scene-templates, command-palette, systems, canvas and a11y-axe-gate. Result: 229 passed, 2
  skipped, 1 failed. The failure was `canvas-arrange` on mobile, fixed above and re-run green.
- `docs/architecture/WIDGETS.md` §9 now describes rows, the popover miniature, the shared placement,
  `onPlaced`, the announcement and `contain: size`. I updated its embedded RC-CAN-4.1 fixture for the
  new contract: the ring may sit outside an unclipped row, and the miniature appears on keyboard focus
  instead of in every card. I extracted and ran it on both profiles: 6 passed. The temporary file was
  deleted.
- Visual baselines: `tests/visual/add-panel.spec.ts` captures the panel in all 5 themes × 3 tiers (15
  PNGs). They were generated in the pinned container, losslessly re-deflated (890,390 → 859,217 B)
  and inspected (phone parchment, rail high-contrast). Budget: 33,187.4 / 34,816 KiB.
- Full visual compare in the container with `--update-snapshots=none`:
  - visual-desktop: 171 passed.
  - rail + phone: 339 passed, 3 failed. The failures were on untouched routes: player sheet
    high-contrast/parchment (rail) and atlas empty dungeon (phone).
  - Re-running those, `-g '(player sheet|atlas empty)'`: 14 passed. They are the known
    cold-chunk/one-off flakes. No baseline other than the new 15 was written.
- `pnpm typecheck` exit 0. The first run caught the test's `vi.fn` mock typing, which I fixed.
- `pnpm lint` exit 0: raw-style-count, eslint, boundary, emphasis and contrast. Warnings are
  pre-existing.
  - The first boundary run flagged `innerWidth`/`innerHeight`. Both now use
    `document.documentElement.clientWidth/clientHeight`.
  - Raw-style counts are unchanged: WidgetFrame 6, Board 3, gallery 0, paletteRows 0.
- `pnpm gates` exit 0, including the 800-line gate: gallery 756 lines, WidgetFrame 788.
- `pnpm test`, all four configs: 5234 + 569 + 2028 + 246 passed.
- Prettier check on every changed file and `git diff --check`: clean.
- The dispatch Headroom tools were not used; I read native command output directly.

## Scope notes / handoffs

- Changed paths are owned or manifest companions: i18n catalogs + `qps-ploc.ts`, `*.test.tsx`,
  `tests/e2e/*.spec.ts`, `tests/visual/*`, `docs/architecture/WIDGETS.md`. Nothing outside the claim.
- HANDOFF (not owned): the scene editor (`screens/sceneEditor/index.tsx`) does not pass `onPlaced`.
  A pick there closes, places, focuses and announces, but does not select the tile. One prop
  (`onPlaced={select}`) would finish it.
- HANDOFF (not owned): the palette's `focusTileWhenRendered` (`app/shortcuts/palettePresentation.ts`)
  focuses but neither selects nor announces. It already shares the placement through `nextFreeSlot`.
- No push, promotion, dispatcher state edit or additional agents.
