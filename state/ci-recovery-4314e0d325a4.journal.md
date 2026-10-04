# ci-recovery-4314e0d325a4 run journal

## Scope

Repair GitHub CI for promoted commit `4314e0d325a4533015270f0218ce5393fa670b74`. Reported
failing workflow: `CI`. Reproduce locally, fix the cause, verify the current integration candidate
(`be43018f`, equal to `loop/rc` at start) without weakening tests or workflow protections. No push,
promotion, loops, additional agents, or dispatcher control-state edits.

## Diagnosis

### `Android unit, lint, and package checks` on `4314e0d3` (the reported break)

- Push run 37143848001 and PR run 37143850617 failed only this job. Gradle unit, lint and
  instrumented tests passed. `scripts/android-emulator-acceptance.sh` then failed at
  `home-screen shortcuts`: `the Play shortcut did not open the player view`.
- The `UI hierarchy at failure:` dump shows MainActivity focused on `Join your table` /
  `Ask your DM for an invite…` / `Join a table`. The shortcut did reach the player view, but the
  script waited for `Now playing`.
- Cause: `eb9e529a fix(play): show join-first companion before a seat is assigned`. A fresh
  install holds no seat, so `/play` now opens on the join-first stage
  (`player-join-first.spec.ts`, `route-titles.spec.ts` assert the same `Join your table`). The
  seated `Now playing` stage needs a seat the acceptance install never gets. The script was not
  updated with that commit.
- The same failure repeats on `eedadc1d` and `2450f59c`.

### `build-and-test` on the current candidate `be43018f` (newer break, same workflow)

- Push run 37163508003: Android was skipped because `build-and-test` failed in `Run unit tests`.
  The 6 `apps/gm-react/src/cloud/AuthModal.test.tsx` tests failed with `Input not found` /
  `Button not found`.
- Cause: `d9e5d0a6` (RC-UX-6.1) made the DS `Dialog` portal its scrim to `<body>`. The test
  queried only its React `container`, so it no longer saw the modal. Reproduced locally:
  `vitest run --config vitest.cloud.config.ts …AuthModal.test.tsx` → 6/6 failed with the CI errors.
- `pnpm test` chains critical → cloud → app → tooling with `&&`, so CI never reached `test:app`
  on that run.

## Fix

- `scripts/android-emulator-acceptance.sh`: the Play-shortcut check waits for `Join your table`,
  the player view's join-first stage for an unseated install. It still fails if the shortcut
  lands anywhere else. The undeclared-route and Back assertions after it are unchanged.
- `AuthModal.test.tsx`: the queries look in `document.body`, where the dialog renders. Every
  assertion and expected string is unchanged.

## Verification (local, at be43018f + fix)

- `pnpm test`: exit 0. critical 284 files / 5184 tests, cloud 45 / 559, app 161 / 1773,
  tooling 31 / 245.
- `pnpm typecheck` exit 0. `pnpm test:coverage:core` exit 0. `eslint` and `prettier --check` on
  the changed test pass. `bash -n` on the acceptance script passes. shellcheck isn't installed.
- Not run locally: the Android emulator acceptance script. There is no local JDK and the local
  emulator segfaults. The fix is backed by CI's own failure-time UI dump, which shows the
  expected text.
