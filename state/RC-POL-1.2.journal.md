# RC-POL-1.2 — Polish: GM Screen board

Run journal. Branch `dispatch/dndtools/5a54ee88b64a4c345673` on the task's base `74efcfe2`. Scope:
`screens/Board.tsx`, `screens/BoardLayoutsPanel.tsx`, `screens/board`, `screens/screen`,
`app/SceneBoardCanvas.tsx`, `app/SceneBoardModel.ts`, `app/board-helpers.ts`, `app/canvas`, plus
manifest companions (EN/ES catalogs, pseudo catalog, e2e and visual specs and baselines, unit tests,
the raw-style and literal-text allow-lists, FEATURE-GAPS). The candidate's changed files are all inside
the claim or the companion paths. No push, promotion, dispatcher-state change or additional agent. Raw
logs stay in `/tmp/pol12/` and are summarised here.

## Attempt history

- **Attempt 1** built the candidate on `74efcfe2` (commits `53f19239` … `f323fae9`).
- Meanwhile 59 commits landed on `loop/rc` in the same files (RC-CAN-8.6 phone arranging, RC-CAN-8.7
  catalogued the tile-menu/flow copy under `boardCanvas.tileMenu.*`/`boardCanvas.flow.*`, RC-ENG-3.2
  memoised board frames and lazy authoring). Attempt 1 rebased onto `loop/rc` `45d68916`, then
  `effe44cb`, resolved every conflict, re-split the upgraded files, re-baselined the visuals and re-ran
  the gates and the board e2e (793 passed). That integrated candidate is **`7008d590`**.
- **Fence refusal:** the fence diffs against `base_sha` `74efcfe2`, so the rebased branch carried ~170
  upstream files as if they were this story's. **Attempt 2** reset the branch to the base-`74efcfe2`
  candidate `f323fae9` (no path outside the claim) and re-verified it (below).
- **For the operator's integration:** merging this onto current `loop/rc` conflicts in `Board.tsx`,
  `SceneBoardCanvas.tsx`, `board-helpers.ts`, `AddWidgetGallery.tsx`, `FlowBoard.tsx`,
  `PhoneNavigator.tsx`, `StackedBoard.tsx`, `TileActionMenu.tsx`, `WidgetFrame.tsx(.test)`,
  `ZoomCluster.tsx`, the raw-style allow-list and the board/scene-editor PNGs. `7008d590` is the worked
  resolution of exactly that merge (`git diff effe44cb 7008d590` is this story on that tree). Its
  choices: adopt RC-CAN-8.7's catalog keys and drop this story's duplicates (`boardCanvas.menu.*`,
  `boardCanvas.span.*`, `boardCanvas.visibility.*`, the duplicated `boardCanvas.flow.*`); keep
  RC-ENG-3.2's `BoardFrame`/`usePaneWidth`/`BoardAuthoring` inside the split files; add the split parts
  to `canvas-copy.test.ts`; split `StackedTile.tsx` out of the 778-line `StackedBoard.tsx`; route phone
  canvas e2e through `preferPhoneCanvas` (phones stay in the list while editing); regenerate and
  re-deflate the board PNGs (37,830.4 / 37,888 KiB there).

## Starting point (measured on `74efcfe2`)

- Owned `.tsx` over the 500-line target: `Board.tsx` 800, `SceneBoardCanvas.tsx` 791,
  `PhoneNavigator.tsx` 796, `WidgetFrame.tsx` 789, `TileActionMenu.tsx` 789, `AddWidgetGallery.tsx`
  771, `FlowBoard.tsx` 763, `StackedBoard.tsx` 570 (778 after RC-CAN-8.6), `TemplatePicker.tsx` 544,
  `WidgetFrame.test.tsx` 590, `useLayoutHistory.test.tsx` 637. Owned `.ts` over 500 (not gated, but the
  story says every file): `board-helpers.ts` 818, `useLayoutHistory.ts` 538.
- Raw-style allowances: `WidgetFrame.tsx` 6, `ZoomCluster.tsx` 2, `Board.tsx` 3, `BoardLayoutsPanel.tsx` 2. Literal-JSX-text allowance: `FlowBoard.tsx` 2.
- Visual: `board--{tavern,parchment,high-contrast}` × 3 tiers (full page, golden-routes) and
  `board-layouts-panel` × 3 tiers. No Scholar or Dungeon coverage.

## Progress log

- **File size.** Every owned file is ≤ 499 lines. Splits, each into an owned sibling:
  - `Board.tsx` → `board/useBoardActions.ts` (guarded dispatch, undo stack, move/resize/remove/operate/
    add/fix-layout), `board/BoardSurface.tsx`, `board/BoardStatus.tsx`, `board/BoardDialogs.tsx`,
    `board/GmScreenUnavailable.tsx`, `board/useAddWidgetIntent.ts`, `board/boardRootStyle.ts`. The
    widget-command key stays minted in `Board.tsx`, under its `board-idempotency-key-crypto`
    platform-access exception (the boundary lint refused it in the hook).
  - `SceneBoardCanvas.tsx` → `canvas/useCanvasZoom.ts`, `canvas/useWindowGestures.ts`,
    `canvas/useCanvasScene.ts`, `canvas/CanvasLayers.tsx`.
  - `WidgetFrame.tsx` → `canvas/frameParts.tsx`, `canvas/WidgetLibraryCard.tsx`; `TileActionMenu.tsx` →
    `canvas/FlowTileMenu.tsx`, `canvas/menuParts.tsx`; `FlowBoard.tsx` → `canvas/FlowTile.tsx`;
    `StackedBoard.tsx` → `canvas/stackedStyles.ts`; `PhoneNavigator.tsx` → `canvas/phoneParts.tsx`;
    `AddWidgetGallery.tsx` → `canvas/GalleryMiniature.tsx`, `canvas/GalleryParts.tsx`;
    `board-helpers.ts` → `canvas/flowLayout.ts`, `canvas/boardLayout.ts` (re-exported);
    `useLayoutHistory.ts` → `canvas/layoutHistoryCommands.ts`; the two oversized test files split around
    `canvas/layoutHistoryHarness.tsx` and `canvas/widgetFrameFixtures.ts`.
- **Raw style / literal text.** All 13 owned raw-style allowances and the 2 `FlowBoard.tsx`
  literal-text allowances removed. The board's 28px gutter is `calc(var(--space-6) + var(--space-1))` —
  rounding it to 24px re-wrapped the screen toolbar and broke the scene editor's title onto two lines.
- **Copy (EN + ES).** The canvas's English-only tables now read catalog keys: tile and flow menus, the
  flow board, history labels and "Undone/Redone" announcements, undo-button names, the removal and
  duplicate toasts, frame accessible names and edit/view help, operation announcements, surface names,
  span presets, visibility labels, the selection chip's tier word ("Built-in", was "System · locked
  content"), the template picker's private en/es table, the Bind/Configure dialogs including their
  validators, the empty-canvas defaults and the persist failure. Voice: "declares a fixed size / nothing
  to set" → "has"; the number-field hint no longer reads "A number any number."; the layout-name
  placeholder lost its clipped "e.g."; the canvas surface said "GM Screen" while the app says "DM
  screen" — it now reads the vocabulary (a11y-axe-gate and responsive specs updated). Pseudo catalog
  regenerated.
- **History cluster over the tiles.** The bounded board's Undo/Redo cluster sat on the top-right tile's
  menu trigger whenever the layout reached under it (Add panel open, rail, phone edit). Tiles now start
  56px lower only then; `board-polish.spec.ts` fails without the gutter (1 of 2 profiles).
- **High contrast.** A paper scene pinned `data-theme="parchment"` on the canvas backdrop in every theme;
  under high contrast nothing is pinned now.
- **Contrast found by axe.** The Add panel's template/"More ways" hints were tertiary text on
  `--color-surface-alt` (3.84:1 in parchment) in the builder's shared `CreateEntry` (outside the claim);
  the canvas has its own `AddEntry` with a secondary hint. Other owned tertiary text on sunken/alt
  surfaces moved to secondary.
- **Type.** The Layouts panel title (Cinzel at `--text-md`) → a sans `<h3>` in a named region; the player
  notice's 20px display-face span → an illustrated `EmptyState` with a heading.

## §20.2 Design fidelity

- [x] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1
      lint clean for this directory). — Zero `dsn/no-raw-style-values` findings in every owned file; all
      owned allowances removed. Waiver: fixed geometry the rule does not count (frame sizes, minimap
      box, transform math) stays numeric because it is layout data, not spacing.
- [x] Matches the prototype view for this section and the design-package template where one exists;
      deviations listed with rationale. — Waiver: the live prototype is reachable only from the
      design-review role (DesignSync), not this implement worker. The board keeps the RC-CAN-2.x tile
      anatomy (accent rail, glyph, type label, visibility-by-exception chip, binding glyph). Listed
      deviations: tiles start below the history cluster when crowded; no parchment pin in high contrast.
- [x] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised. —
      `lint:emphasis` passes at or below baseline; the board's region holds the selected zoom step as its
      primary (the empty board's first action stays the subtle accent, per RC-ENG-8.4). Panels (Add,
      Layouts) are overlay cards.
- [x] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono. — Owned text uses
      `--text-2xs/xs/sm/md`; the two sub-24px display-face uses are gone. Waiver: the screen heading in
      `sceneEditor/SceneToolbar.tsx` (not owned) is Cinzel at 24px, which is allowed.
- [x] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable. —
      Binding states carry link/warning/eye-off glyphs plus a word; visibility chips carry their icons;
      placeholder tiles keep the warning glyph with the status note.
- [x] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed. —
      `tests/visual/board-polish.spec.ts` captures `#main-content` in Tavern, Parchment, Scholar,
      Dungeon and High contrast on desktop, rail and phone (15 PNGs), replacing the board's 9 full-page
      golden-routes captures (the shell has its own goldens). Re-baselined for intended changes:
      Layouts panel ×3, `/scene/:id` rail ×3 (gutter), resize-handle chip ×2. Every new or changed PNG
      losslessly re-deflated (zopfli, pixels asserted equal): budget 37,830.4 / 37,888 KiB. Screenshots
      of the board, edit mode, tile menu, Add and Layouts were reviewed in all five themes on both
      profiles.
- [x] Motion uses named tokens; nothing animates under `data-motion='reduced'`. — No motion added; the
      lift transition uses `--duration-fast`/`--easing-standard` (0ms under reduced motion).
- [x] Empty, loading, error, and "unavailable because…" states present and illustrated where the key
      exists. — Empty board: `session-board-empty` (spec asserts the SVG). Player notice:
      `play-waiting`. Unavailable widgets: dimmed rows with the core's reason. Waivers: there is no
      loading illustration key and the board reads core state synchronously — the only wait is GM-screen
      provisioning, shown as the labelled empty canvas ("Setting up your {gm} screen"); the setup failure
      is a storage error with Retry, which `connection-lost` would misdescribe (as RC-POL-1.4 recorded).

## §20.3 Interaction and UX

- [x] Every action has feedback within 100 ms and a completion toast or inline state. — Moves/resizes
      announce in the operation live region and take an undo step; removal toasts with Undo; layout
      saves confirm in the permanent status region; failures in an alert. Waiver: no wall-clock 100 ms
      assertion on this shared host.
- [x] Every destructive action is undoable or confirmed; every confirm names the thing. — Remove is
      immediate with a named Undo toast and Ctrl+Z; the Configure dialog asks before discarding named
      changed fields.
- [x] Save status visible on auto-persisted surfaces; failures say what to do next. — Spec: a rejected
      vault write shows "That change couldn't be saved to this device. Check storage space and try
      again." and the retry succeeds once storage recovers.
- [x] One clear route back; browser back works; Android Back follows the documented order. — The board
      adds no in-route navigation; edit mode is a `?edit=1` replace; panels close on Escape. Waiver:
      physical Android Back is not exercised by Chromium emulation; no handler changed.
- [x] No hover-only or gesture-only discovery; touch targets ≥ 44 px. — Tile menu is a trigger button
      plus Shift+F10 / ContextMenu; long-press and right-click are extras. Waiver: DS `size="sm"`
      controls and the 28px history buttons follow the shared density policy (as earlier POL passes
      recorded); the tile trigger uses `--density-touch-target`.
- [x] The compact tier exposes one primary top-bar action; overflow in a bounded sheet. — The board adds
      no top-bar action; the phone Add panel is a bottom sheet.
- [x] Copy follows the content fundamentals; strings via `t()`; ES present. — See the copy item above.
      Waivers: tile status notes ("Hidden from this viewer", core rejection reasons) remain English and
      are now a FEATURE-GAPS limit; the scene editor's Inspector still renders `TIER_LABEL` (not owned).
- [x] Contextual help beside any non-obvious control; shortcuts in tooltips. — Frames carry an
      `aria-description` with the full key map; the flow toolbar shows its drag/arrow hint; shortcuts are
      in the shortcuts overlay. Waiver: inline help in place of HelpTip icons, which would add a tab stop
      per tile.

## §20.4 Accessibility

- [x] axe clean (desktop + mobile) for this route and its open overlays; register unchanged. —
      `board-polish.spec.ts` runs the strict tag set (wcag2a/aa, 21a/aa, 22aa, best-practice) on the
      board, edit mode, the tile menu with Visibility open, Add, Layouts, the empty board, the Add panel's
      empty-board header, the template picker, Bind and Configure dialogs, the layout banner and the
      player preview, in all five themes on both profiles (34 tests). No suppressions. `pnpm a11y:axe` 61 passed; `pnpm a11y:report` PASS. The shell's
      chrome is excluded (RC-POL-1.23's surface).
- [x] Keyboard-only walkthrough recorded. — Spec: Enter on Edit layout → Done focused; Tab to the Map
      frame (`:focus-visible`); Space announces "Map selected."; ArrowRight moves it and announces;
      Escape announces "Map put down."; Ctrl+Z restores x and the canvas status says "Undone: moved Map".
- [x] Landmarks and headings correct. — The shell owns the `<h1>`; the screen heading is `<h2>`;
      Layouts and Add panels are named regions with `<h3>` titles.
- [x] Live regions announce operations; no announcement spam. — Permanent status, operation and zoom
      regions; re-keyed on `seq` so repeats speak; the alert is removed and re-inserted per failure.
- [x] Screen-reader spot check on one platform noted. — Waiver: no native screen reader on this worker;
      accessible names, descriptions, live-region text and axe stand in, not claimed as speech output.
- [x] 200% zoom / large text: no clipping; reachability spec case. — Spec: at 200% root text the board,
      edit mode and the Layouts panel never widen `#main-content`. No new scroll region.

## §20.5 Core discipline and correctness

- [x] No state mutation outside `runtime.dispatch`; no client-side visibility filtering. — All writes go
      through the board's guarded dispatch or `history.run`; widgets come from the actor read
      (RC-ENG-10.2 kept).
- [x] Preview-as-player: writes rejected and controls hidden. — Spec: in player preview Edit layout is
      gone and a `scene.move-widget` from the previewed actor is rejected.
- [x] Player projection verified through an actor read in an e2e. — Spec: every preview tile carries
      `data-tone="hidden"`, and the core's `getSceneForActor` (imported in the page) refuses the GM screen
      for the player.
- [x] e2e on both profiles covers the primary task and one failure path. — Keyboard move/undo and the
      storage-failure path, both profiles.
- [x] Perf: budget measured before/after; no regression. — Interleaved ENG-1.1 A/B on a loaded host
      (load 7–12), dev server, against `74efcfe2`: `scene-first-render` 1499.5 → 1567.6 ms and 1530.0 →
      1546.9 ms (two runs; both revisions breach the 1500 ms target on the second); `widget-update`
      40.5 → 40.6 ms. The 1–4.5% dev-server difference is consistent with ~20 more modules served one by one in dev
      (scene first render is ~80% module transport); production core bundle 1088.9 → 1083.9 KiB gzipped
      (the template picker's inline translations moved into the lazy catalog).
- [x] Docs: FEATURE-GAPS row updated. — Board row rewritten within its padding (1-line diff): three
      closed limits removed, real ones anchored; `pnpm feature-audit` 0 stale. No contract moved.

## Handoffs

- **Widget builder (`app/widgetBuilder/GenerateDialog.tsx` `CreateEntry`).** Its hint is tertiary text on
  `--color-surface-alt` (3.84:1 in parchment). The canvas now uses its own `AddEntry`; once the hint is
  secondary there, `AddEntry` can go back to `CreateEntry`.
- **Scene editor (`screens/sceneEditor/Inspector.tsx`, `SceneToolbar.tsx`, `useSceneCommands.ts`).**
  The Inspector's tier word reads the English `TIER_LABEL` (use `TIER_KEY`); the editor's undo
  step labels are English; on a phone the edit toolbar clips "Snap" off the right edge.
- **Phone list tiles.** A stacked tile keeps its authored height and scrolls inside (the Map tile's zoom
  row sits below the fold) — a FEATURE-GAPS limit.

## Verification (this candidate, base `74efcfe2`)

Attempt 1, on this tree before its last two commits unless noted:

- `pnpm lint` — exit 0 (after the boundary fix). `pnpm typecheck` — exit 0.
- `CI=true pnpm test:app` — 189 files, 2278 passed. `pnpm test:tooling` — 249 passed.
- `pnpm build` + `check:bundle-budget` — pass, 1083.9 KiB gzipped (base 1088.9).
- `pnpm format:check:changed -- --base 74efcfe28` — clean. `pnpm feature-audit` — 40 limits, 0 stale.
- `pnpm a11y:axe` — 61 passed, 1 skipped; `pnpm a11y:report` — PASS (final tree).
- e2e, both profiles, `--workers=3 --retries=1`, every spec touching the board: 698 passed, 0 failed.
- Visual, pinned container, `--update-snapshots=none`, full suite per tier: the only failures were the
  intended board/scene-editor changes and load timeouts on untouched routes; the 42 re-baselined
  captures and the 15 Add-panel captures then passed strict compare. Budget 37,722.1 / 37,888 KiB.

Attempt 2, on the final tree (`f323fae9` + this journal):

- `pnpm gates` — exit 0, no file-size warning for an owned file. `tsc --noEmit` (gm-react) — exit 0.
- e2e, both profiles: `board-polish`, `canvas*`, `board-layouts`, `add-panel`, `widget-settings` — 154
  passed; `flow-layout`, `phone-navigator`, `tile-resize`, `tile-content-recovery`, `screens`,
  `scene-templates`, `scene-surfaces`, `map-tile`, `combat-tile`, `a11y-axe-gate`, `responsive`,
  `command-palette` — 361 passed, 1 flaky (`tile-resize.spec.ts:22` mobile, passed on retry), 0 failed.
- Baseline budget — 37,722.1 / 37,888 KiB.
