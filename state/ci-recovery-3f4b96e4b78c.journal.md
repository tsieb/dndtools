# ci-recovery-3f4b96e4b78c run journal

## Scope

Repair GitHub CI for promoted commit `3f4b96e4b78c10d40131c7203cb492c51ed1ad3f` on `loop/rc`.
Failing workflow: CI (PR run 35985246327, delivery `loop/rc`). Reproduce, fix the cause, and verify
the current integration candidate without weakening tests or workflow protections. No push,
promotion, loops, or dispatcher control-state edits.

## Diagnosis

Only one job failed: `visual regression (golden routes)`. The push run on the same SHA
(35985239770) was green.

- `Audio polish — tavern › /audio named deletion`, `visual-phone`: 3189 px, first try and retry.
- `Audio polish — parchment › /audio named deletion`, `visual-phone`: 8219 px.
- `Audio polish — scholar › /audio named deletion`, `visual-phone`: 11563 px, first try and retry.

This is the same late stream failure that `ci-recovery-552cf279bc46` diagnosed. The test streams
`https://example.test/quiet.mp3` over the real network, and when DNS gives up after the Delete
click has scrolled the preset list, the page under the dialog moves. The tavern count is exactly
the 3189 px from that task's run.

## Repair

This task changes no code. The fix is sibling commit `b5a99b8e`
(`fix(ci): pin the /audio named-deletion stream failure before the Delete click`), which is
already the `loop/rc` tip and this branch's HEAD: `example.test` is aborted through `page.route`,
and the test waits for the settled "could not be played" alert before clicking Delete. No
baselines or tolerances changed. On `b5a99b8e`, the push CI run 35989317180 and the PR CI run
35989323705 both passed `visual regression (golden routes)`.

## Verification (pinned `mcr.microsoft.com/playwright:v1.61.1-noble` container, `CI=1`, HEAD `b5a99b8e`)

- `-g "named deletion" --repeat-each=4 --retries=0`, all three projects and five themes: 60 passed.
- Mutation with the pre-fix order (no wait on the alert), holding the `example.test` request
  until the delete dialog is open and then aborting it, on `visual-phone` (temporary edit,
  reverted): tavern 3189, parchment 8219, scholar 11563 and dungeon 2853 px. Those are CI's exact
  counts, so the cause is confirmed for all three themes in this run.
- Fixed spec with the abort delayed 3 s (temporary edit, reverted), `visual-phone`,
  `--repeat-each=2`: 10 passed. The fix waits out a slow failure.
- Full golden-route suite: 225 passed, exit 0.
