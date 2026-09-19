# promotion-recovery-66bd4a03576b — run journal

Task: repair the failed promotion gates for `66bd4a03576b3b44ce52489a55ad7f7931519b5b`
(`docs(run-journal): record the RC-KNW-5.1 rebase onto dd7cd001`). Fingerprint
`906970f23d6a…`. Nine of the ten gates passed. Only `CI: e2e` failed (attempt `7237561a`).

## What failed

The gate ran `pnpm e2e` (`playwright test --workers=2`, no `CI`, so zero retries). The result
was `2 failed, 11 skipped, 1171 passed (21.4m)`. Both failures were desktop tests in
`tests/e2e/settings.spec.ts`:

| #   | test                                                                                        | where it stopped                                                                                                              |
| --- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 538 | `:101` an explicit "Full" motion choice survives a reload under an OS reduce-motion request | the third `waitReady` (`settings.spec.ts:131`); the page snapshot is the `<Boot>` status "Loading your vault…"                |
| 540 | `:180` still hides gated sections the user is not on                                        | test timeout with no pending call named; the snapshot shows the fully rendered Settings page, including "Settings navigation" |

Why this looks like an environmental stall rather than a code or test defect:

- Tests 538 and 540 were the only tests in flight on the two workers. Both ran for exactly
  `1.1m`, which is the 30 s test timeout plus a teardown that also hung. The whole browser and
  dev-server pair stopped responding at the same moment.
- Tests 537, 539, 541 and 542 ran immediately before and after them in the same file and
  project, and each took about 1.5 s. Test 538 had already passed two of its three reloads
  before it stalled.
- The same two tests passed on `mobile-chromium` later in the same run.
- The failure artifacts (`error-context.md` under the promotion worktree's `test-results/`)
  show no app error or failure screen. They show only a boot that never finished and a page
  that stopped answering.
- The promotion tree's derived dev-server port is 5774, and no other current worktree hashes
  to it. So this is not the cross-worktree server collision recorded in RC-CAN-2.4.

## Reproduction attempts (this worktree, HEAD = `66bd4a03`, unchanged tree)

1. `settings.spec.ts`, desktop, `--workers=2 --repeat-each=5`: **40 passed**.
2. The same spec under `DNDTOOLS_E2E_CPU_THROTTLE=6`, `--workers=4 --repeat-each=6`:
   **48 passed**.
3. The full gate command, `DNDTOOLS_E2E_PORT=5611 pnpm e2e` (both projects, `--workers=2`):
   **1173 passed, 11 skipped, 0 failed (20.7m), exit 0**.

The recorded failure did not reproduce, even on the identical command at the identical SHA.

## Outcome

No source or test change. None of the three runs gave evidence of a defect to repair, and
the only available levers would weaken the gate: longer timeouts, retries in the promotion
command, or skipping the tests. All assertions and workflow protections are unchanged. The
central gate should re-run `CI: e2e` on this SHA. If the same pair stalls together again,
capture `uptime` and the Vite server log during that window. That shows whether the host or
the dev server is stalling.
