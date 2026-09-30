# promotion-recovery-0ff6977cf8d1 — `CI: e2e` blank boots came from the host switching Wi-Fi mid-run

## Failure

- Promotion gates for `0ff6977c` (fingerprint `15a094f59b5c`) passed every gate up to
  `CI: test:coverage:core`, then failed `CI: e2e` (attempt `6cc4127c`, `pnpm e2e`, two workers, no
  retries): 6 failed, 1610 passed, 32 skipped in 30.5 min. All six are desktop-chromium:
  `responsive.spec.ts:2149` (both variants), `session-lifecycle.spec.ts:106` and `:113`,
  `ux-audit.spec.ts:20`, and `widget-builder.spec.ts:200`.
- Each one timed out in `waitReady` waiting for `window.__rt.loaded` (20 s). Every screenshot is flat
  `rgb(18,18,18)`, meaning the module graph never loaded, the same blank boot as
  `promotion-recovery-69f403491799.md`. The two `session-lifecycle` failures also show the follow-on
  `Cannot read properties of undefined (reading 'state')` from `setWorkflow`.
- The failures came in bursts: both workers at 01:44:14, both at 01:45:51, then 01:47:19 and
  01:47:26.

## Diagnosis

- No other dispatcher attempt was running, and no container started or stopped.
- The system journal shows the host's Wi-Fi switching networks four times (NetworkManager
  `connection-activate` from gnome-shell). Each switch came exactly 20 s, one `waitReady` timeout,
  before a failure burst:

  | Wi-Fi change (networks A, B, C)        | Failures            |
  | -------------------------------------- | ------------------- |
  | 01:43:54 A → B                         | 01:44:14 ×2         |
  | 01:45:31 B → C (C's auth kept failing) | 01:45:51 ×2         |
  | 01:46:59 C gives up, falls back to B   | 01:47:19 (ux-audit) |
  | 01:47:06 B → A                         | 01:47:26 (builder)  |

- The mechanism is the one `promotion-recovery-69f403491799` found for containers. When a host
  interface changes, Chromium's network-change notifier aborts every in-flight request, loopback
  included, with `net::ERR_NETWORK_CHANGED`. A module request aborted mid-boot leaves the page blank
  for good. The `--network=none` fix only removed containers as a trigger; a Wi-Fi switch or VPN
  still causes it. The Playwright Chromium builds have no switch that stops this.
- Reproduced on `0ff6977c`. The failed tests were run with `--repeat-each=5`, two workers,
  desktop-chromium, while a bridged `ubuntu:24.04` container was cycled every ~7 s to cause host
  interface changes: 10 failed, 20 passed. Nine were the recorded blank-boot `waitReady` timeout.
  One (`widget-builder`) booted, but then its lazy `/extensions` route chunk was aborted
  (`Failed to fetch dynamically imported module`).
- A probe booting `/#/scenes` 40 times under the same cycling stalled 13 boots. Every stall with
  failed requests failed with `net::ERR_NETWORK_CHANGED` on `script` requests. The one exception
  was the cold first boot, which only overran the probe's 6 s budget.
- Playwright only records a request's failure (`request.failure()`, `page.requests()`) when a
  `requestfailed` listener was attached before the request. Without a listener, the aborted
  requests look pending.

## Resolution

- `apps/gm-react/tests/e2e/_helpers.ts`: `waitReady` now reloads the page once when Chromium
  fails a module (`script`) request of the current boot with `net::ERR_NETWORK_CHANGED`. It polls
  `__rt.loaded` in 1 s slices under the same single 20 s budget. The reload is logged as
  `[e2e] net::ERR_NETWORK_CHANGED …` and annotated on the test (`network-changed`). The
  `requestfailed` listener (`watchNetworkChanges`) is attached, and its count reset, by
  `markOnboarded`, `gotoRoute` and `seedFresh` before they navigate, and again after each boot.
  When the budget runs out, the error still says 20000ms (`… waiting for window.__rt.loaded`).
- Any other boot failure still fails at 20 s with no reload. This was checked by aborting
  `AppShell.tsx` with `connectionreset` (failed at 21 s, no reload) and by hanging it (failed).
  No assertion, test timeout, retry count or gate command changed.
- `docs/development/TESTING.md` §8 documents the recovery and its limits.
- Not covered: a lazy route chunk aborted after boot. The app has no chunk-load retry, so the
  route's error boundary shows, and the test fails. That is the same thing a user switching
  networks would see. None of the six recorded failures is that case.

## Verification

- Reproduction rerun with the fix (same five locations, `--repeat-each=5`, cycling container):
  29 passed, 1 failed. The recovery fired 7 times. The one failure is the lazy-chunk case above.
- Negative checks: see Resolution.
- Full `pnpm e2e` on the fixed tree with no network disturbance: pending (the first run was cut off after 50 passing tests when the session ended).
- `prettier --check` and `eslint` on `_helpers.ts` are clean, and a strict standalone `tsc` of the
  helper is clean. The app's `tsc` does not include `tests/`.
