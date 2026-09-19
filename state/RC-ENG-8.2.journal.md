# RC-ENG-8.2 run journal

## Scope

Default content never shows an error. The seeded home board's Map tile opened on "The linked map is
missing or was removed." Fix the seed's binding and add a test that resolves every widget binding on
every default screen and in the demo seed to available (or an intentional empty state in an empty
vault). Owned: `packages/core/src/commands/command-center.ts`, `apps/gm-react/src/runtime/demo-seed.ts`.
No agents, dispatcher mutations, push or promotion.

## Cause

- `buildDefaultCommandCenterScene` lays out the `map` tool with `binding: null`, and
  `command-center.ensure-home` (dispatched by `Board.tsx` on first paint) used it as-is, even in a
  vault holding the three `createDemoMapState` maps.
- The Board and the scene editor call `getSceneForActor` without a `dataEnvironment`, so a null
  binding resolves `available` rather than `unbound`. `MapTile` only shows its "No map linked" copy
  when `status !== 'available'`; with status `available` and no bound id it fell through to `!view`
  and printed `widgetBody.map.missingDm`. The same copy therefore showed in an empty vault too.
- The demo seed placed the first three library widgets on "The Sunken Crypt"; one is `character`,
  which requires a binding and was placed unbound ("No character linked").

## Fix

- `command-center.ts`: `defaultCommandCenterMapId` (session active map, else the first top-level map
  by name; embedded child maps are skipped) and `withDefaultMapBinding`. `ensure-home` binds the new
  home's Map tile, and on an existing home repairs an unbound Map tile once (op
  `command-center.bind-default-map`, revision bump); otherwise it stays a no-op.
- `demo-seed.ts`: backfill category `needHomeMapBinding` dispatches `ensure-home` for boards created
  before the fix; library widgets that require a binding are bound to a seeded entity of their type
  (or skipped when there is none). `format:check:changed` checks whole files, so Prettier also
  rewrapped seven pre-existing over-long lines in this file (whitespace only).

### `Map.tsx` (owned from the 2026-09-18 operator brief) — one condition

`if (widget.requiresBinding && widget.status !== 'available')` became
`if (!boundId || (widget.requiresBinding && widget.status !== 'available'))`, plus a two-line
comment. Why it is needed: the Board and the scene editor call `getSceneForActor` without a
`dataEnvironment`, so an unbound tile arrives with status `available`, skips the empty state and
falls through to `!view`, which prints `widgetBody.map.missingDm`. The core binding alone cannot
fix an EMPTY vault (there is no map to bind), and the built-in templates (RC-CAN-4.4) always place
unbound Map tiles, so without this line both still open on the error copy. Nothing else in the
file changed.

### `Map.tsx`, second change (browser gate, attempt `c0c43007`)

The gate's browser run failed only on `/board`: the mobile axe gate (`target-size` on
`Token: Sir Caldwell` / `POI: Broken Altar`), the Android 48dp check (the same four markers under
48dp) and 200% large text on the phone tier ("Fit is vertically clipped", "Zoom in is under
HEADER", "Token: Sir Caldwell is under tile-silhouette-map"). All three are the home Map tile now
drawing the demo map. A probe at 360×640 showed why: the phone board draws tiles as Fit-mode
miniatures (the Map frame was 120×80), so the map's markers painted at 15px; and the three zoom
buttons, compensated for the board's scale, were 176px squares stacked inside the clipped map with
no scroll path. The axe failure is timing-dependent (it passed in my earlier local run), the layout
one reproduced every time.

- `MapCanvas` renders every token and POI as a `<button>` even when no select handler is passed,
  and the tile passes none (`tool="pan"`, markers `pointer-events: none`), so those buttons were
  dead controls. Fixing that in `MapMarkers.tsx` / design-system `POIMarker.jsx` would leave the
  owned paths, and `MapCanvas` has no prop to turn markers off. So the tile hands `MapCanvas` the view
  with `tokens`/`pois` emptied and draws the same places itself as `aria-hidden` decoration: same
  transform as `toVisual`, same `enabled`-layer rule, a lettered ring for tokens (green when linked
  to an actor, as in `MapMarkers`) and a pin dot for POIs. `partyCentre` and the summary still read
  the full view.
- The zoom cluster moved out of the map into its own wrapping row in the tile's scrolling column
  (same buttons, labels and handlers, now with `scene-board-operation` like the tile's other
  actions). The map region's `minHeight` no longer reserves three stacked touch targets.
- Raw-style count stays at the file's allowance (4): the new row uses `gap: 6` like the tile's other
  rows, so `no-raw-style-values.allow.js` (not owned) is untouched.

### Companion paths (tests, snapshot, journal)

- New tests: `packages/core/tests/command-center-default-bindings.test.ts`,
  `apps/gm-react/src/runtime/demo-seed.test.ts`.
- `builtin-bodies.test.tsx.snap`: its `map` entry had recorded the error copy as the unbound body;
  it now records "No map linked — choose a map to show its layers." (one line).
- `tests/e2e/map-tile.spec.ts`: `TILE` is scoped to the widget id the spec places, because the home
  board's default Map tile now also renders `data-testid="map-tile"` and the unscoped locator would
  match two elements (strict mode).

## Verification (2026-09-18, on `origin/loop/rc` 123014e9)

- Core test covers the default home (demo vault, active-map preference, empty vault, legacy repair
  and idempotency) and all five `BUILTIN_SCENE_TEMPLATES` applied to a fresh scene: every widget
  resolves `available`, or `unbound` only for a tile that requires a binding. App test runs the real
  seed + `ensure-home` and resolves every widget on every scene against a data environment built
  from the vault (`knownEntityKeys`, so an absent target reads `missing`), and checks the tile's
  `getMapViewForActor` read is `available`.
- Core 280 files / 4895 tests; app 139 files / 1524 tests; core + gm-react `tsc` exit 0; eslint
  exit 0; `format:check:changed --base origin/loop/rc` clean.
- Playwright, `--retries=0`, after the second `Map.tsx` change: `responsive`, `a11y-axe-gate`,
  `map-tile`, `canvas`, `scene-templates` = 127/127 desktop-chromium and 127/127 mobile-chromium.
  The three `/board` checks that failed the gate (axe, Android 48dp, 200% phone text) repeated
  5×: 15/15 on mobile-chromium.
- The gate run's other reds (`knowledge-filters.spec.ts:129`, `knowledge.spec.ts:79` on mobile) are
  in `/knowledge` specs this change does not touch; not re-run here.

## Open

- ENG-8.1's `golden-path.spec.ts` is not on `loop/rc` yet, so its "no error tile" assertion could
  not be run; the unit tests above cover the same resolution for every default screen.
- Map markers still render as `<button>`s when the consumer passes no select handler
  (`MapMarkers.tsx`, design-system `POIMarker.jsx`). The Map tile now works around it; the session
  `ActiveMap` preview still has dead marker buttons. The real fix belongs in the shared renderer.
- Not a widget error, but seen while testing: the seed's `audio.configure-source` is rejected on
  every boot ("A web stream URL must be an absolute http(s) URL…"). The seed's `data:` URI
  (`0ae9a2d5`, 2026-07-04) predates core's http(s)-only check (`32dffe67`, 2026-07-15). In dev it
  logs a `[demo-seed]` console.warn, which ENG-8.1's no-warning assertion will catch, and it keeps
  `needAudio` true so the seed never reports "nothing to do".
