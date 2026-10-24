# RC-ENG-8.20 run journal

## Attempt 1 — 2026-10-24

Base: `3435f87c1`. The working tree started clean. No dispatcher control state,
push, promotion, or additional agents used. Headroom tools were unavailable.

The production fix already exists in the base: MapMarkers gives POI wrappers
pointer-events none and binds drag handlers and pointer-events to the pin alone;
unselected POIs sit below token discs. Token wrappers also ignore pointer events.
The seed has Sir Caldwell at (0.22, 0.24) and Cellar Ambusher at (0.68, 0.62).
Acceptance checks confirm no additional seed or rendering change is necessary.

The existing acceptance test drags both seeded tokens at 390×844 with real CDP
touch and 1440×900 with mouse input, reads their positions from core state, and
asserts every POI is unchanged after each drag. Its axe scan ran after dragging,
which could conceal an initial overlap. Moved that scan before either drag so
it tests the untouched seed at default zoom, still requiring at least four
measured map targets and zero target-size violations.

## Validation

- `pnpm exec playwright test tests/e2e/map-editor.spec.ts --project=desktop-chromium --project=mobile-chromium --grep 'each seeded token drags' --workers=2`
  from apps/gm-react: **4 passed (20.2s)**, exit 0. Both explicitly sized tiers
  passed in each project, including the untouched-seed axe scan.
- Prettier check and git diff whitespace check passed before commit.
- Only test ordering and this journal changed; no pixel changes, so no new visual
  baseline run. Central operator retains full gates and independent review.
