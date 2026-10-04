# promotion-recovery-879489abfe6f run journal

## Scope

Repair the failed promotion gate `CI: e2e` for `879489abfe6fd7802963c3fcaa1b90bb26c61fa4`
(fingerprint `9ec9ce992eb4`). Task branch base `ed614140` (contains `879489ab`). No push,
promotion, loops, or dispatcher control-state edits.

## What is red

The gate had 1 failed, 32 skipped and 1707 passed tests (2 workers, 1.1h):

- `android-quick-map.spec.ts:487` "double-taps to zoom, glides after a fling, long-presses for
  actions, and sizes the fog brush" (desktop-chromium), at the momentum step (line 541):
  `Expected: > 90, Received: 60`. The map moved exactly the 60px the finger dragged and did not
  glide.

## Reproduction

- `panVelocityFromSamples` only uses samples within 90 ms (`VELOCITY_WINDOW_MS`) of the last one.
  `useTouchNavigation.sampleNavigation` stamped each sample with `performance.now()` when the
  handler ran, so the samples recorded when each move arrived, not when it happened.
- The spec sends its four `touchMove`s as separate awaited CDP round trips. On a loaded runner,
  a round trip takes longer than 90 ms. The window then held only the last sample, the velocity
  was zero, and no glide started.
- A probe copy of the spec with `waitForTimeout(120)` after each move failed with the same
  `Expected: > 90, Received: 60` on desktop-chromium. It passed with no gap.

## Fix

- `useTouchNavigation.ts`: samples now use `event.timeStamp` (the input's own time, same clock as
  `performance.now()`) instead of handler time. Main-thread jank on a real phone delivers moves
  late and bunched, which read as a stall under handler time and stopped the glide. The velocity
  window, speed limits and decay are unchanged.
- `android-quick-map.spec.ts`: the flick sends explicit CDP `timestamp`s (60px over four 16 ms
  frames), so the gesture speed comes from the test, not from runner load. The assertion is
  unchanged (`> travelPx + 30`).
- Both changes are required. The stamped spec against the old hook still failed 2/2 (60px) with
  120 ms gaps, which also confirms the CDP stamps reach `event.timeStamp`.

## Verification

- Probe (stamped spec + fix), both projects, gaps of 0 / 120 / 300 ms between moves: 2/2 passed
  each time.
- `android-quick-map.spec.ts` + `map-editor.spec.ts`, both projects, `--workers=2`: 92 passed,
  4 skipped.
- The fling test `--repeat-each=10 --workers=4`, both projects: 20/20 passed.
- `vitest run src/app/map`: 6 files / 55 tests passed. gm-react `typecheck` exit 0; eslint and
  prettier clean on both changed files. The probe spec and its test-results were deleted.
