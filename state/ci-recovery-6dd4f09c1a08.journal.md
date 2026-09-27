# ci-recovery-6dd4f09c1a08 run journal

## Scope

Repair GitHub CI for promoted commit `6dd4f09c1a0873491cb51a5c8f9da1367103e8f7` on `loop/rc`
(failing workflow: CI). No push, promotion, loops, or dispatcher control-state edits.

## Reconciling with the integration branch

The first attempt (`487eb05b`) fixed the red `Electron smoke (Linux)` job, which was still waiting
for the `#scene-name` input that RC-CAN-7.3 removed. The rebase onto `ec77c053` conflicted in
`smoke-desktop.cjs` and `verify-roundtrip.mjs` because sibling task `ci-recovery-225aac8328bb` had
landed the same fix as `ec77c053`: the same dialog path, a `screens-new` test id, and a persist-wait
in `verify-roundtrip.mjs` that `487eb05b` lacked. The push-event CI run for `ec77c053`
(36339161739) is green, Electron smoke included. So `487eb05b` is superseded. The task branch was
reset to `ec77c053`, keeping the integration branch's version, and nothing from `487eb05b` is
carried over.

## What was still red on `ec77c053`

The pull_request-event CI run for the same SHA (36339164805) failed on one job, `browser E2E
(2-of-3)`, with one test failing all three attempts:
`combat-tile.spec.ts:113` "tapping the hit points opens the keypad…" on mobile-chromium.

- attempts 0 and 2: `main` was EMPTY on `#/board` (h1 "DM screen", no board) for the full 30 s.
- retry 1: strict-mode violation. There were two `initiative-tile-compact` tiles on the home board,
  the seeded Initiative tracker plus the one the spec placed.

The trace (retry 1) shows `seedFresh` skipped its wipe: the op-log still matched the pristine count
captured by `waitReady`. `/board` provisions the home board (`command-center.ensure-home`) after
boot, so whether the home board exists when the spec arranges depends on timing. Locally the wipe
path ran, the home was null, and the spec placed its tracker on "The Sunken Crypt", a scene `/board`
never shows. The test passed only because of the home board's own seeded tracker.

## Two causes, both reproduced locally

1. **App bug: `/board` re-entered before its redirect commits leaves an empty pane forever.**
   `BoardAlias` redirected with `<Navigate>`. React Router v7 applies location updates as
   transitions. When the redirect to `/screen/:id` was still pending (its lazy route suspended) and
   the hash went back to `#/board`, the pending render was dropped and the router settled on a
   `/board` location equal field-for-field to the committed one (key `default`, same state).
   React Router memoizes the location context on those fields, so `useLocation()` returned the same
   object, `<Navigate>`'s effect deps were unchanged, and nothing ever redirected. A probe at
   6× CPU throttling with no settle got stuck 3/3 (15 s). With 300 ms settle it redirected in
   <100 ms. A location-keyed effect, inside or outside `<Suspense>`, stays stuck for the same
   reason (instrumented render/effect log). This is the same class of bug as the `/scenes` alias
   note in `routeAliases.tsx`.
2. **Spec fixture race (`combat-tile.spec.ts`).** `boardWithTracker` picked
   `homeSceneId ?? activeSceneId ?? first scene` without waiting for `ensure-home`. Home already
   provisioned gave two trackers (the retry 1 failure). Home not yet provisioned put the tracker on
   the wrong scene.

## Fix

- `routeAliases.tsx`: `ScreenRouteAliases` (outside the routes' `<Suspense>`) now also resolves
  `/board` → `/screen/<home>` (replace, state carried) once the home is live for a loaded GM. The
  effect runs after every commit instead of on a location dependency, which fixes the equal-location
  case (and the `/scenes` alias the same way). A failed provisioning persist is rolled back, so the
  home is only live once durable, and `BoardAlias`'s failed-write `<Board/>` fallback still wins.
- `ScreenView.tsx`: `BoardAlias` keeps provisioning and the non-GM or failed fallbacks and drops
  its `<Navigate>`.
- `screens.spec.ts`: new regression test "re-entering /board before its redirect has settled still
  lands on the GM screen" (CDP 6× throttle, double hash re-entry).
- `combat-tile.spec.ts`: `boardWithTracker` waits for the home board, goes live on it, and places a
  tracker only if the home board does not already seed one. No assertion changed.
- `systems.spec.ts:282` (RC-SYS-3.3, written before ADR-041 made `/board` an alias) asserted the
  shell h1 "Keeper screen" right after `gotoRoute('/board')`. That h1 exists only on `/board`,
  before the redirect; on `/screen/<home>` the shell h1 is "Screens" and the screen names itself in
  its own header. It passed only because the old `<Navigate>` redirect landed after the check.
  With the redirect now firing on the first commit, it failed 6/10, versus 10/10 passing on the base.
  The test now waits for the redirect and asserts "Keeper screen" as the GM screen's own level-2
  header, which is where the DM-authored vocabulary lives on that surface. The new assertion
  passes on base source too (6/6), so it doesn't depend on this change.

## Verification (local, this worktree, port 5391)

- Probe (re-entry at rate 1/6 × settle 0/300/1000 ms, ×2): 24/24 redirected. The base was stuck 3/3
  at rate 6 with settle 0.
- New regression test, mobile + desktop ×5: 10/10 pass with the fix. With only the app change
  reverted: 10/10 FAIL (`page.waitForURL` timeout). The test catches the bug.
- `combat-tile.spec.ts` both projects ×8: 40 passed / 40 skipped (the viewport-tier skips), plus a
  throttled (6×) copy ×4 on mobile: 16/16.
- `screens.spec.ts` both projects ×2: 16/16.
- `pnpm typecheck`: 0. `pnpm lint`: 0.
- Full Playwright suite, both projects (before the systems.spec fix): 1603 passed, 32 skipped,
  1 failed, the `systems.spec.ts:215` mobile case above. After the fix, `systems.spec.ts` both
  projects ×3: 54/54.
- All 17 specs that navigate to `/board`, both projects, ×2, with every fix in place: 922 passed,
  38 skipped, 0 failed.
