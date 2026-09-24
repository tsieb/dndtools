# promotion-recovery-52161311fa13 — run journal

Task: repair the failed promotion gates for `52161311fa1348f21537b541262a853466354fb8`
(`docs(ci): record b0665d2d Android ANR recovery as superseded`). Fingerprint
`7f4ad3d6cb4a…`. Seven of the eight gates passed. Only `CI: test` failed (attempt `94323d36`).

## What failed

`pnpm test` runs `test:critical`, `test:cloud`, `test:app` and `test:tooling`. The first two
passed. `test:app` reported `4 failed | 141 passed (145)` test files, but its test count was
`1565 passed (1565)`, with no assertion failures. Four suites never loaded:

- `tests/unit/ai-eval.test.ts`
- `apps/gm-react/src/ai/mcpBridge.test.ts`
- `apps/gm-react/src/app/widgets/WorkerHost.test.ts`
- `apps/gm-react/src/runtime/audio-starter-pack.test.ts`

Each one failed at import time with `Error: Unknown system error -122: Unknown system error
-122, write`. The frame pointed at an `import` line (`packages/core/src/state/starter-widgets/index.ts:23`,
`audio-starter-pack.test.ts:13`). `-122` is `EDQUOT`, meaning the per-user quota on the shared
`/tmp` tmpfs (about 12.8 GiB, shared by every dispatcher worktree) was full.

Where the write comes from: Vitest 4.1.11 creates a per-run directory at
`join(os.tmpdir(), nanoid())` (`Vitest._tmpDir`, `cli-api.*.js`). Its module fetcher writes
transformed modules there for the workers to load. When `/tmp` is at quota, that write fails,
and the suite that asked for the module fails before any test runs. The code under test is not
involved.

## Reproduction (this worktree, HEAD = `52161311`, unchanged tree)

1. The full gate command, `pnpm test`: **exit 0**. critical 281 files / 4902 tests,
   cloud 42 / 530, app 145 / 1628, tooling 27 / 203, all passed. The app count is 63 higher
   than the recorded run because the four suites that failed to load now run.
2. `quota -w` at the time: about 9.7 GB of the 13.1M-block limit in use, so there was room.
3. Peak size of Vitest's temp directory during `pnpm test:app`, measured by pointing
   `TMPDIR` at a scratch directory and polling `du` every 0.5 s: **54 MB**. The unit suite
   does not use much of the quota. Other processes had already filled it.

The failure reproduces only when `/tmp` is at quota, and it does not depend on the code at
this SHA.

## Cause

The known cause of a full `/tmp` quota is Chromium shared memory from e2e runs in other
worktrees. Vite answers every dev module with 304 after the first navigation, and Chromium
keeps a 2 MB `/tmp` shm pipe mapped for each 304 until the context closes. That comes to about
1.1 GB per reload. The fix (`DNDTOOLS_E2E_FULL_RESPONSES`, which makes the e2e dev server
answer 200) is **not on `loop/rc` at `52161311`**. It already exists on two candidate branches:

- `dispatch/dndtools/0266d1edb79db814617e` (`4eb22d45`, rebased `32ef11ad`, independently
  reviewed and approved)
- `dispatch/dndtools/6209a3871b34cf01d752` (`92864f81`, ported onto the a07a1b38 recovery)

Until one of them lands, any e2e run on a `loop/rc`-based worktree can fill the quota, and
every other gate on the host that writes to `/tmp` can fail with `-122`, including this
promotion's unit tests.

## Outcome (superseded, first attempt)

The first attempt changed no source or test and pointed at the e2e shm fix. Independent review
rejected that: on this base, `ba5042a4`/`df379bf7` had already repaired the same `-122` load
failure for the core suite by switching it to `pool: 'threads'`, and the recorded failure was
in `test:app`, which still used Vitest's default forks pool.

## Repair (second attempt, base `df379bf7`)

Vitest's forks pool hands transformed modules to workers through files in its `os.tmpdir()`
run directory, so a full `/tmp` quota fails suites at import time. The threads pool passes them
in memory. The root configs (`vitest.app.config.ts`, `vitest.cloud.config.ts`,
`vitest.config.ts`) now set `pool: 'threads'`, the same change core already carries. Worker
caps, include/exclude, setupFiles and assertions are unchanged. No test in those suites uses
`process.chdir`, `process.env.TZ`, `process.exit` or `worker_threads` (grep), which are the
things that behave differently in a worker thread.

Reproduction used the EDQUOT injector from the core regression, preloaded into a child Vitest
with `TMPDIR` in a private scratch directory, so no shared storage was filled.

| Suite (injected EDQUOT)      | forks pool (before)                      | threads pool (after)           |
| ---------------------------- | ---------------------------------------- | ------------------------------ |
| app, the four recorded files | exit 1, 4/4 files fail, no tests, `-122` | 4 files / 63 tests pass        |
| app, full                    | not run                                  | exit 0, 145 files / 1628 tests |
| cloud, full                  | 42/42 files fail, no tests               | exit 0, 42 / 530               |
| tooling, full                | 28/28 files fail, no tests               | exit 0, 28 / 205               |

No injected write was hit in any threads run.

`tests/unit/vitest-core-storage.test.ts` is now `tests/unit/vitest-storage-quota.test.ts` and
covers all four suites (core, app, cloud, tooling). Each has a forks negative control that must
fail with `-122` and a configured-pool run that must pass one real probe file. Mutation check:
deleting `pool: 'threads'` from `vitest.app.config.ts` fails the app case (`1 failed | 7
passed`).

Gates on the candidate: `pnpm test` exit 0 (critical 281/4902, cloud 42/530, app 145/1628,
tooling 28/211, which is 205 plus the 6 new regression cases), `pnpm lint` exit 0,
`pnpm typecheck` exit 0.

## Still outside this task

The threads pool stops `/tmp` quota from failing the unit gates. It does not stop other
processes from filling the quota. The main consumer is Chromium shm from concurrent e2e runs,
and the fix for that (`DNDTOOLS_E2E_FULL_RESPONSES`, `32ef11ad`/`4eb22d45` on
`dispatch/dndtools/0266d1edb79db814617e`, or `92864f81`) is still not on this base
(`git grep DNDTOOLS_E2E_FULL_RESPONSES` finds nothing). E2E gates can still fail on quota until
it lands. If a gate goes red with `-122`, check `quota -w` and `pgrep -af "vite --port"` first.
