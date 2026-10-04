# ci-recovery-2450f59c run journal

## Scope

Repair GitHub CI for promoted commit `2450f59ca85ffc22ae5b44a3572fea0cbc184dc1`
(`test(ai): respect platform boundary in cancellation test`). Reported failing workflow: `CI`.
Reproduce, fix the cause, verify the integration candidate (`be43018f`, current `loop/rc`)
without weakening tests or workflow protections. No push, promotion, loops, agents, or
dispatcher control-state edits.

## What was red

1. **`Android unit, lint, and package checks`** on `2450f59c` (runs 37156309063 push,
   37156310435 pull_request), and on every `loop/rc` SHA since `43cf31ce`. The emulator
   acceptance script failed at the `home-screen shortcuts` step:
   `the Play shortcut did not open the player view`. The UI dump at failure showed the WebView
   on `Lamplight — Join your table` with a `Join a table` button.
   Cause: `eb9e529a` (`fix(play): show join-first companion before a seat is assigned`) made
   `/play` render `JoinFirstStage` on a device that is neither joined nor previewing. A fresh
   acceptance install is exactly that, but `scripts/android-emulator-acceptance.sh` still waited
   for `Now playing`, which only the seated/preview companion renders. The e2e suite was
   updated in that commit (`player-join-first.spec.ts`), but the Android script was not.
2. **`build-and-test`** on the current candidate `be43018f` (run 37163508003, not on
   `2450f59c`): all six `src/cloud/AuthModal.test.tsx` tests failed with
   `Button not found` / `Input not found`. Cause: RC-UX-6.1 (`d9e5d0a6`) portals the DS
   `Dialog` scrim to `document.body`, and the test only searched its render `container`.

`Performance` on `2450f59c` was also red, but outside the reported scope. Four of five
repeats passed. One repeat flagged `graph-indexing` at 205.7ms against a 159.8ms baseline
(+28.7%, budget 500ms), which looks like hosted-runner noise. I did not change anything for it.

## Fix

- `scripts/android-emulator-acceptance.sh`: the Play shortcut now waits for the fresh-device
  player view (`Join your table`) and then its join action (`Join a table`). Both strings come
  from `PlayerView`'s join-first stage. The check is still a positive assertion that the
  shortcut reached the player route, not the Session destination it was on before.
- `apps/gm-react/src/cloud/AuthModal.test.tsx`: the queries now read `document.body`, which
  is where the portaled dialog renders. All assertions are unchanged.

## Verification (local, at `be43018f` + fix)

- `npx vitest run src/cloud/AuthModal.test.tsx`: failed 6/6 before the fix, passed 6/6 after.
- `pnpm test`: exit 0 (284 + 45 + 161 + 31 files, all passed).
- `pnpm typecheck`: exit 0. `eslint` and `prettier --check` on the changed test: clean.
- `bash -n scripts/android-emulator-acceptance.sh`: OK. I could not run the Android emulator
  acceptance here (no local JDK, and the local emulator segfaults), so that step needs hosted
  CI to confirm it. The new strings match the failure-time UI dump from run 37156309063.

## Reconciliation with loop/rc (attempt 2, 2026-10-04)

The rebase onto `879489ab` conflicted in `scripts/android-emulator-acceptance.sh`. That happened
because sibling task `ci-recovery-4314e0d325a4` had already landed the same repair on `loop/rc`
as `879489ab`. That commit changes the same two files the same way. The only difference is that
our script also waited for `Join a table` after `Join your table`. I resolved the conflict in
`loop/rc`'s favour and dropped this task's duplicate code commit. This branch now carries only
this journal on top of `loop/rc` (`ed614140`).

- Hosted CI on `879489ab` passed: CI runs 37176396074 and 37176393577, Performance and Supply
  Chain all green. That includes the Android acceptance job that was red on `2450f59c`.
- Local at `ed614140` + this journal: `npx vitest run src/cloud/AuthModal.test.tsx` passed 6/6.
  `pnpm test` exited 0 (284 + 45 + 161 + 31 files, all passed). `pnpm typecheck` exited 0.
  `bash -n scripts/android-emulator-acceptance.sh` is OK.
- Out of scope: `loop/rc` at `ed614140` is red again in `Android unit, lint, and package checks`
  (run 37188126286). The failure is `Expert experience level was not reachable`, and the UI dump
  shows the Characters destination, not Settings. That comes after the RC-POL-1.17 Settings and
  Experience rework, not `2450f59c`. The dispatcher already has `ci-recovery-ed614140…` for it,
  so I left it alone to avoid another sibling conflict.
