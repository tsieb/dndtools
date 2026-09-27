# ci-recovery-ec77c053f82b run journal

## Scope

Repair GitHub CI for promoted commit `ec77c053f82b3f15607d59be3da511be76915429` on `loop/rc`
(failing workflow: CI). No push, promotion, loops, or dispatcher control-state edits.

## What is red

`ec77c053` has two CI runs. The push-event run (36339161739) is green. The pull_request-event run
(36339164805) failed one job, `browser E2E (2-of-3)`, on one test that failed all three attempts:
`combat-tile.spec.ts:113` "tapping the hit points opens the keypad…" on mobile-chromium.

- Attempts 0 and 2 timed out waiting for the tile. The artifact snapshot shows `#/board` with h1
  "DM screen" and an empty `main` for the whole 30 s.
- Retry 1 hit a strict-mode violation: two `initiative-tile-compact` tiles on the home board.

## Sibling tasks

Two other ci-recovery task branches already diagnosed this same run. Neither has reached `loop/rc`
(checked after `git fetch`: `origin/loop/rc` is still `ec77c053`):

- `dispatch/dndtools/3ca95c6b150ea58137f2` → `d7cfc404` fixes both causes: the `/board` alias
  redirect plus the combat-tile fixture, and adds a regression test in `screens.spec.ts` and the
  follow-on `systems.spec.ts` fix.
- `dispatch/dndtools/b63c2fc4978f6f933780` → `e766cafa` fixes only the fixture race (the double
  tile). It does not cover the empty-pane attempts.

`d7cfc404`'s parent is `ec77c053`, this task's base, so it was ported unchanged except for its own
task journal. Its content is identical to the sibling's, so the two merge cleanly either way.
`e766cafa` edits the same `boardWithTracker` lines differently and will conflict with either one.
Resolve that in favour of `d7cfc404`/this commit, which is the superset.

## Causes

1. **App bug.** `BoardAlias` redirected `/board` → `/screen/:id` with `<Navigate>`. If `/board` is
   re-entered before that transition commits, the pending render is dropped. The router then settles
   on a location equal to the committed one, so `<Navigate>`'s effect never re-runs and the pane
   stays empty. The fix moves the redirect into `ScreenRouteAliases`, outside `<Suspense>`, in an
   effect with no deps array that runs on every commit.
2. **Fixture race.** `boardWithTracker` arranged the board before `command-center.ensure-home` had
   landed. It either placed the tracker on a scene `/board` never shows, or added a second tracker
   next to the home board's seeded one. It now waits for `homeSceneId` and places a tracker only if
   none is seeded.
3. **Follow-on.** `systems.spec.ts` asserted the shell h1 on `/board`, which exists only until the
   redirect lands. It now waits for `/screen/<home>` and checks the screen's own header.

## Evidence (local)

- Reproduced: the new `screens.spec.ts` "re-entering /board…" test run against the BASE source
  (`ScreenView.tsx` and `routeAliases.tsx` checked out from `ec77c053`) failed 10/10 (5 desktop,
  5 mobile). Failure: `page.waitForURL` timeout with an empty `main`, the same as CI.
- Fixed tree: `combat-tile.spec.ts` + `screens.spec.ts`, both projects, `--repeat-each=5
--retries=0`: 65 passed, 25 skipped (the phone-only and desk-only describes skip on the other
  project), 0 failed.
- `systems.spec.ts`, both projects, `--repeat-each=3 --retries=0`: 54/54 passed.
- `pnpm typecheck` 0, `pnpm lint` 0, `pnpm format:check:changed -- --base origin/loop/rc` 0
  (5 files), `pnpm test:app` 1721/1721.
- Full Playwright suite, both projects (`--retries` default): the first run was cut off when the
  session ended, at 609/1636 (desktop-chromium through `responsive.spec.ts`), with 0 failures up to
  that point. The rest is re-run below.
