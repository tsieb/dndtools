# promotion-recovery-75fef2becfca — `CI: e2e`: a load stall that doesn't reproduce, plus the `sync.spec` reload race the re-run exposed

## Failure

- Promotion gates for `75fef2be` (fingerprint `322c24c5cb40`) passed every gate up to
  `CI: test:coverage:core`, then failed `CI: e2e` (attempt `6738b902`, `pnpm e2e`, two workers, no
  retries) with 2 failed, 1403 passed, 19 skipped in 34.4 min. Both failures are on
  mobile-chromium, near the end of the run:
  - `systems.spec.ts:69` "the gallery describes every installed package and marks the active one"
    (test 1367)
  - `widget-builder.spec.ts:415` "export downloads the real package definition" (test 1407)
- Both timed out in the first `gotoRoute` of the test, inside `waitReady`
  (`_helpers.ts:105`): `window.__rt.loaded` never became true within 20 s. Neither error context
  has a page snapshot, so the accessibility tree was empty.

## Diagnosis of the recorded failure

- The app never booted on either page. Both failure screenshots are one flat colour,
  `srgb(18,18,18)`. That is Chromium's default dark canvas: `prepaint.js` (a plain script in
  `index.html`) had set `color-scheme: dark` for Tavern, but the app stylesheet never applied (Tavern's
  `--color-bg` is `#14100b`). React never mounted either, or `<Boot>` would have shown
  "Loading your vault…". So `/src/main.tsx` and its module graph never evaluated in 20 s. That is
  a dev-server or browser stall. It is not a runtime or core-load failure.
- The machine was running two full browser suites at once. Task worktree `7a15334a` ran its own
  full `pnpm e2e` (attempt `05ea6706`, about 08:25–08:58) on `01a2077e`, which contains `75fef2be`.
  It overlapped the promotion run (about 08:29–09:04) almost completely. That run passed
  1407 with 0 flaky, so the same code booted fine in the same window.
- Of about 60 e2e gate runs recorded since 2026-09-23, this is the only one with a `waitReady`
  timeout.
- In isolation, both tests pass 12/12 on mobile-chromium (`--repeat-each=6`, two workers).
- Re-ran the full gate command (`pnpm e2e`, two workers, no retries) on a detached worktree
  checked out at exactly `75fef2be`: both recorded tests passed, and no page failed to boot.
  That run went red on a different test (below): 1 failed, 1404 passed, 19 skipped in 29.3 min.

## Second failure: `sync.spec.ts:9` reloads before the durable write lands

- The `75fef2be` re-run failed on mobile-chromium in `sync.spec.ts:9` "a UI-authored scene grows the
  op-log and survives reload". `expect(persisted).toBe(true)` got `false`: the scene was gone
  after the reload.
- This test has been intermittent for a long time. It failed in about 65 e2e gate logs between
  2026-09-10 and 2026-09-23. Retries hide it as "flaky" in task gates, but promotion gates run
  without retries, so it can fail a promotion on its own.
- Cause: `SceneRuntime.dispatchNow` assigns `innerState = result.nextState` and only then awaits
  `persistFullState`. The in-memory state is optimistic and is rolled back if the write fails. The
  test waited on `window.__rt.state` for the new scene, which can be true before the IndexedDB
  transaction commits, then called `page.reload()` straight away. Specs that wait on rendered UI
  don't have this race, because React only re-renders on `emit()`, which runs after the persist.
- Proof: with a temporary 1.5 s delay before `persistFullState` (not committed), the original spec
  failed 4/4 (desktop and mobile, `--repeat-each=2`) with the same `persisted` false assertion.
  The fixed spec passed 4/4 under the same delay.

## Resolution

- `sync.spec.ts:9` now waits for the scene to exist and for `__rt.lastLifecycle.status` to have left
  `pending` before it reloads. `dispatchNow` sets `pending` and the new state synchronously, and
  moves the status to `success` only after `persistFullState` resolves (or to `failure` after a
  rollback, which also removes the scene). So the combined condition holds only once the write
  has committed. `DevRuntime` in `_helpers.ts` gains the `lastLifecycle` field. Every assertion is
  unchanged, including the post-reload `persisted` check and the op-log growth checks.
- Without the delay, the whole of `sync.spec.ts` passes 20/20 (both projects, `--repeat-each=5`).
  Prettier, eslint and a strict `tsc` over the two changed files are clean, and
  `pnpm --filter @dndtools/gm-react typecheck` passes.
- No change for the blank-page boots. The two specs, `waitReady` and its 20 s budget, and the gate
  command are unchanged. If a blank-page `waitReady` timeout recurs, sample the screenshot colour
  first: `18,18,18` means the module graph never loaded, so check what else was driving
  Chromium at the time before debugging app boot.
