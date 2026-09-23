# promotion-recovery-20ea1aec893e — two one-shot e2e reads raced React commits

## Failure

- Promotion gates for `20ea1aec` (fingerprint `c8f872912e31`) passed every gate up to
  `CI: e2e`, which failed 2 of 1292 tests (1273 passed, 17 skipped), both on desktop-chromium:
  - `custom-widgets.spec.ts:742` (every declared operate command runs from the keyboard alone):
    the live region was expected to contain `"0:59"` but held `"Paused 1:59"`.
  - `responsive.spec.ts:242` (the bounded canvas routes fit the shell's main pane, compact phone):
    `/scene/:id left 555px of the main pane unused`, with the canvas measured at 0 px.
- The gate log contains no `-122`/`ERR_INSUFFICIENT_RESOURCES`, and the exit code was 1 (test
  failures), not a -15 kill.

## Reproduction

- Ran the unmodified `HEAD` copies of both tests with `--repeat-each=15 --workers=4` on both
  projects. On desktop-chromium the timer test failed 4 of 15 with the same message
  (`"0:59"` vs `"Paused 1:59"`), and the pane-fit test failed 2 of 15 with the canvas at 0 px.

## Diagnosis

- Timer: after pressing Add 60 seconds the test polls `window.__rt.state` until
  `durationSeconds` grows, then reads the `role="timer"` figure once and asserts that the live
  region contains it. The runtime state lands before React commits the re-render, so the one-shot
  read sometimes caught the pre-advance figure (`0:59`) while the auto-retrying live-region
  assertion then saw the committed `1:59`. The failure screenshot shows the figure and the
  announcement matching at 1:59, so the widget was correct. `TimerBody` derives both from the
  same render.
- Pane fit: the overflow check was already polled (the lazy route can still be mounting after
  `gotoRoute`), but the canvas-height check after it was a single read, so it could catch
  `#main-content > div` at 0 px. This is the ~5% base flake already known on `loop/rc`.

## Resolution

- `custom-widgets.spec.ts`: record the figure before the advance and wait for the figure to
  change before comparing it with the live region. The comparison is unchanged. The added wait
  also asserts that the tile repaints the new time.
- `responsive.spec.ts`: the first attempt polled the unused-height read. The dispatcher could
  not rebase that onto `dcd42b55` ("wait for the requested canvas before measuring layout"),
  which already fixes the same race more strictly: it waits for the requested canvas region,
  reads overflow and underfill in one evaluation inside a single `toPass`, and delays the scene
  chunk to exercise the loading frame. On the rebase onto `loop/rc` (`dd88dcca`) the conflict was
  resolved by keeping `loop/rc`'s spec unchanged, so this task no longer touches the file.
- Verification before the rebase (on `20ea1aec`): the fixed tests passed 36/36 (`--repeat-each=6 --workers=2`) and 90/90
  (`--repeat-each=15 --workers=4`) across both projects. Mutation check: forcing
  `#main-content > div { height: 50% }` still fails the pane-fit test (`Received: 362.5`,
  expected `<= 2`).
- Verification after the rebase onto `dd88dcca`: the timer and pane-fit tests passed 60/60
  (`--repeat-each=10 --workers=4`, both projects), and the full `custom-widgets.spec.ts` and
  `responsive.spec.ts` files passed 131 with 1 skipped on both projects. Prettier and ESLint are
  clean on the changed files.
