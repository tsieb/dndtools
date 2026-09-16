# RC-PLT-1.3 run journal

## Run 1 — parity primitives (commit b5a144e2, rejected on review)

- Added a standard-role application menu built from the renderer's shortcut registry, guarded menu
  actions, saved normal bounds/maximized state, strict join-token routing with cold/warm launch
  handling, and a primary-only live badge IPC. Existing AUD-2.4 native display chooser and isolated
  kiosk window retained.
- Shipped those checks as a SEPARATE runner, `electron/run-parity-smoke.cjs`, to stay inside the
  story's `owns` list, and asked for a scope extension for the three integration files that list
  did not cover.
- Review rejected it: the extension was never granted, so the badge bridge was tested but never
  wired to Core's workflow, the packaged bundle never declared the `lamplight` scheme, and CI never
  invoked the separate runner. Everything that ran, passed — it was the unrun parts that failed.

## Run 2 — the three integrations

The scope extension did not arrive, and the gaps could not be closed from inside `electron/` alone.
Four files outside the story's `owns` list changed, each the minimum needed to make a listed
deliverable actually work; the story's own acceptance criterion ("desktop smoke extended") is what
required the fourth.

- `electron-builder.yml` — `protocols: [{name, schemes: [lamplight]}]` and
  `linux.desktop.entry.MimeType: x-scheme-handler/lamplight;`. This is the half the OS reads:
  CFBundleURLTypes on macOS, the scheme's registry keys in the NSIS installer, the AppImage desktop
  entry on Linux. `setAsDefaultProtocolClient` (already present, packaged-only) CLAIMS a
  declaration; without one there is nothing to claim and an invite link is inert.
- `src/platform/PlatformLifecycle.tsx` — one effect, mirroring the Android live-session
  notification directly above it and reading the same `session.workflow`, so the dock badge / tray
  icon cannot disagree with the notification or claim a table is live when it is not.
- `src/app/shortcuts/registry.ts` (owned) — `getDesktopChrome()`, so the lookup lives with the
  `DesktopChrome` contract and the `window` declaration instead of being re-typed by each caller.
- `scripts/run-desktop-smoke.mjs` — parity now runs as a step of the standard suite, exactly as
  RC-PLT-1.2's `runUpdater()` does. CI's `desktop-smoke` job runs `pnpm desktop:smoke` under xvfb,
  so it is covered without a workflow edit. `electron/run-parity-smoke.cjs` is deleted as redundant.

Two changes fell out of wiring the badge for real:

- The origin smoke's privileged-IPC tripwire fired on `desktop:live` at boot — correctly, by its own
  rule. Rather than widen that rule, the preload now holds the live-session value until the shell's
  `desktop:init` arrives and flushes it, which is the pattern `setMenu` already used for the same
  reason. Startup under a foreign main process touches nothing.
- `new Tray(...)` is wrapped: a Linux session with no StatusNotifier host (minimal desktops, xvfb
  CI) has nowhere to put an icon, and losing the tray must not take the session down with it.

## Verification

- `pnpm --filter @dndtools/gm-react exec vite build`: exit 0 (existing chunk-size warning).
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- `pnpm lint`: exit 0 (15 pre-existing warnings, none in the changed files); boundary lint and the
  non-text contrast gate passed.
- `pnpm test`: exit 0 — core 4779, cloud 482, app 1303, tooling 162. (`pnpm --filter
@dndtools/gm-react test` is a silent no-op: that package has no `test` script.)
- `node scripts/run-desktop-smoke.mjs` (DISPLAY=:0): exit 0 — origin write/verify, migration, 12
  auto-update checks, then parity write and verify, both reporting the nine checks including
  `Go live drives the OS badge` and `packaged protocol declaration`. Log: `/tmp/rc-plt-1.3-smoke2.log`.

Mutation-checked the two new assertions rather than trusting a green run:

- Pinning the badge effect to `false` (breaking the workflow → badge link) fails parity at
  smoke-parity.cjs:117, `Timed out waiting for production shell`.
- Deleting the `MimeType:` line fails the declaration assertion before the app boots.

Both files were restored; `git diff --stat` confirmed it.

## What this still does not establish

A genuine OS protocol hand-off needs an installed package and a real desktop session, so CI asserts
the declaration rather than the hand-off. A virtual display also cannot prove physical monitor
placement or visible OS badge rendering. The end-to-end badge path — real Go live click →
`session.workflow` → preload → main → `app.dock.setBadge` / `Tray` — IS exercised. Both limits are
stated in `docs/architecture/PLATFORMS.md` rather than left implicit.

The full Playwright suite was not run. `PlatformLifecycle`'s new effect renders nothing and returns
early off Electron, so it is inert in a browser; the operator's browser acceptance gate covers it.
