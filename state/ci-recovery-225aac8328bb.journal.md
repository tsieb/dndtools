# ci-recovery-225aac8328bb run journal

## Scope

Repair GitHub CI for promoted commit `225aac8328bbcbae6634802a8ec263d219470935` on `loop/rc`.
Failing workflow: CI (push/PR runs 36299405967 and 36299409057). Reproduce locally, fix the cause,
and verify without weakening tests or workflow protections. No push, promotion, loops, or dispatcher
control-state edits. Task branch base: `e50c13b9` (= `origin/loop/rc` at start).

## Diagnosis

The only failing job in both runs is `Electron smoke (Linux)`:

```
✗ write: {"mode":"write","ok":false,"error":"timeout: scene-name input", ...
  "body":"Lamplight GM\nSkip to content\nLAMPLIGHT\nYour campaign\n2 scenes · 3 PCs · 2 NPCs ..."}
✗ desktop smoke FAIL
```

`loop/rc` CI has failed the same way since `cc47d694` (6f8e448d, 6dd4f09c, 225aac83, cc47d694 all
red; `6992b502` green). The range `6992b502..cc47d694` is RC-CAN-7.3 (screens library and
switcher). It replaced the `/scenes` create form (`#scene-name` plus a submit button) with the
Screens library (`/screens`, `/scenes` now aliases to it) and its "New screen" dialog. The
Playwright specs moved to `createScreenInLibrary`, but `apps/gm-react/scripts/smoke-desktop.cjs`
still waited for `#scene-name`, which no longer exists anywhere in `src/`, so the write phase always
timed out. The Electron smoke is not part of the per-story browser gates, which is why the story
landed green.

`scripts/verify-roundtrip.mjs` (`pnpm verify:roundtrip`, dev-only, not in CI) had the same stale
selector.

## Fix

- `ScenesCreator.tsx`: `data-testid="screens-new"` on the library's "New screen" button, so the
  smoke can open the dialog without matching localized text.
- `smoke-desktop.cjs` write phase: `#/screens` → click `screens-new` → pick the Blank template
  (`screen-template-blank`, one `scene.create`) → set `#screen-name` → wait until React committed
  both → submit `button[type="submit"][form="new-screen-form"]`. The rest is unchanged: the
  created scene must render, and then the verify process must find it after a restart. The verify
  phase now waits for `[data-testid="screens-library"]` instead of the removed input.
- `verify-roundtrip.mjs`: same dialog path. It also waits for `__rt.lastLifecycle` to leave
  `pending` before reloading, the same wait `sync.spec` uses. Without it the reload loses the
  scene. Prettier-formatted, since the base file was not.

No assertion was removed or loosened. The persistence check (scene survives an Electron restart)
still gates.

## Verification (local, this worktree)

- `pnpm desktop:smoke` (DISPLAY=:0, Xwayland auth): PASS twice (write, verify survived=true,
  origin migration, auto-update, parity write/verify).
- `verify-roundtrip.mjs` against `vite` dev on :5391: 11/11 PASS three times in a row. It was run
  through a throwaway copy that resolves `@playwright/test`, because the committed script's
  `require('playwright')` does not resolve in this workspace. That bug predates this task and is
  left alone.
- `playwright test tests/e2e/screens.spec.ts` desktop-chromium + mobile-chromium: 6/6 passed.
- `tsc --noEmit -p apps/gm-react`: 0. `eslint` on the 3 files: 0. `prettier --check`: clean after
  write.
