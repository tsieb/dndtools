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
  (or skipped when there is none).
- Outside the owned paths, each required by the change: `Map.tsx` treats "no binding" as the
  empty state (one condition); the `builtin-bodies` snapshot recorded the old error copy as the
  unbound body and now records "No map linked"; `map-tile.spec.ts` scopes `TILE` to its own
  widget id, because the home board's default tile now also renders `data-testid="map-tile"`.

## Verification

- New tests: `packages/core/tests/command-center-default-bindings.test.ts` (4) and
  `apps/gm-react/src/runtime/demo-seed.test.ts` (3). Both resolve every widget against a data
  environment built from the vault (`knownEntityKeys`, so an absent target reads `missing`).
- Core suite 274 files / 4783 tests pass; app suite 127 files pass after the snapshot update
  (builtin-bodies 30/30); core + gm-react typecheck exit 0; eslint clean on all changed files.
- Playwright `map-tile.spec.ts` 6/6 on desktop-chromium and mobile-chromium; `canvas.spec.ts` +
  `a11y-axe-gate.spec.ts` 67/67 on desktop-chromium.

## Open

- **Blocking: mobile-chromium axe gate on `/board` fails** (66/67): `target-size` (serious) on
  `button[aria-label="Token: Sir Caldwell"]` and `button[aria-label="POI: Broken Altar"]`, both on
  `map-ruined-keep`, the map the default tile now binds to. Before this change the tile rendered a
  line of text, so the markers were never on the board. `MapMarkers.tsx` renders every token as a
  `<button>` and the design-system `POIMarker.jsx` is always a 44px `<button>`, even when the
  consumer passes no select handler (the Map tile and session `ActiveMap` pass none; only the Atlas
  does). The board scales tiles down, so on mobile they paint under 24px. The known-violations
  register is empty. Fix belongs in the shared map renderer / design system (a marker with no select
  handler should not be a control), which is outside this story's paths; left for the operator.
- Not a widget error, but seen while testing: the seed's `audio.configure-source` is rejected on
  every boot ("A web stream URL must be an absolute http(s) URL…"). The seed's `data:` URI
  (`0ae9a2d5`, 2026-07-04) predates core's http(s)-only check (`32dffe67`, 2026-07-15). In dev it
  logs a `[demo-seed]` console.warn, which ENG-8.1's no-warning assertion will catch, and it keeps
  `needAudio` true so the seed never reports "nothing to do".
