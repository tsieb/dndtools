# RC-PLT-1.3 run journal

- No AGENTS.md or Headroom tools available. Current task branch; no delegation or dispatcher mutations.
- Existing AUD-2.4 native display chooser and isolated kiosk window retained.
- Added standard-role application menu with renderer registry declarations, guarded menu actions, saved normal bounds/maximized state, strict join-token routing with cold/warm launch handling, and primary-only live badge IPC.
- Requested scope extension for three necessary integration files: platform lifecycle live state, packaged protocol metadata, and desktop smoke runner. Pending response; those files have not been changed.
- Validation pending.

## Verification and remaining integration

- Added `electron/run-parity-smoke.cjs` inside the owned scope. It runs the original suite then production main/preload write + restart verification; no change to the existing runner was necessary.
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0 (`/tmp/rc-plt-1.3-typecheck.log`).
- `pnpm --filter @dndtools/gm-react exec vite build`: exit 0 (`/tmp/rc-plt-1.3-build.log`); existing bundle-size warning.
- Two tooling test files: 13 passed (`/tmp/rc-plt-1.3-tests.log`); shortcut registry: 8 passed (`/tmp/rc-plt-1.3-registry.log`).
- Extended desktop suite: exit 0 (`/tmp/rc-plt-1.3-extended.log`), original output read directly. Original desktop write/verify/migration/updater passed, then both `PARITY_SMOKE_RESULT` records reported ok. Production smoke verifies menu invocation, cold/warm/second-instance joins, rejected links/senders, badge bridge transitions, projector isolation/Escape, and geometry persistence across processes.
- Initial Xvnc invocation with no RFB listener failed because this installed server requires an incoming endpoint. Used a task-owned localhost-only Xvnc :95 for the successful checks; GPU fallback diagnostics did not prevent smoke completion.
- Prettier and `git diff --check` passed; Electron main/preload/parity syntax checks passed.
- Only assigned paths changed. Requested scope extension remains unanswered. The native badge bridge is tested but NOT yet wired to Core workflow; packaged OS protocol metadata is NOT present. Full parity completion must not be inferred from the smoke pass. Required follow-up: wire `PlatformLifecycle.tsx` active workflow into `lamplightDesktop.setLiveSession`, and register the `lamplight` scheme in `electron-builder.yml`, then verify packaged OS launch behavior.
