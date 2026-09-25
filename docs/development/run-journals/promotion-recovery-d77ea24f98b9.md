# promotion-recovery-d77ea24f98b9 — `CI: e2e`: the tracker's arrow key arrived before its listener

## Failure

- Promotion gates for `d77ea24f` (fingerprint `8fb82dd6f7a8`) passed every gate up to
  `CI: test:coverage:core`, then failed `CI: e2e` (attempt `00285727`, `pnpm e2e`, two workers, no
  retries) with 1 failed, 1444 passed, 19 skipped in 26.8 min.
- The failure was on mobile-chromium, in `combat.spec.ts:856` "tracker keyboard model › Enter opens
  the selected row detail by moving focus into it". It failed at line 858, the first assertion:
  after one `ArrowDown`, `getByText('Selected · Bog Lurker')` was never visible. The snapshot shows
  combat running (round 1, both combatants), no dialog, and no selection.

## Not new, and not caused by this commit

- Nothing between `d77ea24f` and its recent ancestors touches `/session` or `combat.spec.ts`.
- Across the dispatcher's gate logs, this test failed 39 times with this exact assertion at line
  858, on both projects (mobile far more often), out of about 470 runs that included it. That is
  far more than its siblings. Task gates retry, so it usually shows as "flaky" there. Promotion
  gates don't retry.
- The sibling test "arrow keys move the row cursor" presses the same key but first runs a
  `toHaveCount(0)` round trip, and it rarely fails. The Enter test presses `ArrowDown` as soon as
  the `beforeEach` sees `End combat`, so the window for the race is the first few hundred ms after
  the tracker paints.

## Reproduction and cause

- A temporary spec (not committed) copied the `beforeEach` and pressed `ArrowDown` immediately.
  It logged every `keydown` target, whether a dialog was open, whether the event was
  default-prevented, and each binding of a window `keydown` listener named `onKey`. It ran on
  mobile-chromium with 8 workers plus 12 busy-loop processes for load.
- It failed 2 of 240 runs. The failing trace, with timestamps in ms:
  `6681 bind onKey -> 1` (AppShell's own listener), `7416` tracker DOM with End combat added,
  `7658 keydown ArrowDown target=BODY dialog=false onKeys=1`, `7673 bind onKey -> 2` (the tracker's
  listener), `7674 prevented=false`. The key arrived about 240 ms after the tracker was on screen,
  and 15 ms before `useCombatKeyboard` had bound its listener, so nothing handled it.
- `useCombatKeyboard` bound the listener in `useEffect`. When the commit that mounts the tracker is
  not a sync render (on a freshly booted `/session` it isn't), React defers passive effects to a
  scheduler task, and Chromium dispatches queued input before that task runs. Earlier probes
  that did not hit this path always found the listener bound by the time the DOM appeared, which
  is why the flake needs the fast boot-then-press sequence and a loaded machine.

## Resolution

- `useCombatKeyboard` now binds with `useLayoutEffect`, so the listener is attached inside the
  commit that paints the tracker. The handler, its guards and its dependency list are unchanged.
  This is a product fix: a DM pressing a key on a tracker that has just appeared lost the key too.
  The test and its assertions are unchanged.
- The same probe with the fix: 320/320 passed under the same load. In 20 more logged runs, the
  tracker's listener was bound before the tracker DOM appeared (`bind onKey -> 2` precedes `added`)
  every time.
- `combat.spec.ts` passes 68/68 on both projects. `pnpm lint` and `pnpm typecheck` exit 0, and
  Prettier is clean on the changed file.
