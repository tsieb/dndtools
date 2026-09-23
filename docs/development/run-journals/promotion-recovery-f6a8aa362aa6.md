# promotion-recovery-f6a8aa362aa6 — `CI: e2e` boots starved by the shared /tmp quota; superseded by `25c1a8b8`

## Failure

- Promotion gates for `f6a8aa36` (fingerprint `766414f9fa9b`) passed everything up to
  `CI: test:coverage:core`, then failed `CI: e2e` (attempt `8c7ece35`) with exit 1: 11 failed,
  1264 passed, 17 skipped in 28.6 min. The failures were `settings.spec.ts:101/:180/:203/:217`,
  `feature-spotlight.spec.ts:88/:100`, `canvas.spec.ts:1607/:1647` and `sfx-events.spec.ts:82`.
  Nearly all of them timed out in `waitReady` because `__rt.loaded` never became true or
  `#main-content` never attached. Two others hit `browserContext.close: Target page, context or
browser has been closed`.
- The gate log itself has no `-122` line this time. The pattern is the same one the Chromium
  shared-memory quota exhaustion produces, and `settings.spec.ts:101` (three reloads) is its known
  trigger.

## Reproduction

- On the unchanged branch (`f6a8aa36`), ran `settings`, `feature-spotlight`, `sfx-events` and
  `themes` specs (both projects, 2 workers) with `quota -w` sampled every second: 6 failed, 39 passed.
  The failures were `settings.spec.ts:101` and `:203` on both projects plus `themes.spec.ts:45` and
  `:59` on mobile, all `__rt.loaded` timeouts. `/tmp` usage peaked at 13,109,228 of the
  13,109,270-block quota, so it was pinned at the limit.

## Repair

- The cause is fixed on `loop/rc` by `25c1a8b8` (`DNDTOOLS_E2E_FULL_RESPONSES` /
  `e2eFullResponses()`, originally `32ef11ad`). It landed after this task's base `df379bf7`. Under
  the harness the dev server drops `If-None-Match` / `If-Modified-Since` and answers 200, so
  Chromium no longer keeps a 2 MB shm pipe per 304. The Playwright webServer and the validate
  harness's managed server set the flag.
- The first attempt (`668b086f`) ported the same hunks from `5d80db58` onto `df379bf7`. Its
  `vite.config.ts`, `playwright.config.ts` and `scripts/validate/servers.ts` hunks are
  byte-identical to `25c1a8b8`. Review rejected it because it also carried the older
  `responsive.spec.ts:242` rewrite, which `25c1a8b8` left out; `dcd42b55` on `loop/rc` fixes that
  race differently, so the two conflicted.
- Rebased onto `loop/rc` (`d50b657a`) and resolved `responsive.spec.ts` in `loop/rc`'s favour
  (`dcd42b55` kept unchanged). The identical harness hunks dropped out, so this branch now adds only
  this journal. The repair itself is `25c1a8b8`; this task is superseded by it.
- No assertion, timeout, retry budget, gate command or workflow protection changed.

## Verification

- First attempt, on `df379bf7` with the ported fix: the same four specs gave 45 passed, 5 skipped,
  0 failed. Full `pnpm e2e` (both projects, 2 workers) gave exit 0, 1275 passed, 17 skipped,
  0 failed in 19.5 min, with no `-122` or `ERR_INSUFFICIENT_RESOURCES`. `/tmp` peaked 205 MB above
  its starting usage.
- On the rebased tree (`loop/rc` `d50b657a` + this journal), both projects, 2 workers:
  `settings`, `feature-spotlight`, `sfx-events`, `themes` and `responsive` specs gave exit 0,
  203 passed, 5 skipped, 0 failed in 4.0 min, with no `-122` / `ERR_INSUFFICIENT_RESOURCES` in the
  log. `canvas.spec.ts -g 'tile action menu'` (covers `:1607` / `:1647`) gave 12 passed, 0 failed.
- I did not rerun the full suite on the rebased tree. The wrapper's e2e gate on this commit is the
  evidence for that.
