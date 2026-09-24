# ci-recovery-552cf279bc46 run journal

## Scope

Repair GitHub CI for promoted commit `552cf279bc46e2bb9a3487289abfd1a7f4b7dd82` on `loop/rc`.
Failing workflow: CI (PR run 35976892610, PR #76 `loop/rc` → `main`). Reproduce locally, fix the
cause, and verify without weakening tests or workflow protections. No push, promotion, loops, or
dispatcher control-state edits.

## Diagnosis

Only one job failed: `visual regression (golden routes)`, with 223 passed, 1 flaky and 1 failed.

- `Audio polish — tavern › /audio named deletion` on `visual-phone`: 3189 px differ, first try and
  retry.
- `Audio polish — dungeon › /audio named deletion` on `visual-phone`: 2853 px differ on the first
  try, then passed on retry.

The push run on the same SHA (35976886051) passed the visual job. `origin/main` adds only
`RC_ROADMAP.md` and `tools/roadmap/sync-status.py` on top of the merge base, so nothing in the PR
merge changes rendering. The CI `-actual.png` has the same dialog as the baseline. Only the page
under it is scrolled 18px differently.

Cause: the test plays `https://example.test/quiet.mp3` over the real network. Autoplay is blocked
until the Presets tab click, and that click retries playback. The alert above the tabs then
changes to "The stream could not be played…" whenever DNS for `example.test` gives up. If that
happens after the Delete click has scrolled the preset list into view, the background under the
dialog ends up at a different offset.

Reproduced in the pinned container with a temporary spec that held the `example.test` request
until the dialog was open: the tavern and dungeon phone captures failed with exactly 3189 and
2853 px, CI's numbers. The unmodified test passed 30/30 locally, so the failure depends on
timing.

## Repair

`apps/gm-react/tests/visual/golden-routes.spec.ts`, `/audio named deletion`:

- `page.route('https://example.test/**', route.abort())` makes the stream fail immediately, with
  no DNS.
- After the Presets tab click, the test waits for "The stream could not be played (unreachable
  URL or unsupported format)." before clicking Delete.

No baselines changed. The captured state is the one the committed PNGs already show. No tolerance
changed either.

## Verification (pinned `mcr.microsoft.com/playwright:v1.61.1-noble` container, `CI=1`)

- `-g "named deletion" --repeat-each=4 --retries=0`, all three projects and five themes: 60 passed.
- The same test with the abort delayed 3 s (temporary edit, reverted), phone,
  `--repeat-each=2`: 10 passed. A slow failure is waited out.
- Full golden-route suite: 225 passed, exit 0.
- `prettier --check` and `eslint` on the spec are clean. `apps/gm-react` `tsc --noEmit` exits 0.
