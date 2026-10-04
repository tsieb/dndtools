# ci-recovery-eedadc1d6cdf — repair GitHub CI for `eedadc1d`

Task: repair GitHub CI for promoted commit `eedadc1d6cdf9817054b204777de2a57cd0d0be2`
(`fix(i18n): synchronize pseudo catalogue with tile label messages`). Failing workflow: CI.
Branch base: `be43018f` (= `origin/loop/rc` at start).

## Reported failure

`CI` red on `eedadc1d`, runs 37147852509 (PR) and 37147849550 (push). In both runs only
`Android unit, lint, and package checks` failed, in `scripts/android-emulator-acceptance.sh`:

```
acceptance: home-screen shortcuts
emulator acceptance failed: the Play shortcut did not open the player view
```

The `UI hierarchy at failure:` dump shows the player view did open: "Join your table",
"Ask your DM for an invite…", "Join a table". The script was still waiting for "Now playing".

Cause: `eb9e529a` (`fix(play): show join-first companion before a seat is assigned`) made a
seatless `/play` render `JoinFirstStage` instead of the companion with its "Now playing" tab. A
fresh emulator install has no seat. The check stayed hidden on `43cf31ce`/`6dcb0a00`, because
there the script died earlier at the Settings picker (fixed by `2b5d74ff`). From `4314e0d3`
onwards every loop/rc run failed here (`4314e0d3`, `eedadc1d`, `2450f59c`).

## Second red on the current candidate

At `be43018f` the Android job was skipped because `build-and-test` failed first (run
37163508003): `apps/gm-react/src/cloud/AuthModal.test.tsx` failed 6 of 6 with
`Button not found: …` / `Input not found: auth-password`. RC-UX-6.1 (`f5fb225a`/`be43018f`) now
portals the Dialog panel to `document.body`, but the test only searched its render
`container`. I reproduced this locally and got the same 6 failures.

## Repair

- `scripts/android-emulator-acceptance.sh`: the Play shortcut now waits for "Join your table",
  the fresh-install `/play` heading. The check still proves the shortcut navigated to the player
  view and not to some other route.
- `AuthModal.test.tsx`: queries now run against `document.body`. Every assertion and expected
  string is unchanged.

## Verification (local, at be43018f + this change)

- `npx vitest run src/cloud/AuthModal.test.tsx`: failed 6 of 6 before the change, 6 of 6 pass after.
- `pnpm test`: exit 0 (284 + 45 + 161 + 31 files, all passed).
- `tsc --noEmit -p apps/gm-react`, eslint and prettier on the changed test, and `bash -n` on the
  script: clean.
- I did not run the Android emulator acceptance locally. There is no local JDK and the emulator
  segfaults. The new text comes from the CI failure's own UI dump, so the hosted
  `android-checks` job is the real check for this change.

## Reconcile with sibling `879489ab` (2026-10-04)

The gate's rebase onto `879489ab` conflicted in both changed files. `879489ab`
(`ci-recovery-4314e0d325a4`) is the same repair: identical code, comment wording aside. The
sibling's version wins. This branch is now `879489ab` plus this journal. The duplicate code commit
was dropped, so nothing here touches `AuthModal.test.tsx` or the acceptance script.

- Hosted `CI` on `879489ab`: success (push 37176393577, PR 37176396074). That includes the
  Android emulator acceptance, so the reported `eedadc1d` failure is fixed on the integration
  branch.
- Local `pnpm test` at `879489ab`: exit 0 (critical 284/5184, cloud 45/559, app 161/1773,
  tooling 31/245).

Not in scope here: `origin/loop/rc` has since moved to `ed614140` (RC-POL-1.17), and its `CI` is red
again (push 37188122128). Only `Android unit, lint, and package checks` fails, at
`scripts/android-emulator-acceptance.sh:547` ("Expert experience level was not reachable"). That
is a new break from the Settings experience-radio layout change. It belongs to that commit's own
ci-recovery task, so I left it alone to avoid another sibling conflict.
