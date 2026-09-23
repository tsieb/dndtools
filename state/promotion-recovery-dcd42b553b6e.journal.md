# promotion-recovery-dcd42b553b6e — run journal

Task: `promotion-recovery-dcd42b553b6eaded53a4-ac04d69f41f0`.
Failed head: `dcd42b553b6eaded53a4c585db1c14b88bb3f40d`. Repaired on the task branch at
`dd88dcca` (current `loop/rc` tip, which contains `dcd42b55`).

## Recorded failure

`CI: e2e` attempt `e1af6a80-f2d1-4093-b6a0-81efc7a9392c`: 1 failed, 19 skipped, 1282 passed.
Every other promotion gate exited 0. The failing test was
`[desktop-chromium] graph.spec.ts:24` "keyboard walk and focus keep a stable neighborhood and
clear with Escape", at `expect(total).toBeGreaterThan(1)`, which received 0.

The failure page snapshot shows the graph already rendered ("Showing 16 of 16 visible nodes",
16 `graph-node` buttons). The count ran before the screen mounted.

## Cause

`/graph` is a `lazy()` route (`apps/gm-react/src/App.tsx:64`). The `beforeEach` waits for
`__rt.loaded` and for `#main-content` to attach. The shell provides both before the Graph chunk
has loaded. `nodes.count()` is a one-shot read, so on a loaded machine it can see 0 nodes. The
vault is loaded by then and the node list comes from `runtime.state` in one `useMemo`, so all
nodes appear in the commit that mounts the screen. The later `focusedCount` read, taken right
after the Focus click, was another one-shot count.

## Reproduction

- Unmodified spec, desktop, `--repeat-each=30 --workers=4`: 30 passed. The failure depends on
  load and does not show up when the test runs alone.
- A throwaway copy of the spec that held `/src/screens/Graph.tsx` back by 1.5 s (`page.route`):
  **3/3 failed** with the recorded error (`Expected: > 1`, `Received: 0`, graph.spec line 29
  equivalent). I deleted the copy after the run.

## Repair

`apps/gm-react/tests/e2e/graph.spec.ts`: wait for the first `graph-node` to attach before taking
`total`, and poll `nodes.count()` below `total` before reading `focusedCount`. Every original
assertion is unchanged (`> 1`, `< total`, `> 0`, the Escape restore to `total`). I did not add
retries or skips, and I did not change app code.

## Verification

- The same 1.5 s delayed-module copy, whole file, desktop + mobile: **32 passed**.
- Real spec, whole file, desktop + mobile, `--repeat-each=5 --workers=4`: **160 passed**.
- `prettier --check` and `eslint` on the spec: clean.
