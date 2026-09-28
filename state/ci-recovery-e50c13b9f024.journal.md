# ci-recovery-e50c13b9f024 — journal

## Reported failure

`CI` on promoted `e50c13b9` (runs 36327705509, 36327701567): only `Electron smoke (Linux)` failed.
`smoke-desktop.cjs` still waited for `#scene-name`, which RC-CAN-7.3 removed.

## Reconciling with the integration branch

The first attempt fixed the smoke on this branch (`5f04f962`, `621d8b96`), but the rebase onto
`ec77c053` conflicted. `ec77c053` is a sibling ci-recovery task's fix for the same failure. It
drives the Screens library's New screen dialog (with a `screens-new` test id) and waits for the
durable write in `verify-roundtrip.mjs`. The two fixes do the same thing, so the branch now takes
`ec77c053` as is and drops its own two commits. CI on `ec77c053` has `Electron smoke (Linux)`
green in both the push run (36339161739, all jobs green) and the PR run (36339164805).

## Remaining red on the candidate

In PR run 36339164805, `browser E2E (2-of-3)` failed on
`[mobile-chromium] combat-tile.spec.ts:113` with a strict-mode violation:
`initiative-tile-compact` matched 2 elements.

Cause: `boardWithTracker` picked `homeSceneId ?? activeSceneId ?? first non-template scene`. Right
after `gotoRoute('/board')`, `homeSceneId` is usually still `null` because `ensure-home` hasn't
landed yet. In that case the tracker went onto "The Sunken Crypt", which `/board` never shows. The
test passed only because the default Command Center already lays out an `initiative-tracker`. When
the home id did land in time, the helper added a second tracker to the home board, and the board
drew two compact tiles.

- Base, as is: mobile, `--repeat-each=10`: 40/40 pass (the fallback branch usually wins).
- Base, forced onto the home-id branch (added a wait for `homeSceneId`): 3 of 4 mobile tests
  fail with the CI's exact strict-mode error.
- Fix: wait for `homeSceneId` (the same guard `map-tile.spec.ts` uses), and place a tracker only
  if the home board has none. Both projects, `--repeat-each=10`: 50 passed, 50 skipped (each
  describe skips the other viewport tier). No assertion changed.

## Second reconciliation (rebase onto `73c0ad21`)

The rebase of `f47c1d26` onto `73c0ad21` conflicted in `combat-tile.spec.ts`. A sibling recovery,
`47a529e5`, had already landed the same `boardWithTracker` fix (wait for `homeSceneId`, place a
tracker only when the home board has none) together with the `/board` redirect app fix. `73c0ad21`
then added a wait for the redirect to land on `/screen/<home>` and a visibility wait before the
swipe's `boundingBox()`. The integration file does everything this branch's version did and more, so
the branch now takes it unchanged and carries only this journal.

Verification on `73c0ad21`:

- Hosted push CI run 36366069548: all jobs green, `Electron smoke (Linux)` included.
- Local `desktop:smoke` (`DISPLAY=:0`): the first run failed `parity verify: no result` with empty
  stderr, after write/verify/migration/updater/parity-write all passed. Run standalone, parity
  passes in both modes, and two more full runs pass everything. That points to a transient
  local collision (load ~4.7, sibling worktrees active). It's not this failure, since hosted CI
  on the same commit is green.
- `combat-tile.spec.ts`, desktop+mobile, `--repeat-each=5 --workers=4`: 25 passed, 25 skipped
  (each describe skips the other viewport tier).

## Checks (first reconciliation, on `ec77c053`)

- `eslint apps/gm-react/tests/e2e/combat-tile.spec.ts`: clean
- `gm-react tsc --noEmit`: clean
- `format:check:changed -- --base ec77c053`: passed on the committed change
