# RC-CAN-5.4 run journal

## Scope

Moving around a canvas screen on a phone. Owns `app/SceneBoardCanvas.tsx`, `app/canvas/ZoomCluster.tsx`,
`app/canvas/PhoneNavigator.tsx` (new), `screens/Board.tsx`. Companion paths (manifest): i18n catalogs,
e2e specs, `*.test.ts(x)`, visual baselines. Acceptance: e2e at 360×640 and 390×844 reaches every
tile by pan and by the jump sheet; a test asserts no rendered text below 12px on the phone tier; axe
clean on mobile. No agents, dispatcher mutations, push or promotion.

## Session 2 — 2026-09-26

- Previous attempt ended on a provider allowance limit with no commits; worktree clean at `fad0cf60`
  (the CAN-5.1 tip). Starting over from context gathering.

### Constraints found

- `SceneBoardCanvas.tsx` is exactly 800 lines and `Board.tsx` 790 against the RC-STB-2.7 800-line
  gate, so the new behaviour lives in `PhoneNavigator.tsx`. Board's toolbar zoom group moves into
  `ZoomCluster.tsx` (owned) as `ZoomPresetGroup` to buy Board the lines it needs.
- `--text-2xs` is 10px, used by the Board toolbar's widget count, StackedBoard chips and many tile
  bodies; the bounded canvas's Fit floor is 0.5, so tile text on a phone paints near 5px.
- Seven e2e specs call `preferPhoneCanvas` (the CAN-5.1 `'canvas'` preference) and expect
  `scene-board-bounded` in phone view mode — dice chip, timer, tile menu, zoom presets, a11y tree.

### Design

- Phone view mode opens as the CAN-5.1 list; a List | Layout pair replaces the single List toggle
  (same preference key; `'canvas'` now means Layout).
- Layout = the real bounded `SceneBoardCanvas` at the legible steps only (Comfortable 1×, Detail
  1.5×), so every operate/configure action a tile has on desktop stays where it is. Fit on a phone
  is an overview drawn by PhoneNavigator: tiles at their fitted positions with the title at its
  natural size and no body, tap to open full screen. Phone Layout defaults to Comfortable.
- Phone Board root overrides `--text-2xs` to `--text-xs`, so nothing token-sized drops below 12px.
- PhoneNavigator adds: pinch (two touches) that steps Fit ↔ Comfortable ↔ Detail and anchors on the
  pinch midpoint; edge fades (pointer-events none) where more content lies; a navigator bar under
  the layout with a minimap (tap to jump; aria-hidden, the sheet is the accessible path) and a
  "Jump to tile" Sheet that lists every tile with Go to + Full screen; a full-screen tile inside the
  board region (AppShell bounds `<main>` above the tab bar) while Board hides its toolbar.
- Phone edit mode keeps the spatial canvas but never at Fit (Comfortable/Detail only).

### Progress

- `ZoomPresetGroup` added to `ZoomCluster.tsx`; `PhoneNavigator.tsx` written (796 lines, gate ≤ 800);
  Board wired (785 lines). 7 EN/ES catalog keys `phoneNavigator.*`; full-screen actions reuse
  `atlas.expandMap` / `atlas.collapseMap` exactly as StackedBoard does.
- `no-raw-style-values.allow.js`: Board's allowance lowered 8 → 7 (the zoom group's `gap: 2` moved
  into ZoomCluster as `var(--space-0-5)`), as the lint demands. Emphasis lint: no regression.
- Found while testing: CDP `Input.synthesizeScrollGesture` with `gestureSourceType: 'touch'` does
  NOT scroll anything in this Chromium; `Input.dispatchTouchEvent` drags do, natively (Chrome rails
  a diagonal drag to one axis, so the spec pans the two axes as separate drags).
- Found while testing: a pinch that steps Comfortable → Fit unmounts the canvas under the fingers;
  the rest of that gesture's touch events stop bubbling (detached target), so window listeners
  leaked. Pinch listeners now sit on the touch targets themselves and the next pinch clears them.
- New `tests/e2e/phone-navigator.spec.ts` (5 tests × 360×640 and 390×844): pan reaches every tile
  and needs a sideways pan; the jump sheet lists every tile, Go to focuses and reveals each, Full
  screen opens each above the bottom tab bar and Escape lands back on the tile; pinch steps
  Comfortable ↔ Detail ↔ Fit and the overview opens tiles; edge fades + minimap; a painted-size
  text walk (computed font × ancestor transform scale) over `<main>` in Layout at all three steps,
  full screen, the jump sheet, the panel list and phone edit mode finds nothing under 12px.
  Both projects, `--repeat-each 3`: 60/60 passed.
- `a11y-axe-gate.spec.ts`: new mobile-only test scanning Layout, overview, jump sheet and
  full-screen tile — zero violations of any impact after the full-screen title became an `h2`
  (it was a moderate `heading-order` as an `h3` with the board's `h2` hidden).
- Committed `4884c918`. Browser regression run 1 (mobile-chromium, 15 board-touching specs) started.
- Unit: file-size gate + i18n catalog (tooling, 10 tests), app vitest over `app/canvas`, `screens`,
  `i18n` (23 files / 267 tests), `styles/token-references` (7) — all passed. Typecheck clean.
- Browser run 1, mobile-chromium, 15 board-touching specs: 263 passed, 3 skipped, 3 failed — all
  three in `canvas.spec.ts` and all asserting the fitted phone canvas this story removes:
  - "dice chip keeps a density-sized hit area" asserted a phone board scale < 0.8. The guard still
    matters wherever the canvas is scaled down, which is now the rail tier: moved to 700×900.
  - the two named-zoom-preset tests expected a phone to open at Fit with a scaled canvas. They now
    branch on the phone tier: Layout opens at Comfortable (scale 1) and Fit / `0` shows the
    overview. Desktop assertions unchanged. Re-run on both projects: 8/8 passed.
- Browser run 2 (desktop-chromium, same 15 specs) + `ux-audit` / `widget-trust-review` on both.
- Browser run 2 (desktop-chromium, 15 board-touching specs): 269/269, exit 0. The session ended
  before `ux-audit` / `widget-trust-review` finished; re-run in session 3 (below).

## Session 3 — 2026-09-26

- Resumed after the operator's rebase (commits now `76928c9c`, `e15738af` on `8dd5f664`). Gate
  feedback: quality gates and format passed; visual regression (pinned container) failed only on
  `visual-phone` `/board` × tavern/parchment/high-contrast (5,912 px, ratio 0.02), 390 passed.
  Expected: the phone toolbar now carries List | Layout and the 10px subtitle/chips paint at 12px.
- Re-baselined those three in the pinned container (`run-in-container.sh --project=visual-phone -g
  /board --update-snapshots=changed`), inspected tavern (List | Layout pair, 12px text), then
  losslessly re-deflated IDAT with zlib level 9 (decompressed bytes identical; −1.4 KiB). Budget:
  32,664.5 of 32,768 KiB. Container compare, `/board` on all visual projects: 9/9 passed.
