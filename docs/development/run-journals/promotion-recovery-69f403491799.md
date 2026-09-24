# promotion-recovery-69f403491799 — `CI: e2e` blank boots came from visual containers resetting host Chromium's network

## Failure

- Promotion gates for `69f40349` (fingerprint `d959323c4937`) passed every gate up to
  `CI: test:coverage:core`, then failed `CI: e2e` (attempt `78876288`, `pnpm e2e`, two workers, no
  retries): 8 failed, 1409 passed, 19 skipped in 35.6 min. All eight are desktop-chromium:
  `a11y-axe-gate.spec.ts:200` `/play` at 12:28:52 local, then seven `responsive.spec.ts` tests
  (`:209` virtual-keyboard phone, `:369`, `:438`, `:1362`, `:1373`, `:1908` `/scenes` and
  `/characters`) between 12:41:40 and 12:43:48.
- Each one timed out waiting for `window.__rt.loaded` (`waitReady` / `openStandaloneRoute`, 20 s).
  Every screenshot is flat `rgb(18,18,18)`, the same blank boot as
  `promotion-recovery-75fef2becfca.md`: the module graph never loaded.
- The failures came in pairs. Both workers timed out in the same second (12:42:20, 12:43:12,
  12:43:48), so every page load that started in those instants stalled.

## Diagnosis

- Only one other task was active: RC-POL-1.3 (worktree `61d831cd`, attempt `76e9d366`). It
  ran `tests/visual/run-in-container.sh` under docker several times. Its container starts and
  stops (12:28:33, 12:28:52, 12:41:18, 12:42:00, 12:42:11, ~12:42:5x, 12:43:28) fall inside the
  20 s windows of all five failure pairs. Its e2e runs on the host (12:29:47–12:40:24) caused none.
- Isolated on `69f40349`: the eight tests pass 129/129 (`--repeat-each=3`, two workers). They
  also pass 172/172 next to one long full visual-suite container run (load average ~19). Load
  alone does not cause it.
- Reproduced by starting and stopping containers: the same set (`--repeat-each=5`) with a
  scene-editor visual container restarting every ~25 s gave 20 failed / 195 passed. Every stalled
  page load started within 0.1 s of a container teardown (e.g. container end 14:00:27.6, stalled
  load 14:00:27.5), and the screenshots were blank `18,18,18` again. A `curl` probe on the dev
  server every 0.5 s never took longer than 1 s, so Vite kept serving.
- Root cause: a host Chromium logging `requestfailed` while visual containers cycled saw 1,283
  requests to the dev server fail with `net::ERR_NETWORK_CHANGED`, and 6 of 105 boots stalled.
  With no containers, it saw 0 in 92. Docker's default bridge network gives each container a
  veth on the host. Chromium's network-change notifier watches host interfaces, and when one
  changes it aborts every in-flight request, including loopback ones. A module request aborted
  mid-boot leaves the page blank. A `docker run … true` that exits at once did not trigger it (0
  in 91), so the event seems to come from the container's interface finishing setup, not from
  creating it.
- This also explains `promotion-recovery-75fef2becfca.md`: its "concurrent suite" blamed load,
  but it was a network-change race, and only visual runs cause it.

## Resolution

- `apps/gm-react/tests/visual/run-in-container.sh` runs the container with `--network=none`. The
  visual run needs no network: the browser, Vite and Playwright talk over the container's own
  loopback, and node_modules is mounted. No host interface appears, so host browsers see no
  change. `docs/development/TESTING.md` §8 notes why.
- CI's `visual-regression` job is unchanged. It needs the network for checkout and install, and
  no other browser shares its runner.
- No test, timeout, retry or gate command changed.

## Verification

- Host Chromium probe with the patched script cycling containers: 144 boots, 0 stalls, 0 failed
  requests (was 1,283 `ERR_NETWORK_CHANGED` and 6 stalls). Every container run passed.
- The reproduction rerun with the patched script (the eight tests, `--repeat-each=5`, 16 cycling
  visual container runs): 215 passed, 0 failed (was 20 failed).
- Full visual suite under `--network=none`: 351 passed (6.2 min), no baseline changes.
- Worktrees whose script predates this commit (any task branched from an older base) still
  cause it. Until they rebase, a blank-boot `waitReady` timeout during a promotion should be
  checked against container starts and stops on the machine first.
