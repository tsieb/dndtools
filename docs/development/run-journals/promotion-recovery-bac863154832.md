# promotion-recovery-bac863154832 — `/audio named deletion` tab click raced the autoplay retry

## Failure

- Promotion gates for `bac86315` (fingerprint `8d2f25433cc4`) passed every CI command, then failed
  `Visual regression (pinned container)` (attempt `51659a6a`): 1 failed, 392 passed. The failure
  was `[visual-phone] golden-routes.spec.ts:231 › Audio polish — high-contrast › /audio named
deletion`, which timed out waiting for the `Delete Quiet evening` button.
- The failure snapshot has the Presets tab `[active]` (focused) while Playback is still
  `[selected]`. The tab took focus from the click's `pointerdown`, but its `click` never fired.

## Cause

- The test's Presets tab click was also the page's first gesture. `audio-playback.ts` arms
  capture-phase `pointerdown`/`keydown` listeners that retry blocked playback, so the retry runs
  inside the click's own `pointerdown`. It swaps the Now Playing alert (the autoplay notice becomes
  a loading line, then the failure text) and moves the tablist while the click is still in progress.
- Traced in the pinned container (phone, high-contrast): the tab sits at y=343 before the click, and
  at `pointerdown` it is already at y=325. The click point y=365 stays only 4 px inside the tab's new
  bottom edge (369). One trace caught the tab at y=349 just before the click, which puts the click
  point at y=371, below the moved tab. Playwright hit-checks only the first event of a click, so a
  `mouseup` that lands off the tab sends `click` to a common ancestor, which leaves the tab focused
  but not selected.
- Timing-dependent: `-g "named deletion" --repeat-each=10` on an idle machine passed 50/50; the
  gate run was one of two workers in a 393-test run.

## Repair

- `golden-routes.spec.ts`: the autoplay gesture is now a bare `Shift` press (nothing in the app binds
  it). The test waits for the stream-failure alert, then clicks Presets on a settled layout and
  asserts `aria-selected="true"` so a missed click fails at the click. No assertion or screenshot
  was dropped, and no baseline changed.
- An app-side follow-up remains: a real user's first click on `/audio` can also land on a moving
  target, because the alert above the tabs changes height at that click. This change leaves the app
  alone.

## Verification

- Pinned container, `-g "Audio polish" --repeat-each=4`, both projects: 300 passed, 0 failed,
  against the committed baselines.
- Throttled probe (CDP CPU rate 1/4/8, phone, high-contrast, 4 repeats each; not committed): with the
  fix the tab stays at y=343 for `pointerdown`, `mouseup` and `click` in all 12 runs (click at
  y=365, the tab's centre). Before the fix the same trace showed the tab moving to y=325 inside
  `pointerdown`.
- `prettier --check`, `eslint` and `tsc --noEmit` on the spec are clean.

## Second attempt: `Browser acceptance` attached to Postgres

- Validation of `c598989f` passed every gate except `Browser acceptance` (attempt `2876688b`,
  `pnpm e2e --workers=2 --retries=2`): 4 passed, almost everything else failed in ~300 ms with
  `page.goto: net::ERR_EMPTY_RESPONSE at http://localhost:5432/...`.
- Cause: `playwright.config.ts` derives a linked worktree's port from its path (5300–5899), and this
  worktree's path hashes to 5432, where the gate host's `jam-postgres` container listens. Outside
  CI `reuseExistingServer` is true, so Playwright attached to Postgres instead of starting Vite. Any
  change on this worktree would have failed the gate the same way. 5355 (systemd-resolved LLMNR) is
  also in the range.
- Reproduced: `DNDTOOLS_E2E_PORT=5432 playwright test tests/e2e/wiki.spec.ts` fails with the same
  `ERR_EMPTY_RESPONSE`.
- Repair: a derived port that already answers on 127.0.0.1 or ::1 is skipped for the next free one
  in the range. The runner pins its pick in `DNDTOOLS_E2E_PORT`, so workers that re-read the config
  after Vite is up keep the same port. An explicit `DNDTOOLS_E2E_PORT`, the primary checkout, CI and
  the managed harness behave as before. `TESTING.md` notes the skip.
- Verified: this worktree now picks 5433. `wiki.spec.ts` + `a11y-axe-gate.spec.ts` pass 66/0 with
  every request on :5433, and the pinned visual container passes the `wiki reader|named deletion`
  subset 30/0 with the new config.
