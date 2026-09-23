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
