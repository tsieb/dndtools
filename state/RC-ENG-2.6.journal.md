# RC-ENG-2.6 run journal

## Scope

Root-cause the mobile-chromium `page.evaluate: Execution context was destroyed` flake in
`combat-audio-automation.spec.ts` and `systems.spec.ts`, and fix the app or helper instead of the
retry count. Acceptance: 20 consecutive mobile runs of both specs at `retries: 0` pass, and the cause
is written up in `docs/development/TESTING.md`. Owned: `_helpers.ts`, `playwright.config.ts`, the two
specs, `TESTING.md`. No agents, dispatcher mutations, push or promotion.

## Evidence

- Gate logs (20 under `.state/attempts`): the failures are `combat-audio-automation.spec.ts:12`
  (the evaluate in `goLiveAndStartCombat`, called from `:108`) and `systems.spec.ts:295` (the
  `dispatch` helper), both awaiting `__rt.dispatch()` inside `page.evaluate`.
- Saved gate artifacts (`/tmp/rc-dsn-gate-cd80f061-artifacts`, `/tmp/rc-can-22-s4`): the
  combat-audio screenshot still shows the Automation tab selected (plain `useState` in
  `screens/audio/index.tsx`), and the systems snapshot still shows three toasts from the earlier
  `/extensions` steps. The document was never replaced.
- Playwright 1.61 launches Chromium with `--disable-back-forward-cache`, so no bfcache round trip.
- Idle machine: 10/10 cold and 30/30 at 4× CPU throttle with navigation tracing; exactly one Vite
  client connection per test, no unload other than Playwright's own reloads.
- Cold full suite (fresh `.vite` cache, 4 workers): 1069 passed, 11 skipped, 0 failed, no Vite
  optimize or reload line. Vite reloads are ruled out.
- Playwright's Chromium `rewriteError` turns every protocol error that is not a page exception into
  "Execution context was destroyed, most likely because of a navigation".
- Minimal repro (plain page, `--expose-gc`): a `gc()` in the first microtask slot after an evaluated
  promise settles fails 10/10 with that message; the raw CDP error is
  `{"code":-32000,"message":"Promise was collected"}`. Any later slot passes. With no explicit `gc()`,
  allocation in that slot fails 3/40 on its own and 40/40 under
  `--js-flags='--gc-global --max-semi-space-size=1'`; settling from a fresh task fails 0/80.
- Real spec before the fix, mobile, `retries: 0`, `--repeat-each=3`, GC stress flags: combat-audio
  failed 3/3 at `:12:28` ← `:108:9`, each with `Promise was collected` in the protocol log; systems
  passed 27/27. `systems.spec.ts:295` was not reproduced directly; it is the same error on the same
  kind of evaluate with the DOM intact, so the helper fix covers it.

## Cause

The inspector holds a promise returned from `page.evaluate` weakly. After it settles, one microtask
slot passes before the inspector reads it, and a full GC in that slot collects it. The slot is empty
unless the app queued work behind the promise. In combat-audio, `combat.start` triggers the audio
automation driver, which queues `session.audio.play` right behind it; that reducer and Dexie write
run in the slot. Memory pressure makes full GCs frequent, hence "under load".

## Changes

- `_helpers.ts`: `dispatch` settles from a fresh task and returns only `status`, `rejection`,
  `events` (no spec reads `nextState`, the ~89 KB vault); `seedFresh` resolves `deleteDatabase` the
  same way; opt-in `DNDTOOLS_E2E_CPU_THROTTLE` and `DNDTOOLS_E2E_TRACE_NAV` diagnostics run from
  `markOnboarded`.
- `combat-audio-automation.spec.ts`: `goLiveAndStartCombat` settles from a fresh task and returns
  only `step`, `status`, `rejection`.
- `playwright.config.ts`: opt-in `DNDTOOLS_E2E_JS_FLAGS` passes `--js-flags` to Chromium.
- `TESTING.md`: §6 write-up and a §2 rule. Retry count unchanged.

## Validation results

- Strict `tsc --ignoreConfig` over the four TS files: passed. ESLint and Prettier on every changed
  file: passed.
- Post-fix GC-stress run and the 20 consecutive acceptance runs: pending.
