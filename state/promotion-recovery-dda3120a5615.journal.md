# Promotion recovery dda3120a5615 — run journal

Task: `promotion-recovery-dda3120a56153caab482-4fd2a013e9c0`.
Base: `dda3120a56153caab48207c8937cda65454cd35b`.

## Investigation

- Read the original failing attempt `2114dbb2-082f-4c99-b285-614775f18279/output.log`.
  `pnpm test` stopped in core: 64 suites failed to load with
  `Unknown system error -122: Unknown system error -122, write`; 217 suites and
  4,403 tests passed. Linux errno 122 is EDQUOT (disk quota exceeded).
- The unchanged base's core suite passed locally: 281 files, 4,902 tests.
  Full `pnpm test` baseline is running; original output is retained locally at
  `/tmp/promotion-dda3120-before.log`.
- Installed Vitest 4.1.11 uses `ForksPoolWorker.cacheFs = true` and
  `ModuleFetcher.fetch` writes transformed module copies under the temporary
  directory even when experimental persistent caching is disabled. The threads
  pool avoids this disk transport. Investigating a core-only pool change and a
  controlled EDQUOT reproduction without exhausting shared host storage.
- No applicable AGENTS.md or dispatch Headroom tools were available. Reads and
  diagnostics used original filesystem output. Dispatcher state is unchanged.

## Reproduction and repair

- Baseline `pnpm test` exited 0: core 281 files / 4,902 tests; cloud 39 / 521;
  app 143 / 1,581; tooling 26 / 196. The quota failure is transient on this host.
- Added a regression that preloads an EDQUOT injector into a child Vitest runner
  with its own temporary directory. Only temporary module writes are denied;
  no shared storage is filled or removed. It runs the real core schema suite.
- Before the repair, `pnpm exec vitest run tests/unit/vitest-core-storage.test.ts`
  exited 1: the explicit forks control reproduced the expected error, and the
  configured pool failed to load `tests/schemas.test.ts` with the same `-122`
  diagnostic as the recorded promotion. Original output:
  `/tmp/promotion-dda3120-reproduction.log`.
- Set the core pool to `threads` to avoid temporary-file module transport.
  Worker caps, isolation, test selection, assertions, coverage thresholds, and
  workflow protections are unchanged. Other suites retain their existing pools.

## Validation

- Post-repair regression: **2 tests passed**, exit 0
  (`/tmp/promotion-dda3120-regression.log`). The explicit forks negative control
  still fails under injected EDQUOT; the configured core pool passes.
- Full `pnpm test`: **490 files / 7,202 tests passed**, exit 0
  (`/tmp/promotion-dda3120-after.log`): core 281 / 4,902; cloud 39 / 521;
  app 143 / 1,581; tooling 27 / 198. Core completed in 9.43 seconds.
- `pnpm lint`, `pnpm typecheck`, `pnpm gates`, `pnpm security:secrets`, and
  `pnpm format:check:changed`: all exited 0. Lint and gates retain their existing
  warnings. Exact local logs: `/tmp/promotion-dda3120-{lint,typecheck,gates,secrets,format}.log`.
- `git diff --check`: passed. No application behavior, test assertions, gate
  thresholds, retries, or workflows changed. Build and browser suites were not
  rerun for this test-runner-only change; central gates and independent review
  remain the operator's next step.

## Scope and limitations

The host no longer reproduced the quota exhaustion naturally. The committed
regression reproduces the recorded error through controlled temporary-write
failure, then verifies the core runner avoids that dependency. It does not claim
to repair host quotas or make filesystem-dependent application tests immune to
storage exhaustion. Only the current task branch is changed; no push, promotion,
additional loop, or dispatcher control-state edit was performed.

## Independent review follow-up

- Review of `a1e65475` identified weakened native-timezone coverage: assigning
  `process.env.TZ` inside a Node worker does not change native Date/Intl state.
  The earlier claim that effective assertions were unchanged was incorrect.
- Re-read the original promotion log: 64 suite-load failures with errno `-122`.
  Re-ran the controlled quota regression: 2/2 passed, including the explicit
  forks failure control (`/tmp/promotion-dda3120-review-quota.log`).
- Reproduced the review finding by temporarily asserting distinct native offsets
  in the existing test: it failed with `expected 480 not to be 480`, while the
  other 30 calendar tests passed. Exact output:
  `/tmp/promotion-dda3120-review-timezone-before.log`.
- Replaced worker environment mutation with child processes that import the real
  formatter source. TZ and locale are set before startup; the clock is changed
  inside each child. Both original formatter comparisons remain, with added
  assertions for native offsets (-840 and 720), locales, and clock values.
  The child TypeScript loader has disk caching disabled. The core threads pool,
  isolation, worker caps, coverage thresholds, and workflows remain intact.
- Focused calendar validation: 31/31 passed, exit 0
  (`/tmp/promotion-dda3120-review-timezone-after.log`). A temporary mutation of
  the real formatter to append its native timezone offset made the repaired
  comparison fail (`DR -840` versus `DR 480`), exit 1. The source was restored
  byte-for-byte before full validation. Exact negative-control output:
  `/tmp/promotion-dda3120-review-timezone-mutation.log`.
- `pnpm lint`, `pnpm typecheck`, `pnpm gates`, `pnpm security:secrets`, and
  `pnpm format:check:changed`: all exited 0; existing warnings remain. Logs:
  `/tmp/promotion-dda3120-review-{lint,typecheck,gates,secrets,format}.log`.
- Full `pnpm test`: exited 0, **490 files / 7,202 tests passed**: core 281 /
  4,902; cloud 39 / 521; app 143 / 1,581; tooling 27 / 198. Original output:
  `/tmp/promotion-dda3120-review-test.log`.
- `git diff --check`: passed. This follow-up changes calendar test coverage,
  its child fixture, a runner comment, and this journal only. No application
  source, dependencies, workflow protections, or dispatcher control state changed.
  Build/browser checks are left to the central operator's gates and review.
