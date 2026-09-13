# RC-WID-4.4 run journal

## Implementation

- `WidgetRenderSlot.tsx`: every branch (builtin, template, custom frame, placeholder) renders
  inside `WidgetRegion`, a `<section>` labelled with the widget title. Custom hosts now restart
  when the contrast state changes (high-contrast theme or OS forced colours), not only frames that
  declare `host-theme-tokens`.
- `SandboxHost.tsx`: `init` carries `--host-forced-colors` and `--host-high-contrast` to every
  frame (`collectSandboxContrastVariables`). The header comment records the aria contract.
- Builtin bodies: new `builtin/live.tsx` (`LiveReadout`, `LiveStats`, `StateMark`). Stat rows,
  count lines, the timer status line, the map summary and the compact initiative heading are polite
  status regions mounted with the readout. Done setup steps, pinned searches and the DM's
  playing-audio chip carry an icon with a name. The urgent timer shows a warning glyph, and its
  countdown is `role="timer"`. Timer Reset hands focus to the transport (the Reset button used to
  unmount under the keyboard and drop focus to `<body>`).
- Templates: `TemplateShell` owns a live readout region and a separate `controls` slot. Action
  panel and form panel controls sit outside the region. The active chart and tracker rows say "Now".
- No i18n keys added (catalogues are outside this story's paths); existing keys were reused.
- `WIDGETS.md` §3.1 documents the contract and the known map-marker gap.

## Fixes found by the gates

- Boundary lint (PLAT-006) rejected direct `matchMedia` in `SandboxHost` and `WidgetRenderSlot`.
  Both now read and subscribe through `platform/preferences` (`matchesMedia`, `subscribeMedia`).
- First e2e pass: `canvas.spec.ts` undo/redo tests failed on both profiles. `canvas.getByRole('status')`
  matched the canvas confirmation channel AND the new Audio live region (strict-mode violation). The
  new readouts are now `aria-live="polite"` regions, not `role="status"`. The canvas keeps the one
  status on a board. Pre-existing status regions (dice result, Next turn, compact HP) are unchanged.
- First e2e pass: mobile `/board` axe found `target-size` on the compact initiative tile's
  "More actions" button once combat runs (the existing gate scans an idle vault and never saw it).
  Row icon buttons now take `--density-touch-target`, the size of the HP button beside them.
- Keyboard walk: Timer Reset unmounted itself under focus. Focus now moves to the transport.
- `/board` contract test read the home scene before `command-center.ensure-home` ran. It now waits.

## Validation

- App `tsc --noEmit`, ESLint and Prettier on changed files, boundary lint, raw-style count: pass.
- Widget unit tests: 180/180 (32 new), no snapshot changes. Full app unit suite after the
  aria-live switch: 126 files, 1366 tests passed.
- `pnpm run build` (gm-react): pass, including `check-prod-bundle` (`__rt` and the gallery absent).
  The >650 kB chunk warning predates this story.
- Playwright, desktop-chromium + mobile-chromium, after all fixes: `custom-widgets`, `canvas`,
  `combat-tile`, `map-tile`, `starter-widgets`, `widget-builder`, `a11y-axe-gate` — 185 passed,
  0 failed, 5 skipped (the combat-tile desk/phone profile gates). `custom-widgets.spec.ts` re-run
  after a final rename in the spec: 14/14.
- Not run here: the full Playwright suite and the operator's gates and review.

## Known gap (outside owned paths)

- `app/map/canvas/MapMarkers.tsx` and the DS `POIMarker` always render markers as buttons. On a
  mobile board a bound map with tokens or POIs fails axe `target-size`. The e2e binds the map tile
  to a map with no markers. The fix belongs in the shared marker renderer.
