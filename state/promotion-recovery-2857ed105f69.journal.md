# promotion-recovery-2857ed105f69 run journal

## Scope

Repair the failed promotion gate `CI: e2e` for `2857ed105f69146a0d6c11dccc92b4455ed4401c`
(fingerprint `75b384f98fb3`). No push, promotion, loops, or dispatcher control-state edits.

## What is red

The gate had 2 failed and 1602 passed tests:

1. `scene-cards.spec.ts:126` "the in-window scene display behaves as a keyboard modal and
   restores its launcher focus" (desktop-chromium). It failed at the last step: after Escape,
   `getByRole('button', { name: /Search/ }).first()` was not focused.
2. `a11y-axe-gate.spec.ts:291` "/board phone Layout, overview, jump sheet and full-screen tile"
   (mobile-chromium). The jump sheet step reported `color-contrast` on the five
   `Go to <tile>` category labels.

## Reproduction

- Both specs on unmodified HEAD, `--repeat-each=10`: the axe test failed 2/10 with the same five
  selectors. The scene-cards test passed 20/20 on an idle host.
- The dispatcher logs show the scene-cards test failing about 20 times in 570 runs since
  2026-09-11. Several of those failed at the FIRST `toBeFocused()`, right after
  `launcher.focus()`. That means the locator resolved to a different element between focusing
  and asserting.
- Mechanism: Desktop Chrome starts at 1280px, where the Sidebar's "Search (⌘K)" button matches
  `/Search/` and comes first in DOM order. `setViewportSize(360)` only moves the shell to the
  phone tier once `useViewport`'s media-query `change` listener commits. If `focus()` runs
  before that commit, it focuses the Sidebar button. The tier flip then unmounts that button, and
  the overlay later restores focus to a detached node. CPU throttling alone did not reproduce the
  race, but a late frame did. An init script that delays every `MediaQueryList` `change` listener
  by 250 ms made the test focus "Search (⌘K)" and fail at the recorded assertion 3/4 times.
- The axe failure is the known DS Sheet entry race (scrim and slide-up scanned mid-fade), with the
  same mechanism as `2857ed10` on `characters-polish.spec.ts`.

## Fix

- `scene-cards.spec.ts`: after the resize, wait for the Sidebar's "Search (⌘K)" to be gone, then
  take the phone top bar's launcher (`name: 'Search', exact: true`) once it is visible. Every
  assertion is unchanged: focus in, the Tab cycle stays inside, and Escape restores focus.
- `a11y-axe-gate.spec.ts` `assertAxeState()` now waits on `animation.finished` for every finite
  animation before the scan, as `_communityAxe.ts` and `characters-polish.spec.ts` do. The
  assertion is unchanged, and so is the set of scanned states.

## Verification

- Fixed scene-cards test with the 250 ms media delay injected, both projects, `--repeat-each=6`:
  12/12 passed. The same injection failed 3/4 before the fix. I removed the injection afterwards.
- `scene-cards.spec.ts` plus `a11y-axe-gate.spec.ts:291`, `--repeat-each=10`, both projects,
  with no injection: 300/300 passed. Before the fix, axe:291 failed 2/10.
- Full `a11y-axe-gate.spec.ts`, both projects: 61 passed, 1 skipped (the phone-only test on
  desktop).
- `eslint`, `prettier --check` on both specs, and `pnpm typecheck` (gm-react): clean. I deleted
  the probe spec.
