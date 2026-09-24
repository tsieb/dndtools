# promotion-recovery-75fef2becfca — `CI: e2e` lost two page boots under a concurrent suite; not reproducible, no code change

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

## Diagnosis

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
- No change since `75fef2be` touches the Plugins panel, the system picker, the widget
  builder or app boot. Nothing in the two failing tests or their helpers differs from the tests
  that pass on either side of them in the same run.

## Resolution

- None needed in the repo. The two specs, `waitReady` and its 20 s budget, and the gate command are
  unchanged. Re-running the promotion gates on `75fef2be` or a later head should pass `CI: e2e`.
  If a blank-page `waitReady` timeout recurs, sample the screenshot colour first: `18,18,18`
  means the module graph never loaded, so check what else was driving Chromium at the time
  before debugging app boot.
