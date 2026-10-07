# promotion-recovery-c6e47e5d994b — the Community capture timed out in a stall shared by both visual containers

## Failure

- Promotion gates for `c6e47e5d` (fingerprint `43a5ec9c0b71`) passed every `CI:` command, then
  failed `Visual regression (pinned container)` (attempt `0aee8924`, container `stoic_curie`,
  17:09:33–17:24:29): 1 failed, 515 passed in 14.9 min.
- The failure was `[visual-desktop] community.spec.ts:79 › community — parchment`. It was not a pixel
  diff. `toHaveScreenshot` found the tabpanel, waited for fonts, then ran out of its 5 s deadline at
  "waiting for element to be stable". The failure screenshot shows the Discover tab fully
  rendered, identical to the baseline.
- `c6e47e5d` changes only the CI workflow (it splits browser E2E into shards). Nothing under
  `apps/gm-react/src` that Community renders changed in it or its parent.

## Diagnosis

- A second full visual suite (attempt `3338f568`, container `admiring_montalcini`, 17:01:56–17:17:21)
  ran alongside ours. It also failed exactly one capture, the phone-tier
  `knowledge note card — tavern` (`knowledge-polish.spec.ts:23`), with the same 5 s screenshot
  timeout after "fonts loaded" and no pixel diff.
- The container output in the journal shows the stall. Between 17:10:18 and 17:10:26 neither
  container reported a result. Every test in flight on all four workers then took ~10 s instead
  of ~3 s: ours `community — parchment` (9.6 s, failed) and `community — scholar` (10.3 s), and theirs
  `knowledge note card — parchment` (10.4 s) and `— scholar` (10.3 s). The same shared pause
  happened a minute earlier, from 17:09:50 to 17:10:01: `atlas editor rail dungeon` 12.2 s,
  `board-layouts` 12.7 s, `Story polish — dungeon` 12.7 s, `graph polish — tavern` 13.4 s.
- The host itself kept running: mongod's once-a-second `ftdc` journal heartbeat had no gap over
  2 s from 17:09 to 17:13, and Discord's heartbeats arrived on time. The stall was confined to the
  two Chromium containers. Swap was fully used (7 of 7 GiB) when I checked at 18:45. The
  browser-E2E attempt `87d10e9e` had finished at 17:09:33, when ours started.

## Reproduction

- Focused, on this branch (`e6c2af4c`, which contains `c6e47e5d`): `community.spec.ts` on
  `visual-desktop`, `-g "community — "`, `--repeat-each=10` gave 50 passed, 0 failed.
- Full `apps/gm-react/tests/visual/run-in-container.sh` on this branch (18:47:54–18:58:47, no other
  visual container running): **516 passed, 0 failed, exit 0, 10.9 min.** The slowest test took
  7.5 s, and the five `community —` captures took 2.2–2.5 s.
- At the exact failed SHA (a temporary detached worktree at `c6e47e5d`, removed afterwards):
  `run-in-container.sh --project=visual-desktop` gave **172 passed, 0 failed, exit 0, 4.0 min**,
  with `community — parchment` at 2.8 s.
- Without the shared stall, the recorded failure does not reproduce on this code.

## Resolution

- I changed no code, baseline, assertion, timeout, retry or workflow. A longer screenshot deadline
  would only hide a pause that hit both containers at once, so it stays at 5 s. This is the same
  failure class as `promotion-recovery-4ed8b45155b3.md`.
- Operator follow-up (outside this repo and this task's authority): two full visual suites ran
  concurrently again, and both lost one capture to the same pauses. The dispatcher's slot budget
  should not run two visual containers at once while swap is exhausted.
- Logs: `/tmp/promo-c6e47e5d-community.log`, `/tmp/promo-c6e47e5d-full.log`,
  `/tmp/promo-c6e47e5d-exact-desktop.log`.
