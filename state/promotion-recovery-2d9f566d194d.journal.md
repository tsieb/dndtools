# promotion-recovery-2d9f566d194d — run journal

Task: `promotion-recovery-2d9f566d194d10e597c8-e462fbdbfe29`.
Base: `2d9f566d194d10e597c8001015b7e8be31811d59`.

## Recorded failure

The original E2E attempt `54aa3094-3732-4c83-ab09-78dc8deecd5f` ended with
1 failed, 16 skipped, 1261 passed. The compact-phone bounded-canvas test in
`apps/gm-react/tests/e2e/responsive.spec.ts:242` measured the scene route's
first main div at zero height, below the required 553px. Original log and
failure context were read directly; no Headroom tools are available in this session.

## Investigation

- Unmodified base, bounded-canvas tests on desktop Chromium, two workers,
  five repeats: 10 passed (12.9s). Log: `/tmp/promotion-2d9f566d-reproduce.log`.
- The overflow-only poll accepts an empty/loading main pane. The subsequent
  one-shot height measurement can observe a Suspense-hidden div. The recorded
  screenshot already shows a correctly sized scene after the failed measurement.
  The original route readiness check waits on the shell heading, which is available
  before the lazy scene.
- Delaying the real scene module response by 1s exposed a second outcome of the
  same missing readiness check: both dimensions were read from the previous board,
  and the test passed before the scene module was delivered. Diagnostic output in
  `/tmp/promotion-2d9f566d-timeline.log` records `GOTO RETURN /scene/...` with the
  board toolbar still in main and no `SCENE RELEASE` before the test finished.
- With the delay and a new assertion that the scene module had been delivered,
  all four browser/viewport combinations failed on the original measurement code
  (exit 1, `/tmp/promotion-2d9f566d-regression-before.log`). This reproduces the
  route-readiness defect deterministically; the exact historical 0px sample did
  not recur in local repeats, including 6x and 20x CPU throttling.

## Repair

`apps/gm-react/tests/e2e/responsive.spec.ts:242`, test `the bounded canvas routes fit
the shell's main pane`: wait for the route-specific accessible canvas region,
select its containing main-pane div, and read all three dimensions atomically.
Poll overflow and underfill together within the existing 10s measurement budget.
Keep both original assertions and their 2px tolerance, and also reject a zero-height
main pane. Retain the delayed-module regression fixture and delivery assertion.
No application code, retries, skips, workflow protections, or dispatcher state changed.

## Verification

- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/responsive.spec.ts
--grep 'bounded canvas' --workers=2 --repeat-each=5`: **20 passed (38.2s), exit 0**,
  both projects, no retries. Log: `/tmp/promotion-2d9f566d-regression-after.log`.
- `pnpm gates`: **exit 0**, existing file-size warnings only.
  Log: `/tmp/promotion-2d9f566d-gates.log`.
- `pnpm lint`: **exit 0**, existing ESLint/emphasis warnings; boundary and non-text
  contrast gates pass. Log: `/tmp/promotion-2d9f566d-lint.log`.
- `pnpm typecheck`: **exit 0**, all three packages.
  Log: `/tmp/promotion-2d9f566d-typecheck.log`.
- Prettier check on both changed files and `git diff --check`: **exit 0**.
- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/responsive.spec.ts
--workers=2`: **104 passed (2.1m), exit 0**, both projects, no skips or retries.
  Log: `/tmp/promotion-2d9f566d-responsive.log`.

Full promotion gates and independent review remain with the central operator;
the complete 1,278-test E2E gate was not rerun here. No push or promotion performed.
