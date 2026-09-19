# RC-AUD-2.4 run journal

- Scope: five owned scene display / Electron files; no delegation, push, promotion or dispatcher changes.
- No AGENTS.md found in this worktree. Headroom tools unavailable in this session.
- Added primary-only native display chooser and dedicated frameless kiosk window; Escape, monitor removal and primary-window closure release it. Retained existing child navigation isolation and limited preload.
- Added Ken Burns hero motion, explicit reduced-motion static fallback and mood wash. Primary broadcaster resolves vault images to temporary same-origin object URLs, keeping vault access out of the projector.
- Validation in progress: app typecheck, desktop smoke, focused production main-process checks.

## Validation

- Initial desktop smoke built successfully but Electron could not start without DISPLAY. Started a private local Xvnc display :94 (no TCP listener / RFB port) for verification.
- First focused production-window smoke exposed a bridge-name collision with the existing boolean `dndtoolsSceneDisplay` receiver marker. Renamed the primary capability to `dndtoolsSceneDisplayControl`; rebuilt and reran both smokes successfully.
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0 after final changes.
- ESLint on the two changed TSX files: exit 0. Electron CJS files are ignored by repository ESLint; `node --check` passed for both.
- Prettier check on all five owned files and `git diff --check`: passed.
- `vite build`: passed. `DISPLAY=:94 pnpm --filter @dndtools/gm-react exec node scripts/run-desktop-smoke.mjs`: exit 0; write, verify, origin migration and all 12 auto-update checks passed, with no unexpected privileged IPC calls. Original output: `/tmp/rc-aud-2.4-desktop-final.log`.
- Focused real Electron harness `/tmp/rc-aud-2.4-projector.cjs` loads production main.cjs with a throwaway profile and a programmatic native-dialog answer. Exit 0; original output `/tmp/rc-aud-2.4-projector.log`: `PROJECTOR_SMOKE_PASS`. Verified rejected non-primary sender, dedicated kiosk window, isolated bridge surface, same-origin blob hero decoding, BroadcastChannel title update, Ken Burns animation, explicit reduced-motion static hero, mood wash, cancel keeping the current projector, replacing the projector, Escape and monitor-removal cleanup.
- Virtual display smoke does not verify physical multi-monitor placement or manually clicking the native OS chooser. Display bounds are taken directly from the chosen currently connected Electron screen; a disconnected selection fails safely.
- Raw-style ratchet: exit 0, 2,594 values across 261 files; allowances unchanged.
