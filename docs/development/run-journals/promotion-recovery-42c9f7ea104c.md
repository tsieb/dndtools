# promotion-recovery-42c9f7ea104c — `CI: e2e` died on the shared /tmp quota; port the 304 fix

## Failure

- Promotion gates for `42c9f7ea` (fingerprint `f1befbd05ff2`) passed everything up to
  `CI: test:coverage:core`, then failed `CI: e2e` (attempt `50e2376c`, 18:58) with exit 1. The log
  is 117 lines: about 100 `Error: Unknown system error -122 ... write`, then `Error: No tests found`.
  Playwright could not write its transform cache while collecting specs, so not one test ran.
- Errno -122 is EDQUOT: the per-user quota (13,109,270 blocks) on the `/tmp` tmpfs that every
  dispatcher worktree shares.

## Diagnosis

- Not a defect in `42c9f7ea` (a visual baseline refresh). The e2e runs on this host fill the quota
  with Chromium shared memory: Playwright launches Chromium with `--disable-dev-shm-usage`, Vite
  answers every module revalidation after a context's first load with 304, and Chromium keeps a
  2 MB shm pipe mapped per 304 until the context closes, about 1.1 GB per reload. Any gate that
  writes to `/tmp` while an e2e run elsewhere holds that memory fails with -122.
- The fix, `DNDTOOLS_E2E_FULL_RESPONSES` / `e2eFullResponses()` (originally `32ef11ad`), was
  reviewed and approved but is still not on `loop/rc` (`f6a8aa36`). The sibling branch
  `dispatch/dndtools/0266d1edb79db814617e` carries it as `b8ab2bf7`, based exactly on `f6a8aa36`.
- At task start, `/tmp` held 9.78 GB of the 12.8 GB quota before any run of mine.

## Repair

- Applied `b8ab2bf7`'s code hunks unchanged: the dev server drops `If-None-Match` /
  `If-Modified-Since` under the harness and answers 200 (`vite.config.ts`). The Playwright webServer
  and the validate harness's managed server set the flag. The `responsive.spec.ts:242` race fix
  (wait for the route's own element, poll the fill bound) comes along with it. It is a known
  base-red flake, and the assertion's bound (≤ 2 px unused) is unchanged. The sibling's own run
  journal is left out. Because the hunks are identical, whichever branch lands second merges clean.
- No assertion, retry budget, gate command or workflow protection changed.

## Verification

- Prettier and eslint on the four touched files: clean. `pnpm typecheck`: exit 0.
- Full `pnpm e2e` (both projects, 2 workers) on this branch, with `quota -w` sampled every 2 s:
  exit 0, 1275 passed, 17 skipped, 0 failed in 19.8 min. The log has no `-122` and no
  `ERR_INSUFFICIENT_RESOURCES`. `/tmp` went from 9.78 GB at the start to a 10.01 GB peak
  (+230 MB), and it was back at 9.84 GB when the run ended. Another worktree's reviewer
  (`0266d1ed`, which also has the fix) ran Playwright specs on the host at the same time.
- The recorded failure does not reproduce as a code defect once the quota is shared by runs that
  have the fix. Until this fix (or `b8ab2bf7`) lands on `loop/rc`, any gate that writes to `/tmp`
  can still fail with -122 when an unfixed e2e run is going elsewhere on the host.

## Repair round 1 — post-rebase `Browser acceptance` exit -15

- The post-rebase gate (attempt `bdd8af7b`, head `e77a61cc`) was stopped by SIGTERM at 23:26:37,
  after 14 minutes, at test 667 of 1292. Its timeout is 5400 s. The browser gate for `RC-SES-6.1`
  (`5d8bc6eb`) got SIGTERM 4 s earlier, at 23:26:33, so something outside both candidates stopped
  them. The host was rebooted soon afterward (uptime at 02:29 was 2 h 40 min).
- Before the kill, the first desktop axe tests (`/`, `/board`, `/scenes`, `/atlas`, system builder)
  failed with ~20 s timeouts at 23:12–23:14. The journal shows `chrome-headless` SIGTRAP core
  dumps in the same window, and the `RC-SES-6.1` gate (a base without the 304 fix) was running
  alongside. `/atlas` failed all three tries, but the reporter was killed before it could print
  the failure details.
- Re-run on this branch at `e77a61cc` with the gate's own command, `pnpm e2e --workers=2 --retries=2`,
  sampling `quota -w` every 20 s: exit 0, 1275 passed, 17 skipped, 0 failed, 0 flaky, in 19.3 min.
  No `-122` and no `ERR_INSUFFICIENT_RESOURCES`. `/tmp` peaked at 266 MB.
- Also: `a11y-axe-gate.spec.ts` on both projects passed 58/58. `/atlas`, `/scenes` and the system
  builder, desktop, `--repeat-each=8`, passed 24/24.
- No code change in this round. `loop/rc` is still at `df379bf7` (without the fix), and this branch
  merges into it cleanly.
